const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
moment.tz.setDefault("Asia/Kolkata");

let bonusDistribution = new Schema(
  {
    distributionType: {
      type: String,
      required: true,
    },
    firstLayerRate: {
      type: Number,
      default: 0,
    },
    secondLayerRate: {
      type: Number,
      default: 0,
    },
    thirdLayerRate: {
      type: Number,
      default: 0,
    },
    fourthLayerRate: {
      type: Number,
      default: 0,
    },
    fifthLayerRate: {
      type: Number,
      default: 0,
    },
    sixLayerRate: {
      type: Number,
      default: 0,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

bonusDistribution.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model(
  "bonusDistribution",
  bonusDistribution,
  "bonusDistribution"
);
