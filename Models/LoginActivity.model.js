const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const LoginActivitySchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      required: true,
    },
    city: {
      type: String,
    },
    ip: {
      type: String,
      default: true,
    },
    country: {
      type: String,
    },
    state: {
      type: String,
    },
    latitude: {
      type: String,
    },
    longitude: {
      type: String,
    },
    isp: {
      type: String,
    },
    district: {
      type: String,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

const LoginActivityModel = mongoose.model("LoginActivity", LoginActivitySchema);

// Ensure indexes are created only if they do not exist
(async () => {
  try {
    const existingIndexes = await LoginActivityModel.collection.indexes();
    const neededIndexes = [{ key: { username: 1 } }, { key: { userId: 1 } }];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await LoginActivityModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = LoginActivityModel;
