const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const { siteSetting, UserTypes } = require("../../Common/Constants");
const LedgerModel = require("../../Models/Ledger.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const axios = require("axios");
axios.defaults.timeout = siteSetting.axiosTimeOut;
const { client } = require("../../Helpers/RedisHelper");

const {
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");

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

const clientPlusMinus = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  const loginData = req.loggedInUser;

  if (!bodyData.clientId) {
    return SendResponse(res, "error", "client Id is Required");
  }

  let userWhere = await whereHelper(loginData, {
    userId: new ObjectId(bodyData.clientId),
  });

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.marketId) {
    userWhere.marketId = bodyData.marketId;
  }

  let resData = await profitLossPosition.find(
    userWhere,
    {
      eventId: 1,
      marketId: 1,
      eventName: 1,
      isCasino: 1,
      isDeclare: 1,
      clientOddsAmount: 1,
      clientSessionAmount: 1,
      clientOddsComm: 1,
      clientSessionComm: 1,
      clientNetAmount: 1,
      createdAt: 1,
    },
    {
      $sort: { _id: -1 },
    }
  );

  var total = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$clientId`,
        clientNetAmount: { $sum: "$clientNetAmount" },
        createdAt: { $first: "$createdAt" },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ]);

  let returnData = {};

  if (total) {
    returnData.total = total[0]?.clientNetAmount;
  }
  if (resData) {
    returnData.resData = resData;
  }

  return SendResponse(res, "success", "dataFetched", returnData);
};

const getUserNameByDefault = async (req, res) => {
  const userType = req.body.userType;
  const countUsertype = await UserModel.countDocuments({ userType: userType });
  let formattedUsername = UserUtils.UsersCode(userType, countUsertype);
  return SendResponse(res, "success", "dataFetched", formattedUsername);
};

const makeNegativeToPositiveUsers = async (req, res) => {
  let bodyData = req.body;
  let where = {
    coins: { $lt: -1 },
  };

  let negativeUser = await UserModel.find(where);
  let transactionLog = [];
  let userIdArray = [];
  let nameArray = [];
  negativeUser.map((data) => {
    let insertCoins = Math.abs(data.coins);
    let pushData = {
      userId: data.userId,
      agentId: data.agentId,
      superagentId: data.superagentId,
      masterId: data.masterId,
      adminId: data.adminId,
      superadminId: data.superadminId,
      subownerId: data.subownerId,
      ownerId: data.ownerId,
      userType: data.userType,
      amount: insertCoins.toFixed(2),
      remarks: `systemCoins`,
      amount: insertCoins,
      [data.userType + "Id"]: data.userId,
    };
    transactionLog.push(pushData);
    userIdArray.push(data.userId);
    nameArray.push({
      name: data.name,
      userType: data.userType,
      username: data.username,
    });
  });

  await TransactionLogModel.create(transactionLog);
  await updateBulkCoinsExposureUserByMarketId(userIdArray);
  return SendResponse(res, "success", "successfully updated", nameArray);
};

const getPlusMinusByEventWise = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = {};

  let userType = loginData.userType;

  if (bodyData.downlineUserId && bodyData.downlineUserType) {
    let field = `${bodyData.downlineUserType}Id`;

    userWhere = {
      [field]: new ObjectId(`${bodyData.downlineUserId}`),
    };

    userType = bodyData.downlineUserType;
  }
  userWhere = await whereHelper(loginData, userWhere);
  if (bodyData.marketId) {
    marketId = bodyData.marketId;
    userWhere = { marketId: marketId };
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.isCasino) {
    userWhere.isCasino = bodyData.isCasino;
  }

  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId;
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$eventName`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientSessionAmount: { $sum: "$clientSessionAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientSessionComm: { $sum: "$clientSessionComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userSessionComm: { $sum: `$${userType}SessionComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
        userCasinoLedger: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCasino", 1] }],
              },
              `$${userType}LedgerAmt`,
              0,
            ],
          },
        },
        userSportLedger: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCasino", 0] }],
              },
              `$${userType}LedgerAmt`,
              0,
            ],
          },
        },
        createdAt: { $first: "$createdAt" },
      },
    },
    {
      $sort: {
        _id: -1,
      },
    },
  ]);

  let returnObj = [];
  resData.forEach((element) => {
    element.userLedgerAmt =
      -1 * element.userCasinoLedger + element.userSportLedger;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const clientPlusMinusByMarketWise = async (req, res) => {
  const bodyData = req.body;
  let loginData = req.loggedInUser;
  let userWhere = {};
  let userType = loginData.userType;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "marketId is Required");
  }
  userWhere = await whereHelper(loginData, { marketId: bodyData.marketId });
  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
  let positionData = await profitLossPosition.find(userWhere);
  return SendResponse(res, "success", "dataFetched", positionData);
};

const getPlusMinusByUserWise = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  let userWhere = {};

  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];

  if (bodyData.userId && bodyData.userType) {
    userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
  }

  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

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
        userCasinoLedgerAmt: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCasino", 1] }],
              },
              `$${downlineUserType}LedgerAmt`,
              0,
            ],
          },
        },
        userSportLedgerAmt: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCasino", 0] }],
              },
              `$${downlineUserType}LedgerAmt`,
              0,
            ],
          },
        },
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
    element.userLedgerAmt =
      -1 * element.userCasinoLedgerAmt + element.userSportLedgerAmt;

    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    element.downlineUserType = superDownlineUserType;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

let groupByLedgerByDownline = async (req, res) => {
  let bodyData = req.body;
  const loginUser = req.loggedInUser;

  const userType = loginUser.userType;
  let userPriority = UserTypes.indexOf(userType);
  let downLineType = UserTypes[userPriority - 1];
  let query = {};

  query.userType = downLineType;
  query = await whereHelper(loginUser, query);

  try {
    let groupCond = {
      _id: {
        eventName: "$eventName",
        marketId: "$marketId",
      },
      totalAmount: { $sum: "$amount" },
      createdAt: { $first: "$createdAt" },
      ledgerType: { $first: "$ledgerType" },
    };

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    returnData = {
      totalCoins: 0,
    };

    var resData = await LedgerModel.aggregate([
      {
        $match: query,
      },
      {
        $group: groupCond,
      },
      {
        $sort: { createdAt: -1, marketId: -1 },
      },
    ]);

    return SendResponse(res, "success", "dataFetched", resData);
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  clientPlusMinus,
  getUserNameByDefault,
  makeNegativeToPositiveUsers,
  getPlusMinusByEventWise,
  clientPlusMinusByMarketWise,
  getPlusMinusByUserWise,
  groupByLedgerByDownline,
};
