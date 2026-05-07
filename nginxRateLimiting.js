/**
 * Nginx Rate Limiting + DDoS Protection Setup Script
 *
 * Supports: Ubuntu, Debian, CentOS, RHEL, Amazon Linux, AlmaLinux, Rocky Linux
 *
 * Usage: node nginxRateLimiting.js
 *
 * Features:
 * 1.  Global rate limit (all requests)
 * 2.  Per-endpoint rate limits (login, balance, etc.)
 * 3.  Connection limit per IP
 * 4.  Request size limit
 * 5.  Burst handling (small bursts allow, sustained block)
 * 6.  Slow request timeout (Slowloris protection)
 * 7.  Auto-ban — limit exceed hone par IP auto block
 * 8.  Blocked IP logging — nginx se blocked IPs ki list
 * 9.  fail2ban integration — repeat offenders ko OS firewall se ban
 * 10. GeoIP country blocking (optional)
 * 11. Bot User-Agent blocking
 * 12. Empty/fake Host header blocking
 */

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// =============================================
// MASTER FLAG
// true  = rate limiting ON (install/update karega)
// false = rate limiting OFF (sab hatake nginx normal mode me laa dega)
// =============================================
const RATE_LIMIT_ENABLED = true;

// =============================================
// CONFIGURATION
// =============================================
const CONFIG = {
  // Nginx config paths
  nginxMainConf: '/etc/nginx/nginx.conf',
  nginxSiteConf: '/etc/nginx/conf.d/urb99.conf',
  apiServerName: 'api.urb99.pro',
  appPort: process.env.PORT || 5003,

  // Blocked IPs log
  blockedLogFile: '/var/log/nginx/blocked-by-ratelimit.log',
  blockedIpsOutput: '/var/log/nginx/ratelimit-blocked-ips.txt',
  blockedIpsFile: path.join(__dirname, 'errorLog', 'nginx-blocked-ips.conf'),

  // =============================================
  // BYPASS IPs — in IPs par rate limit nahi lagega
  // .env se BYPASS_IPS auto read hoga + yahan extra add kar sakte ho
  // =============================================
  bypassIPs: [
    ...(process.env.BYPASS_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean),
    // Extra IPs yahan add karo:
    // '1.2.3.4',
    // '5.6.7.8',
  ],

  // =============================================
  // CONNECTION LIMITS
  // =============================================
  maxConnPerIP: 20,            // 1 IP se max 20 simultaneous connections
  maxConnTotal: 5000,          // total server connections

  // =============================================
  // REQUEST SIZE LIMITS
  // =============================================
  maxBodySize: '2m',           // max request body size
  maxHeaderSize: '8k',         // max header size

  // =============================================
  // TIMEOUT (Slowloris protection)
  // =============================================
  clientHeaderTimeout: 10,     // 10 sec me headers aa jayein warna drop
  clientBodyTimeout: 10,       // 10 sec me body aa jaye warna drop
  keepaliveTimeout: 15,        // 15 sec idle = connection close
  sendTimeout: 10,             // 10 sec me response bhej do

  // =============================================
  // AUTO-BAN SETTINGS
  // =============================================
  enableFail2ban: true,        // fail2ban install + configure
  fail2banMaxRetry: 10,        // 10 baar rate limit hit = ban
  fail2banBanTime: 3600,       // 1 hour ban
  fail2banFindTime: 300,       // 5 min window me check

  // =============================================
  // BOT BLOCKING
  // =============================================
  blockBadBots: true,
  badBotAgents: [
    'python-requests', 'python-urllib', 'curl/', 'wget/',
    'scrapy', 'httpclient', 'go-http-client', 'libwww-perl',
    'nikto', 'sqlmap', 'nmap', 'masscan', 'zgrab',
    'dirbuster', 'gobuster', 'wfuzz', 'ffuf',
    'semrush', 'ahref', 'mj12bot', 'dotbot',
    'apache-httpclient', 'java/', 'okhttp',
  ],

  // =============================================
  // CLOUDFLARE MODE
  // true  = Cloudflare lagaa hai (CF headers trust, SSL Cloudflare pe)
  // false = Direct nginx (no Cloudflare, nginx pe SSL/security sab)
  // =============================================
  cloudflareEnabled: true,

  // =============================================
  // SECURITY FLAGS — jo chahiye true karo, jo nahi chahiye false
  // =============================================
  security: {

    // [1] Hidden files block — .env, .git, .htaccess, .DS_Store
    // Koi /. env hit kare to database password leak ho sakta hai
    blockHiddenFiles: true,

    // [2] SQL injection in URL block
    // /v1/user?id=1' OR 1=1-- type attacks nginx pe hi block
    blockSQLInjection: true,

    // [3] Path traversal block
    // /../../etc/passwd type attacks
    blockPathTraversal: false,

    // [4] Response security headers
    // X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy
    // Cloudflare mode me kuch headers CF bhejta hai, kuch nginx
    addSecurityHeaders: false,

    // [5] Request URI length limit
    // Attacker 10KB URL bhejke crash kare — max 4KB enough hai
    limitURILength: false,
    maxURILength: 4096,          // bytes (4KB)

    // [6] Gzip bomb protection
    // Attacker compressed 1MB body bheje jo decompress me 1GB ban jaye
    blockGzipBomb: false,
    maxDecompressedSize: '10m',  // max decompressed body

    // [7] GeoIP country blocking
    // true = sirf allowedCountries wali countries se request allow, BAAKI SAB BLOCK
    // Requires: geoip module (script auto-install karega)
    blockCountries: false,
    allowedCountries: [
      // Sirf in countries se request allow — baaki duniya block
      // ISO country codes dalo:
      //'IN',  // India
      // 'US',  // United States
      // 'GB',  // United Kingdom
      // 'AE',  // UAE
      // 'SG',  // Singapore
      // 'NP',  // Nepal
      // 'BD',  // Bangladesh
      // 'LK',  // Sri Lanka
      // 'PK',  // Pakistan
    ],

    // [8] SSL/TLS hardening (sirf jab Cloudflare OFF hai)
    // Cloudflare ON hai to ye skip hoga — CF khud SSL handle karta hai
    // Direct nginx pe SSL lagana ho tab true karo
    enableSSL: false,
    sslCertPath: '/etc/letsencrypt/live/yourdomain.com/fullchain.pem',
    sslKeyPath: '/etc/letsencrypt/live/yourdomain.com/privkey.pem',

    // [9] Referrer spam block
    // Fake referrers se aane wali requests block
    blockReferrerSpam: true,
    spamReferrers: [
      'semalt.com', 'buttons-for-website.com', 'darodar.com',
      'cenoval.ru', 'priceg.com', 'hulfingtonpost.com',
      'bestwebsitesawards.com', 'o-o-6-o-o.com', 'kambasoft.com',
    ],

    // [10] Block common attack paths
    // /wp-admin, /phpmyadmin, /admin.php, /.env type paths
    blockAttackPaths: true,

    // [11] HTTP flood headers protection
    // Requests with too many headers or oversized cookies
    blockOversizedHeaders: false,
    maxHeaderCount: 30,          // max headers per request
    maxCookieSize: '4k',         // max cookie size

    // [12] Empty body POST block
    // POST request bina body = mostly attack tool
    blockEmptyPost: false,       // false by default — kuch APIs empty POST use karti hain
  },
};

// =============================================
// ENDPOINT RATE LIMITS
// Yahan koi bhi endpoint add/update/delete karo
// Naya endpoint banana hai? Bas ek line add karo
// Hatana hai? Line delete karo ya enabled: false karo
//
// type options:
//   'exact'  = exact match (location = /v1/user/login)
//   'prefix' = prefix match (location /v1/decision/)
//   'regex'  = regex match (location ~ ^/v1/user/(create|register))
//
// =============================================
// RATE FORMAT — apne hisaab se likho, auto-convert ho jayega:
//
//   '15r/10s'  = 10 sec me 15 request    → nginx: 2r/s + burst:15
//   '10r/5s'   = 5 sec me 10 request     → nginx: 2r/s + burst:10
//   '4r/9s'    = 9 sec me 4 request      → nginx: 1r/s + burst:4
//   '50r/10s'  = 10 sec me 50 request    → nginx: 5r/s + burst:50
//   '3r/30s'   = 30 sec me 3 request     → nginx: 6r/m + burst:3
//   '5r/m'     = 1 min me 5 request      → nginx: 5r/m (as-is)
//   '10r/s'    = 1 sec me 10 request     → nginx: 10r/s (as-is)
//
// nodelay: true  = burst requests TURANT serve (real users ke liye)
// nodelay: false = burst requests SLOW serve (attackers slow hote hain)
// timeout: proxy_read_timeout override in seconds (optional)
// =============================================
const ENDPOINTS = [
  // { name: 'global',    path: null,          type: null,     rate: '50r/10s', nodelay: true,  enabled: true },

  // API fallback — 10 sec me max 40 request per IP
  { name: 'api',       path: '/v1/',        type: 'prefix', rate: '30r/10s', nodelay: true,  enabled: true },

  // Login — 10 sec me max 3 request (brute force protection)
  { name: 'login',     path: '/v1/user/login',  type: 'exact', rate: '5r/10s', nodelay: false, enabled: true },

  // Sensitive — 10 sec me max 2 request
  { name: 'sensitive', path: '^/v1/user/(create|register|forgotPassword|resetPassword|changePassword)', type: 'regex', rate: '5r/10s', nodelay: false, enabled: true },

  // Balance check — 10 sec me max 10 request
  { name: 'balance', path: '/v1/user/userBalance', type: 'exact', rate: '10r/10s', nodelay: true, enabled: true },
  
  // =============================================
  // NAYE ENDPOINTS YAHAN ADD KARO — bas 1 line add karo
  // Apne format me likho: '15r/10s', '10r/5s', '4r/9s' — auto convert
  // =============================================
  // { name: 'matchList', path: '/v1/sports/matchList',    type: 'exact',  rate: '15r/10s', nodelay: true,  enabled: true },
  // { name: 'betPlace',  path: '/v1/sports/oddBetPlaced', type: 'exact',  rate: '3r/10s',  nodelay: false, enabled: true },
  // { name: 'v2api',     path: '/v2/',                    type: 'prefix', rate: '40r/10s', nodelay: true,  enabled: true },
  // { name: 'casino',    path: '/v1/casino/',             type: 'prefix', rate: '15r/10s', nodelay: true,  enabled: true },
  // { name: 'matka',     path: '/v1/matka/',              type: 'prefix', rate: '5r/10s',  nodelay: false, enabled: true },

];

// =============================================
// COLORS & LOGGING
// =============================================
const C = {
  g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m',
  c: '\x1b[36m', w: '\x1b[37m', b: '\x1b[1m', x: '\x1b[0m',
};

const log = (m, c = 'g') => console.log(`${C[c]}${m}${C.x}`);
const logStep = (s, m) => console.log(`\n${C.b}${C.c}[Step ${s}]${C.x} ${m}`);
const logOk = (m) => console.log(`  ${C.g}✓ ${m}${C.x}`);
const logErr = (m) => console.log(`  ${C.r}✗ ${m}${C.x}`);
const logWarn = (m) => console.log(`  ${C.y}⚠ ${m}${C.x}`);

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch { return null; }
}

// Live install with progress — real-time output dikhata hai
function runLive(label, cmd) {
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  let dots = 0;

  // Start spinner
  const interval = setInterval(() => {
    const frame = spinner[i % spinner.length];
    const dotStr = '.'.repeat(dots % 4);
    process.stdout.write(`\r  ${C.y}${frame} ${label}${dotStr.padEnd(4)}${C.x}`);
    i++;
    dots++;
  }, 120);

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000,  // 5 min max
    });

    clearInterval(interval);
    process.stdout.write(`\r  ${C.g}✓ ${label} — done${' '.repeat(20)}${C.x}\n`);
    return output.trim();
  } catch (err) {
    clearInterval(interval);
    // Show ALL error info — stdout, stderr, message
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const errMsg = stderr || stdout || err.message || 'Unknown error';
    process.stdout.write(`\r  ${C.r}✗ ${label} — failed${' '.repeat(20)}${C.x}\n`);
    if (errMsg) {
      // Show error details (max 500 chars)
      console.log(`    ${C.r}Error: ${errMsg.substring(0, 500)}${C.x}`);
    }
    // Show the command so user can run manually
    console.log(`    ${C.y}Manual command: ${cmd.replace(/ 2>&1$/, '')}${C.x}`);
    return null;
  }
}

// =============================================
// Robust server block replacer
// Finds exact server block by server_name, replaces it completely
// Handles nested braces (location blocks inside server block)
// =============================================
function replaceServerBlock(content, serverName, newBlock) {
  const lines = content.split('\n');
  let blockStart = -1;
  let blockEnd = -1;

  // Step 1: Find the line with server_name
  let serverNameLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('server_name ' + serverName)) {
      serverNameLine = i;
      break;
    }
  }

  if (serverNameLine === -1) {
    logErr('server_name ' + serverName + ' not found in config');
    return content;
  }

  // Step 2: Go backwards from server_name to find "server {"
  for (let j = serverNameLine; j >= 0; j--) {
    if (lines[j].match(/^\s*server\s*\{/) || (lines[j].match(/^\s*server\s*$/) && lines[j + 1] && lines[j + 1].includes('{'))) {
      blockStart = j;
      break;
    }
  }

  if (blockStart === -1) {
    logErr('server { not found before server_name');
    return content;
  }

  // Step 3: Count braces from blockStart to find matching closing }
  let braceCount = 0;
  for (let i = blockStart; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    if (braceCount === 0 && i > blockStart) {
      blockEnd = i;
      break;
    }
  }

  if (blockEnd === -1) {
    logErr('Closing } not found for server block');
    return content;
  }

  // Step 4: Replace
  logOk('Found server block: lines ' + (blockStart + 1) + '-' + (blockEnd + 1) + ' (' + (blockEnd - blockStart + 1) + ' lines)');
  lines.splice(blockStart, blockEnd - blockStart + 1, newBlock);
  logOk('Server block replaced with new config');

  return lines.join('\n');
}

// =============================================
// Rate format converter
// '15r/10s' → { nginxRate: '2r/s', burst: 15 }
// '10r/5s'  → { nginxRate: '2r/s', burst: 10 }
// '4r/9s'   → { nginxRate: 1r/s,   burst: 4  }
// '3r/30s'  → { nginxRate: '6r/m', burst: 3  }
// '5r/m'    → { nginxRate: '5r/m', burst: 5  }
// '10r/s'   → { nginxRate: '10r/s', burst: 10 }
// =============================================
function convertRate(rateStr) {
  // Already nginx format: '10r/s' or '5r/m'
  const nativeMatch = rateStr.match(/^(\d+)r\/(s|m)$/);
  if (nativeMatch) {
    return {
      nginxRate: rateStr,
      burst: parseInt(nativeMatch[1]),
      display: rateStr === `${nativeMatch[1]}r/s`
        ? `${nativeMatch[1]} req/sec`
        : `${nativeMatch[1]} req/min`,
    };
  }

  // Custom format: '15r/10s' = 15 requests in 10 seconds
  const customMatch = rateStr.match(/^(\d+)r\/(\d+)s$/);
  if (customMatch) {
    const requests = parseInt(customMatch[1]);
    const seconds = parseInt(customMatch[2]);
    const rps = requests / seconds;

    let nginxRate;
    let display = `${requests} req/${seconds}s`;

    if (rps >= 1) {
      // Use r/s — round up to nearest integer
      nginxRate = `${Math.max(1, Math.round(rps))}r/s`;
    } else {
      // Less than 1 per second — use r/m
      const rpm = Math.max(1, Math.round(rps * 60));
      nginxRate = `${rpm}r/m`;
    }

    return { nginxRate, burst: requests, display };
  }

  // Fallback — return as-is
  return { nginxRate: rateStr, burst: 10, display: rateStr };
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}

// =============================================
// DETECT OS & PACKAGE MANAGER
// =============================================
function detectOS() {
  try {
    if (fs.existsSync('/etc/os-release')) {
      const rel = fs.readFileSync('/etc/os-release', 'utf-8');
      const id = (rel.match(/^ID=["']?(\w+)/m) || [])[1] || '';
      const idLike = (rel.match(/^ID_LIKE=["']?([^"'\n]+)/m) || [])[1] || '';
      const name = (rel.match(/^PRETTY_NAME=["']?([^"'\n]+)/m) || [])[1] || id;

      if (['ubuntu', 'debian'].includes(id) || idLike.includes('debian'))
        return { name, pm: 'apt' };
      if (['centos', 'rhel', 'fedora', 'amzn', 'almalinux', 'rocky'].includes(id) || idLike.includes('rhel'))
        return { name, pm: run('which dnf 2>/dev/null') ? 'dnf' : 'yum' };
    }
  } catch {}
  if (run('which apt 2>/dev/null')) return { name: 'Linux', pm: 'apt' };
  if (run('which yum 2>/dev/null')) return { name: 'Linux', pm: 'yum' };
  return { name: 'Linux', pm: null };
}

// =============================================
// Step 1: Check prerequisites
// =============================================
function checkPrereqs() {
  logStep(1, 'Checking prerequisites...');

  // Root check
  if (run('whoami') !== 'root') {
    logErr('Root user se chalao: sudo node nginxRateLimiting.js');
    process.exit(1);
  }
  logOk('Running as root');

  // Nginx check
  const nginxV = run('nginx -v 2>&1');
  if (!nginxV) {
    logErr('Nginx installed nahi hai!');
    process.exit(1);
  }
  logOk(`Nginx: ${nginxV}`);

  // Check required modules
  const nginxModules = run('nginx -V 2>&1') || '';
  const requiredModules = ['http_limit_req', 'http_limit_conn'];
  requiredModules.forEach(mod => {
    if (nginxModules.includes(mod)) {
      logOk(`Module: ${mod} available`);
    } else {
      logWarn(`Module: ${mod} not found — may be built-in`);
    }
  });

  // OS detect
  const osInfo = detectOS();
  logOk(`OS: ${osInfo.name} (${osInfo.pm})`);

  // GeoIP module install (only if country blocking enabled)
  if (CONFIG.security.blockCountries && CONFIG.security.allowedCountries && CONFIG.security.allowedCountries.length > 0) {
    const hasGeoIP = nginxModules.includes('geoip');
    if (!hasGeoIP) {
      logWarn('GeoIP module not found. Installing...');
      switch (osInfo.pm) {
        case 'apt':
          runLive('Installing GeoIP module + database', 'apt install -y libnginx-mod-http-geoip geoip-database 2>&1');
          break;
        case 'yum':
        case 'dnf':
          runLive('Installing GeoIP module + database', `${osInfo.pm} install -y nginx-mod-http-geoip GeoIP GeoIP-data 2>&1`);
          break;
      }
      logOk('GeoIP module installed');
    } else {
      logOk('GeoIP module available');
    }
  }

  // Security flags summary
  const sec = CONFIG.security;
  logOk(`Cloudflare: ${CONFIG.cloudflareEnabled ? 'ON' : 'OFF'}`);
  logOk(`Security flags: hidden=${sec.blockHiddenFiles} sql=${sec.blockSQLInjection} traversal=${sec.blockPathTraversal} headers=${sec.addSecurityHeaders} geo=${sec.blockCountries} ssl=${sec.enableSSL}`);

  return osInfo;
}

// =============================================
// Step 2: Ask custom endpoint rate limits
// =============================================
async function askCustomEndpoints() {
  logStep(2, 'Custom endpoint rate limits...');

  console.log('');
  log('  Default rate limits:', 'y');
  ENDPOINTS.filter(ep => ep.enabled).forEach(ep => {
    log(`    ${ep.name.padEnd(12)} ${ep.rate.padEnd(10)} → ${ep.path || 'all requests'}`, 'w');
  });
  console.log('');

  const addMore = await ask(`${C.c}  Koi aur endpoint ka rate limit set karna hai? (y/n): ${C.x}`);
  if (addMore.toLowerCase() !== 'y') return;

  while (true) {
    console.log('');
    const ep = await ask(`${C.c}  Endpoint path (e.g. /v1/sports/matchList) ya 'done': ${C.x}`);
    if (ep === 'done' || !ep) break;

    const rate = await ask(`${C.c}  Rate limit (e.g. 10r/m ya 5r/s): ${C.x}`);
    if (!rate) continue;

    const burst = await ask(`${C.c}  Burst allow (e.g. 5): ${C.x}`);

    const name = 'custom_' + ep.replace(/[^a-zA-Z0-9]/g, '_');
    const isRegex = ep.includes('(') || ep.includes('|');
    const isExact = !ep.endsWith('/') && !isRegex;

    ENDPOINTS.push({
      name,
      path: ep,
      type: isRegex ? 'regex' : (isExact ? 'exact' : 'prefix'),
      rate: rate,
      burst: Number(burst) || 5,
      nodelay: true,
      enabled: true,
    });
    logOk(`Added: ${ep} → ${rate} (burst: ${burst || 5})`);
  }
}

// =============================================
// Step 3: Generate rate limit config for nginx.conf (http block)
// =============================================
function generateRateLimitZones() {
  logStep(3, 'Generating rate limit zones for nginx.conf...');

  if (!fs.existsSync(CONFIG.nginxMainConf)) {
    logErr(`${CONFIG.nginxMainConf} not found!`);
    process.exit(1);
  }

  // Backup
  const backup = `${CONFIG.nginxMainConf}.ratelimit-backup.${Date.now()}`;
  fs.copyFileSync(CONFIG.nginxMainConf, backup);
  logOk(`Backup: ${backup}`);

  let content = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');

  // ALWAYS remove old config first — safe re-run
  if (content.includes('# Rate Limit Zones - Auto configured')) {
    logOk('Old rate limit config found — removing for fresh write...');
    content = content.replace(/\n\s*# Rate Limit Zones - Auto configured[\s\S]*?# End Rate Limit Zones\s*\n/m, '\n');
  }
  // Also clean stale individual directives that might be leftover
  content = content.replace(/^\s*limit_req_zone\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*limit_conn_zone\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*limit_req_status\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*limit_conn_status\s+.*;\s*$/gm, '');
  // Clean old geo/map blocks for bypass IPs
  content = content.replace(/^\s*geo\s+\$rate_limit_bypass\s*\{[\s\S]*?\}\s*$/gm, '');
  content = content.replace(/^\s*map\s+\$rate_limit_bypass\s+\$limit_key\s*\{[\s\S]*?\}\s*$/gm, '');
  content = content.replace(/^\s*limit_req_log_level\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*limit_conn_log_level\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*log_format\s+blocked\s+.*;\s*$/gm, '');
  content = content.replace(/^\s*map\s+\$http_user_agent\s+\$bad_bot[\s\S]*?\}\s*$/gm, '');
  content = content.replace(/\n{3,}/g, '\n\n');
  logOk('Old config cleaned');

  // Generate zone definitions from ENDPOINTS array
  const activeEndpoints = ENDPOINTS.filter(ep => ep.enabled);
  const zones = [
    `    # Rate Limit Zones - Auto configured by nginxRateLimiting.js`,
    `    # Generated: ${new Date().toISOString()}`,
    `    # Endpoints: ${activeEndpoints.length} active`,
    `    # Bypass IPs: ${CONFIG.bypassIPs.length}`,
    ``,
  ];

  // Bypass IPs — geo module se rate limit skip
  if (CONFIG.bypassIPs.length > 0) {
    zones.push(`    # Bypass IPs — rate limit skip (from .env BYPASS_IPS)`);
    zones.push(`    geo $rate_limit_bypass {`);
    zones.push(`        default 0;`);
    CONFIG.bypassIPs.forEach(ip => {
      if (ip) zones.push(`        ${ip} 1;`);
    });
    zones.push(`    }`);
    zones.push(``);
    zones.push(`    # Agar bypass IP hai to empty string = rate limit zone skip`);
    zones.push(`    map $rate_limit_bypass $limit_key {`);
    zones.push(`        0 $binary_remote_addr;`);
    zones.push(`        1 "";`);
    zones.push(`    }`);
    zones.push(``);
    logOk(`Bypass IPs: ${CONFIG.bypassIPs.join(', ')}`);
  }

  // Rate limit zones — use $limit_key instead of $binary_remote_addr
  const zoneVar = CONFIG.bypassIPs.length > 0 ? '$limit_key' : '$binary_remote_addr';
  zones.push(`    # Rate limit zones (shared memory)`);

  activeEndpoints.forEach(ep => {
    const memSize = ep.name === 'global' || ep.name === 'api' ? '20m' : '10m';
    const converted = convertRate(ep.rate);
    ep._nginxRate = converted.nginxRate;   // store for site config
    ep._burst = converted.burst;
    ep._display = converted.display;
    zones.push(`    limit_req_zone ${zoneVar} zone=${ep.name}:${memSize} rate=${converted.nginxRate};  # ${converted.display} → ${ep.path || 'all requests'}`);
    logOk(`${ep.name}: ${ep.rate} → nginx: ${converted.nginxRate} burst:${converted.burst} (${converted.display})`);
  });

  zones.push(``);
  zones.push(`    # Connection limit zone`);
  zones.push(`    limit_conn_zone $binary_remote_addr zone=conn_per_ip:20m;`);
  zones.push(`    limit_conn_zone $server_name zone=conn_total:10m;`);
  zones.push(``);
  zones.push(`    # Rate limit response — 429 Too Many Requests`);
  zones.push(`    limit_req_status 429;`);
  zones.push(`    limit_conn_status 429;`);
  zones.push(``);
  zones.push(`    # Rate limit log — blocked requests log hongi`);
  zones.push(`    limit_req_log_level warn;`);
  zones.push(`    limit_conn_log_level warn;`);
  zones.push(``);
  zones.push(`    # Request size limits`);
  zones.push(`    client_max_body_size ${CONFIG.maxBodySize};`);
  zones.push(`    large_client_header_buffers 4 ${CONFIG.maxHeaderSize};`);
  zones.push(``);
  zones.push(`    # Timeout protection (Slowloris)`);
  zones.push(`    client_header_timeout ${CONFIG.clientHeaderTimeout}s;`);
  zones.push(`    client_body_timeout ${CONFIG.clientBodyTimeout}s;`);
  zones.push(`    keepalive_timeout ${CONFIG.keepaliveTimeout}s;`);
  zones.push(`    send_timeout ${CONFIG.sendTimeout}s;`);
  zones.push(``);

  // Bot blocking map
  if (CONFIG.blockBadBots) {
    zones.push(`    # Bad Bot blocking`);
    zones.push(`    map $http_user_agent $bad_bot {`);
    zones.push(`        default 0;`);
    CONFIG.badBotAgents.forEach(bot => {
      zones.push(`        "~*${bot}" 1;`);
    });
    zones.push(`        "" 1;`);  // Empty UA = bot
    zones.push(`    }`);
    zones.push(``);
  }

  // Custom log format for blocked requests
  zones.push(`    # Blocked requests log format`);
  zones.push(`    log_format blocked '$remote_addr - [$time_local] "$request" $status '`);
  zones.push(`                       '"$http_user_agent" "$http_referer" "$http_origin"';`);
  zones.push(``);
  // Add security zones (geoip, referrer map, gzip settings)
  const secZones = generateSecurityZones();
  if (secZones) {
    zones.push(secZones);
  }

  zones.push(`    # End Rate Limit Zones`);

  const zoneConfig = zones.join('\n');

  // Add after http { block
  if (content.includes('http {')) {
    content = content.replace(/(http\s*\{)/, `$1\n${zoneConfig}`);
  } else {
    logErr('http { block nahi mila!');
    process.exit(1);
  }

  fs.writeFileSync(CONFIG.nginxMainConf, content);
  logOk('Rate limit zones added to nginx.conf');
  logOk(`Global: ${CONFIG.globalRate} | API: ${CONFIG.apiRate} | Login: ${CONFIG.loginRate}`);
  logOk(`Connection limit: ${CONFIG.maxConnPerIP}/IP | Body: ${CONFIG.maxBodySize}`);
}

// =============================================
// Step 3.5: Generate security blocks for server config
// =============================================
function generateSecurityBlocks() {
  const sec = CONFIG.security;
  const lines = [];

  // [1] Hidden files block
  if (sec.blockHiddenFiles) {
    lines.push(`
        # [Security] Block hidden files (.env, .git, .htaccess, .DS_Store)
        location ~ /\\. {
            access_log ${CONFIG.blockedLogFile} blocked;
            return 444;
        }`);
  }

  // [2] SQL injection in URL
  if (sec.blockSQLInjection) {
    lines.push(`
        # [Security] Block SQL injection in URL
        if ($query_string ~* "(union|select|insert|update|delete|drop|alter|create|exec|execute|xp_|sp_|0x|char\\(|concat|information_schema|sysobjects|syscolumns|--|;|'|\\*\\/)" ) {
            return 444;
        }
        if ($request_uri ~* "(union|select\\(|insert\\(|drop\\s|alter\\s|delete\\s|update\\s|exec\\(|execute\\(|xp_|0x[0-9a-f])" ) {
            return 444;
        }`);
  }

  // [3] Path traversal block
  if (sec.blockPathTraversal) {
    lines.push(`
        # [Security] Block path traversal (../../etc/passwd)
        if ($request_uri ~* "(\\.\\.[\\/]|\\.\\.%2[fF]|%2[eE]%2[eE][\\/]|etc\\/passwd|etc\\/shadow|proc\\/self)" ) {
            return 444;
        }`);
  }

  // [4] Security response headers
  if (sec.addSecurityHeaders) {
    if (CONFIG.cloudflareEnabled) {
      // Cloudflare mode — CF already sends some headers, add missing ones
      lines.push(`
        # [Security] Response headers (Cloudflare mode — CF handles HSTS)
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;`);
    } else {
      // Direct nginx — add all security headers including HSTS
      lines.push(`
        # [Security] Response headers (Direct mode — full headers)
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" always;`);
    }
  }

  // [5] URI length limit
  if (sec.limitURILength) {
    lines.push(`
        # [Security] URI length limit (${sec.maxURILength} bytes)
        if ($request_uri ~* "^.{${sec.maxURILength},}$") {
            return 414;
        }`);
  }

  // [9] Referrer spam block
  if (sec.blockReferrerSpam && sec.spamReferrers.length > 0) {
    const spamRegex = sec.spamReferrers.map(r => r.replace(/\./g, '\\.')).join('|');
    lines.push(`
        # [Security] Block referrer spam
        if ($http_referer ~* "(${spamRegex})") {
            return 444;
        }`);
  }

  // [10] Block common attack paths
  if (sec.blockAttackPaths) {
    lines.push(`
        # [Security] Block common attack paths
        location ~* ^/(wp-admin|wp-login|wp-content|wp-includes|wordpress|phpmyadmin|pma|myadmin|admin\\.php|xmlrpc\\.php|cgi-bin|shell|eval-stdin|vendor|telescope|debug|console|actuator|manager|solr|struts|jmx-console) {
            access_log ${CONFIG.blockedLogFile} blocked;
            return 444;
        }`);
  }

  // [11] Oversized headers/cookies
  if (sec.blockOversizedHeaders) {
    lines.push(`
        # [Security] Block oversized cookies
        if ($http_cookie ~* "^.{${parseInt(sec.maxCookieSize) * 1024 || 4096},}$") {
            return 400;
        }`);
  }

  // [12] Empty POST block
  if (sec.blockEmptyPost) {
    lines.push(`
        # [Security] Block empty POST requests
        if ($request_method = POST) {
            set $empty_post "";
        }
        if ($content_length = 0) {
            set $empty_post "${'\x24'}{empty_post}empty";
        }
        if ($empty_post = "empty") {
            return 444;
        }`);
  }

  return lines.join('\n');
}

// Generate nginx.conf level security (zones, maps, gzip settings)
function generateSecurityZones() {
  const sec = CONFIG.security;
  const lines = [];

  // [6] Gzip bomb protection
  if (sec.blockGzipBomb) {
    lines.push(`    # [Security] Gzip bomb protection`);
    lines.push(`    client_body_buffer_size 16k;`);
    lines.push(`    client_body_in_single_buffer on;`);
    lines.push(``);
  }

  // [7] GeoIP country blocking — ALLOW mode (sirf allowed countries, baaki block)
  if (sec.blockCountries && sec.allowedCountries && sec.allowedCountries.length > 0) {
    lines.push(`    # [Security] GeoIP — sirf allowed countries, baaki sab BLOCK`);
    lines.push(`    geoip_country /usr/share/GeoIP/GeoIP.dat;`);
    lines.push(`    map $geoip_country_code $blocked_country {`);
    lines.push(`        default 1;`);  // default = BLOCK
    sec.allowedCountries.forEach(cc => {
      lines.push(`        ${cc} 0;`);  // allowed country = allow
    });
    lines.push(`        "" 0;`);       // empty = local/internal request = allow
    lines.push(`    }`);
    lines.push(``);
  }

  // [9] Referrer spam map (for efficiency — map is faster than if)
  if (sec.blockReferrerSpam && sec.spamReferrers.length > 0) {
    lines.push(`    # [Security] Referrer spam map`);
    lines.push(`    map $http_referer $bad_referer {`);
    lines.push(`        default 0;`);
    sec.spamReferrers.forEach(r => {
      lines.push(`        "~*${r.replace(/\./g, '\\.')}" 1;`);
    });
    lines.push(`    }`);
    lines.push(``);
  }

  return lines.join('\n');
}

// =============================================
// Step 4: Update site config with rate limits on locations
// =============================================
function updateSiteConfig() {
  logStep(4, 'Updating site config with rate limits + security...');

  if (!fs.existsSync(CONFIG.nginxSiteConf)) {
    logErr(`${CONFIG.nginxSiteConf} not found!`);
    process.exit(1);
  }

  const backup = `${CONFIG.nginxSiteConf}.ratelimit-backup.${Date.now()}`;
  fs.copyFileSync(CONFIG.nginxSiteConf, backup);
  logOk(`Backup: ${backup}`);

  let content = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');

  // Find the API server block
  const serverNameEscaped = CONFIG.apiServerName.replace(/\./g, '\\.');
  const hasApiBlock = content.includes(`server_name ${CONFIG.apiServerName}`);

  if (!hasApiBlock) {
    logErr(`${CONFIG.apiServerName} server block nahi mila!`);
    logWarn('Pehle serverSetup.js chalao');
    return;
  }

  // Build the new server block dynamically from ENDPOINTS array
  const blockedIpsFile = CONFIG.blockedIpsFile;

  const botBlock = CONFIG.blockBadBots ? `
            if ($bad_bot) {
                return 444;
            }` : '';

  const activeEndpoints = ENDPOINTS.filter(ep => ep.enabled);
  const globalEp = activeEndpoints.find(ep => ep.name === 'global');
  const apiEp = activeEndpoints.find(ep => ep.name === 'api');
  const specificEps = activeEndpoints.filter(ep => ep.name !== 'global' && ep.name !== 'api' && ep.path);

  // Generate location blocks for each specific endpoint
  let locationBlocks = '';
  specificEps.forEach(ep => {
    let locationDirective;
    if (ep.type === 'exact') locationDirective = `location = ${ep.path}`;
    else if (ep.type === 'regex') locationDirective = `location ~ ${ep.path}`;
    else locationDirective = `location ${ep.path}`;

    const timeoutLine = ep.timeout ? `\n            proxy_read_timeout ${ep.timeout}s;` : '';

    const burst = ep._burst || convertRate(ep.rate).burst;
    locationBlocks += `
        # ${ep.name} — ${ep._display || ep.rate} (nginx: ${ep._nginxRate || ep.rate}, burst: ${burst})
        ${locationDirective} {
            limit_req zone=${ep.name} burst=${burst}${ep.nodelay ? ' nodelay' : ''};
            limit_conn conn_per_ip ${CONFIG.maxConnPerIP};
            access_log ${CONFIG.blockedLogFile} blocked;
${botBlock}
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;${timeoutLine}
        }
`;
  });

  // Build API fallback location (catches all /v1/ routes not matched above)
  const apiBurst = apiEp ? (apiEp._burst || convertRate(apiEp.rate).burst) : 30;
  const apiNodelay = apiEp && apiEp.nodelay ? ' nodelay' : '';
  const apiBlock = apiEp ? `
        # api fallback — ${apiEp._display || apiEp.rate}
        location /v1/ {
            limit_req zone=api burst=${apiBurst}${apiNodelay};
            limit_conn conn_per_ip ${CONFIG.maxConnPerIP};
            access_log ${CONFIG.blockedLogFile} blocked;
${botBlock}
            if ($request_method !~ ^(GET|POST|PUT|DELETE|OPTIONS)$) {
                return 444;
            }

            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_connect_timeout 1000;
            proxy_send_timeout 1500;
            proxy_read_timeout 2000;
            proxy_cache_bypass $http_upgrade;
        }` : '';

  const globalBurst = globalEp ? (globalEp._burst || convertRate(globalEp.rate).burst) : 50;
  const globalBlock = globalEp
    ? `limit_req zone=global burst=${globalBurst}${globalEp.nodelay ? ' nodelay' : ''};`
    : '';

  // Generate security blocks
  const securityBlocks = generateSecurityBlocks();
  const sec = CONFIG.security;

  // SSL config (only when Cloudflare OFF and SSL enabled)
  let listenBlock = '        listen      80;';
  let sslBlock = '';
  if (!CONFIG.cloudflareEnabled && sec.enableSSL) {
    listenBlock = `        listen      80;
        listen      443 ssl http2;`;
    sslBlock = `
        # [Security] SSL/TLS hardening (Direct mode — no Cloudflare)
        ssl_certificate ${sec.sslCertPath};
        ssl_certificate_key ${sec.sslKeyPath};
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        ssl_stapling on;
        ssl_stapling_verify on;

        # Redirect HTTP to HTTPS
        if ($scheme = http) {
            return 301 https://$host$request_uri;
        }
`;
  }

  // GeoIP country block
  let geoBlock = '';
  if (sec.blockCountries && sec.allowedCountries && sec.allowedCountries.length > 0) {
    geoBlock = `
        # [Security] GeoIP — only allowed: ${sec.allowedCountries.join(', ')} | baaki sab BLOCK
        if ($blocked_country) {
            return 444;
        }
`;
  }

  const newBlock = `server {
${listenBlock}
        server_name ${CONFIG.apiServerName};
        # Rate Limited + Secured API - Auto configured by nginxRateLimiting.js
        # Generated: ${new Date().toISOString()}
        # Active endpoints: ${activeEndpoints.length}
        # Cloudflare: ${CONFIG.cloudflareEnabled ? 'ON' : 'OFF'}
${sslBlock}
        include ${blockedIpsFile};

        # Global rate limit + connection limit
        ${globalBlock}
        limit_conn conn_per_ip ${CONFIG.maxConnPerIP};
        limit_conn conn_total ${CONFIG.maxConnTotal};

        # Block empty/fake Host header
        if ($host !~* ^${serverNameEscaped}$) {
            return 444;
        }
${geoBlock}
        # ==========================================
        # SECURITY RULES
        # ==========================================
${securityBlocks}
${locationBlocks}
${apiBlock}

        # Health check
        location /health {
            limit_req zone=api burst=5 nodelay;
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Admin endpoints
        location /admin/ {
            limit_req zone=api burst=3;
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # Everything else — drop
        location / {
            return 444;
        }
}`;

  // Replace the API server block — robust method
  content = replaceServerBlock(content, CONFIG.apiServerName, newBlock);
  fs.writeFileSync(CONFIG.nginxSiteConf, content);
  activeEndpoints.forEach(ep => {
    const c = convertRate(ep.rate);
    logOk(`${ep.name}: ${ep.rate} → nginx: ${c.nginxRate} burst:${c.burst} → ${ep.path || 'all'}`);
  });
}

// =============================================
// Step 5: Setup blocked IP extraction script
// =============================================
function setupBlockedIPExtractor() {
  logStep(5, 'Setting up blocked IP extraction...');

  // Create log file
  run(`touch ${CONFIG.blockedLogFile}`);
  run(`chmod 644 ${CONFIG.blockedLogFile}`);
  logOk(`Blocked log: ${CONFIG.blockedLogFile}`);

  // Create IP extraction script — use array join to avoid template literal $ conflicts
  const extractScript = '/usr/local/bin/extract-blocked-ips.sh';
  const scriptLines = [
    '#!/bin/bash',
    '# Extract blocked IPs from nginx rate limit log',
    '# Runs via cron every 5 minutes',
    '# Auto configured by nginxRateLimiting.js',
    '',
    'LOG_FILE="' + CONFIG.blockedLogFile + '"',
    'OUTPUT_FILE="' + CONFIG.blockedIpsOutput + '"',
    'SUMMARY_FILE="/var/log/nginx/ratelimit-summary.txt"',
    '',
    'if [ ! -f "$LOG_FILE" ]; then',
    '    exit 0',
    'fi',
    '',
    '# Extract unique IPs with count, sorted by most blocked',
    "awk '{print $1}' \"$LOG_FILE\" 2>/dev/null | sort | uniq -c | sort -rn > \"$OUTPUT_FILE\"",
    '',
    '# Generate summary',
    'TOTAL_BLOCKS=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)',
    "UNIQUE_IPS=$(awk '{print $1}' \"$LOG_FILE\" 2>/dev/null | sort -u | wc -l || echo 0)",
    "TOP_IP=$(head -1 \"$OUTPUT_FILE\" 2>/dev/null | awk '{print $2}' || echo \"none\")",
    "TOP_COUNT=$(head -1 \"$OUTPUT_FILE\" 2>/dev/null | awk '{print $1}' || echo 0)",
    '',
    'cat > "$SUMMARY_FILE" << SUMMARY',
    '====================================',
    'Nginx Rate Limit Blocked IPs Summary',
    'Generated: $(date)',
    '====================================',
    'Total blocked requests: $TOTAL_BLOCKS',
    'Unique IPs blocked:     $UNIQUE_IPS',
    'Top offender:           $TOP_IP ($TOP_COUNT blocks)',
    '',
    'Top 20 blocked IPs:',
    '$(head -20 "$OUTPUT_FILE")',
    '====================================',
    'SUMMARY',
    '',
    '# Rotate log if too large (>50MB)',
    'LOG_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)',
    'if [ "$LOG_SIZE" -gt 52428800 ]; then',
    '    mv "$LOG_FILE" "$LOG_FILE.old"',
    '    touch "$LOG_FILE"',
    '    chmod 644 "$LOG_FILE"',
    'fi',
  ];
  const scriptContent = scriptLines.join('\n');

  fs.writeFileSync(extractScript, scriptContent);
  run(`chmod +x ${extractScript}`);
  logOk(`IP extraction script: ${extractScript}`);

  // Add cron job — every 5 minutes
  const cronCheck = run('crontab -l 2>/dev/null') || '';
  if (!cronCheck.includes('extract-blocked-ips')) {
    const newCron = cronCheck + `\n*/5 * * * * ${extractScript}\n`;
    fs.writeFileSync('/tmp/nginx-ratelimit-cron', newCron);
    run('crontab /tmp/nginx-ratelimit-cron');
    run('rm /tmp/nginx-ratelimit-cron');
    logOk('Cron job added: every 5 min IP extraction');
  } else {
    logOk('Cron job already exists');
  }

  logOk(`Blocked IPs list: ${CONFIG.blockedIpsOutput}`);
  logOk(`Summary: /var/log/nginx/ratelimit-summary.txt`);
}

// =============================================
// Step 6: Setup fail2ban (auto-ban repeat offenders)
// =============================================
function setupFail2ban(osInfo) {
  logStep(6, 'Setting up fail2ban (auto-ban repeat offenders)...');

  if (!CONFIG.enableFail2ban) {
    logWarn('fail2ban disabled in config — skipping');
    return;
  }

  // Install fail2ban
  const f2bInstalled = run('which fail2ban-client 2>/dev/null');
  if (!f2bInstalled) {
    logWarn('fail2ban not installed. Installing...');
    let installResult = null;
    switch (osInfo.pm) {
      case 'apt':
        runLive('Updating package list', 'apt update -y 2>&1');
        installResult = runLive('Installing fail2ban', 'apt install fail2ban -y 2>&1');
        break;
      case 'yum':
      case 'dnf':
        runLive('Installing epel-release', `${osInfo.pm} install epel-release -y 2>&1`);
        installResult = runLive('Installing fail2ban', `${osInfo.pm} install fail2ban -y 2>&1`);
        break;
    }

    if (!run('which fail2ban-client 2>/dev/null')) {
      logErr('fail2ban install failed — skipping');
      return;
    }
    logOk('fail2ban installed successfully');
  } else {
    logOk('fail2ban already installed');
  }

  // Create nginx rate limit filter
  const filterContent = `# Fail2ban filter for nginx rate limiting
# Auto configured by nginxRateLimiting.js
[Definition]
failregex = ^<HOST> -.*"(GET|POST|PUT|DELETE|OPTIONS).*" 429
            ^.*limiting requests.*client: <HOST>
ignoreregex =
`;

  fs.writeFileSync('/etc/fail2ban/filter.d/nginx-ratelimit.conf', filterContent);
  logOk('Filter created: /etc/fail2ban/filter.d/nginx-ratelimit.conf');

  // Create jail config
  const jailContent = `# Nginx rate limit jail
# Auto configured by nginxRateLimiting.js
[nginx-ratelimit]
enabled  = true
port     = http,https
filter   = nginx-ratelimit
logpath  = ${CONFIG.blockedLogFile}
           /var/log/nginx/error.log
maxretry = ${CONFIG.fail2banMaxRetry}
bantime  = ${CONFIG.fail2banBanTime}
findtime = ${CONFIG.fail2banFindTime}
action   = iptables-multiport[name=nginx-ratelimit, port="http,https", protocol=tcp]
`;

  fs.writeFileSync('/etc/fail2ban/jail.d/nginx-ratelimit.conf', jailContent);
  logOk('Jail created: /etc/fail2ban/jail.d/nginx-ratelimit.conf');
  logOk(`Max retry: ${CONFIG.fail2banMaxRetry} | Ban time: ${CONFIG.fail2banBanTime}s | Window: ${CONFIG.fail2banFindTime}s`);

  // Enable and restart fail2ban
  runLive('Enabling fail2ban service', 'systemctl enable fail2ban 2>&1');
  runLive('Restarting fail2ban', 'systemctl restart fail2ban 2>&1');

  const f2bStatus = run('fail2ban-client status nginx-ratelimit 2>&1');
  if (f2bStatus && f2bStatus.includes('nginx-ratelimit')) {
    logOk('fail2ban jail active');
  } else {
    logWarn('fail2ban jail may not be active yet — check: fail2ban-client status nginx-ratelimit');
  }
}

// =============================================
// Step 7: Test and reload nginx
// =============================================
function testAndReload() {
  logStep(7, 'Testing and reloading nginx...');

  // First try nginx -t with full error capture
  const testResult = run('nginx -t 2>&1');

  if (testResult && testResult.includes('syntax is ok')) {
    logOk('Nginx config test passed');
  } else {
    // Test failed — show full error
    logErr('Nginx config test FAILED!');
    if (testResult) {
      console.log(`    ${C.r}${testResult}${C.x}`);
    } else {
      // Try again to capture stderr
      try {
        execSync('nginx -t', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString().trim() : '';
        const stdout = err.stdout ? err.stdout.toString().trim() : '';
        console.log(`    ${C.r}${stderr || stdout || 'Unknown error'}${C.x}`);
      }
    }
    console.log('');
    logErr('Fix the error above, then manually run:');
    console.log(`    ${C.y}nginx -t${C.x}`);
    console.log(`    ${C.y}nginx -s reload${C.x}`);
    process.exit(1);
  }

  const reloadResult = runLive('Reloading nginx', 'nginx -s reload 2>&1');
  if (reloadResult === null && !run('pgrep nginx 2>/dev/null')) {
    logWarn('Reload issue — trying restart...');
    runLive('Restarting nginx', 'systemctl restart nginx 2>&1');
  }
}

// =============================================
// Step 8: Verify everything
// =============================================
function verify() {
  logStep(8, 'Verifying setup...');

  const mainConf = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');
  const siteConf = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');

  // Check zones
  if (mainConf.includes('limit_req_zone')) logOk('Rate limit zones configured');
  else logErr('Rate limit zones NOT found');

  if (mainConf.includes('limit_conn_zone')) logOk('Connection limit zones configured');
  else logErr('Connection limit zones NOT found');

  if (mainConf.includes('client_header_timeout')) logOk('Timeout protection configured');
  else logErr('Timeout protection NOT found');

  if (mainConf.includes('bad_bot')) logOk('Bad bot blocking configured');
  else logWarn('Bad bot blocking NOT configured');

  // Check site config
  if (siteConf.includes('limit_req zone=login')) logOk('Login rate limit configured');
  else logErr('Login rate limit NOT found');

  if (siteConf.includes('limit_req zone=sensitive')) logOk('Sensitive endpoints rate limit configured');
  else logErr('Sensitive rate limit NOT found');

  if (siteConf.includes('limit_req zone=balance')) logOk('Balance rate limit configured');
  else logErr('Balance rate limit NOT found');

  if (siteConf.includes('limit_req zone=decision')) logOk('Decision rate limit configured');
  else logErr('Decision rate limit NOT found');

  // Check nginx running
  const status = run('systemctl is-active nginx 2>&1');
  if (status === 'active') logOk('Nginx is running');
  else logWarn(`Nginx status: ${status}`);

  // Check fail2ban
  if (CONFIG.enableFail2ban) {
    const f2b = run('fail2ban-client status nginx-ratelimit 2>&1');
    if (f2b && f2b.includes('nginx-ratelimit')) logOk('fail2ban jail active');
    else logWarn('fail2ban jail not active');
  }

  // Check log file
  if (fs.existsSync(CONFIG.blockedLogFile)) logOk('Blocked log file exists');
  else logWarn('Blocked log file not found');

  // Check security rules
  const sec = CONFIG.security;
  if (sec.blockHiddenFiles && siteConf.includes('/\\.')) logOk('Hidden files blocking: ON');
  else if (sec.blockHiddenFiles) logErr('Hidden files blocking: NOT found');

  if (sec.blockSQLInjection && siteConf.includes('union|select')) logOk('SQL injection blocking: ON');
  else if (sec.blockSQLInjection) logErr('SQL injection blocking: NOT found');

  if (sec.blockPathTraversal && siteConf.includes('etc\\/passwd')) logOk('Path traversal blocking: ON');
  else if (sec.blockPathTraversal) logErr('Path traversal blocking: NOT found');

  if (sec.addSecurityHeaders && siteConf.includes('X-Frame-Options')) logOk('Security headers: ON');
  else if (sec.addSecurityHeaders) logErr('Security headers: NOT found');

  if (sec.blockAttackPaths && siteConf.includes('wp-admin')) logOk('Attack paths blocking: ON');
  else if (sec.blockAttackPaths) logErr('Attack paths blocking: NOT found');

  if (sec.blockCountries && sec.allowedCountries && sec.allowedCountries.length > 0) {
    if (siteConf.includes('blocked_country')) logOk(`GeoIP: ONLY ${sec.allowedCountries.join(', ')} allowed — baaki sab BLOCK`);
    else logErr('GeoIP blocking: NOT found');
  }

  if (CONFIG.bypassIPs.length > 0) {
    if (mainConf.includes('rate_limit_bypass')) logOk(`Bypass IPs: ${CONFIG.bypassIPs.join(', ')}`);
    else logErr('Bypass IPs: NOT found');
  }

  logOk(`Cloudflare mode: ${CONFIG.cloudflareEnabled ? 'ON' : 'OFF'}`);
  if (!CONFIG.cloudflareEnabled && sec.enableSSL) {
    if (siteConf.includes('ssl_certificate')) logOk('SSL/TLS: ON (Direct mode)');
    else logErr('SSL/TLS: NOT configured');
  }
}

// =============================================
// DISABLE MODE — remove all rate limiting, restore normal nginx
// =============================================
function disableRateLimiting() {
  console.log(`\n${C.b}${C.r}==============================================`);
  console.log('  DISABLING Rate Limiting — Normal Mode');
  console.log(`==============================================${C.x}\n`);

  logStep(1, 'Removing rate limit zones from nginx.conf...');
  if (fs.existsSync(CONFIG.nginxMainConf)) {
    let content = fs.readFileSync(CONFIG.nginxMainConf, 'utf-8');

    // Remove rate limit block
    content = content.replace(/\n\s*# Rate Limit Zones - Auto configured[\s\S]*?# End Rate Limit Zones\s*\n/m, '\n');
    // Remove stale directives
    content = content.replace(/^\s*limit_req_zone\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*limit_conn_zone\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*limit_req_status\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*limit_conn_status\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*limit_req_log_level\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*limit_conn_log_level\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*log_format\s+blocked\s+[\s\S]*?;\s*$/gm, '');
    content = content.replace(/^\s*map\s+\$http_user_agent\s+\$bad_bot\s*\{[\s\S]*?\}\s*$/gm, '');
    content = content.replace(/^\s*geo\s+\$rate_limit_bypass\s*\{[\s\S]*?\}\s*$/gm, '');
    content = content.replace(/^\s*map\s+\$rate_limit_bypass\s+\$limit_key\s*\{[\s\S]*?\}\s*$/gm, '');
    content = content.replace(/^\s*client_max_body_size\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*large_client_header_buffers\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*client_header_timeout\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*client_body_timeout\s+.*;\s*$/gm, '');
    content = content.replace(/^\s*send_timeout\s+.*;\s*$/gm, '');
    content = content.replace(/\n{3,}/g, '\n\n');

    fs.writeFileSync(CONFIG.nginxMainConf, content);
    logOk('Rate limit zones removed from nginx.conf');
  }

  logStep(2, 'Restoring simple API server block...');
  if (fs.existsSync(CONFIG.nginxSiteConf)) {
    let content = fs.readFileSync(CONFIG.nginxSiteConf, 'utf-8');

    const blockedIpsFile = process.env.DDOS_NGINX_BLOCK_FILE
      || path.join('/var/www/api/errorLog', 'nginx-blocked-ips.conf');

    // Build clean simple server block — no rate limits
    const cleanBlock = `server {
        listen      80;
        server_name ${CONFIG.apiServerName};

        include ${blockedIpsFile};

        location / {
            proxy_pass http://127.0.0.1:${CONFIG.appPort};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_connect_timeout 1000;
            proxy_send_timeout 1500;
            proxy_read_timeout 2000;
            proxy_cache_bypass $http_upgrade;
        }
}`;

    // Replace API server block — use robust replacer
    content = replaceServerBlock(content, CONFIG.apiServerName, cleanBlock);
    fs.writeFileSync(CONFIG.nginxSiteConf, content);
    logOk('Server block restored to normal (no rate limits)');
  }

  logStep(3, 'Disabling fail2ban jail...');
  if (fs.existsSync('/etc/fail2ban/jail.d/nginx-ratelimit.conf')) {
    // Set enabled = false instead of deleting
    let jail = fs.readFileSync('/etc/fail2ban/jail.d/nginx-ratelimit.conf', 'utf-8');
    jail = jail.replace(/enabled\s*=\s*true/, 'enabled  = false');
    fs.writeFileSync('/etc/fail2ban/jail.d/nginx-ratelimit.conf', jail);
    run('systemctl restart fail2ban 2>&1');
    logOk('fail2ban jail disabled');
  } else {
    logOk('fail2ban jail not found — skipping');
  }

  logStep(4, 'Testing and reloading nginx...');
  const testResult = run('nginx -t 2>&1');
  if (testResult && !testResult.includes('failed')) {
    run('nginx -s reload 2>&1') || run('systemctl restart nginx 2>&1');
    logOk('Nginx reloaded — NORMAL MODE');
  } else {
    logErr('Nginx test failed: ' + testResult);
  }

  console.log(`\n${C.b}${C.g}==============================================`);
  console.log('  Rate Limiting DISABLED — Normal Mode');
  console.log('  Nginx is running without rate limits');
  console.log('  To re-enable: set RATE_LIMIT_ENABLED = true');
  console.log(`==============================================${C.x}\n`);
}

// =============================================
// MAIN
// =============================================
async function main() {
  const startTime = Date.now();

  // CHECK MASTER FLAG
  if (!RATE_LIMIT_ENABLED) {
    disableRateLimiting();
    return;
  }

  console.log(`\n${C.b}${C.c}==============================================`);
  console.log('  Nginx Rate Limiting + DDoS Protection');
  console.log('  Auto-install, configure, and verify');
  console.log(`==============================================${C.x}\n`);

  log(`API Domain:  ${CONFIG.apiServerName}`);
  log(`App Port:    ${CONFIG.appPort}`);
  log(`Site Config: ${CONFIG.nginxSiteConf}`);

  const osInfo = checkPrereqs();
  await askCustomEndpoints();
  generateRateLimitZones();
  updateSiteConfig();
  setupBlockedIPExtractor();
  setupFail2ban(osInfo);
  testAndReload();
  verify();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const activeEps = ENDPOINTS.filter(ep => ep.enabled);

  console.log(`\n${C.b}${C.g}==============================================`);
  console.log(`  Setup Complete! (${elapsed}s)`);
  console.log(`==============================================${C.x}\n`);

  log('Rate Limits Summary:', 'y');
  activeEps.forEach(ep => {
    const cv = convertRate(ep.rate);
    log(`  ${ep.name.padEnd(15)} ${ep.rate.padEnd(10)} → nginx: ${cv.nginxRate.padEnd(6)} burst:${String(cv.burst).padEnd(4)} → ${ep.path || 'all requests'}`, 'c');
  });
  console.log('');
  log('Protection Layers:', 'y');
  log(`  Connection limit:  ${CONFIG.maxConnPerIP} per IP`, 'c');
  log(`  Body size limit:   ${CONFIG.maxBodySize}`, 'c');
  log(`  Header timeout:    ${CONFIG.clientHeaderTimeout}s`, 'c');
  log(`  Bad bot blocking:  ${CONFIG.blockBadBots ? 'ON' : 'OFF'}`, 'c');
  log(`  fail2ban:          ${CONFIG.enableFail2ban ? 'ON' : 'OFF'} (${CONFIG.fail2banMaxRetry} strikes = ${CONFIG.fail2banBanTime}s ban)`, 'c');
  console.log('');
  log('Useful Commands:', 'y');
  log(`  cat ${CONFIG.blockedIpsOutput}`, 'c');
  log('  cat /var/log/nginx/ratelimit-summary.txt', 'c');
  log(`  tail -f ${CONFIG.blockedLogFile}`, 'c');
  log('  fail2ban-client status nginx-ratelimit', 'c');
  log('  fail2ban-client set nginx-ratelimit unbanip 1.2.3.4', 'c');
  console.log('');
  log('To DISABLE rate limiting:', 'r');
  log('  Set RATE_LIMIT_ENABLED = false and run again', 'r');
  console.log('');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
