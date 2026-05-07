const IntCasinoBetsListModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const { ObjectId } = require("mongodb");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { whereHelper, dateWhereCond } = require("../../Helpers/CommonHelper");

// ─── 1. Casino Overview (for International Casino Details page) ───
const casinoOverview = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate, providerFilter, sortBy, sortOrder } = req.body;
    const userType = loginData.userType;
    const where = whereHelper(loginData);
    const dateWhere = await dateWhereCond(fromDate, toDate);

    // ── Summary stats from InternationalCasinoBetsList ──
    const betMatch = { ...where, date: dateWhere };
    const [summary] = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalRollback: { $sum: "$rollbackAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          uniquePlayers: { $addToSet: "$clientId" },
          uniqueGames: { $addToSet: "$gameId" },
          declaredBets: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          pendingBets: { $sum: { $cond: ["$isDeclare", 0, 1] } },
          rollbackBets: { $sum: { $cond: ["$isRollback", 1, 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalRollback: 1,
          totalPL: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          uniqueGames: { $size: "$uniqueGames" },
          declaredBets: 1,
          pendingBets: 1,
          rollbackBets: 1,
        },
      },
    ]);

    // ── By Provider ──
    const byProvider = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$providerName",
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          uniquePlayers: { $addToSet: "$clientId" },
          uniqueGames: { $addToSet: "$gameId" },
        },
      },
      {
        $project: {
          _id: 1,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalPL: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          uniqueGames: { $size: "$uniqueGames" },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    // ── By Game (Top 50) ──
    let gameMatch = { ...betMatch };
    if (providerFilter) gameMatch.providerName = providerFilter;

    const byGame = await IntCasinoBetsListModel.aggregate([
      { $match: gameMatch },
      {
        $group: {
          _id: { gameId: "$gameId", gameName: "$gameName" },
          providerName: { $first: "$providerName" },
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          uniquePlayers: { $addToSet: "$clientId" },
          lastPlayed: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 1,
          providerName: 1,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalPL: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          lastPlayed: 1,
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 50 },
    ]);

    // ── Daily Trend ──
    const dailyTrend = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$date",
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          uniquePlayers: { $addToSet: "$clientId" },
        },
      },
      {
        $project: {
          _id: 1,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalPL: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Top Players ──
    const topPlayers = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$clientId",
          username: { $first: "$userInfo.username" },
          name: { $first: "$userInfo.name" },
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          uniqueGames: { $addToSet: "$gameId" },
          lastBet: { $max: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          name: 1,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalPL: 1,
          uniqueGames: { $size: "$uniqueGames" },
          lastBet: 1,
        },
      },
      { $sort: { totalDebit: -1 } },
      { $limit: 30 },
    ]);

    // ── Transaction Log based P&L (same as existing casinoReportByUser logic) ──
    const txnWhere = { ...whereHelper(loginData) };
    txnWhere.gameType = { $in: ["internationalCasino"] };
    txnWhere.date = dateWhere;
    const userAmountType = `${userType}Amount`;

    const dailyPL = await CrickTransactionLogModel.aggregate([
      { $match: txnWhere },
      {
        $group: {
          _id: { marketId: "$marketId", date: "$date" },
          clientProfitLoss: { $sum: "$amount" },
          gameName: { $first: "$remarks" },
          createdAt: { $last: "$createdAt" },
          exposure: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isDeclare", 0] }, { $eq: ["$forBet", 1] }] },
                "$amount", 0,
              ],
            },
          },
          profitLoss: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }] },
                `$${userAmountType}`, 0,
              ],
            },
          },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // ── Hourly distribution ──
    const hourlyDist = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          bets: { $sum: 1 },
          debit: { $sum: "$debitAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    SendResponse(res, "success", "International Casino Overview", {
      userType,
      summary: summary || {},
      byProvider,
      byGame,
      dailyTrend,
      topPlayers,
      dailyPL,
      hourlyDist,
    });
  } catch (e) {
    console.error("intCasino.casinoOverview error:", e);
    SendResponse(res, "error", e.message);
  }
};

// ─── 2. Bet Details (for International Casino Bet page) ───
const betDetails = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate, gameId, providerFilter, clientFilter, statusFilter, sortBy, sortOrder, page, limit: pageLimit } = req.body;
    const userType = loginData.userType;
    const where = whereHelper(loginData);
    const dateWhere = await dateWhereCond(fromDate, toDate);

    let betMatch = { ...where, date: dateWhere };
    if (gameId) betMatch.gameId = gameId;
    if (providerFilter) betMatch.providerName = providerFilter;
    if (clientFilter) betMatch.clientId = new ObjectId(clientFilter);
    if (statusFilter === "declared") betMatch.isDeclare = true;
    else if (statusFilter === "pending") betMatch.isDeclare = false;
    if (statusFilter === "rollback") betMatch.isRollback = true;

    const sortField = sortBy || "createdAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const currentPage = page || 1;
    const perPage = pageLimit || 50;

    // ── Get bets ──
    const bets = await IntCasinoBetsListModel.find(betMatch)
      .sort({ [sortField]: sortDir })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean();

    const totalCount = await IntCasinoBetsListModel.countDocuments(betMatch);

    // ── Summary for these filters ──
    const [betSummary] = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalRollback: { $sum: "$rollbackAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          declaredBets: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          pendingBets: { $sum: { $cond: ["$isDeclare", 0, 1] } },
          rollbackBets: { $sum: { $cond: ["$isRollback", 1, 0] } },
          avgStake: { $avg: "$debitAmount" },
          maxStake: { $max: "$debitAmount" },
          maxWin: { $max: "$creditAmount" },
        },
      },
    ]);

    // ── Unique clients for filter dropdown ──
    const clients = await IntCasinoBetsListModel.aggregate([
      { $match: { ...where, date: dateWhere, ...(gameId ? { gameId } : {}) } },
      {
        $group: {
          _id: "$clientId",
          username: { $first: "$userInfo.username" },
          name: { $first: "$userInfo.name" },
        },
      },
      { $sort: { username: 1 } },
    ]);

    // ── Unique providers for filter ──
    const providers = await IntCasinoBetsListModel.distinct("providerName", { ...where, date: dateWhere });

    // ── By round (group bets by roundId for this game) ──
    const byRound = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$roundId",
          username: { $first: "$userInfo.username" },
          gameName: { $first: "$gameName" },
          providerName: { $first: "$providerName" },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          betCount: { $sum: 1 },
          isDeclare: { $last: "$isDeclare" },
          isRollback: { $last: "$isRollback" },
          createdAt: { $first: "$createdAt" },
        },
      },
      { $sort: { createdAt: sortDir } },
      { $limit: 100 },
    ]);

    // ── Per client summary ──
    const clientSummary = await IntCasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$clientId",
          username: { $first: "$userInfo.username" },
          name: { $first: "$userInfo.name" },
          totalBets: { $sum: 1 },
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          totalPL: { $sum: { $subtract: ["$creditAmount", "$debitAmount"] } },
          rounds: { $addToSet: "$roundId" },
        },
      },
      {
        $project: {
          _id: 1,
          username: 1,
          name: 1,
          totalBets: 1,
          totalDebit: 1,
          totalCredit: 1,
          totalPL: 1,
          totalRounds: { $size: "$rounds" },
        },
      },
      { $sort: { totalDebit: -1 } },
    ]);

    SendResponse(res, "success", "International Casino Bet Details", {
      userType,
      bets,
      totalCount,
      currentPage,
      perPage,
      summary: betSummary || {},
      clients,
      providers,
      byRound,
      clientSummary,
    });
  } catch (e) {
    console.error("intCasino.betDetails error:", e);
    SendResponse(res, "error", e.message);
  }
};

module.exports = { casinoOverview, betDetails };
