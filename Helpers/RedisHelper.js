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

  const opts = {
    host,
    port,
    ...DEFAULT_OPTS,
    enable_offline_queue: true,
    no_ready_check: false,
  };
  // password sirf tab bhejo jab actually set ho — warna Redis warning deta hai
  if (password) opts.password = password;

  const client = createAsyncRedis.createClient(opts);

  // Set a reasonable max listeners limit instead of unlimited
  client.setMaxListeners(50);

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

// --- key prefix wrapper ---
// .env me REDIS_PREFIX set karo (e.g. REDIS_PREFIX=project1_)
// saari Redis keys me automatically prefix lag jayega
const REDIS_PREFIX = process.env.REDIS_PREFIX || "";

const prefixKey = (key) => REDIS_PREFIX + key;

const wrapClientWithPrefix = (rawClient) => {
  if (!REDIS_PREFIX) return rawClient;

  const handler = {
    get(target, prop) {
      const original = target[prop];
      if (typeof original !== "function") return original;

      // commands jinka pehla argument key hai
      const singleKeyCommands = new Set([
        "get", "set", "del", "setex", "expire", "incr", "decr",
        "exists", "ttl", "pttl", "type", "persist", "setnx",
        "getset", "lpush", "rpush", "lrange", "llen", "lpop", "rpop",
        "sadd", "srem", "smembers", "sismember", "scard",
        "zadd", "zrem", "zrange", "zrangebyscore", "zscore", "zcard",
        "hget", "hset", "hdel", "hgetall", "hmset", "hmget", "hexists", "hkeys", "hvals",
        "append", "strlen", "getrange", "setrange",
      ]);

      // commands jinka multiple keys hote hain
      const multiKeyCommands = new Set(["del", "exists", "mget", "unlink"]);

      if (singleKeyCommands.has(prop)) {
        return function (key, ...args) {
          return original.call(target, prefixKey(key), ...args);
        };
      }

      if (prop === "keys") {
        return function (pattern, ...args) {
          return original.call(target, prefixKey(pattern), ...args);
        };
      }

      // flushall/flushdb — sirf prefix wali keys delete karo, poora Redis flush nahi
      // SCAN use karta hai KEYS ki jagah — production safe, non-blocking
      if (prop === "flushall" || prop === "flushdb") {
        return async function () {
          let cursor = "0";
          let deleted = 0;
          do {
            const [nextCursor, keys] = await target.scan(cursor, "MATCH", `${REDIS_PREFIX}*`, "COUNT", 500);
            cursor = nextCursor;
            if (keys && keys.length > 0) {
              await target.del(...keys);
              deleted += keys.length;
            }
          } while (cursor !== "0");
          console.log(`flushall (prefixed): deleted ${deleted} keys with prefix "${REDIS_PREFIX}"`);
          return deleted;
        };
      }

      return original.bind(target);
    },
  };

  return new Proxy(rawClient, handler);
};

// create primary client
const rawClient = makeRedisClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  name: "PrimaryRedis",
});
const client = wrapClientWithPrefix(rawClient);


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
const MAX_CACHE_SIZE = 10_000;

const CACHE_CLEANUP_INTERVAL = 30_000; // 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, row] of memoryCache) {
    if (now > row.expiresAt) {
      memoryCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL).unref();

const setMemoryCache = (key, value, ttlMs = 500) => {
  // limit cross hone pe sabse purani entries hatao (Map insertion order maintain karta hai)
  if (memoryCache.size >= MAX_CACHE_SIZE && !memoryCache.has(key)) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
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

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis GET timeout")), timeoutMs);
  });

  try {
    const getPromise = redisClient.get(key);
    const raw = await Promise.race([getPromise, timeoutPromise]);
    clearTimeout(timer);
    if (raw == null) return null;
    const parsed = safeJsonParse(raw);
    setMemoryCache(key, parsed ?? raw, 500);
    return parsed ?? raw;
  } catch (err) {
    clearTimeout(timer);
    console.error(`redisGetWithTimeout error for key="${key}":`, err.message || err);
    return null;
  }
};

// public getters (safe + optimized)
const getBookmakerFancyByRedis = async (marketId, eventId) => {
  if (!marketId) return [];
  const finalKey = `allFinalOddsData_${marketId}`;
  const redis = centerpanelRedis || client;
  const data = await redisGetWithTimeout(redis, finalKey, 3000);
  return Array.isArray(data) ? data : [];
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

// convenience getter — get + JSON.parse + memory cache in one call
const getRedisJson = async (key, redisClient = null) => {
  const redis = redisClient || client;
  return redisGetWithTimeout(redis, key, 2000);
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
    if (rawClient) await rawClient.quit();
  } catch (e) {
    console.warn("Error quitting primary redis:", e.message || e);
  }
};

module.exports = {
  client,
  getBookmakerFancyByRedis,
  getBetfairMarketDataByRedis,
  getRacingDataByRedis,
  getRedisJson,
  setRedisJson,
  quitAll,
  centerpanelRedis: centerpanelRedis,
};
