const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const SportsResultSchema = new mongoose.Schema(
  {
    marketId: {
      type: String,
      required: false,
    },
    eventId: {
      type: String,
      required: true,
    },
    sportType: {
      type: String,
      default: null,
    },
    marketType: {
      type: String,
      default: null,
    },
    seriesName: {
      type: String,
      default: null,
    },
    seriesId: {
      type: String,
      default: null,
    },
    sportId: {
      type: Number,
      default: 4,
    },
    matchName: {
      type: String,
      default: null,
    },
    resultName: {
      type: String,
      default: null,
    },
    result: {
      type: String,
      default: null,
    },
    selectionId: {
      type: String,
      default: "",
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

const SportsResultModel = mongoose.model("SportsResult", SportsResultSchema);

module.exports = SportsResultModel;
