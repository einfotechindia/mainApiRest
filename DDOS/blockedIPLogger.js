/**
 * Blocked IP Logger
 *
 * Maintains a PERMANENT log of every IP that was ever blocked.
 * Unlike blocked-ips.json (which only shows currently-blocked IPs),
 * this file keeps full history so you can:
 *
 * 1. Review all attacker IPs
 * 2. Copy IPs to Cloudflare WAF block list
 * 3. Analyze attack patterns (country, user-agent, time, reason)
 * 4. Identify repeat offenders
 *
 * Output files:
 *   logs/blocked-ips-history.json  — Full history with details (for analysis)
 *   logs/blocked-ips-list.txt      — Plain IP list, one per line (for Cloudflare import)
 *   logs/cloudflare-block-rules.txt — Ready-to-use Cloudflare WAF expressions
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'errorLog');
const HISTORY_FILE = path.join(LOGS_DIR, 'blocked-ips-history.json');
const PLAIN_LIST_FILE = path.join(LOGS_DIR, 'blocked-ips-list.txt');
const CLOUDFLARE_RULES_FILE = path.join(LOGS_DIR, 'cloudflare-block-rules.txt');

// In-memory set to avoid duplicate writes for same IP
const loggedIPs = new Set();

// Max IPs to keep in history file (prevent file from growing forever)
const MAX_HISTORY_ENTRIES = Number(process.env.MAX_BLOCKED_IP_HISTORY || 50000);

// --- Initialize ---
function init() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  // Load existing IPs into memory to track duplicates
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach(entry => loggedIPs.add(entry.ip));
      }
    }
  } catch (err) {
    // File corrupt or missing — start fresh
    console.warn('[BLOCKED-IP-LOG] Could not load history file, starting fresh');
  }
}
init();

// --- Read existing history ---
function readHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) || [];
    }
  } catch (err) {
    // ignore
  }
  return [];
}

// --- Write history to all files ---
function writeFiles(history) {
  try {
    // 1. Full JSON history
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));

    // 2. Plain IP list (one per line, unique, sorted) — for Cloudflare bulk import
    const uniqueIPs = [...new Set(history.map(e => e.ip))].sort();
    fs.writeFileSync(PLAIN_LIST_FILE, uniqueIPs.join('\n') + '\n');

    // 3. Cloudflare WAF rule expressions
    // Cloudflare lets you create a WAF rule with expression like:
    //   (ip.src in {1.2.3.4 5.6.7.8 ...})
    // Max 1000 IPs per rule, so we chunk them
    const chunks = [];
    for (let i = 0; i < uniqueIPs.length; i += 1000) {
      chunks.push(uniqueIPs.slice(i, i + 1000));
    }

    let cfContent = '';
    cfContent += '# ============================================\n';
    cfContent += '# Cloudflare WAF Block Rules\n';
    cfContent += `# Generated: ${new Date().toISOString()}\n`;
    cfContent += `# Total IPs: ${uniqueIPs.length}\n`;
    cfContent += '# ============================================\n';
    cfContent += '#\n';
    cfContent += '# HOW TO USE:\n';
    cfContent += '# 1. Go to Cloudflare Dashboard → Security → WAF → Custom Rules\n';
    cfContent += '# 2. Create a new rule\n';
    cfContent += '# 3. Set action to "Block"\n';
    cfContent += '# 4. In "Expression", paste one of the expressions below\n';
    cfContent += '# 5. Each expression can hold max 1000 IPs\n';
    cfContent += '#\n';
    cfContent += '# ALTERNATIVELY (easier for bulk):\n';
    cfContent += '# 1. Go to Cloudflare → Security → WAF → Tools → IP Access Rules\n';
    cfContent += '# 2. Use the blocked-ips-list.txt file (one IP per line)\n';
    cfContent += '# 3. Add each IP with action "Block"\n';
    cfContent += '#\n';
    cfContent += '# OR use the Cloudflare API:\n';
    cfContent += '# curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/firewall/access_rules/rules" \\\n';
    cfContent += '#   -H "Authorization: Bearer YOUR_API_TOKEN" \\\n';
    cfContent += '#   -H "Content-Type: application/json" \\\n';
    cfContent += '#   --data \'{"mode":"block","configuration":{"target":"ip","value":"1.2.3.4"},"notes":"DDoS attacker"}\'\n';
    cfContent += '# ============================================\n\n';

    chunks.forEach((chunk, idx) => {
      cfContent += `# --- Rule ${idx + 1} (${chunk.length} IPs) ---\n`;
      cfContent += `(ip.src in {${chunk.join(' ')}})\n\n`;
    });

    // Also add top repeat offenders section
    const repeatOffenders = history
      .filter(e => e.totalBlocks >= 3)
      .sort((a, b) => b.totalBlocks - a.totalBlocks)
      .slice(0, 100);

    if (repeatOffenders.length > 0) {
      cfContent += '# ============================================\n';
      cfContent += '# TOP REPEAT OFFENDERS (blocked 3+ times)\n';
      cfContent += '# These should be PERMANENTLY blocked in Cloudflare\n';
      cfContent += '# ============================================\n';
      repeatOffenders.forEach(e => {
        cfContent += `# ${e.ip} — blocked ${e.totalBlocks}x | country: ${e.country || 'unknown'} | last: ${e.lastBlockedAt}\n`;
      });
      cfContent += '\n';
      const offenderIPs = repeatOffenders.map(e => e.ip);
      cfContent += `(ip.src in {${offenderIPs.join(' ')}})\n`;
    }

    fs.writeFileSync(CLOUDFLARE_RULES_FILE, cfContent);

  } catch (err) {
    console.error('[BLOCKED-IP-LOG] Failed to write files:', err.message);
  }
}

/**
 * Log a blocked IP with full details.
 * Call this whenever an IP gets blocked by the DDoS middleware.
 *
 * @param {object} info
 * @param {string} info.ip - The blocked IP
 * @param {number} info.score - Threat score at time of block
 * @param {number} info.blockCount - How many times this IP has been blocked in current session
 * @param {string} info.blockedUntil - ISO string of when block expires
 * @param {string[]} info.reasons - Array of penalty reasons that led to the block
 * @param {string} info.userAgent - User-Agent header
 * @param {string} info.country - Country code from Cloudflare (cf-ipcountry)
 * @param {string} info.path - The request path that triggered the block
 * @param {string} info.method - HTTP method
 */
function logBlockedIP(info) {
  const {
    ip,
    score = 0,
    blockCount = 1,
    blockedUntil = '',
    reasons = [],
    userAgent = '',
    country = '',
    path: reqPath = '',
    method = '',
  } = info;

  if (!ip) return;

  const history = readHistory();
  const isNewIP = !loggedIPs.has(ip);

  // Find existing entry for this IP
  const existingIdx = history.findIndex(e => e.ip === ip);

  if (existingIdx >= 0) {
    // Update existing entry
    const existing = history[existingIdx];
    existing.totalBlocks = (existing.totalBlocks || 1) + 1;
    existing.lastBlockedAt = new Date().toISOString();
    existing.lastScore = score;
    existing.lastBlockedUntil = blockedUntil;
    existing.lastReasons = reasons;
    existing.lastUserAgent = userAgent;
    existing.lastPath = reqPath;
    existing.lastMethod = method;
    if (country && country !== existing.country) {
      existing.country = country;
    }
    // Keep block history (last 10)
    if (!existing.blockHistory) existing.blockHistory = [];
    existing.blockHistory.push({
      time: new Date().toISOString(),
      score,
      reasons,
      userAgent: userAgent.substring(0, 100),
      path: reqPath,
    });
    if (existing.blockHistory.length > 10) {
      existing.blockHistory = existing.blockHistory.slice(-10);
    }
  } else {
    // New IP — add to history
    history.push({
      ip,
      firstBlockedAt: new Date().toISOString(),
      lastBlockedAt: new Date().toISOString(),
      totalBlocks: blockCount,
      lastScore: score,
      lastBlockedUntil: blockedUntil,
      lastReasons: reasons,
      lastUserAgent: userAgent.substring(0, 200),
      lastPath: reqPath,
      lastMethod: method,
      country: country || 'unknown',
      blockHistory: [{
        time: new Date().toISOString(),
        score,
        reasons,
        userAgent: userAgent.substring(0, 100),
        path: reqPath,
      }],
    });
    loggedIPs.add(ip);
  }

  // Trim history if too large (keep most recent + highest block count)
  if (history.length > MAX_HISTORY_ENTRIES) {
    // Sort: repeat offenders first, then by most recent
    history.sort((a, b) => {
      if (b.totalBlocks !== a.totalBlocks) return b.totalBlocks - a.totalBlocks;
      return new Date(b.lastBlockedAt) - new Date(a.lastBlockedAt);
    });
    history.length = MAX_HISTORY_ENTRIES;
  }

  writeFiles(history);

  if (isNewIP) {
    console.log(`[BLOCKED-IP-LOG] New attacker IP logged: ${ip} | country: ${country || 'unknown'} | score: ${score} | reasons: ${reasons.join(', ')}`);
  }
}

/**
 * Get summary stats from the history
 */
function getBlockedIPStats() {
  const history = readHistory();

  const countryMap = {};
  let totalBlocks = 0;
  let repeatOffenders = 0;

  history.forEach(entry => {
    totalBlocks += entry.totalBlocks || 1;
    if ((entry.totalBlocks || 1) >= 3) repeatOffenders++;
    const c = entry.country || 'unknown';
    countryMap[c] = (countryMap[c] || 0) + 1;
  });

  // Sort countries by count
  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([country, count]) => ({ country, count }));

  return {
    uniqueIPs: history.length,
    totalBlockEvents: totalBlocks,
    repeatOffenders,
    topCountries,
    files: {
      history: HISTORY_FILE,
      plainList: PLAIN_LIST_FILE,
      cloudflareRules: CLOUDFLARE_RULES_FILE,
    },
  };
}

module.exports = {
  logBlockedIP,
  getBlockedIPStats,
  HISTORY_FILE,
  PLAIN_LIST_FILE,
  CLOUDFLARE_RULES_FILE,
};
