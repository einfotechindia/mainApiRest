/**
 * Connection Guard Middleware
 *
 * Protects MongoDB and Redis from being overwhelmed during DDoS attacks.
 *
 * Features:
 * - Tracks in-flight requests to prevent connection pool exhaustion
 * - Circuit breaker: when error rate is high, rejects requests early (saves DB)
 * - Request timeout enforcement
 * - Graceful 503 responses when system is overloaded
 */

// --- Configuration ---
const CONFIG = {
  maxInflight: Number(process.env.DB_MAX_INFLIGHT || 300),
  circuitBreakerThreshold: Number(process.env.CIRCUIT_BREAKER_THRESHOLD || 50), // errors in window
  circuitBreakerWindowMs: 30000, // 30 seconds
  circuitBreakerCooldownMs: Number(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || 30000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 15000), // 15 seconds max per request
};

// --- State ---
let inflightCount = 0;
let errorCount = 0;
let errorWindowStart = Date.now();
let circuitOpen = false;
let circuitOpenedAt = 0;

// --- Reset error window periodically ---
setInterval(() => {
  const now = Date.now();
  if (now - errorWindowStart >= CONFIG.circuitBreakerWindowMs) {
    errorCount = 0;
    errorWindowStart = now;
  }
}, 10000);

/**
 * Record an error (call this from your error handlers)
 */
function recordError() {
  errorCount++;
  if (errorCount >= CONFIG.circuitBreakerThreshold && !circuitOpen) {
    circuitOpen = true;
    circuitOpenedAt = Date.now();
    console.error(`[CONNECTION GUARD] Circuit breaker OPENED — ${errorCount} errors in ${CONFIG.circuitBreakerWindowMs / 1000}s window`);
  }
}

/**
 * Check if circuit breaker should close
 */
function checkCircuitBreaker() {
  if (!circuitOpen) return false;

  const now = Date.now();
  if (now - circuitOpenedAt >= CONFIG.circuitBreakerCooldownMs) {
    circuitOpen = false;
    errorCount = 0;
    errorWindowStart = now;
    console.log('[CONNECTION GUARD] Circuit breaker CLOSED — accepting requests again');
    return false;
  }

  return true; // Still open
}

/**
 * Main middleware
 */
function connectionGuard(req, res, next) {
  // 1. Check circuit breaker
  if (checkCircuitBreaker()) {
    const retryAfter = Math.ceil((CONFIG.circuitBreakerCooldownMs - (Date.now() - circuitOpenedAt)) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(503).json({
      status: 503,
      code: 1,
      message: 'Service temporarily unavailable. Please try again shortly.',
    });
  }

  // 2. Check inflight limit
  if (inflightCount >= CONFIG.maxInflight) {
    return res.status(503).json({
      status: 503,
      code: 1,
      message: 'Server is busy. Please try again in a few seconds.',
    });
  }

  // 3. Track this request
  inflightCount++;

  // 4. Set request timeout
  const timeoutHandle = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        status: 504,
        code: 1,
        message: 'Request timeout. Please try again.',
      });
    }
  }, CONFIG.requestTimeoutMs);

  // 5. Clean up on response finish
  const cleanup = () => {
    inflightCount = Math.max(0, inflightCount - 1);
    clearTimeout(timeoutHandle);
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);

  // 6. Track errors for circuit breaker
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode >= 500) {
      recordError();
    }
    return originalJson(body);
  };

  next();
}

/**
 * Get current system health stats
 */
function getHealthStats() {
  return {
    inflightRequests: inflightCount,
    maxInflight: CONFIG.maxInflight,
    utilizationPercent: Math.round((inflightCount / CONFIG.maxInflight) * 100),
    circuitBreakerOpen: circuitOpen,
    errorCount,
    errorThreshold: CONFIG.circuitBreakerThreshold,
  };
}

module.exports = connectionGuard;
module.exports.connectionGuard = connectionGuard;
module.exports.recordError = recordError;
module.exports.getHealthStats = getHealthStats;
