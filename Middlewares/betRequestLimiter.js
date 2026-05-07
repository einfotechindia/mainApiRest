const { client } = require("../Helpers/RedisHelper");
const { _dx, _d } = require("../Helpers/CommonHelper");

const rateLimiter = async (req, res, next) => {
  const userId = req.ip;
  const redisKey = `${userId}:lastRequest`;
  const currentTime = Date.now();
  try {
    // Check when the last request was made
    client.get(redisKey, (err, lastRequestTime) => {
      if (err) {
        console.error("Redis GET error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }

      // If there's no record of the last request, or it's been more than 4 seconds, allow the request
      if (!lastRequestTime || currentTime - lastRequestTime >= 4000) {
        // Store the current time as the last request time
        redisClient.set(redisKey, currentTime, "EX", 60 * 10); // EX to expire after 10 minutes (just an example)
        return next(); // Allow the request to continue
      } else {
        // User made a request less than 4 seconds ago, block it
        const waitTime = 4 - (currentTime - lastRequestTime) / 1000;
        return res.status(429).json({
          message: `Too many requests. Please wait ${waitTime.toFixed(
            1
          )} seconds before trying again.`,
        });
      }
    });
  } catch (error) {
    console.error("Error in rate limiter middleware:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = rateLimiter;
