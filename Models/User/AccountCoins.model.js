const mongoose = require("mongoose");
const moment = require("moment");
const AccountCoinsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    UpperLevelCreditReffrence: {
      type: Number,
      default: 0,
    },
    DownLevelCreditReffrence: {
      type: Number,
      default: 0,
    },
    totalMasterBalance: {
      type: Number,
      default: 0,
    },
    upperLevel: {
      type: Number,
      default: 0,
    },
    downLevelProfitLoss: {
      type: Number,
      default: 0,
    },
    downlLevelOccupancyBalance: {
      type: Number,
      default: 0,
    },
    availableBalance: {
      type: Number,
      default: 0,
    },
    availableBalanceProfitLoss: {
      type: Number,
      default: 0,
    },
    userProfitLoss: {
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

const AccountCoinsModel = mongoose.model("AccountCoins", AccountCoinsSchema);

module.exports = AccountCoinsModel;
