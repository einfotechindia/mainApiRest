const {
    SendResponse,
  } = require("../../Helpers/ResponseMapper");
  const { client } = require("../../Helpers/RedisHelper");
  const {
    getUserIdByUsername,
    checkUserPassword,
    getUpperLineAndDownlineOfUser
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
  const crickTransaction = require("../../Models/crickTransaction.model");
  const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
  const InternationalCasinoBlockModel = require("../../Models/Sports/internationalCasinoBlock.model");
  const {
    UpdateUserCoins,
    userIntCasinoExpoLimit,
    GetUserCoins,
    updateCoinsTbl,
  } = require("../../Helpers/TransactionHelper");
const { InsertUserStatement } = require("../../Helpers/StatementHelper");


const oddsBetsList = require("../../Models/BetsList/OddsBetsList.model");
  


  
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

const userListNew = async (req, res) => {
  try {
    const bodyData = req.body;
    const currentUser = req.loggedInUser;
    let userWhere = {};
    
    if (bodyData.searchValue) {
      const searchRegex = new RegExp(bodyData.searchValue, "i");
      userWhere.$or = [
        { username: searchRegex },
        { checkUsername: searchRegex },
        { name: searchRegex },
        { mobile: searchRegex }
      ];
    }

    if (bodyData.username) userWhere.$or = [
        { username: bodyData.username },
        { checkUsername: bodyData.username },
    ]

    if (bodyData.name) userWhere.name = bodyData.name;
    if (bodyData.status) userWhere.status = bodyData.status;
   
    if (bodyData.creatorId) userWhere.creatorId = new ObjectId(bodyData.creatorId);

    if (bodyData.fromDate && bodyData.toDate) {
      userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }
   
    if (bodyData.userId && bodyData.userType) {
      userWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId)
    }
    
    if (bodyData.downlineUserType) userWhere.userType = bodyData.downlineUserType;
    if (bodyData.downlineUserId) userWhere.downlineUserId = new ObjectId(bodyData.downlineUserId);

    
    if (bodyData.domain) {
      userWhere.allowedDomains = bodyData.domain
    }

    userWhere = whereHelper(currentUser, userWhere);

    userWhere = {
      ...userWhere,
      userId: { $ne: new ObjectId(currentUser.userId) }
    };



    const projection = {
        profitLoss: 1,
        coins: 1,
        exposure: 1,
        username: 1,
        userType:1,
        name: 1,
        checkUsername: 1,
        createdAt: 1,
        referral: 1,
        status: 1,
        betStatus: 1,
        matchStatus: 1,
        casinoStatus: 1,
        intCasinoStatus: 1,
        matkaStatus: 1,
        userMatchShare: 1,
        creditReference: 1,
        isDirect: 1,
        userPriority: 1,
        mobile: 1,
        userPoliticsShare: 1,
        userCasinoShare: 1,
        userMatkaShare: 1,
        userMatchShare: 1,
        intCasinoShare: 1,
        userCommissionType: 1,
        intCasinoMultiply: 1,
        creatorShareData: 1,
        userMatchCommission: 1,
        userSessionCommission: 1,
        userCasinoCommission: 1,
        userMatkaCommission: 1,
        userBetfairCommission: 1,
        userId: 1,
        allowedDomains: 1,
    }
    
    const limit = Number(bodyData.size) || 0;
    const skip = limit ? limit * (Number(bodyData.pageNo) - 1) : 0;
    const users = await UserModel.find(userWhere, projection)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCount = await UserModel.countDocuments(userWhere);

    if (!users.length) {
      return res.json({ status: true, totalCount, data: [] });
    }

    let userIds = []
    let ledgerMap = {}

      for (let index = 0; index < users.length; index++) {
        const element = users[index];
        userIds.push(new ObjectId(element.userId))
        let findUserId = new ObjectId(element.userId)
        let findUserType = element.userType
        let cretorUserType = element?.creatorShareData?.userType

     
              let ledgerAgg = await crickTransaction.aggregate([
              {
                $match: {
                   [`${findUserType}Id`]:findUserId
                }
              },
              {
                $group: {
                  _id: `$${findUserType}Id`,
                  userLedger: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        `$${findUserType}LedgerAmount`,
                        0
                      ]
                    }
                  },
                  userProfitLoss: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        `$${findUserType}ProfitLoss`,
                        0
                      ]
                    }
                  },
                userProfitLossCreatorType: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        `$${cretorUserType}ProfitLoss`,
                        0
                      ]
                    }
                  },
                  settledAmount: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "ledger"] ,  $eq: ["$userId", findUserId] },
                        `$${findUserType}LedgerAmount`,
                        0
                      ]
                    }
                  },
                  clientProfitLoss: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        "$clientProfitLoss",
                        0
                      ]
                    }
                  }

                }
              }
              ]);
    
        
        
        
        _d(ledgerAgg[0], "ledgerAgg[0]")
        

        
        ledgerMap[ledgerAgg[0]?._id] = ledgerAgg[0];

        users[index].userLedger = ledgerAgg[0]?.userLedger ? ledgerAgg[0]?.userLedger : 0 
        users[index].userProfitLoss = ledgerAgg[0]?.userProfitLoss ? ledgerAgg[0]?.userProfitLoss :0
        users[index].settledAmount = ledgerAgg[0]?.settledAmount ? ledgerAgg[0]?.settledAmount : 0 
        users[index].totalClientProfitLoss = ledgerAgg[0]?.clientProfitLoss ? ledgerAgg[0]?.clientProfitLoss : 0 
        users[index].totalPlayerBalance = users[index].coins
        users[index].userProfitLossCreatorType = ledgerAgg[0]?.userProfitLossCreatorType ? ledgerAgg[0]?.userProfitLossCreatorType :0

        

        if (findUserType != "client") {
          users[index].userProfitLoss = -1 * users[index].userProfitLoss
          users[index].userLedger = -1 * users[index].userLedger
          let totalClientExposure = await UserModel.aggregate([
              {
                $match: {
                   [`${findUserType}Id`]:findUserId
                }
              },
              {
                $group: {
                  _id: `$${findUserType}Id`,
                  totalClientExposure: {
                    $sum: {
                      $cond: [
                        { $eq: ["$userType", "client"] },
                        "$exposure",
                        0
                      ]
                    }
                  },
                   totalPlayerBalance: {
                    $sum: {
                      $cond: [
                        { $eq: ["$userType", "client"] },
                        "$coins",
                        0
                      ]
                    }
                  }

                }
              }
          ]);
          users[index].exposure = totalClientExposure[0]?.totalClientExposure ? totalClientExposure[0]?.totalClientExposure : 0 
          users[index].totalPlayerBalance = totalClientExposure[0]?.totalPlayerBalance ? totalClientExposure[0]?.totalPlayerBalance : 0 
        } else {
          users[index].userProfitLoss = -1 * users[index].userProfitLossCreatorType 
        }
}
    
    
    let returnObj = {
      totalCount,
      data: users
    }

    if (res) {
      return SendResponse(res, "success", "success", returnObj);
    } else {
      return returnObj;
    }

  } catch (error) {
     if (res) {
      return SendResponse(res, "erroe", "success", error.message);
    } else {
      console.log(error)
    }
  }
};


const blockInternationalCasinoProviders = async (req, res) => {
  let bodyData = req.body;
  const currentUser = req.loggedInUser;
  if (currentUser.userType != "owner") {
    return SendResponse(res, "error", "not Allowed");
  }
  let userDetails = await UserModel.findOne({
    _id : new ObjectId(bodyData.subownerId)
  })

  if (!userDetails) {
    return SendResponse(res, "error", "user not found");
  }

  if (userDetails.userType !="subowner") {
    return SendResponse(res, "error", "we can block market only for subowner");
  }

  await InternationalCasinoBlockModel.deleteMany({
    subownerId : new ObjectId(bodyData.subownerId)
  })

  await InternationalCasinoBlockModel.create({
    providerArray : bodyData?.providerArray,
    subProviderArray : bodyData?.subProviderArray,
    gameIdArray: bodyData?.gameIdArray,
    subownerId :  new ObjectId(bodyData.subownerId)
  })

  let blockMarketList = await InternationalCasinoBlockModel.findOne({
    subownerId : new ObjectId(bodyData.subownerId)
  })

  await client.set(`InternationalCasinoBlockmarket_${bodyData.subownerId}` , JSON.stringify(blockMarketList))

  if (res) {
      return SendResponse(res, "success", "international casino provider update successfully done");
  } 
  
  return true
}


const getInternationalCasinoBlockMarket = async (req, res) => {
  let bodyData = req.body;
  const currentUser = req.loggedInUser;
  if (currentUser.userType != "owner") {
    return SendResponse(res, "error", "not Allowed");
  }
  
  let blockMarketList = await client.get(`InternationalCasinoBlockmarket_${bodyData.subownerId}`)
  if (!blockMarketList) {
      blockMarketList = await InternationalCasinoBlockModel.findOne({
      subownerId : new ObjectId(bodyData.subownerId)
      })
    if (!blockMarketList) {
      blockMarketList = {}
    }
    await client.set(`InternationalCasinoBlockmarket_${bodyData.subownerId}` , JSON.stringify(blockMarketList))
  } else {
    blockMarketList = JSON.parse(blockMarketList)
  }
  if (res) {
      return SendResponse(res, "success", "" , blockMarketList);
  } else {
    return blockMarketList
  }
}

const getUndeclareBetsListGroupwise = async (req, res) => {
  let bodyData = req.body;
  let where = {
        isDeclare: 0,
        isDeleted: 0,
  }
  
  if(bodyData.sportsId){
    where.sportsId = bodyData.sportsId
  }

  if(bodyData.fromDate && bodyData.toDate){
     where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  let idGroup = bodyData.sportIdWise ? "$sportsId" : "$marketId"
  let oddsBetsListAgg = [
    {
      $match: where
    },
    {
      $group: {
        _id: idGroup,
        totalBets: { $sum: 1 },
        matchName: { $first: "$matchName" },
        totalAmount: { $sum: "$amount" },
        sportsId: { $first: "$sportsId" },
        eventId: { $first: "$eventId" },
        lastTiming: { $last: "$createdAt" },
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];

  var resData = await oddsBetsList.aggregate(oddsBetsListAgg);
  if (res) {
      return SendResponse(res, "success", "" , resData);
  } else {
    return resData
  }
}








  
  module.exports = {
    depositWithdrawTotal,
    userListNew,
    blockInternationalCasinoProviders,
    getInternationalCasinoBlockMarket,
    getUndeclareBetsListGroupwise
  };
  