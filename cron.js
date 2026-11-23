var cron = require("node-cron");
const db = require("./Models/Connection");
const {
  saveResult,
  betsResultOfClient,
  saveResultRedis,
  saveAvaitorResults,
  generateDiamondLedger,
  saveResultRedisVirtual,
  saveBetfairCasinoResults
} = require("./Controllers/diamondCasino/diamondResult.Controller");
const { saveSportsList } = require("./Services/Sports/Bet.service");
const {
  automaticBetfairDecision,
  fancyAutomaticDecision
} = require("./Controllers/Bets/Decision.controller");

const {
  distributeBonusToUpperline,
} = require("./Controllers/Bets/Website.controller");


const {
  throughFancyBookmakerBySocket,
} = require("./Controllers/cron.controller");

const fs = require("fs");

db.initialize();
const lockFilePath = "cron.lock";

cron.schedule("*/10 * * * *", async () => {
  if (fs.existsSync(lockFilePath)) {
    console.log(
      "Another instance is already running the cron job. Skipping..."
    );
    return;
  }
  try {
    fs.writeFileSync(lockFilePath, "locked");
    await saveSportsList();
  } catch (error) {
    console.error("Error in cron job:", error);
  } finally {
    fs.unlinkSync(lockFilePath);
  }
});


let isRunning = false;
let pending = false;

async function runGenerateDiamondLedger(trigger = "cron") {
  if (isRunning) {
    pending = true;
    console.log(`[diamond-ledger] SKIP (${trigger}): already running. Will run once after finish.`);
    return;
  }

  isRunning = true;
  const runId = `diamond-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const startedAt = Date.now();

  console.log(`[diamond-ledger] START runId=${runId} trigger=${trigger}`);

  try {
    await generateDiamondLedger({ body: {}, cronMeta: { runId } }, null);
    console.log(`[diamond-ledger] DONE runId=${runId} tookMs=${Date.now() - startedAt}`);
  } catch (err) {
    console.error(
      `[diamond-ledger] ERROR runId=${runId} tookMs=${Date.now() - startedAt}\n` +
      `message=${err?.message}\nstack=${err?.stack}`
    );
  } finally {
    isRunning = false;
    if (pending) {
      pending = false;
      setImmediate(() => runGenerateDiamondLedger("pending"));
    }
  }
}


// cron.schedule("*/5 * * * * *", async () => {
//   console.log("Running cron job... at every 5 sec");
//   await saveResultRedis();
// });

// cron.schedule("*/60 * * * * *", async () => {
//   console.log("Running cron job for saveResultRedisVirtual... at every 5 sec");
//   await saveResultRedisVirtual();
// });

// cron.schedule("*/5 * * * * *", async () => {
//   console.log("Running cron job for saveBetfairCasinoResults... at every 5 sec");
//   await saveBetfairCasinoResults();
// });

// cron.schedule("*/1 * * * *", () => {
//   console.log("[diamond-ledger] Cron tick (every 1 minute)");
//   runGenerateDiamondLedger("cron"); // do NOT await inside schedule callback
// });

// cron.schedule('*/2 * * * *', async () => {
//   console.log("Running cron job for automaticBetfairDecision... every 2 minutes");
//   await automaticBetfairDecision();
// });

// cron.schedule('*/2 * * * *', async () => {
//   console.log("Running cron job for automaticBetfairDecision... every 2 minutes");
//   await fancyAutomaticDecision();
// });



// cron.schedule("58 23 * * *", async () => {
//   console.log("Running cron job... at 11:58 PM");
//   await distributeBonusToUpperline();
// });

// cron.schedule("*/30 * * * * *", async () => {
//   console.log("Running cron job... at every 5 sec");
//   await saveAvaitorResults();
// });



// bookmaker And Fancy
  // setInterval(() => {
  //     throughFancyBookmakerBySocket("" , "" , "keno");
  // },  500);


