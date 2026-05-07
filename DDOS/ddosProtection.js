/**
 * DDoS Protection Middleware
 *
 * Behavioral analysis + IP scoring + fingerprinting + auto-blocking.
 * Blocks sophisticated L7 DDoS attacks that bypass Cloudflare using proxy IPs.
 *
 * Features:
 * - IP threat scoring (0-100)
 * - Request burst detection
 * - Browser fingerprint validation
 * - Progressive penalties (warn → throttle → block)
 * - Auto-writes blocked IPs to nginx config for server-level blocking
 * - Memory-safe with auto-cleanup and size limits
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getClientIP: getCfClientIP } = require('./cloudflareIPResolver');
const { logBlockedIP } = require('./blockedIPLogger');

// --- Configuration ---
const CONFIG = {
  enabled: process.env.DDOS_ENABLED !== 'false',
  maxScore: Number(process.env.DDOS_MAX_SCORE || 100),
  blockThreshold: Number(process.env.DDOS_BLOCK_THRESHOLD || 50),
  warnThreshold: Number(process.env.DDOS_WARN_THRESHOLD || 30),

  // Burst detection
  burstLimit: Number(process.env.DDOS_BURST_LIMIT || 20),
  burstWindowMs: Number(process.env.DDOS_BURST_WINDOW_MS || 10000), // 10 seconds

  // Blocking
  blockDurationMs: Number(process.env.DDOS_BLOCK_DURATION_MS || 3600000), // 1 hour
  extendedBlockMs: Number(process.env.DDOS_EXTENDED_BLOCK_MS || 86400000), // 24 hours for repeat offenders

  // Limits
  maxTrackedIPs: Number(process.env.MAX_BLOCKED_IPS || 200000),
  cleanupIntervalMs: 60000, // clean every 60 seconds

  // Nginx integration
  nginxBlockFile: process.env.DDOS_NGINX_BLOCK_FILE || path.join(__dirname, '..', 'errorLog', 'nginx-blocked-ips.conf'),
  blockedIpsJsonFile: path.join(__dirname, '..', 'errorLog', 'blocked-ips.json'),

  // Score penalties (tuned for 20k live users — betting platform)
  // Real user ka max score: ~10-15 hona chahiye (kabhi block na ho)
  // Bot/attacker ka score: 60+ jaldi pahuchna chahiye
  penalties: {
    noUserAgent: 30,        // Real browser HAMESHA user-agent bhejta hai — bina UA = pakka bot
    suspiciousUserAgent: 20, // python-requests, curl, etc = bot tool
    noAcceptHeader: 5,       // Kuch mobile apps nahi bhejte — kam penalty
    burstDetected: 15,       // Betting user fast click karta hai — moderate penalty
    repeatedBlocks: 30,      // Baar baar block = pakka attacker
    invalidContentType: 5,   // POST bina content-type — kuch apps miss karte hain
    tooManyHeaders: 8,       // Bot toolkit extra headers bhejte hain
    emptyBody: 3,            // Chota penalty — false positive bach sake
    rapidEndpointSwitch: 12, // 5 sec me 8+ different endpoints = scanner/bot
    headlessFingerprint: 25, // Headless Chrome/Puppeteer = automation tool = high penalty
  },

  // Score decay — rewards good behavior
  // 5/min = real user ka score 2-3 min me 0 ho jayega agar galti se badha
  decayPerMinute: 5,

  // Suspicious user agents
  suspiciousAgents: [
    /^$/,
    /python-requests/i,
    /python-urllib/i,
    /java\//i,
    /libwww-perl/i,
    /wget/i,
    /curl/i,
    /scrapy/i,
    /httpclient/i,
    /go-http-client/i,
    /node-fetch/i,
    /axios/i,
    /httpie/i,
    /postmanruntime/i,
    /okhttp/i,
    /apache-httpclient/i,
    /aiohttp/i,
    /php/i,
    /ruby/i,
  ],

  // Whitelisted IPs (health checks, monitoring, etc.)
  whitelistedIPs: new Set((process.env.DDOS_WHITELIST_IPS || '127.0.0.1,::1').split(',')),
};

// --- IP Tracker Store ---
// Map<ip, { score, requests[], blockedUntil, blockCount, lastSeen, fingerprints, lastEndpoints[] }>
const ipStore = new Map();

// --- Helper Functions ---

function getClientIP(req) {
  // Use Cloudflare-resolved IP (set by cloudflareIPResolver middleware)
  // This is verified — only trusts cf-connecting-ip if request actually came from Cloudflare
  return getCfClientIP(req);
}

function generateFingerprint(req) {
  const parts = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.headers['accept'] || '',
  ];
  // Simple hash
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

function isHeadlessBrowser(req) {
  const ua = req.headers['user-agent'] || '';
  // Headless browsers often miss these headers or have telltale signs
  if (ua.includes('HeadlessChrome') || ua.includes('PhantomJS') || ua.includes('Puppeteer')) {
    return true;
  }
  // Real browsers always send accept-language
  if (!req.headers['accept-language'] && ua.includes('Mozilla')) {
    return true;
  }
  return false;
}

function getOrCreateEntry(ip) {
  if (!ipStore.has(ip)) {
    // Enforce size limit
    if (ipStore.size >= CONFIG.maxTrackedIPs) {
      // Remove oldest entries
      const entries = [...ipStore.entries()]
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const removeCount = Math.floor(CONFIG.maxTrackedIPs * 0.1); // Remove 10%
      for (let i = 0; i < removeCount; i++) {
        ipStore.delete(entries[i][0]);
      }
    }

    ipStore.set(ip, {
      score: 0,
      requests: [],
      blockedUntil: 0,
      blockCount: 0,
      lastSeen: Date.now(),
      fingerprints: new Set(),
      lastEndpoints: [],
    });
  }
  return ipStore.get(ip);
}

function addPenalty(entry, points, reason) {
  entry.score = Math.min(CONFIG.maxScore, entry.score + points);
  if (!entry.penalties) entry.penalties = [];
  entry.penalties.push({ reason, points, time: Date.now() });
  // Keep only last 20 penalties
  if (entry.penalties.length > 20) entry.penalties = entry.penalties.slice(-20);
}

function applyDecay(entry) {
  const now = Date.now();
  const minutesSinceLastSeen = (now - entry.lastSeen) / 60000;
  if (minutesSinceLastSeen > 1) {
    const decay = Math.floor(minutesSinceLastSeen * CONFIG.decayPerMinute);
    entry.score = Math.max(0, entry.score - decay);
  }
}

function checkBurst(entry) {
  const now = Date.now();
  const windowStart = now - CONFIG.burstWindowMs;
  // Clean old requests
  entry.requests = entry.requests.filter(t => t > windowStart);
  entry.requests.push(now);
  return entry.requests.length > CONFIG.burstLimit;
}

function checkRapidEndpointSwitch(entry, endpoint) {
  const now = Date.now();
  entry.lastEndpoints.push({ endpoint, time: now });
  // Keep last 20
  if (entry.lastEndpoints.length > 20) entry.lastEndpoints = entry.lastEndpoints.slice(-20);

  // Check if hitting many different endpoints rapidly (bot behavior)
  const recentEndpoints = entry.lastEndpoints.filter(e => now - e.time < 5000);
  const uniqueEndpoints = new Set(recentEndpoints.map(e => e.endpoint));
  return uniqueEndpoints.size > 8; // More than 8 different endpoints in 5 seconds
}

// --- Nginx Integration ---

let nginxWriteTimer = null;
const pendingNginxUpdates = new Set();

function scheduleNginxUpdate(ip) {
  pendingNginxUpdates.add(ip);

  if (nginxWriteTimer) return; // Already scheduled

  nginxWriteTimer = setTimeout(() => {
    writeNginxBlockedIPs();
    nginxWriteTimer = null;
  }, 5000); // Batch writes every 5 seconds
}

function writeNginxBlockedIPs() {
  try {
    const now = Date.now();
    const blockedIPs = [];

    for (const [ip, entry] of ipStore) {
      if (entry.blockedUntil > now) {
        blockedIPs.push(ip);
      }
    }

    // Write nginx deny directives
    const logsDir = path.dirname(CONFIG.nginxBlockFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const nginxContent = blockedIPs.map(ip => `deny ${ip};`).join('\n');
    fs.writeFileSync(CONFIG.nginxBlockFile, nginxContent + '\n');

    // Also write JSON for monitoring
    const jsonData = blockedIPs.map(ip => {
      const entry = ipStore.get(ip);
      return {
        ip,
        score: entry?.score || 0,
        blockedUntil: new Date(entry?.blockedUntil || 0).toISOString(),
        blockCount: entry?.blockCount || 0,
        penalties: entry?.penalties || [],
      };
    });
    fs.writeFileSync(CONFIG.blockedIpsJsonFile, JSON.stringify(jsonData, null, 2));

    if (blockedIPs.length > 0) {
      console.log(`[DDOS] Updated nginx block list: ${blockedIPs.length} IPs blocked`);

      // Reload nginx so it picks up the updated block list
      exec('nginx -t && nginx -s reload', (err, stdout, stderr) => {
        if (err) {
          console.error('[DDOS] Failed to reload nginx:', err.message);
        } else {
          console.log(`[DDOS] Nginx reloaded successfully — ${blockedIPs.length} IPs now blocked at server level`);
        }
      });
    }

    pendingNginxUpdates.clear();
  } catch (err) {
    console.error('[DDOS] Failed to write nginx block file:', err.message);
  }
}

// --- Cleanup old entries ---
setInterval(() => {
  const now = Date.now();
  const cutoff = now - CONFIG.extendedBlockMs; // Remove entries older than 24h with no activity

  for (const [ip, entry] of ipStore) {
    // Remove if: score is 0, not blocked, and haven't been seen recently
    if (entry.score === 0 && entry.blockedUntil < now && entry.lastSeen < cutoff) {
      ipStore.delete(ip);
    }
  }
}, CONFIG.cleanupIntervalMs);

// --- Main Middleware ---

function ddosProtection(req, res, next) {
  if (!CONFIG.enabled) return next();

  const ip = getClientIP(req);

  // Whitelisted IPs skip all checks
  if (CONFIG.whitelistedIPs.has(ip)) return next();

  const entry = getOrCreateEntry(ip);
  const now = Date.now();

  // --- Check if currently blocked ---
  if (entry.blockedUntil > now) {
    const remaining = Math.ceil((entry.blockedUntil - now) / 1000);
    return res.status(429).json({
      status: 429,
      code: 1,
      message: `Access temporarily blocked. Try again in ${remaining} seconds.`,
    });
  }

  // Apply score decay for good behavior
  applyDecay(entry);
  entry.lastSeen = now;

  // --- Scoring Checks ---

  // 1. No User-Agent (almost always a bot)
  const ua = req.headers['user-agent'];
  if (!ua || ua.length < 10) {
    addPenalty(entry, CONFIG.penalties.noUserAgent, 'no-user-agent');
  }

  // 2. Suspicious User-Agent
  if (ua) {
    for (const pattern of CONFIG.suspiciousAgents) {
      if (pattern.test(ua)) {
        addPenalty(entry, CONFIG.penalties.suspiciousUserAgent, `suspicious-ua:${ua.substring(0, 50)}`);
        break;
      }
    }
  }

  // 3. Headless browser detection
  if (isHeadlessBrowser(req)) {
    addPenalty(entry, CONFIG.penalties.headlessFingerprint, 'headless-browser');
  }

  // 4. No Accept header (bots often skip this)
  if (!req.headers['accept']) {
    addPenalty(entry, CONFIG.penalties.noAcceptHeader, 'no-accept-header');
  }

  // 5. Burst detection
  if (checkBurst(entry)) {
    addPenalty(entry, CONFIG.penalties.burstDetected, 'request-burst');
  }

  // 6. Rapid endpoint switching
  if (checkRapidEndpointSwitch(entry, req.path)) {
    addPenalty(entry, CONFIG.penalties.rapidEndpointSwitch, 'rapid-endpoint-switch');
  }

  // 7. Fingerprint tracking — detect proxy rotation
  const fingerprint = generateFingerprint(req);
  entry.fingerprints.add(fingerprint);
  // Many different fingerprints from same IP = proxy rotation
  if (entry.fingerprints.size > 10) {
    addPenalty(entry, 15, 'fingerprint-rotation');
    // Reset to prevent unbounded growth
    const recent = [...entry.fingerprints].slice(-5);
    entry.fingerprints = new Set(recent);
  }

  // 8. POST/PUT with no content-type
  if ((req.method === 'POST' || req.method === 'PUT') && !req.headers['content-type']) {
    addPenalty(entry, CONFIG.penalties.invalidContentType, 'missing-content-type');
  }

  // 9. Too many custom headers (bot toolkits sometimes add extra headers)
  const headerCount = Object.keys(req.headers).length;
  if (headerCount > 30) {
    addPenalty(entry, CONFIG.penalties.tooManyHeaders, 'excessive-headers');
  }

  // --- Apply penalties ---

  if (entry.score >= CONFIG.blockThreshold) {
    entry.blockCount++;

    // Progressive blocking: longer blocks for repeat offenders
    if (entry.blockCount >= 5) {
      entry.blockedUntil = now + CONFIG.extendedBlockMs; // 24 hours
    } else if (entry.blockCount >= 3) {
      entry.blockedUntil = now + CONFIG.blockDurationMs * 4; // 4 hours
    } else {
      entry.blockedUntil = now + CONFIG.blockDurationMs; // 1 hour
    }

    console.warn(`[DDOS BLOCKED] IP: ${ip} | Score: ${entry.score} | Block #${entry.blockCount} | Until: ${new Date(entry.blockedUntil).toISOString()}`);

    // Trigger nginx update
    scheduleNginxUpdate(ip);

    // Log to permanent blocked IP history file
    logBlockedIP({
      ip,
      score: entry.score,
      blockCount: entry.blockCount,
      blockedUntil: new Date(entry.blockedUntil).toISOString(),
      reasons: (entry.penalties || []).slice(-5).map(p => p.reason),
      userAgent: req.headers['user-agent'] || '',
      country: req.cfCountry || '',  // Set by cloudflareIPResolver
      path: req.path,
      method: req.method,
    });

    return res.status(429).json({
      status: 429,
      code: 1,
      message: 'Access temporarily blocked due to suspicious activity.',
    });
  }

  if (entry.score >= CONFIG.warnThreshold) {
    // Add a small delay to slow down suspicious clients
    const delay = Math.min(2000, (entry.score - CONFIG.warnThreshold) * 100);
    return setTimeout(() => next(), delay);
  }

  next();
}

// --- Utility functions for external use ---

/**
 * Manually block an IP
 */
function blockIP(ip, durationMs) {
  const entry = getOrCreateEntry(ip);
  entry.score = CONFIG.maxScore;
  entry.blockedUntil = Date.now() + (durationMs || CONFIG.blockDurationMs);
  entry.blockCount++;
  scheduleNginxUpdate(ip);

  // Log to permanent history
  logBlockedIP({
    ip,
    score: entry.score,
    blockCount: entry.blockCount,
    blockedUntil: new Date(entry.blockedUntil).toISOString(),
    reasons: ['manual-block'],
    userAgent: '',
    country: '',
    path: '',
    method: '',
  });

  console.warn(`[DDOS] Manually blocked IP: ${ip} for ${(durationMs || CONFIG.blockDurationMs) / 1000}s`);
}

/**
 * Unblock an IP
 */
function unblockIP(ip) {
  const entry = ipStore.get(ip);
  if (entry) {
    entry.score = 0;
    entry.blockedUntil = 0;
    scheduleNginxUpdate(ip);
    console.log(`[DDOS] Unblocked IP: ${ip}`);
  }
}

/**
 * Get current stats
 */
function getStats() {
  const now = Date.now();
  let blocked = 0;
  let warned = 0;
  let tracked = ipStore.size;

  for (const [, entry] of ipStore) {
    if (entry.blockedUntil > now) blocked++;
    else if (entry.score >= CONFIG.warnThreshold) warned++;
  }

  return { tracked, blocked, warned };
}

/**
 * Get all currently blocked IPs
 */
function getBlockedIPs() {
  const now = Date.now();
  const blocked = [];
  for (const [ip, entry] of ipStore) {
    if (entry.blockedUntil > now) {
      blocked.push({
        ip,
        score: entry.score,
        blockedUntil: new Date(entry.blockedUntil).toISOString(),
        blockCount: entry.blockCount,
      });
    }
  }
  return blocked;
}

module.exports = ddosProtection;
module.exports.blockIP = blockIP;
module.exports.unblockIP = unblockIP;
module.exports.getStats = getStats;
module.exports.getBlockedIPs = getBlockedIPs;
module.exports.getClientIP = getClientIP;
