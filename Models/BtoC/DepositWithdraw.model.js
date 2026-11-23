const moment = require("moment");
moment.tz.setDefault("Asia/Kolkata");

const mongoose = require("mongoose");
const Schema = mongoose.Schema;
let DepositWithdraw = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    utrNo: {
      type: Number,
      default: 0,
    },
    username: {
      type: String,
      required: true,
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
    subagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    approveUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    approverDetails: {},
    userType: {
      type: String,
      default: "client",
    },
    paymentMethod: {
      type: String,
      required: false,
    },
    screenShotPath: {
      type: String,
      required: false,
    },
    domain: {
      type: String,
      required: false,
    },
    remark: {
      type: String,
      default: null,
    },
    reqType: {
      type: String,
      default: null,
    },
    screenShotImg: {
      type: String,
      default: "",
    },
    canceledRemark: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "",
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").unix() * 1000,
    },
    time: {
      type: Number,
      default: () => Date.now(),
    },
    ip: {
      type: String,
      default: "",
    },
    accountDetails: {},
    wallet: {},
    accountMethod: {
      type: String,
      default: "account",
    },
    cryptoBarCodeImg: {
      type: String,
      default: "",
    },
    cryptoAddress: {
      type: String,
      default: "",
    },
    paymentTypeId: {
     type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

DepositWithdraw.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

DepositWithdraw.index({ userId: 1, agentId: 1, reqType: 1, status: 1 });

module.exports = mongoose.model(
  "DepositWithdraw",
  DepositWithdraw,
  "DepositWithdraw"
);
