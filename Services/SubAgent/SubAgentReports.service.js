const SubAgentModel = require("../../Models/SubAgent/SubAgent.model");
const SubAgentActivityModel = require("../../Models/SubAgent/SubAgentActivity.model");
const CommissionLogModel = require("../../Models/SubAgent/CommissionLog.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const UserModel = require("../../Models/User/User.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetsListModel = require("../../Models/BetsList/FancyBetsList.model");
const CasinoBetsListModel = require("../../Models/BetsList/CasinoBetsList.model");
const IntCasinoBetsListModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const LoginActivityModel = require("../../Models/LoginActivity.model");
const PaymentAccountModel = require("../../Models/PaymentAccount.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const {_d , _dx} = require("../../Helpers/CommonHelper")
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const ABOVE_AGENT = ["owner", "subowner", "superadmin", "admin", "subadmin", "master", "superagent"];

function resolveAgentId(req) {
  const loginUser = req.loggedInUser;
  if (ABOVE_AGENT.includes(loginUser.userType)) {
    return req.body?._selectedAgentId || null;
  }
  return loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId;
}

function buildDateFilter(fromDate, toDate) {
  if (!fromDate || !toDate) return {};
  const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
  const to = new Date(toDate); to.setHours(23, 59, 59, 999);
  return { createdAt: { $gte: from, $lte: to } };
}

// When logged-in user is a subagent, get only their client IDs
async function getSubagentClientIds(loginUser) {
  if (loginUser.userType !== "subagent") return null; // null = no filter (show all)
  const clients = await UserModel.find({ subagentId: new ObjectId(loginUser.userId), userType: "client", isDeleted: false }).select("_id").lean();
  return clients.map(c => c._id);
}

// Build client filter for User queries - adds subagentId filter for subagents
function addSubagentFilter(baseFilter, loginUser) {
  if (loginUser.userType === "subagent") {
    baseFilter.subagentId = new ObjectId(loginUser.userId);
  }
  return baseFilter;
}

// ======================== OVERVIEW REPORT ========================
async function OverviewReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { subAgentId, fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    // For subagent login, get their client IDs to scope all data
    const subagentClientIds = await getSubagentClientIds(loginUser);

    // Build base filter for D/W
    const dwFilter = { agentId: new ObjectId(agentId) };
    if (subAgentId) dwFilter.approveUserId = new ObjectId(subAgentId);
    if (subagentClientIds) dwFilter.userId = { $in: subagentClientIds };
    if (dateFilter.createdAt) dwFilter.createdAt = dateFilter.createdAt;

    // Build client filter
    const clientFilter = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);

    // Today boundaries
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const [
      dwSummary,
      totalClients,
      activeClients,
      newClientsToday,
      referralClients,
      commissionSummary,
      subAgentCount,
    ] = await Promise.all([
      // D/W Summary
      DepositWithdrawModel.aggregate([
        { $match: dwFilter },
        {
          $group: {
            _id: null,
            totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            totalDepositCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, 1, 0] } },
            totalWithdrawCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, 1, 0] } },
            pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          },
        },
      ]),
      // Total clients
      UserModel.countDocuments(clientFilter),
      // Active clients
      UserModel.countDocuments({ ...clientFilter, status: 1 }),
      // New clients today
      UserModel.countDocuments({ ...clientFilter, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      // Referral clients (clients who have a referral code source)
      UserModel.countDocuments({ ...clientFilter, referralCode: { $ne: null, $ne: "" } }),
      // Commission summary
      CommissionLogModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), ...(subAgentId ? { subAgentId: new ObjectId(subAgentId) } : {}), ...(loginUser.userType === "subagent" ? { subAgentId: new ObjectId(loginUser.userId) } : {}), ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
        {
          $group: {
            _id: null,
            totalCommission: { $sum: "$amount" },
            pendingCommission: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
            settledCommission: { $sum: { $cond: [{ $eq: ["$status", "settled"] }, "$amount", 0] } },
            paidCommission: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
          },
        },
      ]),
      // SubAgent count
      SubAgentModel.countDocuments({ agentId: new ObjectId(agentId), isDeleted: false }),
    ]);

    const dw = dwSummary[0] || { totalDeposit: 0, totalWithdraw: 0, pendingDeposit: 0, pendingWithdraw: 0, totalDepositCount: 0, totalWithdrawCount: 0, pendingCount: 0 };
    const comm = commissionSummary[0] || { totalCommission: 0, pendingCommission: 0, settledCommission: 0, paidCommission: 0 };

    return SendResponse(res, "success", "Overview fetched", {
      deposit: { total: dw.totalDeposit, count: dw.totalDepositCount, pending: dw.pendingDeposit },
      withdraw: { total: dw.totalWithdraw, count: dw.totalWithdrawCount, pending: dw.pendingWithdraw },
      net: dw.totalDeposit - dw.totalWithdraw,
      pendingCount: dw.pendingCount,
      clients: { total: totalClients, active: activeClients, inactive: totalClients - activeClients, newToday: newClientsToday, referral: referralClients },
      commission: comm,
      subAgentCount,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SUBAGENT D/W REPORT ========================
async function DWSummaryReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

   // _d(loginUser , "loginUser")
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    const subagentClientIds = await getSubagentClientIds(loginUser);

    // _d(subagentClientIds , "subagentClientIds")

    const matchStage = { agentId: new ObjectId(agentId), status: "accept" };
    if (subagentClientIds) matchStage.userId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    // Get all subagents for this agent
    const subAgents = await SubAgentModel.find({ agentId: new ObjectId(agentId), isDeleted: false }).select("name username _id").lean();
    const subAgentIds = subAgents.map(s => s._id);


    let match = { ...matchStage, approveUserId: { $in: subAgentIds } }

    if (loginUser.userType == "subagent") {
      match = { subagentId: new ObjectId(loginUser.userId) }
      if (dateFilter.createdAt) match.createdAt = dateFilter.createdAt;
    }
    
    // D/W grouped by approveUserId (who approved it - the subagent)
    const dwBySubAgent = await DepositWithdrawModel.aggregate([
      { $match:  match},
      {
        $group: {
          _id: "$approveUserId",
          totalDeposit: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$reqType", "deposit"] },
                      { $eq: ["$status", "accept"] }
                    ]
                  },
                  "$amount",
                  0
                ]
              }
            },
          totalWithdraw: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
      { $sort: { totalDeposit: -1 } },
    ]);

    // Datewise D/W
    const datewise = await DepositWithdrawModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
          deposit: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } },
          withdraw: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    // Map subagent names
    const subAgentMap = {};
    subAgents.forEach(s => { subAgentMap[s._id.toString()] = { name: s.name, username: s.username }; });

    const subAgentWise = dwBySubAgent.map(d => ({
      subAgentId: d._id,
      name: subAgentMap[d._id?.toString()]?.name || "Agent (Self)",
      username: subAgentMap[d._id?.toString()]?.username || "-",
      totalDeposit: d.totalDeposit,
      totalWithdraw: d.totalWithdraw,
      net: d.totalDeposit - d.totalWithdraw,
      depositCount: d.depositCount,
      withdrawCount: d.withdrawCount,
    }));

    return SendResponse(res, "success", "D/W summary fetched", { subAgentWise, datewise });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CLIENT SUMMARY REPORT ========================
async function ClientSummaryReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { subAgentId } = req.body;
    const clientFilter = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);
    if (subAgentId && loginUser.userType !== "subagent") clientFilter.creatorId = new ObjectId(subAgentId);

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0, 0, 0, 0);
    const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30); monthAgo.setHours(0, 0, 0, 0);

    const [
      totalClients,
      activeClients,
      newToday,
      newThisWeek,
      newThisMonth,
      referralClients,
      topByBalance,
      topByExposure,
      clientsBySubAgent,
      statusBreakdown,
    ] = await Promise.all([
      UserModel.countDocuments(clientFilter),
      UserModel.countDocuments({ ...clientFilter, status: 1 }),
      UserModel.countDocuments({ ...clientFilter, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      UserModel.countDocuments({ ...clientFilter, createdAt: { $gte: weekAgo } }),
      UserModel.countDocuments({ ...clientFilter, createdAt: { $gte: monthAgo } }),
      UserModel.countDocuments({ ...clientFilter, referralCode: { $exists: true, $ne: null, $ne: "" } }),
      UserModel.find(clientFilter).select("name username coins exposure").sort({ coins: -1 }).limit(10).lean(),
      UserModel.find({ ...clientFilter, exposure: { $lt: 0 } }).select("name username coins exposure").sort({ exposure: 1 }).limit(10).lean(),
      // Clients grouped by creator (subagent who created them)
      UserModel.aggregate([
        { $match: clientFilter },
        { $group: { _id: "$creatorId", count: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      // Status breakdown
      UserModel.aggregate([
        { $match: clientFilter },
        {
          $group: {
            _id: null,
            betEnabled: { $sum: { $cond: [{ $eq: ["$betStatus", true] }, 1, 0] } },
            betDisabled: { $sum: { $cond: [{ $eq: ["$betStatus", false] }, 1, 0] } },
            casinoEnabled: { $sum: { $cond: [{ $eq: ["$casinoStatus", true] }, 1, 0] } },
            matkaEnabled: { $sum: { $cond: [{ $eq: ["$matkaStatus", true] }, 1, 0] } },
            positiveBalance: { $sum: { $cond: [{ $gt: ["$coins", 0] }, 1, 0] } },
            zeroBalance: { $sum: { $cond: [{ $eq: ["$coins", 0] }, 1, 0] } },
            negativeExposure: { $sum: { $cond: [{ $lt: ["$exposure", 0] }, 1, 0] } },
          },
        },
      ]),
    ]);

    // Map creator names
    const creatorIds = clientsBySubAgent.map(c => c._id).filter(Boolean);
    const creators = await SubAgentModel.find({ _id: { $in: creatorIds } }).select("name username").lean();
    // Also check if agent created some clients directly
    const agentUser = await UserModel.findOne({ _id: new ObjectId(agentId) }).select("name username").lean();

    const creatorMap = {};
    creators.forEach(c => { creatorMap[c._id.toString()] = { name: c.name, username: c.username }; });
    if (agentUser) creatorMap[agentUser._id.toString()] = { name: agentUser.name, username: agentUser.username };

    const bySubAgent = clientsBySubAgent.map(c => ({
      creatorId: c._id,
      name: creatorMap[c._id?.toString()]?.name || "Unknown",
      username: creatorMap[c._id?.toString()]?.username || "-",
      totalClients: c.count,
      activeClients: c.activeCount,
    }));

    return SendResponse(res, "success", "Client summary fetched", {
      counts: { total: totalClients, active: activeClients, inactive: totalClients - activeClients, newToday, newThisWeek, newThisMonth, referral: referralClients },
      topByBalance,
      topByExposure,
      bySubAgent,
      statusBreakdown: statusBreakdown[0] || {},
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== COMMISSION SUMMARY REPORT ========================
async function CommissionSummaryReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    const matchStage = { agentId: new ObjectId(agentId) };
    if (loginUser.userType === "subagent") matchStage.subAgentId = new ObjectId(loginUser.userId);
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [bySubAgent, byType, datewise, summary] = await Promise.all([
      // Commission by subagent
      CommissionLogModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$subAgentId",
            subAgentUsername: { $first: "$subAgentUsername" },
            totalAmount: { $sum: "$amount" },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
            settled: { $sum: { $cond: [{ $eq: ["$status", "settled"] }, "$amount", 0] } },
            paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),
      // Commission by type (registration, turnover, loss)
      CommissionLogModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      // Datewise commission
      CommissionLogModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
      ]),
      // Overall summary
      CommissionLogModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
            settled: { $sum: { $cond: [{ $eq: ["$status", "settled"] }, "$amount", 0] } },
            paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Get subagent names
    const subIds = bySubAgent.map(s => s._id).filter(Boolean);
    const subAgents = await SubAgentModel.find({ _id: { $in: subIds } }).select("name username").lean();
    const nameMap = {};
    subAgents.forEach(s => { nameMap[s._id.toString()] = s.name; });

    const subAgentWise = bySubAgent.map(s => ({
      ...s,
      name: nameMap[s._id?.toString()] || s.subAgentUsername || "Unknown",
    }));

    return SendResponse(res, "success", "Commission summary fetched", {
      summary: summary[0] || { total: 0, pending: 0, settled: 0, paid: 0, count: 0 },
      bySubAgent: subAgentWise,
      byType,
      datewise,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== PERFORMANCE REPORT ========================
async function PerformanceReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    const subagentClientIds = await getSubagentClientIds(loginUser);

    const activityMatch = { agentId: new ObjectId(agentId) };
    if (loginUser.userType === "subagent") activityMatch.subAgentId = new ObjectId(loginUser.userId);
    if (dateFilter.createdAt) activityMatch.createdAt = dateFilter.createdAt;

    const dwMatch = { agentId: new ObjectId(agentId) };
    if (subagentClientIds) dwMatch.userId = { $in: subagentClientIds };
    if (dateFilter.createdAt) dwMatch.createdAt = dateFilter.createdAt;

    const [activityBySubAgent, dwApprovalStats, activityByCategory, activityByDate] = await Promise.all([
      // Activity count per subagent
      SubAgentActivityModel.aggregate([
        { $match: activityMatch },
        {
          $group: {
            _id: "$subAgentId",
            subAgentName: { $first: "$subAgentName" },
            subAgentUsername: { $first: "$subAgentUsername" },
            totalActions: { $sum: 1 },
            logins: { $sum: { $cond: [{ $eq: ["$action", "login"] }, 1, 0] } },
            depositsApproved: { $sum: { $cond: [{ $eq: ["$action", "deposit_approve"] }, 1, 0] } },
            depositsRejected: { $sum: { $cond: [{ $eq: ["$action", "deposit_reject"] }, 1, 0] } },
            withdrawsApproved: { $sum: { $cond: [{ $eq: ["$action", "withdraw_approve"] }, 1, 0] } },
            withdrawsRejected: { $sum: { $cond: [{ $eq: ["$action", "withdraw_reject"] }, 1, 0] } },
            clientUpdates: { $sum: { $cond: [{ $eq: ["$category", "client"] }, 1, 0] } },
          },
        },
        { $sort: { totalActions: -1 } },
      ]),
      // D/W approval/rejection counts
      DepositWithdrawModel.aggregate([
        { $match: dwMatch },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ["$status", "reject"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancel"] }, 1, 0] } },
          },
        },
      ]),
      // Activity by category
      SubAgentActivityModel.aggregate([
        { $match: activityMatch },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Activity by date
      SubAgentActivityModel.aggregate([
        { $match: activityMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            actions: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    // Calculate approval rate
    const dw = dwApprovalStats[0] || { totalRequests: 0, approved: 0, rejected: 0, pending: 0, cancelled: 0 };
    const processed = dw.approved + dw.rejected;
    const approvalRate = processed > 0 ? Math.round((dw.approved / processed) * 100) : 0;

    return SendResponse(res, "success", "Performance report fetched", {
      subAgentWise: activityBySubAgent,
      dwStats: { ...dw, approvalRate },
      activityByCategory,
      activityByDate,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SUBAGENT LIST WITH STATS ========================
async function SubAgentListStats(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    // Get subagents (scoped to self if subagent login)
    const subAgentQuery = { agentId: new ObjectId(agentId), isDeleted: false };
    if (loginUser.userType === "subagent") subAgentQuery._id = new ObjectId(loginUser.userId);
    const subAgents = await SubAgentModel.find(subAgentQuery)
      .select("name username roleName status referralCode lastLoginTime createdAt")
      .sort({ createdAt: -1 })
      .lean();

    if (subAgents.length === 0) {
      return SendResponse(res, "success", "No subagents found", { list: [] });
    }

    const subAgentIds = subAgents.map(s => s._id);

    const dwDateMatch = dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {};

    // Get stats in parallel
    const [dwStats, clientCounts, commissionStats, activityCounts] = await Promise.all([
      // D/W handled by each subagent
      DepositWithdrawModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), approveUserId: { $in: subAgentIds }, status: "accept", ...dwDateMatch } },
        {
          $group: {
            _id: "$approveUserId",
            deposits: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } },
            withdraws: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
            depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
            withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
          },
        },
      ]),
      // Clients created by each subagent
      UserModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), userType: "client", isDeleted: false, creatorId: { $in: subAgentIds } } },
        { $group: { _id: "$creatorId", clientCount: { $sum: 1 }, activeCount: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } } } },
      ]),
      // Commission earned
      CommissionLogModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), subAgentId: { $in: subAgentIds }, ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
        { $group: { _id: "$subAgentId", totalCommission: { $sum: "$amount" }, pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } } } },
      ]),
      // Activity count
      SubAgentActivityModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), subAgentId: { $in: subAgentIds }, ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
        { $group: { _id: "$subAgentId", actionCount: { $sum: 1 } } },
      ]),
    ]);

    // Build maps
    const dwMap = {}; dwStats.forEach(d => { dwMap[d._id?.toString()] = d; });
    const clientMap = {}; clientCounts.forEach(c => { clientMap[c._id?.toString()] = c; });
    const commMap = {}; commissionStats.forEach(c => { commMap[c._id?.toString()] = c; });
    const actMap = {}; activityCounts.forEach(a => { actMap[a._id?.toString()] = a; });

    const list = subAgents.map(s => {
      const id = s._id.toString();
      const dw = dwMap[id] || {};
      const cl = clientMap[id] || {};
      const cm = commMap[id] || {};
      const ac = actMap[id] || {};

      return {
        _id: s._id,
        name: s.name,
        username: s.username,
        roleName: s.roleName,
        status: s.status,
        referralCode: s.referralCode,
        lastLoginTime: s.lastLoginTime,
        createdAt: s.createdAt,
        deposits: dw.deposits || 0,
        withdraws: dw.withdraws || 0,
        depositCount: dw.depositCount || 0,
        withdrawCount: dw.withdrawCount || 0,
        net: (dw.deposits || 0) - (dw.withdraws || 0),
        clientCount: cl.clientCount || 0,
        activeClientCount: cl.activeCount || 0,
        totalCommission: cm.totalCommission || 0,
        pendingCommission: cm.pending || 0,
        actionCount: ac.actionCount || 0,
      };
    });

    return SendResponse(res, "success", "SubAgent stats fetched", { list });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== BETTING REPORT ========================
async function BettingReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate, subAgentId } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const agentMatch = { agentId: new ObjectId(agentId) };
    if (dateFilter.createdAt) agentMatch.createdAt = dateFilter.createdAt;

    // If subAgentId or logged in as subagent, get only their clients
    let clientIds = await getSubagentClientIds(loginUser);
    if (!clientIds && subAgentId) {
      const clients = await UserModel.find({ creatorId: new ObjectId(subAgentId), userType: "client", isDeleted: false }).select("_id").lean();
      clientIds = clients.map(c => c._id);
    }

    const clientMatch = clientIds ? { clientId: { $in: clientIds } } : {};

    const [oddsBets, fancyBets, casinoBets, intCasinoBets] = await Promise.all([
      OddsBetsListModel.aggregate([
        { $match: { ...agentMatch, ...clientMatch, isDeleted: 0 } },
        { $group: { _id: null, totalBets: { $sum: 1 }, totalAmount: { $sum: "$amount" }, totalProfit: { $sum: "$profit" }, totalLoss: { $sum: "$loss" }, declared: { $sum: { $cond: [{ $eq: ["$isDeclare", 1] }, 1, 0] } }, undeclared: { $sum: { $cond: [{ $eq: ["$isDeclare", 0] }, 1, 0] } } } },
      ]),
      FancyBetsListModel.aggregate([
        { $match: { ...agentMatch, ...clientMatch, isDeleted: 0 } },
        { $group: { _id: null, totalBets: { $sum: 1 }, totalAmount: { $sum: "$amount" }, totalProfit: { $sum: "$profit" }, totalLoss: { $sum: "$loss" }, declared: { $sum: { $cond: [{ $eq: ["$isDeclare", 1] }, 1, 0] } } } },
      ]),
      CasinoBetsListModel.aggregate([
        { $match: { ...agentMatch, ...clientMatch, isDeleted: false } },
        { $group: { _id: null, totalBets: { $sum: 1 }, totalAmount: { $sum: "$amount" }, totalProfit: { $sum: "$profit" }, totalLoss: { $sum: "$loss" } } },
      ]),
      IntCasinoBetsListModel.aggregate([
        { $match: { ...agentMatch, ...clientMatch, isDeleted: false } },
        { $group: { _id: null, totalBets: { $sum: 1 }, totalAmount: { $sum: { $ifNull: ["$actualBetAmount", "$amount"] } }, totalPL: { $sum: "$profitLoss" } } },
      ]),
    ]);

    // Datewise betting trend (odds)
    const datewiseBets = await OddsBetsListModel.aggregate([
      { $match: { ...agentMatch, ...clientMatch, isDeleted: 0 } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, bets: { $sum: 1 }, amount: { $sum: "$amount" } } },
      { $sort: { _id: -1 } }, { $limit: 30 },
    ]);

    return SendResponse(res, "success", "Betting report fetched", {
      odds: oddsBets[0] || { totalBets: 0, totalAmount: 0, totalProfit: 0, totalLoss: 0, declared: 0, undeclared: 0 },
      fancy: fancyBets[0] || { totalBets: 0, totalAmount: 0, totalProfit: 0, totalLoss: 0, declared: 0 },
      casino: casinoBets[0] || { totalBets: 0, totalAmount: 0, totalProfit: 0, totalLoss: 0 },
      intCasino: intCasinoBets[0] || { totalBets: 0, totalAmount: 0, totalPL: 0 },
      datewiseBets,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== P&L REPORT ========================
async function PLReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const matchStage = { agentId: new ObjectId(agentId), transactionType: "profitLoss" };
    if (subagentClientIds) matchStage.clientId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [datewise, byGameType, byClient, summary] = await Promise.all([
      CrickTransactionLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, agentPL: { $sum: "$agentProfitLoss" }, clientPL: { $sum: "$clientProfitLoss" }, bets: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
      CrickTransactionLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$gameType", agentPL: { $sum: "$agentProfitLoss" }, clientPL: { $sum: "$clientProfitLoss" }, count: { $sum: 1 } } },
        { $sort: { agentPL: -1 } },
      ]),
      CrickTransactionLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$clientId", agentPL: { $sum: "$agentProfitLoss" }, clientPL: { $sum: "$clientProfitLoss" }, count: { $sum: 1 } } },
        { $sort: { clientPL: 1 } }, { $limit: 20 },
      ]),
      CrickTransactionLogModel.aggregate([
        { $match: matchStage },
        { $group: { _id: null, agentPL: { $sum: "$agentProfitLoss" }, clientPL: { $sum: "$clientProfitLoss" }, count: { $sum: 1 } } },
      ]),
    ]);

    // Enrich client names
    const clientIds = byClient.map(c => c._id).filter(Boolean);
    const users = await UserModel.find({ _id: { $in: clientIds } }).select("name username").lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = { name: u.name, username: u.username }; });
    const clientWise = byClient.map(c => ({ ...c, name: userMap[c._id?.toString()]?.name || "Unknown", username: userMap[c._id?.toString()]?.username || "-" }));

    return SendResponse(res, "success", "P&L report fetched", {
      summary: summary[0] || { agentPL: 0, clientPL: 0, count: 0 },
      datewise, byGameType, clientWise,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CASINO REPORT (SubAgent) ========================
async function SubAgentCasinoReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const matchStage = { agentId: new ObjectId(agentId) };
    if (subagentClientIds) matchStage.clientId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [diamondByGame, intByProvider, intByGame, diamondDatewise] = await Promise.all([
      CasinoBetsListModel.aggregate([
        { $match: { ...matchStage, isDeleted: false } },
        { $group: { _id: "$casinoType", bets: { $sum: 1 }, amount: { $sum: "$amount" }, profit: { $sum: "$profit" }, loss: { $sum: "$loss" } } },
        { $sort: { bets: -1 } },
      ]),
      IntCasinoBetsListModel.aggregate([
        { $match: { ...matchStage, isDeleted: false } },
        { $group: { _id: "$providerName", bets: { $sum: 1 }, amount: { $sum: { $ifNull: ["$actualBetAmount", "$amount"] } }, pl: { $sum: "$profitLoss" } } },
        { $sort: { bets: -1 } },
      ]),
      IntCasinoBetsListModel.aggregate([
        { $match: { ...matchStage, isDeleted: false } },
        { $group: { _id: "$gameName", provider: { $first: "$providerName" }, bets: { $sum: 1 }, amount: { $sum: { $ifNull: ["$actualBetAmount", "$amount"] } }, pl: { $sum: "$profitLoss" } } },
        { $sort: { bets: -1 } }, { $limit: 20 },
      ]),
      CasinoBetsListModel.aggregate([
        { $match: { ...matchStage, isDeleted: false } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, bets: { $sum: 1 }, amount: { $sum: "$amount" }, profit: { $sum: "$profit" }, loss: { $sum: "$loss" } } },
        { $sort: { _id: -1 } }, { $limit: 30 },
      ]),
    ]);

    return SendResponse(res, "success", "Casino report fetched", { diamondByGame, intByProvider, intByGame, diamondDatewise });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== FANCY REPORT (SubAgent) ========================
async function SubAgentFancyReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const matchStage = { agentId: new ObjectId(agentId), isDeleted: 0 };
    if (subagentClientIds) matchStage.clientId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [summary, byEvent, byType, datewise] = await Promise.all([
      FancyBetsListModel.aggregate([
        { $match: matchStage },
        { $group: { _id: null, totalBets: { $sum: 1 }, totalAmount: { $sum: "$amount" }, totalProfit: { $sum: "$profit" }, totalLoss: { $sum: "$loss" }, declared: { $sum: { $cond: [{ $eq: ["$isDeclare", 1] }, 1, 0] } }, undeclared: { $sum: { $cond: [{ $eq: ["$isDeclare", 0] }, 1, 0] } } } },
      ]),
      FancyBetsListModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$eventId", sessionName: { $first: "$sessionName" }, bets: { $sum: 1 }, amount: { $sum: "$amount" }, profit: { $sum: "$profit" }, loss: { $sum: "$loss" } } },
        { $sort: { bets: -1 } }, { $limit: 20 },
      ]),
      FancyBetsListModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$fancyType", bets: { $sum: 1 }, amount: { $sum: "$amount" }, profit: { $sum: "$profit" }, loss: { $sum: "$loss" } } },
        { $sort: { bets: -1 } },
      ]),
      FancyBetsListModel.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, bets: { $sum: 1 }, amount: { $sum: "$amount" } } },
        { $sort: { _id: -1 } }, { $limit: 30 },
      ]),
    ]);

    return SendResponse(res, "success", "Fancy report fetched", {
      summary: summary[0] || { totalBets: 0, totalAmount: 0, totalProfit: 0, totalLoss: 0, declared: 0, undeclared: 0 },
      byEvent, byType, datewise,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT LOGIN REPORT ========================
async function ClientLoginReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    // Get clients (scoped to subagent if applicable)
    const clientQuery = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);
    const clients = await UserModel.find(clientQuery)
      .select("_id name username lastLoginTime status").lean();
    const clientIds = clients.map(c => c._id);

    const loginMatch = { userId: { $in: clientIds } };
    if (dateFilter.createdAt) loginMatch.createdAt = dateFilter.createdAt;

    const [loginsByClient, loginsByDate, recentLogins] = await Promise.all([
      LoginActivityModel.aggregate([
        { $match: loginMatch },
        { $group: { _id: "$userId", count: { $sum: 1 }, lastLogin: { $max: "$createdAt" }, lastIp: { $last: "$ip" }, cities: { $addToSet: "$city" } } },
        { $sort: { count: -1 } },
      ]),
      LoginActivityModel.aggregate([
        { $match: loginMatch },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, logins: { $sum: 1 }, uniqueUsers: { $addToSet: "$userId" } } },
        { $addFields: { uniqueCount: { $size: "$uniqueUsers" } } },
        { $project: { uniqueUsers: 0 } },
        { $sort: { _id: -1 } }, { $limit: 30 },
      ]),
      LoginActivityModel.find(loginMatch).select("userId username ip city country createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    // Map client names
    const clientMap = {};
    clients.forEach(c => { clientMap[c._id.toString()] = { name: c.name, username: c.username, status: c.status }; });

    const byClient = loginsByClient.map(l => ({
      ...l,
      name: clientMap[l._id?.toString()]?.name || "Unknown",
      username: clientMap[l._id?.toString()]?.username || "-",
      status: clientMap[l._id?.toString()]?.status,
    }));

    // Never logged in clients
    const loggedInIds = new Set(loginsByClient.map(l => l._id?.toString()));
    const neverLoggedIn = clients.filter(c => !loggedInIds.has(c._id.toString()) && !c.lastLoginTime);

    return SendResponse(res, "success", "Client login report fetched", {
      byClient, loginsByDate, recentLogins, neverLoggedIn,
      summary: { totalClients: clients.length, loggedIn: loggedInIds.size, neverLoggedIn: neverLoggedIn.length },
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== DUPLICATE IP REPORT ========================
async function DuplicateIPReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const clientQuery = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);
    const clients = await UserModel.find(clientQuery).select("_id").lean();
    const clientIds = clients.map(c => c._id);

    const duplicateIPs = await LoginActivityModel.aggregate([
      { $match: { userId: { $in: clientIds }, ip: { $ne: null, $ne: "" } } },
      { $group: { _id: "$ip", users: { $addToSet: { userId: "$userId", username: "$username" } }, count: { $sum: 1 }, lastSeen: { $max: "$createdAt" }, city: { $first: "$city" }, country: { $first: "$country" } } },
      { $addFields: { userCount: { $size: "$users" } } },
      { $match: { userCount: { $gt: 1 } } },
      { $sort: { userCount: -1 } },
      { $limit: 50 },
    ]);

    return SendResponse(res, "success", "Duplicate IPs fetched", {
      list: duplicateIPs,
      totalDuplicateIPs: duplicateIPs.length,
      totalAffectedUsers: duplicateIPs.reduce((s, d) => s + d.userCount, 0),
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT BALANCE REPORT ========================
async function ClientBalanceReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { sortBy, order } = req.body;
    const sortField = sortBy || "coins";
    const sortOrder = order === "asc" ? 1 : -1;

    const clientQuery = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);

    const [clients, summary] = await Promise.all([
      UserModel.find(clientQuery)
        .select("name username coins exposure creditReference status betStatus createdAt lastLoginTime")
        .sort({ [sortField]: sortOrder }).lean(),
      UserModel.aggregate([
        { $match: clientQuery },
        { $group: {
          _id: null,
          totalBalance: { $sum: "$coins" },
          totalExposure: { $sum: "$exposure" },
          totalCreditRef: { $sum: "$creditReference" },
          positiveBalance: { $sum: { $cond: [{ $gt: ["$coins", 0] }, 1, 0] } },
          zeroBalance: { $sum: { $cond: [{ $eq: ["$coins", 0] }, 1, 0] } },
          negativeBalance: { $sum: { $cond: [{ $lt: ["$coins", 0] }, 1, 0] } },
          withExposure: { $sum: { $cond: [{ $lt: ["$exposure", 0] }, 1, 0] } },
          avgBalance: { $avg: "$coins" },
        }},
      ]),
    ]);

    return SendResponse(res, "success", "Client balance report fetched", {
      clients,
      summary: summary[0] || {},
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== PAYMENT METHOD REPORT ========================
async function PaymentMethodReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const matchStage = { agentId: new ObjectId(agentId), status: "accept" };
    if (subagentClientIds) matchStage.userId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [byMethod, byAccount] = await Promise.all([
      DepositWithdrawModel.aggregate([
        { $match: matchStage },
        { $group: {
          _id: "$paymentMethod",
          deposits: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } },
          withdrawals: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        }},
        { $sort: { deposits: -1 } },
      ]),
      DepositWithdrawModel.aggregate([
        { $match: { ...matchStage, paymentTypeId: { $ne: null } } },
        { $group: {
          _id: "$paymentTypeId",
          deposits: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } },
          withdrawals: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } },
          count: { $sum: 1 },
        }},
        { $sort: { deposits: -1 } },
      ]),
    ]);

    // Get account names
    const accIds = byAccount.map(a => a._id).filter(Boolean);
    const accounts = await PaymentAccountModel.find({ _id: { $in: accIds } }).select("accountName accountType bankName upiId").lean();
    const accMap = {};
    accounts.forEach(a => { accMap[a._id.toString()] = a; });
    const enrichedAccounts = byAccount.map(a => ({ ...a, account: accMap[a._id?.toString()] || {} }));

    return SendResponse(res, "success", "Payment method report fetched", { byMethod, byAccount: enrichedAccounts });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== UTR/TRANSACTION REPORT ========================
async function UTRReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate, status, reqType, pageNo, size } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const matchStage = { agentId: new ObjectId(agentId) };
    if (subagentClientIds) matchStage.userId = { $in: subagentClientIds };
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;
    if (status) matchStage.status = status;
    if (reqType) matchStage.reqType = reqType;

    const page = pageNo || 1;
    const sz = size || 50;

    const [list, total, summaryData] = await Promise.all([
      DepositWithdrawModel.find(matchStage)
        .select("name username amount utrNo reqType status paymentMethod remark approverDetails createdAt ip")
        .sort({ createdAt: -1 }).skip((page - 1) * sz).limit(sz).lean(),
      DepositWithdrawModel.countDocuments(matchStage),
      DepositWithdrawModel.aggregate([
        { $match: matchStage },
        { $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          accepted: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "reject"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancel"] }, 1, 0] } },
        }},
      ]),
    ]);

    return SendResponse(res, "success", "UTR report fetched", {
      list, total, page, size: sz,
      summary: summaryData[0] || { totalAmount: 0, accepted: 0, rejected: 0, pending: 0, cancelled: 0 },
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== SETTLEMENT REPORT ========================
async function SettlementReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    // Commission settlement by subagent
    const commMatch = { agentId: new ObjectId(agentId) };
    if (loginUser.userType === "subagent") commMatch.subAgentId = new ObjectId(loginUser.userId);
    if (dateFilter.createdAt) commMatch.createdAt = dateFilter.createdAt;

    const [byStatus, bySubAgent, timeline] = await Promise.all([
      CommissionLogModel.aggregate([
        { $match: commMatch },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      CommissionLogModel.aggregate([
        { $match: commMatch },
        { $group: {
          _id: "$subAgentId",
          subAgentUsername: { $first: "$subAgentUsername" },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] } },
          settled: { $sum: { $cond: [{ $eq: ["$status", "settled"] }, "$amount", 0] } },
          paid: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] } },
          total: { $sum: "$amount" },
        }},
        { $sort: { total: -1 } },
      ]),
      CommissionLogModel.aggregate([
        { $match: { ...commMatch, status: { $in: ["settled", "paid"] } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$settledAt", timezone: "Asia/Kolkata" } }, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } }, { $limit: 30 },
      ]),
    ]);

    // Enrich names
    const subIds = bySubAgent.map(s => s._id).filter(Boolean);
    const subs = await SubAgentModel.find({ _id: { $in: subIds } }).select("name").lean();
    const nameMap = {};
    subs.forEach(s => { nameMap[s._id.toString()] = s.name; });
    const enriched = bySubAgent.map(s => ({ ...s, name: nameMap[s._id?.toString()] || s.subAgentUsername || "Unknown" }));

    return SendResponse(res, "success", "Settlement report fetched", { byStatus, bySubAgent: enriched, timeline });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT GROWTH REPORT ========================
async function ClientGrowthReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const matchStage = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;

    const [daily, weekly, bySubAgent, cumulative] = await Promise.all([
      UserModel.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } }, { $limit: 90 },
      ]),
      UserModel.aggregate([
        { $match: matchStage },
        { $group: { _id: { $dateToString: { format: "%Y-W%V", date: "$createdAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } }, { $limit: 12 },
      ]),
      UserModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$creatorId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Running total
      UserModel.aggregate([
        { $match: addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser) },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Enrich creator names
    const creatorIds = bySubAgent.map(c => c._id).filter(Boolean);
    const creators = await SubAgentModel.find({ _id: { $in: creatorIds } }).select("name username").lean();
    const agentUser = await UserModel.findOne({ _id: new ObjectId(agentId) }).select("name username").lean();
    const cMap = {};
    creators.forEach(c => { cMap[c._id.toString()] = { name: c.name, username: c.username }; });
    if (agentUser) cMap[agentUser._id.toString()] = { name: agentUser.name, username: agentUser.username };
    const byCreator = bySubAgent.map(c => ({ ...c, name: cMap[c._id?.toString()]?.name || "Unknown", username: cMap[c._id?.toString()]?.username || "-" }));

    return SendResponse(res, "success", "Client growth report fetched", { daily, weekly, byCreator, monthly: cumulative });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TURNOVER REPORT ========================
async function TurnoverReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const subagentClientIds = await getSubagentClientIds(loginUser);
    const agentMatch = { agentId: new ObjectId(agentId), isDeleted: 0 };
    if (subagentClientIds) agentMatch.clientId = { $in: subagentClientIds };
    if (dateFilter.createdAt) agentMatch.createdAt = dateFilter.createdAt;

    const casinoMatch = { agentId: new ObjectId(agentId), isDeleted: false };
    if (subagentClientIds) casinoMatch.clientId = { $in: subagentClientIds };
    if (dateFilter.createdAt) casinoMatch.createdAt = dateFilter.createdAt;

    const [oddsTurnover, fancyTurnover, casinoTurnover, intCasinoTurnover, datewise] = await Promise.all([
      OddsBetsListModel.aggregate([
        { $match: agentMatch },
        { $group: { _id: null, turnover: { $sum: "$amount" }, bets: { $sum: 1 } } },
      ]),
      FancyBetsListModel.aggregate([
        { $match: agentMatch },
        { $group: { _id: null, turnover: { $sum: "$amount" }, bets: { $sum: 1 } } },
      ]),
      CasinoBetsListModel.aggregate([
        { $match: casinoMatch },
        { $group: { _id: null, turnover: { $sum: "$amount" }, bets: { $sum: 1 } } },
      ]),
      IntCasinoBetsListModel.aggregate([
        { $match: casinoMatch },
        { $group: { _id: null, turnover: { $sum: { $ifNull: ["$actualBetAmount", "$amount"] } }, bets: { $sum: 1 } } },
      ]),
      // Daily turnover across all types (odds as proxy)
      OddsBetsListModel.aggregate([
        { $match: agentMatch },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, turnover: { $sum: "$amount" }, bets: { $sum: 1 } } },
        { $sort: { _id: -1 } }, { $limit: 30 },
      ]),
    ]);

    const odds = oddsTurnover[0] || { turnover: 0, bets: 0 };
    const fancy = fancyTurnover[0] || { turnover: 0, bets: 0 };
    const casino = casinoTurnover[0] || { turnover: 0, bets: 0 };
    const intCasino = intCasinoTurnover[0] || { turnover: 0, bets: 0 };
    const totalTurnover = odds.turnover + fancy.turnover + casino.turnover + intCasino.turnover;

    return SendResponse(res, "success", "Turnover report fetched", {
      summary: { total: totalTurnover, totalBets: odds.bets + fancy.bets + casino.bets + intCasino.bets },
      breakdown: [
        { type: "Odds", turnover: odds.turnover, bets: odds.bets },
        { type: "Fancy", turnover: fancy.turnover, bets: fancy.bets },
        { type: "Diamond Casino", turnover: casino.turnover, bets: casino.bets },
        { type: "Int. Casino", turnover: intCasino.turnover, bets: intCasino.bets },
      ],
      datewise,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== SUBAGENT COMPARISON ========================
async function SubAgentComparison(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    const subAgentQuery = { agentId: new ObjectId(agentId), isDeleted: false };
    if (loginUser.userType === "subagent") subAgentQuery._id = new ObjectId(loginUser.userId);
    const subAgents = await SubAgentModel.find(subAgentQuery).select("name username referralCode status lastLoginTime").lean();
    if (!subAgents.length) return SendResponse(res, "success", "No subagents", { rankings: [] });

    const subIds = subAgents.map(s => s._id);
    const dwDate = dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {};

    const [dwStats, clientStats, commStats, actStats] = await Promise.all([
      DepositWithdrawModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), approveUserId: { $in: subIds }, status: "accept", ...dwDate } },
        { $group: { _id: "$approveUserId", deposits: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } }, withdrawals: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } }, txnCount: { $sum: 1 } } },
      ]),
      UserModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), userType: "client", isDeleted: false, creatorId: { $in: subIds } } },
        { $group: { _id: "$creatorId", clients: { $sum: 1 }, activeClients: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } } } },
      ]),
      CommissionLogModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), subAgentId: { $in: subIds }, ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
        { $group: { _id: "$subAgentId", commission: { $sum: "$amount" } } },
      ]),
      SubAgentActivityModel.aggregate([
        { $match: { agentId: new ObjectId(agentId), subAgentId: { $in: subIds }, ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}) } },
        { $group: { _id: "$subAgentId", actions: { $sum: 1 } } },
      ]),
    ]);

    const map = (arr, field) => { const m = {}; arr.forEach(a => { m[a._id?.toString()] = a; }); return m; };
    const dwMap = map(dwStats); const clMap = map(clientStats); const cmMap = map(commStats); const acMap = map(actStats);

    const rankings = subAgents.map(s => {
      const id = s._id.toString();
      return {
        _id: s._id, name: s.name, username: s.username, status: s.status, lastLoginTime: s.lastLoginTime,
        deposits: dwMap[id]?.deposits || 0,
        withdrawals: dwMap[id]?.withdrawals || 0,
        net: (dwMap[id]?.deposits || 0) - (dwMap[id]?.withdrawals || 0),
        txnCount: dwMap[id]?.txnCount || 0,
        clients: clMap[id]?.clients || 0,
        activeClients: clMap[id]?.activeClients || 0,
        commission: cmMap[id]?.commission || 0,
        actions: acMap[id]?.actions || 0,
      };
    });

    // Sort by deposits (default ranking)
    rankings.sort((a, b) => b.deposits - a.deposits);

    return SendResponse(res, "success", "SubAgent comparison fetched", { rankings });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== REFERRAL FUNNEL REPORT ========================
async function ReferralFunnelReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);

    // Get subagents with referral codes (scoped to self if subagent)
    const subAgentQuery = { agentId: new ObjectId(agentId), isDeleted: false, referralCode: { $ne: "", $ne: null } };
    if (loginUser.userType === "subagent") subAgentQuery._id = new ObjectId(loginUser.userId);
    const subAgents = await SubAgentModel.find(subAgentQuery)
      .select("name username referralCode").lean();

    const referralCodes = subAgents.map(s => s.referralCode).filter(Boolean);

    // Find clients who came via referral
    const clientMatch = { agentId: new ObjectId(agentId), userType: "client", isDeleted: false, referralCode: { $in: referralCodes } };
    if (dateFilter.createdAt) clientMatch.createdAt = dateFilter.createdAt;

    const [byReferral, totalReferred, activeReferred] = await Promise.all([
      UserModel.aggregate([
        { $match: clientMatch },
        { $group: { _id: "$referralCode", clients: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$status", 1] }, 1, 0] } }, totalBalance: { $sum: "$coins" } } },
        { $sort: { clients: -1 } },
      ]),
      UserModel.countDocuments(clientMatch),
      UserModel.countDocuments({ ...clientMatch, status: 1 }),
    ]);

    // Get D/W for referred clients
    const referredClients = await UserModel.find(clientMatch).select("_id referralCode").lean();
    const referredIds = referredClients.map(c => c._id);

    let dwByReferral = [];
    if (referredIds.length > 0) {
      dwByReferral = await DepositWithdrawModel.aggregate([
        { $match: { userId: { $in: referredIds }, status: "accept" } },
        { $group: { _id: null, deposits: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, "$amount", 0] } }, withdrawals: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, "$amount", 0] } } } },
      ]);
    }

    // Map referral code to subagent
    const codeMap = {};
    subAgents.forEach(s => { codeMap[s.referralCode] = { name: s.name, username: s.username }; });

    const enriched = byReferral.map(r => ({
      ...r, subAgentName: codeMap[r._id]?.name || "Unknown", subAgentUsername: codeMap[r._id]?.username || "-",
      conversionRate: r.clients > 0 ? Math.round((r.active / r.clients) * 100) : 0,
    }));

    const totalClients = await UserModel.countDocuments(addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser));
    const dw = dwByReferral[0] || { deposits: 0, withdrawals: 0 };

    return SendResponse(res, "success", "Referral funnel fetched", {
      summary: { totalReferred, activeReferred, totalClients, referralPercentage: totalClients > 0 ? Math.round((totalReferred / totalClients) * 100) : 0, deposits: dw.deposits, withdrawals: dw.withdrawals },
      byReferral: enriched,
      subAgentsWithCodes: subAgents.length,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== HIGH EXPOSURE CLIENTS ========================
async function HighExposureClients(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const baseFilter = addSubagentFilter({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false }, loginUser);

    const [highExposure, negativeBalance, highBalanceNoActivity] = await Promise.all([
      // High exposure clients (exposure < -1000)
      UserModel.find({ ...baseFilter, exposure: { $lt: -1000 } })
        .select("name username coins exposure creditReference status betStatus lastLoginTime")
        .sort({ exposure: 1 }).limit(50).lean(),
      // Negative balance
      UserModel.find({ ...baseFilter, coins: { $lt: 0 } })
        .select("name username coins exposure status")
        .sort({ coins: 1 }).limit(50).lean(),
      // High balance but no login in 7 days
      UserModel.find({
        ...baseFilter,
        coins: { $gt: 10000 },
        $or: [{ lastLoginTime: { $lt: new Date(Date.now() - 7 * 86400000) } }, { lastLoginTime: null }],
      }).select("name username coins exposure lastLoginTime status")
        .sort({ coins: -1 }).limit(30).lean(),
    ]);

    const summary = {
      highExposureCount: highExposure.length,
      totalExposure: highExposure.reduce((s, c) => s + c.exposure, 0),
      negativeBalanceCount: negativeBalance.length,
      dormantHighBalance: highBalanceNoActivity.length,
    };

    return SendResponse(res, "success", "High exposure report fetched", { highExposure, negativeBalance, highBalanceNoActivity, summary });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== SUBAGENT AUDIT TRAIL ========================
async function SubAgentAudit(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "Please select an agent");

    const { fromDate, toDate, subAgentId, category, pageNo, size } = req.body;
    const dateFilter = buildDateFilter(fromDate, toDate);
    const matchStage = { agentId: new ObjectId(agentId) };
    if (loginUser.userType === "subagent") matchStage.subAgentId = new ObjectId(loginUser.userId);
    else if (subAgentId) matchStage.subAgentId = new ObjectId(subAgentId);
    if (dateFilter.createdAt) matchStage.createdAt = dateFilter.createdAt;
    if (category) matchStage.category = category;

    const page = pageNo || 1;
    const sz = size || 50;

    const [list, total, byAction, bySubAgent] = await Promise.all([
      SubAgentActivityModel.find(matchStage)
        .select("subAgentName subAgentUsername action category description targetUser ip createdAt metadata")
        .sort({ createdAt: -1 }).skip((page - 1) * sz).limit(sz).lean(),
      SubAgentActivityModel.countDocuments(matchStage),
      SubAgentActivityModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      SubAgentActivityModel.aggregate([
        { $match: matchStage },
        { $group: { _id: "$subAgentId", name: { $first: "$subAgentName" }, username: { $first: "$subAgentUsername" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return SendResponse(res, "success", "Audit trail fetched", { list, total, page, size: sz, byAction, bySubAgent });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = {
  OverviewReport,
  DWSummaryReport,
  ClientSummaryReport,
  CommissionSummaryReport,
  PerformanceReport,
  SubAgentListStats,
  BettingReport,
  PLReport,
  SubAgentCasinoReport,
  SubAgentFancyReport,
  ClientLoginReport,
  DuplicateIPReport,
  ClientBalanceReport,
  PaymentMethodReport,
  UTRReport,
  SettlementReport,
  ClientGrowthReport,
  TurnoverReport,
  SubAgentComparison,
  ReferralFunnelReport,
  HighExposureClients,
  SubAgentAudit,
};
