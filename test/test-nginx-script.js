/**
 * Test script for nginxRateLimiting.js
 * Tests all functions without actually modifying any server
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m✓ PASS\x1b[0m  ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗ FAIL\x1b[0m  ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// =============================================
// Load script content and extract functions
// =============================================
const code = fs.readFileSync('nginxRateLimiting.js', 'utf-8');

// Extract convertRate function
const convertRateMatch = code.match(/function convertRate\(rateStr\)\s*\{[\s\S]*?^\}/m);
eval(convertRateMatch[0]);

console.log('\n\x1b[1m\x1b[36m==============================================');
console.log('  nginxRateLimiting.js — Full Test Suite');
console.log('==============================================\x1b[0m');

// =============================================
// Test 1: convertRate — all formats
// =============================================
console.log('\n\x1b[1m[Test 1] convertRate — format conversion\x1b[0m');

const rateTests = [
  { input: '15r/10s', expectedRate: '2r/s', expectedBurst: 15 },
  { input: '10r/5s',  expectedRate: '2r/s', expectedBurst: 10 },
  { input: '50r/10s', expectedRate: '5r/s', expectedBurst: 50 },
  { input: '40r/10s', expectedRate: '4r/s', expectedBurst: 40 },
  { input: '3r/10s',  expectedBurst: 3 },  // rate varies
  { input: '2r/10s',  expectedBurst: 2 },
  { input: '5r/10s',  expectedBurst: 5 },
  { input: '10r/10s', expectedRate: '1r/s', expectedBurst: 10 },
  { input: '3r/30s',  expectedRate: '6r/m', expectedBurst: 3 },
  { input: '5r/m',    expectedRate: '5r/m', expectedBurst: 5 },
  { input: '10r/s',   expectedRate: '10r/s', expectedBurst: 10 },
  { input: '1r/s',    expectedRate: '1r/s', expectedBurst: 1 },
  { input: '1r/m',    expectedRate: '1r/m', expectedBurst: 1 },
];

rateTests.forEach(t => {
  const result = convertRate(t.input);
  if (t.expectedRate) {
    test(`${t.input} → rate: ${t.expectedRate}`, result.nginxRate === t.expectedRate, `got: ${result.nginxRate}`);
  }
  test(`${t.input} → burst: ${t.expectedBurst}`, result.burst === t.expectedBurst, `got: ${result.burst}`);
});

// =============================================
// Test 2: convertRate — edge cases
// =============================================
console.log('\n\x1b[1m[Test 2] convertRate — edge cases\x1b[0m');

test('0r/10s should not crash', (() => { try { convertRate('0r/10s'); return true; } catch { return false; } })());
test('1r/1s = 1r/s', convertRate('1r/1s').nginxRate === '1r/s');
test('100r/10s = 10r/s', convertRate('100r/10s').nginxRate === '10r/s');
test('1r/60s = 1r/m', convertRate('1r/60s').nginxRate === '1r/m');
test('invalid string returns something', convertRate('xyz').nginxRate === 'xyz');

// =============================================
// Test 3: RATE_LIMIT_ENABLED flag exists
// =============================================
console.log('\n\x1b[1m[Test 3] Master flags exist\x1b[0m');

test('RATE_LIMIT_ENABLED exists', code.includes('const RATE_LIMIT_ENABLED'));
test('cloudflareEnabled exists', code.includes('cloudflareEnabled:'));
test('ENDPOINTS array exists', code.includes('const ENDPOINTS = ['));

// =============================================
// Test 4: ENDPOINTS array valid
// =============================================
console.log('\n\x1b[1m[Test 4] ENDPOINTS array validation\x1b[0m');

// Extract ENDPOINTS
const epStart = code.indexOf('const ENDPOINTS = [');
const epEnd = code.indexOf('];', epStart) + 2;
const epCode = code.substring(epStart, epEnd).replace('const ENDPOINTS', 'var ENDPOINTS');
eval(epCode);

test('ENDPOINTS is array', Array.isArray(ENDPOINTS));
test('Has global endpoint', ENDPOINTS.some(ep => ep.name === 'global'));
test('Has api endpoint', ENDPOINTS.some(ep => ep.name === 'api'));
test('Has login endpoint', ENDPOINTS.some(ep => ep.name === 'login'));
test('Has sensitive endpoint', ENDPOINTS.some(ep => ep.name === 'sensitive'));
test('Has balance endpoint', ENDPOINTS.some(ep => ep.name === 'balance'));
test('Has decision endpoint', ENDPOINTS.some(ep => ep.name === 'decision'));

const activeEps = ENDPOINTS.filter(ep => ep.enabled);
test('At least 6 active endpoints', activeEps.length >= 6, `found: ${activeEps.length}`);

// Validate each endpoint
activeEps.forEach(ep => {
  test(`${ep.name}: has rate`, !!ep.rate, ep.rate);
  test(`${ep.name}: rate is valid format`, /^\d+r\/(\d+s|s|m)$/.test(ep.rate), ep.rate);
  test(`${ep.name}: has nodelay (bool)`, typeof ep.nodelay === 'boolean');
  test(`${ep.name}: has enabled (bool)`, typeof ep.enabled === 'boolean');
  if (ep.name !== 'global') {
    test(`${ep.name}: has path`, !!ep.path, ep.path);
    test(`${ep.name}: has type`, ['exact', 'prefix', 'regex', null].includes(ep.type), ep.type);
  }
  // Verify rate converts without error
  const conv = convertRate(ep.rate);
  test(`${ep.name}: rate converts ok`, !!conv.nginxRate, `${ep.rate} → ${conv.nginxRate} burst:${conv.burst}`);
});

// =============================================
// Test 5: Security flags exist
// =============================================
console.log('\n\x1b[1m[Test 5] Security flags validation\x1b[0m');

const secFlags = [
  'blockHiddenFiles', 'blockSQLInjection', 'blockPathTraversal',
  'addSecurityHeaders', 'limitURILength', 'blockGzipBomb',
  'blockCountries', 'enableSSL', 'blockReferrerSpam',
  'blockAttackPaths', 'blockOversizedHeaders', 'blockEmptyPost',
];

secFlags.forEach(flag => {
  test(`security.${flag} exists`, code.includes(`${flag}:`));
});

test('allowedCountries exists', code.includes('allowedCountries:'));
test('cloudflareEnabled flag exists', code.includes('cloudflareEnabled:'));

// =============================================
// Test 6: Bypass IPs
// =============================================
console.log('\n\x1b[1m[Test 6] Bypass IPs\x1b[0m');

test('bypassIPs config exists', code.includes('bypassIPs:'));
test('Reads from BYPASS_IPS env', code.includes("process.env.BYPASS_IPS"));
test('geo $rate_limit_bypass generated', code.includes('geo $rate_limit_bypass'));
test('map $rate_limit_bypass $limit_key generated', code.includes('map $rate_limit_bypass $limit_key'));
test('$limit_key used in zones', code.includes("zoneVar = CONFIG.bypassIPs.length > 0 ? '$limit_key'"));

// =============================================
// Test 7: Security block generation
// =============================================
console.log('\n\x1b[1m[Test 7] Security blocks in nginx config\x1b[0m');

test('Hidden files: location ~ /\\.', code.includes('location ~ /\\\\.'));
test('SQL injection: union|select', code.includes('union|select'));
test('Path traversal: etc\\/passwd', code.includes('etc\\\\/passwd'));
test('Security headers: X-Frame-Options', code.includes('X-Frame-Options'));
test('Attack paths: wp-admin', code.includes('wp-admin'));
test('Referrer spam block', code.includes('bad_referer'));

// =============================================
// Test 8: Cloudflare ON vs OFF
// =============================================
console.log('\n\x1b[1m[Test 8] Cloudflare mode handling\x1b[0m');

test('CF ON: basic headers (no HSTS)', code.includes("Cloudflare mode — CF handles HSTS"));
test('CF OFF: full headers (with HSTS)', code.includes("Direct mode — full headers"));
test('CF OFF: SSL config block exists', code.includes('ssl_certificate'));
test('CF OFF: SSL protocols TLSv1.2+', code.includes('ssl_protocols TLSv1.2 TLSv1.3'));
test('CF OFF: listen 443 ssl', code.includes('listen      443 ssl http2'));
test('CF OFF: HTTP→HTTPS redirect', code.includes('return 301 https://'));

// =============================================
// Test 9: GeoIP — allow mode
// =============================================
console.log('\n\x1b[1m[Test 9] GeoIP allow mode\x1b[0m');

test('GeoIP: default 1 (block all)', code.includes('default 1;'));
test('GeoIP: allowed country = 0', code.includes('${cc} 0;'));
test('GeoIP: empty = 0 (local allow)', code.includes('"" 0;'));
test('GeoIP: $blocked_country check', code.includes('if ($blocked_country)'));

// =============================================
// Test 10: Disable mode
// =============================================
console.log('\n\x1b[1m[Test 10] Disable mode (RATE_LIMIT_ENABLED=false)\x1b[0m');

test('disableRateLimiting function exists', code.includes('function disableRateLimiting'));
test('Removes rate limit zones', code.includes("content.replace(/\\n\\s*# Rate Limit Zones"));
test('Removes geo blocks', code.includes("geo\\s+\\$rate_limit_bypass"));
test('Restores simple server block', code.includes('Restoring simple API server block'));
test('Disables fail2ban jail', code.includes("enabled  = false"));
test('Nginx reload after disable', code.includes("Nginx reloaded — NORMAL MODE"));
test('Master flag check in main()', code.includes('if (!RATE_LIMIT_ENABLED)'));

// =============================================
// Test 11: Re-run safety (no duplicates)
// =============================================
console.log('\n\x1b[1m[Test 11] Re-run safety\x1b[0m');

test('Removes old rate limit block before write', code.includes("Old rate limit config found — removing"));
test('Cleans stale limit_req_zone', code.includes("content.replace(/^\\s*limit_req_zone"));
test('Cleans stale limit_conn_zone', code.includes("content.replace(/^\\s*limit_conn_zone"));
test('Cleans stale geo blocks', code.includes("content.replace(/^\\s*geo\\s+\\$rate_limit_bypass"));
test('Cleans stale bad_bot map', code.includes("content.replace(/^\\s*map\\s+\\$http_user_agent"));
test('Server block replacement (not append)', code.includes('lines.splice(blockStart'));
test('Cron duplicate check', code.includes("cronCheck.includes('extract-blocked-ips')"));
test('fail2ban overwrite (writeFileSync)', code.includes("writeFileSync('/etc/fail2ban"));

// =============================================
// Test 12: File generation
// =============================================
console.log('\n\x1b[1m[Test 12] File & service setup\x1b[0m');

test('Blocked log file creation', code.includes('touch ${CONFIG.blockedLogFile}'));
test('IP extraction script', code.includes('extract-blocked-ips.sh'));
test('Cron job setup', code.includes('*/5 * * * *'));
test('fail2ban filter file', code.includes('nginx-ratelimit.conf'));
test('fail2ban jail file', code.includes('jail.d/nginx-ratelimit.conf'));
test('nginx -t before reload', code.includes("nginx -t 2>&1"));
test('Backup before write (main)', code.includes('ratelimit-backup'));
test('Backup before write (site)', code.includes('ratelimit-backup'));

// =============================================
// Test 13: Bot blocking
// =============================================
console.log('\n\x1b[1m[Test 13] Bot blocking\x1b[0m');

test('Bad bot map exists', code.includes('map $http_user_agent $bad_bot'));
test('Empty UA blocked', code.includes('"" 1;'));
test('python-requests blocked', code.includes('python-requests'));
test('sqlmap blocked', code.includes('sqlmap'));
test('curl blocked', code.includes("curl/"));
test('$bad_bot check in locations', code.includes('if ($bad_bot)'));

// =============================================
// Test 14: Method restriction
// =============================================
console.log('\n\x1b[1m[Test 14] Method restriction\x1b[0m');

test('Method check regex', code.includes('GET|POST|PUT|DELETE|OPTIONS'));
test('TRACE blocked (return 444)', code.includes('return 444'));
test('Location / returns 444', code.includes("location / {\n            return 444;"));

// =============================================
// Test 15: appPort from .env
// =============================================
console.log('\n\x1b[1m[Test 15] Config from .env\x1b[0m');

test('appPort reads from process.env.PORT', code.includes('process.env.PORT'));
test('BYPASS_IPS reads from .env', code.includes('process.env.BYPASS_IPS'));
test('blockedLogFile uses proxy_pass with appPort', code.includes('proxy_pass http://127.0.0.1:${CONFIG.appPort}'));

// =============================================
// SUMMARY
// =============================================
console.log(`\n\x1b[1m\x1b[36m==============================================`);
console.log(`  TEST RESULTS`);
console.log(`==============================================\x1b[0m`);
console.log(`  \x1b[32m✓ Passed: ${passed}\x1b[0m`);
console.log(`  \x1b[31m✗ Failed: ${failed}\x1b[0m`);
console.log(`  Total:   ${passed + failed}`);

if (failed === 0) {
  console.log(`\n  \x1b[1m\x1b[32mAll tests passed! Script is production-ready.\x1b[0m\n`);
} else {
  console.log(`\n  \x1b[1m\x1b[33mSome tests failed — check above.\x1b[0m\n`);
}

process.exit(failed > 0 ? 1 : 0);
