const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const deleteBetsDataSchema = new mongoose.Schema(
  {
    betType: {
      type: String,
    },
    oldData: {},
    isRollback: {
        type: Boolean,
        default: false,
    },
    actionType : {
      type: String,
      default : null
    },
    userInfo: {},
    ip:{
      type: String,
    },
    updateData:{}
  },
  {
    timestamps: true,
  }
);

const deleteBetsDataModel = mongoose.model("deleteBetsData", deleteBetsDataSchema);

module.exports = deleteBetsDataModel;
