const { ObjectId } = require("mongodb");
const crickTransaction = require("../../Models/crickTransaction.model");
const oddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const userModel = require("../../Models/User/User.model")
const SportsSettingModel = require("../../Models/Sports/SportsSetting.model");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const {
  _dx,
  _d,
  convertKeyObject,
  convertObjectToArray,
  whereHelper,
  dateWhereCond,
  _date,
  getMondayRange,
  throughSocketDataByAxios,
  _date_time,
  parseFilterDate
} = require("../../Helpers/CommonHelper");
const {
  getShareDataByUserId,
  gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const { isNull } = require("lodash");
const {
  getOddsPositionByMarketWise,
  getMatchList,
  sessionPositionUserWise,
} = require("../Sports/Bet.service");
const moment = require("moment-timezone");


function buildCondSum(conditionsArray, amountField) {
  try {
    if (!Array.isArray(conditionsArray)) {
      conditionsArray = [conditionsArray];
    }
    const amountExpr = amountField ? `$${amountField}` : 0;
    return {
      $sum: {
        $cond: [{ $and: conditionsArray }, amountExpr, 0],
      },
    };
  } catch (e) {
    console.error("buildCondSum error:", e?.message || e);
    return { $sum: 0 };
  }
}

const transactionHelper = require("../../Helpers/TransactionHelper")
const { InsertUserStatement } = require("../../Helpers/StatementHelper");

const {
  UserTypes,
  UserServiceErrMsg,
  CommonErrMsg,
  MaxCommissionLimit,
  geoLocationUrl,
  siteSetting,
  betChipsData,
  UserSpecificSubDomainLogin,
} = require("../../Common/Constants");
const UserModel = require("../../Models/User/User.model");

const dashboardMatchList = async (req, res) => {
  try {
    let redisData = await client.get(`dashboardMatchList`)
    if (redisData && redisData != null) {
      redisData = JSON.parse(redisData)
      return SendResponse(res, "success", "data fetched", redisData);
    }
    let bodyData = req.body
    let iplayListMarketId = []
    let marketData = []
    let inplayList = await getMatchList();
    inplayList.map((list) => {
      iplayListMarketId.push(list.marketId)
      let pushData = {
        sportId: list.sportId,
        sportType: list.sportType,
        matchName: list.matchName,
        matchDate: list.matchDate,
        marketId: list.marketId,
        eventId: list.eventId,
        totalBetsAmount: 0
      }
      marketData.push(pushData)
    })
    let latestResData = await oddsBetModel.aggregate([
      {
        $match: {
          marketId: {
            $in: iplayListMarketId
          }
        },
      },
      {
        $group: {
          _id: `$marketId`,
          totalAmount: { $sum: `$amount` },
        },
      },
    ]);

    if (latestResData) {
      latestResData = await convertKeyObject(latestResData, "_id")
    }

    marketData.map((data, key) => {
      let marketId = data.marketId
      if (latestResData[marketId]) {
        marketData[key].totalBetsAmount = latestResData[marketId]?.totalAmount
      }
    })

    await client.set(`dashboardMatchList`, JSON.stringify(marketData))
    await client.expire(`dashboardMatchList`, 60)

    return SendResponse(res, "success", "data fetched", marketData);

  } catch (error) {
    console.log(error)
  }
}

const profitLossrepostByGameWise = async (req, res) => {
  try {
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = loginData.userId
    let userType = loginData.userType

    if (bodyData.userId) {
      userId = bodyData.userId
    }
    if (bodyData.userType) {
      userType = bodyData.userType
    }




    let where = await whereHelper(loginData, {
      gameType: { $ne: null }
    })



    where[`${userType}Id`] = new ObjectId(userId)


    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (bodyData.isComm) {
      where.isComm = bodyData.isComm
      delete where.gameType
    }



    let group = {
      _id: `$gameType`,
      clientprofitLoss: { $sum: `$amount` },
      totalLedgerAmount: { $sum: `$${userType}ProfitLoss` },
    }

    if (bodyData.isParent) {
      group.totalLedgerAmount = { $sum: `$${userType}LedgerAmount` }
    }

    var userResdata = await crickTransaction.aggregate([
      {
        $match: where,
      },
      {
        $group: group,
      },
      {
        $sort: { _id: 1 }
      }
    ]);


    if (userResdata.length > 0 && bodyData.userType == loginData.userType) {
      userResdata.map((data, key) => {
        userResdata[key].totalLedgerAmount = -1 * data?.totalLedgerAmount
      })
    }

    return SendResponse(res, "success", "data fetched", userResdata);


  } catch (error) {
    console.log(error)
  }
}

const profitLossAccordingToDate = async (req, res) => {
  try {
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let loginUserId = loginData.userId
    let loginUserType = loginData.userType
    if (bodyData.userId) {
      loginUserId = bodyData.userId
    }
    if (bodyData.userType) {
      loginUserType = bodyData.userType
    }

    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    let directUserData = await gettingDirectUserByUserId(loginUserId);
    let userCount = directUserData.idArrayData ? directUserData.idArrayData.length : 0

    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = []

    for (const key in userDataArray) {
      if (userDataArray.hasOwnProperty(key)) {
        let where = {}
        let userData = userDataArray[key]
        let userId = userData.userId
        let userType = userData.userType
        where[userType + "Id"] = userId
        where.date = dateWhere
        let group = {
          _id: `$${userType}Id`,
          clientProfitLoss: {
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
          userProfitLoss: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$${userType}ProfitLoss`,
                0,
              ],
            },
          },

          clientTotalAmount: { $sum: `$amount` },
        }
        if (userType == "client") {
          group.userProfitLoss = {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$amount`,
                0,
              ],
            },
          }
        }

        var userResdata = await crickTransaction.aggregate([
          {
            $match: where,
          },
          {
            $group: group,
          },
          {
            $sort: { _id: 1 }
          }
        ]);

        if (userResdata[0]) {
          let resData = userResdata[0]

          if (userType != "client") {
            resData.userProfitLoss = -1 * resData.userProfitLoss
          }


          resData.userData = userData
          returnData.push(resData)
        }
      }
    }



    let crickWhere = {
      [loginUserType + "Id"]: new ObjectId(loginUserId)
    }

    if (bodyData.fromDate && bodyData.toDate) {
      crickWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }


    let selfProfitLoss = await crickTransaction.aggregate([
      {
        $match: crickWhere,
      },
      {
        $group: {
          _id: `$${loginUserType}Id`,
          userProfitLoss: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$${loginUserType}ProfitLoss`,
                0,
              ],
            },
          },
        },
      },
    ]);


    if (selfProfitLoss.length > 0) {
      let returnDataLength = returnData.length

      let userData = await userModel.findOne({ userId: new ObjectId(loginUserId) }, {
        userId: 1, userType: 1, username: 1
      })
      returnData[returnDataLength + 1] = {
        userProfitLoss: -1 * selfProfitLoss[0].userProfitLoss,
        userData: userData
      }

    }


    return SendResponse(res, "success", "data fetched", returnData);

  } catch (error) {
    console.log(error)
  }
}

const commissionReport = async (req, res) => {
  try {
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let loginUserId = loginData.userId
    let loginUserType = loginData.userType
    if (bodyData.userId) {
      loginUserId = bodyData.userId
    }
    if (bodyData.userType) {
      loginUserType = bodyData.userType
    }
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    let directUserData = await gettingDirectUserByUserId(loginUserId);
    let userCount = directUserData.idArrayData ? directUserData.idArrayData.length : 0

    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = []

    for (const key in userDataArray) {
      if (userDataArray.hasOwnProperty(key)) {
        let where = {}
        let userData = userDataArray[key]
        let userId = userData.userId
        let userType = userData.userType
        where[userType + "Id"] = userId
        where.date = dateWhere

        let group = {
          _id: `$${userType}Id`,
          userCommission: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$${userType}ProfitLoss`,
                0,
              ],
            },
          },
        }
        var userResdata = await crickTransaction.aggregate([
          {
            $match: where,
          },
          {
            $group: group,
          },
          {
            $sort: { _id: 1 }
          }
        ]);

        if (userResdata[0]) {
          let resData = userResdata[0]
          resData.userData = userData
          returnData.push(resData)
        }
      }
    }




    return SendResponse(res, "success", "data fetched", returnData);

  } catch (error) {
    console.log(error)
  }
}

const loadBalance = async (req, res) => {
  try {
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let loginUserId = loginData.userId
    let loginUserType = loginData.userType

    if (bodyData.userId) {
      loginUserId = bodyData.userId
    }

    if (bodyData.userType) {
      loginUserType = bodyData.userType
    }

    let directUserData = await gettingDirectUserByUserId(loginUserId);
    let userCount = directUserData.idArrayData ? directUserData.idArrayData.length : 0

    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = []


    let finalreturnProfitLoss = 0

    for (const key in userDataArray) {
      if (userDataArray.hasOwnProperty(key)) {
        let where = {}
        let userData = userDataArray[key]

        let userId = userData.userId
        let userType = userData.userType
        let creatorShareData = userData.creatorShareData
        let creatorType = creatorShareData.userType

        where[userType + "Id"] = userId

     
        let group = {
          _id: `$${userType}Id`,
          creditAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", false] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          creditRecieved: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $ne: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", false] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          creditGive: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $eq: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$isCash", false] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          cashAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          cashTaken: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          },
          cashGive: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          },
          clientprofitLoss: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$${userType}ProfitLoss`,
                0,
              ],
            },
          },
          ledgerAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          },
        }


        if (userType == "client") {
          group.clientprofitLoss = {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "profitLoss"] }],
                },
                `$amount`,
                0,
              ],
            },
          }
        }


        var userResdata = await crickTransaction.aggregate([
          {
            $match: where,
          },
          {
            $group: group,
          },
          {
            $sort: { _id: 1 }
          }
        ]);

       // _d(userResdata , "userResdata")

        let transactionWhere = {
          [userType + "Id"]: new ObjectId(userId)
        }



        var userTransactionData = await TransactionLogModel.aggregate([
          {
            $match: transactionWhere,
          },
          {
            $group: {
              _id: `$${userType}Id`,
              totalExposure: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$forBet", 1] }, { $eq: ["$isDeclare", 0] }],
                    },
                    `$amount`,
                    0,
                  ],
                },
              }
            },
          },
          {
            $sort: { _id: 1 }
          }
        ]);



        if (userResdata[0]) {
          let resData = userResdata[0]


         // _d(resData)

          resData.userData = userData
          resData.exposure = userTransactionData[0]?.totalExposure ? userTransactionData[0]?.totalExposure : 0

          if (userType != "client") {


            resData.balance = -1 * resData.clientprofitLoss

            // resData.clientprofitLoss =   resData.cashTaken  -  resData.cashGive + resData.ledgerAmount
            resData.clientprofitLoss = resData.cashTaken + resData.ledgerAmount


            resData.creditAmount = resData.creditRecieved


            resData.availableBalance = resData.balance

          } else {
            resData.balance = userData.coins
            resData.availableBalance = userData.coins
            resData.clientprofitLoss = resData?.cashAmount + resData?.clientprofitLoss +  resData?.exposure
            resData.creditAmount = resData.creditRecieved
          }



          finalreturnProfitLoss += resData.clientprofitLoss

          returnData.push(resData)
        }
      }
    }



    req.body = {
      userId: loginUserId,
      userType: loginUserType,
      isLoadBalance : true
    }



    let userCashCredit = await userCashCreditData(req)

    let returnDataFinal = {
      selfCoinsDetails: userCashCredit ? userCashCredit : [],
      downlineData: returnData ? returnData : [],
      downlineUserCount: userCount
    }

    return SendResponse(res, "success", "data fetched", returnDataFinal);
  } catch (error) {
    console.log(error)
  }
}


const checkExposuerForUsers = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const userId = loginData.userId;
    const userType = loginData.userType;

    let userTypeId = `${userType}Id`;
    let userTypeAmount = userType === "client" ? "amount" : `${userType}Amount`;
    let matchList = await getMatchList();

    const filteredList = matchList.filter(d => [1, 3, 4].includes(d.sportId));
    const eventIdArrayList = filteredList.map(d => d.eventId);

    const racesFilteredList = matchList.filter(d => [7, 4339].includes(d.sportId));
    const marketIdArrayList = racesFilteredList.map(d => d.marketId);
        
    const matchMap = {};
    filteredList.forEach(m => {
      matchMap[m.eventId] = m;
    });

    const matchMapByMarketId = {}
     racesFilteredList.forEach(r => {
      matchMapByMarketId[r.marketId] = r;
    });
    
    let whereQuery = {
        [userTypeId]: new ObjectId(userId),
        $or: [
          { eventId: { $in: eventIdArrayList } },
          { marketId: { $in: marketIdArrayList } }
        ]
    };
    
    
  const positionData = await OddsPositionModel.aggregate([
      {
        $match: whereQuery,
      },
      {
        $group: {
          _id: {
            marketId: "$marketId",
            eventId: "$eventId",
            oddsType: "$oddsType",
            selectionId: "$selectionId",
          },
          Position: { $sum: `$${userTypeAmount}` },
          teamName: { $first: "$teamName" },
          sportsId: { $first: "$sportsId" },
        },
      },
      {
        $sort: {
          "_id.marketId": 1,
          "_id.eventId": 1,
          "_id.oddsType": 1,
          Position: -1, // max first
        },
      },
      {
        $group: {
          _id: {
            marketId: "$_id.marketId",
            eventId: "$_id.eventId",
            oddsType: "$_id.oddsType",
          },
          maxPosition: { $first: "$Position" },
          teamName: { $first: "$teamName" },
          sportsId: { $first: "$sportsId" },
        },
      },
      {
        $project: {
          _id: 1,
          teamName: 1,
          sportsId: 1,
          maxPosition: { $multiply: ["$maxPosition", -1] }, // 🔥 multiply by -1
        },
      },
    ]);
    
    let returnData = []
    
    positionData.map(p => {
      let match = {};
      if (p.sportsId == 7 || p.sportsId == 4339) {
        match = matchMapByMarketId[p._id.marketId] || {};
        match.matchName = match.sportName
      } else {
        match =  matchMap[p._id.eventId] || {};
      }


      returnData.push({
        _id  : `${match.matchName} - ${p._id.oddsType}`,
        matchName: match.matchName,
        eventId: match.eventId,
        sportId: match.sportId,
        marketId: match.marketId,
        gameType: p._id.oddsType,
        amount: p.maxPosition,
        teamName: p.teamName,
        dataType : "odds"
      })
    });
        

        let sessionWhereQuery = {
            [userTypeId]: new ObjectId(userId),
            eventId: {$in : eventIdArrayList},
            isDeclare: 0,
            forBet: 1,
            overallType: "fancyOdds",
        };
          


      let resData = await TransactionLogModel.aggregate([
      {
        $match: sessionWhereQuery,
      },
      {
        $group: {
          _id: {
            eventId: "$eventId",
            selectionId: "$selectionId",
          },
          position: { $sum: `$${userTypeAmount}` },
          remarks: { $first: "$remarks" },
          sportId: { $first: "$sportId" },
        },
      },
      ]);
        
        resData && resData.map(p => {
        const match = matchMap[p._id.eventId] || {};
          returnData.push({
            _id  : `${p.remarks}`,
            matchName: match.matchName,
            eventId: match.eventId,
            marketId: match.marketId,
            sportId: match.sportId,
            gameType : "fancyOdds",
            amount: p.position,
            teamName: `${p.remarks}`,
            dataType : "fancy"
          })
      });
          
        
        returnData.sort((a, b) =>
            a._id.trim().localeCompare(b._id.trim())
        );
      
        return SendResponse(res, "success", "dataFetched", returnData);

  } catch (error) {
    console.error("❌ marketAnalysis error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};

const userExposure = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userType = loggedUserData.userType
  let userId = loggedUserData.userId

  let where = {
    forBet: 1,
    isDeclare: 0,
    isComm: 0,
    overallType : {$ne : "openBet"}
  };

  where = await whereHelper(loggedUserData, where)
  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }

  let getData = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        amount: { $sum: `$${userType}ShareAmount` },
      },
    },
  ]);

  return SendResponse(
    res,
    "success",
    "data fetch successfully",
    getData
  );
};

let bookDetails1 = async (req, res) => {
  let reqData = req
  const bodyData = req.body;
  const currentUserData = reqData.userData;
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
    let userIdArray = userData?.idArrayData
    let finalLedgerData = []

    let isFinalSheet = false
    if (bodyData.isFinalSheet) {
      isFinalSheet = bodyData.isFinalSheet
    }


    let totalCash = 0

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


      let crickGroup = {
        _id: `$${fetchUserType}Id`,
        userLedgerAmount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${fetchUserType}LedgerAmount`,
              0,
            ],
          },
        },
        userSettlement: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] } ,  { $eq: ["$userId", new ObjectId(fetchUserId)] }],
              },
              `$${fetchUserType}LedgerAmount`,
              0,
            ],
          },
        },
        cashAmount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCash", true] }],
              },
              `$${fetchUserType}LedgerAmount`,
              0,
            ],
          },
        },
      }



      if (fetchUserType == "client") {
        crickGroup.userLedgerAmount = {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$amount`,
              0,
            ],
          },
        }
        crickGroup.userSettlement = {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] }],
              },
              `$amount`,
              0,
            ],
          },
        }

        crickGroup.cashAmount = {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isCash", true] }],
              },
              `$${fetchUserType}LedgerAmount`,
              0,
            ],
          },
        }



      }

        

      let selfCrickData = await crickTransaction.aggregate([
        {
          $match: crickWhereObj,
        },
        {
          $group: crickGroup,
        },
      ]);


      let userLedgerAmount = selfCrickData[0]?.userLedgerAmount ? selfCrickData[0]?.userLedgerAmount : 0
      
      let userSettlement = selfCrickData[0]?.userSettlement ? selfCrickData[0]?.userSettlement : 0

      let pushArray = {
        balance: userLedgerAmount,
        userId: userData.userId,
        userType: userData.userType,
        username: userData.username,
        name: userData.name,
        coins: userData.coins,
      }


      if (isFinalSheet) {
        pushArray.balance = userLedgerAmount + userSettlement
       // pushArray.balance = userLedgerAmount 
      }

      totalCash += userSettlement
      finalLedgerData.push(pushArray)
    }



    let shareData = await userModel.findOne({ userId: new ObjectId(userId) }, {
      creatorShareData: 1, userType: 1, username: 1, name: 1, userId: 1, creatorId :1
    })



    let creatorId = shareData?.creatorId

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

    let fetchUserProfitLossTypeAmount = `${userType}ProfitLoss`
    let fetchUserLedgerTypeAmount = `${userType}LedgerAmount`

    if (userType == "client") {
      fetchUserProfitLossTypeAmount = `amount`
      fetchUserLedgerTypeAmount = `amount`
    }


    let crickGroup = {
      _id: `$${userType}Id`,
      userProfitLoss: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "profitLoss"] }],
            },
            `$${fetchUserProfitLossTypeAmount}`,
            0,
          ],
        },
      },
      userLedgerAmount: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "profitLoss"] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
      userSettlementAmount: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "ledger"] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
       userSettlementAmountSelf: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$transactionType", "ledger"] } , { $eq: ["$creatorId", new ObjectId(creatorId)] }],
            },
            `$${fetchUserLedgerTypeAmount}`,
            0,
          ],
        },
      },
        cashTaken :  {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          },
          cashGive : {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
        }
    }



    

    let selfCrickData = await crickTransaction.aggregate([
      {
        $match: selfWhere,
      },
      {
        $group: crickGroup,
      },
    ]);
    // _d(selfCrickData , "selfCrickData")
    let creatorName = shareData?.creatorShareData?.username

    let parentSettlementData = {
      name: creatorName,
      userType: shareData?.creatorShareData?.userType,
      userId: shareData?.creatorShareData?.creatorId,
      totalSettlement: -1 * (selfCrickData[0]?.userLedgerAmount + selfCrickData[0]?.userSettlementAmountSelf)
    }

    // _d(selfCrickData[0] , "")
    //totalCash = selfCrickData[0].userSettlementAmount ? selfCrickData[0].userSettlementAmount : 0 
    totalCash = selfCrickData[0].cashGive  - selfCrickData[0].cashTaken
    


    let finalReturnData = {
      downlineUserData: finalLedgerData,
      parentSettlementData: parentSettlementData,
      selfProfitLoss: {
        name: shareData?.username,
        userType: shareData?.userType,
        userId: shareData?.userId,
        totalSettlement: -1 * selfCrickData[0]?.userProfitLoss,
      },
      totalCash: -1 * totalCash
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

const bpexchAccountStatement = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    let userType = loginData.userType

    if (bodyData.creatorId) {
      where = {}
      where.creatorId = new ObjectId(bodyData.creatorId);
    }

    if (bodyData.userId) {
      where = {}
      where.userId = new ObjectId(bodyData.userId);
    }


    if (bodyData.transactionType) {
      where.transactionType = bodyData.transactionType;
    }

    if (bodyData.showParent && bodyData.showParent == true) {
      where.creatorId = { $ne: new ObjectId(bodyData.userId) }
    }

    if (bodyData.showChild && bodyData.showChild == true) {
      where.creatorId = { $eq: new ObjectId(bodyData.creatorId) }
      where.userId = { $eq: new ObjectId(bodyData.creatorId) }
    }


    if (bodyData.allTrue && bodyData.allTrue == true) {
      where = {
        [bodyData.userType + "Id"]: new ObjectId(bodyData.userId),
        $or: [
          { transactionType: "profitLoss" },
          { transactionType: "depositWithdrawal" },
          { transactionType: "ledger", creatorId: new ObjectId(bodyData.userId) },
          { transactionType: "ledger", userId: new ObjectId(bodyData.userId) }
        ]
      };
      if (bodyData.userType) {
        userType = bodyData.userType
      }
    }

    if (bodyData.isProfitLoss && bodyData.isProfitLoss == true) {
      where = {
        [bodyData.userType + "Id"]: new ObjectId(bodyData.userId),
        transactionType: "profitLoss"
      }
    }

    if (bodyData.isLedger && bodyData.isLedger == true) {
      where = {
        transactionType: "ledger",
        $or: [
          { creatorId: new ObjectId(bodyData.userId) },
          { userId: new ObjectId(bodyData.userId) }
        ]
      };
    }

    if (bodyData.isHistory && bodyData.isHistory == true) {
      where = {
        [bodyData.userType + "Id"]: new ObjectId(bodyData.userId),
        $or: [
          { transactionType: "profitLoss" },
          { transactionType: "ledger", userId: new ObjectId(bodyData.userId) }
        ]
      };
    }

    if (bodyData.showOnlyChipsClient && bodyData.showOnlyChipsClient == true) {
      where = {
        userId: new ObjectId(bodyData.userId),
        $or: [
          { transactionType: "depositWithdrawal", userId: new ObjectId(bodyData.userId) }
        ]
      };
    }


    if (bodyData.showOnlyCash && bodyData.showOnlyCash == true) {
      let hereUserType = userType
      if (bodyData.userType) { hereUserType = bodyData.userType }
      where = {
        [hereUserType + "Id"]: new ObjectId(bodyData.userId),
        isCash: true,
        transactionType: "ledger",
        $or: [
          { userId: new ObjectId(bodyData.userId) },
          { creatorId: new ObjectId(bodyData.userId) }
        ]
        // $or: [
        //   { transactionType: "ledger", [hereUserType + "Id"]: new ObjectId(bodyData.userId) }
        // ]
      };
    }


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

    if (bodyData.gameName) {
      where.gameName = bodyData.gameName
    }


    if (bodyData.userType) {
      userType = bodyData.userType
    }

    
    let group = {
      _id: {
        remarks: `$remarks`,
        marketId: `$marketId`,
        selectionId: `$selectionId`,
      },
      userAmount: { $sum: `$${userType}ProfitLoss` },
      amount: { $sum: `$amount` },
      marketId: { $first: `$marketId` },
      transactionType: { $first: `$transactionType` },
      eventId: { $first: `$eventId` },
      result: { $first: `$result` },
      isComm: { $first: `$isComm` },
      createdAt: { $first: `$createdAt` },
      date: { $first: `$date` },
      selectionId: { $first: `$selectionId` },
      seriesId: { $first: `$seriesId` },
      sportId: { $first: `$sportId` },
      marketType: { $first: `$marketType` },
      creatorId: { $first: `$creatorId` },
      userId: { $first: `$userId` },
      gameType: { $first: `$gameType` },
    }


    if (bodyData.isHistory && bodyData.isHistory == true) {
      group.userAmount = { $sum: `$${bodyData.userType}LedgerAmount` }
    }



    if (bodyData.userType && bodyData.userType == "client") {
      group.userAmount = { $sum: `$amount` }
    }



    if (bodyData.isBpexch) {
      delete where.userId
      group.userAmount = { $sum: `$${bodyData.userType}LedgerAmount` }
      where[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId)
    }



    if (bodyData.isBpexch && bodyData.userType == "client") {
      group.userAmount = { $sum: `$amount` }

    }

    let groupUserAmount = group.userAmount



    if (bodyData.showOnlyCash && bodyData.showOnlyCash == true) {
          group.cashTaken =  {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(bodyData.userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          }
          
          group.cashGive = {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$creatorId", new ObjectId(bodyData.userId)] }, { $eq: ["$isCash", true] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
        }
   }
    
    

    var resData = await crickTransaction.aggregate([
      {
        $match: where,
      },
      {
        $group: group,
      },
      {
        $sort: { _id: 1 }
      }
    ]);

     if (bodyData.showOnlyCash && bodyData.showOnlyCash == true) {
        resData.map((data, key) => {
            resData[key].userAmount = -1 * (data.cashGive  - data.cashTaken )
        })
   }

    if (bodyData.isBpexchLedger && userType != "client") {
      resData.map((data, key) => {
        resData[key].userAmount = -1 * data.userAmount
      })
    }

    let message = 0
      
if (bodyData.isOpeningBalance && bodyData.fromDate) {
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
        totalSkipped: groupUserAmount,
      },
    },
    {
      $project: {
        _id: 0,
        totalSkipped: { $ifNull: ["$totalSkipped", 0] },
      },
    },
  ]);

  const totalSkipped = openingBalanceData?.totalSkipped || 0;

  message = userType === "client" ? totalSkipped : -1 * totalSkipped;
}
      
    return SendResponse(
      res,
      "success",
      message,
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`, e);
  }
};


const bpexchClientStatement = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = {
      userId: new ObjectId(loginData.userId),
      $or: [
        { transactionType: { $ne: 'depositWithdrawal' } },
        {
          transactionType: 'depositWithdrawal',
          isCash: { $ne: true }
        }
      ]
    };

    let userType = loginData.userType

    if (bodyData.transactionType) {
      where.transactionType = bodyData.transactionType;
    }

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

    if (bodyData.gameName) {
      where.gameName = bodyData.gameName
    }



    let group = {
      _id: {
        remarks: `$remarks`,
        marketId: `$marketId`,
        selectionId: `$selectionId`,
      },
      amount: { $sum: `$amount` },
      marketId: { $first: `$marketId` },
      transactionType: { $first: `$transactionType` },
      eventId: { $first: `$eventId` },
      result: { $first: `$result` },
      isComm: { $first: `$isComm` },
      createdAt: { $first: `$createdAt` },
      date: { $first: `$date` },
      selectionId: { $first: `$selectionId` },
      seriesId: { $first: `$seriesId` },
      sportId: { $first: `$sportId` },
      marketType: { $first: `$marketType` },
      creatorId: { $first: `$creatorId` },
      userId: { $first: `$userId` },
      gameType: { $first: `$gameType` },
    }

    var resData = await crickTransaction.aggregate([
      {
        $match: where,
      },
      {
        $group: group,
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    //   var resData = await crickTransaction.find(where);


    let message = 0
    if (bodyData.fromDate && bodyData.toDate) {
      delete where.date;
      const fromDate = new Date(bodyData.fromDate);
      const dayBeforeFromDate = new Date(fromDate);
      dayBeforeFromDate.setDate(dayBeforeFromDate.getDate() - 1); // go to previous day
      dayBeforeFromDate.setHours(23, 59, 59, 999); // set time to 23:59:59.999
      let skipToDate = dayBeforeFromDate;
      skippedRecordsGroup = [
        {
          $match: {
            createdAt: {
              $lt: skipToDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalSkipped: { $sum: "$amount" },
          },
        },
      ];

      var crickTotalAmountCount = await crickTransaction.aggregate([
        {
          $match: where,
        },
        {
          $sort: { _id: -1 },
        },
        {
          $facet: {
            skippedRecords: skippedRecordsGroup,
          },
        },
      ]);

      const totalSkipped =
        crickTotalAmountCount[0].skippedRecords.length > 0
          ? crickTotalAmountCount[0].skippedRecords[0].totalSkipped
          : 0;
      message = userType == "client" ? totalSkipped : -1 * totalSkipped;
    }



    return SendResponse(
      res,
      "success",
      message,
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`, e);
  }
};



const userCashCreditData = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId
  let userType = loginData.userType

  let isLoadBalance = bodyData.isLoadBalance ? bodyData.isLoadBalance : false

  if (bodyData && bodyData.userId) {
    userId = bodyData.userId
  }
  if (bodyData && bodyData.userType) {
    userType = bodyData.userType
  }

  let groupUser = {
    _id: `$${userType}Id`,
    creditRecieved: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $ne: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", false] }],
          },
          `$amount`,
          0,
        ],
      },
    },
    creditGive: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $eq: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$isCash", false] }],
          },
          `$amount`,
          0,
        ],
      },
    },
    cashTaken: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
          },
          `$${userType}LedgerAmount`,
          0,
        ],
      },
    },
    cashGive: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$creatorId", new ObjectId(userId)] }, { $eq: ["$isCash", true] }],
          },
          `$${userType}LedgerAmount`,
          0,
        ],
      },
    },
    profitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          `$${userType}ProfitLoss`,
          0,
        ],
      },
    },
    balanceUplineProfitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          `$${userType}LedgerAmount`,
          0,
        ],
      },
    },
    balanceUplineSettlement: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "ledger"] }],
          },
          `$${userType}LedgerAmount`,
          0,
        ],
      },
    },
  }



  if (userType == "client") {
    groupUser.profitLoss = {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          `$amount`,
          0,
        ],
      },
    }
  }



  let userData = await UserModel.findOne({
    [`${userType}Id`]: new ObjectId(userId)
  }, {
    coins: 1,
    exposure: 1,
  })

  let userCoinsWhere = {
    [`${userType}Id`]: new ObjectId(userId)
  }


  // _d(userCoinsWhere , "userCoinsWhere"  )
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



  if (userResdata[0]) {
   
    userResdata[0].cash = userResdata[0].cashTaken - userResdata[0].cashGive

    userResdata[0].creditRemaining = userResdata[0].creditRecieved + userResdata[0].creditGive
    userResdata[0].profitLoss = -1 * userResdata[0].profitLoss
    userResdata[0].coins = userData.coins
    userResdata[0].exposure = userData.exposure
    userResdata[0].balanceUpline = userResdata[0].balanceUplineProfitLoss + userResdata[0].cashTaken

    if (userType != "client") {
      userResdata[0].balance = userResdata[0]?.profitLoss
    } else {
      userResdata[0].balance = userData?.coins ? userData?.coins : 0
    }
  }

   await client.del(`clientCashCredit_${userId + ""}`)

  if (res) {
    return SendResponse(
      res,
      "success",
      "",
      userResdata
    );
  } else {
    return userResdata
  }

}

const depositCredit = async (req, res) => {
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

    let checkTpinByDatabase = await checkTpin(req)



    if (checkTpinByDatabase) {
      if (!bodyData.tpin) {
        return SendResponse(res, "error", "Tpin Is Required");
      }

      if (bodyData.tpin != checkTpinByDatabase) {
        return SendResponse(res, "error", "Tpin Is Incorrect");
      }
    }



    let userData = await userModel.findOne(
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
    
    let creatorData = await userModel.findOne(
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
        creatorShareData: 1
      }
    );

    req.body = {
      userId: userData.userId,
      userType: userData.userType,
    }


    let userCashCredit = await userCashCreditData(req)

    if (userCashCredit[0]) {
      userCashCredit = userCashCredit[0]
    }

    req.body = {
      userId: userData.creatorId,
      userType: creatorData.userType,
    }

    let creatorCashCredit = await userCashCreditData(req)

    if (creatorCashCredit[0]) {
      creatorCashCredit = creatorCashCredit[0]
    }

    let userCredit = userCashCredit.creditRemaining ? userCashCredit.creditRemaining : 0

    let userCash = userCashCredit.cash ? userCashCredit.cash : 0
    let userProfitLoss = userCashCredit.profitLoss ? userCashCredit.profitLoss : 0

    let creatorCredit = creatorCashCredit.creditRemaining ? creatorCashCredit.creditRemaining : 0
    let creatorCash = creatorCashCredit.cash ? creatorCashCredit.cash : 0
    let creatorProfitLoss = creatorCashCredit.profitLoss ? creatorCashCredit.profitLoss : 0

    let coins = Number(bodyData.coins)
    let userCoins = 0
    let creatorCoins = 0
    let creatorCoinsCredit = 0

    if (isCash) {
      creatorCoins = creatorCash + creatorCredit
      userCoins = userCash + userCredit
    } else {
      creatorCoins = creatorCredit - creatorCashCredit.cashGive
      userCoins = userCredit
    }


    if (userData.userType != "client" && !isCash) {
      userCoins = userCashCredit?.creditRemaining + userCashCredit?.cash
    }

    
    if (userData.userType == "client") {
      userCoins = userData.coins
    }
    
    if (userData.userType == "client" && !isCash && userData.coins > userCredit) {
      userCoins = userCredit
          if (coins < 0 && userData.userType == "client") {
          let exposure = Math.abs(userData?.exposure)
            userCoins = userCoins - exposure
        } 
    }

    const updateCoinsWithoutSign = Math.abs(coins);

    creatorCoins = creatorCoins ? Number(creatorCoins) : 0;
    coins = coins ? Number(coins) : 0;
    userCoins = userCoins ? Number(userCoins) : 0;
    
    
  
    if (coins < 0 && updateCoinsWithoutSign > userCoins) {
      return SendResponse(
        res,
        "error",
        `Maximum ${userCoins} coins can be debited from user: ${userData.username}`
      );
    }

    if (coins > 0) {
      if (coins > creatorCoins) {
        return SendResponse(res, "error", `User doesn't have sufficient coins only ${creatorCoins} can`);
      }
    }


    let creatorDepositWithdrawType = `${isCash ? "cash" : "credit"} deposit to ${userData.username}`;
    let userDepositWithdrawType = `${isCash ? "cash" : "credit"} deposit to ${userData.username}`;

    let userStatementStatus = "deposit";

    const creatorUsertypeId = `${creatorData.userType}Id`;
    let creatorCoinsUpdated = coins * -1;

    if (creatorCoinsUpdated > 0) {
      creatorDepositWithdrawType = `withdraw from  ${userData.username}`;
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

    const creatorTransaction = await TransactionLogModel.create(creatorTransactionLog);
    await transactionHelper.updateCoinsTbl(userData.creatorId, creatorData.userType);

    const UsertypeId = `${userData.userType}Id`;

    if (coins < 0) {
      userDepositWithdrawType = `withdraw from  ${userData.username}`;
      userStatementStatus = "withdraw";
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

    const userTransaction = await TransactionLogModel.create(userTransactionLog);

    await transactionHelper.updateCoinsTbl(userId, userData.userType);


    if (isCash) {

      let userRemarkCrick = `${bodyData?.remark}[${bodyData.amount < 0 ? "Cash Withdraw From" : "Cash Deposit To"
        }  ${userData.username} by ${loginData.username} of ${coins} (${_date_time()})]`;


      let crickUserTransactionLedger = {
        amount: bodyData.coins,
        transactionType: "ledger",
        remarks: userRemarkCrick,
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
        [`${userData.userType}ProfitLoss`]: bodyData.coins,
        [`${creatorData.userType}ProfitLoss`]: bodyData.coins,
        [`${loginData.userType}ProfitLoss`]: bodyData.coins,
        [`${userData.userType}LedgerAmount`]: bodyData.coins,
        [`${creatorData.userType}LedgerAmount`]: bodyData.coins,
        [`${loginData.userType}LedgerAmount`]: bodyData.coins,
        isCash: true
      };

      await crickTransaction.create(crickUserTransactionLedger);

    } else {
      let userRemarkCrick = `${isCash ? "cash" : "credit"} [${coins < 0 ? "Withdraw From" : "Deposit To"
        }  ${userData.username} by ${creatorData.username} of ${Math.abs(coins)} - (${_date_time()})]`;


      let creatorRemarkCrick = `${isCash ? "cash" : "credit"} [${creatorCoinsUpdated > 0 ? " Withdraw From" : "Deposit To"
        }  ${userData.username} by ${creatorData.username} of ${Math.abs(creatorCoinsUpdated)}- (${_date_time()})]`;


      let crickCreatorTransaction = {
        amount: creatorCoinsUpdated,
        [creatorData.userType + "ProfitLoss"]: creatorCoinsUpdated,
        transactionType: "depositWithdrawal",
        remarks: bodyData.remark ? `${bodyData.remark} (${_date_time()})` : userRemarkCrick,
        userId: userData.creatorId,
        creatorId: userData.creatorId,
        [creatorData.userType + "Id"]: userData.creatorId,
        [`${creatorData.userType}ProfitLoss`]: creatorCoinsUpdated,
        isCash: isCash
      };


      let updateCreatorCrick = await crickTransaction.create(crickCreatorTransaction);


      let crickUserTransaction = {
        amount: coins,
        transactionType: "depositWithdrawal",
        remarks: bodyData.remark ? `${bodyData.remark} (${_date_time()})` : creatorRemarkCrick,
        userId: userData.userId,
        creatorId: userData.creatorId,
        [userData.userType + "Id"]: userData.userId,
        [`${userData.userType}ProfitLoss`]: coins,
      };

      let updateUserCrick = await crickTransaction.create(crickUserTransaction);

    }


    return SendResponse(res, "success", "Coins Updated Successfully");

  } catch (error) {
    console.log(error, "error")
  }

}



const MaxProfitLossByUserWise = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId
  let userType = loginData.userType
  if (bodyData && bodyData.userId) {
    userId = bodyData.userId
  }
  if (bodyData && bodyData.userType) {
    userType = bodyData.userType
  }

  let groupUser = {
    _id: `$${userType}Id`,
    profitLoss: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "profitLoss"] }],
          },
          `$${userType}ProfitLoss`,
          0,
        ],
      },
    },
  }

  let where = {
    [`${userType}Id`]: new ObjectId(userId)
  }

  var userResdata = await crickTransaction.aggregate([
    {
      $match: where,
    },
    {
      $group: groupUser,
    }
  ]);

  let maxWithdrawAmount = userResdata[0].profitLoss

  if (userResdata[0].profitLoss && userType !="client") {
    maxWithdrawAmount = -1 * userResdata[0].profitLoss
  } 

  if (res) {
    return SendResponse(
      res,
      "success",
      "",
      {
        maxWithdrawAmount : maxWithdrawAmount
      }
    );
  } else {
    return maxWithdrawAmount
  }

}


const profitLossSettlement = async (req, res) => {
   try {
     let bodyData = req.body
     const loginData = req.loggedInUser;
     let userId = loginData.userId
     let userType = loginData.userType
    
      if (bodyData && bodyData.userId) {
        userId = bodyData.userId
      } else {
        req.body.userId = loginData.userId
      }
        
      if (bodyData && bodyData.userType) {
        userType = bodyData.userType
      } else {
        req.body.userType = loginData.userType
      }
     
     let settleAmount = bodyData.amount
     let maxAmountData = await MaxProfitLossByUserWise(req)
     settleAmount = maxAmountData < 0 ? -1 * settleAmount : settleAmount

     if (Math.abs(settleAmount) > Math.abs(maxAmountData)) {
       return SendResponse(res, "error", `Max amount to transfer: ${maxAmountData} Rs `);
     }

     let userData   = await UserModel.findOne({userId : userId})
     let userRemarkCrick = `P/L to Cash transfer`;
     
      let crickUserTransactionLedger = {
        amount: 0,
        transactionType: "profitLoss",
        remarks: userRemarkCrick,
        userType: userData.userType,
        [`${userType}Id`] : userId,
        [`${userType}ProfitLoss`]: settleAmount,
        marketType: "settlement",
        marketId : `1.${_date_time()}`
      };
     
      await crickTransaction.create(crickUserTransactionLedger);
      return SendResponse(res, "success", `Success. ${Math.abs(settleAmount.toFixed(2))} was moved to cash account.`);

  } catch (error) {
    console.log(error, "error")
  }
}


const checkTpin = async (req, res)=>{
   try {
     const loginData = req.loggedInUser;
     let userId = loginData.userId
     let tpin = false
     let data = await SportsSettingModel.findOne({
         userId : new ObjectId(userId)
     }, {
        tpin : 1,
     })
     
     if (data && data.tpin && data.tpin > 0) {
       tpin = true
     }


     if (res) {
       return SendResponse(res, "success", tpin, {
          tpin : tpin
        });
     }else{
       return tpin
     }
     

  } catch (error) {
    console.log(error, "error for checking tpin")
  }
}




const clientCashCreditData = async (req, res) => {
  const loginData = req.loggedInUser;
  let userId = loginData.userId
  let userType = loginData.userType
  if (userType != "client") {
    return SendResponse(
      res,
      "error",
      "only client authorise to access this api"
    );
  }

  let redisData = await client.get(`clientCashCredit_${userId + ""}`)
  if (redisData && redisData != null && redisData != "") {
    return SendResponse(
      res,
      "success",
      "",
      JSON.parse(redisData)
    );
  }



  let groupUser = {
    _id: `$${userType}Id`,
    totalCredit: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "depositWithdrawal"] }, { $eq: ["$isCash", false] }],
          },
          `$amount`,
          0,
        ],
      },
    },
    totalCash: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$isCash", true] }],
          },
          `$${userType}LedgerAmount`,
          0,
        ],
      },
    },
     profitLoss : {
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
     clientId : new ObjectId(userId)
  }




  let [userData, userResdata] = await Promise.all([
          UserModel.findOne({
          [`${userType}Id`]: new ObjectId(userId)
        }, {
          coins: 1,
          exposure: 1,
        }),
      crickTransaction.aggregate([
      {
        $match: userCoinsWhere,
      },
      {
        $group: groupUser,
      },
      {
        $sort: { _id: 1 }
      }
    ])
      
  ])

  
  if (userResdata[0]) {
    userResdata[0].profitLoss = -1 * userResdata[0].profitLoss
    userResdata[0].coins = userData?.coins ? userData?.coins : 0 
    userResdata[0].exposure = userData.exposure ? userData.exposure : 0 
    userResdata[0].balance = userData?.coins ? userData?.coins : 0
  }


  await client.set(`clientCashCredit_${userId+""}` , JSON.stringify(userResdata))

  if (res) {
    return SendResponse(
      res,
      "success",
      "",
      userResdata
    );
  } else {
    return userResdata
  }

}


module.exports = {
  dashboardMatchList,
  profitLossrepostByGameWise,
  loadBalance,
  profitLossAccordingToDate,
  commissionReport,
  checkExposuerForUsers,
  userExposure,
  bookDetails1,
  bpexchAccountStatement,
  bpexchClientStatement,
  userCashCreditData,
  depositCredit,
  MaxProfitLossByUserWise,
  profitLossSettlement,
  checkTpin,
  clientCashCreditData
};
