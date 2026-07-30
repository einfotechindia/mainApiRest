/**
 * ═══════════════════════════════════════════════════════════════
 *  SOCKET.JS — High-Scale Socket.IO Server (Millions of Users)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Architecture:
 *  - Room-based emit via Redis adapter (O(1) Redis ops, no SCAN)
 *  - Each user joins room = their userId on login
 *  - All authenticated users join room "authenticated"
 *  - Staff join "staff:{staffId}", owners join "owner:{ownerId}"
 *  - Redis adapter handles cross-server pub/sub automatically
 *  - Per-socket rate limiting to prevent abuse
 *  - Bounded local memory with max connections per user
 *
 *  EXPORTED FUNCTIONS:
 *  ───────────────────
 *  initializeSocket(httpServer, opts)  — Call once in app.js
 *  emitToUser(event, data, userId)     — O(1) room emit
 *  emitToAllActiveUsers(event, data)   — O(1) broadcast
 *  emitSocket(event, data, roomId)     — Emit to room or all
 *  emitToRoom(event, data, roomId)     — Emit to named room
 *  emitToMultipleUsers(userArray, key) — Batch emit to users
 *  getAllOnlineUsers()                 — From Redis set (no scan)
 *  getOnlineUserCount()               — O(1) count
 *  getSocket()                        — Raw io instance
 */

require("dotenv").config();
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT, 10) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// ─── Tuning Constants ─────────────────────────────────────────
const MAX_SOCKETS_PER_USER = 5;            // Max concurrent connections per user
const RATE_LIMIT_WINDOW_MS = 1000;         // 1 second window
const RATE_LIMIT_MAX_EVENTS = 20;          // Max events per window per socket
const STAFF_HEARTBEAT_DEBOUNCE_MS = 10000; // Debounce staff Redis writes to 10s
const ONLINE_SET_KEY = "socket:online_users";
const STAFF_ONLINE_PREFIX = "staff_online:";

let io = null;
let redisPub = null;
let redisSub = null;
let redisClient = null;

// Bounded local memory: userId → Set<socket> (max MAX_SOCKETS_PER_USER)
const userSockets = new Map();
// Staff heartbeat debounce: staffId → lastWriteTimestamp
const staffDebounce = new Map();

// ─── Redis Setup ──────────────────────────────────────────────
async function ensureRedisClients() {
  if (redisClient && redisPub && redisSub) return;

  const opts = {
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      reconnectStrategy: (retries) => Math.min(retries * 500, 3000),
    },
    password: REDIS_PASSWORD,
  };

  redisClient = createClient(opts);
  redisPub = createClient(opts);
  redisSub = redisPub.duplicate();

  [redisClient, redisPub, redisSub].forEach((c, i) => {
    const name = ["redis-socket", "redis-pub", "redis-sub"][i];
    c.on("error", (err) => console.error(`[${name}] ${err.message}`));
  });

  await Promise.all([redisClient.connect(), redisPub.connect(), redisSub.connect()]);
  console.log("[socket] Redis clients connected");
}

// ─── Rate Limiter (per socket, sliding window) ────────────────
function checkRateLimit(socket) {
  const now = Date.now();
  if (!socket._rlWindow || now - socket._rlWindow > RATE_LIMIT_WINDOW_MS) {
    socket._rlWindow = now;
    socket._rlCount = 1;
    return true;
  }
  socket._rlCount++;
  return socket._rlCount <= RATE_LIMIT_MAX_EVENTS;
}

// ─── Staff Online Tracking (debounced Redis writes) ───────────
async function updateStaffOnline(staffId, ownerId, data) {
  try {
    const now = Date.now();
    const lastWrite = staffDebounce.get(staffId) || 0;

    // Always emit to owner room (cheap, in-memory on this server + Redis pub/sub)
    const payload = { staffId, ...data, lastSeen: now };
    io.to(`owner:${ownerId}`).emit("staffOnlineUpdate", payload);

    // Debounce Redis write
    if (now - lastWrite < STAFF_HEARTBEAT_DEBOUNCE_MS) return;
    staffDebounce.set(staffId, now);

    const key = STAFF_ONLINE_PREFIX + ownerId;
    await redisClient.hSet(key, String(staffId), JSON.stringify({ ...data, lastSeen: now }));
    await redisClient.expire(key, 86400);
  } catch (err) {
    console.error("updateStaffOnline:", err.message);
  }
}

async function removeStaffOnline(staffId, ownerId) {
  try {
    staffDebounce.delete(staffId);
    await redisClient.hDel(STAFF_ONLINE_PREFIX + ownerId, String(staffId)).catch(() => {});
    io.to(`owner:${ownerId}`).emit("staffOffline", { staffId });
  } catch (err) {
    console.error("removeStaffOnline:", err.message);
  }
}

// ─── Local Socket Tracking (bounded) ──────────────────────────
function addLocalSocket(userId, socket) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  const set = userSockets.get(userId);

  // Enforce max connections per user
  if (set.size >= MAX_SOCKETS_PER_USER) {
    // Disconnect oldest socket
    const oldest = set.values().next().value;
    if (oldest) {
      oldest.emit("forceLogout", { reason: "Too many connections" });
      oldest.disconnect(true);
      set.delete(oldest);
    }
  }
  set.add(socket);
}

function removeLocalSocket(userId, socket) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) userSockets.delete(userId);
}

// ─── Online User Tracking (Redis set, O(1) add/remove/count) ─
async function addOnlineUser(userId) {
  await redisClient.sAdd(ONLINE_SET_KEY, String(userId)).catch(() => {});
}

async function removeOnlineUser(userId) {
  // Only remove if no more local sockets AND no sockets across other servers
  // For simplicity with rooms: remove from set, getAllOnlineUsers is approximate
  const set = userSockets.get(userId);
  if (!set || set.size === 0) {
    await redisClient.sRem(ONLINE_SET_KEY, String(userId)).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
//  INITIALIZE
// ═══════════════════════════════════════════════════════════════
const initializeSocket = async (httpServer, opts = {}) => {
  if (io) return io;
  await ensureRedisClients();

  const serverOptions = {
    cors: { origin: opts.corsOrigin || "*", methods: ["GET", "POST"] },
    pingInterval: 25000,
    pingTimeout: 10000,
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 1e6,              // 1MB max message size
    connectTimeout: 10000,
    perMessageDeflate: false,            // Disable compression (CPU savings at scale)
  };

  io = httpServer ? new Server(httpServer, serverOptions) : new Server(serverOptions);
  io.adapter(createAdapter(redisPub, redisSub));
  console.log("[socket] Socket.IO initialized with Redis adapter");

  registerEventHandlers();

  // Periodic cleanup of stale staff debounce entries (lightweight, local only)
  setInterval(() => {
    const cutoff = Date.now() - 300000; // 5 min
    for (const [k, v] of staffDebounce) {
      if (v < cutoff) staffDebounce.delete(k);
    }
  }, 60000);

  return io;
};

// ─── Event Handlers ───────────────────────────────────────────
function registerEventHandlers() {
  io.on("connection", (socket) => {

    // ── User Login → join rooms ──
    socket.on("login", async ({ userId } = {}) => {
      if (!userId || !checkRateLimit(socket)) return;
      userId = String(userId);
      socket.userId = userId;

      socket.join(userId);           // Room for targeted emit
      socket.join("authenticated");  // Room for broadcast

      addLocalSocket(userId, socket);
      await addOnlineUser(userId);
    });

    // ── Staff Login ──
    socket.on("staffLogin", async ({ staffId, staffName, staffUsername, ownerId, currentPage } = {}) => {
      if (!staffId || !ownerId || !checkRateLimit(socket)) return;
      socket.staffId = String(staffId);
      socket.ownerId = String(ownerId);
      socket.isStaff = true;
      socket.join(`staff:${staffId}`);

      await updateStaffOnline(staffId, ownerId, {
        staffName, staffUsername, currentPage: currentPage || "/app/dashboard", socketId: socket.id,
      });
    });

    // ── Owner Join Monitor ──
    socket.on("ownerJoinMonitor", ({ ownerId } = {}) => {
      if (!ownerId || !checkRateLimit(socket)) return;
      socket.join(`owner:${ownerId}`);
    });

    // ── Staff Page Change ──
    socket.on("staffPageChange", async ({ staffId, ownerId, currentPage, staffName, staffUsername } = {}) => {
      if (!staffId || !ownerId || !checkRateLimit(socket)) return;
      await updateStaffOnline(staffId, ownerId, { staffName, staffUsername, currentPage, socketId: socket.id });
    });

    // ── Staff Heartbeat (debounced) ──
    socket.on("staffHeartbeat", async ({ staffId, ownerId, currentPage, staffName, staffUsername } = {}) => {
      if (!staffId || !ownerId || !checkRateLimit(socket)) return;
      await updateStaffOnline(staffId, ownerId, { staffName, staffUsername, currentPage, socketId: socket.id });
    });

    // ── Join Sports Room ──
    socket.on("connectSports", ({ userId } = {}) => {
      if (!userId || !checkRateLimit(socket)) return;
      socket.join(`sports:${String(userId)}`);
    });

    // ── Logout ──
    socket.on("logout", async (payloadUserId) => {
      const userId = String(payloadUserId || socket.userId);
      if (!userId) return;
      socket.leave(userId);
      socket.leave("authenticated");
      removeLocalSocket(userId, socket);
      await removeOnlineUser(userId);
    });

    // ── Disconnect ──
    socket.on("disconnect", async () => {
      if (socket.isStaff && socket.staffId && socket.ownerId) {
        await removeStaffOnline(socket.staffId, socket.ownerId);
      }
      const userId = socket.userId;
      if (userId) {
        removeLocalSocket(userId, socket);
        await removeOnlineUser(userId);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  EMIT FUNCTIONS — Use these in Controllers/Services/Helpers
// ═══════════════════════════════════════════════════════════════

const getSocket = () => {
  if (!io) {
    io = new Server({ cors: { origin: "*" }, transports: ["websocket", "polling"] });
    ensureRedisClients()
      .then(() => io.adapter(createAdapter(redisPub, redisSub)))
      .catch((err) => console.error("Lazy socket init:", err.message));
  }
  return io;
};

/**
 * Emit to a specific user — O(1) via room emit.
 * Redis adapter broadcasts to all servers automatically.
 */
const emitToUser = async (event, data, userId) => {
  if (!userId) return { sent: 0 };
  try {
    getSocket().to(String(userId)).emit(event, data);
    return { sent: 1 };
  } catch (err) {
    console.error(`emitToUser(${event}):`, err.message);
    return { sent: 0 };
  }
};

/**
 * Emit to ALL authenticated users — O(1) via "authenticated" room.
 * Redis adapter handles cross-server broadcast.
 */
const emitToAllActiveUsers = async (event, data) => {
  try {
    getSocket().to("authenticated").emit(event, data);
    return { sent: 1 };
  } catch (err) {
    console.error(`emitToAllActiveUsers(${event}):`, err.message);
    return { sent: 0 };
  }
};

/**
 * Emit to a room or broadcast.
 */
const emitSocket = (event, data, roomId = null) => {
  try {
    const server = getSocket();
    if (roomId) server.to(String(roomId)).emit(event, data);
    else server.emit(event, data);
  } catch (err) {
    console.error(`emitSocket(${event}):`, err.message);
  }
};

/**
 * Emit to a named room.
 */
const emitToRoom = (event, data, roomId) => {
  if (!roomId) return;
  try {
    getSocket().to(String(roomId)).emit(event, data);
  } catch (err) {
    console.error(`emitToRoom(${event}):`, err.message);
  }
};

/**
 * Batch emit to multiple users.
 * Replaces old throughSocketDataByAxios function.
 * Each item: { userId, data } or flat object with userId property.
 */
const emitToMultipleUsers = async (userArray, emitKey) => {
  if (!Array.isArray(userArray) || !emitKey) return { sent: 0 };
  const server = getSocket();
  let sent = 0;
  for (const item of userArray) {
    try {
      server.to(String(item.userId)).emit(emitKey, item.data || item);
      sent++;
    } catch (_) {}
  }
  return { sent };
};

/**
 * Get all online user IDs — O(1) from Redis set, no SCAN.
 */
const getAllOnlineUsers = async () => {
  try {
    await ensureRedisClients();
    return await redisClient.sMembers(ONLINE_SET_KEY) || [];
  } catch (err) {
    console.error("getAllOnlineUsers:", err.message);
    return [];
  }
};

/**
 * Get online user count — O(1).
 */
const getOnlineUserCount = async () => {
  try {
    await ensureRedisClients();
    return await redisClient.sCard(ONLINE_SET_KEY) || 0;
  } catch {
    return 0;
  }
};

/**
 * Get local socket IDs for a user (this server only).
 */
const getLocalSocketIdsForUser = (userId) => {
  const set = userSockets.get(String(userId));
  if (!set) return [];
  return Array.from(set).map((s) => s.id);
};

module.exports = {
  initializeSocket,
  getSocket,
  emitSocket,
  emitToUser,
  emitToRoom,
  emitToAllActiveUsers,
  emitToMultipleUsers,
  getAllOnlineUsers,
  getOnlineUserCount,
  getLocalSocketIdsForUser,
};
