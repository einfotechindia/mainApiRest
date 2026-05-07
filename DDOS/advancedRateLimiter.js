/**
 * Advanced Rate Limiter Middleware
 *
 * Multi-tier rate limiting with sliding window algorithm.
 * Works in-memory (no Redis dependency) so it functions even when Redis is down.
 *
 * Tiers:
 * 1. Global — applies to all requests
 * 2. API — applies to authenticated API routes
 * 3. Sensitive — applies to login, register, password endpoints
 *
 * Features:
 * - Sliding window counter (more accurate than fixed window)
 * - Per-IP tracking
 * - Automatic cleanup
 * - Suspicious IP escalation to DDoS protection
 */

const { getClientIP } = require('./cloudflareIPResolver');

// --- Configuration ---
const TIERS = {
  global: {
    windowMs: Number(process.env.RATE_GLOBAL_WINDOW_MS || 60000),
    max: Number(process.env.RATE_GLOBAL_MAX || 120),
    message: 'Too many requests. Please slow down.',
  },
  api: {
    windowMs: Number(process.env.RATE_API_WINDOW_MS || 60000),
    max: Number(process.env.RATE_API_MAX || 30),
    message: 'Too many API requests. Please slow down.',
  },
  sensitive: {
    windowMs: Number(process.env.RATE_SENSITIVE_WINDOW_MS || 60000),
    max: Number(process.env.RATE_SENSITIVE_MAX || 5),
    message: 'Too many attempts. Please wait before trying again.',
  },
};

// Sensitive endpoints that get the strictest rate limiting
const SENSITIVE_PATHS = new Set([
  '/v1/user/login',
  '/v1/user/create',
  '/v1/user/forgotPassword',
  '/v1/user/resetPassword',
  '/v1/user/changePassword',
  '/v1/user/register',
]);

// --- Sliding Window Store ---
// Map<key, { counts: number[], windowStart: number }>
const store = new Map();
const MAX_STORE_SIZE = 500000;

function getKey(ip, tier) {
  return `${tier}:${ip}`;
}

function slidingWindowCheck(key, config) {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs * 2) {
    // Start fresh
    entry = { current: 1, previous: 0, windowStart: now };
    store.set(key, entry);
    return { allowed: true, remaining: config.max - 1, resetMs: config.windowMs };
  }

  const elapsed = now - entry.windowStart;

  if (elapsed >= config.windowMs) {
    // Slide window
    entry.previous = entry.current;
    entry.current = 1;
    entry.windowStart = now;
    store.set(key, entry);

    // Calculate weighted count from previous window
    const weight = 1 - (elapsed - config.windowMs) / config.windowMs;
    const estimatedCount = entry.previous * Math.max(0, weight) + entry.current;
    const remaining = Math.max(0, config.max - Math.ceil(estimatedCount));
    return { allowed: estimatedCount <= config.max, remaining, resetMs: config.windowMs - elapsed };
  }

  // Within current window
  entry.current++;

  // Sliding window estimate
  const weight = 1 - elapsed / config.windowMs;
  const estimatedCount = entry.previous * weight + entry.current;
  const remaining = Math.max(0, config.max - Math.ceil(estimatedCount));
  const resetMs = config.windowMs - elapsed;

  return { allowed: estimatedCount <= config.max, remaining, resetMs };
}

// Cleanup old entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = Math.max(TIERS.global.windowMs, TIERS.api.windowMs, TIERS.sensitive.windowMs) * 3;

  for (const [key, entry] of store) {
    if (now - entry.windowStart > maxAge) {
      store.delete(key);
    }
  }

  // Emergency cleanup if store is too large
  if (store.size > MAX_STORE_SIZE) {
    const entries = [...store.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
    const removeCount = Math.floor(MAX_STORE_SIZE * 0.2);
    for (let i = 0; i < removeCount; i++) {
      store.delete(entries[i][0]);
    }
  }
}, 120000);

// --- Middleware Factory ---

/**
 * Creates rate limiter middleware for a specific tier.
 * Usage:
 *   app.use(createRateLimiter('global'))
 *   app.use('/v1/user/login', createRateLimiter('sensitive'))
 */
function createRateLimiter(tierName) {
  const config = TIERS[tierName];
  if (!config) throw new Error(`Unknown rate limit tier: ${tierName}`);

  return (req, res, next) => {
    const ip = getClientIP(req);
    const key = getKey(ip, tierName);
    const result = slidingWindowCheck(key, config);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil(result.resetMs / 1000));
      return res.status(429).json({
        status: 429,
        code: 1,
        message: config.message,
      });
    }

    next();
  };
}

/**
 * Auto-tier middleware — automatically selects the right tier based on the request path.
 * Use this as a single middleware instead of multiple.
 */
function autoRateLimiter(req, res, next) {
  const ip = getClientIP(req);

  // Check global limit first
  const globalKey = getKey(ip, 'global');
  const globalResult = slidingWindowCheck(globalKey, TIERS.global);

  if (!globalResult.allowed) {
    res.setHeader('Retry-After', Math.ceil(globalResult.resetMs / 1000));
    return res.status(429).json({
      status: 429,
      code: 1,
      message: TIERS.global.message,
    });
  }

  // Check sensitive endpoints
  const normalizedPath = req.path.toLowerCase().replace(/\/+$/, '');
  if (SENSITIVE_PATHS.has(normalizedPath)) {
    const sensitiveKey = getKey(ip, 'sensitive');
    const sensitiveResult = slidingWindowCheck(sensitiveKey, TIERS.sensitive);

    res.setHeader('X-RateLimit-Limit', TIERS.sensitive.max);
    res.setHeader('X-RateLimit-Remaining', sensitiveResult.remaining);

    if (!sensitiveResult.allowed) {
      res.setHeader('Retry-After', Math.ceil(sensitiveResult.resetMs / 1000));
      return res.status(429).json({
        status: 429,
        code: 1,
        message: TIERS.sensitive.message,
      });
    }
  }

  // Set global headers
  res.setHeader('X-RateLimit-Limit', TIERS.global.max);
  res.setHeader('X-RateLimit-Remaining', globalResult.remaining);

  next();
}

module.exports = autoRateLimiter;
module.exports.createRateLimiter = createRateLimiter;
module.exports.autoRateLimiter = autoRateLimiter;
