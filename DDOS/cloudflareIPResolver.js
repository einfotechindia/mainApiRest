/**
 * Cloudflare IP Resolver Middleware
 *
 * PROBLEM:
 *   When Cloudflare is in front of your server, req.ip gives you Cloudflare's IP
 *   (e.g., 172.70.x.x), NOT the real visitor's IP.
 *   Cloudflare sends the real IP in the `cf-connecting-ip` header.
 *   But attackers who bypass Cloudflare can SPOOF this header.
 *
 * SOLUTION:
 *   1. Verify the request actually came FROM Cloudflare (check source IP against Cloudflare's IP ranges)
 *   2. If from Cloudflare → trust `cf-connecting-ip` (real visitor IP)
 *   3. If NOT from Cloudflare → use raw connection IP (someone hitting your server directly)
 *   4. Set `req.realIP` so all other middlewares use the correct IP
 *
 * This MUST be the first middleware in app.js (before ddosProtection, rate limiter, etc.)
 */

const https = require('https');
const { URL } = require('url');

// --- Cloudflare IP Ranges ---
// These are Cloudflare's IP ranges. Requests from these IPs are genuinely from Cloudflare.
// Updated list: https://www.cloudflare.com/ips/
// We fetch fresh ranges on startup and refresh every 24 hours.

let CLOUDFLARE_IPV4_RANGES = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

let CLOUDFLARE_IPV6_RANGES = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

// Pre-parsed CIDR ranges for fast lookup
let parsedIPv4Ranges = [];
let parsedIPv6Ranges = [];

// --- CIDR Matching ---

function parseIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
}

function parseCIDRv4(cidr) {
  const [ip, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const ipNum = parseIPv4(ip);
  if (ipNum === null || isNaN(prefix)) return null;
  // Create mask: e.g., prefix=20 → 0xFFFFF000
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { network: (ipNum >>> 0) & mask, mask };
}

function isIPv4InCIDR(ip, cidr) {
  const ipNum = parseIPv4(ip);
  if (ipNum === null) return false;
  return ((ipNum >>> 0) & cidr.mask) === cidr.network;
}

function isCloudflareIPv4(ip) {
  for (const range of parsedIPv4Ranges) {
    if (isIPv4InCIDR(ip, range)) return true;
  }
  return false;
}

// Simple IPv6 check — compare prefix strings
// Full IPv6 CIDR matching is complex; for production this covers most cases
function isCloudflareIPv6(ip) {
  const normalizedIP = ip.toLowerCase();
  for (const range of CLOUDFLARE_IPV6_RANGES) {
    const prefix = range.split('/')[0];
    if (normalizedIP.startsWith(prefix.replace(/:+$/, ''))) return true;
  }
  return false;
}

function isCloudflareIP(ip) {
  if (!ip) return false;

  // Strip IPv6-mapped IPv4 prefix
  let cleanIP = ip;
  if (cleanIP.startsWith('::ffff:')) {
    cleanIP = cleanIP.substring(7);
  }

  if (cleanIP.includes(':')) {
    return isCloudflareIPv6(cleanIP);
  }
  return isCloudflareIPv4(cleanIP);
}

// --- Initialize parsed ranges ---
function initRanges() {
  parsedIPv4Ranges = CLOUDFLARE_IPV4_RANGES
    .map(parseCIDRv4)
    .filter(Boolean);
}
initRanges();

// --- Fetch fresh Cloudflare IP ranges on startup and every 24h ---
function fetchCloudflareRanges() {
  const fetchURL = (url) => {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      https.get({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data.trim().split('\n').filter(Boolean)));
        res.on('error', reject);
      }).on('error', reject);
    });
  };

  Promise.all([
    fetchURL('https://www.cloudflare.com/ips-v4').catch(() => null),
    fetchURL('https://www.cloudflare.com/ips-v6').catch(() => null),
  ]).then(([v4, v6]) => {
    if (v4 && v4.length > 5) {
      CLOUDFLARE_IPV4_RANGES = v4;
      initRanges();
      console.log(`[CF-IP] Updated IPv4 ranges: ${v4.length} entries`);
    }
    if (v6 && v6.length > 3) {
      CLOUDFLARE_IPV6_RANGES = v6;
      console.log(`[CF-IP] Updated IPv6 ranges: ${v6.length} entries`);
    }
  }).catch(err => {
    console.warn('[CF-IP] Failed to fetch Cloudflare IP ranges:', err.message);
  });
}

// Fetch on startup (non-blocking)
fetchCloudflareRanges();
// Refresh every 24 hours
setInterval(fetchCloudflareRanges, 24 * 60 * 60 * 1000);

// --- The Middleware ---

function cloudflareIPResolver(req, res, next) {
  // Get the raw connection IP (the IP that actually connected to your server)
  const rawIP = req.connection?.remoteAddress || req.socket?.remoteAddress || '';

  // Strip ::ffff: prefix for IPv4-mapped IPv6
  let connectionIP = rawIP;
  if (connectionIP.startsWith('::ffff:')) {
    connectionIP = connectionIP.substring(7);
  }

  // Check if this request came from Cloudflare
  const isFromCloudflare = isCloudflareIP(connectionIP);

  if (isFromCloudflare) {
    // Request is genuinely from Cloudflare → trust cf-connecting-ip
    const cfIP = req.headers['cf-connecting-ip'];
    if (cfIP) {
      req.realIP = cfIP.trim();
    } else {
      // Cloudflare should always set this header — if missing, use X-Forwarded-For
      const xff = req.headers['x-forwarded-for'];
      req.realIP = xff ? xff.split(',')[0].trim() : connectionIP;
    }
    req.isFromCloudflare = true;
  } else {
    // NOT from Cloudflare — someone is hitting your server directly
    // DO NOT trust any headers, use the raw connection IP
    req.realIP = connectionIP;
    req.isFromCloudflare = false;

    // If you want to BLOCK all non-Cloudflare traffic (recommended during DDoS):
    if (process.env.BLOCK_NON_CLOUDFLARE === 'true') {
      console.warn(`[CF-IP] BLOCKED non-Cloudflare request from ${connectionIP}`);
      return res.status(403).json({
        status: 403,
        message: 'Direct access not allowed.',
      });
    }
  }

  // Also store useful Cloudflare headers
  req.cfCountry = req.headers['cf-ipcountry'] || null; // e.g., "IN", "US"
  req.cfRay = req.headers['cf-ray'] || null;

  next();
}

module.exports = cloudflareIPResolver;
module.exports.isCloudflareIP = isCloudflareIP;
module.exports.getClientIP = function (req) {
  // Always prefer realIP set by this middleware
  return req.realIP || req.ip || 'unknown';
};
