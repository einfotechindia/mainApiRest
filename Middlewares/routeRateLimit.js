/**
 * ROUTE-SPECIFIC RATE LIMITER
 *
 * Usage:
 *   const { rateLimit } = require("../Middlewares/routeRateLimit");
 *   router.post("/updateCoins", verifyToken, rateLimit(5, 60), controller.updateCoins);
 *   // 5 requests per 60 seconds per user
 */

const { client } = require("../Helpers/RedisHelper");
const { SendResponse } = require("../Helpers/ResponseMapper");

/**
 * @param {number} maxRequests - max requests allowed in window
 * @param {number} windowSeconds - time window in seconds
 * @param {string} keyPrefix - optional custom prefix
 */
const rateLimit = (maxRequests = 10, windowSeconds = 60, keyPrefix = "") => {
  return async (req, res, next) => {
    try {
      const userId = req.loggedInUser?.userId || req.ip;
      const route = keyPrefix || req.route?.path || req.path;
      const key = `rl:${route}:${userId}`;

      const current = await client.incr(key);

      if (current === 1) {
        await client.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        return SendResponse(res, "error", `Too many requests. Max ${maxRequests} per ${windowSeconds}s.`);
      }

      next();
    } catch (err) {
      // Redis fail — allow request (fail-open)
      next();
    }
  };
};

module.exports = { rateLimit };
