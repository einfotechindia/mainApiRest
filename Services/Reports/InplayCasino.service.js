const CasinoBetsListModel = require("../../Models/BetsList/CasinoBetsList.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const ProfitLossPositionModel = require("../../Models/BetsList/profitLossPosition.model");
const DiamondCasinoListModel = require("../../Models/Casino/DiamondCasinoList.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { whereHelper, dateWhereCond } = require("../../Helpers/CommonHelper");

const overview = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { fromDate, toDate } = req.body;
    const userType = loginData.userType;
    const where = whereHelper(loginData);
    const dateWhere = await dateWhereCond(fromDate, toDate);

    // ── Casino game list ──
    const casinoList = await DiamondCasinoListModel.find({}).sort({ priority: 1 }).lean();

    // ── Overall bet stats ──
    const betMatch = { ...where, date: dateWhere, isDeleted: false };
    const [betSummary] = await CasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: null,
          totalBets: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalProfit: { $sum: { $cond: [{ $gt: ["$profit", 0] }, "$profit", 0] } },
          totalLoss: { $sum: { $cond: [{ $gt: ["$loss", 0] }, "$loss", 0] } },
          totalPL: { $sum: "$profitLoss" },
          declaredBets: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          pendingBets: { $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", false] }, { $eq: ["$isDeleted", false] }] }, 1, 0] } },
          uniquePlayers: { $addToSet: "$clientId" },
          uniqueRounds: { $addToSet: "$roundId" },
        },
      },
      {
        $project: {
          _id: 0,
          totalBets: 1, totalStake: 1, totalProfit: 1, totalLoss: 1, totalPL: 1,
          declaredBets: 1, pendingBets: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          uniqueRounds: { $size: "$uniqueRounds" },
        },
      },
    ]);

    // ── By Casino Type (per game) ──
    const byCasinoType = await CasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$casinoType",
          totalBets: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalPL: { $sum: "$profitLoss" },
          declaredBets: { $sum: { $cond: ["$isDeclare", 1, 0] } },
          pendingBets: { $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", false] }, { $eq: ["$isDeleted", false] }] }, 1, 0] } },
          uniquePlayers: { $addToSet: "$clientId" },
          uniqueRounds: { $addToSet: "$roundId" },
          totalProfit: { $sum: { $cond: [{ $gt: ["$profit", 0] }, "$profit", 0] } },
          totalLoss: { $sum: { $cond: [{ $gt: ["$loss", 0] }, "$loss", 0] } },
        },
      },
      {
        $project: {
          _id: 1, totalBets: 1, totalStake: 1, totalPL: 1,
          declaredBets: 1, pendingBets: 1, totalProfit: 1, totalLoss: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          uniqueRounds: { $size: "$uniqueRounds" },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    // ── Transaction Log P&L by eventId ──
    const txnWhere = { ...whereHelper(loginData) };
    txnWhere.gameType = "diamondCasino";
    txnWhere.overallType = "diamondCasino";
    txnWhere.date = dateWhere;
    const userAmountType = `${userType}Amount`;

    const byEvent = await CrickTransactionLogModel.aggregate([
      { $match: txnWhere },
      {
        $group: {
          _id: "$eventId",
          gameName: { $first: "$gameName" },
          clientProfitLoss: { $sum: "$amount" },
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
          totalBets: { $sum: { $cond: [{ $eq: ["$forBet", 1] }, 1, 0] } },
        },
      },
      { $sort: { totalBets: -1 } },
    ]);

    // ── Daily trend ──
    const dailyTrend = await CasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$date",
          totalBets: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalPL: { $sum: "$profitLoss" },
          uniquePlayers: { $addToSet: "$clientId" },
          declaredBets: { $sum: { $cond: ["$isDeclare", 1, 0] } },
        },
      },
      {
        $project: {
          _id: 1, totalBets: 1, totalStake: 1, totalPL: 1,
          declaredBets: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Top players ──
    const topPlayers = await CasinoBetsListModel.aggregate([
      { $match: betMatch },
      {
        $group: {
          _id: "$clientId",
          username: { $first: "$userId" },
          totalBets: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalPL: { $sum: "$profitLoss" },
          totalProfit: { $sum: { $cond: [{ $gt: ["$profit", 0] }, "$profit", 0] } },
          totalLoss: { $sum: { $cond: [{ $gt: ["$loss", 0] }, "$loss", 0] } },
          casinoTypes: { $addToSet: "$casinoType" },
          lastBet: { $max: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          username: { $ifNull: ["$userDetails.username", "$username"] },
          name: "$userDetails.name",
          totalBets: 1, totalStake: 1, totalPL: 1, totalProfit: 1, totalLoss: 1,
          gamesPlayed: { $size: "$casinoTypes" },
          lastBet: 1,
        },
      },
      { $sort: { totalStake: -1 } },
      { $limit: 25 },
    ]);

    // ── Undeclared rounds ──
    const undeclaredRounds = await CasinoBetsListModel.aggregate([
      { $match: { ...where, isDeclare: false, isPartiallyDeclare: false, isDeleted: false } },
      {
        $group: {
          _id: { roundId: "$roundId", eventId: "$eventId" },
          casinoType: { $first: "$casinoType" },
          betCount: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          createdAt: { $last: "$createdAt" },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 30 },
    ]);

    // ── Settled from ProfitLossPosition ──
    const settledMatch = { ...whereHelper(loginData), isCasino: 1 };
    if (fromDate && toDate) settledMatch.date = dateWhere;

    const settledByGame = await ProfitLossPositionModel.aggregate([
      { $match: settledMatch },
      {
        $group: {
          _id: "$eventName",
          totalMarkets: { $sum: 1 },
          clientOdds: { $sum: "$clientOddsAmount" },
          clientSession: { $sum: "$clientSessionAmount" },
          clientNet: { $sum: "$clientNetAmount" },
          userNetPL: { $sum: `$${userType}NetProfitLoss` },
        },
      },
      { $sort: { totalMarkets: -1 } },
    ]);

    SendResponse(res, "success", "Inplay Casino Overview", {
      userType,
      casinoList,
      summary: betSummary || {},
      byCasinoType,
      byEvent,
      dailyTrend,
      topPlayers,
      undeclaredRounds,
      settledByGame,
    });
  } catch (e) {
    console.error("inplayCasino.overview error:", e);
    SendResponse(res, "error", e.message);
  }
};

module.exports = { overview };
