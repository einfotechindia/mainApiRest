const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const CommLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    remark: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      default: null,
    },
    oddsComm: {
      type: Number,
      default: null,
    },
    sessionComm: {
      type: Number,
      default: null,
    },
    casinoComm: {
      type: Number,
      default: null,
    },
    userType: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Number,
      default: 0,
    },
    doneBy: {
      type: String,
      default: "",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    date: {
      type: String,
      default: () => moment().unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

const CommLedgerModel = mongoose.model("CommLedger", CommLedgerSchema);

(async () => {
  try {
    const existingIndexes = await CommLedgerModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          userId: 1,
        },
      },
      {
        key: {
          agentId: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await CommLedgerModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

CommLedgerSchema.index({ userId: 1, userType: 1, agentId: 1 });

module.exports = CommLedgerModel;
