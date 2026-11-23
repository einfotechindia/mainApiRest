const UserModel = require("../../Models/User/User.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { UpdateUserCoins } = require("../../Helpers/TransactionHelper");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// ======================== CLIENT BONUS ========================
async function CreditBonus(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const { clientId, amount, reason } = req.body;
    if (!clientId || !amount || amount <= 0) return SendResponse(res, "error", "clientId and positive amount required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");
    const parentData = await UserModel.find({ userId: cl.creatorId });
    await UpdateUserCoins(amount, cl._id, parentData, reason || "Manual bonus by agent");
    return SendResponse(res, "success", `Bonus of ${amount} credited to ${cl.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT FREEZE ========================
async function FreezeClient(req, res) {
  try {
    const { clientId, minutes, reason } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");

    await UserModel.updateOne({ _id: cl._id }, { status: 0, betStatus: false, notes: `Frozen: ${reason || "No reason"} | Auto-unfreeze: ${minutes ? minutes + "min" : "manual"}` });

    // Auto-unfreeze after X minutes
    if (minutes && minutes > 0) {
      setTimeout(async () => {
        try { await UserModel.updateOne({ _id: cl._id }, { status: 1, betStatus: true, notes: "" }); } catch {}
      }, minutes * 60 * 1000);
    }

    return SendResponse(res, "success", `${cl.username} frozen${minutes ? ` for ${minutes} minutes` : ""}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function UnfreezeClient(req, res) {
  try {
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");
    await UserModel.updateOne({ _id: new ObjectId(clientId) }, { status: 1, betStatus: true, notes: "" });
    return SendResponse(res, "success", "Client unfrozen");
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT TRANSFER ========================
async function TransferClient(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const { clientId, toAgentId } = req.body;
    if (!clientId || !toAgentId) return SendResponse(res, "error", "clientId and toAgentId required");

    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");

    const toAgent = await UserModel.findOne({ _id: new ObjectId(toAgentId), userType: "agent", isDeleted: false });
    if (!toAgent) return SendResponse(res, "error", "Target agent not found");

    await UserModel.updateOne({ _id: cl._id }, {
      agentId: toAgent._id,
      superagentId: toAgent.superagentId,
      masterId: toAgent.masterId,
      subadminId: toAgent.subadminId,
      adminId: toAgent.adminId,
      superadminId: toAgent.superadminId,
      subownerId: toAgent.subownerId,
      ownerId: toAgent.ownerId,
      creatorId: toAgent._id,
    });

    return SendResponse(res, "success", `${cl.username} transferred to ${toAgent.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== SETTLEMENT ========================
async function GetSettlement(req, res) {
  try {
    const { clientId, fromDate, toDate } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");

    const dateFilter = {};
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      dateFilter.createdAt = { $gte: from, $lte: to };
    }

    const transactions = await CrickTransactionLogModel.find({
      clientId: new ObjectId(clientId),
      $or: [{ transactionType: "ledger" }, { transactionType: "profitLoss" }, { transactionType: "depositWithdrawal" }],
      ...dateFilter,
    }).select("amount transactionType gameName remarks createdAt isCash").sort({ createdAt: -1 }).limit(200).lean();

    const summary = await CrickTransactionLogModel.aggregate([
      { $match: { clientId: new ObjectId(clientId), ...dateFilter } },
      { $group: {
        _id: "$transactionType",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      }},
    ]);

    return SendResponse(res, "success", "Settlement data fetched", { transactions, summary });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== COMMISSION REPORT ========================
async function CommissionReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { fromDate, toDate } = req.body;

    const dateFilter = {};
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      dateFilter.createdAt = { $gte: from, $lte: to };
    }

    const commission = await CrickTransactionLogModel.aggregate([
      { $match: { agentId: new ObjectId(agentId), transactionType: "profitLoss", ...dateFilter } },
      { $group: {
        _id: "$gameType",
        agentPL: { $sum: "$agentProfitLoss" },
        clientPL: { $sum: "$clientProfitLoss" },
        count: { $sum: 1 },
      }},
      { $sort: { agentPL: -1 } },
    ]);

    const overall = {
      agentPL: commission.reduce((s, c) => s + c.agentPL, 0),
      clientPL: commission.reduce((s, c) => s + c.clientPL, 0),
      totalBets: commission.reduce((s, c) => s + c.count, 0),
    };

    return SendResponse(res, "success", "Commission report fetched", { breakdown: commission, overall });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TRANSACTION LOG ========================
async function TransactionLog(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { clientId, fromDate, toDate, transactionType, pageNo, size: pageSize } = req.body;

    const where = {};
    if (clientId) where.clientId = new ObjectId(clientId);
    else if (agentId) where.agentId = new ObjectId(agentId);
    if (transactionType) where.transactionType = transactionType;
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      where.createdAt = { $gte: from, $lte: to };
    }

    const page = pageNo || 1;
    const sz = pageSize || 50;

    const [list, total] = await Promise.all([
      CrickTransactionLogModel.find(where)
        .select("amount transactionType gameType gameName eventName remarks createdAt userId userType isCash clientProfitLoss agentProfitLoss")
        .sort({ createdAt: -1 }).skip((page-1)*sz).limit(sz).lean(),
      CrickTransactionLogModel.countDocuments(where),
    ]);

    return SendResponse(res, "success", "Transaction log fetched", { list, total, page, size: sz });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== BET LIST ========================
async function BetList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { clientId, fromDate, toDate, marketType, pageNo, size: pageSize } = req.body;

    const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");

    const where = {};
    if (clientId) where.userId = new ObjectId(clientId);
    else if (agentId) where.agentId = new ObjectId(agentId);
    if (marketType) where.marketType = marketType;
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      where.createdAt = { $gte: from, $lte: to };
    }

    const page = pageNo || 1;
    const sz = pageSize || 50;

    const [list, total] = await Promise.all([
      OddsBetsListModel.find(where)
        .select("matchName eventName marketType selectionName amount rate betType result profit createdAt userId")
        .sort({ createdAt: -1 }).skip((page-1)*sz).limit(sz).lean(),
      OddsBetsListModel.countDocuments(where),
    ]);

    // Lookup user names
    const userIds = [...new Set(list.map(b => b.userId?.toString()))].filter(Boolean);
    const users = await UserModel.find({ _id: { $in: userIds.map(id => new ObjectId(id)) } }).select("name username").lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = { name: u.name, username: u.username }; });

    const enriched = list.map(b => ({ ...b, clientName: userMap[b.userId?.toString()]?.name, clientUsername: userMap[b.userId?.toString()]?.username }));

    return SendResponse(res, "success", "Bet list fetched", { list: enriched, total, page, size: sz });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== DAILY P&L REPORT ========================
async function DailyPLReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { fromDate, toDate } = req.body;

    const from = new Date(fromDate || new Date(Date.now() - 7*86400000).toISOString().split("T")[0]);
    from.setHours(0,0,0,0);
    const to = new Date(toDate || new Date().toISOString().split("T")[0]);
    to.setHours(23,59,59,999);

    const daily = await CrickTransactionLogModel.aggregate([
      { $match: { agentId: new ObjectId(agentId), transactionType: "profitLoss", createdAt: { $gte: from, $lte: to } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
        agentPL: { $sum: "$agentProfitLoss" },
        clientPL: { $sum: "$clientProfitLoss" },
        bets: { $sum: 1 },
      }},
      { $sort: { _id: -1 } },
    ]);

    return SendResponse(res, "success", "Daily P&L fetched", daily);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT RETENTION ========================
async function ClientRetention(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const agentFilter = agentId ? { agentId: new ObjectId(agentId) } : {};

    const now = new Date();
    const [total, active7, active30, active90, neverLogin, zeroBalance] = await Promise.all([
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: { $gte: new Date(now - 7*86400000) } }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: { $gte: new Date(now - 30*86400000) } }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: { $gte: new Date(now - 90*86400000) } }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: null }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, coins: 0 }),
    ]);

    return SendResponse(res, "success", "Retention data fetched", {
      total, active7d: active7, active30d: active30, active90d: active90,
      neverLogin, zeroBalance,
      inactive7d: total - active7, inactive30d: total - active30,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = { CreditBonus, FreezeClient, UnfreezeClient, TransferClient, GetSettlement, CommissionReport, TransactionLog, BetList, DailyPLReport, ClientRetention };
