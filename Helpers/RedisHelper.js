// redisClient.js
require("dotenv").config();
const createAsyncRedis = require("async-redis");

const DEFAULT_OPTS = {
  retry_strategy: (options) => {
    if (options.error && options.error.code === "ECONNREFUSED") {
      return new Error("The server refused the connection");
    }
    // stop retrying after an hour total
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error("Retry time exhausted");
    }
    // give up after 10 attempts
    if (options.attempt > 10) {
      return undefined;
    }
    // exponential backoff capped at 3s
    return Math.min(options.attempt * 100, 3000);
  },
};

const makeRedisClient = ({ host, port, password, name } = {}) => {
  if (!host || !port) {
    throw new Error(`${name || "Redis"} host/port not configured`);
  }

  const client = createAsyncRedis.createClient({
    host,
    port,
    password,
    ...DEFAULT_OPTS,
    // ============================================================
    // HIGH CONCURRENCY — million users ke liye
    // ============================================================
    enable_offline_queue: true,
    no_ready_check: false,
  });

  // Increase max listeners for high concurrent load
  client.setMaxListeners(0);

  client.on("connect", () => {
    console.log(`${name || "Redis"} client connected (${host}:${port})`);
  });

  client.on("error", (err) => {
    console.error(`${name || "Redis"} client error:`, err.message);
  });

  client.on("end", () => {
    console.log(`${name || "Redis"} connection ended`);
  });

  return client;
};

// create primary client
const client = makeRedisClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  name: "PrimaryRedis",
});


let centerpanelRedis = null;

if (process.env.IS_CENTERPANEL_REDIS == "true") {
  try {
    centerpanelRedis = makeRedisClient({
      host: process.env.CENTERPANEL_REDIS_HOST,
      port: process.env.CENTERPANEL_REDIS_PORT,
      password: process.env.CENTERPANEL_REDIS_PASSWORD,
      name: "CenterpanelRedis",
    });
  } catch (err) {
    console.error("Failed to initialize centerpanel redis:", err);
    centerpanelRedis = null;
  }
  }


// --- small in-memory cache to reduce Redis round trips for hot keys ---
const memoryCache = new Map(); // key -> { value, expiresAt }
const setMemoryCache = (key, value, ttlMs = 500) => {
  // default tiny TTL to keep responses fresh while reducing load
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};
const getMemoryCache = (key) => {
  const row = memoryCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return row.value;
};

// --- helpers ---
const safeJsonParse = (str) => {
  try {
    return JSON.parse(str);
  } catch (err) {
    return null;
  }
};

// Promise that races a Redis get with timeout
const redisGetWithTimeout = async (redisClient, key, timeoutMs = 2000) => {
  if (!redisClient) return null;

  // check in-memory cache first
  const mem = getMemoryCache(key);
  if (mem !== null) return mem;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Redis GET timeout")), timeoutMs)
  );

  try {
    const getPromise = redisClient.get(key);
    const raw = await Promise.race([getPromise, timeoutPromise]);
    if (raw == null) return null;
    const parsed = safeJsonParse(raw);
    // store small in-memory cache to reduce next redis call
    setMemoryCache(key, parsed ?? raw, Math.max(200, Math.min(2000, timeoutMs * 2)));
    return parsed ?? raw;
  } catch (err) {
    // don't let Redis failures crash the app — log and return null
    console.error(`redisGetWithTimeout error for key="${key}":`, err.message || err);
    return null;
  }
};

// public getters (safe + optimized)
const getBookmakerFancyByRedis = async (marketId , eventId) => {
  if (!marketId) return [];
  console.log(marketId , "marketId")
  const finalKey = `allFinalOddsData_${marketId}`;
  const redis = centerpanelRedis || client;
  const data = await redisGetWithTimeout(centerpanelRedis, finalKey, 3000);
  return Array.isArray(data) ? data : (data ? data : []);
};

const getBetfairMarketDataByRedis = async (marketId) => {
  if (!marketId) return [];
  const finalKey = `M_${marketId}`;
  const redis = centerpanelRedis || client;
  const data = await redisGetWithTimeout(redis, finalKey, 3000);
  return data ?? [];
};

const getRacingDataByRedis = async (marketId) => {
  if (!marketId) return [];
  const finalKey = `racingEventsOddsData${marketId}`;
  const redis = centerpanelRedis || client;
  const data = await redisGetWithTimeout(redis, finalKey, 3000);
  return data ?? [];
};

// optional convenience setter (keeps mem cache in sync)
const setRedisJson = async (key, obj, ttlSeconds = undefined, redisClient = null) => {
  const redis = redisClient || client;
  try {
    const value = JSON.stringify(obj);
    if (ttlSeconds) {
      await redis.setex(key, ttlSeconds, value);
    } else {
      await redis.set(key, value);
    }
    // update small in-memory cache
    setMemoryCache(key, obj, 500);
    return true;
  } catch (err) {
    console.error(`setRedisJson error for key="${key}":`, err.message || err);
    return false;
  }
};

// graceful shutdown to close connections
const quitAll = async () => {
  try {
    if (centerpanelRedis) await centerpanelRedis.quit();
  } catch (e) {
    console.warn("Error quitting centerpanel redis:", e.message || e);
  }
  try {
    if (client) await client.quit();
  } catch (e) {
    console.warn("Error quitting primary redis:", e.message || e);
  }
};

module.exports = {
  client,
  getBookmakerFancyByRedis,
  getBetfairMarketDataByRedis,
  getRacingDataByRedis,
  setRedisJson,
  quitAll,
  centerpanelRedis:centerpanelRedis
};
