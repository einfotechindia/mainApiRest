const mongoose = require("mongoose");
// const moment = require("moment");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const CrickTransactionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    userType: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      default: 0,
    },
    gameType: {
      type: String,
      default: null,
    },
    transactionType: {
      type: String,
      default: null,
    },
    marketType: {
      type: String,
      default: null,
    },
     betFor: {
      type: String,
      default: null,
    },
    remarks: {
      type: String,
      default: null,
    },
    gameName: {
      type: String,
      default: null,
    },
    eventName: {
      type: String,
      default: null,
    },
    result: {
      type: String,
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
    selectionId: {
      type: String,
      default: null,
    },
    sportId: {
      type: Number,
      default: 0,
    },
    seriesId: {
      type: Number,
      default: 0,
    },
    isComm: {
      type: Number,
      default: 0,
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    ledgerEntry: {
      type: Boolean,
      default: false,
    },
    ownerProfitLoss: {
      type: Number,
      default: 0,
    },
    subownerProfitLoss: {
      type: Number,
      default: 0,
    },
    superadminProfitLoss: {
      type: Number,
      default: 0,
    },
    adminProfitLoss: {
      type: Number,
      default: 0,
    },
    subadminProfitLoss: {
      type: Number,
      default: 0,
    },
    masterProfitLoss: {
      type: Number,
      default: 0,
    },
    superagentProfitLoss: {
      type: Number,
      default: 0,
    },
    agentProfitLoss: {
      type: Number,
      default: 0,
    },
    clientProfitLoss: {
      type: Number,
      default: 0,
    },
    agentLedgerAmount: {
      type: Number,
      default: 0,
    },
    subownerLedgerAmount: {
      type: Number,
      default: 0,
    },
    superadminLedgerAmount: {
      type: Number,
      default: 0,
    },
    adminLedgerAmount: {
      type: Number,
      default: 0,
    },
    subadminLedgerAmount: {
      type: Number,
      default: 0,
    },
    masterLedgerAmount: {
      type: Number,
      default: 0,
    },
    superagentLedgerAmount: {
      type: Number,
      default: 0,
    },
    agentLedgerAmount: {
      type: Number,
      default: 0,
    },
    clientLedgerAmount: {
      type: Number,
      default: 0,
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
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    isCash: {
      type: Boolean,
      default: false,
    },
    isRollback: {
      type: Boolean,
      default: false,
    },
    transactionId: {
      type: String,
      required: false,
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

const CrickTransactionLogModel = mongoose.model(
  "CrickTransactionLog",
  CrickTransactionLogSchema
);

(async () => {
  try {
    const existingIndexes = await CrickTransactionLogModel.collection.indexes();
    const neededIndexes = [
      { key: { marketId: 1, _id: -1 } },
      { key: { transactionType: 1, _id: -1 } },
      { key: { userId: 1, _id: -1 } },
      { key: { userId: 1, userType: 1 } },
      { key: { ownerId: 1, transactionType: 1, _id: -1 } },
      { key: { subownerId: 1, transactionType: 1, _id: -1 } },
      { key: { superadminId: 1, transactionType: 1, _id: -1 } },
      { key: { adminId: 1, transactionType: 1, _id: -1 } },
      { key: { subadminId: 1, transactionType: 1, _id: -1 } },
      { key: { masterId: 1, transactionType: 1, _id: -1 } },
      { key: { superagentId: 1, transactionType: 1, _id: -1 } },
      { key: { agentId: 1, transactionType: 1, _id: -1 } },
      { key: { clientId: 1, transactionType: 1, _id: -1 } },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await CrickTransactionLogModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = CrickTransactionLogModel;
