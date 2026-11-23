const UserModel = require("../../Models/User/User.model");
const CrickTransactionModel = require("../../Models/crickTransaction.model");
const LedgerModel = require("../../Models/Ledger.model");
const CasinoBetsModel = require("../../Models/BetsList/CasinoBetsList.model");
const FancyBetsModel = require("../../Models/BetsList/FancyBetsList.model");
const OddsBetsModel = require("../../Models/BetsList/OddsBetsList.model");
const LoginActivityModel = require("../../Models/LoginActivity.model");
const CommLedgerModel = require("../../Models/commLedger.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");

async function getUserAnalytics(req, res) {
  try {
    const { username, userId } = req.body;
    if (!username && !userId) return SendResponse(res, "error", "username or userId required");

    // Find user
    const query = userId ? { _id: userId } : { $or: [{ username }, { checkUsername: username?.toUpperCase() }] };
    const user = await UserModel.findOne({ ...query, isDeleted: false })
      .select("-password -__v -jwtToken -authenticateToken -otp -transactionPassword")
      .lean();
    if (!user) return SendResponse(res, "error", "User not found");

    const uid = user._id;
    const uidStr = String(uid);

    // Run all queries in parallel
    const [
      sportPL, casinoPL, eventPL, commissions, ledger,
      recentTransactions, loginActivity, ipUsers, betCounts,
    ] = await Promise.all([

      // Sport-wise P&L
      CrickTransactionModel.aggregate([
        { $match: { clientId: uid, isDeclare: 1 } },
        { $group: { _id: "$gameType", totalPL: { $sum: "$clientProfitLoss" }, count: { $sum: 1 } } },
        { $sort: { totalPL: -1 } },
      ]),

      // Casino-wise P&L
      CasinoBetsModel.aggregate([
        { $match: { clientId: uid, isDeclare: 1 } },
        { $group: { _id: "$casinoType", totalPL: { $sum: "$profitLoss" }, totalBets: { $sum: 1 }, totalStake: { $sum: "$amount" } } },
        { $sort: { totalPL: -1 } },
      ]),

      // Event-wise P&L (top 20)
      CrickTransactionModel.aggregate([
        { $match: { clientId: uid, isDeclare: 1 } },
        { $group: { _id: { eventId: "$eventId", eventName: "$eventName", gameType: "$gameType" }, totalPL: { $sum: "$clientProfitLoss" }, count: { $sum: 1 } } },
        { $sort: { totalPL: -1 } },
        { $limit: 20 },
      ]),

      // Commission earnings
      CommLedgerModel.aggregate([
        { $match: { userId: uid } },
        { $group: { _id: null, totalComm: { $sum: "$amount" }, oddsComm: { $sum: "$oddsComm" }, sessionComm: { $sum: "$sessionComm" }, casinoComm: { $sum: "$casinoComm" }, count: { $sum: 1 } } },
      ]),

      // Ledger (last 30)
      LedgerModel.find({ userId: uid }).sort({ createdAt: -1 }).limit(30).lean(),

      // Recent crickTransactions (last 30)
      CrickTransactionModel.find({ clientId: uid }).sort({ createdAt: -1 }).limit(30)
        .select("gameType eventName amount clientProfitLoss remarks result marketId isDeclare isRollback createdAt")
        .lean(),

      // Login activity (last 20)
      LoginActivityModel.find({ userId: uid }).sort({ createdAt: -1 }).limit(20).lean(),

      // IP reputation — find other users who logged in from same IPs
      (async () => {
        const userIps = await LoginActivityModel.distinct("ip", { userId: uid });
        if (!userIps.length) return { ips: [], sharedUsers: [] };
        const shared = await LoginActivityModel.aggregate([
          { $match: { ip: { $in: userIps }, userId: { $ne: uid } } },
          { $group: { _id: { ip: "$ip", userId: "$userId", username: "$username" }, lastLogin: { $max: "$createdAt" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 50 },
        ]);
        return { ips: userIps, sharedUsers: shared.map(s => ({ ip: s._id.ip, userId: s._id.userId, username: s._id.username, loginCount: s.count, lastLogin: s.lastLogin })) };
      })(),

      // Bet counts by type
      Promise.all([
        OddsBetsModel.countDocuments({ clientId: uid }),
        FancyBetsModel.countDocuments({ clientId: uid }),
        CasinoBetsModel.countDocuments({ clientId: uid }),
      ]).then(([odds, fancy, casino]) => ({ odds, fancy, casino, total: odds + fancy + casino })),
    ]);

    // Build response
    const commData = commissions[0] || { totalComm: 0, oddsComm: 0, sessionComm: 0, casinoComm: 0, count: 0 };

    return SendResponse(res, "Success", "User analytics fetched", {
      // User overview
      user: {
        _id: user._id, username: user.username, name: user.name, userType: user.userType,
        coins: user.coins, exposure: user.exposure, totalProfitLoss: user.totalProfitLoss,
        creditReference: user.creditReference, status: user.status,
        betStatus: user.betStatus, casinoStatus: user.casinoStatus, matkaStatus: user.matkaStatus,
        lastIp: user.lastIp, lastLoginTime: user.lastLoginTime,
        creatorName: user.creatorName, createdAt: user.createdAt,
        shares: { match: user.userMatchShare, casino: user.userCasinoShare, matka: user.userMatkaShare },
        commissionRates: { match: user.userMatchCommission, session: user.userSessionCommission, casino: user.userCasinoCommission, matka: user.userMatkaCommission },
      },

      // Bet statistics
      betCounts,

      // Sport-wise P&L
      sportPL: sportPL.map(s => ({ gameType: s._id || "Unknown", totalPL: s.totalPL, betCount: s.count })),

      // Casino-wise P&L
      casinoPL: casinoPL.map(c => ({ casinoType: c._id || "Unknown", totalPL: c.totalPL, totalBets: c.totalBets, totalStake: c.totalStake })),

      // Event-wise P&L (top 20)
      eventPL: eventPL.map(e => ({ eventId: e._id.eventId, eventName: e._id.eventName, gameType: e._id.gameType, totalPL: e.totalPL, betCount: e.count })),

      // Commission
      commission: commData,

      // Ledger (last 30)
      ledger,

      // Recent transactions (last 30)
      recentTransactions,

      // Login history
      loginActivity,

      // IP reputation
      ipReputation: ipUsers,
    });
  } catch (err) {
    console.error("getUserAnalytics error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

module.exports = { getUserAnalytics };
