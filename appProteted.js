require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const helmet = require("helmet");
const compression = require("compression");
const hpp = require("hpp");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const crypto = require("crypto");

const db = require("./Models/Connection");
const { initializeSocket } = require("./socket");

const app = express();
const server = http.createServer(app);

const isProd = process.env.NODE_ENV === "production";

/* =========================
   CONFIG HELPERS
========================= */
app.disable("x-powered-by");

// IMPORTANT: set correct hops for your infra (Cloudflare+Nginx could be 2, etc.)
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

function normalizeHost(host = "") {
  return String(host)
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0];
}

function getClientIp(req) {
  return String(req.ip || "").replace(/^::ffff:/, "");
}

const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map(s => normalizeHost(s))
    .filter(Boolean)
);

const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

const BYPASS_IPS = new Set(
  (process.env.BYPASS_IPS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);

function isBypassIp(req) {
  return BYPASS_IPS.has(getClientIp(req));
}

/* =========================
   AUTO BLOCK IP (1 hour)
   In-memory per process; for multi-server use Redis.
========================= */
const BLOCK_MS = Number(process.env.BLOCK_MS || 60 * 60 * 1000);
const MAX_BLOCKED_IPS = Number(process.env.MAX_BLOCKED_IPS || 200000);

const blockedIPs = new Map(); // ip -> { until, reason, count, ts }
let tsCounter = 0;

function nowMs() {
  return Date.now();
}

function isBlocked(ip) {
  const rec = blockedIPs.get(ip);
  if (!rec) return false;
  if (rec.until <= nowMs()) {
    blockedIPs.delete(ip);
    return false;
  }
  return true;
}

function blockIp(ip, reason = "attack") {
  if (!ip) return;
  if (BYPASS_IPS.has(ip)) return;

  const prev = blockedIPs.get(ip);
  blockedIPs.set(ip, {
    until: nowMs() + BLOCK_MS,
    reason,
    count: prev ? prev.count + 1 : 1,
    ts: ++tsCounter
  });

  // prevent memory abuse
  if (blockedIPs.size > MAX_BLOCKED_IPS) {
    let oldestIp = null;
    let oldestTs = Infinity;
    for (const [k, v] of blockedIPs.entries()) {
      if (v && v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestIp = k;
      }
    }
    if (oldestIp) blockedIPs.delete(oldestIp);
  }
}

function blockAndRespond(req, res, status, message, reason) {
  const ip = getClientIp(req);
  if (!req.securityBypass) blockIp(ip, reason);

  return res.status(status).json({
    error: {
      message,
      status,
      requestId: req.id,
      blocked: true,
      blockMs: BLOCK_MS
    }
  });
}

// cleanup expired blocks
setInterval(() => {
  const t = nowMs();
  for (const [ip, rec] of blockedIPs.entries()) {
    if (!rec || rec.until <= t) blockedIPs.delete(ip);
  }
}, 60 * 1000).unref();

/* =========================
   REQUEST ID + BYPASS FLAG
========================= */
app.use((req, res, next) => {
  const rid = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = rid;
  res.setHeader("x-request-id", rid);
  next();
});

app.use((req, res, next) => {
  req.securityBypass = isBypassIp(req);
  next();
});

/* =========================
   LOGGING (perf: only errors in prod)
========================= */
if (!isProd) app.use(morgan("dev"));
else app.use(morgan("combined", { skip: (req, res) => res.statusCode < 400 }));

/* =========================
   EARLY BLOCK CHECK
========================= */
app.use((req, res, next) => {
  if (req.securityBypass) return next();
  const ip = getClientIp(req);
  if (isBlocked(ip)) {
    return res.status(403).json({
      error: {
        message: "Your IP is temporarily blocked. Try again later.",
        status: 403,
        requestId: req.id,
        blocked: true
      }
    });
  }
  next();
});

/* =========================
   GLOBAL CONCURRENCY LIMITER
   (Protects Mongo pool from flooding)
========================= */
function globalConcurrencyLimiter(maxInFlight) {
  let inFlight = 0;

  return (req, res, next) => {
    if (req.securityBypass) return next();

    // only apply to API (routes will mount under /v1)
    if (inFlight >= maxInFlight) {
      // This is "load shedding": refuse before touching Mongo
      return res.status(503).json({
        error: {
          message: "Server busy (protection mode). Try again later.",
          status: 503,
          requestId: req.id
        }
      });
    }

    inFlight++;
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      inFlight--;
    };

    res.on("finish", release);
    res.on("close", release);

    next();
  };
}

// Apply only on API
app.use("/v1", globalConcurrencyLimiter(Number(process.env.DB_MAX_INFLIGHT || 300)));

/* =========================
   BASIC METHOD HARDENING
========================= */
app.use((req, res, next) => {
  if (req.method === "TRACE" || req.method === "TRACK") {
    return blockAndRespond(req, res, 405, "Method not allowed. IP blocked for 1 hour.", "bad_method");
  }
  next();
});

/* =========================
   HOST HEADER PROTECTION
========================= */
app.use((req, res, next) => {
  if (req.securityBypass) return next();
  if (!ALLOWED_HOSTS.size) return next();

  const host = normalizeHost(req.headers.host || "");
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return blockAndRespond(req, res, 421, "Invalid host. IP blocked for 1 hour.", "bad_host");
  }
  next();
});

/* =========================
   HTTPS ENFORCEMENT (optional)
========================= */
app.use((req, res, next) => {
  if (req.securityBypass) return next();
  if (!isProd) return next();

  const xfProto = (req.headers["x-forwarded-proto"] || "").toString().toLowerCase();
  if (xfProto && xfProto !== "https") {
    return res.status(403).json({
      error: { message: "HTTPS required", status: 403, requestId: req.id }
    });
  }
  next();
});

/* =========================
   SECURITY HEADERS
========================= */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'none'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  })
);

app.use(hpp());

/* =========================
   STATIC
========================= */
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProd ? "7d" : "0",
    etag: true
  })
);

/* =========================
   BODY PARSERS
========================= */
app.use(express.json({ limit: process.env.JSON_LIMIT || "10mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENC_LIMIT || "10mb" }));

/* =========================
   REQUEST SMUGGLING SANITY CHECKS
========================= */
app.use((req, res, next) => {
  if (req.headers["transfer-encoding"] && req.headers["content-length"]) {
    return blockAndRespond(req, res, 400, "Bad request. IP blocked for 1 hour.", "smuggling_headers");
  }
  next();
});

/* =========================
   INPUT SANITIZATION (perf: heavier only on write methods)
========================= */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

app.use(mongoSanitize({ replaceWith: "_" }));

app.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();
  return xss()(req, res, next);
});

app.use((req, res, next) => {
  if (!WRITE_METHODS.has(req.method)) return next();

  const SENSITIVE_KEYS = new Set(["password", "pass", "pwd", "token", "auth", "authorization", "otp", "pin", "secret"]);
  const MAX_DEPTH = Number(process.env.SANITIZE_MAX_DEPTH || 6);
  const MAX_KEYS = Number(process.env.SANITIZE_MAX_KEYS || 2000);

  let seen = 0;
  const stripDanger = (str) => str.replace(/[\$\;\<\>\`\|\"\'\(\)\=]/g, "");

  const sanitize = (obj, depth) => {
    if (!obj || typeof obj !== "object") return;
    if (depth > MAX_DEPTH) return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === "string") obj[i] = stripDanger(obj[i]);
        else sanitize(obj[i], depth + 1);
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      if (++seen > MAX_KEYS) return;
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) continue;

      const val = obj[key];
      if (typeof val === "string") obj[key] = stripDanger(val);
      else sanitize(val, depth + 1);
    }
  };

  sanitize(req.body, 0);
  sanitize(req.query, 0);
  sanitize(req.params, 0);
  next();
});

/* =========================
   BOT GUARD + AUTO BLOCK
========================= */
const BOT_GUARD = process.env.BOT_GUARD === "1";
const BAD_UA_RE = /(curl|wget|python|scrapy|httpclient|go-http-client|libwww|nikto|sqlmap)/i;

app.use((req, res, next) => {
  if (!BOT_GUARD) return next();
  if (req.securityBypass) return next();

  const ua = (req.headers["user-agent"] || "").toString();

  if (!ua || ua.length < 8) {
    return blockAndRespond(req, res, 403, "Blocked (missing UA). IP blocked for 1 hour.", "bot_missing_ua");
  }

  if (BAD_UA_RE.test(ua)) {
    return blockAndRespond(req, res, 403, "Blocked (scanner/bot). IP blocked for 1 hour.", "bot_bad_ua");
  }

  next();
});

/* =========================
   CORS (allowlist)
========================= */
const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (!ALLOWED_ORIGINS.size) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["x-access-token", "x-request-id"],
  maxAge: 86400,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

/* =========================
   COMPRESSION
========================= */
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const type = res.getHeader("Content-Type");
      if (!type) return compression.filter(req, res);
      if (String(type).includes("image/") || String(type).includes("video/")) return false;
      return compression.filter(req, res);
    }
  })
);

app.set("view engine", "ejs");

/* =========================
   RATE LIMIT + SLOW DOWN + AUTO BLOCK
========================= */
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_WINDOW_MS || 60_000),
  limit: Number(process.env.RATE_LIMIT || 180),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.securityBypass,
  handler: (req, res, next, options) => {
    return blockAndRespond(
      req,
      res,
      options.statusCode || 429,
      "Too many requests. IP blocked for 1 hour.",
      "rate_limit"
    );
  }
});

const speedLimiter = slowDown({
  windowMs: Number(process.env.SLOW_WINDOW_MS || 60_000),
  delayAfter: Number(process.env.SLOW_AFTER || 80),
  delayMs: (hits) => Math.min(1000, (hits - Number(process.env.SLOW_AFTER || 80)) * 50),
  validate: { delayMs: false },
  skip: (req) => req.securityBypass
});

app.use("/v1", speedLimiter, limiter);

/* =========================
   HEALTH
========================= */
app.get("/healthz", (req, res) => res.status(200).send("OK"));

/* =========================
   ROUTES
========================= */
const UserRoutes = require("./Routes/User/User.route");
const BetRoutes = require("./Routes/Sports/Bet.route");
const DiamondCasinoRoutes = require("./Routes/Casino/DiamondCasino.route");
const DecisionRoutes = require("./Routes/Sports/Decision.route");
const WebsiteRoutes = require("./Routes/Sports/Website.route");
const ReportsRoutes = require("./Routes/Reports.route");
const bsfReports = require("./Routes/bsfReports.route");
const bluexchReports = require("./Routes/bluexchReports.route");
const qtechRoutes = require("./Routes/Casino/qtechCasino.route");
const matkaRoutes = require("./Routes/Matka/Matka.route");
const crick365Routes = require("./Routes/crick365.route");
const damanRoutes = require("./Routes/daman.route");
const bpexchRoutes = require("./Routes/bpexch.route");
const halkabhariRoutes = require("./Routes/halkaBhari.route");
const dashboardRoutes = require("./Routes/dasboard.route");
const diamondRoutes = require("./Routes/diamond.route");
const paymentRoutes = require("./Routes/User/Payment.route");

app.use("/v1/user", UserRoutes);
app.use("/v1/sports", BetRoutes);
app.use("/v1/casino", DiamondCasinoRoutes);
app.use("/v1/decision", DecisionRoutes);
app.use("/v1/website", WebsiteRoutes);
app.use("/v1/reports", ReportsRoutes);
app.use("/v1/bsfReports", bsfReports);
app.use("/v1/bluexchReports", bluexchReports);
app.use("/v1/qtech", qtechRoutes);
app.use("/v1/matka", matkaRoutes);
app.use("/v1/daman", damanRoutes);
app.use("/v1/crick365", crick365Routes);
app.use("/v1/bpexch", bpexchRoutes);
app.use("/v1/halkabhari", halkabhariRoutes);
app.use("/v1/dashboard", dashboardRoutes);
app.use("/v1/diamond", diamondRoutes);
app.use("/v1/payment", paymentRoutes);

/* =========================
   ERROR HANDLER
========================= */
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[${req.id}]`, err);

  res.status(status).json({
    error: {
      message: isProd ? "Internal Server Error" : (err.message || "Internal Server Error"),
      status,
      requestId: req.id
    }
  });
});

/* =========================
   404 handler
========================= */
app.use((req, res) => {
  res.status(404).json({
    error: { message: "Route not found", status: 404, requestId: req.id }
  });
});

/* =========================
   SERVER TIMEOUTS
========================= */
server.timeout = Number(process.env.SERVER_TIMEOUT || 120000);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT || 65000);
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT || 60000);
server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT || 61000);

/* =========================
   START (await DB first)
========================= */
const PORT = process.env.PORT || 5001;

(async () => {
  try {
    await db.initialize();
    initializeSocket(server);

    server.listen(PORT, (error) => {
      if (!error) {
        console.log(`Server is running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
      } else {
        console.error("Failed to start server:", error);
        process.exit(1);
      }
    });
  } catch (e) {
    console.error("Startup failed:", e);
    process.exit(1);
  }
})();
