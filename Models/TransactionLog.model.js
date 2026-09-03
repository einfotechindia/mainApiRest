const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const TransactionLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userType: { type: String, default: null },
    amount: { type: Number, required: true, default: 0 },
    gameType: { type: String, default: null },
    gameName: { type: String, default: null },
    result: { type: String, default: null },
    marketId: { type: String, default: null },
    eventId: { type: String, default: null },
    selectionId: { type: String, default: null },
    remarks: { type: String, default: null },
    overallType: { type: String, default: null },
    forBet: { type: Number, default: 0 },
    isDeclare: { type: Number, default: 0 },
    isRollback: { type: Number, default: 0 },
    isComm: { type: Number, default: 0 },
    sessionActualAmount: { type: Number, default: 0 },
    sessionTurnOver: { type: Number, default: 0 },
    ownerAmount: { type: Number, default: 0 },
    subownerAmount: { type: Number, default: 0 },
    superadminAmount: { type: Number, default: 0 },
    adminAmount: { type: Number, default: 0 },
    subadminAmount: { type: Number, default: 0 },
    masterAmount: { type: Number, default: 0 },
    superagentAmount: { type: Number, default: 0 },
    agentAmount: { type: Number, default: 0 },
    clientAmount: { type: Number, default: 0 },
    agentShareAmount: { type: Number, default: 0 },
    subownerShareAmount: { type: Number, default: 0 },
    superadminShareAmount: { type: Number, default: 0 },
    adminShareAmount: { type: Number, default: 0 },
    subadminShareAmount: { type: Number, default: 0 },
    masterShareAmount: { type: Number, default: 0 },
    superagentShareAmount: { type: Number, default: 0 },
    clientShareAmount: { type: Number, default: 0 },
   
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    masterId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superagentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    betId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isCash: { type: Boolean, default: false },
    sportId: { type: Number, default: false },
    
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

const TransactionLogModel = mongoose.model(
  "TransactionLog",
  TransactionLogSchema
);

const ensureIndexes = async () => {
  try {
    const existingIndexes = await TransactionLogModel.collection.indexes();
    const requiredIndexes = [
      { key: { creatorId: 1 } },
      { key: { marketId: 1 } },
      { key: { betId: 1 } },
      { key: { date: -1, marketId: 1 } },
      // User hierarchy — reports/list queries
      { key: { agentId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { superagentId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { masterId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { subadminId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { adminId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { superadminId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { subownerId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      { key: { ownerId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 } },
      // Bet placing — deleteMany + insertTransactionLog
      { key: { userId: 1, marketId: 1, overallType: 1, selectionId: 1 } },
      { key: { userId: 1, marketId: 1, overallType: 1, gameType: 1 } },
      // GetUserCoins — main aggregation
      { key: { userId: 1, isDeclare: 1, forBet: 1, overallType: 1, isCash: 1, isComm: 1 } },
      // Session position by selectionId
      { key: { userId: 1, selectionId: 1, marketId: 1 } },
      // Decision — market-wide queries
      { key: { gameType: 1, marketId: 1, overallType: 1 } },
    ];

    for (const index of requiredIndexes) {
      const exists = existingIndexes.some(
        (existingIndex) =>
          JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await TransactionLogModel.collection.createIndex(index.key);
        console.log(`Index created: ${JSON.stringify(index.key)}`);
      } else {
      }
    }
  } catch (error) {
    console.error("Error ensuring indexes:", error);
  }
};

// Ensure indexes are created
ensureIndexes();

module.exports = TransactionLogModel;
