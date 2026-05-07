const Joi = require("joi");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const axios = require("axios");
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

const matkaBetModel = require("../../Models/Matka/MatkaBets.model");
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
const { getUserIdByUsername, getShareChainData } = require("../../Helpers/UsersUtils");

getSessionList = async (req, res) => {
    try {
        let bodyData = req.body;
        let marketId = bodyData?.marketId;
        if(!marketId){
          return SendResponse(res, "error", "marketId is required");
        }

        let where = {
            marketId: marketId
        }

        if(bodyData.hasOwnProperty("isDeclare")){
          where.isDeclare = bodyData.isDeclare
        } 

        if(bodyData.hasOwnProperty("isDeleted")){
          where.isDeleted = bodyData.isDeleted
        } 

        if(bodyData.fromDate && bodyData.toDate){
           where.date = dateWhereCond(bodyData.fromDate, bodyData.toDate)
        }
      const SessionList = await BetService.getSessionList(where);
      return SendResponse(res, "success", "fetch Data", SessionList);
    } catch (error) {
      console.log(error);
      return SendResponse(res, "error", "fetch Data in Session List", error);
    }
};  

const getBetsList = async (req, res) => {
  try {
    const bodyData = req.body || {};
    let returnData = {};
    let where = {};
    let fancyBetData = [];
    let oddsBetData = [];
    let casinoBetData = [];
    let diamondBetData = [];
    let matkaBetData = [];

    const isClientExposure = Object.prototype.hasOwnProperty.call(bodyData, "isClientExposure");
    
    if(bodyData.hasOwnProperty("isDeclare")){
       where.isDeclare = bodyData.isDeclare;
    }

    if(bodyData.hasOwnProperty("marketId")){
       where.marketId = bodyData.marketId;
    }

    let inData = [0, false];
    if (bodyData.isDeleted == 1 || bodyData.isDeleted === true) inData = [1, true];
    where.isDeleted = { $in: inData };

   
  
    if (bodyData.selectionId) where.selectionId = bodyData.selectionId;

    if (bodyData.fromDate && bodyData.toDate) {
      const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
      const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
      if (isTime) {
       where.createdAt = dateWhere;
      } else {
        where.date = dateWhere;  
      }
    }

    if (bodyData.gameId && bodyData.casinoBet) {
      where.gameId = bodyData.gameId;
    }

    if (bodyData.oddsType) {
      const oddsType = bodyData.oddsType === "bookmakerOdds" ? "bookmaker" : bodyData.oddsType;
      where.oddsType = oddsType;
    }

    if (bodyData.minAmt && bodyData.maxAmt) {
      where.amount = { $gt: bodyData.minAmt, $lt: bodyData.maxAmt };
    }

    if (bodyData.sportId) where.sportId = bodyData.sportId;

    if (bodyData.ip ) {
      where.ip = bodyData.ip;
    }

    if (isClientExposure) {
      where.isDeclare = false;
      where.isDeleted = false;
      bodyData.casinoBet = true;
      bodyData.fancyBet = true;
      bodyData.oddsBet = true;
      bodyData.diamondBet = true;
      bodyData.matkaBet = true;
    }

    if (bodyData.username) {
      const userData = await getUserIdByUsername(bodyData.username);
      if (userData.status !== "success") {
        return SendResponse(res, "error", "username not found");
      }
      where.userId = userData.userDetails.userId;
    }
    
    const amountSort = bodyData.amountSort || false;
    const idSort = bodyData.idSort || false;


    if (bodyData.casinoBet) {
      if (bodyData.eventId) whereObj.gameId = bodyData.eventId;
      if (bodyData.roundId) whereObj.roundId = bodyData.roundId;
    }

    const tasks = [];

    if (bodyData.fancyBet) {
      const userAmountAlias = `amount`;
      const fancyCountPromise =
        bodyData.size && bodyData.pageNo ? FancyBetModel.countDocuments(whereObj) : Promise.resolve(null);

      const fancyListPromise = BetService.getFancyBetList(
        whereObj,
        ` ${userAmountAlias}  , userId , amount , selectionId , loss , profit , isComm , decisionRun , sessionName , isDeclare , createdAt , type , userInfo , ip , Ip , date , run , odds , type , deletedRemark , isDeleted , marketId , eventId  , fancyType , gtype`,
        amountSort,
        idSort,
        bodyData
      );

      tasks.push(
        Promise.all([fancyCountPromise, fancyListPromise]).then(([cnt, list]) => {
          if (cnt !== null) returnData.totalFancyCount = cnt;
          fancyBetData = Array.isArray(list) ? list : [];
          returnData.fancyBetData = fancyBetData;
        })
      );
    }

    if (bodyData.oddsBet) {
      const oddsCountPromise =
        bodyData.size && bodyData.pageNo ? BetModel.countDocuments(whereObj) : Promise.resolve(null);

      const oddsListPromise = BetService.getOddsBetList(
        whereObj,
        "userId , amount , selectionId ,  odds , type , profit , loss , teamName , userInfo , ip , date , createdAt , oddsType , isDeleted , isDeclare , positionInfo , decisionSelectionId , wonTeamName , marketId , eventId , matchName , betfairMarketId , matchName",
        bodyData
      );

      tasks.push(
        Promise.all([oddsCountPromise, oddsListPromise]).then(async ([cnt, list]) => {
          if (cnt !== null) returnData.totalOddsCount = cnt;

          oddsBetData = Array.isArray(list) ? list : [];
          returnData.oddsBetData = oddsBetData;

          if (bodyData.lastOddsInsert && oddsBetData.length > 0) {
            await client.set(`lastOddsInsertId_${marketId}_${loggedInData.userId}`, false);
          }
        })
      );
    }

    if (bodyData.diamondBet) {
      tasks.push(
        casinoBetModel.find(whereObj).then((list) => {
          diamondBetData = Array.isArray(list) ? list : [];
          returnData.diamondBetData = diamondBetData;
        })
      );
    }

    if (bodyData.casinoBet) {
      const casinoSpecific = {
        betType: 1,
        debitAmount: 1,
        creditAmount: 1,
        rollbackAmount: 1,
        rollbackReason: 1,
        gameId: 1,
        gameName: 1,
        providerName: 1,
        subProviderName: 1,
        operatorId: 1,
        roundId: 1,
        transactionId: 1,
        isDeclare: 1,
        isDeleted: 1,
        ip: 1,
        createdAt: 1,
        betDetails: 1,
        userInfo: 1,
        actualBetAmount: 1,
        marketId: 1,
        eventId: 1,
      };

      const casinoCountPromise =
        bodyData.size && bodyData.pageNo
          ? internationalCasinoBet.countDocuments(whereObj)
          : Promise.resolve(null);

      const casinoListPromise = (async () => {
        let q = internationalCasinoBet.find(whereObj, casinoSpecific).sort({ _id: -1 });

        if (bodyData.size && bodyData.pageNo) {
          q = q.skip(bodyData.size * (bodyData.pageNo - 1)).limit(bodyData.size);
        }
        return q;
      })();

      tasks.push(
        Promise.all([casinoCountPromise, casinoListPromise]).then(([cnt, list]) => {
          if (cnt !== null) returnData.totalCasinoCount = cnt; // fixed key
          casinoBetData = Array.isArray(list) ? list : [];
          returnData.casinoBetData = casinoBetData;
        })
      );
    }

    if (bodyData.matkaBet) {
      tasks.push(
        (async () => {
          const matkaWhere = { ...whereObj, isDeclare: 0 };
          const list = await matkaBetModel.find(matkaWhere);
          matkaBetData = Array.isArray(list) ? list : [];
          returnData.matkaBetData = matkaBetData;
        })()
      );
    }

    await Promise.all(tasks);

    if (isClientExposure) {
      const finalReturnData = [];

      if (Array.isArray(fancyBetData) && fancyBetData.length) {
        fancyBetData.forEach((value) => {
          finalReturnData.push({
            market: value.sessionName,
            amount: value.amount,
            type: value.type === "N" ? "NOT" : "YES",
            rate: value.run,
            time: value.createdAt,
            odds: value.odds,
            userInfo: value.userInfo,
            marketType: "fancy",
          });
        });
      }

      if (Array.isArray(oddsBetData) && oddsBetData.length) {
        oddsBetData.forEach((value) => {
          finalReturnData.push({
            market: `${value.teamName} - ${value.oddsType}`,
            amount: value.amount,
            type: value.type === "L" ? "LAGAI" : "KHAI",
            rate: value.odds,
            time: value.createdAt,
            odds: value.odds,
            userInfo: value.userInfo,
            marketType: "odds",
          });
        });
      }

      if (Array.isArray(casinoBetData) && casinoBetData.length) {
        casinoBetData.forEach((value) => {
          let rate = "";
          let type = "";
          let odds = "";

          if (value.providerName === "Diamond" && value.betDetails) {
            rate = value.betDetails.rate;
            type = value.betDetails.type;
            odds = value.betDetails.odds;
          }

          finalReturnData.push({
            market: `${value.gameName} (${value.gameId})`,
            amount: value.debitAmount,
            type,
            rate,
            time: value.createdAt,
            odds,
            userInfo: value.userInfo,
            marketType: "casino",
          });
        });
      }

      if (Array.isArray(diamondBetData) && diamondBetData.length) {
        diamondBetData.forEach((value) => {
          finalReturnData.push({
            market: `${value.casinoType} (${value.eventId})`,
            amount: value.amount,
            type: value.betType,
            rate: value.odds,
            time: value.createdAt,
            odds: value.odds,
            userInfo: value.userInfo,
            marketType: "diamondCasino",
          });
        });
      }

      if (Array.isArray(matkaBetData) && matkaBetData.length) {
        matkaBetData.forEach((value) => {
          finalReturnData.push({
            market: `${value.matkaName} (${value.gameType})`,
            amount: value.amount,
            type: value.betType,
            rate: value.rate,
            time: value.createdAt,
            odds: value.rate,
            userInfo: value.userInfo,
            marketType: "matka",
          });
        });
      }

      returnData = finalReturnData;
    }

    return SendResponse(res, "success", "Fetch List Successfuly", returnData);
  } catch (error) {
    console.log("fetch Bets List error in Bet Controller", error);
    return SendResponse(res, "error", "fetch Bets List error in Bet Controller", error);
  }
};


module.exports = {
  getSessionList,
  getBetsList
};