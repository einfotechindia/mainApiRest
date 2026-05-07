// ===============================
// Simple In-Memory Lock Manager
// ===============================

class LockManager {
  constructor() {
    this.locks = new Map(); // key → expiration timestamp
  }

  // Check if lock exists and not expired
  isLocked(key) {
    const expiresAt = this.locks.get(key);
    if (!expiresAt) return false;

    // Expired → remove & allow lock again
    if (Date.now() > expiresAt) {
      this.locks.delete(key);
      return false;
    }

    return true;
  }

  // Acquire lock (returns true/false)
  acquire(key, ttlMs) {
    if (this.isLocked(key)) return false;

    const expiry = Date.now() + ttlMs;
    this.locks.set(key, expiry);

    return true;
  }

  // Manual unlock
  release(key) {
    this.locks.delete(key);
  }
}

module.exports = new LockManager();
