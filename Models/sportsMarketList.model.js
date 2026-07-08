const mongoose = require("mongoose");
const SportMarketListSchema = new mongoose.Schema(
  {
    marketId: {
      type: String,
      default: null,
    },
    marketType: {
      type: String,
      default: null,
    },
    sportName: {
      type: String,
      default: null,
    },
    matchName: {
      type: String,
      default: null,
    },
    eventId: {
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
    matchDate: {
      type: String,
      default: null,
    },
    wonSelectionId: {
      type: String,
      default: "",
    },
    isDeclare: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      default: "UPCOMING",
    },
    playStatus: {
      type: Boolean,
      default: true,
    },
    betDealy: {
      type: Number,
      default: 0,
    },
    maxBet: {
      type: Number,
      default: 0,
    },
    selectionIdData: {},
  },
  {
    timestamps: true,
  }
);

const SportMarketListModel = mongoose.model(
  "sportMarketList",
  SportMarketListSchema
);

module.exports = SportMarketListModel;
