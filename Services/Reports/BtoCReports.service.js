const UserModel = require("../../Models/User/User.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetsListModel = require("../../Models/BetsList/FancyBetsList.model");
const CasinoBetsListModel = require("../../Models/BetsList/CasinoBetsList.model");
const IntCasinoBetsListModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const LedgerModel = require("../../Models/Ledger.model");
const StatementModel = require("../../Models/Statement.model");
const LoginActivityModel = require("../../Models/LoginActivity.model");
const ActivityModel = require("../../Models/Activity.model");
const ProfitLossPositionModel = require("../../Models/BetsList/profitLossPosition.model");
const { ObjectId } = require("mongodb");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { whereHelper, dateWhereCond } = require("../../Helpers/CommonHelper");

// ─── 1. Financial Overview ───
const financialOverview = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const userType = loginData.userType;
    const dateFilter = await dateWhereCond(fromDate, toDate);

    const plField = `${userType}ProfitLoss`;
    const ledgerField = `${userType}LedgerAmount`;
    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    // P&L Summary
    const plSummary = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalClientPL: { $sum: "$clientProfitLoss" },
          totalUserPL: { $sum: `$${plField}` },
          totalUserLedger: { $sum: `$${ledgerField}` },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    // Daily P&L trend
    const dailyPL = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$date",
          clientPL: { $sum: "$clientProfitLoss" },
          userPL: { $sum: `$${plField}` },
          userLedger: { $sum: `$${ledgerField}` },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Deposit/Withdraw summary
    let dwFilter = whereHelper(loginData);
    dwFilter.date = dateFilter;
    const dwSummary = await DepositWithdrawModel.aggregate([
      { $match: dwFilter },
      {
        $group: {
          _id: null,
          totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          cancelledDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, 1, 0] } },
        },
      },
    ]);

    // Active clients count
    let userFilter = whereHelper(loginData);
    userFilter.userType = "client";
    const activeClients = await UserModel.countDocuments({ ...userFilter, status: 1 });
    const totalClients = await UserModel.countDocuments(userFilter);

    return SendResponse(res, "success", "Financial overview", {
      plSummary: plSummary[0] || {},
      dailyPL,
      dwSummary: dwSummary[0] || {},
      activeClients,
      totalClients,
      userType,
    });
  } catch (error) {
    console.error("financialOverview error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 2. Bet Analysis ───
const betAnalysis = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const dateFilter = await dateWhereCond(fromDate, toDate);
    let baseFilter = whereHelper(loginData);
    baseFilter.date = dateFilter;

    // Odds bets
    const oddsBets = await OddsBetsListModel.aggregate([
      { $match: { ...baseFilter, isDeleted: false } },
      {
        $group: {
          _id: "$oddsType",
          totalBets: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalProfit: { $sum: { $cond: [{ $eq: ["$isDeclare", true] }, "$profitLossAmount", 0] } },
          declared: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          undeclared: { $sum: { $cond: ["$isDeclare", 0, 1] } },
          backBets: { $sum: { $cond: [{ $eq: ["$type", "back"] }, 1, 0] } },
          layBets: { $sum: { $cond: [{ $eq: ["$type", "lay"] }, 1, 0] } },
        },
      },
    ]);

    // Fancy bets
    const fancyBets = await FancyBetsListModel.aggregate([
      { $match: { ...baseFilter, isDeleted: false } },
      {
        $group: {
          _id: "$fancyType",
          totalBets: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalProfit: { $sum: { $cond: [{ $eq: ["$isDeclare", true] }, "$profitLossAmount", 0] } },
          declared: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          undeclared: { $sum: { $cond: ["$isDeclare", 0, 1] } },
          yesBets: { $sum: { $cond: [{ $eq: ["$type", "yes"] }, 1, 0] } },
          noBets: { $sum: { $cond: [{ $eq: ["$type", "no"] }, 1, 0] } },
        },
      },
    ]);

    // Casino bets
    const casinoBets = await CasinoBetsListModel.aggregate([
      { $match: { ...baseFilter, isDeleted: false } },
      {
        $group: {
          _id: "$casinoType",
          totalBets: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalPL: { $sum: { $cond: [{ $eq: ["$isDeclare", true] }, "$profitLoss", 0] } },
          declared: { $sum: { $cond: ["$isDeclare", 1, 0] } },
        },
      },
    ]);

    // International casino bets
    const intCasinoBets = await IntCasinoBetsListModel.aggregate([
      { $match: { ...baseFilter, isDeleted: false } },
      {
        $group: {
          _id: "$providerName",
          totalBets: { $sum: 1 },
          totalBetAmount: { $sum: "$amount" },
          totalPL: { $sum: "$profitLoss" },
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 20 },
    ]);

    // Daily bet volume
    const dailyVolume = await OddsBetsListModel.aggregate([
      { $match: { ...baseFilter, isDeleted: false } },
      {
        $group: {
          _id: "$date",
          count: { $sum: 1 },
          amount: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return SendResponse(res, "success", "Bet analysis", {
      oddsBets, fancyBets, casinoBets, intCasinoBets, dailyVolume,
    });
  } catch (error) {
    console.error("betAnalysis error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 3. Client P&L ───
const clientPnl = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate, sortBy, sortOrder, limit: lim } = req.body;
    const userType = loginData.userType;
    const dateFilter = await dateWhereCond(fromDate, toDate);
    const plField = `${userType}ProfitLoss`;
    const ledgerField = `${userType}LedgerAmount`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    const sortField = sortBy === "userPL" ? "userPL" : "clientPL";
    const order = sortOrder === "asc" ? 1 : -1;
    const resultLimit = lim || 50;

    const clientData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$clientId",
          clientPL: { $sum: "$clientProfitLoss" },
          userPL: { $sum: `$${plField}` },
          userLedger: { $sum: `$${ledgerField}` },
          totalBets: { $sum: 1 },
        },
      },
      { $sort: { [sortField]: order } },
      { $limit: resultLimit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          clientPL: 1, userPL: 1, userLedger: 1, totalBets: 1,
          username: "$userInfo.username",
          name: "$userInfo.name",
          coins: "$userInfo.coins",
          exposure: "$userInfo.exposure",
          status: "$userInfo.status",
        },
      },
    ]);

    return SendResponse(res, "success", "Client P&L", { clients: clientData, userType });
  } catch (error) {
    console.error("clientPnl error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 4. Game Performance ───
const gamePerformance = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const userType = loginData.userType;
    const dateFilter = await dateWhereCond(fromDate, toDate);
    const plField = `${userType}ProfitLoss`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    // By game name
    const byGame = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameName",
          clientPL: { $sum: "$clientProfitLoss" },
          userPL: { $sum: `$${plField}` },
          totalBets: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 30 },
    ]);

    // By game type (cricket, football, tennis, casino etc)
    const byType = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameType",
          clientPL: { $sum: "$clientProfitLoss" },
          userPL: { $sum: `$${plField}` },
          totalBets: { $sum: 1 },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    // By market type (matchOdds, bookmaker, fancy, toss)
    const byMarket = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$marketType",
          clientPL: { $sum: "$clientProfitLoss" },
          userPL: { $sum: `$${plField}` },
          totalBets: { $sum: 1 },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    return SendResponse(res, "success", "Game performance", { byGame, byType, byMarket, userType });
  } catch (error) {
    console.error("gamePerformance error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 5. Commission Report ───
const commissionReport = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const dateFilter = await dateWhereCond(fromDate, toDate);

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;

    const roles = ["owner", "subowner", "superadmin", "admin", "subadmin", "master", "superagent", "agent"];
    const groupFields = { _id: null };
    roles.forEach((r) => {
      groupFields[`${r}PL`] = { $sum: `$${r}ProfitLoss` };
      groupFields[`${r}Ledger`] = { $sum: `$${r}LedgerAmount` };
    });
    groupFields.clientPL = { $sum: "$clientProfitLoss" };
    groupFields.totalTx = { $sum: 1 };

    const summary = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      { $group: groupFields },
    ]);

    // Commission by game type
    const groupByGame = { _id: "$gameType" };
    roles.forEach((r) => {
      groupByGame[`${r}PL`] = { $sum: `$${r}ProfitLoss` };
    });
    groupByGame.clientPL = { $sum: "$clientProfitLoss" };
    groupByGame.count = { $sum: 1 };

    const byGameType = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      { $group: groupByGame },
      { $sort: { count: -1 } },
    ]);

    return SendResponse(res, "success", "Commission report", {
      summary: summary[0] || {},
      byGameType,
      userType: loginData.userType,
    });
  } catch (error) {
    console.error("commissionReport error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 6. Exposure Report ───
const exposureReport = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    let userFilter = whereHelper(loginData);
    userFilter.userType = "client";
    userFilter.exposure = { $lt: 0 };

    const exposedClients = await UserModel.find(userFilter)
      .select("username name coins exposure status lastIp")
      .sort({ exposure: 1 })
      .limit(50)
      .lean();

    // Undeclared market positions
    let posFilter = whereHelper(loginData);
    posFilter.isDeclare = false;

    const openPositions = await ProfitLossPositionModel.aggregate([
      { $match: posFilter },
      {
        $group: {
          _id: "$eventName",
          marketCount: { $sum: 1 },
          clientOdds: { $sum: "$clientOddsAmount" },
          clientSession: { $sum: "$clientSessionAmount" },
          clientNet: { $sum: "$clientNetAmount" },
        },
      },
      { $sort: { clientNet: 1 } },
      { $limit: 30 },
    ]);

    // Total exposure stats
    const exposureStats = await UserModel.aggregate([
      { $match: { ...whereHelper(loginData), userType: "client" } },
      {
        $group: {
          _id: null,
          totalExposure: { $sum: "$exposure" },
          totalCoins: { $sum: "$coins" },
          exposedCount: { $sum: { $cond: [{ $lt: ["$exposure", 0] }, 1, 0] } },
          totalClients: { $sum: 1 },
        },
      },
    ]);

    return SendResponse(res, "success", "Exposure report", {
      exposedClients, openPositions, exposureStats: exposureStats[0] || {},
    });
  } catch (error) {
    console.error("exposureReport error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 7. Deposit/Withdraw Analytics ───
const depositWithdrawAnalytics = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const dateFilter = await dateWhereCond(fromDate, toDate);
    let dwFilter = whereHelper(loginData);
    dwFilter.date = dateFilter;

    // By payment method
    const byMethod = await DepositWithdrawModel.aggregate([
      { $match: { ...dwFilter, status: "accept" } },
      {
        $group: {
          _id: { reqType: "$reqType", method: "$paymentMethod" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      { $sort: { total: -1 } },
    ]);

    // Daily trend
    const dailyTrend = await DepositWithdrawModel.aggregate([
      { $match: dwFilter },
      {
        $group: {
          _id: { date: "$date", reqType: "$reqType", status: "$status" },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Top depositors
    const topDepositors = await DepositWithdrawModel.aggregate([
      { $match: { ...dwFilter, reqType: "deposit", status: "accept" } },
      {
        $group: {
          _id: "$userId",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          username: { $first: "$username" },
          name: { $first: "$name" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]);

    // Top withdrawers
    const topWithdrawers = await DepositWithdrawModel.aggregate([
      { $match: { ...dwFilter, reqType: "withdraw", status: "accept" } },
      {
        $group: {
          _id: "$userId",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          username: { $first: "$username" },
          name: { $first: "$name" },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]);

    // Average processing (pending count & amounts)
    const pendingStats = await DepositWithdrawModel.aggregate([
      { $match: { ...dwFilter, status: "pending" } },
      {
        $group: {
          _id: "$reqType",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    return SendResponse(res, "success", "Deposit/Withdraw analytics", {
      byMethod, dailyTrend, topDepositors, topWithdrawers, pendingStats,
    });
  } catch (error) {
    console.error("depositWithdrawAnalytics error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 8. Fraud Detection ───
const fraudDetection = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const dateFilter = await dateWhereCond(fromDate, toDate);

    // Duplicate IPs (multiple users same IP)
    let userFilter = whereHelper(loginData);
    userFilter.userType = "client";
    const duplicateIPs = await UserModel.aggregate([
      { $match: userFilter },
      { $group: { _id: "$lastIp", users: { $push: { username: "$username", name: "$name", userId: "$_id", status: "$status" } }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]);

    // Suspicious large withdrawals
    let dwFilter = whereHelper(loginData);
    dwFilter.date = dateFilter;
    dwFilter.reqType = "withdraw";
    dwFilter.status = "accept";
    const largeWithdrawals = await DepositWithdrawModel.aggregate([
      { $match: dwFilter },
      { $sort: { amount: -1 } },
      { $limit: 20 },
      { $project: { username: 1, name: 1, amount: 1, date: 1, ip: 1, paymentMethod: 1, utrNo: 1 } },
    ]);

    // Clients with high deposit but quick withdrawal (possible money laundering pattern)
    const quickWithdraw = await DepositWithdrawModel.aggregate([
      { $match: { ...whereHelper(loginData), date: dateFilter, status: "accept" } },
      {
        $group: {
          _id: "$userId",
          totalDeposit: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
          username: { $first: "$username" },
          name: { $first: "$name" },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
      { $match: { totalWithdraw: { $gt: 0 }, totalDeposit: { $gt: 0 } } },
      { $addFields: { ratio: { $divide: ["$totalWithdraw", "$totalDeposit"] } } },
      { $match: { ratio: { $gte: 0.8 } } },
      { $sort: { totalWithdraw: -1 } },
      { $limit: 20 },
    ]);

    // Multiple logins from different IPs
    let loginFilter = {};
    if (fromDate && toDate) loginFilter.date = dateFilter;
    const multiIpLogins = await LoginActivityModel.aggregate([
      { $match: loginFilter },
      {
        $group: {
          _id: "$userId",
          ips: { $addToSet: "$ip" },
          username: { $first: "$username" },
          loginCount: { $sum: 1 },
        },
      },
      { $addFields: { ipCount: { $size: "$ips" } } },
      { $match: { ipCount: { $gte: 3 } } },
      { $sort: { ipCount: -1 } },
      { $limit: 20 },
    ]);

    // Cancelled/Fake deposits
    let fakeFilter = whereHelper(loginData);
    fakeFilter.date = dateFilter;
    fakeFilter.reqType = "deposit";
    fakeFilter.status = "cancel";
    const fakeDeposits = await DepositWithdrawModel.aggregate([
      { $match: fakeFilter },
      {
        $group: {
          _id: "$userId",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          username: { $first: "$username" },
          name: { $first: "$name" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return SendResponse(res, "success", "Fraud detection", {
      duplicateIPs, largeWithdrawals, quickWithdraw, multiIpLogins, fakeDeposits,
    });
  } catch (error) {
    console.error("fraudDetection error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 9. User Growth ───
const userGrowth = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const dateFilter = await dateWhereCond(fromDate, toDate);

    let userFilter = whereHelper(loginData);
    userFilter.userType = "client";

    // Overall counts
    const totalUsers = await UserModel.countDocuments(userFilter);
    const activeUsers = await UserModel.countDocuments({ ...userFilter, status: 1 });
    const suspendedUsers = await UserModel.countDocuments({ ...userFilter, status: 0 });

    // New registrations in date range
    const newUsers = await UserModel.aggregate([
      { $match: { ...userFilter, date: dateFilter } },
      {
        $group: {
          _id: "$date",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Total new users count
    const totalNewUsers = await UserModel.countDocuments({ ...userFilter, date: dateFilter });

    // Users with balance
    const balanceDistribution = await UserModel.aggregate([
      { $match: userFilter },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$coins" },
          totalExposure: { $sum: "$exposure" },
          zeroBalance: { $sum: { $cond: [{ $lte: ["$coins", 0] }, 1, 0] } },
          withBalance: { $sum: { $cond: [{ $gt: ["$coins", 0] }, 1, 0] } },
          avgBalance: { $avg: "$coins" },
          maxBalance: { $max: "$coins" },
        },
      },
    ]);

    // Login activity trend
    const loginTrend = await LoginActivityModel.aggregate([
      { $match: { date: dateFilter } },
      {
        $group: {
          _id: "$date",
          uniqueUsers: { $addToSet: "$userId" },
          totalLogins: { $sum: 1 },
        },
      },
      { $addFields: { uniqueCount: { $size: "$uniqueUsers" } } },
      { $project: { uniqueUsers: 0 } },
      { $sort: { _id: 1 } },
    ]);

    // Top active users (by login frequency)
    const topActive = await LoginActivityModel.aggregate([
      { $match: { date: dateFilter } },
      {
        $group: {
          _id: "$userId",
          username: { $first: "$username" },
          loginCount: { $sum: 1 },
          lastLogin: { $max: "$date" },
          ips: { $addToSet: "$ip" },
        },
      },
      { $sort: { loginCount: -1 } },
      { $limit: 20 },
    ]);

    return SendResponse(res, "success", "User growth", {
      totalUsers, activeUsers, suspendedUsers, totalNewUsers,
      newUsers, balanceDistribution: balanceDistribution[0] || {},
      loginTrend, topActive,
    });
  } catch (error) {
    console.error("userGrowth error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ─── 10. Settlement Report ───
const settlementReport = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const userType = loginData.userType;
    const dateFilter = await dateWhereCond(fromDate, toDate);

    let posFilter = whereHelper(loginData);
    posFilter.date = dateFilter;

    // Settled markets
    const settled = await ProfitLossPositionModel.aggregate([
      { $match: { ...posFilter, isDeclare: true } },
      {
        $group: {
          _id: null,
          totalMarkets: { $sum: 1 },
          clientOddsTotal: { $sum: "$clientOddsAmount" },
          clientSessionTotal: { $sum: "$clientSessionAmount" },
          clientNetTotal: { $sum: "$clientNetAmount" },
          [`${userType}NetPL`]: { $sum: `$${userType}NetProfitLoss` },
          [`${userType}Ledger`]: { $sum: `$${userType}LedgerAmt` },
        },
      },
    ]);

    // Unsettled markets
    const unsettled = await ProfitLossPositionModel.aggregate([
      { $match: { ...posFilter, isDeclare: false } },
      {
        $group: {
          _id: "$eventName",
          marketCount: { $sum: 1 },
          clientOdds: { $sum: "$clientOddsAmount" },
          clientSession: { $sum: "$clientSessionAmount" },
          clientNet: { $sum: "$clientNetAmount" },
        },
      },
      { $sort: { clientNet: 1 } },
    ]);

    // Settled by game type
    const settledByGame = await ProfitLossPositionModel.aggregate([
      { $match: { ...posFilter, isDeclare: true } },
      {
        $group: {
          _id: "$positionType",
          count: { $sum: 1 },
          clientNet: { $sum: "$clientNetAmount" },
          userNetPL: { $sum: `$${userType}NetProfitLoss` },
        },
      },
    ]);

    // Recent settlements (last 30)
    const recentSettled = await ProfitLossPositionModel.find({ ...posFilter, isDeclare: true })
      .select("eventName result clientNetAmount clientOddsAmount clientSessionAmount date")
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const unsettledCount = await ProfitLossPositionModel.countDocuments({ ...posFilter, isDeclare: false });

    return SendResponse(res, "success", "Settlement report", {
      settled: settled[0] || {},
      unsettled,
      unsettledCount,
      settledByGame,
      recentSettled,
      userType,
    });
  } catch (error) {
    console.error("settlementReport error:", error);
    return SendResponse(res, "error", error.message);
  }
};

module.exports = {
  financialOverview, betAnalysis, clientPnl, gamePerformance,
  commissionReport, exposureReport, depositWithdrawAnalytics,
  fraudDetection, userGrowth, settlementReport,
};
