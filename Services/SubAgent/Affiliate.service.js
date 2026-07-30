const CommissionPlan = require("../../Models/SubAgent/CommissionPlan.model");
const CommissionLog = require("../../Models/SubAgent/CommissionLog.model");
const SubAgentModel = require("../../Models/SubAgent/SubAgent.model");
const UserModel = require("../../Models/User/User.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// ======================== COMMISSION PLAN CRUD ========================
async function CreatePlan(req, res) {
  try {
    const { planName, registrationBonus, turnoverEnabled, turnoverPercentage, turnoverMinBets, lossCommissionEnabled, lossPercentage, lossMinAmount, tiersEnabled, tiers } = req.body;
    if (!planName) return SendResponse(res, "error", "planName required");
    const agentId = req.body._selectedAgentId || (req.loggedInUser.userType === "agent" ? req.loggedInUser.userId : req.loggedInUser.agentId);
    if (!agentId) return SendResponse(res, "error", "Agent required");

    const plan = new CommissionPlan({
      planName, agentId: new ObjectId(agentId), registrationBonus: registrationBonus || 0,
      turnoverEnabled: turnoverEnabled || false, turnoverPercentage: turnoverPercentage || 0, turnoverMinBets: turnoverMinBets || 0,
      lossCommissionEnabled: lossCommissionEnabled || false, lossPercentage: lossPercentage || 0, lossMinAmount: lossMinAmount || 0,
      tiersEnabled: tiersEnabled || false, tiers: tiers || [],
    });
    await plan.save();
    return SendResponse(res, "success", "Plan created", plan);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function UpdatePlan(req, res) {
  try {
    const { planId, ...fields } = req.body;
    if (!planId) return SendResponse(res, "error", "planId required");
    const allowed = ["planName", "registrationBonus", "turnoverEnabled", "turnoverPercentage", "turnoverMinBets", "lossCommissionEnabled", "lossPercentage", "lossMinAmount", "tiersEnabled", "tiers", "status"];
    const update = {};
    allowed.forEach(f => { if (fields[f] !== undefined) update[f] = fields[f]; });
    await CommissionPlan.updateOne({ _id: new ObjectId(planId) }, { $set: update });
    const updated = await CommissionPlan.findById(planId).lean();
    return SendResponse(res, "success", "Plan updated", updated);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function ListPlans(req, res) {
  try {
    const agentId = req.body._selectedAgentId || (req.loggedInUser.userType === "agent" ? req.loggedInUser.userId : req.loggedInUser.agentId);
    const where = agentId ? { agentId: new ObjectId(agentId), isDeleted: false } : { isDeleted: false };
    const plans = await CommissionPlan.find(where).sort({ createdAt: -1 }).lean();
    return SendResponse(res, "success", "Plans fetched", plans);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function DeletePlan(req, res) {
  try {
    const { planId } = req.body;
    if (!planId) return SendResponse(res, "error", "planId required");
    await CommissionPlan.updateOne({ _id: new ObjectId(planId) }, { isDeleted: true });
    return SendResponse(res, "success", "Plan deleted");
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function SeedPlans(req, res) {
  try {
    const agentId = req.body._selectedAgentId || (req.loggedInUser.userType === "agent" ? req.loggedInUser.userId : req.loggedInUser.agentId);
    if (!agentId) return SendResponse(res, "error", "Agent required");

    const defaults = [
      {
        planName: "Bronze - Starter",
        registrationBonus: 50,
        turnoverEnabled: true, turnoverPercentage: 0.2, turnoverMinBets: 5,
        lossCommissionEnabled: true, lossPercentage: 3, lossMinAmount: 500,
        tiersEnabled: false, tiers: [],
      },
      {
        planName: "Silver - Regular",
        registrationBonus: 100,
        turnoverEnabled: true, turnoverPercentage: 0.5, turnoverMinBets: 10,
        lossCommissionEnabled: true, lossPercentage: 5, lossMinAmount: 1000,
        tiersEnabled: false, tiers: [],
      },
      {
        planName: "Gold - Premium",
        registrationBonus: 200,
        turnoverEnabled: true, turnoverPercentage: 0.8, turnoverMinBets: 10,
        lossCommissionEnabled: true, lossPercentage: 8, lossMinAmount: 1000,
        tiersEnabled: true,
        tiers: [
          { minTurnover: 0, turnoverPct: 0.5, lossPct: 5 },
          { minTurnover: 100000, turnoverPct: 0.8, lossPct: 8 },
          { minTurnover: 500000, turnoverPct: 1.0, lossPct: 10 },
        ],
      },
      {
        planName: "Diamond - VIP",
        registrationBonus: 500,
        turnoverEnabled: true, turnoverPercentage: 1.0, turnoverMinBets: 5,
        lossCommissionEnabled: true, lossPercentage: 12, lossMinAmount: 500,
        tiersEnabled: true,
        tiers: [
          { minTurnover: 0, turnoverPct: 0.8, lossPct: 8 },
          { minTurnover: 100000, turnoverPct: 1.0, lossPct: 12 },
          { minTurnover: 500000, turnoverPct: 1.5, lossPct: 15 },
          { minTurnover: 1000000, turnoverPct: 2.0, lossPct: 20 },
        ],
      },
      {
        planName: "Turnover Only",
        registrationBonus: 0,
        turnoverEnabled: true, turnoverPercentage: 1.0, turnoverMinBets: 0,
        lossCommissionEnabled: false, lossPercentage: 0, lossMinAmount: 0,
        tiersEnabled: false, tiers: [],
      },
      {
        planName: "Loss Only",
        registrationBonus: 0,
        turnoverEnabled: false, turnoverPercentage: 0, turnoverMinBets: 0,
        lossCommissionEnabled: true, lossPercentage: 10, lossMinAmount: 1000,
        tiersEnabled: false, tiers: [],
      },
      {
        planName: "Flat Registration Only",
        registrationBonus: 300,
        turnoverEnabled: false, turnoverPercentage: 0, turnoverMinBets: 0,
        lossCommissionEnabled: false, lossPercentage: 0, lossMinAmount: 0,
        tiersEnabled: false, tiers: [],
      },
      {
        planName: "Platinum - High Roller",
        registrationBonus: 1000,
        turnoverEnabled: true, turnoverPercentage: 1.5, turnoverMinBets: 3,
        lossCommissionEnabled: true, lossPercentage: 15, lossMinAmount: 0,
        tiersEnabled: true,
        tiers: [
          { minTurnover: 0, turnoverPct: 1.0, lossPct: 10 },
          { minTurnover: 200000, turnoverPct: 1.5, lossPct: 15 },
          { minTurnover: 1000000, turnoverPct: 2.0, lossPct: 20 },
          { minTurnover: 5000000, turnoverPct: 2.5, lossPct: 25 },
        ],
      },
    ];

    let created = 0, skipped = 0;
    for (const plan of defaults) {
      const exists = await CommissionPlan.findOne({ planName: plan.planName, agentId: new ObjectId(agentId), isDeleted: false });
      if (exists) { skipped++; continue; }
      await new CommissionPlan({ ...plan, agentId: new ObjectId(agentId) }).save();
      created++;
    }

    return SendResponse(res, "success", `${created} plans created, ${skipped} already existed`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function AssignPlan(req, res) {
  try {
    const { subAgentId, planId } = req.body;
    if (!subAgentId || !planId) return SendResponse(res, "error", "subAgentId and planId required");
    await SubAgentModel.updateOne({ _id: new ObjectId(subAgentId) }, { commissionPlanId: new ObjectId(planId) });
    return SendResponse(res, "success", "Plan assigned");
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== AFFILIATE - MY CLIENTS ========================
async function MyClients(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const subAgentId = loginUser.userType === "subagent" ? loginUser.userId : req.body.subAgentId;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");

    const sa = await SubAgentModel.findById(subAgentId).select("referralCode").lean();
    if (!sa || !sa.referralCode) return SendResponse(res, "success", "No referral code", { clients: [], summary: {} });

    const clients = await UserModel.find({ subagentReferralCode: sa.referralCode, isDeleted: false })
      .select("name username coins exposure status createdAt lastLoginTime").sort({ createdAt: -1 }).lean();

    // Get turnover + P&L per client
    const clientIds = clients.map(c => c._id);
    const [turnovers, pls] = await Promise.all([
      OddsBetsListModel.aggregate([
        { $match: { userId: { $in: clientIds } } },
        { $group: { _id: "$userId", turnover: { $sum: "$amount" }, bets: { $sum: 1 } } },
      ]),
      CrickTransactionLogModel.aggregate([
        { $match: { clientId: { $in: clientIds }, transactionType: "profitLoss" } },
        { $group: { _id: "$clientId", pl: { $sum: "$clientProfitLoss" } } },
      ]),
    ]);

    const turnoverMap = {}; turnovers.forEach(t => { turnoverMap[t._id.toString()] = t; });
    const plMap = {}; pls.forEach(p => { plMap[p._id.toString()] = p; });

    const enriched = clients.map(c => ({
      ...c,
      turnover: turnoverMap[c._id.toString()]?.turnover || 0,
      bets: turnoverMap[c._id.toString()]?.bets || 0,
      profitLoss: plMap[c._id.toString()]?.pl || 0,
    }));

    const summary = {
      totalClients: clients.length,
      totalTurnover: enriched.reduce((s, c) => s + c.turnover, 0),
      totalPL: enriched.reduce((s, c) => s + c.profitLoss, 0),
      totalBets: enriched.reduce((s, c) => s + c.bets, 0),
    };

    return SendResponse(res, "success", "Clients fetched", { clients: enriched, summary });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== AFFILIATE - CALCULATE COMMISSION ========================
async function CalculateCommission(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const subAgentId = loginUser.userType === "subagent" ? loginUser.userId : req.body.subAgentId;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");

    const sa = await SubAgentModel.findById(subAgentId).select("referralCode commissionPlanId agentId").lean();
    if (!sa || !sa.referralCode) return SendResponse(res, "error", "No referral code");
    if (!sa.commissionPlanId) return SendResponse(res, "error", "No commission plan assigned");

    const plan = await CommissionPlan.findById(sa.commissionPlanId).lean();
    if (!plan || plan.isDeleted) return SendResponse(res, "error", "Commission plan not found");

    const clients = await UserModel.find({ subagentReferralCode: sa.referralCode, isDeleted: false }).select("_id username").lean();
    const clientIds = clients.map(c => c._id);

    const today = new Date().toISOString().split("T")[0];

    // Check already calculated for today
    const existing = await CommissionLog.countDocuments({ subAgentId: new ObjectId(subAgentId), period: today });
    if (existing > 0) return SendResponse(res, "success", "Already calculated for today", { alreadyDone: true });

    const logs = [];

    for (const client of clients) {
      // Turnover
      if (plan.turnoverEnabled) {
        const turnover = await OddsBetsListModel.aggregate([
          { $match: { userId: client._id } },
          { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]);
        const t = turnover[0] || { total: 0, count: 0 };
        if (t.count >= plan.turnoverMinBets && t.total > 0) {
          let pct = plan.turnoverPercentage;
          if (plan.tiersEnabled && plan.tiers.length > 0) {
            const tier = [...plan.tiers].sort((a, b) => b.minTurnover - a.minTurnover).find(tr => t.total >= tr.minTurnover);
            if (tier) pct = tier.turnoverPct;
          }
          const commission = Math.round(t.total * pct / 100);
          if (commission > 0) {
            logs.push({
              subAgentId: new ObjectId(subAgentId), subAgentUsername: sa.referralCode, agentId: sa.agentId,
              clientId: client._id, clientUsername: client.username,
              type: "turnover", amount: commission, clientTurnover: t.total, percentage: pct,
              period: today, planName: plan.planName,
            });
          }
        }
      }

      // Loss Commission
      if (plan.lossCommissionEnabled) {
        const pl = await CrickTransactionLogModel.aggregate([
          { $match: { clientId: client._id, transactionType: "profitLoss" } },
          { $group: { _id: null, total: { $sum: "$clientProfitLoss" } } },
        ]);
        const clientPL = pl[0]?.total || 0;
        // Client loss = negative clientProfitLoss (client lost money)
        if (clientPL < 0 && Math.abs(clientPL) >= plan.lossMinAmount) {
          const loss = Math.abs(clientPL);
          let pct = plan.lossPercentage;
          if (plan.tiersEnabled && plan.tiers.length > 0) {
            const turnover = await OddsBetsListModel.aggregate([{ $match: { userId: client._id } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
            const tv = turnover[0]?.total || 0;
            const tier = [...plan.tiers].sort((a, b) => b.minTurnover - a.minTurnover).find(tr => tv >= tr.minTurnover);
            if (tier) pct = tier.lossPct;
          }
          const commission = Math.round(loss * pct / 100);
          if (commission > 0) {
            logs.push({
              subAgentId: new ObjectId(subAgentId), subAgentUsername: sa.referralCode, agentId: sa.agentId,
              clientId: client._id, clientUsername: client.username,
              type: "loss", amount: commission, clientLoss: loss, percentage: pct,
              period: today, planName: plan.planName,
            });
          }
        }
      }
    }

    if (logs.length > 0) await CommissionLog.insertMany(logs);

    const totalCommission = logs.reduce((s, l) => s + l.amount, 0);
    return SendResponse(res, "success", `Calculated: ${logs.length} entries, total commission: ${totalCommission}`, { entries: logs.length, totalCommission });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== AFFILIATE - EARNINGS ========================
async function Earnings(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const subAgentId = loginUser.userType === "subagent" ? loginUser.userId : req.body.subAgentId;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");

    const { fromDate, toDate } = req.body;
    const where = { subAgentId: new ObjectId(subAgentId) };
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      where.createdAt = { $gte: from, $lte: to };
    }

    const [logs, summary] = await Promise.all([
      CommissionLog.find(where).sort({ createdAt: -1 }).limit(200).lean(),
      CommissionLog.aggregate([
        { $match: where },
        { $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        }},
      ]),
    ]);

    const byStatus = await CommissionLog.aggregate([
      { $match: { subAgentId: new ObjectId(subAgentId) } },
      { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);

    const overall = {
      totalEarned: logs.reduce((s, l) => s + l.amount, 0),
      pending: byStatus.find(s => s._id === "pending")?.total || 0,
      settled: byStatus.find(s => s._id === "settled")?.total || 0,
      paid: byStatus.find(s => s._id === "paid")?.total || 0,
    };

    return SendResponse(res, "success", "Earnings fetched", { logs, summary, overall });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== AFFILIATE - SETTLE ========================
async function SettleCommission(req, res) {
  try {
    const { subAgentId } = req.body;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");

    const result = await CommissionLog.updateMany(
      { subAgentId: new ObjectId(subAgentId), status: "pending" },
      { $set: { status: "settled", settledAt: new Date() } }
    );
    return SendResponse(res, "success", `${result.modifiedCount} entries settled`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function MarkPaid(req, res) {
  try {
    const { subAgentId } = req.body;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");
    const result = await CommissionLog.updateMany(
      { subAgentId: new ObjectId(subAgentId), status: "settled" },
      { $set: { status: "paid", paidAt: new Date() } }
    );
    return SendResponse(res, "success", `${result.modifiedCount} entries marked paid`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== AFFILIATE DASHBOARD (Agent view) ========================
async function AffiliateDashboard(req, res) {
  try {
    const agentId = req.body._selectedAgentId || (req.loggedInUser.userType === "agent" ? req.loggedInUser.userId : req.loggedInUser.agentId);
    const where = agentId ? { agentId: new ObjectId(agentId) } : {};

    const [subAgents, commissionBySubAgent, statusSummary] = await Promise.all([
      SubAgentModel.find({ ...(agentId ? { agentId: new ObjectId(agentId) } : {}), isDeleted: false, referralCode: { $ne: "" } })
        .select("name username referralCode commissionPlanId").lean(),
      CommissionLog.aggregate([
        { $match: where },
        { $group: { _id: "$subAgentId", total: { $sum: "$amount" }, count: { $sum: 1 }, subAgentUsername: { $first: "$subAgentUsername" } } },
        { $sort: { total: -1 } },
      ]),
      CommissionLog.aggregate([
        { $match: where },
        { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    // Count referred clients per subagent
    const referralCodes = subAgents.map(sa => sa.referralCode).filter(Boolean);
    const clientCounts = await UserModel.aggregate([
      { $match: { subagentReferralCode: { $in: referralCodes }, isDeleted: false } },
      { $group: { _id: "$subagentReferralCode", count: { $sum: 1 } } },
    ]);
    const clientMap = {};
    clientCounts.forEach(c => { clientMap[c._id] = c.count; });

    const enrichedSA = subAgents.map(sa => {
      const commission = commissionBySubAgent.find(c => c._id?.toString() === sa._id.toString());
      return {
        ...sa,
        referredClients: clientMap[sa.referralCode] || 0,
        totalCommission: commission?.total || 0,
        totalEntries: commission?.count || 0,
      };
    });

    const overall = {
      pending: statusSummary.find(s => s._id === "pending")?.total || 0,
      settled: statusSummary.find(s => s._id === "settled")?.total || 0,
      paid: statusSummary.find(s => s._id === "paid")?.total || 0,
      totalPaid: (statusSummary.find(s => s._id === "paid")?.total || 0) + (statusSummary.find(s => s._id === "settled")?.total || 0),
    };

    return SendResponse(res, "success", "Dashboard fetched", { subAgents: enrichedSA, overall });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = { CreatePlan, UpdatePlan, ListPlans, DeletePlan, SeedPlans, AssignPlan, MyClients, CalculateCommission, Earnings, SettleCommission, MarkPaid, AffiliateDashboard };
