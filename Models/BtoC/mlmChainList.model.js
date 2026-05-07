const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
moment.tz.setDefault("Asia/Kolkata");

let MlmChainList = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    username: {
      type: String,
      default: "",
    },
    referral: {
      type: String,
      default: "",
    },
    firstLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    secondLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    thirdLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    fourthLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    fifthLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sixLayerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
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

MlmChainList.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

MlmChainList.index({
  userId: 1,
});



module.exports = mongoose.model("MlmChainList", MlmChainList, "MlmChainList");
