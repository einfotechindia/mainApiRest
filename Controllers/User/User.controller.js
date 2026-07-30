const {
  SendResponse,
  sendCasinoResponse,
} = require("../../Helpers/ResponseMapper");
const UserService = require("../../Services/User/User.service");
const {
  internationalCasinoLedgerForClientWise,
} = require("../../Services/Sports/Decision.service");
const {
  UpdateUserCoins,
  updateCoinsTbl,
  casinoReportByUser,
  userIntCasinoExpoLimit,
  insertInternationalTransactionLogCasino,
} = require("../../Helpers/TransactionHelper");
const { get, client } = require("../../Helpers/RedisHelper");
const {
  getShareDataByUserId,
  checkUserPassword,
  userCountDetails
} = require("../../Helpers/UsersUtils");
const {
  _dx,
  _d,
  onlyOwerPermit,
  whereHelper,
  casinoShareArray,
  _date,
  convertKeyObjectAndSeperateid,
  getInternationalGameData,
  getSettingData,
  getWebsiteDataByReq
} = require("../../Helpers/CommonHelper");
const { siteSetting, fetchUrl } = require("../../Common/Constants");
// const moment = require("moment");
const Joi = require("joi");
const { lte } = require("lodash");
const UserModel = require("../../Models/User/User.model");
const ShareModel = require("../../Models/User/Share.model");
const UserInternationExpoLimitModel = require("../../Models/User/UserInternationalExpoLimit.model");
const internationalCasinoList = require("../../Models/internationalCasinoList.model");
const InternationalCasinoBetsModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const crickTransactionLogModel = require("../../Models/crickTransaction.model");
const ActivityModel = require("../../Models/Activity.model");
const axios = require("axios");
const { json } = require("body-parser");
const { ObjectId } = require("mongodb");
const MlmChainListModel = require("../../Models/BtoC/mlmChainList.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const InternationalCasinoBlockModel = require("../../Models/Sports/internationalCasinoBlock.model");


module.exports = {
  userLogout: async (req, res) => {
    const loginData = req.loggedInUser;
    const userId = loginData?.userId;


    await UserModel.updateMany(
      { userId: new ObjectId(userId) },
      {
        jwtToken: "",
        authenticateToken: "",
      }
    );
    await client.del(userId + "");


    if (siteSetting.IS_SOCKET) {
      const { emitToUser } = require("../../socket");
      await emitToUser("userLoggedOut", { isLogout: true, userId: userId + "" }, userId);
    }

    return SendResponse(res, "success", "successfully Logout");
  },
  Details: async (req, res) => {
    try {
      await UserService.GetDetails(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_CREATE";
      return SendResponse(res, "error", msg);
    }
  },
  userBalance: async (req, res) => {
    try {
      await UserService.userBalance(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_BALANCE";
      SendResponse(res, "error", msg);
    }
  },
  userCasinoBalance: async (req, res) => {
    try {
      let userData = req.loggedInUser;
      const bodyData = req.body;
      if (!userData.status || userData.isDeleted) {
        return sendCasinoResponse(res, "block", 0);
      }
      if (!userData.casinoToken || bodyData.token != userData.casinoToken) {
        return sendCasinoResponse(res, "token_not_found", 0);
      }
      if (!userData.casinoStatus) {
        return sendCasinoResponse(res, "user_disable", 0);
      }

      const casinoMultipleTimesCoins = userData.intCasinoMultiply
        ? userData.intCasinoMultiply
        : siteSetting.casinoMultipleTimesCoins;
      let balance = Math.round(userData.coins / casinoMultipleTimesCoins);
      sendCasinoResponse(res, "success", balance);
    } catch (err) {
      console.log(err);
      return sendCasinoResponse(res, "error");
    }
  },
  qtechLoginUrl: async (req, res) => {
    try {
      const userData = req.loggedInUser;
      const bodyData = req.body;
      const JoiSchema = Joi.object({
        gameId: Joi.string().required(),
        redirectUrl: Joi.string().required(),
        platformId: Joi.string().required(),
      }).options({ abortEarly: false, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        const errorMessages = error.details.map((detail) => detail.message);
        return SendResponse(
          res,
          "error",
          "Failed In validation",
          errorMessages
        );
      }

      if (userData.userType != "client") {
        return SendResponse(
          res,
          "error",
          "Only client authorised to play casino"
        );
      }

      const user = await UserService.userDetailsByUserId(userData.userId, {
        coins: 1,
        casinoStatus: 1,
        status: 1,
        intCasinoStatus: 1,
        intCasinoMultiply: 1,
        userType: 1,
      });

      if (!user.status) {
        return SendResponse(res, "error", "user Inactive");
      }

      if (!user.intCasinoStatus) {
        return SendResponse(
          res,
          "error",
          "you are not authorized to play international casino please contact your admin "
        );
      }

      if (user.coins < 1) {
        return SendResponse(
          res,
          "error",
          "balance is low ! Please update balance"
        );
      }

      let casinoData = {};

      let casinoMultipleTimesCoins = user.intCasinoMultiply
        ? user.intCasinoMultiply
        : siteSetting.casinoMultipleTimesCoins;

      let payLoad = {
        userId: userData.userId,
        operatorId: process.env.OPERATOR_ID_QTECH,
        providerName: "internationalCasino",
        gameId: bodyData.gameId,
        platformId: bodyData.platformId,
        redirectUrl: bodyData.redirectUrl,
        username: userData.username,
        balance: Math.round(user.coins / casinoMultipleTimesCoins),
        currency: bodyData.currency ? bodyData.currency : "INR",
        isLobby: bodyData.isLobby,
        mode: bodyData.mode ? bodyData.mode : "demo",
        clientIp: bodyData.ip ? bodyData.ip : "127.0.0.1",
      };
      let hitUrl = process.env.LOGIN_URL_QTECH;
      try {
        let loginData = await axios.post(hitUrl, payLoad);
        if (loginData.data) {
          loginData = loginData.data;
          if (!loginData.error) {
            if (loginData.data.token) {
              await UserModel.updateOne(
                {
                  _id: loginData.data.userId,
                },
                {
                  casinoToken: loginData.data.token,
                }
              );
              return SendResponse(
                res,
                "success",
                "fetched successfully",
                loginData.data
              );
            }
          }
        }
      } catch (error) {
        console.log(error.code);
        return SendResponse(res, "error", error.code);
      }
      return SendResponse(res, "error", "something went wrong");
    } catch (err) {
      console.log(err);
      return sendCasinoResponse(res, "error");
    }
  },
  userCasinoLoginUrl: async (req, res) => {
    try {
      const userData = req.loggedInUser;
      const bodyData = req.body;
      const JoiSchema = Joi.object({
        gameId: Joi.string().required(),
        redirectUrl: Joi.string().required(),
        platformId: Joi.string().required(),
      }).options({ abortEarly: false, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        const errorMessages = error.details.map((detail) => detail.message);
        return SendResponse(
          res,
          "error",
          "Failed In validation",
          errorMessages
        );
      }

      if (userData.userType != "client") {
        return SendResponse(
          res,
          "error",
          "Only client authorized to play casino"
        );
      }

      let [casinoData, user, domainSetting] = await Promise.all([
        getInternationalGameData(bodyData.gameId),
        UserService.userDetailsByUserId(userData.userId, {
          coins: 1,
          casinoStatus: 1,
          status: 1,
          intCasinoStatus: 1,
          intCasinoMultiply: 1,
          subownerId: 1,
        }),
        getWebsiteDataByReq(req, true)
      ])

      let domainData = domainSetting?.domainData || {};
      let operatorId = domainData.operatorId && domainData.operatorId != null ? domainData.operatorId : process.env.OPERATOR_ID;

      if (!casinoData) {
        return SendResponse(
          res,
          "error",
          "gameId not found"
        );
      }

      
     if (casinoData.status !="ACTIVE") {
        return SendResponse(
          res,
          "error",
          `game (${casinoData.gameName} - ${casinoData.gameId} - ${casinoData.providerName}) is blocked by admin ` 
        ); 
     }
      
      if (!user.status) {
        return SendResponse(res, "error", "user Inactive");
      }

      if (user.coins < 1) {
        return SendResponse(
          res,
          "error",
          "balance is low ! Please update balance"
        );
      }

      const providerName = casinoData.providerName;
      const subProviderName = casinoData.subProviderName;

      let loginStatus = false;
      if (user.intCasinoStatus) {
        loginStatus = true;
      }

      if (!loginStatus) {
        return SendResponse(
          res,
          "error",
          `you are not authorised to play ${providerName} ! Please contac your agent`
        );
      }

      let blockMarketList = await client.get(`InternationalCasinoBlockmarket_${user.subownerId}`)

      if (!blockMarketList) {
        blockMarketList = await InternationalCasinoBlockModel.findOne({
          subownerId: new ObjectId(user.subownerId)
        })
        if (!blockMarketList) {
          blockMarketList = {}
        }
        await client.set(`InternationalCasinoBlockmarket_${user.subownerId}`, JSON.stringify(blockMarketList))
      } else {
        blockMarketList = JSON.parse(blockMarketList)
      }

      if (blockMarketList) {
        const { providerArray = [], subProviderArray = [] } = blockMarketList;
        const blockProviderList = Array.isArray(providerArray) ? providerArray : [];
        const blockSubProviderList = Array.isArray(subProviderArray) ? subProviderArray : [];
        const isProviderBlocked = providerName && blockProviderList.includes(providerName);
        const isSubProviderBlocked = subProviderName && blockSubProviderList.includes(subProviderName);
        if (isProviderBlocked || isSubProviderBlocked) {
          return SendResponse(
            res,
            "error",
            `You are not authorised to play ${providerName || subProviderName}! Please contact your agent.`
          );
        }
      }



      let casinoMultipleTimesCoins = user.intCasinoMultiply
        ? user.intCasinoMultiply
        : siteSetting.casinoMultipleTimesCoins;

      if (
        userData.intCasinoMultiply > casinoMultipleTimesCoins &&
        providerName != "diamond"
      ) {
        casinoMultipleTimesCoins = userData.intCasinoMultiply;
      }

      let payLoad = {
        gameId: bodyData.gameId,
        platformId: bodyData.platformId,
        redirectUrl: bodyData.redirectUrl,
        providerName: casinoData.providerName,
        operatorId: operatorId,
        userId: userData.userId,
        username: userData.username,
        balance: Math.round(user.coins / casinoMultipleTimesCoins),
        currency: bodyData.currency ? bodyData.currency : "INR",
      };

      const loginUrlData = await UserService.casinoLoginUrl(payLoad, userData, casinoData);
      await client.set(`${userData.userId}_providerType`, `${casinoData.providerName}`);

      return SendResponse(
        res,
        loginUrlData.status,
        loginUrlData.msg,
        loginUrlData.data
      );
    } catch (err) {
      console.log(err);
      return sendCasinoResponse(res, "error");
    }
  },
  userBetRequest: async (req, res) => {
    try {
      const userData = req.loggedInUser;
      const bodyData = req.body;
      const JoiSchema = Joi.object({
        debitAmount: Joi.number().required(),
        operatorId: Joi.string().required(),
        token: Joi.string().required(),
        userId: Joi.string().required(),
        reqId: Joi.string().required(),
        roundId: Joi.string().required(),
        transactionId: Joi.string().required(),
        gameId: Joi.string().required(),
      }).options({ abortEarly: true, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        return sendCasinoResponse(res, "invalid_param", 0);
      }
      if (!userData.status || userData.isDeleted) {
        return sendCasinoResponse(res, "block", 0);
      }

      if (!userData.betStatus) {
        return sendCasinoResponse(res, "block", 0);
      }

      if (!userData.intCasinoStatus) {
        if (!userData.casinoToken || bodyData.token != userData.casinoToken) {
          return sendCasinoResponse(res, "token_not_found", 0);
        }
        return sendCasinoResponse(res, "user_disable", 0);
      }

      if (bodyData.debitAmount < 0) {
        return sendCasinoResponse(res, "negative_debit_amount", 0);
      }

      let casinoMultipleTimesCoins = userData.intCasinoMultiply
        ? userData.intCasinoMultiply
        : siteSetting.casinoMultipleTimesCoins;

      const debitAmount = bodyData.debitAmount;

      const actualDebitAmount = Math.round(
        debitAmount * casinoMultipleTimesCoins
      );

      // let casinoData = await getInternationalGameData(bodyData.gameId)

      let [casinoData, settingData] = await Promise.all([
        getInternationalGameData(bodyData.gameId),
        getSettingData(),
      ]);


      if (settingData && settingData.maxIntCasinoBet && (Math.abs(actualDebitAmount) > settingData.maxIntCasinoBet)) {
        return sendCasinoResponse(res, "transaction_invalid", balance);
      }

      if (casinoData.status =="INACTIVE") {
        return sendCasinoResponse(res, "transaction_invalid", balance);   
      }
    
      


      let balance = Math.round(userData.coins);
      if (actualDebitAmount > balance) {
        return sendCasinoResponse(res, "no_balance", balance);
      }
      bodyData.debitAmount = debitAmount;
      bodyData.actualDebitAmount = actualDebitAmount;


      const betRequest = await UserService.casinoBetRequest(
        bodyData,
        userData,
        casinoData
      );

      if (betRequest.status == "error") {
        return sendCasinoResponse(res, betRequest.data, 0);
      }

      const betData = betRequest.data;

      let transactionLog = {
        amount: -1 * actualDebitAmount,
        forBet: 1,
        gameType: "internationalCasino",
        marketId: bodyData.gameId,
        eventId: bodyData.roundId,
        selectionId: bodyData.transactionId,
        overallType: "internationalCasino",
        remarks: betData.gameName,
        gameName: "internationalCasino",
      };

      let userShareData = await getShareDataByUserId(userData._id);
      if (userShareData.shareData && userShareData.status == "success") {
        userShareData = userShareData.shareData;
      }
      let shareData = await casinoShareArray(userShareData, userData);

      await insertInternationalTransactionLogCasino(
        userData,
        transactionLog,
        shareData
      );

      const updateCoins = await updateCoinsTbl(
        userData._id,
        userData.userType,
        userShareData
      );

      const actualSendCoins = Math.round(
        updateCoins.totalCoins / casinoMultipleTimesCoins
      );

      return sendCasinoResponse(res, "success", actualSendCoins);
    } catch (err) {
      console.log(err);
      return sendCasinoResponse(res, "error");
    }
  },
  userResultRequest: async (req, res) => {
    try {
      const userData = req.loggedInUser;
      const bodyData = req.body;
      const JoiSchema = Joi.object({
        creditAmount: Joi.number().required().min(0),
        operatorId: Joi.string().required(),
        token: Joi.string().required(),
        userId: Joi.string().required(),
        reqId: Joi.string().required(),
        roundId: Joi.string().required(),
        transactionId: Joi.string().required(),
        gameId: Joi.string().required(),
      }).options({ abortEarly: true, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        return sendCasinoResponse(res, "invalid_param", 0);
      }

      let casinoData = await getInternationalGameData(bodyData.gameId)
      let casinoMultipleTimesCoins = userData.intCasinoMultiply
        ? userData.intCasinoMultiply
        : siteSetting.casinoMultipleTimesCoins;
      const creditAmount = bodyData.creditAmount;
      let actualCreditAmount = Math.round(
        creditAmount * casinoMultipleTimesCoins
      );
      bodyData.actualCreditAmount = actualCreditAmount;

      const resultRequest = await UserService.casinoResultRequest(
        bodyData,
        userData,
        casinoData
      );

      if (resultRequest.status == "error") {
        return sendCasinoResponse(res, resultRequest.data, 0);
      }

      const resultData = resultRequest.data;


      let userShareData = await getShareDataByUserId(userData._id);
      if (userShareData.shareData && userShareData.status == "success") {
        userShareData = userShareData.shareData;
      }
      let shareData = await casinoShareArray(userShareData, userData);

      if (actualCreditAmount > 0) {
        let transactionLog = {
          amount: actualCreditAmount,
          forBet: 1,
          isDeclare: 1,
          gameType: "internationalCasino",
          marketId: bodyData.gameId,
          eventId: bodyData.roundId,
          selectionId: bodyData.transactionId,
          overallType: "internationalCasino",
          remarks: resultData.gameName,
          gameName: "internationalCasino",
        };
        await insertInternationalTransactionLogCasino(
          userData,
          transactionLog,
          shareData
        );
      }


      let crickInsertAmount = resultData.insertAmount ? resultData.insertAmount : 0
      let casinoRemark = `casino/${casinoData.subProviderName}/${casinoData.gameName}-(${_date()})`

      const crickPushTransactionLog = {
        eventName: `${casinoData.subProviderName}-${casinoData.gameName}-(${_date()})`,
        amount: crickInsertAmount,
        clientProfitLoss: actualCreditAmount,
        marketId: casinoData.gameId,
        eventId: casinoData.gameId,
        sportId: 1000000,
        seriesId: casinoData.gameId,
        gameName: "casino",
        transactionType: "profitLoss",
        gameType: casinoData.providerName,
        marketType: "internationalCasino",
        selectionId: bodyData.roundId,
        remarks: casinoRemark,
        userId: userData.userId,
        ownerId: userData.ownerId,
        subownerId: userData.subownerId,
        superadminId: userData.superadminId,
        adminId: userData.adminId,
        subadminId: userData.subadminId,
        masterId: userData.masterId,
        superagentId: userData.superagentId,
        agentId: userData.agentId,
        clientId: userData.clientId,
        transactionId: bodyData.transactionId,
        ownerLedgerAmount: crickInsertAmount * shareData.ownerParentCasinoShare,
        subownerLedgerAmount:
          crickInsertAmount * shareData.subownerParentCasinoShare,
        superadminLedgerAmount:
          crickInsertAmount * shareData.superadminParentCasinoShare,
        adminLedgerAmount: crickInsertAmount * shareData.adminParentCasinoShare,
        subadminLedgerAmount:
          crickInsertAmount * shareData.subadminParentCasinoShare,
        masterLedgerAmount:
          crickInsertAmount * shareData.masterParentCasinoShare,
        superagentLedgerAmount:
          crickInsertAmount * shareData.superagentParentCasinoShare,
        agentLedgerAmount: crickInsertAmount * shareData.agentParentCasinoShare,

        ownerProfitLoss:
          crickInsertAmount * shareData.ownerCasinoProfitLossShare,
        subownerProfitLoss:
          crickInsertAmount * shareData.subownerCasinoProfitLossShare,
        superadminProfitLoss:
          crickInsertAmount * shareData.superadminCasinoProfitLossShare,
        adminProfitLoss:
          crickInsertAmount * shareData.adminCasinoProfitLossShare,
        subadminProfitLoss:
          crickInsertAmount * shareData.subadminCasinoProfitLossShare,
        masterProfitLoss:
          crickInsertAmount * shareData.masterCasinoProfitLossShare,
        superagentProfitLoss:
          crickInsertAmount * shareData.superagentCasinoProfitLossShare,
        agentProfitLoss:
          crickInsertAmount * shareData.agentCasinoProfitLossShare,
        clientProfitLoss: crickInsertAmount,
      };

      await crickTransactionLogModel.create(crickPushTransactionLog)

      const whereObj = {
        marketId: bodyData.gameId,
        userId: new ObjectId(userData._id),
        eventId: bodyData.roundId,
        selectionId: bodyData.transactionId,
        forBet: 1,
      };
      const updateObj = {
        isDeclare: true,
      };

      await TransactionLogModel.updateMany(whereObj, updateObj);

      const updateCoins = await updateCoinsTbl(userData._id, userData.userType);
      const actualSendCoins = Math.round(
        updateCoins.totalCoins / casinoMultipleTimesCoins
      );
      return sendCasinoResponse(res, "success", actualSendCoins);
    } catch (err) {
      console.log(err);
      return sendCasinoResponse(res, "error");
    }
  },
  userRollbackRequest: async (req, res) => {
    const start = Date.now();
    try {
      const userData = req.loggedInUser;
      const bodyData = req.body || {};
      const JoiSchema = Joi.object({
        rollbackAmount: Joi.number().required(),
        operatorId: Joi.string().required(),
        token: Joi.string().required(),
        userId: Joi.string().required(),
        reqId: Joi.string().required(),
        roundId: Joi.string().required(),
        transactionId: Joi.string().required(),
        gameId: Joi.number().required(),
      }).options({ abortEarly: true, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        console.warn("Rollback validation failed:", error.details?.map(d => d.message));
        return sendCasinoResponse(res, "invalid_param", 0);
      }

      const gameId = Number(bodyData.gameId);
      let casinoData = await getInternationalGameData(bodyData.gameId)
      const casinoMultipleTimesCoins = userData.intCasinoMultiply ? userData.intCasinoMultiply : siteSetting.casinoMultipleTimesCoins

      const rollbackAmount = Number(bodyData.rollbackAmount);
      const actualRollbackAmount = Math.round(rollbackAmount * casinoMultipleTimesCoins);

      bodyData.actualRollbackAmount = actualRollbackAmount;

      const rollbackRequest = await UserService.casinoRollbackRequest(bodyData, userData, casinoData);

      if (!rollbackRequest || rollbackRequest.status === "error") {
        const errMsg = rollbackRequest?.data ?? "error";
        return sendCasinoResponse(res, errMsg, 0);
      }

      const resultData = rollbackRequest.data;

      const transactionLog = {
        amount: actualRollbackAmount,
        forBet: 1,
        isDeclare: 1,
        isRollback: 1,
        gameType: "internationalCasino",
        gameName: "internationalCasino",
        marketId: gameId,
        eventId: bodyData.roundId,
        selectionId: bodyData.transactionId,
        remarks: resultData?.gameName ?? "",
        overallType: "internationalCasino",
      };

      const [userShareResp] = await Promise.all([
        getShareDataByUserId(userData._id)
      ]);

      let userShareData = userShareResp;
      if (userShareResp && userShareResp.shareData && userShareResp.status === "success") {
        userShareData = userShareResp.shareData;
      }

      const casinoRemark = `casino/${casinoData?.subProviderName ?? "unknown"}/${casinoData?.gameName ?? "unknown"}-(${_date()})`;

      const shareData = await casinoShareArray(userShareData, userData);

      await insertInternationalTransactionLogCasino(userData, transactionLog, shareData);
      const updateObj = { isDeclare: true };

      const whereObj = {
        marketId: gameId + "",
        userId: userData._id,
        eventId: bodyData.roundId,
        selectionId: bodyData.transactionId,
        forBet: 1,
      };

      await TransactionLogModel.updateMany(whereObj, updateObj)

      let crickDeleteWhere = {
        marketId: casinoData?.gameId ?? gameId,
        eventId: casinoData?.gameId ?? gameId,
        userId: userData.userId,
        selectionId: bodyData.roundId,
        marketType: "internationalCasino",
      }

      const [actualOverallTransactionFromtransactionLog, updateCoins, crickDelete] = await Promise.all([
        TransactionLogModel.aggregate([
          { $match: whereObj },
          {
            $group: {
              _id: "$userId",
              totalCoins: { $sum: "$amount" },
            }
          }
        ]),
        updateCoinsTbl(userData._id, userData.userType),
        CrickTransactionLogModel.deleteMany(crickDeleteWhere),
      ]);



      const actualSendCoins = Math.round((updateCoins?.totalCoins ?? 0) / casinoMultipleTimesCoins);
      let actualRollbackAmountInsert = Number(resultData?.insertAmount ?? actualRollbackAmount);

      if (actualOverallTransactionFromtransactionLog[0]) {
        actualRollbackAmountInsert = actualOverallTransactionFromtransactionLog[0].totalCoins ? actualOverallTransactionFromtransactionLog[0].totalCoins : 0
      }


      const crickPushTransactionLog = {
        eventName: `${casinoData.subProviderName}-${casinoData.gameName}-(${_date()})`,
        amount: actualRollbackAmountInsert,
        clientProfitLoss: actualRollbackAmountInsert,
        marketId: casinoData?.gameId ?? gameId,
        eventId: casinoData?.gameId ?? gameId,
        sportId: 1000000,
        seriesId: casinoData?.gameId ?? gameId,
        gameName: "casino",
        transactionType: "profitLoss",
        gameType: casinoData?.providerName ?? "internationalCasino",
        marketType: "internationalCasino",
        selectionId: bodyData.roundId,
        remarks: casinoRemark,
        userId: userData.userId,
        ownerId: userData.ownerId,
        subownerId: userData.subownerId,
        superadminId: userData.superadminId,
        adminId: userData.adminId,
        subadminId: userData.subadminId,
        masterId: userData.masterId,
        superagentId: userData.superagentId,
        agentId: userData.agentId,
        clientId: userData.clientId,
        transactionId: bodyData.transactionId,

        ownerLedgerAmount: actualRollbackAmountInsert * (shareData.ownerParentCasinoShare ?? 0),
        subownerLedgerAmount: actualRollbackAmountInsert * (shareData.subownerParentCasinoShare ?? 0),
        superadminLedgerAmount: actualRollbackAmountInsert * (shareData.superadminParentCasinoShare ?? 0),
        adminLedgerAmount: actualRollbackAmountInsert * (shareData.adminParentCasinoShare ?? 0),
        subadminLedgerAmount: actualRollbackAmountInsert * (shareData.subadminParentCasinoShare ?? 0),
        masterLedgerAmount: actualRollbackAmountInsert * (shareData.masterParentCasinoShare ?? 0),
        superagentLedgerAmount: actualRollbackAmountInsert * (shareData.superagentParentCasinoShare ?? 0),
        agentLedgerAmount: actualRollbackAmountInsert * (shareData.agentParentCasinoShare ?? 0),

        ownerProfitLoss: actualRollbackAmountInsert * (shareData.ownerCasinoProfitLossShare ?? 0),
        subownerProfitLoss: actualRollbackAmountInsert * (shareData.subownerCasinoProfitLossShare ?? 0),
        superadminProfitLoss: actualRollbackAmountInsert * (shareData.superadminCasinoProfitLossShare ?? 0),
        adminProfitLoss: actualRollbackAmountInsert * (shareData.adminCasinoProfitLossShare ?? 0),
        subadminProfitLoss: actualRollbackAmountInsert * (shareData.subadminCasinoProfitLossShare ?? 0),
        masterProfitLoss: actualRollbackAmountInsert * (shareData.masterCasinoProfitLossShare ?? 0),
        superagentProfitLoss: actualRollbackAmountInsert * (shareData.superagentCasinoProfitLossShare ?? 0),
        agentProfitLoss: actualRollbackAmountInsert * (shareData.agentCasinoProfitLossShare ?? 0),
        clientProfitLoss: actualRollbackAmountInsert ? actualRollbackAmountInsert : 0,
        isRollback: true,
      };


      await crickTransactionLogModel.create(crickPushTransactionLog);

      const elapsed = Date.now() - start;
      if (elapsed > 500) {
        console.info(`userRollbackRequest took ${elapsed}ms for user ${userData._id}`);
      }

      return sendCasinoResponse(res, "success", actualSendCoins);
    } catch (err) {
      console.error("userRollbackRequest error:", err);
      return sendCasinoResponse(res, "error");
    }
  },
  Create: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginUserData = req.loggedInUser;
      const userRes = await UserService.UserCreate(bodyData, loginUserData);
      if (userRes.status != "Success") {
        return SendResponse(res, "error", userRes.message);
      }
      return SendResponse(res, "success", userRes.message, userRes.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_CREATE";
      return SendResponse(res, "error", msg);
    }
  },
  UserLoginCheck: async (req, res) => {
    try {
      await UserService.UserLoginCheck(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_LOGIN";
      return res.status(422).json(msg);
    }
  },
  Login: async (req, res) => {
    try {
      await UserService.UserLogin(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_LOGIN";
      return res.status(422).json(msg);
    }
  },
  userUpdate: async (req, res) => {
    try {
      let bodyData = req.body;
      let userId = bodyData.userId
      let isLoop = false
      if (Array.isArray(userId)) {
        isLoop = true
      }

      if (!isLoop) {
        await UserService.userUpdate(req, res);
      } else {
        let userIdArray = Array.isArray(userId) ? userId : [userId];
        await UserModel.updateMany(
          { userId: { $in: userIdArray } },
          {
            $set: {
              status: bodyData.status,
            }
          }
        );


        // for (let i = 0; i < userId.length; i++) {
        //   bodyData.userId = userId[i]
        //    await UserService.userUpdate(req, res);
        //    await client.del(userId[i]);
        // }

        const results = await Promise.allSettled(
          userId.map((id) => client.del(id))
        );

        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(`Failed to delete key: ${userId[index]}`, result.reason);
          }
        });

        return SendResponse(res, "success", "bulk User Updated Successfully");
      }
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return res.status(422).json(msg);
    }
  },
  updateTransactionPassword: async (req, res) => {
    try {
      await UserService.updateTransactionPassword(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return res.status(422).json(msg);
    }
  },
  updateUserPassword: async (req, res) => {
    try {
      await UserService.updateUserPassword(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", err);
    }
  },

  userList: async (req, res) => {
    try {
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };

      let resData = await UserService.getUserList(sendData);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  updateCoins: async (req, res) => {
    try {
      const bodyData = req.body;
      const coins = bodyData.coins;
      const userId = bodyData.userId; // update user userId
      const parentData = req.loggedInUser;
      let userRemark = bodyData.userRemark ? bodyData.userRemark : "";
      if (bodyData.remark) {
        userRemark = bodyData.remark;
      }
      let transactionPassword = bodyData.transactionPassword
        ? bodyData.transactionPassword
        : "";

      if (bodyData.password) {
        let checkPassword = await checkUserPassword(
          parentData.userId,
          bodyData.password
        );
        if (!checkPassword) {
          return SendResponse(res, "error", "password is incorrect");
        }
      }

      const updateData = await UpdateUserCoins(
        coins,
        userId,
        parentData,
        userRemark,
        transactionPassword
      );


      if (updateData.status) {
        return SendResponse(res, updateData.status, updateData.message);
      } else {
        return SendResponse(res, "error", updateData);
      }


    } catch (error) {
      console.log("Update Coins Error", error);
    }
  },

  verifyOtp: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      let redisUserData = await get(userData.userId);
      let returnData = "error";
      if (!redisUserData) {
        returnData = await UserService.verifyOtp(userData, data);
      }
      if (redisUserData) {
        redisUserData = JSON.parse(redisUserData);
        if (redisUserData.otp === data.otp) {
          returnData = "success";
        }
      }
      const msgData = { verifyOtpStatus: returnData };
      return SendResponse(res, returnData, "", msgData);
    } catch (error) {
      console.log("Verify Otp Error", error);
    }
  },

  getUserAccountDetails: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      returnData = await UserService.getUserAccountDetails(userData.userId);
      return SendResponse(
        res,
        returnData.status,
        returnData.message,
        returnData.data
      );
    } catch (error) {
      console.log("Account Details Error", error);
    }
  },

  shareDetails: async (req, res) => {
    try {
      const bodyData = req.body;
      const userId = bodyData.userId; // update user userId
      if (!userId) {
        SendResponse(res, "error", "userId is mandatory");
      }
      const parentData = req.loggedInUser;
      const sendShareData = await UserService.shareDetails(parentData, userId);
      SendResponse(
        res,
        sendShareData.status,
        sendShareData.message,
        sendShareData
      );
    } catch (error) {
      console.log("fetch share data details Error", error);
    }
  },

  userStatement: async (req, res) => {
    try {
      const bodyData = req.body;
      const userData = req.loggedInUser;
      returnData = await UserService.userStatement(userData, bodyData);
      SendResponse(res, returnData.status, returnData.message, returnData.data);
    } catch (error) {
      console.log("Statement Details Error", error);
    }
  },

  userActivity: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      const userId = data?.userId;
      returnData = await UserService.userActivity(userData, userId, data);
      SendResponse(res, returnData.status, returnData.message, returnData.data);
    } catch (error) {
      console.log("Activity Details Error", error);
    }
  },

  userLoginActivity: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      const userId = data?.userId;
      returnData = await UserService.userLoginActivity(userData, userId, data);
      SendResponse(res, returnData.status, returnData.message, returnData.data);
    } catch (error) {
      console.log("Activity Details Error", error);
    }
  },

  userLedger: async (req, res) => {
    try {
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };

      let resData = await UserService.userLedger(sendData);

      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },

  lenaDena: async (req, res) => {
    try {
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };
      let resData = await UserService.lenaDena(sendData);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },

  ledgerCreditDebit: async (req, res) => {
    try {
      let bodyData = req.body;
      const loggedInData = req.loggedInUser;
      const clientId = loggedInData.userId;
      const JoiSchema = Joi.object({
        downlineUserId: Joi.string().required(),
        date: Joi.string().required(),
        amount: Joi.number().required(),
      }).options({ abortEarly: true, allowUnknown: true });
      const { error } = JoiSchema.validate(bodyData);


      if (error) {
        const errorMessages = error.details.map((detail) => detail.message);
        return SendResponse(
          res,
          "error",
          "Failed In validation",
          errorMessages
        );
      }
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };

      let resData = await UserService.ledgerCreditDebit(sendData);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },

  createDomain: async (req, res) => {
    try {
      let bodyData = req.body;
      const loggedInData = req.loggedInUser;
      const JoiSchema = Joi.object({
        domainName: Joi.string().required(),
        domainUrl: Joi.string().required(),
      }).options({ abortEarly: false });
      const { error } = JoiSchema.validate(bodyData);
      if (error) {
        const errorMessages = error.details.map((detail) => detail.message);
        return SendResponse(
          res,
          "error",
          "Failed In validation",
          errorMessages
        );
      }
      const owner = await onlyOwerPermit(loggedInData);
      if (!owner) {
        return SendResponse(
          res,
          "error",
          "You Are Not Authorised To Insert Domain ! Only owner allowed to insert domain"
        );
      }
      let sendData = {
        data: req.body,
        userData: loggedInData,
      };
      let resData = await UserService.createDomain(sendData);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN WEBSITE CREATE";
      return SendResponse(res, "error", msg);
    }
  },
  domainList: async (req, res) => {
    const loggedInData = req.loggedInUser;
    try {
      const owner = await onlyOwerPermit(loggedInData);
      if (!owner) {
        return SendResponse(
          res,
          "error",
          "You Are Not Authorised List Domain ! Only owner allowed to List domain"
        );
      }
      let resData = await UserService.DomainList();
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN WEBSITE CREATE";
      return SendResponse(res, "error", msg);
    }
  },
  saveNotification: async (req, res) => {
    const loggedInData = req.loggedInUser;
    try {
      const owner = await onlyOwerPermit(loggedInData);
      if (!owner) {
        return SendResponse(
          res,
          "error",
          "You Are Not Authorised List Domain ! Only owner allowed to List domain"
        );
      }
      let resData = await UserService.saveNotification(req);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN WEBSITE CREATE";
      return SendResponse(res, "error", msg);
    }
  },

  notificationList: async (req, res) => {
    try {
      let resData = await UserService.notificationList(req.body);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN WEBSITE CREATE";
      return SendResponse(res, "error", msg);
    }
  },

  userParentShareDetails: async (req, res) => {
    const loggedInData = req.loggedInUser;
    try {
      let resData = await UserService.userParentShareDetails(
        loggedInData.userId
      );
      return SendResponse(
        res,
        "succcess",
        "shareData Fetch SUccessfully",
        resData
      );
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN SHARE DATA";
      return SendResponse(res, "error", msg);
    }
  },

  saveInternationalCasinoList: async (req, res) => {
    const loggedInData = req.loggedInUser;
    try {
      let hitUrl = `https://gap.intcasino.club/getGapCasinoList`
      let payLoad = {
        operatorId: process.env.OPERATOR_ID
      }
      const data = await axios.post(hitUrl, payLoad);
      if (data.data) {
        const casinoData = data.data.data;
        let insertArray = [];
        casinoData.map((data) => {
          const push = {
            gameId: data.gameId,
            gameName: data.gameName,
            gameCode: data.gameCode,
            providerName: data.providerName,
            subProviderName: data.subProviderName,
            imgUrl: data.urlThumb,
            isLobby: data.isLobby,
          };
          insertArray.push(push);
        });
        await internationalCasinoList.deleteMany();
        await internationalCasinoList.create(insertArray);
      }
      return SendResponse(
        res,
        "succcess",
        "International casino Fetch SUccessfully"
      );
    } catch (err) {
      var msg = err.message || "SOMETHING WENT WRONG iN SHARE DATA";
      return SendResponse(res, "error", msg);
    }
  },

  userLenaDenaByledger: async (req, res) => {
    const loggedInData = req.loggedInUser;
    const bodyData = req?.body;
    try {
      let resData = await UserService.userLenaDenaByledger(
        loggedInData,
        bodyData
      );
      return SendResponse(res, resData.status, resData.msg, resData.data);
    } catch (err) {
      var msg = err.message || "userLenaDenaByledger";
      return SendResponse(res, "error", "userLenaDenaByledger", msg);
    }
  },
  secureCode: async (req, res) => {
    const loggedInData = req.loggedInUser;
    const bodyData = req?.body;
    try {
      let resData = await UserService.secureCode(loggedInData, bodyData);
      return SendResponse(res, resData.status, resData.msg, resData.data);
    } catch (err) {
      var msg = err.message || "secure Code Error";
      return SendResponse(res, "error", "userLenaDenaByledger", msg);
    }
  },
  completeLedgerDetails: async (req, res) => {
    try {
      const loggedInData = req.loggedInUser;
      const bodyData = req?.body;
      const data = await UserService.completeLedgerDetails(
        bodyData,
        loggedInData
      );
      return SendResponse(res, "success", "data fetched successfully", data);
    } catch (e) {
      return SendResponse(res, "error", "error in completeLedgerDetails");
    }
  },
  exposureDataList: async (req, res) => {
    try {
      const loggedInData = req.loggedInUser;
      const bodyData = req?.body;
      const data = await UserService.exposureDataList(bodyData, loggedInData);
      return SendResponse(res, "success", "data fetched successfully", data);
    } catch (e) {
      return SendResponse(res, "error", "error in exposureDataList");
    }
  },
  casinoReportByUser: async (req, res) => {
    try {
      const loggedInData = req.loggedInUser;
      const bodyData = req?.body;
      bodyData.whereHelper = await whereHelper(loggedInData);
      const casinoData = await casinoReportByUser(bodyData, loggedInData);
      return SendResponse(
        res,
        "success",
        "data fetched successfully",
        casinoData
      );
    } catch (e) {
      return SendResponse(res, "error", "error in completeLedgerDetails");
    }
  },
  updateRateReffrenece: async (req, res) => {
    try {
      const loggedInData = req.loggedInUser;
      const bodyData = req?.body;
      let where = await whereHelper(loggedInData);

      if (loggedInData.userType != "client") {
        return SendResponse(
          res,
          "error",
          "rate can  be changed only for client"
        );
      }

      if (bodyData.rate < 0) {
        return SendResponse(res, "error", "rate can not be negative");
      }

      if (bodyData.rate > 5) {
        return SendResponse(res, "error", "rate can not be grather than 5 ");
      }
      const rateReffrenec = bodyData.rate / 100;
      const updateArray = {
        rateReffrenec: rateReffrenec,
      };

      if (siteSetting.IS_REDIS) {
        await client.set(`rateDiffrence_${loggedInData.userId}`, rateReffrenec);
      }

      await UserModel.updateOne(where, updateArray);
      return SendResponse(
        res,
        "success",
        "rate updated successfullly done",
        updateArray
      );
    } catch (e) {
      console.log(e);
      return SendResponse(res, "error", "error in updating rate diffrenece");
    }
  },
  updateBetChipsModal: async (req, res) => {
    try {
      const loggedInData = req.loggedInUser;
      const bodyData = req?.body;
      let where = await whereHelper(loggedInData);

      if (loggedInData.userType != "client") {
        return SendResponse(
          res,
          "error",
          "rate can  be changed only for client"
        );
      }

      const betChipsModal = bodyData.status;
      const updateArray = {
        betChipsModal: betChipsModal,
      };

      await UserModel.updateOne(where, updateArray);


      return SendResponse(
        res,
        "success",
        "bet chips status updates successfully",
        updateArray
      );
    } catch (e) {
      console.log(e);
      return SendResponse(res, "error", "error in updating rate diffrenece");
    }
  },

  deleteUserLedger: async (req, res) => {
    try {
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };
      let resData = await UserService.deleteUserLedger(sendData);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  userSportsSetting: async (req, res) => {
    try {
      let resData = await UserService.userSportsSetting(
        req.body,
        req.loggedInUser
      );
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  getUserSportsSetting: async (req, res) => {
    try {
      let resData = await UserService.getUserSportsSetting(
        req.body,
        req.loggedInUser
      );
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  userConfig: async (req, res) => {
    try {
      let resData = await UserService.userConfig(req.body, req.loggedInUser);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  getUserConfig: async (req, res) => {
    try {
      const bodyData = req.body;
      let whereObj = {
        userId: bodyData.userId,
      };
      let resData = await UserService.getUserConfig(whereObj);
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  userSearch: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;


      const searchValue = new RegExp(bodyData.searchValue, "i");
      let query = {
        $or: [
          { username: searchValue },
          { name: searchValue },
          { mobile: searchValue },
        ],
      };

      if (bodyData.userType) {
        query = {
          $and: [{ userType: bodyData.userType }, query],
        };
      }

      query.userType = {
        $ne: loginData.userType,
      };



      query = await whereHelper(loginData, query);

      let specific = {
        password: 0,
        isRent: 0,
        reffrence: 0,
        transactionPassword: 0,
        shareData: 0,
        allowedDomains: 0,
        userFlatSharePermission: 0,
        ownerId: 0,
        subownerId: 0,
        superAdminId: 0,
        adminId: 0,
        subAdminId: 0,
        masterId: 0,
        superAgentId: 0,
        agentId: 0,
        clientId: 0,
        selfCuttingPermission: 0,
        selfCuttingCoins: 0,
        isPasswordChanged: 0,
        downlineCreateLimit: 0,
        referral: 0,
        casinoToken: 0,
        jwtToken: 0,
        userFixLimit: 0,
      };

      if (bodyData.cashTransaction) {
        specific = {
          username: 1,
          name: 1,
          userId: 1,
          userPriority: 1,
          userType: 1,
        };
      }


      if (bodyData.specific) {
        specific = bodyData.specific;
      }

      let resData = await UserModel.find(query, specific);


      if (bodyData.isReffrelCount && bodyData.isReffrelCount == true && bodyData.userType == "client") {

        let userIdArray = [];
        resData.map((user) => {
          userIdArray.push(user.userId);
        });

        let reffrelUserCountRes = await MlmChainListModel.aggregate([
          { $match: { firstLayerId: { $in: userIdArray } } },
          { $group: { _id: "$firstLayerId", count: { $sum: 1 } } },
          { $project: { _id: 0, userId: "$_id", count: 1 } }
        ]);

        if (reffrelUserCountRes.length > 0) {

          reffrelUserCountRes = convertKeyObjectAndSeperateid(reffrelUserCountRes, "userId");
          reffrelUserCountRes = JSON.parse(JSON.stringify(reffrelUserCountRes.returnDataObject));
          resData = JSON.parse(JSON.stringify(resData));
          resData.map((user, key) => {
            if (reffrelUserCountRes[user.userId]) {
              resData[key].reffrelCount = reffrelUserCountRes[user.userId].count;
            }
          });
        }

      }





      return SendResponse(res, "success", "", resData);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_SEARCH";
      return SendResponse(res, "error", msg);
    }
  },
  userSuggestion: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      const searchValue = bodyData.searchValue;
      let query = {
        $or: [
          { username: { $regex: searchValue, $options: "i" } },
          { name: { $regex: searchValue, $options: "i" } },
        ],
      };
      query = await whereHelper(loginData, query);
      let specific = {
        userId: 1,
        name: 1,
        username: 1,
      };
      let resData = await UserModel.find(query, specific).limit(10);
      return SendResponse(res, "success", "", resData);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_SEARCH";
      return SendResponse(res, "error", msg);
    }
  },
  userExpoLimitList: async (req, res) => {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    let sort = {};
    if (bodyData.sortData) {
      sort = {
        _id: -1,
      };
    }
    let query = await whereHelper(loginData);
    if (bodyData.downlineUserId) {
      query.userId = bodyData.downlineUserId;
    }
    const expoData = await UserInternationExpoLimitModel.find(
      query,
      {
        userId: 1,
        amount: 1,
        userType: 1,
        doneBy: 1,
        remark: 1,
        createdAt: 1,
      },
      {
        sort: sort,
      }
    );
    return SendResponse(res, "success", "list fetched successfully", expoData);
  },

  userExpoLimitCreditDebit: async (req, res) => {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    if (!bodyData.amount) {
      return SendResponse(res, "error", "amount is required");
    }
    if (!bodyData.downlineUserId) {
      return SendResponse(res, "error", "downlineUserId is required");
    }
    const userId = bodyData.downlineUserId;
    const amount = bodyData.amount;
    const userExpoMsg = await userIntCasinoExpoLimit(amount, userId);
    return SendResponse(
      res,
      userExpoMsg.status,
      userExpoMsg.message,
      userExpoMsg.data
    );
  },

  getUserShareData: async (req, res) => {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    let status = "success";
    let msg = "data found";
    let where = {};
    if (bodyData.userId) {
      where = { userId: bodyData.userId };
    }
    where = await whereHelper(loginData, where);
    let specific = {};
    let userType = bodyData.userType;
    let userShareData = await ShareModel.findOne(where, specific);
    if (!userShareData) {
      status = "error";
      msg = "user share data not found";
    }
    return SendResponse(res, status, msg, userShareData);
  },

  clientBetListByMarketId: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      if (loginData.userType != "client") {
        return SendResponse(
          res,
          "error",
          "only client authorized to fetch this",
          []
        );
      }

      if (!bodyData.marketId) {
        return SendResponse(res, "error", "marketId Is required");
      }
      let whereObj = {
        marketId: bodyData.marketId,
      };

      whereObj = await whereHelper(loginData, whereObj);
      let clientData = await UserService.clientBetList(whereObj);

      return SendResponse(
        res,
        clientData.status,
        clientData.message,
        clientData.data
      );
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_CLIENT_BET_LIST";
      return SendResponse(res, "error", msg);
    }
  },
  declareInternationalExposure: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      let betId = bodyData.betId;

      if (loginData.userType != "owner") {
        return SendResponse(
          res,
          "error",
          "only client to authorized fetch this",
          []
        );
      }

      let betData = await InternationalCasinoBetsModel.findOne({
        _id: new ObjectId(betId),
      });

      if (!betData) {
        return SendResponse(res, "error", "bet data not found");
      }

      let sendBodyData = {
        creditAmount: 0,
        operatorId: process.env.OPERATOR_ID,
        token: betData.token,
        gameId: betData.gameId,
        userId: betData.clientId,
        reqId: betData.reqId,
        roundId: betData.roundId,
        transactionId: betData.transactionId,
        betType: "",
      };

      req.body = sendBodyData;

      let response = await userResultRequest(req, res);

      return SendResponse(
        res,
        clientData.status,
        clientData.message,
        clientData.data
      );
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_CLIENT_BET_LIST";
      return SendResponse(res, "error", msg);
    }
  },

  updateMatkaLimit: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      let userId = bodyData.userId;
      let where = await whereHelper(loginData, { _id: new ObjectId(userId) });
      let userDetails = await UserModel.findOne(where);
      if (!userDetails) {
        return SendResponse(
          res,
          "error",
          "you are not authorized to update matka limit of this user"
        );
      }

      let creatorId = userDetails.creatorId;

      let creatorDetails = await UserModel.findOne({
        _id: new ObjectId(creatorId),
      });

      let updateMatkaLimit = bodyData.limit;

      let userMatkaLimitPrevious = userDetails?.matkaLimitPerNumber;

      let creatorMatkaLimit = creatorDetails?.matkaLimitPerNumber;

      if (updateMatkaLimit > 0 && updateMatkaLimit > creatorMatkaLimit) {
        return SendResponse(res, "error", "invalid matka limit");
      }

      let newUpdateMatkaLimit = userMatkaLimitPrevious + updateMatkaLimit;

      if (newUpdateMatkaLimit < 0) {
        return SendResponse(
          res,
          "error",
          "matka limit can not be less then zero"
        );
      }

      await UserModel.updateOne(
        {
          _id: userDetails._id,
        },
        {
          $set: {
            matkaLimitPerNumber: newUpdateMatkaLimit,
          },
        }
      );

      let insertLoginActivity = {
        username: userDetails.username,
        userType: userDetails.userType,
        userId: userDetails.userId,
        creatorId: userDetails.creatorId,
        remark: `Matka limit change from ${userMatkaLimitPrevious} to ${newUpdateMatkaLimit}`,
        activityType: "matkaLimitUpdate",
      };

      await ActivityModel.create(insertLoginActivity);

      let newCreatorMatkaLimit =
        updateMatkaLimit > 0
          ? creatorMatkaLimit - updateMatkaLimit
          : creatorMatkaLimit + updateMatkaLimit;

      await UserModel.updateOne(
        {
          _id: creatorId._id,
        },
        {
          $set: {
            matkaLimitPerNumber: newCreatorMatkaLimit,
          },
        }
      );

      let insertLoginActivityCreatorId = {
        username: creatorDetails.username,
        userType: creatorDetails.userType,
        userId: creatorDetails.userId,
        creatorId: creatorDetails.creatorId,
        remark: `Matka limit change from ${creatorDetails.matkaLimitPerNumber} to ${newCreatorMatkaLimit}`,
        activityType: "matkaLimitUpdate",
      };

      await ActivityModel.create(insertLoginActivityCreatorId);

      return SendResponse(res, "success", "matka limit updated successfully");
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_MATKA_LIMIT_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  updateOneClickBet: async (req, res) => {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    if (loginData.userType != "client") {
      return SendResponse(
        res,
        "error",
        "only client authorized to update this"
      );
    }

    let updateData = {
      isOneClickBet: bodyData?.isOneClickBet,
      oneClickBetAmount: bodyData?.oneClickBetAmount,
    };

    await UserModel.updateOne(
      {
        _id: new ObjectId(loginData.userId),
      },

      {
        $set: updateData,
      }
    );

    return SendResponse(res, "success", "one click bet updated successfully");
  },
  updateBulkStatus: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      if (!bodyData.userIdArray || bodyData.userIdArray.length < 1) {
        return SendResponse(
          res,
          "error",
          "user id array ir required or not empty"
        );
      }
      let userIdArray = bodyData?.userIdArray;

      let passwordCheck = await checkUserPassword(
        loginData.userId,
        bodyData?.password
      );

      if (!passwordCheck) {
        return SendResponse(res, "error", "password is not correct");
      }

      let statusUpdate = bodyData.hasOwnProperty("statusUpdate");
      let betStatusUpdate = bodyData.hasOwnProperty("betStatusUpdate");

      let updateStatus = {};

      if (statusUpdate) {
        updateStatus.status = bodyData.statusUpdate ? 1 : 0;
      }

      if (betStatusUpdate) {
        updateStatus.betStatus = bodyData.betStatusUpdate;
      }

      let whereObj = await whereHelper(loginData, {
        userId: { $in: userIdArray },
      });

      await UserModel.updateMany(whereObj, updateStatus);

      let downLineUserData = await UserModel.find(whereObj, {
        userType: 1,
        userId: 1,
        status: 1,
        betStatus: 1,
        casinoStatus: 1,
        intCasinoStatus: 1,
        matkaStatus: 1,
        username: 1
      })

      downLineUserData && downLineUserData.map(async (downlineData) => {
        let userWhere = { [`${downlineData.userType}Id`]: new ObjectId(`${downlineData.userId}`) };
        await UserModel.updateMany(
          userWhere,
          { $set: updateStatus }
        );
        await client.del(downlineData.userId + "")
      });

      await client.del(loginData.userId + "")

      return SendResponse(
        res,
        "success",
        "status has been updated successfully"
      );
    } catch (e) {
      console.log(e.message);
    }
  },
getBetInfoyTransactionId: async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId?.trim()) {
      return SendResponse(
        res,
        "error",
        "transactionId is required and cannot be empty"
      );
    }
    
    const payload = {
      transactionId: transactionId.trim(),
      operatorId: process.env.OPERATOR_ID,
    };

    const urls = [
      process.env.BET_INFO_INTERNATIONAL_LKR,
      process.env.BET_INFO_INTERNATIONAL_INR,
    ];

    const responses = await Promise.allSettled(
      urls.map((url) => axios.post(url, payload))
    );

    const successfulResponse = responses.find(
      (response) =>
        response.status === "fulfilled" &&
        response.value?.data
    );

    const returnData = successfulResponse?.value?.data || {};

    return SendResponse(
      res,
      "success",
      "Return data get successfully",
      returnData
    );
  } catch (error) {
    console.error("Error in getBetInfoyTransactionId:", error);

    return SendResponse(
      res,
      "error",
      error.message || "Something went wrong"
    );
  }
},
  downlineCount: async (req, res) => {
    try {
      const bodyData = req.body;
      const loginData = req.loggedInUser;
      let userType = loginData.userType
      let userId = loginData.userId
      if (bodyData.userId && bodyData.userType) {
        userType = bodyData.userType
        userId = bodyData.userId
      }
      let returnData = await userCountDetails(userType, userId)
      return SendResponse(
        res,
        "success",
        "Data fetch successfully",
        returnData
      );
    } catch (e) {
      console.log(e.message);
    }
  },
  downlineCountAndLimit: async (req, res) => {
    try {
      let returnData = await UserService.downlineCountAndLimit(req)
      return SendResponse(
        res,
        "success",
        "Data fetch successfully",
        returnData
      );
    } catch (e) {
      console.log(e.message);
    }
  },
};
