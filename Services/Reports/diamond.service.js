const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const crickTransaction = require("../../Models/crickTransaction.model");
const sportsListModel = require("../../Models/sportList.model");
const fancyListModel = require("../../Models/fancyList.model");
const oddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const fancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const internationalCasinnoBetList = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const UserUtils = require("../../Helpers/UsersUtils");
const { siteSetting, UserTypes } = require("../../Common/Constants");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const {
  _dx,
  _d,
  convertKeyObject,
  whereHelper,
  dateWhereCond,
  _date,
  getMondayRange,
  throughSocketDataByAxios,
} = require("../../Helpers/CommonHelper");
const {
  getShareDataByUserId,
  gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");
const ShareModel = require("../../Models/User/Share.model");


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
      _id : `$${loginData.userType}Id`,
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
      let netCommission = resData[0]?.userComm ?  resData[0]?.userComm : 0


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
      where ={}
      where.creatorId = new ObjectId(bodyData.creatorId); 
    }

    if (bodyData.userId ) {
      where ={}
      where.userId = new ObjectId(bodyData.userId); 
    }


    if (bodyData.transactionType) {
      where.transactionType = bodyData.transactionType;
    }

    if(bodyData.showParent && bodyData.showParent == true){
      where.creatorId = {$ne:   new ObjectId(bodyData.userId) }
    }

    if(bodyData.showChild && bodyData.showChild == true){
      where.creatorId = {$eq:   new ObjectId(bodyData.creatorId) }
      where.userId = {$eq:   new ObjectId(bodyData.creatorId) }
    }
    

    if(bodyData.allTrue && bodyData.allTrue == true){
      where = {
        [bodyData.userType+"Id"]  :  new ObjectId(bodyData.userId),
        $or: [
          { transactionType: "profitLoss" },
          { transactionType: "depositWithdrawal" },
          { transactionType: "ledger", creatorId: new ObjectId(bodyData.userId)},
          { transactionType: "ledger", userId: new ObjectId(bodyData.userId)}
        ]
      };
      if(bodyData.userType){
        userType = bodyData.userType
      }
    }

    if(bodyData.isProfitLoss && bodyData.isProfitLoss == true){
      where = {
        [bodyData.userType+"Id"] :   new ObjectId(bodyData.userId),
        transactionType : "profitLoss"
      }
    }

    if(bodyData.isLedger && bodyData.isLedger == true){
       where = {
        transactionType: "ledger",
        $or: [
          { creatorId: new ObjectId(bodyData.userId) },
          { userId: new ObjectId(bodyData.userId) }
        ]
      };
    }

    if(bodyData.isHistory && bodyData.isHistory == true){
       where = {
        [bodyData.userType+"Id"]  :  new ObjectId(bodyData.userId),
        $or: [
          { transactionType: "profitLoss" },
          { transactionType: "ledger", userId: new ObjectId(bodyData.userId)}
        ]
      };
    }

    if(bodyData.showOnlyChipsClient && bodyData.showOnlyChipsClient == true){
      where = {
       userId  :  new ObjectId(bodyData.userId),
       $or: [
         { transactionType: "depositWithdrawal", userId: new ObjectId(bodyData.userId)}
       ]
     };

     userType = bodyData.userType
   }


    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if(bodyData.marketId){
      where.marketId = bodyData.marketId
    }

    if(bodyData.marketType){
      where.marketType = bodyData.marketType
    }

    if(bodyData.selectionId){
      where.selectionId = bodyData.selectionId
    }

    if(bodyData.gameType){
      where.gameType = bodyData.gameType
    }

    if(bodyData.isComm && bodyData.isComm == 1 ){
      where.isComm = bodyData.isComm
    }

    if(bodyData.gameName){
      where.gameName = bodyData.gameName
    }


    let group = {
      _id : {
        remarks : `$remarks`,
        marketId : `$marketId`
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


    if(bodyData.isHistory && bodyData.isHistory == true){
     group.userAmount = { $sum: `$${bodyData.userType}LedgerAmount` }
   }



   if(bodyData.userType && bodyData.userType == "client" ){
    group.userAmount = { $sum: `$amount` }
  }



  if(bodyData.isBpexch){
    delete where.userId
    group.userAmount = { $sum: `$${bodyData.userType}LedgerAmount` }
    where[`${bodyData.userType}Id`] = new ObjectId(bodyData.userId)
  }



  if(bodyData.isBpexch && bodyData.userType == "client"){
    group.userAmount = { $sum: `$amount` }
   
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
      "get message details",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick`);
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
        lastLoginTime :1
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

const userShareDetails = async (req,res)=>{
  try{
    const bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = loginData.userId
    let where = await whereHelper(loginData)
    if(bodyData.userId){
      userId=  bodyData.userId
    }
    where.userId =  userId
    let loginUserType = loginData.userType
    let loginPriority = UserTypes.indexOf(loginUserType)
    let userShareDetails = await ShareModel.findOne(where)
    let idArray = []
    UserTypes.map((userTypes)=>{
      if(userShareDetails[userTypes+"Id"]!=null){
        idArray.push(userShareDetails[userTypes+"Id"])
      }
    })
    let userDetails = await UserModel.find(
      { _id: { $in: idArray } }, 
      { userMatchShare: 1, username: 1, name: 1 , userPriority:1 , creatorId : 1 , userId:1 , intCasinoShare: 1,}
    ).sort({ _id: 1 }); 

    userDetails = JSON.parse(JSON.stringify(userDetails))
    
   let userPriorityArrayObject = await convertKeyObject(userDetails , "userId")
   let finalArray = []
   let loginUserSharess = userPriorityArrayObject[loginData.userId].userMatchShare
   let loginUserCasinoSharess = userPriorityArrayObject[loginData.userId].intCasinoShare

    userDetails.map((user , key)=>{
      if(loginPriority >= user.userPriority){
        finalArray.push(user)
      }
    })

    let returnData =[]

    let firstMinusShare = 0 
    let firstMinusCasinoShare = 0 
    
    finalArray.map((returnUser , key)=>{
      let checkShareArray = 0 
      let checkShareCasinoArray = 0 
      if(finalArray[key+1]){
        checkShareArray = finalArray[key+1].userMatchShare
        checkShareCasinoArray = finalArray[key+1].intCasinoShare
      }
      let share = returnUser.userMatchShare - checkShareArray
      let casinoShare = returnUser.intCasinoShare - checkShareCasinoArray
      returnUser.share = share
      returnUser.casinoShare = casinoShare
      returnData.push(returnUser)
      if(key==0){
        firstMinusShare = returnUser.userMatchShare
        firstMinusCasinoShare = returnUser.intCasinoShare
      }
    })

    let parentShare = {
      username : "parentShare",
      name : "[]",
      share : 100 - loginUserSharess,
      casinoShare : 100 - loginUserCasinoSharess,
      userMatchShare : 100,
    }

    let loginObj = {
      username : loginData.username ,
      name : loginData.name,
      share : loginUserSharess - firstMinusShare,
      casinoShare : loginUserCasinoSharess - firstMinusCasinoShare,
      userMatchShare : loginUserSharess
    }


    let actualFinaArrayObj = []

    actualFinaArrayObj.push(parentShare)
    actualFinaArrayObj.push(loginObj)
    returnData.map((rr)=>{
      actualFinaArrayObj.push(rr)
    })
   
    return SendResponse(res, "success", "fetch Successfully", actualFinaArrayObj);
  }catch(error){console.log(error , "error in share details api in crick service")}
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

    if(bodyData.userId && bodyData.userType){
      where[bodyData.userType+"Id"]  = new ObjectId(bodyData.userId)
    }

    if(bodyData.marketType){
      where.marketType = bodyData.marketType
    }

    if(bodyData.selectionId){
      where.selectionId = bodyData.selectionId
    }

    if(bodyData.sportId){
      where.sportId = bodyData.sportId
    }

    if(bodyData.seriesId){
      where.seriesId = bodyData.seriesId
    }


   let group = {  
      _id : `$remarks`,
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
    let where = await whereHelper(loginData , {
      transactionType : "profitLoss"
    });

    if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    if(bodyData.marketId){
      where.marketId = bodyData.marketId
    }

    if(bodyData.marketType){
      where.marketType = bodyData.marketType
    }

    if(bodyData.selectionId){
      where.selectionId = bodyData.selectionId
    }

    if(bodyData.userId && bodyData.userType){
      where[bodyData.userType+"Id"]  = new ObjectId(bodyData.userId)
    }

    if(!bodyData.userType){
      bodyData.userType = loginData.userType
    }

    if(!bodyData.userId){
      bodyData.userId = loginData.userId
    }

    let parentUserType = loginData.userType
    let userType = bodyData.userType

    if(bodyData.userType && bodyData.userId){
      let userDataType = await UserModel.findOne({
        userId : new ObjectId(bodyData.userId)
      },{
        creatorShareData : 1,
        userType : 1
      })
      creatorData = userDataType.creatorShareData
      parentUserType = creatorData.userType
      userType = userDataType.userType
      if(userType=="client"){
        userType = parentUserType
      }
    }

  
    let group = {
      _id : `$remarks`,
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
      ownAmount : {
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
      totalAmountofClientWithoutComm:  {
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
      totalCommOfClient:  {
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



      resData.map((data , key)=>{
        if(bodyData.userType == "client"){
          resData[key].userComm =  data.totalCommOfClient
        }else{
          resData[key].userComm =  -1 * data.userComm
        }
      })
      

    return SendResponse(
      res,
      "success",
      "account Statement Fetch Successfully",
      resData
    );
  } catch (e) {
    console.log(`error in accountStatement In Crick` , e);
  }
};

const agentProfitLossCrick = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    const loginUserType = loginData.userType 
   
    let directUserId = loginData.userId


    if(bodyData.userId && bodyData.userType){
      
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
        let where = await whereHelper(loginData , {transactionType : "profitLoss"});

        if(bodyData.userId && bodyData.userType){
          where[bodyData.userType+"Id"]  = new ObjectId(bodyData.userId)
        }

        if(bodyData.marketId){
          where.marketId = bodyData.marketId
        }
    
        if(bodyData.marketType){
          where.marketType = bodyData.marketType
        }
    
        if(bodyData.selectionId){
          where.selectionId = bodyData.selectionId
        }

        if (bodyData.fromDate && bodyData.toDate) {
          where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
        }

        where[userType +"Id"]  = userId

        let group = {
          _id : `$${userType}Id`,
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
          ownAmount : {
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
          totalAmountofClientWithoutComm:  {
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
          totalCommOfClient:  {
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

          if(userResdata[0]){
            let resData  = userResdata[0]

            if(userData.userType=="client"){
              resData.userComm = resData.totalCommOfClient
            }else{
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

const activeBetsCount = async (req,res)=>{
  try {

    const loginData = req.loggedInUser;
    let userId = new ObjectId(loginData.userId)

    let where = {
      userId : userId,
      isDeclare : {$in : [0 , false]} , 
      isDeleted : {$in : [0 , false]} , 
    }

    let oddsBetsCount = await oddsBetModel.countDocuments(where)
    let fancyBetsCount = await fancyBetModel.countDocuments(where)
    let internationalCasino = await internationalCasinnoBetList.countDocuments(where)
    let totalActiveBets = oddsBetsCount + fancyBetsCount + internationalCasino

    let returnData = {
      totalActiveBets :totalActiveBets,
      fancyBetsCount :fancyBetsCount,
      oddsBetsCount :oddsBetsCount,
      internationalCasino :internationalCasino,
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
  
  let myCashQuery ={
    transactionType : "ledger",
    creatorId : new ObjectId(creatorId)
  }

  let returnData = {
    myCash : 0,
    parentCash : 0,
  }

  let latestResData =   await crickTransaction.aggregate([
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


  if(latestResData[0]){
    returnData.myCash = (latestResData[0].clientCash - latestResData[0].userCash) 
  }

  let parentCashQuery = {
    transactionType : "ledger",
    userId : new ObjectId(creatorId)
  }

  if(bodyData.parentCash){
    let parentCashData =   await crickTransaction.aggregate([
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

    if(parentCashData[0]){
      returnData.parentCash = parentCashData[0].myCash
    }
  }

  return SendResponse(res, "success", "dataFetched", returnData);

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
};
