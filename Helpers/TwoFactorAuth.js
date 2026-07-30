/**
 * Common Google Authenticator (TOTP 2FA) Helper
 * Used by: Staff, SubAgent, User login flows
 */
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

// ─── OTP Replay Protection ───────────────────────────────────
const USED_OTP_CACHE = new Map(); // userId:otp → expiry timestamp

function isOtpReplayed(userId, otp) {
  const key = `${userId}:${otp}`;
  const expiry = USED_OTP_CACHE.get(key);
  if (expiry && Date.now() < expiry) return true;
  return false;
}

function markOtpUsed(userId, otp) {
  const key = `${userId}:${otp}`;
  USED_OTP_CACHE.set(key, Date.now() + 60000); // Block reuse for 60s
}

// Cleanup expired OTPs every 2 min
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of USED_OTP_CACHE) {
    if (now > expiry) USED_OTP_CACHE.delete(key);
  }
}, 120000);

/**
 * Verify a TOTP code during login
 * @param {Object} opts
 * @param {string} opts.userId - User/Staff/SubAgent _id
 * @param {string} opts.secret - twoFactorSecret (base32)
 * @param {string} opts.otpCode - OTP code from authenticator app
 * @returns {{ valid: boolean, error: string|null }}
 */
function verifyTOTP({ userId, secret, otpCode }) {
  if (!otpCode) {
    return { valid: false, error: null, requires2FA: true };
  }

  // Replay protection
  if (isOtpReplayed(userId, otpCode)) {
    return { valid: false, error: "This code has already been used. Wait for a new code." };
  }

  const verified = speakeasy.totp.verify({
    secret: secret,
    encoding: "base32",
    token: String(otpCode),
    window: 1, // Allow 30s clock drift
  });

  if (!verified) {
    return { valid: false, error: "Invalid authenticator code" };
  }

  // Mark OTP as used
  markOtpUsed(userId, otpCode);
  return { valid: true, error: null };
}

/**
 * Generate a new TOTP secret + QR code for setup
 * @param {string} username - Display name for authenticator app
 * @param {string} issuer - App name (e.g. "StaffPanel")
 * @returns {Promise<{ secret: string, qrCode: string, otpauthUrl: string }>}
 */
async function generateSecret(username, issuer = "StaffPanel") {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${username})`,
    issuer: issuer,
    length: 20,
  });

  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCode: qrDataUrl,
    otpauthUrl: secret.otpauth_url,
  };
}

/**
 * Verify OTP code against secret (for initial setup verification)
 * @param {string} secret - base32 secret
 * @param {string} otpCode - OTP code
 * @returns {boolean}
 */
function verifySetupCode(secret, otpCode) {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: "base32",
    token: String(otpCode),
    window: 1,
  });
}

module.exports = {
  verifyTOTP,
  generateSecret,
  verifySetupCode,
  isOtpReplayed,
  markOtpUsed,
};
