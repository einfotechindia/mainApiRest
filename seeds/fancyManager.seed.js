const FancyManagerModel = require("../Models/FancyManager/FancyManager.model");

const DEFAULT_FANCY_CONFIGS = [
  // ─── Normal Fancies ───
  { name: "Over Runs", keywords: ["OVER", "OVERS"], category: "normal", maxBet: 100000, betDelay: 0, commission: false },
  { name: "Boundaries", keywords: ["BOUNDARY", "BOUNDARIES", "4S", "FOURS"], category: "normal", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Sixes", keywords: ["SIX", "SIXES", "6S"], category: "normal", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Wickets", keywords: ["WICKET", "WICKETS", "WKT"], category: "normal", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Run Outs", keywords: ["RUNOUT", "RUN OUT", "RUN-OUT"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "Caught Outs", keywords: ["CAUGHT", "CATCH", "CATCHES"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "Bowled", keywords: ["BOWLED", "BOLD"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "LBW", keywords: ["LBW"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "Wides", keywords: ["WIDE", "WIDES"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "No Balls", keywords: ["NOBALL", "NO BALL", "NO-BALL"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "Extras", keywords: ["EXTRA", "EXTRAS"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },
  { name: "Player Runs", keywords: ["PLAYER", "BATSMAN", "BATTER"], category: "normal", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Partnership", keywords: ["PARTNERSHIP", "PSHIP"], category: "normal", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Dot Balls", keywords: ["DOT", "DOTBALL", "DOTBALLS"], category: "normal", maxBet: 30000, betDelay: 0, commission: false },

  // ─── Extra Fancies ───
  { name: "Total Match Runs", keywords: ["TOTAL", "MATCH TOTAL"], category: "extra", maxBet: 100000, betDelay: 0, commission: false },
  { name: "Highest Over", keywords: ["HIGHEST"], category: "extra", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Powerplay Runs", keywords: ["POWERPLAY", "PP"], category: "extra", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Death Over Runs", keywords: ["DEATH"], category: "extra", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Most Runs", keywords: ["MOST"], category: "extra", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Top Batsman", keywords: ["TOP"], category: "extra", maxBet: 50000, betDelay: 0, commission: false },
  { name: "Fall of Wicket", keywords: ["FALL", "FOW", "FALL OF"], category: "extra", maxBet: 50000, betDelay: 2, commission: false },

  // ─── Cricket Casino ───
  { name: "Cricket Casino", keywords: ["CRICKETCASINO", "CRICKET CASINO"], category: "cricketCasino", maxBet: 25000, betDelay: 0, commission: false },

  // ─── Odd Even ───
  { name: "Odd Even", keywords: ["ODDEVEN", "ODD EVEN", "ODD/EVEN"], category: "oddEven", maxBet: 25000, betDelay: 0, commission: false },
];

async function seedFancyManager() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const config of DEFAULT_FANCY_CONFIGS) {
    const existing = await FancyManagerModel.findOne({ name: config.name, isDeleted: false });
    if (existing) {
      const keywordsChanged = JSON.stringify(existing.keywords) !== JSON.stringify(config.keywords);
      if (keywordsChanged || existing.category !== config.category) {
        await FancyManagerModel.updateOne({ _id: existing._id }, config);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await FancyManagerModel.create({ ...config, status: false });
      created++;
    }
  }

  console.log(`  Fancy Manager: ${created} created, ${updated} updated, ${skipped} unchanged`);

  // Sync to Redis after seed
  try {
    const { client } = require("../Helpers/RedisHelper");
    const allConfigs = await FancyManagerModel.find({ isDeleted: false }).lean();
    await client.set("fancyManagerConfig", JSON.stringify(allConfigs));
    console.log(`  Fancy Manager: ${allConfigs.length} configs synced to Redis`);
  } catch (err) {
    console.log("  Fancy Manager: Redis sync skipped (not connected)");
  }

  return { created, updated, skipped };
}

module.exports = { seedFancyManager, DEFAULT_FANCY_CONFIGS };
