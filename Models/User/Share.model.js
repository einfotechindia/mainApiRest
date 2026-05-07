const mongoose = require("mongoose");
const moment = require("moment");
const ShareSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    userName: {
      type: String,
     // unique: true,
      default: null,
    },
    userType: {
      type: String,
      enum: [
        "client",
        "agent",
        "superagent",
        "master",
        "subadmin",
        "admin",
        "superadmin",
        "subowner",
        "owner",
        "system",
      ],
      default: "system",
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorName: {
      type: String,
      default: null,
    },
    creatorType: {
      type: String,
      enum: [
        "agent",
        "superagent",
        "master",
        "subadmin",
        "admin",
        "superadmin",
        "subowner",
        "owner",
        "system",
      ],
      default: "system",
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    clientCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    clientMatchCommission: {
      type: Number,
      default: 0,
    },
    clientSessionCommission: {
      type: Number,
      default: 0,
    },
    clientCasinoCommission: {
      type: Number,
      default: 0,
    },
    clientMatkaCommission: {
      type: Number,
      default: 0,
    },
    agentMatchShare: {
      type: Number,
      default: 0,
    },
    agentCasinoShare: {
      type: Number,
      default: 0,
    },
    agentMatkaShare: {
      type: Number,
      default: 0,
    },
    agentIntCasinoShare: {
      type: Number,
      default: 0,
    },
    agentCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    agentMatchCommission: {
      type: Number,
      default: 0,
    },
    agentSessionCommission: {
      type: Number,
      default: 0,
    },
    agentCasinoCommission: {
      type: Number,
      default: 0,
    },
    agentMatkaCommission: {
      type: Number,
      default: 0,
    },
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superagentMatchShare: {
      type: Number,
      default: 0,
    },
    superagentCasinoShare: {
      type: Number,
      default: 0,
    },
    superagentMatkaShare: {
      type: Number,
      default: 0,
    },
    superagentCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    superagentMatchCommission: {
      type: Number,
      default: 0,
    },
    superagentSessionCommission: {
      type: Number,
      default: 0,
    },
    superagentCasinoCommission: {
      type: Number,
      default: 0,
    },
    superagentMatkaCommission: {
      type: Number,
      default: 0,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterMatchShare: {
      type: Number,
      default: 0,
    },
    masterCasinoShare: {
      type: Number,
      default: 0,
    },
    masterMatkaShare: {
      type: Number,
      default: 0,
    },
    masterCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    masterMatchCommission: {
      type: Number,
      default: 0,
    },
    masterSessionCommission: {
      type: Number,
      default: 0,
    },
    masterCasinoCommission: {
      type: Number,
      default: 0,
    },
    masterMatkaCommission: {
      type: Number,
      default: 0,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminMatchShare: {
      type: Number,
      default: 0,
    },
    subadminCasinoShare: {
      type: Number,
      default: 0,
    },
    subadminMatkaShare: {
      type: Number,
      default: 0,
    },
    subadminCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    subadminMatchCommission: {
      type: Number,
      default: 0,
    },
    subadminSessionCommission: {
      type: Number,
      default: 0,
    },
    subadminCasinoCommission: {
      type: Number,
      default: 0,
    },
    subadminMatkaCommission: {
      type: Number,
      default: 0,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminMatchShare: {
      type: Number,
      default: 0,
    },
    adminCasinoShare: {
      type: Number,
      default: 0,
    },
    adminMatkaShare: {
      type: Number,
      default: 0,
    },
    adminCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    adminMatchCommission: {
      type: Number,
      default: 0,
    },
    adminSessionCommission: {
      type: Number,
      default: 0,
    },
    adminCasinoCommission: {
      type: Number,
      default: 0,
    },
    adminMatkaCommission: {
      type: Number,
      default: 0,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminMatchShare: {
      type: Number,
      default: 0,
    },
    superadminCasinoShare: {
      type: Number,
      default: 0,
    },
    superadminMatkaShare: {
      type: Number,
      default: 0,
    },
    superadminCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    superadminMatchCommission: {
      type: Number,
      default: 0,
    },
    superadminSessionCommission: {
      type: Number,
      default: 0,
    },
    superadminCasinoCommission: {
      type: Number,
      default: 0,
    },
    superadminMatkaCommission: {
      type: Number,
      default: 0,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    ownerMatchShare: {
      type: Number,
      default: 0,
    },
    ownerCasinoShare: {
      type: Number,
      default: 0,
    },
    ownerMatkaShare: {
      type: Number,
      default: 0,
    },
    ownerCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    ownerMatchCommission: {
      type: Number,
      default: 0,
    },
    ownerSessionCommission: {
      type: Number,
      default: 0,
    },
    ownerCasinoCommission: {
      type: Number,
      default: 0,
    },
    ownerMatkaCommission: {
      type: Number,
      default: 0,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerMatchShare: {
      type: Number,
      default: 0,
    },
    subownerCasinoShare: {
      type: Number,
      default: 0,
    },
    subownerMatkaShare: {
      type: Number,
      default: 0,
    },
    subownerCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    subownerMatchCommission: {
      type: Number,
      default: 0,
    },
    subownerSessionCommission: {
      type: Number,
      default: 0,
    },
    subownerCasinoCommission: {
      type: Number,
      default: 0,
    },
    subownerMatkaCommission: {
      type: Number,
      default: 0,
    },
    agentIntCasinoShare: {
      type: Number,
      default: 0,
    },
    superagentIntCasinoShare: {
      type: Number,
      default: 0,
    },
    masterIntCasinoShare: {
      type: Number,
      default: 0,
    },
    subadminIntCasinoShare: {
      type: Number,
      default: 0,
    },
    adminIntCasinoShare: {
      type: Number,
      default: 0,
    },
    superadminIntCasinoShare: {
      type: Number,
      default: 0,
    },
    subownerIntCasinoShare: {
      type: Number,
      default: 0,
    },
    ownerIntCasinoShare: {
      type: Number,
      default: 0,
    },
    clientBetfairCommission: {
      type: Number,
      default: 0,
    },
    agentBetfairCommission: {
      type: Number,
      default: 0,
    },
    superagentBetfairCommission: {
      type: Number,
      default: 0,
    },
    masterBetfairCommission: {
      type: Number,
      default: 0,
    },
    subadminBetfairCommission: {
      type: Number,
      default: 0,
    },
    adminBetfairCommission: {
      type: Number,
      default: 0,
    },
    superadminBetfairCommission: {
      type: Number,
      default: 0,
    },
    subownerBetfairCommission: {
      type: Number,
      default: 0,
    },
    ownerBetfairCommission: {
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

ShareSchema.options.toJSON = {
  transform: function (doc, ret, options) {
   // ret.id = ret._id;
    delete ret._id;
    // delete ret.password;
    // delete ret.otp;
    delete ret.chunk;
    delete ret.__v;
    return ret;
  },
};

const ShareModel = mongoose.model("share", ShareSchema);

// ShareSchema.index({
//   userId: 1,
// });




module.exports = ShareModel;
