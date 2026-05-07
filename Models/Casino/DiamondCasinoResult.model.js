const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let diamondCasinoResultSchema = new Schema(
  {
    roundId: {
      type: String,
      required: true,
    },
    resultData: {
      type: String,
      default: "",
    },
    marketWiseResult: {},
    resultSelection: {
      type: String,
      default: "",
    },
    eventId: {
      type: String,
      default: "",
    },
    shortName: {
      type: String,
      default: "",
    },
    isResult: {
      type: Boolean,
      default: false,
    },
    time: {
      type: Number,
      default: () => Date.now(),
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

diamondCasinoResultSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};
module.exports = mongoose.model(
  "diamondCasinoResult",
  diamondCasinoResultSchema,
  "diamondCasinoResult"
);
