const UserModel = require("../../Models/User/User.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  whereHelper,
  dateWhereCond,
  convertKeyObject,
} = require("../../Helpers/CommonHelper");
const getDashboardReport = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;

    const fromDate = bodyData.fromDate || null;
    const toDate = bodyData.toDate || null;

    const dateFilter = await dateWhereCond(fromDate, toDate);

    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    // Summary aggregation
    const summaryData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalClientProfitLoss: { $sum: "$clientProfitLoss" },
          totalUserProfitLoss: { $sum: `$${userProfitLossField}` },
          totalUserLedger: { $sum: `$${userLedgerField}` },
        },
      },
    ]);

    const summary = summaryData.length > 0
      ? {
        totalTransactions: summaryData[0].totalTransactions,
        totalClientProfitLoss: summaryData[0].totalClientProfitLoss,
        totalUserProfitLoss: summaryData[0].totalUserProfitLoss,
        totalUserLedger: summaryData[0].totalUserLedger,
      }
      : {
        totalTransactions: 0,
        totalClientProfitLoss: 0,
        totalUserProfitLoss: 0,
        totalUserLedger: 0,
      };

    // Top Winners (clients winning, clientProfitLoss > 0)
    const topWinnersData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$clientId",
          clientProfitLoss: { $sum: "$clientProfitLoss" },
          userProfitLoss: { $sum: `$${userProfitLossField}` },
          userLedger: { $sum: `$${userLedgerField}` },
          totalBets: { $sum: 1 },
        },
      },
      { $match: { clientProfitLoss: { $gt: 0 } } },
      { $sort: { clientProfitLoss: -1 } },
      { $limit: 30 },
    ]);

    // Top Losers (clients losing, clientProfitLoss < 0)
    const topLosersData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$clientId",
          clientProfitLoss: { $sum: "$clientProfitLoss" },
          userProfitLoss: { $sum: `$${userProfitLossField}` },
          userLedger: { $sum: `$${userLedgerField}` },
          totalBets: { $sum: 1 },
        },
      },
      { $match: { clientProfitLoss: { $lt: 0 } } },
      { $sort: { clientProfitLoss: 1 } },
      { $limit: 30 },
    ]);

    // Collect all clientIds from winners and losers to fetch user details
    const allClientIds = [];
    topWinnersData.forEach((item) => {
      if (item._id) allClientIds.push(item._id);
    });
    topLosersData.forEach((item) => {
      if (item._id) allClientIds.push(item._id);
    });

    const clientUsers = await UserModel.find(
      { _id: { $in: allClientIds } },
      { username: 1, name: 1 }
    ).lean();

    const clientUserMap = convertKeyObject(
      clientUsers.map((u) => ({ ...u, _id: u._id.toString() })),
      "_id"
    );

    const topWinners = topWinnersData.map((item) => {
      const clientIdStr = item._id ? item._id.toString() : "";
      const userInfo = clientUserMap[clientIdStr] || {};
      return {
        clientId: item._id,
        username: userInfo.username || "",
        name: userInfo.name || "",
        clientProfitLoss: item.clientProfitLoss,
        userProfitLoss: item.userProfitLoss,
        userLedger: item.userLedger,
        totalBets: item.totalBets,
      };
    });

    const topLosers = topLosersData.map((item) => {
      const clientIdStr = item._id ? item._id.toString() : "";
      const userInfo = clientUserMap[clientIdStr] || {};
      return {
        clientId: item._id,
        username: userInfo.username || "",
        name: userInfo.name || "",
        clientProfitLoss: item.clientProfitLoss,
        userProfitLoss: item.userProfitLoss,
        userLedger: item.userLedger,
        totalBets: item.totalBets,
      };
    });

    // Top Games by volume
    const topGames = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameName",
          eventName: { $first: "$eventName" },
          totalBets: { $sum: 1 },
          totalClientProfitLoss: { $sum: "$clientProfitLoss" },
          totalUserProfitLoss: { $sum: `$${userProfitLossField}` },
          totalUserLedger: { $sum: `$${userLedgerField}` },
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 20 },
    ]);

    // UserType Summary
    const userTypeSummaryData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$userType",
          totalProfitLoss: { $sum: "$clientProfitLoss" },
          userProfitLoss: { $sum: `$${userProfitLossField}` },
          userLedger: { $sum: `$${userLedgerField}` },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const responseData = {
      summary,
      topWinners,
      topLosers,
      topGames,
      userTypeSummary: userTypeSummaryData,
    };

    return SendResponse(res, "success", "Dashboard report fetched successfully", responseData);
  } catch (error) {
    console.log("getDashboardReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};

const getIpReport = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;

    const userField = `${userType}Id`;

    const ipData = await UserModel.aggregate([
      {
        $match: {
          [userField]: new ObjectId(userId),
          lastIp: { $ne: null, $exists: true },
        },
      },
      {
        $group: {
          _id: "$lastIp",
          users: {
            $push: {
              userId: "$_id",
              username: "$username",
              name: "$name",
              userType: "$userType",
              lastLoginTime: "$lastLoginTime",
              status: "$status",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return SendResponse(res, "success", "IP report fetched successfully", ipData);
  } catch (error) {
    console.log("getIpReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};

const getGameReport = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;

    const fromDate = bodyData.fromDate || null;
    const toDate = bodyData.toDate || null;

    const dateFilter = await dateWhereCond(fromDate, toDate);

    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    const gameData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameName",
          eventName: { $first: "$eventName" },
          eventId: { $first: "$eventId" },
          sportId: { $first: "$sportId" },
          totalBets: { $sum: 1 },
          totalClientProfitLoss: { $sum: "$clientProfitLoss" },
          totalUserProfitLoss: { $sum: `$${userProfitLossField}` },
          totalUserLedger: { $sum: `$${userLedgerField}` },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    return SendResponse(res, "success", "Game report fetched successfully", gameData);
  } catch (error) {
    console.log("getGameReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};

const getUserActivityReport = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;

    const userField = `${userType}Id`;

    const todayStart = moment().startOf("day").toDate().getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    const baseMatch = {
      [userField]: new ObjectId(userId),
      userType: "client",
    };

    // Active clients (status: 1)
    const activeClients = await UserModel.countDocuments({
      ...baseMatch,
      status: 1,
    });

    // Suspended clients (status: 0)
    const suspendedClients = await UserModel.countDocuments({
      ...baseMatch,
      status: 0,
    });

    const totalClients = await UserModel.countDocuments(baseMatch);

    const todayActiveUsers = await UserModel.countDocuments({
      ...baseMatch,
      lastLoginTime: { $gte: todayStart, $lt: todayEnd },
    });


    const newUsersToday = await UserModel.countDocuments({
      ...baseMatch,
      createdAt: {
        $gte: moment().startOf("day").toDate(),
        $lt: moment().endOf("day").toDate(),
      },
    });


    const todayActiveUserList = await UserModel.find(
      {
        ...baseMatch,
        lastLoginTime: { $gte: todayStart, $lt: todayEnd },
      },
      { username: 1, name: 1, lastLoginTime: 1, lastIp: 1, coins: 1, exposure: 1 }
    )
      .sort({ lastLoginTime: -1 })
      .limit(50)
      .lean();

    const responseData = {
      totalClients,
      activeClients,
      suspendedClients,
      todayActiveUsers,
      newUsersToday,
      todayActiveUserList,
    };

    return SendResponse(res, "success", "User activity report fetched successfully", responseData);
  } catch (error) {
    console.log("getUserActivityReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};

module.exports = {
  getDashboardReport,
  getIpReport,
  getGameReport,
  getUserActivityReport,
};
