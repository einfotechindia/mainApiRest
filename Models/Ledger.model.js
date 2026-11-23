const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const LedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    marketId: {
      type: String,
      default: null,
    },
    eventId: {
      type: String,
      default: null,
    },
    eventName: {
      type: String,
      default: null,
    },
    ledgerType: {
      type: String,
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
    userType: {
      type: String,
      default: null,
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Number,
      default: 0,
    },
    doneBy: {
      type: String,
      default: "",
    },
    priority: {
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
    crickTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    date: {
      type: String,
      default: () => moment().startOf("day").toDate(),
    },
    eventDate: {
      type: String,
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

const LedgerModel = mongoose.model("Ledger", LedgerSchema);

(async () => {
  try {
    const existingIndexes = await LedgerModel.collection.indexes();

    const neededIndexes = [
      {
        key: { userId: 1, isDeleted: 1 },
      },
      { key: { isDeclare: 1, ledgerType: 1, userType: 1, date: 1 } },
      { key: { marketId: 1,} },
      { key: { marketId: 1, userId :1} },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await LedgerModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = LedgerModel;
