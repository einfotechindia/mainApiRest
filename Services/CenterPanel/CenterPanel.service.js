const { SendResponse } = require("../../Helpers/ResponseMapper");
const CenterPanelLog = require("../../Models/CenterPanel/CenterPanelLog.model");
const DecisionController = require("../../Controllers/Bets/Decision.controller");

// ─── Helper: mock req/res for internal function calls ───
function createMockReqRes(body) {
  const mockReq = {
    body: { ...body },
    query: {},
    loggedInUser: { userType: "centerPanel", userId: "centerPanel", username: "centerPanel" },
  };
  let responseData = null;
  const mockRes = {
    status: () => mockRes,
    json: (d) => { responseData = d; return mockRes; },
    send: (d) => { responseData = d; return mockRes; },
  };
  return { mockReq, mockRes, getResponse: () => responseData };
}

// ─── Helper: update log with operation details ───
function updateLog(ip, operationType, execTime, responseMessage) {
  setImmediate(() => {
    CenterPanelLog.findOneAndUpdate(
      { ip, createdAt: { $gte: new Date(Date.now() - 5000) } },
      { operationType, executionTime: execTime, responseMessage: responseMessage || "" },
      { sort: { createdAt: -1 } }
    ).catch(() => {});
  });
}

// ─── Helper: send result ───
function sendResult(res, responseData, body, execTime) {
  if (responseData?.error) {
    return SendResponse(res, "error", responseData.message || "Failed", responseData.data);
  }
  return SendResponse(res, "Success", responseData?.message || "Executed", { ...body, executionTime: `${execTime}ms` });
}

// ═══════════════════════════════════════════════════════════════
//  LOGS — Staff Panel viewing
// ═══════════════════════════════════════════════════════════════
async function GetCenterPanelLogs(req, res) {
  try {
    const { status, operationType, ip, fromDate, toDate, page = 1, limit = 30 } = req.body;
    const query = {};
    if (status) query.status = status;
    if (operationType) query.operationType = operationType;
    if (ip) query.ip = { $regex: ip, $options: "i" };
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) { const end = new Date(toDate); end.setHours(23, 59, 59, 999); query.createdAt.$lte = end; }
    }
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      CenterPanelLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CenterPanelLog.countDocuments(query),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [totalToday, blockedToday, allowedToday] = await Promise.all([
      CenterPanelLog.countDocuments({ createdAt: { $gte: today } }),
      CenterPanelLog.countDocuments({ status: "blocked", createdAt: { $gte: today } }),
      CenterPanelLog.countDocuments({ status: "allowed", createdAt: { $gte: today } }),
    ]);
    return SendResponse(res, "Success", "Logs fetched", {
      list: logs, total, page, limit, totalPages: Math.ceil(total / limit),
      stats: { totalToday, blockedToday, allowedToday },
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  1. BOOKMAKER DECISION
//  Payload: { marketId, decisionSelectionId }
//  Calls: oddsDecision (bookmaker type)
// ═══════════════════════════════════════════════════════════════
async function BookmakerDecision(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, decisionSelectionId } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!decisionSelectionId) return SendResponse(res, "error", "decisionSelectionId is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, decisionSelectionId });
    await DecisionController.oddsDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "bookmakerDecision", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { marketId, decisionSelectionId }, execTime);
  } catch (err) {
    console.error("BookmakerDecision error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  2. BETFAIR DECISION AUTOMATIC
//  Payload: {} (auto-detects inplay matches)
//  Calls: automaticBetfairDecision
// ═══════════════════════════════════════════════════════════════
async function BetfairDecisionAutomatic(req, res) {
  const startTime = Date.now();
  try {
    const { mockReq, mockRes, getResponse } = createMockReqRes(req.body);
    await DecisionController.automaticBetfairDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "betfairDecisionAutomatic", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), req.body, execTime);
  } catch (err) {
    console.error("BetfairDecisionAutomatic error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  3. BETFAIR DECISION MANUAL
//  Payload: { marketId, betfairMarketId, decisionSelectionId }
//  Calls: manualBetfairDecision
// ═══════════════════════════════════════════════════════════════
async function BetfairDecisionManual(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, betfairMarketId, decisionSelectionId } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!betfairMarketId) return SendResponse(res, "error", "betfairMarketId is required");
    if (!decisionSelectionId) return SendResponse(res, "error", "decisionSelectionId is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, betfairMarketId, decisionSelectionId });
    await DecisionController.manualBetfairDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "betfairDecisionManual", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { marketId, betfairMarketId, decisionSelectionId }, execTime);
  } catch (err) {
    console.error("BetfairDecisionManual error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. FANCY / SESSION DECISION
//  Payload: { marketId, selectionId, decisionRun }
//  Calls: sessionDecision
// ═══════════════════════════════════════════════════════════════
async function FancyDecision(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, selectionId, decisionRun } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!selectionId) return SendResponse(res, "error", "selectionId is required");
    if (decisionRun === undefined || decisionRun === null) return SendResponse(res, "error", "decisionRun is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, selectionId, decisionRun });
    await DecisionController.sessionDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "fancyDecision", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { marketId, selectionId, decisionRun }, execTime);
  } catch (err) {
    console.error("FancyDecision error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  5. FANCY ROLLBACK
//  Payload: { marketId, selectionId }
//  Calls: rollbackFancy
// ═══════════════════════════════════════════════════════════════
async function FancyRollback(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, selectionId } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!selectionId) return SendResponse(res, "error", "selectionId is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, selectionId });
    await DecisionController.rollbackFancy(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "fancyRollback", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { marketId, selectionId }, execTime);
  } catch (err) {
    console.error("FancyRollback error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  6. CANCEL FANCY
//  Payload: { marketId, selectionId }
//  Calls: cancelFancy
// ═══════════════════════════════════════════════════════════════
async function CancelFancy(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, selectionId } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!selectionId) return SendResponse(res, "error", "selectionId is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, selectionId });
    await DecisionController.cancelFancy(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "cancelFancy", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { marketId, selectionId }, execTime);
  } catch (err) {
    console.error("CancelFancy error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  7. BETS DELETE
//  Payload: { marketId, betIdArray, isDeleted }
//  Calls: betsDelete
// ═══════════════════════════════════════════════════════════════
async function BetsDelete(req, res) {
  const startTime = Date.now();
  try {
    const { marketId, betIdArray } = req.body;
    if (!marketId && (!betIdArray || !betIdArray.length)) return SendResponse(res, "error", "marketId or betIdArray is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes(req.body);
    await DecisionController.betsDelete(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "betsDelete", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), req.body, execTime);
  } catch (err) {
    console.error("BetsDelete error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  8. BETFAIR MARKET DECISION
//  Payload: { eventId, sportId }
//  Calls: betfairMarketDecision
// ═══════════════════════════════════════════════════════════════
async function BetfairMarketDecision(req, res) {
  const startTime = Date.now();
  try {
    const { eventId, sportId } = req.body;
    if (!eventId) return SendResponse(res, "error", "eventId is required");

    const { mockReq, mockRes, getResponse } = createMockReqRes({ eventId, sportId });
    await DecisionController.betfairMarketDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "betfairMarketDecision", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), { eventId, sportId }, execTime);
  } catch (err) {
    console.error("BetfairMarketDecision error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  9. BOOKMAKER ODDS AUTOMATIC DECISION
//  Payload: {} (auto-detects inplay)
//  Calls: decisionBookmakerOddsAutomatic
// ═══════════════════════════════════════════════════════════════
async function BookmakerOddsAutomatic(req, res) {
  const startTime = Date.now();
  try {
    const { mockReq, mockRes, getResponse } = createMockReqRes(req.body);
    await DecisionController.decisionBookmakerOddsAutomatic(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "bookmakerOddsAutomatic", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), req.body, execTime);
  } catch (err) {
    console.error("BookmakerOddsAutomatic error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ═══════════════════════════════════════════════════════════════
//  10. FANCY AUTOMATIC DECISION
//  Payload: {} (auto-detects pending fancies)
//  Calls: fancyAutomaticDecision
// ═══════════════════════════════════════════════════════════════
async function FancyAutomaticDecision(req, res) {
  const startTime = Date.now();
  try {
    const { mockReq, mockRes, getResponse } = createMockReqRes(req.body);
    await DecisionController.fancyAutomaticDecision(mockReq, mockRes);

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "fancyAutomaticDecision", execTime, getResponse()?.message);
    return sendResult(res, getResponse(), req.body, execTime);
  } catch (err) {
    console.error("FancyAutomaticDecision error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

module.exports = {
  GetCenterPanelLogs,
  BookmakerDecision,
  BetfairDecisionAutomatic,
  BetfairDecisionManual,
  FancyDecision,
  FancyRollback,
  CancelFancy,
  BetsDelete,
  BetfairMarketDecision,
  BookmakerOddsAutomatic,
  FancyAutomaticDecision,
};
