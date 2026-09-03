const { SendResponse } = require("../../Helpers/ResponseMapper");
const CenterPanelLog = require("../../Models/CenterPanel/CenterPanelLog.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const OddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const sportListModel = require("../../Models/sportList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const ledgerModel = require("../../Models/Ledger.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const fancyListModel = require("../../Models/fancyList.model");
const DecisionController = require("../../Controllers/Bets/Decision.controller");
const { _dx, _d, detectIsTime, dateWhereCond } = require("../../Helpers/CommonHelper");

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
    let bodyData = req.body
    const { marketId, decisionSelectionId } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!decisionSelectionId) return SendResponse(res, "error", "decisionSelectionId is required");
    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, decisionSelectionId });

     if (bodyData.decisionType && bodyData.decisionType == 'Toss') {
      mockReq.body.isToss = true
     }
    
    //_d(bodyData)
    
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
//  _d("pp")
  const startTime = Date.now();
  try {
    const { marketId, selectionId, decisionRun } = req.body;
    if (!marketId) return SendResponse(res, "error", "marketId is required");
    if (!selectionId) return SendResponse(res, "error", "selectionId is required");
    if (decisionRun === undefined || decisionRun === null) return SendResponse(res, "error", "decisionRun is required");
    const { mockReq, mockRes, getResponse } = createMockReqRes({ marketId, selectionId, decisionRun });
    let returnData = await DecisionController.sessionDecision(mockReq, mockRes);
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
    let returnData = await DecisionController.rollbackFancy(mockReq, mockRes);

   // _d(returnData , getResponse()?.message)


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
    let bodyData = req.body
    const { marketId, betIdArray } = req.body;
    if (!marketId && !bodyData.fromTime && !bodyData.toTime) return SendResponse(res, "error", "marketId or fromTime Or toTime is required");
    const { mockReq, mockRes, getResponse } = createMockReqRes(req.body);
    let type = bodyData.type
    let fromTime = bodyData.fromTime
    let toTime = bodyData.toTime
    let where = {
      eventId : bodyData.eventId
    }
    let matchData = await sportListModel.findOne({ eventId: bodyData.eventId }, { marketId: 1 })
    if (!matchData) {
      return SendResponse(res, "error", "matchDat not Found");
    }

    if (bodyData.fromTime && bodyData.toTime) {
      const isTime = detectIsTime(bodyData.fromTime, bodyData.toTime);
      const dateWhere = await dateWhereCond(bodyData.fromTime, bodyData.toTime, false, isTime);
      if (isTime) {
           where.createdAt = dateWhere;
      } else {
            where.date = dateWhere;  
      }
    }

        if (type === "fancy") {
              const sendData = {
                marketId: matchData.marketId,
                password :  process.env.BETS_DELETE_PASSWORD
              };
              const betsData = await FancyBetModel.find(where, {
                _id: 1,
              });
              if (!betsData.length) {
                return sendResult(res, "error", "Bets not found");
              }
              const betsIdArray = betsData.map((bet) => bet._id);
              sendData._id = betsIdArray;
              mockReq.body = sendData;
              await DecisionController.betsDelete(mockReq, mockRes);
        }
    
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


async function eventWiseCheckupReport(req, res) {
  const startTime = Date.now();
  try {
    let bodyData = req.body
    let eventId = bodyData.eventId
    let marketId = bodyData?.marketId

    let [undeclaredFancy, deletedFancy, declaredfancy] = await Promise.all([
      FancyBetModel.countDocuments({
        eventId: eventId,
        isDeclare : false
      }),
      FancyBetModel.countDocuments({
        eventId: eventId,
        isDelete : true
      }),
      FancyBetModel.countDocuments({
        eventId: eventId,
        isDeclare : true
      }),
    ])


  let [undeclaredOdds, deletedOdds, declaredOdds] = await Promise.all([
      OddsBetModel.countDocuments({
        eventId: eventId,
        isDeclare : false
      }),
      OddsBetModel.countDocuments({
        eventId: eventId,
        isDelete : true
      }),
      OddsBetModel.countDocuments({
        eventId: eventId,
        isDeclare : true
      }),
    ])


    let returnData = {
      undeclaredFancy,
      deletedFancy,
      declaredfancy,
      undeclaredOdds,
      deletedOdds,
      declaredOdds
    }

    return SendResponse(res, "success", returnData);
  } catch (err) {
    console.error("FancyAutomaticDecision error:", err);
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}



// ═══════════════════════════════════════════════════════════════
//  EVENT CHECKUP REPORT — Complete event health check
//  Payload: { eventId }
//  Returns: session/odds bets — declared, undeclared, deleted, cancelled, totals
// ═══════════════════════════════════════════════════════════════
async function EventHealthReport(req, res) {
  const startTime = Date.now();
  try {
    const { eventId } = req.body;
    if (!eventId) return SendResponse(res, "error", "eventId is required");

    const eventIdStr = String(eventId);

    // ============================================================
    // PHASE 1 — Match info first (need marketId for other queries)
    // ============================================================
    const matchData = await sportListModel.findOne(
      { eventId: eventIdStr },
      { matchName: 1, marketId: 1, sportType: 1, status: 1, seriesName: 1, eventId: 1, sportId: 1 }
    ).lean();

    const marketId = matchData?.marketId || "";

    // ============================================================
    // PHASE 2 — All parallel queries
    // ============================================================
    const [
      fancyStats,
      fancyAllSessions,
      fancyDeletedDetail,
      oddsStats,
      oddsUndeclaredList,
      oddsTypeWise,
      fancyTimeline,
      oddsTimeline,
      uniqueClients,
      exposureData,
      commissionData,
      ledgerData,
      declaredFancyList,
    ] = await Promise.all([
      // 1. Fancy — overall stats
      FancyBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        {
          $group: {
            _id: null,
            totalBets: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            declaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 1] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            undeclaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 0] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            deletedBets: {
              $sum: { $cond: [{ $in: ["$isDeleted", [1, true]] }, 1, 0] },
            },
            cancelledBets: {
              $sum: {
                $cond: [
                  { $and: [{ $in: ["$isDeleted", [1, true]] }, { $ne: ["$deletedRemark", null] }] },
                  1, 0,
                ],
              },
            },
            uniqueSessions: { $addToSet: "$selectionId" },
            uniqueClients: { $addToSet: "$userId" },
          },
        },
      ]),

      // 2. Fancy — per session full breakdown (declared + undeclared + deleted)
      FancyBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        {
          $group: {
            _id: "$selectionId",
            sessionName: { $first: "$sessionName" },
            gtype: { $first: "$gtype" },
            fancyType: { $first: "$fancyType" },
            totalBets: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            declaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 1] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            undeclaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 0] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            deletedBets: {
              $sum: { $cond: [{ $in: ["$isDeleted", [1, true]] }, 1, 0] },
            },
            decisionRun: { $first: "$decisionRun" },
            isDeclare: { $max: "$isDeclare" },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 3. Fancy — deleted bets detail (reason + count)
      FancyBetModel.aggregate([
        { $match: { eventId: eventIdStr, isDeleted: { $in: [1, true] } } },
        {
          $group: {
            _id: { selectionId: "$selectionId", deletedRemark: "$deletedRemark" },
            sessionName: { $first: "$sessionName" },
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            affectedUsers: { $addToSet: "$userId" },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // 4. Odds — overall stats
      OddsBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        {
          $group: {
            _id: null,
            totalBets: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            declaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 1] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            undeclaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 0] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            deletedBets: {
              $sum: { $cond: [{ $in: ["$isDeleted", [1, true]] }, 1, 0] },
            },
            uniqueOddsTypes: { $addToSet: "$oddsType" },
            uniqueClients: { $addToSet: "$userId" },
            wonTeamName: { $first: "$wonTeamName" },
          },
        },
      ]),

      // 5. Odds — undeclared by type + team
      OddsBetModel.aggregate([
        { $match: { eventId: eventIdStr, isDeclare: 0, isDeleted: { $in: [0, false] } } },
        {
          $group: {
            _id: { oddsType: "$oddsType", teamName: "$teamName" },
            totalBets: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.oddsType": 1 } },
      ]),

      // 6. Odds — per oddsType breakdown
      OddsBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        {
          $group: {
            _id: "$oddsType",
            totalBets: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            declaredBets: {
              $sum: { $cond: [{ $eq: ["$isDeclare", 1] }, 1, 0] },
            },
            undeclaredBets: {
              $sum: { $cond: [{ $and: [{ $eq: ["$isDeclare", 0] }, { $in: ["$isDeleted", [0, false]] }] }, 1, 0] },
            },
            deletedBets: {
              $sum: { $cond: [{ $in: ["$isDeleted", [1, true]] }, 1, 0] },
            },
            wonTeamName: { $first: "$wonTeamName" },
          },
        },
      ]),

      // 7. Fancy — first and last bet time
      FancyBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        { $group: { _id: null, firstBet: { $min: "$createdAt" }, lastBet: { $max: "$createdAt" } } },
      ]),

      // 8. Odds — first and last bet time
      OddsBetModel.aggregate([
        { $match: { eventId: eventIdStr } },
        { $group: { _id: null, firstBet: { $min: "$createdAt" }, lastBet: { $max: "$createdAt" } } },
      ]),

      // 9. Unique clients across both
      FancyBetModel.distinct("userId", { eventId: eventIdStr }),

      // 10. Exposure — undeclared transaction exposure
      marketId
        ? TransactionLogModel.aggregate([
            { $match: { marketId: marketId, forBet: 1, isDeclare: 0 } },
            { $group: { _id: null, totalExposure: { $sum: "$amount" } } },
          ])
        : Promise.resolve([]),

      // 11. Commission — check if comm entries exist
      marketId
        ? TransactionLogModel.aggregate([
            { $match: { marketId: marketId, isComm: 1, isDeclare: 1, forBet: 1 } },
            { $group: { _id: null, totalComm: { $sum: "$amount" }, commEntries: { $sum: 1 } } },
          ])
        : Promise.resolve([]),

      // 12. Ledger — check if ledger declared
      marketId
        ? ledgerModel.findOne({ marketId: marketId }, { isDeclare: 1, ledgerType: 1 }).lean()
        : Promise.resolve(null),

      // 13. Declared fancy list — with results
      fancyListModel.find({ eventId: eventIdStr }, {
        selectionId: 1, sessionName: 1, decisionRun: 1, isDeclare: 1, isRollback: 1,
      }).lean(),
    ]);

    // ============================================================
    // BUILD RESPONSE
    // ============================================================
    const fS = fancyStats[0] || { totalBets: 0, totalAmount: 0, declaredBets: 0, undeclaredBets: 0, deletedBets: 0, cancelledBets: 0, uniqueSessions: [], uniqueClients: [] };
    const oS = oddsStats[0] || { totalBets: 0, totalAmount: 0, declaredBets: 0, undeclaredBets: 0, deletedBets: 0, uniqueOddsTypes: [], uniqueClients: [] };
    const fTimeline = fancyTimeline[0] || {};
    const oTimeline = oddsTimeline[0] || {};

    // Merge unique clients from fancy + odds
    const oddsClients = await OddsBetModel.distinct("userId", { eventId: eventIdStr });
    const allClients = new Set([...uniqueClients.map(String), ...oddsClients.map(String)]);

    const report = {
      eventId: eventIdStr,

      // ── Match Info ──
      matchInfo: matchData ? {
        matchName: matchData.matchName,
        marketId: matchData.marketId,
        sportType: matchData.sportType,
        status: matchData.status,
        seriesName: matchData.seriesName,
      } : null,

      // ── Timeline ──
      timeline: {
        firstBet: fTimeline.firstBet && oTimeline.firstBet
          ? (fTimeline.firstBet < oTimeline.firstBet ? fTimeline.firstBet : oTimeline.firstBet)
          : fTimeline.firstBet || oTimeline.firstBet || null,
        lastBet: fTimeline.lastBet && oTimeline.lastBet
          ? (fTimeline.lastBet > oTimeline.lastBet ? fTimeline.lastBet : oTimeline.lastBet)
          : fTimeline.lastBet || oTimeline.lastBet || null,
        sessionFirstBet: fTimeline.firstBet || null,
        sessionLastBet: fTimeline.lastBet || null,
        oddsFirstBet: oTimeline.firstBet || null,
        oddsLastBet: oTimeline.lastBet || null,
      },

      // ── Clients ──
      clients: {
        totalUniqueClients: allClients.size,
        sessionClients: fS.uniqueClients?.length || 0,
        oddsClients: oS.uniqueClients?.length || 0,
      },

      // ── Session/Fancy Summary ──
      session: {
        totalBets: fS.totalBets,
        totalAmount: fS.totalAmount,
        declaredBets: fS.declaredBets,
        undeclaredBets: fS.undeclaredBets,
        deletedBets: fS.deletedBets,
        cancelledBets: fS.cancelledBets,
        totalUniqueSessions: fS.uniqueSessions?.length || 0,
        allDeclared: fS.undeclaredBets === 0,

        // Per-session full breakdown
        sessionWiseBreakdown: fancyAllSessions.map((s) => {
          const declaredInfo = declaredFancyList.find((d) => String(d.selectionId) === String(s._id));
          return {
            selectionId: s._id,
            sessionName: s.sessionName,
            gtype: s.gtype,
            fancyType: s.fancyType,
            totalBets: s.totalBets,
            totalAmount: s.totalAmount,
            declaredBets: s.declaredBets,
            undeclaredBets: s.undeclaredBets,
            deletedBets: s.deletedBets,
            status: s.undeclaredBets > 0 ? "PENDING" : s.deletedBets === s.totalBets ? "CANCELLED" : "DECLARED",
            result: declaredInfo?.decisionRun ?? s.decisionRun ?? null,
            isRollback: declaredInfo?.isRollback || false,
          };
        }),
      },

      // ── Odds/Bookmaker Summary ──
      odds: {
        totalBets: oS.totalBets,
        totalAmount: oS.totalAmount,
        declaredBets: oS.declaredBets,
        undeclaredBets: oS.undeclaredBets,
        deletedBets: oS.deletedBets,
        oddsTypes: oS.uniqueOddsTypes || [],
        allDeclared: oS.undeclaredBets === 0,
        wonTeamName: oS.wonTeamName || null,

        // Per oddsType breakdown
        oddsTypeWiseBreakdown: oddsTypeWise.map((o) => ({
          oddsType: o._id,
          totalBets: o.totalBets,
          totalAmount: o.totalAmount,
          declaredBets: o.declaredBets,
          undeclaredBets: o.undeclaredBets,
          deletedBets: o.deletedBets,
          status: o.undeclaredBets > 0 ? "PENDING" : "DECLARED",
          wonTeamName: o.wonTeamName || null,
        })),

        // Undeclared detail
        undeclaredOddsList: oddsUndeclaredList.map((o) => ({
          oddsType: o._id.oddsType,
          teamName: o._id.teamName,
          totalBets: o.totalBets,
          totalAmount: o.totalAmount,
        })),
      },

      // ── Deleted/Cancelled Bets Detail ──
      deletedBetsDetail: fancyDeletedDetail.map((d) => ({
        selectionId: d._id.selectionId,
        sessionName: d.sessionName,
        reason: d._id.deletedRemark || "No reason",
        count: d.count,
        totalAmount: d.totalAmount,
        affectedUsers: d.affectedUsers?.length || 0,
      })),

      // ── Exposure (live risk) ──
      exposure: {
        totalUndeclaredExposure: exposureData[0]?.totalExposure || 0,
      },

      // ── Commission Status ──
      commission: {
        isCredited: (commissionData[0]?.commEntries || 0) > 0,
        totalCommEntries: commissionData[0]?.commEntries || 0,
        totalCommAmount: commissionData[0]?.totalComm || 0,
      },

      // ── Ledger Status ──
      ledger: {
        isDeclared: ledgerData ? true : false,
        ledgerType: ledgerData?.ledgerType || null,
      },

      // ── Overall ──
      overall: {
        totalBets: fS.totalBets + oS.totalBets,
        totalAmount: fS.totalAmount + oS.totalAmount,
        totalDeclared: fS.declaredBets + oS.declaredBets,
        totalUndeclared: fS.undeclaredBets + oS.undeclaredBets,
        totalDeleted: fS.deletedBets + oS.deletedBets,
        totalCancelled: fS.cancelledBets,
        allDeclared: fS.undeclaredBets === 0 && oS.undeclaredBets === 0,
        ledgerDeclared: ledgerData ? true : false,
        commissionCredited: (commissionData[0]?.commEntries || 0) > 0,
        eventFullySettled: fS.undeclaredBets === 0 && oS.undeclaredBets === 0 && ledgerData ? true : false,
      },
    };

    const execTime = Date.now() - startTime;
    updateLog(req.centerPanelIp, "eventHealthReport", execTime, "success");

    return SendResponse(res, "success", "Event health report", report);
  } catch (err) {
    console.error("EventHealthReport error:", err);
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
  eventWiseCheckupReport,
  EventHealthReport,
};
