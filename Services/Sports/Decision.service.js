const OddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const UserModel = require("../../Models/User/User.model");
const SportsList = require("../../Models/sportList.model");
const PlayModel = require("../../Models/Play.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const StatementModel = require("../../Models/Statement.model");
const sportsMarketListModel = require("../../Models/sportsMarketList.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const ledgerModel = require("../../Models/Ledger.model");
const sportResultModel = require("../../Models/sportsResult.model");
const OpenBestModel = require("../../Models/BetsList/OpenBetsList.model");
const directUserShareModel = require("../../Models/User/directUserShareModel");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const { ObjectId } = require("mongodb");
const BetService = require("./Bet.service");
const { returnResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const {
  getShareChainData
} = require("../../Helpers/UsersUtils");

const {
  _dx,
  _d,
  oddsCommissionHelper,
  betfairCommissionHelper,
  bookmakerCommissionHelper,
  convertKeyObject,
  dateWhereCond,
  _date,
  _date_time,
  convertKeyObjectAndSeperateid,
  throughSocketDataByAxios,
  catchErrorReason,
  chunkArrayNew,
  getSettingData
} = require("../../Helpers/CommonHelper");
const {
  updateBulkCoinsExposureUserByMarketId,
  wholeTransactionMarketData,
} = require("../../Helpers/TransactionHelper");
const moment = require("moment");
const { fetchUrl } = require("../../Common/Constants");
const ShareModel = require("../../Models/User/Share.model");
const axios = require("axios");
const SportListModel = require("../../Models/sportList.model");
require("dotenv").config();

let oddsDecision = async (
  matchData,
  oddsType,
  decisionSelectionId,
  betfairMarketId,
  wonTeamName = ""
) => {
  try {
    if (!matchData || !decisionSelectionId) {
      return returnResponse(
        "error",
        "matchData  or decisionSelectionId is Required "
      );
    }

    let settingData = await getSettingData();
    let deductBetfairComm = settingData.deductBetfairComm
    let betfairDecision = false;
    let resultMarketData = {};
    let updateMarketList = {};
    const marketId = matchData.marketId;
    const eventId = matchData.eventId;

    if (betfairMarketId) {
      betfairDecision = true;
      let marketResultData = await sportsMarketListModel.findOne({
        marketId: betfairMarketId,
      });
      if (!marketResultData) {
        return false;
      }
      oddsType = marketResultData.marketType
      if (marketResultData.marketType == "Match Odds") {
        oddsType = "matchOdds";
        updateMarketList.wonTeamBetfairSelectionId = decisionSelectionId;
      }
      if (marketResultData.marketType == "Completed Match") {
        //oddsType = "completedOdds";
        updateMarketList.wonCompletedSelectionId = decisionSelectionId;
      }

      if (marketResultData.marketType == "Tied Match") {
        oddsType = "tiedMatch";
        updateMarketList.wonTieSelectionId = decisionSelectionId;
      }


      let selectionIdData = marketResultData.selectionIdData;
      selectionIdData.map((selection, key) => {
        if (selection.selectionId == decisionSelectionId) {
          wonTeamName = selection.runnerName;
        }
      });
      
      await sportsMarketListModel.updateMany({
        marketId: betfairMarketId,
      }, {
        isDeclare: true,
        wonSelectionId: decisionSelectionId
      });

      resultMarketData = marketResultData;
      if (decisionSelectionId == "abonded") {
        wonTeamName = decisionSelectionId;
        matchData.wonTeamName = decisionSelectionId;
        await OddsBetModel.updateMany(
          { betfairMarketId: betfairMarketId },
          { $set: { isDeleted: 1 } }
        );
      }
    }

    if (updateMarketList && betfairDecision) {
      await SportsList.updateMany(
        { marketId: marketId, eventId: eventId },
        updateMarketList
      );
    }

    let oddsWhere = {
      marketId: marketId,
      eventId: eventId,
      oddsType: oddsType,
    };


    const oddsBetsList = await OddsBetModel.find(oddsWhere);

    let uniqueClientData = [];
    let finalClientArray = [];


    oddsBetsList.map((oddsData) => {
      let hasKey = finalClientArray.hasOwnProperty(oddsData.userId);
      if (!hasKey) {
        finalClientArray[oddsData.userId] = {
          userId: oddsData.userId,
          ownerId: oddsData.ownerId,
          subownerId: oddsData.subownerId,
          superadminId: oddsData.superadminId,
          adminId: oddsData.adminId,
          subadminId: oddsData.subadminId,
          masterId: oddsData.masterId,
          superagentId: oddsData.superagentId,
          agentId: oddsData.agentId,
          clientId: oddsData.clientId,
          profitLoss: 0,
        };
        uniqueClientData.push(oddsData.userId);
      }


      // _d(oddsData.type , "oddsData.type")
      // _d(decisionSelectionId , "decisionSelectionId")
      // _d(oddsData.selectionId , "oddsData.selectionId")
     

      if (!oddsData.isDeleted) {
        if (
          (oddsData.type == "K" || oddsData.type == "k") &&
          oddsData.selectionId == decisionSelectionId
        ) {
          finalClientArray[oddsData.userId].profitLoss +=
            -1 * oddsData.amount * oddsData.odds;
        }
        if (
          (oddsData.type == "K" || oddsData.type == "k") &&
          oddsData.selectionId != decisionSelectionId
        ) {
          finalClientArray[oddsData.userId].profitLoss += oddsData.amount;
        }
        if (
          oddsData.type == "L" &&
          oddsData.selectionId == decisionSelectionId
        ) {
          finalClientArray[oddsData.userId].profitLoss +=
            oddsData.amount * oddsData.odds;
        }
        if (
          oddsData.type == "L" &&
          oddsData.selectionId != decisionSelectionId
        ) {
          
          finalClientArray[oddsData.userId].profitLoss += -1 * oddsData.amount;
        }
      }
    });


    //_dx(finalClientArray, "finalClientArray")
    
    let playWhere = {
      clientId: {
        $in: uniqueClientData,
      },
      marketId: marketId,
    };



    let directUserShareData = await directUserShareModel.find({
      userId: {
        $in: uniqueClientData,
      }
    });
    directUserShareData = convertKeyObject(directUserShareData, "userId")


    let playData = await BetService.getPlayData(
      playWhere,
      "shareData , clientId , directUserShareData",
      "all"
    );
    let insertTransactionLog = [];
    let statementLog = [];
    let crickInsertTransactionLog = [];
    let remarks = "";
    

    playData.forEach((data, key) => {
      const clientId = data.clientId;
      if (finalClientArray[clientId]) {
        let clientData = finalClientArray[clientId];
        const profitLoss = clientData.profitLoss;
        let clientShareData = JSON.parse(data.shareData);
        const matchShareArray = clientShareData;

        let directShareData = {};
        if (data && data.directUserShareData) {
          directShareData = JSON.parse(data.directUserShareData) || {}
        } else {
          directShareData = directUserShareData[clientId]?.shareData || {}
        }


        remarks = `${matchData.sportType}-${matchData.seriesName}-${matchData.matchName}-${oddsType}`;

        const pushArrayTransaction = {
          amount: profitLoss,
          clientAmount: profitLoss,
          marketId: marketId,
          eventId: eventId,
          overallType: "bookmakerOdds",
          userType: "client",
          gameName: "sports",
          gameType: oddsType,
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
          isDeclare: 1,
          forBet: 1,
          remarks: `${oddsType}Odds`,
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

        const crickPushTransactionLog = {
          eventName: matchData.matchName,
          amount: profitLoss,
          clientProfitLoss: profitLoss,
          marketId: marketId,
          eventId: matchData.eventId,
          sportId: matchData.sportId,
          seriesId: matchData.seriesId,
          gameName: "sports",
          transactionType: "profitLoss",
          gameType: matchData.sportType,
          marketType: oddsType,
          selectionId: decisionSelectionId,
          remarks: remarks,
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
          subownerLedgerAmount:
            profitLoss * matchShareArray.subownerParentMatchShare,
          superadminLedgerAmount:
            profitLoss * matchShareArray.superadminParentMatchShare,
          adminLedgerAmount: profitLoss * matchShareArray.adminParentMatchShare,
          subadminLedgerAmount:
            profitLoss * matchShareArray.subadminParentMatchShare,
          masterLedgerAmount:
            profitLoss * matchShareArray.masterParentMatchShare,
          superagentLedgerAmount:
            profitLoss * matchShareArray.superagentParentMatchShare,
          agentLedgerAmount: profitLoss * matchShareArray.agentParentMatchShare,

          ownerProfitLoss:
            profitLoss * matchShareArray.ownerMatchProfitLossShare,
          subownerProfitLoss:
            profitLoss * matchShareArray.subownerMatchProfitLossShare,
          superadminProfitLoss:
            profitLoss * matchShareArray.superadminMatchProfitLossShare,
          adminProfitLoss:
            profitLoss * matchShareArray.adminMatchProfitLossShare,
          subadminProfitLoss:
            profitLoss * matchShareArray.subadminMatchProfitLossShare,
          masterProfitLoss:
            profitLoss * matchShareArray.masterMatchProfitLossShare,
          superagentProfitLoss:
            profitLoss * matchShareArray.superagentMatchProfitLossShare,
          agentProfitLoss:
            profitLoss * matchShareArray.agentMatchProfitLossShare,
          result: wonTeamName,
          betFor: "market"
        };

        // _dx(crickPushTransactionLog , "crickPushTransactionLog")
        crickInsertTransactionLog.push(crickPushTransactionLog);

        let userRemark = clientData.profitLoss < 0 ? "Loss" : "Win";

        const pushStatementLog = {
          userId: new ObjectId(clientData.userId),
          amount: clientData.profitLoss,
          userType: "client",
          sportsType: "cricket",
          gameType: oddsType,
          remark: `(${matchData.matchName}) ${oddsType} Odds (${userRemark}) - Result (${wonTeamName})`,
          userRemark: userRemark,
          statementFor: `${oddsType}Odds`,
          marketId: marketId,
        };
        statementLog.push(pushStatementLog);

        let insertOddsComm = false;
        let commissionData = {};

        if (oddsType == "bookmaker") {
          insertOddsComm = true;
          commissionData = oddsCommissionHelper(profitLoss, matchShareArray);
        }


        if (
          oddsType == "matchOdds" &&
          deductBetfairComm == true
        ) {
          insertOddsComm = true;
          commissionData = betfairCommissionHelper(profitLoss, matchShareArray, directShareData);
        }


        if (insertOddsComm) {
          let commClientAmount = commissionData.clientComm;

          const pushArrayTransactionComm = {
            amount: commClientAmount,
            clientAmount: commClientAmount,
            userId: clientData.userId,
            userType: "client",
            gameName: "sports",
            gameType: `${oddsType}`,
            subownerId: clientData.subownerId,
            superadminId: clientData.superadminId,
            adminId: clientData.adminId,
            subadminId: clientData.subadminId,
            masterId: clientData.masterId,
            superagentId: clientData.superagentId,
            agentId: clientData.agentId,
            clientId: clientData.clientId,

            ownerLedgerAmount: commissionData.ownerLedgerBetfairComm ? commissionData.ownerLedgerBetfairComm : 0,
            subownerLedgerAmount: commissionData.subownerLedgerBetfairComm ? commissionData.subownerLedgerBetfairComm : 0,
            superadminLedgerAmount: commissionData.superadminLedgerBetfairComm ? commissionData.superadminLedgerBetfairComm : 0,
            adminLedgerAmount: commissionData.adminLedgerBetfairComm ? commissionData.adminLedgerBetfairComm : 0,
            subadminLedgerAmount: commissionData.subadminLedgerBetfairComm ? commissionData.subadminLedgerBetfairComm : 0,
            masterLedgerAmount: commissionData.masterLedgerBetfairComm ? commissionData.masterLedgerBetfairComm : 0,
            superagentLedgerAmount: commissionData.superagentLedgerBetfairComm ? commissionData.superagentLedgerBetfairComm : 0,
            agentLedgerAmount: commissionData.agentLedgerBetfairComm ? commissionData.agentLedgerBetfairComm : 0,

            ownerProfitLoss: commissionData.ownerProfitLossBetfairComm ? commissionData.ownerProfitLossBetfairComm : 0,
            subownerProfitLoss: commissionData.subownerProfitLossBetfairComm ? commissionData.subownerProfitLossBetfairComm : 0,
            superadminProfitLoss: commissionData.superadminProfitLossBetfairComm ? commissionData.superadminProfitLossBetfairComm : 0,
            adminProfitLoss: commissionData.adminProfitLossBetfairComm ? commissionData.adminProfitLossBetfairComm : 0,
            subadminProfitLoss: commissionData.subadminProfitLossBetfairComm ? commissionData.subadminProfitLossBetfairComm : 0,
            masterProfitLoss: commissionData.masterProfitLossBetfairComm ? commissionData.masterProfitLossBetfairComm : 0,
            superagentProfitLoss: commissionData.superagentProfitLossBetfairComm ? commissionData.superagentProfitLossBetfairComm : 0,
            agentProfitLoss: commissionData.agentProfitLossBetfairComm ? commissionData.agentProfitLossBetfairComm : 0,

            ownerAmount: commissionData.ownerComm ? commissionData.ownerComm.toFixed(2) : 0,
            subownerAmount: commissionData.subownerComm ? commissionData.subownerComm.toFixed(2) : 0,
            superadminAmount: commissionData.superadminComm ? commissionData.superadminComm.toFixed(2) : 0,
            adminAmount: commissionData.adminComm ? commissionData.adminComm.toFixed(2) : 0,
            subadminAmount: commissionData.subadminComm ? commissionData.subadminComm.toFixed(2) : 0,
            masterAmount: commissionData.masterComm ? commissionData.masterComm.toFixed(2) : 0,
            superagentAmount: commissionData.superagentComm ? commissionData.superagentComm.toFixed(2) : 0,
            agentAmount: commissionData.agentComm ? commissionData.agentComm.toFixed(2) : 0,

            overallType: `${oddsType}OddsComm`,
            marketId: marketId,
            isDeclare: 1,
            forBet: 1,
            isComm: 1,
            remarks: `${oddsType}Odds Comm`,
            eventId: eventId,
          };


          insertTransactionLog.push(pushArrayTransactionComm);

          const pushStatementLogComm = {
            userId: new ObjectId(clientData.userId),
            amount: commissionData.clientComm,
            userType: "client",
            sportsType: "cricket",
            gameType: `${oddsType}Odds`,
            remark: `${matchData.matchName} (Comm)`,
            userRemark: "Comm Credited",
            statementFor: `${oddsType}OddsComm`,
            marketId: marketId,
            isComm: true,
          };
          statementLog.push(pushStatementLogComm);


          if (oddsType == "bookmaker" ) {
              commissionData = bookmakerCommissionHelper(profitLoss, matchShareArray, directShareData);
          }



          _d(commissionData , "commissionData")
          

          const crickPushTransactionLog = {
            eventName: matchData.matchName,
            amount: commClientAmount,
            clientProfitLoss: commClientAmount,
            marketId: marketId,
            eventId: matchData.eventId,
            sportId: matchData.sportId,
            seriesId: matchData.seriesId,
            isComm: 1,
            gameName: "sports",
            transactionType: "profitLoss",
            gameType: matchData.sportType,
            marketType: oddsType,
            selectionId: decisionSelectionId,
            remarks: remarks,
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

            ownerLedgerAmount: commissionData.ownerLedgerBetfairComm ? commissionData.ownerLedgerBetfairComm : 0,
            subownerLedgerAmount: commissionData.subownerLedgerBetfairComm ? commissionData.subownerLedgerBetfairComm : 0,
            superadminLedgerAmount: commissionData.superadminLedgerBetfairComm ? commissionData.superadminLedgerBetfairComm : 0,
            adminLedgerAmount: commissionData.adminLedgerBetfairComm ? commissionData.adminLedgerBetfairComm : 0,
            subadminLedgerAmount: commissionData.subadminLedgerBetfairComm ? commissionData.subadminLedgerBetfairComm : 0,
            masterLedgerAmount: commissionData.masterLedgerBetfairComm ? commissionData.masterLedgerBetfairComm : 0,
            superagentLedgerAmount: commissionData.superagentLedgerBetfairComm ? commissionData.superagentLedgerBetfairComm : 0,
            agentLedgerAmount: commissionData.agentLedgerBetfairComm ? commissionData.agentLedgerBetfairComm : 0,

            ownerProfitLoss: commissionData.ownerProfitLossBetfairComm ? -1 * commissionData.ownerProfitLossBetfairComm : 0,
            subownerProfitLoss: commissionData.subownerProfitLossBetfairComm ? -1 * commissionData.subownerProfitLossBetfairComm : 0,
            superadminProfitLoss: commissionData.superadminProfitLossBetfairComm ? -1 * commissionData.superadminProfitLossBetfairComm : 0,
            adminProfitLoss: commissionData.adminProfitLossBetfairComm ? -1 * commissionData.adminProfitLossBetfairComm : 0,
            subadminProfitLoss: commissionData.subadminProfitLossBetfairComm ? -1 * commissionData.subadminProfitLossBetfairComm : 0,
            masterProfitLoss: commissionData.masterProfitLossBetfairComm ? -1 * commissionData.masterProfitLossBetfairComm : 0,
            superagentProfitLoss: commissionData.superagentProfitLossBetfairComm ? -1 * commissionData.superagentProfitLossBetfairComm : 0,
            agentProfitLoss: commissionData.agentProfitLossBetfairComm ? -1 * commissionData.agentProfitLossBetfairComm : 0,
            result: wonTeamName,
            betFor: "market"
          };
          
          crickInsertTransactionLog.push(crickPushTransactionLog);
        }
      }
    });

    let transactionDeleteWhere = {
      marketId: marketId,
      forBet: 1,
      gameType: oddsType,
    };


    if (oddsType == "bookmaker") {
      transactionDeleteWhere.gameType = {
        $in: [oddsType, "bookmakerOddsComm", "bookmakerOdds"],
      };
      transactionDeleteWhere.overallType = {
        $in: ["bookmakerOdds", "bookmakerOddsComm"],
      };
    }

    await TransactionLogModel.deleteMany(transactionDeleteWhere);
    let chunks = chunkArrayNew(insertTransactionLog, 2000);
    for (const chunk of chunks) {

   // _d(chunk , "chunk")

      await TransactionLogModel.insertMany(chunk);
    }

    let isCrickTransaction = false;
    if (
      process.env.IS_CRICK_TRANSACTION &&
      process.env.IS_CRICK_TRANSACTION == "true"
    ) {
      isCrickTransaction = true;
    }

    if (isCrickTransaction) {
      await CrickTransactionLogModel.deleteMany({
        marketId: marketId,
        marketType: oddsType,
      });
      let crickChunks = chunkArrayNew(crickInsertTransactionLog, 1000);
      for (const chunk of crickChunks) {
        await CrickTransactionLogModel.insertMany(chunk);
      }
    }

    let statementDeleteWhere = {
      marketId: marketId,
      gameType: oddsType,
      statementFor: `${oddsType}Odds`,
    };

    if (oddsType == "bookmaker") {
      statementDeleteWhere.gameType = {
        $in: [`${oddsType}`, "bookmakerOdds", "bookmakerOddsComm"],
      };
      statementDeleteWhere.statementFor = {
        $in: ["bookmakerOdds", "bookmakerOddsComm"],
      };
    }


    if (statementLog.length < 1000) {
      let finalInsertStatement = [];
      for (const record of statementLog) {
        const filter = {
          marketId: record.marketId,
          userId: record.userId,
          statementFor: record.statementFor,
          gameType: record.gameType,
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
      await StatementModel.deleteMany(statementDeleteWhere);
      let statementChunks = chunkArrayNew(statementLog, 2000);
      for (const chunk of statementChunks) {
        await StatementModel.insertMany(chunk);
      }
    }
    const updateOdds = {
      decisionSelectionId: decisionSelectionId,
      isDeclare: 1,
      wonTeamName: wonTeamName,
    };
    const updateOddsWhere = { marketId: marketId, oddsType: oddsType };
    if (betfairDecision) {
      updateOddsWhere.betfairMarketId = betfairMarketId;
    }
    const updateBets = await OddsBetModel.updateMany(updateOddsWhere, {
      $set: updateOdds,
    });

    await PlayModel.updateMany(playWhere, {
      updateSessionBet: true,
    });

  
    if (oddsType == "matchOdds") {
      let openBetsUserDataId = []
      let openBets = await OpenBestModel.find({
        marketId: matchData.marketId,
      }, {
        userId: 1
      })
      if (openBets && openBets.length > 0) {
        openBets.map((data, key) => {
          openBetsUserDataId.push(data.userId)
        })
      }
      await OpenBestModel.deleteMany({
        marketId: matchData.marketId,
      })
      await TransactionLogModel.deleteMany({
        marketId: matchData.marketId,
        overallType: "openBet",
      })
      await updateBulkCoinsExposureUserByMarketId(
        openBetsUserDataId,
        marketId
      );
    }

    const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      uniqueClientData,
      marketId
    );


    await OddsPositionModel.updateMany({
       marketId: matchData.marketId,
       oddsType : oddsType
    }, {
        isDeclare : 1
     })
   

    return returnResponse("success", uniqueClientData, updateUserCoins);
  } catch (error) {
    console.log(
      `something went wrong in decision services for market id ${matchData.marketId} for odds Type ${oddsType}`,
      error
    );
  }
};

const generateDiamondCasinoComm = async (dateWhere, todayDate) => {
  try {
    var resData = await TransactionLogModel.aggregate([
      {
        $match: {
          overallType: "internationalCasino",
          gameType: "diamondCasino",
          date: dateWhere,
          isComm: 0,
          isDeclare: {
            $in: [true, 1],
          },
        },
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
          totalCoins: { $sum: "$amount" },
        },
      },
      {
        $match: {
          totalCoins: { $lt: 0 },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]);
    let commTransaction = [];

    let userIdArray = [];
    resData.map((data) => {
      let pushComm = {
        gameType: "diamondCasino",
        userType: "client",
        amount: data.totalCoins,
        gameName: "diamondCasino",
        marketId: data.marketId,
        remarks: `diamond casino comm for ${data.casinoName}`,
        overallType: "internationalCasino",
        forBet: 1,
        isDeclare: 1,
        isComm: 1,
        ownerId: data.ownerId,
        subownerId: data.subownerId,
        superadminId: data.superadminId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        masterId: data.masterId,
        superagentId: data.superagentId,
        agentId: data.agentId,
        clientId: data.userId,
        userId: data.userId,
        date: todayDate,
      };
      commTransaction.push(pushComm);
      userIdArray.push(data.userId);
    });

    let shareData = await ShareModel.find(
      {
        userId: {
          $in: userIdArray,
        },
      },
      {
        creatorId: 1,
        userId: 1,
        clientCasinoCommission: 1,
        agentId: 1,
        agentCasinoShare: 1,
        agentCasinoCommission: 1,
        superagentId: 1,
        superagentCasinoShare: 1,
        superagentCasinoCommission: 1,
        masterId: 1,
        masterCasinoShare: 1,
        masterCasinoCommission: 1,
        subadminId: 1,
        subadminCasinoShare: 1,
        subadminCasinoCommission: 1,
        adminId: 1,
        adminCasinoShare: 1,
        adminCasinoCommission: 1,
        superadminId: 1,
        superadminCasinoShare: 1,
        superadminCasinoCommission: 1,
        subownerId: 1,
        subownerCasinoShare: 1,
        subownerCasinoCommission: 1,
        ownerId: 1,
        ownerCasinoShare: 1,
        ownerCasinoCommission: 1,
      }
    );
    if (shareData) {
      shareData = shareData.reduce((acc, share) => {
        const userId = share.userId;
        acc[userId] = share;
        return acc;
      }, {});
    }

    let finalInsertTransaction = [];
    commTransaction.forEach((data) => {
      let userId = data.userId;
      let clientShareData = shareData[userId];
      let lossAmount = -1 * data.amount;

      data.amount = (
        (clientShareData.clientCasinoCommission * lossAmount) /
        100
      ).toFixed(2);

      let agentComm =
        ((1 - clientShareData.agentCasinoShare / 100) *
          (lossAmount * clientShareData.agentCasinoCommission)) /
        100;

      data.agentAmount = agentComm.toFixed(2);

      let superagentComm =
        ((1 - clientShareData.superagentCasinoShare / 100) *
          (lossAmount * clientShareData.superagentCasinoCommission)) /
        100;

      data.superagentAmount = superagentComm.toFixed(2);

      let masterComm =
        ((1 - clientShareData.masterCasinoShare / 100) *
          (lossAmount * clientShareData.masterCasinoCommission)) /
        100;

      data.masterAmount = masterComm.toFixed(2);

      let subadminComm =
        ((1 - clientShareData.subadminCasinoShare / 100) *
          (lossAmount * clientShareData.subadminCasinoCommission)) /
        100;

      data.subadminAmount = subadminComm.toFixed(2);

      let adminComm =
        ((1 - clientShareData.adminCasinoShare / 100) *
          (lossAmount * clientShareData.adminCasinoCommission)) /
        100;

      data.adminAmount = adminComm.toFixed(2);

      let superadminComm =
        ((1 - clientShareData.superadminCasinoShare / 100) *
          (lossAmount * clientShareData.superadminCasinoCommission)) /
        100;

      data.superadminAmount = superadminComm.toFixed(2);

      let subownerComm =
        ((1 - clientShareData.subownerCasinoShare / 100) *
          (lossAmount * clientShareData.subownerCasinoCommission)) /
        100;

      data.subownerAmount = subownerComm.toFixed(2);

      let ownerComm =
        ((1 - clientShareData.ownerCasinoShare / 100) *
          (lossAmount * clientShareData.ownerCasinoCommission)) /
        100;

      data.ownerAmount = ownerComm.toFixed(2);

      finalInsertTransaction.push(data);
    });

    //_dx(finalInsertTransaction);

    await TransactionLogModel.deleteMany({
      date: dateWhere,
      overallType: "internationalCasino",
      isDeclare: 1,
      forBet: 1,
      isComm: 1,
      gameName: "diamondCasino",
      userType: "client",
    });

    await TransactionLogModel.create(finalInsertTransaction);
    return true;
  } catch (error) {
    console.log(`SOMETHING WENT WRONG IN CASINO COMM CREATED IN BET SERVICE`);
  }
};

const betfairMarketDecision = async (marketIds, eventId , sportId) => {
  let resultMarketData = [];
  if (marketIds) {
    marketIds = marketIds.join(",");
    let url = `${fetchUrl.otherMarketResultUrl}${marketIds}`;
    try {
      let urlData = await axios.get(url);
      if (urlData.data) {
        urlData = urlData.data;
        urlData.forEach((marketData) => {
          if (marketData.status == "CLOSED") {
            let pushData = {
              betfaitMarketId: marketData.marketId,
              eventId: eventId,
              winnerSelectionId: "",
            };
            const runners = marketData.runners;
            runners.forEach((runner) => {
              if (runner.status == "WINNER") {
                pushData.winnerSelectionId = runner.selectionId;
              }
            });
            resultMarketData.push(pushData);
          }
        });
      }

   
      let sportWhere = { eventId: eventId }

      if (sportId == 7 || sportId == "7" || sportId == "4339" || sportId == 4339) {
         sportWhere.status = "INPLAY"
      }
      
      let matchData = await SportsList.find(sportWhere);
      let marketlength = matchData.length

      

      if (resultMarketData.length > 0) {
        for (let index = 0; index < resultMarketData.length; index++) {
          const resultData = resultMarketData[index];
          let betfairMarketId = resultData?.betfaitMarketId
          let sendMatchData = []
          if (marketlength == 1) {
            sendMatchData = matchData[0]
          } else {
            for (let index = 0; index < matchData.length; index++) {
              const element = matchData[index];
              if (betfairMarketId == element.marketId) {
                sendMatchData = element
              }
            }
          }
          try {
            await oddsDecision(
              sendMatchData,
              "",
              resultData.winnerSelectionId,
              resultData.betfaitMarketId
            );
          } catch (error) {
            console.error("Error in oddsDecision:", error);
          }
        }
      }

      return true;
    } catch (e) {
      let reason = await catchErrorReason(e);
      console.log(reason);
      return returnResponse("error", "", reason);
    }
  }
};

const clearExposureByMarketId = async (marketId) => {
  let userData = await PlayModel.find(
    { marketId: marketId },
    {
      userId: 1,
    }
  );
  let userIdAray = [];
  userData.map((user) => {
    userIdAray.push(user.userId);
  });
  const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
    userIdAray
  );
  return returnResponse(
    "success",
    "successfully exposure is clear done ",
    updateUserCoins
  );
};

const internationalCasinoLedgerForClientWise = async (
  userId,
  marketId,
  userData
) => {
  try {
    let bodyData = {};
    let showDate = _date();
    let todayDate = moment().startOf("day").valueOf();
    let dateWhere = await dateWhereCond(bodyData.date);

    let where = {
      overallType: "internationalCasino",
      date: dateWhere,
      isDeclare: {
        $in: [true, 1],
      },
      userId: new ObjectId(userId),
      marketId: marketId,
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
          ownerAmount: { $sum: "$ownerAmount" },
          ownerShareAmount: { $sum: "$ownerShareAmount" },
          subownerAmount: { $sum: "$subownerAmount" },
          subownerShareAmount: { $sum: "$subownerShareAmount" },
          superadminAmount: { $sum: "$superadminAmount" },
          superadminShareAmount: { $sum: "$superadminShareAmount" },
          adminAmount: { $sum: "$adminAmount" },
          adminShareAmount: { $sum: "$adminShareAmount" },
          subadminAmount: { $sum: "$subadminAmount" },
          subadminShareAmount: { $sum: "$subadminShareAmount" },
          masterAmount: { $sum: "$masterAmount" },
          masterShareAmount: { $sum: "$masterShareAmount" },
          superagentAmount: { $sum: "$superagentAmount" },
          superagentShareAmount: { $sum: "$superagentShareAmount" },
          agentAmount: { $sum: "$agentAmount" },
          agentShareAmount: { $sum: "$agentShareAmount" },
        },
      },
      {
        $sort: { "_id.userId": 1, "_id.marketId": 1 },
      },
    ]);

    let positionData = {};
    let ledgerUserData = [];

    let deleteWhereId = [];

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

      let baseLedger = {
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
        remark: `${data.casinoName} (${showDate})`,
        date: data.date,
        ledgerType: "internationalCasino",
        date: data.date,
        isDeclare: true,
        date: todayDate,
      };

      let clientLedger = {
        ...baseLedger,
        userId: clientId,
        amount: data.totalCoins,
        userType: "client",
      };

      ledgerUserData.push(clientLedger);
      deleteWhereId.push(userId);

      if (agentId != null) {
        let agentLedger = {
          ...baseLedger,
          userId: agentId,
          amount: -1 * data.agentShareAmount,
          userType: "agent",
        };
        ledgerUserData.push(agentLedger);
        deleteWhereId.push(agentId);
      }

      if (superagentId != null) {
        let superagentLedger = {
          ...baseLedger,
          userId: superagentId,
          amount: -1 * data.superagentShareAmount,
          userType: "superagent",
        };
        ledgerUserData.push(superagentLedger);
        deleteWhereId.push(superagentId);
      }

      if (masterId != null) {
        let masterLedger = {
          ...baseLedger,
          userId: masterId,
          amount: -1 * data.masterShareAmount,
          userType: "master",
        };
        ledgerUserData.push(masterLedger);
        deleteWhereId.push(masterId);
      }

      if (subadminId != null) {
        let subadminLedger = {
          ...baseLedger,
          userId: subadminId,
          amount: -1 * data.subadminShareAmount,
          userType: "subadmin",
        };
        ledgerUserData.push(subadminLedger);
        deleteWhereId.push(subadminId);
      }

      if (adminId != null) {
        let adminLedger = {
          ...baseLedger,
          userId: adminId,
          amount: -1 * data.adminShareAmount,
          userType: "admin",
        };
        ledgerUserData.push(adminLedger);
        deleteWhereId.push(adminId);
      }

      if (superadminId != null) {
        let superadminLedger = {
          ...baseLedger,
          userId: superadminId,
          amount: -1 * data.superadminShareAmount,
          userType: "superadmin",
        };
        ledgerUserData.push(superadminLedger);
        deleteWhereId.push(superadminId);
      }

      if (subownerId != null) {
        let subownerLedger = {
          ...baseLedger,
          userId: subownerId,
          amount: -1 * data.subownerShareAmount,
          userType: "subowner",
        };
        ledgerUserData.push(subownerLedger);
        deleteWhereId.push(subownerId);
      }

      positionData = {
        userInfo: { username: userData.username, name: userData.name },
        marketId: marketId,
        eventId: marketId,
        isDeclare: 1,
        isCasino: 1,
        userId: clientId,
        clientId: clientId,
        agentId: agentId,
        superagentId: superagentId,
        masterId: masterId,
        adminId: adminId,
        subadminId: subadminId,
        adminId: adminId,
        superadminId: superadminId,
        subownerId: subownerId,
        ownerId: ownerId,
        eventName: `${data.casinoName} (${showDate})`,
        clientOddsAmount: data.totalCoins,
        clientNetAmount: data.totalCoins,

        ownerNetProfitLoss: data.ownerAmount,

        subownerNetProfitLoss: data.subownerAmount,
        subownerLedgerAmt: data.subownerShareAmount,

        superadminNetProfitLoss: data.superadminAmount,
        superadminLedgerAmt: data.superadminShareAmount,

        adminNetProfitLoss: data.adminAmount,
        adminLedgerAmt: data.adminShareAmount,

        subadminNetProfitLoss: data.subadminAmount,
        subadminLedgerAmt: data.subadminShareAmount,

        masterNetProfitLoss: data.masterAmount,
        masterLedgerAmt: data.masterShareAmount,

        superagentNetProfitLoss: data.superagentAmount,
        superagentLedgerAmt: data.superagentShareAmount,

        agentNetProfitLoss: data.agentAmount,
        agentLedgerAmt: data.agentShareAmount,
        date: todayDate,
      };
    });



    await ledgerModel.deleteMany({
      date: dateWhere,
      ledgerType: "internationalCasino",
      isDeclare: true,
      userId: { $in: deleteWhereId },
      marketId: marketId,
    });
    let updateLedger = await ledgerModel.create(ledgerUserData);



    await profitLossPosition.deleteOne({
      date: dateWhere,
      userId: new ObjectId(userId),
      marketId: marketId,
      isDeclare: 1,
      isCasino: 1,
    });

    let updatePosition = await profitLossPosition.create(positionData);


    return true;
  } catch (error) {
    console.log("Something Went Wrong In ledger updated", error);
    return false;
  }
};

const declarePositionAndLedgerDateWise = async (
  marketId,
  matchData,
  transactionData,
  newMarketId,
  ledgerType
) => {
  if (transactionData) {
    transactionData = convertKeyObjectAndSeperateid(transactionData, "_id");
  }

  let clientIdArray = transactionData.idArray;
  let newTransactionData = transactionData.returnDataObject;

  let playWhere = {
    marketId: marketId,
    clientId: { $in: clientIdArray },
  };

  let playData = await BetService.getPlayData(
    playWhere,
    "shareData , clientId , ownerId , subownerId , superadminId , adminId , subadminId , masterId , superagentId , agentId , parentData , userInfo",
    "all"
  );

  let finalPositionData = [];
  let letCommTransactionLog = [];
  let updateUserCoinsInCache = [];
  let userCommStatement = {};
  let insertCommCoins = false;
  if (
    process.env.INSERT_COMM_COINS &&
    process.env.INSERT_COMM_COINS == "true"
  ) {
    insertCommCoins = true;
  }

  newTransactionData = JSON.parse(JSON.stringify(newTransactionData));

  playData &&
    playData.map((data, key) => {
      const clientId = data.clientId;

      const matchShareData = JSON.parse(data.shareData);
      const parentData = data.parentData;
      let transaction = [];
      if (newTransactionData[clientId]) {
        transaction = newTransactionData[clientId];

        if (ledgerType == "session") {
          transaction.clientTotalBookmakerOdds = 0;
          transaction.clientTotalBookmakerComm = 0;
          transaction.ownerTotalBookmakerComm = 0;
          transaction.subownerTotalBookmakerComm = 0;
          transaction.superadminTotalBookmakerComm = 0;
          transaction.adminTotalBookmakerComm = 0;
          transaction.subadminTotalBookmakerComm = 0;
          transaction.masterTotalBookmakerComm = 0;
          transaction.superagentTotalBookmakerComm = 0;
          transaction.agentTotalBookmakerComm = 0;
          transaction.clientTotalProfitLoss =
            transaction.clientTotalSessionOdds +
            transaction.clientTotalSessionComm;
        } else {
          transaction.clientTotalSessionOdds = 0;
          transaction.clientTotalSessionComm = 0;
          transaction.ownerTotalSessionComm = 0;
          transaction.subownerTotalSessionComm = 0;
          transaction.superadminTotalSessionComm = 0;
          transaction.adminTotalSessionComm = 0;
          transaction.subadminTotalSessionComm = 0;
          transaction.masterTotalSessionComm = 0;
          transaction.superagentTotalSessionComm = 0;
          transaction.agentTotalSessionComm = 0;
          transaction.clientSessionTurnOver = 0;
          transaction.clientTotalProfitLoss =
            transaction.clientTotalBookmakerOdds +
            transaction.clientTotalBookmakerComm;
        }

        // if (clientId == "67037a05784f0577673187ce") {
        //   _d(transaction);
        //   _d(transaction.clientOddsAmount);
        //   _d(transaction.clientOddsComm);
        // }

        let ProfitLossPosition = {
          userId: clientId,
          userInfo: data.userInfo,
          parentData: parentData,
          clientId: clientId,
          marketId: newMarketId,
          eventId: matchData.eventId,
          eventName: matchData.matchName,
          isDeclare: 1,
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
        };

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
        agentNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.agentMatchProfitLossShare +
          (transaction.agentTotalBookmakerComm +
            transaction.agentTotalSessionComm) *
          matchShareData.agentParentMatchShare;
        agentNetProfitLoss = -1 * agentNetProfitLoss;

        let superagentNetProfitLoss = 0;
        let superagentNetProfitLossSelf = 0;

        let superagentNetOwnShare =
          matchShareData.superagentMatchProfitLossShare;
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

        superagentNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.superagentMatchProfitLossShare +
          (transaction.superagentTotalBookmakerComm +
            transaction.superagentTotalSessionComm) *
          matchShareData.superagentParentMatchShare;
        superagentNetProfitLoss = -1 * superagentNetProfitLoss;

        let masterNetProfitLoss = 0;
        let masterNetProfitLossSelf = 0;
        let masterNetOwnShare = matchShareData.masterMatchProfitLossShare;
        if (masterNetOwnShare == 0) {
          masterNetProfitLoss =
            clientOddsSessionAmount *
            matchShareData.masterMatchProfitLossShare +
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

        masterNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.masterMatchProfitLossShare +
          (transaction.masterTotalBookmakerComm +
            transaction.masterTotalSessionComm) *
          matchShareData.masterParentMatchShare;
        masterNetProfitLoss = -1 * masterNetProfitLoss;

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

        subadminNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.subadminMatchProfitLossShare +
          (transaction.subadminTotalBookmakerComm +
            transaction.subadminTotalSessionComm) *
          matchShareData.subadminParentMatchShare;
        subadminNetProfitLoss = -1 * subadminNetProfitLoss;

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

        adminNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.adminMatchProfitLossShare +
          (transaction.adminTotalBookmakerComm +
            transaction.adminTotalSessionComm) *
          matchShareData.adminParentMatchShare;
        adminNetProfitLoss = -1 * adminNetProfitLoss;

        let superadminNetProfitLoss = 0;
        let superadminNetProfitLossSelf = 0;
        let superadminNetOwnShare =
          matchShareData.superadminMatchProfitLossShare;
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

        superadminNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.superadminMatchProfitLossShare +
          (transaction.superadminTotalBookmakerComm +
            transaction.superadminTotalSessionComm) *
          matchShareData.superadminParentMatchShare;
        superadminNetProfitLoss = -1 * superadminNetProfitLoss;

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

        subownerNetProfitLossSelf =
          -1 *
          clientOddsSessionAmount *
          matchShareData.subownerMatchProfitLossShare +
          (transaction.subownerTotalBookmakerComm +
            transaction.subownerTotalSessionComm) *
          matchShareData.subownerParentMatchShare;
        subownerNetProfitLoss = -1 * subownerNetProfitLoss;

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

        profitLossPosition.ownerNetProfitLossSelf = ownerNetProfitLoss;
        ProfitLossPosition.subownerNetProfitLossSelf =
          subownerNetProfitLossSelf;
        ProfitLossPosition.superadminNetProfitLossSelf =
          superadminNetProfitLossSelf;
        ProfitLossPosition.adminNetProfitLossSelf = adminNetProfitLossSelf;
        ProfitLossPosition.subadminNetProfitLossSelf =
          subadminNetProfitLossSelf;
        ProfitLossPosition.masterNetProfitLossSelf = masterNetProfitLossSelf;
        ProfitLossPosition.superagentNetProfitLossSelf =
          superagentNetProfitLossSelf;
        ProfitLossPosition.agentNetProfitLossSelf = agentNetProfitLossSelf;

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

        if (insertCommCoins) {
          let pushCommTransaction = {
            marketId: newMarketId,
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
            marketId: newMarketId,
            sportsType: "cricket",
            gameType: "cricket",
            remark: `user Comm For Match (${matchData.matchName})}`,
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
            superagentSessionCreditComm =
              transaction.superagentTotalSessionComm;
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

  // _dx("kkkkkkkkkkkk");

  if (insertCommCoins) {
    let finalInsertStatement = [];
    Object.entries(userCommStatement).forEach(([userId, userData]) => {
      finalInsertStatement.push(userData);
    });
    await StatementModel.deleteMany({
      marketId: newMarketId,
      isComm: true,
      statementFor: "userComm",
    });
    // await StatementModel.insertMany(finalInsertStatement);
    await TransactionLogModel.deleteMany({
      marketId: newMarketId,
      overallType: "userComm",
      isComm: 1,
    });
    //  await TransactionLogModel.insertMany(letCommTransactionLog);
    await updateBulkCoinsExposureUserByMarketId(updateUserCoinsInCache);
  }

  playWhere.marketId = newMarketId;

  delete playWhere.clientId;

  await profitLossPosition.deleteMany(playWhere);
  // await profitLossPosition.insertMany(finalPositionData);

  return finalPositionData;
};

const generateLedgerDateWise = async (
  marketId,
  positionData,
  matchData,
  isFancy
) => {
  if (!positionData) {
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
      eventId: marketId,
      amount: 0,
      isDeclare: 1,
      eventName: matchData.matchName,
      remark: matchData.wonTeamName + " Win The Match",
      priority: moment(matchData.matchDate).startOf("day").valueOf(),
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

    let ledgerFinalOnj = {
      updateOne: {
        filter: filter,
        update: {
          $set: item,
        },
        upsert: true,
      },
    };

    finalPushArray.push(ledgerFinalOnj);
  });

  //let insert = await ledgerModel.bulkWrite(finalPushArray);


  await ledgerModel.deleteMany({
    marketId: marketId,
  });
  // const insert = await ledgerModel.insertMany(finalPushArray);
  return true;
};

const dateWiseLedgerAndPosition = async (
  marketId,
  ledgerType,
  ledgerDate,
  matchData
) => {
  let matchName = matchData.matchName;
  let eventId = matchData.eventId;

  let newMatchName = `${matchName} - (${ledgerDate}) - (Session Only)`;
  let newMarketId = `${marketId}_${ledgerDate}`;
  let newEventId = `${eventId}_${ledgerDate}`;

  if (ledgerType == "odds") {
    newMarketId = `${marketId}_odds`;
    newEventId = `${eventId}_odds`;
    newMatchName = `${matchName} - (Odds Only)`;
  }

  matchData.matchName = newMatchName;
  matchData.marketId = newMarketId;
  matchData.eventId = newEventId;

  let transactionData = await wholeTransactionMarketData(
    marketId,
    "",
    ledgerDate,
    ledgerType
  );

  // _dx(transactionData);
  let positionData = await declarePositionAndLedgerDateWise(
    marketId,
    matchData,
    transactionData,
    newMarketId,
    ledgerType
  );

  let ledgerData = await generateLedgerDateWise(
    newMarketId,
    positionData,
    matchData
  );
  return true;
};

const getWonTeamName = async (
  matchData,
  decisionSelectionId,
  isToss = false
) => {
  try {
    let wonTeamName = "";
    const teamData = JSON.parse(matchData.teamData);
    teamData.map((team) => {
      if (isToss) {
        team.selection_id = team.selection_id * 10000;
      }
      if (team.bookmakerSelectionId && team.bookmakerSelectionId != 0 && team.bookmakerSelectionId != null ) {
        team.selection_id = team.bookmakerSelectionId
      }

      if (Number(team.selection_id) == Number(decisionSelectionId)) {
        wonTeamName = team.runner_name;
      }
    });

    return wonTeamName;
  } catch (error) { }
};

const saveResultForSports = async (
  marketId,
  marketType,
  decisionData,
  matchData = {}
) => {
  try {
    if (matchData != {}) {
      matchData = await SportListModel.findOne({ marketId: marketId });
    }
    let updateData = {
      marketId: matchData.marketId,
      eventId: matchData.eventId,
      sportType: matchData.sportType,
      seriesName: matchData.seriesName,
      matchName: matchData.matchName,
      sportId: matchData.sportId,
      seriesId: matchData.seriesId,
      marketType: matchData.marketType,
      resultName: decisionData.resultName,
      result: decisionData.result,
      selectionId: decisionData.selectionId ? decisionData.selectionId : "",
    };

    let where = {
      marketId: marketId,
      marketType: marketType,
    };

    if (marketType == "fancy") {
      where.selectionId = decisionData.selectionId;
    }

    let update = await sportResultModel.updateOne(
      where,
      {
        $set: updateData,
      },
      {
        upsert: true,
      }
    );

    return update;
  } catch (e) {
    console.log(e.message);
  }
};

const getSportsResults = async (req, res) => {
  try {
    const {
      sportId,
      marketId,
      eventId,
      marketType,
      seriesId,
      page = 1,
      limit = 20,
    } = req.body;

    let filter = {};

    // Filters
    if (sportId) filter.sportId = sportId;
    if (marketId) filter.marketId = marketId;
    if (eventId) filter.eventId = eventId;
    if (marketType) filter.marketType = marketType;
    if (seriesId) filter.seriesId = seriesId;

    

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const results = await sportResultModel
      .find(filter)
      .sort({ createdAt: -1 }) // 🔥 latest first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await sportResultModel.countDocuments(filter);

  return {
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: results,
    }


  } catch (error) {
    
    console.log(error.message);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

module.exports = {
  oddsDecision,
  generateDiamondCasinoComm,
  betfairMarketDecision,
  clearExposureByMarketId,
  internationalCasinoLedgerForClientWise,
  dateWiseLedgerAndPosition,
  getWonTeamName,
  saveResultForSports,
  getSportsResults
};
