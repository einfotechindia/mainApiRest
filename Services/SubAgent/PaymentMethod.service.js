const AgentPaymentMethod = require("../../Models/SubAgent/AgentPaymentMethod.model");
const UserModel = require("../../Models/User/User.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const Joi = require("joi");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const VALID_TYPES = ["bank", "paytm", "phonepe", "gpay", "bhim_upi", "generic_upi", "usdt_trc20", "usdt_erc20", "usdt_bep20", "other_crypto"];

const TYPE_LABELS = {
  bank: "Bank Account", paytm: "Paytm", phonepe: "PhonePe", gpay: "Google Pay",
  bhim_upi: "BHIM UPI", generic_upi: "UPI", usdt_trc20: "USDT TRC20",
  usdt_erc20: "USDT ERC20", usdt_bep20: "USDT BEP20", other_crypto: "Other Crypto",
};

const ABOVE_AGENT_PM = ["owner", "subowner", "superadmin", "admin", "subadmin", "master", "superagent"];

function getAgentId(loginUser, body) {
  if (ABOVE_AGENT_PM.includes(loginUser.userType)) {
    return body?._selectedAgentId || null;
  }
  return loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId;
}

// ======================== LIST ========================
async function List(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { type, status } = req.body;

    const where = { agentId: new ObjectId(agentId) };
    if (type) where.type = type;
    if (status) where.status = status;

    const list = await AgentPaymentMethod.find(where).sort({ priority: 1, createdAt: -1 }).lean();
    return SendResponse(res, "success", "List fetched", { list, types: TYPE_LABELS });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CREATE ========================
async function Create(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);

    const schema = Joi.object({
      label: Joi.string().required(),
      type: Joi.string().valid(...VALID_TYPES).required(),
      bankName: Joi.string().allow(""), accountNumber: Joi.string().allow(""),
      accountHolder: Joi.string().allow(""), ifscCode: Joi.string().allow(""), branch: Joi.string().allow(""),
      upiId: Joi.string().allow(""), upiName: Joi.string().allow(""),
      mobile: Joi.string().allow(""), qrImage: Joi.string().allow(""), methodIcon: Joi.string().allow(""),
      walletAddress: Joi.string().allow(""), network: Joi.string().allow(""), cryptoQr: Joi.string().allow(""),
      minAmount: Joi.number().default(0), maxAmount: Joi.number().default(0),
      dailyLimit: Joi.number().default(0),
      scheduleEnabled: Joi.boolean().default(false),
      scheduleFrom: Joi.string().default("00:00"), scheduleTo: Joi.string().default("23:59"),
      domains: Joi.array().items(Joi.string()).default([]),
      note: Joi.string().allow("").default(""),
      priority: Joi.number().default(0),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error, value } = schema.validate(req.body);
    if (error) return SendResponse(res, "error", "Validation failed", error.details.map(d => d.message));

    const doc = new AgentPaymentMethod({
      ...value,
      agentId: new ObjectId(agentId),
      createdBy: loginUser.username,
    });
    await doc.save();
    return SendResponse(res, "success", "Payment method created", doc);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== UPDATE ========================
async function Update(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { id, ...fields } = req.body;
    if (!id) return SendResponse(res, "error", "id is required");

    const doc = await AgentPaymentMethod.findOne({ _id: new ObjectId(id), agentId: new ObjectId(agentId) });
    if (!doc) return SendResponse(res, "error", "Not found");

    const allowed = [
      "label", "type", "bankName", "accountNumber", "accountHolder", "ifscCode", "branch",
      "upiId", "upiName", "mobile", "qrImage", "walletAddress", "network", "cryptoQr",
      "minAmount", "maxAmount", "dailyLimit", "scheduleEnabled", "scheduleFrom", "scheduleTo",
      "domains", "note", "priority", "status", "methodIcon",
    ];
    const update = {};
    allowed.forEach(f => { if (fields[f] !== undefined) update[f] = fields[f]; });

    await AgentPaymentMethod.updateOne({ _id: doc._id }, { $set: update });
    const updated = await AgentPaymentMethod.findById(doc._id).lean();
    return SendResponse(res, "success", "Updated", updated);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== DELETE ========================
async function Delete(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { id } = req.body;
    if (!id) return SendResponse(res, "error", "id is required");

    const doc = await AgentPaymentMethod.findOne({ _id: new ObjectId(id), agentId: new ObjectId(agentId) });
    if (!doc) return SendResponse(res, "error", "Not found");

    await AgentPaymentMethod.deleteOne({ _id: doc._id });
    return SendResponse(res, "success", "Deleted");
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TOGGLE STATUS ========================
async function ToggleStatus(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { id } = req.body;
    if (!id) return SendResponse(res, "error", "id is required");

    const doc = await AgentPaymentMethod.findOne({ _id: new ObjectId(id), agentId: new ObjectId(agentId) });
    if (!doc) return SendResponse(res, "error", "Not found");

    const newStatus = doc.status === "active" ? "inactive" : "active";
    await AgentPaymentMethod.updateOne({ _id: doc._id }, { status: newStatus });
    return SendResponse(res, "success", `${newStatus === "active" ? "Activated" : "Deactivated"}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== DUPLICATE ========================
async function Duplicate(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { id } = req.body;
    if (!id) return SendResponse(res, "error", "id is required");

    const orig = await AgentPaymentMethod.findOne({ _id: new ObjectId(id), agentId: new ObjectId(agentId) }).lean();
    if (!orig) return SendResponse(res, "error", "Not found");

    const { _id, createdAt, updatedAt, dailyUsed, dailyUsedDate, ...data } = orig;
    data.label = `${orig.label} (Copy)`;
    data.status = "inactive";
    data.dailyUsed = 0;
    data.dailyUsedDate = "";

    const doc = new AgentPaymentMethod(data);
    await doc.save();
    return SendResponse(res, "success", "Duplicated", doc);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== REORDER (bulk priority) ========================
async function Reorder(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { items } = req.body; // [{id, priority}]
    if (!Array.isArray(items)) return SendResponse(res, "error", "items array required");

    const ops = items.map(i => ({
      updateOne: { filter: { _id: new ObjectId(i.id), agentId: new ObjectId(agentId) }, update: { $set: { priority: i.priority } } },
    }));
    await AgentPaymentMethod.bulkWrite(ops);
    return SendResponse(res, "success", "Reordered");
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== STATS ========================
async function Stats(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);

    const methods = await AgentPaymentMethod.find({ agentId: new ObjectId(agentId) })
      .select("label type status minAmount maxAmount dailyLimit dailyUsed").lean();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const depositsByMethod = await DepositWithdrawModel.aggregate([
      { $match: { agentId: new ObjectId(agentId), reqType: "deposit", createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 }, amount: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, "$amount", 0] } }, accepted: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, 1, 0] } } } },
    ]);

    const result = methods.map(m => {
      const stats = depositsByMethod.find(d => d._id === m.type) || { count: 0, amount: 0, accepted: 0 };
      return { ...m, last7d: { deposits: stats.count, amount: stats.amount, successRate: stats.count > 0 ? Math.round((stats.accepted / stats.count) * 100) : 0 } };
    });

    return SendResponse(res, "success", "Stats fetched", result);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT-FACING API ========================
async function ClientGetMethods(req, res) {
  try {
    const { clientId, amount, domain } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");

    const client = await UserModel.findById(clientId).select("agentId status isDeleted").lean();
    if (!client || client.isDeleted || !client.status) return SendResponse(res, "error", "Client not found or inactive");
    if (!client.agentId) return SendResponse(res, "error", "No agent assigned");

    const all = await AgentPaymentMethod.find({ agentId: new ObjectId(client.agentId), status: "active" })
      .sort({ priority: 1, createdAt: -1 }).lean();

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = now.toISOString().split("T")[0];

    const filtered = all.filter(m => {
      // Amount range
      if (amount && amount > 0 && (m.minAmount > 0 || m.maxAmount > 0)) {
        if (amount < m.minAmount || (m.maxAmount > 0 && amount > m.maxAmount)) return false;
      }
      // Schedule
      if (m.scheduleEnabled && (hhmm < m.scheduleFrom || hhmm > m.scheduleTo)) return false;
      // Daily limit
      if (m.dailyLimit > 0 && m.dailyUsedDate === today && m.dailyUsed >= m.dailyLimit) return false;
      // Domain
      if (domain && m.domains && m.domains.length > 0) {
        if (!m.domains.some(d => domain.includes(d) || d.includes(domain))) return false;
      }
      return true;
    });

    // Strip internal fields
    const clean = filtered.map(m => ({
      id: m._id, label: m.label, type: m.type, methodIcon: m.methodIcon,
      bankName: m.bankName, accountNumber: m.accountNumber, accountHolder: m.accountHolder,
      ifscCode: m.ifscCode, branch: m.branch,
      upiId: m.upiId, upiName: m.upiName, mobile: m.mobile, qrImage: m.qrImage,
      walletAddress: m.walletAddress, network: m.network, cryptoQr: m.cryptoQr,
      minAmount: m.minAmount, maxAmount: m.maxAmount,
    }));

    return SendResponse(res, "success", "Methods fetched", clean);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== GET BY ID ========================
async function GetById(req, res) {
  try {
    const { id } = req.body;
    if (!id) return SendResponse(res, "error", "id required");
    const doc = await AgentPaymentMethod.findById(id).lean();
    if (!doc) return SendResponse(res, "error", "Not found");
    return SendResponse(res, "success", "Fetched", doc);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== D/W LIST BY ACCOUNT ========================
async function DWListByAccount(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { paymentTypeId, reqType, status, fromDate, toDate } = req.body;

    const where = { agentId: new ObjectId(agentId) };
    if (paymentTypeId) where.paymentTypeId = new ObjectId(paymentTypeId);
    else where.$or = [{ paymentTypeId: null }, { paymentTypeId: { $exists: false } }];
    if (reqType) where.reqType = reqType;
    if (status) where.status = status;
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
      const to = new Date(toDate); to.setHours(23, 59, 59, 999);
      where.createdAt = { $gte: from, $lte: to };
    }

    const list = await DepositWithdrawModel.find(where)
      .select("name username amount utrNo reqType status remark createdAt screenShotImg paymentMethod")
      .sort({ createdAt: -1 }).limit(100).lean();

    return SendResponse(res, "success", "List fetched", list);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== ACCOUNT WISE REPORT ========================
async function AccountWiseReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT_PM].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = getAgentId(loginUser, req.body);
    const { fromDate, toDate } = req.body;

    const dateFilter = {};
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0, 0, 0, 0);
      const to = new Date(toDate); to.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { $gte: from, $lte: to };
    }

    // Get all payment methods
    const methods = await AgentPaymentMethod.find({ agentId: new ObjectId(agentId) })
      .select("label type methodIcon status").lean();

    // Aggregate D/W by paymentTypeId
    const dwByAccount = await DepositWithdrawModel.aggregate([
      { $match: { agentId: new ObjectId(agentId), paymentTypeId: { $ne: null }, ...dateFilter } },
      {
        $group: {
          _id: "$paymentTypeId",
          totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          cancelledDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
          cancelledWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
    ]);

    // Also get D/W without paymentTypeId
    const dwNoAccount = await DepositWithdrawModel.aggregate([
      { $match: { agentId: new ObjectId(agentId), $or: [{ paymentTypeId: null }, { paymentTypeId: { $exists: false } }], ...dateFilter } },
      {
        $group: {
          _id: null,
          totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
    ]);

    // Map methods with stats + success rate + averages
    const report = methods.map(m => {
      const stats = dwByAccount.find(d => d._id && d._id.toString() === m._id.toString()) || {};
      const depTotal = stats.depositCount || 0;
      const depAccepted = depTotal - (stats.cancelledDeposit ? 1 : 0); // approximate
      const depCount = stats.depositCount || 0;
      const wdCount = stats.withdrawCount || 0;
      const totalTxn = depCount + wdCount;
      const acceptedDep = stats.totalDeposit || 0;
      const cancelledDep = stats.cancelledDeposit || 0;
      const successRate = depCount > 0 ? Math.round(((depCount - (cancelledDep > 0 ? Math.ceil(cancelledDep / ((acceptedDep / depCount) || 1)) : 0)) / depCount) * 100) : 0;
      return {
        _id: m._id, label: m.label, type: m.type, methodIcon: m.methodIcon, status: m.status,
        deposit: { total: stats.totalDeposit || 0, pending: stats.pendingDeposit || 0, cancelled: stats.cancelledDeposit || 0, count: depCount },
        withdraw: { total: stats.totalWithdraw || 0, pending: stats.pendingWithdraw || 0, cancelled: stats.cancelledWithdraw || 0, count: wdCount },
        net: (stats.totalDeposit || 0) - (stats.totalWithdraw || 0),
        avgDeposit: depCount > 0 ? Math.round((stats.totalDeposit || 0) / depCount) : 0,
        avgWithdraw: wdCount > 0 ? Math.round((stats.totalWithdraw || 0) / wdCount) : 0,
        totalTxn,
        successRate: Math.min(successRate, 100),
      };
    });

    // Add "Unlinked" entry for D/W without paymentTypeId
    const unlinked = dwNoAccount[0];
    if (unlinked && (unlinked.totalDeposit > 0 || unlinked.totalWithdraw > 0)) {
      report.push({
        _id: null, label: "Unlinked / Direct", type: "other", methodIcon: "", status: "active",
        deposit: { total: unlinked.totalDeposit || 0, pending: 0, cancelled: 0, count: unlinked.depositCount || 0 },
        withdraw: { total: unlinked.totalWithdraw || 0, pending: 0, cancelled: 0, count: unlinked.withdrawCount || 0 },
        net: (unlinked.totalDeposit || 0) - (unlinked.totalWithdraw || 0),
      });
    }

    // Totals
    const totals = {
      deposit: report.reduce((s, r) => s + r.deposit.total, 0),
      withdraw: report.reduce((s, r) => s + r.withdraw.total, 0),
      net: report.reduce((s, r) => s + r.net, 0),
      depositCount: report.reduce((s, r) => s + r.deposit.count, 0),
      withdrawCount: report.reduce((s, r) => s + r.withdraw.count, 0),
    };

    // Top performers
    const sorted = [...report].filter(r => r._id);
    const topDeposit = sorted.sort((a, b) => b.deposit.total - a.deposit.total)[0] || null;
    const mostUsed = sorted.sort((a, b) => b.totalTxn - a.totalTxn)[0] || null;
    const leastUsed = sorted.filter(r => r.totalTxn > 0).sort((a, b) => a.totalTxn - b.totalTxn)[0] || null;

    return SendResponse(res, "success", "Report fetched", { report, totals, topPerformers: { topDeposit, mostUsed, leastUsed } });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = { List, Create, Update, Delete, ToggleStatus, Duplicate, Reorder, Stats, ClientGetMethods, GetById, AccountWiseReport, DWListByAccount };
