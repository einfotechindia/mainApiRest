const AvailablePageModel = require("../Models/Staff/AvailablePage.model");

const PAGES_DATA = [
  // ─── General ───
  { key: "dashboard", label: "Dashboard", group: "General", sortOrder: 1 },
  { key: "notification", label: "Notification", group: "General", sortOrder: 2 },
  { key: "websiteSettings", label: "Website Settings", group: "General", sortOrder: 3 },
  { key: "userExposure", label: "User Exposure", group: "General", sortOrder: 4 },
  { key: "cloudflare", label: "Cloudflare Security", group: "General", sortOrder: 5 },
  { key: "healthRoutes", label: "Health Routes", group: "General", sortOrder: 6 },
  { key: "serverMonitor", label: "Server Monitor", group: "General", sortOrder: 7 },

  // ─── Match ───
  { key: "undeclareMatchBetList", label: "Undeclare Bet List", group: "Match", sortOrder: 10 },
  { key: "matchEdit", label: "Match Edit", group: "Match", sortOrder: 11 },
  { key: "fancyDecision", label: "Fancy Decision", group: "Match", sortOrder: 12 },
  { key: "rollbackFancy", label: "Rollback Fancy", group: "Match", sortOrder: 13 },
  { key: "sessionBetList", label: "Session Bet List", group: "Match", sortOrder: 14 },
  { key: "oddBetList", label: "Odd Bet List", group: "Match", sortOrder: 15 },

  // ─── Fancy Manager ───
  { key: "fancyManager", label: "Fancy Manager", group: "Match", sortOrder: 16 },

  // ─── Diamond Casino ───
  { key: "diamondCasino", label: "Diamond Casino", group: "Diamond Casino", sortOrder: 20 },
  { key: "diamondCasinoDeclare", label: "Diamond Casino Declare", group: "Diamond Casino", sortOrder: 21 },
  { key: "diamondCasinoReDeclare", label: "Diamond Casino Re-Declare", group: "Diamond Casino", sortOrder: 22 },
  { key: "diamondBetList", label: "Diamond Bet List", group: "Diamond Casino", sortOrder: 23 },
  { key: "undeclareDiamondBetList", label: "Undeclare Diamond Bet List", group: "Diamond Casino", sortOrder: 24 },
  { key: "diamondLedger", label: "Diamond Ledger", group: "Diamond Casino", sortOrder: 25 },

  // ─── Int. Casino ───
  { key: "intCasino", label: "Int. Casino", group: "Int. Casino", sortOrder: 30 },
  { key: "intBetList", label: "Int. Bet List", group: "Int. Casino", sortOrder: 31 },
  { key: "intCasinoCategory", label: "Int. Casino Category", group: "Int. Casino", sortOrder: 32 },
  { key: "unsettledIntBetList", label: "Unsettled Int. Bet List", group: "Int. Casino", sortOrder: 33 },
  { key: "intLedger", label: "Int. Ledger", group: "Int. Casino", sortOrder: 34 },

  // ─── Matka ───
  { key: "matka", label: "Matka", group: "Matka", sortOrder: 40 },
  { key: "matkaResultDeclare", label: "Matka Result Declare", group: "Matka", sortOrder: 41 },
  { key: "matkaGameType", label: "Matka Game Type", group: "Matka", sortOrder: 42 },
  { key: "matkaBetList", label: "Matka Bet List", group: "Matka", sortOrder: 43 },

  // ─── Settings - General ───
  { key: "settings_commonSetting", label: "Common Setting", group: "Settings - General", sortOrder: 50 },
  { key: "settings_getTransaction", label: "Get Transaction", group: "Settings - General", sortOrder: 51 },
  { key: "settings_negativeUsers", label: "Negative Users", group: "Settings - General", sortOrder: 52 },
  { key: "settings_userExposureList", label: "User Exposure List", group: "Settings - General", sortOrder: 53 },

  // ─── Settings - Operations ───
  { key: "settings_diamondVideo", label: "Diamond Video", group: "Settings - Operations", sortOrder: 54 },
  { key: "settings_gapCasinoList", label: "Gap Casino List", group: "Settings - Operations", sortOrder: 55 },
  { key: "settings_rollbackFancies", label: "Roll Back Fancies", group: "Settings - Operations", sortOrder: 56 },
  { key: "settings_distributeBonus", label: "Distribute Bonus", group: "Settings - Operations", sortOrder: 57 },

  // ─── Settings - Monitoring ───
  { key: "settings_loginActivity", label: "Login Activity", group: "Settings - Monitoring", sortOrder: 58 },
  { key: "settings_loggedInClients", label: "Logged In Clients", group: "Settings - Monitoring", sortOrder: 59 },
  { key: "settings_activeClients", label: "Active Clients", group: "Settings - Monitoring", sortOrder: 60 },
  { key: "settings_checkIpAddress", label: "Check IP Address", group: "Settings - Monitoring", sortOrder: 61 },
  { key: "settings_usersTracking", label: "Users Tracking", group: "Settings - Monitoring", sortOrder: 62 },

  // ─── Settings - Danger ───
  { key: "settings_flushRedis", label: "Flush Redis", group: "Settings - Danger", sortOrder: 63 },
  { key: "settings_forceLogout", label: "Force Logout", group: "Settings - Danger", sortOrder: 64 },
  { key: "settings_exposureUpdate", label: "Exposure Update", group: "Settings - Danger", sortOrder: 65 },
  { key: "settings_passwordReset", label: "Password Reset", group: "Settings - Danger", sortOrder: 66 },

  // ─── Admin ───
  { key: "staffManagement", label: "Staff Management", group: "Admin", sortOrder: 90 },
  { key: "rolesPermissions", label: "Roles & Permissions", group: "Admin", sortOrder: 91 },
  { key: "staffActivity", label: "Staff Activity Log", group: "Admin", sortOrder: 92 },
];

async function seedAvailablePages() {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const page of PAGES_DATA) {
    const existing = await AvailablePageModel.findOne({ key: page.key });
    if (existing) {
      // Update if label/group/sortOrder changed
      if (existing.label !== page.label || existing.group !== page.group || existing.sortOrder !== page.sortOrder) {
        await AvailablePageModel.updateOne({ key: page.key }, page);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await AvailablePageModel.create(page);
      created++;
    }
  }

  console.log(`  Available Pages: ${created} created, ${updated} updated, ${skipped} unchanged`);
  return { created, updated, skipped };
}

module.exports = { seedAvailablePages, PAGES_DATA };
