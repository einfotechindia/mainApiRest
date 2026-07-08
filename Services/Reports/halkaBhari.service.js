const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const fancyBetListModel = require("../../Models/BetsList/FancyBetsList.model");
const oddsBetListModel = require("../../Models/BetsList/OddsBetsList.model");
const crickTransaction = require("../../Models/crickTransaction.model");
const { UserTypes } = require("../../Common/Constants");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  _dx,
  _d,
  convertKeyObject,
  whereHelper,
  dateWhereCond,
} = require("../../Helpers/CommonHelper");

const {
  gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");

const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");


const BetService = require("../../Services/Sports/Bet.service")


const accountHalkaBhari = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    let userType = loginData.userType


    if (bodyData.creatorId) {
      where = {}
      where.creatorId = new ObjectId(bodyData.creatorId); // for downline check
    }

    if (bodyData.userId) {
      where = {}
      where.userId = new ObjectId(bodyData.userId); // for downline check
    }


    if (bodyData.transactionType) {
      where.transactionType = bodyData.transactionType;
    }



    if (bodyData.showParent && bodyData.showParent == true) {
      where.creatorId = { $ne: null }
    }

    if (bodyData.allTrue && bodyData.allTrue == true) {
      where = {
        [bodyData.userType + "Id"]: new ObjectId(bodyData.userId),

      }

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
        creatorId: new ObjectId(bodyData.userId),
        transactionType: "ledger"
      }
    }

    if (bodyData.isSettlement && bodyData.isSettlement == true) {
      where = {
        userId: new ObjectId(bodyData.userId),
        transactionType: "depositWithdraw"
      }
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


    if (bodyData.isHistory && bodyData.isHistory == true) {
      where.transactionType = {
        $in: ["profitLoss", "ledger"]
      }

      where[bodyData.userType + "Id"] = new ObjectId(bodyData.userId)
      userType = bodyData.userType
      delete where.userId


    }

    let group = {
      _id: `$remarks`,
      userAmount: { $sum: `$${userType}ProfitLoss` },
      comm: {
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
      gameType: { $first: `$gameType` },
    }

    if (bodyData.isHistory && bodyData.isHistory == true) {
      where.transactionType = {
        $in: ["profitLoss", "ledger"]
      }
      where[bodyData.userType + "Id"] = new ObjectId(bodyData.userId)
      userType = bodyData.userType
      group.userAmount = { $sum: `$${userType}ProfitLoss` }
      delete where.userId
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

    return SendResponse(
      res,
      "success",
      "account Statement Fetch Successfully",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`);
  }
};

const inplayOddsPositionHalkaBhari = async (req, res) => {
  try {
    const loggedInData = req.loggedInUser;
    const { userId, userType } = loggedInData;

    const userTypeAmount = userType === "client" ? "amount" : `${userType}Amount`;

    const oddsType = req?.body?.oddsType ? "bookmaker" : "matchOdds";
    const isBetCount = !!req?.body?.isBetCount;

    let  matchList = await BetService.getMatchList();

    if (!matchList?.length) {
      return SendResponse(
        res,
        "success",
        "Inplay Matches Odds Position Fetch Successfully",
        {}
      );
    }

    const marketIdArray = matchList.map(m => m.marketId);
    if (matchList && matchList.length != 0) {
      matchList = convertKeyObject(matchList , "marketId")
    }

  

    let where = await whereHelper(loggedInData, {
      marketId: { $in: marketIdArray }
    });

    const promises = [
      OddsPositionModel.aggregate([
        { $match: where },
        {
          $group: {
            _id: {
              marketId: "$marketId",
              selectionId: "$selectionId"
            },
            Position: { $sum: "$" + userTypeAmount },
            totalPosition: { $sum: "$amount" },
            teamName: { $first: "$teamName" },
            oddsType: { $first: "$oddsType" }
          }
        }
      ])
    ];

    if (isBetCount) {
      promises.push(
        BetModel.aggregate([
          { $match: where },
          {
            $group: {
              _id: "$marketId",
              betsCount: { $sum: 1 }
            }
          }
        ])
      );
    }

    const results = await Promise.allSettled(promises);

    const positionData =
      results[0].status === "fulfilled" ? results[0].value : [];

    let oddsCountData = {};

    if (isBetCount && results[1]?.status === "fulfilled") {
      oddsCountData = convertKeyObject(results[1].value, "_id");
    }



    const formattedData = positionData.reduce((acc, item) => {

      const marketId = item._id.marketId;
      const selectionId = item._id.selectionId;

      acc[marketId] ??= {};


      if (matchList[marketId]) {
        match = matchList[marketId]
      }

      acc[marketId][selectionId] = {
        _id: selectionId,
        Position: item.Position,
        totalPosition: item.totalPosition,
        oddsType: item.oddsType || "bookmaker",
        teamName: item.teamName,
        eventId: match.eventId,
        marketId: match.marketId,
        matchName: match.matchName,
        sportId: match.sportId,
        sportId: match.sportId,
        matchDate: match.matchDate,
        matchType: match.matchType,
        betCount: oddsCountData?.[marketId]?.betsCount || 0
      };

      return acc;

    }, {});



    return SendResponse(
      res,
      "success",
      "Inplay Matches Odds Position Fetch Successfully",
      formattedData
    );

  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);

    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const halkaBhariPlusMinus = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
  }



  let userWhere = {};
  let marketId = "";


  if (bodyData.marketId) {
    marketId = bodyData.marketId;
    userWhere = { marketId: marketId };
  }

  if (bodyData.userId) {
    userId = bodyData.userId;
    userType = bodyData.userType;
  }
  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];
  userWhere[`${userType}Id`] = new ObjectId(userId);

  if (bodyData.isCasino) {
    userWhere.isCasino = bodyData.isCasino;
  }

  if (bodyData.eventId) {
    userWhere.eventId = bodyData.eventId;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.downlineUserType) {
    downlineUserType = bodyData.downlineUserType;
  }

  let group = {
    _id: `$${downlineUserType}Id`,
    clientOddsAmount: { $sum: "$clientOddsAmount" },
    clientSessionAmount: { $sum: "$clientSessionAmount" },
    clientOddsComm: { $sum: "$clientOddsComm" },
    clientSessionComm: { $sum: "$clientSessionComm" },
    clientNetAmount: { $sum: "$clientNetAmount" },
    userOddsComm: { $sum: `$${downlineUserType}OddsComm` },
    userSessionComm: { $sum: `$${downlineUserType}SessionComm` },
    userNetProfitLoss: { $sum: `$${downlineUserType}NetProfitLossSelf` },
    userLedgerAmt: { $sum: `$${downlineUserType}LedgerAmt` },
  }

  UserTypes.map((userType, key) => {
    if (Userpriority >= key) {
      group[`${userType}NetProfitLoss`] = { $sum: `$${userType}NetProfitLossSelf` }
    }
  })

  var resData = await profitLossPosition.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: group,
    },
  ]);

  let returnObj = [];
  let idArray = resData.map((item) => item._id);
  let downlineTypeData = await UserModel.find(
    {
      userId: { $in: idArray },
    },
    {
      username: 1,
      name: 1,
      userType: 1,
      userMatchShare: 1,
      creatorId: 1,
      creatorUserType: 1,
    }
  );
  if (downlineTypeData) {
    downlineTypeData = convertKeyObject(downlineTypeData, "_id");
  }

  let superDownlineUserType = "";

  const downUserpriority = UserTypes.indexOf(downlineUserType);
  superDownlineUserType = UserTypes[downUserpriority - 1];

  resData.forEach((element) => {
    element.userData = downlineTypeData[element._id];
    element.userMatchShare = downlineTypeData[element._id].userMatchShare;
    element.downlineUserType = superDownlineUserType;
    returnObj.push(element);
  });

  return SendResponse(res, "success", "dataFetched", returnObj);
};

const halkaBhariPlusMinusMarketWise = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const where = await whereHelper(loginData, {
      transactionType : "profitLoss"
    });

    const userType = bodyData.userType || loginData.userType;
    const userId = bodyData.userId || loginData.userId;
    const userPriority = UserTypes.indexOf(userType);

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (bodyData.marketId) where.marketId = bodyData.marketId;
    if (bodyData.marketType) where.marketType = bodyData.marketType;
    if (bodyData.selectionId) where.selectionId = bodyData.selectionId;
    if (bodyData.sportId) where.sportId = bodyData.sportId;
    if (bodyData.seriesId) where.seriesId = bodyData.seriesId;

    if (bodyData.userId && bodyData.userType) {
      if (!ObjectId.isValid(bodyData.userId)) {
        return SendResponse(res, "error", "Invalid User Id");
      }
      where[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    }

    const group = {
      _id: {
        eventId: "$eventId",
        eventName: "$eventName"
      },

      eventId: {
        $first: "$eventId"
      },

      eventName: {
        $first: "$eventName"
      },

      marketId: {
        $first: "$marketId"
      },

      marketType: {
        $first: "$marketType"
      },

      selectionId: {
        $first: "$selectionId"
      },

      result: {
        $first: "$result"
      },

      transactionType: {
        $first: "$transactionType"
      },

      createdAt: {
        $max: "$createdAt"
      },

      date: {
        $first: "$date"
      },

      amount: {
        $sum: "$amount"
      },

      userNetProfitLoss: {
        $sum: {
          $cond: [
            { $eq: ["$isComm", 0] },
            `$${userType}ProfitLoss`,
            0
          ]
        }
      },

      userSessionComm: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$isComm", 1] },
                { $eq: ["$marketType", "fancy"] }
              ]
            },
            `$${userType}ProfitLoss`,
            0
          ]
        }
      },
        oddsComm: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$isComm", 1] },
                  { $ne: ["$marketType", "fancy"] }
                ]
              },
              `$${userType}ProfitLoss`,
              0
            ]
          }
        }
    };

    for (let i = 0; i <= userPriority; i++) {
      group[`${UserTypes[i]}NetProfitLoss`] = {
        $sum: `$${UserTypes[i]}ProfitLoss`
      };
    }

    const pipeline = [
      {
        $match: where
      },

      {
        $project: {
          eventId: 1,
          eventName: 1,
          marketId: 1,
          marketType: 1,
          selectionId: 1,
          result: 1,
          transactionType: 1,
          createdAt: 1,
          date: 1,
          amount: 1,
          isComm: 1,
          [`${userType}ProfitLoss`]: 1,
          ...Object.fromEntries(
            UserTypes.slice(0, userPriority + 1).map(u => [
              `${u}ProfitLoss`,
              1
            ])
          )
        }
      },

      {
        $group: group
      },

      {
        $sort: {
          createdAt: -1
        }
      }
    ];

    const resData = await crickTransaction.aggregate(pipeline, {
      allowDiskUse: true,
      maxTimeMS: 120000
    });

    return SendResponse(
      res,
      "success",
      "Market wise data fetched successfully",
      resData
    );

  } catch (err) {

    console.error("halkaBhariPlusMinusMarketWise Error");

    console.error({
      message: err.message,
      stack: err.stack
    });

    return SendResponse(
      res,
      "error",
      "Something went wrong"
    );
  }
};

const halkaBhariSportsProfitLoss = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData, {
      transactionType: "profitLoss"
    });
    let userType = loginData.userType
    let userId = loginData.userId
    if (bodyData.userType) {
      userType = bodyData.userType
    }
    if (bodyData.userId) {
      userId = bodyData.userId
    }

    let userDataArray = {}

    if (bodyData.isClient & bodyData.isClient == true) {
      let clientData = await UserModel.find({
        [`${userType}Id`]: new ObjectId(userId),
        userType: "client"
      }, {
        userId: 1,
        username: 1,
        name: 1,
        userType: 1,
        userMatchShare: 1,
        intCasinoShare: 1,
        userCasinoShare: 1,
        creatorShareData: 1,
      })
      if (clientData) {
        userDataArray = convertKeyObject(clientData, "userId")
      }
    } else {
      let directUserData = await gettingDirectUserByUserId(userId);
      userDataArray = directUserData.userDataArray;
    }



    _d(userDataArray)


    let returnData = [];
    for (const key in userDataArray) {
      if (userDataArray.hasOwnProperty(key)) {

        let originalWhere = where
        const user = userDataArray[key];
        let downLineUserType = user.userType
        let downLineUserId = user.userId

        originalWhere[`${downLineUserType}Id`] = downLineUserId

        let group = {
          _id: `$${downLineUserType}Id`,
          cricket: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$gameType", "cricket"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
          fancy: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$marketType", "fancy"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
          tennis: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$gameType", "tennis"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
          soccer: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$gameType", "soccer"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
          internationalCasino: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$marketType", "internationalCasino"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
          diamondCasino: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$marketType", "diamondCasino"] }],
                },
                `$${downLineUserType}ProfitLoss`,
                0,
              ],
            },
          },
        }

        if (downLineUserType == "client") {
          group.userProfitLoss = "amount"
        }

        var resData = await crickTransaction.aggregate([
          {
            $match: originalWhere,
          },
          {
            $group: group,
          },
          {
            $sort: { _id: 1 }
          }
        ]);

        let pushData = {}
        if (resData[0]) {
          pushData = resData[0]
          pushData.userData = {
            userId: user.userId,
            userType: user.userType,
            username: user.username,
            name: user.name,
          }
          returnData.push(pushData)
        }
      }
    }

    return SendResponse(
      res,
      "success",
      "data fetch successfully",
      returnData
    );

  }
  catch (error) {
    console.log(error)
  }
}

const getClientPositionByMarket = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.marketId) {
    return SendResponse(res, "error", "market Id Is Required");
  }
  const creatorUserType = bodyData.creatorType;
  const userId = bodyData.userId;
  const loginData = req.loggedInUser;



  let where = await whereHelper(loginData, { userType: "client" })

  _dx(where)









  let clientData = await UserModel.find(where, { username: 1, userId: 1, name: 1, userMatchShare: 1 })


  Object.entries(clientData).forEach(async ([userId, userValue]) => { });

  _dx(clientData)



  let promises = Object.entries(userList).map(async ([userId, userValue]) => {
    let query = {
      marketId: bodyData.marketId,
    };
    if (bodyData.oddsType) {
      query.oddsType = bodyData.oddsType;
    }
    let userTypeAmount = `${bodyData.userType}Amount`;

    if (userValue.userType == "client") {
      userTypeAmount = "amount";
      query.userId = new ObjectId(userValue.userId);
    } else {
      query[`${userValue.userType}Id`] = new ObjectId(userValue.userId);
    }

    return await OddsPositionModel.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: "$selectionId",
          Position: { $sum: "$" + userTypeAmount },
          totalPosition: { $sum: "$amount" },
        },
      },
    ]).then((resDataUser) => {
      if (resDataUser) {
        return {
          position: resDataUser,
          userInfo: userValue,
        };
      } else {
        console.log("hhh");
      }
    });
  });
  let userListReportArray = await Promise.all(promises);
  return SendResponse(res, "success", "dataFetched", userListReportArray);
};

const monitoruser = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    let userType = loginData.userType



  } catch (e) {
    console.log(``)
  }
}


const clientProfitLossByMarket = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;

    const where = await whereHelper(loginData, {
      transactionType: "profitLoss",
      clientId: { $ne: null },
    });

    const userType = bodyData.userType || loginData.userType;
    const userId = new ObjectId(bodyData.userId || loginData.userId);

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    where[`${userType}Id`] = userId;

    const group = {
      _id: "$userId",
       cricket: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$gameType", "Cricket"] },
                    { $ne: ["$marketType", "fancy"] }
                  ]
                },
                "$amount",
                0
              ]
            }
          },
      fancy: {
        $sum: {
          $cond: [{ $eq: ["$marketType", "fancy"] }, "$amount", 0],
        },
      },
      tennis: {
        $sum: {
          $cond: [{ $eq: ["$gameType", "tennis"] }, "$amount", 0],
        },
      },
      soccer: {
        $sum: {
          $cond: [{ $eq: ["$gameType", "soccer"] }, "$amount", 0],
        },
      },
      internationalCasino: {
        $sum: {
          $cond: [{ $eq: ["$marketType", "internationalCasino"] }, "$amount", 0],
        },
      },
      diamondCasino: {
        $sum: {
          $cond: [{ $eq: ["$marketType", "diamondCasino"] }, "$amount", 0],
        },
      },
    };

    const resData = await crickTransaction.aggregate([
      { $match: where },
      { $group: group },
      { $sort: { _id: 1 } },
    ]);

    if (!resData.length) {
      return SendResponse(res, "success", "data fetch successfully", []);
    }

    const userIds = resData.map((item) => item._id);

    let userData = await UserModel.find(
      {
        userId: { $in: userIds },
      },
      {
        username: 1,
        name: 1,
        parentData: 1,
      }
    ).lean();

    userData = convertKeyObject(userData, "_id");

    const userTypes = [
      "owner",
      "subowner",
      "superadmin",
      "admin",
      "subadmin",
      "master",
      "superagent",
      "agent",
    ];

    const returnData = resData.map((element) => {
      const user = userData[element._id];

      if (!user) {
        return element;
      }

      const parentUsernames = Object.fromEntries(
        userTypes.map((type) => [
          type,
          user.parentData?.[`${type}userName`] ?? null,
        ])
      );

      return {
        ...element,
        userData: {
          username: user.username,
          name: user.name,
          parentUsernames,
        },
      };
    });

    return SendResponse(
      res,
      "success",
      "data fetch successfully",
      returnData
    );
  } catch (error) {
    console.error(error);
    return SendResponse(
      res,
      "error",
      "Something went wrong",
      null
    );
  }
};



const fancyScale = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const where = await whereHelper(loginData, {
      isDeleted: 0,
      isDeclare: 1
    });
    const userId = new ObjectId(bodyData.userId || loginData.userId);

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    let directUserData = await gettingDirectUserByUserId(userId);
    let userDataArray = directUserData.userDataArray;

   const results = await Promise.all(
      Object.values(userDataArray).map(async (user) => {
        const downLineUserType = user.userType;
        const downLineUserId = user.userId;

        const originalWhere = {
          ...where,
          [`${downLineUserType}Id`]: downLineUserId,
        };

        const resData = await fancyBetListModel.aggregate([
          {
            $match: originalWhere,
          },
          {
            $group: {
              _id: `$${downLineUserType}Id`,
              amount: { $sum: "$amount" },
            },
          },
          {
            $sort: { _id: 1 },
          },
        ]);

    if (!resData.length) return null;

    return {
      ...resData[0],
      userData: {
        userId: user.userId,
        userType: user.userType,
        username: user.username,
        name: user.name,
      },
    };
  })
);

const returnData = results.filter(Boolean);


    return SendResponse(
      res,
      "success",
      "data fetch successfully",
      returnData
    );
  } catch (error) {
    console.error(error);
    return SendResponse(
      res,
      "error",
      "Something went wrong",
      null
    );
  }
};


const matchScale = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const where = await whereHelper(loginData, {
      isDeleted: 0,
      isDeclare : 1 
    });
    const userId = new ObjectId(bodyData.userId || loginData.userId);

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    let directUserData = await gettingDirectUserByUserId(userId);
    let userDataArray = directUserData.userDataArray;

   const results = await Promise.all(
      Object.values(userDataArray).map(async (user) => {
        const downLineUserType = user.userType;
        const downLineUserId = user.userId;

        const originalWhere = {
          ...where,
          [`${downLineUserType}Id`]: downLineUserId,
        };

        const resData = await oddsBetListModel.aggregate([
          {
            $match: originalWhere,
          },
          {
            $group: {
              _id: `$${downLineUserType}Id`,
              amount: { $sum: "$amount" },
            },
          },
          {
            $sort: { _id: 1 },
          },
        ]);



    if (!resData.length) return null;

    return {
      ...resData[0],
      userData: {
        userId: user.userId,
        userType: user.userType,
        username: user.username,
        name: user.name,
      },
    };
  })
);

const returnData = results.filter(Boolean);


    return SendResponse(
      res,
      "success",
      "data fetch successfully",
      returnData
    );
  } catch (error) {
    console.error(error);
    return SendResponse(
      res,
      "error",
      "Something went wrong",
      null
    );
  }
};


module.exports = {
  accountHalkaBhari,
  inplayOddsPositionHalkaBhari,
  halkaBhariPlusMinus,
  halkaBhariPlusMinusMarketWise,
  halkaBhariSportsProfitLoss,
  getClientPositionByMarket,
  clientProfitLossByMarket,
  fancyScale,
  matchScale
};
