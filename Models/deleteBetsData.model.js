const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const deleteBetsDataSchema = new mongoose.Schema(
  {
    betType: {
      type: String,
    },
    data: {},
    isRollback: {
        type: Boolean,
        default: false,
    }
  },
  {
    timestamps: true,
  }
);

const deleteBetsDataModel = mongoose.model("deleteBetsData", deleteBetsDataSchema);

module.exports = deleteBetsDataModel;
