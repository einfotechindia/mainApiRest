const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const {
  updateCoinsTbl,
  insertTransactionLog,
  updateUserCoins,
  getSessionPositionByTransaction,
  GetUserCoinsByMarketId,
  getOddsPositionByMarketId,
} = require("../../Helpers/TransactionHelper");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
var requestIp = require("request-ip");
const Joi = require("joi");
const CasinoService = require("../../Services/DiamondCasino/DiamondCasino.service");
const {
  siteSetting,
  StatementMsg,
  casinoFetchUrl,
} = require("../../Common/Constants");
const {
  _dx,
  whereHelper,
  _d,
  mongoToJson,
  convertKeyObject,
  parentDataAppend,
} = require("../../Helpers/CommonHelper");

const axios = require("axios");
axios.defaults.timeout = siteSetting.axiosTimeOut;

const casinoBetPlace = async (req, res) => {
  let bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const JoiSchema = Joi.object({
    selectionId: Joi.string().required(),
    casinoType: Joi.string().required(),
    mid: Joi.number().required(),
    data: Joi.any(),
    odds: Joi.number().required(),
    amount: Joi.number().required(),
  }).options({ abortEarly: false });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  if (!typeof bodyData.data === "object") {
    return SendResponse(
      res,
      "error",
      "Failed In validation",
      "Please Send Valid Object In Data"
    );
  }
  const clientIp = requestIp.getClientIp(req);
  const checkData = bodyData.data;

  const casinoType = bodyData.casinoType;
  const betAmount = bodyData.amount;
  try {
    if (loggedUserData.userType !== "client") {
      return SendResponse(res, "error", "Only client Authorised to place bet");
    }
    const checkCasinoData = await CasinoService.checkCasinoLiveData(
      checkData,
      casinoType
    );
    const oddsData = checkCasinoData.data;
    if (checkCasinoData.status != "success") {
      return SendResponse(res, "error", checkCasinoData.msg);
    }
    const mid = checkData.mid;
    const sid = checkData.sid;
    const nation = checkData.nation;

    const checkUserData = await CasinoService.checkUser(loggedUserData.userId);
    if (checkUserData.status != "success") {
      return SendResponse(res, "error", checkUserData?.message);
    }
    const userData = checkUserData.data;
    const userLatestCoins = userData.coins;
    let previousBets = await casinoBetModel
      .find({
        clientId: userId,
        casinoType: casinoType,
        mid: mid,
      })
      .select(
        "amount , userId , clientId , sid , mid , casinoType , playerName"
      );

    let insertBet = {
      userId: userId,
      mid: mid,
      amount: betAmount,
      sid: sid,
      casinoType: casinoType,
      playerName: nation,
      ip: clientIp,
    };

    insertBet = await parentDataAppend(userData, insertBet);
    let deductAmount = betAmount;
    let checkAmount = betAmount;
    let = finalMinAmount = 0;
    let previousMinAmount = 0;
    let userCheckAmount = userLatestCoins;
    if (previousBets.length > 0) {
      let previousTeenPosition = await CasinoService.teen20Position(
        previousBets,
        oddsData
      );
      previousMinAmount = Math.min(...previousTeenPosition.selectionIdArray);
      previousBets.push(insertBet);
      let teenPosition = await CasinoService.teen20Position(
        previousBets,
        oddsData
      );
      deductAmount = checkAmount = Math.abs(
        Math.min(...teenPosition.selectionIdArray)
      );
      userCheckAmount = userLatestCoins + Math.abs(previousMinAmount);
    }
    if (checkAmount > userCheckAmount) {
      return SendResponse(res, "error", `Invalid Amount`);
    }
    await casinoBetModel.create(insertBet);
    await TransactionLogModel.deleteOne({
      userId: userId,
      marketId: mid,
      gameType: "casino",
      gameName: casinoType,
      userType: "client",
    });
    let logData = {
      gameType: "casino",
      gameName: casinoType,
      userType: "client",
      userId: userId,
      marketId: mid,
      amount: -1 * deductAmount,
    };
    await insertTransactionLog(userData, logData);
    const updateCoins = await updateCoinsTbl(userId, userData.userType);
    return SendResponse(
      res,
      "success",
      `Casino Bet Successfully Placed For ${casinoType}`,
      updateCoins
    );
  } catch (error) {
    console.log("Something Went Wrong In Odds Bet Place casinoBetPlaceeeeee", error);
    return SendResponse(
      res,
      "error",
      `Something Went Wrong In Casino Bet Place For casinoBetPlace ${casinoType}`,
      error
    );
  }
};

module.exports = {
  casinoBetPlace,
};
