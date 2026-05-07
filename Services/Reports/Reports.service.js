const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const transactionLog = require("../../Models/TransactionLog.model");
const userLedger = require("../../Models/Ledger.model");
const moment = require("moment");
const sportsListModel = require("../../Models/sportList.model");
const { siteSetting, UserTypes } = require("../../Common/Constants");
const LedgerModel = require("../../Models/Ledger.model");
const playModel = require("../../Models/Play.model");
const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const {
  getOddsPositionByMarketWise,
  getMatchList,
  sessionPositionUserWise,
} = require("../Sports/Bet.service");

const { SendResponse } = require("../../Helpers/ResponseMapper");
const axios = require("axios");
axios.defaults.timeout = siteSetting.axiosTimeOut;
const { client } = require("../../Helpers/RedisHelper");

const { CasinoProfitLossAndComm } = require("../../Helpers/TransactionHelper");

const UserUtils = require("../../Helpers/UsersUtils");

const {
  _dx,
  _d,
  convertKeyObject,
  convertObjectToArray,
  removeDuplicates,
  getClientShareArray,
  whereHelper,
  dateWhereCond,
  convertKeyObjectAndSeperateid,
  _date,
} = require("../../Helpers/CommonHelper");
const TransactionLogModel = require("../../Models/TransactionLog.model");

async function run() {
  console.log("Before waiting");
  await delay(3000);
  console.log("After 3 seconds");
}

const getPlusMinusByMarketIdByUserWise = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
  }

  let userWhere = {};
  let marketId = "";
  if (bodyData.marketId) {
    marketId = bodyData.marketId;
    userWhere = { marketId: marketId };
  }

  if (bodyData.userId) {
    userId = bodyData.userId;
    userType = bodyData.userType;
  }
  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];
  userWhere[`${userType}Id`] = new ObjectId(userId);

  if (bodyData.isCasino) {
    userWhere.isCasino = bodyData.isCasino;
  }

  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.downlineUserType) {
    downlineUserType = bodyData.downlineUserType;
  }


  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
        userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
        userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
      },
    },
  ]);


  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userType: 1,
      userMatchShare: 1,
      creatorId: 1,
      creatorUserType: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }

  let superDownlineUserType = "";

  const downUserpriority = UserTypes.indexOf(downlineUserType);
  superDownlineUserType = UserTypes[downUserpriority - 1];

  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id]?.userMatchShare;
    element.downlineUserType = superDownlineUserType;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const companyReport = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  let userWhere = whereHelper(loginData, { marketId: marketId });
  if (bodyData.userId) {
    userId = bodyData.userId;
  }
  // const userData = await UserModel.findOne(
  //   {
  //     _id: new ObjectId(userId),
  //   },
  //   {
  //     _id: 1,
  //     userId: 1,
  //     userType: 1,
  //     userPriority: 1,
  //   }
  // );

  // userWhere[`${userData.userType}Id`] = new ObjectId(userId);

  let downlineUserType = "client";

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        clientSessionTurnover: { $sum: `$clientSessionTurnover` },
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userSessionComm: { $sum: `$${userType}SessionComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
        userNetProfitLossSelf: { $sum: `$${userType}NetProfitLossSelf` },

        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
      },
    },
  ]);

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userMatchShare: 1,
      userType: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }
  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const clientReport = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  const loginData = req.loggedInUser;

  let userId = loginData.userId;
  let userType = loginData.userType;
  let userWhere = whereHelper(loginData, { marketId: marketId });
  if (bodyData.userId) {
    userId = bodyData.userId;
  }
  const userData = await UserModel.findOne(
    {
      _id: new ObjectId(userId),
    },
    {
      _id: 1,
      userId: 1,
      userType: 1,
      userPriority: 1,
    }
  );
  userWhere[`${userData.userType}Id`] = new ObjectId(userId);

  let downlineUserType = "client";

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userSessionComm: { $sum: `$${userType}SessionComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
      },
    },
  ]);

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userMatchShare: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }
  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const userProfitLoss = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = await whereHelper(loginData);
  let downlineUserType = `${loginData.userType}`;

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.userId && bodyData.userType) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
  }

   let profitLossData = await profitLossPosition.aggregate([
     {
       $match: userWhere,
     },
     {
       $group: {
         _id: `$marketId`,
         userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
         userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
         userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLossSelf` },
         userNetProfitLossSelf: { $sum: `$${downlineUserType}NetProfitLoss` },
         userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
         createdAtDate: { $first: `$createdAt` },
         createdAt: { $first: `$createdAt` },
         marketId: { $first: `$marketId` },
         isCasino: { $first: `$isCasino` },
         eventName: { $first: `$eventName` },
       },
     },
     {
       $sort: {
         createdAt: -1,
       },
     },
   ]);
  
  let marketIdArray = [];
   profitLossData.map((data , key)=>{
    if(data.isCasino){
      profitLossData[key].userNetProfitLoss = -1 * data.userNetProfitLossSelf
    }
     marketIdArray.push(data.marketId);
   })
  
  
  if (bodyData.isBsf) {
    
  
  
   var cricRes = await CrickTransactionLogModel.aggregate([
          {
            $match: {
              [`${downlineUserType}Id`]: new ObjectId(loginData.userId),
              marketId: { $in: marketIdArray },
            },
          },
          {
            $group: {
              _id: "$marketId",
              totalProfitLoss: { $sum: `$${downlineUserType + "ProfitLoss"}` },
              userCommission:  {
                  $sum: {
                    $cond: [
                      {
                        $and: [{ $eq: ["$transactionType", "profitLoss"] } , { $eq: ["$isComm", 1] }],
                      },
                      `$${downlineUserType}ProfitLoss`,
                      0,
                    ],
                  },
                    },
              matchprofitLoss:  {
                  $sum: {
                    $cond: [
                      {
                        $and: [{ $eq: ["$transactionType", "profitLoss"] } , { $eq: ["$isComm", 0] }],
                      },
                      `$${downlineUserType}ProfitLoss`,
                      0,
                    ],
                  },
              },
            },
          },
   ]);

  if (cricRes) {
    cricRes = convertKeyObject(cricRes, "_id");
  }

 profitLossData.map((data, key) => { 
   if (!data.isCasino && cricRes[data._id]) {
     let cricProfitLoss = cricRes[data._id]
     profitLossData[key].matchEarning = -1 * cricProfitLoss.matchprofitLoss
     profitLossData[key].CommissionProfitLoss = -1 * cricProfitLoss.userCommission
     profitLossData[key].totalEarniing = -1 * cricProfitLoss.totalProfitLoss
    }
  }) 
}
  
  
  // _d(cricRes)

  // _d(profitLossData , "profitLossData")

   
  // if (bodyData.totalProfitLoss) {
  //   delete userWhere.date;
  //   let totalProfitLoss = await profitLossPosition.aggregate([
  //     {
  //       $match: userWhere,
  //     },
  //     {
  //       $group: {
  //         _id: `$${downlineUserType}Id`,
  //         userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLossSelf` },
  //       },
  //     },
  //     {
  //       $sort: {
  //         createdAt: -1,
  //       },
  //     },
  //   ]);
  //   profitLossData = {
  //     profitLossData: profitLossData,
  //     totalProfitLoss: totalProfitLoss[0]
  //       ? totalProfitLoss[0].userNetProfitLoss
  //       : 0,
  //   };
  // }

  return SendResponse(
    res,
    "success",
    false,
    profitLossData
  );
};

const generateCasinoProfitLossAndComm = async (req, res) => {
  const bodyData = req.body;
  const positionData = await CasinoProfitLossAndComm(bodyData);
  return SendResponse(
    res,
    "success",
    "comm generated successfully",
    positionData
  );
};

const groupByBetsForEventId = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let userType = loginData.userType;

  let inWhere = [
    "bookmakerOdds",
    "matchOdds",
    "matchOddsComm",
    "matchOddsOddsComm",
    "bookmakerOddsComm",
    "fancyOdds",
    "fancyOddsComm",
    "internationalCasino",
    "depositWithdraw",
  ];

  let where = {
    forBet: 1,
    overallType: {
      $in: inWhere,
    },
    isDeclare: 1,
  };

  // let where = {};

  if (bodyData.userType && bodyData.userType != "client") {
    where.isComm = 0;
  }

  if (bodyData.userType == "client") {
    delete where.forBet;
  }

  if (bodyData.marketId) {
    where.marketId = req.body.marketId;
  }

  let userWhere = await whereHelper(loginData, where);
  if (userType != "client") {
    userWhere = where;
  }

  let userAmountType = `${userType}Amount`;
  if (userType == "client") {
    userAmountType = "amount";
  }

  if (bodyData.userType && bodyData.userId) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    userAmountType = `${bodyData.userType}Amount`;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.gameType && bodyData.gameType != "all") {
    let gameType = bodyData.gameType;
    if (gameType == "casino") {
      userWhere.overallType = "internationalCasino";
    } else if (gameType == "cricket") {
      userWhere.overallType = {
        $in: ["fancyOdds", "bookmakerOdds"],
      };
    } else {
      userWhere.overallType = "";
    }
  }

  let forBet = bodyData.hasOwnProperty("forBet");

  if (forBet && bodyData.forBet != "all") {
    userWhere.forBet = bodyData.forBet;
    forBet = bodyData.forBet;
    if (forBet == 0) {
      delete userWhere.overallType;
      delete userWhere.isDeclare;
      userAmountType = "amount";
    }
  }

  if (bodyData.userType == "client") {
    userAmountType = "amount";
  }

  let groupByData = await transactionLog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: {
          remarks: "$remarks",
          marketId: "$marketId",
        },
        userAmount: { $sum: `$${userAmountType}` },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        selectionId: { $first: "$selectionId" },
        oddsType: { $first: "$gameType" },
        marketId: { $first: "$marketId" },
        eventId: { $first: "$eventId" },
        isComm: { $first: "$isComm" },
      },
    },
    {
      $sort: { createdAt: -1, _id: 1 },
    },
  ]);

  let totalAmount = 0;

  if (bodyData.fromDate && bodyData.toDate) {
    const fromDate = moment(bodyData.fromDate);
    const newDate = fromDate.subtract(1000, "days");
    bodyData.toDate = bodyData.fromDate;
    bodyData.fromDate = newDate.format("YYYY-MM-DD");
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);

    let totalAmountRes = await transactionLog.aggregate([
      {
        $match: userWhere,
      },
      {
        $group: {
          _id: "$userId",
          userAmount: { $sum: `$${userAmountType}` },
        },
      },
    ]);
    if (totalAmountRes[0] && totalAmountRes[0].userAmount) {
      totalAmount = totalAmountRes[0].userAmount;
    }
  }
  return SendResponse(res, "success", totalAmount, groupByData);
};

const sportsProfitLoss = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  const userType = loginData.userType;
  let query = { forBet: 1, isDeclare: { $in: [1, true] } };
  if (bodyData.fromDate && bodyData.toDate) {
    query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
  query = await whereHelper(loginData, query);
  let userAmountType = `${userType}Amount`;
  if (userType == "client") {
    userAmountType = "amount";
  }
  let groupByData = await transactionLog.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: `$gameType`,
        userAmount: { $sum: `$${userAmountType}` },
        clientAmount: { $sum: `$amount` },
      },
    },
  ]);
  return SendResponse(res, "success", "data is fetched", groupByData);
};

const chipSummary = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  const userType = loginData.userType;
  let query = {};

  query.userId = new ObjectId(loginData.userId);
  query = await whereHelper(loginData, query);

  if (bodyData.downlineUserId) {
    query.userId = new ObjectId(bodyData.downlineUserId);
  }

  let fetchUserData = await UserModel.findOne(query);

  if (!fetchUserData) {
    return SendResponse(res, "error", "user not found");
  }

  let returnData = {
    username: fetchUserData.username,
    name: fetchUserData.name,
    currentBalance: fetchUserData.coins,
  };

  let upLineProfit = await userLedger.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: `$userId`,
        upLineprofitLoss: { $sum: `$amount` },
      },
    },
  ]);
  returnData.upLineprofitLoss = upLineProfit[0]
    ? upLineProfit[0].upLineprofitLoss
    : upLineProfit.upLineprofitLoss;

  delete query.userId;
  let resData = await UserModel.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        totalClient: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$userType", "client"] },
                  { $eq: ["$creatorId", new ObjectId(fetchUserData.userId)] },
                ],
              },
              1,
              0,
            ],
          },
        },
        childFreeChips: { $sum: `$coins` },
        exposure: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$userType", "client"] },
                  { $eq: ["$creatorId", new ObjectId(fetchUserData.userId)] },
                ],
              },
              "$exposure",
              0,
            ],
          },
        },
      },
    },
  ]);

  if (resData[0]) {
    returnData.childFreeChips = resData[0].childFreeChips;
    returnData.totalClient = resData[0].totalClient;
    returnData.exposure = resData[0].exposure;
  }
  return SendResponse(res, "success", "data is fetched", returnData);
};

const weeklyReport = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  const userType = loginData.userType;
  let fromDate = await moment().startOf("day");
  let sevenDaysBefore = fromDate.clone().subtract(7, "days");
  const dateWhere = await dateWhereCond(fromDate, sevenDaysBefore);
  let userWhere = await whereHelper(loginData);
  // userWhere.date = dateWhere;

  let returnData = {
    sportsDetails: {},
    casinoDetails: {},
  };

  let sportsDetails = await transactionLog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$date`,
        userAmount: { $sum: `$${userType}Amount` },
        date: { $first: "$date" },
      },
    },
  ]);

  _dx(sportsDetails);
};

const topClient = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  const userType = loginData.userType;
  let query = {
    forBet: 1,
    isDeclare: 1,
    userType: "client",
  };
  if (bodyData.fromDate && bodyData.toDate) {
    query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
  query = await whereHelper(loginData, query);

  let topCustomer = await transactionLog.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: `$userId`,
        totalAmount: { $sum: `$amount` },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  let clientList = [];
  let finalList = [];

  if (topCustomer) {
    topCustomer.map((data, key) => {
      clientList.push(data._id);
    });
  }

  let userData = await UserModel.find(
    { userId: { $in: clientList } },
    { username: 1, name: 1 }
  );

  if (userData) {
    userData = convertKeyObject(userData, "_id");
  }

  topCustomer.map((final) => {
    let push = {
      userDetails: userData[final._id],
      amount: final.totalAmount.toFixed,
    };
    finalList.push(push);
  });

  return SendResponse(res, "success", "market not found", finalList);
};

const selfStatement = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  let userWhere = {};

  let redisUserShareData = {};

  if (bodyData.userId && bodyData.userType) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    userType = bodyData.userType;
    userId = bodyData.userId;

    redisUserShareData = await client.get(`${bodyData.userId}_shareData`);

    if (!redisUserShareData) {
      redisUserShareData = await UserModel.findOne(
        {
          userId: new ObjectId(bodyData.userId),
        },
        {
          userMatchShare: 1,
          userCasinoShare: 1,
          userMatkaShare: 1,
          userId: 1,
        }
      );
      await client.set(
        `${bodyData.userId}_shareData`,
        JSON.stringify(redisUserShareData)
      );
    } else {
      redisUserShareData = JSON.parse(redisUserShareData);
    }
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userSessionComm: { $sum: `$${userType}SessionComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLossSelf` },
        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
        clientOddsComm: { $sum: `$clientOddsComm` },
        clientSessionComm: { $sum: `$clientSessionComm` },
        clientOddsAmount: { $sum: `$clientOddsAmount` },
        clientSessionAmount: { $sum: `$clientSessionAmount` },
      },
    },
  ]);

  if (bodyData.isCric) {
    let directUserData = await UserUtils.gettingDirectUserByUserId(userId);
    let userDataArray = directUserData.userDataArray;
    let userAraryWhere = directUserData.idArrayWhere;
    let downlineUserComm = {
      downlineOddsComm: 0,
      downlineSessionComm: 0,
    };
    for (const key in userAraryWhere) {
      if (userAraryWhere[key].$in && Array.isArray(userAraryWhere[key].$in)) {
        let downLineUserType = key.split("Id")[0];

        let downLineUserWhere = {
          ...userWhere,
          ...{
            [key]: {
              $in: userAraryWhere[key].$in,
            },
          },
        };

        var resDataUser = await profitLossPosition.aggregate([
          {
            $match: downLineUserWhere,
          },
          {
            $group: {
              _id: `$${key}`,
              downLineOddsComm: { $sum: `$${downLineUserType}OddsComm` },
              downLineSessionComm: { $sum: `$${downLineUserType}SessionComm` },
            },
          },
        ]);

        if (resDataUser && resDataUser.length > 0) {
          resDataUser.map((res) => {
            let downLineOddsComm = res.downLineOddsComm;
            let downlineSessionComm = res.downLineSessionComm;
            if (userDataArray[res._id + ""]) {
              let userDetails = userDataArray[res._id];
              let userMatchShare = userDetails.userMatchShare;

              downLineOddsComm =
                ((100 - userMatchShare) / 100) * downLineOddsComm;
              downlineSessionComm =
                ((100 - userMatchShare) / 100) * downlineSessionComm;
            }
            downlineUserComm.downlineOddsComm += downLineOddsComm;
            downlineUserComm.downlineSessionComm += downlineSessionComm;
          });
        }
      }
    }

    resData[0].downLineUserOddsComm = downlineUserComm.downlineOddsComm;
    resData[0].downLineSessionComm = downlineUserComm.downlineSessionComm;
  }

  userWhere.userId = new ObjectId(userId);
  let groupCond = {
    _id: "$userId",
    totalAmount: { $sum: "$amount" },
  };

  var ledgerResData = await LedgerModel.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: groupCond,
    },
  ]);
  if (ledgerResData[0]) {
    resData[0].userLedgerAmt = ledgerResData[0].totalAmount;
  }

  if (redisUserShareData) {
    resData[0].shareData = redisUserShareData;
  }
  return SendResponse(res, "success", "dataFetched", resData);
};


const marketAnalysis = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    let matchList = await getMatchList();
    matchList = matchList.filter(data => [1, 3, 4].includes(data.sportId));
    const promises = matchList.map(async (matchData) => {
      const marketId = matchData.marketId;
      const pushData = {
        marketId: matchData.marketId,
        eventId: matchData.eventId,
        matchName: matchData.matchName,
        sportId: matchData.sportId,
        marketList: matchData.marketList,
      };
      const [oddsResult, fancyResult] = await Promise.allSettled([
        getOddsPositionByMarketWise(loginData, marketId + ""),
        sessionPositionUserWise(loginData, marketId + "")
      ]);

      if (oddsResult.status === "fulfilled" && oddsResult.value) {
        pushData.oddsPositionData = oddsResult.value;
      }
      if (fancyResult.status === "fulfilled" && fancyResult.value) {
        pushData.fancyPosition = fancyResult.value;
      }

      return pushData;
    });

    const settledResults = await Promise.allSettled(promises);

    const finalList = settledResults
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);

    return SendResponse(res, "success", "dataFetched", finalList);

  } catch (error) {
    console.error("❌ marketAnalysis error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};


const profitLossForAllExch = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userType = loginData.userType;

  let whereQuery = await whereHelper(loginData);

  if (bodyData.fromDate && bodyData.toDate) {
    whereQuery.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.marketId) {
    whereQuery.marketId = bodyData.marketId;
  }

  let _idGroupBy = `userId`;
  if (bodyData.userId && bodyData.userType) {
    whereQuery[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    userType = bodyData.userType;
    _idGroupBy = `${bodyData.userType}Id`;
  }

  let userData = [];
  if (bodyData.isCreatorId) {
    userData = await UserModel.find(
      {
        creatorId: new ObjectId(bodyData.isCreatorId),
      },
      {
        _id: 1,
        userId: 1,
        userType: 1,
        userPriority: 1,
        name: 1,
      }
    );
    if (userData) {
      userData = JSON.parse(JSON.stringify(userData));
    }
    userId = userData.map((data) => {
      return data._id;
    });
  }

  let userNetProfitLoss = `${userType}NetProfitLoss`;
  if (userType == "client") {
    userNetProfitLoss = "clientNetAmount";
    whereQuery.userId = whereQuery.clientId;
    delete whereQuery.clientId;
  }

  if (userType == "owner") {
    userNetProfitLoss = "subownerNetProfitLoss";
  }

  let group = {
    _id:{ 
      eventName : `$eventName`,
      marketId : `$marketId`,
    },
    userOddsComm: { $sum: `$${userType}OddsComm` },
    userSessionComm: { $sum: `$${userType}SessionComm` },
    userNetProfitLoss: { $sum: `$${userNetProfitLoss}Self` },
    eventName: { $first: `$eventName` },
    marketId: { $first: `$marketId` },
    date: { $first: `$date` },
    createdAt: { $first: `$createdAt` },
    isCasino: { $first: `$isCasino` },
    result: { $first: `$result` },
  };

  if (userType == "client") {
    group.oddsAmt = { $sum: `$clientOddsAmount` };
    group.sessionAmt = { $sum: `$clientSessionAmount` };
    group.clientNetAmount = { $sum: `$clientNetAmount` };
  }

  let gameType = bodyData.hasOwnProperty("gameType");
  if (gameType && bodyData.gameType != "all") {
    gameType = bodyData.gameType;
    if (gameType == "cricket") {
      whereQuery.isCasino = 0;
    }
    if (gameType == "casino") {
      whereQuery.isCasino = 1;
    }
    if (gameType == "kabaddi") {
      whereQuery.isKabaddi = 1;
    }
    if (gameType == "politics") {
      whereQuery.isPolitics = 1;
    }
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: whereQuery,
    },
    {
      $group: group,
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  return SendResponse(res, "success", "dataFetched", resData);
};

const myCash = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let query = await whereHelper(loginData);
  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );
  let userArary = directUserData.idArrayData;

  if (bodyData.fromDate && bodyData.toDate) {
    query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  query.ledgerType = "settle";

  if (userArary) {
    query.userId = {
      $in: userArary,
    };
  }


  // _d(query , "query")

  var resData = await LedgerModel.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: `$${loginData.userType}Id`,
        totalAmount: { $sum: "$amount" },
        settleAmount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$ledgerType", "settle"] }],
              },
              "$amount",
              0,
            ],
          },
        },
      },
    },
  ]);
  let amount = 0;
  let settlementAmount = 0;
  let parentCash = 0;
  if (resData[0] && resData[0].totalAmount) {
    amount = resData[0].totalAmount;
    settlementAmount = resData[0].settleAmount;
  }
  if(bodyData.parentCash && bodyData.parentCash==true){
    var parentCashData = await LedgerModel.aggregate([
      {
        $match: {userId : new ObjectId(bodyData.creatorId) },
      },
      {
        $group: {
          _id: `$${loginData.userType}Id`,
          settleAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$ledgerType", "settle"] }],
                },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ]);
    parentCash = parentCashData[0]?.settleAmount
  }

  return SendResponse(res, "success", "dataFetched", {
    amount: amount,
    settlementAmount: settlementAmount,
    parentCash:parentCash
  });
};

const liveSettlementreport = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userWhere = whereHelper(loginData, { marketId: marketId });
  if (bodyData.userId) {
    userId = bodyData.userId;
  }
  const userData = await UserModel.findOne(
    {
      _id: new ObjectId(userId),
    },
    {
      _id: 1,
      userId: 1,
      userType: 1,
      userPriority: 1,
    }
  );

  userWhere[`${userData.userType}Id`] = new ObjectId(userId);
  downlineUserType = UserTypes[userData.userPriority - 2];

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
        userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
        userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
      },
    },
  ]);

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userMatchShare: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }
  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const downlineOddsPosByMarketId = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );
  let directUserWheredArray = directUserData.idArrayWhere;
  let userWhere = {
    marketId: bodyData.marketId,
    $or: [directUserWheredArray],
  };

  // _dx(userWhere);
  userWhere = whereHelper(loginData, userWhere);

  // _d(userWhere);

  try {
    var resData = await profitLossPosition.aggregate([
      {
        $match: userWhere,
      },
      {
        $group: {
          _id: "$marketId",
          clientOddsAmount: { $sum: "$clientOddsAmount" },
          clientSessionAmount: { $sum: "$clientSessionAmount" },
          clientOddsComm: { $sum: "$clientOddsComm" },
          clientSessionComm: { $sum: "$clientSessionComm" },
          clientNetAmount: { $sum: "$clientNetAmount" },
          agentNetProfitLoss: { $sum: `$agentNetProfitLoss` },
          agentLedgerAmt: { $sum: `$agentLedgerAmt` },
          superagentNetProfitLoss: { $sum: `$superagentNetProfitLoss` },
          superagentLedgerAmt: { $sum: `$superagentLedgerAmt` },
          masterNetProfitLoss: { $sum: `$masterNetProfitLoss` },
          masterLedgerAmt: { $sum: `$masterLedgerAmt` },
          subadminNetProfitLoss: { $sum: `$subadminNetProfitLoss` },
          subadminLedgerAmt: { $sum: `$subadminLedgerAmt` },
          adminNetProfitLoss: { $sum: `$adminNetProfitLoss` },
          adminLedgerAmt: { $sum: `$adminLedgerAmt` },
          superadminNetProfitLoss: { $sum: `$superadminNetProfitLoss` },
          superadminLedgerAmt: { $sum: `$superadminLedgerAmt` },
          subownerNetProfitLoss: { $sum: `$subownerNetProfitLoss` },
          subownerLedgerAmt: { $sum: `$subownerLedgerAmt` },
        },
      },
    ]);
  } catch (e) {}

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userMatchShare: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }
  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const bsfCollectionReport = async (req, res) => {
  const bodyData = req.body;
  const creatorUserType = bodyData.userType;
  const loginData = req.loggedInUser;
  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );

  let query = {};
  if (bodyData.marketId) {
    query.marketId = bodyData.marketId;
  }
  let userList = directUserData.userDataArray;
  let groupCond = {
    _id: `$userId`,
    totalAmount: { $sum: "$amount" },
  };

  query = whereHelper(loginData, query);

  var resData = await LedgerModel.aggregate([
    {
      $match: query,
    },
    {
      $group: groupCond,
    },
  ]);

  let finalReturnData = [];
  let userNameData = {};
  let convertData = convertKeyObjectAndSeperateid(resData, "_id");
  if (convertData.returnDataObject) {
    userNameData = convertData.returnDataObject;
  }
  userList = JSON.parse(JSON.stringify(userList));
  Object.entries(userList).forEach(([userId, userValue]) => {
    let ledgerAmount = 0;
    if (userNameData[userId]) {
      ledgerAmount = userNameData[userId].totalAmount;
    }
    userValue.totalAmount = ledgerAmount;
    finalReturnData.push(userValue);
  });
  return SendResponse(res, "success", "dataFetched", finalReturnData);
};

const bsfClientReport = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const creatorUserType = bodyData.creatorType;
  const loginData = req.loggedInUser;
  let query = {};
  let clientWhere = {};
  if (bodyData.marketId) {
    query.marketId = bodyData.marketId;
    clientWhere.marketId = bodyData.marketId;
  }

  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );

  let allexch = false;

  if (bodyData.allexch) {
    allexch = true;
  }

  let userList = directUserData.userDataArray;
  let clientReportArray = [];
  let clientListIdArray = {};

  if (directUserData.idArrayWhere.clientId) {
    clientListIdArray = directUserData.idArrayWhere.clientId;
    clientWhere.userId = clientListIdArray;

    var resDataClient = await profitLossPosition.aggregate([
      {
        $match: clientWhere,
      },
      {
        $group: {
          _id: `$userId`,
          clientOddsAmount: { $sum: "$clientOddsAmount" },
          clientSessionAmount: { $sum: "$clientSessionAmount" },
          clientOddsComm: { $sum: "$clientOddsComm" },
          clientSessionComm: { $sum: "$clientSessionComm" },
          clientNetAmount: { $sum: "$clientNetAmount" },
          userOddsComm: { $sum: `$${creatorUserType}OddsComm` },
          userSessionComm: { $sum: `$${creatorUserType}SessionComm` },
          userNetProfitLoss: { $sum: `$${creatorUserType}NetProfitLoss` },
          userLedgerAmt: { $sum: `$${creatorUserType}LedgerAmt` },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    if (resDataClient) {
      resDataClient.map((client, key) => {
        let clientId = client._id;
        let userInfo = userList[clientId] || {};
        resDataClient[key].userInfo = userInfo;
      });
    }
    clientReportArray = resDataClient;
  }

  userList = JSON.parse(JSON.stringify(userList));

  let userProfitArray = [];

  let promises = Object.entries(userList)
    .filter(([userId, userValue]) => userValue.userType !== "client")
    .map(async ([userId, userValue]) => {
      let userWhere = { marketId: bodyData.marketId };
      let downlineUserType = userValue.userType;
      let downlineUserId = userValue.userId;
      userWhere[`${downlineUserType}Id`] = new ObjectId(downlineUserId);

      if (allexch == true) {
        downlineUserType = creatorUserType;
      }

      return profitLossPosition
        .aggregate([
          {
            $match: userWhere,
          },
          {
            $group: {
              _id: `$${downlineUserType}Id`,
              clientOddsAmount: { $sum: "$clientOddsAmount" },
              clientSessionAmount: { $sum: "$clientSessionAmount" },
              clientOddsComm: { $sum: "$clientOddsComm" },
              clientSessionComm: { $sum: "$clientSessionComm" },
              clientNetAmount: { $sum: "$clientNetAmount" },
              userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
              userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
              userNetProfitLoss: {
                $sum: `$${downlineUserType}NetProfitLoss`,
              },
              userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
            },
          },
        ])
        .then((resDataUser) => {
          if (resDataUser[0]) {
            resDataUser[0].userInfo = userValue;
            return resDataUser[0];
          } else {
            console.log("userNot Found In bsfClientReport Function");
          }
        });
    });

  let userListReportArray = await Promise.all(promises);

  let returnData = {
    userListReportArray: userListReportArray,
    clientReportArray: clientReportArray,
  };

  return SendResponse(res, "success", "dataFetched", returnData);
};

const bsfChipSummary = async (req, res) => {
  const loginData = req.loggedInUser;
  let whereQuery = await whereHelper(loginData, {
    creatorId: new ObjectId(loginData.userId),
  });
  let resDataUser = await UserModel.aggregate([
    {
      $match: whereQuery,
    },
    {
      $group: {
        _id: `$${loginData.userType}Id`,
        downlineDistributedAmount: { $sum: "$coins" },
      },
    },
  ]);
  let ledgerWhere = {
    userId: new ObjectId(loginData.userId),
  };
  let ledgerAmount = await userLedger.aggregate([
    {
      $match: ledgerWhere,
    },
    {
      $group: {
        _id: `$userId`,
        ledgerAmount: { $sum: `$amount` },
      },
    },
  ]);
  let returnData = {
    resDataUser: {},
    ledgerAmount: {},
  };
  if (resDataUser) {
    returnData.resDataUser = resDataUser;
  }
  if (ledgerAmount) {
    returnData.ledgerAmount = ledgerAmount;
  }
  return SendResponse(res, "success", "dataFetched", returnData);
};

const matchDetails = async (req, res) => {
  const loginData = req.loggedInUser;
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  let whereQuery = await whereHelper(loginData, {
    marketId: bodyData.marketId,
  });
  let returnObj = {};
  returnObj.usersCount = await playModel.countDocuments(whereQuery);

  var fancyResData = await FancyBetModel.aggregate([
    {
      $match: whereQuery,
    },
    {
      $group: {
        _id: `$marketId`,
        totalFancyBetAmount: { $sum: "$amount" },
        totalResultsBets: {
          $sum: {
            $cond: [
              {
                $ne: ["$isDeleted", "1"],
              },
              1,
              0,
            ],
          },
        },
        deletedFancyBets: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isDeleted", "1"] }],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  returnObj.fancyResData = fancyResData;

  var oddsResData = await BetModel.aggregate([
    {
      $match: whereQuery,
    },
    {
      $group: {
        _id: `$marketId`,
        totalOddsBetAmount: { $sum: "$amount" },
        totalResultsOddsBets: {
          $sum: {
            $cond: [
              {
                $ne: ["$isDeleted", "1"],
              },
              1,
              0,
            ],
          },
        },
        deletedOddsBets: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isDeleted", "1"] }],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  returnObj.oddsResData = oddsResData;
  return SendResponse(res, "success", "dataFetched", returnObj);
};

const allexClientReport = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const creatorUserType = bodyData.creatorType;
  const userId = bodyData.userId;
  const loginData = req.loggedInUser;
  let query = {};
  let clientWhere = {};
  if (bodyData.marketId) {
    query.marketId = bodyData.marketId;
  }

  // let userDetails = await UserModel.findOne({ userId: userId });

  clientWhere = {
    marketId: bodyData.marketId,
    clientId: new ObjectId(userId),
  };

  var resDataClient = await profitLossPosition.aggregate([
    {
      $match: clientWhere,
    },
    {
      $group: {
        _id: `$userId`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${creatorUserType}OddsComm` },
        userSessionComm: { $sum: `$${creatorUserType}SessionComm` },
        userNetProfitLoss: { $sum: `$${creatorUserType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${creatorUserType}LedgerAmt` },
      },
    },
  ]);
  return SendResponse(res, "success", "dataFetched", resDataClient);
};

const getOddsPositionForAllexch = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const creatorUserType = bodyData.creatorType;
  const userId = bodyData.userId;
  const loginData = req.loggedInUser;
  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.userId
  );
  let userList = directUserData.userDataArray;

  userList = JSON.parse(JSON.stringify(userList));
  Object.entries(userList).forEach(async ([userId, userValue]) => {});
  let promises = Object.entries(userList).map(async ([userId, userValue]) => {
    let query = {
      marketId: bodyData.marketId,
    };
    if (bodyData.oddsType) {
      query.oddsType = bodyData.oddsType;
    }
    let userTypeAmount = `${bodyData.userType}Amount`;

    if (userValue.userType == "client") {
      userTypeAmount = "amount";
      query.userId = new ObjectId(userValue.userId);
    } else {
      query[`${userValue.userType}Id`] = new ObjectId(userValue.userId);
    }
    

    if (bodyData.clientId) {
      query.clientId = new ObjectId(bodyData.clientId);
    }




    return await OddsPositionModel.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: "$selectionId",
          Position: { $sum: "$" + userTypeAmount },
          totalPosition: { $sum: "$amount" },
        },
      },
    ]).then((resDataUser) => {
      if (resDataUser) {
        return {
          position: resDataUser,
          userInfo: userValue,
        };
      } else {
        console.log("hhh");
      }
    });
  });
  let userListReportArray = await Promise.all(promises);
  return SendResponse(res, "success", "dataFetched", userListReportArray);
};

const exposerListForAllexch = async (req, res) => {
  const bodyData = req.body;
  const userId = bodyData.userId;
  const loginData = req.loggedInUser;
  let where = { isDeclare: 0, forBet: 1 };
  let userType = bodyData.userType;
  if (bodyData.marketId) {
    where.marketId = req.body.marketId;
  }
  let userWhere = await whereHelper(loginData, where);
  let userAmountType = `${userType}Amount`;

  if (bodyData.userType && bodyData.userId) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    userAmountType = `${bodyData.userType}Amount`;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
  if (userType == "client") {
    userAmountType = "amount";
  }

  let groupByData = await transactionLog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$remarks`,
        userAmount: { $sum: `$${userAmountType}` },
        gameType: { $first: "$gameType" },
        gameName: { $first: "$gameName" },
        createdAt: { $first: "$createdAt" },
        selectionId: { $first: "$selectionId" },
        oddsType: { $first: "$gameType" },
        marketId: { $first: "$marketId" },
        eventId: { $first: "$eventId" },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  return SendResponse(res, "success", "data is fetched", groupByData);
};

const fancyProfitLossUserWiseAntPro = async (req, res) => {
  const bodyData = req.body;
  const userId = bodyData.userId;
  const loginData = req.loggedInUser;
  const marketId = bodyData.marketId;
  const selectionId = bodyData.selectionId;
  let where = {
    isDeclare: 1,
    forBet: 1,
    marketId: marketId,
    selectionId: selectionId,
  };
  let userType = bodyData.userType;
  let userWhere = await whereHelper(loginData, where);

  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];
  let downlineAmountType = `${downlineUserType}Amount`;

  if (downlineUserType == "client") {
    downlineAmountType = "amount";
  }

  if (bodyData.userType && bodyData.userId) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    userAmountType = `${bodyData.userType}Amount`;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  let groupByData = await transactionLog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        sessionAmount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 0] }],
              },
              `$${downlineAmountType}`,
              0,
            ],
          },
        },
        totalComm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$${downlineAmountType}`,
              0,
            ],
          },
        },
        selectionId: { $first: "$selectionId" },
        remarks: { $first: "$remarks" },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);

  let userIdArray = [];
  if (groupByData) {
    const userIdArrayData = convertKeyObjectAndSeperateid(groupByData, "_id");
    if (userIdArrayData.returnDataObject) {
      groupByData = userIdArrayData.returnDataObject;
    }
    userIdArray = userIdArrayData.idArray;
  }

  let userNameList = [];
  if (userIdArray.length > 0) {
    userNameList = await UserModel.find(
      { userId: { $in: userIdArray } },
      { userType: 1, username: 1, name: 1, userMatchShare: 1, userId: 1 }
    );
  }
  userNameList = JSON.parse(JSON.stringify(userNameList));

  userNameList &&
    userNameList.map((userData, key) => {
      const userId = userData.userId;
      let userTransactionData = groupByData[userId];
      let userShareComm =
        ((100 - userData.userMatchShare) * userTransactionData.totalComm) / 100;
      userTransactionData.totalComm = userShareComm;
      userNameList[key].logData = userTransactionData;
    });
  return SendResponse(res, "success", "data is fetched", userNameList);
};

const casinoTransactionReport = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  const userType = loginData.userType;

  let overallType = "internationalCasino";

  if (bodyData.casinoType) {
    overallType = bodyData.casinoType;
  }

  let userWhere = await whereHelper(loginData, { forBet: 1, isDeclare: 1 });
  let userAmountType = `${loginData.userType}Amount`;

  if (userType == "client") {
    userAmountType = "amount";
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.eventId) {
    overallType == "internationalCasino"
      ? (userWhere.marketId = bodyData.eventId)
      : (userWhere.eventId = bodyData.eventId);
  }

  let groupBy = "remarks";
  if (overallType != "internationalCasino") {
    groupBy = "eventId";
  }

  let groupByData = await transactionLog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${groupBy}`,
        totalAmount: { $sum: `$${userAmountType}` },
        amount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 0] }],
              },
              `$${userAmountType}`,
              0,
            ],
          },
        },
        totalComm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$${userAmountType}`,
              0,
            ],
          },
        },
        marketId: { $first: "$marketId" },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  return SendResponse(res, "success", "data is fetched", groupByData);
};

const matchOddsRunningPos = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  const userId = loginData.userId;
  const userType = loginData.userType;

  let userWhere = await whereHelper(loginData, {
    oddsType: "matchOdds",
  });
  let userAmountType = `${userType}Amount`;
  if (userType == "client") {
    userAmountType = "amount";
  }

  let inplayMarketId = [];

  let inplayMarket = await getMatchList();

  inplayMarket.map((marketData) => {
    inplayMarketId.push(marketData.marketId);
  });

  userWhere.marketId = { $in: inplayMarketId };

  let posData = await OddsPositionModel.aggregate([
    { $match: userWhere },
    {
      $group: {
        _id: "$selectionId",
        amount: { $sum: "$" + userAmountType },
        marketId: { $first: "$marketId" },
        teamName: { $first: "$teamName" },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  let minValues = {};

  posData.forEach((item) => {
    if (
      !(item.marketId in minValues) ||
      item.amount > minValues[item.marketId]
    ) {
      minValues[item.marketId] = item.amount;
    }
  });

  return SendResponse(res, "success", "data is fetched", minValues);
};

const blockMarket = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  const userType = loginData.userType;
  const userId = loginData.userId;

  if (userType == "owner") {
    return SendResponse(res, "error", "owner do not allow to access this");
  }

  if (!bodyData.marketId) {
    return SendResponse(res, "error", "marketId is required");
  }
  const marketId = bodyData.marketId;

  let userData = await UserModel.findOne(
    { userId: userId },
    { creatorId: 1, userType: 1 }
  );

  let creatorId = userData.creatorId + "";

  let blockedMarketParent = await client.sismember(
    `${marketId}_BlockMarket`,
    creatorId
  );

  if (blockedMarketParent) {
    return SendResponse(
      res,
      "error",
      "your parent has been locked this market please contact your upperline"
    );
  }

  const inplayMarketCount = await sportsListModel.countDocuments({
    marketId: marketId,
  });

  if (inplayMarketCount < 1) {
    return SendResponse(res, "error", "market not found");
  }

  let where = await whereHelper(loginData, { status: 1 });

  const downlineUserData = await UserModel.find(where, {
    _id: 1,
  });

  let finalData = [];
  downlineUserData.map((userData) => {
    let userId = userData._id.toString();
    finalData.push(userId);
  });

  if (bodyData.blockStatus) {
    await client.sadd(`${marketId}_BlockMarket`, finalData);
  } else {
    await client.srem(`${marketId}_BlockMarket`, finalData);
  }

  return SendResponse(res, "success", `market changed successfully`);
};

const userWiseBlockMarketList = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  let userId = loginData.userId.toString();
  const inplayMatchList = await getMatchList();
  let sendData = {};
  const promises = inplayMatchList.map(async (match) => {
    const marketId = match.marketId;
    const blockMarketList = await client.sismember(
      `${marketId}_BlockMarket`,
      userId
    );
    if (blockMarketList) {
      sendData[marketId] = 1;
    }
  });
  await Promise.all(promises);
  return SendResponse(res, "success", `market changed successfully`, sendData);
};

const transactionSummaryForMarket = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const creatorUserType = bodyData.creatorType;
  const loginData = req.loggedInUser;
  let query = {};
  let clientWhere = {};
  if (bodyData.marketId) {
    query.marketId = bodyData.marketId;
    clientWhere.marketId = bodyData.marketId;
  }

  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );

  let userList = directUserData.userDataArray;
  let clientReportArray = [];
  let clientListIdArray = {};

  let oddsType = "";
  if (bodyData.oddsType) {
    oddsType = bodyData.oddsType;
  }

  if (directUserData.idArrayWhere.clientId) {
    clientListIdArray = directUserData.idArrayWhere.clientId;
    clientWhere.userId = clientListIdArray;

    if (oddsType != "") {
      if (oddsType == "fancyOdds") {
        clientWhere.gameType = "fancyOdds";
        clientWhere.selectionId = bodyData.selectionId;
      } else {
        clientWhere.gameType = oddsType;
      }
    }

    var resDataClient = await TransactionLogModel.aggregate([
      {
        $match: clientWhere,
      },
      {
        $group: {
          _id: `$userId`,
          userNetProfitLoss: { $sum: `$${creatorUserType}Amount` },
          clientOddsAmount: { $sum: `$amount` },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    if (resDataClient) {
      resDataClient.map((client, key) => {
        let clientId = client._id;
        let userInfo = userList[clientId] || {};
        resDataClient[key].userInfo = userInfo;
      });
    }
    clientReportArray = resDataClient;
  }

  userList = JSON.parse(JSON.stringify(userList));
  let promises = Object.entries(userList)
    .filter(([userId, userValue]) => userValue.userType !== "client")
    .map(async ([userId, userValue]) => {
      let userWhere = { marketId: bodyData.marketId };
      let downlineUserType = userValue.userType;
      let downlineUserId = userValue.userId;
      userWhere[`${downlineUserType}Id`] = new ObjectId(downlineUserId);

      if (oddsType != "") {
        if (oddsType == "fancyOdds") {
          userWhere.gameType = "fancyOdds";
          userWhere.selectionId = bodyData.selectionId;
        } else {
          userWhere.gameType = oddsType;
        }
      }

      userWhere.isComm = 0;
      return TransactionLogModel.aggregate([
        {
          $match: userWhere,
        },
        {
          $group: {
            _id: `$${downlineUserType}Id`,
            clientOddsAmount: { $sum: "$amount" },
            userNetProfitLoss: { $sum: `$${creatorUserType}Amount` },
          },
        },
      ]).then((resDataUser) => {
        if (resDataUser[0]) {
          resDataUser[0].userInfo = userValue;
          return resDataUser[0];
        } else {
          console.log("userNot Found In bsfClientReport Function");
        }
      });
    });

  let userListReportArray = await Promise.all(promises);

  let returnData = {
    userListReportArray: userListReportArray,
    clientReportArray: clientReportArray,
  };

  return SendResponse(res, "success", "dataFetched", returnData);
};

const userOrMarketWiseCricReport = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (!bodyData.creatorId) {
    bodyData.creatorId = userId;
  }
  if (bodyData.creatorType) {
    userType = bodyData.creatorType;
  }
  if (bodyData.creatorId) {
    userId = bodyData.creatorId;
  }

  let directUserData = await UserUtils.gettingDirectUserByUserId(
    bodyData.creatorId
  );

  let directUserWheredArray = directUserData.idArrayWhere;

  if (bodyData.marketId) {
    userWhere.marketId = bodyData.marketId;
  }
  const orQuery = await UserUtils.convertToOrQuery(directUserWheredArray);

  let userWhere = await whereHelper(loginData, orQuery);

  try {
    var resData = await profitLossPosition.aggregate([
      {
        $match: userWhere,
      },
      {
        $group: {
          _id: "$marketId",
          clientOddsAmount: { $sum: "$clientOddsAmount" },
          clientSessionAmount: { $sum: "$clientSessionAmount" },
          clientOddsComm: { $sum: "$clientOddsComm" },
          clientSessionComm: { $sum: "$clientSessionComm" },
          clientNetAmount: { $sum: "$clientNetAmount" },

          userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
          userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
          userSessionComm: { $sum: `$${userType}OddsComm` },
          userOddsComm: { $sum: `$${userType}SessionComm` },

          // agentNetProfitLoss: { $sum: `$agentNetProfitLoss` },
          // agentLedgerAmt: { $sum: `$agentLedgerAmt` },
          // superagentNetProfitLoss: { $sum: `$superagentNetProfitLoss` },
          // superagentLedgerAmt: { $sum: `$superagentLedgerAmt` },
          // masterNetProfitLoss: { $sum: `$masterNetProfitLoss` },
          // masterLedgerAmt: { $sum: `$masterLedgerAmt` },
          // subadminNetProfitLoss: { $sum: `$subadminNetProfitLoss` },
          // subadminLedgerAmt: { $sum: `$subadminLedgerAmt` },
          // adminNetProfitLoss: { $sum: `$adminNetProfitLoss` },
          // adminLedgerAmt: { $sum: `$adminLedgerAmt` },
          // superadminNetProfitLoss: { $sum: `$superadminNetProfitLoss` },
          // superadminLedgerAmt: { $sum: `$superadminLedgerAmt` },
          // subownerNetProfitLoss: { $sum: `$subownerNetProfitLoss` },
          // subownerLedgerAmt: { $sum: `$subownerLedgerAmt` },
          eventName: { $first: `$eventName` },
        },
      },
    ]);
  } catch (e) {
    console.log(e.message);
  }

  return SendResponse(res, "success", "dataFetched", resData);
};

const selfStatementCrick = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  let userWhere = {};
  let returnData = {
    ledgerAmount: 0,
    selfClientOddsAmountPl: 0,
    selfClientSessionAmountPl: 0,
    downlineOddsComm: 0,
    downlineSessionComm: 0,
    userOddsComm: 0,
    userSessionComm: 0,
    cashSettlement: 0,
    userLedgerAmt: 0,
  };

  if (bodyData.userId) {
    userId = bodyData.userId;
  }

  if (bodyData.userType) {
    userType = bodyData.userType;
  }

  userWhere[`${userType}Id`] = new ObjectId(userId);

  let userDetails = await UserModel.findOne({ _id: new ObjectId(userId) });


  if (bodyData.fromDate && bodyData.toDate) {
    query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }


  let userMatchShareSelf = userDetails.userMatchShare;
  let userCasinohareSelf = userDetails.intCasinoShare;


  returnData.shareData = {
    userMatchShare: userDetails.userMatchShare,
    userId: userDetails.userId,
    userCasinoShare: userDetails.userCasinoShare,
    userMatkaShare: userDetails.userMatkaShare,
  };

  let directUserData = await UserUtils.gettingDirectUserByUserId(userId);
  let userDataArray = directUserData.userDataArray;
  let userAraryWhere = directUserData.idArrayWhere;
  let downlineUserComm = {
    downlineOddsComm: 0,
    downlineSessionComm: 0,
  };

  for (const key in userAraryWhere) {
    if (userAraryWhere[key].$in && Array.isArray(userAraryWhere[key].$in)) {
      let downLineUserType = key.split("Id")[0];

      let downLineUserWhere = {
        ...userWhere,
        ...{
          [key]: {
            $in: userAraryWhere[key].$in,
          },
        },
      };



      var resDataUser = await profitLossPosition.aggregate([
        {
          $match: downLineUserWhere,
        },
        {
          $group: {
            _id: `$${key}`,
            downLineOddsComm: { $sum: `$${downLineUserType}OddsComm` },
            downLineSessionComm: { $sum: `$${downLineUserType}SessionComm` },
            downClientOddsAmount: { $sum: `$clientOddsAmount` },
            downClientSessionAmount: { $sum: `$clientSessionAmount` },
            downClientMatchOddsAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$isCasino", 0] }],
                  },
                  `$clientOddsAmount`,
                  0,
                ],
              },
            },
            downClientCasinoOddsAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$isCasino", 1] }],
                  },
                  `$clientOddsAmount`,
                  0,
                ],
              },
            },



          },
        },
      ]);

      if (resDataUser && resDataUser.length > 0) {


        resDataUser.map((res) => {
          let downLineOddsComm = res.downLineOddsComm;
          let downlineSessionComm = res.downLineSessionComm;
          let downClientOddsAmount = res.downClientOddsAmount;
          let downClientSessionAmount = res.downClientSessionAmount;

          let downClientCasinoAmount = res.downClientCasinoOddsAmount;
          let downClientOddsAmountOnly = res.downClientMatchOddsAmount;


          if (userDataArray[res._id + ""]) {
            let userDetails = userDataArray[res._id];
            let userMatchShare = userDetails.userMatchShare;
            let userIntCasinoShare = userDetails.intCasinoShare;

      

            downLineOddsComm =
              ((100 - userMatchShare) / 100) * downLineOddsComm;

            downlineSessionComm =
              ((100 - userMatchShare) / 100) * downlineSessionComm;

            // downClientOddsAmount =
            //   ((userMatchShareSelf - userMatchShare) / 100) *
            //   downClientOddsAmount;

              downClientOddsAmountOnly =
              ((userMatchShareSelf - userMatchShare) / 100) *
              downClientOddsAmountOnly;

              downClientCasinoAmount =
              ((userCasinohareSelf - userIntCasinoShare) / 100) *
              downClientCasinoAmount;

              downClientOddsAmountOnly = downClientOddsAmountOnly?downClientOddsAmountOnly:0
              downClientCasinoAmount = downClientCasinoAmount?downClientCasinoAmount:0
              
              downClientOddsAmount = downClientOddsAmountOnly + downClientCasinoAmount

            downClientSessionAmount =
              ((userMatchShareSelf - userMatchShare) / 100) *
              downClientSessionAmount;
          }

          returnData.downlineOddsComm += downLineOddsComm;
          returnData.downlineSessionComm += downlineSessionComm;
          returnData.selfClientOddsAmountPl += downClientOddsAmount;
          returnData.selfClientSessionAmountPl += downClientSessionAmount;
        });


      }
    }
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userSessionComm: { $sum: `$${userType}SessionComm` },
      },
    },
  ]);

  if (resData[0]) {
    returnData.userOddsComm = resData[0].userOddsComm;
    returnData.userSessionComm = resData[0].userSessionComm;
  }

  userWhere.userId = new ObjectId(userId);
  let groupCond = {
    _id: "$userId",
    totalAmount: { $sum: "$amount" },
    settleAmount: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$ledgerType", "settle"] }],
          },
          "$amount",
          0,
        ],
      },
    },
  };

  var ledgerResData = await LedgerModel.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: groupCond,
    },
  ]);

  if (ledgerResData[0]) {
    returnData.userLedgerAmt = ledgerResData[0].totalAmount;
    returnData.cashSettlement = ledgerResData[0].settleAmount;
  }

  let userSessionComm = returnData.userSessionComm;
  let userOddsComm = returnData.userOddsComm;

  

  let upperTakeSessionComm =
    ((100 - userMatchShareSelf) / 100) * userSessionComm;
  let upperTakeOddsComm = ((100 - userMatchShareSelf) / 100) * userOddsComm;

  let userSessionCommProfitLoss =
    upperTakeSessionComm - returnData.downlineSessionComm;
  let userOddsCommProfitLoss = upperTakeOddsComm - returnData.downlineOddsComm;

  let marketProfitLossWithoutComm =
    returnData.selfClientOddsAmountPl + returnData.selfClientSessionAmountPl;

  returnData.userSessionCommProfitLoss = userSessionCommProfitLoss;
  returnData.userOddsCommProfitLoss = userOddsCommProfitLoss;
  returnData.marketProfitLossWithoutComm = -1 * marketProfitLossWithoutComm;

  delete returnData.userOddsComm;
  delete returnData.userSessionComm;
  delete returnData.downlineSessionComm;
  delete returnData.downlineOddsComm;
  delete returnData.selfClientSessionAmountPl;
  delete returnData.selfClientOddsAmountPl;
  delete returnData.ledgerAmount;

  return SendResponse(res, "success", "dataFetched", returnData);
};


const bsfProfitLoss = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = await whereHelper(loginData);
  let userType = `${loginData.userType}`;

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
  if (bodyData.userId && bodyData.userType) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
  }


   let profitLossData = await CrickTransactionLogModel.aggregate([
     {
       $match: userWhere,
     },
     {
       $group: {
         _id: `$eventName`,
         userProfitLoss:  {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$${userType}ProfitLoss`,
                0,
              ],
            },
         },
          userCommission:  {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] } , { $eq: ["$isComm", true] }],
                },
                `$${userType}ProfitLoss`,
                0,
              ],
            },
         },
       },
     },
     {
       $sort: {
         createdAt: -1,
       },
     },
   ]);
  
  
  _dx(profitLossData , "profitLossData")


   profitLossData.map((data , key)=>{
    if(data.isCasino){
      profitLossData[key].userNetProfitLoss = -1 * data.userNetProfitLossSelf
    }
   })

   

  if (bodyData.totalProfitLoss) {
    delete userWhere.date;
    let totalProfitLoss = await profitLossPosition.aggregate([
      {
        $match: userWhere,
      },
      {
        $group: {
          _id: `$${downlineUserType}Id`,
          userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLossSelf` },
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);
    profitLossData = {
      profitLossData: profitLossData,
      totalProfitLoss: totalProfitLoss[0]
        ? totalProfitLoss[0].userNetProfitLoss
        : 0,
    };
  }

  return SendResponse(
    res,
    "success",
    false,
    profitLossData
  );
};



const completedEventsNew = async (req, res) => {
  try {
    const userData = req.loggedInUser;
    let bodyData = req?.body;
    let query = {};
    let specific = {
      marketId: 1,
      matchName: 1,
      matchType: 1,
      eventId: 1,
      sportId: 1,
      sportType: 1,
      matchDate: 1,
      isDeclare: 1,
      status: 1,
      wonTeamName: 1,
      date: 1,
      updatedAt: 1,
    };
    let sortData = {
      _id: -1,
    };
    if (bodyData.marketId) {
      query["marketId"] = bodyData.marketId;
    }

    if (bodyData.sportId) {
      query["sportId"] = bodyData.sportId;
    }

    if (Array.isArray(bodyData.sportId)) {
      query["sportId"] = { $in: bodyData.sportId };
    }

    query["isDeclare"] = 1;

    let sportData = [];
    let sendData = {};

    if (bodyData.inplay) {
      delete query.isDeclare;
    }

    let total = await sportsListModel.countDocuments(query);

    sportData = await sportsListModel
      .find(query, specific)
      .sort(sortData)
      .skip(bodyData.size * (bodyData.pageNo - 1))
      .limit(bodyData.size);
    sendData = sportData;

    if (bodyData.isAccountDetails) {
      sportData = convertKeyObjectAndSeperateid(sportData, "marketId");
      const marketIdArray = sportData.idArray;
      let marketData = sportData.returnDataObject;

      marketData = JSON.parse(JSON.stringify(marketData));
      const userType = userData.userType;
      let field = `${userType}Id`;
      var resMatch = await profitLossPosition.aggregate([
        {
          $match: {
            [field]: new ObjectId(userData.userId),
            marketId: { $in: marketIdArray },
          },
        },
        {
          $group: {
            _id: "$marketId",
            totalProfitLoss: { $sum: `$${userType + "NetProfitLossSelf"}` },
            clientProfitLoss: { $sum: `$clientNetAmount` },
          },
        },
      ]);

      if (resMatch) {
        resMatch.map((data, key) => {
          if (marketData[data._id]) {
            let totalProfitLoss = 0;
            let clientProfitLoss = 0;
            if (data.totalProfitLoss || data.clientProfitLoss) {
              totalProfitLoss = -1 * data.totalProfitLoss;
              clientProfitLoss = -1 * data.clientProfitLoss;
            }
            marketData[data._id].totalProfit = totalProfitLoss;
            marketData[data._id].clientProfitLoss = clientProfitLoss;
          }
        });
      }
      sendData = marketData;
      var cricRes = await CrickTransactionLogModel.aggregate([
        {
          $match: {
            [field]: new ObjectId(userData.userId),
            marketId: { $in: marketIdArray },
          },
        },
        {
          $group: {
            _id: "$marketId",
            totalProfitLoss: { $sum: `$${userType + "ProfitLoss"}` },
            commLedger: {
                        $sum: {
                          $cond: [
                            {
                              $or: [
                                { $eq: ["$transactionType", "profitLoss"] },
                                { $eq: ["$isComm", "true"] }
                              ]
                            },
                            `$${userType + "LedgerAmount"}` ,
                            0
                          ]
                        }
            },
             commProfitLoss: {
                        $sum: {
                          $cond: [
                            {
                              $or: [
                                { $eq: ["$transactionType", "profitLoss"] },
                                { $eq: ["$isComm", "true"] }
                              ]
                            },
                            `$${userType + "ProfitLoss"}` ,
                            0
                          ]
                        }
                  }
          },
        },
      ]);

      // _d(cricRes , "cricRes")

      if (cricRes) {
        cricRes.map((data, key) => {
          if (marketData[data._id]) {
            let cricTotalProfitLoss = 0;
            let cricCommProfitLoss = 0;
            let cricCommLedger = 0;
            if (data.totalProfitLoss || data.clientProfitLoss) {
              cricTotalProfitLoss = -1 * data.totalProfitLoss;
              cricCommProfitLoss = -1 * data.commProfitLoss;
              cricCommLedger = -1 * data.commLedger;
            }
            marketData[data._id].cricTotalProfitLoss = cricTotalProfitLoss;
            marketData[data._id].cricCommProfitLoss = cricCommProfitLoss;
            marketData[data._id].cricCommLedger = cricCommLedger;
          }
        });
      }

    }

    let returnData = {
      matchData: sendData,
      totalCount: total,
    };

    return SendResponse(
      res,
      "success",
      "Fetched Data Successfully",
      returnData
    );
  } catch (error) {

    _d(error)
    return SendResponse(
      res,
      "error",
      "Failed In Complete Sport List Details",
      error
    );
  }
};





module.exports = {
  getPlusMinusByMarketIdByUserWise,
  userProfitLoss,
  generateCasinoProfitLossAndComm,
  groupByBetsForEventId,
  sportsProfitLoss,
  chipSummary,
  weeklyReport,
  companyReport,
  clientReport,
  blockMarket,
  topClient,
  selfStatement,
  marketAnalysis,
  profitLossForAllExch,
  myCash,
  liveSettlementreport,
  downlineOddsPosByMarketId,
  bsfCollectionReport,
  bsfClientReport,
  bsfChipSummary,
  matchDetails,
  allexClientReport,
  getOddsPositionForAllexch,
  exposerListForAllexch,
  fancyProfitLossUserWiseAntPro,
  casinoTransactionReport,
  matchOddsRunningPos,
  userWiseBlockMarketList,
  transactionSummaryForMarket,
  userOrMarketWiseCricReport,
  selfStatementCrick,
  bsfProfitLoss,
  completedEventsNew
};
