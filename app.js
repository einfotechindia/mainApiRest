require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const helmet = require("helmet");
const compression = require('compression');
const hpp = require('hpp');
const mongoSanitize = require('express-mongo-sanitize');
const app = express();
const server = http.createServer(app);
const db = require("./Models/Connection");
const { initializeSocket } = require("./socket");
const { securityGuard } = require("./Middlewares/securityGuard");
const decruptPayload = require("./Middlewares/decruptPayload");

const isProd = process.env.NODE_ENV === 'production';
const healthRoutes = require('./DDOS/healthCheck');


app.set('trust proxy', 1);

app.use((req, res, next) => {
  const rid = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = rid;
  res.setHeader('x-request-id', rid);
  next();
});

app.use((req, res, next) => {
  if (req.method === 'TRACE' || req.method === 'TRACK') {
    return res.status(405).json({
      error: { message: 'Method not allowed', status: 405, requestId: req.id }
    });
  }
  next();
});

app.use((req, res, next) => {
  if (req.headers['transfer-encoding'] && req.headers['content-length']) {
    return res.status(400).json({
      error: { message: 'Bad request', status: 400, requestId: req.id }
    });
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "wss:", "ws:"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    }
  },
  // Prevent iframe embedding (anti-clickjacking)
  frameguard: { action: 'deny' },
  // Prevent MIME sniffing
  noSniff: true,
  // XSS filter
  xssFilter: true,
  // Hide X-Powered-By
  hidePoweredBy: true,
  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(hpp());
app.use(mongoSanitize());


const corsDomains = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(d => d.trim()) : [];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (corsDomains.length === 0) return callback(null, true);
    const allowed = corsDomains.some(domain => {
      return origin === `https://${domain}` ||
             origin === `http://${domain}` ||
             origin.endsWith(`.${domain}`);
    });
    if (allowed) return callback(null, true);
    callback(null, false);
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["x-access-token"],
  maxAge: 86400,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(compression());
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d',
  etag: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(decruptPayload);

// [Feature 4] Smart Sanitization — sensitive fields (password, token, otp) skip
const SENSITIVE_KEYS = new Set(['password', 'pass', 'pwd', 'token', 'auth', 'authorization', 'otp', 'pin', 'secret', 'newPassword', 'oldPassword', 'confirmPassword']);
app.use((req, res, next) => {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
      const val = obj[key];
      if (typeof val === 'string') {
        obj[key] = val.replace(/[\$\;\<\>\`\|\"\'\(\)]/g, '');
      } else if (typeof val === 'object') {
        sanitize(val);
      }
    }
  };
  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
});
app.use(healthRoutes);

// ==========================================
// LAYER 5: Security Guard (SQL injection, XSS, command injection)
// ==========================================
app.use(securityGuard);

// Routes Start
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
const userReportRoutes = require("./Routes/UserReport.route");
const paymentAccountRoutes = require("./Routes/PaymentAccount.route");
const btocReportsRoutes = require("./Routes/BtoCReports.route");
const intCasinoRoutes = require("./Routes/IntCasino.route");
const inplayCasinoRoutes = require("./Routes/InplayCasino.route");
const matchesHistoryRoutes = require("./Routes/MatchesHistory.route");
const staffRoutes = require("./Routes/Staff/Staff.route");
const subAgentRoutes = require("./Routes/SubAgent/SubAgent.route");
const cloudflareRoutes = require("./Routes/Cloudflare/Cloudflare.route");
const operatingRoutes = require("./Routes/Operating.route");
const centerPanelRoutes = require("./Routes/CenterPanel/CenterPanel.route");
const radheRoutes = require("./Routes/radhe.route");
const fancyManagerRoutes = require("./Routes/FancyManager/FancyManager.route");
const bethubRoutes = require("./Routes/bethub.route");
const cronRoutes = require("./Routes/cron.route");

app.use("/v1/user", UserRoutes);
app.use("/v1/sports", BetRoutes);
app.use("/v1/casino", DiamondCasinoRoutes);
app.use("/v1/decision", DecisionRoutes);
app.use("/v1/website", WebsiteRoutes);
app.use("/v1/reports", ReportsRoutes);
app.use("/v1/qtech", qtechRoutes);
app.use("/v1/matka", matkaRoutes);
app.use("/v1/dashboard", dashboardRoutes);
app.use("/v1/payment", paymentRoutes);
app.use("/v1/userReport", userReportRoutes);
app.use("/v1/paymentAccount", paymentAccountRoutes);
app.use("/v1/btocReports", btocReportsRoutes);
app.use("/v1/intCasino", intCasinoRoutes);
app.use("/v1/inplayCasino", inplayCasinoRoutes);
app.use("/v1/matchesHistory", matchesHistoryRoutes);
app.use("/v1/staff", staffRoutes);
app.use("/v1/subagent", subAgentRoutes);
app.use("/v1/cloudflare", cloudflareRoutes);
app.use("/v1/operating", operatingRoutes);
app.use("/v1/cp", centerPanelRoutes);
app.use("/v1/fancyManager", fancyManagerRoutes);
// website According Routes
app.use("/v1/bluexchReports", bluexchReports);
app.use("/v1/bsfReports", bsfReports);
app.use("/v1/daman", damanRoutes);
app.use("/v1/crick365", crick365Routes);
app.use("/v1/bpexch", bpexchRoutes);
app.use("/v1/halkabhari", halkabhariRoutes);
app.use("/v1/diamond", diamondRoutes);
app.use("/v1/radhe", radheRoutes);
app.use("/v1/bethub", bethubRoutes);

// cronRoute
app.use("/v2/cron", cronRoutes);



// [Feature 7] Error handler — production me real error message hide
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[${req.id || 'no-id'}]`, err.stack);
  res.status(status).json({
    error: {
      message: isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
      status,
      requestId: req.id
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      requestId: req.id
    }
  });
});


// Timeouts — Slowloris protection
server.timeout = 30000;           // 30s default — normal APIs
server.keepAliveTimeout = 15000;  // 15s — idle connection close
server.headersTimeout = 20000;    // 20s — headers receive deadline
const PORT = process.env.PORT || 5001;

// [Feature 6] DB await before start — pehle DB connect ho, phir server start
(async () => {
  try {
    await db.initialize();
    initializeSocket(server);

    server.listen(PORT, (error) => {
      if (!error) {
        console.log(`Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      } else {
        console.error('Failed to start server:', error);
        process.exit(1);
      }
    });
  } catch (e) {
    console.error('Startup failed — DB connection error:', e);
    process.exit(1);
  }
})();

// ============================================================
// GRACEFUL SHUTDOWN — clean close on restart/deploy
// ============================================================
const mongoose = require("mongoose");
const { quitAll } = require("./Helpers/RedisHelper");

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed.");
  });

  // 2. Close MongoDB
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  } catch (err) {
    console.error("MongoDB close error:", err.message);
  }

  // 3. Close Redis
  try {
    await quitAll();
    console.log("Redis connections closed.");
  } catch (err) {
    console.error("Redis close error:", err.message);
  }

  console.log("Shutdown complete.");
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

