const FancyManagerModel = require("../../Models/FancyManager/FancyManager.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { emitToAllActiveUsers} =  require("../../socket.js")

const REDIS_KEY = "fancyManagerConfig";

// Sync all active fancy configs to Redis as a JSON string
async function syncToRedis() {
  try {
    const allConfigs = await FancyManagerModel.find({ isDeleted: false }).lean();
    await client.set(REDIS_KEY, JSON.stringify(allConfigs));
  } catch (err) {
    console.error("FancyManager Redis sync error:", err.message);
  }
}

module.exports = {

  // Get fancy config from Redis (for socket/real-time use)
  GetFromRedis: async () => {
    try {
      const cached = await client.get(REDIS_KEY);
      if (cached) return JSON.parse(cached);
      // Fallback to DB if Redis empty
      const allConfigs = await FancyManagerModel.find({ isDeleted: false }).lean();
      await client.set(REDIS_KEY, JSON.stringify(allConfigs));

    //  _d(allConfigs , "allConfigs")
      return allConfigs;
    } catch (err) {
      console.error("FancyManager GetFromRedis error:", err.message);
      return [];
    }
  },

  // Create fancy config
  Create: async (req, res) => {
    try {
      const { name, keywords, status, maxBet, betDelay, commission, category } = req.body;

      if (!name) return SendResponse(res, "error", "Name is required");
      if (!keywords || !keywords.length) return SendResponse(res, "error", "At least one keyword is required");

      // Validate betDelay
      const parsedDelay = Number(betDelay) || 0;
      if (parsedDelay < 0) return SendResponse(res, "error", "Bet delay cannot be negative");
      if (parsedDelay > 10) return SendResponse(res, "error", "Bet delay cannot exceed 10 seconds");

      // Check duplicate name
      const existing = await FancyManagerModel.findOne({ name: name.trim(), isDeleted: false });
      if (existing) return SendResponse(res, "error", "Fancy type with this name already exists");

      // Uppercase all keywords for consistent matching
      const upperKeywords = keywords.map(k => k.trim().toUpperCase());

      // Check duplicate keywords across other configs
      const duplicateKeyword = await FancyManagerModel.findOne({ keywords: { $in: upperKeywords }, isDeleted: false });
      if (duplicateKeyword) return SendResponse(res, "error", `Keyword already exists in "${duplicateKeyword.name}"`);

      const fancyConfig = await FancyManagerModel.create({
        name: name.trim(),
        keywords: upperKeywords,
        status: status !== undefined ? status : true,
        maxBet: maxBet || 50000,
        betDelay: parsedDelay,
        commission: commission || false,
        category: category || "normal",
        createdBy: req.loggedInUser?._id,
      });

      await syncToRedis();

      await emitToAllActiveUsers("fancyDataUpdated", { message: "Fancy config updated" });

      return SendResponse(res, "success", "Fancy config created successfully", fancyConfig);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to create");
    }
  },

  // Update fancy config
  Update: async (req, res) => {
    try {
      const { id, name, keywords, status, maxBet, betDelay, commission, category } = req.body;

      if (!id) return SendResponse(res, "error", "ID is required");

      // Validate betDelay if provided
      if (betDelay !== undefined) {
        const parsedDelay = Number(betDelay);
        if (parsedDelay < 0) return SendResponse(res, "error", "Bet delay cannot be negative");
        if (parsedDelay > 10) return SendResponse(res, "error", "Bet delay cannot exceed 10 seconds");
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (keywords !== undefined) {
        updateData.keywords = keywords.map(k => k.trim().toUpperCase());
        // Check duplicate keywords (exclude self)
        const duplicateKeyword = await FancyManagerModel.findOne({ _id: { $ne: id }, keywords: { $in: updateData.keywords }, isDeleted: false });
        if (duplicateKeyword) return SendResponse(res, "error", `Keyword already exists in "${duplicateKeyword.name}"`);
      }
      if (status !== undefined) updateData.status = status;
      if (maxBet !== undefined) updateData.maxBet = maxBet;
      if (betDelay !== undefined) updateData.betDelay = Number(betDelay);
      if (commission !== undefined) updateData.commission = commission;
      if (category !== undefined) updateData.category = category;

      const updated = await FancyManagerModel.findByIdAndUpdate(id, updateData, { new: true });
      if (!updated) return SendResponse(res, "error", "Fancy config not found");

      await syncToRedis();
      await emitToAllActiveUsers("fancyDataUpdated", { message: "Fancy config updated" });

      return SendResponse(res, "success", "Updated successfully", updated);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to update");
    }
  },

  // Toggle status
  ToggleStatus: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return SendResponse(res, "error", "ID is required");

      const config = await FancyManagerModel.findById(id);
      if (!config) return SendResponse(res, "error", "Fancy config not found");

      config.status = !config.status;
      await config.save();

      await syncToRedis();
      return SendResponse(res, "success", `Fancy ${config.status ? "enabled" : "disabled"} successfully`, config);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to toggle");
    }
  },

  // List all (with search & filter)
  List: async (req, res) => {
    try {
      const { search, category, status, isDeleted } = req.body;

      let filter = { isDeleted: isDeleted === true };

      if (category) filter.category = category;
      if (status !== undefined) filter.status = status;
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { keywords: { $regex: search, $options: "i" } },
        ];
      }

      const list = await FancyManagerModel.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
      return SendResponse(res, "success", "Fetch Successfully", list);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to fetch");
    }
  },

  // Get by ID
  GetById: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return SendResponse(res, "error", "ID is required");

      const config = await FancyManagerModel.findById(id).lean();
      if (!config) return SendResponse(res, "error", "Not found");

      return SendResponse(res, "success", "Fetch Successfully", config);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to fetch");
    }
  },

  // Soft delete
  Delete: async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return SendResponse(res, "error", "ID is required");

      const deleted = await FancyManagerModel.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
      if (!deleted) return SendResponse(res, "error", "Not found");

      await syncToRedis();
      return SendResponse(res, "success", "Deleted successfully", deleted);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to delete");
    }
  },

  // Bulk update (status, maxBet, betDelay)
  BulkUpdate: async (req, res) => {
    try {
      const { ids, status, maxBet, betDelay } = req.body;
      if (!ids || !ids.length) return SendResponse(res, "error", "IDs are required");

      const updateData = {};
      if (status !== undefined) updateData.status = status;
      if (maxBet !== undefined) updateData.maxBet = Number(maxBet);
      if (betDelay !== undefined) {
        const d = Number(betDelay);
        if (d < 0) return SendResponse(res, "error", "Bet delay cannot be negative");
        if (d > 10) return SendResponse(res, "error", "Bet delay cannot exceed 10 seconds");
        updateData.betDelay = d;
      }

      if (!Object.keys(updateData).length) return SendResponse(res, "error", "Nothing to update");

      await FancyManagerModel.updateMany({ _id: { $in: ids } }, updateData);

      await syncToRedis();
      return SendResponse(res, "success", `${ids.length} configs updated successfully`);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to update");
    }
  },

  // Sync Redis manually (admin)
  SyncRedis: async (req, res) => {
    try {
      await syncToRedis();
      return SendResponse(res, "success", "Redis synced successfully");
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to sync");
    }
  },

  // Run seed from API (adds missing defaults, skips existing)
  RunSeed: async (req, res) => {
    try {
      const { seedFancyManager } = require("../../seeds/fancyManager.seed");
      const result = await seedFancyManager();
      await syncToRedis();
      return SendResponse(res, "success", `Seed completed: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged`);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Failed to run seed");
    }
  },

  getFancyConfigData: async (req,res) => {
    try {
      const cached = await client.get(REDIS_KEY);
      if (cached) return SendResponse(res, "success", "Fancy config retrieved successfully", JSON.parse(cached));
      const allConfigs = await FancyManagerModel.find({ isDeleted: false }).lean();
      await client.set(REDIS_KEY, JSON.stringify(allConfigs));
      return SendResponse(res, "success", "Fancy config retrieved successfully", allConfigs);
    } catch (err) {
      console.error("FancyManager GetFromRedis error:", err.message);
      return SendResponse(res, "error", err.message || "Failed to retrieve");
    }
  },
};
