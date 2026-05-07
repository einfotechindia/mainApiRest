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
    ];
    for (const index of requiredIndexes) {
      const exists = existingIndexes.some(
        (existingIndex) =>
          JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await SportsSettingModel.collection.createIndex(index.key);
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
