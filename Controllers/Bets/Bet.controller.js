const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  updateCoinsTbl,
  insertTransactionLog,
  updateUserCoins,
  getSessionPositionByTransaction,
  GetUserCoinsByMarketId,
  getOddsPositionByMarketId,
  checkLastBetTiming,
  getUserCoinsByTransactionTable
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const OpenBetsModel = require("../../Models/BetsList/OpenBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const sportListModel = require("../../Models/sportList.model");
const sportsMarketListModel = require("../../Models/sportsMarketList.model");
const playModel = require("../../Models/Play.model");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const matkaBetModel = require("../../Models/Matka/MatkaBets.model");
const internationalCasinoBet = require("../../Models/BetsList/InternationalCasinoBetsList.model");

const { ObjectId } = require("mongodb");
var requestIp = require("request-ip");
const Joi = require("joi");
const { emitToAllActiveUsers , emitToUser } =  require("../../socket.js")
const BetService = require("../../Services/Sports/Bet.service");

const {
  siteSetting,
  StatementMsg,
  fetchUrl,
} = require("../../Common/Constants");
const {
  _dx,
  whereHelper,
  _d,
  mongoToJson,
  convertKeyObject,
  dateWhereCond,
  throughSocketDataByAxios,
  updateDomainBySocket,
  settingData,
  getTimeDifference,
  detectIsTime
} = require("../../Helpers/CommonHelper");
const moment = require("moment");
const axios = require("axios");
const UserModel = require("../../Models/User/User.model");

const { getUserIdByUsername } = require("../../Helpers/UsersUtils");
axios.defaults.timeout = siteSetting.axiosTimeOut;

const oddBetPlaced = async (req, res) => {
  try {
    const t0 = Date.now();
    let bodyData = req.body;
    const loggedUserData = req.loggedInUser;
    bodyData.loginDetails = loggedUserData
    const userId = loggedUserData.userId;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      amount: Joi.number().required(),
      selectionId: Joi.number().required(),
      odds: Joi.number().required(),
      run: Joi.number().required(),
      eventId: Joi.number().required(),
      betFor: Joi.string().required(),
      oddsType: Joi.string().required(),
      type: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    const marketId = bodyData.marketId;
    bodyData.oddsType = bodyData.oddsType == "Match Odds" ? "matchOdds" : bodyData.oddsType 
  
    if (loggedUserData.userType !== "client") {
      return SendResponse(res, "error", "Only client Authorized to place bet");
    }

    const [timerCheck, blockedMarketUser , userRateRedis] = await Promise.all([
     checkLastBetTiming(userId),
      client.sismember(`${marketId}_BlockMarket`, loggedUserData.userId),
       client.get(
        `rateDiffrence_${loggedUserData.userId}`
      ),
    ]);
    
    if (!timerCheck) {
      return SendResponse(res, "error", `we can not accept your bet  due to fast bet under ${process.env.BET_WAITING_TIMER} Sec`);
    }
  
    if (blockedMarketUser) {
      return SendResponse(res, "error", "Market Is Blocked");
    }
    
    let userRate  = userRateRedis?userRateRedis:0


    if(bodyData.isOpenBet && bodyData.isOpenBet==true){
      let betTransactionAmount = await OpenBetsModel.findOne(
        { 
          _id : new ObjectId(bodyData.openBetId),
        }
      )
      if (!betTransactionAmount) {
        return SendResponse(res, "error", "open Bet Not Found");
      }
    }

    const checkOdds = await BetService.checkLiveMatchOdds(bodyData, userRate);
    if (checkOdds.status == "error") {
      return SendResponse(res, "error", checkOdds.message);
    }

    if(checkOdds.status == "success" && checkOdds.message == "isOpenBets"){
       await updateCoinsTbl(loggedUserData.userId, "client");
       return SendResponse(res, "success", "open bet success", {isOpenBets:true});
    }

    const liveOdds = checkOdds.data.liveOdds;
    const selectionId = bodyData.selectionId;
    const matchData = checkOdds.data.matchData;
    const matchName = matchData.matchName;
    let settingData = checkOdds?.data?.settingData
    let betfairMarketList = checkOdds.data.betfairMarketList ? checkOdds.data.betfairMarketList : []
    
    let checkUserData = await BetService.checkUserData(userId, bodyData);
    if (checkUserData.status == "error") {
      return SendResponse(res, "error", checkUserData.message);
    }
    const userData = checkUserData.data;
    if (!userData.betStatus) {
      return SendResponse(
        res,
        "error",
        "your bet is locked please contact your agent"
      );
    }


    

    let oldMatchBet = {};
    let checkPlayData = {};
    let shareData = {};
    let directUserShareData = {}

    checkPlayData = await BetService.checkPlayDataMarketWise(
      userData,
      marketId
    );
   
    
    if (checkPlayData.shareData) {
      shareData = JSON.parse(checkPlayData.shareData);
    }

    if (checkPlayData?.directUserShareData) {
      directUserShareData = checkPlayData?.directUserShareData
    }



    const oddsType = bodyData.oddsType;

    if (betfairMarketList.includes(oddsType)) {
      bodyData.odds = (bodyData.odds - 1).toFixed(2);
      bodyData.odds = bodyData.type=="L" ? liveOdds.lgaai : liveOdds.khaai
    }

    if (oddsType == "bookmaker") {
      bodyData.odds = (bodyData.type == "L" || bodyData.type == "l")  ? liveOdds[selectionId]?.lgaai : liveOdds[selectionId]?.khaai
    }


    oldMatchBet = await BetModel.find(
      {
        userId: userData.userId,
        marketId: marketId.trim(),
        isDeleted: 0,
        oddsType: oddsType,
      },
      {
        amount: 1,
        selectionId: 1,
        odds: 1,
        type: 1,
        profit: 1,
        loss: 1,
        teamName: 1,
        createdAt: 1,
      }
    );
    if (oldMatchBet) {
      oldMatchBet = mongoToJson(oldMatchBet);
    }
    let teamData = [];

    if (oddsType == "toss") {
      for (const teamId in liveOdds) {
        if (liveOdds.hasOwnProperty(teamId)) {
          const team = liveOdds[teamId];
          let pushData = {
            selection_id: team.selectionid,
            runner_name: team.team_name,
          };
          teamData.push(pushData);
        }
      }
    } else if (betfairMarketList.includes(oddsType) ){
      const marketData = await sportsMarketListModel.findOne({
        marketId: bodyData.betfairMarketId,
      });

      if (!marketData) {
        return SendResponse(res, "error", "marketData not found in database");
      }

      const selectionIdData = marketData.selectionIdData;
      selectionIdData.map((selection) => {
        let push = {
          selection_id: selection.selectionId,
          runner_name: selection.runnerName,
        };
        teamData.push(push);
      });
    } else {
      teamData = JSON.parse(matchData.teamData);
    }

    const oldBetPosition = await BetService.betsMatchPosition(
      oldMatchBet,
      teamData
    );


    let profit = 0;
    let loss = 0;

    teamData.map((data) => {
      if (
        data.selection_id == bodyData.selectionId &&
        (bodyData.type == "L" || bodyData.type == "l")
      ) {
        profit = bodyData.amount * bodyData.odds;
        loss = -1 * bodyData.amount ;
      } else if (
        data.selection_id == bodyData.selectionId &&
        (bodyData.type == "K" || bodyData.type == "k")
      ) {
        profit = bodyData.amount;
        loss = -1 * bodyData.amount * bodyData.odds;
      }
    });

    let teamName = "";
    let betfairMarketId = "";
    if (betfairMarketList.includes(oddsType)) {
      teamName = liveOdds.team_name;
      betfairMarketId = matchData.betfairMarketId
    } else {
      const insertOddsData = liveOdds[selectionId];
      teamName = insertOddsData.team_name;
    }

    
    var clientIp = requestIp.getClientIp(req);

    userInfo = {
      clientCode: userData.username,
      clientName: userData.name,
      creatorName: userData.creatorName,
    };

    let insertBet = {
      marketId: marketId.trim(),
      profit: profit,
      loss: loss,
      amount: bodyData.amount,
      eventId: matchData.eventId,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      superadminId: userData.superadminId,
      adminId: userData.adminId,
      subadminId: userData.subadminId,
      masterId: userData.masterId,
      superagentId: userData.superagentId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      userId: userData.userId,
      odds: bodyData.odds,
      selectionId: selectionId,
      teamName: teamName,
      oddsType: bodyData.oddsType,
      type: bodyData.type,
      ip: clientIp,
      userInfo: userInfo,
      matchName: matchName,
      betfairMarketId: betfairMarketId,
      sportsId: matchData.sportId,
    };

    const NewBetInsertIntoPosition = {
      profit: profit,
      loss: loss,
      amount: bodyData.amount,
      odds: bodyData.odds,
      selectionId: selectionId,
      teamName: teamName,
      oddsType: bodyData.oddsType,
      type: bodyData.type,
      createdAt: moment().toDate().getTime(),
    };

    oldMatchBet.push(NewBetInsertIntoPosition);

    const newBetPosition = await BetService.betsMatchPosition(
      oldMatchBet,
      teamData
    );

    let positionInfo = {};
    let positionInfoBet = [];
    positionInfoBet.push(NewBetInsertIntoPosition);
    positionInfo = await BetService.betsMatchPosition(
      positionInfoBet,
      teamData
    );

    //_d(positionInfo)

    insertBet.positionInfo = positionInfo;

    let oldPosMinAmountarr = Object.values(oldBetPosition);
    let oldPosMinAmount = Math.min(...oldPosMinAmountarr);
    let newPosMinAmountarr = Object.values(newBetPosition);

    let newPosMinAmount = Math.min(...newPosMinAmountarr);


    let newPosMaxAmount = Math.max(...newPosMinAmountarr);

    if (newPosMinAmount > 0) {
      newPosMinAmount = 0;
    }


    let userCoins = userData.coins 
    let realUserCoins = await getUserCoinsByTransactionTable(userData._id)

    if(realUserCoins && realUserCoins.totalCoins){
      userCoins  = realUserCoins.totalCoins
    }

    if (bodyData.isOpenBet && bodyData.isOpenBet === true) {
      let betTransaction = await TransactionLogModel.aggregate([
        {
          $match: {
            userId: new ObjectId(userData.userId),
            marketId: marketId,
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);
    
      let totalAmount = betTransaction.length > 0 ? Math.abs(betTransaction[0].totalAmount) : 0;
      userCoins = userCoins + totalAmount;
    }
    
    let check = userCoins + Math.abs(oldPosMinAmount);
    let checkAmount = Math.abs(newPosMinAmount);
    let deductAmount = newPosMinAmount;

    if (oldPosMinAmount > 0) {
      let currentSelection = bodyData.selectionId;
      if (bodyData.type == "L") {
        delete oldBetPosition[currentSelection];
        checkAmount = bodyData.amount;
        oldPosMinAmountarr = Object.values(oldBetPosition);
        oldPosMinAmount = Math.min(...oldPosMinAmountarr);
      } else if (bodyData.type == "k" || bodyData.type == "K") {
        oldPosMinAmount = oldBetPosition[currentSelection];
        checkAmount = bodyData.amount * bodyData.odds;
      }
      check = userData.coins + Math.abs(oldPosMinAmount);
    }

    if (checkAmount > check) {
      return SendResponse(res, "error", "invalid Amount");
    }
    
  

    const logData = {
      amount: deductAmount,
      forBet: 1,
      sportId: matchData.sportId  ? matchData.sportId  : 0 ,
      gameName: "sports",
      gameType: oddsType,
      overallType: "bookmakerOdds",
      remarks: `${oddsType} Odds for (${matchName})`,
    };


    
    try {
        if (directUserShareData && directUserShareData != null) {
          newPosMaxAmount = deductAmount
          directUserShareData = JSON.parse(directUserShareData)
          if (directUserShareData) {
            directUserShareData.map((data) => {
              logData[`${data?.creatorUserType}ShareAmount`] = Math.round(
                data[`${data?.creatorUserType}ProfitLossrMatchShare`] * newPosMaxAmount /100
            );
            })
          }
        }
    } catch (e) {
      console.log(e, "problem with directShare in bookmaker place bets")
    }
  

    await TransactionLogModel.deleteMany({
      userId: userData._id,
      marketId: marketId.trim(),
      overallType: "bookmakerOdds",
      gameType: oddsType,
    });

    await OddsPositionModel.deleteMany({
      userId: new ObjectId(userData.userId),
      marketId: marketId.trim(),
      oddsType: oddsType,
    });

    await insertTransactionLog(userData, logData, matchData, shareData);
    const updateCoins = await updateCoinsTbl(userId, userData.userType);

  
    if(updateCoins.totalCoins < 0 ){
      const logData = {
        amount: -1 * Math.abs(oldPosMinAmount),
        forBet: 1,
        sportId: matchData.sportId  ? matchData.sportId  : 0 ,
        gameName: "sports",
        gameType: oddsType,
        overallType: "bookmakerOdds",
        remarks: `${oddsType} Odds for (${matchName})`,
      };

      await TransactionLogModel.deleteMany({
        userId: userData._id,
        marketId: marketId.trim(),
        overallType: "bookmakerOdds",
        gameType: oddsType,
      });
      await insertTransactionLog(userData, logData, matchData, shareData);
      let updateCoinsAgain = await updateCoinsTbl(userId, userData.userType);
      return SendResponse(
        res,
        "error",
        "invalid Amount",
        updateCoinsAgain
      );
  }

let operations = [];
if (teamData?.length) {
    operations = teamData.map((team) => {
      const teamPosition = newBetPosition[team.selection_id] || 0;

      const pushPositionData = {
        marketId: marketId.trim(),
        oddsType,
        amount: teamPosition,
        eventId: matchData.eventId,
        ownerId: userData.ownerId,
        subownerId: userData.subownerId,
        superadminId: userData.superadminId,
        adminId: userData.adminId,
        subadminId: userData.subadminId,
        masterId: userData.masterId,
        superagentId: userData.superagentId,
        agentId: userData.agentId,
        clientId: userData.clientId,
        userId: userData.userId,
        selectionId: team.selection_id,
        teamName: `${team.runner_name}`,
        sportsId : matchData.sportId
      };

     // _d(pushPositionData , "pushPositionData")

      if (shareData) {
        pushPositionData.ownerAmount = Math.round(shareData.ownerMatchProfitLossShare * teamPosition);
        pushPositionData.subownerAmount = Math.round(shareData.subownerMatchProfitLossShare * teamPosition);
        pushPositionData.superadminAmount = Math.round(shareData.superadminMatchProfitLossShare * teamPosition);
        pushPositionData.adminAmount = Math.round(shareData.adminMatchProfitLossShare * teamPosition);
        pushPositionData.subadminAmount = Math.round(shareData.subadminMatchProfitLossShare * teamPosition);
        pushPositionData.masterAmount = Math.round(shareData.masterMatchProfitLossShare * teamPosition);
        pushPositionData.superagentAmount = Math.round(shareData.superagentMatchProfitLossShare * teamPosition);
        pushPositionData.agentAmount = Math.round(shareData.agentMatchProfitLossShare * teamPosition);
      }
      return { insertOne: { document: pushPositionData } };
    });
}

    // _dx(operations)
    
 let updateObj = {
      playStatus: 1,
      updateMatchBet: true,
      isMatchPlay: true,
    };


const promises = [
  BetModel.create(insertBet), 
  GetUserCoinsByMarketId(userId, userData.userType, marketId), // fetch coins
  BetService.updatePlayModel(userData.userId, marketId, updateObj),
];

if (operations.length) {
  promises.push(OddsPositionModel.bulkWrite(operations));
}

const [insertBetData, marketCoins, BetServicesData ,oddsPositionResult] = await Promise.all(promises);

    const insertBetId = insertBetData?._id;
    const timestamp = Date.now();
    updateCoins.marketExposure = marketCoins.marketExposure;
    updateCoins.matchPosition = newBetPosition;

   
    await Promise.all([
      client.del(`${userData.userId}_${marketId}_POS`),
      client.set(`lastBetTimeUser__${userId}`, timestamp),
      client.del(`${userData.userId}_oddsData_${marketId}`),
    ]);


    if(bodyData.isOpenBet && bodyData.isOpenBet==true){
      let whereTransaction = {
        userId : new ObjectId(userData.userId) , 
        marketId : marketId.trim(),
        overallType : "openBet"
      }

      let whereBetOpen = {
        _id : new ObjectId(bodyData.openBetId),
        userId : new ObjectId(userData.userId) , 
        marketId : marketId.trim(),
      }

      await Promise.all([ 
       TransactionLogModel.deleteMany(whereTransaction),
       OpenBetsModel.deleteMany(whereBetOpen),
       client.del(`${userData.userId}_openBets_${marketId}`)
      ])

      let newPos  = await BetService.getNewOpenBetsPosition(userData.userId, marketId)
      if(newPos.data < 0){
          await TransactionLogModel.create({
            amount : newPos.data ,
            userId : userData.userId,
            marketId : marketId.trim(),  
            overallType : "openBet",
            forBet :1 , 
            isDeclare : 0
        })
      }
    }


    try {
    
      if (directUserShareData) {
        await Promise.allSettled(
          directUserShareData.map((data) =>
            emitToUser(
              "betUpdate",
              JSON.stringify(insertBet),
              data?.userUserId
            )
          )
        );
      }
    }
     catch (e) {
      console.log(
        e,
        "problem with through socket for updating bet in admin panels"
      );
    }
    

    return SendResponse(
      res,
      "success",
      `${oddsType} Bets Placed Successfully`,
      updateCoins
    );
  } catch (error) {
    console.log("Something Went Wrong In Odds Bet Place in oddBetPlaced", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Odds Bet Place in oddBetPlaced",
      error
    );
  }
};

const sessionBetPlaced = async (req, res) => {
  let sessionData = [];
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  let bodyData = req.body;
  const JoiSchema = Joi.object({
    odds: Joi.number().required(),
    amount: Joi.number().required(),
    marketId: Joi.string().required(),
    selectionId: Joi.required(),
    run: Joi.number().required(),
    eventId: Joi.number().required(),
    betFor: Joi.string().required(),
    oddsType: Joi.string().required(),
    type: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  try {

    bodyData.selectionId = bodyData.selectionId + ""

    if (userType !== "client") {
      return SendResponse(res, "error", "Only client Authorised To Place Bet");
    }

    let timerCheck = await checkLastBetTiming(userId);
    if (!timerCheck) {
      return SendResponse(res, "error", "odds expired");
    }

    const marketId = bodyData.marketId;

    if (siteSetting.IS_REDIS) {
      let blockedMarketUser = await client.sismember(
        `${marketId}_BlockMarket`,
        loggedUserData.userId
      );
      if (blockedMarketUser) {
        return SendResponse(res, "error", "Market Is Blocked");
      }
    }

    const checkOdds = await BetService.checkLiveMatchOdds(bodyData);

    if (checkOdds.status == "error") {
      return SendResponse(res, "error", checkOdds.message);
    }

    let settingData = checkOdds?.data?.settingData

    const startTime = Date.now();

    sessionData = checkOdds.data.liveOdds;




   

    const selectionId = bodyData.selectionId
    const type = bodyData.type;
    const matchData = checkOdds.data.matchData;
    const odds = bodyData.odds;
    const amount = bodyData.amount;

    bodyData.run = type == "Y" ? (sessionData.runsYes ?sessionData.runsYes : bodyData.run ) : (sessionData.runsNo ?sessionData.runsNo : bodyData.run )

    const run = bodyData.run;


    let fancyType = "Normal"
    if (settingData && settingData.fancyType && settingData.fancyType != "Normal") {
      fancyType = settingData.fancyType
    }

    if (fancyType != "Normal") {
      return SendResponse(res, "error", "Only Normal Type fancy allowed to Bet place");
    }

    let checkUserData = await BetService.checkUserData(userId, bodyData);
    if (checkUserData.status == "error") {
      return SendResponse(res, "error", checkOdds.message);
    }
    const userData = checkUserData.data;
    let oldSessionBetData = {};
    let checkPlayData = {};
    let directUserShareData = {}

    if (!userData.betStatus) {
      return SendResponse(
        res,
        "error",
        "your bet is locked please contact your agent"
      );
    }

    checkPlayData = await BetService.checkPlayDataMarketWise(
      userData,
      marketId,
      "fancy"
    );


    if (checkPlayData?.directUserShareData) {
      directUserShareData = checkPlayData?.directUserShareData
    }

    const shareData = JSON.parse(checkPlayData.shareData);

    oldSessionBetData = [];

    let sessionDatabase = await FancyBetModel.find({
      userId: userData.userId,
      marketId: marketId.trim(),
      selectionId: selectionId,
      isDeleted: 0,
    });

    if (sessionDatabase) {
      oldSessionBetData = mongoToJson(sessionDatabase);
    }

    let profit = 0;
    let loss = 0;
    let gtype = sessionData.gtype ? sessionData.gtype : "fancy"


    if (type == "Y") {
      profit = Math.round(odds * amount);
      loss = Math.round(-1 * amount);
    } else {
      profit = Math.round(amount);
      loss = Math.round(-1 * odds * amount);
    }





    var clientIp = requestIp.getClientIp(req);
    userInfo = {
      clientCode: userData.username,
      clientName: userData.name,
      creatorName: userData.creatorName,
    };

    let isComm = 1;
    if (sessionData.com_perm && sessionData.com_perm != "YES") {
      isComm = 0;
    }

    let insertFancyBet = {
      marketId: marketId.trim(),
      profit: profit,
      loss: loss,
      amount: bodyData.amount,
      eventId: matchData.eventId,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      superadminId: userData.superadminId,
      subadminId: userData.subadminId,
      adminId: userData.adminId,
      masterId: userData.masterId,
      superagentId: userData.superagentId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      userId: userData.userId,
      odds: bodyData.odds,
      selectionId: selectionId,
      sessionName: sessionData.session_name,
      run: Math.round(run),
      type: bodyData.type,
      userInfo: userInfo,
      ip: clientIp,
      isComm: isComm,
      gtype : gtype
    };

    if (shareData) {
      insertFancyBet.ownerAmount = Math.round(
        shareData.ownerMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.subownerAmount = Math.round(
        shareData.subownerMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.superadminAmount = Math.round(
        shareData.superadminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.adminAmount = Math.round(
        shareData.adminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.subadminAmount = Math.round(
        shareData.subadminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.masterAmount = Math.round(
        shareData.masterMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.superagentAmount = Math.round(
        shareData.superagentMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.agentAmount = Math.round(
        shareData.agentMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.clientAmount = Math.round(bodyData.amount);
    }

    let newPositionAmount = 0;
    oldSessionBetData.push(insertFancyBet);

    if (oldSessionBetData.length == 1) {
      newPositionAmount =
        bodyData.type == "Y"
          ? bodyData.amount
          : bodyData.amount * bodyData.odds;
    } else {
      const newBetsPosition = await BetService.getSessionPositon(
        oldSessionBetData,
        "",
        loggedUserData
      );
      const values = Object.values(newBetsPosition);
      newPositionAmount = Math.min(...values);
    }

    let oldPositionAmountData = await getSessionPositionByTransaction(
      userData,
      selectionId,
      marketId
    );


    const oldPositionAmount = oldPositionAmountData;


    let coins = userData.coins;
    
    let realUserCoins = await getUserCoinsByTransactionTable(userData._id)

    if(realUserCoins && realUserCoins.totalCoins){
      coins = realUserCoins.totalCoins
    }

    if (Math.abs(newPositionAmount) > Math.abs(oldPositionAmount) + coins) {
      return SendResponse(res, "error", "Invalid Fancy Amount");
    }

    
    let endTime = Date.now();
    let executionTime = endTime - startTime; // Calculate the execution time in milliseconds

    if (executionTime > 4000) {
      return SendResponse(res, "error", "execution SendResponse time out");
    }


    const logData = {
      amount:
        newPositionAmount > 0 ? -1 * newPositionAmount : newPositionAmount,
      forBet: 1,
      sportId: matchData.sportId  ? matchData.sportId  : 0 ,
      gameName: "sports",
      gameType: "fancyOdds",
      overallType: "fancyOdds",
      selectionId: selectionId,
      remarks: sessionData.session_name,
      sessionTurnOver: Math.abs(newPositionAmount),
    };

    await TransactionLogModel.deleteMany({
      userId: userData._id,
      marketId: marketId.trim(),
      overallType: "fancyOdds",
      selectionId: selectionId,
    });


    try {
        if (directUserShareData && directUserShareData != null) {
          newPositionAmount = -1 * newPositionAmount
          directUserShareData = JSON.parse(directUserShareData)
          if (directUserShareData) {
            directUserShareData.map((data) => {
              logData[`${data?.creatorUserType}ShareAmount`] = Math.round(
                data[`${data?.creatorUserType}ProfitLossrMatchShare`] * newPositionAmount /100
            );
            })
          }
        }
    } catch (e) {
      console.log(e, "problem with directShare in bookmaker place bets")
    }
  

    await insertTransactionLog(userData, logData, matchData, shareData);

    let updateCoins = await updateCoinsTbl(userId, userData.userType);

    if(updateCoins.totalCoins < 0 ){
      const logData = {
        amount:  oldPositionAmount,
        forBet: 1,
        sportId: matchData.sportId  ? matchData.sportId  : 0 ,
        gameName: "sports",
        gameType: "fancyOdds",
        overallType: "fancyOdds",
        selectionId: selectionId,
        remarks: sessionData.session_name,
        sessionTurnOver: Math.abs(oldPositionAmount),
      };

      await TransactionLogModel.deleteMany({
        userId: userData._id,
        marketId: marketId.trim(),
        overallType: "fancyOdds",
        selectionId: selectionId,
      });
      await insertTransactionLog(userData, logData, matchData, shareData);
      let updateCoinsAgain = await updateCoinsTbl(userId, userData.userType);
      return SendResponse(
        res,
        "error",
        "invalid amount fancy",
        updateCoinsAgain
      );
    }

    if (siteSetting.IS_REDIS) {
      await client.del(`${userData.userId}_${marketId}_POS`);
    }


    await FancyBetModel.create(insertFancyBet);

    const timestamp = Date.now();
    await client.set(`lastBetTimeUser__${userId}`, timestamp);
    await client.del(`${userData.userId}_fancyData_${marketId}`);



   // _d(directUserShareData, "directUserShareData")
    
    try {
      if (directUserShareData) {
        await Promise.allSettled(
          directUserShareData.map((data) =>

            
            emitToUser(
              "betUpdate",
              JSON.stringify(insertFancyBet),
              data?.userUserId
            )
          )
        );
      }
    }
     catch (e) {
      console.log(
        e,
        "problem with through socket for updating bet in admin panels"
      );
    }

    return SendResponse(
      res,
      "success",
      "Session Bet Placed Successfully",
      updateCoins
    );
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "SessionBet Place Error", error);
  }
};

const matchList = async (req, res) => {
  const bodyData = req.body;
  const sportId = req.query.sportId;
  const marketId = req.query.marketId;
  let matchList = {};
  let total = 0

  if (bodyData.marketId || bodyData.eventId) {
    let queryWhere = {}
    if (bodyData.marketId) {
      queryWhere.marketId = bodyData.marketId
    }
     if (bodyData.eventId) {
      queryWhere.eventId = bodyData.eventId
    }
    matchList = await sportListModel
      .find(queryWhere)
      .sort({
        _id : - 1,
      });    
    return SendResponse(res, "success", total , matchList);
  }

  
  if (!bodyData.status) {
    matchList = await BetService.getMatchList(marketId, sportId);
  } else {
    if (bodyData.status == "INPLAY" || bodyData.status == "inplay") {
      matchList = await BetService.getMatchList(marketId, sportId);
    } else {
      let queryWhere  = {
        status: bodyData.status,
      }



      if(bodyData.marketId){
        queryWhere.marketId = bodyData.marketId
      }

      if(bodyData.eventId){
        queryWhere.eventId = bodyData.eventId
      }

      if(bodyData.sportId){
        queryWhere.sportId = bodyData.sportId
      }
      
      if(bodyData.sportType){
        queryWhere.sportType = bodyData.sportType
      }

      if (bodyData.size && bodyData.pageNo) {
         total = await sportListModel.countDocuments({
          status: bodyData.status,
        });

          matchList = await sportListModel.find(queryWhere)
          .skip(bodyData.size * (bodyData.pageNo - 1))
          .limit(bodyData.size)
          .sort({
            _id : - 1,
          })
          .allowDiskUse(true);
      } else {
        matchList = await sportListModel
        .find(queryWhere)
        .sort({
          _id : - 1,
        });
      }
    }
  }



  return SendResponse(res, "success", total , matchList);
};

const sportByMarketId = async (req, res) => {
  const bodyData = req.body;
  const marketId = bodyData.marketId;
  matchData = await BetService.sportByMarketId(marketId);
  return SendResponse(
    res,
    "success",
    "matchData fetch successfully",
    matchData
  );
};

const betsList = async (req, res) => {
  try {
    const bodyData = req.body || {};
    const loggedInData = req.loggedInUser;

    const marketId = bodyData.marketId;

    let returnData = {};
    let where = {};

    let fancyBetData = [];
    let oddsBetData = [];
    let casinoBetData = [];
    let diamondBetData = [];
    let clientData = [];
    let matkaBetData = [];

    const isDeclare = Object.prototype.hasOwnProperty.call(bodyData, "isDeclare");
    const isCompleted = Object.prototype.hasOwnProperty.call(bodyData, "isCompleted");
    const deletedKey = Object.prototype.hasOwnProperty.call(bodyData, "isDeleted");
    const isDirect = Object.prototype.hasOwnProperty.call(bodyData, "isDirect");
    const isClientExposure = Object.prototype.hasOwnProperty.call(bodyData, "isClientExposure");
    const isBsf = Object.prototype.hasOwnProperty.call(bodyData, "isBsf");

    if (isDeclare) where.isDeclare = bodyData.isDeclare;

    if (isCompleted) {
      where.isDeclare = bodyData.isCompleted;
    }

    if (marketId) where.marketId = marketId;

    if (deletedKey) {
      let inData = [0, false];
      if (bodyData.isDeleted == 1 || bodyData.isDeleted === true) inData = [1, true];
      where.isDeleted = { $in: inData };
    }

    if (isDirect) {
      where.isDirect = { $in: [1, true] };
    }

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

    if (bodyData.sportsId) where.sportsId = bodyData.sportsId;

    if (bodyData.ip ) {
      where.ip = bodyData.ip;
    }

    // If client exposure => force flags + fixed where
    if (isClientExposure) {
      where.isDeclare = false;
      where.isDeleted = false;

      bodyData.casinoBet = true;
      bodyData.fancyBet = true;
      bodyData.oddsBet = true;
      bodyData.diamondBet = true;
      bodyData.matkaBet = true;
    }

    // username => userId
    if (bodyData.username) {
      const userData = await getUserIdByUsername(bodyData.username);
      if (userData.status !== "success") {
        return SendResponse(res, "error", "username not found");
      }
      where.userId = userData.userDetails.userId;
    }

    // apply access rules
    where = await whereHelper(loggedInData, where);

    // downline override filter
    if (bodyData.downlineUserId && bodyData.downlineUserType) {
      where = await whereHelper(
        { userId: bodyData.downlineUserId, userType: bodyData.downlineUserType },
        where
      );
    }

    // sorting controls
    const amountSort = bodyData.amountSort || false;
    const idSort = bodyData.idSort || false;

    // NOTE: You do username lookup twice in your original. Kept behavior, but safe guarded:
    if (bodyData.username) {
      const userIdByUsername = await UserModel.findOne(
        { username: bodyData.username },
        { _id: 1, userType: 1, userId: 1 }
      );
      if (userIdByUsername?._id) where.userId = userIdByUsername._id;
    }

    // final where object
    const whereObj = await whereHelper(loggedInData, where);

    // marketId parsing logic
    if (bodyData.marketId) {
      const stringMarketId = String(marketId);
      const splitMarketId = stringMarketId.split("_");

      if (splitMarketId && splitMarketId.length === 2) {
        const dateType = splitMarketId[1];

        if (dateType === "odds") {
          delete bodyData.fancyBet;
          whereObj.marketId = splitMarketId[0];
        } else {
          delete bodyData.oddsBet;
          whereObj.marketId = splitMarketId[0];

          const fromDate = new Date(`${splitMarketId[1]}T00:00:00.000Z`);
          const date = new Date(splitMarketId[1]);
          date.setDate(date.getDate() + 1);
          const nextDate = date.toISOString().split("T")[0];
          const toDate = new Date(`${nextDate}T00:00:00.000Z`);

          whereObj.updatedAt = { $gte: fromDate, $lt: toDate };
        }
      }
    }

    // casino where mutation
    if (bodyData.casinoBet) {
      if (bodyData.eventId) whereObj.gameId = bodyData.eventId;
      if (bodyData.roundId) whereObj.roundId = bodyData.roundId;
    }

    // ------------------ PROMISE.ALL SECTION ------------------
    // Build tasks that can run in parallel.
    const tasks = [];

    // Fancy
    if (bodyData.fancyBet) {
      const userAmountAlias = `${loggedInData.userType}Amount`;

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

    // Odds
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

    // Diamond bet (casinoBetModel)
    if (bodyData.diamondBet) {
      tasks.push(
        casinoBetModel.find(whereObj).then((list) => {
          diamondBetData = Array.isArray(list) ? list : [];
          returnData.diamondBetData = diamondBetData;
        })
      );
    }

    // Casino bet (internationalCasinoBet)
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

    // clientData
    if (bodyData.clientData) {
      tasks.push(
        BetService.getPlayData(whereObj, "clientId , userInfo ", true).then((list) => {
          clientData = Array.isArray(list) ? list : [];
          returnData.clientData = clientData;
        })
      );
    }

    // Matka
    if (bodyData.matkaBet) {
      tasks.push(
        (async () => {
          // IMPORTANT: you mutate whereObj in original; keeping same behavior carefully
          const matkaWhere = { ...whereObj, isDeclare: 0 };
          const list = await matkaBetModel.find(matkaWhere);
          matkaBetData = Array.isArray(list) ? list : [];
          returnData.matkaBetData = matkaBetData;
        })()
      );
    }

    // BSF (shares)
    if (isBsf) {
      tasks.push(
        (async () => {
          const bsfWhere = { ...whereObj };
          delete bsfWhere.isDeleted;

          const shareRows = await playModel.find(bsfWhere, { shareData: 1, userId: 1 });

          const pushShareData = {};
          for (const share of shareRows) {
            let parsed = {};
            try {
              parsed = JSON.parse(share.shareData);
            } catch (e) {
              parsed = {};
            }

            pushShareData[share.userId] = {
              MatchProfitLossShare: parsed[`${loggedInData.userType}MatchProfitLossShare`],
              MatchShare: parsed[`${loggedInData.userType}MatchShare`],
              ParentMatchShare: parsed[`${loggedInData.userType}ParentMatchShare`],
            };
          }

          returnData.userShareData = pushShareData;
        })()
      );
    }

    // run all parallel tasks
    await Promise.all(tasks);

    // ------------------ CLIENT EXPOSURE MERGE OUTPUT ------------------
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


const casinoBetList = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;
    let returnData = {};
    let where = {};
    if (bodyData.roundId) {
      where.mid = bodyData.roundId;
    }
    if (bodyData.isCompleted) {
      where.isDeclare = 1;
    }
    if (bodyData.casinoType) {
      where.casinoType = bodyData.casinoType;
    }

    if (bodyData.fromDate && bodyData.toDate) {
       if (bodyData.fromDate && bodyData.toDate) {
        const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
        const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
        if (isTime) {
        where.createdAt = dateWhere;
        } else {
          where.date = dateWhere;  
        }
      }
    }

    where = await whereHelper(loggedInData, where);
    if (bodyData.downlineUserId && bodyData.downlineUserType) {
      where = await whereHelper(
        {
          userId: bodyData.downlineUserId,
          userType: bodyData.downlineUserType,
        },
        where
      );
    }
    let casinoBetData = await BetService.getCasinoBetList(
      where,
      " amount , mid , casinoType , playerName , result , winAmt , loseAmt , ip , date , createdAt , sid , clientName"
    );

    return SendResponse(
      res,
      "success",
      "Fetch List Successfuly",
      casinoBetData
    );
  } catch (error) {
    console.log("fetch Casino List error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "fetch Casino List error in Bet Controller",
      error
    );
  }
};

const betMatchDetails = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;
    const clientId = loggedInData.userId;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
    }).options({ abortEarly: false });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    const marketId = bodyData.marketId;
    let updateArray = [];
    let returnData = {
      sessionPlusMinus: 0,
      matchExposure: 0,
      fancyBetData: {},
      oddsBetData: {},
      matchDetails: {},
      inplayMatchList: {},
      totalCoins: 0,
      matchPosition: {},
      matchDetails: {},
    };

    let where = {
      clientId: clientId,
      marketId: marketId.trim(),
    };

    const playData = await BetService.getPlayData(where);

    if (playData) {
      returnData.matchExposure = playData.exposure;
      returnData.sessionPlusMinus = playData.sessionPlusMinus;
      if (playData.matchBetData) {
        returnData.oddsBetData = JSON.parse(playData.matchBetData);
      }
      if (playData.sessionBetData) {
        returnData.fancyBetData = JSON.parse(playData.sessionBetData);
      }
      if (playData.updateMatchBet) {
        const matchWhere = {
          clientId: clientId,
          marketId: marketId.trim(),
          isDeleted: 0,
        };
        oddsBetData = await BetService.getOddsBetList(
          matchWhere,
          "amount , selectionId ,  odds , type , profit , loss , teamName , createdAt , oddsType"
        );
        if (oddsBetData.length) {
          updateArray = {
            matchBetData: JSON.stringify(oddsBetData),
            updateMatchBet: false,
          };
          await BetService.updatePlayModel(clientId, marketId, updateArray);
        }
        returnData.oddsBetData = oddsBetData;
      }

      if (playData.updateSessionBet) {
        const sessionWhere = {
          clientId: clientId,
          marketId: marketId.trim(),
          isDeleted: 0,
        };
        sessionBetData = await BetService.getFancyBetList(
          sessionWhere,
          "amount , selectionId , loss , profit , isComm , decisionRun , sessionName , isDeclare , createdAt , type , run , odds"
        );
        updateArray = {
          sessionBetData: JSON.stringify(sessionBetData),
          updateSessionBet: false,
        };
        await BetService.updatePlayModel(clientId, marketId, updateArray);
        returnData.fancyBetData = sessionBetData;
      }
    }

    const userData = await BetService.checkUserData(clientId);
    if (userData.data) {
      returnData.totalCoins = userData.data.coins;
    }

    let teamData = [];
    const inplayMatchData = await BetService.getMatchList();

    if (inplayMatchData) {
      returnData.inplayMatchList = inplayMatchData;
      inplayMatchData.map((data) => {
        if (data.marketId == marketId) {
          returnData.matchDetails = data;
          matchData = data;
        }
      });
    }

    if (matchData.teamData) {
      teamData = JSON.parse(matchData.teamData);
      const BetPosition = await BetService.betsMatchPosition(
        returnData.oddsBetData,
        teamData,
        "bookmaker"
      );
      returnData.matchPosition = BetPosition;
    }

    return SendResponse(
      res,
      "success",
      "Bet Match Details Fetch Successfully",
      returnData
    );
  } catch (error) {
    console.log("fetch Bets List error in Bet Controller", error);
    return SendResponse(res, "error", "Bet Match Details Error", error);
  }
};

const getOddsPosition = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;
    const marketId = bodyData.marketId;

    const returnPositionData = await BetService.getOddsPosition(
      loggedInData,
      marketId,
      bodyData
    );

    return SendResponse(
      res,
      "success",
      "Odds Position Fetch Successfully",
      returnPositionData
    );
  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const inplayOddsPosition = async (req, res) => {
  try {
    const loggedInData = req.loggedInUser;
    const matchList = await BetService.getMatchList();
    let finalList = {};
    const finalReturnOddsData = await Promise.all(
      matchList.map(async (data) => {
        let marketId = data.marketId;p
        let teamData = JSON.parse(data.teamData);
        let returnPositionData = await BetService.getOddsPosition(
          loggedInData,
          marketId + ""
        );
        returnPositionData = convertKeyObject(returnPositionData, "_id");
        teamData = teamData.map((team, key) => {
          const selectionId = team.selection_id;
          if (returnPositionData[selectionId]) {
            team.position = returnPositionData[selectionId].Position;
          } else {
            team.position = 0;
          }
          team.matchName = data.matchName;
          return team;
        });
        teamData.sportType = data.sportType
        teamData.eventId = data.eventId
        finalList[data.matchName] = teamData;
        return teamData;
      })
    );
    return SendResponse(
      res,
      "success",
      "Inplay Matches Odds Position Fetch Successfully",
      finalList
    );
  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const getSessionPositionBySelectionId = async (req, res) => {
  try {
    let bodyData = req.body;

    _d(bodyData, "bodyData")
    
    
    const loggedInData = req.loggedInUser;
    const JoiSchema = Joi.object({
      marketId: Joi.required(),
      selectionId: Joi.required(),
    }).options({ abortEarly: false , allowUnknown : true});
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    const marketId = bodyData.marketId;
    const selectionId = bodyData.selectionId;
    let where = {
      marketId: marketId.trim(),
      selectionId: selectionId,
      isDeleted: 0,
    };

    if (bodyData.userId) {
      where.userId = bodyData.userId;
    }


    let specificAmount = loggedInData.userType + "Amount";
    let positionData = {};
    const specific = `amount , selectionId  ,sessionName , odds , type , run , isComm , ip , clientId , ${specificAmount}`;
    where = await whereHelper(loggedInData, where);

    const sessionData = await BetService.getFancyBetList(where, specific);

    positionData = await BetService.getSessionPositon(
      sessionData,
      specificAmount,
      loggedInData
    );
    return SendResponse(
      res,
      "success",
      "Position Fetched Successfully",
      positionData
    );
  } catch (error) {
    console.log("error", "error in fetch selection id position", error);
    return SendResponse(
      res,
      "error",
      "error in fetch selection id position",
      error
    );
  }
};

const casinoSearchResult = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;
    const JoiSchema = Joi.object({
      roundId: Joi.string().required(),
    }).options({ abortEarly: false });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    const roundId = bodyData.roundId;
    let url = fetchUrl.getCasinoRoundIdResult + roundId;
    const getData = await axios.get(url);
    let returnData = {};
    if (getData.data.data) {
      returnData = getData.data.data.data;
    }
    SendResponse(res, "success", "Data Fetch Successfully", returnData);
  } catch (error) {
    console.log(error);
    return SendResponse(
      res,
      "error",
      "Failed In Fetching Rounud Id Result",
      error
    );
  }
};

const getSessionList = async (req, res) => {
  try {
    let marketId = req.query.marketId;
    if (req.body.marketId) {
      marketId = req.body.marketId;
    }
    const loggedInData = req.loggedInUser;
    loggedInData.userId = new ObjectId(loggedInData.userId);
    let where = whereHelper(loggedInData, { marketId: marketId });
    const SessionList = await BetService.getSessionList(where);
    return SendResponse(res, "success", "fetch Data", SessionList);
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "fetch Data in Session List", error);
  }
};

const getSessionListGet = async (req, res) => {
  try {
    const marketId = req.query.marketId;
    if (!marketId) {
      return SendResponse(res, "error", "Market Id Required");
    }

    let where = { marketId: marketId };
    const SessionList = await BetService.getSessionList(where);

    return SendResponse(res, "success", "fetch Data", SessionList);
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "fetch Data in Session List", error);
  }
};

const getCasinoList = async (req, res) => {
  try {
    const shortName = req.query.shortName;
    const casinoList = await BetService.getCasinoList(shortName);
    return SendResponse(res, "success", "fetch Data", casinoList);
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "fetch Data in Casino List", error.msg);
  }
};

const getMatkaList = async (req, res) => {
  try {
    const eventId = req.query.eventId;
    const matkaList = await BetService.getMatkaList(eventId);
    return SendResponse(res, "success", "fetch Data", matkaList);
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "fetch Data in Matka List", error.msg);
  }
};

const loginReportsByMarketId = async (req, res) => {
  try {
    const loggedInData = req.loggedInUser;
    let bodyData = req?.body;
    if (!bodyData.marketId) {
      return SendResponse(
        res,
        "error",
        "market Id Is Required",
        "market Id Is Required"
      );
    }

    const where = await whereHelper(loggedInData, {
      marketId: bodyData.marketId,
    });
    const loginUserData = await BetService.loginReportsByMarketId(where);
    // _dx(loginUserData);
    return SendResponse(res, "success", "fetch Data", loginUserData);
  } catch (err) {
    console.log("error", err);
    return SendResponse(res, "error", "login Data Report Error", err);
  }
};

const completedFancyByMarketId = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;

    const marketId = bodyData.marketId;
    let returnData = {};
    let where = {
      isDeclare: 1,
      forBet: 1,
    };
    let fancyBetData = {};
    if (marketId) {
      where.marketId = marketId;
    }
    if (bodyData.selectionId) {
      where.selectionId = bodyData.selectionId;
    }
    if (bodyData.userId) {
      where.userId = new ObjectId(bodyData.userId);
    }
    where = await whereHelper(loggedInData, where);
    const userTypeAmount = `${loggedInData.userType}Amount`;
    let groupCond = {
      _id: "$selectionId",
      fancyName: { $first: "$remarks" },
      totalClientProfitLoss: { $sum: "$amount" },
    };
    const sessionProfitLoss = {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $ne: ["$overallType", "fancyOddsComm"] },
            ],
          },
          `$${userTypeAmount}`,
          0,
        ],
      },
    };
    groupCond.selfProfitLoss = sessionProfitLoss;

    where.overallType = "fancyOdds";
    var sessionData = await TransactionLogModel.aggregate([
      {
        $match: where,
      },
      {
        $group: groupCond,
      },
      {
        $sort: {
          _id: -1,
        },
      },
    ]);

    var declareRunData = await FancyBetModel.aggregate([
      {
        $match: {
          marketId: marketId.trim(),
          isDeclare: 1,
        },
      },
      {
        $group: {
          _id: "$selectionId",
          decisionRun: { $first: "$decisionRun" },
        },
      },
      {
        $sort: {
          _id: -1,
        },
      },
    ]);

    if (declareRunData) {
      declareRunData = await convertKeyObject(declareRunData, "_id");
    }
    sessionData.map((session, key) => {
      let sessionId = session._id;
      let declareRun = 0;
      if (declareRunData[sessionId]) {
        declareRun = declareRunData[sessionId].decisionRun;
        sessionData[key].declareRun = declareRun;
      }
    });

    return SendResponse(
      res,
      "success",
      "completed Fancy List Successfuly",
      sessionData
    );
  } catch (error) {
    console.log("completed Fancy List Successfuly", error);
    return SendResponse(res, "error", "completed Fancy List Successfuly");
  }
};

const saveSportsList = async (req, res) => {
  try {
    await BetService.saveSportsListByNewCenterPanel();
    if (res) {
      return SendResponse(res, "success", "Data Save Successfully");
    } else {
      return true;
    }
  } catch (error) {
    console.log(error);
    return SendResponse(
      res,
      "error",
      "Failed In Fetching Rounud Id Result",
      error
    );
  }
};

const updateMatchByMarketId = async (req, res) => {
  const bodyData = req.body;
  const update = await BetService.updateMatchByMarketId(bodyData);
  return SendResponse(res, update.status, update.message, update.data);
};

const userPositionByMarketId = async (req, res) => {
  try {
    let loggedInData = req.loggedInUser;
    const userId = loggedInData.userId;
    const userType = loggedInData.userType;
    let bodyData = req.body;
    if (!bodyData.marketId) {
      return SendResponse(res, "error", "marketId Is Required");
    }
    const marketId = bodyData.marketId;
    let finalList = {};
    if (siteSetting.IS_REDIS && userType == "client") {
      finalList = await client.get(`${userId}_${marketId}_POS`);
      if (finalList) {
        finalList = JSON.parse(finalList);
        return SendResponse(
          res,
          "success",
          "Match  Position Fetch Successfully",
          finalList
        );
      }
    }


   let [returnPositionData , fancyPosition ]  = await Promise.all([
      BetService.getOddsPositionByMarketWise(
            loggedInData,
            marketId + ""
     ),
      BetService.sessionPositionUserWise(
        loggedInData,
        marketId + ""
      )
    ])

    finalList = {
      oddsPosition: returnPositionData,
      sessionPosition: fancyPosition,
    };

    if (siteSetting.IS_REDIS && userType == "client") {
      await client.set(`${userId}_${marketId}_POS`, JSON.stringify(finalList));
      await client.expire(`${userId}_${marketId}_POS`, 600);
    }
    return SendResponse(
      res,
      "success",
      "Inplay Matches Odds Position Fetch Successfully",
      finalList
    );
  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const clientListByMarketId = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }

  let marketId = bodyData.marketId;
  let splitMarketId = marketId.split("_");
  if (splitMarketId && splitMarketId.length == 2) {
    let newMarketId = splitMarketId[0];
    bodyData.marketId = newMarketId;
  }

  const loginData = req.loggedInUser;
  let userWhere = whereHelper(loginData, { marketId: bodyData.marketId });

  if (bodyData.isMatchBet) {
    userWhere.isMatchPlay = bodyData.isMatchBet;
  }

  if (bodyData.isSessionBet) {
    userWhere.isSessionPlay = bodyData.isSessionBet;
  }

  let clientData = await playModel.find(userWhere, {
    userInfo: 1,
    clientId: 1,
  });

  return SendResponse(res, "success", "dataFetched", clientData);
};

const getAllSessionList = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const loginData = req.loggedInUser;
  let userWhere = whereHelper(loginData, { marketId: bodyData.marketId });
  try {
    var resData = await FancyBetModel.aggregate([
      {
        $match: userWhere,
      },
      {
        $group: {
          _id: "$selectionId",
          sessionNames: { $addToSet: "$sessionName" },
        },
      },
      {
        $project: {
          _id: 0,
          selectionId: "$_id",
          sessionNames: "$sessionNames",
        },
      },
    ]);
    return SendResponse(res, "success", "dataFetched", resData);
  } catch (error) {
    console.log("Session List Fetching Error", error);
    return error;
  }
};

const deleteMarket = async (req, res) => {
  try{
    const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Array Is Required");
  }
    
  const loginData = req.loggedInUser;
  if (loginData.userType != "owner") {
    return SendResponse(
      res,
      "error",
      "you are not authorized to perform this operation"
    );
  }
  
    let marketIdArray = bodyData.marketId;
    let findBetsData = await BetModel.aggregate([
      {
        $match: {
          marketId: { $in: marketIdArray },
          sportsId : {$ne : 4}
        },
      },
      {
        $group: {
          _id: "$marketId",
          count: { $sum: 1 },
        },
      },
    ]);

  const removeIds = findBetsData.map(item => item._id);
  
  const filteredMarketIds = marketIdArray.filter(
    id => !removeIds.includes(id)
  );
    
  await sportListModel.deleteMany({
    marketId: { $in: filteredMarketIds },
  });

  await saveSportsList(req);
  return SendResponse(res, "success", "market has been deleted successfully");
  }catch(error){
    console.log(error , "error in delete market")
  }
  
};

const actualExposerList = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.username) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const loginData = req.loggedInUser;
  let username = bodyData.username;
  let userIdByUsername = await getUserIdByUsername(username);
  let userId = "";
  if (userIdByUsername.status != "success") {
    return SendResponse(res, "error", "username not found", resData);
  }
  let userDetails = userIdByUsername.userDetails;

  if (userDetails.userType != "client") {
    return SendResponse(res, "error", "only client is allowed");
  }

  if (userDetails.userId) {
    userId = userDetails.userId;
  }

  let where = {
    userId: userId,
    forBet: 1,
    isDeclare: 0,
  };

  where = await whereHelper(loginData, where);

  let returnData = await TransactionLogModel.find(where, {
    gameType: 1,
    gameName: 1,
    marketId: 1,
    eventId: 1,
    remarks: 1,
    overallType: 1,
    createdAt: 1,
    date: 1,
    amount: 1,
  });

  return SendResponse(res, "success", "dataFetched", returnData);
};

const insertBetfairMarket = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.eventId) {
    return SendResponse(res, "error", "event Id is Required");
  }
  

  let eventId = bodyData.eventId;
  const returnData = await BetService.insertBetfairMarket(eventId);
  return SendResponse(res, returnData.status, returnData.message, returnData);
  

  
};

const marketReload = async (req, res) => {
  const bodyData = req.body;
    emitToAllActiveUsers("marketReload", {
      marketId : bodyData.marketId,
    })
  
  return SendResponse(res, "success", "market reload Successfully");
};

const meterKhadoOddEvenCricketCassinoBetPlace = async (req, res) => {
  let sessionData = [];
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  let bodyData = req.body;
  const JoiSchema = Joi.object({
    odds: Joi.number().required(),
    amount: Joi.number().required(),
    marketId: Joi.string().required(),
    selectionId: Joi.required(),
    run: Joi.number().required(),
    eventId: Joi.number().required(),
    fancyType: Joi.string().required(),
    type: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  try {
    if (userType !== "client") {
      return SendResponse(res, "error", "Only client Authorised To Place Bet");
    }
    let timerCheck = await checkLastBetTiming(userId);
    if (!timerCheck) {
      return SendResponse(res, "error", "odds expired");
    }
    const marketId = bodyData.marketId;
    if (siteSetting.IS_REDIS) {
      let blockedMarketUser = await client.sismember(
        `${marketId}_BlockMarket`,
        loggedUserData.userId
      );
      if (blockedMarketUser) {
        return SendResponse(res, "error", "Market Is Blocked");
      }
    }

    const checkOdds = await BetService.checkLiveMatchOdds(bodyData);

    if (checkOdds.status == "error") {
      return SendResponse(res, "error", checkOdds.message);
    }

    const startTime = Date.now();

    sessionData = checkOdds.data.liveOdds;


    let selectionId = bodyData.selectionId
    let type = bodyData.type;
    let matchData = checkOdds.data.matchData;
    let odds = bodyData.odds;
    let amount = bodyData.amount;
    let run = bodyData.run;
    let fancyType = sessionData.fancyType
    let gtype = sessionData.gtype

    let checkUserData = await BetService.checkUserData(userId, bodyData);
    if (checkUserData.status == "error") {
      return SendResponse(res, "error", checkOdds.message);
    }
    const userData = checkUserData.data;
    let oldSessionBetData = {};
    let checkPlayData = {};
    let directUserShareData = {};

    if (!userData.betStatus) {
      return SendResponse(
        res,
        "error",
        "your bet is locked please contact your agent"
      );
    }

    checkPlayData = await BetService.checkPlayDataMarketWise(
      userData,
      marketId,
      "fancy"
    );

    const shareData = JSON.parse(checkPlayData.shareData);


     if (checkPlayData?.directUserShareData) {
      directUserShareData = checkPlayData?.directUserShareData
     }
    
    let profit = 0;
    let loss = 0;
    var clientIp = requestIp.getClientIp(req);
    userInfo = {
      clientCode: userData.username,
      clientName: userData.name,
      creatorName: userData.creatorName,
    };

    let isComm = 1;
    if (sessionData.com_perm && sessionData.com_perm != "YES") {
      isComm = 0;
    }

    if (gtype === "cricketcasino") {
      try {
        if (
          !sessionData ||
          typeof sessionData.session_name !== "string" ||
          !sessionData.session_name.includes(" NUMBER")
        ) {
          return SendResponse(
            res,
            "error",
            "Invalid session_name format."
          );
        }
    
        let splitSessionName = sessionData.session_name.split(" NUMBER");
         run = splitSessionName[0];
         odds = parseFloat(sessionData.runsYes);
         let amt = parseFloat(amount);
        if (isNaN(odds) || isNaN(amt)) {
          return SendResponse(
            res,
            "error",
            "Invalid odds or amount."
          );
        }
    
         profit = Math.round(odds * amt);
         loss = Math.round(-1 * amt);
      } catch (err) {
        return SendResponse(
          res,
          "error",
          "Error processing cricketcasino bet:"
        );
      }
    }else if (gtype === "oddeven") {
      try {
         run = sessionData.runsYes;
         odds = parseFloat(sessionData.runsYes);
         let amt = parseFloat(amount);
        if (isNaN(odds) || isNaN(amt)) {
          return SendResponse(
            res,
            "error",
            "Invalid odds or amount."
          );
        }

       
         profit = Math.round((odds - 1) * amt);
         loss = Math.round(-1 * amt);

      } catch (err) {
        return SendResponse(
          res,
          "error",
          "Error processing oddeven bet:"
        );
      }
    }

    let deductAmount = loss
    let insertSessionName = sessionData.session_name
    if(gtype == "cricketcasino"){
      insertSessionName = `${insertSessionName} - ${fancyType}`
    }
    let insertFancyBet = {
      marketId: marketId.trim(),
      profit: profit,
      loss: loss,
      amount: bodyData.amount,
      eventId: matchData.eventId,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      superadminId: userData.superadminId,
      subadminId: userData.subadminId,
      adminId: userData.adminId,
      masterId: userData.masterId,
      superagentId: userData.superagentId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      userId: userData.userId,
      odds: odds,
      selectionId: selectionId,
      sessionName:insertSessionName ,
      run: Math.round(run),
      type: bodyData.type,
      userInfo: userInfo,
      ip: clientIp,
      isComm: isComm,
      fancyType: fancyType,
      gtype: gtype,
    };



    if (shareData) {
      insertFancyBet.ownerAmount = Math.round(
        shareData.ownerMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.subownerAmount = Math.round(
        shareData.subownerMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.superadminAmount = Math.round(
        shareData.superadminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.adminAmount = Math.round(
        shareData.adminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.subadminAmount = Math.round(
        shareData.subadminMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.masterAmount = Math.round(
        shareData.masterMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.superagentAmount = Math.round(
        shareData.superagentMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.agentAmount = Math.round(
        shareData.agentMatchProfitLossShare * bodyData.amount
      );
      insertFancyBet.clientAmount = Math.round(bodyData.amount);
    }

    let coins = userData.coins;

    let realUserCoins = await getUserCoinsByTransactionTable(userData._id)
    if(realUserCoins && realUserCoins.totalCoins){
      coins = realUserCoins.totalCoins
    }

    if (Math.abs(deductAmount) >  coins) {
      return SendResponse(res, "error", `Invalid ${fancyType} Amount For ${sessionData.session_name}`);
    }
    
    const endTime = Date.now();
    const executionTime = endTime - startTime; 

    if (executionTime > 4000) {
      return SendResponse(res, "error", "execution SendResponse time out");
    }


    const logData = {
      amount:deductAmount,
      forBet: 1,
      gameName: "sports",
      gameType: "fancyOdds",
      overallType: "fancyOdds",
      selectionId: selectionId,
      remarks: `${sessionData.session_name} - ${sessionData.fancyType} - ${sessionData.gtype}` ,
      sessionTurnOver: Math.abs(deductAmount),
    };


       try {
        if (directUserShareData && directUserShareData != null) {
          newPositionAmount = -1 * newPositionAmount
          directUserShareData = JSON.parse(directUserShareData)
          if (directUserShareData) {
            directUserShareData.map((data) => {
              logData[`${data?.creatorUserType}ShareAmount`] = Math.round(
                data[`${data?.creatorUserType}ProfitLossrMatchShare`] * newPositionAmount /100
            );
            })
          }
        }
       } catch (e) {
         
        
      console.log(e, "problem with directShare in bookmaker place bets")
    }
    
    

    // if(shareData){
    //  let newPositionAmount = -1 * profit

    //   logData["ownerShareAmount"] = Math.round(
    //     shareData.ownerMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["subownerShareAmount"] = Math.round(
    //     shareData.subownerMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["superadminShareAmount"] = Math.round(
    //     shareData.superadminMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["adminShareAmount"] = Math.round(
    //     shareData.adminMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["subadminShareAmount"] = Math.round(
    //     shareData.subadminMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["masterShareAmount"] = Math.round(
    //     shareData.masterMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["superagentShareAmount"] = Math.round(
    //     shareData.superagentMatchProfitLossShare * newPositionAmount
    //   );
  
    //   logData["agentShareAmount"] = Math.round(
    //     shareData.agentMatchProfitLossShare * newPositionAmount
    //   );

    // }

    await insertTransactionLog(userData, logData, matchData, shareData);
    let updateCoins = await updateCoinsTbl(userId, userData.userType);

    if (siteSetting.IS_REDIS) {
      await client.del(`${userData.userId}_${marketId}_POS`);
    }

    await FancyBetModel.create(insertFancyBet);

    const timestamp = Date.now();
    await client.set(`lastBetTimeUser__${userId}`, timestamp);
    await client.del(`${userData.userId}_fancyData_${marketId}`);


  try {
      if (directUserShareData) {
        await Promise.allSettled(
          directUserShareData.map((data) =>
            emitToUser(
              "betUpdate",
              JSON.stringify(insertFancyBet),
              data?.userUserId
            )
          )
        );
      }
    }
     catch (e) {
      console.log(
        e,
        "problem with through socket for updating bet in admin panels"
      );
    }

    return SendResponse(
      res,
      "success",
      "Session Bet Placed Successfully",
      updateCoins
    );
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "SessionBet Place Error", error);
  }
};


const getOpenBetsBymarketId = async (req,res)=>{
  try {
    let bodyData = req.body;
    let loggedInData = req.loggedInUser;
    let userId = loggedInData.userId;
    let marketId = bodyData.marketId;
    let openBetsData = [];
    let redisKey = `${userId}_openBets_${marketId}`
    let betData = await client.get(redisKey);
    if(betData){
      openBetsData = JSON.parse(betData)
    }else{
      openBetsData = await OpenBetsModel.find({
        marketId: marketId,
        userId: userId,
      })
      await client.set(redisKey , JSON.stringify(openBetsData))
      await client.expire(redisKey , 60 * 60 * 24)
    }
    return SendResponse(res,"success", `data get successfully`, openBetsData);
  } catch (error) {}

}


const cancelOpenBets = async (req,res)=>{
  try {
    let bodyData = req.body;
    let loggedInData = req.loggedInUser;
    let userId = loggedInData.userId;
    let betIdArray = bodyData.betIdArray;
    let marketId = bodyData.marketId
    let redisKey = `${userId}_openBets_${marketId}`
   
   await Promise.all([
    OpenBetsModel.deleteMany({
      _id : betIdArray,
      marketId : marketId
    }),

    TransactionLogModel.deleteMany({
      marketId : marketId,
      userId : userId,
     // betId : betIdArray,
      overallType : "openBet",
      forBet: 1
    }),
    
   ])


   let newPos  = await BetService.getNewOpenBetsPosition(userId, marketId)
    if(newPos.data < 0){
      await TransactionLogModel.create({
        amount : newPos.data ,
        userId : userId,
        marketId : marketId.trim(),  
        overallType : "openBet",
        forBet :1 , 
        isDeclare : 0
    })
    }
     
    await updateCoinsTbl(userId, loggedInData.userType);
    await client.del(redisKey)

    return SendResponse(res,"success", `open bets gets cacelled successfully`);
  } catch (error) {
    console.log(error)
  }

}


const combinedBetFairBetAccept = async (req, res) => {
    const t0 = Date.now();
    let bodyData = req.body;
    const loggedUserData = req.loggedInUser;
    bodyData.loginDetails = loggedUserData
    const userId = loggedUserData.userId;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      amount: Joi.number().required(),
      selectionId: Joi.number().required(),
      odds: Joi.number().required(),
      run: Joi.number().required(),
      eventId: Joi.number().required(),
      betFor: Joi.string().required(),
      oddsType: Joi.string().required(),
      type: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
}


const combinedBetPlaceOdds = async (req, res) => {
  try {
    const t0 = Date.now();
    let bodyData = req.body;
    const loggedUserData = req.loggedInUser;
    bodyData.loginDetails = loggedUserData
    const userId = loggedUserData.userId;
    const JoiSchema = Joi.object({
      marketId: Joi.string().required(),
      amount: Joi.number().required(),
      odds: Joi.number().required(),
      run: Joi.number().required(),
      eventId: Joi.number().required(),
      betFor: Joi.string().required(),
      oddsType: Joi.string().required(),
      type: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    if (loggedUserData.userType !== "client") {
      return SendResponse(res, "error", "Only client Authorized to place bet");
    }

    const marketId = bodyData.marketId;
    const [timerCheck, blockedMarketUser , userRateRedis] = await Promise.all([
     checkLastBetTiming(userId),
      client.sismember(`${marketId}_BlockMarket`, loggedUserData.userId),
       client.get(
        `rateDiffrence_${loggedUserData.userId}`
      ),
    ]);
    
    if (!timerCheck) {
      return SendResponse(res, "error", "odds expired");
    }
  
    if (blockedMarketUser) {
      return SendResponse(res, "error", "Market Is Blocked");
    }

    let betType = bodyData.type
    let amount = bodyData.amount

    let userRate  = userRateRedis?userRateRedis:0
    let checkOdds = await BetService.checkLiveMatchOdds(bodyData, userRate, true);
    let matchData = checkOdds.matchData
    let settingData = checkOdds.settingData
    let oddsData = checkOdds?.oddsData[0] ? checkOdds?.oddsData[0] : []

     if (!oddsData || oddsData?.status != "OPEN") {
      return SendResponse(res, "error", "Market Is Closed");
     }
    
    if (amount < 1000) {
      return SendResponse(res, "error", "Min Size Is 1000");
    }

    let oddsMaxAmount = settingData.maxMatchOddsAmt

    if (matchData.sportId == 7 ) {
        oddsMaxAmount = settingData && settingData.maxHorseRacingOddsAmt ? settingData.maxHorseRacingOddsAmt : oddsMaxAmount
    }

    if (matchData.sportId == 4339 ) {
        oddsMaxAmount = settingData && settingData.maxGreyHoundOddsAmt ? settingData.maxGreyHoundOddsAmt : oddsMaxAmount
    }

    if (amount > oddsMaxAmount) {
        message = `Max Size Is ${oddsMaxAmount}`;
        return SendResponse(res, "error", message);
    }
    
   
    let selectionIdArray = bodyData.selectionId
    let runnersData = oddsData.runners
    
    getNewOpenBetsPositionData = await BetService.calculateCombinedOddsNew(selectionIdArray,runnersData , betType)
  
    let individualOdds = getNewOpenBetsPositionData.individualOdds
    let totalInverse = getNewOpenBetsPositionData.totalInverse
    let returnSelectionIdArray = getNewOpenBetsPositionData.selections
    
    const selectionIdSet = new Set(returnSelectionIdArray.map(Number));
    let filteredData = runnersData.filter(item =>
        selectionIdSet.has(Number(item.selectionId))
      );

    let finalRunnerData = convertKeyObject(filteredData , "selectionId")
    let multiBetArrayData = []
     await individualOdds.map((raceIndex, i) => {
       let betAmountAccordingToSelectionId = amount * (1 / individualOdds[i]) / totalInverse;
      betAmountAccordingToSelectionId = Math.floor(Math.abs(betAmountAccordingToSelectionId));
       
       let selection = returnSelectionIdArray[i]
       let oddsFinal = (raceIndex - 1).toFixed(2);

       let profit = betType == "L" ? betAmountAccordingToSelectionId * oddsFinal : betAmountAccordingToSelectionId
       let loss = betType == "L" ? -1 * betAmountAccordingToSelectionId : -1 * betAmountAccordingToSelectionId * oddsFinal
       
        let pushData = {
          selectionId: selection,
          amount: betAmountAccordingToSelectionId,
          profit: profit,
          loss: loss,
          odds: oddsFinal,
          type: betType,
          marketId: bodyData.marketId.trim(),
          teamName: finalRunnerData[selection]?.selectionName,
          oddsType: bodyData.oddsType,
        }
       
       if (betAmountAccordingToSelectionId > 0) {
         multiBetArrayData.push(pushData)
       }
     });
    
    
    
    if (multiBetArrayData.length < 2) {
      return SendResponse(res, "error", "only multi bets is accepted");
    }
    
    let odds = bodyData.odds
    let combinedOdds = getNewOpenBetsPositionData.combinedOdds
    if (betType == "K" && combinedOdds < odds) {
        odds = combinedOdds
    }
    if (betType == "L" && combinedOdds > odds) {
        odds = combinedOdds
    }
    if (odds != combinedOdds) {
      return SendResponse(res, "error", "Odds Expired");
    }

     if (odds < 0 || odds ==0) {
      return SendResponse(res, "error", "zero or negative odds can not be accepted");
     }

    bodyData.odds = odds
    const oddsType = bodyData.oddsType;
    const matchName = matchData.matchName;
    
    let checkUserData = await BetService.checkUserData(userId, bodyData);

    if (checkUserData.status == "error") {
      return SendResponse(res, "error", checkUserData.message);
    }

    const userData = checkUserData.data;

    if (!userData.betStatus) {
      return SendResponse(
        res,
        "error",
        "your bet is locked please contact your agent"
      );
    }

    let oldMatchBet = {};
    let checkPlayData = {};
    let shareData = {};
    let directUserShareData = {}

    checkPlayData = await BetService.checkPlayDataMarketWise(
      userData,
      marketId
    );
   
    if (checkPlayData.shareData) {
      shareData = JSON.parse(checkPlayData.shareData);
    }
  

    if (checkPlayData?.directUserShareData) {
      directUserShareData = checkPlayData?.directUserShareData
    }


    oldMatchBet = await BetModel.find(
      {
        userId: userData.userId,
        marketId: marketId.trim(),
        isDeleted: 0,
        oddsType: oddsType,
      },
      {
        amount: 1,
        selectionId: 1,
        odds: 1,
        type: 1,
        profit: 1,
        loss: 1,
        teamName: 1,
        createdAt: 1,
      }
    );


    if (oldMatchBet) {
      oldMatchBet = mongoToJson(oldMatchBet);
    }

    
    let teamData = [];

     const marketData = await sportsMarketListModel.findOne({
        marketId: bodyData.betfairMarketId,
      });

      if (!marketData) {
        return SendResponse(res, "error", "marketData not found in database");
      }

      const selectionIdData = marketData.selectionIdData;
      selectionIdData.map((selection) => {
        let push = {
          selection_id: selection.selectionId,
          runner_name: selection.runnerName,
        };
        teamData.push(push);
      });
    
    
   
    
    const oldBetPosition = await BetService.betsMatchPosition(
      oldMatchBet,
      teamData
    );



    let profit = 0;
    let loss = 0;

    teamData.map((data) => {
      if (
        data.selection_id == bodyData.selectionId &&
        (bodyData.type == "L" || bodyData.type == "l")
      ) {
        profit = bodyData.amount * bodyData.odds;
        loss = -1 * bodyData.amount ;
      } else if (
        data.selection_id == bodyData.selectionId &&
        (bodyData.type == "K" || bodyData.type == "k")
      ) {
        profit = bodyData.amount;
        loss = -1 * bodyData.amount * bodyData.odds;
      }
    });

   
    var clientIp = requestIp.getClientIp(req);
    userInfo = {
      clientCode: userData.username,
      clientName: userData.name,
      creatorName: userData.creatorName,
    };

    oldMatchBet = [...oldMatchBet, ...multiBetArrayData];
  
    const newBetPosition = await BetService.betsMatchPosition(
      oldMatchBet,
      teamData
    );

    for (let index = 0; index < multiBetArrayData.length; index++) {
      const element = multiBetArrayData[index];
      const betWisePosition = await BetService.betsMatchPosition(
        [element],
        teamData
      );
      multiBetArrayData[index].positionInfo = betWisePosition
      multiBetArrayData[index].eventId = matchData.eventId
      multiBetArrayData[index].ownerId = userData.ownerId
      multiBetArrayData[index].subownerId = userData.subownerId
      multiBetArrayData[index].superadminId = userData.superadminId
      multiBetArrayData[index].adminId = userData.adminId
      multiBetArrayData[index].subadminId = userData.subadminId
      multiBetArrayData[index].masterId = userData.masterId
      multiBetArrayData[index].superagentId = userData.superagentId
      multiBetArrayData[index].agentId = userData.agentId
      multiBetArrayData[index].clientId = userData.clientId
      multiBetArrayData[index].userId = userData.userId
      multiBetArrayData[index].ip = clientIp
      multiBetArrayData[index].userInfo = userInfo
      multiBetArrayData[index].matchName = matchName
      multiBetArrayData[index].betfairMarketId = marketId
      multiBetArrayData[index].sportsId = matchData.sportId
    }


    let oldPosMinAmountarr = Object.values(oldBetPosition);
    let oldPosMinAmount = Math.min(...oldPosMinAmountarr);
    let newPosMinAmountarr = Object.values(newBetPosition);

    let newPosMinAmount = Math.min(...newPosMinAmountarr);


    let newPosMaxAmount = Math.max(...newPosMinAmountarr);

    if (newPosMinAmount > 0) {
      newPosMinAmount = 0;
    }


    let userCoins = userData.coins 
    let realUserCoins = await getUserCoinsByTransactionTable(userData._id)

    if(realUserCoins && realUserCoins.totalCoins){
      userCoins  = realUserCoins.totalCoins
    }

    if (bodyData.isOpenBet && bodyData.isOpenBet === true) {
      let betTransaction = await TransactionLogModel.aggregate([
        {
          $match: {
            userId: new ObjectId(userData.userId),
            marketId: marketId,
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
          },
        },
      ]);
    
      let totalAmount = betTransaction.length > 0 ? Math.abs(betTransaction[0].totalAmount) : 0;
      userCoins = userCoins + totalAmount;
    }
    
    let check = userCoins + Math.abs(oldPosMinAmount);
    let checkAmount = Math.abs(newPosMinAmount);
    let deductAmount = newPosMinAmount;

    if (oldPosMinAmount > 0) {
      let currentSelection = bodyData.selectionId;
      if (bodyData.type == "L") {
        delete oldBetPosition[currentSelection];
        checkAmount = bodyData.amount;
        oldPosMinAmountarr = Object.values(oldBetPosition);
        oldPosMinAmount = Math.min(...oldPosMinAmountarr);
      } else if (bodyData.type == "k" || bodyData.type == "K") {
        oldPosMinAmount = oldBetPosition[currentSelection];
        checkAmount = bodyData.amount * bodyData.odds;
      }
      check = userData.coins + Math.abs(oldPosMinAmount);
    }

    if (checkAmount > check) {
      return SendResponse(res, "error", "invalid Amount");
    }
    


    const logData = {
      amount: deductAmount.toFixed(2),
      forBet: 1,
      sportId: matchData.sportId  ? matchData.sportId  : 0 ,
      gameName: "sports",
      gameType: oddsType,
      overallType: "bookmakerOdds",
      remarks: `${oddsType} Odds for (${matchName})`,
    };



      try {
        if (directUserShareData && directUserShareData != null) {
          newPosMaxAmount = -1 * newPosMaxAmount
          directUserShareData = JSON.parse(directUserShareData)
          if (directUserShareData) {
            directUserShareData.map((data) => {
              logData[`${data?.creatorUserType}ShareAmount`] = Math.round(
                data[`${data?.creatorUserType}ProfitLossrMatchShare`] * newPosMaxAmount /100
            );
            })
          }
        }
       } catch (e) {
      console.log(e, "problem with directShare in bookmaker place bets")
    }
    
    


    // if(shareData){
    //   newPosMaxAmount = -1 * newPosMaxAmount

    //   logData["ownerShareAmount"] = Math.round(
    //     shareData.ownerMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["subownerShareAmount"] = Math.round(
    //     shareData.subownerMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["superadminShareAmount"] = Math.round(
    //     shareData.superadminMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["adminShareAmount"] = Math.round(
    //     shareData.adminMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["subadminShareAmount"] = Math.round(
    //     shareData.subadminMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["masterShareAmount"] = Math.round(
    //     shareData.masterMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["superagentShareAmount"] = Math.round(
    //     shareData.superagentMatchProfitLossShare * newPosMaxAmount
    //   );
  
    //   logData["agentShareAmount"] = Math.round(
    //     shareData.agentMatchProfitLossShare * newPosMaxAmount
    //   );
      
    // }

    await TransactionLogModel.deleteMany({
      userId: userData._id,
      marketId: marketId.trim(),
      overallType: "bookmakerOdds",
      gameType: oddsType,
    });

    await OddsPositionModel.deleteMany({
      userId: new ObjectId(userData.userId),
      marketId: marketId.trim(),
      oddsType: oddsType,
    });

    await insertTransactionLog(userData, logData, matchData, shareData);
    const updateCoins = await updateCoinsTbl(userId, userData.userType);

  
    if(updateCoins.totalCoins < 0 ){
      const logData = {
        amount: -1 * Math.abs(oldPosMinAmount),
        forBet: 1,
        sportId: matchData.sportId  ? matchData.sportId  : 0 ,
        gameName: "sports",
        gameType: oddsType,
        overallType: "bookmakerOdds",
        remarks: `${oddsType} Odds for (${matchName})`,
      };

      await TransactionLogModel.deleteMany({
        userId: userData._id,
        marketId: marketId.trim(),
        overallType: "bookmakerOdds",
        gameType: oddsType,
      });
      await insertTransactionLog(userData, logData, matchData, shareData);
      let updateCoinsAgain = await updateCoinsTbl(userId, userData.userType);
      return SendResponse(
        res,
        "error",
        "invalid Amount",
        updateCoinsAgain
      );
    }

let operations = [];
if (teamData?.length) {
    teamData.map((team) => {
    multiBetArrayData.map((betsData) => {
    let betPositions = betsData.positionInfo
    const teamPosition = betPositions[team.selection_id] || 0;

    const pushPositionData = {
      marketId: marketId.trim(),
      oddsType,
      amount: teamPosition,
      eventId: matchData.eventId,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      superadminId: userData.superadminId,
      adminId: userData.adminId,
      subadminId: userData.subadminId,
      masterId: userData.masterId,
      superagentId: userData.superagentId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      userId: userData.userId,
      selectionId: team.selection_id,
      teamName: `${team.runner_name}`,
      sportsId : matchData.sportId
    };

    if (shareData) {
      pushPositionData.ownerAmount = Math.round(shareData.ownerMatchProfitLossShare * teamPosition);
      pushPositionData.subownerAmount = Math.round(shareData.subownerMatchProfitLossShare * teamPosition);
      pushPositionData.superadminAmount = Math.round(shareData.superadminMatchProfitLossShare * teamPosition);
      pushPositionData.adminAmount = Math.round(shareData.adminMatchProfitLossShare * teamPosition);
      pushPositionData.subadminAmount = Math.round(shareData.subadminMatchProfitLossShare * teamPosition);
      pushPositionData.masterAmount = Math.round(shareData.masterMatchProfitLossShare * teamPosition);
      pushPositionData.superagentAmount = Math.round(shareData.superagentMatchProfitLossShare * teamPosition);
      pushPositionData.agentAmount = Math.round(shareData.agentMatchProfitLossShare * teamPosition);
    }
      
    operations.push(pushPositionData)
      
    })
  })



}
    
    
    
   

 let updateObj = {
      playStatus: 1,
      updateMatchBet: true,
      isMatchPlay: true,
    };


const promises = [
  BetModel.insertMany(multiBetArrayData), 
  GetUserCoinsByMarketId(userId, userData.userType, marketId), // fetch coins
  BetService.updatePlayModel(userData.userId, marketId, updateObj),
];


  await OddsPositionModel.insertMany(operations)


const [insertBetData, marketCoins, BetServicesData ,oddsPositionResult] = await Promise.all(promises);

    const insertBetId = insertBetData?._id;
    const timestamp = Date.now();
    updateCoins.marketExposure = marketCoins.marketExposure;
    updateCoins.matchPosition = newBetPosition;

   
    await Promise.all([
      client.del(`${userData.userId}_${marketId}_POS`),
      client.set(`lastBetTimeUser__${userId}`, timestamp),
      client.del(`${userData.userId}_oddsData_${marketId}`),
    ]);


    if(bodyData.isOpenBet && bodyData.isOpenBet==true){
      let whereTransaction = {
        userId : new ObjectId(userData.userId) , 
        marketId : marketId.trim(),
        overallType : "openBet"
      }

      let whereBetOpen = {
        _id : new ObjectId(bodyData.openBetId),
        userId : new ObjectId(userData.userId) , 
        marketId : marketId.trim(),
      }

      await Promise.all([ 
       TransactionLogModel.deleteMany(whereTransaction),
       OpenBetsModel.deleteMany(whereBetOpen),
       client.del(`${userData.userId}_openBets_${marketId}`)
      ])

      let newPos  = await BetService.getNewOpenBetsPosition(userData.userId, marketId)
      if(newPos.data < 0){
          await TransactionLogModel.create({
            amount : newPos.data ,
            userId : userData.userId,
            marketId : marketId.trim(),  
            overallType : "openBet",
            forBet :1 , 
            isDeclare : 0
        })
      }
    }

  try {
      if (directUserShareData) {
        await Promise.allSettled(
          directUserShareData.map((data) =>
            emitToUser(
              "betUpdate",
              JSON.stringify(multiBetArrayData),
              data?.userUserId
            )
          )
        );
      }
    }
     catch (e) {
      console.log(
        e,
        "problem with through socket for updating bet in admin panels"
      );
    }

    return SendResponse(
      res,
      "success",
      `${oddsType} Bets Placed Successfully`,
      updateCoins
    );
  } catch (error) {
    console.log("Something Went Wrong In Odds Bet Place in oddBetPlaced", error);
    return SendResponse(
      res,
      "error",
      "Something Went Wrong In Odds Bet Place in oddBetPlaced",
      error
    );
  }
};


const updateBetfairMarket = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.eventId) {
    return SendResponse(res, "error", "event Id is Required");
  }

   if (!bodyData.marketList) {
    return SendResponse(res, "error", "marketList  is Required");
  }
  let eventId = bodyData.eventId;
  let marketList = bodyData.marketList;

  let  sportData = await sportListModel.findOne({ eventId: eventId })
  const returnData = await BetService.updateBetfairMarket(eventId, marketList, sportData);
  
  return SendResponse(res, returnData.status, returnData.message , returnData);
};

module.exports = {
  oddBetPlaced,
  sessionBetPlaced,
  matchList,
  betsList,
  betMatchDetails,
  getOddsPosition,
  getSessionPositionBySelectionId,
  casinoSearchResult,
  getSessionList,
  getCasinoList,
  getMatkaList,
  casinoBetList,
  inplayOddsPosition,
  loginReportsByMarketId,
  completedFancyByMarketId,
  getSessionListGet,
  saveSportsList,
  sportByMarketId,
  updateMatchByMarketId,
  userPositionByMarketId,
  clientListByMarketId,
  getAllSessionList,
  deleteMarket,
  actualExposerList,
  insertBetfairMarket,
  marketReload,
  meterKhadoOddEvenCricketCassinoBetPlace,
  getOpenBetsBymarketId,
  cancelOpenBets,
  combinedBetFairBetAccept,
  combinedBetPlaceOdds,
  updateBetfairMarket
};