const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
moment.tz.setDefault("Asia/Kolkata");

let Account = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    userType: {
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
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    barcode: {},
    upi: {},
    account: {},
    crypto: {},
    whatsappNumber: {
      type: Number,
      default : null
    },
    helplineNumber: {
      type: Number,
      default : null
    },
    isRegister: {
      type: Boolean,
      default: true,
    },
    isReferral: {
      type: Boolean,
      default: true,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").unix() * 1000,
    },
    time: {
      type: Number,
      default: () => Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

Account.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model("Account", Account, "Account");
