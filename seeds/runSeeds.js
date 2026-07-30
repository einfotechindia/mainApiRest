/**
 * Seed Runner
 *
 * Usage:
 *   node seeds/runSeeds.js                          → Seed available pages only
 *   node seeds/runSeeds.js --ownerId=<id>           → Seed pages + designations for owner
 *   node seeds/runSeeds.js --all --ownerId=<id>     → Seed everything
 *   node seeds/runSeeds.js --pages                  → Seed available pages only
 *   node seeds/runSeeds.js --designations --ownerId=<id>  → Seed designations only
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { seedAvailablePages } = require("./availablePages.seed");
const { seedDesignations } = require("./designations.seed");
const { seedFancyManager } = require("./fancyManager.seed");

// Parse CLI args
const args = process.argv.slice(2);
const flags = {};
args.forEach(arg => {
  if (arg.startsWith("--")) {
    const [key, val] = arg.substring(2).split("=");
    flags[key] = val || true;
  }
});

async function run() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error("DATABASE_URL not found in .env");
      process.exit(1);
    }

    console.log("Connecting to database...");
    await mongoose.connect(dbUrl);
    console.log("Connected!\n");

    const runPages = flags.all || flags.pages || (!flags.designations && !flags.fancyManager);
    const runDesignations = flags.all || flags.designations;
    const runFancyManager = flags.all || flags.fancyManager;

    console.log("Running seeds...\n");

    if (runPages) {
      await seedAvailablePages();
    }

    if (runDesignations) {
      if (!flags.ownerId) {
        // Try to find first owner from User collection
        const UserModel = require("../Models/User/User.model");
        const owner = await UserModel.findOne({ userType: "owner", isDeleted: false }).lean();
        if (owner) {
          console.log(`  Auto-detected owner: ${owner.username} (${owner._id})`);
          await seedDesignations(owner._id);
        } else {
          console.log("  No owner found. Use --ownerId=<id> to seed designations.");
        }
      } else {
        await seedDesignations(flags.ownerId);
      }
    }

    if (runFancyManager) {
      await seedFancyManager();
    }

    console.log("\nSeeds completed!");
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  }
}

run();
