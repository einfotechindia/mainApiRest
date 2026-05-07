const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const {
  updateCoinsTbl,
  insertTransactionLog,
  insertTransactionLogCasino,
  checkLastBetTiming,
  getUserCoinsByTransactionTable
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const UserModel = require("../../Models/User/User.model");
const StatementModel = require("../../Models/Statement.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
var requestIp = require("request-ip");
const Joi = require("joi");
const DiamondCasinoService = require("../../Services/DiamondCasino/DiamondCasino.service");
const DiamondCasinoResultService = require("./diamondResult.Controller.js");
const { siteSetting, UserTypes , fetchUrl } = require("../../Common/Constants");
const diamondCasinoList = require("../../Models/Casino/DiamondCasinoList.model");
const {
  getShareDataByUserId,
  getUserIdByUsername,
  getShareChainData
} = require("../../Helpers/UsersUtils");

const {
  _dx,
  whereHelper,
  _d,
  mongoToJson,
  convertKeyObject,
  parentDataAppend,
  dateWhereCond,
  _date,
  gameBetValidaterRedis
} = require("../../Helpers/CommonHelper");
const {emitSocket} =  require("../../socket.js")

const axios = require("axios");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model.js");
axios.defaults.timeout = siteSetting.axiosTimeOut;

const getDiamondCasinoData = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let casinoData = await DiamondCasinoService.getDiamondCasinoData(bodyData);
  return SendResponse(
    res,
    casinoData.status,
    casinoData.message,
    casinoData.data
  );
};

const getDiamondCasinoByEventId = async (req, res) => {
  let bodyData = req.body;
  if (!bodyData.eventId) {
    return SendResponse(res, "error", "event Id Is required");
  }
  const loginData = req.loggedInUser;
  let casinoData = await DiamondCasinoService.getDiamondCasinoByEventId(
    bodyData.eventId
  );
  return SendResponse(
    res,
    casinoData.status,
    casinoData.message,
    casinoData.data
  );
};



const updateDiamondCasino = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  if (loginData.userType != "owner") {  
    return SendResponse(res, "error", "Unauthorized Access");
  }
  if (!bodyData.eventId) {
    return SendResponse(res, "error", "event id is required");
  }



  _d(bodyData, "bodyData in updateDiamondCasino")



  let casinoData = await DiamondCasinoService.updateDiamondCasino(bodyData);



  return SendResponse(
    res,
    casinoData.status,
    casinoData.message,
    casinoData.data
  );
};



const winLoseAmtByCasinoType = async (casinoData, bodyData) => {
  let status = "success";
  let errorMessages = "something went wrong in win lose am";
  let data = {
    winAmt: 0,
    lossAmt: 0,
  };

  let rate = casinoData.rate - 1;

  if (bodyData.casinoType == "Teen") {
    rate = casinoData.rate / 100;
  }

  if (bodyData.layBackType == "back") {
    data.winAmt = bodyData.amount * rate;
    data.lossAmt = Number(bodyData.amount);
  } else {
    data.winAmt = Number(bodyData.amount);
    data.lossAmt = bodyData.amount * rate;
  }

  return returnResponse(status, errorMessages, data);
};

const casinoBetPlace = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId
  let isLayBack = false;
  let layBackType = "back";
  if (bodyData.hasOwnProperty("isLay")) {
    isLayBack = true;
  }

  if (isLayBack) {
    layBackType = bodyData.isLay ? "lay" : "back";
  }

  bodyData.isLayBack = isLayBack;
  bodyData.layBackType = layBackType;

  const JoiSchema = Joi.object({
    roundId: Joi.string().required(),
    sid: Joi.string().required(),
    rate: Joi.string().required(),
    amount: Joi.number().required(),
    eventId: Joi.number().required(),
    casinoType: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) =>
      detail.message.replace(/\"/g, "")
    );
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  
  let [setRedisKeyForBet, timerCheck , casinoData] = await Promise.all([
    gameBetValidaterRedis(userId),
    checkLastBetTiming(loginData.userId, 5),
    DiamondCasinoService.checkCasinoData(bodyData)
  ])

  if(!setRedisKeyForBet){
    return SendResponse(res, "error", `Please wait for a moment before placing another bet`);
  }

  if (!timerCheck) {
    return SendResponse(res, "error", "odds expired due to instant bet");
  }

  if (casinoData.status == "error") {
    return SendResponse(res, "error", casinoData.message);
  }


  casinoData = casinoData.data;

  const betAmount = bodyData.amount;
  let casinoType = bodyData.casinoType;


  let betFor = "odds";

  if (bodyData.betFor && bodyData.betFor != undefined) {
    betFor = bodyData?.betFor;
  }

  let clientId = loginData.userId;
  let checkOddsCasinoData = {};

  try {
    if (loginData.userType !== "client") {
      return SendResponse(res, "error", "Only client Authorized to place bet");
    }

    let isVirtual = casinoData.isVirtual ? casinoData.isVirtual : false
    let casinoAPIData = {}

    if (!isVirtual) {
      casinoAPIData = await axios.get(casinoData.cacheURL);
    } else {
      casinoAPIData = await axios.post(casinoData.cacheURL, {
        casinoType : casinoData.shortName
      });
    }


    if (casinoAPIData.data && !isVirtual) {
      let casinoLiveData = casinoAPIData.data;
      checkOddsCasinoData = await DiamondCasinoService.checkCasinoOdds(
        casinoLiveData,
        bodyData,
        casinoData
      );
      if (checkOddsCasinoData.status == "error") {
        return SendResponse(
          res,
          checkOddsCasinoData.status,
          checkOddsCasinoData.message
        );
      }
      
    } else if (casinoAPIData.data && isVirtual) {
      let casinoLiveData = casinoAPIData.data;
      checkOddsCasinoData = await DiamondCasinoService.checkVirtualOdds(
        casinoLiveData,
        bodyData,
        casinoData
      );
      if (checkOddsCasinoData.status == "error") {
        return SendResponse(
          res,
          checkOddsCasinoData.status,
          checkOddsCasinoData.message
        );
      }

    }
    else {
      return SendResponse(res, "error", `Fetch Cache data Error In Live Data`);
    }


    let finalOddsData = checkOddsCasinoData?.data;
    finalOddsData.amount = betAmount;
    const roundId = finalOddsData.roundId;
    let allOddsData = finalOddsData.allOddsData;
    let selectionData = finalOddsData.selectionData ? finalOddsData.selectionData : []

    let sid = finalOddsData.sid;
    let nation = finalOddsData.nat;
   
    if (nation == "Card 1") {
      nation = "Card A";
    }

    delete finalOddsData.allOddsData;
    delete finalOddsData.oddsFinalData;

    let profit = 0;
    let loss = -1 * bodyData.amount;
    const winLoseAmt = await winLoseAmtByCasinoType(finalOddsData, bodyData);

    if (winLoseAmt.status == "error") {
      return SendResponse(res, "error", winLoseAmt.message);
    } else {
      profit = winLoseAmt.data.winAmt;
      loss = -1 * winLoseAmt.data.lossAmt;
    }

    const clientData = await UserModel.findOne({
      userId: new ObjectId(clientId),
    });

    if (!clientData) {
      return SendResponse(
        res,
        "error",
        "user not found ! something went wrong"
      );
    }
    if (!clientData.status) {
      return SendResponse(
        res,
        "error",
        "client is inactive Please contact your upperline"
      );
    }

    if (!clientData.casinoStatus) {
      return SendResponse(
        res,
        "error",
        "your casino  is blocked ! please contact your upperline"
      );
    }

    if (clientData.coins < 0) {
      return SendResponse(
        res,
        "error",
        "something went wrong client coins can not be negative"
      );
    }

    let userLatestCoins = clientData.coins;

    let realUserCoins = await getUserCoinsByTransactionTable(clientData._id)
    if(realUserCoins && realUserCoins.totalCoins){
      userLatestCoins = realUserCoins.totalCoins
    }
    
    const userId = clientData.userId;
    const eventId = casinoData.eventId;
    // let deductAmount = -1 * betAmount;
    let deductAmount = loss;
    let checkAmount = Math.abs(loss);

    if (
      eventId == 3031 ||
      eventId == 3030 ||
      eventId == 3035 ||
      eventId == 3059
    ) {
      betFor = "odds";
    }

    let previousCasinoBetsWhere = {
      clientId: userId,
      eventId: eventId,
      roundId: roundId,
      betFor: betFor,
    };

    let previousCasinoBets = await casinoBetModel.find(
      previousCasinoBetsWhere,
      {
        amount: 1,
        userId: 1,
        clientId: 1,
        sid: 1,
        roundId: 1,
        betType: 1,
        betFor: 1,
        casinoType: 1,
        playerName: 1,
        odds: 1,
        profit: 1,
        loss: 1,
      }
    );

    var clientIp = requestIp.getClientIp(req);
    let insertBet = {
      userId: userId,
      userInfo: { username: clientData.username, name: clientData.name },
      roundId: roundId,
      amount: betAmount,
      sid: sid,
      eventId: eventId,
      casinoType: casinoType,
      playerName: nation,
      ip: clientIp,
      betType: layBackType == "back" ? "L" : "K",
      odds: finalOddsData.rate,
      profit: profit.toFixed(2),
      loss: loss.toFixed(2),
      betFor: betFor,
      isVirtual: isVirtual,
    };

    let posArray  = {}
    let posArrayBet = [];
    posArrayBet.push(insertBet);

    if (!isVirtual) {
        posArray = await DiamondCasinoService.getCasinoPosition(
          posArrayBet,
          allOddsData
        );
    } else {
       posArray = await DiamondCasinoService.getCasinoPositionVirtual(
          posArrayBet,
          selectionData,
        );
    }
    

    insertBet.posArray = posArray.positionArray;

    if (previousCasinoBets.length > 0) {
      let previousPosition = await DiamondCasinoService.getCasinoPosition(
        previousCasinoBets,
        allOddsData
      );

      let positionArray = previousPosition.positionArray;
      let previousAmountPos = previousPosition.amountPos;
      previousMinAmountPos = Math.min(...previousAmountPos);

      previousCasinoBets.push(insertBet);

      let latestPosition = await DiamondCasinoService.getCasinoPosition(
        previousCasinoBets,
        allOddsData
      );

      let latesPositionArray = latestPosition.positionArray;
      let latestAmountPos = latestPosition.amountPos;

      latestMinAmountPos = Math.min(...latestAmountPos);
      checkAmount = latestMinAmountPos - previousMinAmountPos;

      if (checkAmount > 0) {
        checkAmount = 0;
      } else {
        checkAmount = Math.abs(checkAmount);
      }

      deductAmount = latestMinAmountPos;
    }

    if (checkAmount > userLatestCoins) {
      return SendResponse(res, "error", `Invalid Amount`);
    }

    await TransactionLogModel.deleteOne({
      userId: userId,
      marketId: roundId,
      gameType: "diamondCasino",
      gameName: `${casinoType}-${betFor}`,
      userType: "client",
    });

    let shareData = await getShareDataByUserId(userId);
    shareData = shareData.shareData;


    let logData = {
      gameType: "diamondCasino",
      gameName: `${casinoType}-${betFor}`,
      userType: "client",
      userId: userId,
      marketId: roundId,
      eventId: eventId,
      selectionId: sid,
      amount: deductAmount,
      forBet: 1,
      overallType: "diamondCasino",
      remarks: `${casinoType} (${eventId}) bet  for roundId ${roundId} for ${nation} `,
    };


   // _dx(logData)

    await insertTransactionLogCasino(clientData, logData, shareData);
    const updateCoins = await updateCoinsTbl(userId, clientData.userType);


    if(updateCoins.totalCoins < 0 ){
        let logData = {
          gameType: "diamondCasino",
          gameName: `${casinoType}-${betFor}`,
          userType: "client",
          userId: userId,
          marketId: roundId,
          eventId: eventId,
          selectionId: sid,
          amount: -1 * Math.abs(previousMinAmountPos),
          forBet: 1,
          overallType: "diamondCasino",
          remarks: `${casinoType} (${eventId}) bet  for roundId ${roundId} for ${nation} `,
        };

        await TransactionLogModel.deleteOne({
          userId: userId,
          marketId: roundId,
          gameType: "diamondCasino",
          gameName: `${casinoType}-${betFor}`,
          userType: "client",
        });

        await insertTransactionLogCasino(clientData, logData, shareData);
        const updateCoinsAgain = await updateCoinsTbl(userId, clientData.userType)
       return SendResponse(
        res,
        "error",
        "invalid Amount",
        updateCoinsAgain
      );

    }


    insertBet = await parentDataAppend(clientData, insertBet);
    await casinoBetModel.create(insertBet);
    const timestamp = Date.now();
    await client.set(`lastBetTimeUser__${userId}`, timestamp);

    return SendResponse(
      res,
      "success",
      `Casino Bet Successfully Placed For ${casinoType}`,
      updateCoins
    );
  } catch (error) {
    console.log(`Something Went Wrong In Casino Bet Place For ${casinoType} in casinoBetPlace`, error);
    return SendResponse(
      res,
      "error",
      `Something Went Wrong In Casino Bet Place For ${casinoType} in casinoBetPlace`,
      error
    );
  }
};

const diamondBetsList = async (req, res) => {
  try {
    let bodyData = req.body;
    const loggedInData = req.loggedInUser;
    let returnData = {};
    let where = {};
    let casinoBetData = {};
    let isDeclare = bodyData.hasOwnProperty("isDeclare");
    const deletedKey = bodyData.hasOwnProperty("isDeleted");

    if (isDeclare && bodyData.isDeclare != "all") {
      where.isDeclare = bodyData.isDeclare;
    }

    where.isDeleted = false;
    if (deletedKey) {
      let inData = [0, false];
      if (bodyData.isDeleted == 1 || bodyData.isDeleted == true) {
        inData = [1, true];
      }
      where.isDeleted = { $in: inData };
    }

    if (bodyData.roundId) {
      where.roundId = bodyData.roundId;
    }

    if (bodyData.eventId) {
      where.eventId = bodyData.eventId;
    }

    if (bodyData.fromDate && bodyData.toDate) {
      let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      where.date = dateWhere;
    }

    if (bodyData.casinoType) {
      where.casinoType = bodyData.casinoType;
    }

    if (bodyData.username) {
      let usernameData = await getUserIdByUsername(bodyData.username);
      if (usernameData.status != "success") {
        return SendResponse(res, "error", usernameData.msg);
      }
      where.userId = new ObjectId(usernameData.userDetails.userId);
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

    if (bodyData.size && bodyData.pageNo) {
      let totalCasinoCount = 0;
      totalCasinoCount = await casinoBetModel.countDocuments(where);
      returnData.totalCasinoCount = totalCasinoCount;
    }

    let casinoSpecific = {
      betType: 1,
      amount: 1,
      profit: 1,
      loss: 1,
      profitLoss: 1,
      roundId: 1,
      eventId: 1,
      playerName: 1,
      createdAt: 1,
      isDeclare: 1,
      ip: 1,
      userInfo: 1,
      resultDetails: 1,
      result: 1,
      posArray: 1,
      sid: 1,
      odds: 1,
      showResult: 1,
      betFor: 1,
    };

    const pageNo = Math.max(1, bodyData.pageNo || 1); // Ensure pageNo is at least 1
    const size = Math.max(0, bodyData.size || 10);

    casinoBetData = await casinoBetModel
      .find(where, casinoSpecific)
      .sort({ _id: -1 })
      .skip(size * (pageNo - 1))
      .limit(bodyData.size);

    returnData.casinoBetData = casinoBetData;

    return SendResponse(
      res,
      "success",
      "Diamond Casino Bet List Fetch Successfully",
      returnData
    );
  } catch (error) {
    console.log(
      "Diamond Casino Bet fetch Bets List error in Bet Controller",
      error
    );
    return SendResponse(
      res,
      "error",
      "fetch Bets List error in Bet Controller",
      error
    );
  }
};

const diamondCasinoReportByUser = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  let playWhere = { gameType: "diamondCasino", overallType: "diamondCasino" };
  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  playWhere.date = dateWhere;

  if (bodyData.userId) {
    playWhere.userId = new ObjectId(bodyData.userId);
  }

  if (bodyData.eventId) {
    playWhere.eventId = bodyData.eventId;
  }

  playWhere = await whereHelper(loggedInData, playWhere);
  let userAmountType = `${loggedInData.userType}Amount`;
  if (loggedInData.userType == "client") {
    userAmountType = "amount";
  }

  let groupCond = {
    _id: "$eventId",
    clientProfitLoss: { $sum: "$amount" },
    gameName: { $first: "$gameName" },
    createdAt: { $last: "$createdAt" },
    exposure: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 0] }, { $eq: ["$forBet", 1] }],
          },
          "$amount",
          0,
        ],
      },
    },
    profitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }],
          },
          `$${userAmountType}`,
          0,
        ],
      },
    },
    clientComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          `$${userAmountType}`,
          0,
        ],
      },
    },
  };

  var resData = await TransactionLogModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  return SendResponse(res, "success", `data fetched`, resData);
};

const roundWiseResult = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  let playWhere = { gameType: "diamondCasino", overallType: "diamondCasino" };
  if (!bodyData.eventId) {
    return SendResponse(res, "error", `diamond Casino Id Is Required`);
  }

  playWhere.eventId = bodyData.eventId + "";

  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  playWhere.date = dateWhere;

  if (bodyData.userId) {
    playWhere.userId = new ObjectId(bodyData.userId);
  }

  playWhere = await whereHelper(loggedInData, playWhere);
  const userAmountType = `${loggedInData.userType}Amount`;

  let groupCond = {
    _id: "$marketId",
    clientProfitLoss: { $sum: "$amount" },
    gameName: { $first: "$gameName" },
    createdAt: { $last: "$createdAt" },
    exposure: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 0] }, { $eq: ["$forBet", 1] }],
          },
          "$amount",
          0,
        ],
      },
    },
    profitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }],
          },
          `$${userAmountType}`,
          0,
        ],
      },
    },
  };

  var resData = await TransactionLogModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  return SendResponse(res, "success", `data fetched`, resData);
};

const roudWiseData = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;

  if (!bodyData.eventId) {
    return SendResponse(res, "error", `event Id is required`);
  }

  let playWhere = { eventId: bodyData.eventId };
  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  playWhere.date = dateWhere;
  let groupCond = {
    _id: "$roundId",
    resultDetails: { $first: "$resultDetails" },
  };

  var resData = await casinoBetModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  return SendResponse(res, "success", `data fetched`, resData);
};

const undeclaredRoundId = async (req, res) => {
  let playWhere = { isDeclare: 0, isPartiallyDeclare: 0, isDeleted: {$in : [0 ,false]} };
  let bodyData = req.body;

  if (bodyData.eventId) {
    playWhere = { eventId: bodyData.eventId };
  }
  if (bodyData.fromDate && bodyData.toDate) {
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    playWhere.date = dateWhere;
  }

  let groupCond = {
    _id: "$roundId",
    eventId: { $first: "$eventId" },
    casinoType: { $first: "$casinoType" },
    createdAt: { $first: "$createdAt" },
  };

  var resData = await casinoBetModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
    {
      $sort: {
        eventId: 1,
      },
    },
  ]);

  return SendResponse(res, "success", `data fetched`, resData);
};

const getPlusMinusOfDiamondCasino = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = { gameType: "diamondCasino" };
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    let field = `${bodyData.userType}Id`;
    userWhere = {
      [field]: new ObjectId(`${bodyData.userId}`),
    };
    userType = bodyData.userType;
  }

  userWhere = await whereHelper(loginData, userWhere);
  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId.toString();
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  var resData = await TransactionLogModel.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        amount: { $sum: "$clientOddsAmount" },
        userNetAmount: { $sum: `$${userType}Amount` },
        eventId: { $first: `$eventId` },
      },
    },
    {
      $sort: {
        eventId: -1,
      },
    },
  ]);

  return SendResponse(res, "success", "dataFetched", resData);
};

const getCasinoListByDate = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = { isCasino: 1 };
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    let field = `${bodyData.userType}Id`;
    userWhere = {
      [field]: new ObjectId(`${bodyData.userId}`),
    };
    userType = bodyData.userType;
  }
  userWhere = await whereHelper(loginData, userWhere);
  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId.toString();
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$eventName`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
        createdAt: { $first: "$createdAt" },
      },
    },
    {
      $sort: {
        _id: -1,
      },
    },
  ]);
  return SendResponse(res, "success", "dataFetched", resData);
};

const dayWiseCasinoReport = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = { isCasino: 1 };
  let userType = loginData.userType;

  if (bodyData.userId && bodyData.userType) {
    let field = `${bodyData.userType}Id`;
    userWhere = {
      [field]: new ObjectId(`${bodyData.userId}`),
    };
    userType = bodyData.userType;
  }
  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId.toString();
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: {
          date: `$date`,
          eventId: `$eventId`,
        },
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${userType}OddsComm` },
        userNetProfitLoss: { $sum: `$${userType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${userType}LedgerAmt` },
        createdAt: { $first: "$createdAt" },
        eventName: { $first: "$eventName" },
        eventId: { $first: "$eventId" },
      },
    },
    {
      $sort: {
        _id: -1,
      },
    },
  ]);

  resData.map((data , key)=>{
    resData[key].userNetProfitLoss = -1 * data.userNetProfitLoss
  })



  return SendResponse(res, "success", "dataFetched", resData);
};

const realTimeDataPosDataDiamondCasino = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  if (!bodyData.eventId) {
    return SendResponse(res, "error", `eventId is required`);
  }
  let where = {
    gameType: "diamondCasino",
    overallType: "diamondCasino",
    eventId: bodyData.eventId,
    isDeclare: 1,
  };


  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  where.date = dateWhere;

  let userType = loggedInData.userType;
  let userId = loggedInData.userId;

  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
    userType = bodyData.userType;
  }

  if (bodyData.casinoType) {
    where.gameType = bodyData.casinoType;
    where.overallType = bodyData.casinoType;
  }
  where = await whereHelper(loggedInData, where);
  

  let Userpriority = UserTypes.indexOf(userType);

  let downlineUserType = UserTypes[Userpriority - 1];

  let _idGroupBy = {
    userId: `$${downlineUserType}Id`,
    eventId: "$eventId",
  };

  const userAmountType = `${userType}Amount`;

  let groupCond = {
    _id: _idGroupBy,
    clientAmount: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isComm", 0] }],
          },
          `$amount`,
          0,
        ],
      },
    },
    userComm: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isComm", 1] }],
          },
          `$${userAmountType}`,
          0,
        ],
      },
    },
  };


  // _d(where)
  var resData = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: groupCond,
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  let userIdArray = [];
  let finalReturnArray = [];

  if (resData) {
    resData.map((data) => {
      let Id = data._id;
      userIdArray.push(Id.userId);
      let pushData = {
        userId: Id.userId,
        clientAmount: data.clientAmount,
        userComm: data.userComm,
      };
      finalReturnArray[Id.userId] = pushData;
    });
  }

  let userDataArray = await UserModel.find(
    { userId: { $in: userIdArray } },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      username: 1,
      name: 1,
      userId: 1,
    }
  );

  let returnData = [];
  userDataArray = JSON.parse(JSON.stringify(userDataArray));
  if (userDataArray) {
    userDataArray.map((user) => {
      let transactionData = finalReturnArray[user.userId];
      user.clientAmount = transactionData.clientAmount;
      user.userComm = transactionData.userComm;
      returnData.push(user);
    });
  }

  return SendResponse(res, "success", `data fetched`, returnData);
};

const getProfitLossPos = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
    userType = bodyData.userType;
  }

  let userWhere = {};
  let eventId = "";

  if (bodyData.eventId) {
    eventId = bodyData.eventId;
    userWhere = { eventId: eventId };
  }

  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];
  userWhere[`${userType}Id`] = new ObjectId(userId);

  userWhere.isCasino = 1;

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.downlineUserType) {
    downlineUserType = bodyData.downlineUserType;
  }

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${downlineUserType}Id`,
        clientOddsAmount: { $sum: "$clientOddsAmount" },
        clientOddsComm: { $sum: "$clientOddsComm" },
        clientNetAmount: { $sum: "$clientNetAmount" },
        userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
        userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
        userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLoss` },
        userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
        eventName: { $first: `$eventName` },
      },
    },
  ]);

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userType: 1,
      userCasinoShare: 1,
      creatorId: 1,
      creatorUserType: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }

  let superDownlineUserType = "";

  const downUserpriority = UserTypes.indexOf(downlineUserType);
  superDownlineUserType = UserTypes[downUserpriority - 1];

  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    element.downlineUserType = superDownlineUserType;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const getPlusMinusCasinoDetail = async (req, res) => {
  const userData = req.loggedInUser;
  const bodyData = req.body;
  if (!bodyData.date) {
    return SendResponse(res, "error", "date is required");
  }

  let dateWhere = await dateWhereCond(bodyData.date, bodyData.date);
  let userWhere = await whereHelper(userData, { date: dateWhere, isCasino: 1 });

  if (bodyData.eventIdArray) {
    userWhere.eventId = { $in: bodyData.eventIdArray };
  }

  if (bodyData.downlineUserType && bodyData.downlineUserIdArray) {
    userWhere[`${bodyData.downlineUserType}Id`] = {
      $in: bodyData.downlineUserIdArray,
    };
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

  //_d(returnObj)

  returnObj.map((returnData) => {
    let userParentData = returnData.parentData;

    let ownerId = userParentData?.ownerId;
    let subownerId = userParentData?.subownerId;
    let superadminId = userParentData?.superadminId;
    let adminId = userParentData?.adminId;
    let subadminId = userParentData?.subadminId;
    let masterId = userParentData?.masterId;
    let superagentId = userParentData?.superagentId;
    let agentId = userParentData?.agentId;
    let clientId = returnData?.userId;

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

};

const updateCasinoVideo = async (req, res) => {
  let casinoListData = await diamondCasinoList.find();
  casinoListData.map(async (list) => {
    list.videoUrl2 = list.videoUrl1;
     list.videoUrl1 = `https://casinostream.tresting.com/route/?id=${list.eventId}`;
     list.videoUrl2 = `https://live.oldd247.com/swiftdizire/?id=${list.eventId}`;
     list.socketURL = `https://casinoapi.tresting.com`;
     list.cacheURL = `https://casinoapi.tresting.com/v2/api/casinoData?casinoType=${list.shortName}`;
    await DiamondCasinoService.updateDiamondCasino(list);
  });

  return SendResponse(res, "success", "link updated successgully");
};

const redeclareRoundId = async (req, res) => {
  let bodyData = req.body
  if(!bodyData.roundId){
    return SendResponse(res, "error", `roundId is Required`);
  }
  let playWhere  = {
    roundId : bodyData.roundId
  }
  let updateObj = {
    isDeclare : 0
  }





  
  var resData = await casinoBetModel.updateMany(playWhere , updateObj);
  return SendResponse(res, "success", `Decision reclared successsfully ${bodyData.roundId}` , resData);
};

const resultByRoundWise = async (req, res) => {
  let bodyData = req.body
  if(!bodyData.roundId){
    return SendResponse(res, "error", `roundId is Required`);
  }
  let roundId = bodyData.roundId
  let hitUrl = `${fetchUrl.getCasinoRoundIdResult}${roundId}`

  try{
    let axiosData = await axios.get(hitUrl)
    if(axiosData && axiosData.data){
     return SendResponse(res, "success", `data fetched` , axiosData.data);
    }else{
     return SendResponse(res, "error", `something went wrong`);
    }}catch(e){return SendResponse(res, "error", `something went wrong`);}
};



const avaitorGamePlace = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;

  let setRedisKeyForBet = await gameBetValidaterRedis(userId)
  if(!setRedisKeyForBet){
    return SendResponse(res, "error", `Please wait for a moment before placing another bet`);
  }


  let isLayBack = false;
  let layBackType = "back";
  if (bodyData.hasOwnProperty("isLay")) {
    isLayBack = true;
  }
  if (isLayBack) {
    layBackType = bodyData.isLay ? "lay" : "back";
  }
  bodyData.isLayBack = isLayBack;
  bodyData.layBackType = layBackType;
  const JoiSchema = Joi.object({
    roundId: Joi.string().required(),
    amount: Joi.number().required(),
    eventId: Joi.number().required(),
    casinoType: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) =>
      detail.message.replace(/\"/g, "")
    );
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  let casinoData = await DiamondCasinoService.checkCasinoData(bodyData);

  if (casinoData.status == "error") {
    return SendResponse(res, "error", casinoData.message);
  }

  casinoData = casinoData.data;
  const casinoType = bodyData.casinoType;

  let betFor = "odds";
  if (bodyData.betFor && bodyData.betFor != undefined) {
    betFor = bodyData?.betFor;
  }

  let clientId = loginData.userId;
  let casinoLiveData = {};

  try {
    if (loginData.userType !== "client") {
      return SendResponse(res, "error", "Only client Authorized to place bet");
    }

    let casinoApiData = await axios.get(casinoData.cacheURL);
    let betStatus = false

    if (casinoApiData.data) {
      casinoLiveData = casinoApiData.data;
      if (casinoLiveData && casinoLiveData.code == 0) {
        casinoLiveData = casinoLiveData.data
        if (casinoLiveData.dataEmitter && casinoLiveData.dataEmitter.gameStatus == "open" && casinoLiveData.dataEmitter.isBetting == true) {
          casinoLiveData = casinoLiveData.dataEmitter
          betStatus = true
        }
      } else {
        return SendResponse(res, "error", `Fetch Cache data Error In Live Data`);
      }
    }

    if (!betStatus) {
          return SendResponse(
            res,
            "error",
            "Round Closed Please Try Again in Next Round"
          );
    }


    let finalOddsData = casinoLiveData
    let betAmount = bodyData.amount
    finalOddsData.amount = betAmount;
    const roundId = finalOddsData.roundId;
    let loss = -1 * bodyData.amount;
    const clientData = await UserModel.findOne({
      userId: new ObjectId(clientId),
    });

    if (!clientData) {
      return SendResponse(
        res,
        "error",
        "user not found ! something went wrong"
      );
    }
    if (!clientData.status) {
      return SendResponse(
        res,
        "error",
        "client is inactive Please contact your upperline"
      );
    }
    
    if (!clientData.casinoStatus) {
      return SendResponse(
        res,
        "error",
        "your casino  is blocked ! please contact your upperline"
      );
    }

    let userLatestCoins = clientData.coins;
    let realUserCoins = await getUserCoinsByTransactionTable(clientData._id)

    if(realUserCoins && realUserCoins.totalCoins){
      userLatestCoins = realUserCoins.totalCoins
    }

    if(userLatestCoins < 0 ){
      return SendResponse(
        res,
        "error",
        "something went wrong client coins can not be negative"
      );
    }


    if(betAmount > userLatestCoins ){
      return SendResponse(
        res,
        "error",
        "invalid Amount ! Please Refill your amount"
      );
    }
   
    const userId = clientData.userId;
    const eventId = casinoData.eventId;

    let deductAmount = -1 * betAmount;


    var clientIp = requestIp.getClientIp(req);

    let insertBet = {
      userId: userId,
      userInfo: { username: clientData.username, name: clientData.name },
      roundId: roundId,
      amount: betAmount,
      eventId: eventId,
      casinoType: casinoType,
      playerName: "avaitor",
      ip: clientIp,
      betType: layBackType == "back" ? "L" : "K",
      profit: 0,
      loss: loss.toFixed(2),
      profitLoss: loss.toFixed(2),
      betFor: "odds",
      result: "cashOut",
      showResult: "cashOut",
    };

  
    let shareData = await getShareDataByUserId(userId);
    shareData = shareData.shareData;

    let logData = {
      gameType: "diamondCasino",
      gameName: `${casinoType}-${betFor}`,
      userType: "client",
      userId: userId,
      marketId: roundId,
      eventId: eventId,
      amount: deductAmount,
      forBet: 1,
      isDeclare: 1,
      overallType: "diamondCasino",
      remarks: `${casinoType} (${eventId}) bet  for roundId ${roundId} for avaitor`,
    };

    await insertTransactionLogCasino(clientData, logData, shareData);

    const updateCoins = await updateCoinsTbl(userId, clientData.userType);

    if (updateCoins.totalCoins < 0) {
       return SendResponse(
        res,
        "error",
        "invalid Amount ! Please Refill your amount"
      );
    }

    insertBet = await parentDataAppend(clientData, insertBet);
    let betIdData = await casinoBetModel.create(insertBet);

    let betInsertId = betIdData._id


    let statement = {
      amount: deductAmount,
      betId:betInsertId,
      marketId: roundId,
      eventId: eventId,
      userId: userId,
      userType: "client",
      statementFor: "diamondCasino",
      gameType: `diamondCasino`,
      sportsType: `casino`,
      userRemark: ` avaitor Bet For ${casinoType} Of (${roundId}) `,
      remark: `avaitor  For ${casinoType} Of (${roundId})`,
    };

    const timestamp = Date.now();

    await Promise.allSettled([
      StatementModel.create(statement),
      client.set(`lastBetTimeUser__${userId}`, timestamp),
      client.set(`latestAvaitorRoundId`, bodyData.roundId),
      client.sadd(`avaitorRoundId`, bodyData.roundId)
    ]);

    updateCoins.betInsertId = betInsertId
    await gameBetValidaterRedis(userId , "del")
    return SendResponse(
      res,
      "success",
      betInsertId,
      updateCoins
    );

  } catch (error) {
    console.log(`Something Went Wrong In avaitor Bet Place For ${casinoType} in avaitorBetPlace`, error);
    await gameBetValidaterRedis(userId , "del")
    return SendResponse(
      res,
      "error",
      `Something Went Wrong In avaitor Bet Place For ${casinoType} in avaitorBetPlace`,
      error
    );
  } finally {
     await gameBetValidaterRedis(userId , "del")
  }
};

const avaitorCashOut = async (req, res) => {
  const { body } = req;
  const loginData = req.loggedInUser;
  const schema = Joi.object({
    roundId: Joi.string().required(),
    betId: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });

  const { error } = schema.validate(body);
  if (error) {
    const messages = error.details.map(detail =>
      detail.message.replace(/\"/g, "")
    );
    return SendResponse(res, "error", "Validation failed", messages);
  }

  if (loginData.userType !== "client") {
    return SendResponse(res, "error", "Only clients are authorized to cash out.");
  }

  const clientId = loginData.userId;
  const casinoType = "avaitor";

  try {
    const casinoDataResponse = await DiamondCasinoService.checkCasinoData(body);
    if (casinoDataResponse.status === "error") {
      return SendResponse(res, "error", casinoDataResponse.message);
    }

    const casinoData = casinoDataResponse.data;
    const liveDataResponse = await axios.get(casinoData.cacheURL);

    if (!liveDataResponse?.data) {
      return SendResponse(res, "error", "Failed to fetch live data.");
    }


    const dataEmitter = liveDataResponse.data.data?.dataEmitter;
    if (!dataEmitter) {
      return SendResponse(res, "error", "Live data emitter not found.");
    }

    const liveData = dataEmitter

    if (!liveData || liveData.gameStatus !== "running") {
      return SendResponse(res, "error", "Game stage timed out.");
    }


    if (liveData.roundId !== body.roundId) {
      return SendResponse(res, "error", "Game stage timed out.");
    }


    let betWhere = {
      roundId: body.roundId,
      userId: new ObjectId(clientId),
      _id: new ObjectId(body.betId),
      eventId: casinoData.eventId,
      isDeclare: 0
    }

    const betData = await casinoBetModel.findOne(betWhere);

    // _d(betData , "")

    if (!betData) {
      return SendResponse(
        res,
        "error",
        "Bet data not found or cash out already initiated."
      );
    }

  
    const amount = Number(betData?.amount);
    const multiplier = Number(liveData?.curentMultiplier);
    const profit = Number(multiplier * amount).toFixed(2);

    const updateBet = {
      profit,
      profitLoss: profit,
      isPartiallyDeclare: 1,
      isDeclare: 1,
      result: multiplier,
      showResult: multiplier
    };

    await casinoBetModel.updateOne(
      {
        roundId: body.roundId,
        userId: new ObjectId(clientId),
        _id: new ObjectId(body.betId),
        eventId: casinoData.eventId
      },
      updateBet
    );


    // Step 6: Insert Transaction Log
    const logData = {
      gameType: "diamondCasino",
      gameName: `${casinoType}-odds`,
      userType: "client",
      userId: clientId,
      marketId: betData.roundId,
      eventId: betData.eventId,
      amount: profit,
      forBet: 1,
      isDeclare: 1,
      overallType: "diamondCasino",
      remarks: `${casinoType} (${body.eventId}) bet for roundId ${body.roundId}`
    };


    const [shareDataResp , directShareData ] = await Promise.all([
      getShareDataByUserId(clientId),
      getShareChainData(clientId),
      StatementModel.deleteOne({
      betId : body.betId
      })
    ]);


    let shareData = shareDataResp.shareData;

    let statement = {
      amount: profit - betData.amount,
      betId:body.betId,
      marketId: betData.roundId,
      eventId: betData.eventId,
      userId: clientId,
      userType: "client",
      statementFor: "diamondCasino",
      gameType: `diamondCasino`,
      sportsType: `casino`,
      userRemark: ` avaitor Bet For ${casinoType} Of (${betData.roundId}) `,
      remark: `avaitor  For ${casinoType} Of (${betData.roundId})`,
    };

     shareData._id  = clientId
     shareData.userType = "client"
     shareData.clientId = clientId

    let crickInsertAmount = profit - betData.amount
    let casinoRemark = `Avaitor-Vig-(${_date()})`;
        
            let crickPushTransactionLog = {
              amount: crickInsertAmount,
              clientProfitLoss: crickInsertAmount,
              marketId: logData?.marketId,
              eventId: `${logData.eventId}-${_date()}`,
              sportId: 1000000,
              seriesId: logData.eventId,
              gameName: "casino",
              transactionType: "profitLoss",
              gameType: "avaitor",
              marketType: "diamondCasino",
              selectionId: logData?.marketId,
              remarks: casinoRemark,
              userId: shareData.userId,
              ownerId: shareData.ownerId,
              subownerId: shareData.subownerId,
              superadminId: shareData.superadminId,
              adminId: shareData.adminId,
              subadminId: shareData.subadminId,
              masterId: shareData.masterId,
              superagentId: shareData.superagentId,
              agentId: shareData.agentId,
              clientId: shareData.userId,
              eventName : `AVAITOR-(${_date()})`,
            };
  
            directShareData && directShareData.map((directShare) => { 
              crickPushTransactionLog[`${directShare.creatorUserType}LedgerAmount`] = directShare[`${directShare.creatorUserType}LedgerCasinoShare`] * crickInsertAmount/100
              crickPushTransactionLog[`${directShare.creatorUserType}ProfitLoss`] = directShare[`${directShare.creatorUserType}ProfitLossrCasinoShare`] * crickInsertAmount/100
            })
    
  
          await Promise.allSettled([
            StatementModel.create(statement),
            insertTransactionLogCasino(shareData, logData, shareData),
            CrickTransactionLogModel.create(crickPushTransactionLog)  
          ]);

  
    let updatedCoins = await updateCoinsTbl(clientId, "client");
    




          updatedCoins.finalProfit = profit;
          updatedCoins.curentMultiplier = multiplier;

    

    return SendResponse(
      res,
      "success",
      `Cash out successful. Profit: ${profit}`,
      updatedCoins
    );

    

  } catch (err) {
    console.error("Error in avaitorCashOut:", err);
    return SendResponse(
      res,
      "error",
      "Internal server error while processing cash out.",
      err.message || err
    );
  }
};



module.exports = {
  getDiamondCasinoData,
  getDiamondCasinoByEventId,
  casinoBetPlace,
  updateDiamondCasino,
  diamondBetsList,
  diamondCasinoReportByUser,
  roundWiseResult,
  roudWiseData,
  undeclaredRoundId,
  getPlusMinusOfDiamondCasino,
  getCasinoListByDate,
  dayWiseCasinoReport,
  realTimeDataPosDataDiamondCasino,
  getProfitLossPos,
  getPlusMinusCasinoDetail,
  updateCasinoVideo,
  redeclareRoundId,
  resultByRoundWise,
  avaitorGamePlace,
  avaitorCashOut
};
