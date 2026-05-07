const Lock = require("./lockManager");
async function runWithLock(key, ttlSeconds, fn) {
  const ttlMs = ttlSeconds * 1000;

  if (!Lock.acquire(key, ttlMs)) {
    console.log(`[SKIPPED] Already Running → ${key}`);
    return;
  }
  console.log(`[LOCK ACQUIRED] → ${key}`);
  try {
    await fn();
    console.log(`[TASK DONE] → ${key}`);
  } catch (err) {
    console.error(`[ERROR] in ${key}:`, err);
  } finally {
    Lock.release(key);
    console.log(`[LOCK RELEASED] → ${key}`);
  }
}
module.exports = runWithLock;
