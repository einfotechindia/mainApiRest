const mongoose = require("mongoose");
const TransactionLogModel = require("../Models/TransactionLog.model");
const crickTransactionLModel = require("../Models/crickTransaction.model");
const UserModel = require("../Models/User/User.model");
const UserInternationExpoLimitModel = require("../Models/User/UserInternationalExpoLimit.model");
const AccountCoins = require("../Models/User/AccountCoins.model");
const profitLossPosition = require("../Models/BetsList/profitLossPosition.model");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const {
  dateWhereCond,
  _date,
  _date_time,
  chunkArrayNew,
  getSettingData,
  gameBetValidaterRedis,
  _d,
  _dx
} = require("./CommonHelper");
const { InsertUserStatement } = require("./StatementHelper");
const { returnResponse } = require("../Helpers/ResponseMapper");
const constant = require("../utils/constants");
const { client } = require("./RedisHelper");
const { siteSetting } = require("../Common/Constants");
const {
  checkUserTransactionPassword
} = require("../Helpers/UsersUtils");

const {emitToUser} =  require("../socket.js")
const { msg } = require("./MessageHelper");
require("dotenv").config();

// Check if replica set is available (cached at startup)
let isReplicaSet = null;
async function checkReplicaSet() {
  if (isReplicaSet !== null) return isReplicaSet;
  try {
    await mongoose.connection.db.admin().replSetGetStatus();
    isReplicaSet = true;
  } catch {
    isReplicaSet = false;
  }
  return isReplicaSet;
}

const UpdateUserCoins = async (
  coins,
  userId,
  parentData,
  userRemark,
  transactionPassword,
  onCreate,
  isCash = false
) => {
  const useTransaction = await checkReplicaSet();
  const session = useTransaction ? await mongoose.startSession() : null;
  try {
    const transactionAmount = Number(coins);

    // ============================================================
    // 1. BASIC VALIDATION
    // ============================================================

    if (parentData && parentData[0]) {
      parentData = parentData[0]
    }
   
    if (!Number.isFinite(transactionAmount) || transactionAmount === 0) {
      return returnResponse("error", msg("transaction.invalidAmount"));
    }

    if (!userId || !parentData?.userId || !parentData?.userType) {
      return returnResponse("error", msg("transaction.invalidAmount"));
    }

    if (String(userId) === String(parentData.userId)) {
      return returnResponse("error", msg("transaction.selfTransferBlocked"));
    }

    const amount = Math.abs(transactionAmount);
    const parentUserIdType = `${parentData.userType}Id`;

    // ============================================================
    // 2. SETTINGS + CHILD USER + REAL COINS FROM TRANSACTION TABLE
    // ============================================================

    const [settingData, userData, realUserCoins] = await Promise.all([
      getSettingData(),
      UserModel.findOne(
        {
          _id: userId,
          [parentUserIdType]: parentData.userId,
          status: 1,
          isDeleted: false,
        },
        {
          creatorId: 1,
          userType: 1,
          username: 1,
          coins: 1,
          name: 1,
          userId: 1,
          clientId: 1,
          agentId: 1,
          superagentId: 1,
          masterId: 1,
          subadminId: 1,
          adminId: 1,
          superadminId: 1,
          subownerId: 1,
          ownerId: 1,
          [parentUserIdType]: 1,
        }
      ).lean(),
      getUserCoinsByTransactionTable(userId),
    ]);

    if (!userData) {
      return returnResponse("error", msg("transaction.userInactive"));
    }

    // ============================================================
    // 3. CREATOR / PARENT VALIDATION
    // ============================================================

    const creatorData = await UserModel.findOne(
      {
        _id: userData.creatorId,
        [parentUserIdType]: parentData.userId,
        status: 1,
        isDeleted: false,
      },
      {
        userType: 1,
        username: 1,
        coins: 1,
        transactionPassword: 1,
        name: 1,
        userId: 1,
        clientId: 1,
        agentId: 1,
        superagentId: 1,
        masterId: 1,
        subadminId: 1,
        adminId: 1,
        superadminId: 1,
        subownerId: 1,
        ownerId: 1,
      }
    ).lean();

    if (!creatorData) {
      return returnResponse("error", msg("transaction.creatorInactive"));
    }

  

    // ============================================================
    // 4. TRANSACTION PASSWORD
    // ============================================================

    if (settingData?.isTransactionPassword === true) {
      if (!transactionPassword) {
        return returnResponse("error", msg("transaction.transactionPasswordRequired"));
      }
      const isTransactionPasswordCorrect = await checkUserTransactionPassword(
        creatorData.userId,
        transactionPassword,
        creatorData.transactionPassword
      );
      if (!isTransactionPasswordCorrect) {
        return returnResponse("error", msg("transaction.transactionPasswordWrong"));
      }
    }

    // ============================================================
    // 5. CLIENT BET LOCK
    // ============================================================

    if (userData.userType === "client") {
      const checkBet = await gameBetValidaterRedis(userId, "check");
      if (checkBet) {
        return returnResponse("error", msg("bet.userPlacingBet"));
      }
    }

    // ============================================================
    // 6. PRE-FLIGHT BALANCE CHECK (real coins from transaction table)
    // ============================================================

    const creatorCoins = Number(creatorData.coins || 0);
    let userCoins = Number(userData.coins || 0);
    if (realUserCoins && realUserCoins.totalCoins != null) {
      userCoins = Number(realUserCoins.totalCoins);
    }

    // Deposit: parent -> child, check parent has enough
    if (transactionAmount > 0 && amount > creatorCoins) {
      return returnResponse("error", msg("transaction.insufficientCoins"));
    }

    // Withdraw: child -> parent, check child has enough
    if (transactionAmount < 0 && amount > userCoins) {
      return returnResponse("error", msg("transaction.maxDebit", { maxCoins: userCoins, username: userData.username }));
    }

    // ============================================================
    // 7. DETERMINE SENDER / RECEIVER
    // ============================================================

    let senderId, receiverId, senderOldCoins, receiverOldCoins;

    if (transactionAmount > 0) {
      // Deposit: parent sends to child
      senderId = creatorData._id;
      receiverId = userData._id;
      senderOldCoins = creatorCoins;
      receiverOldCoins = userCoins;
    } else {
      // Withdraw: child sends to parent
      senderId = userData._id;
      receiverId = creatorData._id;
      senderOldCoins = userCoins;
      receiverOldCoins = creatorCoins;
    }

    // ============================================================
    // 8. RETURN DATA
    // ============================================================

    let returnData = {};

    // ============================================================
    // 9. COIN UPDATE — ATOMIC (works on both standalone + replica set)
    // ============================================================

    const sessionOpt = session ? { session } : {};

    const executeCoinsUpdate = async () => {
      // ATOMIC DEBIT — sender must have coins >= amount
      const debitResult = await UserModel.updateOne(
        { _id: senderId, status: 1, isDeleted: false, coins: { $gte: amount } },
        { $inc: { coins: -amount } },
        sessionOpt
      );

      if (debitResult.modifiedCount !== 1) {
        throw new Error("INSUFFICIENT_COINS");
      }

      // ATOMIC CREDIT
      const creditResult = await UserModel.updateOne(
        { _id: receiverId, status: 1, isDeleted: false },
        { $inc: { coins: amount } },
        sessionOpt
      );

      if (creditResult.modifiedCount !== 1) {
        // Rollback debit if credit fails (standalone mode)
        if (!session) {
          await UserModel.updateOne({ _id: senderId }, { $inc: { coins: amount } });
        }
        throw new Error("RECEIVER_UPDATE_FAILED");
      }

      // VERIFY: no negative coins
      const senderAfter = await UserModel.findById(senderId, { coins: 1 }).lean();
      if (!senderAfter || senderAfter.coins < 0) {
        // Rollback both (standalone mode)
        if (!session) {
          await UserModel.updateOne({ _id: senderId }, { $inc: { coins: amount } });
          await UserModel.updateOne({ _id: receiverId }, { $inc: { coins: -amount } });
        }
        throw new Error("NEGATIVE_COINS_DETECTED");
      }

      // ========================================================
      // TRANSACTION LOG DATA
      // ========================================================

      const creatorCoinsUpdated = transactionAmount * -1;
      const userCoinsUpdated = transactionAmount;
      const creatorUsertypeId = `${creatorData.userType}Id`;
      const usertypeId = `${userData.userType}Id`;

      let creatorDepositWithdrawType = msg("depositWithdraw.depositTo", { username: userData.username });
      let userDepositWithdrawType = msg("depositWithdraw.depositTo", { username: userData.username });
      let userStatementStatus = "deposit";

      if (transactionAmount < 0) {
        creatorDepositWithdrawType = msg("depositWithdraw.withdrawFrom", { username: userData.username });
        userDepositWithdrawType = msg("depositWithdraw.withdrawFrom", { username: userData.username });
        userStatementStatus = "withdraw";
      }

      // CREATOR + USER TRANSACTION LOGS
      const [creatorTransaction, userTransaction] = await Promise.all([
        TransactionLogModel.create(
          session ? [{
            userId: creatorData._id, amount: creatorCoinsUpdated, overallType: "depositWithdraw",
            remarks: creatorDepositWithdrawType, [creatorUsertypeId]: creatorData.userId,
            userType: creatorData.userType, isDeclare: 1, ...(isCash ? { isCash: true } : {}),
          }] : {
            userId: creatorData._id, amount: creatorCoinsUpdated, overallType: "depositWithdraw",
            remarks: creatorDepositWithdrawType, [creatorUsertypeId]: creatorData.userId,
            userType: creatorData.userType, isDeclare: 1, ...(isCash ? { isCash: true } : {}),
          },
          session ? { session } : undefined
        ),
        TransactionLogModel.create(
          session ? [{
            userId: userData._id, amount: userCoinsUpdated, overallType: "depositWithdraw",
            userType: userData.userType, remarks: userDepositWithdrawType,
            [usertypeId]: userData.userId, isDeclare: 1, ...(isCash ? { isCash: true } : {}),
          }] : {
            userId: userData._id, amount: userCoinsUpdated, overallType: "depositWithdraw",
            userType: userData.userType, remarks: userDepositWithdrawType,
            [usertypeId]: userData.userId, isDeclare: 1, ...(isCash ? { isCash: true } : {}),
          },
          session ? { session } : undefined
        ),
      ]);

 
      const creatorTxId = session ? creatorTransaction[0]._id : creatorTransaction._id;
      const userTxId = session ? userTransaction[0]._id : userTransaction._id;
      returnData.creatorTransactionId = creatorTxId;
      returnData.userTransactionId = userTxId;

      // ========================================================
      // STATEMENTS
      // ========================================================

      const statementDataCreator = {
        transactionId: creatorTxId, amount: creatorCoinsUpdated,
        oldAmount: creatorCoins, newAmount: creatorCoins + creatorCoinsUpdated,
        statementFor: constant.ACCOUNT_STATEMENT, userRemark: userRemark,
        remark: msg("statement.coinsUpdatedTo", { userName: userData.name, username: userData.username, parentUsername: parentData.username }),
      };

      const statementDataUser = {
        transactionId: userTxId, amount: userCoinsUpdated,
        oldAmount: userCoins, newAmount: userCoins + userCoinsUpdated,
        userRemark: userRemark, statementFor: constant.ACCOUNT_STATEMENT,
        remark: msg("statement." + userStatementStatus + "Remark", {
          oldAmount: userCoins, newAmount: userCoins + userCoinsUpdated,
          creatorName: creatorData.name, creatorUsername: creatorData.username,
          parentUsername: parentData.username, parentName: parentData.name,
        }),
      };

      const [userStatement, creatorStatement] = await Promise.all([
        InsertUserStatement(statementDataUser, userData, session),
        InsertUserStatement(statementDataCreator, creatorData, session),
      ]);

      returnData.userStatementId = userStatement._id;
      returnData.creatorStatementId = creatorStatement._id;

      // ========================================================
      // CRICK TRANSACTIONS
      // ========================================================

      const COINS_DIVIDER = Number(process.env.COINS_DIVIDER || 100);

      const creatorCrickMsgKey = creatorCoinsUpdated > 0 ? "crick.withdrawRemark" : "crick.depositRemark";
      const creatorRemarkCrick = msg(creatorCrickMsgKey, {
        userRemark, username: userData.username, creatorUsername: creatorData.username,
        amount: Math.abs(Math.round(creatorCoinsUpdated / COINS_DIVIDER)), dateTime: _date_time(),
      });

      const userCrickMsgKey = transactionAmount < 0 ? "crick.withdrawRemark" : "crick.depositRemark";
      const userRemarkCrick = msg(userCrickMsgKey, {
        userRemark, username: userData.username, creatorUsername: creatorData.username,
        amount: Math.abs(Math.round(transactionAmount / COINS_DIVIDER)), dateTime: _date_time(),
      });

      const crickCreatorTx = {
        amount: creatorCoinsUpdated, [`${creatorData.userType}ProfitLoss`]: creatorCoinsUpdated,
        transactionType: "depositWithdrawal", remarks: creatorRemarkCrick,
        userId: creatorData.userId, creatorId: creatorData.userId,
        [`${creatorData.userType}Id`]: creatorData.userId, ...(isCash ? { isCash: true } : {}),
      };

      const crickUserTx = {
        amount: transactionAmount, transactionType: "depositWithdrawal", remarks: userRemarkCrick,
        userId: userData.userId, creatorId: creatorData._id,
        [`${userData.userType}Id`]: userData.userId,
        [`${userData.userType}ProfitLoss`]: transactionAmount, ...(isCash ? { isCash: true } : {}),
      };

      const [crickTxCreator, crickTxUser] = await Promise.all([
        crickTransactionLModel.create(session ? [crickCreatorTx] : crickCreatorTx, session ? { session } : undefined),
        crickTransactionLModel.create(session ? [crickUserTx] : crickUserTx, session ? { session } : undefined),
      ]);

      returnData.crickTransactionCreatorId = session ? crickTxCreator[0]._id : crickTxCreator._id;
      returnData.crickTransactionUserId = session ? crickTxUser[0]._id : crickTxUser._id;
    };

    // Execute with or without transaction
    if (session) {
      await session.withTransaction(executeCoinsUpdate, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: 5000,
      });
    } else {
      await executeCoinsUpdate();
    }

    // ============================================================
    // 10. TRANSACTION COMMITTED — read actual current balance
    // ============================================================

    const [latestCreator, latestUser] = await Promise.all([
      UserModel.findById(creatorData._id, { coins: 1 }).lean(),
      UserModel.findById(userData._id, { coins: 1 }).lean(),
    ]);

    // ============================================================
    // 11. GET EXPOSURE / PROFIT LOSS (derived fields only)
    // ============================================================

    const [creatorCalculated, userCalculated] = await Promise.all([
      GetUserCoins(creatorData._id, creatorData.userType),
      GetUserCoins(userData._id, userData.userType),
    ]);

    // ============================================================
    // 12. UPDATE DERIVED FIELDS (NOT coins — coins already atomic)
    // ============================================================

    await Promise.all([
      UserModel.updateOne(
        { _id: creatorData._id },
        {
          $set: {
            exposure: creatorCalculated?.exposure || 0,
            profitLoss: creatorCalculated?.profitLoss || 0,
            totalProfitLoss: creatorCalculated?.profitLoss || 0,
            creditReference: creatorCalculated?.creditReference || 0,
          },
        }
      ),
      UserModel.updateOne(
        { _id: userData._id },
        {
          $set: {
            exposure: userCalculated?.exposure || 0,
            profitLoss: userCalculated?.profitLoss || 0,
            totalProfitLoss: userCalculated?.profitLoss || 0,
            creditReference: userCalculated?.creditReference || 0,
          },
        }
      ),
    ]);

    // ============================================================
    // 13. REDIS SYNC
    // ============================================================

    if (siteSetting.IS_REDIS) {
      await Promise.all([
        client.hmset(
          `${creatorData._id}`,
          "coins", latestCreator?.coins || 0,
          "exposure", creatorCalculated?.exposure || 0,
          "profitLoss", creatorCalculated?.profitLoss || 0,
          "creditReference", creatorCalculated?.creditReference || 0
        ),
        client.hmset(
          `${userData._id}`,
          "coins", latestUser?.coins || 0,
          "exposure", userCalculated?.exposure || 0,
          "profitLoss", userCalculated?.profitLoss || 0,
          "creditReference", userCalculated?.creditReference || 0
        ),
      ]);
    }

    // ============================================================
    // 14. SOCKET UPDATE
    // ============================================================

    emitToUser(
      "coinUpdate",
      {
        coins: latestCreator?.coins || 0,
        exposure: creatorCalculated?.exposure || 0,
        profitLoss: creatorCalculated?.profitLoss || 0,
        creditReference: creatorCalculated?.creditReference || 0,
      },
      creatorData.userId
    );

    emitToUser(
      "coinUpdate",
      {
        coins: latestUser?.coins || 0,
        exposure: userCalculated?.exposure || 0,
        profitLoss: userCalculated?.profitLoss || 0,
        creditReference: userCalculated?.creditReference || 0,
      },
      userData.userId
    );

    // ============================================================
    // 15. SUCCESS
    // ============================================================

    return returnResponse("success", msg("transaction.coinsUpdatedSuccess"), returnData);

  } catch (error) {
    console.error("UpdateUserCoins error:", error?.message || error);

    if (error?.message === "INSUFFICIENT_COINS") {
      return returnResponse("error", msg("transaction.insufficientCoins"));
    }
    if (error?.message === "RECEIVER_UPDATE_FAILED") {
      return returnResponse("error", msg("transaction.receiverUpdateFailed"));
    }
    if (error?.message === "NEGATIVE_COINS_DETECTED") {
      return returnResponse("error", msg("transaction.negativeCoinsDropped"));
    }

    return returnResponse("error", msg("transaction.coinsUpdateFailed"));

  } finally {
    if (session) await session.endSession();
  }
};

const updateCoinsTbl = async (userId, userType) => {
  const userCoins = await GetUserCoins(userId, userType);

  if (!userCoins) {
    console.error("updateCoinsTbl: GetUserCoins returned null for userId:", userId);
    return null;
  }

  const totalCoins = userCoins.totalCoins || 0;
  const exposure = userCoins.exposure || 0;
  const profitLoss = userCoins.profitLoss || 0;
  const creditReference = userCoins.creditReference || 0;

  const setObj = {
    coins: totalCoins,
    exposure: exposure,
    profitLoss: profitLoss,
    totalProfitLoss: profitLoss,
    creditReference: creditReference,
  };

  try {
    await UserModel.updateOne(
      { _id: userId },
      { $set: setObj }
    );

    if (siteSetting.IS_REDIS) {
      await client.hmset(
        userId + "",
        "coins", totalCoins,
        "exposure", exposure,
        "profitLoss", profitLoss,
        "creditReference", creditReference
      );
    }

    const updateData = {
      coins: totalCoins,
      exposure: exposure,
      profitLoss: profitLoss,
      creditReference: creditReference,
    };

    emitToUser("coinUpdate", updateData, userId);

  } catch (error) {
    console.error(
      "updateCoinsTbl error for userId:", userId, error
    );
  }
  return userCoins;
};

async function GetUserCoins(id, userType) {
  // Check Redis cache first (3 sec TTL)
  // const cacheKey = `getUserCoins:${id}`;
  // if (siteSetting.IS_REDIS) {
  //   try {
  //     const cached = await client.get(cacheKey);
  //     if (cached) return JSON.parse(cached);
  //   } catch (_) {}
  // }

  if (!userType) {
    const userData = await UserModel.findOne({ _id: id }, { userType: 1 }).lean();
    if (!userData) {
      console.error("GetUserCoins: user not found for id:", id);
      return null;
    }
    userType = userData.userType;
  }

  let groupCond = {
    _id: "$userId",
    totalCoins: { $sum: "$amount" },
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
          "$amount",
          0,
        ],
      },
    },
    creditReference: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$overallType", "depositWithdraw"] }, { $eq: ["$isCash", false] }],
          },
          "$amount",
          0,
        ],
      },
    },
  };

  if (userType == "client") {
    let commCoinShow = true;
    if (process.env.COMM_COINS_UPDATE_IN_USER_LIST && process.env.COMM_COINS_UPDATE_IN_USER_LIST == "false") {
      commCoinShow = false;
    }
    if (!commCoinShow) {
      groupCond.totalCoins = {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            "$amount",
            0,
          ],
        },
      };
    }
  }

  const transactionPromise = TransactionLogModel.aggregate([
    { $match: { userId: new ObjectId(id) } },
    { $group: groupCond },
  ]);

  const query = { userId: new ObjectId(id), creatorId: { $ne: new ObjectId(id) } };
  const crickGroup = {
    _id: "$userId",
    depositWithdraw: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }],
          },
          "$amount",
          0,
        ],
      },
    },
  };

  const crickPromise = crickTransactionLModel.aggregate([
    { $match: query },
    { $group: crickGroup },
  ]);

  const [transactionRes, crickRes] = await Promise.allSettled([
    transactionPromise,
    crickPromise,
  ]);

  let res = [];
  if (transactionRes.status === "fulfilled") {
    res = transactionRes.value || [];
  }

  if (
    crickRes.status === "fulfilled" &&
    crickRes.value &&
    crickRes.value.length
  ) {
    const creditReference = crickRes.value[0].depositWithdraw || 0;
    if (res.length) {
      res[0].creditReference = creditReference;
    }
  }

  // Cache result for 3 seconds
  const result = res[0];
  if (result && siteSetting.IS_REDIS) {
    try {
      await client.set(cacheKey, JSON.stringify(result), "EX", 3);
    } catch (_) {}
  }

  return result;
}

const updateCoinsAndExposure = async (userId, userData) => {
  try {
    if (!userData) {
      userData = await UserModel.findOne({ userId: userId }).lean();
    }
    if (!userData) {
      console.error("updateCoinsAndExposure: user not found for userId:", userId);
      return;
    }
    await client.hmset(
      userId + "",
      "coins", userData?.coins || 0,
      "status", userData?.status,
      "isDeleted", userData?.isDeleted,
      "jwtToken", userData?.jwtToken + ""
    );
    if (userData.userType == "client") {
      await client.hmset(
        userId + "",
        "exposure", userData.exposure || 0,
        "profitLoss", userData.totalProfitLoss || 0
      );
    }
  } catch (error) {
    console.error("updateCoinsAndExposure error for userId:", userId, error);
  }
};

async function insertTransactionLog(userData, logData, matchData, shareData) {
  let transactionLog = {};
  if (userData) {
    transactionLog["userId"] = userData._id;
    transactionLog["userType"] = userData.userType;
    transactionLog["clientId"] = userData.clientId;
    transactionLog["ownerId"] = userData.ownerId;
    transactionLog["subownerId"] = userData.subownerId;
    transactionLog["superadminId"] = userData.superadminId;
    transactionLog["adminId"] = userData.adminId;
    transactionLog["subadminId"] = userData.subadminId;
    transactionLog["masterId"] = userData.masterId;
    transactionLog["superagentId"] = userData.superagentId;
    transactionLog["agentId"] = userData.agentId;
  }
  if (matchData) {
    transactionLog["marketId"] = matchData.marketId;
    transactionLog["eventId"] = matchData.eventId;
  }

  if (shareData) {
    transactionLog["ownerAmount"] = Math.round(
      shareData.ownerMatchProfitLossShare * logData.amount
    );
    transactionLog["subownerAmount"] = Math.round(
      shareData.subownerMatchProfitLossShare * logData.amount
    );
    transactionLog["superadminAmount"] = Math.round(
      shareData.superadminMatchProfitLossShare * logData.amount
    );
    transactionLog["adminAmount"] = Math.round(
      shareData.adminMatchProfitLossShare * logData.amount
    );
    transactionLog["subadminAmount"] = Math.round(
      shareData.subadminMatchProfitLossShare * logData.amount
    );
    transactionLog["masterAmount"] = Math.round(
      shareData.masterMatchProfitLossShare * logData.amount
    );
    transactionLog["superagentAmount"] = Math.round(
      shareData.superagentMatchProfitLossShare * logData.amount
    );
    transactionLog["agentAmount"] = Math.round(
      shareData.agentMatchProfitLossShare * logData.amount
    );
  }

  const finalLogData = {
    ...transactionLog,
    ...logData,
  };

  try {
    const transaction = await TransactionLogModel.create(finalLogData);
    return transaction._id;
  } catch (error) {
    console.error("insertTransactionLog error:", error);
    throw error;
  }
}

async function insertTransactionLogCasino(userData, logData, shareData) {
  let transactionLog = {};
  if (userData) {
    transactionLog["userId"] = userData._id;
    transactionLog["userType"] = userData.userType;
    transactionLog["clientId"] = userData.clientId;
    transactionLog["ownerId"] = userData.ownerId;
    transactionLog["subownerId"] = userData.subownerId;
    transactionLog["superadminId"] = userData.superadminId;
    transactionLog["adminId"] = userData.adminId;
    transactionLog["subadminId"] = userData.subadminId;
    transactionLog["masterId"] = userData.masterId;
    transactionLog["superagentId"] = userData.superagentId;
    transactionLog["agentId"] = userData.agentId;
  }

  if (shareData) {
    transactionLog["ownerAmount"] = Math.round(
      ((shareData.ownerCasinoShare - shareData.subownerCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["subownerAmount"] = Math.round(
      ((shareData.subownerCasinoShare - shareData.superadminCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["superadminAmount"] = Math.round(
      ((shareData.superadminCasinoShare - shareData.adminCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["adminAmount"] = Math.round(
      ((shareData.adminCasinoShare - shareData.subadminCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["subadminAmount"] = Math.round(
      ((shareData.subadminCasinoShare - shareData.masterCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["masterAmount"] = Math.round(
      ((shareData.masterCasinoShare - shareData.superagentCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["superagentAmount"] = Math.round(
      ((shareData.superagentCasinoShare - shareData.agentCasinoShare) *
        logData.amount) /
        100
    );
    transactionLog["agentAmount"] = Math.round(
      (shareData.agentCasinoShare * logData.amount) / 100
    );
  }
  transactionLog["clientAmount"] = logData.amount;
  let finalLogData = {
    ...transactionLog,
    ...logData,
  };

  try {
    const transaction = await TransactionLogModel.create(finalLogData);
    return transaction._id;
  } catch (error) {
    console.error("insertTransactionLogCasino error:", error);
    throw error;
  }
}

async function insertInternationalTransactionLogCasino(
  userData,
  logData,
  shareData
) {
  let transactionLog = {};
  if (userData) {
    transactionLog["userId"] = userData._id;
    transactionLog["userType"] = userData.userType;
    transactionLog["clientId"] = userData.clientId;
    transactionLog["ownerId"] = userData.ownerId;
    transactionLog["subownerId"] = userData.subownerId;
    transactionLog["superadminId"] = userData.superadminId;
    transactionLog["adminId"] = userData.adminId;
    transactionLog["subadminId"] = userData.subadminId;
    transactionLog["masterId"] = userData.masterId;
    transactionLog["superagentId"] = userData.superagentId;
    transactionLog["agentId"] = userData.agentId;
  }

  if (shareData) {
    transactionLog["ownerAmount"] = Math.round(
      shareData.ownerCasinoProfitLossShare * logData.amount
    );
    transactionLog["ownerShareAmount"] = Math.round(
      shareData.ownerParentCasinoShare * logData.amount
    );

    transactionLog["subownerAmount"] = Math.round(
      shareData.subownerCasinoProfitLossShare * logData.amount
    );
    transactionLog["subownerShareAmount"] = Math.round(
      shareData.subownerParentCasinoShare * logData.amount
    );

    transactionLog["superadminAmount"] = Math.round(
      shareData.superadminCasinoProfitLossShare * logData.amount
    );

    transactionLog["superadminShareAmount"] = Math.round(
      shareData.superadminParentCasinoShare * logData.amount
    );

    transactionLog["adminAmount"] = Math.round(
      shareData.adminCasinoProfitLossShare * logData.amount
    );
    transactionLog["adminShareAmount"] = Math.round(
      shareData.adminParentCasinoShare * logData.amount
    );

    transactionLog["subadminAmount"] = Math.round(
      shareData.subadminCasinoProfitLossShare * logData.amount
    );
    transactionLog["subadminShareAmount"] = Math.round(
      shareData.subadminParentCasinoShare * logData.amount
    );

    transactionLog["masterAmount"] = Math.round(
      shareData.masterCasinoProfitLossShare * logData.amount
    );
    transactionLog["masterShareAmount"] = Math.round(
      shareData.masterParentCasinoShare * logData.amount
    );

    transactionLog["superagentAmount"] = Math.round(
      shareData.superagentCasinoProfitLossShare * logData.amount
    );
    transactionLog["superagentShareAmount"] = Math.round(
      shareData.superagentParentCasinoShare * logData.amount
    );

    transactionLog["agentAmount"] = Math.round(
      shareData.agentCasinoProfitLossShare * logData.amount
    );
    transactionLog["agentShareAmount"] = Math.round(
      shareData.agentParentCasinoShare * logData.amount
    );
  }
  transactionLog["clientAmount"] = logData.amount;
  let finalLogData = {
    ...transactionLog,
    ...logData,
  };
  try {
    const transaction = await TransactionLogModel.create(finalLogData);
    return transaction._id;
  } catch (error) {
    console.error("insertInternationalTransactionLogCasino error:", error);
    throw error;
  }
}

async function insertTransactionLogMatka(userData, logData, shareData) {
  let transactionLog = {};
  if (userData) {
    transactionLog["userId"] = userData._id;
    transactionLog["userType"] = userData.userType;
    transactionLog["clientId"] = userData.clientId;
    transactionLog["ownerId"] = userData.ownerId;
    transactionLog["subownerId"] = userData.subownerId;
    transactionLog["superadminId"] = userData.superadminId;
    transactionLog["adminId"] = userData.adminId;
    transactionLog["subadminId"] = userData.subadminId;
    transactionLog["masterId"] = userData.masterId;
    transactionLog["superagentId"] = userData.superagentId;
    transactionLog["agentId"] = userData.agentId;
  }

  if (shareData) {
    transactionLog["ownerAmount"] = Math.round(
      ((shareData.ownerMatkaShare - shareData.subownerMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["subownerAmount"] = Math.round(
      ((shareData.subownerMatkaShare - shareData.superadminMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["superadminAmount"] = Math.round(
      ((shareData.superadminMatkaShare - shareData.adminMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["adminAmount"] = Math.round(
      ((shareData.adminMatkaShare - shareData.subadminMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["subadminAmount"] = Math.round(
      ((shareData.subadminMatkaShare - shareData.masterMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["masterAmount"] = Math.round(
      ((shareData.masterMatkaShare - shareData.superagentMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["superagentAmount"] = Math.round(
      ((shareData.superagentMatkaShare - shareData.agentMatkaShare) *
        logData.amount) /
        100
    );
    transactionLog["agentAmount"] = Math.round(
      (shareData.agentMatkaShare * logData.amount) / 100
    );

    transactionLog["agentShareAmount"] = Math.round(
      ((100 - shareData.agentMatkaShare) * logData.amount) / 100
    );

    transactionLog["superagentShareAmount"] = Math.round(
      ((100 - shareData.superagentMatkaShare) * logData.amount) / 100
    );

    transactionLog["masterShareAmount"] = Math.round(
      ((100 - shareData.masterMatkaShare) * logData.amount) / 100
    );

    transactionLog["subadminShareAmount"] = Math.round(
      ((100 - shareData.subadminMatkaShare) * logData.amount) / 100
    );
    transactionLog["adminShareAmount"] = Math.round(
      ((100 - shareData.adminMatkaShare) * logData.amount) / 100
    );
    transactionLog["subownerShareAmount"] = Math.round(
      ((100 - shareData.subownerMatkaShare) * logData.amount) / 100
    );
  }
  transactionLog["clientAmount"] = logData.amount;
  let finalLogData = {
    ...transactionLog,
    ...logData,
  };

  try {
    const transaction = await TransactionLogModel.create(finalLogData);
    return transaction._id;
  } catch (error) {
    console.error("insertTransactionLogMatka error:", error);
    throw error;
  }
}

async function GetUserCoinsByMarketId(id, userType, marketId) {
  if (!userType) {
    const userData = await UserModel.findOne({ _id: id }, { userType: 1 });
    userType = userData.userType;
  }
  let userAmountField = `${userType}Amount`;
  if (userType == "client") {
    userAmountField = "amount";
  }
  var res = await TransactionLogModel.aggregate([
    {
      $match: { userId: new ObjectId(id), marketId: marketId },
    },
    {
      $group: {
        _id: "$clientId",
        marketExposure: {
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
        marketProfitLoss: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }],
              },
              `$${userAmountField}`,
              0,
            ],
          },
        },
      },
    },
  ]);

  return res[0];
}

const updateAccountCoins = async (userId, userType) => {
  if (!userType) {
    const userData = await UserModel.findOne(
      { _id: userId },
      { userType: 1 }
    ).lean();
    if (!userData) {
      console.error("updateAccountCoins: user not found for userId:", userId);
      return {};
    }
    userType = userData.userType;
  }

  const field = `${userType}Id`;
  const userObjectId = new ObjectId(userId);

  const res = await UserModel.aggregate([
    {
      $match: { [field]: userObjectId },
    },
    {
      $group: {
        _id: `$${userType}Id`,
        userExposure: { $first: "$exposure" },
        userCoins: { $first: "$coins" },
        userCreditReference: { $first: "$creditReference" },
        userProfitLoss: { $first: "$totalProfitLoss" },
        totalDownLevelExposure: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [`$${userType}Id`, userObjectId] },
                  { $ne: ["$_id", userObjectId] },
                ],
              },
              "$exposure",
              0,
            ],
          },
        },
        totalDownLevelProfitLoss: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [`$${userType}Id`, userObjectId] },
                  { $ne: ["$_id", userObjectId] },
                ],
              },
              "$totalProfitLoss",
              0,
            ],
          },
        },
        totalDownLevelCreditReference: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [`$${userType}Id`, userObjectId] },
                  { $ne: ["$_id", userObjectId] },
                ],
              },
              "$creditReference",
              0,
            ],
          },
        },
        totalDownLevelAvailableBalance: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: [`$${userType}Id`, userObjectId] },
                  { $ne: ["$_id", userObjectId] },
                ],
              },
              "$coins",
              0,
            ],
          },
        },
      },
    },
  ]);

  let returnData = {};
  if (res[0]) {
    const updateData = res[0];
    const updateObject = {
      userId: userId,
      UpperLevelCreditReffrence: updateData?.userCreditReference || 0,
      DownLevelCreditReffrence: updateData?.totalDownLevelCreditReference || 0,
      totalMasterBalance: updateData?.userCoins || 0,
      upperLevel: 0,
      downLevelProfitLoss: updateData?.totalDownLevelProfitLoss || 0,
      downlLevelOccupancyBalance: updateData?.totalDownLevelAvailableBalance || 0,
      availableBalance: updateData?.userCoins || 0,
      availableBalanceProfitLoss:
        Number(updateData.userCoins || 0) + Number(updateData.userProfitLoss || 0),
      userProfitLoss: updateData?.userProfitLoss || 0,
    };

    try {
      await client.hmset(
        userId + "",
        "accountDetails",
        JSON.stringify(updateObject)
      );
    } catch (error) {
      console.error("updateAccountCoins redis error for userId:", userId, error);
    }

    await AccountCoins.updateOne({ _id: userId }, updateObject, {
      upsert: true,
    });

    returnData = updateObject;
  }

  return returnData;
};

const getSessionPositionByTransaction = async (userData, selectionId, marketId) => {
  const id = userData.userId;
  const res = await TransactionLogModel.aggregate([
    {
      $match: { userId: new ObjectId(id), selectionId: selectionId  , marketId : marketId},
    },
    {
      $group: {
        _id: "$userId",
        totalCoins: { $sum: "$amount" },
      },
    },
  ]);
  if (res[0]) {
    return res[0].totalCoins;
  } else {
    return 0;
  }
};

const updateBulkCoinsExposureUserByMarketId = async (
  userWhere,
  marketId,
  selectionId
) => {
  const playWhere = {
    userId: {
      $in: userWhere,
    },
  };

  let groupCond = {
    _id: "$userId",
    totalCoins: { $sum: "$amount" },
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
          "$amount",
          0,
        ],
      },
    },
  };

  let commCoinShow = true
  if(process.env.COMM_COINS_UPDATE_IN_USER_LIST && process.env.COMM_COINS_UPDATE_IN_USER_LIST=="false"){
    commCoinShow = false
  }
  
  if(!commCoinShow){
    groupCond.totalCoins = {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isComm", 0] }],
          },
          `$amount`,
          0,
        ],
      },
    };
  }

  var res = await TransactionLogModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
  ]);
 
  const updateOperations = res.map((userData, key) => ({
    updateOne: {
      filter: { userId: userData._id },
      update: {
        $set: {
          coins: userData.totalCoins,
          exposure: userData.exposure,
          totalProfitLoss: userData.profitLoss,
        },
      },
    },
  }));

  let returnData = {
    userBulkWrite: [],
    playBulkWrite: {},
  };

const batchSize = 500; 
const batches = chunkArrayNew(updateOperations, batchSize);
const updatePromises = batches.map((batch, index) => {
  return UserModel.bulkWrite(batch, { ordered: false })
    .then((result) => {
      returnData.userBulkWrite.push(result);
    })
    .catch((err) => {
      console.error(`Error in batch ${index + 1}`, err);
    });
});

await Promise.all(updatePromises);
await updateCoinsExposureProfitLossToRedisAndSocket(playWhere);
return returnData;
};


const updateCoinsExposureProfitLossToRedisAndSocket = async (
  userWhere,
  userData
) => {
  try {
    let updateUserData = [];
    if (siteSetting.IS_REDIS || siteSetting.IS_SOCKET) {
      if (!userData) {
        updateUserData = await UserModel.find(userWhere, {
          coins: 1,
          exposure: 1,
          totalProfitLoss: 1,
        });
      } else {
        updateUserData = userData;
      }
    }

    await Promise.all(
      updateUserData.map((user) =>
        client.hmset(
          user._id + "",
          "coins",
          user.coins,
          "exposure",
          user.exposure,
          "profitLoss",
          user?.totalProfitLoss
        )
      )
    );
    
    if (siteSetting.IS_SOCKET) {
      updateUserData.forEach((user) => {
        const updateData = {
          coins: user.coins,
          exposure: user.exposure,
          profitLoss: user.totalProfitLoss,
        };
        emitToUser("coinUpdate", updateData, user._id);
      });
    }

    return true;
  } catch (error) {
    console.log(
      "Error in saving on redis for coins , exposure and profitloss",
      error
    );
  }
};

const wholeTransactionMarketData = async (
  marketId,
  uniqueClientArray,
  date = {},
  ledgerType = ""
) => {
  let playWhere = {
    marketId: marketId,
    isDeclare: 1,
    forBet: 1,
  };

  if (date.length > 0) {
    playWhere.date = await dateWhereCond(date);
  }

  if (ledgerType && ledgerType != "session") {
    delete playWhere.date;
  }
  //  _d(playWhere);

  if (uniqueClientArray) {
    playWhere.userId = {
      $in: uniqueClientArray,
    };
  }

  // _dx(playWhere);
  let groupCond = {
    _id: "$userId",
    clientSessionTurnOver: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOdds"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$sessionTurnOver",
          0,
        ],
      },
    },
    clientTotalProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }],
          },
          "$amount",
          0,
        ],
      },
    },
    clientTotalBookmakerOdds: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "bookmakerOdds"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 0] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    clientTotalSessionOdds: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOdds"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 0] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    clientTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },

    clientTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    agentTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$agentAmount",
          0,
        ],
      },
    },
    agentTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$agentAmount",
          0,
        ],
      },
    },
    superagentTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$superagentAmount",
          0,
        ],
      },
    },
    superagentTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$superagentAmount",
          0,
        ],
      },
    },
    masterTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$masterAmount",
          0,
        ],
      },
    },
    masterTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$masterAmount",
          0,
        ],
      },
    },
    subadminTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$subadminAmount",
          0,
        ],
      },
    },
    subadminTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$subadminAmount",
          0,
        ],
      },
    },
    adminTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$adminAmount",
          0,
        ],
      },
    },
    adminTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$adminAmount",
          0,
        ],
      },
    },
    superadminTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$superadminAmount",
          0,
        ],
      },
    },
    superadminTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$superadminAmount",
          0,
        ],
      },
    },
    subownerTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$subownerAmount",
          0,
        ],
      },
    },
    subownerTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$subownerAmount",
          0,
        ],
      },
    },
    ownerTotalBookmakerComm: {
      $sum: {
        $cond: [
          {
            $and: [
              {
                $in: [
                  "$overallType",
                  ["matchOddsOddsComm", "bookmakerOddsComm"],
                ],
              },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$ownerAmount",
          0,
        ],
      },
    },
    ownerTotalSessionComm: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "fancyOddsComm"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$isComm", 1] },
            ],
          },
          "$ownerAmount",
          0,
        ],
      },
    },
  };
  var res = await TransactionLogModel.aggregate([
    {
      $match: playWhere,
    },
    {
      $group: groupCond,
    },
  ]);

  return res;
};

async function downlineCount(userData) {
  let userType = userData?.userType;
  const id = userData?._id || userData?.userId;

  if (!id) {
    console.error("downlineCount: no valid id provided");
    return null;
  }

  if (!userType) {
    const foundUser = await UserModel.findOne({ _id: id }, { userType: 1 }).lean();
    if (!foundUser) {
      console.error("downlineCount: user not found for id:", id);
      return null;
    }
    userType = foundUser.userType;
  }

  let userAmountField = `${userType}Amount`;
  if (userType == "client") {
    userAmountField = "amount";
  }

  const res = await TransactionLogModel.aggregate([
    {
      $match: { userId: new ObjectId(id) },
    },
    {
      $group: {
        _id: "$userId",
        totalCoins: { $sum: "$amount" },
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
              `$${userAmountField}`,
              0,
            ],
          },
        },
      },
    },
  ]);

  return res[0] || null;
}

const casinoReportByUser = async (bodyData, userData) => {
  let playWhere = bodyData.whereHelper;
  let gameName = `gameName`;
  let eventId = `eventId`;
  playWhere.gameType = {
    $in: ["internationalCasino", "diamondCasino"],
  };

  if (bodyData.gameType) {
    playWhere.gameType = {
      $in: [bodyData.gameType],
    };

    if (bodyData.gameType == "internationalCasino") {
      gameName = "remarks";
      eventId = "marketId";
    }
  }

  let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);

  playWhere.date = dateWhere;

  const userAmountType = `${userData.userType}Amount`;

  let groupCond = {
    _id: {
      marketId: `$${eventId}`,
      date: "$date",
    },
    clientProfitLoss: { $sum: "$amount" },
    gameName: { $first: `$${gameName}` },
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

  var res = await TransactionLogModel.aggregate([
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

  return res;
};

const userIntCasinoExpoLimit = async (
  amount,
  userId,
  userData,
  creatorData
) => {
  try {
    const IS_REDIS = process.env.IS_REDIS;
    if (!userData) {
      userData = await UserModel.findOne({ userId: userId }).lean();
    }

    if (!creatorData) {
      const creatorId = userData.creatorId;
      creatorData = await UserModel.findOne({ userId: creatorId }).lean();
    }

    let userExpoLimit = userData.intCasinoExpoLimit || 0;
    let creatorExpoLimit = creatorData.intCasinoExpoLimit || 0;

    if (amount > 0 && amount > creatorExpoLimit) {
      return returnResponse("error", "insufficient Int Exposure Limit");
    }

    if (amount < 0 && Math.abs(amount) > userExpoLimit) {
      return returnResponse(
        "error",
        "Int Exposure Limit can not be less than userExpo Limit"
      );
    }

    // User expo entry
    const userExpoObj = {
      amount: amount,
      userId: userId,
      clientId: userData.clientId,
      agentId: userData.agentId,
      superagentId: userData.superagentId,
      masterId: userData.masterId,
      subadminId: userData.subadminId,
      adminId: userData.adminId,
      superadminId: userData.superadminId,
      subownerId: userData.subownerId,
      ownerId: userData.ownerId,
      userType: userData.userType,
      doneBy: `${creatorData.name} (${creatorData.username})`,
      remark: `${creatorData.name} (${creatorData.username}) ${
        amount < 0 ? "withdraw" : "deposit"
      } chips to ${userData.name} (${userData.username})`,
    };

    await UserInternationExpoLimitModel.create(userExpoObj);

    // Creator expo entry — separate object to avoid mutation
    const parentAmount = -1 * amount;
    const creatorExpoObj = {
      ...userExpoObj,
      amount: parentAmount,
      userType: creatorData.userType,
      userId: creatorData.userId,
      remark: `${creatorData.name} (${creatorData.username}) ${
        parentAmount < 0 ? "give" : "take"
      } chips ${parentAmount < 0 ? "to" : "from"} ${userData.name} (${
        userData.username
      })`,
    };

    await UserInternationExpoLimitModel.create(creatorExpoObj);

    const [totalUserExpoLimit, totalCreatorExpoLimit] = await Promise.all([
      UserInternationExpoLimitModel.aggregate([
        { $match: { userId: new ObjectId(userId) } },
        { $group: { _id: "$userId", userExpoLimit: { $sum: "$amount" } } },
      ]),
      UserInternationExpoLimitModel.aggregate([
        { $match: { userId: new ObjectId(creatorData.userId) } },
        { $group: { _id: "$userId", creatorExpoLimit: { $sum: "$amount" } } },
      ]),
    ]);

    const userExpoValue = totalUserExpoLimit[0]?.userExpoLimit || 0;
    const creatorExpoValue = totalCreatorExpoLimit[0]?.creatorExpoLimit || 0;

    await Promise.all([
      UserModel.where("_id", userId).updateOne({
        $set: { intCasinoExpoLimit: userExpoValue },
      }),
      UserModel.where("_id", creatorData.userId).updateOne({
        $set: { intCasinoExpoLimit: creatorExpoValue },
      }),
    ]);

    if (IS_REDIS) {
      await Promise.all([
        client.set(`${userId}_INT_EXPO`, userExpoValue),
        client.expire(`${userId}_INT_EXPO`, 60 * 60 * 24),
        client.set(`${creatorData.userId}_INT_EXPO`, creatorExpoValue),
        client.expire(`${creatorData.userId}_INT_EXPO`, 60 * 60 * 24),
      ]);
    }

    return returnResponse(
      "success",
      "exposure limit updated successfully",
      userExpoValue
    );
  } catch (error) {
    console.error("userIntCasinoExpoLimit error:", error);
    return returnResponse("error", "Failed to update exposure limit.");
  }
};

const checkIntBetExpoLimit = async (creatorId, creatorType) => {
  const IS_REDIS = siteSetting.IS_REDIS;
  let checkExpoLimit = 0;
  if (IS_REDIS) {
    const limit = await client.get(`${creatorId}_INT_EXPO`);
    if (limit) {
      checkExpoLimit = limit;
    }
  }
  if (!checkExpoLimit) {
    let userCheckExpoLimit = await UserModel.findOne(
      { userId: creatorId },
      { intCasinoExpoLimit: 1 }
    );
    checkExpoLimit = userCheckExpoLimit.intCasinoExpoLimit;
    if (IS_REDIS) {
      await client.set(`${creatorId}_INT_EXPO`, checkExpoLimit);
      await client.expire(`${creatorId}_INT_EXPO`, 60 * 60 * 60 * 24);
    }
  }
  let where = {
    [`${creatorType}Id`]: new ObjectId(creatorId),
    forBet: 1,
    isDeclare: 1,
    overallType: "internationalCasino",
    gameType: "internationalCasino",
  };
  var clientExpoLimit = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: "$agentId",
        totalClientMinus: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$forBet", 1] },
                  { $eq: ["$isDeclare", 1] },
                  { $eq: ["$overallType", "internationalCasino"] },
                ],
              },
              `$amount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  let totalClientMinus = 0;
  if (clientExpoLimit[0]) {
    totalClientMinus = -1 * clientExpoLimit[0].totalClientMinus;
  }
  if (totalClientMinus > checkExpoLimit) {
    return false;
  } else {
    return true;
  }
};

const CasinoProfitLossAndComm = async (bodyData) => {
  let playWhere = {};
  playWhere.overallType = "internationalCasino";
  let showDate = _date();
  if (bodyData.date) {
    showDate = await _date(bodyData.date);
  }
  let todayDate = moment().startOf("day").valueOf();
  if (bodyData.date) {
    todayDate = moment(bodyData.date).startOf("day").valueOf();
  }
  let dateWhere = await dateWhereCond(todayDate);
  playWhere.date = dateWhere;
  let groupCond = {
    _id: {
      clientId: "$clientId",
      marketId: "$marketId",
    },
    gameName: { $first: "$remarks" },
    agentId: { $first: "$agentId" },
    superagentId: { $first: "$superagentId" },
    masterId: { $first: "$masterId" },
    subadminId: { $first: "$subadminId" },
    adminId: { $first: "$adminId" },
    superadminId: { $first: "$superadminId" },
    subownerId: { $first: "$subownerId" },
    ownerId: { $first: "$ownerId" },
    clientTotalProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
              { $eq: ["$overallType", "internationalCasino"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    agentProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$agentAmount",
          0,
        ],
      },
    },
    superagentProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$superagentAmount",
          0,
        ],
      },
    },
    masterProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$masterAmount",
          0,
        ],
      },
    },
    subadminProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$subadminAmount",
          0,
        ],
      },
    },
    adminProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$adminAmount",
          0,
        ],
      },
    },
    superadminProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$superadminAmount",
          0,
        ],
      },
    },
    subownerProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$subownerAmount",
          0,
        ],
      },
    },
    ownerProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$overallType", "internationalCasino"] },
              { $eq: ["$isDeclare", 1] },
              { $eq: ["$forBet", 1] },
            ],
          },
          "$ownerAmount",
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
  ]);

  let positionData = [];
  resData.forEach((data) => {
    let userData = data._id;
    let pushData = {
      userId: userData.clientId,
      clientId: userData.clientId,
      marketId: userData.marketId,
      agentId: data.agentId,
      superagentId: data.superagentId,
      masterId: data.masterId,
      subadminId: data.subadminId,
      adminId: data.adminId,
      superadminId: data.superadminId,
      subownerId: data.subownerId,
      ownerId: data.ownerId,
      eventName: `${data.gameName} (${showDate})`,
      isDeclare: 1,
      isCasino: 1,
      clientNetAmount: data.clientTotalProfitLoss,
      clientOddsAmount: data.clientTotalProfitLoss,
      agentNetProfitLoss: data.agentProfitLoss,
      superagentNetProfitLoss: data.superagentProfitLoss,
      masterNetProfitLoss: data.masterProfitLoss,
      subadminNetProfitLoss: data.subadminProfitLoss,
      adminNetProfitLoss: data.adminProfitLoss,
      superadminNetProfitLoss: data.superadminProfitLoss,
      subownerNetProfitLoss: data.subownerProfitLoss,
      ownerNetProfitLoss: data.ownerProfitLoss,
      date: todayDate,
      positionType: "internationalCasino",
    };
    positionData.push(pushData);
  });
  await profitLossPosition.deleteMany({
    date: dateWhere,
    isCasino: 1,
    isDeclare: 1,
  });
  await profitLossPosition.create(positionData);
  return positionData;
};

const checkLastBetTiming = async (
  userId,
  checkTimer = process.env.BET_WAITING_TIMER
) => {
  let lastBetTime = await client.get(`lastBetTimeUser__${userId}`);
  let returnStatus = true;
  if (lastBetTime) {
    const currentResTime = Date.now();
    const timeDifferenceInSec = (currentResTime - parseInt(lastBetTime)) / 1000;
    if (checkTimer > timeDifferenceInSec) {
      returnStatus = false;
    }
  }
  return returnStatus;
};


async function getUserCoinsByTransactionTable(userId) {
  let groupCond = {
    _id: "$userId",
    totalCoins: { $sum: "$amount" },
  };
  let commCoinShow = true
  if(process.env.COMM_COINS_UPDATE_IN_USER_LIST && process.env.COMM_COINS_UPDATE_IN_USER_LIST=="false"){
    commCoinShow = false
  }
  if(!commCoinShow){
    groupCond.totalCoins = {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isComm", 0] }],
          },
          `$amount`,
          0,
        ],
      },
    };
  }
  var res = await TransactionLogModel.aggregate([
    {
      $match: { userId: new ObjectId(userId)},
    },
    {
      $group: groupCond,
    },
  ]);
  return res[0];
}

module.exports = {
  UpdateUserCoins,
  GetUserCoins,
  insertTransactionLog,
  updateCoinsTbl,
  updateAccountCoins,
  getSessionPositionByTransaction,
  GetUserCoinsByMarketId,
  updateBulkCoinsExposureUserByMarketId,
  wholeTransactionMarketData,
  insertTransactionLogCasino,
  casinoReportByUser,
  userIntCasinoExpoLimit,
  checkIntBetExpoLimit,
  CasinoProfitLossAndComm,
  insertInternationalTransactionLogCasino,
  insertTransactionLogMatka,
  checkLastBetTiming,
  getUserCoinsByTransactionTable
};
