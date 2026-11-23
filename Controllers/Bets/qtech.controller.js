const {
  SendResponse,
  sendCasinoResponse,
} = require("../../Helpers/ResponseMapper");
const UserService = require("../../Services/User/User.service");
const {
  insertTransactionLogCasino,
  updateCoinsTbl,
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const { _dx, _d } = require("../../Helpers/CommonHelper");
const { siteSetting } = require("../../Common/Constants");
const Joi = require("joi");
const ShareModel = require("../../Models/User/Share.model");
const UserModel = require("../../Models/User/User.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const qtechGamesModel = require("../../Models/qtech.model");
const axios = require("axios");
const { ObjectId } = require("mongodb");
const InternationalCasinoBetsModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const { InsertUserStatement } = require("../../Helpers/StatementHelper");

const getQtechCasinoDetail = async (gameId) => {
  let qtechGameList = await client.hget(`qtechGameList`, gameId);
  if (!qtechGameList || qtechGameList == null || qtechGameList.length < 5) {
    qtechGameList = await qtechGamesModel.findOne(
      {
        gameId: gameId,
      },
      {
        freeRoundSupport: 1,
        demoSupport: 1,
        gameId: 1,
        name: 1,
        providerName: 1,
        subCategory: 1,
        providerId: 1,
      }
    );
    if (siteSetting.IS_REDIS) {
      await client.hmset(
        `qtechGameList`,
        gameId,
        JSON.stringify(qtechGameList)
      );
    }
  } else {
    qtechGameList = JSON.parse(qtechGameList);
  }
  return qtechGameList;
};

const qtechLoginUrl = async (req, res) => {
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
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    if (userData.userType != "client") {
      return SendResponse(
        res,
        "error",
        "Only client authorised to play casino"
      );
    }

    let user = await UserModel.findOne(
      {
        _id: new ObjectId(userData.userId),
      },
      {
        coins: 1,
        casinoStatus: 1,
        status: 1,
        intCasinoStatus: 1,
        intCasinoMultiply: 1,
        userType: 1,
      }
    );

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
};

const qtechBalance = async (req, res) => {
  try {
    const bodyData = req.body;
    if (!bodyData.userId) {
      return sendCasinoResponse(res, "invalid_param", 0);
    }
    let userId = bodyData.userId;
    let user = await client.hgetall(userId);
    let balance = 0;

    if (user && user.status != null && user.isDeleted != null) {
    } else {
      user = await UserModel.findOne({
        _id: new ObjectId(userId),
        status: 1,
        isDeleted: false,
      });

      if (siteSetting.IS_REDIS) {
        UserService.setUserRedisData(userId, user);
      }
    }

    let casinoToken = user.casinoToken;

    //_d(casinoToken);

    // if (casinoToken != bodyData.token) {
    //   return sendCasinoResponse(res, "token_not_found", 0);
    // }

    balance = user.coins;
    if (user.status == 0) {
      return sendCasinoResponse(res, "block", 0);
    }

    const casinoMultipleTimesCoins = user.intCasinoMultiply
      ? user.intCasinoMultiply
      : siteSetting.casinoMultipleTimesCoins;

    balance = Math.round(balance / casinoMultipleTimesCoins);
    sendCasinoResponse(res, "success", balance);
  } catch (err) {
    console.log(err);
    return sendCasinoResponse(res, "error");
  }
};

const qtechTransaction = async (req, res) => {
  try {
    const bodyData = req.body;
    const JoiSchema = Joi.object({
      txnId: Joi.string().required(),
      txnType: Joi.string().required(),
      roundId: Joi.string().required(),
      amount: Joi.number().required(),
      completed: Joi.string().required(),
      clientRoundId: Joi.string().required(),
      operatorId: Joi.string().required(),
      gameId: Joi.string().required(),
      userId: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });

    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      return sendCasinoResponse(res, "invalid_param", 0);
    }

    let {
      amount,
      txnType,
      gameId,
      clientRoundId,
      roundId,
      txnId,
      completed,
      userId,
    } = bodyData;

    if (amount < 0) {
      return sendCasinoResponse(res, "negative_debit_amount", 0);
    }

    let user = await UserModel.findOne(
      {
        _id: userId,
      },
      {
        coins: 1,
        name: 1,
        username: 1,
        userType: 1,
        userId: 1,
        isDeleted: 1,
        status: 1,
        casinoToken: 1,
        exposure: 1,
        clientId: 1,
        agentId: 1,
        superagentId: 1,
        masterId: 1,
        subadminId: 1,
        adminId: 1,
        superadminId: 1,
        subownerId: 1,
        ownerId: 1,
        intCasinoMultiply: 1,
        intCasinoStatus: 1,
        creatorId: 1,
        betStatus: 1,
      }
    );

    let casinoMultipleTimesCoins = user.intCasinoMultiply
      ? user.intCasinoMultiply
      : siteSetting.casinoMultipleTimesCoins;
    let transactionAmount = casinoMultipleTimesCoins * amount;

    if (txnType == "DEBIT") {
      let qtechGameData = await getQtechCasinoDetail(gameId);
      if (!qtechGameData) {
        return sendCasinoResponse(res, "game Id not found", 0);
      }
      if (!user.status || user.isDeleted) {
        return sendCasinoResponse(res, "block", 0);
      }

      if (!user.betStatus) {
        return sendCasinoResponse(res, "block", 0);
      }

      if (!user.intCasinoStatus) {
        return sendCasinoResponse(res, "block", 0);
      }

      let betData = {
        gameId: gameId,
        gameCode: qtechGameData.providerId,
        gameName: qtechGameData.name,
        providerName: qtechGameData.providerName,
        subProviderName: qtechGameData.subCategory,
        amount: transactionAmount,
        actualBetAmount: amount,
        txnType: txnType,
        debitAmount: transactionAmount,
        roundId: clientRoundId, // same in credit Transaction Also
        reqId: roundId, // same in credit Transaction Also
        transactionId: txnId, // diiferent in every request
        clientId: user.userId,
        isDeclare: completed,
        agentId: user.agentId,
        superagentId: user.superagentId,
        masterId: user.masterId,
        subownerId: user.subownerId,
        subadminId: user.subadminId,
        adminId: user.adminId,
        superadminId: user.superadminId,
        ownerId: user.ownerId,
      };
      const existBet = await InternationalCasinoBetsModel.countDocuments(
        betData
      );

      if (existBet >= 1) {
        return sendCasinoResponse(res, "duplicate_transaction", 0);
      }

      await InternationalCasinoBetsModel.create(betData);
      let transactionLog = {
        amount: -1 * transactionAmount,
        forBet: 1,
        gameType: "internationalCasino",
        marketId: gameId,
        eventId: roundId,
        selectionId: txnId,
        overallType: "internationalCasino",
        remarks: qtechGameData.name,
        gameName: `${qtechGameData.name} - ${qtechGameData.providerName}`,
      };

      const userShareData = await ShareModel.findOne({
        userId: user._id,
      });

      await insertTransactionLogCasino(user, transactionLog, userShareData);
      const updateCoins = await updateCoinsTbl(
        user._id,
        user.userType,
        userShareData
      );

      const actualSendCoins = Math.round(
        updateCoins.totalCoins / casinoMultipleTimesCoins
      );
      return sendCasinoResponse(res, "success", actualSendCoins);
    } else if (txnType == "CREDIT") {
      let betDataObj = {
        gameId: gameId,
        transactionId: bodyData.betId,
        roundId: clientRoundId, // same in debit Transaction Also
        reqId: roundId, // same in debit Transaction Also
        clientId: user.userId,
      };
      let existBet = await InternationalCasinoBetsModel.find(betDataObj);

      if (existBet.length < 1) {
        return sendCasinoResponse(res, "transaction_not_exist", 0);
      }

      let betData = existBet[0];

      if (betData.isDeclare) {
        return sendCasinoResponse(res, "duplicate_transaction", 0);
      }

      if (betData.isRollback) {
        return sendCasinoResponse(res, "transaction_invalid", 0);
      }

      let statementDataCreator = {
        amount: transactionAmount,
        statementFor: "internationalCasino",
        gameType: `${betData.gameName} (${betData.subProviderName})`,
        userRemark: `CasinoBet Result For ${betData.gameName}(${betData.subProviderName}) In RoundId (${roundId}) With Transaction Id (${txnId})`,
        remark: `${betData.gameName}(${betData.subProviderName}) In RoundId (${roundId})`,
        marketId: roundId,
        selectionId: clientRoundId,
        eventId: gameId,
      };

      const instCasino = await InsertUserStatement(statementDataCreator, user);

      let updateObjBet = {
        isDeclare: 1,
        creditAmount: transactionAmount,
      };

      const updateBet = await InternationalCasinoBetsModel.updateMany(
        betDataObj,
        updateObjBet
      );

      if (transactionAmount > 0) {
        const userShareData = await ShareModel.findOne({
          userId: user._id,
        });
        let transactionLog = {
          amount: transactionAmount,
          forBet: 1,
          isDeclare: 1,
          gameType: "internationalCasino",
          marketId: gameId,
          eventId: roundId,
          selectionId: txnId,
          overallType: "internationalCasino",
          remarks: betData.gameName,
          gameName: `${betData.gameName} - ${betData.providerName}`,
        };
        await insertTransactionLogCasino(user, transactionLog, userShareData);
      } else {
      }

      const whereObj = {
        marketId: gameId,
        userId: new ObjectId(user._id),
        eventId: roundId,
        forBet: 1,
      };

      const updateObj = {
        isDeclare: true,
      };
      await TransactionLogModel.updateMany(whereObj, updateObj);

      await updateCoinsTbl(user._id, user.userType);
      const actualSendCoins = Math.round(
        transactionAmount / casinoMultipleTimesCoins
      );

      return sendCasinoResponse(res, "success", actualSendCoins);
    }
  } catch (error) {}
};

const qtechRollback = async (req, res) => {
  try {
    const bodyData = req.body;
    const JoiSchema = Joi.object({
      txnId: Joi.string().required(),
      txnType: Joi.string().required(),
      roundId: Joi.string().required(),
      amount: Joi.number().required(),
      completed: Joi.string().required(),
      clientRoundId: Joi.string().required(),
      operatorId: Joi.string().required(),
      gameId: Joi.string().required(),
      userId: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });

    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      return sendCasinoResponse(res, "invalid_param", 0);
    }

    let {
      amount,
      txnType,
      gameId,
      clientRoundId,
      roundId,
      txnId,
      completed,
      userId,
    } = bodyData;

    if (amount < 0) {
      return sendCasinoResponse(res, "negative_debit_amount", 0);
    }

    let user = await UserModel.findOne(
      {
        _id: userId,
      },
      {
        coins: 1,
        name: 1,
        username: 1,
        userType: 1,
        userId: 1,
        isDeleted: 1,
        status: 1,
        casinoToken: 1,
        exposure: 1,
        clientId: 1,
        agentId: 1,
        superagentId: 1,
        masterId: 1,
        subadminId: 1,
        adminId: 1,
        superadminId: 1,
        subownerId: 1,
        ownerId: 1,
        intCasinoMultiply: 1,
        intCasinoStatus: 1,
        creatorId: 1,
        betStatus: 1,
      }
    );

    let casinoMultipleTimesCoins = user.intCasinoMultiply
      ? user.intCasinoMultiply
      : siteSetting.casinoMultipleTimesCoins;
    let transactionAmount = casinoMultipleTimesCoins * amount;

    let betDataObj = {
      gameId: gameId,
      transactionId: bodyData.betId,
      roundId: clientRoundId, // same in debit Transaction Also
      reqId: roundId, // same in debit Transaction Also
      clientId: user.userId,
    };
    let existBet = await InternationalCasinoBetsModel.find(betDataObj);

    if (existBet.length < 1) {
      return sendCasinoResponse(res, "transaction_not_exist", 0);
    }

    let betData = existBet[0];

    if (betData.isRollback) {
      return sendCasinoResponse(res, "transaction_invalid", 0);
    }

    let statementDataCreator = {
      amount: transactionAmount,
      statementFor: "internationalCasino",
      gameType: `${betData.gameName} (${betData.subProviderName})`,
      userRemark: `CasinoBet Result For ${betData.gameName}(${betData.subProviderName}) In RoundId (${roundId}) With Transaction Id (${txnId})`,
      remark: `${betData.gameName}(${betData.subProviderName}) In RoundId (${roundId})`,
      marketId: roundId,
      selectionId: clientRoundId,
      eventId: gameId,
    };

    const instCasino = await InsertUserStatement(statementDataCreator, user);

    let updateObjBet = {
      isDeclare: 1,
      rollbackAmount: transactionAmount,
    };

    const updateBet = await InternationalCasinoBetsModel.updateMany(
      betDataObj,
      updateObjBet
    );

    const userShareData = await ShareModel.findOne({
      userId: user._id,
    });
    let transactionLog = {
      amount: transactionAmount,
      forBet: 1,
      isDeclare: 1,
      gameType: "internationalCasino",
      marketId: gameId,
      eventId: roundId,
      selectionId: txnId,
      overallType: "internationalCasino",
      remarks: betData.gameName,
      gameName: `${betData.gameName} - ${betData.providerName}`,
    };
    await insertTransactionLogCasino(user, transactionLog, userShareData);

    const whereObj = {
      marketId: gameId,
      userId: new ObjectId(user._id),
      eventId: roundId,
      forBet: 1,
    };

    const updateObj = {
      isDeclare: true,
      isRollback: true,
    };
    await TransactionLogModel.updateMany(whereObj, updateObj);

    await updateCoinsTbl(user._id, user.userType);
    const actualSendCoins = Math.round(
      transactionAmount / casinoMultipleTimesCoins
    );

    return sendCasinoResponse(res, "success", actualSendCoins);
  } catch (error) {}
};

module.exports = {
  qtechLoginUrl,
  qtechTransaction,
  qtechRollback,
  qtechBalance,
};
