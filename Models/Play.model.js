const mongoose = require("mongoose");

const PlaySchema = new mongoose.Schema(
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
    playStatus: {
      type: Number,
      default: 0,
    },
    sessionPlusMinus: {
      type: Number,
      default: 0,
    },
    mobApp: {
      type: Number,
      default: 0,
    },
    exposure: {
      type: Number,
      default: null,
    },
    updateMatchBet: {
      type: Boolean,
      default: false,
    },
    updateSessionBet: {
      type: Boolean,
      default: false,
    },
    isMatchPlay: {
      type: Boolean,
      default: false,
    },
    isSessionPlay: {
      type: Boolean,
      default: false,
    },
    matchBetData: {},
    sessionBetData: {},
    shareData: {},
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
    parentData: {},
    userInfo: {},
    directUserShareData: {},
  },
  {
    timestamps: true,
  }
);

/**
 * ✅ UNIQUE COMPOUND INDEX
 * Prevent duplicate (userId + marketId)
 */
PlaySchema.index({ userId: 1, marketId: 1 }, { unique: true });

/**
 * ✅ OPTIONAL: fast queries
 */
PlaySchema.index({ marketId: 1 });

const PlayModel = mongoose.model("play", PlaySchema);


const createIndexes = async () => {
  try {
    await PlayModel.syncIndexes();
    console.log("Indexes synced successfully");
  } catch (err) {
    console.error("Index sync error:", err.message);
  }
};

// call once when server starts
createIndexes();

module.exports = PlayModel;