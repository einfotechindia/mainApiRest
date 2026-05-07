const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const {
  updateCoinsTbl,
  insertTransactionLogMatka,
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const {
  getShareDataByUserId,
  getUserIdByUsername,
} = require("../../Helpers/UsersUtils");
const MatkaModel = require("../../Models/Matka/Matka.model");
const MatkaBetsModel = require("../../Models/Matka/MatkaBets.model");
const matkaGameType = require("../../Models/Matka/matkaGameType.model");
const matkaChartResultModel = require("../../Models/Matka/matkaResultChart.model");
var requestIp = require("request-ip");
const Joi = require("joi");
const { UserTypes } = require("../../Common/Constants");
require("dotenv").config();

const {
  _dx,
  whereHelper,
  _d,
  convertKeyObject,
  parentDataAppend,
  dateWhereCond,
  _date,
  getSettingData,
  isBetweenTime
} = require("../../Helpers/CommonHelper");
const moment = require("moment");

const createMatka = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;

  if (loginData.userType != "owner") {
    return SendResponse(
      res,
      "error",
      "you are not authorized to perform this operation"
    );
  }

  const JoiSchema = Joi.object({
    shortName: Joi.string().required(),
    matkaEventId: Joi.number().required(),
    name: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  let matkaCount = await MatkaModel.findOne({
    matkaEventId: bodyData.matkaEventId,
  });

  if (matkaCount) {
    return SendResponse(res, "error", "matka already exists");
  }

  let matkaData = await MatkaModel.create(bodyData);

  matkaData = await MatkaModel.find();
  await client.set(`matkaList`, JSON.stringify(matkaData));
  return SendResponse(res, "success", "matka inserted successfully", matkaData);
};

const updateMatka = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  if (loginData.userType != "owner") {
    return SendResponse(
      res,
      "error",
      "you are not authorized to perform this operation"
    );
  }
  const JoiSchema = Joi.object({
    matkaEventId: Joi.number().required(),
    openTime: Joi.string().required(),
    closeTime: Joi.string().required(),
    resultTime: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  let matkaEventId = bodyData.matkaEventId;

  let matkaDetails = await MatkaModel.findOne({
    matkaEventId: matkaEventId,
  });

  if (!matkaDetails) {
    return SendResponse(res, "error", "matka not exists");
  }

  delete bodyData.matkaEventId;

  let matkaData = await MatkaModel.updateOne(
    { matkaEventId: matkaEventId },
    bodyData
  );

  await client.del(`matkaList`);
  await client.del(`matka_${matkaEventId + ""}`);

  return SendResponse(res, "success", "matka updated successfully", matkaData);
};

const checkMatkaBetStatus = async (matka) => {
  let jodiBet = false;
  let openBet = false;
  let closeBet = false;

  let matkaOpenTime = matka.openTime;

  let matkaExtendedCloseDay = matka.extendedCloseDay
    ? matka.extendedCloseDay
    : 0;
  let matkaExtendedOpenDay = matka.extendedOpenDay ? matka.extendedOpenDay : 0;
  let matkaCloseTime = matka.closeTime;

  if (matkaExtendedCloseDay > 0) {
    const todayCloseMoment = moment(matkaCloseTime, "HH:mm");
    matkaCloseTime = todayCloseMoment
      .add(matkaExtendedCloseDay, "day")
      .format("HH:mm");
  }

  if (matkaExtendedOpenDay > 0) {
    const todayOpenMoment = moment(matkaOpenTime, "HH:mm");
    matkaOpenTime = todayOpenMoment
      .add(matkaExtendedOpenDay, "day")
      .format("HH:mm");
  }

  const currentTime = moment();
  let liveTime = currentTime.format("HH:mm");
  const liveTimeMoment = moment(liveTime, "HH:mm");
  const momentOpenTime = moment(matkaOpenTime, "HH:mm");
  const momentCloseTime = moment(matkaCloseTime, "HH:mm");

  const openTimeDiffrence = liveTimeMoment.diff(momentOpenTime, "minutes");
  const closeTimeDiffrence = liveTimeMoment.diff(momentCloseTime, "minutes");

  if (openTimeDiffrence < -30) {
    openBet = true;
    jodiBet = true;
  }

  if (closeTimeDiffrence < -30) {
    closeBet = true;
  }

  return {
    jodiBet: jodiBet,
    openBet: openBet,
    closeBet: closeBet,
  };
};

const getMatkaList = async (req, res) => {
  let matkaData = {};
  matkaData = await client.get(`matkaList}`);
  if (!matkaData || matkaData == null || matkaData.length < 5) {
    matkaData = await MatkaModel.find();
    await client.set(`matkaList`, JSON.stringify(matkaData));
  } else {
    matkaData = JSON.parse(matkaData);
  }

  matkaData = JSON.parse(JSON.stringify(matkaData));

  matkaData.map(async (matka, key) => {
    let matkaBetStatus = await checkMatkaBetStatus(matka);
    matkaData[key].openBet = matkaBetStatus.openBet;
    matkaData[key].closeBet = matkaBetStatus.closeBet;
    matkaData[key].jodiBet = matkaBetStatus.jodiBet;
  });
  if (res) {
    return SendResponse(res, "success", "data fetched", matkaData);
  }
};

const getMatkaByMatkaEventId = async (req, res) => {
  let matkaData = {};
  let bodyData = req.body;
  let status = "success";
  let msg = "data fetched";
  const JoiSchema = Joi.object({
    matkaEventId: Joi.number().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  matkaData = await client.get(`matka_${bodyData.matkaEventId + ""}`);
  if (!matkaData || matkaData == null || matkaData.length < 5) {
    matkaData = await MatkaModel.findOne({
      matkaEventId: bodyData.matkaEventId,
    });
    if (matkaData) {
      await client.set(
        `matka_${bodyData.matkaEventId + ""}`,
        JSON.stringify(matkaData)
      );
    } else {
      status = "error";
      msg = "matka not found";
    }
  } else {
    matkaData = JSON.parse(matkaData);
  }

  let matkaBetStatus = await checkMatkaBetStatus(matkaData);
  matkaData.openBet = matkaBetStatus.openBet;
  matkaData.closeBet = matkaBetStatus.closeBet;
  matkaData.jodiBet = matkaBetStatus.jodiBet;

  if (res) {
    return SendResponse(res, status, msg, matkaData);
  } else {
    return returnResponse(status, msg, matkaData);
  }
};

const matkaPlaceBet = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  if (loginData.userType != "client") {
    return SendResponse(
      res,
      "error",
      "you are not authorized to perform this operation"
    );
  }
  const JoiSchema = Joi.object({
    matkaEventId: Joi.number().required(),
    gameType: Joi.string().required(),
    betType: Joi.string().required(),
    betNumber: Joi.number().required(),
    amount: Joi.number().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  let betType = "OPEN";
  if (bodyData.betType) {
    betType = bodyData.betType;
  }

  let gameType = bodyData.gameType;
  const matkaEventId = bodyData.matkaEventId;
  let betNumber = bodyData.betNumber;

  let betNumberSpliter = betNumber.toString();
  betNumberSpliter = betNumberSpliter.split("");
  let betNumberLength = betNumberSpliter.length;
  const digitCount = {};
  betNumberSpliter.forEach((digit) => {
    digitCount[digit] = (digitCount[digit] || 0) + 1;
  });

  const sameDigitCount = Object.values(digitCount).reduce((acc, count) => {
    if (count > 1) {
      acc += count;
    }
    return acc;
  }, 0);

  if (gameType == "JODI" && betNumberLength != 2) {
    return SendResponse(res, "error", "in JODI Two Digit Number is required");
  }

  if (
    (gameType == "SINGLE" ||
      gameType == "HAROOP_ANDAR" ||
      gameType == "HAROOP_BAHAR") &&
    betNumberLength != 1
  ) {
    return SendResponse(
      res,
      "error",
      "in Single Only One Digit Number is required"
    );
  }

  if (
    (gameType == "SINGLE_PATTI" ||
      gameType == "DOUBLE_PATTI" ||
      gameType == "TRIPLE_PATTI") &&
    betNumberLength != 3
  ) {
    return SendResponse(
      res,
      "error",
      "in Patti Three Digit Number is required"
    );
  }

  if (gameType == "SINGLE_PATTI" && sameDigitCount != 0) {
    return SendResponse(
      res,
      "error",
      "in Single Patti  all three digit should be different from each other"
    );
  }

  if (gameType == "DOUBLE_PATTI" && sameDigitCount != 2) {
    return SendResponse(
      res,
      "error",
      "in double Patti two digit should be same"
    );
  }

  if (gameType == "TRIPLE_PATTI" && sameDigitCount != 3) {
    return SendResponse(
      res,
      "error",
      "in triple Patti three digit should be same"
    );
  }

  let matkaData = await getMatkaByMatkaEventId(req);
  if (matkaData.status == "error") {
    return SendResponse(res, "error", matkaData.message);
  }

  matkaData = matkaData.data;

  if (!matkaData.matkaStatus || !matkaData.betStatus) {
    return SendResponse(res, "error", "bet is blocked by admin");
  }
  let amount = bodyData.amount;


  let isHaroopAndarBahar = matkaData.isHaroopAndarBahar ? matkaData.isHaroopAndarBahar : false

  if(isHaroopAndarBahar){
    let timeExists = isBetweenTime(0 , 6)   // i.e. 12 Am To 3 Am
    if(timeExists){
      return SendResponse(res, "error", `we can not take bet from 12:00 AM To 6:00 Am Please take bet aftert 6 Am`);
    }
  }


  if (amount > matkaData.maxStake) {
    return SendResponse(
      res,
      "error",
      `bet amount can not be greater than ${matkaData.maxStake}`
    );
  }
  if (amount < matkaData.minStake) {
    return SendResponse(
      res,
      "error",
      `bet amount can not be less than ${matkaData.minStake}`
    );
  }

  if (betType == "OPEN" && !matkaData.openBet) {
    return SendResponse(
      res,
      "error",
      `Open Bet matka Time Out ! hence we can not accept bet`
    );
  }

  if (betType == "HAROOP_ANDAR" && !matkaData.openBet) {
    return SendResponse(
      res,
      "error",
      `HAROOP ANDAR Bet matka Time Out ! hence we can not accept bet`
    );
  }

  if (betType == "CLOSE" && !matkaData.closeBet) {
    return SendResponse(
      res,
      "error",
      `Close Bet matka Time Out ! hence we can not accept bet`
    );
  }

  if (betType == "HAROOP_BAHAR" && !matkaData.closeBet) {
    return SendResponse(
      res,
      "error",
      `Close Bet matka Time Out ! hence we can not accept bet`
    );
  }

  if (betType == "JODI" && !matkaData.jodiBet) {
    return SendResponse(
      res,
      "error",
      `Jodi Bet matka Time Out ! hence we can not accept bet`
    );
  }

  let deductAmount = amount;
  let userData = await UserModel.findOne({
    userId: new ObjectId(loginData.userId),
  });

  if (!userData.matkaStatus) {
    return SendResponse(
      res,
      "error",
      `your bet is blocked by agent ! please contact agent`
    );
  }

  if (deductAmount > userData.coins) {
    return SendResponse(res, "error", `Insufficient balance`);
  }

  let matkaLimitPerNumberPermission = userData.matkaLimitPerNumber;
  let groupWhere = {
    userId: userData.userId,
    betNumber: Number(betNumber),
    matkaEventId: matkaEventId,
    isDeleted: false,
  };
  let dateWhere = await dateWhereCond();
  groupWhere.date = dateWhere;

  let checkPerBetLimitOfUser = process.env.CHECK_PER_BET_LIMIT_OF_USER
    ? process.env.CHECK_PER_BET_LIMIT_OF_USER
    : false;

  if (checkPerBetLimitOfUser == "true") {
    var checkPerBetAmount = await MatkaBetsModel.aggregate([
      {
        $match: groupWhere,
      },
      {
        $group: {
          _id: "$userId",
          totalCoins: { $sum: "$amount" },
        },
      },
    ]);
    let alreadyBetAmount = 0;
    if (checkPerBetAmount[0].totalCoins) {
      alreadyBetAmount = checkPerBetAmount[0].totalCoins;
    }
    if (alreadyBetAmount + amount > matkaLimitPerNumberPermission) {
      return SendResponse(
        res,
        "error",
        `please contact agent your per bet limit is finish please increase your per bet limit`
      );
    }
  }

  req.body = { gameType: gameType };
  let matkaGameTypes = await matkaGameTypeList(req);

  if (!matkaGameTypes) {
    return SendResponse(
      res,
      "error",
      `something went wrong in gameType please try again later`
    );
  }

  let profit = 0;
  let loss = -1 * deductAmount;

  let timesAmount = matkaGameTypes.timesAmount;
  if (timesAmount) {
    profit = bodyData.amount * timesAmount - bodyData.amount;
  }

 
  var clientIp = requestIp.getClientIp(req);

  let matkaBetData = {
    amount: deductAmount,
    loss: loss,
    profit: profit,
    userId: userData.userId,
    clientId: userData.userId,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    subownerId: userData.subownerId,
    ownerId: userData.ownerId,
    gameType: gameType,
    betType: betType,
    matkaEventId: matkaEventId,
    matkaName: `${matkaData.name}`,
    betNumber: betNumber,
    ip: clientIp,
    rate: timesAmount - bodyData.amount,
    userInfo: { name: userData.name, username: userData.username },
  };

  let transactionLog = {
    amount: -1 * deductAmount,
    clientAmount: -1 * deductAmount,
    userType: "client",
    forBet: 1,
    isDeclare: 0,
    gameType: "matka",
    gameName: `${matkaData.name} - ${betType} - ${gameType}`,
    eventId: `${matkaEventId}`,
    overallType: "matkaOdds",
  };

  let shareData = await getShareDataByUserId(userData.userId);
  shareData = shareData.shareData;
  
  let matkaBetId = await MatkaBetsModel.create(matkaBetData);
  transactionLog.marketId = matkaBetId._id;

  await insertTransactionLogMatka(userData, transactionLog, shareData);
  await updateCoinsTbl(userData.userId, userData.userType);
  return SendResponse(res, "success", "bet placed successfully", "");
};

const matkaGameTypeList = async (req, res) => {
  let matkaGameList = {};
  let bodyData = req.body;
  if (!bodyData.gameType) {
    matkaGameList = await client.get(`matkaGameType`);
    if (!matkaGameList || matkaGameList == null || matkaGameList.length < 5) {
      matkaGameList = await matkaGameType.find();
      await client.set(`matkaGameType`, JSON.stringify(matkaGameList));
    } else {
      matkaGameList = JSON.parse(matkaGameList);
    }
  } else {
    let gameType = bodyData.gameType;
    matkaGameList = await client.get(`matkaGameType_${gameType}`);
    if (!matkaGameList || matkaGameList == null || matkaGameList.length < 5) {
      matkaGameList = await matkaGameType.findOne({ gameType: gameType });
      await client.set(
        `matkaGameType_${gameType}`,
        JSON.stringify(matkaGameList)
      );
      if (!matkaGameList) {
        return false;
      }
    } else {
      matkaGameList = JSON.parse(matkaGameList);
    }
  }

  if (res) {
    return SendResponse(
      res,
      "success",
      "list fetch successfully",
      matkaGameList
    );
  } else {
    return matkaGameList;
  }
};

const matkaBetList = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  let where = {};
  let isDeclare = bodyData.hasOwnProperty("isDeclare");
  const deletedKey = bodyData.hasOwnProperty("isDeleted");

  if (isDeclare && bodyData.isDeclare != "all") {
    where.isDeclare = bodyData.isDeclare;
  }

  // where.isDeleted = false;

  if (deletedKey) {
    let inData = [0, false];
    if (bodyData.isDeleted == 1 || bodyData.isDeleted == true) {
      inData = [1, true];
    }
    where.isDeleted = { $in: inData };
  }

  if (bodyData.matkaEventId) {
    where.matkaEventId = bodyData.matkaEventId;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    where.date = dateWhere;
  }

  if (bodyData.username) {
    let userData = await getUserIdByUsername(bodyData.username);
    if (userData.status != "success") {
      return SendResponse(res, "error", "username not found");
    }
    where.userId = userData.userDetails.userId;
  }

  where = await whereHelper(loggedInData, where);

  let betData = await MatkaBetsModel.find(where);

  if (res) {
    return SendResponse(res, "success", "data fetched", betData);
  } else {
    return betData;
  }
};

const deleteMatkaBets = async (req, res) => {
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
  if (userData.userType != "owner") {
    return SendResponse(res, "error", "Only owner authorised to update bets");
  }
  if (bodyData.password != process.env.BETS_DELETE_PASSWORD) {
    return SendResponse(
      res,
      "error",
      "bets delete password is wrong please try again later"
    );
  }

  let uniqueClientData = [];
  let finalClientArray = [];
  let deletedRemark = "by Company";

  let betsType = "matka";
  if (bodyData.betsType) {
    betsType = bodyData.betsType;
  }
  if (bodyData.deletedRemark) {
    deletedRemark = bodyData.deletedRemark;
  }
  let clientData = [];

  let isDeleted = true;

  if (bodyData?.isDeleted == false) {
    isDeleted = false;
  }

  await MatkaBetsModel.updateMany(
    {
      _id: {
        $in: bodyData._id,
      },
    },
    {
      $set: { isDeleted: isDeleted },
    }
  );

  betsData = await MatkaBetsModel.find({
    _id: {
      $in: bodyData._id,
    },
  });

  await Promise.all(
    betsData.map(async (data) => {
      try {
        if (isDeleted) {
          const deleteWhere = {
            userType: "client",
            eventId: String(data.matkaEventId),
            userId: data.userId,
            gameType: "matka",
            amount: -1 * data.amount,
          };
          await TransactionLogModel.deleteOne(deleteWhere);
        } else {
          const transactionLog = {
            amount: -1 * data.amount,
            clientAmount: -1 * data.amount,
            userType: "client",
            forBet: 1,
            isDeclare: 0,
            gameType: "matka",
            gameName: `${data.gameName} - ${data.betType} - ${data.gameType}`,
            eventId: String(data.matkaEventId),
            overallType: "matkaOdds",
          };

          const userData = {
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
            _id: data.userId,
          };
          const shareDataResponse = await getShareDataByUserId(data.userId);
          const shareData = shareDataResponse?.shareData || {};
          await insertTransactionLogMatka(userData, transactionLog, shareData);
        }

        const userId = String(data.userId);

        if (!finalClientArray.hasOwnProperty(userId)) {
          finalClientArray[userId] = data;
          uniqueClientData.push(data.userId);
        }
      } catch (error) {
        console.error(
          `Error processing bet data for userId: ${data.userId}`,
          error
        );
      }
    })
  );

  let ResponseMapper = await updateBulkCoinsExposureUserByMarketId(
    uniqueClientData
  );

  return SendResponse(
    res,
    "success",
    "bets updated successfully",
    ResponseMapper
  );
};

const matkaBetCount = async (req, res) => {
  try {
    const bodyData = req.body;
    const userData = req.loggedInUser;
  } catch (error) {
    console.log(error);
  }
};

const dayWiseMatkaReport = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = { positionType: "matka" };
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
  return SendResponse(res, "success", "dataFetched", resData);
};

let countMatkaBets = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userWhere = {};
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

  var resData = await MatkaBetsModel.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: {
          eventId: `$matkaEventId`,
          matkaName: `$matkaName`,
        },
        betCount: { $sum: 1 },
      },
    },
  ]);
  return SendResponse(res, "success", "dataFetched", resData);
};

const getProfitLossPosMatka = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
    userType = bodyData.userType;
  }

  let eventId = "";

  if (bodyData.eventId) {
    eventId = bodyData.eventId;
    userWhere = { eventId: eventId };
  }

  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];
  userWhere[`${userType}Id`] = new ObjectId(userId);

  userWhere.positionType = "matka";

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

const updateMatkaTypes = async (req, res) => {
  let bodyData = req.body;
  if (!bodyData.gameType) {
    return SendResponse(res, "error", "gameType Is Required");
  }
  await matkaGameType.updateOne(
    {
      gameType: bodyData.gameType,
    },
    bodyData,
    {
      $upsert: true,
    }
  );
  let matkaGameList = await matkaGameType.find();
  await client.set(`matkaGameType`, JSON.stringify(matkaGameList));

  matkaGameList.map(async (matka) => {
    await client.set(`matkaGameType_${matka.gameType}`, JSON.stringify(matka));
  });

  if (res) {
    return SendResponse(res, "success", "matka types updated successfully");
  } else {
    return matkaGameList;
  }
};

const getResultPanelList = async (req, res) => {
  try {
    let bodyData = req.body;
    let where = {};
    if (bodyData.date) {
      where.date = await dateWhereCond(bodyData.date);
    }
    let getResultList = await matkaChartResultModel.find(where);
    return SendResponse(res, "success", "dataFetched", getResultList);
  } catch (e) {}
};


const matkaReportByUser = async (req, res) => {
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  let playWhere = {};
  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  playWhere.date = dateWhere;
  if (bodyData.userId) {
    playWhere.userId = new ObjectId(bodyData.userId);
  }
  if (bodyData.eventId) {
    playWhere.eventId = bodyData.eventId;
  }
  playWhere = await whereHelper(loggedInData, playWhere);
  let dataRes = await profitLossPosition.findOne(playWhere, {
    clientOddsAmount: 1,
    clientOddsComm: 1,
    result: 1,
    eventName: 1,
  });
  return SendResponse(res, "success", `data fetched`, dataRes);
};


const matkaBetDelete = async (req,res)=>{
  let bodyData = req.body;
  const loggedInData = req.loggedInUser;
  if(loggedInData.userType!="owner"){
    return SendResponse(res, "error", "only owner authorized to delete bets");
  }
  let isDeleted = true
  if(bodyData.isDeleted && bodyData.isDeleted == false){
    isDeleted = false
  }
  let betIdArray = bodyData.betIdArray

  let where = {
    _id : {
      $in : betIdArray
    }
  }

  let betDelateUpdate = await MatkaBetsModel.updateMany(where,{
    isDeleted:isDeleted
  })


  let userIdArray = []
  let betList = await MatkaBetsModel.find(where , {userId:1})
  betList.map((bet)=>{
    userIdArray.push(bet.userId)
  })


  
  await TransactionLogModel.deleteMany({
    marketId: { $in: betIdArray },
  })

  await updateBulkCoinsExposureUserByMarketId(userIdArray)

  return SendResponse(res, "success", `bets updated ucessfully`, betDelateUpdate);
}

const matkaBetCancel = async (req, res) => {
  try {
    const { betId } = req.body;
    const { userId, userType } = req.loggedInUser || {};

    if (userType !== "client") {
      return SendResponse(res, "error", "Only clients can cancel their bets.");
    }

    if (!betId) {
      return SendResponse(res, "error", "Bet ID is required.");
    }

    const userData = await UserModel.findById(userId, { status: 1 });
    if (!userData) {
      return SendResponse(res, "error", "User not found.");
    }

    if (!userData.status) {
      return SendResponse(res, "error", "User is inactive.");
    }

    const betQuery = { _id: betId, userId, isDeleted: { $ne: true } };
    const matkaBetData = await MatkaBetsModel.findOne(betQuery);

    if (!matkaBetData) {
      return SendResponse(res, "error", "Bet not found or already canceled.");
    }

    const matkaEventId = matkaBetData.matkaEventId;
    const matkaResponse = await getMatkaByMatkaEventId({ body: { matkaEventId } });

    if (matkaResponse.status !== "success") {
      return SendResponse(res, "error", "Matka event data not found.");
    }

    const { openBet, closeBet, jodiBet } = matkaResponse.data;
    const { gameType, betType } = matkaBetData;

    // Validate based on bet timing
    if (betType === "OPEN" && !openBet) {
      return SendResponse(res, "error", "Open bet cancellation time has passed.");
    }

    if (betType === "CLOSE" && !closeBet) {
      return SendResponse(res, "error", "Close bet cancellation time has passed.");
    }

    if (gameType === "JODI" && !jodiBet) {
      return SendResponse(res, "error", "Jodi bet cancellation time has passed.");
    }

    // Mark the bet as deleted
    const updateResult = await MatkaBetsModel.updateOne(betQuery, {
      $set: {
        isDeleted: true,
        cancelRemark: "Cancelled by client"
      }
    });

    if (updateResult.modifiedCount === 0) {
      return SendResponse(res, "error", "Failed to cancel the bet.");
    }

    await Promise.all([
      TransactionLogModel.deleteMany({ marketId: betId }),
      updateCoinsTbl(userId, userType)
    ]);

    return SendResponse(res, "success", "Bet canceled successfully.");
  } catch (error) {
    console.error("matkaBetCancel error:", error);
    return SendResponse(res, "error", "An unexpected error occurred while canceling the bet.");
  }
};



module.exports = {
  createMatka,
  updateMatka,
  getMatkaList,
  getMatkaByMatkaEventId,
  matkaPlaceBet,
  matkaBetList,
  matkaGameTypeList,
  deleteMatkaBets,
  matkaBetCount,
  dayWiseMatkaReport,
  countMatkaBets,
  getProfitLossPosMatka,
  updateMatkaTypes,
  getResultPanelList,
  matkaReportByUser,
  matkaBetDelete,
  matkaBetCancel
};
