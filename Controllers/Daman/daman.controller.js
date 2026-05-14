const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const {
  getUserIdByUsername,
  checkUserPassword,
} = require("../../Helpers/UsersUtils");
const { ObjectId } = require("mongodb");
const Joi = require("joi");
const { siteSetting } = require("../../Common/Constants");
const {
  _dx,
  whereHelper,
  _d,
  dateWhereCond,
} = require("../../Helpers/CommonHelper");
const UserModel = require("../../Models/User/User.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const mlmChainListModel = require("../../Models/BtoC/mlmChainList.model");
const trackingctivites = require("../../Models/User/Tracking.model");
const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const matkaBetModel = require("../../Models/Matka/MatkaBets.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const StatementModel = require("../../Models/Statement.model");

const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
  GetUserCoins,
  updateCoinsTbl,
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");



const { InsertUserStatement } = require("../../Helpers/StatementHelper");

const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const depositWithdrawTotal = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  let where = await whereHelper(loggedUserData);
  if (bodyData.fromDate && bodyData.toDate) {
    where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.status) {
    where.status = bodyData.status;
  }

  let groupCond = {
    _id: {
      date: "$date",
    },
    totalDeposit: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$reqType", "deposit"] },
              { $eq: ["$status", "accept"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    totalFakeDeposit: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$reqType", "deposit"] },
              { $eq: ["$status", "cancel"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    totalWithdraw: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$reqType", "withdraw"] },
              { $eq: ["$status", "accept"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    pendingWithdraw: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$reqType", "withdraw"] },
              { $eq: ["$status", "pending"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
    pendingDeposit: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$reqType", "deposit"] },
              { $eq: ["$status", "pending"] },
            ],
          },
          "$amount",
          0,
        ],
      },
    },
  };

  var resData = await DepositWithdrawModel.aggregate([
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

  if (res) {
    return SendResponse(res, "success", "success", resData);
  } else {
    return resData;
  }
};

const transferClientToClient = async (req, res) => {
  const bodyData = req.body;
  const JoiSchema = Joi.object({
    amount: Joi.number().greater(0).required(),
    password: Joi.string().required(),
    username: Joi.string(),
    clientId: Joi.string(),
  }).options({ abortEarly: true, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  if (userType != "client") {
    return SendResponse(
      res,
      "error",
      "only client authorized to transfer wallet coins"
    );
  }

  let checkDownline = true;

  if (bodyData.username) {
    let usernameData = await getUserIdByUsername(bodyData.username);
    if (usernameData.status != "success") {
      return SendResponse(res, "error", "username not found");
    }
    let clientDetails = usernameData.userDetails;
    bodyData.clientId = clientDetails.userId;
    checkDownline = false;
  }

  let { clientId, amount, password } = bodyData;

  if (checkDownline) {
    let checkClientIsFirstDownline = await mlmChainListModel.countDocuments({
      userId: clientId,
      firstLayerId: userId,
    });
    if (checkClientIsFirstDownline !== 1) {
      return SendResponse(
        res,
        "error",
        "wallet can transfer to only self downline"
      );
    }
  }

  let userData = await UserModel.findOne(
    { _id: userId, status: 1, isDeleted: 0 },
    {
      coins: 1,
      username: 1,
      userType: 1,
      name: 1,
      creatorId: 1,
      password: 1,
      userId: 1,
    }
  );

  if (!userData) {
    return SendResponse(
      res,
      "error",
      "you are disabled by admin please conatct your admin"
    );
  }

  let userDataPasswordCheck = await checkUserPassword(
    userId,
    password,
    userData.password,
    true
  );

  if (!userDataPasswordCheck) {
    return SendResponse(
      res,
      "error",
      "password is wrong please enter correct password"
    );
  }

  let clientData = await UserModel.findOne(
    { _id: clientId, status: 1, isDeleted: 0 },
    {
      coins: 1,
      username: 1,
      userId: 1,
      userType: 1,
      name: 1,
      creatorId: 1,
    }
  );

  if (!clientData) {
    return SendResponse(
      res,
      "error",
      "client is inactive by admin contact your admin first"
    );
  }

  let userCoins = userData.coins;
  let clientCoins = userData.coins;

  if (amount > 0 && userCoins < amount) {
    return SendResponse(
      res,
      "error",
      `entered wallet is invalid you have maximum transfer wallet is ${userCoins}`
    );
  }

  let clientUpdateLimit = {
    userId: clientData._id,
    userType: "client",
    amount: amount,
    oldAmount: clientCoins,
    newAmount: amount + clientCoins,
    overallType: "walletTransfer",
    forBet: 0,
    isDeclare: 0,
    remark: `coins deposit by ${userData.username} to ${clientData.username}`,
  };

  let transactionClient = await TransactionLogModel.create(clientUpdateLimit);

  let statementDataCreatorClient = {
    transactionId: transactionClient._id,
    amount: amount,
    oldAmount: clientCoins,
    newAmount: amount + clientCoins,
    statementFor: "walletTransfer",
    userRemark: `coins deposit by ${userData.username} to ${clientData.username}`,
    remark: `coins deposit by ${userData.username} to ${clientData.username}`,
  };

  await InsertUserStatement(statementDataCreatorClient, clientData);

  let userUpdateLimit = {
    userId: userData._id,
    userType: "client",
    amount: -1 * amount,
    oldAmount: userCoins,
    newAmount: -1 * amount + userCoins,
    overallType: "walletTransfer",
    forBet: 0,
    isDeclare: 0,
    remark: `coins deposit to ${clientData.username} by ${clientData.username}`,
  };
  let transactionUser = await TransactionLogModel.create(userUpdateLimit);

  let statementDataCreatorUser = {
    transactionId: transactionUser._id,
    amount: -1 * amount,
    oldAmount: userCoins,
    newAmount: -1 * amount + userCoins,
    statementFor: "walletTransfer",
    userRemark: `coins deposit by ${userData.username} to ${clientData.username}`,
    remark: `coins deposit by ${userData.username} to ${clientData.username}`,
  };

  await InsertUserStatement(statementDataCreatorUser, userData);

  await updateCoinsTbl(clientData.userId, clientData.userType);

  await updateCoinsTbl(userData.userId, userData.userType);

  return SendResponse(
    res,
    "success",
    "wallet has been transferred successfully"
  );
};

const getDownlineList = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  let where = {};
  if (!bodyData.layerType) {
    bodyData.layerType = "first";
  }
  where[`${bodyData.layerType}LayerId`] = new ObjectId(userId);
  let checkClientIsFirstDownline = await mlmChainListModel.find(
    where,
    {
      userId: 1,
      username: 1,
      createdAt: 1,
    },
    {
      sort: {
        _id: -1,
      },
    }
  );
  return SendResponse(
    res,
    "success",
    "wallet has been transferred successfully",
    checkClientIsFirstDownline
  );
};


const getDownlineListByClientId = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = bodyData.userId;
  let where = {};
  if (!bodyData.layerType) {
    bodyData.layerType = "first";
  }
  where[`${bodyData.layerType}LayerId`] = new ObjectId(userId);
  let checkClientIsFirstDownline = await mlmChainListModel.find(
    where,
    {
      userId: 1,
    }
  );

  return SendResponse(
    res,
    "success",
    "wallet has been transferred successfully",
    checkClientIsFirstDownline
  );
};


const getTrackingActivites = async (req,res)=>{
  const bodyData = req.body;
  let username = bodyData.username
   username  = username.toUpperCase() 
  let userData = await UserModel.findOne({
   checkUsername : username
  })
  if(!userData){
    return SendResponse(
      res,
      "error",
      "user not found",
    );
  }
  let parentData = userData.parentData


  let checkIdUsername = [userData?.username , parentData?.agentuserName, parentData?.superagentuserName, parentData?.masteruserName, parentData?.subadminuserName, parentData?.adminuserName, parentData?.superadminuserName]
  let returnData  = {
    username : { $in : checkIdUsername },
    clientUserId : `ObjectId('${userData._id}')`,
    parentData: parentData,
    clientUsername : userData.username,
    clientName : userData.name,
    coins : userData.coins.toFixed(2),
    totalProfitLoss: userData.totalProfitLoss.toFixed(2),
    parentData:parentData
  }
  
  

  let queryWhere = {
    username : { $in : checkIdUsername },
  }

   if (bodyData.fromDate && bodyData.toDate) {
    queryWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  let limitData = bodyData.size ? parseInt(bodyData.size, 10) : 50;
  if (!Number.isFinite(limitData) || limitData <= 0) limitData = 50;
  let pageNo = bodyData.pageNo ? parseInt(bodyData.pageNo, 10) : 1;
  if (!Number.isFinite(pageNo) || pageNo <= 0) pageNo = 1;
  const skipData = limitData * (pageNo - 1);


  const totalDocuments = await trackingctivites.countDocuments(queryWhere);

  const trackingData = await trackingctivites
    .find(
      queryWhere,
      {
        username: 1,
        hitUrl: 1,
        bodyData: 1,
        createdAt: 1,
        ip: 1,
      }
    )
    .sort({ _id: -1 })
    .skip(skipData)
    .limit(limitData)
    .allowDiskUse(true);
  
    if(trackingData.length > 0){
      returnData.trackingData = trackingData
    }else{
      returnData.trackingData = []
    }
  
  returnData.totalDocuments = totalDocuments ? totalDocuments : 0

  returnData.parentData = parentData
  
    return SendResponse(
      res,
      "success",
      "",
      returnData,
    );
}

const checkIpAddress = async (req,res)=>{
  const bodyData = req.body;
  let ip = bodyData.ip
  if(!ip){
    return SendResponse(
      res,
      "error",
      "ip address is required",
    );
  }


  let queryWhere = {
    ip: ip,
  } 

  if (bodyData.username) {
    let username = bodyData.username;
    queryWhere.username = username;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    queryWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }


  let trackResDataAggregator = [
    {
      $match: queryWhere,
    },
    {
      $group: {
        _id: "$username",
        count: { $sum: 1 },
      },
    },
    {
      $sort: {
        count: -1,
      },
    },
  ];  

  let returnData = {}

  let limitData = bodyData.size ? parseInt(bodyData.size, 10) : 500;
  if (!Number.isFinite(limitData) || limitData <= 0) limitData = 500;
  let pageNo = bodyData.pageNo ? parseInt(bodyData.pageNo, 10) : 1;
  if (!Number.isFinite(pageNo) || pageNo <= 0) pageNo = 1;
  const skipData = limitData * (pageNo - 1);
  const totalDocuments = await trackingctivites.countDocuments(queryWhere);

  returnData.ipDataCounts = await trackingctivites.aggregate(trackResDataAggregator);
  returnData.ipTrackingList  = await trackingctivites.find(queryWhere,{
    username :1 , 
    hitUrl :1,
    bodyData:1 ,
    createdAt: 1,
    ip:1
  }).sort({ _id: -1 })
    .skip(skipData)
    .limit(limitData)
    .allowDiskUse(true);
  

  returnData.totalDocuments = totalDocuments ? totalDocuments : 0
  
   return SendResponse(
    res,
     "success",
    "",
    returnData
  );
}

const deleteTrackingActivities = async (req,res)=>{
  const bodyData = req.body;
  let deleteWhere = {}
  if(bodyData && bodyData.username){
      let username = bodyData.username
      username  = username.toUpperCase() 
      let userData = await UserModel.findOne({
      checkUsername : username
      })
    
      let parentData  = userData.parentData
      let checkIdUsername = [userData?.username, parentData?.agentuserName, parentData?.superagentuserName, parentData?.masteruserName, parentData?.subadminuserName, parentData?.adminuserName, parentData?.superadminuserName]
      deleteWhere = {
        username : { $in : checkIdUsername },
      }
  }
  let trackingData  = await trackingctivites.deleteMany(deleteWhere)
   return SendResponse(
    res,
     "success",
    "",
    trackingData
   );
}


const updateBetsData = async (req,res)=>{
  const bodyData = req.body;
  if(bodyData && !bodyData.betsIdArray){
    return SendResponse(
      res,
      "error",
      "betsIdArray not found",
    );
  }

  betsIdArray = bodyData.betsIdArray
  if(betsIdArray && !Array.isArray(bodyData.betsIdArray)){
    return SendResponse(
      res,
      "error",
      "betsIdArray should be an array",
    );
  }

  if(betsIdArray && bodyData.betsIdArray.length == 0){
    return SendResponse(
      res,
      "error",
      "betsIdArray should not be empty",
    );
  }

  let returnData = []
  for (const element of betsIdArray) {
  let updateObjReturn = {}
  const betsType = element.betsType;
  const updateObj = element.updateObj || {};
  const userId = new ObjectId(element.userId);
  const betId = new ObjectId(element.betId);
   if (betsType === "fancy") {
      updateObjReturn = await FancyBetModel.updateOne(
       { userId: userId, _id: betId },
       { $set: updateObj }
     );
   } else if (betsType === "diamondCasino") {
     updateObjReturn = await casinoBetModel.updateOne(
       { userId: userId, _id: betId },
       { $set: updateObj }
     )
   }
   returnData.push(updateObjReturn)
  }
  
   return SendResponse(
    res,
     "success",
    "",
    returnData
   );
}


const deleteBetsDataPermanently = async (req,res)=>{
  const bodyData = req.body;
  if(bodyData && !bodyData.betsIdArray){
    return SendResponse(
      res,
      "error",
      "betsIdArray not found",
    );
  }

  betsIdArray = bodyData.betsIdArray
  if(betsIdArray && !Array.isArray(bodyData.betsIdArray)){
    return SendResponse(
      res,
      "error",
      "betsIdArray should be an array",
    );
  }

  if(betsIdArray && bodyData.betsIdArray.length == 0){
    return SendResponse(
      res,
      "error",
      "betsIdArray should not be empty",
    );
  }

   let BETS_DELETE_PASSWORD = process.env.BETS_DELETE_PASSWORD
    if (userData.userType == "subowner") {
      BETS_DELETE_PASSWORD = process.env.SUBOWNER_BETS_DELETE_PASSWORD ? process.env.SUBOWNER_BETS_DELETE_PASSWORD : process.env.BETS_DELETE_PASSWORD
    }
  
    if (bodyData.password != BETS_DELETE_PASSWORD) {
      return SendResponse(
        res,
        "error",
        "bets delete password is wrong please try again later"
      );
    }


  let returnData = []
  let clientIdArray = []
  for (const element of betsIdArray) {
  let updateObjReturn = {}
  const betsType = element.betsType;
  const updateObj = element.updateObj || {};
  const userId = new ObjectId(element.userId);
    const betId = new ObjectId(element.betId);
    clientIdArray.push(userId)
    if (betsType === "fancy") {
      let fancyBetDetails = await FancyBetModel.findOne(
        { userId: userId, _id: betId }
      )
      let marketId = fancyBetDetails.marketId
      let selectionId = fancyBetDetails.selectionId

      updateObjReturn = await FancyBetModel.deleteOne(
       { userId: userId, _id: betId , marketId : marketId, selectionId : selectionId   }
      );
      
      let deteleteTransactioLog = await TransactionLogModel.deleteMany({
        userId: userId,
        selectionId: selectionId,
        marketId: marketId,
        forBet:1
      })


      let statementModel = await StatementModel.deleteMany({
        userId: userId,
        selectionId: selectionId,
        marketId: marketId,
      })

      let crickModelStatement = await CrickTransactionLogModel.deleteMany({
        userId: userId,
        selectionId: selectionId,
        marketId: marketId,
      })
      
     await client.del(`${userId}_fancyData_${marketId}`);
     await client.del(`${userId}_oddsData_${marketId}`);

    } else if (betsType === "diamondCasino") {
      
    clientIdArray.push(userId)
     updateObjReturn = await casinoBetModel.deleteOne(
       { userId: userId, _id: betId }
     )
      
      
      // let statementModel = await StatementModel.deleteMany({
      //   userId: userId,
      //   selectionId: selectionId,
      //   marketId: marketId,
      // })

      // let crickModelStatement = await CrickTransactionLogModel.deleteMany({
      //   userId: userId,
      //   selectionId: selectionId,
      //   marketId: marketId,
      // })

      let deteleteTransactioLog = await TransactionLogModel.deleteMany({
        userId: userId,
        selectionId: selectionId,
        marketId: marketId,
        forBet:1
      })

      


   }
   returnData.push(updateObjReturn)
  }

   let ResponseMapper = await updateBulkCoinsExposureUserByMarketId(
        clientIdArray
    );
  
   return SendResponse(
    res,
     "success",
    "",
    returnData
   );
}


module.exports = {
  depositWithdrawTotal,
  transferClientToClient,
  getDownlineList,
  getDownlineListByClientId,
  getTrackingActivites,
  checkIpAddress,
  deleteTrackingActivities,
  updateBetsData,
  deleteBetsDataPermanently
};
