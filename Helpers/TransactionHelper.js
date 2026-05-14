const TransactionLogModel = require("../Models/TransactionLog.model");
const crickTransactionLModel = require("../Models/crickTransaction.model");
const UserModel = require("../Models/User/User.model");
const UserInternationExpoLimitModel = require("../Models/User/UserInternationalExpoLimit.model");
const AccountCoins = require("../Models/User/AccountCoins.model");
const PlayModel = require("../Models/Play.model");
const profitLossPosition = require("../Models/BetsList/profitLossPosition.model");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const {
  _dx,
  _d,
  dateWhereCond,
  _date,
  _date_time,
  throughSocketDataByAxios,
  chunkArrayNew,
  caclculateTime,
  getSettingData,
  gameBetValidaterRedis
} = require("./CommonHelper");
const { InsertUserStatement } = require("./StatementHelper");
const { returnResponse } = require("../Helpers/ResponseMapper");
const bcrypt = require("bcrypt");
const constant = require("../utils/constants");
// const { setUserRedisData } = require("../Services/User/User.service");
const { client } = require("./RedisHelper");
const { siteSetting } = require("../Common/Constants");
const {
  checkUserTransactionPassword
} = require("../Helpers/UsersUtils");

const {emitToUser} =  require("../socket.js")


require("dotenv").config();

const UpdateUserCoins = async (
  coins,
  userId,
  parentData,
  userRemark,
  transactionPassword,
  onCreate,
  isCash = false
) => {
  let returnData = {}
  let parentUserIdType = `${parentData.userType}Id`;
  let [settingData , userData] = await Promise.all([getSettingData(), UserModel.findOne(
    {
      [parentUserIdType]: parentData.userId,
      _id: userId,
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
  )]);

  if (!userData) {
    return returnResponse("error", "User is inactive, Please active first.");
  }



  let [creatorData ,  realUserCoins] = await Promise.all([UserModel.findOne(
    {
      _id: userData.creatorId,
      status: 1,
      isDeleted: false,

      [parentUserIdType]: parentData.userId,
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
  ),
    getUserCoinsByTransactionTable(userId)
  ])


  //_d(realUserCoins , "realUserCoins")
  if (!creatorData) {
    return "error", "Creator is inactive, Please active first.";
  }

  if (settingData.isTransactionPassword && settingData.isTransactionPassword == true) {
    if (!transactionPassword) {
      return returnResponse("error", "Transaction Password Is required");
    }
    const isTransactionPasswordCorrect =  await checkUserTransactionPassword(creatorData.userId , transactionPassword,
      creatorData.transactionPassword)
    if (!isTransactionPasswordCorrect) {
      return returnResponse("error", "Transaction Password Is Wrong");
    }
  }

  const creatorCoins = creatorData.coins;

  let userCoins = userData.coins;
  if(realUserCoins && realUserCoins.totalCoins){
    userCoins = realUserCoins.totalCoins
  }
  
  const updateCoinsWithoutSign = Math.abs(coins);

  if (coins < 0 && updateCoinsWithoutSign > userCoins) {
    return returnResponse(
      "error",
      `Maximum ${userCoins} coins can be debited for user: ${userData.username}`
    );
  }

  if (coins > 0) {
    if (coins > creatorCoins) {
      return returnResponse("error", "User doesn't have sufficient coins.");
    }
  }

  if (userData.userType == "client") {
    let checkBet = await gameBetValidaterRedis(userId, "check")
    if (checkBet) {
      return returnResponse("error", "User is placing bet, Please try after some time.");
    }
  }



  let creatorDepositWithdrawType = `deposit to ${userData.username}`;
  let userDepositWithdrawType = `deposit to ${userData.username}`;

  let userStatementStatus = "deposit";

  const creatorUsertypeId = `${creatorData.userType}Id`;
  let creatorCoinsUpdated = coins * -1;

  if (creatorCoinsUpdated > 0) {
    creatorDepositWithdrawType = `withdraw from  ${userData.username}`;
  }

  const creatorTransaction = await TransactionLogModel.create({
    userId: userData.creatorId,
    userType: creatorCoins.userType,
    amount: creatorCoinsUpdated,
    overallType: "depositWithdraw",
    // remarks: `Coins updated from ${parseFloat(creatorCoins)} to ${parseFloat(
    //   creatorCoinsUpdated + creatorCoins,
    remarks: `${creatorDepositWithdrawType}`,
    [creatorUsertypeId]: creatorData.userId,
    userType: creatorData.userType,
    isDeclare: 1, 
  });

  returnData.creatorTransactionId = creatorTransaction._id



  let statementDataCreator = {
    transactionId: creatorTransaction._id,
    amount: creatorCoinsUpdated,
    oldAmount: creatorCoins,
    newAmount: creatorCoinsUpdated + creatorCoins,
    statementFor: constant.ACCOUNT_STATEMENT,
    userRemark: userRemark,
    remark: `Coins updated to ${userData.name} ( ${userData.username} ) by ${parentData.username}`,
  };

  //_dx(statementDataCreator);



  // await updateCoinsTbl(userData.creatorId, creatorData.userType);

  const updatedUserCoins = userCoins + parseInt(coins);

  const UsertypeId = `${userData.userType}Id`;

  if (coins < 0) {
    userDepositWithdrawType = `withdraw from  ${userData.username}`;
    userStatementStatus = "withdraw";
  }

  const userTransaction = await TransactionLogModel.create({
    userId,
    amount: coins,
    overallType: "depositWithdraw",
    userType: userData.userType,
    remarks: `${userDepositWithdrawType}`,
    [UsertypeId]: userData.userId,
    isDeclare: 1,
  });

  returnData.userTransactionId = userTransaction._id


  let statementDataUser = {
    transactionId: userTransaction._id,
    amount: coins,
    oldAmount: userCoins,
    newAmount: updatedUserCoins,
    userRemark: userRemark,
    statementFor: constant.ACCOUNT_STATEMENT,
    remark: `Coins ${userStatementStatus} from ${parseFloat(
      userCoins
    )} to ${parseFloat(updatedUserCoins)}  AND Received From ${
      creatorData.name
    } (${creatorData.username}) by ${parentData.username}-(${parentData.name})`,
  };


  




  creatorData.coins = updatedUserCoins;



    let crickArray = [];
    let COINS_DIVIDER = 100
    if(process.env.COINS_DIVIDER){
      COINS_DIVIDER = process.env.COINS_DIVIDER
    }

    let creatorRemarkCrick = `${userRemark}[${
      creatorCoinsUpdated > 0 ? "Withdraw From" : "Deposit To"
    }  ${userData.username} by ${creatorData.username} of ${Math.abs(
      Math.round(creatorCoinsUpdated / COINS_DIVIDER , 2)
    )}- (${_date_time()})]`;


    let crickCreatorTransaction = {
      amount: creatorCoinsUpdated,
      [creatorData.userType+"ProfitLoss"] : creatorCoinsUpdated,
      transactionType: "depositWithdrawal",
      remarks: creatorRemarkCrick,
      userId: creatorData.userId,
      creatorId: creatorData.userId,
      [creatorData.userType+"Id"] : creatorData.userId,
      [`${creatorData.userType}ProfitLoss`]: creatorCoinsUpdated,
    };


    if(isCash){
      crickCreatorTransaction.isCash = isCash
    }

    
    
    let userRemarkCrick = `${userRemark}[${
      coins < 0 ? "Withdraw From" : "Deposit To"
    }  ${userData.username} by ${creatorData.username} of ${Math.abs(
      Math.round(coins / COINS_DIVIDER , 2)
    )} - (${_date_time()})]`;

    let crickUserTransaction = {
      amount: coins,
      transactionType: "depositWithdrawal",
      remarks: userRemarkCrick,
      userId: userData.userId,
      creatorId: creatorData._id,
      [userData.userType+"Id"] : userData.userId,
      [`${userData.userType}ProfitLoss`]: coins,
    };

    if(isCash){
      crickUserTransaction.isCash = isCash
    }
  
  
  
  let [ crickTransactionCreator , crickTransactionUser ] =  await Promise.all([ 
       crickTransactionLModel.create(crickCreatorTransaction),
       crickTransactionLModel.create(crickUserTransaction),
  ])

    
  let [ crestorUpdateData , userUpdateData , userStatement , creatorStatement] =  await Promise.all([ 
       updateCoinsTbl(userData.creatorId, creatorData.userType),
       updateCoinsTbl(userId, userData.userType),
       InsertUserStatement(statementDataUser, userData),
       InsertUserStatement(statementDataCreator, creatorData)
  ])
  
  returnData.crickTransactionCreatorId = crickTransactionCreator._id
  returnData.crickTransactionUserId = crickTransactionUser._id
  returnData.userStatementId = userStatement._id
  returnData.creatorStatementId = creatorStatement._id

   if (!onCreate && siteSetting.IS_REDIS) {
    await updateCoinsAndExposure(userData.userId);
  }




  
  return returnResponse("success", "Coins Updated Successfully" , returnData);
};

const updateCoinsAndExposure = async (userId, userData) => {
  try {
    if (!userData) {
      userData = await UserModel.findOne({
        userId: userId,
      });
      userData = JSON.parse(JSON.stringify(userData));
    }
    await client.hmset(
      userId + "",
      "coins",
      userData?.coins,
      "status",
      userData?.status,
      "isDeleted",
      userData?.isDeleted,
      "jwtToken",
      userData?.jwtToken + ""
    );
    if (userData.userType == "client") {
      await client.hmset(
        userId + "",
        "exposure",
        userData.exposure,
        "profitLoss",
        userData.totalProfitLoss
      );
    }
  } catch (error) {
    console.log(error);
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
  

  let finalLogData = {
    ...transactionLog,
    ...logData,
  };

  

  try {
    const transaction = await TransactionLogModel.create(finalLogData);
    return transaction._id;
  } catch (error) {
    console.log("insert Transaction Helper Error", error);
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
    console.log("insert Transaction Helper Error", error);
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
    console.log("insert Transaction Helper Error", error);
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
    console.log("insert Transaction Helper Error", error);
  }
}

const updateCoinsTbl = async (userId, userType) => {
  const userCoins = await GetUserCoins(userId, userType);
 // _d(userCoins , "userCoins")
  let setObj = {
    coins: userCoins.totalCoins,
    exposure: userCoins.exposure,
    profitLoss: userCoins.profitLoss,
    totalProfitLoss: userCoins.profitLoss,
    creditReference:  userCoins.creditReference ? userCoins.creditReference : 0,
  };

  try {
    await UserModel.updateOne(
    { _id: userId },
    {
      $set: setObj,
    }
  );

    if (siteSetting.IS_REDIS) {
      client.hmset(
        userId + "",
        "coins",
        userCoins.totalCoins,
        "exposure",
        userCoins.exposure,
        "profitLoss",
        userCoins.profitLoss,
        "creditReference",
        userCoins.creditReference ? userCoins.creditReference : 0
      );
    }

     if (siteSetting.IS_SOCKET) { 
          updateData = {
            coins: userCoins.totalCoins,
            exposure: userCoins.exposure,
            profitLoss: userCoins.profitLoss,
            creditReference:  userCoins.creditReference ? userCoins.creditReference : 0,
        }
       emitToUser("coinUpdate" ,updateData ,  userId)
     }

  } catch (error) {
    console.log(
      "save coins and exposure in redis error in transaction helper",
      error
    );
  }
  return userCoins;
};

async function GetUserCoins(id, userType) {
  if (!userType) {
    const userData = await UserModel.findOne({ _id: id }, { userType: 1 });
    userType = userData.userType;
  }

  let userAmountField = `amount`;
  let groupCond = {
    _id: "$userId",
    totalCoins: { $sum: "$amount" },
    exposure: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$isDeclare", 0] }, { $eq: ["$forBet", 1] }],
          },
          `$${userAmountField}`,
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
    creditReference: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$overallType", "depositWithdraw"] } , { $eq: ["$isCash", false] } ],
          },
          `$amount`,
          0,
        ],
      },
    },
  };


  if (userType == "client") {
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
  }


const transactionPromise = TransactionLogModel.aggregate([
  {
    $match: { userId: new ObjectId(id) },
  },
  {
    $group: groupCond,
  },
]);

let crickPromise = Promise.resolve(null);

// if (userType === "client") {
//   const query = { userId : new ObjectId(id)};
//   const crickGroup = {
//     _id: "$userId",
//     depositWithdraw: {
//       $sum: {
//         $cond: [
//           {
//             $or: [
//               { $eq: ["$transactionType", "depositWithdrawal"] },
//               {
//                 $and: [
//                   { $eq: ["$transactionType", "ledger"] },
//                   { $lt: ["$amount", 0] }
//                 ]
//               }
//             ]
//           },
//           "$amount",
//           0
//         ]
//       }
//     }
//   };

//   crickPromise = crickTransactionLModel.aggregate([
//     { $match: query },
//     { $group: crickGroup },
//   ]);
// }
  


  const query = { userId : new ObjectId(id) , creatorId : {$ne : new ObjectId(id)}};
  const crickGroup = {
    _id: "$userId",
    depositWithdraw: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }],
          },
          `$amount`,
          0,
        ],
      },
    },
  };

  crickPromise = crickTransactionLModel.aggregate([
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

// if (
//   userType === "client" &&
//   crickRes.status === "fulfilled" &&
//   crickRes.value &&
//   crickRes.value.length
// ) {
//   const creditReference = crickRes.value[0].depositWithdraw || 0;
//   if (res.length) {
//     res[0].creditReference = creditReference;
//   }
  // }
  
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
  
  return res[0];
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
    userData = await UserModel.findOne(
      { _id: userId },
      {
        userType: 1,
      }
    );
    userType = userData.userType;
  }

  let field = `${userType}Id`;

  var res = await UserModel.aggregate([
    {
      $match: { [field]: new ObjectId(userId) },
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
                  { $eq: [`$${userType}Id`, userId] },
                  { $ne: ["$_id", userId] },
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
                  { $eq: [`$${userType}Id`, userId] },
                  { $ne: ["$_id", userId] },
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
                  { $eq: [`$${userType}Id`, userId] },
                  { $ne: ["$_id", userId] },
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
                  { $eq: [`$${userType}Id`, userId] },
                  { $ne: ["$_id", userId] },
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


const updateData = res[0];
let returnData = {}
  if(res[0]){
   let updateObject = {
      userId: userId,
      UpperLevelCreditReffrence: updateData?.userCreditReference,
      DownLevelCreditReffrence: updateData?.totalDownLevelCreditReference,
      totalMasterBalance: updateData?.userCoins,
      upperLevel: 0,
      downLevelProfitLoss: updateData?.totalDownLevelProfitLoss,
      downlLevelOccupancyBalance: updateData?.totalDownLevelAvailableBalance,
      availableBalance: updateData?.userCoins,
      availableBalanceProfitLoss:
        parseInt(updateData.userCoins) + updateData.userProfitLoss,
      userProfitLoss: updateData?.userProfitLoss,
    };
  
    try {
      await client.hmset(
        userId + "",
        "accountDetails",
        JSON.stringify(updateObject)
      );
    } catch (error) {
      console.log(
        "Save Account Details in redis error in transaction helper ",
        error
      );
    }
    await AccountCoins.updateOne({ _id: userId }, updateObject, {
      upsert: true,
    });

    returnData = updateObject
  }

  return returnData;
};

const getSessionPositionByTransaction = async (userData, selectionId , marketId) => {
  const id = userData.userId;
  selectionId = selectionId
  var res = await TransactionLogModel.aggregate([
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
  let startTime = new Date();
  let playWhere = {
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

startTime = new Date();

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
      let userArray = [];
      updateUserData.map(async (user) => {
        let userId = user._id;
        let updateData  = {
          coins: user.coins,
          exposure: user.exposure,
          profitLoss: user.totalProfitLoss,
        }
        emitToUser("coinUpdate",updateData,userId)
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
  // return res?.[0]?.totalCoins;
  return res[0];
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
  const IS_REDIS = process.env.IS_REDIS;
  if (!userData) {
    userData = await UserModel.findOne({ userId: userId });
  }

  if (!creatorData) {
    const creatorId = userData.creatorId;
    creatorData = await UserModel.findOne({ userId: creatorId });
  }

  let userExpoLimit = userData.intCasinoExpoLimit;
  let creatorExpoLimit = creatorData.intCasinoExpoLimit;

  if (!creatorExpoLimit) {
    creatorExpoLimit = 0;
  }
  if (!userExpoLimit) {
    userExpoLimit = 0;
  }

  if (amount > 0 && amount > creatorExpoLimit) {
    return returnResponse("error", "insufficient Int Exposure Limit");
  }

  if (amount < 0 && Math.abs(amount) > userExpoLimit) {
    return returnResponse(
      "error",
      "Int Exposure Limit can not be less than userExpo Limit"
    );
  }

  let expoObjComm = {
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

  await UserInternationExpoLimitModel.create(expoObjComm);
  let parentAmount = -1 * amount;
  expoObjComm.amount = parentAmount;
  expoObjComm.userType = creatorData.userType;
  expoObjComm.userId = creatorData.userId;
  expoObjComm.remark = `${creatorData.name} (${creatorData.username}) ${
    parentAmount < 0 ? "give" : "take"
  } chips ${parentAmount < 0 ? "to" : "from"} ${userData.name} (${
    userData.username
  })`;

  await UserInternationExpoLimitModel.create(expoObjComm);

  var totalUserExpoLimit = await UserInternationExpoLimitModel.aggregate([
    {
      $match: { userId: new ObjectId(userId) },
    },
    {
      $group: {
        _id: "$userId",
        userExpoLimit: { $sum: "$amount" },
      },
    },
  ]);

  await UserModel.where("_id", userId).updateOne({
    $set: { intCasinoExpoLimit: totalUserExpoLimit[0].userExpoLimit },
  });

  if (IS_REDIS) {
    await client.set(`${userId}_INT_EXPO`, totalUserExpoLimit[0]);
    await client.expire(`${userId}_INT_EXPO`, 60 * 60 * 60 * 24);
  }

  var totalCreatorExpoLimit = await UserInternationExpoLimitModel.aggregate([
    {
      $match: { userId: new ObjectId(creatorData.userId) },
    },
    {
      $group: {
        _id: "$userId",
        creatorExpoLimit: { $sum: "$amount" },
      },
    },
  ]);

  await UserModel.where("_id", creatorData.userId).updateOne({
    $set: { intCasinoExpoLimit: totalCreatorExpoLimit[0].creatorExpoLimit },
  });

  if (IS_REDIS) {
    await client.set(
      `${creatorData.userId}_INT_EXPO`,
      totalCreatorExpoLimit[0]
    );
    await client.expire(`${creatorData.userId}_INT_EXPO`, 60 * 60 * 60 * 24);
  }

  return returnResponse(
    "success",
    "exposure limit updated successfully",
    totalUserExpoLimit[0].userExpoLimit
  );
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
    timeDifferenceInSec = (currentResTime - parseInt(lastBetTime)) / 1000;
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
