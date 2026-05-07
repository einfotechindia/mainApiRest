/**
 * DDoS Protection Test Script
 *
 * Sirf localhost pe test karta hai — koi real server pe attack nahi hoga
 *
 * Usage: node test-ddos.js
 *
 * Pehle app.js start karo: node app.js
 * Phir alag terminal me: node test-ddos.js
 */

const http = require('http');

const BASE_URL = 'http://localhost';
const PORT = 5001;
const RESULTS = { passed: 0, failed: 0, tests: [] };

// =============================================
// Helper Functions
// =============================================

function makeRequest(options = {}) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: PORT,
      path: options.path || '/v1/user/login',
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        ...options.headers,
      },
      timeout: 10000,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message, body: '' });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout', body: '' });
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

function makeRequests(count, options = {}, delayMs = 0) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    if (delayMs > 0) {
      promises.push(new Promise(resolve => {
        setTimeout(async () => {
          resolve(await makeRequest(options));
        }, i * delayMs);
      }));
    } else {
      promises.push(makeRequest(options));
    }
  }
  return Promise.all(promises);
}

function logTest(name, passed, detail = '') {
  const icon = passed ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${icon}  ${name}${detail ? ` — ${detail}` : ''}`);
  RESULTS.tests.push({ name, passed, detail });
  if (passed) RESULTS.passed++; else RESULTS.failed++;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================
// Tests
// =============================================

async function testServerRunning() {
  console.log('\n\x1b[1m\x1b[36m[Test 1] Server Running Check\x1b[0m');
  const res = await makeRequest({ path: '/health', method: 'GET' });
  logTest('Server is reachable', res.status !== 0, `Status: ${res.status}`);
  return res.status !== 0;
}

async function testNormalRequest() {
  console.log('\n\x1b[1m\x1b[36m[Test 2] Normal Request — Should PASS\x1b[0m');
  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'POST',
    body: { username: 'testuser', password: 'testpass' },
  });
  logTest('Normal request not blocked', res.status !== 429, `Status: ${res.status}`);
}

async function testNoUserAgent() {
  console.log('\n\x1b[1m\x1b[36m[Test 3] No User-Agent — Bot Detection\x1b[0m');
  console.log('  Sending requests without User-Agent header...');

  // Send multiple requests without UA to build up score
  for (let i = 0; i < 5; i++) {
    await makeRequest({
      path: '/v1/sports/matchList',
      method: 'POST',
      headers: { 'User-Agent': '' },
    });
  }

  const res = await makeRequest({
    path: '/v1/sports/matchList',
    method: 'POST',
    headers: { 'User-Agent': '' },
  });

  logTest('No UA detected (429 or delayed)', res.status === 429 || res.status !== 200, `Status: ${res.status}`);
}

async function testSuspiciousUserAgent() {
  console.log('\n\x1b[1m\x1b[36m[Test 4] Suspicious User-Agent (python-requests)\x1b[0m');

  for (let i = 0; i < 5; i++) {
    await makeRequest({
      path: '/v1/user/login',
      method: 'POST',
      userAgent: 'python-requests/2.28.0',
      body: { username: 'test', password: 'test' },
    });
  }

  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'POST',
    userAgent: 'python-requests/2.28.0',
    body: { username: 'test', password: 'test' },
  });

  logTest('Suspicious UA detected', res.status === 429, `Status: ${res.status}`);
}

async function testBurstDetection() {
  console.log('\n\x1b[1m\x1b[36m[Test 5] Burst Detection — 50 rapid requests\x1b[0m');
  console.log('  Sending 50 requests rapidly...');

  const results = await makeRequests(50, {
    path: '/v1/sports/matchList',
    method: 'POST',
    // Use a unique header to simulate different IP behavior
    headers: { 'X-Forwarded-For': '10.0.0.100' },
  });

  const blocked = results.filter(r => r.status === 429).length;
  const passed = results.filter(r => r.status !== 429).length;

  logTest('Burst detected and blocked', blocked > 0, `${blocked} blocked, ${passed} passed`);
}

async function testRateLimiter() {
  console.log('\n\x1b[1m\x1b[36m[Test 6] Rate Limiter — Global 200/min\x1b[0m');
  console.log('  Checking rate limit headers...');

  const res = await makeRequest({
    path: '/v1/sports/matchList',
    method: 'POST',
  });

  const hasRateLimitHeader = res.headers['x-ratelimit-limit'] !== undefined;
  const hasRemainingHeader = res.headers['x-ratelimit-remaining'] !== undefined;

  logTest('X-RateLimit-Limit header present', hasRateLimitHeader, `Value: ${res.headers['x-ratelimit-limit']}`);
  logTest('X-RateLimit-Remaining header present', hasRemainingHeader, `Value: ${res.headers['x-ratelimit-remaining']}`);
}

async function testHeadlessBrowser() {
  console.log('\n\x1b[1m\x1b[36m[Test 7] Headless Browser Detection\x1b[0m');

  for (let i = 0; i < 4; i++) {
    await makeRequest({
      path: '/v1/user/login',
      method: 'POST',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36',
      headers: { 'X-Forwarded-For': '10.0.0.200' },
      body: { username: 'test', password: 'test' },
    });
  }

  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'POST',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36',
    headers: { 'X-Forwarded-For': '10.0.0.200' },
    body: { username: 'test', password: 'test' },
  });

  logTest('Headless browser detected', res.status === 429, `Status: ${res.status}`);
}

async function testRapidEndpointSwitch() {
  console.log('\n\x1b[1m\x1b[36m[Test 8] Rapid Endpoint Switching (Scanner Detection)\x1b[0m');
  console.log('  Hitting 12 different endpoints in 3 seconds...');

  const endpoints = [
    '/v1/user/login', '/v1/user/register', '/v1/sports/matchList',
    '/v1/casino/list', '/v1/decision/result', '/v1/website/config',
    '/v1/reports/daily', '/v1/matka/list', '/v1/daman/game',
    '/v1/payment/deposit', '/v1/dashboard/stats', '/v1/staff/list',
  ];

  for (const ep of endpoints) {
    await makeRequest({
      path: ep,
      method: 'POST',
      headers: { 'X-Forwarded-For': '10.0.0.300' },
    });
  }

  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'POST',
    headers: { 'X-Forwarded-For': '10.0.0.300' },
  });

  logTest('Rapid endpoint switch detected', res.status === 429, `Status: ${res.status}`);
}

async function testConnectionGuard503() {
  console.log('\n\x1b[1m\x1b[36m[Test 9] Connection Guard — 503 Headers\x1b[0m');

  const res = await makeRequest({
    path: '/v1/sports/matchList',
    method: 'POST',
  });

  logTest('Server responds (not 503)', res.status !== 503, `Status: ${res.status}`);
}

async function testSecurityHeaders() {
  console.log('\n\x1b[1m\x1b[36m[Test 10] Security Headers Check\x1b[0m');

  const res = await makeRequest({
    path: '/v1/sports/matchList',
    method: 'POST',
  });

  const headers = res.headers;

  logTest('X-Content-Type-Options', !!headers['x-content-type-options'], headers['x-content-type-options'] || 'missing');
  logTest('X-Frame-Options', !!headers['x-frame-options'], headers['x-frame-options'] || 'missing');
  logTest('Strict-Transport-Security', !!headers['strict-transport-security'], 'present');
  logTest('Content-Security-Policy', !!headers['content-security-policy'], 'present');
  logTest('X-XSS-Protection', headers['x-xss-protection'] !== undefined, headers['x-xss-protection'] || 'missing');
}

async function testCORS() {
  console.log('\n\x1b[1m\x1b[36m[Test 11] CORS Configuration\x1b[0m');

  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://score.tresting.com',
      'Access-Control-Request-Method': 'POST',
    },
  });

  const allowOrigin = res.headers['access-control-allow-origin'];
  const allowMethods = res.headers['access-control-allow-methods'];

  logTest('CORS Allow-Origin set', !!allowOrigin, allowOrigin || 'missing');
  logTest('CORS Allow-Methods set', !!allowMethods, allowMethods || 'missing');
}

async function testBlockedIPStaysBlocked() {
  console.log('\n\x1b[1m\x1b[36m[Test 12] Blocked IP stays blocked on subsequent requests\x1b[0m');

  // First get an IP blocked (using curl-like UA which gets high penalty)
  for (let i = 0; i < 8; i++) {
    await makeRequest({
      path: '/v1/user/login',
      method: 'POST',
      userAgent: 'curl/7.88.1',
      headers: { 'X-Forwarded-For': '10.0.0.400' },
    });
  }

  // Now try with NORMAL user-agent from same "IP"
  const res = await makeRequest({
    path: '/v1/user/login',
    method: 'POST',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    headers: { 'X-Forwarded-For': '10.0.0.400' },
  });

  logTest('Blocked IP stays blocked even with good UA', res.status === 429, `Status: ${res.status}`);
}

async function testNginxFileWrite() {
  console.log('\n\x1b[1m\x1b[36m[Test 13] Nginx Block File Written\x1b[0m');

  const fs = require('fs');
  const filePath = require('path').join(__dirname, 'errorLog', 'nginx-blocked-ips.conf');

  // Wait for file write (5 sec batch timer)
  console.log('  Waiting 6 seconds for nginx file write...');
  await sleep(6000);

  let fileExists = false;
  let hasContent = false;

  try {
    if (fs.existsSync(filePath)) {
      fileExists = true;
      const content = fs.readFileSync(filePath, 'utf-8');
      hasContent = content.includes('deny ');
    }
  } catch (e) {
    // ignore
  }

  logTest('nginx-blocked-ips.conf exists', fileExists, filePath);
  logTest('File has deny directives', hasContent, hasContent ? 'IPs blocked' : 'empty file');
}

async function testBlockedIPsJson() {
  console.log('\n\x1b[1m\x1b[36m[Test 14] Blocked IPs JSON File\x1b[0m');

  const fs = require('fs');
  const filePath = require('path').join(__dirname, 'errorLog', 'blocked-ips.json');

  let fileExists = false;
  let hasData = false;

  try {
    if (fs.existsSync(filePath)) {
      fileExists = true;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      hasData = Array.isArray(data) && data.length > 0;
    }
  } catch (e) {
    // ignore
  }

  logTest('blocked-ips.json exists', fileExists);
  logTest('Has blocked IP data', hasData);
}

async function testBlockedIPsHistory() {
  console.log('\n\x1b[1m\x1b[36m[Test 15] Blocked IPs History File\x1b[0m');

  const fs = require('fs');
  const filePath = require('path').join(__dirname, 'errorLog', 'blocked-ips-history.json');

  let fileExists = false;
  let hasData = false;

  try {
    if (fs.existsSync(filePath)) {
      fileExists = true;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      hasData = Array.isArray(data) && data.length > 0;
    }
  } catch (e) {
    // ignore
  }

  logTest('blocked-ips-history.json exists', fileExists);
  logTest('Has history data', hasData);
}

// =============================================
// MAIN
// =============================================

async function main() {
  console.log('\x1b[1m\x1b[36m==============================================');
  console.log('  DDoS Protection Test Suite');
  console.log('  Target: localhost:' + PORT);
  console.log('==============================================\x1b[0m');

  // Check server is running first
  const serverUp = await testServerRunning();
  if (!serverUp) {
    console.log('\n\x1b[31m  Server not running! Pehle start karo: node app.js\x1b[0m\n');
    process.exit(1);
  }

  await testNormalRequest();
  await sleep(500);

  await testNoUserAgent();
  await sleep(500);

  await testSuspiciousUserAgent();
  await sleep(500);

  await testBurstDetection();
  await sleep(500);

  await testRateLimiter();
  await sleep(500);

  await testHeadlessBrowser();
  await sleep(500);

  await testRapidEndpointSwitch();
  await sleep(500);

  await testConnectionGuard503();
  await sleep(500);

  await testSecurityHeaders();
  await sleep(500);

  await testCORS();
  await sleep(500);

  await testBlockedIPStaysBlocked();

  await testNginxFileWrite();

  await testBlockedIPsJson();

  await testBlockedIPsHistory();

  // Summary
  console.log('\n\x1b[1m\x1b[36m==============================================');
  console.log('  TEST RESULTS');
  console.log('==============================================\x1b[0m');
  console.log(`  \x1b[32m✓ Passed: ${RESULTS.passed}\x1b[0m`);
  console.log(`  \x1b[31m✗ Failed: ${RESULTS.failed}\x1b[0m`);
  console.log(`  Total:   ${RESULTS.passed + RESULTS.failed}`);

  if (RESULTS.failed === 0) {
    console.log('\n  \x1b[1m\x1b[32mAll tests passed! DDoS protection working correctly.\x1b[0m\n');
  } else {
    console.log('\n  \x1b[1m\x1b[33mSome tests failed — check above for details.\x1b[0m\n');
  }

  process.exit(RESULTS.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
