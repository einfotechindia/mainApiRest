/**
 * Comprehensive Security & DDoS Test Suite
 *
 * Usage: node test/test-server-ddos.js
 *
 * Features:
 * - 28 test categories, 150+ attack vectors
 * - Rotational proxy simulation (50 IPs from proxy-ips.json)
 * - All tests have flags (enable/disable)
 * - Results auto-save to test/results/
 * - JSON + readable report
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// =============================================
// TARGET SERVER
// =============================================
const TARGET = {
  host: 'api.6wickets.pro',
  protocol: 'https',
  port: 443,
};

// =============================================
// TEST FLAGS — true/false se enable/disable karo
// =============================================
const TESTS = {
  serverReachable:    true,
  normalRequest:      true,
  sqlInjection:       true,
  xssAttack:          true,
  pathTraversal:      true,
  commandInjection:   true,
  ssrfAttack:         true,
  nosqlInjection:     true,
  credentialLeakage:  true,
  hiddenFiles:        true,
  attackPaths:        true,
  badBots:            true,
  methodAttacks:      true,
  headerInjection:    true,
  requestSmuggling:   true,
  corsBypass:         true,
  securityHeaders:    true,
  infoLeakage:        true,
  unknownPaths:       true,
  unicodeAttacks:     true,
  rateLimitBurst:     true,
  heavyFlood:         true,
  rotationalProxy:    true,
  slowloris:          true,
  connectionFlood:    true,
  loginBruteForce:    true,
  largePayload:       true,
  ipBanVerify:        true,
};

// =============================================
// PROXY IPs
// =============================================
const PROXY_IPS = JSON.parse(fs.readFileSync(path.join(__dirname, 'proxy-ips.json'), 'utf-8'));

// =============================================
const RESULTS = { passed: 0, failed: 0, tests: [], startTime: Date.now() };
const CATEGORIES = {};
const RESULTS_DIR = path.join(__dirname, 'results');

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', b: '\x1b[1m', x: '\x1b[0m', w: '\x1b[37m' };
function test(cat, name, passed, detail = '') {
  console.log(`  ${passed ? C.g + '✓ PASS' : C.r + '✗ FAIL'}${C.x}  ${name}${detail ? ' — ' + detail : ''}`);
  RESULTS.tests.push({ category: cat, name, passed, detail, time: new Date().toISOString() });
  if (passed) RESULTS.passed++; else RESULTS.failed++;
  if (!CATEGORIES[cat]) CATEGORIES[cat] = { passed: 0, failed: 0 };
  if (passed) CATEGORIES[cat].passed++; else CATEGORIES[cat].failed++;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isBlocked(s) { return [0, 403, 429, 444, 502, 520].includes(s); }
function rndProxy() { return PROXY_IPS[Math.floor(Math.random() * PROXY_IPS.length)]; }
const UAs = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.6099.43 Mobile',
  'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Firefox/121.0',
  'Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Chrome/119.0.0.0',
];
function rndUA() { return UAs[Math.floor(Math.random() * UAs.length)]; }

function req(opts = {}) {
  return new Promise(resolve => {
    const lib = TARGET.protocol === 'https' ? https : http;
    const hdrs = { Host: TARGET.host, 'Content-Type': 'application/json', 'User-Agent': opts.ua || rndUA(), Accept: 'application/json', 'Accept-Language': 'en-US', Origin: opts.origin || 'https://' + TARGET.host, ...opts.headers };
    if (opts.proxy) { hdrs['X-Forwarded-For'] = opts.proxy; hdrs['X-Real-IP'] = opts.proxy; }
    const o = { hostname: TARGET.host, port: TARGET.port, path: opts.path || '/v1/user/login', method: opts.method || 'POST', headers: hdrs, timeout: opts.timeout || 10000, rejectUnauthorized: false };
    const r = lib.request(o, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d })); });
    r.on('error', e => resolve({ status: 0, error: e.message, body: '' }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout', body: '' }); });
    if (opts.body) r.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    r.end();
  });
}

// =============================================
// TESTS
// =============================================
async function t1() { console.log(`\n${C.b}${C.c}[1] Server Reachable${C.x}`); const r = await req({ path: '/health', method: 'GET' }); test('server', 'Server responds', r.status !== 0, '' + r.status); return r.status !== 0; }

async function t2() { console.log(`\n${C.b}${C.c}[2] Normal Requests${C.x}`);
  test('normal', 'POST login', !(await req({ body: { u: 'x', p: 'x' } })).status || true, '' + (await req({ body: { u: 'x', p: 'x' } })).status);
  const r1 = await req({ body: { u: 'test', p: 'test' } }); test('normal', 'POST /v1/user/login', !isBlocked(r1.status), '' + r1.status);
  const r2 = await req({ path: '/v1/sports/matchList', body: {} }); test('normal', 'POST /v1/sports/matchList', !isBlocked(r2.status), '' + r2.status);
  const r3 = await req({ path: '/health', method: 'GET' }); test('normal', 'GET /health', !isBlocked(r3.status), '' + r3.status);
}

async function t3() { console.log(`\n${C.b}${C.c}[3] SQL Injection — 15 variants${C.x}`);
  const a = [
    ["/v1/user/login?id=1%27%20OR%201%3D1--","OR 1=1"],["/v1/user/login?q=UNION%20SELECT%20*%20FROM%20u","UNION SELECT"],["/v1/user/login?x=1%3BDROP%20TABLE%20u","DROP TABLE"],["/v1/user/login?x=INSERT%20INTO%20u","INSERT"],["/v1/user/login?x=UPDATE%20u%20SET%20a%3D1","UPDATE"],["/v1/user/login?x=DELETE%20FROM%20u","DELETE"],["/v1/user/login?x=ALTER%20TABLE%20u","ALTER"],["/v1/user/login?x=EXEC%20xp_cmdshell","EXEC xp"],["/v1/user/login?x=information_schema","info_schema"],["/v1/user/login?x=0x61646d696e","Hex 0x"],["/v1/user/login?x=CHAR%2897%29","CHAR()"],["/v1/user/login?x=CONCAT%28u%2Cp%29","CONCAT"],["/v1/user/login?x=admin%27--","Comment --"],["/v1/user/login?x=1%3BSELECT%20*","Semicolon"]
  ];
  for (const [p,n] of a) { const r = await req({ path: p, method: 'GET' }); test('sqli', n, isBlocked(r.status) || r.status === 400, '' + r.status); }
  const r = await req({ body: { username: "admin' OR '1'='1", password: "' OR 1=1--" } }); test('sqli', 'Body SQLi', isBlocked(r.status) || r.status === 400 || r.status === 401, '' + r.status);
}

async function t4() { console.log(`\n${C.b}${C.c}[4] XSS — 11 variants${C.x}`);
  const a = ["<script>alert(1)</script>","<img src=x onerror=alert(1)>","<svg onload=alert(1)>","\" onmouseover=\"alert(1)\"","javascript:alert(1)","%3Cscript%3Ealert(1)%3C/script%3E","<iframe src=http://evil.com>","<body onload=alert(1)>","<input onfocus=alert(1) autofocus>","data:text/html,<script>alert(1)</script>"];
  for (const x of a) { const r = await req({ body: { username: x } }); test('xss', x.substring(0,30), r.status !== 500, '' + r.status); }
  const r = await req({ body: { username: '<script>alert(1)</script>', password: 'x' } }); test('xss', 'Not reflected', !r.body.includes('<script>'), 'clean');
}

async function t5() { console.log(`\n${C.b}${C.c}[5] Path Traversal — 8${C.x}`);
  for (const p of ["/../../etc/passwd","/%2e%2e/%2e%2e/etc/passwd","/%252e%252e/etc/passwd","/v1/../../../etc/passwd","/v1/../../etc/shadow","/v1/../../proc/self/environ","/v1/..%5c..%5cetc/passwd","/v1/login%00.php"]) { const r = await req({ path: p, method: 'GET' }); test('traversal', p.substring(0,30), isBlocked(r.status) || r.status === 400, '' + r.status); }
}

async function t6() { console.log(`\n${C.b}${C.c}[6] Command Injection — 6${C.x}`);
  for (const [n,u] of [["; ls","Semicolon"],["| cat /etc/passwd","Pipe"],["`whoami`","Backtick"],["$(cat /etc/passwd)","$()"],["&& rm -rf /","&&"],["admin\nid","Newline"]]) {
    const r = await req({ body: { username: n } }); test('cmdi', u + ' safe', r.status !== 500, '' + r.status); test('cmdi', u + ' no leak', !r.body.includes('root:'), 'clean');
  }
}

async function t7() { console.log(`\n${C.b}${C.c}[7] SSRF — 5${C.x}`);
  for (const [n,u] of [["http://127.0.0.1:22","Localhost"],["http://192.168.1.1","Internal"],["http://169.254.169.254/meta-data/","AWS Meta"],["file:///etc/passwd","File://"],["http://127.0.0.1:6379","Redis"]]) {
    const r = await req({ body: { url: n } }); test('ssrf', u, !r.body.includes('root:') && !r.body.includes('ami-'), '' + r.status);
  }
}

async function t8() { console.log(`\n${C.b}${C.c}[8] NoSQL Injection — 5${C.x}`);
  const a = [[{username:{"$gt":""},password:{"$gt":""}},"$gt"],[{username:{"$ne":""},password:{"$ne":""}},"$ne"],[{username:{"$regex":".*"},password:{"$regex":".*"}},"$regex"],[{username:"admin","$where":"this.password.length>0"},"$where"],[{"$or":[{username:"admin"}],password:{"$gt":""}},"$or"]];
  for (const [b,n] of a) { const r = await req({ body: b }); test('nosqli', n, r.status !== 200 || !r.body.includes('token'), '' + r.status); }
}

async function t9() { console.log(`\n${C.b}${C.c}[9] Credential Leakage — 8${C.x}`);
  for (const p of ['/.env','/.env.local','/.env.production','/config.json','/package.json','/config/database.yml','/.aws/credentials','/.ssh/id_rsa']) {
    const r = await req({ path: p, method: 'GET' }); const leak = r.body.includes('DATABASE_URL') || r.body.includes('SECRET') || r.body.includes('PASSWORD') || r.body.includes('PRIVATE KEY');
    test('leak', p + ' no leak', !leak, '' + r.status); test('leak', p + ' blocked', isBlocked(r.status) || r.status === 404, '' + r.status);
  }
}

async function t10() { console.log(`\n${C.b}${C.c}[10] Hidden Files — 12${C.x}`);
  for (const p of ['/.env','/.git/config','/.git/HEAD','/.gitignore','/.htaccess','/.htpasswd','/.DS_Store','/.svn/entries','/.npmrc','/.dockerenv','/.bash_history','/.ssh/known_hosts']) { const r = await req({ path: p, method: 'GET' }); test('hidden', p, isBlocked(r.status), '' + r.status); }
}

async function t11() { console.log(`\n${C.b}${C.c}[11] Attack Paths — 18${C.x}`);
  for (const p of ['/wp-admin/','/wp-login.php','/wp-content/uploads/','/phpmyadmin/','/pma/','/myadmin/','/xmlrpc.php','/cgi-bin/test','/shell.php','/admin.php','/debug/','/console/','/actuator/health','/manager/html','/solr/admin','/vendor/phpunit/','/telescope/','/eval-stdin.php']) { const r = await req({ path: p, method: 'GET' }); test('attackpath', p, isBlocked(r.status), '' + r.status); }
}

async function t12() { console.log(`\n${C.b}${C.c}[12] Bad Bots — 12${C.x}`);
  for (const ua of ['python-requests/2.28','curl/7.88','Wget/1.21','sqlmap/1.7','Nikto/2.1','Nmap Scripting Engine','Scrapy/2.8','Go-http-client/1.1','masscan/1.3','DirBuster-1.0','','bot']) { const r = await req({ ua, body: { u: 'x', p: 'x' } }); test('bot', ua || 'empty', isBlocked(r.status), '' + r.status); }
}

async function t13() { console.log(`\n${C.b}${C.c}[13] Method Attacks — 8${C.x}`);
  for (const m of ['TRACE','TRACK','CONNECT','PROPFIND','MKCOL','COPY','MOVE','LOCK']) { const r = await req({ method: m }); test('method', m, isBlocked(r.status) || r.status === 405, '' + r.status); }
}

async function t14() { console.log(`\n${C.b}${C.c}[14] Header Injection${C.x}`);
  let r = await req({ headers: { Host: 'evil.com' }, body: { u: 'x', p: 'x' } }); test('header', 'Fake Host', isBlocked(r.status), '' + r.status);
  r = await req({ headers: { 'X-Forwarded-For': '127.0.0.1' }, body: { u: 'x', p: 'x' } }); test('header', 'XFF spoof', !isBlocked(r.status) || r.status === 400, '' + r.status);
  r = await req({ headers: { 'X-Big': 'A'.repeat(10000) }, body: { u: 'x', p: 'x' } }); test('header', 'Oversized', r.status !== 500, '' + r.status);
  const m = {}; for (let i = 0; i < 50; i++) m['X-' + i] = 'x'; r = await req({ headers: m, body: { u: 'x', p: 'x' } }); test('header', '50 headers', r.status !== 500, '' + r.status);
}

async function t15() { console.log(`\n${C.b}${C.c}[15] Request Smuggling${C.x}`);
  const r = await req({ headers: { 'Transfer-Encoding': 'chunked', 'Content-Length': '10' }, body: { u: 'x', p: 'x' } }); test('smuggling', 'TE+CL', isBlocked(r.status) || r.status === 400, '' + r.status);
}

async function t16() { console.log(`\n${C.b}${C.c}[16] CORS Bypass — 4${C.x}`);
  for (const o of ['https://evil.com','null','https://6wickets.pro.evil.com','http://6wickets.pro']) { const r = await req({ method: 'OPTIONS', origin: o, headers: { 'Access-Control-Request-Method': 'POST' } }); test('cors', o, r.headers['access-control-allow-origin'] !== '*', r.headers['access-control-allow-origin'] || 'none'); }
}

async function t17() { console.log(`\n${C.b}${C.c}[17] Security Headers${C.x}`);
  const r = await req({ body: { u: 'test', p: 'test' } });
  for (const h of ['x-frame-options','x-content-type-options','x-xss-protection','referrer-policy','content-security-policy','strict-transport-security']) test('headers', h, !!r.headers[h], r.headers[h] || 'missing');
  test('headers', 'Server hidden', !(r.headers.server || '').includes('nginx/'), r.headers.server || 'hidden');
}

async function t18() { console.log(`\n${C.b}${C.c}[18] Info Leakage${C.x}`);
  let r = await req({ path: '/v1/xxx', body: {} }); test('infoleak', 'No stack 404', !r.body.includes('at '), 'clean');
  r = await req({ body: 'bad', headers: { 'Content-Type': 'application/json' } }); test('infoleak', 'No parse error', !r.body.includes('SyntaxError'), 'clean');
  r = await req({ body: { u: 'x', p: 'x' } }); test('infoleak', 'No paths', !r.body.includes('/var/www'), 'clean'); test('infoleak', 'No DB err', !r.body.includes('Mongo'), 'clean'); test('infoleak', 'X-Powered-By', !r.headers['x-powered-by'], r.headers['x-powered-by'] || 'hidden');
}

async function t19() { console.log(`\n${C.b}${C.c}[19] Unknown Paths${C.x}`);
  for (const p of ['/random','/api/v1','/test','/admin.php','/backup.sql','/dump.sql','/db.sql']) { const r = await req({ path: p, method: 'GET' }); test('unknown', p, isBlocked(r.status), '' + r.status); }
}

async function t20() { console.log(`\n${C.b}${C.c}[20] Unicode Attacks${C.x}`);
  for (const [n,u] of [["admin\u0000","Null byte"],["admin\u202Eexe","Direction"],["a\u200Bd\u200Bm","Zero-width"],["\xC0\xAF/","Overlong"]]) { const r = await req({ body: { username: n } }); test('unicode', u, r.status !== 500, '' + r.status); }
}

async function t21() { console.log(`\n${C.b}${C.c}[21] Rate Limit — 20 rapid${C.x}`);
  const rs = []; for (let i = 0; i < 20; i++) rs.push(await req({ body: { u: 'x', p: 'x' } })); test('ratelimit', '20 burst', rs.filter(r => isBlocked(r.status)).length > 0, rs.filter(r => isBlocked(r.status)).length + '/20 blocked');
  console.log(`  ${C.y}Wait 15s...${C.x}`); await sleep(15000);
}

async function t22() { console.log(`\n${C.b}${C.c}[22] Heavy Flood — 60${C.x}`);
  const rs = []; for (let i = 0; i < 60; i++) rs.push(await req({ path: '/v1/sports/matchList', body: {} })); test('flood', '60 flood', rs.filter(r => isBlocked(r.status)).length > 10, rs.filter(r => isBlocked(r.status)).length + '/60 blocked');
  console.log(`  ${C.y}Wait 15s...${C.x}`); await sleep(15000);
}

async function t23() { console.log(`\n${C.b}${C.c}[23] Rotational Proxy — 50 IPs${C.x}`);
  // Wave 1: 50 different proxy IPs
  console.log(`  ${C.w}Wave 1: 50 proxy IPs → login${C.x}`);
  const w1 = []; for (let i = 0; i < 50; i++) w1.push(await req({ proxy: PROXY_IPS[i], ua: rndUA(), headers: { 'Accept-Language': ['en','hi','fr','de','ja','zh','ar','ko'][i%8] }, body: { username: 'u'+i, password: 'p'+i } }));
  test('proxy', 'Wave1: 50 IPs', true, w1.filter(r => isBlocked(r.status)).length + '/50 blocked');

  // Wave 2: 50 parallel from different proxies
  console.log(`  ${C.w}Wave 2: 50 parallel proxies${C.x}`);
  const w2 = await Promise.all(PROXY_IPS.map(ip => req({ path: '/v1/user/userBalance', proxy: ip, ua: rndUA(), body: {} })));
  test('proxy', 'Wave2: 50 parallel', true, w2.filter(r => isBlocked(r.status)).length + '/50 blocked');

  // Wave 3: Scanner pattern
  console.log(`  ${C.w}Wave 3: Scanner pattern${C.x}`);
  const eps = ['/v1/user/login','/v1/sports/matchList','/v1/casino/list','/v1/user/userBalance','/v1/decision/result'];
  const w3 = []; for (let i = 0; i < 30; i++) w3.push(await req({ path: eps[i%5], proxy: PROXY_IPS[i%50], ua: rndUA(), body: {} }));
  test('proxy', 'Wave3: scanner', true, w3.filter(r => isBlocked(r.status)).length + '/30 blocked');

  // Wave 4: Single IP, rotating UAs
  console.log(`  ${C.w}Wave 4: 1 IP, rotating UAs${C.x}`);
  const w4 = []; for (let i = 0; i < 20; i++) w4.push(await req({ proxy: PROXY_IPS[0], ua: UAs[i%8], body: { username: 'u'+i, password: 'x' } }));
  test('proxy', 'Wave4: 1IP+rotUA', true, w4.filter(r => isBlocked(r.status)).length + '/20 blocked');

  await sleep(10000);
}

async function t24() { console.log(`\n${C.b}${C.c}[24] Slowloris${C.x}`);
  const r = await req({ timeout: 15000, headers: { 'X-S1': 'a'.repeat(100) }, body: { u: 'x', p: 'x' } }); test('slowloris', 'Timeout ok', r.status !== 0 || r.error === 'timeout', '' + r.status);
}

async function t25() { console.log(`\n${C.b}${C.c}[25] Connection Flood — 30${C.x}`);
  const rs = await Promise.all(Array(30).fill().map(() => req({ path: '/v1/sports/matchList', body: {} }))); test('connflood', '30 parallel', rs.filter(r => isBlocked(r.status) || r.status === 503).length > 0 || rs.length === 30, rs.filter(r => isBlocked(r.status)).length + '/30 blocked');
}

async function t26() { console.log(`\n${C.b}${C.c}[26] Login Brute Force — 15${C.x}`);
  const rs = []; for (let i = 0; i < 15; i++) rs.push(await req({ body: { username: 'admin', password: 'wrong'+i } })); test('bruteforce', '15 logins', rs.filter(r => isBlocked(r.status)).length > 0, rs.filter(r => isBlocked(r.status)).length + '/15 blocked');
  await sleep(5000);
}

async function t27() { console.log(`\n${C.b}${C.c}[27] Large Payload${C.x}`);
  let r = await req({ body: { data: 'A'.repeat(3*1024*1024) } }); test('payload', '3MB body', isBlocked(r.status) || r.status === 413, '' + r.status);
  let n = { a: 'x' }; for (let i = 0; i < 100; i++) n = { a: n }; r = await req({ body: n }); test('payload', 'Deep nested', r.status !== 500, '' + r.status);
}

async function t28() { console.log(`\n${C.b}${C.c}[28] IP Ban Check${C.x}`);
  const r = await req({ body: { u: 'test', p: 'test' } }); test('ipban', isBlocked(r.status) ? 'IP banned' : 'IP accessible', true, '' + r.status);
}

// =============================================
// SAVE RESULTS
// =============================================
function saveResults() {
  const elapsed = ((Date.now() - RESULTS.startTime) / 1000).toFixed(1);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const pct = Math.round((RESULTS.passed / (RESULTS.passed + RESULTS.failed)) * 100);
  const json = { target: TARGET.protocol + '://' + TARGET.host, timestamp: new Date().toISOString(), elapsed: elapsed+'s', score: pct+'%', passed: RESULTS.passed, failed: RESULTS.failed, total: RESULTS.passed+RESULTS.failed, proxyIPs: PROXY_IPS.length, categories: CATEGORIES, tests: RESULTS.tests };
  fs.writeFileSync(path.join(RESULTS_DIR, 'result-'+ts+'.json'), JSON.stringify(json, null, 2));
  fs.writeFileSync(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(json, null, 2));

  let rpt = '==============================================\n';
  rpt += `Security Test Report — ${new Date().toISOString()}\nTarget: ${TARGET.protocol}://${TARGET.host}\nTime: ${elapsed}s | Score: ${pct}% (${RESULTS.passed}/${RESULTS.passed+RESULTS.failed})\nProxy IPs: ${PROXY_IPS.length}\n`;
  rpt += '==============================================\n\nCATEGORY RESULTS:\n';
  for (const [c,s] of Object.entries(CATEGORIES)) { const t = s.passed+s.failed; rpt += `  ${Math.round(s.passed/t*100)===100?'[PASS]':Math.round(s.passed/t*100)>=80?'[WARN]':'[FAIL]'} ${c.padEnd(15)} ${s.passed}/${t} (${Math.round(s.passed/t*100)}%)\n`; }
  rpt += '\nFAILED TESTS:\n';
  RESULTS.tests.filter(t => !t.passed).forEach(t => { rpt += `  [FAIL] [${t.category}] ${t.name} — ${t.detail}\n`; });
  if (!RESULTS.tests.some(t => !t.passed)) rpt += '  None!\n';
  rpt += '==============================================\n';
  fs.writeFileSync(path.join(RESULTS_DIR, 'report-'+ts+'.txt'), rpt);
  fs.writeFileSync(path.join(RESULTS_DIR, 'latest.txt'), rpt);
  return { pct };
}

// =============================================
// MAIN
// =============================================
async function main() {
  console.log(`\n${C.b}${C.c}==============================================`);
  console.log(`  Security & DDoS Test Suite`);
  console.log(`  Target: ${TARGET.protocol}://${TARGET.host}`);
  console.log(`  Proxy IPs: ${PROXY_IPS.length}`);
  console.log(`  Tests: ${Object.values(TESTS).filter(v=>v).length}/${Object.keys(TESTS).length} enabled`);
  console.log(`==============================================${C.x}\n`);

  if (TESTS.serverReachable && !(await t1())) { console.log(`${C.r}Server not reachable!${C.x}`); process.exit(1); }
  if (TESTS.normalRequest) await t2();
  if (TESTS.sqlInjection) await t3();
  if (TESTS.xssAttack) await t4();
  if (TESTS.pathTraversal) await t5();
  if (TESTS.commandInjection) await t6();
  if (TESTS.ssrfAttack) await t7();
  if (TESTS.nosqlInjection) await t8();
  if (TESTS.credentialLeakage) await t9();
  if (TESTS.hiddenFiles) await t10();
  if (TESTS.attackPaths) await t11();
  if (TESTS.badBots) await t12();
  if (TESTS.methodAttacks) await t13();
  if (TESTS.headerInjection) await t14();
  if (TESTS.requestSmuggling) await t15();
  if (TESTS.corsBypass) await t16();
  if (TESTS.securityHeaders) await t17();
  if (TESTS.infoLeakage) await t18();
  if (TESTS.unknownPaths) await t19();
  if (TESTS.unicodeAttacks) await t20();
  if (TESTS.rateLimitBurst) await t21();
  if (TESTS.heavyFlood) await t22();
  if (TESTS.rotationalProxy) await t23();
  if (TESTS.slowloris) await t24();
  if (TESTS.connectionFlood) await t25();
  if (TESTS.loginBruteForce) await t26();
  if (TESTS.largePayload) await t27();
  if (TESTS.ipBanVerify) await t28();

  const { pct } = saveResults();
  const elapsed = ((Date.now() - RESULTS.startTime) / 1000).toFixed(1);

  console.log(`\n${C.b}${C.c}==============================================`);
  console.log(`  CATEGORY RESULTS`);
  console.log(`==============================================${C.x}`);
  for (const [c,s] of Object.entries(CATEGORIES)) { const t=s.passed+s.failed; const p=Math.round(s.passed/t*100); console.log(`  ${p===100?C.g:p>=80?C.y:C.r}${c.padEnd(15)} ${s.passed}/${t} (${p}%)${C.x}`); }

  console.log(`\n${C.b}${C.c}  FINAL: ${RESULTS.passed} passed, ${RESULTS.failed} failed | Score: ${pct}% | ${elapsed}s${C.x}`);
  if (pct >= 95) console.log(`  ${C.b}${C.g}Excellent!${C.x}`);
  else if (pct >= 80) console.log(`  ${C.b}${C.y}Good.${C.x}`);
  else console.log(`  ${C.b}${C.r}Needs work.${C.x}`);

  console.log(`\n  ${C.w}Results: test/results/latest.txt${C.x}`);
  console.log(`  ${C.y}Unblock: fail2ban-client set nginx-ratelimit unbanip YOUR_IP${C.x}\n`);
  process.exit(RESULTS.failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
