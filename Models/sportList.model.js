const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const SportListSchema = new mongoose.Schema(
  {
    marketId: {
      type: String,
      default: null,
    },
    sportName: {
      type: String,
      default: null,
    },
    matchName: {
      type: String,
      default: null,
    },
    matchType: {
      type: String,
      default: "T20",
    },
    marketName: {
      type: String,
      default: "",
    },
    sportType: {
      type: String,
      default: "cricket",
    },
    countryCode: {
      type: String,
      default: "",
    },
    trackName: {
      type: String,
      default: "",
    },
    eventId: {
      type: String,
      default: null,
    },
    sportId: {
      type: Number,
      default: 0,
    },
    seriesId: {
      type: Number,
      default: 0,
    },
    matchDate: {
      type: String,
      default: null,
    },
    wonTeamBookmakerSelectionId: {
      type: String,
      default: "",
    },
    wonTeamBetfairSelectionId: {
      type: String,
      default: "",
    },
    wonTieSelectionId: {
      type: String,
      default: "",
    },
    wonTossSelectionId: {
      type: String,
      default: "",
    },
    wonTossTeamName: {
      type: String,
      default: "",
    },
    wonCompletedSelectionId: {
      type: String,
      default: "",
    },
    priority: {
      type: Number,
      default: 0,
    },
    isDeclare: {
      type: Boolean,
      default: false,
    },
    betDelayTime: {
      type: Number,
      default: 0,
    },
    notification: {
      type: String,
      default: "",
    },
    tvId: {
      type: Number,
      default: 0,
    },
    socketPerm: {
      type: Boolean,
      default: false,
    },
    socketUrl: {
      type: String,
      default: "",
    },
    betfairSocketUrl: {
      type: String,
      default: "",
    },
    cacheUrl: {
      type: String,
      default: "",
    },
    otherMarketCacheUrl: {
      type: String,
      default: "",
    },
    checkOddsUrl: {
      type: String,
      default: "",
    },
    tvUrl: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "UPCOMING",
    },
    scoreIframe: {
      type: String,
    },
    scoreIframe2: {
      type: String,
    },
    betPerm: {
      type: Boolean,
      default: true,
    },
    seriesName: {
      type: String,
      default: "",
    },
    wonTeamName: {
      type: String,
      default: null,
    },
    isBookmaker: {
      type: Boolean,
      default: true,
    },
    isTieOdds: {
      type: Boolean,
      default: true,
    },
    isMatchOdds: {
      type: Boolean,
      default: true,
    },
    isToss: {
      type: Boolean,
      default: true,
    },
    isCompletedOdds: {
      type: Boolean,
      default: true,
    },
    isLineMarketOdds: {
      type: Boolean,
      default: true,
    },
    isTv: {
      type: Boolean,
      default: true,
    },
    isScore: {
      type: Boolean,
      default: true,
    },
    isFancy: {
      type: Boolean,
      default: true,
    },
    dateWiseLedger: {
      type: Boolean,
      default: false,
    },
    teamData: {},
    maxMinCoins: {},
    marketList: {},
    betDelaySetting: {},
    team1Img: {
      type: String,
    },
    team2Img: {
      type: String,
    },
    bookmakerRange: {
      type: Number,
      default: 0,
    },
    tossRate: {
      type: Number,
      default: 0,
      min: [0, 'Toss rate cannot be less than 0'],  
      max: [1, 'Toss rate cannot be greater than 1']
    },
    maxProfitBookmaker: {
      type: Number,
      default: 10000000,
    },
    maxProfitFancy: {
      type: Number,
      default: 10000000,
    },
    maxProfitBetfairTennis: {
      type: Number,
      default: 10000000,
    },
    maxProfitBetfairFootball: {
      type: Number,
      default: 10000000,
    },
    maxProfitBetfairRacing: {
      type: Number,
      default: 10000000,
    },
    date: {
      type: String,
      default: () => moment().unix() * 1000,
     
    },
  },
  {
    timestamps: true,
  }
);

const SportListModel = mongoose.model("sportList", SportListSchema);

const ensureIndexes = async () => {
  try {
    const existingIndexes = await SportListModel.collection.indexes();
    const requiredIndexes = [
      { key: { date: -1, marketId: 1 } },
      { key: { date: -1, eventId: 1 } },
      { key: { date: -1 } },
      { key: { status: 1 } },
      { key: { sportId: 1 } },
    ];
    for (const index of requiredIndexes) {
      const exists = existingIndexes.some(
        (existingIndex) =>
          JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await SportListModel.collection.createIndex(index.key);
        console.log(`Index created: ${JSON.stringify(index.key)}`);
      } else {
      }
    }
  } catch (error) {
    console.error("Error ensuring indexes:", error);
  }
};


ensureIndexes();


module.exports = SportListModel;
