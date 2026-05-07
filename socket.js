require("dotenv").config();
const { Server } = require("socket.io");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");

const {
  REDIS_HOST = process.env.REDIS_HOST,
  REDIS_PORT = process.env.REDIS_PORT,
  REDIS_PASSWORD = process.env.REDIS_PASSWORD,
  SOCKET_GRACE_SECONDS = "60", // Keep socket entries for 60s after disconnect to allow quick reconnects
} = process.env;

const SOCKET_GRACE = parseInt(SOCKET_GRACE_SECONDS, 10) || 60;

let io = null;
let redisPub = null;
let redisSub = null;
let redisClient = null;
let httpServerAttached = false; 

const userSockets = new Map();


async function ensureRedisClients() {
  if (redisClient && redisPub && redisSub) return;

  redisClient = createClient({
    socket: { host: REDIS_HOST, port: parseInt(REDIS_PORT, 10) },
    password: REDIS_PASSWORD || undefined,
  });

  // Pub/Sub clients for socket.io adapter
  redisPub = createClient({
    socket: { host: REDIS_HOST, port: parseInt(REDIS_PORT, 10) },
    password: REDIS_PASSWORD || undefined,
  });
  redisSub = redisPub.duplicate();

  // Attach simple logging to help debugging
  [redisClient, redisPub, redisSub].forEach((c, i) => {
    c.on("error", (err) => console.error(`[redis${i}] error:`, err));
    c.on("reconnecting", () => console.warn(`[redis${i}] reconnecting...`));
    c.on("connect", () => console.log(`[redis${i}] connected`));
  });

  // Connect (in parallel)
  await Promise.all([redisClient.connect(), redisPub.connect(), redisSub.connect()]);
}

/**
 * Redis key helpers
 */
const userSocketsKey = (userId) => `user:${userId}:socketsZ`;

/**
 * Add socket id to user's sorted set with current timestamp as score
 */
async function addSocketForUser(userId, socketId) {
  const key = userSocketsKey(userId);
  const ts = Date.now();
  await redisClient.zAdd(key, [{ score: ts, value: socketId }]);
  await redisClient.expire(key, 60 * 60 * 24 * 7);
}

/**
 * Remove a socket id from user's set
 */

async function removeSocketForUser(userId, socketId) {
  const key = userSocketsKey(userId);
  await redisClient.zRem(key, socketId);
}

/**
 * Get active socket ids for a user considering grace period.
 * Returns array of socket ids and also purges old entries.
 */

async function getActiveSocketIds(userId) {
  const key = userSocketsKey(userId);
  const now = Date.now();
  const cutoff = now - SOCKET_GRACE * 1000;

  // Remove entries older than cutoff
  // zRemRangeByScore key -inf (cutoff-1)
  await redisClient.zRemRangeByScore(key, 0, cutoff - 1);

  // Now get all remaining members (they have recent timestamps)
  // zRange key 0 -1
  const members = await redisClient.zRange(key, 0, -1);
  return members || [];
}

/**
 * Periodic maintenance to remove very old socket entries across keys
 * (not necessary but useful for long-running systems)
 */
let maintenanceTimer = null;
function startMaintenance(intervalMs = 60_000) {
  if (maintenanceTimer) return;
  maintenanceTimer = setInterval(async () => {
    try {
      // This is a best-effort pass: scan keys matching user:*:socketsZ and trim old entries
      // For large deployments you might want to run a separate worker for this.
      const stream = redisClient.scanIterator({ MATCH: "user:*:socketsZ", COUNT: 100 });
      const now = Date.now();
      const cutoff = now - SOCKET_GRACE * 1000;
      for await (const key of stream) {
        await redisClient.zRemRangeByScore(key, 0, cutoff - 1);
      }
    } catch (err) {
      console.error("Maintenance error:", err);
    }
  }, intervalMs);
}


const initializeSocket = async (httpServer, opts = {}) => {
  if (io) return io;
  await ensureRedisClients();

  const serverOptions = {
    cors: {
      origin: opts.corsOrigin || "*",
      methods: ["GET", "POST"],
    },
    pingInterval: opts.pingInterval || 25000,
    pingTimeout: opts.pingTimeout || 5000,
    transports: opts.transports || ["websocket"],
  };

  if (httpServer) {
    io = new Server(httpServer, serverOptions);
    httpServerAttached = true;
  } else {
    io = new Server(serverOptions);
  }

  io.adapter(createAdapter(redisPub, redisSub));
  console.log("✅ Redis adapter initialized for Socket.IO");

  // Start maintenance
  startMaintenance();


  io.on("connection", (socket) => {
    console.log(`🔌 socket connected: ${socket.id}`);

    socket.on("login", async ({ userId } = {}) => {
      try {
        if (userId === undefined || userId === null) return;
        userId = String(userId);
        socket.userId = userId;
        socket.join(userId);

        await addSocketForUser(userId, socket.id);

        try {
          const refreshIntervalMs = Math.max(5000, Math.floor((SOCKET_GRACE * 1000) / 2));
          if (socket._redisRefreshTimer) clearInterval(socket._redisRefreshTimer);
          socket._redisRefreshTimer = setInterval(() => {
            addSocketForUser(userId, socket.id).catch((err) => {
              console.warn('Failed to refresh socket timestamp for', userId, socket.id, err);
            });
          }, refreshIntervalMs);
        } catch (e) {
          console.warn('Could not start redis refresh timer for socket', socket.id, e);
        }

        // Save in local memory set
        if (!userSockets.has(userId)) userSockets.set(userId, new Set());
        userSockets.get(userId).add(socket);

        console.log(`✅ user ${userId} logged in with socket ${socket.id}`);
      } catch (err) {
        console.error("Error on login:", err);
      }
    });

    // optional sports-specific logical room
    socket.on("connectSports", ({ userId } = {}) => {
      try {
        if (!userId) return;
        userId = String(userId);
        socket.join(`sports:${userId}`);
        console.log(`🎮 user ${userId} joined sports room with socket ${socket.id}`);
      } catch (err) {
        console.error("connectSports error:", err);
      }
    });

    // logout: remove socket from sets
    socket.on("logout", async (payloadUserId) => {
      try {
        let userId = payloadUserId;
        if (!userId && socket.userId) userId = socket.userId;
        if (!userId) return;

        userId = String(userId);
        await removeSocketForUser(userId, socket.id);
        socket.leave(userId);

        const s = userSockets.get(userId);
        if (s) {
          s.delete(socket);
          if (s.size === 0) userSockets.delete(userId);
        }

        // clear periodic refresh timer if set
        if (socket._redisRefreshTimer) {
          clearInterval(socket._redisRefreshTimer);
          delete socket._redisRefreshTimer;
        }

        console.log(`🚪 user ${userId} logged out from socket ${socket.id}`);
      } catch (err) {
        console.error("logout error:", err);
      }
    });

    socket.on("disconnect", async (reason) => {
      try {
        const userId = socket.userId;
        console.log(`❌ socket ${socket.id} disconnected (reason: ${reason})`);
        if (!userId) return;

        await removeSocketForUser(userId, socket.id);

        // local memory
        const s = userSockets.get(userId);
        if (s) {
          s.delete(socket);
          if (s.size === 0) userSockets.delete(userId);
        }
        // clear periodic refresh timer if set
        if (socket._redisRefreshTimer) {
          clearInterval(socket._redisRefreshTimer);
          delete socket._redisRefreshTimer;
        }
      } catch (err) {
        console.error("disconnect handler error:", err);
      }
    });
  });

  return io;
};

const getSocket = () => {
  if (!io) {
    console.warn("getSocket: io not initialized, creating a standalone Socket.IO server (adapter will be attached asynchronously)");
    io = new Server({
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
      pingInterval: 25000,
      pingTimeout: 5000,
      transports: ["websocket"],
    });
    try {
      startMaintenance();
    } catch (e) {
      // ignore
    }
    ensureRedisClients()
      .then(() => {
        try {
          io.adapter(createAdapter(redisPub, redisSub));
          console.log("✅ Redis adapter attached to lazily-initialized Socket.IO server");
        } catch (err) {
          console.error("Failed to attach redis adapter to io (lazy init):", err);
        }
      })
      .catch((err) => {
        console.error("ensureRedisClients failed during lazy getSocket init:", err);
      });
  }
  return io;
};


let _emitter = null;
function _getEmitter() {
  if (!_emitter) {
    _emitter = require("./socketEmitter");
  }
  return _emitter;
}

const emitSocket = (event, data, roomId = null) => {
  if (!httpServerAttached) {
    return _getEmitter().emitSocket(event, data, roomId);
  }
  const socketServer = getSocket();
  try {
    if (roomId) socketServer.to(String(roomId)).emit(event, data);
    else socketServer.emit(event, data);
  } catch (err) {
    console.error("emitSocket error:", err);
  }
};

const emitToUser = async (event, data ,userId) => {
  if (!httpServerAttached) {
    return _getEmitter().emitToUser(event, data, userId);
  }
  try {
    if (!userId) return;
    userId = String(userId);
    //console.log(userId , "userId in emit to user" )
    await ensureRedisClients();
    const socketIds = await getActiveSocketIds(userId);
    //console.log(socketIds , "socketIds")
    if (!socketIds || socketIds.length === 0) {
      return { sent: 0 };
    }
    const socketServer = getSocket();
    let sent = 0;
    socketIds.forEach((socketId) => {
      try {
        socketServer.to(socketId).emit(event, data);
        sent += 1;
      } catch (err) {
        console.warn(`Failed to emit to socket ${socketId}:`, err);
      }
    });

    console.log(`Emitted event ${event} to user ${userId} on ${sent} sockets`);
    return { sent };
  } catch (err) {
    console.error("emitToUser error:", err);
    return { sent: 0, error: err.message };
  }
};

/**
 * Emit an event to all active users across all socket servers.
 */
const emitToAllActiveUsers = async (event, data) => {
  if (!httpServerAttached) {
    return _getEmitter().emitToAllActiveUsers(event, data);
  }
  try {
    await ensureRedisClients();
    const socketServer = getSocket();

    const stream = redisClient.scanIterator({ MATCH: "user:*:socketsZ", COUNT: 100 });
    let totalSent = 0;

    for await (const key of stream) {
      const userId = key.split(":")[1]; // Extract userId from key
      const socketIds = await getActiveSocketIds(userId);
      for (const socketId of socketIds) {
        try {
          socketServer.to(socketId).emit(event, data);
          totalSent++;
        } catch (err) {
          console.warn(`Failed to emit to socket ${socketId}:`, err);
        }
      }
    }

    console.log(`✅ Broadcasted event '${event}' to ${totalSent} active sockets.`);
    return { sent: totalSent };
  } catch (err) {
    console.error("emitToAllActiveUsers error:", err);
    return { sent: 0, error: err.message };
  }
};


const getLocalSocketIdsForUser = (userId) => {
  const set = userSockets.get(String(userId));
  if (!set) return [];
  return Array.from(set).map((s) => s.id);
};


const getAllOnlineUsers = async () => {
  if (!httpServerAttached) {
    return _getEmitter().getAllOnlineUsers();
  }
  try {
    await ensureRedisClients();
    const onlineUsers = [];
    const stream = redisClient.scanIterator({ MATCH: "user:*:socketsZ", COUNT: 100 });
    const now = Date.now();
    const cutoff = now - SOCKET_GRACE * 1000;
    for await (const key of stream) {
      const userId = key.split(":")[1];
      await redisClient.zRemRangeByScore(key, 0, cutoff - 1);
      const activeSockets = await redisClient.zRange(key, 0, -1);
      if (activeSockets && activeSockets.length > 0) {
        onlineUsers.push(userId);
      }
    }
    console.log(`🟢 Found ${onlineUsers.length} online users.` , onlineUsers);
    return onlineUsers;
  } catch (err) {
    console.error("getAllOnlineUsers error:", err);
    return [];
  }
};


module.exports = {
  initializeSocket,
  getSocket,
  emitSocket,
  emitToUser,
  getLocalSocketIdsForUser,
  emitToAllActiveUsers,
  getAllOnlineUsers
};
