require("dotenv").config();
const db = require("../Models/Connection");
const UserModel = require("../Models/User/User.model");
const ShareModel = require("../Models/User/Share.model");
const transactionModel = require("../Models/TransactionLog.model");
const crickTransactionModel = require("../Models/crickTransaction.model");
const statementModel = require("../Models/Statement.model");
const CoinsModel = require("../Models/User/Coins.model");
const activityModel = require("../Models/Activity.model");
const BetModel = require("../Models/BetsList/OddsBetsList.model");
const CasinoBetModel = require("../Models/BetsList/CasinoBetsList.model");
const FancyModel = require("../Models/BetsList/FancyBetsList.model");
const PlayModel = require("../Models/Play.model");
const DomainModel = require("../Models/Domain.model");
const AccountCoinsModel = require("../Models/User/AccountCoins.model");
const ledgerModel = require("../Models/Ledger.model");
const sportsModel = require("../Models/sportList.model");
const sportsMarketModel = require("../Models/sportsMarketList.model");
const loginActivities = require("../Models/LoginActivity.model");
const oddsPosition = require("../Models/BetsList/OddsPosition.model");
const profitLossPos = require("../Models/BetsList/profitLossPosition.model");
const InternationalCasinoBetList = require("../Models/BetsList/InternationalCasinoBetsList.model");
const internationalCasinoList = require("../Models/internationalCasinoList.model");
const sportsConfig = require("../Models/User/UserSportsConfig.model");
const SportsSetting = require("../Models/Sports/SportsSetting.model");
const SettingModel = require("../Models/Setting.model");
const directShareModel = require("../Models/User/directUserShareModel");
const diamondCasinoList = require("../Models/Casino/DiamondCasinoList.model");
const UserInternationExpoLimitModel = require("../Models/User/UserInternationalExpoLimit.model");
const websiteController = require("../Controllers/Bets/Website.controller");

db.initialize();
// const updateInternationalCasinoList = async () => {
//   await websiteController.updateInternationalCasinoGamesInDatabase();
// };

userCreate = async () => {
  let DomainObject = [
    {
      domainName: "all",
      domainUrl: "allDomainAlowed",
    },
  ];
  let userData = {
    username: "OW1000",
    checkUsername: "OW1000",
    password: "1122",
    passwordShow: "1122",
    mobile: "1122334455",
    name: "owner 01",
    userType: "owner",
    status: 1,
    intCasinoMultiply: 1,
    matchShare: 100,
    casinoShare: 100,
    matkaShare: 100,
    userMatchShare: 100,
    userCasinoShare: 100,
    userMatkaShare: 100,
    userPoliticsShare: 100,
    intCasinoShare: 100,
    userShowMatchShare: 100,
    userShowCasinoShare: 100,
    userShowMatkaShare: 100,
    intCasinoExpoLimit: 100000000000,
    userCommissionType: "BetByBet",
    userMatchCommission: 10,
    userSessionCommission: 10,
    userCasinoCommission: 10,
    userMatkaCommission: 20,
    userFixLimit: 1000000000,
    matchCommission: 5,
    sessionCommission: 5,
    commissionType: "BetByBet",
    casinoCommission: 5,
    matkaCommission: 5,
    coins: "100000000000",
    reference: "company",
    creditReference: "100000000000",
    showMatchShare: 100,
    showCasinoShare: 100,
    showMatkaShare: 100,
    betStatus: true,
    matchStatus: true,
    casinoStatus: true,
    matkaStatus: true,
    intCasinoStatus: true,
    selfCuttingPermission: true,
    selfCuttingCoins: 100000000000,
    transactionPassword: "1122",
    matkaLimitPerNumber: 100000000,
    userPriority: 9,
    betMaxMinData: {
      cricket: { minimumBet: "10", maximumBet: "100000000", betDelay: "5" },
      soccer: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      tennis: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      fancy: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      casino: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
    },
    minMaxComm: {
      betfair: { min: 1, max: 10 },
      session: { min: 0, max: 10 },
      bookmaker: { min: 0, max: 10 },
    },
    otp: 112233,
    userBetfairCommission: 10,
    allowedDomains: [],
  };

  let matchOddsConfigData = {
    type: "cricket",
    apiFor: "matchOdds",
    minBet: "100",
    maxBet: "1000000",
    maxProfit: "1000000",
    maxMarketProfit: "1000000",
    maxLiability: "5000000",
    maxMarketLiability: "5000000",
    betDelay: "0",
    commissionIn: "1",
    commissionOut: "0",
    userType: "owner",
  };

  const sportsSetting = {
    type: "cricket",
    isTennis: true,
    isPolitics: true,
    isMatka: true,
    isKabbadi: true,
    isIntCasino: true,
    isFootball: true,
    isCricket: true,
    isCasino: true,
    userType: "owner",
    casinoSetting: {
      isPokerOdi: true,
      isLiveTeen: true,
      isTeenPattiOdi: true,
      isSevenUpAndDownVirtual: true,
      isAmarAkbarAntony: true,
      isDragonTiger: true,
      isSevenUpandDown: true,
      isSevenUpDown: true,
      ispokerVirtual: true,
      isHiLowVirtual: true,
      isHiLow: true,
      isLiveTeenpatti: true,
      isTeenPattitwnty: true,
      isBetOnPooker: true,
      isAndarBahar: true,
      isTeenPattiTest: true,
      isTeenPattiTwnty: true,
      isPoker: true,
      isSixPlayerPoker: true,
      isSixPlayerPokerVirtual: true,
      isBollywoodCasino: true,
      isAndarBaharVirtual: true,
      isRacetwenty: true,
      isMatkaVirtual: true,
    },
  };

  try {
    // await sportsModel.deleteMany();
    // await sportsMarketModel.deleteMany();
    // await UserModel.deleteMany();
    // await ShareModel.deleteMany();
    // await activityModel.deleteMany();
    // await statementModel.deleteMany();
    // await transactionModel.deleteMany();
    // await CoinsModel.deleteMany();
    // await PlayModel.deleteMany();
    // await BetModel.deleteMany();
    // await FancyModel.deleteMany();
    // await ShareModel.deleteMany();
    // await AccountCoinsModel.deleteMany();
    // await DomainModel.deleteMany();
    // await CasinoBetModel.deleteMany();
    // await ledgerModel.deleteMany();
    // await loginActivities.deleteMany();
    // await oddsPosition.deleteMany();
    // await profitLossPos.deleteMany();
    // await InternationalCasinoBetList.deleteMany();
    // await DomainModel.insertMany(DomainObject);
    // await sportsConfig.deleteMany();
    // await SportsSetting.deleteMany();
    // await UserInternationExpoLimitModel.deleteMany();
    // await crickTransactionModel.deleteMany();
    // await directShareModel.deleteMany();
    
    

    let setting = {};
    await SettingModel.create(setting);

    let userResponse = await UserModel.create(userData);
    const expoObj = {
      userType: "owner",
      userId: userResponse._id,
      ownerId: userResponse._id,
      remark: "initially Deposited By System",
      amount: 100000000000,
    };

    await UserInternationExpoLimitModel.create(expoObj);

    let field = `userId`;
    let queryObj = {
      [field]: userResponse._id,
      ownerId: userResponse._id,
      userId: userResponse._id,
    };

    await UserModel.where("_id", userResponse._id).updateOne({
      $set: queryObj,
    });

    let updateObject = {
      userId: userResponse._id,
      UpperLevelCreditReffrence: 0,
      DownLevelCreditReffrence: 0,
      totalMasterBalance: 1000000000,
      upperLevel: 0,
      downLevelProfitLoss: 0,
      downlLevelOccupancyBalance: 0,
      availableBalance: 1000000000,
      availableBalanceProfitLoss: 1000000000,
    };

    await AccountCoinsModel.create(updateObject);

    sportsSetting.userId = userResponse._id;

    await SportsSetting.create(sportsSetting);

    matchOddsConfigData.userId = userResponse._id;
    matchOddsConfigData.ownerId = userResponse._id;

    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "bookmaker";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "fancy";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "toWinToss";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "tiedMatch";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "complateMatch";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "tournamentWinner";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "lineMarket";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "superOver";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "bookmaker";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "drawNoBet";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "nonSport";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "bookmaker";
    matchOddsConfigData.type = "politics";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "fancy";
    matchOddsConfigData.type = "politics";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "bookmaker";
    matchOddsConfigData.type = "kabaddi";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "fancy";
    matchOddsConfigData.type = "kabaddi";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "main";
    matchOddsConfigData.type = "casino";
    matchOddsConfigData.minBet = 100;
    matchOddsConfigData.maxBet = 25000;
    matchOddsConfigData.maxProfit = 200000;
    matchOddsConfigData.maxMarketProfit = 200000;
    matchOddsConfigData.maxLiability = 500000;
    matchOddsConfigData.maxMarketLiability = 500000;
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "andarBaharMain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "liveTeenPattiPlain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "liveTeenPattiPlus";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "pokerPlain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "7upDownMain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "7upDownColor";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "7upDownOddEven";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "7upDownSuit";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaSingle";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaOddeven";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaMulti";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaSp";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaSpall";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaDp";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaDpall";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaTrio";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaCommonSp";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "matkaCommonDp";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "sixPlayerPokerHands";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "sixPlayerPokerPatterns";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "teenPattiT20Plain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "teenPattiT20Plus";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "32CardsCasinoPlain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "hiLowPlain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "hiLowColor";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "hiLowRange";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "aaaMain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "aaaOddEven";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "aaaOverUnder7";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "aaaSingle";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerMain";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerOddEven";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerColorD";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerColorT";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerSuitD";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    matchOddsConfigData.apiFor = "dragonTigerSuitT";
    matchOddsConfigData.type = "casino";
    await sportsConfig.create(matchOddsConfigData);

    let shareData = {
      ownerId: userResponse._id,
      userId: userResponse._id,
      ownerMatchShare: 100,
      ownerCasinoShare: 100,
      ownerMatkaShare: 100,
      ownerMatchCommission: 5,
      ownerSessionCommission: 5,
      ownerCasinoCommission: 5,
      ownerMatkaCommission: 5,
      ownerCommissionType: "BetByBet",
      userType: userResponse.userType,
      userName: userResponse.username,
    };
    let shareDataInsert = await ShareModel.create(shareData);

    let transactionData = {
      userId: userResponse._id,
      userType: userResponse.userType,
      amount: userResponse.coins,
      ownerId: userResponse._id,
      remarks: "Coins Credited By System",
    };

    await transactionModel.create(transactionData);



    let crickTransactionData = {
      userId: userResponse._id,
      userType: userResponse.userType,
      amount: userResponse.coins,
      ownerId: userResponse._id,
      remarks: "Coins Credited By System",
      transactionType : "depositWithdrawal"
    };

    await crickTransactionModel.create(crickTransactionData)

  } catch (error) {
    console.log(error);
    process.exit(0);
  }
};

(async () => {
  console.log("start");
  await userCreate();
  //await updateInternationalCasinoList();
  console.log("done");
})();
