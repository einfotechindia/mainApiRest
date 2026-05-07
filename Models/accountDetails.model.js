const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
moment.tz.setDefault("Asia/Kolkata");

let AccountDetails = new Schema(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
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
    bankName: {
      type: String,
    },
    ifscCode: {
      type: String,
    },
    accountNumber: {
      type: Number,
    },
    accountHolder: {
      type: String,
    },
    branchName: {
      type: String,
    },
    phonePayUpi: {
      type: String,
    },
    phonePayImg: {
      type: String,
    },
    googlePayUpi: {
      type: String,
    },
    googlePayImg: {
      type: String,
    },
    payTmUpi: {
      type: String,
    },
    payTmImg: {
      type: String,
    },
    accountType: {
      type: String,
    },
    accountTypeImg: {
      type: String,
    },
    accountCategory: {
      type: String,
      required: false,
    },
    isWithdrawalOnly: {
      type: String,
      default: false,
    },
    minAmount: {
      type: String,
      default: false,
    },
    maxAmount: {
      type: String,
      default: false,
    },
     status: {
      type: String,
      default: false,
    },
    isBelowfivethousand: {
      type: Boolean,
      default: false,
    },
    isAbovefivethousand: {
      type: Boolean,
      default: false,
    },
    qrCode: {
      type: String,
      default: false,
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

AccountDetails.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model(
  "AccountDetails",
  AccountDetails,
  "AccountDetails"
);
