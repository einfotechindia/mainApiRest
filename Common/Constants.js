const siteSetting = {
  IS_WEBSITE_URL_CHECK: false,
  IS_SUBDOMAIN_CHECK: false, // check subdomain in login api
  IS_DIAMOND: false,
  IS_REDIS: true,
  IS_SOCKET: true,
  IS_TV_FETCH_URL: true,
  TV_URL_FETCH: "https://centerpanelcache.crickexpo.in/v2/api/getTvId?eventId=",
  socketUrl: "https://centerpanelcache.crickexpo.in/",
  hitUrl: "https://centerpanelcache.crickexpo.in/v2/api/oddsDataNew?market_id=",
  checkMatchDataUrl:
    "https://centerpanelcache.crickexpo.in/v2/api/oddsDataNew?market_id=",
  matchTvUrl: "https://crickexpo.in/tv/?EventId=",
  tennisSoccerTvUrl: "https://crickexpo.in/tv/?EventId=",
  iframeCricketScore: "https://score.crickexpo.in/socket-iframe-1/",
  iframeCricketScore2: "https://lscore.crickexpo.in/socket-iframe-1/",
  iframeTennisSoccerScore: "https://winx777.com/score/sportRadar/?eventId=",
  iframeTennisSoccerScore2: "https://winx777.com/score/allSportScore/?sportId=",
  getMatchListByNewCenterPanel:
    "https://centerpanelcache.crickexpo.in/v1/centerPanel/matchListByDatabaseGet?status=INPLAY&isMarket=true",
  axiosTimeOut: 5000,
  redisTimeOut: 30, //in Sec
  overallRedisTimeOut: 30, //in Sec
  casinoMultipleTimesCoins: 1,
  sportsSetting: true,
  sportsConfig: true,
};

const fetchUrl = {
  matchDataMarketIdWise: `https://centerpanel.winx777.com/api_inplay?market_id=`,
  marketList: `https://centerpanel.winx777.com/getMarketList?eventId=`,
  marketListNewCenterPanel: `https://centerpanelcache.crickexpo.in/v1/centerPanel/marketDataByEventId?eventId=`,
  oddsUrl: `https://centerpanelcache.crickexpo.in/v2/api/oddsDataNew?market_id=`,
  otherMarketOddsUrl: `https://cache.dollarbet999.com/v2/api/fetchMarketOdds?marketId=`,
  otherMarketOddsUrlEventWise: `https://centerpanelcache.crickexpo.in/v2/api/dataByEventId?eventId=`,
  otherMarketResultUrl: `http://frank.lucky7.ai/matchapi.php?Action=multiMarket&MarketID=`,
  matchListData: `https://centerpanel.winx777.com/api_inplay`,
  casinoListData: `https://centerpanel.winx777.com/getCasinoList`,
  matkaListData: `https://centerpanel.winx777.com/getMatkaList`,
  sessionDataBySelectionId: `https://centerpanel.winx777.com/getSessionData?selectionId=`,
  getCasinoRoundIdResult: `https://casinoapi.tresting.com/v1/apiCalls?apiType=raviDiamondResultRoundWise&roundId=`,
  sportexResultUrl : `https://vendorapi.tresting.com/v3/betfairResults?marketIds=`
};

const UserTypes = [
  "client",
  "agent",
  "superagent",
  "master",
  "subadmin",
  "admin",
  "superadmin",
  "subowner",
  "owner",
];

const UserSpecificSubDomainLogin = {
  agent: "agent",
  super: "superagent",
  master: "master",
  sub: "subadmin",
  madmin: "subadmin",
  admin: "admin",
  sadmin: "superadmin",
  sowner: "subowner",
  owner: "owner",
  operating: "owner",
};

const StatementMsg = {
  oddMsg: "odds",
};

const CommonErrMsg = {
  internalServerError: "Internal Server Error",
};

const AuthErrMsg = {
  noAuthHeader: "Access denied: Missing or invalid authorization token",
  invalidUser:
    "User validation failed: Account status set to inactive or does not exist",
};

const UserServiceErrMsg = {
  invalidUserType: "Invalid user type: Please provide a valid user type",
  invalidCreatorId:
    "Invalid creator ID: The specified creator ID is invalid or does not exist",
  wrongCredentials: "Username Or Password Is Incorrect",
  notEnoughCoins:
    "Insufficient coins: The creator does not have enough coins to create a new user. Please add more coins and try again",
  notAllowedToCreateUser:
    "Not authorized to create user: The creator does not have permission to create users of the specified type",
  userShareNotFound: "User share data not found",
};

const MaxCommissionLimit = {
  matchCommissionLimit: 10,
  betfairCommissionLimit: 10,
  sessionCommissionLimit: 10,
  casinoCommissionLimit: 10,
  matkaCommissionLimit: 10,
};

const geoLocationUrl = {
  url: "https://api.ipgeolocation.io/ipgeo?apiKey=188bc45479f94fc7b7af24f7aa89df2e",
  isFetch: true,
  apiKey: "6efc3c3ba59e438ba65c8b7ff0e7f88f",
};

const casinoFetchUrl = {
  casinoResultmarketWiseVanky: "https://casinoapi.in/api/getGameData?round=",
  casinoResultmarketWise:
    "https://casinoapi.tresting.com/v1/apiCalls?apiType=raviDiamondResultRoundWise&roundId=",
  virtualCasinoResult: "https://casinoapi.tresting.com/v1/game/resultByRoundId",
};

const mimMaxCoinsData = {
  tieOdds: {
    max: 100000,
    min: 100,
  },
  completesOdds: {
    max: 100000,
    min: 100,
  },
  tossOdds: {
    max: 100000,
    min: 100,
  },
  bookmakerOdds: {
    max: 100000,
    min: 100,
  },
  fancyOdds: {
    max: 100000,
    min: 100,
  },
};

const betChipsData = {
  100: 100,
  500: 500,
  1000: 1000,
  2000: 2000,
  5000: 5000,
  10000: 10000,
  25000: 25000,
  50000: 50000,
  100000: 100000,
  200000: 200000,
  300000: 300000,
  500000: 500000,
};


const bonusArray = {
   bonusAllow : true ,
   setting :{
    bonusType : "betByBet",        //# onlyOnMibus , noBonus
    bonusLayerAllow : {
      directByAgent : 2,
      firstLayer : 2,
      secondlayer : 0,
      thirdLayer : 0,
      fourthLayer : 0,
      fifthLayer : 0,
      sixLayer : 0,
    }
   },
   allowMarketTypeBonus : {
    bookmakerAmount : true,
    matchOddsAmount : false,
    internationCasinoAmount : true,
    diamondCasinoAmount : true,
    fancyAmount : true,
    matkaAmount : true,
   }

};

const betfairMaximumAllowOddsBySportWise = {
  4 : {
    sportType : "Cricket",
    maxOdds : 50
  },
  1 : {
    sportType : "Soccer",
    maxOdds : 50
  },
  2 : {
    sportType : "Tennis",
    maxOdds : 50
  },
  4339 : {
    sportType : "Greyhound Racing",
    maxOdds : 50
  },
  7 : {
    sportType : "Horse Racing",
    maxOdds : 50
  },
};


const allowedCreation = {
  owner: ["subowner", "superadmin", "admin", "subadmin", "master", "superagent", "agent", "client"],
  subowner: ["superadmin", "admin", "subadmin", "master", "superagent", "agent", "client"],
  superadmin: ["admin", "subadmin", "master", "superagent", "agent", "client"],
  admin: ["subadmin", "master", "superagent", "agent", "client"],
  subadmin: ["master", "superagent", "agent", "client"],
  master: ["superagent", "agent", "client"],
  superagent: ["agent", "client"],
  agent: ["client"],
  client: [],
};


const onlyInrGamesAllowed = [
  "Evolution Gaming",
  "SAP",
]



const ByDefaultBetfairMarketBlockArray = [
  "Over/Under 2.5 Goals",
  "Over/Under 3.5 Goals",
  "Over/Under 4.5 Goals",
  "Over/Under 5.5 Goals",
]



module.exports = {
  UserTypes,
  CommonErrMsg,
  AuthErrMsg,
  UserServiceErrMsg,
  MaxCommissionLimit,
  geoLocationUrl,
  fetchUrl,
  siteSetting,
  StatementMsg,
  betChipsData,
  casinoFetchUrl,
  UserSpecificSubDomainLogin,
  mimMaxCoinsData,
  bonusArray,
  betfairMaximumAllowOddsBySportWise,
  allowedCreation,
  onlyInrGamesAllowed,
  ByDefaultBetfairMarketBlockArray
};
