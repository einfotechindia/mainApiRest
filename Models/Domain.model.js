const mongoose = require("mongoose");

const DomainSchema = new mongoose.Schema(
  {
    domainName: {
      type: String,
      required: false,
    },
    domainUrl: {
      type: String,
      required: false,
    },
    userNotification: {
      type: String,
      required: false,
    },
    clientNotification: {
      type: String,
      required: false,
    },
    logo: {
      type: String,
      required: false,
    },
    favicon: {
      type: String,
      required: false,
    },
    title: {
      type: String,
      required: false,
    },
    operatorId: {
      type: String,
      required: false,
    },
    imgBaseUrl: {
      type: String,
      required: false,
    },
    whatsappNumber: {
      type: Number,
      required: false,
    },
    helplineNumber: {
      type: Number,
      required: false,
    },
    assignSubownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    assignAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: Boolean,
      default: true,
    },
    registerBonus: {
      type: Boolean,
      default: true, // by default on first deposit its true
    },
    onEveryDeposit: {
      type: Boolean,
      default: false,
    },
    isRegister: {
      type: Boolean,
      default: false,
    },
    isAffilation: {
      type: Boolean,
      default: false,
    },
    isReferral: {
      type: Boolean,
      default: false,
    },
    talkTo: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isSignupBonus: {
      type: Boolean,
      default: false,
    },
    maximumWithdrawAmount: {
      type: Number,
      default: 1000000,
    },
    minimumWithdrawAmount: {
      type: Number,
      default: 100,
    },
    themeSetting: {},
    sportsSetting: {},
    apiKey: {},
    banner: {},
    socialMedia: {},
    barcode: {},
    upi: {},
    account: {},
    isSignUpOtp: {
      type: Boolean,
      default: true,
    },
    reffrelSetting: {},
    bonusSetting: {},
    signUpBonusSetting: {},
    isCashOut: {
      type: String,
      required: false,
    },
    color: {}
  },
  {
    timestamps: true,
  }
);

const DomainModel = mongoose.model("domain", DomainSchema);

module.exports = DomainModel;
