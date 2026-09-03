// ============================================================
// ANTI-BOT / ANTI-SCRIPT DETECTION
//
// 2 levels:
//   isBot()        — strict check (login, verifyToken) — blocks definitively
//   isLikelyBot()  — scoring-based (securityGuard) — softer, score >= 3 = bot
//
// Usage:
//   const { isBot, isLikelyBot } = require("../Helpers/BotDetector");
// ============================================================

const BLOCKED_UA_PATTERNS = [
  /curl/i, /wget/i, /python-requests/i, /python-urllib/i,
  /httpclient/i, /java\//i, /apache-http/i, /go-http/i,
  /node-fetch/i, /undici/i, /postmanruntime/i,
  /scrapy/i, /phantom/i, /selenium/i, /puppeteer/i,
  /headless/i, /bot\b/i, /spider/i, /crawl/i,
];

/**
 * isBot — strict binary check
 * Used in: verifyToken, UserLogin
 * Missing UA / known bot UA / missing accept/accept-language = blocked
 */
function isBot(req) {
  const ua = req.headers["user-agent"] || "";

  if (!ua || ua.length < 10) return true;

  for (const pattern of BLOCKED_UA_PATTERNS) {
    if (pattern.test(ua)) return true;
  }

  if (!req.headers["accept"]) return true;
  if (!req.headers["accept-language"]) return true;

  return false;
}

/**
 * isLikelyBot — scoring-based check (more signals, softer threshold)
 * Used in: securityGuard middleware
 * Checks client hints, sec-fetch headers, UA depth, programmatic headers
 * score >= 3 = likely bot
 */
function isLikelyBot(req) {
  const headers = req.headers || {};
  const ua = headers["user-agent"] || "";
  let score = 0;

  // Browser Client Hints — Chrome 89+, Edge, Opera always send
  if (!headers["sec-ch-ua"]) score++;
  if (!headers["sec-ch-ua-platform"]) score++;
  if (!headers["sec-ch-ua-mobile"]) score++;

  // Standard browser headers
  if (!headers["accept-language"]) score++;
  if (!headers["accept-encoding"]) score++;
  if (!headers["accept"]) score++;

  // User-Agent checks
  if (!ua || ua.length < 20) score += 3;

  const BOT_PATTERNS = [
    /curl/i, /wget/i, /python/i, /httpie/i,
    /postman/i, /insomnia/i, /axios/i, /node-fetch/i, /undici/i,
    /go-http/i, /java\//i, /apache-http/i, /okhttp/i,
    /selenium/i, /puppeteer/i, /playwright/i, /phantom/i,
    /headless/i, /chrome-lighthouse/i,
    /scrapy/i, /crawler/i, /spider/i, /bot\b/i,
  ];

  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(ua)) {
      score += 3;
      break;
    }
  }

  // Programmatic client headers
  if (headers["idempotency-key"]) score++;
  if (headers["x-request-id"] && !headers["sec-ch-ua"]) score++;

  // Sec-Fetch headers — real browsers send these
  if (!headers["sec-fetch-site"] && !headers["sec-fetch-mode"]) score++;

  return score >= 3;
}

module.exports = { isBot, isLikelyBot };
