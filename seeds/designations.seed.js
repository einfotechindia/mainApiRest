const DesignationModel = require("../Models/Staff/Designation.model");
const { PAGES_DATA } = require("./availablePages.seed");

// Build full permission object for all pages
function buildPermissions(options = {}) {
  const { allActions = false, viewOnly = false, include = null, exclude = null } = options;
  const permissions = {};

  let pages = PAGES_DATA;
  if (include) {
    pages = pages.filter(p => include.some(pattern => {
      if (pattern.endsWith("*")) return p.key.startsWith(pattern.slice(0, -1));
      return p.key === pattern;
    }));
  }
  if (exclude) {
    pages = pages.filter(p => !exclude.some(pattern => {
      if (pattern.endsWith("*")) return p.key.startsWith(pattern.slice(0, -1));
      return p.key === pattern;
    }));
  }

  for (const page of pages) {
    if (allActions) {
      permissions[page.key] = { view: true, create: true, update: true, delete: true };
    } else if (viewOnly) {
      permissions[page.key] = { view: true, create: false, update: false, delete: false };
    }
  }

  return permissions;
}

// ─── Default Designation Templates ───
const DESIGNATION_TEMPLATES = [
  {
    name: "Super Admin",
    permissions: buildPermissions({ allActions: true }),
  },
  {
    name: "Manager",
    permissions: buildPermissions({
      allActions: true,
      exclude: ["staffManagement", "rolesPermissions", "cloudflare", "healthRoutes", "serverMonitor", "settings_flushRedis"],
    }),
  },
  {
    name: "Operator",
    permissions: (() => {
      // Operators get full CRUD on casino/match/matka operations, view on rest
      const perms = {};
      const fullAccessGroups = ["Diamond Casino", "Int. Casino", "Matka", "Match"];
      const viewOnlyGroups = ["General", "Settings"];

      for (const page of PAGES_DATA) {
        if (fullAccessGroups.includes(page.group)) {
          perms[page.key] = { view: true, create: true, update: true, delete: true };
        } else if (viewOnlyGroups.includes(page.group)) {
          // Only specific settings for operators
          if (page.group === "Settings" && ["settings_commonSetting", "settings_getTransaction", "settings_negativeUsers", "settings_diamondVideo", "settings_gapCasinoList"].includes(page.key)) {
            perms[page.key] = { view: true, create: false, update: false, delete: false };
          } else if (page.group === "General" && ["dashboard", "userExposure", "notification"].includes(page.key)) {
            perms[page.key] = { view: true, create: false, update: false, delete: false };
          }
        }
      }
      return perms;
    })(),
  },
  {
    name: "Viewer",
    permissions: buildPermissions({ viewOnly: true, exclude: ["staffManagement", "rolesPermissions", "cloudflare", "healthRoutes", "serverMonitor", "settings_flushRedis", "settings_forceLogout", "settings_passwordReset"] }),
  },
];

async function seedDesignations(ownerId) {
  if (!ownerId) {
    console.log("  Designations: Skipped (no ownerId provided)");
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const template of DESIGNATION_TEMPLATES) {
    const existing = await DesignationModel.findOne({
      name: template.name,
      ownerId: ownerId,
      isDeleted: false,
    });

    if (existing) {
      skipped++;
      continue;
    }

    await DesignationModel.create({
      name: template.name,
      permissions: template.permissions,
      ownerId: ownerId,
      status: 1,
    });
    created++;
  }

  console.log(`  Designations: ${created} created, ${skipped} already exist`);
  return { created, skipped };
}

module.exports = { seedDesignations, DESIGNATION_TEMPLATES };
