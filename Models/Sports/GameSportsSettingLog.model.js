const mongoose = require("mongoose");
const moment = require("moment");

const objectId = {
  type: mongoose.Schema.Types.ObjectId,
  default: null,
};

// One doc per gameSportsSetting update : who changed what on which user and what it did to the downline
const GameSportsSettingLogSchema = new mongoose.Schema(
  {
    // user whose setting was changed
    userId: objectId,
    username: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: null,
    },
    userType: {
      type: String,
    },
    creatorId: objectId,
    clientId: objectId,
    agentId: objectId,
    superagentId: objectId,
    masterId: objectId,
    subadminId: objectId,
    adminId: objectId,
    superadminId: objectId,
    subownerId: objectId,
    ownerId: objectId,
    // user who made the change
    operatorId: objectId,
    operatorName: {
      type: String,
      default: null,
    },
    operatorType: {
      type: String,
      default: null,
    },
    // [{ key, oldValue, newValue, remark }]
    changes: [],
    downlineCount: {
      type: Number,
      default: 0,
    },
    // none : nothing to update in downline, pending : update is running,
    // done : downlineEffect is saved, repaired : completed later by repair (effect not known)
    downlineStatus: {
      type: String,
      default: "none",
    },
    // [{ key, updatedCount, groups : [{ userType, oldValue, newValue, count }],
    //    ownSettingCount, ownSettingUsers : [{ userId, userType, ownValue, oldValue, newValue }] }]
    downlineEffect: [],
    date: {
      type: Number,
      default: () => moment().unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

const GameSportsSettingLogModel = mongoose.model(
  "GameSportsSettingLog",
  GameSportsSettingLogSchema
);

const ensureIndexes = async () => {
  try {
    // new collection does not exist before the first log, indexes are still created
    const existingIndexes = await GameSportsSettingLogModel.collection
      .indexes()
      .catch(() => []);
    const requiredIndexes = [
      { key: { userId: 1 } },
      { key: { operatorId: 1 } },
      { key: { ownerId: 1 } },
      { key: { subownerId: 1 } },
      { key: { superadminId: 1 } },
      { key: { adminId: 1 } },
      { key: { subadminId: 1 } },
      { key: { masterId: 1 } },
      { key: { superagentId: 1 } },
      { key: { agentId: 1 } },
    ];
    for (const index of requiredIndexes) {
      const exists = existingIndexes.some(
        (existingIndex) =>
          JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await GameSportsSettingLogModel.collection.createIndex(index.key);
        console.log(`Index created: ${JSON.stringify(index.key)}`);
      }
    }
  } catch (error) {
    console.error("Error ensuring indexes:", error);
  }
};

// Ensure indexes are created
ensureIndexes();

module.exports = GameSportsSettingLogModel;
