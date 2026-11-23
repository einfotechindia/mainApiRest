const UserModel = require("../../Models/User/User.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// ======================== 1. CLIENT MESSAGING ========================
async function SendNotification(req, res) {
  try {
    const { clientId, clientIds, message, title } = req.body;
    if (!message) return SendResponse(res, "error", "message required");

    const targets = clientIds || (clientId ? [clientId] : []);
    if (targets.length === 0) return SendResponse(res, "error", "clientId or clientIds required");

    // Store notification in user's extraData field
    const bulkOps = targets.map(id => ({
      updateOne: {
        filter: { _id: new ObjectId(id), userType: "client" },
        update: { $push: { "extraData.notifications": { title: title || "Notification", message, read: false, createdAt: new Date() } } },
      },
    }));
    await UserModel.bulkWrite(bulkOps);
    return SendResponse(res, "success", `Notification sent to ${targets.length} client(s)`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function BulkNotification(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { message, title } = req.body;
    if (!message) return SendResponse(res, "error", "message required");

    const filter = agentId ? { agentId: new ObjectId(agentId), userType: "client", isDeleted: false, status: 1 } : { userType: "client", isDeleted: false, status: 1 };
    const result = await UserModel.updateMany(filter, {
      $push: { "extraData.notifications": { title: title || "Notification", message, read: false, createdAt: new Date() } },
    });
    return SendResponse(res, "success", `Notification sent to ${result.modifiedCount} clients`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== 2. AUTO DEPOSIT (UTR MATCH) ========================
async function AutoMatchUTR(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { utrNo } = req.body;
    if (!utrNo) return SendResponse(res, "error", "utrNo required");

    // Find pending deposit with this UTR
    const deposit = await DepositWithdrawModel.findOne({
      agentId: new ObjectId(agentId),
      utrNo: Number(utrNo),
      reqType: "deposit",
      status: "pending",
    });

    if (!deposit) return SendResponse(res, "error", "No pending deposit found with this UTR");

    return SendResponse(res, "success", "UTR matched", {
      reqId: deposit._id, name: deposit.name, username: deposit.username,
      amount: deposit.amount, utrNo: deposit.utrNo, createdAt: deposit.createdAt,
    });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function GetPendingUTRs(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);

    const pending = await DepositWithdrawModel.find({
      ...(agentId ? { agentId: new ObjectId(agentId) } : {}),
      reqType: "deposit", status: "pending", utrNo: { $gt: 0 },
    }).select("name username amount utrNo createdAt screenShotImg").sort({ createdAt: -1 }).limit(50).lean();

    return SendResponse(res, "success", "Pending UTRs fetched", pending);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== 3. IP/DEVICE MANAGEMENT ========================
async function GetClientDevices(req, res) {
  try {
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");

    const TrackingModel = require("../../Models/User/Tracking.model");
    const devices = await TrackingModel.aggregate([
      { $match: { userId: new ObjectId(clientId) } },
      { $group: { _id: "$ip", count: { $sum: 1 }, lastSeen: { $max: "$createdAt" } } },
      { $sort: { lastSeen: -1 } },
      { $limit: 20 },
    ]);

    return SendResponse(res, "success", "Devices fetched", devices);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function DetectDuplicateIPs(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);

    // Find clients with same lastIp
    const duplicates = await UserModel.aggregate([
      { $match: { ...(agentId ? { agentId: new ObjectId(agentId) } : {}), userType: "client", isDeleted: false, lastIp: { $ne: null, $ne: "" } } },
      { $group: { _id: "$lastIp", clients: { $push: { _id: "$_id", name: "$name", username: "$username", coins: "$coins" } }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return SendResponse(res, "success", "Duplicate IPs fetched", duplicates);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== 4. BET LIMITS ========================
async function UpdateBetLimits(req, res) {
  try {
    const { clientId, betMaxMinData } = req.body;
    if (!clientId || !betMaxMinData) return SendResponse(res, "error", "clientId and betMaxMinData required");

    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");

    await UserModel.updateOne({ _id: cl._id }, { betMaxMinData });
    return SendResponse(res, "success", `Bet limits updated for ${cl.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function GetBetLimits(req, res) {
  try {
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), userType: "client" }).select("name username betMaxMinData").lean();
    if (!cl) return SendResponse(res, "error", "Client not found");
    return SendResponse(res, "success", "Fetched", cl);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== 5. FANCY/SESSION REPORT ========================
async function FancyReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { fromDate, toDate } = req.body;

    const FancyBetsListModel = require("../../Models/BetsList/FancyBetsList.model");
    const dateFilter = {};
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      dateFilter.createdAt = { $gte: from, $lte: to };
    }

    const report = await FancyBetsListModel.aggregate([
      { $match: { ...(agentId ? { agentId: new ObjectId(agentId) } : {}), ...dateFilter } },
      { $group: {
        _id: { matchName: "$matchName", fancyName: "$runnerName" },
        totalBets: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        profit: { $sum: "$profit" },
      }},
      { $sort: { profit: 1 } },
      { $limit: 50 },
    ]);

    return SendResponse(res, "success", "Fancy report fetched", report);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== 6. CASINO REPORT ========================
async function CasinoReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const agentId = req.body._selectedAgentId || (loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId);
    const { fromDate, toDate } = req.body;

    const CasinoBetsListModel = require("../../Models/BetsList/CasinoBetsList.model");
    const IntCasinoBetsListModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
    const dateFilter = {};
    if (fromDate && toDate) {
      const from = new Date(fromDate); from.setHours(0,0,0,0);
      const to = new Date(toDate); to.setHours(23,59,59,999);
      dateFilter.createdAt = { $gte: from, $lte: to };
    }

    const [diamond, intl] = await Promise.all([
      CasinoBetsListModel.aggregate([
        { $match: { ...(agentId ? { agentId: new ObjectId(agentId) } : {}), ...dateFilter } },
        { $group: { _id: "$gameName", bets: { $sum: 1 }, amount: { $sum: "$amount" }, profit: { $sum: "$profit" } } },
        { $sort: { profit: 1 } },
      ]),
      IntCasinoBetsListModel.aggregate([
        { $match: { ...(agentId ? { agentId: new ObjectId(agentId) } : {}), ...dateFilter } },
        { $group: { _id: "$providerName", bets: { $sum: 1 }, amount: { $sum: "$betAmount" }, profit: { $sum: "$profit" } } },
        { $sort: { profit: 1 } },
      ]),
    ]);

    return SendResponse(res, "success", "Casino report fetched", { diamond, international: intl });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = { SendNotification, BulkNotification, AutoMatchUTR, GetPendingUTRs, GetClientDevices, DetectDuplicateIPs, UpdateBetLimits, GetBetLimits, FancyReport, CasinoReport };
