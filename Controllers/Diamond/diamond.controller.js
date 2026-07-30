const {
    SendResponse,
  } = require("../../Helpers/ResponseMapper");
  const { client } = require("../../Helpers/RedisHelper");
  const {
    checkUserTransactionPassword,
     gettingDirectUserByUserId,
  } = require("../../Helpers/UsersUtils");
  const { ObjectId } = require("mongodb");
  const Joi = require("joi");
  const { siteSetting } = require("../../Common/Constants");
  const {
    _dx,
    whereHelper,
    _d,
    dateWhereCond,
    _date_time,
    getSettingData
  } = require("../../Helpers/CommonHelper");
   const {
        userCashCreditData
   } = require("../../Services/Reports/bpexch.service");
  
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
const transactionHelper = require("../../Helpers/TransactionHelper")
 

  
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
        creatorId: 1,
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

        let ledgerMatch = {
                   [`${findUserType}Id`]:findUserId
        }


        let ledgerAgg = await crickTransaction.aggregate([
              {
                $match: ledgerMatch
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
                        {
                          $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(findUserId)] } , { $ne: ["$creatorId", new ObjectId(findUserId)] }],
                        },
                        `$amount`,
                        0,
                      ],
                    },
                  },
                  clientProfitLoss: {
                    $sum: {
                      $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        "$amount",
                        0
                      ]
                    }
                  }

                }
              }
              ]);
    
        
        //_d(ledgerAgg[0], "ledgerAgg")

        ledgerMap[ledgerAgg[0]?._id] = ledgerAgg[0];


        users[index].userLedger = ledgerAgg[0]?.userLedger ? ledgerAgg[0]?.userLedger : 0 
        users[index].userProfitLoss = ledgerAgg[0]?.userProfitLoss ? ledgerAgg[0]?.userProfitLoss :0
        users[index].settledAmount = ledgerAgg[0]?.settledAmount ? ledgerAgg[0]?.settledAmount : 0 
        users[index].totalClientProfitLoss = ledgerAgg[0]?.clientProfitLoss ? ledgerAgg[0]?.clientProfitLoss : 0 
        users[index].totalPlayerBalance = users[index].userType == "client" ? 0 :users[index].coins 
        users[index].userProfitLossCreatorType = ledgerAgg[0]?.userProfitLossCreatorType ? ledgerAgg[0]?.userProfitLossCreatorType : 0
        
        
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
                  },
                  totalCreditReference: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              { $eq: ["$creatorId", new ObjectId(findUserId)] },
                              { $ne: ["$userId", new ObjectId(findUserId)] },
                            ],
                          },
                          `$creditReference`,
                          0,
                        ],
                      },
                  },
                   selfCreditReffrence: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              { $eq: ["$userId", new ObjectId(findUserId)] },
                            ],
                          },
                          `$creditReference`,
                          0,
                        ],
                      },
                  },
                }
              }
          ]);
          users[index].exposure = totalClientExposure[0]?.totalClientExposure ? totalClientExposure[0]?.totalClientExposure : 0 
          users[index].totalPlayerBalance = totalClientExposure[0]?.totalCreditReference ? totalClientExposure[0]?.totalCreditReference : 0 
          users[index].balance = totalClientExposure[0]?.selfCreditReffrence + users[index].totalClientProfitLoss + users[index].settledAmount
        } else {
          users[index].userProfitLoss = -1 * users[index].userProfitLossCreatorType 
         // users[index].balance = totalClientExposure[0]?.totalCreditReference + users[index].totalClientProfitLoss + users[index].settledAmount
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
    console.log(error)
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


const diamondDepositWithdraw = async (req, res) => {
  try {
    let bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = bodyData.userId
    let isCash = false
    if (bodyData.isCash) {
      isCash = bodyData.isCash
    }
    let userWhere = await whereHelper(loginData, {
      userId: new ObjectId(userId),
      status: 1,
      isDeleted: false,
    })

    let settingData = await getSettingData()
    
   

    let userData = await UserModel.findOne(
      userWhere,
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
        creatorShareData: 1,
        exposure: 1,
        creditReference: 1,
        status:1
      }
    );

    if (!userData) {
      return SendResponse(res, "error", "user Not Found");
    }

    if (!userData.status) {
      return SendResponse(res, "error", "User Is Inactive Please Active First");
    }

    let creatorId = userData.creatorId
    
    let creatorData = await UserModel.findOne(
      {
        userId: new ObjectId(creatorId)
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
        creatorShareData: 1,
        creditReference: 1,
      }
    );

     if (settingData.isTransactionPassword && settingData.isTransactionPassword == true) {
        let transactionPassword = bodyData?.transactionPassword
        if (!transactionPassword) {
          return returnResponse(res ,"error", "Transaction Password Is required");
        }
        const isTransactionPasswordCorrect =  await checkUserTransactionPassword(creatorData.userId , transactionPassword,
          creatorData.transactionPassword)
        if (!isTransactionPasswordCorrect) {
          return returnResponse(res , "error", "Transaction Password Is Wrong");
        }
     }
    
    let userCreditReffrence = userData?.creditReference ? userData?.creditReference : 0
  
    let coins = Number(bodyData.coins)
    let userCoins = userData?.coins ? userData?.coins : 0 
    let creatorCoins = creatorData?.coins ? creatorData?.coins : 0 
    const updateCoinsWithoutSign = Math.abs(coins);

    if (coins < 0 && updateCoinsWithoutSign > userCreditReffrence) {
      return SendResponse(
        res,
        "error",
        `Maximum ${userCreditReffrence} coins can be debited from user: ${userData.username}`
      );
    }


    if (coins < 0 && updateCoinsWithoutSign > userCoins) {
      return SendResponse(
        res,
        "error",
        `Maximum ${userCoins} coins can be debited from user: ${userData.username}`
      );
    }


    if (coins > 0 && coins > creatorCoins) {
      return SendResponse(
        res,
        "error",
        `Maximum ${creatorCoins} coins can be deposited ! insufficient Balance`
      );
    }

 
    let creatorDepositWithdrawType = `chips deposit to ${userData.username} by ${loginData.username}`;
    const creatorUsertypeId = `${creatorData.userType}Id`;
    let creatorCoinsUpdated = coins * -1;
    if (creatorCoinsUpdated > 0) {
      creatorDepositWithdrawType = `chips withdraw from ${userData.username} by ${loginData.username}`;
    }
    let creatorTransactionLog = {
      userId: userData.creatorId,
      userType: creatorCoins.userType,
      amount: creatorCoinsUpdated,
      overallType: "depositWithdraw",
      remarks: `${creatorDepositWithdrawType}`,
      [creatorUsertypeId]: userData.creatorId,
      userType: creatorData.userType,
      isDeclare: 1,
    }

    const UsertypeId = `${userData.userType}Id`;
    let userDepositWithdrawType = `chips deposit to ${userData.username} by ${loginData.username}`;
     if (coins < 0) {
        userDepositWithdrawType = `withdraw from  ${userData.username} by ${loginData.username}`;
    }
    let userTransactionLog = {
      userId,
      amount: coins,
      overallType: "depositWithdraw",
      userType: userData.userType,
      remarks: `${userDepositWithdrawType}`,
      [UsertypeId]: userData.userId,
      isDeclare: 1,
    }


    let creatorRemarkCrick = `chips [${creatorCoinsUpdated > 0 ? " Withdraw From" : "Deposit To"
        }  ${userData.username} by ${creatorData.username} of ${Math.abs(creatorCoinsUpdated)}- (${_date_time()})]`;

    let userRemarkCrick = `chips [${coins < 0 ? "Withdraw From" : "Deposit To"
            }  ${userData.username} by ${creatorData.username} of ${Math.abs(coins)} - (${_date_time()})]`;
    
      let crickCreatorTransaction = {
        amount: creatorCoinsUpdated,
        [creatorData.userType + "ProfitLoss"]: creatorCoinsUpdated,
        transactionType: "depositWithdrawal",
        remarks: bodyData.remark ? `${bodyData.remark} (${_date_time()})` : userRemarkCrick,
        userId: userData.creatorId,
        userType: creatorData.userType,
        creatorId: userData.creatorId,
        [creatorData.userType + "Id"]: userData.creatorId,
        [`${creatorData.userType}ProfitLoss`]: creatorCoinsUpdated,
        isCash: isCash
      };
    

     let crickUserTransaction = {
        amount: coins,
        transactionType: "depositWithdrawal",
        remarks: bodyData.remark ? `${bodyData.remark} (${_date_time()})` : creatorRemarkCrick,
        userId: userData.userId,
        userType: userData.userType,
        creatorId: userData.creatorId,
        [userData.userType + "Id"]: userData.userId,
        [`${userData.userType}ProfitLoss`]: coins,
      };


    await Promise.all([
        TransactionLogModel.create(creatorTransactionLog),
        TransactionLogModel.create(userTransactionLog),
        crickTransaction.create(crickCreatorTransaction),
        crickTransaction.create(crickUserTransaction)
     ])

    await Promise.all([
      transactionHelper.updateCoinsTbl(userData.creatorId, creatorData.userType),
      transactionHelper.updateCoinsTbl(userId, userData.userType)
    ])
  
    return SendResponse(res, "success", ` Chips ${coins < 0 ? " Withdraw From" : "Deposit To"} ${userData.username} Successfully`);

  } catch (error) {
    console.log(error, "error")
  }

}

const diamondSettlement = async (req, res) => {
  try {
    let bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = bodyData.userId
    let isCash = true
    let settingData = await getSettingData()
  
    let userWhere = await whereHelper(loginData, {
      userId: new ObjectId(userId),
      status: 1,
      isDeleted: false,
    })

    let userData = await UserModel.findOne(
      userWhere,
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
        creatorShareData: 1,
        exposure: 1,
        status: 1,
        creditReference: 1,
      }
    );

    if (!userData) {
      return SendResponse(res, "error", "user Not Found");
    }

    if (!userData.status) {
      return SendResponse(res, "error", "User Is Inactive Please Active First");
    }

    let creatorId = userData.creatorId

    if (loginData.userId != creatorId) {
      return SendResponse(res, "error", "only creator can do settlement please login by upperline");
    }


    let creatorData = await UserModel.findOne(
      {
        userId: new ObjectId(creatorId)
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
        creatorShareData: 1,
        creditReference: 1,
      }
    );


    if (settingData.isTransactionPassword && settingData.isTransactionPassword == true) {
        let transactionPassword = bodyData?.transactionPassword
        if (!transactionPassword) {
          return returnResponse(res ,"error", "Transaction Password Is required");
        }
        const isTransactionPasswordCorrect =  await checkUserTransactionPassword(creatorData.userId , transactionPassword,
          creatorData.transactionPassword)
        if (!isTransactionPasswordCorrect) {
          return returnResponse(res , "error", "Transaction Password Is Wrong");
        }
    }


    let [userCashCredit, creatorCashCredit] = await Promise.all([
      userDepsitSettlementData(userData.userId, userData.userType),
      userDepsitSettlementData(userData.creatorId ,  creatorData.userType)
    ])

    userCashCredit = userCashCredit[0] ?  userCashCredit[0] : {}
    creatorCashCredit = creatorCashCredit[0] ? creatorCashCredit[0] : {}
    

    let userTotalSettlementAmountByParent= userCashCredit.totalSettlementAmountByParent ? userCashCredit.totalSettlementAmountByParent : 0
    let userTotalProfitLossClientOrSettlement = userCashCredit.totalProfitLossClientOrSettlement ? userCashCredit.totalProfitLossClientOrSettlement : 0
    let totalSettledAmount = userTotalProfitLossClientOrSettlement + userTotalSettlementAmountByParent



    let coins = Number(bodyData.amount)
    if (!coins || coins == 0) {
      return SendResponse(
          res,
          "error",
          `amount value can not be zero`
      );
    }
    
    let updateCoins = -1 * coins
    const updateCoinsWithoutSign = Math.abs(updateCoins);
    const totalSettledAmountWithoutSign = Math.abs(totalSettledAmount);

    let userCoins = userData?.coins ? userData?.coins : 0 
    let creatorCoins = creatorData?.coins ? creatorData?.coins : 0 


    if (coins < 0) {

      if (updateCoins > totalSettledAmountWithoutSign) {
          return SendResponse(
          res,
          "error",
          `Maximum ${totalSettledAmountWithoutSign} coins can be settled from user: ${userData.username}`
        );
      }

      if (updateCoins > creatorCoins) {
          return SendResponse(
          res,
          "error",
          `you dont have balance to settle this amount please contact your upline`
        );
      }
    }


    let availableBalance = userData.coins

    if (coins > 0) {

      if (coins > totalSettledAmountWithoutSign) {
        return SendResponse(
          res,
          "error",
          `Maximum ${totalSettledAmountWithoutSign} coins can be settled from user: ${userData.username}`
        );
      }
      
      if (updateCoins > userCoins) {
          return SendResponse(
          res,
          "error",
          `you dont have balance to settle this amount maximum you can settle amount is ${userCoins} of this user`
        );
      }

       if (coins > availableBalance) {
                     return SendResponse(
                     res,
                     "error",
                       `maximum amount can settle ${availableBalance} for user ${userData.username}`
                   );
       }

    }

    let creatorDepositWithdrawType = `Settlement deposit to ${userData.username}`;
    let userDepositWithdrawType = `settlement deposit to ${userData.username}`;
    let userStatementStatus = "deposit";

    const creatorUsertypeId = `${creatorData.userType}Id`;
    let creatorCoinsUpdated = coins;
    if (creatorCoinsUpdated > 0) {
      creatorDepositWithdrawType = `Settlement withdraw for  ${userData.username}`;
    }


    let creatorTransactionLog = {
      amount: coins,
      userId: userData.creatorId,
      userType: creatorData.userType,
      overallType: "depositWithdraw",
      remarks: `${creatorDepositWithdrawType}`,
      ownerId: creatorData.ownerId,
      subownerId: creatorData.subownerId,
      superadminId: creatorData.superadminId,
      adminId: creatorData.adminId,
      subadminId: creatorData.subadminId,
      masterId: creatorData.masterId,
      superagentId: creatorData.superagentId,
      agentId: creatorData.agentId,
      clientId: creatorData.clientId,
      isDeclare: 1,
      isCash: 1,
    }

    const UsertypeId = `${userData.userType}Id`;

     if (updateCoins < 0) {
      userDepositWithdrawType = `settlment withdraw from  ${userData.username}`;
      userStatementStatus = "settlement withdraw";
     }
    
     let userTransactionLog = {
      userId,
      amount: updateCoins,
      overallType: "depositWithdraw",
      userType: userData.userType,
      remarks: `${userDepositWithdrawType}`,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      superadminId: userData.superadminId,
      adminId: userData.adminId,
      subadminId: userData.subadminId,
      masterId: userData.masterId,
      superagentId: userData.superagentId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      isDeclare: 1,
      isCash: 1,
    }
    

    let userCrickRemark = `${bodyData?.remark ? bodyData?.remark + "- " : ""}Settlement for  ${userData.username} by ${loginData.username} of ${Math.abs(coins)} (${_date_time()})]`;

      let userCrickTransactionLog = {
        amount: updateCoins,
        transactionType: "ledger",
        remarks: userCrickRemark,
        userId: userData.userId,
        userType: userData.userType,
        ownerId: userData.ownerId,
        subownerId: userData.subownerId,
        superadminId: userData.superadminId,
        adminId: userData.adminId,
        subadminId: userData.subadminId,
        masterId: userData.masterId,
        superagentId: userData.superagentId,
        agentId: userData.agentId,
        clientId: userData.clientId,
        creatorId: userData.creatorId,
        [`${userData.userType}ProfitLoss`]: updateCoins,
        [`${userData.userType}LedgerAmount`]: updateCoins,
        isCash: true
      };
    
  
      let creatorCrickRemark = `${bodyData?.remark ? bodyData?.remark + "- " : ""}Settlement for  ${userData.username} by ${loginData.username} of ${Math.abs(coins)} (${_date_time()})]`;

      let creatorCrickTransactionLog = {
        amount: coins,
        transactionType: "ledger",
        remarks: creatorCrickRemark,
        userId: creatorData.userId,
        userType: creatorData.userType,
        ownerId: creatorData.ownerId,
        subownerId: creatorData.subownerId,
        superadminId: creatorData.superadminId,
        adminId: creatorData.adminId,
        subadminId: creatorData.subadminId,
        masterId: creatorData.masterId,
        superagentId: creatorData.superagentId,
        agentId: creatorData.agentId,
        clientId: creatorData.clientId,
        creatorId: creatorData.userId,
        [`${creatorData.userType}ProfitLoss`]: coins,
        [`${creatorData.userType}LedgerAmount`]: coins,
        isCash: true
      };
    
    
    
    // _d(userTransactionLog , "userTransactionLog")
    // _d(creatorTransactionLog, "creatorTransactionLog")
    
    // _d(userCrickTransactionLog , "userCrickTransactionLog")
    // _dx(creatorCrickTransactionLog , "creatorCrickTransactionLog")

     await Promise.all([
      crickTransaction.create(userCrickTransactionLog),
      crickTransaction.create(creatorCrickTransactionLog),
      TransactionLogModel.create(creatorTransactionLog),
      TransactionLogModel.create(userTransactionLog)
     ])
    
    await Promise.all([
      transactionHelper.updateCoinsTbl(userData.creatorId, creatorData.userType),
      transactionHelper.updateCoinsTbl(userId, userData.userType)
    ])


    return SendResponse(res, "success", "sellement Updated Successfully Done");

  } catch (error) {
    console.log(error, "error")
  }

}

const userDepsitSettlementData = async (userId, userType) => {
  let amountProfitLossType =  userType!="client" ? `$${userType}ProfitLoss` : "$amount"
  let amountLedgerType = userType != "client" ? `$${userType}LedgerAmount` : "$amount"
  
  _d(amountLedgerType , "amountLedgerType")
  let groupUser = {
    _id: `$${userType}Id`,
    totalSettlementAmountByParent: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$transactionType", "ledger"] },
              { $eq: ["$userId", new ObjectId(userId)] },
              { $eq: ["$isCash", true] },
              { $ne: ["$creatorId", new ObjectId(userId)] },
            ],
          },
          `$amount`,
          0,
        ],
      },
    },
    totalSettlementAmountByProfitLoss:{
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          amountLedgerType,
          0,
        ],
      },
    },
    totalProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          amountProfitLossType,
          0,
        ],
      },
    },
    totalProfitLossClientOrSettlement: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          `$amount`,
          0,
        ],
      },
    },

  }

  let userCoinsWhere = {
    [`${userType}Id`]: new ObjectId(userId)
  }

  var userResdata = await crickTransaction.aggregate([
    {
      $match: userCoinsWhere,
    },
    {
      $group: groupUser,
    },
    {
      $sort: { _id: 1 }
    }
  ]);


   return userResdata
}


let diamondBalanceSheet = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userType = loggedUserData.userType
  let userId = loggedUserData.userId
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId
    userType = bodyData.userType
  }
  try {
    let query = {};
    let totalQuery = {};
    query = whereHelper(loggedUserData);
    let userData = await gettingDirectUserByUserId(userId, query)
    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }
    let userDataObj = userData?.userDataArray
    let finalLedgerData = []
    if (bodyData.isFinalSheet) {
      isFinalSheet = bodyData.isFinalSheet
    }


    for (const [id, userData] of Object.entries(userDataObj)) {
      let fetchUserId = id
      let fetchUserType = userData.userType
      let crickWhereObj = {
        [fetchUserType + "Id"]: new ObjectId(fetchUserId),
      }


      if (bodyData.fromDate && bodyData.toDate) {
        crickWhereObj.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      }
      if (bodyData.gameType) {
        crickWhereObj.gameType = bodyData.gameType
      }
      if (bodyData.selectionId) {
        crickWhereObj.selectionId = bodyData.selectionId
      }
      if (bodyData.marketType) {
        crickWhereObj.marketType = bodyData.marketType
      }

      let fetchUserLedgerAmount = fetchUserType != "client" ? `${fetchUserType}LedgerAmount` : `amount`

      let crickGroup = {
        _id: `$${fetchUserType}Id`,
        userLedgerAmount: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${fetchUserLedgerAmount}`,
              0,
            ],
          },
        },
        userLedgerAmountClient: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        parentCash: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(fetchUserId)] } , { $ne: ["$creatorId", new ObjectId(fetchUserId)] }],
              },
              `$${fetchUserLedgerAmount}`,
              0,
            ],
          },
        },
      }

      let selfCrickData = await crickTransaction.aggregate([
        {
          $match: crickWhereObj,
        },
        { 
          $group: crickGroup,
        },
      ]);


      if (selfCrickData[0]) {

        let userLedgerAmount = selfCrickData[0]?.userLedgerAmount ? selfCrickData[0]?.userLedgerAmount : 0
        let parentCash = selfCrickData[0]?.parentCash ? selfCrickData[0]?.parentCash : 0
        
        let userLedgerAmountClient = selfCrickData[0]?.userLedgerAmountClient ? selfCrickData[0]?.userLedgerAmountClient : 0
        
          let pushArray = {
            balance: userLedgerAmount + parentCash,
            balanceTotalClient : userLedgerAmountClient + parentCash,
            userId: userData.userId,
            userType: userData.userType,
            username: userData.username,
            name: userData.name,
            coins: userData.coins,
          }
        
        _d(pushArray , "pp")
          finalLedgerData.push(pushArray)
      }
    }



    let selfWhere = {
      [userType + "Id"]: new ObjectId(userId)
    }

    if (bodyData.fromDate && bodyData.toDate) {
      selfWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (bodyData.gameType) {
      selfWhere.gameType = bodyData.gameType
    }

    if (bodyData.selectionId) {
      selfWhere.selectionId = bodyData.selectionId
    }

    if (bodyData.marketType) {
      selfWhere.marketType = bodyData.marketType
    }

    // let fetchUserProfitLossTypeAmount = `${userType}ProfitLoss`
    // let fetchUserLedgerTypeAmount = `${userType}LedgerAmount`

    // if (userType == "client") {
    //   fetchUserProfitLossTypeAmount = `amount`
    //   fetchUserLedgerTypeAmount = `amount`
    // }

     let fetchUserProfitLossTypeAmount = `amount`
     let  fetchUserLedgerTypeAmount = `amount`

    let crickGroup = {
      _id: `$${userType}Id`,
      marketProfitLoss: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "profitLoss"] }, { $eq: ["$isComm", 0] },],
            },
            `$${fetchUserProfitLossTypeAmount}`,
            0,
          ],
        },
      },
    marketProfitLossClient: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "profitLoss"] }, { $eq: ["$isComm", 0] },],
            },
            `$amount`,
            0,
          ],
        },
      },
      settlementParent: {
        $sum: {
          $cond: [
            {
              $or: [{ $eq: ["$transactionType", "profitLoss"] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
      parentCash: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
      myCash: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$creatorId", new ObjectId(userId)] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
      marketCommProfitLoss: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$isComm", 1] },
                { $eq: ["$betFor", "market"] },
              ],
            },
            `$${fetchUserProfitLossTypeAmount}`,
            0,
          ],
        },
      },
      sessionCommProfitLoss: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$isComm", 1] },
                { $eq: ["$betFor", "session"] },
              ],
            },
            `$${fetchUserProfitLossTypeAmount}`,
            0,
          ],
        },
      },
    }


    let selfCrickData = await crickTransaction.aggregate([
      {
        $match: selfWhere,
      },
      {
        $group: crickGroup,
      },
    ]);


    _d(selfCrickData , "")

    selfCrickData.map((data) => {
      selfCrickData[0].marketProfitLoss = -1 * data.marketProfitLoss
      selfCrickData[0].marketProfitLossClient = -1 * data.marketProfitLossClient
      selfCrickData[0].sessionCommProfitLoss = -1 * data.sessionCommProfitLoss
      selfCrickData[0].marketCommProfitLoss = -1 * data.marketCommProfitLoss
      selfCrickData[0].settlementParent = -1 * (data.settlementParent + data.parentCash)
    })


    let finalReturnData = {
      downlineUserData: finalLedgerData,
      selfCrickData: selfCrickData[0] ? selfCrickData[0] : {},
    }

    return SendResponse(
      res,
      "success",
      "Ledger List fetched Successfully",
      finalReturnData
    );

  } catch (error) {
    console.log(error)
    return SendResponse(res, "error", "Ledger Error", error);
  }
};



let diamondDashboard = async (req, res) => {
  try {
      const bodyData = req.body;
      const loggedUserData = req.loggedInUser;
      let userType = loggedUserData.userType
      let userId = loggedUserData.userId
      if (bodyData.userId && bodyData.userType) {
        userId = bodyData.userId
        userType = bodyData.userType
      }
    
    let userModelquery = whereHelper(loggedUserData)

    let userResData = await UserModel.aggregate([
              {
                $match: userModelquery
              },
              {
                $group: {
                  _id: `$${userType}Id`,
                  occupiedBalance: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              { $eq: ["$creatorId", new ObjectId(userId)] },
                              { $ne: ["$userId", new ObjectId(userId)] },
                            ],
                          },
                          `$creditReference`,
                          0,
                        ],
                      },
                  },
                  downlineAvailableBalance: {
                      $sum: {
                        $cond: [
                          {
                            $and: [
                              { $eq: ["$creatorId", new ObjectId(userId)] },
                              { $ne: ["$userId", new ObjectId(userId)] },
                            ],
                          },
                          `$coins`,
                          0,
                        ],
                      },
                  },         
                  availableBalance: {
                    $sum: {
                      $cond: [
                        { $eq: ["$userId", new ObjectId(userId)] },
                        "$coins",
                        0
                      ]
                    }
                  },
                  creditReference: {
                    $sum: {
                      $cond: [
                        { $eq: ["$userId", new ObjectId(userId)] },
                        "$creditReference",
                        0
                      ]
                    }
                  },
                }
              }
    ]);
    

    let crickWhereQuery = whereHelper(loggedUserData)
    
    let crickGroup = {
        _id: `$${userType}Id`,
        userLedgerAmountSelf: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${userType}LedgerAmount`,
              0,
            ],
          },
      },
      userProfitLossAmountSelf: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${userType}ProfitLoss`,
              0,
            ],
          },
        },
        userLedgerAmountClient: {
          $sum: {
            $cond: [
              {
                $or: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        settleLedger: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] } , { $ne: ["$creatorId", new ObjectId(userId)] }],
              },
              `$amount`,
              0,
            ],
          },
        },
      }

      let selfCrickData = await crickTransaction.aggregate([
        {
          $match: crickWhereQuery,
        },
        { 
          $group: crickGroup,
        },
      ]);

    let returnData = {}


   

    if (userResData[0]) {
      returnData.occupiedBalance = userResData[0]?.occupiedBalance
      returnData.availableBalance = userResData[0]?.availableBalance
      returnData.creditReference = userResData[0]?.creditReference
    }


    if (selfCrickData[0]) {
      returnData.userLedgerAmountSelf = selfCrickData[0]?.userLedgerAmountSelf
      returnData.userLedgerAmountClient = selfCrickData[0]?.userLedgerAmountClient
      returnData.settleLedger = selfCrickData[0]?.settleLedger
      returnData.userProfitLossAmountSelf = selfCrickData[0]?.userProfitLossAmountSelf
      returnData.finalSettlementAmountTotal = returnData?.userLedgerAmountClient + returnData?.settleLedger
    }

   returnData.allPoints = userResData[0]?.creditReference + returnData.finalSettlementAmountTotal 


  
    if (res) {
      return SendResponse(
      res,
      "success",
      "Ledger List fetched Successfully",
      returnData
    );
    } else {
      return returnData
    }

    

  } catch (error) {
    console.log(error)
    return SendResponse(res, "error", "Ledger Error", error);
  }
};


const diamondAccountStatement = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    let userType = loginData.userType
    let userId = loginData.userId

    if (bodyData.userId) {
      userId = new ObjectId(bodyData.userId);
    }

    if (bodyData.userType) {
      userType = bodyData.userType;
    }


    if (bodyData.creatorId) {
      where.creatorId = new ObjectId(bodyData.creatorId);
    }

    if (bodyData.transactionType) {
      where.transactionType = bodyData.transactionType;
    }

    where[`${userType}Id`] = userId


    let userData = await UserModel.findOne({ userId: userId }, {
      userId :1 , creatorId :1 , creatorShareData:1
    })
   

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (bodyData.marketId) {
      where.marketId = bodyData.marketId
    }

    if (bodyData.marketType) {
      where.marketType = bodyData.marketType
    }

    if (bodyData.selectionId) {
      where.selectionId = bodyData.selectionId
    }

    if (bodyData.gameType) {
      where.gameType = bodyData.gameType
    }

    if (bodyData.isComm && bodyData.isComm == 1) {
      where.isComm = bodyData.isComm
    }

    
    if (bodyData.gameName && bodyData.gameName == "depositWithdrawalSettlement") {
        where = {...where , ...{
            $or: [
              { transactionType: "depositWithdrawal" },
              { transactionType: "ledger", creatorId: userId  , userId :userId }, // for downline
              { transactionType: "ledger", userId: userId  , creatorId : {$ne : userId}} // entry done by upperline
            ]
        }
      }
    } 
    else {
          if (bodyData.gameName) {
          where.gameName = bodyData.gameName
        }
    }

    


    if (bodyData.sportId) {
      where.sportId = Number(bodyData.sportId)
    }


    if (bodyData.settlementType && bodyData.settlementType == "parent") {
        where = {
            userId: userId,
            creatorId: { $ne: userId },
            transactionType : "ledger"
        }
    }

    if (bodyData.settlementType && bodyData.settlementType == "child") {
        where = {
            transactionType : "ledger",
            creatorId : { $eq: userId }
        }
    }

     if (bodyData.settlementType && bodyData.settlementType == "depositWithdrawal") {
       where = {
            [`${userType}Id`] : userId,
             userId : userId,
            transactionType : "depositWithdrawal",
            creatorId : { $eq: userId }
        }
     }
    
    
    
    
    if (userType == "client") {

  
            delete where[`${loginData.userType}Id`]
            delete where[`${userType}Id`]
            where.userId = userId
      

            where = {
              ...where, ...{
                  $or: [
                    { transactionType: "depositWithdrawal" },
                    { transactionType: "profitLoss" },
                    { transactionType: "ledger", userId: userId, creatorId: { $ne: userId } }
                  ]
              }
            }

            if (bodyData.settlementType && bodyData.settlementType == "parent") {
                where = {
                    userId: userId,
                    creatorId: { $ne: userId },
                    transactionType : "ledger"
                }
            }
            
            if (bodyData.settlementType && bodyData.settlementType == "depositWithdrawal") {
              where = {
                    userId : userId,
                    transactionType : "depositWithdrawal",
                }
            }
      
      
      
      
        if (bodyData.gameName && bodyData.gameName == "settlement") {
          where = {
              $or: [
                { transactionType: "ledger",  userId: userId }, // for downline
              ]
           }
          }
      

    }
    
  
    let group = {
      _id: {
        remarks: `$remarks`,
        marketId: `$marketId`,
      },
      userAmount: { $sum: `$amount` },
      amount: { $sum: `$amount` },
      marketId: { $first: `$marketId` },
      transactionType: { $first: `$transactionType` },
      eventId: { $first: `$eventId` },
      result: { $first: `$result` },
      isComm: { $first: `$isComm` },
      createdAt: { $first: `$createdAt` },
      date: { $first: `$date` },
      selectionId: { $first: `$selectionId` },
      transactionId: { $first: `$transactionId` },
      seriesId: { $first: `$seriesId` },
      sportId: { $first: `$sportId` },
      marketType: { $first: `$marketType` },
      creatorId: { $first: `$creatorId` },
      userId: { $first: `$userId` },
      gameType: { $first: `$gameType` },
      userType: { $first: `$userType` },
    }



  
    if (bodyData.userType == "client") {
      group._id =  {
        remarks: `$remarks`,
        marketId: `$marketId`,
        selectionId: `$selectionId`,
      }
    }



   // _d(group , "group")


    let resData = await crickTransaction.aggregate([
        {
          $match: where,
        },
        {
          $group: group,
        },
        { $sort: { createdAt : 1 } }
    ]);



    // if (bodyData.userType == "client") {
    //   resData = await crickTransaction.find(where).sort({ _id: -1 }); 
    //   resData = JSON.parse(JSON.stringify(resData))
    // }

    // resData.map((data, key) => {
    //   if ((bodyData.userType == "client" && data.transactionType == "ledger")) {
    //     resData[key].userAmount = -1 * data.userAmount
    //   }
      
    //   if ((bodyData.userType != "client" && data.transactionType == "profitLoss")) {
    //     resData[key].userAmount = data.userAmount
    //   }
    // })


        let skipUserAmount = { $sum: `$amount` }
        const openingWhere = { ...where };
        delete openingWhere.date;
        delete openingWhere.createdAt;
        const openingCutoffMs = moment
            .tz(bodyData.fromDate, ["DD-MM-YYYY", "YYYY-MM-DD", moment.ISO_8601], "Asia/Kolkata")
            .startOf("day")
            .valueOf();

          const [openingBalanceData] = await crickTransaction.aggregate([
            {
              $match: openingWhere,
            },
            {
              $match: {
                date: { $lt: openingCutoffMs },
              },
            },
            {
              $group: {
                _id: null,
                totalSkipped: skipUserAmount,
              },
            },
            {
              $project: {
                _id: 0,
                totalSkipped: { $ifNull: ["$totalSkipped", 0] },
              },
            },
          ]);
          const openingBalance = openingBalanceData?.totalSkipped || 0;

     
    return SendResponse(
      res,
      "success",
      openingBalance,
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick` , e);
  }
};

  
  module.exports = {
    depositWithdrawTotal,
    userListNew,
    blockInternationalCasinoProviders,
    getInternationalCasinoBlockMarket,
    getUndeclareBetsListGroupwise,
    diamondDepositWithdraw,
    diamondSettlement,
    diamondBalanceSheet,
    diamondDashboard,
    diamondAccountStatement
  };
  