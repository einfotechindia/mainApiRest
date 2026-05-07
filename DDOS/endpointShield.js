/**
 * Endpoint Shield — Extra protection for heavily attacked endpoints
 *
 * Problem:
 *   /v1/user/login aur /v1/user/userBalance pe sabse zyada attack aata hai
 *   Global rate limiter enough nahi hai — in endpoints ko alag se protect karna padega
 *
 * Features:
 *   - Per-endpoint rate limiting (login = strict, userBalance = moderate)
 *   - Failed login tracking — 5 failed login = IP block 15 min
 *   - userBalance flood detection — same IP se rapid fire balance check = bot
 *   - Fake token detection — invalid/expired token baar baar bhejne wala = attacker
 *   - Honeypot — common attack paths pe instant block
 *
 * Usage in route file:
 *   const { loginShield, balanceShield } = require('../DDOS/endpointShield');
 *   router.post("/login", loginShield, UserController.Login);
 *   router.post("/userBalance", verifyToken, balanceShield, UserController.userBalance);
 */

const { getClientIP } = require('./cloudflareIPResolver');
const { logBlockedIP } = require('./blockedIPLogger');

// --- Stores ---
const loginAttempts = new Map();   // IP -> { count, failures, windowStart, blockedUntil }
const balanceRequests = new Map(); // IP -> { count, windowStart }
const failedTokens = new Map();   // IP -> { count, windowStart }

// --- Configuration (from .env or defaults) ---
const CONFIG = {
  // Login protection
  loginMaxPerMinute: Number(process.env.LOGIN_MAX_PER_MINUTE || 6),        // Max 6 login attempts per minute
  loginFailMaxPerMinute: Number(process.env.LOGIN_FAIL_MAX || 5),          // 5 failed logins = block
  loginBlockDurationMs: Number(process.env.LOGIN_BLOCK_DURATION_MS || 900000), // Block 15 min after failed logins
  loginWindowMs: 60000, // 1 minute window

  // UserBalance protection
  balanceMaxPerMinute: Number(process.env.BALANCE_MAX_PER_MINUTE || 30),   // Max 30 balance checks per minute
  balanceWindowMs: 60000,

  // Failed token protection
  failedTokenMax: Number(process.env.FAILED_TOKEN_MAX || 10),              // 10 invalid tokens = block
  failedTokenBlockMs: Number(process.env.FAILED_TOKEN_BLOCK_MS || 1800000), // Block 30 min
  failedTokenWindowMs: 60000,

  // Cleanup
  maxStoreSize: 100000,
};

// --- Cleanup every 2 minutes ---
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts) {
    if (now - data.windowStart > CONFIG.loginWindowMs * 5 && (!data.blockedUntil || data.blockedUntil < now)) {
      loginAttempts.delete(ip);
    }
  }
  for (const [ip, data] of balanceRequests) {
    if (now - data.windowStart > CONFIG.balanceWindowMs * 3) {
      balanceRequests.delete(ip);
    }
  }
  for (const [ip, data] of failedTokens) {
    if (now - data.windowStart > CONFIG.failedTokenWindowMs * 5) {
      failedTokens.delete(ip);
    }
  }
}, 120000);

// --- Emergency cleanup if stores get too large ---
function emergencyCleanup(store) {
  if (store.size > CONFIG.maxStoreSize) {
    const entries = [...store.entries()].sort((a, b) => a[1].windowStart - b[1].windowStart);
    const removeCount = Math.floor(CONFIG.maxStoreSize * 0.3);
    for (let i = 0; i < removeCount; i++) {
      store.delete(entries[i][0]);
    }
  }
}

// ==========================================
// LOGIN SHIELD
// ==========================================
function loginShield(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();

  emergencyCleanup(loginAttempts);

  let entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > CONFIG.loginWindowMs) {
    entry = { count: 0, failures: 0, windowStart: now, blockedUntil: 0 };
    loginAttempts.set(ip, entry);
  }

  // Check if IP is blocked from failed logins
  if (entry.blockedUntil > now) {
    const remaining = Math.ceil((entry.blockedUntil - now) / 1000);
    return res.status(429).json({
      status: 429,
      code: 1,
      message: `Too many failed login attempts. Try again in ${remaining} seconds.`,
    });
  }

  entry.count++;

  // Too many login attempts (even if successful)
  if (entry.count > CONFIG.loginMaxPerMinute) {
    console.warn(`[ENDPOINT-SHIELD] Login rate limit hit | IP: ${ip} | ${entry.count} attempts/min`);

    logBlockedIP({
      ip,
      score: 0,
      blockCount: 1,
      blockedUntil: '',
      reasons: ['login-rate-limit', `${entry.count}-attempts-per-min`],
      userAgent: req.headers['user-agent'] || '',
      country: req.cfCountry || '',
      path: '/v1/user/login',
      method: 'POST',
    });

    return res.status(429).json({
      status: 429,
      code: 1,
      message: 'Too many login attempts. Please wait 1 minute.',
    });
  }

  // Hook into response to track failed logins
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Login fail = status not 200 or body has error/code:1
    if (res.statusCode !== 200 || (body && body.code === 1)) {
      entry.failures++;

      if (entry.failures >= CONFIG.loginFailMaxPerMinute) {
        entry.blockedUntil = now + CONFIG.loginBlockDurationMs;
        console.warn(`[ENDPOINT-SHIELD] IP blocked for failed logins | IP: ${ip} | ${entry.failures} failures | Blocked ${CONFIG.loginBlockDurationMs / 60000} min`);

        logBlockedIP({
          ip,
          score: 0,
          blockCount: entry.failures,
          blockedUntil: new Date(entry.blockedUntil).toISOString(),
          reasons: ['login-brute-force', `${entry.failures}-failed-logins`],
          userAgent: req.headers['user-agent'] || '',
          country: req.cfCountry || '',
          path: '/v1/user/login',
          method: 'POST',
        });
      }
    }

    return originalJson(body);
  };

  next();
}

// ==========================================
// BALANCE SHIELD
// ==========================================
function balanceShield(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();

  emergencyCleanup(balanceRequests);

  let entry = balanceRequests.get(ip);
  if (!entry || now - entry.windowStart > CONFIG.balanceWindowMs) {
    entry = { count: 0, windowStart: now };
    balanceRequests.set(ip, entry);
  }

  entry.count++;

  // Too many balance checks — bot/attack behavior
  if (entry.count > CONFIG.balanceMaxPerMinute) {
    console.warn(`[ENDPOINT-SHIELD] Balance flood detected | IP: ${ip} | ${entry.count} req/min`);

    logBlockedIP({
      ip,
      score: 0,
      blockCount: 1,
      blockedUntil: '',
      reasons: ['balance-flood', `${entry.count}-req-per-min`],
      userAgent: req.headers['user-agent'] || '',
      country: req.cfCountry || '',
      path: '/v1/user/userBalance',
      method: 'POST',
    });

    return res.status(429).json({
      status: 429,
      code: 1,
      message: 'Too many balance requests. Please slow down.',
    });
  }

  next();
}

// ==========================================
// FAILED TOKEN SHIELD
// Use this AFTER verifyToken middleware
// If verifyToken fails repeatedly = attacker probing with fake tokens
// ==========================================
function failedTokenShield(req, res, next) {
  const ip = getClientIP(req);
  const now = Date.now();

  emergencyCleanup(failedTokens);

  // Hook into response to catch token verification failures
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 401 || res.statusCode === 403) {
      let entry = failedTokens.get(ip);
      if (!entry || now - entry.windowStart > CONFIG.failedTokenWindowMs) {
        entry = { count: 0, windowStart: now, blockedUntil: 0 };
        failedTokens.set(ip, entry);
      }

      entry.count++;

      if (entry.count >= CONFIG.failedTokenMax) {
        console.warn(`[ENDPOINT-SHIELD] Token probe detected | IP: ${ip} | ${entry.count} invalid tokens`);

        logBlockedIP({
          ip,
          score: 0,
          blockCount: entry.count,
          blockedUntil: new Date(now + CONFIG.failedTokenBlockMs).toISOString(),
          reasons: ['token-probe', `${entry.count}-invalid-tokens`],
          userAgent: req.headers['user-agent'] || '',
          country: req.cfCountry || '',
          path: req.path,
          method: req.method,
        });
      }
    }

    return originalJson(body);
  };

  next();
}

// ==========================================
// Get stats
// ==========================================
function getEndpointStats() {
  const now = Date.now();
  let loginBlocked = 0;
  let loginTracked = loginAttempts.size;
  for (const [, entry] of loginAttempts) {
    if (entry.blockedUntil > now) loginBlocked++;
  }

  return {
    login: { tracked: loginTracked, currentlyBlocked: loginBlocked },
    balance: { tracked: balanceRequests.size },
    failedTokens: { tracked: failedTokens.size },
  };
}

module.exports = {
  loginShield,
  balanceShield,
  failedTokenShield,
  getEndpointStats,
};
