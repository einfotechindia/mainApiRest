const mongoose = require("mongoose");
const moment = require("moment");
const SportsSettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    userType: {
      type: String,
    },
    isCricket: {
      type: Boolean,
      default: true,
    },
    isIntCasino: {
      type: Boolean,
      default: true,
    },
    isMatka: {
      type: Boolean,
      default: true,
    },
    isPolitics: {
      type: Boolean,
      default: true,
    },
    isCasino: {
      type: Boolean,
      default: true,
    },
    isKabbadi: {
      type: Boolean,
      default: true,
    },
    isFootball: {
      type: Boolean,
      default: true,
    },
    isTennis: {
      type: Boolean,
      default: true,
    },
    isHourse: {
      type: Boolean,
      default: true,
    },
    isGreyHound: {
      type: Boolean,
      default: true,
    },
     isToss: {
      type: Boolean,
      default: true,
    },
      isFancy: {
      type: Boolean,
      default: true,
    },
    isFigure: {
      type: Boolean,
      default: true,
    },
    isMatchOdds: {
      type: Boolean,
      default: true,
    },
    isEvenOdds: {
      type: Boolean,
      default: true,
    },
    isCupWiner: {
      type: Boolean,
      default: true,
    },
     isUnderOverGoal: {
      type: Boolean,
      default: true,
    },
    isSoccerMatchOdds: {
      type: Boolean,
      default: true,
    },
    soccerMaxAmount : {
      type: Number,
      default: 100000,
    },
    tennisMaxAmount : {
      type: Number,
      default: 100000,
    },
    cricketMaxAmount : {
      type: Number,
      default: 100000,
    },
    greyhoundMaxAmount : {
      type: Number,
      default: 100000,
    },
    hourseMaxAmount : {
      type: Number,
      default: 100000,
    },
    racesMaxAmount : {
      type: Number,
      default: 100000,
    },
    bookmakerMaxAmount : {
      type: Number,
      default: 100000,
    },
    fancyMaxAmount : {
      type: Number,
      default: 100000,
    },
    casinoMaxAmount : {
      type: Number,
      default: 100000,
    },
    // bet delay in seconds, downline can not have less than upline
    bookmakerBetDelay: {
      type: Number,
      default: 0,
    },
    fancyBetDelay: {
      type: Number,
      default: 0,
    },
    betfairBetDelay: {
      type: Number,
      default: 0,
    },
    tennisBetDelay: {
      type: Number,
      default: 0,
    },
    soccerBetDelay: {
      type: Number,
      default: 0,
    },
    racingBetDelay: {
      type: Number,
      default: 0,
    },
    // maximum profit loss, downline can not have more than upline
    bookmakerMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    fancyMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    betfairMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    tennisMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    soccerMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    racingMaximunProfitLoss: {
      type: Number,
      default: 100000,
    },
    casinoSetting: {},
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    tpin : {
      type: Number,
      default: 0,
    }, 
    diamondCasinoBlock : [],
    // blocked international casino gameId
    internationalCasinoBlock : [],
    // blocked matkaEventId
    matkaBlock : [],
    // Values set directly on this user by upline (only the keys that were changed).
    // Top level fields above are the effective values = upline + selfSetting.
    selfSetting: {},
    // true while the new values of this user are not yet pushed to its complete downline
    cascadePending: {
      type: Boolean,
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

const SportsSettingModel = mongoose.model("SportsSetting", SportsSettingSchema);

const ensureIndexes = async () => {
  try {
    const existingIndexes = await SportsSettingModel.collection.indexes();
    const requiredIndexes = [
      { key: { userId: 1  , userType :1} },
      { key: { ownerId: 1 } },
      { key: { subownerId: 1 } },
      { key: { superadminId: 1 } },
      { key: { adminId: 1 } },
      { key: { subadminId: 1 } },
      { key: { masterId: 1 } },
      { key: { superagentId: 1 } },
      { key: { agentId: 1 } },
      { key: { cascadePending: 1 }, options: { sparse: true } },
    ];
    for (const index of requiredIndexes) {
      const exists = existingIndexes.some(
        (existingIndex) =>
          JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await SportsSettingModel.collection.createIndex(index.key, index.options || {});
        console.log(`Index created: ${JSON.stringify(index.key)}`);
      } else {
      }
    }
  } catch (error) {
    console.error("Error ensuring indexes:", error);
  }
};

// Ensure indexes are created
ensureIndexes();


module.exports = SportsSettingModel;
