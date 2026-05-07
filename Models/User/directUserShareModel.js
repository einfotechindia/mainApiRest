const mongoose = require("mongoose");

// allowed user types
const USER_TYPES = [
  "client",
  "agent",
  "superagent",
  "master",
  "subadmin",
  "admin",
  "superadmin",
  "subowner",
  "owner",
  "system",
];

// creator types = user types except client
const CREATOR_TYPES = USER_TYPES.filter((t) => t !== "client");

const directUserShareSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: false,
    },
    username: {
      type: String,
      index: true,
      default: null,
      trim: true,
    },
    userType: {
      type: String,
      enum: USER_TYPES,
      default: "system",
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    shareData: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
    autoIndex: false, // prevent auto-indexing in production
  }
);

const DirectUserShareModel = mongoose.model(
  "ShareWiseClientShare",
  directUserShareSchema
);


(async () => {
  try {
    const existingIndexes = await DirectUserShareModel.collection.indexes();
    const neededIndexes = [
      {
        key: { username: 1 },
      },
      { key: { userId: 1 } },
    
    ];
    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await DirectUserShareModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } 
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();


module.exports = DirectUserShareModel;
