const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const crickTransaction = require("../../Models/crickTransaction.model");
const sportsListModel = require("../../Models/sportList.model");
const fancyListModel = require("../../Models/fancyList.model");
const oddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const fancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const internationalCasinnoBetList = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const LedgerModel = require("../../Models/Ledger.model")
const MlmChainListModel = require("../../Models/BtoC/mlmChainList.model");
const UserUtils = require("../../Helpers/UsersUtils");
const { siteSetting, UserTypes, allowedCreation } = require("../../Common/Constants");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const {
  _dx,
  _d,
  _date_time,
  convertKeyObject,
  convertObjectToArray,
  whereHelper,
  dateWhereCond,
  _date,
  getMondayRange,
  throughSocketDataByAxios,
  convertKeyObjectAndSeperateid,
  parentDataAppend
} = require("../../Helpers/CommonHelper");
const {
  getShareDataByUserId,
  gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const ShareModel = require("../../Models/User/Share.model");
const { isNull } = require("lodash");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const { getUserCoinsByTransactionTable, updateCoinsTbl, UpdateUserCoins } = require("../../Helpers/TransactionHelper");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");


const downLineGiveAndUpperlineTakeComm = async (userId, userWhere = {}) => {
  try {
    let directUserData = await gettingDirectUserByUserId(userId);
    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let downlineUserComm = {
      downlineOddsComm: 0,
      downlineSessionComm: 0,
    };
    for (const key in userArrayWhere) {
      if (userArrayWhere[key].$in && Array.isArray(userArrayWhere[key].$in)) {
        let downLineUserType = key.split("Id")[0];
        let downLineUserWhere = {
          ...userWhere,
          ...{
            [key]: {
              $in: userArrayWhere[key].$in,
            },
          },
        };
        var resDataUser = await profitLossPosition.aggregate([
          {
            $match: downLineUserWhere,
          },
          {
            $group: {
              _id: `$${key}`,
              downLineOddsComm: { $sum: `$${downLineUserType}OddsComm` },
              downLineSessionComm: {
                $sum: `$${downLineUserType}SessionComm`,
              },
            },
          },
        ]);

        if (resDataUser && resDataUser.length > 0) {
          resDataUser.map((res) => {
            let downLineOddsComm = res.downLineOddsComm;
            let downlineSessionComm = res.downLineSessionComm;
            if (userDataArray[res._id + ""]) {
              let userDetails = userDataArray[res._id];
              let userMatchShare = userDetails.userMatchShare;

              downLineOddsComm =
                ((100 - userMatchShare) / 100) * downLineOddsComm;
              downlineSessionComm =
                ((100 - userMatchShare) / 100) * downlineSessionComm;
            }
            downlineUserComm.downlineOddsComm += downLineOddsComm;
            downlineUserComm.downlineSessionComm += downlineSessionComm;
          });
        }
      }
    }

    return downlineUserComm;
  } catch (error) {
    console.log(error.messgae);
  }
};

let mondayToMondayReportProfitLoss = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let userType = loginData.userType;
    let userId = loginData.userId;
    let query = await whereHelper(loginData);

    query.transactionType = "profitLoss"
    let mondayRange = getMondayRange();

    query.date = await dateWhereCond(
      mondayRange.startMonday,
      mondayRange.endMonday
    );


    let group = {
      _id: `$${loginData.userType}Id`,
      userComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 1] }],
            },
            `$${loginData.userType}ProfitLoss`,
            0,
          ],
        },
      },
      userprofitLoss: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            `$${loginData.userType}ProfitLoss`,
            0,
          ],
        },
      },
    }


    var resData = await crickTransaction.aggregate([
      {
        $match: query,
      },
      {
        $group: group,
      },
      {
        $sort: { _id: 1 }
      }
    ]);


    let netProfitLoss = resData[0]?.userprofitLoss ? resData[0]?.userprofitLoss : 0
    let netCommission = resData[0]?.userComm ? resData[0]?.userComm : 0


    let returnData = {
      netProfitLoss: netProfitLoss,
      commission: netCommission,
    };

    return SendResponse(
      res,
      "success",
      "User List fetched Successfully",
      returnData
    );
  } catch (error) {
    console.log(error.message);
  }
};

const userProfitLossCrick = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let userType = loginData.userType;
    let userId = loginData.userId;
    let query = await whereHelper(loginData);

    if (bodyData.userId) {
      userId = bodyData.userId;
    }

    if (bodyData.userType) {
      userType = bodyData.userType;
    }

    let directUserData = await gettingDirectUserByUserId(userId);
    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = {};

    let positionWhere = {};

    if (bodyData.fromDate && bodyData.toDate) {
      positionWhere.date = await dateWhereCond(
        bodyData.fromDate,
        bodyData.toDate
      );
    }

    if (bodyData.marketId) {
      positionWhere.marketId = bodyData.marketId;
    }

    for (const key in userArrayWhere) {
      if (userArrayWhere[key].$in && Array.isArray(userArrayWhere[key].$in)) {
        let downLineUserType = key.split("Id")[0];
        let downLineUserWhere = {
          ...positionWhere,
          ...{
            [key]: {
              $in: userArrayWhere[key].$in,
            },
          },
        };

        var resDataUser = await profitLossPosition.aggregate([
          {
            $match: downLineUserWhere,
          },
          {
            $group: {
              _id: `$${key}`,
              downLineOddsComm: { $sum: `$${downLineUserType}OddsComm` },
              downLineSessionComm: {
                $sum: `$${downLineUserType}SessionComm`,
              },
              downLineNetProfitLossSelf: {
                $sum: `$${downLineUserType}NetProfitLossSelf`,
              },
              downLineLedger: {
                $sum: `$${downLineUserType}LedgerAmt`,
              },
              clientOddsAmount: {
                $sum: `$clientOddsAmount`,
              },
              clientSessionAmount: {
                $sum: `$clientSessionAmount`,
              },
              clientNetAmount: {
                $sum: `$clientNetAmount`,
              },
            },
          },
        ]);

        if (resDataUser && resDataUser.length > 0) {
          resDataUser.map((res) => {
            if (!returnData[res._id]) {
              let userDetails = userDataArray[res._id];
              res.userDetails = userDetails;
              returnData[res._id] = res;
              let userMatchShare = userDetails.userMatchShare;
              let downLineOddsComm = res.downLineOddsComm;
              let downlineSessionComm = res.downLineSessionComm;

              returnData.downLineOddsComm =
                ((100 - userMatchShare) / 100) * downLineOddsComm;
              returnData.downlineSessionComm =
                ((100 - userMatchShare) / 100) * downlineSessionComm;
            }
          });
        }
      }
    }

    return SendResponse(
      res,
      "success",
      "User List fetched Successfully",
      returnData
    );
  } catch (error) {
    console.log(error.massage);
  }
};

const userProfitLossCrickMarketWise = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let userType = loginData.userType;
    let userId = loginData.userId;
    let query = await whereHelper(loginData);

    if (bodyData.userId) {
      userId = bodyData.userId;
    }

    if (bodyData.userType) {
      userType = bodyData.userType;
    }

    let directUserData = await gettingDirectUserByUserId(userId, query);
    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = {};

    let positionWhere = query;

    if (bodyData.fromDate && bodyData.toDate) {
      positionWhere.date = await dateWhereCond(
        bodyData.fromDate,
        bodyData.toDate
      );
    }


    if (bodyData.gameType) {
      positionWhere.gameType = bodyData.gameType;
    }

    if (bodyData.isCommm) {
      positionWhere.isCommm = bodyData.isCommm;
    }

    if (bodyData.marketId) {
      positionWhere.marketId = bodyData.marketId;
    }

    if (bodyData.userId && bodyData.userType) {
      positionWhere[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId);
    }

    var resDataUser = await profitLossPosition.aggregate([
      {
        $match: positionWhere,
      },
      {
        $group: {
          _id: `$marketId`,
          downLineOddsComm: { $sum: `$${userType}OddsComm` },
          downLineSessionComm: {
            $sum: `$${userType}SessionComm`,
          },
          downLineNetProfitLossSelf: {
            $sum: `$${userType}NetProfitLossSelf`,
          },
          downLineLedger: {
            $sum: `$${userType}LedgerAmt`,
          },
          clientOddsAmount: {
            $sum: `$clientOddsAmount`,
          },
          clientSessionAmount: {
            $sum: `$clientSessionAmount`,
          },
          clientNetAmount: {
            $sum: `$clientNetAmount`,
          },
          eventName: {
            $first: `$eventName`,
          },
          marketId: {
            $first: `$marketId`,
          },
          eventId: {
            $first: `$eventId`,
          },
          createdAt: {
            $first: `$createdAt`,
          },
          result: {
            $first: `$result`,
          },
        },
      },
    ]);

    return SendResponse(
      res,
      "success",
      "User List fetched Successfully",
      resDataUser
    );
  } catch (error) {
    console.log(error.massage);
  }
};

const crickAccountStatement = async (req, res) => {
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
          { transactionType: "depositWithdrawal", userId: new ObjectId(bodyData.userId) },
        ]
      };

      userType = bodyData.userType

      if (bodyData.userType && bodyData.userType == "client") { 
      where = {
              clientId: new ObjectId(bodyData.userId),
              $or: [
                { transactionType: "depositWithdrawal", clientId: new ObjectId(bodyData.userId) },
              ]
          };


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
      userType: { $first: `$userType` },
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



    if (bodyData.userType == "client") {
      group._id =  {
        remarks: `$remarks`,
        marketId: `$marketId`,
        selectionId: `$selectionId`,
      }
    }


    let resData = await crickTransaction.aggregate([
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



    // if (bodyData.userType == "client") {
    //   resData = await crickTransaction.find(where).sort({ _id: -1 }); 
    //   resData = JSON.parse(JSON.stringify(resData))
    // }


    resData.map((data, key) => {
      if ((bodyData.userType == "client" && data.transactionType == "ledger")) {
        resData[key].userAmount = -1 * data.userAmount
      }
      
      if ((bodyData.userType != "client" && data.transactionType == "profitLoss")) {
        resData[key].userAmount = data.userAmount
      }


      // if (bodyData.userType == "client") {
      //   resData[key].userAmount = data.amount
        
      //  resData[key]._id =  {
      //           "remarks": data.remarks,
      //           "marketId": data.marketId
      //       }
      // }




    })

    return SendResponse(
      res,
      "success",
      "get message details",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick` , e);
  }
};

const crickDashBoard = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    where.userType = "client";

    let activeClient = await UserModel.countDocuments({
      ...where,
      ...{
        exposure: {
          $ne: 0,
        },
      },
    });
    let loggedInClients = await UserModel.countDocuments({
      ...where,
      ...{
        authenticateToken: {
          $ne: "",
        },
      },
    });

    return SendResponse(res, "success", "Fetch Successfully", {
      activeClient: activeClient,
      loggedInClients: loggedInClients,
    });
  } catch (error) {
    console.log(error);
  }
};

const loginClientDetails = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);
    where.userType = "client";

    let loggedInClients = await UserModel.find(
      {
        ...where,
        ...{
          authenticateToken: {
            $ne: "",
          },
        },
      },
      {
        username: 1,
        name: 1,
        userId: 1,
        creatorName: 1,
        lastIp: 1,
        exposure: 1,
        lastLoginTime: 1
      }
    );

    return SendResponse(res, "success", "Fetch Successfully", {
      loggedInClientsDetails: loggedInClients,
    });
  } catch (error) {
    console.log(error);
  }
};

const userLogoutAndBlock = async (req, res) => {
  try {
    let bodyData = req.body;
    let block = false;
    if (bodyData.isBlock && bodyData.isBlock == true) {
      block = true;
    }
    let blockUserId = bodyData.userId;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData, {
      _id: new ObjectId(blockUserId),
    });

    let updateArray = {
      jwtToken: "",
      authenticateToken: "",
    };

    if (block) {
      updateArray.status = false;
    }

    await UserModel.updateMany(where, updateArray);
    await client.del(blockUserId + "");
    if (siteSetting.IS_SOCKET) {
      let userArray = [
        {
          userId: blockUserId + "",
          data: {
            isLogout: true,
            userId: blockUserId + "",
            authenticateToken: "",
          },
        },
      ];
      await throughSocketDataByAxios(userArray, "userLoggedOut");
    }

    return SendResponse(res, "success", "updated Successfully");
  } catch (error) {
    console.log(error);
  }
};

const sportListFilter = async (req, res) => {
  try {
    let bodyData = req.body;
    let where = {};
    let group = {
      _id: `$matchName`,
    };

    if (bodyData.sportId) {
      where.sportId = bodyData.sportId;
    }
    if (bodyData.marketId) {
      where.marketId = bodyData.marketId;
    }

    if (bodyData.eventId) {
      where.eventId = bodyData.eventId;
    }

    if (bodyData.seriesId) {
      where.seriesId = bodyData.seriesId;
    }
    if (bodyData.sportType) {
      where.sportType = bodyData.sportType;
    }

    if (bodyData.isSeries) {
      group._id = `$seriesId`;
      group.seriesName = { $first: `$seriesName` };
      group.sportType = { $first: `$sportType` };
    }

    if (bodyData.isMatchList) {
      group._id = `$eventId`;
      group.matchName = { $first: `$matchName` };
      group.marketId = { $first: `$marketId` };
      group.eventId = { $first: `$eventId` };
      group.sportType = { $first: `$sportType` };
      group.matchDate = { $first: `$matchDate` };
      group.matchType = { $first: `$matchType` };
    }

    let returnData = {};

    if (!bodyData.isMarket) {
      var resDataUser = await sportsListModel.aggregate([
        {
          $match: where,
        },
        {
          $group: group,
        },
      ]);

      returnData = resDataUser;
    }

    if (bodyData.isMarket && bodyData.marketId) {
      returnData = await fancyListModel.find(
        {
          marketId: bodyData.marketId,
        },
        {
          selectionId: 1,
          marketId: 1,
          decisionRun: 1,
          sessionName: 1,
        }
      );
    }

    ///_dx(resDataUser);

    return SendResponse(res, "success", "fetch Successfully", returnData);
  } catch (error) {
    console.log(error);
  }
};

const userShareDetails = async (req, res) => {
  try {
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = loginData.userId
    let where = await whereHelper(loginData)
    if (bodyData.userId) {
      userId = bodyData.userId
    }
    where.userId = userId
    let loginUserType = loginData.userType
    let loginPriority = UserTypes.indexOf(loginUserType)
    let userShareDetails = await ShareModel.findOne(where)
    let idArray = []
    UserTypes.map((userTypes) => {
      if (userShareDetails[userTypes + "Id"] != null) {
        idArray.push(userShareDetails[userTypes + "Id"])
      }
    })

    let userDetails = await UserModel.find(
      { _id: { $in: idArray } },
      { userMatchShare: 1, username: 1, name: 1, userPriority: 1, creatorId: 1, userId: 1, intCasinoShare: 1, }
    ).sort({ _id: 1 });

    userDetails = JSON.parse(JSON.stringify(userDetails))

    let userPriorityArrayObject = await convertKeyObject(userDetails, "userId")
    let finalArray = []
    let loginUserSharess = userPriorityArrayObject[loginData.userId].userMatchShare
    let loginUserCasinoSharess = userPriorityArrayObject[loginData.userId].intCasinoShare

    userDetails.map((user, key) => {
      if (loginPriority >= user.userPriority) {
        finalArray.push(user)
      }
    })

    let returnData = []

    let firstMinusShare = 0
    let firstMinusCasinoShare = 0

    finalArray.map((returnUser, key) => {
      let checkShareArray = 0
      let checkShareCasinoArray = 0
      if (finalArray[key + 1]) {
        checkShareArray = finalArray[key + 1].userMatchShare
        checkShareCasinoArray = finalArray[key + 1].intCasinoShare
      }
      let share = returnUser.userMatchShare - checkShareArray
      let casinoShare = returnUser.intCasinoShare - checkShareCasinoArray
      returnUser.share = share
      returnUser.casinoShare = casinoShare
      returnData.push(returnUser)
      if (key == 0) {
        firstMinusShare = returnUser.userMatchShare
        firstMinusCasinoShare = returnUser.intCasinoShare
      }
    })

    let parentShare = {
      username: "parentShare",
      name: "[]",
      share: 100 - loginUserSharess,
      casinoShare: 100 - loginUserCasinoSharess,
      userMatchShare: 100,
    }

    let loginObj = {
      username: loginData.username,
      name: loginData.name,
      share: loginUserSharess - firstMinusShare,
      casinoShare: loginUserCasinoSharess - firstMinusCasinoShare,
      userMatchShare: loginUserSharess
    }


    let actualFinaArrayObj = []

    actualFinaArrayObj.push(parentShare)
    actualFinaArrayObj.push(loginObj)
    returnData.map((rr) => {
      actualFinaArrayObj.push(rr)
    })

    return SendResponse(res, "success", "fetch Successfully", actualFinaArrayObj);
  } catch (error) { console.log(error, "error in share details api in crick service") }
}

const crickMarketWiseReport = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData);

    where.transactionType = "profitLoss"

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if (bodyData.marketId) {
      where.marketId = bodyData.marketId
    }

    if (bodyData.userId && bodyData.userType) {
      where[bodyData.userType + "Id"] = new ObjectId(bodyData.userId)
    }

    if (bodyData.marketType) {
      where.marketType = bodyData.marketType
    }

    if (bodyData.selectionId) {
      where.selectionId = bodyData.selectionId
    }

    if (bodyData.sportId) {
      where.sportId = bodyData.sportId
    }

    if (bodyData.seriesId) {
      where.seriesId = bodyData.seriesId
    }


    let group = {
      _id: `$remarks`,
      userAmount: { $sum: `$${loginData.userType}ProfitLoss` },
      amount: { $sum: `$amount` },
      marketId: { $first: `$marketId` },
      transactionType: { $first: `$transactionType` },
      eventId: { $first: `$eventId` },
      result: { $first: `$result` },
      isComm: { $first: `$isComm` },
      createdAt: { $first: `$createdAt` },
      date: { $first: `$date` },
      selectionId: { $first: `$selectionId` },
      marketType: { $first: `$marketType` },
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
      "marketWise data successfully added",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`);
  }
};

const agentProfitLossMarketWise = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let where = await whereHelper(loginData, {
      transactionType: "profitLoss"
    });

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

    if (bodyData.userId && bodyData.userType) {
      where[bodyData.userType + "Id"] = new ObjectId(bodyData.userId)
    }

    if (!bodyData.userType) {
      bodyData.userType = loginData.userType
    }

    if (!bodyData.userId) {
      bodyData.userId = loginData.userId
    }

    let parentUserType = loginData.userType
    let userType = bodyData.userType

    if (bodyData.userType && bodyData.userId) {
      let userDataType = await UserModel.findOne({
        userId: new ObjectId(bodyData.userId)
      }, {
        creatorShareData: 1,
        userType: 1,
      })
      creatorData = userDataType.creatorShareData
      parentUserType = creatorData.userType
      userType = userDataType.userType
      if (userType == "client") {
        userType = parentUserType
      }
    }


    let group = {
      _id: `$remarks`,
      userLedgerAmountWithutComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            `$${userType}LedgerAmount`,
            0,
          ],
        },
      },
      clientAmountWithutComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            `$amount`,
            0,
          ],
        },
      },
      ownAmount: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            `$${userType}ProfitLoss`,
            0,
          ],
        },
      },
      totalAmountofClientWithoutComm: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 0] }],
            },
            `$amount`,
            0,
          ],
        },
      },
      totalCommOfClient: {
        $sum: {
          $cond: [
            {
              $and: [{ $eq: ["$isComm", 1] }],
            },
            `$amount`,
            0,
          ],
        },
      },
      userComm: {
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
      marketId: { $first: `$marketId` },
      transactionType: { $first: `$transactionType` },
      eventId: { $first: `$eventId` },
      result: { $first: `$result` },
      createdAt: { $first: `$createdAt` },
      date: { $first: `$date` },
      selectionId: { $first: `$selectionId` },
      seriesId: { $first: `$seriesId` },
      sportId: { $first: `$sportId` },
      marketType: { $first: `$marketType` },
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



    resData.map((data, key) => {
      if (bodyData.userType == "client") {
        resData[key].userComm = data.totalCommOfClient
      } else {
        resData[key].userComm = -1 * data.userComm
      }
    })


    return SendResponse(
      res,
      "success",
      "account Statement Fetch Successfully",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`, e);
  }
};

const agentProfitLossCrick = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    const loginUserType = loginData.userType

    let directUserId = loginData.userId


    if (bodyData.userId && bodyData.userType) {

      directUserId = bodyData.userId
    }

    let directUserData = await gettingDirectUserByUserId(directUserId);
    let userDataArray = directUserData.userDataArray;
    let userArrayWhere = directUserData.idArrayWhere;
    let returnData = []

    for (const key in userDataArray) {
      if (userDataArray.hasOwnProperty(key)) {
        let userData = userDataArray[key]
        let userId = userData.userId
        let userType = userData.userType
        let creatorShareData = userData.creatorShareData
        let creatorUserType = creatorShareData.userType
        let where = await whereHelper(loginData, { transactionType: "profitLoss" });

        if (bodyData.userId && bodyData.userType) {
          where[bodyData.userType + "Id"] = new ObjectId(bodyData.userId)
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

        if (bodyData.fromDate && bodyData.toDate) {
          where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
        }

        where[userType + "Id"] = userId

        let group = {
          _id: `$${userType}Id`,
          userLedgerAmountWithutComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 0] }],
                },
                `$${creatorUserType}LedgerAmount`,
                0,
              ],
            },
          },
          ownAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 0] }],
                },
                `$${creatorUserType}ProfitLoss`,
                0,
              ],
            },
          },
          totalAmountofClientWithoutComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 0] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          totalCommOfClient: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          userComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$${userType}LedgerAmount`,
                0,
              ],
            },
          },

          parentComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$${creatorUserType}LedgerAmount`,
                0,
              ],
            },
          },



          marketId: { $first: `$marketId` },
          transactionType: { $first: `$transactionType` },
          eventId: { $first: `$eventId` },
          result: { $first: `$result` },
          createdAt: { $first: `$createdAt` },
          date: { $first: `$date` },
          selectionId: { $first: `$selectionId` },
          seriesId: { $first: `$seriesId` },
          sportId: { $first: `$sportId` },
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

          if (userData.userType == "client") {
            resData.userComm = resData.totalCommOfClient
          } else {
            resData.userComm = -1 * resData.userComm
          }
          resData.userData = userData
          returnData.push(resData)
        }

      }
    }

    return SendResponse(
      res,
      "success",
      "fetch successfully",
      returnData
    );
  } catch (error) {
    console.log(error.massage);
  }
};

const activeBetsCount = async (req, res) => {
  try {

    const loginData = req.loggedInUser;
    let userId = new ObjectId(loginData.userId)

    let where = {
      userId: userId,
      isDeclare: { $in: [0, false] },
      isDeleted: { $in: [0, false] },
    }

    let oddsBetsCount = await oddsBetModel.countDocuments(where)
    let fancyBetsCount = await fancyBetModel.countDocuments(where)
    let internationalCasino = await internationalCasinnoBetList.countDocuments(where)
    let totalActiveBets = oddsBetsCount + fancyBetsCount + internationalCasino

    let returnData = {
      totalActiveBets: totalActiveBets,
      fancyBetsCount: fancyBetsCount,
      oddsBetsCount: oddsBetsCount,
      internationalCasino: internationalCasino,
    }


    return SendResponse(
      res,
      "success",
      "fetch successfully",
      returnData
    );
  } catch (error) {
    console.log(error.massage);
  }
}


const myCashAndParentCash = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let query = await whereHelper(loginData);

  let creatorId = bodyData.creatorId
  let creatorType = bodyData.creatorType

  let directUserData = await UserUtils.gettingDirectUserByUserId(
    creatorId
  );
  let userArary = directUserData.idArrayData;

  if (bodyData.fromDate && bodyData.toDate) {
    query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }


  query.transactionType = "ledger"

  if (userArary) {
    query.userId = {
      $in: userArary,
    };
  }

  let myCashQuery = {
    transactionType: "ledger",
    creatorId: new ObjectId(creatorId)
  }

  let returnData = {
    myCash: 0,
    parentCash: 0,
  }

  let latestResData = await crickTransaction.aggregate([
    {
      $match: myCashQuery,
    },
    {
      $group: {
        _id: `$${creatorType}Id`,
        clientCash: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userType", "client"] }],
              },
              "$amount",
              0,
            ],
          },
        },
        userCash: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$transactionType", "ledger"] },
                  { $ne: ["$userType", "client"] }
                ]
              },
              "$amount",
              0
            ]
          }
        },
      },
    },
  ]);


  if (latestResData[0]) {
    returnData.myCash = (latestResData[0].clientCash - latestResData[0].userCash)
  }

  let parentCashQuery = {
    transactionType: "ledger",
    userId: new ObjectId(creatorId)
  }

  if (bodyData.parentCash) {
    let parentCashData = await crickTransaction.aggregate([
      {
        $match: parentCashQuery,
      },
      {
        $group: {
          _id: `$${creatorType}Id`,
          myCash: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$transactionType", "ledger"] }],
                },
                `$${creatorType}LedgerAmount`,
                0,
              ],
            },
          },
        },
      },
    ]);

    if (parentCashData[0]) {
      returnData.parentCash = parentCashData[0].myCash
    }
  }

  return SendResponse(res, "success", "dataFetched", returnData);

};

let skyUserList = async (req, res) => {
  try {
    const data = req.body;
    const currentUserData = req.loggedInUser;
    let query = {};


    if (data.keyWord && data.keyWord !== "") {
      query = {
        $or: [{ userName: data.keyWord }],
      };
    }

    let sortData = { createdAt: -1 };
    if (data.sortData) {
      sortData = data.sortData;
    }

    query["isDeleted"] = 0;
    if (data.isDeleted) {
      query["isDeleted"] = 1;
    }

    query["status"] = 1;
    if (data.status == 0 && data.status != "both") {
      query["status"] = 0;
    }
    if (data.status != 0 && data.status == "both") {
      delete query.status;
    }

    if (data.userType) {
      query["userType"] = data.userType;
    }
    query[currentUserData.userType + "Id"] = currentUserData.userId;

    query["_id"] = { $ne: currentUserData.userId };

    if (data.creatorId) {
      query["creatorId"] = new ObjectId(data.creatorId);
    }

    if (data.parentId && data.parentUserType) {
      query[data.parentUserType + "Id"] = new ObjectId(data.parentId);
      if (siteSetting.IS_DIAMOND) {
        query["creatorId"] = new ObjectId(data.parentId);
      }
      query["_id"] = { $ne: new ObjectId(data.parentId) };
    }

    if (data.downlineUserType) {
      query["userType"] = data.downlineUserType;
    }

    if (data.userId) {
      query["userId"] = new ObjectId(data.userId);
    }


    if (data.isSearch && data.isSearch == true) {
      const loginData = currentUserData
      const bodyData = data
      const searchValue = new RegExp(bodyData.searchValue, "i");
      query = {
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
    }

    try {
      let specific = {
        userId: 1,
        userType: 1,
        mobile: 1,
        username: 1,
        checkUsername: 1,
        name: 1,
        userPriority: 1,
        coins: 1,
        exposure: 1,
        totalProfitLoss: 1,
        exposureLimit: 1,
        creatorId: 1,
        creatorName: 1,
        status: 1,
        isDeleted: 1,
        betStatus: 1,
        matchStatus: 1,
        casinoStatus: 1,
        matkaStatus: 1,
        userMatchShare: 1,
        userPoliticsShare: 1,
        userCasinoShare: 1,
        userMatkaShare: 1,
        userShowMatchShare: 1,
        userShowCasinoShare: 1,
        userShowMatkaShare: 1,
        userCommissionType: 1,
        userMatchCommission: 1,
        userSessionCommission: 1,
        userBetfairCommission: 1,
        userCasinoCommission: 1,
        userMatkaCommission: 1,
        reference: 1,
        creditReference: 1,
        intCasinoStatus: 1,
        intCasinoShare: 1,
        creatorPriority: 1,
        lastIp: 1,
        lastLoginTime: 1,
        date: 1,
        createdAt: 1,
        updatedAt: 1,
        id: 1,
        settlementAmount: 1,
        creatorShareData: 1,
        _id: 0
      }

      let total = await UserModel.countDocuments(query);
      let resData = {};


      if (data.size && data.pageNo) {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .skip(data.size * (data.pageNo - 1))
          .limit(data.size)
          .allowDiskUse(true);
      } else {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .allowDiskUse(true);
      }

      let userIdArray = [];


      resData = JSON.parse(JSON.stringify(resData))
      await Promise.all(
        resData.map(async (user, key) => {
          userIdArray.push(user.userId);
          let crickWhere = {
            [user.userType + "Id"]: new ObjectId(user.userId),
            $or: [
              { transactionType: "profitLoss" },
              { transactionType: "ledger", userId: new ObjectId(user.userId) }
            ]
          }
          let group = {
            _id: `$${user.userType + "Id"}`,
            amount: { $sum: `$amount` },
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
            userSettlement: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$transactionType", "ledger"] }],
                  },
                  `$amount`,
                  0,
                ],
              },
            },
          }

          var crickResData = await crickTransaction.aggregate([
            {
              $match: crickWhere,
            },
            {
              $group: group,
            },

          ]);

          resData[key].referenceProfitLoss = 0
          resData[key].totalSettlement = 0
          resData[key].totalClientProfitLoss = 0

          if (crickResData.length > 0) {
            crickResData = JSON.parse(JSON.stringify(crickResData[0]))
            resData[key].referenceProfitLoss = crickResData?.clientProfitLoss + crickResData?.userSettlement
            resData[key].totalSettlement = crickResData?.userSettlement
            resData[key].totalClientProfitLoss = crickResData?.clientProfitLoss
          }



          let userWhere = {
            [user.userType + "Id"]: new ObjectId(user.userId),
            "userType": "client",
          }

          let userGroup = {
            _id: `$${user.userType + "Id"}`,
            totalPlayerBalance: { $sum: `$coins` },
            totalPlayerExposure: { $sum: `$exposure` },
            totalPlayerProfitLoss: { $sum: `$totalProfitLoss` },
          }
          var userResData = await UserModel.aggregate([
            {
              $match: userWhere,
            },
            {
              $group: userGroup,
            },

          ]);

          resData[key].playerBalance = 0
          resData[key].playerExposure = 0
          if (userResData.length > 0) {
            userResData = JSON.parse(JSON.stringify(userResData[0]))
            resData[key].playerBalance = userResData?.totalPlayerBalance
            resData[key].playerExposure = userResData?.totalPlayerExposure
          }

          resData[key].availableBalance = resData[key].coins
          resData[key].balance = resData[key]?.creditReference + resData[key]?.referenceProfitLoss
          //    resData[key].currentProfitLoss = resData[key]?.totalClientProfitLoss +  resData[key]?.referenceProfitLoss
          resData[key].currentProfitLoss = resData[key]?.referenceProfitLoss
        })

      )

      if (data.isReffrelCount && data.isReffrelCount == true && data.userType == "client") {
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


      let tempData = {
        total: total,
        list: resData,
      };

      return SendResponse(
        res,
        "success",
        "User List fetched Successfully",
        tempData
      );
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    console.log(error, "yy")
    return SendResponse(res, "error", "User List Error", error);
  }
};


let balanceSheet = async (req, res) => {
  let reqData = req
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
        parentCash: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$userId", new ObjectId(fetchUserId)] }],
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
          parentCash = fetchUserType == "client" ? parentCash : -1 * parentCash
          let pushArray = {
            balance: userLedgerAmount - parentCash,
            userId: userData.userId,
            userType: userData.userType,
            username: userData.username,
            name: userData.name,
            coins: userData.coins,
          }
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

    let fetchUserProfitLossTypeAmount = `${userType}ProfitLoss`
    let fetchUserLedgerTypeAmount = `${userType}LedgerAmount`

    if (userType == "client") {
      fetchUserProfitLossTypeAmount = `amount`
      fetchUserLedgerTypeAmount = `amount`
    }

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


    selfCrickData.map((data) => {
      selfCrickData[0].marketProfitLoss = -1 * data.marketProfitLoss
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

const createShareDataOfUsers = async (req, res) => {
  try {
    if (req.body && req.body.userId) {
      const userId = req.body.userId
      const shareData = await UserUtils.createShareDataByUserId(userId, "", true)
      return SendResponse(res, "success", "data fetched", shareData);
    }


    const userData = await UserModel.find(
      { userType: "client" },
      { userId: 1, _id: 0 }
    );
    if (!userData || userData.length === 0) {
      return SendResponse(res, "success", "no users found", 0);
    }
    const CHUNK_SIZE = 100;
    const sharingChain = [];
    for (let i = 0; i < userData.length; i += CHUNK_SIZE) {
      const chunk = userData.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((u) => UserUtils.createShareDataByUserId(u.userId, "", true))
      );
      results.forEach((resp) => {
        if (resp.status === "fulfilled") {
          sharingChain.push(resp.value);
        } else {
          console.error("Error for userId:", resp.reason);
        }
      });
    }
    return SendResponse(
      res,
      "success",
      "data fetched",
      sharingChain.lengthf
    );
  } catch (error) {
    console.error("createChain error:", error);
    return SendResponse(res, "error", error.message, []);
  }
};


const cricSettlement = async (req, res) => {
  try {
    const bodyData = req.body;
    let { userId, remark, date, amount } = bodyData;
    const currentUserData = req.loggedInUser;
    let where = {
      userId: userId,
    };
    let query = whereHelper(currentUserData, where);
    let userData = await UserModel.findOne(query);
    let userDataId = userData
    if (!userData) {
      return returnResponse("error", "User Not Found");
    }
    let creatorData = await UserModel.findOne({
      userId: new ObjectId(userData.creatorId)
    })
    let userType = userData.userType
    let isDeposit = bodyData.hasOwnProperty("deposit") ? true : false;

    let coinsUpdate = userType == "client" ? -1 * amount : amount



    //   where.ledgerType = "settle";
    //   where.remark = bodyData?.remark;
    //   where.eventName = bodyData?.eventName;
    //   where.date = moment(bodyData.date).startOf("day").valueOf();
    //   where.amount = userType == "client" ?  -1 * bodyData.amount : bodyData.amount;
    //  let insertData = await parentDataAppend(userData, where);

    where.ledgerType = "settle";
    where.remark = bodyData.remark;
    where.eventName = bodyData.eventName;
    where.date = moment(bodyData.date).startOf("day").valueOf();
    where.amount = bodyData.amount;
    insertData = await parentDataAppend(userDataId, where);
    await LedgerModel.create(insertData);

    let userRemarkCrick = `${remark}[${coinsUpdate > 0 ? "Cash Withdraw From" : "Cash Deposit To"
      }  ${userData.username} by ${currentUserData.username} of ${coinsUpdate} (${_date_time()})]`;

    let crickUserTransaction = {
      userType: userType,
      transactionType: "ledger",
      remarks: userRemarkCrick,
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
      creatorId: userData.creatorId,
      [`${userData.userType}LedgerAmount`]: -1 * amount,
      [`${creatorData.userType}LedgerAmount`]: userType == "client" ? -1 * amount : amount,

      [`${userData.userType}ProfitLoss`]: -1 * amount,
      [`${creatorData.userType}ProfitLoss`]: userType == "client" ? -1 * amount : amount,
      ledgerEntry: true,
      amount: userType == "client" ? -1 * amount : 0

    };
    await crickTransaction.create(crickUserTransaction);


    let isCash = false

    let updateCoinsData = {}
    if (isDeposit) {
      const coins = bodyData.amount;
      const parentData = currentUserData;
      const userRemark = bodyData.remark ? bodyData.remark : "";
      const transactionPassword = bodyData.transactionPassword
        ? bodyData.transactionPassword
        : "";

      updateCoinsData = await UpdateUserCoins(
        coins,
        userId,
        parentData,
        userRemark,
        transactionPassword,
        "",
        isCash
      );
      updateCoinsData = updateCoinsData.data
    }

    let isCrickTransaction = true
    if (isCrickTransaction) {

      let COINS_DIVIDER = 100
      if (process.env.COINS_DIVIDER) {
        COINS_DIVIDER = process.env.COINS_DIVIDER ? process.env.COINS_DIVIDER : 100
      }

      let coinsUpdate = Math.abs(
        (bodyData.amount / COINS_DIVIDER).toFixed(2)
      )


      let crickPushArray = []

      let userRemarkCrick = `${bodyData.remark}[${bodyData.amount > 0 ? "Cash Withdraw From" : "Cash Deposit To"
        }  ${userDataId.username} by ${currentUserData.username} of ${coinsUpdate} (${_date_time()})]`;
      let creatorData = await UserModel.findOne({
        userId: new ObjectId(userDataId.creatorId)
      })
      let creatorShareData = creatorData

      crickUserTransaction.isCash = true

      if (userDataId.userType == "client" && bodyData.amount > 0) {
        let updateCrickAmount = -1 * bodyData.amount
        let clientRemarkCrick = `${bodyData.remark} [${updateCrickAmount < 0 ? " Deposit To" : " Withdraw By"
          } Admin To ${currentUserData.username} of ${Math.abs(
            (updateCrickAmount / COINS_DIVIDER).toFixed(2)
          )}  (${_date_time()})]`;

        crickUserTransaction = {
          amount: updateCrickAmount,
          transactionType: "depositWithdrawal",
          remarks: `${clientRemarkCrick}`,
          [`${userDataId.userType}Id`]: userDataId.userId,

          [`${userDataId.userType}ProfitLoss`]: updateCrickAmount,

          [`${creatorShareData.userType}ProfitLoss`]: -1 * updateCrickAmount,
          [`${currentUserData.userType}ProfitLoss`]: -1 * updateCrickAmount,

          [`${userDataId.userType}LedgerAmount`]: updateCrickAmount,
          [`${creatorShareData.userType}LedgerAmount`]: updateCrickAmount,
          [`${currentUserData.userType}LedgerAmount`]: updateCrickAmount,
        };

        crickUserTransaction.isCash = true
        crickPushArray.push(crickUserTransaction)
      }

      await crickTransaction.create(crickPushArray);

      if (userDataId.userType == "client" && bodyData.amount < 0) {
        await crickTransaction.deleteMany({
          _id: { $in: [updateCoinsData.crickTransactionCreatorId, updateCoinsData.crickTransactionUserId] }
        })
        await TransactionLogModel.deleteMany({
          _id: { $in: [updateCoinsData.creatorTransactionId] }
        })
        await updateCoinsTbl(userDataId.creatorId, currentUserData.userType);
      }
    }


     if (userDataId.userType == "client" ) {
        await updateCoinsTbl(userDataId.userId, "client");
      }


    return SendResponse(
      res,
      "success",
      `Cash Transaction Entry Done Successfully For ${userData.name} (${userData.username}) By ${currentUserData.name} (${currentUserData.username})`
    );

  } catch (error) {
    console.log(error);
  }


}

const crickUserList = async (req, res) => {
  const data = req.body;
  const currentUserData = req.loggedInUser;
  try {
    let query = {};
    if (data.keyWord && data.keyWord !== "") {
      query = {
        $or: [{ userName: data.keyWord }],
      };
    }

    let sortData = { createdAt: -1 };     
    if (data.sortData) {
      sortData = data.sortData;
    }

    query["isDeleted"] = 0;
    if (data.isDeleted) {
      query["isDeleted"] = 1;
    }

    query["status"] = 1;
    if (data.status == 0 && data.status != "both") {
      query["status"] = 0;
    }
    if (data.status != 0 && data.status == "both") {
      delete query.status;
    }

    if (data.userType) {
      query["userType"] = data.userType;
    }
    query[currentUserData.userType + "Id"] = currentUserData.userId;

    query["_id"] = { $ne: currentUserData.userId };

    if (data.creatorId) {
      query["creatorId"] = new ObjectId(data.creatorId);
    }

    if (data.parentId && data.parentUserType) {
      query[data.parentUserType + "Id"] = new ObjectId(data.parentId);
      if (siteSetting.IS_DIAMOND) {
        query["creatorId"] = new ObjectId(data.parentId);
      }
      query["_id"] = { $ne: new ObjectId(data.parentId) };
    }

    if (data.downlineUserType) {
      query["userType"] = data.downlineUserType;
    }

    if (data.userId) {
      query["userId"] = new ObjectId(data.userId);
    }

    try {
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
        betChipsData:0,
        _id: 1 // _id is allowed
      };


      if (data.specific) {
        specific = data.specific;
      }

      let total = await UserModel.countDocuments(query);
      let resData = {};

      if (data.size && data.pageNo) {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .skip(data.size * (data.pageNo - 1))
          .limit(data.size)
          .allowDiskUse(true);
      } else {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .allowDiskUse(true);
      }

      // _d(resData)


      let userIdArray = [];
      let profitLossArray = [];

      const tasks = resData.map((user) => {
        userIdArray.push(user.userId);
        let group = {
          _id: `$${user.userType + "Id"}`,
          profitLoss: {
            $sum: {
              $cond: [
                { $eq: ["$transactionType", "profitLoss"] },
                `$${user.userType}LedgerAmount`,
                0
              ]
            }
          },
          selfSettle: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$transactionType", "ledger"] },
                    { $eq: ["$creatorId", new ObjectId(user.userId)] }
                  ]
                },
                `$${user.userType}LedgerAmount`,
                0
              ]
            }
          },
          downLineSettle: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$transactionType", "ledger"] },
                    { $eq: ["$userId", new ObjectId(user.userId)] }
                  ]
                },
                `$${user.userType}LedgerAmount`,
                0
              ]
            }
          },
        
        };

        return crickTransaction.aggregate([
          {
            $match: {
              transactionType: { $in: ["profitLoss", "ledger"] },
              [`${user.userType}Id`]: new ObjectId(user.userId)
            }
          },
          {
            $group: group
          },
          {
            $sort: { _id: 1 }
          }
        ]);
      });

      const results = await Promise.allSettled(tasks);

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          const data = result.value;
          if (data.length > 0) profitLossArray.push(data[0]);
        }
      });




      if (profitLossArray.length > 0) {
        let profitLossData = convertKeyObjectAndSeperateid(
          profitLossArray,
          "_id"
        );
        profitLossData = JSON.parse(
          JSON.stringify(profitLossData.returnDataObject)
        );
        
        resData = JSON.parse(JSON.stringify(resData));
        resData.map((user, key) => {
          if (profitLossData[user.userId]) {
            resData[key].profitLossNew =
              profitLossData[user.userId].profitLoss || 0;
            resData[key].selfSettle =
              profitLossData[user.userId].selfSettle || 0;
            resData[key].downLineSettle =
              profitLossData[user.userId].downLineSettle || 0;
          } else {
            resData[key].profitLossNew = 0;
            resData[key].selfSettle = 0;
            resData[key].downLineSettle = 0;
          }
        });
      }





      var ledgerRes = await LedgerModel.aggregate([
        {
          $match: {
            userId: {
              $in: userIdArray,
            },
          },
        },
        {
          $group: {
            _id: `$userId`,
            totalAmount: { $sum: "$amount" },
            settleAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ["$ledgerType", "settle"] }],
                  },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]);
      if (ledgerRes.length > 0) {
        ledgerRes = convertKeyObjectAndSeperateid(ledgerRes, "_id");
        ledgerRes = JSON.parse(JSON.stringify(ledgerRes.returnDataObject));
        resData = JSON.parse(JSON.stringify(resData));
        resData.map((user, key) => {
          if (ledgerRes[user.userId]) {
            resData[key].settlementAmount = ledgerRes[user.userId];
          }
        });
      }


      let tempData = {
        total: total,
        list: resData,
      };

      return SendResponse(
        res,
        "success",
        "User List fetched Successfully",
        tempData
      );


    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    return SendResponse(req, "error", "User List Error", error);
  }



}

let profitLossCom = async (req, res) => {
  let reqData = req
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
    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
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

    let fetchUserProfitLossTypeAmount = `${userType}ProfitLoss`
    let fetchUserLedgerTypeAmount = `${userType}LedgerAmount`

    if (userType == "client") {
      fetchUserProfitLossTypeAmount = `amount`
      fetchUserLedgerTypeAmount = `amount`
    }


    //_d(fetchUserProfitLossTypeAmount , "fetchUserProfitLossTypeAmount")

    
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
      totalCommissionProfitLoss: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$isComm", 1] },
              ],
            },
            `$${fetchUserProfitLossTypeAmount}`,
            0,
          ],
        },
      },
    }


    _d(selfWhere , "selfWhere")

    let [selfCrickData, userData] = await Promise.all([
        crickTransaction.aggregate([
        {
          $match: selfWhere,
        },
        {
          $group: crickGroup,
        },
        ]),
        client.hgetall(userId)
    ])


    selfCrickData.map((data) => {
      selfCrickData[0].marketProfitLoss = -1 * data.marketProfitLoss
      selfCrickData[0].totalCommissionProfitLoss = -1 * data.totalCommissionProfitLoss
      selfCrickData[0].settlementParent = -1 * (data.settlementParent + data.parentCash)
    })

    selfCrickData[0].coins = userData && userData.coins ? +Number(userData.coins).toFixed(2) : 0 
    
    return SendResponse(
      res,
      "success",
      "Ledger List fetched Successfully",
      selfCrickData
    );

  } catch (error) {
    console.log(error)
    return SendResponse(res, "error", "Ledger Error", error);
  }
};

let checkMaximumWithdrwalAmount = async (req, res) => {
  try {
    const bodyData = req.body;
    const loggedUserData = req.loggedInUser;
    let userType = loggedUserData.userType
    if (userType == "client") {
      return SendResponse(
        res,
        "error",
        "client do not have autority to check maximum withdrawal"
      );
    }
    let userId = loggedUserData.userId
    if (bodyData.userId) {
      userId = bodyData.userId
    }

    let query = {
        userId : new ObjectId(userId)
    };

    let crickGroup = {
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
    ledgerEntry: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$transactionType", "ledger"] }, { $eq: ["$ledgerEntry", true] }],
          },
          `$amount`,
          0,
        ],
      },
     },
    }

    let [selfCrickData , userData] = await Promise.all([
        CrickTransactionLogModel.aggregate([
        {
          $match: query,
        },
        {
          $group: crickGroup,
        },
        ]),
        UserModel.findOne({ userId: userId }, {
        coins: 1,
        totalProfitLoss: 1,
        exposure: 1,
        creditReference:1
      })
    ])

    userData = JSON.parse(JSON.stringify(userData))

    let depositWithdrawAmount = 0
    if (selfCrickData[0] && selfCrickData[0].depositWithdraw) {
      depositWithdrawAmount = selfCrickData[0].depositWithdraw
    }


    userData.depositWithdrawAmount = depositWithdrawAmount
    userData.ledgerEntry = selfCrickData[0].ledgerEntry ? selfCrickData[0].ledgerEntry : 0 
    let withdrawAmount = userData.coins

    if (userData.totalProfitLoss > 0) {

      let { coins, exposure, totalProfitLoss, creditReference, depositWithdrawAmount , ledgerEntry } = userData

      if (coins > depositWithdrawAmount) {
        withdrawAmount = depositWithdrawAmount + exposure
      }

      if (coins > depositWithdrawAmount && exposure < 0) {
        withdrawAmount = depositWithdrawAmount  + totalProfitLoss + exposure
      }

      if (withdrawAmount > depositWithdrawAmount) {
        withdrawAmount = depositWithdrawAmount
      } 

    }

    if (res) {
        return SendResponse(
        res,
        "success",
        "maximum withdraw amount",
        withdrawAmount
      );
    } else {
      return withdrawAmount
    }
    

  } catch (error) {
    console.log(error)
    return SendResponse(res, "error", "Ledger Error", error);
  }
};





module.exports = {
  mondayToMondayReportProfitLoss,
  userProfitLossCrick,
  userProfitLossCrickMarketWise,
  crickAccountStatement,
  crickMarketWiseReport,
  crickDashBoard,
  loginClientDetails,
  userLogoutAndBlock,
  sportListFilter,
  userShareDetails,
  agentProfitLossMarketWise,
  agentProfitLossCrick,
  activeBetsCount,
  myCashAndParentCash,
  skyUserList,
  balanceSheet,
  createShareDataOfUsers,
  cricSettlement,
  crickUserList,
  profitLossCom,
  checkMaximumWithdrwalAmount
};
