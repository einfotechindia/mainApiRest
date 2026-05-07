const mongoose = require("mongoose");
const moment = require("moment");
const UserSportsConfigSchema = new mongoose.Schema(
  {
    userType: {
      type: String,
      required: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
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
    type: {
      type: String,
      default: "",
    },
    apiFor: {
      type: String,
      default: "",
    },
    minBet: {
      type: Number,
      default: 0,
    },
    maxBet: {
      type: Number,
      default: 0,
    },
    maxProfit: {
      type: Number,
      default: 0,
    },
    maxMarketProfit: {
      type: Number,
      default: 0,
    },
    maxLiability: {
      type: Number,
      default: 0,
    },
    maxMarketLiability: {
      type: Number,
      default: 0,
    },
    betDelay: {
      type: Number,
      default: 0,
    },
    commissionIn: {
      type: Number,
      default: 0,
    },
    commissionOut: {
      type: Number,
      default: 0,
    },
    date: {
      type: Number,
      default: () => moment().unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

const UserSportsConfigModel = mongoose.model(
  "UserSportsConfig",
  UserSportsConfigSchema
);

UserSportsConfigSchema.index({
  userId: 1,
});

module.exports = UserSportsConfigModel;
