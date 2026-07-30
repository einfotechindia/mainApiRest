const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
moment.tz.setDefault("Asia/Kolkata");

let PaymentAccount = new Schema(
  {
    accountName: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      enum: ["Bank", "Paytm", "PhonePe", "GPay", "BhimUPI", "Crypto"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    reference: {
      type: String,
      default: "",
    },
    fromAmount: {
      type: Number,
      default: 0,
    },
    toAmount: {
      type: Number,
      default: 0,
    },
    // Bank fields
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountHolderName: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    branchName: { type: String, default: "" },
    // UPI fields
    upiId: { type: String, default: "" },
    mobileNo: { type: String, default: "" },
    qrImage: { type: String, default: "" },
    // Crypto fields
    walletId: { type: String, default: "" },
    cryptoType: { type: String, default: "" },
    cryptoQrImage: { type: String, default: "" },
    // Priority & Limits
    priority: { type: Number, default: 0 },
    dailyLimit: { type: Number, default: 0 }, // 0 = unlimited
    todayDeposits: { type: Number, default: 0 },
    todayDepositAmount: { type: Number, default: 0 },
    todayDate: { type: String, default: "" },
    // Schedule
    scheduleEnabled: { type: Boolean, default: false },
    scheduleFrom: { type: String, default: "00:00" }, // HH:mm
    scheduleTo: { type: String, default: "23:59" },
    // Domain assignment
    assignedDomains: [{ type: String }],
    // Hierarchy
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    username: { type: String },
    userType: { type: String },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    masterId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superagentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    creatorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    date: {
      type: Number,
      default: () => moment().startOf("day").unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

PaymentAccount.options.toJSON = {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model("PaymentAccount", PaymentAccount, "PaymentAccount");
