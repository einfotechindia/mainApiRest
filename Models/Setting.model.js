const mongoose = require("mongoose");

const SettingSchema = new mongoose.Schema(
  {
    minSessionAmt: {
      type: Number,
      default: 100,
    },
    maxSessionAmt: {
      type: Number,
      default: 200000,
    },
    maxBookmakerAmt: {
      type: Number,
      default: 200000,
    },
    minBookmakerAmt: {
      type: Number,
      default: 100,
    },
    maxMatchOddsAmt: {
      type: Number,
      default: 200000,
    },
    minMatchOddsAmt: {
      type: Number,
      default: 200,
    },
    maxTieOddsAmt: {
      type: Number,
      default: 200000,
    },
    minTieOddsAmt: {
      type: Number,
      default: 200,
    },
    maxTossOddsAmt: {
      type: Number,
      default: 200000,
    },
    minTossOddsAmt: {
      type: Number,
      default: 200,
    },

    maxIntCasinoBet: {
      type: Number,
      default: 200000,
    },
    minIntCasinoBet: {
      type: Number,
      default: 10,
    },
     maxGreyHoundOddsAmt: {
      type: Number,
      default: 200000,
    },
    maxHorseRacingOddsAmt: {
      type: Number,
      default: 10,
    },
    maxTennisOddsAmt: {
      type: Number,
      default: 200000,
    },
    maxFootballOddsAmt: {
      type: Number,
      default: 10,
    },
     maxFootballGoalLineAmt: {
      type: Number,
      default: 10,
    },
    socketUrl: {
      type: String,
      default: "https://vigcache.tresting.com/",
    },
    betfairSocketUrl: {
      type: String,
      default: "https://cache.10xbpexch.com/",
    },
    bookmakerCacheUrl: {
      type: String,
      default:
        "https://vigcache.tresting.com/v2/api/oddsDataNew?market_id=",
    },
    betfairCacheUrlByEventId: {
      type: String,
      default:
        "https://cache.10xbpexch.com/v2/api/dataByEventId?eventId=",
    },
    betfairCacheUrlByMarketId: {
      type: String,
      default:
        "https://cache.10xbpexch.com/v2/api/fetchMarketOdds?marketId=",
    },
    nodeCenterPanel: {
      type: String,
      default:
        "https://vigcache.tresting.com/v1/centerPanel/matchListByDatabaseGet?status=INPLAY&isMarket=true",
    },
    racingCenterPanel: {
      type: String,
      default:
        "https://cache.10xbpexch.com/v1/centerPanel/getRacingSportsData?status=INPLAY",
    },
    nodeCenterPanelMarketData: {
      type: String,
      default:
        "https://cache.10xbpexch.com/v1/centerPanel/marketDataByEventId?eventId=",
    },
    tvFetchUrl: {
      type: String,
      default: "https://vigcache.tresting.com/v2/api/getTvId?eventId=",
    },
    tvProxyUrl: {
      type: String,
      default: "https://btocapi.tresting.com/embedN2?eventId=",
    },
    scoreUrl: {
      type: String,
      default: "https://score.tresting.com/socket-iframe-11/crickexpo/",
    },
    scoreUrl2: {
      type: String,
      default: "https://app.livetvapi.com/iscoreboard/",
    },
    scoreUrlTennis: {
      type: String,
      default: "https://app.livetvapi.com/iscoreboard/",
    },
    scoreUrlTennis2: {
      type: String,
      default: "https://app.livetvapi.com/iscoreboard/",
    },
    diamondRoundIdWiseUrl: {
      type: String,
      default: "",
    },
    tvUrl: {
      type: String,
      default: "",
    },
    betDelay: {
      type: Number,
      default: 0,
    },
    matchOddsBetDelay: {
      type: Number,
      default: 5,
    },
    footballBetDelay: {
      type: Number,
      default: 0,
    },
    tennisBetDelay: {
      type: Number,
      default: 0,
    },
    horseBetDelay: {
      type: Number,
      default: 0,
    },
    greyBetDelay: {
      type: Number,
      default: 0,
    },
    diamondCasioPerBet: {
      type: Boolean,
      default: false,
    },
    isSystemUsername: {
      type: Boolean,
      default: false,
    },
    isFancyMaxAmountCheck: {
      type: Boolean,
      default: false,
    },
    insertCommCoinsInUsers: {
      type: Boolean,
      default: false,
    },
    deductBetfairComm: {
      type: Boolean,
      default: false,
    },
    isLedgerDeclareOnFancyResult: {
      type: Boolean,
      default: false,
    },
    isLedgerDeclareOnTossResult: {
      type: Boolean,
      default: false,
    },
    isMatkaPerBetLimit: {
      type: Boolean,
      default: false,
    },
    isPasswordEncruption: {
      type: Boolean,
      default: true,
    },
    isWebsiteUrlCheck: {
      type: Boolean,
      default: false,
    },
    isSubdomainCheck: {
      type: Boolean,
      default: false,
    },
    clientCount: {
      type: Number,
      default: 1000,
    },
    userCount: {
      type: Number,
      default: 1000,
    },
    bookmakerRange: {
      type: Number,
      default: 0,
    },
    isSocketPerm: {
      type: Boolean,
      default: false,
    },
    tvUrlFetchByCenterpanel: {
      type: Boolean,
      default: true,
    },
    isDiamondCasino: {
      type: Boolean,
      default: true,
    },
    isInternationalCasino: {
      type: Boolean,
      default: true,
    },
    isSports: {
      type: Boolean,
      default: true,
    },
    isDiamond: {
      type: Boolean,
      default: false,
    },
    isCricket: {
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
    isTransactionPassword: {
      type: Boolean,
      default: false,
    },
    isBonusDistribution: {
      type: Boolean,
      default: false,
    },
    checkBookmakerSessionBetLimit: {
      type: Boolean,
      default: false,
    },
    bookmakerMaximumBetLimit: {
      type: Number,
      default: 2000000,
    },
    sessionMaximumBetLimit: {
      type: Number,
      default:  2000000,
    },
    bonusArray : {},
    dayWiseLedgerFortest: {
      type: Boolean,
      default:  false,
    },
    isOpenBets: {
      type: Boolean,
      default: true,
    },
    isBookmakerRedis: {
      type: Boolean,
      default: true,
    },
    isBetFairRedis: {
      type: Boolean,
      default: true,
    },
     isOwnSocket: {
      type: Boolean,
      default: true,
    },
    maxBetfairOddsCheck: {
      type: Number,
      default: 100,
    },
    tossRate: {
      type: Number,
      default: 0.98,
    },
    clientCode: {
      type: String,
      default: "C",
    },
    agentCode: {
      type: String,
      default: "A",
    },
    superagentCode: {
      type: String,
      default: "SA",
    },
    masterCode: {
      type: String,
      default: "MA",
    },
    subadminCode: {
      type: String,
      default: "ADM",
    },
    adminCode: {
      type: String,
      default: "AD",
    },
    superadminCode: {
      type: String,
      default: "AD",
    },
    subownerCode: {
      type: String,
      default: "SOW",
    },
    checkFancyAllow: {
      type: Boolean,
      default: false,
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
    cricketBetAcceptBeforeTimingHour: {
      type: Number,
      default: 36,
    },
     soccerBetAcceptBeforeTimingHour: {
      type: Number,
      default: 36,
    },
    tennisBetAcceptBeforeTimingHour: {
      type: Number,
      default: 36,
    },
    racingBetAcceptBeforeTimingHour: {
      type: Number,
      default: 36,
    },
  },
  {
    timestamps: true,
  }
);

const SettingModel = mongoose.model("Setting", SettingSchema);

module.exports = SettingModel;
