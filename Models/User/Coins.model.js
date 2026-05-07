const mongoose = require("mongoose");
const moment = require("moment");
const CoinsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    coins: {
      type: Number,
      default: 0,
    },
    exposure: {
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

const CoinsModel = mongoose.model("coins", CoinsSchema);

module.exports = CoinsModel;
