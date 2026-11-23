/**
 * Load Testing Script — Important APIs + Crons
 *
 * Usage:
 *   node loadtest.js
 *
 * .env me set karo:
 *   LOADTEST_USERNAME=your_username
 *   LOADTEST_PASSWORD=your_password
 *   LOADTEST_DOMAIN=your_domain (optional)
 *   LOADTEST_DURATION=10 (seconds, default 10)
 *   LOADTEST_CONNECTIONS=50 (concurrent users, default 50)
 */

require("dotenv").config();
const autocannon = require("autocannon");
const http = require("http");

const BASE_URL = `http://localhost:${process.env.PORT || 5001}`;
const USERNAME = process.env.LOADTEST_USERNAME;
const PASSWORD = process.env.LOADTEST_PASSWORD;
const DOMAIN = process.env.LOADTEST_DOMAIN || "";
const DURATION = parseInt(process.env.LOADTEST_DURATION) || 10;
const CONNECTIONS = parseInt(process.env.LOADTEST_CONNECTIONS) || 50;

let AUTH_TOKEN = "";

// ─── colors for terminal ───
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─── helper: make HTTP request ───
const makeRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (AUTH_TOKEN) options.headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ─── login and get token ───
const login = async () => {
  if (!USERNAME || !PASSWORD) {
    console.error(c.red("ERROR: LOADTEST_USERNAME and LOADTEST_PASSWORD set karo .env me"));
    process.exit(1);
  }
  console.log(c.cyan(`\nLogging in as: ${USERNAME}...`));
  const body = { username: USERNAME, password: PASSWORD };
  if (DOMAIN) body.domain = DOMAIN;

  const res = await makeRequest("POST", "/v1/user/login", body);
  if (res.error) {
    console.error(c.red(`Login failed: ${res.message}`));
    process.exit(1);
  }
  AUTH_TOKEN = res.data?.token || res.data?.jwtToken || res.token;
  if (!AUTH_TOKEN) {
    console.error(c.red("Login response me token nahi mila:"), JSON.stringify(res).slice(0, 200));
    process.exit(1);
  }
  console.log(c.green("Login successful! Token received.\n"));
  return res;
};

// ─── run autocannon test ───
const runTest = (name, opts) => {
  return new Promise((resolve) => {
    console.log(c.bold(`\n━━━ ${name} ━━━`));
    console.log(c.dim(`  ${opts.method || "GET"} ${opts.url} | ${CONNECTIONS} connections | ${DURATION}s`));

    const instance = autocannon({
      url: opts.url,
      method: opts.method || "POST",
      duration: DURATION,
      connections: CONNECTIONS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    autocannon.track(instance, { renderProgressBar: false });

    instance.on("done", (result) => {
      const status = result.non2xx > result["2xx"] ? "WARN" : "OK";
      const statusColor = status === "OK" ? c.green : c.red;

      console.log(`  ${statusColor(status)} | ` +
        `Req/sec: ${c.cyan(result.requests.average)} | ` +
        `Latency avg: ${c.yellow(result.latency.average + "ms")} | ` +
        `p99: ${c.yellow(result.latency.p99 + "ms")} | ` +
        `2xx: ${c.green(result["2xx"])} | ` +
        `non-2xx: ${result.non2xx > 0 ? c.red(result.non2xx) : result.non2xx} | ` +
        `Errors: ${result.errors > 0 ? c.red(result.errors) : result.errors} | ` +
        `Throughput: ${c.dim(Math.round(result.throughput.average / 1024) + " KB/s")}`
      );

      resolve({
        name,
        reqPerSec: result.requests.average,
        latencyAvg: result.latency.average,
        latencyP99: result.latency.p99,
        success: result["2xx"],
        fail: result.non2xx,
        errors: result.errors,
        throughput: Math.round(result.throughput.average / 1024),
      });
    });
  });
};

// ─── test definitions ───
const getTests = () => [
  // AUTH
  {
    name: "1. Login API",
    opts: {
      url: `${BASE_URL}/v1/user/login`,
      method: "POST",
      body: { username: USERNAME, password: PASSWORD, domain: DOMAIN },
    },
  },
  // USER
  {
    name: "2. User Balance",
    opts: { url: `${BASE_URL}/v1/user/userBalance`, method: "POST", body: {} },
  },
  {
    name: "3. User List",
    opts: { url: `${BASE_URL}/v1/user/userList`, method: "POST", body: {} },
  },
  {
    name: "4. User Details",
    opts: { url: `${BASE_URL}/v1/user/userDetails`, method: "POST", body: {} },
  },
  {
    name: "5. User Ledger",
    opts: { url: `${BASE_URL}/v1/user/userLedger`, method: "POST", body: {} },
  },
  {
    name: "6. User Statement",
    opts: { url: `${BASE_URL}/v1/user/userStatement`, method: "POST", body: {} },
  },
  {
    name: "7. Exposure Data List",
    opts: { url: `${BASE_URL}/v1/user/exposureDataList`, method: "POST", body: {} },
  },
  // SPORTS & BETTING
  {
    name: "8. Match List (Public)",
    opts: { url: `${BASE_URL}/v1/sports/matchList`, method: "POST", body: {} },
  },
  {
    name: "9. Bets List",
    opts: { url: `${BASE_URL}/v1/sports/betsList`, method: "POST", body: {} },
  },
  {
    name: "10. Casino Bet List",
    opts: { url: `${BASE_URL}/v1/sports/casinoBetList`, method: "POST", body: {} },
  },
  {
    name: "11. Session List",
    opts: { url: `${BASE_URL}/v1/sports/getSessionList`, method: "POST", body: {} },
  },
  // REPORTS
  {
    name: "12. User Profit Loss",
    opts: { url: `${BASE_URL}/v1/reports/userProfitLoss`, method: "POST", body: {} },
  },
  {
    name: "13. Chip Summary",
    opts: { url: `${BASE_URL}/v1/reports/chipSummary`, method: "POST", body: {} },
  },
  {
    name: "14. Company Report",
    opts: { url: `${BASE_URL}/v1/reports/companyReport`, method: "POST", body: {} },
  },
  // CASINO
  {
    name: "15. Diamond Casino Data",
    opts: { url: `${BASE_URL}/v1/casino/getDiamondCasinoData`, method: "POST", body: {} },
  },
  {
    name: "16. Diamond Bets List",
    opts: { url: `${BASE_URL}/v1/casino/diamondBetsList`, method: "POST", body: {} },
  },
  // DASHBOARD
  {
    name: "17. Dashboard",
    opts: { url: `${BASE_URL}/v1/userReport/dashboard`, method: "POST", body: {} },
  },
  // LOGIN ACTIVITY
  {
    name: "18. Login Activity",
    opts: { url: `${BASE_URL}/v1/user/userLoginActivity`, method: "POST", body: {} },
  },
];

// ─── cron function tests ───
const testCrons = async () => {
  console.log(c.bold("\n\n╔══════════════════════════════════════╗"));
  console.log(c.bold("║        CRON JOBS TEST                ║"));
  console.log(c.bold("╚══════════════════════════════════════╝"));

  const results = [];

  // Test saveSportsList cron
  try {
    console.log(c.cyan("\n1. saveSportsList Cron"));
    const start = Date.now();
    const BetService = require("./Services/Sports/Bet.service");
    if (BetService.saveSportsList) {
      await Promise.race([
        BetService.saveSportsList(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout 30s")), 30000)),
      ]);
      const time = Date.now() - start;
      console.log(`  ${c.green("PASS")} | Time: ${c.yellow(time + "ms")}`);
      results.push({ name: "saveSportsList", status: "PASS", time });
    } else {
      console.log(`  ${c.yellow("SKIP")} | Function not exported`);
      results.push({ name: "saveSportsList", status: "SKIP", time: 0 });
    }
  } catch (e) {
    console.log(`  ${c.red("FAIL")} | ${e.message}`);
    results.push({ name: "saveSportsList", status: "FAIL", time: 0 });
  }

  // Test throughFancyBookmakerBySocket
  try {
    console.log(c.cyan("\n2. throughFancyBookmakerBySocket Cron"));
    const start = Date.now();
    const cronController = require("./Controllers/cron.controller.js");
    if (cronController.throughFancyBookmakerBySocket) {
      await Promise.race([
        cronController.throughFancyBookmakerBySocket({ body: {} }, { json: () => {}, status: () => ({ json: () => {} }) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout 30s")), 30000)),
      ]);
      const time = Date.now() - start;
      console.log(`  ${c.green("PASS")} | Time: ${c.yellow(time + "ms")}`);
      results.push({ name: "throughFancyBookmakerBySocket", status: "PASS", time });
    } else {
      console.log(`  ${c.yellow("SKIP")} | Function not exported`);
      results.push({ name: "throughFancyBookmakerBySocket", status: "SKIP", time: 0 });
    }
  } catch (e) {
    console.log(`  ${c.red("FAIL")} | ${e.message}`);
    results.push({ name: "throughFancyBookmakerBySocket", status: "FAIL", time: 0 });
  }

  return results;
};

// ─── main ───
const main = async () => {
  console.log(c.bold("╔══════════════════════════════════════╗"));
  console.log(c.bold("║     API LOAD TESTING SUITE           ║"));
  console.log(c.bold("╚══════════════════════════════════════╝"));
  console.log(c.dim(`Config: ${CONNECTIONS} connections | ${DURATION}s duration | ${BASE_URL}\n`));

  // Step 1: Login
  await login();

  // Step 2: Run API load tests sequentially
  const tests = getTests();
  const results = [];
  for (const test of tests) {
    try {
      const result = await runTest(test.name, test.opts);
      results.push(result);
    } catch (e) {
      console.log(`  ${c.red("ERROR")}: ${e.message}`);
      results.push({ name: test.name, reqPerSec: 0, latencyAvg: 0, latencyP99: 0, success: 0, fail: 0, errors: 1, throughput: 0 });
    }
  }

  // Step 3: Cron tests
  const cronResults = await testCrons();

  // Step 4: Summary table
  console.log(c.bold("\n\n╔══════════════════════════════════════════════════════════════════════════════════════╗"));
  console.log(c.bold("║                              LOAD TEST SUMMARY                                     ║"));
  console.log(c.bold("╚══════════════════════════════════════════════════════════════════════════════════════╝\n"));

  console.log("┌─────────────────────────────────┬──────────┬────────────┬────────────┬─────────┬─────────┬──────────┐");
  console.log("│ API                             │ Req/sec  │ Latency    │ P99        │ 2xx     │ Errors  │ KB/s     │");
  console.log("├─────────────────────────────────┼──────────┼────────────┼────────────┼─────────┼─────────┼──────────┤");

  for (const r of results) {
    const name = r.name.padEnd(31).slice(0, 31);
    const rps = String(r.reqPerSec).padStart(8);
    const lat = (r.latencyAvg + "ms").padStart(10);
    const p99 = (r.latencyP99 + "ms").padStart(10);
    const ok = String(r.success).padStart(7);
    const err = String(r.errors + r.fail).padStart(7);
    const tp = (r.throughput + "").padStart(8);
    console.log(`│ ${name} │ ${rps} │ ${lat} │ ${p99} │ ${ok} │ ${err} │ ${tp} │`);
  }

  console.log("└─────────────────────────────────┴──────────┴────────────┴────────────┴─────────┴─────────┴──────────┘");

  // Cron summary
  console.log(c.bold("\nCron Jobs:"));
  for (const cr of cronResults) {
    const icon = cr.status === "PASS" ? c.green("PASS") : cr.status === "SKIP" ? c.yellow("SKIP") : c.red("FAIL");
    console.log(`  ${icon} | ${cr.name} | ${cr.time}ms`);
  }

  // Performance warnings
  console.log(c.bold("\n\nPerformance Warnings:"));
  let warnings = 0;
  for (const r of results) {
    if (r.latencyAvg > 500) {
      console.log(c.red(`  ⚠ ${r.name}: Avg latency ${r.latencyAvg}ms (should be <500ms)`));
      warnings++;
    }
    if (r.latencyP99 > 2000) {
      console.log(c.red(`  ⚠ ${r.name}: P99 latency ${r.latencyP99}ms (should be <2000ms)`));
      warnings++;
    }
    if (r.fail > r.success * 0.05) {
      console.log(c.red(`  ⚠ ${r.name}: ${r.fail} non-2xx responses (>5% failure rate)`));
      warnings++;
    }
  }
  if (warnings === 0) console.log(c.green("  None! All APIs performing well."));

  console.log("\n" + c.dim("Done. Exiting..."));
  process.exit(0);
};

main().catch((e) => {
  console.error(c.red("Fatal error:"), e);
  process.exit(1);
});
