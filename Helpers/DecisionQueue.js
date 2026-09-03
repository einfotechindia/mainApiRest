/**
 * DECISION QUEUE — Sequential Decision Processing Per Market
 *
 * Problem: 2 decisions same market pe simultaneously aayein toh coins gadbad
 * Solution: Redis-based queue — ek market ka ek time pe ek hi decision process ho
 *
 * Usage:
 *   const { acquireDecisionLock, releaseDecisionLock } = require("../Helpers/DecisionQueue");
 *
 *   const lock = await acquireDecisionLock(marketId);
 *   if (!lock.acquired) return SendResponse(res, "error", lock.message);
 *   try {
 *     // ... decision logic ...
 *   } finally {
 *     await releaseDecisionLock(marketId, lock.token);
 *   }
 */

const { client } = require("./RedisHelper");

const LOCK_TTL = 600; // 10 minutes max — auto-release if stuck
const WAIT_TIMEOUT = 120000; // 2 minutes max wait
const POLL_INTERVAL = 500; // check every 500ms

/**
 * acquireDecisionLock — wait until market's previous decision completes
 * @param {string} marketId
 * @returns {{ acquired: boolean, token: string, message: string }}
 */
async function acquireDecisionLock(marketId) {
  const lockKey = `decision:lock:${marketId}`;
  const token = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const startTime = Date.now();

  while (true) {
    // Try to acquire lock
    const result = await client.set(lockKey, token, "NX", "EX", LOCK_TTL);

    if (result === "OK") {
      return { acquired: true, token, message: "Lock acquired" };
    }

    // Lock held by another decision — wait
    const elapsed = Date.now() - startTime;
    if (elapsed >= WAIT_TIMEOUT) {
      return {
        acquired: false,
        token: null,
        message: "Decision queue timeout. Previous decision taking too long. Please try again.",
      };
    }

    // Wait before retry
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * releaseDecisionLock — release only if we own the lock
 * @param {string} marketId
 * @param {string} token
 */
async function releaseDecisionLock(marketId, token) {
  const lockKey = `decision:lock:${marketId}`;
  try {
    const currentToken = await client.get(lockKey);
    if (currentToken === token) {
      await client.del(lockKey);
    }
  } catch (err) {
    console.error("releaseDecisionLock error:", err.message);
  }
}

module.exports = { acquireDecisionLock, releaseDecisionLock };
