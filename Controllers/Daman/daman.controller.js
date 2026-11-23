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
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const StatementModel = require("../../Models/Statement.model");
const DeleteBetsDataModel = require("../../Models/deleteBetsData.model");
const sportsMarketListModel = require("../../Models/sportsMarketList.model");
var requestIp = require("request-ip");
const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
  GetUserCoins,
  updateCoinsTbl,
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");
const BetService = require("../../Services/Sports/Bet.service");
const sportListModel = require("../../Models/sportList.model");

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
  const loginData = req.loggedInUser
  let clientIp = requestIp.getClientIp(req);

  
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

  let positionDataReload = false
  let userIdAray = []
  let marketIdArray = []
  let returnData = []
  let updatatesBetArray = []
  let oldData  = {}
  let updateBetsData = {
    userInfo: loginData,
    ip : clientIp
  }

  for (const element of betsIdArray) {
  let updateObjReturn = {}
  const betsType = element.betsType;
  const updateObj = element.updateObj || {};
  const userId = new ObjectId(element.userId);
  const betId = new ObjectId(element.betId);
  delete updateObj.createdAt
  
    if (betsType === "fancy") {
      oldData = await FancyBetModel.findOne({ userId: userId, _id: betId },)
      updateObjReturn = await FancyBetModel.updateOne(
       { userId: userId, _id: betId },
       { $set: updateObj }
     );
   } else if (betsType === "diamondCasino") {
     updateObjReturn = await casinoBetModel.updateOne(
       { userId: userId, _id: betId },
       { $set: updateObj }
     )
    } else if (betsType === "odds" && updateObj.odds > 0 && updateObj.odds < 2) {
      
      oldData = await BetModel.findOne({
       _id : betId
      })

      let profit = oldData.profit
      let loss = oldData.loss
      let type = updateObj.type
      let oddsType = oldData.oddsType
    
      if (type == "K") {
        profit = updateObj.amount
        loss = -1 * updateObj.amount * updateObj.odds
      } else {
        profit = updateObj.amount * updateObj.odds
        loss = -1 * updateObj.amount
      }

      let positionInfo = {};
      let positionInfoBet = [];

      updateObj.profit = Number(profit)
      updateObj.loss = Number(loss)
      
      oldData.profit = Number(profit)
      oldData.loss = Number(loss)
      oldData.type = updateObj.type
      oldData.amount = updateObj.amount
      oldData.odds = updateObj.odds
      positionInfoBet.push(oldData);
      let teamData = []
      let matchData = await sportListModel.findOne({ marketId: oldData?.marketId })
      let marketListObj = {}
      let betfairMarketListAll = matchData.marketList ? matchData.marketList : []
      if (betfairMarketListAll && betfairMarketListAll.length > 0) {
        betfairMarketListAll.map((mar) => {
          marketListObj[mar.marketId] = mar
        })
      }

        let betfairMarketList = betfairMarketListAll.map(item => item.marketType)
        let manualMarketArray = [
          "matchOdds",
          "tiedMatch",
          "completeOdds",
        ]
      betfairMarketList = [...manualMarketArray, ...betfairMarketList];

        if (betfairMarketList.includes(oddsType) ){                     
            const marketData = await sportsMarketListModel.findOne({
              marketId: oldData.betfairMarketId,
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
      
      
      if (teamData) {
        let positionInfo = await BetService.betsMatchPosition(
              positionInfoBet,
          teamData,
              oddsType
        );
        updateObj.positionInfo = positionInfo
      }

      updateObjReturn = await BetModel.updateOne(
        { userId: userId, _id: betId },
        { $set: updateObj }
      )
      positionDataReload = true

    }
    
    userIdAray.push(userId)
    returnData.push(updateObjReturn)
    updateBetsData.betType = betsType
    updateBetsData.oldData = oldData
    updateBetsData.updateData = element
    updateBetsData.actionType = "update"
    updatatesBetArray.push(updateBetsData)

  }

  let insert = await DeleteBetsDataModel.insertMany(updatatesBetArray)
  
  return SendResponse(
    res,
     "success",
    "",
    returnData
  );
}

const deleteBetsDataPermanently = async (req,res)=>{
  const bodyData = req.body;
  const loginData = req.loggedInUser
  let clientIp = requestIp.getClientIp(req);

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
    if (bodyData.password != BETS_DELETE_PASSWORD) {
      return SendResponse(
        res,
        "error",
        "bets delete password is wrong please try again later"
      );
    }


  let returnData = []
  let clientIdArray = []
  let betsType = bodyData.betsType
  let deleteBetsData = []

  for (const element of betsIdArray) {
     const betId = new ObjectId(element);
    let updateObjReturn = {}
    
    if (betsType === "fancy") {
      let fancyBetDetails = await FancyBetModel.findOne(
        { _id: betId }
      )

      if (!fancyBetDetails) {
        return true
      }

      deleteBetsData.push({
        betType: "fancy",
        oldData: fancyBetDetails,
      })

      userId = new ObjectId(fancyBetDetails.userId);
      clientIdArray.push(userId)
     
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
      let casinoBetDetails = await casinoBetModel.deleteOne(
        { _id: betId }
      )

       if (!casinoBetDetails) {
        return true
       }
      
       deleteBetsData.push({
        betType: "casino",
        oldData: casinoBetDetails,
      })
      
      const userId = new ObjectId(casinoBetDetails.userId);
      clientIdArray.push(userId)
      
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

      // let deteleteTransactioLog = await TransactionLogModel.deleteMany({
      //   userId: userId,
      //   selectionId: selectionId,
      //   marketId: marketId,
      //   forBet:1
      // })
    }
    
    returnData.push(updateObjReturn)
  }

  await DeleteBetsDataModel.insertMany(deleteBetsData)
  clientIdArray = [...new Map(clientIdArray.map(id => [id.toString(), id])).values()];

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

const getUpdateDeleteBetData = async (req, res) => {
  try {
    const bodyData = req.body;
    const whereObj = {};

    if (bodyData.betType) {
      whereObj.betType = bodyData.betType
    }

   if (bodyData.username) {
      whereObj["data.userInfo.clientCode"] = bodyData.username;
   }
    
    
  if (bodyData.fromDate && bodyData.toDate) {
    whereObj.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }
    
    let returnData;
    let totalCount = 0;

    if (bodyData.pageNo && bodyData.pageSize) {
      const pageNo = Math.max(1, parseInt(bodyData.pageNo, 10));
      const pageSize = Math.max(1, parseInt(bodyData.pageSize, 10));
      const skip = (pageNo - 1) * pageSize;

      const [data, count] = await Promise.all([
          DeleteBetsDataModel.find(whereObj)
            .sort({ date: -1, _id: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean(),

          DeleteBetsDataModel.countDocuments(whereObj),
        ]);

      returnData = data;
      totalCount = count;



      return SendResponse(res, "success", "", {
        data: returnData,
        totalCount,
        pageNo,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      });
    }

    returnData = await DeleteBetsDataModel.find(whereObj)
    .sort({ date: -1, _id: -1 })
    .lean();

    return SendResponse(res, "success", "", returnData);
  } catch (error) {
    console.error("getUpdateDeleteBetData error:", error);

    return SendResponse(res, "error", "Something went wrong");
  }
};

module.exports = {
  depositWithdrawTotal,
  transferClientToClient,
  getDownlineList,
  getDownlineListByClientId,
  getTrackingActivites,
  checkIpAddress,
  deleteTrackingActivities,
  updateBetsData,
  deleteBetsDataPermanently,
  getUpdateDeleteBetData
};
