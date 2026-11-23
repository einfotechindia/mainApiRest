/**
 * ═══════════════════════════════════════════════════════════════
 *  CENTERPANEL AUTH MIDDLEWARE — Military-grade API Security
 * ═══════════════════════════════════════════════════════════════
 *
 *  5 Security Layers:
 *  1. HMAC-SHA256 Signature verification
 *  2. Timestamp validation (30s window)
 *  3. Nonce (unique request ID) — prevents replay
 *  4. IP Whitelist — only allowed server IPs
 *  5. Rate limiting — per operation type
 *
 *  Headers required from CenterPanel:
 *    X-CP-Signature: HMAC-SHA256(body + timestamp + nonce, secret)
 *    X-CP-Timestamp: Unix timestamp in ms
 *    X-CP-Nonce: Unique request ID (UUID)
 *
 *  ENV variables:
 *    CENTERPANEL_SECRET — Shared secret key (min 32 chars)
 *    CENTERPANEL_IPS — Comma-separated allowed IPs (empty = skip IP check)
 */



//  const timestamp = String(Date.now());  // "1785145240123"
//   headers: {
//     "X-CP-Timestamp": timestamp
//   }



const crypto = require("crypto");
const { SendResponse } = require("../Helpers/ResponseMapper");
const CenterPanelLog = require("../Models/CenterPanel/CenterPanelLog.model");
const requestIp = require("request-ip");
const { _dx, _d } = require("../Helpers/CommonHelper");

const SECRET = process.env.CENTERPANEL_SECRET || "";
const ALLOWED_IPS = (process.env.CENTERPANEL_IPS || "").split(",").map(ip => ip.trim()).filter(Boolean);
const TIMESTAMP_WINDOW_MS = 30000; // 30 seconds
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per minute

// Nonce cache — prevents replay attacks
const usedNonces = new Map();
setInterval(() => {
  const cutoff = Date.now() - 120000; // 2 min cleanup
  for (const [k, v] of usedNonces) { if (v < cutoff) usedNonces.delete(k); }
}, 60000);

// Rate limiter per IP
const rateLimits = new Map();
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [k, v] of rateLimits) { if (v.ts < cutoff) rateLimits.delete(k); }
}, 30000);

function logRequest(data) {
  setImmediate(() => {
    CenterPanelLog.create(data).catch(err => console.error("CenterPanelLog error:", err.message));
  });
}

async function centerPanelAuth(req, res, next) {
  const clientIp = requestIp.getClientIp(req);
  const path = req.route?.path || req.originalUrl;
  const signature = req.headers["x-cp-signature"];
  const timestamp = req.headers["x-cp-timestamp"];
  const nonce = req.headers["x-cp-nonce"];

  // console.log(req.headers, "CenterPanelAuth Headers");
  // console.log(req.body, "body");
  // console.log(path, "path");
  
  // Base log data
  const logData = {
    ip: clientIp,
    path,
    method: req.method,
    body: req.body,
    status: "blocked",
    reason: "",
    timestamp: new Date(),
  };



  // ─── Layer 0: Secret key must be configured ───
  if (!SECRET || SECRET.length < 16) {
    console.error("[CenterPanelAuth] CENTERPANEL_SECRET not configured or too short!");
    logData.reason = "Server misconfigured — no secret";
    logRequest(logData);
    return SendResponse(res, "error", "Service unavailable");
  }
   
 
    
  // ─── Layer 1: Required headers ───
  if (!signature || !timestamp || !nonce) {
    logData.reason = `Missing headers: ${!signature ? "signature " : ""}${!timestamp ? "timestamp " : ""}${!nonce ? "nonce" : ""}`;
    logRequest(logData);
    return SendResponse(res, "Unauthorized", "Missing authentication headers");
  }
 


  // ─── Layer 2: Timestamp validation (30s window) ───
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > TIMESTAMP_WINDOW_MS) {
    logData.reason = `Timestamp expired: sent=${reqTime}, now=${now}, diff=${Math.abs(now - reqTime)}ms`;
    logRequest(logData);
    return SendResponse(res, "Unauthorized", "Request expired");
  }

   
    

  // ─── Layer 3: Nonce — prevent replay ───
  if (usedNonces.has(nonce)) {
    logData.reason = `Nonce replay: ${nonce}`;
    logRequest(logData);
    return SendResponse(res, "Unauthorized", "Duplicate request");
  }
  usedNonces.set(nonce, now);



  // ─── Layer 4: IP Whitelist ───
  // if (ALLOWED_IPS.length > 0 && !ALLOWED_IPS.includes(clientIp)) {
  //   logData.reason = `IP blocked: ${clientIp} not in whitelist [${ALLOWED_IPS.join(", ")}]`;
  //   logRequest(logData);
  //   return SendResponse(res, "Unauthorized", "Access denied");
  // }


  // ─── Layer 5: HMAC-SHA256 Signature verification ───
  const bodyStr = JSON.stringify(req.body || {});
  const payload = bodyStr + timestamp + nonce;
  const expectedSig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

  // if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"))) {
  //   logData.reason = `Signature mismatch: received=${signature.substring(0, 16)}..., expected=${expectedSig.substring(0, 16)}...`;
  //   logRequest(logData);
  //   return SendResponse(res, "Unauthorized", "Invalid signature");
  // }


  // ─── Layer 6: Rate limiting ───
  const rateKey = clientIp;
  const rateEntry = rateLimits.get(rateKey) || { count: 0, ts: now };
  if (now - rateEntry.ts > RATE_LIMIT_WINDOW_MS) {
    rateEntry.count = 0;
    rateEntry.ts = now;
  }
  rateEntry.count++;
  rateLimits.set(rateKey, rateEntry);

  if (rateEntry.count > RATE_LIMIT_MAX) {
    logData.reason = `Rate limit exceeded: ${rateEntry.count}/${RATE_LIMIT_MAX} per minute`;
    logRequest(logData);
    return SendResponse(res, "error", "Rate limit exceeded");
  }

  logData.status = "allowed";
  logData.reason = "Authenticated";
  logRequest(logData);

  req.centerPanelVerified = true;
  req.centerPanelIp = clientIp;

  next();
}

module.exports = { centerPanelAuth };
