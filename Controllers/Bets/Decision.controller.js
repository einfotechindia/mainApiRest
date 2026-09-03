const Joi = require("joi");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const axios = require("axios");
const {emitToUser , emitToMultipleUsers } =  require("../../socket.js")
const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  updateBulkCoinsExposureUserByMarketId,
  wholeTransactionMarketData,
  CasinoProfitLossAndComm,
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const { UserTypes, siteSetting, fetchUrl } = require("../../Common/Constants");
const {
  _dx,
  whereHelper,
  _d,
  convertKeyObject,
  fancyCommissionHelper,
  betfairFancyCommissionHelper,
  convertKeyObjectAndSeperateid,
  dateWhereCond,
  _date,
  _date_time,
  getSettingData,
  caclculateTime,
  chunkArrayNew,
  commissionProfitLoss
} = require("../../Helpers/CommonHelper");


const OddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const StatementModel = require("../../Models/Statement.model");
const UserModel = require("../../Models/User/User.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const ledgerModel = require("../../Models/Ledger.model");
const commLedgerModel = require("../../Models/commLedger.model");
const sportList = require("../../Models/sportList.model");
const sportsMarketListModel = require("../../Models/sportsMarketList.model");
const fancyListModel = require("../../Models/fancyList.model");
const internationalCasinoBetList = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const directUserShareModel = require("../../Models/User/directUserShareModel");
const PlayModel = require("../../Models/Play.model");


const BetService = require("../../Services/Sports/Bet.service");
const DecisionService = require("../../Services/Sports/Decision.service");
const { msg } = require("../../Helpers/MessageHelper");
const { getUserIdByUsername, getShareChainData } = require("../../Helpers/UsersUtils");
const { acquireDecisionLock, releaseDecisionLock } = require("../../Helpers/DecisionQueue");

const sessionDecision = async (req, res) => {
  const startTime = new Date();
  let bodyData = req.body;
  if (!bodyData.marketId) {
    bodyData = req.query;
  }
  const JoiSchema = Joi.object({
    marketId: Joi.string().required(),
    decisionRun: Joi.number().required(),
    selectionId: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });

  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  const selectionId = bodyData.selectionId;
  const marketId = bodyData.marketId;
  let decisionRun = bodyData.decisionRun;

  // ============================================================
  // DECISION QUEUE — wait for previous decision on same market
  // ============================================================
  const decisionLock = await acquireDecisionLock(marketId);
  if (!decisionLock.acquired) {
    if (res) {
      return SendResponse(res, "error", decisionLock.message);
    }
    return false;
  }

  try {

    let fancyName = "";

    let matchData = await sportList.findOne({ marketId: marketId });

    let databaseFancyData = await fancyListModel.findOne({
      marketId: marketId,
      selectionId: selectionId,
    });

    let sessionWhere = {
      marketId: marketId,
      selectionId: selectionId,
    }

    if (bodyData.gtype && bodyData.gtype == "cricketcasino") {
      sessionWhere = {
        ...sessionWhere, ...{
          fancyType: bodyData.fancyType,
          gtype: bodyData.gtype
        }
      }
    }

    const sessionBetList = await BetService.getFancyBetList(sessionWhere);
    let sessionLength = sessionBetList.length


    await caclculateTime(startTime, "sessionBetList")

    if (sessionBetList.length < 1) {
      if (res) {
        return SendResponse(res, "success", "No Bets In This Session");
      } else {
        return true;
      }
    }

    let lastDigitDecisionRun = Math.abs(decisionRun) % 10;
    let oddEvenType = "odd"
    if (decisionRun % 2 === 0) {
      oddEvenType = "even"
    }


    let uniqueClientData = [];
    let finalClientArray = [];
    let socketDecisionIdArray = []

    sessionBetList.map((sessionData) => {
      let hasKey = finalClientArray.hasOwnProperty(sessionData.userId);
      let gtype = "Normal"
      if (sessionData.gtype && sessionData.gtype != "") {
        gtype = sessionData.gtype
      }
      if (!hasKey) {
        sessionData.profitLossAmount = 0;
        finalClientArray[sessionData.userId] = {
          userId: sessionData.userId,
          ownerId: sessionData.ownerId,
          subownerId: sessionData.subownerId,
          superadminId: sessionData.superadminId,
          adminId: sessionData.adminId,
          subadminId: sessionData.subadminId,
          masterId: sessionData.masterId,
          superagentId: sessionData.superagentId,
          agentId: sessionData.agentId,
          clientId: sessionData.clientId,
          isComm: sessionData.isComm,
          sessionTurnOver: 0,
          profitLoss: 0,
          sessionName: sessionData.sessionName,
          gtype: gtype ? gtype : "",
          eventName: `${matchData.matchName}`,
        };
        uniqueClientData.push(sessionData.userId);
      }

      if (!sessionData.isDeleted) {
        if (gtype == "cricketcasino") {
          if (lastDigitDecisionRun == sessionData.run) {
            finalClientArray[sessionData.userId].profitLoss +=
              sessionData.amount * sessionData.odds;
          } else {
            finalClientArray[sessionData.userId].profitLoss +=
              -1 * sessionData.amount
          }
        } else if (gtype == "oddeven") {   // if even then yes will win and oddd not will win 
          if (sessionData.odds > 1) {
            sessionData.odds = sessionData.odds - 1
          }
          if (sessionData.type == "Y" && oddEvenType == "even") {
            finalClientArray[sessionData.userId].profitLoss +=
              sessionData.amount * Number(sessionData.odds);
          } else if (sessionData.type == "Y" && oddEvenType == "odd") {
            finalClientArray[sessionData.userId].profitLoss +=
              -1 * sessionData.amount
          } else if (sessionData.type == "N" && oddEvenType == "even") {
            finalClientArray[sessionData.userId].profitLoss +=
              -1 * sessionData.amount
          } else if (sessionData.type == "N" && oddEvenType == "odd") {

            finalClientArray[sessionData.userId].profitLoss +=
              sessionData.amount * (Number(sessionData.odds))
          }
        } else {
          if (decisionRun >= sessionData.run && sessionData.type == "Y") {
            finalClientArray[sessionData.userId].profitLoss +=
              sessionData.amount * sessionData.odds;
          } else if (decisionRun >= sessionData.run && sessionData.type == "N") {
            finalClientArray[sessionData.userId].profitLoss +=
              -1 * sessionData.amount * sessionData.odds;
          } else if (decisionRun < sessionData.run && sessionData.type == "Y") {
            finalClientArray[sessionData.userId].profitLoss +=
              -1 * sessionData.amount;
          } else if (decisionRun < sessionData.run && sessionData.type == "N") {
            finalClientArray[sessionData.userId].profitLoss += sessionData.amount;
          }
        }

        finalClientArray[sessionData.userId].sessionTurnOver +=
          sessionData.amount;
      }

    });



    let playWhere = {
      clientId: {
        $in: uniqueClientData,
      },
      marketId: marketId,
    };

    let playData = await BetService.getPlayData(
      playWhere,
      "shareData , clientId , directUserShareData",
      "all"
    );


    let directUserShareData = await directUserShareModel.find({
          userId: {
            $in: uniqueClientData,
          }
        });
    directUserShareData = convertKeyObject(directUserShareData, "userId")

    let insertTransactionLog = [];
    let crickInsertTransactionLog = [];
    let statementLog = [];
    let remarks = "";

   for (const [key, data] of playData.entries()) {
    try {
      if (!data) continue;
      const clientId = data.clientId;
      if (!finalClientArray[clientId]) continue;

      if (finalClientArray[clientId]) {

        let clientData = finalClientArray[clientId];
        const profitLoss = clientData.profitLoss;
        const sessionTurnOver = clientData.sessionTurnOver;
        fancyName = clientData.sessionName;
        remarks = msg("decision.sessionRemark", { sessionName: clientData.sessionName });
        let gtype = clientData.gtype ? clientData.gtype : "";

        let matchShareArray = {};
        try {
          matchShareArray = JSON.parse(data.shareData) || {};
        } catch (e) {
          matchShareArray = {};
        }


        let directShareData = {};
        if (data && data.directUserShareData) {
          directShareData = JSON.parse(data.directUserShareData) || {}
        } else {
          directShareData = directUserShareData[clientId]?.shareData || {}
        }


        let socketRemark = msg("decision.sessionSocketRemark", { winLoss: profitLoss < 0 ? "Loss" : "won", amount: Math.abs(profitLoss), sessionName: fancyName });
        let socketObj = {
          type : "fancy",
          profitLoss: profitLoss,
          remark: socketRemark,
          result : decisionRun,
          marketId: matchData.marketId,
          betReload:true,
        }
        socketDecisionIdArray.push({
          userId: clientId,
          data : socketObj
        })



        const pushArrayTransaction = {
          amount: profitLoss,
          clientAmount: profitLoss,
          marketId: marketId,
          overallType: "fancyOdds",
          userType: "client",
          gameName: "sports",
          gameType: "fancyOdds",
          sessionTurnOver: clientData.sessionTurnOver,
          userId: clientData.userId,
          ownerId: clientData.ownerId,
          subownerId: clientData.subownerId,
          superadminId: clientData.superadminId,
          adminId: clientData.adminId,
          subadminId: clientData.subadminId,
          masterId: clientData.masterId,
          superagentId: clientData.superagentId,
          agentId: clientData.agentId,
          clientId: clientData.clientId,
          selectionId: selectionId,
          isDeclare: 1,
          forBet: 1,
          remarks: remarks,
          ownerAmount: profitLoss * matchShareArray.ownerMatchProfitLossShare,
          subownerAmount: profitLoss * matchShareArray.subownerMatchProfitLossShare,
          superadminAmount: profitLoss * matchShareArray.superadminMatchProfitLossShare,
          adminAmount: profitLoss * matchShareArray.adminMatchProfitLossShare,
          subadminAmount: profitLoss * matchShareArray.subadminMatchProfitLossShare,
          masterAmount: profitLoss * matchShareArray.masterMatchProfitLossShare,
          superagentAmount: profitLoss * matchShareArray.superagentMatchProfitLossShare,
          agentAmount: profitLoss * matchShareArray.agentMatchProfitLossShare,
          result: decisionRun,
        };
        insertTransactionLog.push(pushArrayTransaction);

        let userRemark = clientData.profitLoss < 0 ? "Loss" : "Win";

        const pushStatementLog = {
          userId: new ObjectId(clientData.userId),
          amount: clientData.profitLoss,
          userType: "client",
          gameType: "Cricket",
          sportsType: "Cricket",
          remark: msg("decision.sessionStatementRemark", { sessionName: clientData.sessionName, winLoss: userRemark, decisionRun }),
          userRemark: userRemark,
          statementFor: "fancyBet",
          marketId: marketId,
          selectionId: selectionId,
        };
        statementLog.push(pushStatementLog);

        let crickRemark = msg("decision.sessionCrickRemark", { sessionName: clientData.sessionName, matchName: matchData.matchName, seriesName: matchData.seriesName });

        const crickPushTransactionLog = {
          amount: profitLoss,
          clientProfitLoss: profitLoss,
          marketId: marketId,
          eventId: matchData.eventId,
          sportId: matchData.sportId,
          seriesId: matchData.seriesId,
          gameName: "sports",
          transactionType: "profitLoss",
          gameType: "Cricket",
          marketType: "fancy",
          eventName : clientData.eventName,
          selectionId: selectionId,
          remarks: crickRemark,
          userId: clientData.userId,
          ownerId: clientData.ownerId,
          subownerId: clientData.subownerId,
          superadminId: clientData.superadminId,
          adminId: clientData.adminId,
          subadminId: clientData.subadminId,
          masterId: clientData.masterId,
          superagentId: clientData.superagentId,
          agentId: clientData.agentId,
          clientId: clientData.clientId,
          ownerLedgerAmount: profitLoss * matchShareArray.ownerParentMatchShare,
          subownerLedgerAmount: profitLoss * matchShareArray.subownerParentMatchShare,
          superadminLedgerAmount: profitLoss * matchShareArray.superadminParentMatchShare,
          adminLedgerAmount: profitLoss * matchShareArray.adminParentMatchShare,
          subadminLedgerAmount: profitLoss * matchShareArray.subadminParentMatchShare,
          masterLedgerAmount: profitLoss * matchShareArray.masterParentMatchShare,
          superagentLedgerAmount: profitLoss * matchShareArray.superagentParentMatchShare,
          agentLedgerAmount: profitLoss * matchShareArray.agentParentMatchShare,

          ownerProfitLoss: profitLoss * matchShareArray.ownerMatchProfitLossShare,
          subownerProfitLoss: profitLoss * matchShareArray.subownerMatchProfitLossShare,
          superadminProfitLoss: profitLoss * matchShareArray.superadminMatchProfitLossShare,
          adminProfitLoss: profitLoss * matchShareArray.adminMatchProfitLossShare,
          subadminProfitLoss: profitLoss * matchShareArray.subadminMatchProfitLossShare,
          masterProfitLoss: profitLoss * matchShareArray.masterMatchProfitLossShare,
          superagentProfitLoss: profitLoss * matchShareArray.superagentMatchProfitLossShare,
          agentProfitLoss: profitLoss * matchShareArray.agentMatchProfitLossShare,
          result: decisionRun,
          betFor: "session",
        };
        crickInsertTransactionLog.push(crickPushTransactionLog);

        let commInsert = 0;
        if (clientData.isComm) {
          commInsert = clientData.isComm;
        }

        if (gtype == "betfair") {
          commInsert = 1;
        }

        if (commInsert) {
          let commissionData = {};
          if (gtype != "betfair") {
            commissionData = fancyCommissionHelper(
              profitLoss,
              sessionTurnOver,
              matchShareArray,
              directShareData
            );
          } else {
            commissionData = betfairFancyCommissionHelper(
              profitLoss,
              sessionTurnOver,
              matchShareArray,
              directShareData
            );
          }
          const pushArrayTransactionComm = {
            amount: commissionData.clientComm,
            clientAmount: commissionData.clientComm,

            userId: clientData.userId,
            userType: "client",
            gameName: "sports",
            gameType: "fancyOdds",
            subownerId: clientData.subownerId,
            ownerId: clientData.ownerId,
            superadminId: clientData.superadminId,
            adminId: clientData.adminId,
            subadminId: clientData.subadminId,
            masterId: clientData.masterId,
            superagentId: clientData.superagentId,
            agentId: clientData.agentId,
            clientId: clientData.clientId,

            ownerAmount: commissionData.ownerComm,
            subownerAmount: commissionData.subownerComm,
            superadminAmount: commissionData.superadminComm,
            adminAmount: commissionData.adminComm,
            subadminAmount: commissionData.subadminComm,
            masterAmount: commissionData.masterComm,
            superagentAmount: commissionData.superagentComm,
            agentAmount: commissionData.agentComm,

            overallType: "fancyOddsComm",
            marketId: marketId,
            selectionId: selectionId,
            isDeclare: 1,
            forBet: 1,
            isComm: 1,
            remarks: msg("decision.sessionCommRemark", { sessionName: clientData.sessionName }),
            result: decisionRun,
          };

          insertTransactionLog.push(pushArrayTransactionComm);

          const pushStatementLogComm = {
            userId: new ObjectId(clientData.userId),
            amount: commissionData.clientComm,
            userType: "client",
            gameType: "Cricket",
            sportsType: "cricket",
            remark: msg("decision.sessionCommStatementRemark", { sessionName: clientData.sessionName }),
            userRemark: "Comm Credited",
            statementFor: "fancyBetComm",
            marketId: marketId,
            isComm: true,
            selectionId: selectionId,
          };
          statementLog.push(pushStatementLogComm);

          const crickPushTransactionLogComm = {
            amount: commissionData.clientComm,
            clientProfitLoss: commissionData.clientComm,
            marketId: marketId,
            eventId: matchData.eventId,
            sportId: matchData.sportId,
            seriesId: matchData.seriesId,
            eventName : clientData.eventName,
            gameName: "sports",
            transactionType: "profitLoss",
            gameType: "Cricket",
            marketType: "fancy",
            selectionId: selectionId,
            isComm: 1,
            remarks: `${crickRemark}`,
            userId: clientData.userId,
            ownerId: clientData.ownerId,
            subownerId: clientData.subownerId,
            superadminId: clientData.superadminId,
            adminId: clientData.adminId,
            subadminId: clientData.subadminId,
            masterId: clientData.masterId,
            superagentId: clientData.superagentId,
            agentId: clientData.agentId,
            clientId: clientData.clientId,

            ownerLedgerAmount: commissionData.ownerLedgerSessionComm
              ? commissionData.ownerLedgerSessionComm
              : 0,
            subownerLedgerAmount: commissionData.subownerLedgerSessionComm
              ? commissionData.subownerLedgerSessionComm
              : 0,
            superadminLedgerAmount: commissionData.superadminLedgerSessionComm
              ? commissionData.superadminLedgerSessionComm
              : 0,
            adminLedgerAmount: commissionData.adminLedgerSessionComm
              ? commissionData.adminLedgerSessionComm
              : 0,
            subadminLedgerAmount: commissionData.subadminLedgerSessionComm
              ? commissionData.subadminLedgerSessionComm
              : 0,
            masterLedgerAmount: commissionData.masterLedgerSessionComm
              ? commissionData.masterLedgerSessionComm
              : 0,
            superagentLedgerAmount: commissionData.superagentLedgerSessionComm
              ? commissionData.superagentLedgerSessionComm
              : 0,
            agentLedgerAmount: commissionData.agentLedgerSessionComm
              ? commissionData.agentLedgerSessionComm
              : 0,

            ownerProfitLoss: commissionData.ownerProfitLossSessionComm
              ? -1 * commissionData.ownerProfitLossSessionComm
              : 0,
            subownerProfitLoss: commissionData.subownerProfitLossSessionComm
              ? -1 * commissionData.subownerProfitLossSessionComm
              : 0,
            superadminProfitLoss: commissionData.superadminProfitLossSessionComm
              ? -1 * commissionData.superadminProfitLossSessionComm
              : 0,
            adminProfitLoss: commissionData.adminProfitLossSessionComm
              ? -1 * commissionData.adminProfitLossSessionComm
              : 0,
            subadminProfitLoss: commissionData.subadminProfitLossSessionComm
              ? -1 * commissionData.subadminProfitLossSessionComm
              : 0,
            masterProfitLoss: commissionData.masterProfitLossSessionComm
              ? -1 * commissionData.masterProfitLossSessionComm
              : 0,
            superagentProfitLoss: commissionData.superagentProfitLossSessionComm
              ? -1 * commissionData.superagentProfitLossSessionComm
              : 0,
            agentProfitLoss: commissionData.agentProfitLossSessionComm
              ? -1 * commissionData.agentProfitLossSessionComm
              : 0,

            result: decisionRun,
            betFor: "session",
          };
          crickInsertTransactionLog.push(crickPushTransactionLogComm);
        }
      }
    } catch (err) {
        console.log("ERROR in playData loop in session decision", {
        key,
        clientId: data?.clientId,
        userId: finalClientArray?.[data?.clientId]?.userId,
        message: err?.message,
        stack: err?.stack,
      });
    }
  } 
    


    await Promise.all([
      TransactionLogModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId + "",
        overallType: { $in: ["fancyOdds", "fancyOddsComm"] },
        forBet: 1,
      }),
      StatementModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId,
        statementFor: { $in: ["fancyBet", "fancyBetComm"] },
      }),
      CrickTransactionLogModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId + "",
      })
    ])


    let chunks = chunkArrayNew(insertTransactionLog, 2000);

    for (const chunk of chunks) {
      await TransactionLogModel.insertMany(chunk);
    }

    if (sessionLength < 1000) {
      let finalInsertStatement = [];
      for (const record of statementLog) {
        const filter = {
          marketId: record.marketId,
          selectionId: record.selectionId,
          statementFor: record.statementFor,
          userId: record.userId,
          isComm: record.isComm,
        };
        let statementFinalObj = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalInsertStatement.push(statementFinalObj);
      }
      const result = await StatementModel.bulkWrite(finalInsertStatement);
    } else {
      let staementChunks = chunkArrayNew(statementLog, 2000);
      for (const statementChunk of staementChunks) {
        await StatementModel.insertMany(statementChunk);
      }
    }

   
      let crickTransactionChunks = chunkArrayNew(crickInsertTransactionLog, 1000);
      for (const crickTransactionChunk of crickTransactionChunks) {
        await CrickTransactionLogModel.insertMany(crickTransactionChunk);
      }
    



    let updateWhere = { marketId: marketId, selectionId: selectionId }
    if (bodyData.gtype && bodyData.gtype == "cricketcasino") {
      updateWhere = {
        ...updateWhere, ...{
          fancyType: bodyData.fancyType,
          gtype: bodyData.gtype
        }
      }
    }


    let isRollback = false;
    let oldResults = databaseFancyData && databaseFancyData.oldResults ? databaseFancyData.oldResults : []
    if (databaseFancyData) {
      if (databaseFancyData.isDeclare) {
        isRollback = true;
      }
      oldResults.push({
        decisionRun: databaseFancyData.decisionRun,
        time: new Date().getTime(),
      });
    }

    let updateFancyData = {
      marketId: marketId,
      eventId: matchData.eventId,
      selectionId: selectionId,
      decisionRun: decisionRun,
      sessionName: fancyName,
      isDeclare: true,
      isRollback: isRollback,
      oldResults: oldResults
    };

     let decisionData = {
        result: decisionRun,
        selectionId: selectionId,
        resultName: fancyName,
      };

    await Promise.all([
      updateBulkCoinsExposureUserByMarketId(
        uniqueClientData,
        marketId,
        selectionId
      ),
      FancyBetModel.updateMany(
        updateWhere,
        { $set: { decisionRun: decisionRun, isDeclare: 1 } }
      ),
      PlayModel.updateMany(playWhere, {
        updateSessionBet: true,
      }),
      fancyListModel.updateOne(
        { marketId: marketId, selectionId: selectionId },
        {
          $set: updateFancyData,
        },
        {
          upsert: true,
        }
      ),
      uniqueClientData.map((userId) =>
        client.del(`${userId}_fancyData_${marketId}`)
      ),
      DecisionService.saveResultForSports(
        marketId,
        "fancy",
        decisionData,
        matchData
      )
    ])


    await declarePositionAndLedger(marketId, "", true, uniqueClientData);
    await client.get(`fancyList_${matchData.eventId}`);
    await caclculateTime(startTime, `fancy decision end for ${fancyName}`);

    await emitToMultipleUsers(socketDecisionIdArray, "decisionResult");

    if (res) {
      return SendResponse(
        res,
        "success",
        msg("decision.sessionSuccessMsg", { sessionName: fancyName }),
      );
    } else {
      return true;
    }
  } catch (error) {
    console.error("Something Went Wrong In Session Decision", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Session Decision",
      error
    );
  } finally {
    await releaseDecisionLock(marketId, decisionLock.token);
  }
};


const rollbackFancy = async (req, res) => {
  try {
    let bodyData = req.body;
    if (!bodyData.marketId) {
      bodyData = req.query;
    }
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      selectionId: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

   

    const selectionId = bodyData.selectionId;
    const marketId = bodyData.marketId;
    let decisionRun = 0;

    const sessionBetList = await BetService.getFancyBetList({
      marketId: marketId,
      selectionId: selectionId,
      isDeleted : 0
    });

    if (sessionBetList.length < 1) {
      return SendResponse(res, "success", "No Bets In This Session");
    }

    let uniqueClientData = [];
    let finalClientArray = [];
    sessionBetList.map(async (sessionData) => {
      let hasKey = finalClientArray.hasOwnProperty(sessionData.userId);
      if (!hasKey) {
        sessionData.profitLossAmount = 0;
        finalClientArray[sessionData.userId] = {
          userId: sessionData.userId,
          ownerId: sessionData.ownerId,
          subownerId: sessionData.subownerId,
          superadminId: sessionData.superadminId,
          adminId: sessionData.adminId,
          subadminId: sessionData.subadminId,
          masterId: sessionData.masterId,
          superagentId: sessionData.superagentId,
          agentId: sessionData.agentId,
          clientId: sessionData.clientId,
          isComm: sessionData.isComm,
          sessionTurnOver: 0,
          profitLoss: 0,
          sessionName: sessionData.sessionName,
        };
        uniqueClientData.push(sessionData.userId);
        await client.del(`${sessionData.userId}_fancyData_${marketId}`);
      }
      if (!sessionData.isDeleted) {
        if (sessionData.type == "Y") {
          decisionRun = sessionData.run - 1;
        }
        if (sessionData.type == "N") {
          decisionRun = sessionData.run + 1;
        }
        if (decisionRun >= sessionData.run && sessionData.type == "Y") {
          finalClientArray[sessionData.userId].profitLoss +=
            sessionData.amount * sessionData.odds;
        } else if (decisionRun >= sessionData.run && sessionData.type == "N") {
          finalClientArray[sessionData.userId].profitLoss +=
            -1 * sessionData.amount * sessionData.odds;
        } else if (decisionRun < sessionData.run && sessionData.type == "Y") {
          finalClientArray[sessionData.userId].profitLoss +=
            -1 * sessionData.amount;
        } else if (decisionRun < sessionData.run && sessionData.type == "N") {
          finalClientArray[sessionData.userId].profitLoss += sessionData.amount;
        }
        finalClientArray[sessionData.userId].sessionTurnOver +=
          sessionData.amount;
      }
    });

    let playWhere = {
      clientId: {
        $in: uniqueClientData,
      },
      marketId: marketId,
    };
    let playData = await BetService.getPlayData(
      playWhere,
      "shareData , clientId",
      "all"
    );

    let insertTransactionLog = [];
    playData.forEach((data, key) => {
      const clientId = data.clientId;
      if (finalClientArray[clientId]) {
        let clientData = finalClientArray[clientId];
        const profitLoss = clientData.profitLoss;
        const sessionTurnOver = clientData.sessionTurnOver;
        let clientShareData = JSON.parse(data.shareData);
        const matchShareArray = clientShareData;
        const pushArrayTransaction = {
          amount: profitLoss,
          clientAmount: profitLoss,
          marketId: marketId,
          overallType: "fancyOdds",
          userType: "client",
          gameName: "sports",
          gameType: "fancyOdds",
          sessionTurnOver: clientData.sessionTurnOver,
          userId: clientData.userId,
          ownerId: clientData.ownerId,
          subownerId: clientData.subownerId,
          superadminId: clientData.superadminId,
          adminId: clientData.adminId,
          subadminId: clientData.subadminId,
          masterId: clientData.masterId,
          superagentId: clientData.superagentId,
          agentId: clientData.agentId,
          clientId: clientData.clientId,
          selectionId: selectionId,
          isDeclare: 0,
          forBet: 1,
          remarks: msg("decision.sessionRemark", { sessionName: clientData.sessionName }),
          ownerAmount: profitLoss * matchShareArray.ownerMatchProfitLossShare,
          subownerAmount:
            profitLoss * matchShareArray.subownerMatchProfitLossShare,
          superadminAmount:
            profitLoss * matchShareArray.superadminMatchProfitLossShare,
          adminAmount: profitLoss * matchShareArray.adminMatchProfitLossShare,
          subadminAmount:
            profitLoss * matchShareArray.subadminMatchProfitLossShare,
          masterAmount: profitLoss * matchShareArray.masterMatchProfitLossShare,
          superagentAmount:
            profitLoss * matchShareArray.superagentMatchProfitLossShare,
          agentAmount: profitLoss * matchShareArray.agentMatchProfitLossShare,
        };
        insertTransactionLog.push(pushArrayTransaction);
      }
    });

    await Promise.all([
        TransactionLogModel.deleteMany({
              marketId: marketId,
              selectionId: selectionId + "",
              overallType: { $in: ["fancyOdds", "fancyOddsComm"] },
              forBet: 1,
        }),
        StatementModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId,
        statementFor: { $in: ["fancyBet", "fancyBetComm"] },
        }),
        CrickTransactionLogModel.deleteMany({
          marketId: marketId,
          selectionId: selectionId + "",
        })
    ])

    await Promise.all([
        TransactionLogModel.insertMany(insertTransactionLog),
        FancyBetModel.updateMany(
        { marketId: marketId, selectionId: selectionId },
        { $set: { decisionRun: "", isDeclare: 0} }
        ),
        PlayModel.updateMany(playWhere, {
        updateSessionBet: true,
      })
    ])
    
    const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData,
      marketId,
      selectionId
    );

    return SendResponse(
      res,
      "success",
      msg("decision.rollbackSuccessMsg"),
      updateUserCoins
    );
  } catch (error) {
    console.log("Something Went Wrong In Fancy Rollback", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Fancy Rollback",
      error.message
    );
  }
};

const cancelFancy = async (req, res) => {
  try {
    let bodyData = req.body;
    if (!bodyData.marketId) {
      bodyData = req.query;
    }
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      selectionId: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    let deletedRemark = bodyData.remark ? bodyData.remark : "cancel";
    if (bodyData.deletedRemark) {
      deletedRemark = bodyData.deletedRemark;
    }
    const selectionId = bodyData.selectionId;
    const marketId = bodyData.marketId;
    const sessionBetList = await BetService.getFancyBetList(
      {
        marketId: marketId,
        selectionId: selectionId,
      },
      {
        userId: 1,
      }
    );
    let uniqueClientData = [];
    let finalClientArray = [];
    sessionBetList.map(async (sessionData) => {
      let hasKey = finalClientArray.hasOwnProperty(sessionData.userId);
      if (!hasKey) {
        uniqueClientData.push(sessionData.userId);
        await client.del(`${sessionData.userId}_fancyData_${marketId}`);
      }
    });

    let playWhere = {
      clientId: {
        $in: uniqueClientData,
      },
      marketId: marketId,
    };

    await TransactionLogModel.deleteMany({
      marketId: marketId,
      selectionId: selectionId + "",
      overallType: { $in: ["fancyOdds", "fancyOddsComm"] },
      forBet: 1,
    });

    await CrickTransactionLogModel.deleteMany({
      marketId: marketId,
      selectionId: selectionId + "",
    });

    await StatementModel.deleteMany({
      marketId: marketId,
      selectionId: selectionId,
      statementFor: { $in: ["fancyBet", "fancyBetComm"] },
    });

    await FancyBetModel.updateMany(
      { marketId: marketId, selectionId: selectionId },
      {
        $set: {
          decisionRun: "",
          isDeclare: 1,
          isDeleted: 1,
          deletedRemark: deletedRemark,
        },
      }
    );
    await PlayModel.updateMany(playWhere, {
      updateSessionBet: true,
    });

    const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData,
      marketId,
      selectionId
    );

    let matchData = await sportList.findOne(
      { marketId: marketId },
      { eventId: 1 }
    );

    let updateFancyData = {
      marketId: marketId,
      eventId: matchData.eventId,
      selectionId: selectionId,
      deletedRemark: deletedRemark,
      isCancel: true,
    };

    await fancyListModel.updateOne(
      { marketId: marketId, selectionId: selectionId },
      {
        $set: updateFancyData,
      },
      {
        upsert: true,
      }
    );

    if (res) {
      return SendResponse(
        res,
        "success",
        "Fancy cancel Successfully Done",
        updateUserCoins
      );
    } else {
      return true;
    }
  } catch (error) {
    console.log("Something Went Wrong In Cancel Fancy", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Cancel Fancy",
      error
    );
  }
};

const oddsDecision = async (req, res) => {
  const startTime = new Date();
  let bodyData = req.body;
  if (!bodyData.marketId) {
    bodyData = req.query;
  }
  const JoiSchema = Joi.object({
    marketId: Joi.string().required(),
    decisionSelectionId: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    if (res) {
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    } else {
      _d(errorMessages, "")
    }
  }
  let isToss = false;
  if (bodyData.isToss) {
    isToss = true;
    bodyData.decisionSelectionId = bodyData.decisionSelectionId * 10000;
  }
  const marketId = bodyData.marketId;

  let oddsType = "bookmaker";
  if (isToss) {
    oddsType = "toss";
  }

  // ============================================================
  // DECISION QUEUE — wait for previous decision on same market
  // ============================================================
  const decisionLock = await acquireDecisionLock(marketId);
  if (!decisionLock.acquired) {
    if (res) {
      return SendResponse(res, "error", decisionLock.message);
    }
    return false;
  }

  try {
    let settingData = await getSettingData();
    
    if (!isToss) {
      let checkSessionWhere = {
          marketId: marketId,
          isDeclare: 0,
          isDeleted: 0,
      }
      
        const checkSessionDecision = await FancyBetModel.countDocuments(checkSessionWhere);

        if (checkSessionDecision) {
          if (res) {
            return SendResponse(
              res,
              "error",
              `${checkSessionDecision} Session Decision Is Pending Please Do Session Decision First`
            );
          }
        }

      const checkTossBet = await OddsBetModel.countDocuments({
          marketId: marketId,
          oddsType: "toss",
          isDeclare: 0,
          isDeleted: 0,
        });

        if (checkTossBet) {
          if (res) {
            return SendResponse(
              res,
              "error",
              `toss result is pending`
            );
          }
        }

    }

    let matchData = await sportList.findOne({ marketId: marketId });

    if (!matchData) {
      return SendResponse(res, "error", "Match Not Found");
    }
    const decisionSelectionId = bodyData.decisionSelectionId;
    const eventId = matchData.eventId;
    let wonTossSelectionId = "";
    let wonTeamBookmakerSelectionId = "";
    if (isToss) {
      wonTossSelectionId = decisionSelectionId;
    } else {
      wonTeamBookmakerSelectionId = bodyData.decisionSelectionId;
    }
    let wonTeamName = "";
    let wonTossTeamName = "";

    if (decisionSelectionId == "draw" || decisionSelectionId == "abonded") {
          wonTeamName = decisionSelectionId;
          matchData.wonTeamName = decisionSelectionId;
          
          await OddsBetModel.updateMany(
            { marketId: marketId,  oddsType: { $in: ["matchOdds" , "bookmaker"] },},
            { $set: { isDeleted: 1, isDeclare: 1 } }
          );

          let updateTranaction = await TransactionLogModel.deleteMany({
            marketId: marketId,
            forBet: 1,
            gameType: { $in: ["bookmaker", "matchOdds"] },
          });

          await CrickTransactionLogModel.deleteMany({
            marketId: marketId,
            marketType: { $in: ["bookmaker" , "matchOdds"] },
          });
      
    } else {
      wonTeamName = await DecisionService.getWonTeamName(
        matchData,
        bodyData.decisionSelectionId,
        isToss
      );
      matchData.wonTeamName = wonTeamName;
    }



    if (isToss) {
      wonTossTeamName = wonTeamName;
      wonTeamName = "";
    }

    let updateMatchData = {
      wonTeamName: wonTeamName,
      wonTossTeamName: wonTossTeamName,
      wonTeamBookmakerSelectionId: wonTeamBookmakerSelectionId,
      wonTossSelectionId: wonTossSelectionId,
    };

    //_d(updateMatchData , "updateMatchData")

    if (!isToss) {
      updateMatchData.status = "COMPLETED";
      updateMatchData.isDeclare = true;
    }


    const update = await sportList.updateMany(
      { marketId: marketId, eventId: eventId },
      updateMatchData
    );


    if (isToss) {
      wonTeamName = wonTossTeamName;
    }
    await caclculateTime(startTime, "oddsDecision start")


    //_d(decisionSelectionId)

    const decisionOdds = await DecisionService.oddsDecision(
      matchData,
      oddsType,
      decisionSelectionId,
      "",
      wonTeamName
    );

    await caclculateTime(startTime, "oddsDecision end")

    if (decisionOdds.status != "success") {
      return SendResponse(res, "error", decisionOdds.message);
    }

    let permForLedger = false;

    if (settingData.isLedgerDeclareOnTossResult) {
      permForLedger = true;
    }


    if (!isToss || permForLedger) {
      await caclculateTime(startTime, "ledger Start")
      await declarePositionAndLedger(marketId, matchData);
      await caclculateTime(startTime, "ledger end")
    }

    if (siteSetting.IS_REDIS && !isToss) {
      await client.del("inplayMatchList");
      await client.del(`${marketId}_data`);
      await client.del(`${marketId}_BlockMarket`);
    }

      let decisionData = {
        result: wonTeamName,
        selectionId: decisionSelectionId,
        resultName: oddsType,
      };
    
      await DecisionService.saveResultForSports(
        marketId,
        oddsType,
        decisionData,
        matchData
      );
    
    await client.del(`matchDecisionFor_${marketId}`);

    
    if (res) {
      return SendResponse(
        res,
        "success",
        `${oddsType} Bet Successfully Done For Market ${marketId}`,
        decisionOdds.data
      );
    } else {
      return decisionOdds.data;
    }
  } catch (error) {
    console.error("Something Went Wrong In Match Odds Decision", error);
    if (res) {
      return SendResponse(
        res,
        "error",
        "Something Went Wrong In Match Odds Decision",
        error
      );
    } else {
      return false;
    }
  } finally {
    await releaseDecisionLock(marketId, decisionLock.token);
  }
};

const declarePositionAndLedger = async (
  marketId,
  matchData,
  isFancy,
  uniqueClientArray
) => {
  let settingData = await getSettingData();
  let transactionData = await wholeTransactionMarketData(
    marketId,
    uniqueClientArray
  );
  if (!matchData) {
    matchData = await BetService.sportByMarketId(marketId);
  }
  if (transactionData) {
    transactionData = convertKeyObject(transactionData, "_id");
  }

  let playWhere = {
    marketId: marketId,
  };

  let isDeclare = 1;

  if (isFancy) {
    playWhere.userId = {
      $in: uniqueClientArray,
    };
    isDeclare = 0;
  }


  // _d(isFancy , "isFancy")
  // _d(playWhere , "playWhere")

  let playData = await BetService.getPlayData(
    playWhere,
    "shareData , clientId , ownerId , subownerId , superadminId , adminId , subadminId , masterId , superagentId , agentId , parentData , userInfo",
    "all"
  );


  let finalPositionData = [];
  let letCommTransactionLog = [];
  let updateUserCoinsInCache = [];
  let userCommStatement = {};
  let insertCommCoins = settingData.insertCommCoinsInUsers ? settingData.insertCommCoinsInUsers : false;



  playData.map((data, key) => {
    const clientId = data.clientId;
    const matchShareData = JSON.parse(data.shareData);
    const parentData = data.parentData;

    let transaction = [];

    if (transactionData[clientId]) {
      transaction = transactionData[clientId];


      let ProfitLossPosition = {
        userId: clientId,
        userInfo: data.userInfo,
        parentData: parentData,
        clientId: clientId,
        marketId: marketId,
        eventId: matchData.eventId,
        eventName: matchData.matchName,
        isDeclare: isDeclare,
        ownerId: data.ownerId,
        subownerId: data.subownerId,
        superadminId: data.superadminId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        masterId: data.masterId,
        superagentId: data.superagentId,
        agentId: data.agentId,
        clientOddsAmount: transaction.clientTotalBookmakerOdds,
        clientSessionAmount: transaction.clientTotalSessionOdds,
        clientOddsComm: transaction.clientTotalBookmakerComm,
        clientSessionComm: transaction.clientTotalSessionComm,
        clientNetAmount: transaction.clientTotalProfitLoss,
        ownerOddsComm: transaction.ownerTotalBookmakerComm,
        ownerSessionComm: transaction.ownerTotalSessionComm,
        subownerOddsComm: transaction.subownerTotalBookmakerComm,
        subownerSessionComm: transaction.subownerTotalSessionComm,
        superadminOddsComm: transaction.superadminTotalBookmakerComm,
        superadminSessionComm: transaction.superadminTotalSessionComm,
        adminOddsComm: transaction.adminTotalBookmakerComm,
        adminSessionComm: transaction.adminTotalSessionComm,
        subadminOddsComm: transaction.subadminTotalBookmakerComm,
        subadminSessionComm: transaction.subadminTotalSessionComm,
        masterOddsComm: transaction.masterTotalBookmakerComm,
        masterSessionComm: transaction.masterTotalSessionComm,
        superagentOddsComm: transaction.superagentTotalBookmakerComm,
        superagentSessionComm: transaction.superagentTotalSessionComm,
        agentOddsComm: transaction.agentTotalBookmakerComm,
        agentSessionComm: transaction.agentTotalSessionComm,
        clientSessionTurnover: transaction.clientSessionTurnOver,
        result: matchData?.wonTeamName,
      };

      // _d(transaction)

      const clientOddsSessionAmount =
        transaction.clientTotalBookmakerOdds +
        transaction.clientTotalSessionOdds;

      let agentNetProfitLoss = 0;
      let agentOwnShare = matchShareData.agentMatchProfitLossShare;
      if (agentOwnShare == 0) {
        agentNetProfitLoss =
          clientOddsSessionAmount * matchShareData.agentMatchProfitLossShare +
          (transaction.agentTotalBookmakerComm +
            transaction.agentTotalSessionComm) *
          matchShareData.agentParentMatchShare;

        agentNetProfitLoss = -1 * agentNetProfitLoss;
      } else {
        agentNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.agentTotalBookmakerComm +
            transaction.agentTotalSessionComm) *
          matchShareData.agentMatchProfitLossShare;
      }

      let agentNetProfitLossSelf = 0;

      let totalClientComm =
        transaction.clientTotalBookmakerComm +
        transaction.clientTotalSessionComm;

      let totalAgentComm =
        transaction.agentTotalBookmakerComm + transaction.agentTotalSessionComm;

      let agentProfitLossWithoutCommShareWise =
        -1 * clientOddsSessionAmount * matchShareData.agentMatchProfitLossShare;

      let agentGiveComm = totalClientComm;

      let agentTakeComm = (1 - matchShareData.agentMatchShare) * totalAgentComm;
      let agentRestComm = agentTakeComm - agentGiveComm;

      let profitLossWithCommAgent =
        agentProfitLossWithoutCommShareWise + agentRestComm;

      agentNetProfitLossSelf = -1 * profitLossWithCommAgent;

      let superagentNetProfitLoss = 0;
      let superagentNetProfitLossSelf = 0;
      let superagentNetOwnShare = matchShareData.superagentMatchProfitLossShare;
      if (superagentNetOwnShare == 0) {
        superagentNetProfitLoss =
          clientOddsSessionAmount *
          matchShareData.superagentMatchProfitLossShare +
          (transaction.superagentTotalBookmakerComm +
            transaction.superagentTotalSessionComm) *
          matchShareData.superagentParentMatchShare;

        superagentNetProfitLoss = -1 * superagentNetProfitLoss;
      } else {
        superagentNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.superagentTotalBookmakerComm +
            transaction.superagentTotalSessionComm) *
          matchShareData.superagentMatchProfitLossShare;
      }

      let totalSuperagentComm =
        transaction.superagentTotalBookmakerComm +
        transaction.superagentTotalSessionComm;
      let profitLossWithoutCommShareWise =
        -1 *
        clientOddsSessionAmount *
        matchShareData.superagentMatchProfitLossShare;
      let superagentGiveComm =
        (1 - matchShareData.agentMatchShare) * totalAgentComm;
      let superagentTakeComm =
        (1 - matchShareData.superagentMatchShare) * totalSuperagentComm;
      let superagentRestComm = superagentTakeComm - superagentGiveComm;
      let profitLossWithCommSuperagent =
        profitLossWithoutCommShareWise + superagentRestComm;
      superagentNetProfitLossSelf = -1 * profitLossWithCommSuperagent;

      let masterNetProfitLoss = 0;
      let masterNetProfitLossSelf = 0;
      let masterNetOwnShare = matchShareData.masterMatchProfitLossShare;
      if (masterNetOwnShare == 0) {
        masterNetProfitLoss =
          clientOddsSessionAmount * matchShareData.masterMatchProfitLossShare +
          (transaction.masterTotalBookmakerComm +
            transaction.masterTotalSessionComm) *
          matchShareData.masterParentMatchShare;

        masterNetProfitLoss = -1 * masterNetProfitLoss;
      } else {
        masterNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.masterTotalBookmakerComm +
            transaction.masterTotalSessionComm) *
          matchShareData.masterMatchProfitLossShare;
      }

      let totalMasterComm =
        transaction.masterTotalBookmakerComm +
        transaction.masterTotalSessionComm;
      let masterProfitLossWithoutCommShareWise =
        -1 *
        clientOddsSessionAmount *
        matchShareData.masterMatchProfitLossShare;
      let masterGiveComm =
        (1 - matchShareData.superagentMatchShare) * totalSuperagentComm;
      let masterTakeComm =
        (1 - matchShareData.masterMatchShare) * totalMasterComm;
      let masterRestComm = masterTakeComm - masterGiveComm;
      let masterProfitLossWithComm =
        masterProfitLossWithoutCommShareWise + masterRestComm;
      masterNetProfitLossSelf = -1 * masterProfitLossWithComm;

      let subadminNetProfitLoss = 0;
      let subadminNetProfitLossSelf = 0;
      let subadminNetOwnShare = matchShareData.subadminMatchProfitLossShare;
      if (subadminNetOwnShare == 0) {
        subadminNetProfitLoss =
          clientOddsSessionAmount *
          matchShareData.subadminMatchProfitLossShare +
          (transaction.subadminTotalBookmakerComm +
            transaction.subadminTotalSessionComm) *
          matchShareData.subadminParentMatchShare;

        subadminNetProfitLoss = -1 * subadminNetProfitLoss;
      } else {
        subadminNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.subadminTotalBookmakerComm +
            transaction.subadminTotalSessionComm) *
          matchShareData.subadminMatchProfitLossShare;
      }

      let totalSubadminComm =
        transaction.subadminTotalBookmakerComm +
        transaction.subadminTotalSessionComm;
      let subadminProfitLossWithoutCommShareWise =
        -1 *
        clientOddsSessionAmount *
        matchShareData.subadminMatchProfitLossShare;
      let subadminGiveComm =
        (1 - matchShareData.masterMatchShare) * totalMasterComm;
      let subadminTakeComm =
        (1 - matchShareData.subadminMatchShare) * totalSubadminComm;
      let subadminRestComm = subadminTakeComm - subadminGiveComm;
      let subadminProfitLossWithComm =
        subadminProfitLossWithoutCommShareWise + subadminRestComm;
      subadminNetProfitLossSelf = -1 * subadminProfitLossWithComm;

      let adminNetProfitLoss = 0;
      let adminNetProfitLossSelf = 0;
      let adminNetOwnShare = matchShareData.adminMatchProfitLossShare;
      if (adminNetOwnShare == 0) {
        adminNetProfitLoss =
          clientOddsSessionAmount * matchShareData.adminMatchProfitLossShare +
          (transaction.adminTotalBookmakerComm +
            transaction.adminTotalSessionComm) *
          matchShareData.adminParentMatchShare;

        adminNetProfitLoss = -1 * adminNetProfitLoss;
      } else {
        adminNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.adminTotalBookmakerComm +
            transaction.adminTotalSessionComm) *
          matchShareData.adminMatchProfitLossShare;
      }

      let totalAdminComm =
        transaction.adminTotalBookmakerComm + transaction.adminTotalSessionComm;
      let adminProfitLossWithoutCommShareWise =
        -1 * clientOddsSessionAmount * matchShareData.adminMatchProfitLossShare;
      let adminGiveComm =
        (1 - matchShareData.subadminMatchShare) * totalSubadminComm;
      let adminTakeComm = (1 - matchShareData.adminMatchShare) * totalAdminComm;
      let adminRestComm = adminTakeComm - adminGiveComm;
      let adminProfitLossWithComm =
        adminProfitLossWithoutCommShareWise + adminRestComm;
      adminNetProfitLossSelf = -1 * adminProfitLossWithComm;

      let superadminNetProfitLoss = 0;
      let superadminNetProfitLossSelf = 0;
      let superadminNetOwnShare = matchShareData.superadminMatchProfitLossShare;
      if (superadminNetOwnShare == 0) {
        superadminNetProfitLoss =
          clientOddsSessionAmount *
          matchShareData.superadminMatchProfitLossShare +
          (transaction.superadminTotalBookmakerComm +
            transaction.superadminTotalSessionComm) *
          matchShareData.superadminParentMatchShare;

        superadminNetProfitLoss = -1 * superadminNetProfitLoss;
      } else {
        superadminNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.superadminTotalBookmakerComm +
            transaction.superadminTotalSessionComm) *
          matchShareData.superadminMatchProfitLossShare;
      }

      let totalSuperadminComm =
        transaction.superadminTotalBookmakerComm +
        transaction.superadminTotalSessionComm;
      let superadminProfitLossWithoutCommShareWise =
        -1 *
        clientOddsSessionAmount *
        matchShareData.superadminMatchProfitLossShare;
      let superadminGiveComm =
        (1 - matchShareData.adminMatchShare) * totalAdminComm;
      let superadminTakeComm =
        (1 - matchShareData.superadminMatchShare) * totalSuperadminComm;
      let superadminRestComm = superadminTakeComm - superadminGiveComm;
      let superadminProfitLossWithComm =
        superadminProfitLossWithoutCommShareWise + superadminRestComm;
      superadminNetProfitLossSelf = -1 * superadminProfitLossWithComm;

      let subownerNetProfitLoss = 0;
      let subownerNetProfitLossSelf = 0;
      let subownerNetOwnShare = matchShareData.subownerMatchProfitLossShare;
      if (subownerNetOwnShare == 0) {
        subownerNetProfitLoss =
          clientOddsSessionAmount *
          matchShareData.subownerMatchProfitLossShare +
          (transaction.subownerTotalBookmakerComm +
            transaction.subownerTotalSessionComm) *
          matchShareData.subownerParentMatchShare;

        subownerNetProfitLoss = -1 * subownerNetProfitLoss;
      } else {
        subownerNetProfitLoss =
          (clientOddsSessionAmount +
            transaction.subownerTotalBookmakerComm +
            transaction.subownerTotalSessionComm) *
          matchShareData.subownerMatchProfitLossShare;
      }

      let totalSubownerComm =
        transaction.subownerTotalBookmakerComm +
        transaction.subownerTotalSessionComm;
      let subownerProfitLossWithoutCommShareWise =
        -1 *
        clientOddsSessionAmount *
        matchShareData.subownerMatchProfitLossShare;
      let subownerGiveComm =
        (1 - matchShareData.adminMatchShare) * totalAdminComm;
      let subownerTakeComm =
        (1 - matchShareData.subownerMatchShare) * totalSubownerComm;
      let subownerRestComm = subownerTakeComm - subownerGiveComm;
      let subownerProfitLossWithComm =
        subownerProfitLossWithoutCommShareWise + subownerRestComm;
      subownerNetProfitLossSelf = -1 * subownerProfitLossWithComm;

      let ownerNetProfitLoss =
        -1 *
        clientOddsSessionAmount *
        matchShareData.ownerMatchProfitLossShare +
        (transaction.ownerTotalBookmakerComm +
          transaction.ownerTotalSessionComm) *
        matchShareData.ownerParentMatchShare;

      ownerNetProfitLoss = -1 * ownerNetProfitLoss;



      profitLossPosition.ownerNetProfitLoss = ownerNetProfitLoss;
      ProfitLossPosition.subownerNetProfitLoss = subownerNetProfitLoss;
      ProfitLossPosition.superadminNetProfitLoss = superadminNetProfitLoss;
      ProfitLossPosition.adminNetProfitLoss = adminNetProfitLoss;
      ProfitLossPosition.subadminNetProfitLoss = subadminNetProfitLoss;
      ProfitLossPosition.masterNetProfitLoss = masterNetProfitLoss;
      ProfitLossPosition.superagentNetProfitLoss = superagentNetProfitLoss;
      ProfitLossPosition.agentNetProfitLoss = agentNetProfitLoss;

      profitLossPosition.ownerNetProfitLossSelf = -1 * ownerNetProfitLoss;
      ProfitLossPosition.subownerNetProfitLossSelf =
        -1 * subownerNetProfitLossSelf;
      ProfitLossPosition.superadminNetProfitLossSelf =
        -1 * superadminNetProfitLossSelf;
      ProfitLossPosition.adminNetProfitLossSelf = -1 * adminNetProfitLossSelf;
      ProfitLossPosition.subadminNetProfitLossSelf =
        -1 * subadminNetProfitLossSelf;
      ProfitLossPosition.masterNetProfitLossSelf = -1 * masterNetProfitLossSelf;
      ProfitLossPosition.superagentNetProfitLossSelf =
        -1 * superagentNetProfitLossSelf;
      ProfitLossPosition.agentNetProfitLossSelf = -1 * agentNetProfitLossSelf;

      let agentLedgerAmt =
        (clientOddsSessionAmount +
          transaction.agentTotalBookmakerComm +
          transaction.agentTotalSessionComm) *
        matchShareData.agentParentMatchShare;

      ProfitLossPosition.agentLedgerAmt = agentLedgerAmt;

      let superagentLedgerAmt =
        (clientOddsSessionAmount +
          transaction.superagentTotalBookmakerComm +
          transaction.superagentTotalSessionComm) *
        matchShareData.superagentParentMatchShare;

      ProfitLossPosition.superagentLedgerAmt = superagentLedgerAmt;

      let masterLedgerAmt =
        (clientOddsSessionAmount +
          transaction.masterTotalBookmakerComm +
          transaction.masterTotalSessionComm) *
        matchShareData.masterParentMatchShare;

      ProfitLossPosition.masterLedgerAmt = masterLedgerAmt;

      let subadminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.subadminTotalBookmakerComm +
          transaction.subadminTotalSessionComm) *
        matchShareData.subadminParentMatchShare;

      ProfitLossPosition.subadminLedgerAmt = subadminLedgerAmt;

      let adminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.adminTotalBookmakerComm +
          transaction.adminTotalSessionComm) *
        matchShareData.adminParentMatchShare;

      ProfitLossPosition.adminLedgerAmt = adminLedgerAmt;

      let superadminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.superadminTotalBookmakerComm +
          transaction.superadminTotalSessionComm) *
        matchShareData.superadminParentMatchShare;

      ProfitLossPosition.superadminLedgerAmt = superadminLedgerAmt;

      let subownerLedgerAmt =
        (clientOddsSessionAmount +
          transaction.subownerTotalBookmakerComm +
          transaction.subownerTotalSessionComm) *
        matchShareData.subownerParentMatchShare;

      ProfitLossPosition.subownerLedgerAmt = subownerLedgerAmt;

      let ownerLedgerAmt =
        (clientOddsSessionAmount +
          transaction.ownerTotalBookmakerComm +
          transaction.ownerTotalSessionComm) *
        matchShareData.ownerParentMatchShare;

      ProfitLossPosition.ownerLedgerAmt = ownerLedgerAmt;

      finalPositionData.push(ProfitLossPosition);

      if (insertCommCoins && !isFancy) {
        let pushCommTransaction = {
          marketId: marketId,
          overallType: "userComm",
          ownerId: data.ownerId,
          subownerId: data.subownerId,
          superadminId: data.superadminId,
          adminId: data.adminId,
          subadminId: data.subadminId,
          masterId: data.masterId,
          superagentId: data.superagentId,
          agentId: data.agentId,
          isComm: 1,
        };

        let userStatement = {
          marketId: marketId,
          sportsType: "cricket",
          gameType: "cricket",
          remark: msg("decision.oddsCommRemark", { matchName: matchData.matchName }),
          userRemark: `user Comm For Match (${matchData.matchName})`,
          statementFor: `userComm`,
          isComm: true,
          amount: 0,
        };

        let clientMatchCommission = matchShareData.clientMatchCommission;
        let clientSessionCommission = matchShareData.clientSessionCommission;

        let agentMatchCommission = matchShareData.agentMatchCommission;
        let agentSessionCommission = matchShareData.agentSessionCommission;

        let superagentMatchCommission =
          matchShareData.superagentMatchCommission;
        let superagentSessionCommission =
          matchShareData.superagentSessionCommission;

        let masterMatchCommission = matchShareData.masterMatchCommission;
        let masterSessionCommission = matchShareData.masterSessionCommission;



        let agentSessionCreditComm = 0
        let agentOddsCreditComm = 0

        let superagentSessionCreditComm = 0
        let superagentOddsCreditComm = 0

        let masterSessionCreditComm = 0
        let masterOddsCreditComm = 0

        let subadminSessionCreditComm = 0
        let subadminOddsCreditComm = 0

        if (!clientMatchCommission && !clientSessionCommission) {
          agentOddsCreditComm = transaction.agentTotalBookmakerComm;
          agentSessionCreditComm = transaction.agentTotalSessionComm;
          pushCommTransaction.userId = data.agentId;
          pushCommTransaction.userType = "agent";
          pushCommTransaction.amount =
            (1 - matchShareData.agentMatchShare) *
            (agentOddsCreditComm + agentSessionCreditComm);

          userStatement.amount = pushCommTransaction.amount;
          userStatement.userId = data.agentId;
          userStatement.userType = "agent";
        }

        if (!agentMatchCommission && !agentSessionCommission) {
          superagentOddsCreditComm = transaction.superagentTotalBookmakerComm;
          superagentSessionCreditComm = transaction?.superagentTotalSessionComm ? transaction?.superagentTotalSessionComm : 0
          pushCommTransaction.userId = data.superagentId;
          pushCommTransaction.userType = "superagent";
          pushCommTransaction.amount =
            (1 - matchShareData.superagentMatchShare) *
            (superagentOddsCreditComm + superagentSessionCreditComm);

          userStatement.userId = data.superagentId;
          userStatement.userType = "superagent";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (!superagentMatchCommission && !superagentSessionCommission) {
          masterOddsCreditComm = transaction.masterTotalBookmakerComm;
          masterSessionCreditComm = transaction.masterTotalSessionComm;
          pushCommTransaction.userId = data.masterId;
          pushCommTransaction.userType = "master";
          pushCommTransaction.amount =
            (1 - matchShareData.masterMatchShare) *
            (masterOddsCreditComm + superagentSessionCreditComm);

          userStatement.userId = data.masterId;
          userStatement.userType = "master";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (!masterMatchCommission && !masterSessionCommission) {
          subadminOddsCreditComm = transaction.subadminTotalBookmakerComm;
          subadminSessionCreditComm = transaction.subadminTotalSessionComm;
          pushCommTransaction.userId = data.subadminId;
          pushCommTransaction.userType = "subadmin";
          pushCommTransaction.amount =
            (1 - matchShareData.subadminMatchShare) *
            (subadminOddsCreditComm + superagentSessionCreditComm);
          
          userStatement.userId = data.subadminId;
          userStatement.userType = "subadmin";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (pushCommTransaction.userId) {
          updateUserCoinsInCache.push(pushCommTransaction.userId);
          letCommTransactionLog.push(pushCommTransaction);
          let userStateId = userStatement.userId.toString();
          if (userCommStatement[userStateId]) {
            userCommStatement[userStateId].amount += userStatement.amount;
          } else {
            userCommStatement[userStateId] = userStatement;
          }
        }
      }
    }
  });


  if (insertCommCoins && !isFancy) {
    let finalInsertStatement = [];
    Object.entries(userCommStatement).forEach(([userId, userData]) => {
      finalInsertStatement.push(userData);
    });
    await StatementModel.deleteMany({
      marketId: marketId,
      isComm: true,
      statementFor: "userComm",
    });
    await StatementModel.insertMany(finalInsertStatement);
    await TransactionLogModel.deleteMany({
      marketId: marketId,
      overallType: "userComm",
      isComm: 1,
    });
    await TransactionLogModel.insertMany(letCommTransactionLog);
    await updateBulkCoinsExposureUserByMarketId(updateUserCoinsInCache);
  }

  await profitLossPosition.deleteMany(playWhere);

  const chunks = chunkArrayNew(finalPositionData, 500);

  for (const chunk of chunks) {
    await profitLossPosition.insertMany(chunk);
  }


  if (!isFancy) {
    await generateLedger(marketId, finalPositionData, matchData);
    await profitLossPosition.updateMany(
      {
        marketId: marketId,
      },
      {
        $set: { isDeclare: 1 },
      }
    );
  } else if (isFancy && settingData.isLedgerDeclareOnFancyResult) {
    await generateLedger(marketId, finalPositionData, matchData, true);
  }
  return true;
};

const generateLedger = async (marketId, positionData, matchData, isFancy) => {
  if (!positionData || isFancy) {
    positionData = await profitLossPosition.find({ marketId: marketId });
  }
  if (!matchData) {
    matchData = await BetService.getMatchList(marketId);
  }


  let userLedger = [];
  positionData.map((data, key) => {
    let commonObj = {
      clientId: data.clientId,
      agentId: data.agentId,
      superagentId: data.superagentId,
      masterId: data.masterId,
      subadminId: data.subadminId,
      adminId: data.adminId,
      superadminId: data.superadminId,
      subownerId: data.subownerId,
      ownerId: data.clientId,
      ledgerType: "cricket",
      marketId: marketId,
      amount: 0,
      isDeclare: 1,
      eventName: matchData.matchName,
      remark: msg("decision.oddsWinRemark", { wonTeamName: matchData.wonTeamName }),
      priority: "",
    };

    let hasKey = userLedger.hasOwnProperty(data.clientId);
    if (!hasKey) {
      userLedger[data.clientId] = {
        ...commonObj,
        ...{
          userId: data.clientId,
          amount: data.clientNetAmount,
          userType: "client",
        },
      };
    }


    const clientAmountWithoutComm =
      data.clientOddsAmount + data.clientSessionAmount;

    let agentShareAmount = -1 * data.agentLedgerAmt;

    let superagentShareAmount = -1 * data.superagentLedgerAmt;

    let masterShareAmount = -1 * data.masterLedgerAmt;

    let subadminShareAmount = -1 * data.subadminLedgerAmt;
    let adminShareAmount = -1 * data.adminLedgerAmt;
    let superadminShareAmount = -1 * data.superadminLedgerAmt;
    let subownerShareAmount = -1 * data.subownerLedgerAmt;
    let ownerShareAmount = -1 * data.ownerLedgerAmt;

    let agentHasKey = userLedger.hasOwnProperty(data.agentId);
    let superagentHasKey = userLedger.hasOwnProperty(data.superagentId);
    let masterHasKey = userLedger.hasOwnProperty(data.masterId);
    let subadminHasKey = userLedger.hasOwnProperty(data.subadminId);
    let adminHasKey = userLedger.hasOwnProperty(data.adminId);
    let superadminHasKey = userLedger.hasOwnProperty(data.superadminId);
    let subownerHasKey = userLedger.hasOwnProperty(data.subownerId);
    let ownerHasKey = userLedger.hasOwnProperty(data.ownerId);

    if (!agentHasKey) {
      userLedger[data.agentId] = {
        ...commonObj,
        ...{
          userId: data.agentId,
          userType: "agent",
        },
      };
    }

    if (!superagentHasKey) {
      userLedger[data.superagentId] = {
        ...commonObj,
        ...{
          userId: data.superagentId,
          userType: "superagent",
        },
      };
    }
    if (!masterHasKey) {
      userLedger[data.masterId] = {
        ...commonObj,
        ...{
          userId: data.masterId,
          userType: "master",
        },
      };
    }
    if (!subadminHasKey) {
      userLedger[data.subadminId] = {
        ...commonObj,
        ...{
          userId: data.subadminId,
          userType: "subadmin",
        },
      };
    }
    if (!adminHasKey) {
      userLedger[data.adminId] = {
        ...commonObj,
        ...{
          userId: data.adminId,
          userType: "admin",
        },
      };
    }
    if (!superadminHasKey) {
      userLedger[data.superadminId] = {
        ...commonObj,
        ...{
          userId: data.superadminId,
          userType: "superadmin",
        },
      };
    }
    if (!subownerHasKey) {
      userLedger[data.subownerId] = {
        ...commonObj,
        ...{
          userId: data.subownerId,
          userType: "subowner",
        },
      };
    }
    if (!ownerHasKey) {
      userLedger[data.ownerId] = {
        ...commonObj,
        ...{
          userId: data.ownerId,
          userType: "owner",
        },
      };
    }
    userLedger[data.agentId].amount += agentShareAmount;
    userLedger[data.superagentId].amount += superagentShareAmount;
    userLedger[data.masterId].amount += masterShareAmount;
    userLedger[data.subadminId].amount += subadminShareAmount;
    userLedger[data.adminId].amount += adminShareAmount;
    userLedger[data.superadminId].amount += superadminShareAmount;
    userLedger[data.subownerId].amount += subownerShareAmount;
    userLedger[data.ownerId].amount += ownerShareAmount;
  });

  let finalPushArray = [];
  const result = Object.values(userLedger).map((item) => {
    const filter = {
      marketId: item.marketId,
      userId: item.userId,
    };

    let ledgerFinalObj = {
      updateOne: {
        filter: filter,
        update: {
          $set: item,
        },
        upsert: true,
      },
    };

    finalPushArray.push(ledgerFinalObj);
  });

  //const insert = await ledgerModel.bulkWrite(finalPushArray);

  await ledgerModel.deleteMany({
    marketId: marketId,
  });

  const ledgerArray = Object.values(userLedger);
  const chunks = chunkArrayNew(ledgerArray, 500);
  for (const chunk of chunks) {
    let insert = await ledgerModel.insertMany(chunk);
  }
  return true;
};

const getPlusMinusByMarketId = async (req, res) => {
  let bodyData = req.body;
  const userData = req.loggedInUser;
  let userWhere = await whereHelper(userData);
  if (bodyData.marketId) {
    userWhere.marketId = bodyData.marketId;
  }

  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  const positionData = await profitLossPosition.find(userWhere);
  const userPriority = UserTypes.indexOf(userData.userType);
  let returnObj = [];

  positionData.forEach((data, key) => {
    let {
      clientOddsAmount,
      clientSessionAmount,
      clientOddsComm,
      clientSessionComm,
      clientNetAmount,

      agentNetProfitLoss,
      agentSessionComm,
      agentOddsComm,

      superagentNetProfitLoss,
      superagentSessionComm,
      superagentOddsComm,
      masterNetProfitLoss,
      masterSessionComm,
      masterOddsComm,
      subadminNetProfitLoss,
      subadminSessionComm,
      subadminOddsComm,
      adminNetProfitLoss,
      adminSessionComm,
      adminOddsComm,
      superadminNetProfitLoss,
      superadminSessionComm,
      superadminOddsComm,
      subownerNetProfitLoss,
      subownerSessionComm,
      subownerOddsComm,
      ownerNetProfitLoss,
      ownerSessionComm,
      ownerOddsComm,
      parentData,
      userId,
      userInfo,
      agentLedgerAmt,
      superagentLedgerAmt,
      masterLedgerAmt,
      subadminLedgerAmt,
      adminLedgerAmt,
      superadminLedgerAmt,
      subownerLedgerAmt,
      ownerLedgerAmt,
    } = data;

    clientOddsAmount = -1 * clientOddsAmount;
    clientSessionAmount = -1 * clientSessionAmount;
    clientNetAmount = -1 * clientNetAmount;

    agentNetProfitLoss = -1 * agentNetProfitLoss;
    superagentNetProfitLoss = -1 * superagentNetProfitLoss;
    masterNetProfitLoss = -1 * masterNetProfitLoss;
    subadminNetProfitLoss = -1 * subadminNetProfitLoss;
    adminNetProfitLoss = -1 * adminNetProfitLoss;
    superadminNetProfitLoss = -1 * superadminNetProfitLoss;
    subownerNetProfitLoss = -1 * subownerNetProfitLoss;
    ownerNetProfitLoss = -1 * ownerNetProfitLoss;

    agentLedgerAmt = -1 * agentLedgerAmt;
    superagentLedgerAmt = -1 * superagentLedgerAmt;
    masterLedgerAmt = -1 * masterLedgerAmt;
    subadminLedgerAmt = -1 * subadminLedgerAmt;
    adminLedgerAmt = -1 * adminLedgerAmt;
    superadminLedgerAmt = -1 * superadminLedgerAmt;
    subownerLedgerAmt = -1 * subownerLedgerAmt;
    ownerLedgerAmt = -1 * ownerLedgerAmt;

    let clientOddsSessionAmount = clientOddsAmount + clientSessionAmount;

    let agentNetAmount =
      clientOddsSessionAmount - (agentSessionComm + agentOddsComm);

    let agentShareAmount = agentNetProfitLoss;
    let agentFinalAmount = agentLedgerAmt;

    let superagentNetAmount =
      clientOddsSessionAmount - (superagentSessionComm + superagentOddsComm);

    let superagentShareAmount = superagentNetProfitLoss;

    let superagentFinalAmount = superagentLedgerAmt;

    let masterNetAmount =
      clientOddsSessionAmount - (masterSessionComm + masterOddsComm);
    let masterShareAmount = masterNetProfitLoss;
    let masterFinalAmount = masterLedgerAmt;

    let adminNetAmount =
      clientOddsSessionAmount - (adminSessionComm + adminOddsComm);
    let adminShareAmount = adminNetProfitLoss;
    let adminFinalAmount = adminLedgerAmt;

    let subadminNetAmount =
      clientOddsSessionAmount - (subadminSessionComm + subadminOddsComm);
    let subadminShareAmount = subadminNetProfitLoss;
    let subadminFinalAmount = subadminLedgerAmt;

    let superadminNetAmount =
      clientOddsSessionAmount - (superadminSessionComm + superadminOddsComm);
    let superadminShareAmount = superadminNetProfitLoss;
    let superadminFinalAmount = superadminLedgerAmt;
    let subownerNetAmount =
      clientOddsSessionAmount - (subownerSessionComm + subownerOddsComm);
    let subownerShareAmount = subownerNetProfitLoss;
    let subownerFinalAmount = subownerLedgerAmt;

    let ownerNetAmount =
      clientOddsSessionAmount - (ownerSessionComm + ownerOddsComm);
    let ownerShareAmount = ownerNetProfitLoss;
    let ownerFinalAmount = ownerLedgerAmt;

    let finalObj = {
      clientOddsAmount,
      clientSessionAmount,
      clientOddsComm,
      clientSessionComm,
      clientNetAmount,
      parentData,
      userId,
    };

    if (userPriority >= 1) {
      let assignObj = {
        agentNetAmount,
        agentShareAmount,
        agentFinalAmount,
        agentSessionComm,
        agentOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }
    if (userPriority >= 2) {
      let assignObj = {
        superagentNetAmount,
        superagentShareAmount,
        superagentFinalAmount,
        superagentSessionComm,
        superagentOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }
    if (userPriority >= 3) {
      let assignObj = {
        masterNetAmount,
        masterShareAmount,
        masterFinalAmount,
        masterSessionComm,
        masterOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }

    if (userPriority >= 4) {
      let assignObj = {
        subadminNetAmount,
        subadminShareAmount,
        subadminFinalAmount,
        subadminSessionComm,
        subadminOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }

    if (userPriority >= 5) {
      let assignObj = {
        adminNetAmount,
        adminShareAmount,
        adminFinalAmount,
        adminSessionComm,
        adminOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }

    if (userPriority >= 6) {
      let assignObj = {
        superadminNetAmount,
        superadminShareAmount,
        superadminFinalAmount,
        superadminSessionComm,
        superadminOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }
    if (userPriority >= 7) {
      let assignObj = {
        subownerNetAmount,
        subownerShareAmount,
        subownerFinalAmount,
        subownerSessionComm,
        subownerOddsComm,
        ownerNetAmount,
        ownerShareAmount,
        ownerFinalAmount,
        ownerSessionComm,
        ownerOddsComm,
      };
      finalObj = Object.assign(finalObj, assignObj);
    }

    finalObj = Object.assign(finalObj, userInfo);
    returnObj.push(finalObj);
  });

  // _dx(returnObj)

  let finalReturnObj = {};
  let ownerObject = {};
  let ownerClientObject = {};
  let subownerObject = {};
  let subownerClientObject = {};
  let superadminObject = {};
  let superadminClientObject = {};
  let adminObject = {};
  let adminClientObject = {};
  let subadminObject = {};
  let subadminClientObject = {};
  let masterObject = {};
  let masterClientObject = {};
  let superagentObject = {};
  let superagentClientObject = {};
  let agentObject = {};
  let agentClientObject = {};

  returnObj.map((returnData) => {
    let userParentData = returnData.parentData;
    let ownerId = userParentData.ownerId;
    let subownerId = userParentData.subownerId;
    let superadminId = userParentData.superadminId;
    let adminId = userParentData.adminId;
    let subadminId = userParentData.subadminId;
    let masterId = userParentData.masterId;
    let superagentId = userParentData.superagentId;
    let agentId = userParentData.agentId;
    let clientId = returnData.userId;

    let ownerkey = ownerObject.hasOwnProperty(ownerId);
    let subownerkey = subownerObject.hasOwnProperty(subownerId);
    let superadminkey = superadminObject.hasOwnProperty(superadminId);
    let adminkey = adminObject.hasOwnProperty(adminId);
    let subadminkey = subadminObject.hasOwnProperty(subadminId);
    let masterkey = masterObject.hasOwnProperty(masterId);
    let superagentkey = superagentObject.hasOwnProperty(superagentId);
    let agentkey = agentObject.hasOwnProperty(agentId);

    if (!ownerkey) {
      ownerClientObject[ownerId] = {
        [subownerId]: `${userParentData.subownername} (${userParentData.subowneruserName})`,
      };

      ownerObject[ownerId] = {
        ownerName: userParentData.ownername,
        ownerUsername: userParentData.owneruserName,
        ownerTotalClientOddsAmount: returnData.clientOddsAmount,
        ownerTotalClientSessionAmount: returnData.clientSessionAmount,

        ownerTotalAgentNetAmount: returnData.agentNetAmount,
        ownerTotalAgentShareAmount: returnData.agentShareAmount,
        ownerTotalAgentFinalAmount: returnData.agentFinalAmount,
        ownerTotalAgentSessionComm: returnData.agentSessionComm,
        ownerTotalAgentOddsComm: returnData.agentOddsComm,

        ownerTotalSuperagentNetAmount: returnData.superagentNetAmount,
        ownerTotalSuperagentShareAmount: returnData.superagentShareAmount,
        ownerTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        ownerTotalSuperagentSessionComm: returnData.superagentSessionComm,
        ownerTotalSuperagentOddsComm: returnData.superagentOddsComm,

        ownerTotalMasterNetAmount: returnData.masterNetAmount,
        ownerTotalMasterShareAmount: returnData.masterShareAmount,
        ownerTotalMasterFinalAmount: returnData.masterFinalAmount,
        ownerTotalMasterSessionComm: returnData.masterSessionComm,
        ownerTotalMasterOddsComm: returnData.masterOddsComm,

        ownerTotalSubadminNetAmount: returnData.subadminNetAmount,
        ownerTotalSubadminShareAmount: returnData.subadminShareAmount,
        ownerTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        ownerTotalSubadminSessionComm: returnData.subadminSessionComm,
        ownerTotalSubadminOddsComm: returnData.subadminOddsComm,

        ownerTotalAdminNetAmount: returnData.adminNetAmount,
        ownerTotalAdminShareAmount: returnData.adminShareAmount,
        ownerTotalAdminFinalAmount: returnData.adminFinalAmount,
        ownerTotalAdminSessionComm: returnData.adminSessionComm,
        ownerTotalAdminOddsComm: returnData.adminOddsComm,

        ownerTotalSuperadminNetAmount: returnData.superadminNetAmount,
        ownerTotalSuperadminShareAmount: returnData.superadminShareAmount,
        ownerTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        ownerTotalSuperadminSessionComm: returnData.superadminSessionComm,
        ownerTotalSuperadminOddsComm: returnData.superadminOddsComm,

        ownerTotalSubownerNetAmount: returnData.subownerNetAmount,
        ownerTotalSubownerShareAmount: returnData.subownerShareAmount,
        ownerTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        ownerTotalSubownerSessionComm: returnData.subownerSessionComm,
        ownerTotalSubownerOddsComm: returnData.subownerOddsComm,

        ownerTotalOwnerNetAmount: returnData.ownerNetAmount,
        ownerTotalOwnerShareAmount: returnData.ownerShareAmount,
        ownerTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        ownerTotalOwnerSessionComm: returnData.ownerSessionComm,
        ownerTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const subownerKey = ownerClientObject[ownerId].hasOwnProperty(
        ownerClientObject[ownerId].subownerId
      );
      if (!subownerKey) {
        ownerClientObject[ownerId][
          subownerId
        ] = `${userParentData.subownername} (${userParentData.subowneruserName})`;
      }

      ownerObject[ownerId].ownerTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      ownerObject[ownerId].ownerTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      ownerObject[ownerId].ownerTotalAgentNetAmount +=
        returnData.agentNetAmount;
      ownerObject[ownerId].ownerTotalAgentShareAmount +=
        returnData.agentShareAmount;
      ownerObject[ownerId].ownerTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      ownerObject[ownerId].ownerTotalAgentSessionComm +=
        returnData.agentSessionComm;
      ownerObject[ownerId].ownerTotalAgentOddsComm += returnData.agentOddsComm;

      ownerObject[ownerId].ownerTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      ownerObject[ownerId].ownerTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      ownerObject[ownerId].ownerTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      ownerObject[ownerId].ownerTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      ownerObject[ownerId].ownerTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      ownerObject[ownerId].ownerTotalMasterNetAmount +=
        returnData.masterNetAmount;
      ownerObject[ownerId].ownerTotalMasterShareAmount +=
        returnData.masterShareAmount;
      ownerObject[ownerId].ownerTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      ownerObject[ownerId].ownerTotalMasterSessionComm +=
        returnData.masterSessionComm;
      ownerObject[ownerId].ownerTotalMasterOddsComm +=
        returnData.masterOddsComm;

      ownerObject[ownerId].ownerTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      ownerObject[ownerId].ownerTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      ownerObject[ownerId].ownerTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      ownerObject[ownerId].ownerTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      ownerObject[ownerId].ownerTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      ownerObject[ownerId].ownerTotalAdminNetAmount +=
        returnData.adminNetAmount;
      ownerObject[ownerId].ownerTotalAdminShareAmount +=
        returnData.adminShareAmount;
      ownerObject[ownerId].ownerTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      ownerObject[ownerId].ownerTotalAdminSessionComm +=
        returnData.adminSessionComm;
      ownerObject[ownerId].ownerTotalAdminOddsComm += returnData.adminOddsComm;

      ownerObject[ownerId].ownerTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      ownerObject[ownerId].ownerTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      ownerObject[ownerId].ownerTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      ownerObject[ownerId].ownerTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      ownerObject[ownerId].ownerTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      ownerObject[ownerId].ownerTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      ownerObject[ownerId].ownerTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      ownerObject[ownerId].ownerTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      ownerObject[ownerId].ownerTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      ownerObject[ownerId].ownerTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      ownerObject[ownerId].ownerTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      ownerObject[ownerId].ownerTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      ownerObject[ownerId].ownerTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      ownerObject[ownerId].ownerTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      ownerObject[ownerId].ownerTotalOwnerOddsComm += returnData.ownerOddsComm;
    }
    finalReturnObj.ownerObject = ownerObject;
    finalReturnObj.ownerClientObject = ownerClientObject;

    if (!subownerkey) {
      subownerClientObject[subownerId] = {
        [superadminId]: `${userParentData.superadminname} (${userParentData.superadminuserName})`,
      };

      subownerObject[subownerId] = {
        subownerName: userParentData.subownername,
        subownerUsername: userParentData.subowneruserName,
        subownerTotalClientOddsAmount: returnData.clientOddsAmount,
        subownerTotalClientSessionAmount: returnData.clientSessionAmount,

        subownerTotalAgentNetAmount: returnData.agentNetAmount,
        subownerTotalAgentShareAmount: returnData.agentShareAmount,
        subownerTotalAgentFinalAmount: returnData.agentFinalAmount,
        subownerTotalAgentSessionComm: returnData.agentSessionComm,
        subownerTotalAgentOddsComm: returnData.agentOddsComm,

        subownerTotalSuperagentNetAmount: returnData.superagentNetAmount,
        subownerTotalSuperagentShareAmount: returnData.superagentShareAmount,
        subownerTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        subownerTotalSuperagentSessionComm: returnData.superagentSessionComm,
        subownerTotalSuperagentOddsComm: returnData.superagentOddsComm,

        subownerTotalMasterNetAmount: returnData.masterNetAmount,
        subownerTotalMasterShareAmount: returnData.masterShareAmount,
        subownerTotalMasterFinalAmount: returnData.masterFinalAmount,
        subownerTotalMasterSessionComm: returnData.masterSessionComm,
        subownerTotalMasterOddsComm: returnData.masterOddsComm,

        subownerTotalSubadminNetAmount: returnData.subadminNetAmount,
        subownerTotalSubadminShareAmount: returnData.subadminShareAmount,
        subownerTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        subownerTotalSubadminSessionComm: returnData.subadminSessionComm,
        subownerTotalSubadminOddsComm: returnData.subadminOddsComm,

        subownerTotalAdminNetAmount: returnData.adminNetAmount,
        subownerTotalAdminShareAmount: returnData.adminShareAmount,
        subownerTotalAdminFinalAmount: returnData.adminFinalAmount,
        subownerTotalAdminSessionComm: returnData.adminSessionComm,
        subownerTotalAdminOddsComm: returnData.adminOddsComm,

        subownerTotalSuperadminNetAmount: returnData.superadminNetAmount,
        subownerTotalSuperadminShareAmount: returnData.superadminShareAmount,
        subownerTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        subownerTotalSuperadminSessionComm: returnData.superadminSessionComm,
        subownerTotalSuperadminOddsComm: returnData.superadminOddsComm,

        subownerTotalSubownerNetAmount: returnData.subownerNetAmount,
        subownerTotalSubownerShareAmount: returnData.subownerShareAmount,
        subownerTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        subownerTotalSubownerSessionComm: returnData.subownerSessionComm,
        subownerTotalSubownerOddsComm: returnData.subownerOddsComm,

        subownerTotalOwnerNetAmount: returnData.ownerNetAmount,
        subownerTotalOwnerShareAmount: returnData.ownerShareAmount,
        subownerTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        subownerTotalOwnerSessionComm: returnData.ownerSessionComm,
        subownerTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const superadminKey = subownerClientObject[subownerId].hasOwnProperty(
        subownerClientObject[subownerId].superadminId
      );
      if (!superadminKey) {
        subownerClientObject[subownerId][
          superadminId
        ] = `${userParentData.superadminname} (${userParentData.superadminuserName})`;
      }

      subownerObject[subownerId].subownerTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      subownerObject[subownerId].subownerTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      subownerObject[subownerId].subownerTotalAgentNetAmount +=
        returnData.agentNetAmount;
      subownerObject[subownerId].subownerTotalAgentShareAmount +=
        returnData.agentShareAmount;
      subownerObject[subownerId].subownerTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      subownerObject[subownerId].subownerTotalAgentSessionComm +=
        returnData.agentSessionComm;
      subownerObject[subownerId].subownerTotalAgentOddsComm +=
        returnData.agentOddsComm;

      subownerObject[subownerId].subownerTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      subownerObject[subownerId].subownerTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      subownerObject[subownerId].subownerTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      subownerObject[subownerId].subownerTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      subownerObject[subownerId].subownerTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      subownerObject[subownerId].subownerTotalMasterNetAmount +=
        returnData.masterNetAmount;
      subownerObject[subownerId].subownerTotalMasterShareAmount +=
        returnData.masterShareAmount;
      subownerObject[subownerId].subownerTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      subownerObject[subownerId].subownerTotalMasterSessionComm +=
        returnData.masterSessionComm;
      subownerObject[subownerId].subownerTotalMasterOddsComm +=
        returnData.masterOddsComm;

      subownerObject[subownerId].subownerTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      subownerObject[subownerId].subownerTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      subownerObject[subownerId].subownerTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      subownerObject[subownerId].subownerTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      subownerObject[subownerId].subownerTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      subownerObject[subownerId].subownerTotalAdminNetAmount +=
        returnData.adminNetAmount;
      subownerObject[subownerId].subownerTotalAdminShareAmount +=
        returnData.adminShareAmount;
      subownerObject[subownerId].subownerTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      subownerObject[subownerId].subownerTotalAdminSessionComm +=
        returnData.adminSessionComm;
      subownerObject[subownerId].subownerTotalAdminOddsComm +=
        returnData.adminOddsComm;

      subownerObject[subownerId].subownerTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      subownerObject[subownerId].subownerTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      subownerObject[subownerId].subownerTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      subownerObject[subownerId].subownerTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      subownerObject[subownerId].subownerTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      subownerObject[subownerId].subownerTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      subownerObject[subownerId].subownerTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      subownerObject[subownerId].subownerTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      subownerObject[subownerId].subownerTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      subownerObject[subownerId].subownerTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      subownerObject[subownerId].subownerTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      subownerObject[subownerId].subownerTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      subownerObject[subownerId].subownerTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      subownerObject[subownerId].subownerTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      subownerObject[subownerId].subownerTotalOwnerOddsComm +=
        returnData.ownerOddsComm;
    }
    finalReturnObj.subownerObject = subownerObject;
    finalReturnObj.subownerClientObject = subownerClientObject;

    if (!superadminkey) {
      superadminClientObject[superadminId] = {
        [adminId]: `${userParentData.adminname} (${userParentData.adminuserName})`,
      };

      superadminObject[superadminId] = {
        superadminName: userParentData.superadminname,
        superadminUsername: userParentData.superadminuserName,
        superadminTotalClientOddsAmount: returnData.clientOddsAmount,
        superadminTotalClientSessionAmount: returnData.clientSessionAmount,

        superadminTotalAgentNetAmount: returnData.agentNetAmount,
        superadminTotalAgentShareAmount: returnData.agentShareAmount,
        superadminTotalAgentFinalAmount: returnData.agentFinalAmount,
        superadminTotalAgentSessionComm: returnData.agentSessionComm,
        superadminTotalAgentOddsComm: returnData.agentOddsComm,

        superadminTotalSuperagentNetAmount: returnData.superagentNetAmount,
        superadminTotalSuperagentShareAmount: returnData.superagentShareAmount,
        superadminTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        superadminTotalSuperagentSessionComm: returnData.superagentSessionComm,
        superadminTotalSuperagentOddsComm: returnData.superagentOddsComm,

        superadminTotalMasterNetAmount: returnData.masterNetAmount,
        superadminTotalMasterShareAmount: returnData.masterShareAmount,
        superadminTotalMasterFinalAmount: returnData.masterFinalAmount,
        superadminTotalMasterSessionComm: returnData.masterSessionComm,
        superadminTotalMasterOddsComm: returnData.masterOddsComm,

        superadminTotalSubadminNetAmount: returnData.subadminNetAmount,
        superadminTotalSubadminShareAmount: returnData.subadminShareAmount,
        superadminTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        superadminTotalSubadminSessionComm: returnData.subadminSessionComm,
        superadminTotalSubadminOddsComm: returnData.subadminOddsComm,

        superadminTotalAdminNetAmount: returnData.adminNetAmount,
        superadminTotalAdminShareAmount: returnData.adminShareAmount,
        superadminTotalAdminFinalAmount: returnData.adminFinalAmount,
        superadminTotalAdminSessionComm: returnData.adminSessionComm,
        superadminTotalAdminOddsComm: returnData.adminOddsComm,

        superadminTotalSuperadminNetAmount: returnData.superadminNetAmount,
        superadminTotalSuperadminShareAmount: returnData.superadminShareAmount,
        superadminTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        superadminTotalSuperadminSessionComm: returnData.superadminSessionComm,
        superadminTotalSuperadminOddsComm: returnData.superadminOddsComm,

        superadminTotalSubownerNetAmount: returnData.subownerNetAmount,
        superadminTotalSubownerShareAmount: returnData.subownerShareAmount,
        superadminTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        superadminTotalSubownerSessionComm: returnData.subownerSessionComm,
        superadminTotalSubownerOddsComm: returnData.subownerOddsComm,

        superadminTotalOwnerNetAmount: returnData.ownerNetAmount,
        superadminTotalOwnerShareAmount: returnData.ownerShareAmount,
        superadminTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        superadminTotalOwnerSessionComm: returnData.ownerSessionComm,
        superadminTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const adminKey = superadminClientObject[superadminId].hasOwnProperty(
        superadminClientObject[superadminId].adminId
      );
      if (!adminKey) {
        superadminClientObject[superadminId][
          adminId
        ] = `${userParentData.adminname} (${userParentData.adminuserName})`;
      }

      superadminObject[superadminId].superadminTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      superadminObject[superadminId].superadminTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      superadminObject[superadminId].superadminTotalAgentNetAmount +=
        returnData.agentNetAmount;
      superadminObject[superadminId].superadminTotalAgentShareAmount +=
        returnData.agentShareAmount;
      superadminObject[superadminId].superadminTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      superadminObject[superadminId].superadminTotalAgentSessionComm +=
        returnData.agentSessionComm;
      superadminObject[superadminId].superadminTotalAgentOddsComm +=
        returnData.agentOddsComm;

      superadminObject[superadminId].superadminTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      superadminObject[superadminId].superadminTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      superadminObject[superadminId].superadminTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      superadminObject[superadminId].superadminTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      superadminObject[superadminId].superadminTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      superadminObject[superadminId].superadminTotalMasterNetAmount +=
        returnData.masterNetAmount;
      superadminObject[superadminId].superadminTotalMasterShareAmount +=
        returnData.masterShareAmount;
      superadminObject[superadminId].superadminTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      superadminObject[superadminId].superadminTotalMasterSessionComm +=
        returnData.masterSessionComm;
      superadminObject[superadminId].superadminTotalMasterOddsComm +=
        returnData.masterOddsComm;

      superadminObject[superadminId].superadminTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      superadminObject[superadminId].superadminTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      superadminObject[superadminId].superadminTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      superadminObject[superadminId].superadminTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      superadminObject[superadminId].superadminTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      superadminObject[superadminId].superadminTotalAdminNetAmount +=
        returnData.adminNetAmount;
      superadminObject[superadminId].superadminTotalAdminShareAmount +=
        returnData.adminShareAmount;
      superadminObject[superadminId].superadminTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      superadminObject[superadminId].superadminTotalAdminSessionComm +=
        returnData.adminSessionComm;
      superadminObject[superadminId].superadminTotalAdminOddsComm +=
        returnData.adminOddsComm;

      superadminObject[superadminId].superadminTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      superadminObject[superadminId].superadminTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      superadminObject[superadminId].superadminTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      superadminObject[superadminId].superadminTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      superadminObject[superadminId].superadminTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      superadminObject[superadminId].superadminTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      superadminObject[superadminId].superadminTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      superadminObject[superadminId].superadminTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      superadminObject[superadminId].superadminTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      superadminObject[superadminId].superadminTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      superadminObject[superadminId].superadminTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      superadminObject[superadminId].superadminTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      superadminObject[superadminId].superadminTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      superadminObject[superadminId].superadminTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      superadminObject[superadminId].superadminTotalOwnerOddsComm +=
        returnData.ownerOddsComm;
    }
    finalReturnObj.superadminObject = superadminObject;
    finalReturnObj.superadminClientObject = superadminClientObject;

    if (!adminkey) {
      adminClientObject[adminId] = {
        [subadminId]: `${userParentData.subadminname} (${userParentData.subadminuserName})`,
      };

      adminObject[adminId] = {
        adminName: userParentData.adminname,
        adminUsername: userParentData.adminuserName,
        adminTotalClientOddsAmount: returnData.clientOddsAmount,
        adminTotalClientSessionAmount: returnData.clientSessionAmount,

        adminTotalAgentNetAmount: returnData.agentNetAmount,
        adminTotalAgentShareAmount: returnData.agentShareAmount,
        adminTotalAgentFinalAmount: returnData.agentFinalAmount,
        adminTotalAgentSessionComm: returnData.agentSessionComm,
        adminTotalAgentOddsComm: returnData.agentOddsComm,

        adminTotalSuperagentNetAmount: returnData.superagentNetAmount,
        adminTotalSuperagentShareAmount: returnData.superagentShareAmount,
        adminTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        adminTotalSuperagentSessionComm: returnData.superagentSessionComm,
        adminTotalSuperagentOddsComm: returnData.superagentOddsComm,

        adminTotalMasterNetAmount: returnData.masterNetAmount,
        adminTotalMasterShareAmount: returnData.masterShareAmount,
        adminTotalMasterFinalAmount: returnData.masterFinalAmount,
        adminTotalMasterSessionComm: returnData.masterSessionComm,
        adminTotalMasterOddsComm: returnData.masterOddsComm,

        adminTotalSubadminNetAmount: returnData.subadminNetAmount,
        adminTotalSubadminShareAmount: returnData.subadminShareAmount,
        adminTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        adminTotalSubadminSessionComm: returnData.subadminSessionComm,
        adminTotalSubadminOddsComm: returnData.subadminOddsComm,

        adminTotalAdminNetAmount: returnData.adminNetAmount,
        adminTotalAdminShareAmount: returnData.adminShareAmount,
        adminTotalAdminFinalAmount: returnData.adminFinalAmount,
        adminTotalAdminSessionComm: returnData.adminSessionComm,
        adminTotalAdminOddsComm: returnData.adminOddsComm,

        adminTotalSuperadminNetAmount: returnData.superadminNetAmount,
        adminTotalSuperadminShareAmount: returnData.superadminShareAmount,
        adminTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        adminTotalSuperadminSessionComm: returnData.superadminSessionComm,
        adminTotalSuperadminOddsComm: returnData.superadminOddsComm,

        adminTotalSubownerNetAmount: returnData.subownerNetAmount,
        adminTotalSubownerShareAmount: returnData.subownerShareAmount,
        adminTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        adminTotalSubownerSessionComm: returnData.subownerSessionComm,
        adminTotalSubownerOddsComm: returnData.subownerOddsComm,

        adminTotalOwnerNetAmount: returnData.ownerNetAmount,
        adminTotalOwnerShareAmount: returnData.ownerShareAmount,
        adminTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        adminTotalOwnerSessionComm: returnData.ownerSessionComm,
        adminTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const subadminKey = adminClientObject[adminId].hasOwnProperty(
        adminClientObject[adminId].subadminId
      );
      if (!subadminKey) {
        adminClientObject[adminId][
          subadminId
        ] = `${userParentData.subadminname} (${userParentData.subadminuserName})`;
      }

      adminObject[adminId].adminTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      adminObject[adminId].adminTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      adminObject[adminId].adminTotalAgentNetAmount +=
        returnData.agentNetAmount;
      adminObject[adminId].adminTotalAgentShareAmount +=
        returnData.agentShareAmount;
      adminObject[adminId].adminTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      adminObject[adminId].adminTotalAgentSessionComm +=
        returnData.agentSessionComm;
      adminObject[adminId].adminTotalAgentOddsComm += returnData.agentOddsComm;

      adminObject[adminId].adminTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      adminObject[adminId].adminTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      adminObject[adminId].adminTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      adminObject[adminId].adminTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      adminObject[adminId].adminTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      adminObject[adminId].adminTotalMasterNetAmount +=
        returnData.masterNetAmount;
      adminObject[adminId].adminTotalMasterShareAmount +=
        returnData.masterShareAmount;
      adminObject[adminId].adminTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      adminObject[adminId].adminTotalMasterSessionComm +=
        returnData.masterSessionComm;
      adminObject[adminId].adminTotalMasterOddsComm +=
        returnData.masterOddsComm;

      adminObject[adminId].adminTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      adminObject[adminId].adminTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      adminObject[adminId].adminTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      adminObject[adminId].adminTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      adminObject[adminId].adminTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      adminObject[adminId].adminTotalAdminNetAmount +=
        returnData.adminNetAmount;
      adminObject[adminId].adminTotalAdminShareAmount +=
        returnData.adminShareAmount;
      adminObject[adminId].adminTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      adminObject[adminId].adminTotalAdminSessionComm +=
        returnData.adminSessionComm;
      adminObject[adminId].adminTotalAdminOddsComm += returnData.adminOddsComm;

      adminObject[adminId].adminTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      adminObject[adminId].adminTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      adminObject[adminId].adminTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      adminObject[adminId].adminTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      adminObject[adminId].adminTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      adminObject[adminId].adminTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      adminObject[adminId].adminTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      adminObject[adminId].adminTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      adminObject[adminId].adminTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      adminObject[adminId].adminTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      adminObject[adminId].adminTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      adminObject[adminId].adminTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      adminObject[adminId].adminTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      adminObject[adminId].adminTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      adminObject[adminId].adminTotalOwnerOddsComm += returnData.ownerOddsComm;
    }
    finalReturnObj.adminObject = adminObject;
    finalReturnObj.adminClientObject = adminClientObject;

    if (!subadminkey) {
      subadminClientObject[subadminId] = {
        [masterId]: `${userParentData.mastername} (${userParentData.masteruserName})`,
      };

      subadminObject[subadminId] = {
        subadminName: userParentData.subadminname,
        subadminUsername: userParentData.subadminuserName,
        subadminIdTotalClientOddsAmount: returnData.clientOddsAmount,
        subadminIdTotalClientSessionAmount: returnData.clientSessionAmount,

        subadminIdTotalAgentNetAmount: returnData.agentNetAmount,
        subadminIdTotalAgentShareAmount: returnData.agentShareAmount,
        subadminIdTotalAgentFinalAmount: returnData.agentFinalAmount,
        subadminIdTotalAgentSessionComm: returnData.agentSessionComm,
        subadminIdTotalAgentOddsComm: returnData.agentOddsComm,

        subadminIdTotalSuperagentNetAmount: returnData.superagentNetAmount,
        subadminIdTotalSuperagentShareAmount: returnData.superagentShareAmount,
        subadminIdTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        subadminIdTotalSuperagentSessionComm: returnData.superagentSessionComm,
        subadminIdTotalSuperagentOddsComm: returnData.superagentOddsComm,

        subadminIdTotalMasterNetAmount: returnData.masterNetAmount,
        subadminIdTotalMasterShareAmount: returnData.masterShareAmount,
        subadminIdTotalMasterFinalAmount: returnData.masterFinalAmount,
        subadminIdTotalMasterSessionComm: returnData.masterSessionComm,
        subadminIdTotalMasterOddsComm: returnData.masterOddsComm,

        subadminIdTotalSubadminNetAmount: returnData.subadminNetAmount,
        subadminIdTotalSubadminShareAmount: returnData.subadminShareAmount,
        subadminIdTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        subadminIdTotalSubadminSessionComm: returnData.subadminSessionComm,
        subadminIdTotalSubadminOddsComm: returnData.subadminOddsComm,

        subadminIdTotalAdminNetAmount: returnData.adminNetAmount,
        subadminIdTotalAdminShareAmount: returnData.adminShareAmount,
        subadminIdTotalAdminFinalAmount: returnData.adminFinalAmount,
        subadminIdTotalAdminSessionComm: returnData.adminSessionComm,
        subadminIdTotalAdminOddsComm: returnData.adminOddsComm,

        subadminIdTotalSuperadminNetAmount: returnData.superadminNetAmount,
        subadminIdTotalSuperadminShareAmount: returnData.superadminShareAmount,
        subadminIdTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        subadminIdTotalSuperadminSessionComm: returnData.superadminSessionComm,
        subadminIdTotalSuperadminOddsComm: returnData.superadminOddsComm,

        subadminIdTotalSubownerNetAmount: returnData.subownerNetAmount,
        subadminIdTotalSubownerShareAmount: returnData.subownerShareAmount,
        subadminIdTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        subadminIdTotalSubownerSessionComm: returnData.subownerSessionComm,
        subadminIdTotalSubownerOddsComm: returnData.subownerOddsComm,

        subadminIdTotalOwnerNetAmount: returnData.ownerNetAmount,
        subadminIdTotalOwnerShareAmount: returnData.ownerShareAmount,
        subadminIdTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        subadminIdTotalOwnerSessionComm: returnData.ownerSessionComm,
        subadminIdTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const masterKey = subadminClientObject[subadminId].hasOwnProperty(
        subadminClientObject[subadminId].masterId
      );

      if (!masterKey) {
        subadminClientObject[subadminId][
          masterId
        ] = `${userParentData.mastername} (${userParentData.masteruserName})`;
      }

      subadminObject[subadminId].subadminTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      subadminObject[subadminId].subadminTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      subadminObject[subadminId].subadminTotalAgentNetAmount +=
        returnData.agentNetAmount;
      subadminObject[subadminId].subadminTotalAgentShareAmount +=
        returnData.agentShareAmount;
      subadminObject[subadminId].subadminTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      subadminObject[subadminId].subadminTotalAgentSessionComm +=
        returnData.agentSessionComm;
      subadminObject[subadminId].subadminTotalAgentOddsComm +=
        returnData.agentOddsComm;

      subadminObject[subadminId].subadminTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      subadminObject[subadminId].subadminTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      subadminObject[subadminId].subadminTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      subadminObject[subadminId].subadminTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      subadminObject[subadminId].subadminTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      subadminObject[subadminId].subadminTotalMasterNetAmount +=
        returnData.masterNetAmount;
      subadminObject[subadminId].subadminTotalMasterShareAmount +=
        returnData.masterShareAmount;
      subadminObject[subadminId].subadminTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      subadminObject[subadminId].subadminTotalMasterSessionComm +=
        returnData.masterSessionComm;
      subadminObject[subadminId].subadminTotalMasterOddsComm +=
        returnData.masterOddsComm;

      subadminObject[subadminId].subadminTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      subadminObject[subadminId].subadminTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      subadminObject[subadminId].subadminTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      subadminObject[subadminId].subadminTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      subadminObject[subadminId].subadminTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      subadminObject[subadminId].subadminTotalAdminNetAmount +=
        returnData.adminNetAmount;
      subadminObject[subadminId].subadminTotalAdminShareAmount +=
        returnData.adminShareAmount;
      subadminObject[subadminId].subadminTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      subadminObject[subadminId].subadminTotalAdminSessionComm +=
        returnData.adminSessionComm;
      subadminObject[subadminId].subadminTotalAdminOddsComm +=
        returnData.adminOddsComm;

      subadminObject[subadminId].subadminTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      subadminObject[subadminId].subadminTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      subadminObject[subadminId].subadminTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      subadminObject[subadminId].subadminTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      subadminObject[subadminId].subadminTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      subadminObject[subadminId].subadminTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      subadminObject[subadminId].subadminTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      subadminObject[subadminId].subadminTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      subadminObject[subadminId].subadminTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      subadminObject[subadminId].subadminTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      subadminObject[subadminId].subadminTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      subadminObject[subadminId].subadminTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      subadminObject[subadminId].subadminTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      subadminObject[subadminId].subadminTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      subadminObject[subadminId].subadminTotalOwnerOddsComm +=
        returnData.ownerOddsComm;
    }
    finalReturnObj.subadminObject = subadminObject;
    finalReturnObj.subadminClientObject = subadminClientObject;

    if (!masterkey) {
      masterClientObject[masterId] = {
        [superagentId]: `${userParentData.superagentname} (${userParentData.superagentuserName})`,
      };

      masterObject[masterId] = {
        masterName: userParentData.mastername,
        masterUsername: userParentData.masteruserName,
        masterTotalClientOddsAmount: returnData.clientOddsAmount,
        masterTotalClientSessionAmount: returnData.clientSessionAmount,

        masterTotalAgentNetAmount: returnData.agentNetAmount,
        masterTotalAgentShareAmount: returnData.agentShareAmount,
        masterTotalAgentFinalAmount: returnData.agentFinalAmount,
        masterTotalAgentSessionComm: returnData.agentSessionComm,
        masterTotalAgentOddsComm: returnData.agentOddsComm,

        masterTotalSuperagentNetAmount: returnData.superagentNetAmount,
        masterTotalSuperagentShareAmount: returnData.superagentShareAmount,
        masterTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        masterTotalSuperagentSessionComm: returnData.superagentSessionComm,
        masterTotalSuperagentOddsComm: returnData.superagentOddsComm,

        masterTotalMasterNetAmount: returnData.masterNetAmount,
        masterTotalMasterShareAmount: returnData.masterShareAmount,
        masterTotalMasterFinalAmount: returnData.masterFinalAmount,
        masterTotalMasterSessionComm: returnData.masterSessionComm,
        masterTotalMasterOddsComm: returnData.masterOddsComm,

        masterTotalSubadminNetAmount: returnData.subadminNetAmount,
        masterTotalSubadminShareAmount: returnData.subadminShareAmount,
        masterTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        masterTotalSubadminSessionComm: returnData.subadminSessionComm,
        masterTotalSubadminOddsComm: returnData.subadminOddsComm,

        masterTotalAdminNetAmount: returnData.adminNetAmount,
        masterTotalAdminShareAmount: returnData.adminShareAmount,
        masterTotalAdminFinalAmount: returnData.adminFinalAmount,
        masterTotalAdminSessionComm: returnData.adminSessionComm,
        masterTotalAdminOddsComm: returnData.adminOddsComm,

        masterTotalSuperadminNetAmount: returnData.superadminNetAmount,
        masterTotalSuperadminShareAmount: returnData.superadminShareAmount,
        masterTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        masterTotalSuperadminSessionComm: returnData.superadminSessionComm,
        masterTotalSuperadminOddsComm: returnData.superadminOddsComm,

        masterTotalSubownerNetAmount: returnData.subownerNetAmount,
        masterTotalSubownerShareAmount: returnData.subownerShareAmount,
        masterTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        masterTotalSubownerSessionComm: returnData.subownerSessionComm,
        masterTotalSubownerOddsComm: returnData.subownerOddsComm,

        masterTotalOwnerNetAmount: returnData.ownerNetAmount,
        masterTotalOwnerShareAmount: returnData.ownerShareAmount,
        masterTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        masterTotalOwnerSessionComm: returnData.ownerSessionComm,
        masterTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const superagentKey = masterClientObject[masterId].hasOwnProperty(
        masterClientObject[masterId].superagentId
      );
      if (!superagentKey) {
        masterClientObject[masterId][
          superagentId
        ] = `${userParentData.superagentname} (${userParentData.superagentuserName})`;
      }

      masterObject[masterId].masterTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      masterObject[masterId].masterTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      masterObject[masterId].masterTotalAgentNetAmount +=
        returnData.agentNetAmount;
      masterObject[masterId].masterTotalAgentShareAmount +=
        returnData.agentShareAmount;
      masterObject[masterId].masterTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      masterObject[masterId].masterTotalAgentSessionComm +=
        returnData.agentSessionComm;
      masterObject[masterId].masterTotalAgentOddsComm +=
        returnData.agentOddsComm;

      masterObject[masterId].masterTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      masterObject[masterId].masterTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      masterObject[masterId].masterTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      masterObject[masterId].masterTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      masterObject[masterId].masterTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      masterObject[masterId].masterTotalMasterNetAmount +=
        returnData.masterNetAmount;
      masterObject[masterId].masterTotalMasterShareAmount +=
        returnData.masterShareAmount;
      masterObject[masterId].masterTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      masterObject[masterId].masterTotalMasterSessionComm +=
        returnData.masterSessionComm;
      masterObject[masterId].masterTotalMasterOddsComm +=
        returnData.masterOddsComm;

      masterObject[masterId].masterTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      masterObject[masterId].masterTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      masterObject[masterId].masterTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      masterObject[masterId].masterTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      masterObject[masterId].masterTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      masterObject[masterId].masterTotalAdminNetAmount +=
        returnData.adminNetAmount;
      masterObject[masterId].masterTotalAdminShareAmount +=
        returnData.adminShareAmount;
      masterObject[masterId].masterTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      masterObject[masterId].masterTotalAdminSessionComm +=
        returnData.adminSessionComm;
      masterObject[masterId].masterTotalAdminOddsComm +=
        returnData.adminOddsComm;

      masterObject[masterId].masterTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      masterObject[masterId].masterTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      masterObject[masterId].masterTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      masterObject[masterId].masterTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      masterObject[masterId].masterTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      masterObject[masterId].masterTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      masterObject[masterId].masterTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      masterObject[masterId].masterTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      masterObject[masterId].masterTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      masterObject[masterId].masterTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      masterObject[masterId].masterTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      masterObject[masterId].masterTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      masterObject[masterId].masterTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      masterObject[masterId].masterTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      masterObject[masterId].masterTotalOwnerOddsComm +=
        returnData.ownerOddsComm;
    }
    finalReturnObj.masterObject = masterObject;
    finalReturnObj.masterClientObject = masterClientObject;

    if (!superagentkey) {
      superagentClientObject[superagentId] = {
        [agentId]: `${userParentData.agentname} (${userParentData.agentuserName})`,
      };

      superagentObject[superagentId] = {
        superagentName: userParentData.superagentname,
        superagentUsername: userParentData.superagentuserName,
        superagentTotalClientOddsAmount: returnData.clientOddsAmount,
        superagentTotalClientSessionAmount: returnData.clientSessionAmount,

        superagentTotalAgentNetAmount: returnData.agentNetAmount,
        superagentTotalAgentShareAmount: returnData.agentShareAmount,
        superagentTotalAgentFinalAmount: returnData.agentFinalAmount,
        superagentTotalAgentSessionComm: returnData.agentSessionComm,
        superagentTotalAgentOddsComm: returnData.agentOddsComm,

        superagentTotalSuperagentNetAmount: returnData.superagentNetAmount,
        superagentTotalSuperagentShareAmount: returnData.superagentShareAmount,
        superagentTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        superagentTotalSuperagentSessionComm: returnData.superagentSessionComm,
        superagentTotalSuperagentOddsComm: returnData.superagentOddsComm,

        superagentTotalMasterNetAmount: returnData.masterNetAmount,
        superagentTotalMasterShareAmount: returnData.masterShareAmount,
        superagentTotalMasterFinalAmount: returnData.masterFinalAmount,
        superagentTotalMasterSessionComm: returnData.masterSessionComm,
        superagentTotalMasterOddsComm: returnData.masterOddsComm,

        superagentTotalSubadminNetAmount: returnData.subadminNetAmount,
        superagentTotalSubadminShareAmount: returnData.subadminShareAmount,
        superagentTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        superagentTotalSubadminSessionComm: returnData.subadminSessionComm,
        superagentTotalSubadminOddsComm: returnData.subadminOddsComm,

        superagentTotalAdminNetAmount: returnData.adminNetAmount,
        superagentTotalAdminShareAmount: returnData.adminShareAmount,
        superagentTotalAdminFinalAmount: returnData.adminFinalAmount,
        superagentTotalAdminSessionComm: returnData.adminSessionComm,
        superagentTotalAdminOddsComm: returnData.adminOddsComm,

        superagentTotalSuperadminNetAmount: returnData.superadminNetAmount,
        superagentTotalSuperadminShareAmount: returnData.superadminShareAmount,
        superagentTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        superagentTotalSuperadminSessionComm: returnData.superadminSessionComm,
        superagentTotalSuperadminOddsComm: returnData.superadminOddsComm,

        superagentTotalSubownerNetAmount: returnData.subownerNetAmount,
        superagentTotalSubownerShareAmount: returnData.subownerShareAmount,
        superagentTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        superagentTotalSubownerSessionComm: returnData.subownerSessionComm,
        superagentTotalSubownerOddsComm: returnData.subownerOddsComm,

        superagentTotalOwnerNetAmount: returnData.ownerNetAmount,
        superagentTotalOwnerShareAmount: returnData.ownerShareAmount,
        superagentTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        superagentTotalOwnerSessionComm: returnData.ownerSessionComm,
        superagentTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const agentKey = superagentClientObject[superagentId].hasOwnProperty(
        superagentClientObject[superagentId].agentId
      );
      if (!agentKey) {
        superagentClientObject[superagentId][
          agentId
        ] = `${userParentData.agentname} (${userParentData.agentuserName})`;
      }

      superagentObject[superagentId].superagentTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      superagentObject[superagentId].superagentTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      superagentObject[superagentId].superagentTotalAgentNetAmount +=
        returnData.agentNetAmount;
      superagentObject[superagentId].superagentTotalAgentShareAmount +=
        returnData.agentShareAmount;
      superagentObject[superagentId].superagentTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      superagentObject[superagentId].superagentTotalAgentSessionComm +=
        returnData.agentSessionComm;
      superagentObject[superagentId].superagentTotalAgentOddsComm +=
        returnData.agentOddsComm;

      superagentObject[superagentId].superagentTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      superagentObject[superagentId].superagentTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      superagentObject[superagentId].superagentTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      superagentObject[superagentId].superagentTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      superagentObject[superagentId].superagentTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      superagentObject[superagentId].superagentTotalMasterNetAmount +=
        returnData.masterNetAmount;
      superagentObject[superagentId].superagentTotalMasterShareAmount +=
        returnData.masterShareAmount;
      superagentObject[superagentId].superagentTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      superagentObject[superagentId].superagentTotalMasterSessionComm +=
        returnData.masterSessionComm;
      superagentObject[superagentId].superagentTotalMasterOddsComm +=
        returnData.masterOddsComm;

      superagentObject[superagentId].superagentTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      superagentObject[superagentId].superagentTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      superagentObject[superagentId].superagentTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      superagentObject[superagentId].superagentTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      superagentObject[superagentId].superagentTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      superagentObject[superagentId].superagentTotalAdminNetAmount +=
        returnData.adminNetAmount;
      superagentObject[superagentId].superagentTotalAdminShareAmount +=
        returnData.adminShareAmount;
      superagentObject[superagentId].superagentTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      superagentObject[superagentId].superagentTotalAdminSessionComm +=
        returnData.adminSessionComm;
      superagentObject[superagentId].superagentTotalAdminOddsComm +=
        returnData.adminOddsComm;

      superagentObject[superagentId].superagentTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      superagentObject[superagentId].superagentTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      superagentObject[superagentId].superagentTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      superagentObject[superagentId].superagentTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      superagentObject[superagentId].superagentTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      superagentObject[superagentId].superagentTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      superagentObject[superagentId].superagentTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      superagentObject[superagentId].superagentTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      superagentObject[superagentId].superagentTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      superagentObject[superagentId].superagentTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      superagentObject[superagentId].superagentTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      superagentObject[superagentId].superagentTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      superagentObject[superagentId].superagentTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      superagentObject[superagentId].superagentTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      superagentObject[superagentId].superagentTotalOwnerOddsComm +=
        returnData.ownerOddsComm;
    }
    finalReturnObj.superagentObject = superagentObject;
    finalReturnObj.superagentClientObject = superagentClientObject;

    delete returnData.parentData;

    if (!agentkey) {
      agentClientObject[agentId] = {
        [clientId]: returnData,
      };
      agentObject[agentId] = {
        agentName: userParentData.agentname,
        agentUsername: userParentData.agentuserName,
        agentTotalClientOddsAmount: returnData.clientOddsAmount,
        agentTotalClientSessionAmount: returnData.clientSessionAmount,

        agentTotalAgentNetAmount: returnData.agentNetAmount,
        agentTotalAgentShareAmount: returnData.agentShareAmount,
        agentTotalAgentFinalAmount: returnData.agentFinalAmount,
        agentTotalAgentSessionComm: returnData.agentSessionComm,
        agentTotalAgentOddsComm: returnData.agentOddsComm,

        agentTotalSuperagentNetAmount: returnData.superagentNetAmount,
        agentTotalSuperagentShareAmount: returnData.superagentShareAmount,
        agentTotalSuperagentFinalAmount: returnData.superagentFinalAmount,
        agentTotalSuperagentSessionComm: returnData.superagentSessionComm,
        agentTotalSuperagentOddsComm: returnData.superagentOddsComm,

        agentTotalMasterNetAmount: returnData.masterNetAmount,
        agentTotalMasterShareAmount: returnData.masterShareAmount,
        agentTotalMasterFinalAmount: returnData.masterFinalAmount,
        agentTotalMasterSessionComm: returnData.masterSessionComm,
        agentTotalMasterOddsComm: returnData.masterOddsComm,

        agentTotalSubadminNetAmount: returnData.subadminNetAmount,
        agentTotalSubadminShareAmount: returnData.subadminShareAmount,
        agentTotalSubadminFinalAmount: returnData.subadminFinalAmount,
        agentTotalSubadminSessionComm: returnData.subadminSessionComm,
        agentTotalSubadminOddsComm: returnData.subadminOddsComm,

        agentTotalAdminNetAmount: returnData.adminNetAmount,
        agentTotalAdminShareAmount: returnData.adminShareAmount,
        agentTotalAdminFinalAmount: returnData.adminFinalAmount,
        agentTotalAdminSessionComm: returnData.adminSessionComm,
        agentTotalAdminOddsComm: returnData.adminOddsComm,

        agentTotalSuperadminNetAmount: returnData.superadminNetAmount,
        agentTotalSuperadminShareAmount: returnData.superadminShareAmount,
        agentTotalSuperadminFinalAmount: returnData.superadminFinalAmount,
        agentTotalSuperadminSessionComm: returnData.superadminSessionComm,
        agentTotalSuperadminOddsComm: returnData.superadminOddsComm,

        agentTotalSubownerNetAmount: returnData.subownerNetAmount,
        agentTotalSubownerShareAmount: returnData.subownerShareAmount,
        agentTotalSubownerFinalAmount: returnData.subownerFinalAmount,
        agentTotalSubownerSessionComm: returnData.subownerSessionComm,
        agentTotalSubownerOddsComm: returnData.subownerOddsComm,

        agentTotalOwnerNetAmount: returnData.ownerNetAmount,
        agentTotalOwnerShareAmount: returnData.ownerShareAmount,
        agentTotalOwnerFinalAmount: returnData.ownerFinalAmount,
        agentTotalOwnerSessionComm: returnData.ownerSessionComm,
        agentTotalOwnerOddsComm: returnData.ownerOddsComm,
      };
    } else {
      const clientKey = agentClientObject[agentId].hasOwnProperty(
        agentClientObject[agentId].clientId
      );
      if (!clientKey) {
        agentClientObject[agentId][clientId] = returnData;
      }

      agentObject[agentId].agentTotalClientOddsAmount +=
        returnData.clientOddsAmount;
      agentObject[agentId].agentTotalClientSessionAmount +=
        returnData.clientSessionAmount;

      agentObject[agentId].agentTotalAgentNetAmount +=
        returnData.agentNetAmount;
      agentObject[agentId].agentTotalAgentShareAmount +=
        returnData.agentShareAmount;
      agentObject[agentId].agentTotalAgentFinalAmount +=
        returnData.agentFinalAmount;
      agentObject[agentId].agentTotalAgentSessionComm +=
        returnData.agentSessionComm;
      agentObject[agentId].agentTotalAgentOddsComm += returnData.agentOddsComm;

      agentObject[agentId].agentTotalSuperagentNetAmount +=
        returnData.superagentNetAmount;
      agentObject[agentId].agentTotalSuperagentShareAmount +=
        returnData.superagentShareAmount;
      agentObject[agentId].agentTotalSuperagentFinalAmount +=
        returnData.superagentFinalAmount;
      agentObject[agentId].agentTotalSuperagentSessionComm +=
        returnData.superagentSessionComm;
      agentObject[agentId].agentTotalSuperagentOddsComm +=
        returnData.superagentOddsComm;

      agentObject[agentId].agentTotalMasterNetAmount +=
        returnData.masterNetAmount;
      agentObject[agentId].agentTotalMasterShareAmount +=
        returnData.masterShareAmount;
      agentObject[agentId].agentTotalMasterFinalAmount +=
        returnData.masterFinalAmount;
      agentObject[agentId].agentTotalMasterSessionComm +=
        returnData.masterSessionComm;
      agentObject[agentId].agentTotalMasterOddsComm +=
        returnData.masterOddsComm;

      agentObject[agentId].agentTotalSubadminNetAmount +=
        returnData.subadminNetAmount;
      agentObject[agentId].agentTotalSubadminShareAmount +=
        returnData.subadminShareAmount;
      agentObject[agentId].agentTotalSubadminFinalAmount +=
        returnData.subadminFinalAmount;
      agentObject[agentId].agentTotalSubadminSessionComm +=
        returnData.subadminSessionComm;
      agentObject[agentId].agentTotalSubadminOddsComm +=
        returnData.subadminOddsComm;

      agentObject[agentId].agentTotalAdminNetAmount +=
        returnData.adminNetAmount;
      agentObject[agentId].agentTotalAdminShareAmount +=
        returnData.adminShareAmount;
      agentObject[agentId].agentTotalAdminFinalAmount +=
        returnData.adminFinalAmount;
      agentObject[agentId].agentTotalAdminSessionComm +=
        returnData.adminSessionComm;
      agentObject[agentId].agentTotalAdminOddsComm += returnData.adminOddsComm;

      agentObject[agentId].agentTotalSuperadminNetAmount +=
        returnData.superadminNetAmount;
      agentObject[agentId].agentTotalSuperadminShareAmount +=
        returnData.superadminShareAmount;
      agentObject[agentId].agentTotalSuperadminFinalAmount +=
        returnData.superadminFinalAmount;
      agentObject[agentId].agentTotalSuperadminSessionComm +=
        returnData.superadminSessionComm;
      agentObject[agentId].agentTotalSuperadminOddsComm +=
        returnData.superadminOddsComm;

      agentObject[agentId].agentTotalSubownerNetAmount +=
        returnData.subownerNetAmount;
      agentObject[agentId].agentTotalSubownerShareAmount +=
        returnData.subownerShareAmount;
      agentObject[agentId].agentTotalSubownerFinalAmount +=
        returnData.subownerFinalAmount;
      agentObject[agentId].agentTotalSubownerSessionComm +=
        returnData.subownerSessionComm;
      agentObject[agentId].agentTotalSubownerOddsComm +=
        returnData.subownerOddsComm;

      agentObject[agentId].agentTotalOwnerNetAmount +=
        returnData.ownerNetAmount;
      agentObject[agentId].agentTotalOwnerShareAmount +=
        returnData.ownerShareAmount;
      agentObject[agentId].agentTotalOwnerFinalAmount +=
        returnData.ownerFinalAmount;
      agentObject[agentId].agentTotalOwnerSessionComm +=
        returnData.ownerSessionComm;
      agentObject[agentId].agentTotalOwnerOddsComm += returnData.ownerOddsComm;
    }
    finalReturnObj.agentObject = agentObject;
    finalReturnObj.agentClientObject = agentClientObject;
  });

  return SendResponse(
    res,
    "success",
    "Fetched Data Successfully",
    finalReturnObj
  );

  //_dx(positionData);
};

const positionLogData = async (req, res) => {
  const marketId = req.body.marketId;
  const userData = req.loggedInUser;
  let userWhere = whereHelper(userData, { marketId: marketId });
  const positionData = await profitLossPosition.find(userWhere);
  return SendResponse(res, "success", "successfully fetch data", positionData);
};

const completeSportList = async (req, res) => {
  try {
    const userData = req.loggedInUser;
    let bodyData = req?.body;
    const JoiSchema = Joi.object({
      pageNo: Joi.number().required(),
      size: Joi.number().required().max(50).min(1),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    let query = {};
    let specific = {
      marketId: 1,
      matchName: 1,
      matchType: 1,
      eventId: 1,
      sportId: 1,
      sportType: 1,
      matchDate: 1,
      isDeclare: 1,
      status: 1,
      wonTeamName: 1,
      date: 1,
      updatedAt: 1,
    };
    let sortData = {
      _id: -1,
    };
    if (bodyData.marketId) {
      query["marketId"] = bodyData.marketId;
    }

    if (bodyData.sportId) {
      query["sportId"] = bodyData.sportId;
    }

    if (Array.isArray(bodyData.sportId)) {
      query["sportId"] = { $in: bodyData.sportId };
    }

    query["isDeclare"] = 1;

    let sportData = [];
    let sendData = {};

    if (bodyData.inplay) {
      delete query.isDeclare;
    }

    let total = await sportList.countDocuments(query);

    sportData = await sportList
      .find(query, specific)
      .sort(sortData)
      .skip(bodyData.size * (bodyData.pageNo - 1))
      .limit(bodyData.size);

    sendData = sportData;

    if (bodyData.isAccountDetails) {
      sportData = convertKeyObjectAndSeperateid(sportData, "marketId");
      const marketIdArray = sportData.idArray;
      let marketData = sportData.returnDataObject;

      marketData = JSON.parse(JSON.stringify(marketData));
      const userType = userData.userType;
      let field = `${userType}Id`;
      var resMatch = await profitLossPosition.aggregate([
        {
          $match: {
            [field]: new ObjectId(userData.userId),
            marketId: { $in: marketIdArray },
          },
        },
        {
          $group: {
            _id: "$marketId",
            totalProfitLoss: { $sum: `$${userType + "NetProfitLossSelf"}` },
            clientProfitLoss: { $sum: `$clientNetAmount` },
          },
        },
      ]);


     // _d(resMatch)

      if (resMatch) {
        resMatch.map((data, key) => {
          if (marketData[data._id]) {
            let totalProfitLoss = 0;
            let clientProfitLoss = 0;
            if (data.totalProfitLoss || data.clientProfitLoss) {
              totalProfitLoss = -1 * data.totalProfitLoss;
              clientProfitLoss = -1 * data.clientProfitLoss;
            }
            marketData[data._id].totalProfit = totalProfitLoss;
            marketData[data._id].clientProfitLoss = clientProfitLoss;
          }
        });
      }


      sendData = marketData;
      var cricRes = await CrickTransactionLogModel.aggregate([
        {
          $match: {
            [field]: new ObjectId(userData.userId),
            marketId: { $in: marketIdArray },
          },
        },
        {
          $group: {
            _id: "$marketId",
            totalProfitLoss: { $sum: `$${userType + "ProfitLoss"}` },
          },
        },
      ]);



      if (cricRes) {
        cricRes.map((data, key) => {
          if (marketData[data._id]) {
            let cricTotalProfitLoss = 0;
            if (data.totalProfitLoss || data.clientProfitLoss) {
              cricTotalProfitLoss = -1 * data.totalProfitLoss;
            }
            marketData[data._id].cricTotalProfitLoss = cricTotalProfitLoss;
          }
        });
      }

    }

    let returnData = {
      matchData: sendData,
      totalCount: total,
    };

    return SendResponse(
      res,
      "success",
      "Fetched Data Successfully",
      returnData
    );
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "Failed In Complete Sport List Details",
      error
    );
  }
};

const commissionReport = async (req, res) => {
  try {
    const userData = req.loggedInUser;
    const userType = userData.userType;
    let userPriority = UserTypes.indexOf(userType);
    let downLineType = UserTypes[userPriority - 1];
    let bodyData = req?.body;
    let query = {};
    let sortData = {
      _id: -1,
    };
    if (bodyData.marketId) {
      query["marketId"] = bodyData.marketId;
    }

    if (bodyData.sportId) {
      query["sportId"] = bodyData.sportId;
    }

    if (bodyData.fromDate && bodyData.toDate) {
      query.createdAt = {
        $gte: new Date(bodyData.fromDate),
        $lte: new Date(bodyData.toDate),
      };
    }

    let field = `${userType}Id`;
    query[field] = new ObjectId(userData.userId);

    let group = {
      _id: "$marketId",
      eventName: { $first: "$eventName" },
      isCasino: { $first: "$isCasino" },
      date: { $first: "$date" },
      oddsComm: { $sum: `$${userType + "OddsComm"}` },
      sessionComm: { $sum: `$${userType + "SessionComm"}` },
    };

    if (userType != "client") {
      group._id = `$${downLineType}Id`;
      group.downlineOddsComm = { $sum: `$${downLineType + "OddsComm"}` };
      group.downlineSessionComm = {
        $sum: `$${downLineType + "SessionComm"}`,
      };
      group.parentData = { $first: "$parentData" };
    }

    var resMatch = await profitLossPosition.aggregate([
      {
        $match: query,
      },
      {
        $group: group,
      },
      {
        $sort: sortData,
      },
    ]);

    if (userType != "client") {
      resMatch.map((data) => {
        let parentData = data.parentData;
        const userCode = parentData[downLineType + "userName"];
        const userName = parentData[downLineType + "name"];
        data.name = userName;
        data.code = userCode;
        delete data.parentData;
        return data;
      });
    }

    return SendResponse(res, "success", "Fetched Data Successfully", resMatch);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "Failed In Complete Sport List Details",
      error
    );
  }
};

const userCommissionReport = async (req, res) => {
  try {
    const bodyData = req.body;
    const userData = req.loggedInUser;
    let userType = userData.userType;
    let userPriority = UserTypes.indexOf(userType);
    let downLineType = UserTypes[userPriority - 1];
    let query = {};

    if (bodyData.agentId) {
      query = await whereHelper(userData, {
        agentId: new ObjectId(bodyData.agentId),
      });
    } else {
      let field = `${userType}Id`;
      query[field] = new ObjectId(userData.userId);
    }

    let userDetails = {};

    if (bodyData.username) {
      userDetails = await getUserIdByUsername(bodyData.username);
      if (userDetails.status != "success") {
        return SendResponse(res, "error", "user not found");
      }
      userDetails = userDetails.userDetails;
      if (userDetails.userType != "agent") {
        return SendResponse(res, "error", "only type agent Username");
      }

      query = await whereHelper(userData, {
        agentId: new ObjectId(userDetails.userId),
      });

      userType = "agent"
      downLineType = "client";
    }

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (userData.userType == "agent") {
      let field = `${userData.userType}Id`;
      query[field] = new ObjectId(userData.userId);
      userType = "agent"
      downLineType = "client";
    }

    query.isDeclare = 1;

    let group = {
      _id: "$clientId",
      userInfo: { $first: "$userInfo" },
      casinoComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 1] }],
            },
            `$${userType + "OddsComm"}`,
            0,
          ],
        },
      },
      oddsComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 0] }],
            },
            `$${userType + "OddsComm"}`,
            0,
          ],
        },
      },
      sessionComm: { $sum: `$${userType + "SessionComm"}` },
      downlineCasinoComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 1] }],
            },
            `$${downLineType + "OddsComm"}`,
            0,
          ],
        },
      },
      downlineOddsComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 0] }],
            },
            `$${downLineType + "OddsComm"}`,
            0,
          ],
        },
      },
      downlineSessionComm: {
        $sum: `$${downLineType + "SessionComm"}`,
      },
    };

    var resMatch = await profitLossPosition
      .aggregate([
        {
          $match: query,
        },
        {
          $group: group,
        },
      ])
      .sort({ _id: -1 });


     //_d(resMatch , "resMatch")

    let ledgerGroup = {
      _id: "$userId",
      oddsComm: { $sum: `$oddsComm` },
      casinoComm: { $sum: `$casinoComm` },
      sessionComm: { $sum: `$sessionComm` },
    };

    delete query.date;
    delete query.isDeclare;

    var submitLedger = await commLedgerModel.aggregate([
      {
        $match: query,
      },
      {
        $group: ledgerGroup,
      },
    ]);

    submitLedger = await convertKeyObject(submitLedger, "_id");


   //  _d(submitLedger)

    resMatch.map((data, key) => {
      let finalOddsComm = data.oddsComm;
      let finalSessionComm = data.sessionComm;
      let finalCasinoComm = data.casinoComm;

      let downlineOddsComm = data.downlineOddsComm;
      let downlineSessionComm = data.downlineSessionComm;
      let downlineCasinoComm = data.downlineCasinoComm;

      if (submitLedger[data._id]) {
        let submitData = submitLedger[data._id];
        finalSessionComm = finalSessionComm - submitData.sessionComm;
        finalOddsComm = finalOddsComm - submitData.oddsComm;
        finalCasinoComm = finalCasinoComm - submitData.casinoComm;

        downlineSessionComm = downlineSessionComm - submitData.sessionComm;
        downlineOddsComm = downlineOddsComm - submitData.oddsComm;
        downlineCasinoComm = downlineCasinoComm - submitData.casinoComm;
      }



      if (downlineOddsComm < 0) {
        downlineOddsComm = 0
      }

      if (downlineSessionComm < 0) {
        downlineSessionComm = 0
      }

      if (downlineCasinoComm < 0) {
        downlineCasinoComm = 0
      }

      resMatch[key].oddsComm = finalOddsComm;
      resMatch[key].sessionComm = finalSessionComm;
      resMatch[key].casinoComm = finalCasinoComm;

      resMatch[key].downlineOddsComm = downlineOddsComm;
      resMatch[key].downlineSessionComm = downlineSessionComm;
      resMatch[key].downlineCasinoComm = downlineCasinoComm;
    });
    return SendResponse(res, "success", userDetails, resMatch);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "Failed In Comm report for client",
      error
    );
  }
};

const resetComm = async (req, res) => {
  try {
    const userData = req.loggedInUser;
    const userType = userData.userType;
    const bodyData = req.body;
    if (!bodyData.userId) {
      return SendResponse(res, "error", "userId is required");
    }
    const userId = bodyData.userId;

    if (userType != "agent") {
      return SendResponse(res, "error", "Only agent can reset commission");
    }

    let userPriority = UserTypes.indexOf(userType);
    let downLineType = UserTypes[userPriority - 1];
    let query = {};
    let field = `${userType}Id`;
    query[field] = new ObjectId(userData.userId);
    query.userId = new ObjectId(userId);
    query.isDeclare = 1;

    let group = {
      _id: "$clientId",
      userInfo: { $first: "$userInfo" },
      //oddsComm: { $sum: `$${userType + "OddsComm"}` },
      casinoComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 1] }],
            },
            `$${userType + "OddsComm"}`,
            0,
          ],
        },
      },
      oddsComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isCasino", 0] }],
            },
            `$${userType + "OddsComm"}`,
            0,
          ],
        },
      },
      sessionComm: { $sum: `$${userType + "SessionComm"}` },
    };

    var resMatch = await profitLossPosition.aggregate([
      {
        $match: query,
      },
      {
        $group: group,
      },
    ]);

    // _d(resMatch)

    let oddsComm = 0;
    let sessionComm = 0;
    let casinoComm = 0;

    if (resMatch) {
      oddsComm = resMatch[0].oddsComm;
      sessionComm = resMatch[0].sessionComm;
      casinoComm = resMatch[0].casinoComm;
      userInfo = resMatch[0].userInfo;
    }


    let subOddsComm = 0;
    let subSessionComm = 0;
    let subCasinoComm = 0;

    delete query.date;
    delete query.isDeclare;


    let ledgerGroup = {
      _id: "$userId",
      oddsComm: { $sum: `$oddsComm` },
      casinoComm: { $sum: `$casinoComm` },
      sessionComm: { $sum: `$sessionComm` },
    };

    var submitLedger = await commLedgerModel.aggregate([
      {
        $match: query,
      },
      {
        $group: ledgerGroup,
      },
    ]);

    submitLedger = await convertKeyObject(submitLedger, "_id");


    resMatch.map((data, key) => {
      let finalOddsComm = data.oddsComm;
      let finalSessionComm = data.sessionComm;
      let finalCasinoComm = data.casinoComm;

      let downlineOddsComm = data.downlineOddsComm;
      let downlineSessionComm = data.downlineSessionComm;
      let downlineCasinoComm = data.downlineCasinoComm;

      if (submitLedger[data._id]) {
        let submitData = submitLedger[data._id];
        finalSessionComm = finalSessionComm - submitData.sessionComm;
        finalOddsComm = finalOddsComm - submitData.oddsComm;
        finalCasinoComm = finalCasinoComm - submitData.casinoComm;

        downlineSessionComm = downlineSessionComm - submitData.sessionComm;
        downlineOddsComm = downlineOddsComm - submitData.oddsComm;
        downlineCasinoComm = downlineCasinoComm - submitData.casinoComm;
      }



      if (downlineOddsComm < 0) {
        downlineOddsComm = 0
      }

      if (downlineSessionComm < 0) {
        downlineSessionComm = 0
      }

      if (downlineCasinoComm < 0) {
        downlineCasinoComm = 0
      }

      resMatch[key].oddsComm = finalOddsComm;
      resMatch[key].sessionComm = finalSessionComm;
      resMatch[key].casinoComm = finalCasinoComm;

      resMatch[key].downlineOddsComm = downlineOddsComm ? downlineOddsComm : 0;
      resMatch[key].downlineSessionComm = downlineSessionComm ? downlineSessionComm : 0;
      resMatch[key].downlineCasinoComm = downlineCasinoComm ? downlineCasinoComm : 0;
    });



    let insertData = false
    if (resMatch[0].casinoComm > 0 || resMatch[0].sessionComm > 0 || resMatch[0].oddsComm > 0) {
      insertData = true
    }

    if (!insertData) {
      return SendResponse(res, "error", "No commission available to reset");
    }

    delete query.isDeclare;
    const user = await UserModel.findOne(query);

    let insertObj = {
      userId: userId,
      oddsComm: resMatch[0].oddsComm > 0 ? resMatch[0].oddsComm : 0,
      sessionComm: resMatch[0].sessionComm > 0 ? resMatch[0].sessionComm : 0,
      casinoComm: resMatch[0].casinoComm > 0 ? resMatch[0].casinoComm : 0,
      remark: msg("decision.commSubmittedRemark", { username: userInfo.username, name: userInfo.name }),
      ownerId: user.ownerId,
      subownerId: user.subownerId,
      superadminId: user.superadminId,
      subadminId: user.subadminId,
      adminId: user.adminId,
      masterId: user.masterId,
      superagentId: user.superagentId,
      agentId: user.agentId,
      clientId: user.clientId,
      userType: user.userType,
      doneBy: `${userData.username} (${userData.name})`,
    };

    await commLedgerModel.create(insertObj);

    return SendResponse(res, "success", "reset comm done successfully");
  } catch (error) {
    console.log("error", error);
    return SendResponse(
      res,
      "error",
      "Failed In Comm report for client",
      error
    );
  }
};

const resetCommList = async (req, res) => {
  try {
    const userData = req.loggedInUser;
    const userType = userData.userType;
    const bodyData = req.body;
    if (!bodyData.userId) {
      return SendResponse(res, "error", "userId is required");
    }
    const userId = bodyData.userId;
    let query = {};
    let field = `${userType}Id`;
    query[field] = new ObjectId(userData.userId);
    query.userId = new ObjectId(userId);

    const listData = await commLedgerModel.find(query, {
      userId: 1,
      remark: 1,
      oddsComm: 1,
      sessionComm: 1,
      casinoComm: 1,
      userType: 1,
      createdAt: 1,
    });

    return SendResponse(
      res,
      "success",
      "reset com list fetch  successfully",
      listData
    );
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "Failed In reset com list for client",
      error
    );
  }
};

const sessionUpdate = async (req, res) => {
  try {
      let loginData = req.loggedInUser
    if (!req.loggedInUser) {
      return SendResponse(res, "error", "something went wrong in sessionUpdate");
    }
    let userType = loginData.userType
    if (userType != "owner" || userType !="staff") {
      return SendResponse(res, "error", "only owner and staff can do sessionUpdate");
    }
    
    let bodyData = req.body;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      selectionId: Joi.string().required(),
      updateType: Joi.string().required(),
    }).options({ abortEarly: false });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    const selectionId = bodyData.selectionId;
    const marketId = bodyData.marketId;
    const updateType = bodyData.updateType;

    let where = {
      marketId: marketId,
      selectionId: selectionId,
    };

    const sessionBetList = await BetService.getFancyBetList(where);

    if (sessionBetList.length < 1) {
      return SendResponse(res, "successs", `${updateType} Done Successfully`);
    }
    const clientIdData = [
      ...new Set(sessionBetList.map((objId) => objId.clientId.toString())),
    ];

    if (updateType == "cancel") {
      await FancyBetModel.updateMany(where, {
        $set: { isDeleted: 1, isDeclare: 0, decisionRun: "" },
      });

      await TransactionLogModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId + "",
        overallType: { $in: ["fancyOdds", "fancyOddsComm"] },
        forBet: 1,
      });

      await StatementModel.deleteMany({
        marketId: marketId,
        selectionId: selectionId,
        statementFor: { $in: ["fancyBet", "fancyBetComm"] },
      });

      let playWhere = {
        clientId: {
          $in: clientIdData,
        },
        marketId: marketId,
      };

      await PlayModel.updateMany(playWhere, {
        updateSessionBet: true,
      });

      const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
        uniqueClientData,
        marketId,
        selectionId
      );
      return SendResponse(
        res,
        "success",
        "Fancy Cancel Successfully Done",
        updateUserCoins
      );
    }

    let playWhere = {
      clientId: {
        $in: uniqueClientData,
      },
      marketId: marketId,
    };
    let playData = await BetService.getPlayData(
      playWhere,
      "shareData , clientId",
      "all"
    );

    await StatementModel.deleteMany({
      marketId: marketId,
      selectionId: selectionId,
      statementFor: { $in: ["fancyBet", "fancyBetComm"] },
    });

    const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData,
      marketId,
      selectionId
    );
    return SendResponse(
      res,
      "success",
      "Fancy Bet Successfully Done",
      updateUserCoins
    );
  } catch (error) {
    console.log("Something Went Wrong In Session Decision", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Session Decision",
      error
    );
  }
};

const generateCasinoClientLedger = async (req, res) => {
  try {
    _d(`Ledger script run at ${_date_time()}`);
    let bodyData = {};
    let showDate = _date();
    if (req && req.body) {
      bodyData = req.body;
      if (bodyData?.date) {
        showDate = await _date(bodyData.date);
      }
    }
    let todayDate = moment().startOf("day").valueOf();
    if (bodyData.date) {
      todayDate = moment(bodyData.date).startOf("day").valueOf();
    }
    let dateWhere = await dateWhereCond(bodyData.date , bodyData.date);

    let where = {
      overallType: "internationalCasino",
      date: dateWhere,
      isDeclare: {
        $in: [true, 1],
      },
    };

    var resData = await TransactionLogModel.aggregate([
      {
        $match: where,
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            marketId: "$marketId",
            remarks: "$remarks",
          },
          casinoName: { $first: "$remarks" },
          marketId: { $first: "$marketId" },
          userId: { $first: "$userId" },
          date: { $first: "$date" },
          createdAt: { $first: "$createdAt" },
          agentId: { $first: "$agentId" },
          ownerId: { $first: "$ownerId" },
          subownerId: { $first: "$subownerId" },
          superadminId: { $first: "$superadminId" },
          adminId: { $first: "$adminId" },
          subadminId: { $first: "$subadminId" },
          masterId: { $first: "$masterId" },
          superagentId: { $first: "$superagentId" },
          agentId: { $first: "$agentId" },
          totalCoins: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.userId": 1, "_id.marketId": 1 },
      },
    ]);

    // _dx(resData)

    let allData = [];
    let clientArray = [];
    let clientIdArray = [];
    resData.map((data, key) => {
      let clientId = data._id.userId;
      let hasKey = clientArray.hasOwnProperty(clientId);
      if (!hasKey) {
        clientArray[clientId] = clientId;
        clientIdArray.push(clientId);
      }
    });

    resData.map((data, key) => {
      let agentId = data.agentId;
      let superagentId = data.superagentId;
      let masterId = data.masterId;
      let subadminId = data.subadminId;
      let adminId = data.adminId;
      let superadminId = data.superadminId;
      let subownerId = data.subownerId;
      let ownerId = data.ownerId;
      let clientId = data.userId;
      let clientLedger = {
        userId: clientId,
        clientId: clientId,
        agentId: agentId,
        superagentId: superagentId,
        masterId: masterId,
        adminId: adminId,
        subadminId: subadminId,
        adminId: data.adminId,
        superadminId: superadminId,
        subownerId: subownerId,
        ownerId: ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName} (${showDate})`,
        remark: msg("decision.casinoLedgerRemark", { casinoName: data.casinoName, date: showDate }),
        date: data.date,
        userType: "client",
        ledgerType: "internationalCasino",
        date: data.date,
        amount: data.totalCoins,
        isDeclare: true,
        date: todayDate,
      };
      allData.push(clientLedger);
    });

    await ledgerModel.deleteMany({
      date: dateWhere,
      ledgerType: "internationalCasino",
      isDeclare: true,
    });


    let updateClientLedger = await ledgerModel.create(allData);

    await generateUserLedger(todayDate, dateWhere);
    await CasinoProfitLossAndComm(bodyData);



    if (res) {
      return SendResponse(res, "success", "ledger updated Successfully Done");
    } else {
      console.log(`Ledger script run at ${_date_time()}`);
      return true;
    }
  } catch (error) {
    console.log("Something Went Wrong In ledger updated", error);
    if (res) {
      return SendResponse(
        res,
        "error",
        "Something Went Wrong In ledger updated for client",
        error
      );
    }
  }
};

const betsDelete = async (req, res) => {
  const bodyData = req.body;
  const userData = req.loggedInUser;
  const JoiSchema = Joi.object({
    _id: Joi.array().required(),
    password: Joi.string().required(),
    isDeleted: Joi.boolean().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  if (!userData || !["owner", "subowner"].includes(userData.userType)) {
    return SendResponse(res, "error", "Only owner or subowner is authorised to update bets");
  }

  let BETS_DELETE_PASSWORD = process.env.BETS_DELETE_PASSWORD
  if (userData.userType == "subowner") {
    BETS_DELETE_PASSWORD = process.env.SUBOWNER_BETS_DELETE_PASSWORD ? process.env.SUBOWNER_BETS_DELETE_PASSWORD : process.env.BETS_DELETE_PASSWORD
  }

  if (bodyData.password != BETS_DELETE_PASSWORD) {
    return SendResponse(
      res,
      "error",
      "bets delete password is wrong please try again later"
    );
  }

  let marketId = "";

  if (bodyData.marketId) {
    marketId = bodyData.marketId;
  }

  let uniqueClientData = [];
  let finalClientArray = [];
  let ResponseMapper = "";
  let deletedRemark = "by Company";

  let betsType = "fancy";
  if (bodyData.betsType) {
    betsType = bodyData.betsType;
  }

  if (bodyData.deletedRemark) {
    deletedRemark = bodyData.deletedRemark;
  }
  let clientData = [];
  if (betsType == "fancy") {
    await FancyBetModel.updateMany(
      {
        marketId: bodyData.marketId,
        _id: {
          $in: bodyData._id,
        },
      },
      { $set: { isDeleted: bodyData.isDeleted, deletedRemark: deletedRemark } }
    );
    clientData = await FancyBetModel.find(
      {
        marketId: bodyData.marketId,
        _id: {
          $in: bodyData._id,
        },
      },
      {
        userId: 1,
      }
    );
  }

  if (betsType == "odds") {
    await OddsBetModel.updateMany(
      {
        marketId: bodyData.marketId,
        _id: {
          $in: bodyData._id,
        },
      },
      { $set: { isDeleted: bodyData.isDeleted, deletedRemark: deletedRemark } }
    );
    clientData = await OddsBetModel.find(
      {
        marketId: bodyData.marketId,
        _id: {
          $in: bodyData._id,
        },
      },
      {
        userId: 1,
      }
    );
  }

  if (betsType == "casino") {
    await internationalCasinoBetList.updateMany(
      {
        _id: {
          $in: bodyData._id,
        },
      },
      {
        $set: { isDeleted: true },
      }
    );

    betsData = await internationalCasinoBetList.find(
      {
        _id: {
          $in: bodyData._id,
        },
      },
      {
        clientId: 1,
        gameId: 1,
        roundId: 1,
      }
    );

    betsData.map(async (data) => {
      let pushData = {
        userId: data.clientId,
      };
      clientData.push(pushData);
      let deleteWhere = {
        userType: "client",
        marketId: data.gameId,
        eventId: data.roundId,
        userId: data.clientId,
      };
      await TransactionLogModel.deleteMany(deleteWhere);
    });
  }


  clientData.map(async (data) => {
    let hasKey = finalClientArray.hasOwnProperty(data.userId);
    if (!hasKey) {
      finalClientArray[data.userId] = data;
      uniqueClientData.push(data.userId);
      await client.del(`${data.userId}_fancyData_${bodyData.marketId}`);
      await client.del(`${data.userId}_oddsData_${bodyData.marketId}`);
    }
  });


  if (betsType == "odds" || betsType == "fancy") {
    ResponseMapper = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData,
      bodyData.marketId
    );
  } else {
    ResponseMapper = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData
    );
  }


  if (res) {
      return SendResponse(
      res,
      "success",
      "bets updated successfully",
      ResponseMapper
    );
  } else {
    return ResponseMapper
  }

  
};

const generateUserLedger = async (date, dateWhere) => {
  let findUserIdArray = [];
  let insertLedger = [];
  let keyUserIdArray = {};


  dateWhere.$gte = dateWhere.$gte + ""
  dateWhere.$lte = dateWhere.$lte + ""

  const deleteCount = await ledgerModel.deleteMany({
    date: dateWhere,
    ledgerType: "internationalCasino",
    isDeclare: true,
    userType: {
      $in: [
        "agent",
        "superagent",
        "master",
        "subadmin",
        "admin",
        "superadmin",
        "subowner",
        "owner",
      ],
    },
  });

  let agentData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$agentId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        superagentId: { $first: "$superagentId" },
        agentId: { $first: "$agentId" },
        totalCoins: { $sum: "$amount" },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);




  let agentCommWhere = {
    overallType: "internationalCasino",
    date: dateWhere,
    isComm: 1,
  };

  let agentCommTransaction = await TransactionLogModel.aggregate([
    {
      $match: agentCommWhere,
    },
    {
      $group: {
        _id: "$agentId",
        totalCoins: { $sum: "$agentAmount" },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);

  if (agentData) {
    agentData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.agentId);
      if (!userKey) {
        keyUserIdArray[data.agentId] = data.agentId;
        findUserIdArray.push(data.agentId);
      }
    });
  }
  let agentCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (agentCasinoShareData.length > 0) {
    agentCasinoShareData = await convertKeyObject(agentCasinoShareData, "_id");

    agentData.map(async (data, key) => {
      let agentCasinoShare = 0;
      const agentShareDataArray = agentCasinoShareData[data.agentId];
      if (agentShareDataArray && agentShareDataArray.userCasinoShare) {
        agentCasinoShare = agentShareDataArray.userCasinoShare;
      }

      let shareAmount = ((100 - agentCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.agentId,
        agentId: data.agentId,
        superagentId: data.superagentId,
        masterId: data.masterId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "agent",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let superagentData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$superagentId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        superagentId: { $first: "$superagentId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  if (superagentData) {
    superagentData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.superagentId);
      if (!userKey) {
        keyUserIdArray[data.superagentId] = data.superagentId;
        findUserIdArray.push(data.superagentId);
      }
    });
  }
  let superagentCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (superagentCasinoShareData.length > 0) {
    superagentCasinoShareData = await convertKeyObject(
      superagentCasinoShareData,
      "_id"
    );
    superagentData.map((data, key) => {
      let superagentCasinoShare = 0;
      const superagentShareDataArray =
        superagentCasinoShareData[data.superagentId];
      if (
        superagentShareDataArray &&
        superagentShareDataArray.userCasinoShare
      ) {
        superagentCasinoShare = superagentShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - superagentCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.superagentId,
        superagentId: data.superagentId,
        masterId: data.masterId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "superagent",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let masterData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$masterId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        supermasterId: { $first: "$supermasterId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (masterData) {
    masterData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.masterId);
      if (!userKey) {
        keyUserIdArray[data.masterId] = data.masterId;
        findUserIdArray.push(data.masterId);
      }
    });
  }
  let masterCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (masterCasinoShareData.length > 0) {
    masterCasinoShareData = await convertKeyObject(
      masterCasinoShareData,
      "_id"
    );
    masterData.map((data, key) => {
      let masterCasinoShare = 0;
      const masterShareDataArray = masterCasinoShareData[data.masterId];
      if (masterShareDataArray && masterShareDataArray.userCasinoShare) {
        masterCasinoShare = masterShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - masterCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.masterId,
        masterId: data.masterId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "master",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let adminData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$adminId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        adminId: { $first: "$adminId" },
        superadminId: { $first: "$superadminId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (adminData) {
    adminData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.adminId);
      if (!userKey) {
        keyUserIdArray[data.adminId] = data.adminId;
        findUserIdArray.push(data.adminId);
      }
    });
  }
  let adminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (adminCasinoShareData.length > 0) {
    adminCasinoShareData = await convertKeyObject(adminCasinoShareData, "_id");
    adminData.map((data, key) => {
      let adminCasinoShare = 0;
      const adminShareDataArray = adminCasinoShareData[data.adminId];
      if (adminShareDataArray && adminShareDataArray.userCasinoShare) {
        adminCasinoShare = adminShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - adminCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.adminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "master",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }
  let subadminData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$subadminId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        subadminId: { $first: "$subadminId" },
        supersubadminId: { $first: "$supersubadminId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (subadminData) {
    subadminData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.subadminId);
      if (!userKey) {
        keyUserIdArray[data.subadminId] = data.subadminId;
        findUserIdArray.push(data.subadminId);
      }
    });
  }
  let subadminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (subadminCasinoShareData.length > 0) {
    subadminCasinoShareData = await convertKeyObject(
      subadminCasinoShareData,
      "_id"
    );
    subadminData.map((data, key) => {
      let subadminCasinoShare = 0;
      const subadminShareDataArray = subadminCasinoShareData[data.subadminId];
      if (subadminShareDataArray && subadminShareDataArray.userCasinoShare) {
        subadminCasinoShare = subadminShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - subadminCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.subadminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "subadmin",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let superadminData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$superadminId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        superadminId: { $first: "$superadminId" },
        supersuperadminId: { $first: "$supersuperadminId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (superadminData) {
    superadminData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.superadminId);
      if (!userKey) {
        keyUserIdArray[data.superadminId] = data.superadminId;
        findUserIdArray.push(data.superadminId);
      }
    });
  }
  let superadminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (superadminCasinoShareData.length > 0) {
    superadminCasinoShareData = await convertKeyObject(
      superadminCasinoShareData,
      "_id"
    );
    superadminData.map((data, key) => {
      let superadminCasinoShare = 0;
      const superadminShareDataArray =
        superadminCasinoShareData[data.superadminId];
      if (
        superadminShareDataArray &&
        superadminShareDataArray.userCasinoShare
      ) {
        superadminCasinoShare = superadminShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - superadminCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.superadminId,
        superadminId: data.superadminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "superadmin",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let subownerData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$subownerId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        subownerId: { $first: "$subownerId" },
        supersubownerId: { $first: "$supersubownerId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (subownerData) {
    subownerData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.subownerId);
      if (!userKey) {
        keyUserIdArray[data.subownerId] = data.subownerId;
        findUserIdArray.push(data.subownerId);
      }
    });
  }

  let subownerCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (subownerCasinoShareData.length > 0) {
    subownerCasinoShareData = await convertKeyObject(
      subownerCasinoShareData,
      "_id"
    );
    subownerData.map((data, key) => {
      let subownerCasinoShare = 0;
      const subownerShareDataArray = subownerCasinoShareData[data.subownerId];
      if (subownerShareDataArray && subownerShareDataArray.userCasinoShare) {
        subownerCasinoShare = subownerShareDataArray.userCasinoShare;
      }
      let shareAmount = ((100 - subownerCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.subownerId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "subowner",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  let ownerData = await ledgerModel.aggregate([
    {
      $match: {
        ledgerType: "internationalCasino",
        date: dateWhere,
      },
    },
    {
      $group: {
        _id: {
          userId: "$ownerId",
          marketId: "$marketId",
        },
        casinoName: { $first: "$remark" },
        marketId: { $first: "$marketId" },
        date: { $first: "$date" },
        ownerId: { $first: "$ownerId" },
        ownerId: { $first: "$ownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        ownerId: { $first: "$ownerId" },
        superownerId: { $first: "$superownerId" },
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);

  findUserIdArray = [];
  if (ownerData) {
    ownerData.map((data, key) => {
      let userKey = keyUserIdArray.hasOwnProperty(data.ownerId);
      if (!userKey) {
        keyUserIdArray[data.ownerId] = data.ownerId;
        findUserIdArray.push(data.ownerId);
      }
    });
  }
  let ownerCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );
  if (ownerCasinoShareData.length > 0) {
    ownerCasinoShareData = await convertKeyObject(ownerCasinoShareData, "_id");
    ownerData.map((data, key) => {
      let ownerCasinoShare = ownerCasinoShareData[data.ownerId].userCasinoShare;
      let shareAmount = ((100 - ownerCasinoShare) * data.totalCoins) / 100;
      let Ledger = {
        userId: data.ownerId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        ownerId: data.ownerId,
        ownerId: data.ownerId,
        marketId: data.marketId,
        eventId: data.marketId,
        eventName: `${data.casinoName}`,
        remark: msg("decision.casinoRemark", { casinoName: data.casinoName }),
        date: date,
        userType: "owner",
        ledgerType: "internationalCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }
  await ledgerModel.create(insertLedger);
  return true;
};


const betfairMarketDecision = async (req, res) => {
  const isHttpHandler = !!(res && typeof res.json === "function");
  const bodyData = req?.body || {};
  const eventId = bodyData.eventId;
  if (!bodyData.sportId) {
    return SendResponse(res, "success", "sportId Is required for betfair market decision", { eventId, marketIds: [] });
  }
  const sportId = bodyData?.sportId;

  try {
    if (!eventId) {
      const errMsg = "eventId is required";
      if (isHttpHandler) return SendResponse(res, "error", errMsg);
      throw new Error(errMsg);
    }

    let where = {
      eventId : eventId
    }

    if (sportId == 7 || sportId == "7" || sportId == "4339" || sportId == 4339) {
       where.status = "INPLAY"
    }

    const marketIds = (await sportList
      .distinct("marketList.marketId", where)
      .maxTimeMS?.(5000)
    )?.filter(Boolean) || [];


    if (marketIds.length === 0) {
      const infoMsg = "No markets found for the given eventId";
      if (isHttpHandler) return SendResponse(res, "success", infoMsg, { eventId, marketCount: 0 });
      return { ok: true, message: infoMsg, data: { eventId, marketIds } };
    }


    const desc = await DecisionService.betfairMarketDecision(marketIds, eventId , sportId);

    if (isHttpHandler) {
      return SendResponse(res, "success", "Other market decision success", {
        eventId,
        marketCount: marketIds.length,
        data: desc,
      });
    }

    return { ok: true, eventId, marketIds, data: desc };
  } catch (err) {
    // Rich, actionable logs
    console.error("[betfairMarketDecision] ERROR", {
      eventId,
      message: err?.message,
      stack: err?.stack,
    });

    if (isHttpHandler) {
      return SendResponse(res, "error", "Failed to process market decision", {
        eventId,
        error: err?.message,
      });
    }
    // Programmatic usage: bubble up
    throw err;
  }
};


const clearExposureByMarketId = async (req, res) => {
  const bodyData = req.body;
  let marketId = bodyData.marketId;
  const returnData = await DecisionService.clearExposureByMarketId(marketId);
  return SendResponse(
    res,
    returnData.status,
    returnData.message,
    returnData.data
  );
};

const commissionListByUserId = async (req, res) => {
  try {
    const bodyData = req.body;
    const userData = req.loggedInUser;
    let userType = userData.userType;
    let query = {};

    query = await whereHelper(userData, {
      [`${bodyData.userType}Id`]: new ObjectId(bodyData.userId),
    });

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    query.isDeclare = 1
    
    let commData = await profitLossPosition.find(query, {
      userInfo: 1,
      clientOddsComm: 1,
      clientSessionComm: 1,
      agentOddsComm: 1,
      agentSessionComm: 1,
      eventName: 1,
      marketId: 1,
      isCasino: 1,
      isDeclare: 1,
      createdAt: 1,
    });

    return SendResponse(res, "success", "Fetched Data Successfully", commData);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "Failed In Comm report for client",
      error
    );
  }
};

const dateWiseLedgerAndPosition = async (req, res) => {
  try {
    const bodyData = req.body;
    const userData = req.loggedInUser;
    let userType = userData.userType;
    let query = {};
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      ledgerType: Joi.string().required(),
      ledgerDate: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    let allowDateWise = false
    let settingData = await getSettingData()

    if (settingData && settingData.dayWiseLedgerForTestMatch) {
      allowDateWise = settingData.dayWiseLedgerForTestMatch
    }


    if (!allowDateWise) {
      return SendResponse(
        res,
        "error",
        "don't have permission for date wise ledger firstly give permission from setting tab"
      );
    }


    if (allowDateWise) {

      let teamData = {};
      let teamCount = 0;
      let { marketId, ledgerDate, ledgerType } = bodyData;

      let splitMarketId = marketId.split("_");
      if (splitMarketId && splitMarketId.length == 2) {
        return SendResponse(
          res,
          "error",
          "market not right ! Please do decision by original marketId"
        );
      }

      let matchData = await BetService.sportByMarketId(marketId);
      let eventId = matchData.eventId;
      let matchName = matchData.matchName;
      let oldMatchData = matchData;
      if (!matchData) {
        return SendResponse(res, "error", "market not found");
      }

      if (matchData.teamData) {
        teamData = matchData.teamData;
        if (teamData) {
          teamData = JSON.parse(matchData.teamData);
          teamCount = teamData.length;
        }
      }

      if (teamCount != 3) {
        return SendResponse(
          res,
          "error",
          "count is not 3 i.e. this is not test match hence day wise ledger facility not available"
        );
      }

      let wonTeamName = "";
      if (ledgerType == "odds") {
        if (!bodyData.decisionSelectionId) {
          return SendResponse(res, "error", "decision selection id not found");
        }
        wonTeamName = await DecisionService.getWonTeamName(
          matchData,
          bodyData.decisionSelectionId
        );
        let decisionSelectionId = bodyData.decisionSelectionId;
        let oddsType = "bookmaker";
        await DecisionService.oddsDecision(
          matchData,
          oddsType,
          decisionSelectionId,
          "",
          wonTeamName
        );
      }

      let returnData = await DecisionService.dateWiseLedgerAndPosition(
        marketId,
        ledgerType,
        ledgerDate,
        matchData
      );

      let newMatchName = `${matchName} - (${ledgerDate}) - (Session Only)`;
      let newMarketId = `${marketId}_${ledgerDate}`;
      let newEventId = `${eventId}_${ledgerDate}`;

      if (ledgerType == "odds") {
        newMarketId = `${marketId}_odds`;
        newEventId = `${eventId}_odds`;
        newMatchName = `${matchName} - (Odds Only)`;
      }

      oldMatchData.matchName = `${newMatchName}`;
      oldMatchData.marketId = newMarketId;
      oldMatchData.eventId = newEventId;
      oldMatchData.dateWiseLedger = true;

      delete matchData._id;
      delete matchData.__v;
      matchData.isDeclare = true;
      matchData.dateWiseLedger = true;
      matchData.status = "COMPLETED";

      const filter = {
        marketId: newMarketId,
      };

      let updateMatchDataLatest = {
        updateOne: {
          filter: filter,
          update: {
            $set: oldMatchData,
          },
          upsert: true,
        },
      };


      // _d(filter)
      await sportList.deleteMany(filter);

      // await sportList.updateOne(filter, oldMatchData, { upsert: true });

      if (ledgerType == "odds") {
        await profitLossPosition.deleteMany({ marketId: marketId });
        await ledgerModel.deleteMany({ marketId: marketId });
        let updateData = {
          status: "REMOVE",
          wonTeamName: wonTeamName,
          isDeclare: true,
          dateWiseLedger: true,
        };
        // await sportList.updateOne({ marketId: marketId }, updateData);
        await client.del("inplayMatchList");
        await client.del(`${marketId}_data`);
        await client.del(`${marketId}_BlockMarket`);
      }

      return SendResponse(
        res,
        "success",
        `${matchData.matchName} day wise ledger successfully done for date ${matchData.matchDate}`
      );
    }
  } catch (error) {
    console.log(`error occured in dateWiseLedgerAndPosition`, error);
    return SendResponse(res, "error", "Failed In dateWiseLedgerAndPosition");
  }
};

const manualBetfairDecision = async (req, res) => {
  try {
    let bodyData = req.body;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      betfairMarketId: Joi.string().required(),
      decisionSelectionId: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    let matchData = await sportList.findOne({ marketId: bodyData.marketId });
    if (!matchData) {
      return SendResponse(res, "error", "sport not found");
    }
    let marketData = await sportsMarketListModel.findOne({
      marketId: bodyData.betfairMarketId
    })
    let decisionSelectionId = bodyData.decisionSelectionId;
    await DecisionService.oddsDecision(
      matchData,
      "",
      decisionSelectionId,
      bodyData.betfairMarketId
    );
    return SendResponse(res, "success", "decision done successfully");
  } catch (error) {
    console.error("Error in oddsDecision:", error);
  }
};

const saveLedgerByUserId = async (userIdArray) => {
  try {
    let ledgerGroup = {
      _id: "$userId",
      amount: { $sum: `$amount` },
    };

    var submitLedger = await ledgerModel.aggregate([
      {
        $match: {
          userId: {
            $in: userIdArray,
          },
        },
      },
      {
        $group: ledgerGroup,
      },
    ]);

    // _dx(submitLedger);
  } catch (e) { }
};

let automaticBetfairDecision = async (req, res) => {
  try {
    let [settingData, inplayMatchList] = await Promise.all([
      getSettingData(),
      client.get("inplayMatchList")
    ])
    if (inplayMatchList) {
      inplayMatchList = JSON.parse(inplayMatchList)
    } else {
      if (res) {
        return SendResponse(res, "success", "no inplay match found");
      } else {
        return true
      }
    }
    if (inplayMatchList.length < 1) {
      if (res) {
        return SendResponse(res, "success", "dno inplay match found");
      } else {
        return true
      }
    }
    let convertInplayMatchList = convertKeyObject(inplayMatchList, "eventId")
    let convertInplayMatchListByMarketId = convertKeyObject(inplayMatchList, "marketId")

    let eventIdArray = []
    inplayMatchList.map(async (matchData) => {
      if (matchData.sportId != 4) {
        eventIdArray.push(matchData.eventId)
      }
    })
    eventIdArray = [...new Set(eventIdArray)];
    let marketListByEventIdArray = await sportsMarketListModel.find({ eventId: { $in: eventIdArray }, isDeclare: false });
    let fetchMarketIdArray = []
    let resultmdata = []
    await Promise.all(
      marketListByEventIdArray.map(async (market) => {
        fetchMarketIdArray.push(market.marketId);
      })
    );

    let marketIdArrayData = convertKeyObject(marketListByEventIdArray, "marketId")
    let marketIdArrayChunk = chunkArrayNew(fetchMarketIdArray, 10)
    marketIdArrayChunk = marketIdArrayChunk.map(subArray => subArray.filter(item => item !== null));

    let marketResultUrls = []
    marketIdArrayChunk.map((marketIdsArray) => {
      let sendMarketId = marketIdsArray.join(",")
      let urlD = `${fetchUrl.sportexResultUrl}${sendMarketId}`
      marketResultUrls.push(urlD)
    })



    const responses = await Promise.allSettled(
      marketResultUrls.map((url) =>
        axios
          .get(url, { timeout: 10000 })
          .then((res) => res.data)
          .catch((err) => {
            console.error(`❌ API failed for ${url}:`, err.message);
            return null;
          })
      )
    );

    const successData = responses
      .filter((r) => r.status === "fulfilled" && r.value)
      .flatMap((r) => r.value);



    let bookmakerResultUrlArray = []
    if (successData.length > 0) {
      for (let index = 0; index < successData.length; index++) {
        const resultData = successData[index];
        let eventId = resultData.eventId
        let marketId = resultData.marketId
        let betfairMarketId = resultData.marketId
        let winnerSelectionId = resultData.winnerSelectionId
        let isCancel = resultData.isRefund
        let matchData = convertInplayMatchList[eventId]
        let marketIdData = marketIdArrayData[marketId]
        let marketType = marketIdData.marketType
        let teamData = JSON.parse(matchData.teamData)


        matchData = await sportList.findOne({
          eventId: eventId,
        })

        if (matchData) {
          let betfairWinnerSelectionId = !isCancel ? winnerSelectionId : "abonded"
          await DecisionService.oddsDecision(
            matchData,
            "",
            betfairWinnerSelectionId,
            betfairMarketId
          );
          if (marketType == "Match Odds") {
            let marketData = await sportsMarketListModel.findOne({ eventId: eventId, marketId: marketId });
            teamData = marketData.selectionIdData
            let bookmakerSelectionId = null
            if (!isCancel) {
              teamData.map((team, key) => {
                if (winnerSelectionId == (team.betfairSelectionId || team.selectionId || team.selection_id)) {
                  bookmakerSelectionId = team.bookmakerSelectionId ? team.bookmakerSelectionId : key + 1
                }
              })
            } else {
              bookmakerSelectionId = "abonded"
            }
            if (bookmakerSelectionId != null) {
              bookmakerResultUrlArray.push({
                body: {
                  marketId: marketId,
                  eventId: eventId,
                  decisionSelectionId: bookmakerSelectionId + ""
                }
              })
            }
          }
        }
      }
    }

    for (let index = 0; index < bookmakerResultUrlArray.length; index++) {
      const bookmakerPayLoad = bookmakerResultUrlArray[index];
      let bodyD = bookmakerPayLoad.body
      if (bodyD.decisionSelectionId != "") {
        const decisionOdds = await oddsDecision(bookmakerPayLoad)
      }
    }

    setImmediate(async () => {
      try {
        await BetService.saveSportsListByNewCenterPanel();
        console.log('Sports list saved successfully');
      } catch (error) {
        console.error('Error saving sports list:', error);
      }
    });

    if (res) {
      return SendResponse(res, "success", "decision done successfully");
    } else {
      console.log("automaticBetfairDecision done successfully")
      return true
    }
  } catch (error) {
    console.error(error, "Error in automaticBetfairDecision:");
  }
}

const decisionBookmakerOddsAutomatic = async (req, res) => {
  try {
    let settingData = await getSettingData()
    let inplayMatchList = await client.get("inplayMatchList");
    if (inplayMatchList) {
      inplayMatchList = JSON.parse(inplayMatchList)
    } else {
      if (res) {
        return SendResponse(res, "success", "no inplay match found");
      } else {
        return true
      }
    }

    if (inplayMatchList.length < 1) {
      if (res) {
        return SendResponse(res, "success", "dno inplay match found");
      } else {
        return true
      }
    }

    let eventIdArray = []
    inplayMatchList.map(async (matchData) => {
      eventIdArray.push(matchData.marketId)
    })
    eventIdArray = [...new Set(eventIdArray)];

    let marketListByEventIdArray = await sportsMarketListModel.find({ marketId: { $in: eventIdArray }, isDeclare: true, marketType: "Match Odds" });
    let convertedMarketListByEventIdArray = convertKeyObject(marketListByEventIdArray, "marketId")

    let fetchEventIdArray = []
    let resultmdata = []
    await Promise.all(
      marketListByEventIdArray.map(async (market) => {
        fetchEventIdArray.push(market.marketId);
      })
    );

    fetchEventIdArray = [...new Set(fetchEventIdArray)];

    let sportList = await sportList.find({
      marketId: { $in: fetchEventIdArray }
    })

    await Promise.all(
      sportList.map(async (matchData) => {
        let decisionMarketData = convertedMarketListByEventIdArray[matchData.marketId]
        let firstTeamData = JSON.parse(matchData.teamData)
        let teamData = convertKeyObject(firstTeamData, "betfairSelectionId")

        matchData.wonTeamBetfairSelectionId = decisionMarketData.wonSelectionId

        let bookmakerSelectionIdData = teamData[matchData.wonTeamBetfairSelectionId]

        let wonBookmakerSelectionId = bookmakerSelectionIdData.bookmakerSelectionId
        let wonTeamName = bookmakerSelectionIdData.runner_name
        let sendBodyData = {
          body: {
            "marketId": matchData.marketId,
            "decisionSelectionId": wonBookmakerSelectionId + ""
          },
        }

        //_d(sendBodyData)

        const decisionOdds = await oddsDecision(sendBodyData)
      })
    )

    if (res) {
      return SendResponse(res, "success", "decision done successfully");
    } else {
      console.log("decisionBookmakerOddsAutomatic done successfully")
      return true
    }


  } catch (e) {
    console.log(e, "decisionBookmakerOddsAutomatic")
  }
}


const fancyAutomaticDecision = async (req, res) => {
  let lockAcquired = false;
  const REDIS_LOCK_KEY = "fancyDecisionLock";
  try {
    lockAcquired = await client.set(REDIS_LOCK_KEY, "locked", "NX", "EX", 60);
    if (!lockAcquired) {
      console.log("⏳ fancyAutomaticDecision already running on another server, skipping...");
      if (res) return SendResponse(res, "info", "Job already running");
      return false;
    }
    console.time("fancyAutomaticDecision");
    const inplayMatchList = await BetService.getMatchList();
    const eventIdArray = [
      ...new Set(
        inplayMatchList
          .filter((m) => m.sportId === 4 && m.eventId)
          .map((m) => m.eventId)
      ),
    ];

    if (!eventIdArray.length) {
      console.log("🚫 No in-play cricket matches found");
      if (res) return SendResponse(res, "error", "no match found");
      return true;
    }

    // 2️⃣ Fetch pending fancy bets
    const resData = await FancyBetModel.aggregate([
      { $match: { eventId: { $in: eventIdArray }, isDeclare: 0 } },
      {
        $group: {
          _id: "$selectionId",
          eventId: { $first: "$eventId" },
        },
      },
    ]);

    if (!resData.length) {
      console.log("✅ No fancy markets pending decision");
      if (res) return SendResponse(res, "info", "no fancy found");
      return true;
    }

    // 3️⃣ Prepare URLs
    const eventIds = [...new Set(resData.map((r) => r.eventId))];
    const urls = eventIds.map((id) => `${process.env.FANCY_CALL_API}${id}`);

    // 4️⃣ Fetch API data in parallel
    const responses = await Promise.allSettled(
      urls.map((url) =>
        axios
          .get(url, { timeout: 10000 })
          .then((r) => r.data)
          .catch((err) => {
            console.error(`❌ API failed for ${url}:`, err.message);
            return null;
          })
      )
    );

    const fancyData = responses
      .filter((r) => r.status === "fulfilled" && Array.isArray(r.value))
      .flatMap((r) => r.value);

    if (!fancyData.length) {
      console.log("⚠️ No fancy data returned from APIs");
      if (res) return SendResponse(res, "info", "no fancy data from API");
      return true;
    }

    // 5️⃣ Build map of fancy results
    const fancyMap = Object.fromEntries(fancyData.map((d) => [d.selectionId, d]));

    const finalResults = resData
      .map((f) => fancyMap[f._id])
      .filter(Boolean);

    if (!finalResults.length) {
      console.log("🚫 No matching fancy decisions found");
      if (res) return SendResponse(res, "info", "no matches found");
      return true;
    }

    // 6️⃣ Process each decision sequentially
    for (const sessionData of finalResults) {
      try {
        const payload = {
          marketId: sessionData.marketId,
          decisionRun: sessionData.decisionRun,
          selectionId: sessionData.selectionId,
        };
        await sessionDecision({ body: payload });
      } catch (err) {
        console.error(
          `❌ sessionDecision failed for selectionId ${sessionData.selectionId}:`,
          err.message
        );
      }
    }

    console.timeEnd("fancyAutomaticDecision");

    if (res) {
      return SendResponse(res, "success", "decision done successfully");
    } else {
      console.log("✅ fancyAutomaticDecision completed successfully");
      return true;
    }
  } catch (err) {
    console.error("❌ fancyAutomaticDecision error:", err);
    if (res) return SendResponse(res, "error", err.message || "Internal error");
  } finally {
    // 🔓 Always release Redis lock after completion
    if (lockAcquired) {
      await client.del(REDIS_LOCK_KEY);
    }
  }
};

const userCommissionCoinsInsert = async (
  req,res
) => {
  let bodyData = req.body;
  const JoiSchema = Joi.object({
    marketId: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    if (res) {
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    } else {
      _d(errorMessages, "")
    }
  }
  let marketId  = bodyData.marketId
  let matchData = await sportList.findOne({ marketId: marketId });
  if (!matchData) {
      return SendResponse(res, "error", "Match Not Found");
  }   
  

  let playData = await BetService.getPlayData(
    { marketId : marketId},
    "shareData , clientId , ownerId , subownerId , superadminId , adminId , subadminId , masterId , superagentId , agentId , parentData , userInfo , userId",
    "all"
  );

  let uniqueClientArray = [...new Set(playData.map((play) => play.userId))]
  let transactionData = await wholeTransactionMarketData(
    marketId,
    uniqueClientArray
  );

  
  if (transactionData) {
    transactionData = convertKeyObject(transactionData, "_id");
  }

  let letCommTransactionLog = [];
  let updateUserCoinsInCache = [];
  let userCommStatement = {};

  playData.map((data, key) => {
    const clientId = data.clientId;
    const matchShareData = JSON.parse(data.shareData);
    let transaction = [];
    if (transactionData[clientId]) {
      transaction = transactionData[clientId];
        let pushCommTransaction = {
          marketId: marketId,
          overallType: "userComm",
          ownerId: data.ownerId,
          subownerId: data.subownerId,
          superadminId: data.superadminId,
          adminId: data.adminId,
          subadminId: data.subadminId,
          masterId: data.masterId,
          superagentId: data.superagentId,
          agentId: data.agentId,
          isComm: 1,
        };

        let userStatement = {
          marketId: marketId,
          sportsType: "cricket",
          gameType: "cricket",
          remark: msg("decision.oddsCommRemark", { matchName: matchData.matchName }),
          userRemark: `User Comm For Match - (${matchData.matchName})`,
          statementFor: `userComm`,
          isComm: true,
          amount: 0,
        };

        let clientMatchCommission = matchShareData.clientMatchCommission;
        let clientSessionCommission = matchShareData.clientSessionCommission;

        let agentMatchCommission = matchShareData.agentMatchCommission;
        let agentSessionCommission = matchShareData.agentSessionCommission;

        let superagentMatchCommission =
          matchShareData.superagentMatchCommission;
        let superagentSessionCommission =
          matchShareData.superagentSessionCommission;

        let masterMatchCommission = matchShareData.masterMatchCommission;
        let masterSessionCommission = matchShareData.masterSessionCommission;

        let agentSessionCreditComm = 0
        let agentOddsCreditComm = 0

        let superagentSessionCreditComm = 0
        let superagentOddsCreditComm = 0

        let masterSessionCreditComm = 0
        let masterOddsCreditComm = 0

        let subadminSessionCreditComm = 0
        let subadminOddsCreditComm = 0

      if (!clientMatchCommission && !clientSessionCommission) {
          agentOddsCreditComm = transaction.agentTotalBookmakerComm;
          agentSessionCreditComm = transaction.agentTotalSessionComm;
          pushCommTransaction.userId = data.agentId;
          pushCommTransaction.userType = "agent";
          pushCommTransaction.amount =
            (1 - matchShareData.agentMatchShare) *
            (agentOddsCreditComm + agentSessionCreditComm);

          userStatement.amount = pushCommTransaction.amount;
          userStatement.userId = data.agentId;
          userStatement.userType = "agent";
        }

        if (!agentMatchCommission && !agentSessionCommission) {
          superagentOddsCreditComm = transaction.superagentTotalBookmakerComm;
          superagentSessionCreditComm = transaction?.superagentTotalSessionComm ? transaction?.superagentTotalSessionComm : 0
          pushCommTransaction.userId = data.superagentId;
          pushCommTransaction.userType = "superagent";
          pushCommTransaction.amount =
            (1 - matchShareData.superagentMatchShare) *
            (superagentOddsCreditComm + superagentSessionCreditComm);

          userStatement.userId = data.superagentId;
          userStatement.userType = "superagent";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (!superagentMatchCommission && !superagentSessionCommission) {
          masterOddsCreditComm = transaction.masterTotalBookmakerComm;
          masterSessionCreditComm = transaction.masterTotalSessionComm;
          pushCommTransaction.userId = data.masterId;
          pushCommTransaction.userType = "master";
          pushCommTransaction.amount =
            (1 - matchShareData.masterMatchShare) *
            (masterOddsCreditComm + superagentSessionCreditComm);

          userStatement.userId = data.masterId;
          userStatement.userType = "master";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (!masterMatchCommission && !masterSessionCommission) {
          subadminOddsCreditComm = transaction.subadminTotalBookmakerComm;
          subadminSessionCreditComm = transaction.subadminTotalSessionComm;
          pushCommTransaction.userId = data.subadminId;
          pushCommTransaction.userType = "subadmin";
          pushCommTransaction.amount =
            (1 - matchShareData.subadminMatchShare) *
            (subadminOddsCreditComm + superagentSessionCreditComm);
          
          userStatement.userId = data.subadminId;
          userStatement.userType = "subadmin";
          userStatement.amount = pushCommTransaction.amount;
        }

        if (pushCommTransaction.userId) {
          updateUserCoinsInCache.push(pushCommTransaction.userId);
          letCommTransactionLog.push(pushCommTransaction);
          let userStateId = userStatement.userId.toString();
          if (userCommStatement[userStateId]) {
            userCommStatement[userStateId].amount += userStatement.amount;
          } else {
            userCommStatement[userStateId] = userStatement;
          }
        }
      }
  });

  const  uniqueIds = [...new Map(updateUserCoinsInCache.map(id => [id.toString(), id])).values()];
  let finalInsertStatement = [];
    Object.entries(userCommStatement).forEach(([userId, userData]) => {
      userData.amount = parseFloat(userData.amount.toFixed(2));
      finalInsertStatement.push(userData);
    });
  
 // _d(finalInsertStatement , "finalInsertStatement")
  
    await StatementModel.deleteMany({
      marketId: marketId,
      isComm: true,
      statementFor: "userComm",
    });
    await StatementModel.insertMany(finalInsertStatement);
    await TransactionLogModel.deleteMany({
      marketId: marketId,
      overallType: "userComm",
      isComm: 1,
    });
    await TransactionLogModel.insertMany(letCommTransactionLog);
    await updateBulkCoinsExposureUserByMarketId(uniqueIds);

   if (res) {
      return SendResponse(res, "success", "commission updated successfully");
    } else {
      console.log("commission updated successfully")
      return true
   }
  
};


module.exports = {
  sessionDecision,
  oddsDecision,
  getPlusMinusByMarketId,
  completeSportList,
  commissionReport,
  sessionUpdate,
  positionLogData,
  generateCasinoClientLedger,
  userCommissionReport,
  resetComm,
  resetCommList,
  betsDelete,
  cancelFancy,
  rollbackFancy,
  betfairMarketDecision,
  clearExposureByMarketId,
  commissionListByUserId,
  dateWiseLedgerAndPosition,
  manualBetfairDecision,
  saveLedgerByUserId,
  automaticBetfairDecision,
  decisionBookmakerOddsAutomatic,
  fancyAutomaticDecision,
  userCommissionCoinsInsert
};