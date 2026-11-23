const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");
const { client } = require("../../Helpers/RedisHelper");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const UserModel = require("../../Models/User/User.model");
const ShareModel = require("../../Models/User/Share.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const StatementModel = require("../../Models/Statement.model");
const MatkaModel = require("../../Models/Matka/Matka.model");
const MatkaBetsModel = require("../../Models/Matka/MatkaBets.model");
const matkaResultChartModel = require("../../Models/Matka/matkaResultChart.model");
const ledgerModel = require("../../Models/Ledger.model");
const sportModel = require("../../Models/sportList.model");
const Joi = require("joi");
const { 
  _dx,
  _d,
  convertKeyObject,
  parentDataAppend,
  dateWhereCond,
  _date,
  getSettingData,
} = require("../../Helpers/CommonHelper");
const moment = require("moment");
require("dotenv").config();

const matkaResult = async (req, res) => {
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  if (loginData.userType != "owner") {
    return SendResponse(
      res,
      "error",
      "you are not authorized to perform this operation"
    );
  }
  const JoiSchema = Joi.object({
    matkaEventId: Joi.number().required(),
    betType: Joi.string().required(),
    date: Joi.string().required(),
    result: Joi.number().integer().min(0).max(1000).required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  let { betType, result, date, matkaEventId } = bodyData;

  let matkaDetails = await MatkaModel.findOne({ matkaEventId: matkaEventId });
  if (!matkaDetails) {
    return SendResponse(res, "error", "matka not found");
  }

  let showDate = _date();
  let todayDate = moment().startOf("day").valueOf();
  if (req.body.date) {
    showDate = await _date(bodyData.date);
    todayDate = moment(bodyData.date).startOf("day").valueOf();
  }


  let dateWhere = await dateWhereCond(date, date);
  let where = { matkaEventId: matkaEventId, date: dateWhere };

  let matkaChartDetail = await matkaResultChartModel.findOne(where);

  if (!matkaChartDetail && betType == "CLOSE") {
    return SendResponse(res, "error", "firstly Give OPEN  Result");
  }

  let insertArray = {
    matkaEventId: matkaEventId,
    matkaName: matkaDetails.name,
    date: todayDate,
  };

  const digits = result.toString().split("").map(Number);
  const sumOfDigits = digits.reduce((acc, digit) => acc + digit, 0);
  const singleNumber = sumOfDigits % 10;

  let openNumber = 0;
  let closeNumber = 0;
  let jodiNumber = 0;
  let singleOpenNumber = 0;
  let singleCloseNumber = 0;

  const isEven = digits % 2 === 0;

  let oddEven = isEven ? "even" : "odd";

  if (betType == "OPEN") {
    openNumber = singleNumber;
    insertArray.openNumber = result;
    insertArray.singleOpenNumber = openNumber;
    insertArray.openOddEven = oddEven;
    insertArray.openDeclare = true;
    insertArray.jodiNumber = null;

    let updateWhere = where;

    updateWhere.betType = {
      $in: ["OPEN", "HAROOP_ANDAR"],
    };

    let update = await MatkaBetsModel.updateMany(
      {
        betType: {
          $in: ["OPEN", "HAROOP_ANDAR"],
        },
        gameType: {
          $in: ["SINGLE", "HAROOP_ANDAR"],
        },
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        result: openNumber,
        isDeclare: 1,
      }
    );

    await MatkaBetsModel.updateMany(
      {
        betType: "OPEN",
        gameType: "ODD_EVEN",
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        oddEvenResult: oddEven,
        isDeclare: 1,
      }
    );

    await MatkaBetsModel.updateMany(
      {
        betType: "OPEN",
        gameType: {
          $in: ["SINGLE_PATTI", "DOUBLE_PATTI", "TRIPLE_PATTI", "PATTI"],
        },
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        result: result,
        isDeclare: 1,
      }
    );
  }

  if (betType == "CLOSE") {
    closeNumber = singleNumber;
    insertArray.closeNumber = result;
    insertArray.singleCloseNumber = closeNumber;
    insertArray.closeOddEven = oddEven;
    insertArray.isDeclare = true;
    jodiNumber = Number(`${matkaChartDetail.singleOpenNumber}${singleNumber}`);
    insertArray.jodiNumber = jodiNumber;

    await MatkaBetsModel.updateMany(
      {
        betType: {
          $in: ["CLOSE", "HAROOP_BAHAR"],
        },
        gameType: {
          $in: ["SINGLE", "HAROOP_BAHAR"],
        },
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        result: closeNumber,
        isDeclare: 1,
      }
    );

    await MatkaBetsModel.updateMany(
      {
        betType: { $in: ["JODI", "CLOSE"] },
        gameType: "JODI",
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        result: jodiNumber,
        isDeclare: 1,
      }
    );

    await MatkaBetsModel.updateMany(
      {
        betType: "CLOSE",
        gameType: "ODD_EVEN",
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        oddEvenResult: oddEven,
        isDeclare: 1,
      }
    );

    await MatkaBetsModel.updateMany(
      {
        betType: "CLOSE",
        gameType: {
          $in: ["SINGLE_PATTI", "DOUBLE_PATTI", "TRIPLE_PATTI", "PATTI"],
        },
        matkaEventId: matkaEventId,
        date: dateWhere,
      },
      {
        result: result,
        isDeclare: 1,
      }
    );
  }

  if (!matkaChartDetail) {
    await matkaResultChartModel.create(insertArray);
  } else {
    delete insertArray.matkaEventId;
    let updateWhere = where;

    delete updateWhere.betType;
    await matkaResultChartModel.updateOne(updateWhere, insertArray);
  }

  await client.del(`matkaResultChartFor_${matkaEventId}`);

  let matkaBet;

  let betWhere = {
    date: dateWhere,
    matkaEventId: matkaEventId,
    isDeleted: false, 
    betType:
      betType != "CLOSE"
        ? { $in: ["OPEN", "HAROOP_ANDAR"] }
        : { $in: ["JODI", "CLOSE", "HAROOP_BAHAR"] },
  };



  matkaBet = await MatkaBetsModel.find(betWhere);

  let betIdObj = {};
  let betIdArray = [];
  let transactionLog = [];
  let clientIdObj = {};
  let clientIdArray = [];
  let statementLog = [];
  let updateProfitLossArray = [];

  matkaBet.map((data, key) => {
    let clientHasKey = clientIdObj.hasOwnProperty(data.clientId);
    if (!clientHasKey) {
      clientIdObj[data.clientId] = data.clientId;
      clientIdArray.push(data.clientId);
    }
  });

  let clientListData = await UserModel.find(
    {
      userId: { $in: clientIdArray },
    },
    { parentData: 1, userId: 1, username: 1, name: 1 }
  );

  if (clientListData.length > 0) {
    clientListData = await convertKeyObject(clientListData, "userId");
  }

  let shareData = await ShareModel.find(
    {
      userId: { $in: clientIdArray },
    },
    {
      userId: 1,
      clientMatkaCommission: 1,
      agentMatkaShare: 1,
      agentMatkaCommission: 1,
      superagentMatkaShare: 1,
      superagentMatkaCommission: 1,
      masterMatkaShare: 1,
      masterMatkaCommission: 1,
      subadminMatkaShare: 1,
      subadminMatkaCommission: 1,
      adminMatkaShare: 1,
      adminMatkaCommission: 1,
      superadminMatkaShare: 1,
      superadminMatkaCommission: 1,
      subownerMatkaShare: 1,
      subownerMatkaCommission: 1,
      ownerMatkaShare: 1,
      ownerMatkaCommission: 1,
    }
  );
  shareData = convertKeyObject(shareData, "userId");

  let userLedgerObj = {};
  let userLedger = [];
  let profitLossPositionObj = {};
  let profitLossPositionArray = [];

  let updateProfitLossInBetsModel = [];

  matkaBet.map((data, key) => {
    const betId = data._id;
    let hasKey = betIdObj.hasOwnProperty(betId);
    if (!hasKey) {
      betIdObj[betId] = betId;
      betIdArray.push(betId);
    }

  if(data.isDeleted == false){
    let profitLoss = 0;
    let result = data.result;
    let betNumber = data.betNumber;
    if (data.gameType == "ODD_EVEN") {
      result = data.oddEvenResult;
    }

    if (result == betNumber) {
      profitLoss = data.profit;
    } else {
      profitLoss = data.loss;
    }

    const filter = {
      _id: betId,
    };

    let updateMatchDataLatest = {
      updateOne: {
        filter: filter,
        update: {
          $set: {
            profitLoss: profitLoss,
          },
        },
        upsert: true,
      },
    };

    updateProfitLossInBetsModel.push(updateMatchDataLatest);

    let clientId = data.userId;
    let agentId = data.agentId;
    let superagentId = data.superagentId;
    let masterId = data.masterId;
    let subadminId = data.subadminId;
    let adminId = data.adminId;
    let superadminId = data.superadminId;
    let subownerId = data.subownerId;
    let ownerId = data.ownerId;

    let clientShareData = [];
    if (shareData[clientId]) {
      clientShareData = shareData[clientId];
    }

    let clientData = {};
    if (clientListData[clientId]) {
      clientData = clientListData[clientId];
    }
    let parentData = {};
    if (clientData.parentData) {
      parentData = clientData.parentData;
    }

    let userInfo = {
      username: clientData.username,
      name: clientData.name,
    };

   
    let clientAmount = data.amount;
    let clientComm =
      (clientAmount * clientShareData.clientMatkaCommission) / 100;
    let clientProfitLoss = profitLoss + clientComm;

    // agent calculation
    let agentTotalComm =
      (clientAmount * clientShareData.agentMatkaCommission) / 100;


    let agentComm =
      (agentTotalComm * (100 - clientShareData.agentMatkaShare)) / 100;


    let agentLedgerAmount =
      (profitLoss * (100 - clientShareData.agentMatkaShare)) / 100 + agentComm;
    let agentProfitLoss = clientProfitLoss - agentLedgerAmount;

    // super calculation
    let superagentTotalComm =
      (clientAmount * clientShareData.superagentMatkaCommission) / 100;
    let superagentComm =
      (superagentTotalComm * (100 - clientShareData.superagentMatkaShare)) /
      100;

    let superagentLedgerAmount =
      (profitLoss * (100 - clientShareData.superagentMatkaShare)) / 100 +
      superagentComm;
    let superagentProfitLoss = agentLedgerAmount - superagentLedgerAmount;

    //master calculation
    let masterTotalComm =
      (clientAmount * clientShareData.masterMatkaCommission) / 100;
    let masterComm =
      (masterTotalComm * (100 - clientShareData.masterMatkaShare)) / 100;
    let masterLedgerAmount =
      (profitLoss * (100 - clientShareData.masterMatkaShare)) / 100 +
      masterComm;
    let masterProfitLoss = superagentLedgerAmount - masterLedgerAmount;

    //subadmin calculation
    let subadminTotalComm =
      (clientAmount * clientShareData.subadminMatkaCommission) / 100;
    let subadminComm =
      (subadminTotalComm * (100 - clientShareData.subadminMatkaShare)) / 100;
    let subadminLedgerAmount =
      (profitLoss * (100 - clientShareData.subadminMatkaShare)) / 100 +
      subadminComm;
    let subadminProfitLoss = masterLedgerAmount - subadminLedgerAmount;

    //admin calculation
    let adminTotalComm =
      (clientAmount * clientShareData.adminMatkaCommission) / 100;
    let adminComm =
      (adminTotalComm * (100 - clientShareData.adminMatkaShare)) / 100;


  


    let adminLedgerAmount =
      (profitLoss * (100 - clientShareData.adminMatkaShare)) / 100 + adminComm;

    let adminProfitLoss = subadminLedgerAmount - adminLedgerAmount;

    //superadmin calculation
    let superadminTotalComm =
      (clientAmount * clientShareData.superadminMatkaCommission) / 100;
    let superadminComm =
      (superadminTotalComm * (100 - clientShareData.superadminMatkaShare)) /
      100;
    let superadminLedgerAmount =
      (profitLoss * (100 - clientShareData.superadminMatkaShare)) / 100 +
      superadminComm;
    let superadminProfitLoss = adminLedgerAmount - superadminLedgerAmount;

    //subowner calculation
    let subownerTotalComm =
      (clientAmount * clientShareData.subownerMatkaCommission) / 100;
    let subownerComm =
      (subownerTotalComm * (100 - clientShareData.subownerMatkaShare)) / 100;
    let subownerLedgerAmount =
      (profitLoss * (100 - clientShareData.subownerMatkaShare)) / 100 +
      subownerComm;
    let subownerProfitLoss = superadminLedgerAmount - subownerLedgerAmount;

    //owner calculation
    let ownerTotalComm =
      (clientAmount * clientShareData.ownerMatkaCommission) / 100;
    let ownerComm =
      (ownerTotalComm * (100 - clientShareData.ownerMatkaShare)) / 100;
    let ownerLedgerAmount =
      (profitLoss * (100 - clientShareData.ownerMatkaShare)) / 100 + ownerComm;
    let ownerProfitLoss = subownerLedgerAmount - ownerLedgerAmount;

    const pushTransaction = {
      userId: data.userId,
      clientId: data.clientId,
      amount: clientProfitLoss,
      sessionTurnOver: data.amount,
      agentId: data.agentId,
      superagentId: data.superagentId,
      masterId: data.masterId,
      subadminId: data.subadminId,
      adminId: data.adminId,
      superadminId: data.superadminId,
      subownerId: data.subownerId,
      ownerId: data.ownerId,
      gameType: "matka",
      gameName: `${data.matkaName} - ${data.betType} - ${data.gameType}`,
      overallType: "matkaOdds",
      userType: "client",
      casinoType: data.matkaName,
      isDeclare: 1,
      eventId: data.matkaEventId,
      forBet: 1,
      marketId: betId,
      date: todayDate,

      agentShareAmount: agentLedgerAmount.toFixed(2),
      superagentShareAmount: superagentLedgerAmount.toFixed(2),
      masterShareAmount: masterLedgerAmount.toFixed(2),
      subadminShareAmount: subadminLedgerAmount.toFixed(2),
      adminShareAmount: adminLedgerAmount.toFixed(2),
      superadminShareAmount: superadminLedgerAmount.toFixed(2),
      subownerShareAmount: subownerLedgerAmount.toFixed(2),
      ownerShareAmount: ownerLedgerAmount.toFixed(2),

      agentAmount: agentProfitLoss.toFixed(2),
      superagentAmount: superagentProfitLoss.toFixed(2),
      masterAmount: masterProfitLoss.toFixed(2),
      subadminAmount: subadminProfitLoss.toFixed(2),
      adminAmount: adminProfitLoss.toFixed(2),
      superadminAmount: superadminProfitLoss.toFixed(2),
      subownerAmount: subownerProfitLoss.toFixed(2),
      ownerAmount: ownerProfitLoss.toFixed(2),
    };

    transactionLog.push(pushTransaction);

    let statement = {
      amount: profitLoss,
      marketId: data.matkaEventId,
      transactionId: betId,
      eventId: data.matkaEventId,
      userId: data.userId,
      userType: "client",
      statementFor: "matka",
      gameType: `matka`,
      sportsType: `matka`,
      userRemark: `matka For ${data.matkaName} `,
      remark: `matka For ${data.matkaName} `,
      date: todayDate,
    };
    statementLog.push(statement);

    if (clientComm != 0) {
      let statement = {
        amount: clientComm,
        marketId: data.matkaEventId,
        transactionId: betId,
        eventId: data.matkaEventId,
        userId: data.userId,
        userType: "client",
        isComm: 1,
        statementFor: "matkaComm",
        gameType: `matka`,
        sportsType: `matka`,
        userRemark: `matka Comm For ${data.matkaName} `,
        remark: `matka Comm For ${data.matkaName} `,
        date: todayDate,
      };
      statementLog.push(statement);
    }

    let profitLossObj = {
      updateOne: {
        filter: { _id: data._id },
        update: {
          $set: {
            profitLoss: profitLoss,
          },
        },
      },
    };
    updateProfitLossArray.push(profitLossObj);
  }

  });

  for (let key in userLedgerObj) {
    if (userLedgerObj.hasOwnProperty(key)) {
      let ledger = userLedgerObj[key];
      userLedger.push(ledger);
    }
  }


  try {
    await MatkaBetsModel.bulkWrite(updateProfitLossInBetsModel);
    await MatkaBetsModel.updateMany(
      {
        betId: {
          $in: betIdArray,
        },
      },
      {
        isDeclare: true,
      }
    );

    await StatementModel.deleteMany({
      statementFor: "matka",
      transactionId: { $in: betIdArray },
      eventId: matkaEventId,
      marketId: matkaEventId,
    });

    await TransactionLogModel.deleteMany({
      marketId: { $in: betIdArray },
      gameType: "matka",
      overallType: "matkaOdds",
      eventId: matkaEventId,
    });


    await TransactionLogModel.insertMany(transactionLog);

    await StatementModel.insertMany(statementLog);

    await MatkaBetsModel.bulkWrite(updateProfitLossArray);

    let isMatkaInsert = process.env.IS_MATKA_LIST_INSERT_ON_RESULT;
    if (isMatkaInsert) {
      let panelResult = await matkaResultChartModel.findOne({
        matkaEventId: matkaEventId,
        date: dateWhere,
      });

      let matkaArray = {
        marketId: `${matkaEventId}-${showDate}`,
        eventId: `${matkaEventId}`,
        sportName: `matka`,
        sportType: `matka`,
        matchType: `matka`,
        isDeclare: true,
        status: "COMPLETED",
        sportId: 20000,
        seriesId: 20000,
        matchName: `${matkaDetails.name}-(${showDate})`,
        matchDate: `${showDate}`,
        wonTeamName: `${panelResult.jodiNumber}`,
        date: todayDate,
      };

      let sportCount = await sportModel.countDocuments({
        eventId: matkaEventId,
        date: dateWhere,
      });

      if (sportCount == 0) {
        await sportModel.create(matkaArray);
      } else {
        await sportModel.updateOne(
          {
            eventId: matkaEventId,
            date: dateWhere,
          },
          matkaArray
        );
      }

      await client.del("inplayMatchList");
    }
  } catch (error) {
    console.error("Transaction aborted:", error);
  }

  const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
    clientIdArray
  );


  await generateMatkaLedger(matkaEventId , dateWhere , showDate , todayDate)


  if (res) {
    return SendResponse(
      res,
      "success",
      "Updated Successfully",
      updateUserCoins
    );
  } else {
    return true;
  }
};


const generateMatkaLedger = async (matkaEventId,dateWhere , showDate , todayDate)=>{
  try{
    dateWhere.$gte = Number(dateWhere.$gte)
    dateWhere.$lte = Number(dateWhere.$lte)

    let betsWhere = {
      matkaEventId: Number(matkaEventId),
      date : dateWhere,
      isDeclare:1,
      isDeleted: false
    }
    let groupCond = {
      _id: "$userId",
      profitLoss: { $sum: "$profitLoss" },
      totalTurnover: { $sum: "$amount" },
    };
    let clientIdArray = []
    let matkaTransactionPerday = await MatkaBetsModel.aggregate([
      {
        $match: betsWhere,
      },
      {
        $group: groupCond,
      },
    ]);


//    _dx(matkaTransactionPerday , "matkaTransactionPerday")


    matkaTransactionPerday.map((transaction)=>{
      clientIdArray.push(transaction._id)
    })

    let clientListData = await UserModel.find(
      {
        userId: { $in: clientIdArray },
      },
      { parentData: 1, userId: 1, username: 1, name: 1 }
    );

    if (clientListData.length > 0) {
      clientListData = await convertKeyObject(clientListData, "userId");
    }

    let shareData = await ShareModel.find({
      userId : {$in :clientIdArray }
    },{
      userId: 1,
      clientMatkaCommission: 1,
      agentMatkaShare: 1,
      agentMatkaCommission: 1,
      superagentMatkaShare: 1,
      superagentMatkaCommission: 1,
      masterMatkaShare: 1,
      masterMatkaCommission: 1,
      subadminMatkaShare: 1,
      subadminMatkaCommission: 1,
      adminMatkaShare: 1,
      adminMatkaCommission: 1,
      superadminMatkaShare: 1,
      superadminMatkaCommission: 1,
      subownerMatkaShare: 1,
      subownerMatkaCommission: 1,
      ownerMatkaShare: 1,
      ownerMatkaCommission: 1,
      agentId : 1 ,
      superagentId : 1 ,
      masterId : 1 ,
      subadminId : 1 ,
      adminId : 1 ,
      superadminId : 1 ,
      subownerId : 1 ,
      ownerId : 1 ,
    })

    shareData = convertKeyObject(shareData, "userId");


    let matkaResult =  await matkaResultChartModel.findOne({
      matkaEventId : Number(matkaEventId),
      date : dateWhere
    })


    let userLedgerObj = {};
    let userLedger = [];
    let profitLossPositionObj = {};
    let profitLossPositionArray = [];
    let updateProfitLossInBetsModel = [];
  

    matkaTransactionPerday.map((data, key) => {
      let clientId = data._id
      let userId = data._id
      let totalTurnOver = data.totalTurnover
      let profitLoss = data.profitLoss
      
      let clientShareData = [];
      if (shareData[clientId]) {
        clientShareData = shareData[clientId];
      }



      let agentId = clientShareData.agentId;
      let superagentId = clientShareData.superagentId;
      let masterId = clientShareData.masterId;
      let subadminId = clientShareData.subadminId;
      let adminId = clientShareData.adminId;
      let superadminId = clientShareData.superadminId;
      let subownerId = clientShareData.subownerId;
      let ownerId = clientShareData.ownerId;

      let clientData = {};
      if (clientListData[clientId]) {
        clientData = clientListData[clientId];
      }

      let parentData = {};
      if (clientData.parentData) {
        parentData = clientData.parentData;
      }
      
      let userInfo = {
        username: clientData.username,
        name: clientData.name,
      };
  

      let clientComm =
        (totalTurnOver * clientShareData.clientMatkaCommission) / 100;

       
      let clientProfitLoss = profitLoss + clientComm;

  
      // agent calculation
      let agentTotalComm =
        -1 * (profitLoss * clientShareData.agentMatkaCommission) / 100;
  
      let agentComm =
        (agentTotalComm * (100 - clientShareData.agentMatkaShare)) / 100;
  

      let agentLedgerAmount =
        (profitLoss * (100 - clientShareData.agentMatkaShare)) / 100 + agentComm;
      let agentProfitLoss = clientProfitLoss - agentLedgerAmount;
  
      // super calculation
      let superagentTotalComm =
        -1 * (profitLoss * clientShareData.superagentMatkaCommission) / 100;
      let superagentComm =
        (superagentTotalComm * (100 - clientShareData.superagentMatkaShare)) /
        100;
  
      let superagentLedgerAmount =
        (profitLoss * (100 - clientShareData.superagentMatkaShare)) / 100 +
        superagentComm;
      let superagentProfitLoss = agentLedgerAmount - superagentLedgerAmount;
  
      //master calculation
      let masterTotalComm =
        -1 * (profitLoss * clientShareData.masterMatkaCommission) / 100;
      let masterComm =
        (masterTotalComm * (100 - clientShareData.masterMatkaShare)) / 100;
      let masterLedgerAmount =
        (profitLoss * (100 - clientShareData.masterMatkaShare)) / 100 +
        masterComm;
      let masterProfitLoss = superagentLedgerAmount - masterLedgerAmount;
  
      //subadmin calculation
      let subadminTotalComm =
        -1 * (profitLoss * clientShareData.subadminMatkaCommission) / 100;
      let subadminComm =
        (subadminTotalComm * (100 - clientShareData.subadminMatkaShare)) / 100;
      let subadminLedgerAmount =
        (profitLoss * (100 - clientShareData.subadminMatkaShare)) / 100 +
        subadminComm;
      let subadminProfitLoss = masterLedgerAmount - subadminLedgerAmount;
  
      //admin calculation
      let adminTotalComm =
        -1 * (profitLoss * clientShareData.adminMatkaCommission) / 100;
      let adminComm =
        (adminTotalComm * (100 - clientShareData.adminMatkaShare)) / 100;
      let adminLedgerAmount =
        (profitLoss * (100 - clientShareData.adminMatkaShare)) / 100 + adminComm;
      let adminProfitLoss = subadminLedgerAmount - adminLedgerAmount;
  
      //superadmin calculation
      let superadminTotalComm =
        -1 * (profitLoss * clientShareData.superadminMatkaCommission) / 100;
      let superadminComm =
        (superadminTotalComm * (100 - clientShareData.superadminMatkaShare)) /
        100;
      let superadminLedgerAmount =
        (profitLoss * (100 - clientShareData.superadminMatkaShare)) / 100 +
        superadminComm;
      let superadminProfitLoss = adminLedgerAmount - superadminLedgerAmount;
  
      //subowner calculation
      let subownerTotalComm =
       -1 *  (profitLoss * clientShareData.subownerMatkaCommission) / 100;
      let subownerComm =
        (subownerTotalComm * (100 - clientShareData.subownerMatkaShare)) / 100;
      let subownerLedgerAmount =
        (profitLoss * (100 - clientShareData.subownerMatkaShare)) / 100 +
        subownerComm;
      let subownerProfitLoss = superadminLedgerAmount - subownerLedgerAmount;
  
      //owner calculation
      let ownerTotalComm =
        -1 * (profitLoss * clientShareData.ownerMatkaCommission) / 100;
      let ownerComm =
        (ownerTotalComm * (100 - clientShareData.ownerMatkaShare)) / 100;
      let ownerLedgerAmount =
        (profitLoss * (100 - clientShareData.ownerMatkaShare)) / 100 + ownerComm;
      let ownerProfitLoss = subownerLedgerAmount - ownerLedgerAmount;
  


      let matkaName = matkaResult.matkaName
  
  
  
      let userCommonPosition = {
        userInfo: userInfo,
        userId: clientId,
        clientId: clientId,
        marketId: `${matkaEventId}-${showDate}`,
        eventId:   matkaEventId,
        isDeclare: 1,
        eventName: `${matkaName}-(${showDate})`,
        agentId: clientShareData.agentId,
        superagentId: clientShareData.superagentId,
        masterId: clientShareData.masterId,
        subadminId: clientShareData.subadminId,
        adminId: clientShareData.adminId,
        superadminId: clientShareData.superadminId,
        subownerId: clientShareData.subownerId,
        ownerId: clientShareData.ownerId,
        clientOddsAmount: 0,
        clientOddsComm: 0,
        clientNetAmount: 0,
        agentOddsComm: 0,
        superagentOddsComm: 0,
        masterOddsComm: 0,
        subadminOddsComm: 0,
        adminOddsComm: 0,
        superadminOddsComm: 0,
        subownerOddsComm: 0,
        ownerOddsComm: 0,
        agentNetProfitLoss: 0,
        superagentNetProfitLoss: 0,
        masterNetProfitLoss: 0,
        subadminNetProfitLoss: 0,
        adminNetProfitLoss: 0,
        superadminNetProfitLoss: 0,
        subownerNetProfitLoss: 0,
        ownerNetProfitLoss: 0,
        agentNetProfitLossSelf: 0,
        superagentNetProfitLossSelf: 0,
        masterNetProfitLossSelf: 0,
        subadminNetProfitLossSelf: 0,
        adminNetProfitLossSelf: 0,
        superadminNetProfitLossSelf: 0,
        subownerNetProfitLossSelf: 0,
        ownerNetProfitLossSelf: 0,
        agentLedgerAmt: 0,
        superagentLedgerAmt: 0,
        masterLedgerAmt: 0,
        subadminLedgerAmt: 0,
        adminLedgerAmt: 0,
        superadminLedgerAmt: 0,
        subownerLedgerAmt: 0,
        ownerLedgerAmt: 0,
        date: todayDate,
        positionType: "matka",
        result: `${matkaResult.jodiNumber}`,
      };

  
      let userCommonLedger = {
        isDeclare: 1,
        amount: clientProfitLoss,
        marketId: matkaEventId,
        eventId: matkaEventId,
        ledgerType: `matka`,
        eventName: `${matkaName}-(${showDate})`,
        remark: `Result - ${matkaResult.jodiNumber}`,
        date: todayDate,
      };

  
      let clientExists = userLedgerObj.hasOwnProperty([clientId]);
      let agentExists = userLedgerObj.hasOwnProperty([agentId]);
      let superagentExists = userLedgerObj.hasOwnProperty([superagentId]);
      let masterExists = userLedgerObj.hasOwnProperty([masterId]);
      let subadminExists = userLedgerObj.hasOwnProperty([subadminId]);
      let adminExists = userLedgerObj.hasOwnProperty([adminId]);
      let superadminExists = userLedgerObj.hasOwnProperty([superadminId]);
      let subownerExists = userLedgerObj.hasOwnProperty([subownerId]);
      let ownerExists = userLedgerObj.hasOwnProperty([ownerId]);
  
      if (!clientExists) {
        userLedgerObj[clientId] = {
          ...userCommonLedger,
          ...{
            userId: clientId,
            clientId: clientId,
            userType: "client",
            amount: 0,
            agentId: agentId,
            superagentId: superagentId,
            masterId: masterId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
        profitLossPositionObj[clientId] = userCommonPosition;
      }
  
      if (!agentExists) {
        userLedgerObj[agentId] = {
          ...userCommonLedger,
          ...{
            userId: agentId,
            userType: "agent",
            amount: 0,
            agentId: agentId,
            superagentId: superagentId,
            masterId: masterId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!superagentExists) {
        userLedgerObj[superagentId] = {
          ...userCommonLedger,
          ...{
            userId: superagentId,
            userType: "superagent",
            amount: 0,
            superagentId: superagentId,
            masterId: masterId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!masterExists) {
        userLedgerObj[masterId] = {
          ...userCommonLedger,
          ...{
            userId: masterId,
            userType: "master",
            amount: 0,
            masterId: masterId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!subadminExists) {
        userLedgerObj[subadminId] = {
          ...userCommonLedger,
          ...{
            userId: subadminId,
            userType: "subadmin",
            amount: 0,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!adminExists) {

        userLedgerObj[adminId] = {
          ...userCommonLedger,
          ...{
            userId: adminId,
            userType: "admin",
            amount: 0,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };


      }
  
      if (!superadminExists) {
        userLedgerObj[superadminId] = {
          ...userCommonLedger,
          ...{
            userId: superadminId,
            userType: "superadmin",
            amount: 0,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!subownerExists) {
        userLedgerObj[subownerId] = {
          ...userCommonLedger,
          ...{
            userId: subownerId,
            userType: "subowner",
            amount: 0,
            subownerId: subownerId,
            ownerId: ownerId,
          },
        };
      }
  
      if (!ownerExists) {
        userLedgerObj[ownerId] = {
          ...userCommonLedger,
          ...{
            userId: ownerId,
            userType: "owner",
            amount: 0,
            ownerId: ownerId,
          },
        };
      }
  
   
    
      userLedgerObj[clientId].amount += clientProfitLoss;
      userLedgerObj[agentId].amount += -1 * agentLedgerAmount;
      userLedgerObj[superagentId].amount += -1 * superagentLedgerAmount;
      userLedgerObj[masterId].amount += -1 * masterLedgerAmount;
      userLedgerObj[subadminId].amount += -1 * subadminLedgerAmount;
      userLedgerObj[adminId].amount += -1 * adminLedgerAmount;
      userLedgerObj[superadminId].amount += -1 * superadminLedgerAmount;
      userLedgerObj[subownerId].amount += -1 * subownerLedgerAmount;
      userLedgerObj[ownerId].amount += -1 * ownerLedgerAmount;



  
      profitLossPositionObj[clientId].clientOddsAmount += profitLoss;
      profitLossPositionObj[clientId].clientOddsComm += clientComm;
      profitLossPositionObj[clientId].clientNetAmount += clientProfitLoss;
  
      profitLossPositionObj[clientId].agentOddsComm += agentTotalComm;
      profitLossPositionObj[clientId].superagentOddsComm += superagentTotalComm;
      profitLossPositionObj[clientId].masterOddsComm += masterTotalComm;
      profitLossPositionObj[clientId].subadminOddsComm += subadminTotalComm;
      profitLossPositionObj[clientId].adminOddsComm += adminTotalComm;
      profitLossPositionObj[clientId].superadminOddsComm += superadminTotalComm;
      profitLossPositionObj[clientId].subownerOddsComm += subownerTotalComm;
      profitLossPositionObj[clientId].ownerOddsComm += ownerTotalComm;
  
      profitLossPositionObj[clientId].agentNetProfitLoss += -1 * agentProfitLoss;
      profitLossPositionObj[clientId].superagentNetProfitLoss +=
        -1 * superagentProfitLoss;
      profitLossPositionObj[clientId].masterNetProfitLoss +=
        -1 * masterProfitLoss;
      profitLossPositionObj[clientId].subadminNetProfitLoss +=
        -1 * subadminProfitLoss;

      profitLossPositionObj[clientId].adminNetProfitLoss += -1 * adminProfitLoss;


      profitLossPositionObj[clientId].superadminNetProfitLoss +=
        -1 * superadminProfitLoss;
      profitLossPositionObj[clientId].subownerNetProfitLoss +=
        -1 * subownerProfitLoss;
      profitLossPositionObj[clientId].ownerNetProfitLoss += -1 * ownerProfitLoss;
      profitLossPositionObj[clientId].agentNetProfitLossSelf +=
        -1 * agentProfitLoss;
      profitLossPositionObj[clientId].superagentNetProfitLossSelf +=
        -1 * superagentProfitLoss;
      profitLossPositionObj[clientId].masterNetProfitLossSelf +=
        -1 * masterProfitLoss;
      profitLossPositionObj[clientId].subadminNetProfitLossSelf +=
        -1 * subadminProfitLoss;
      profitLossPositionObj[clientId].adminNetProfitLossSelf +=
        -1 * adminProfitLoss;
      profitLossPositionObj[clientId].superadminNetProfitLossSelf +=
        -1 * superadminProfitLoss;
      profitLossPositionObj[clientId].subownerNetProfitLossSelf +=
        -1 * subownerProfitLoss;
      profitLossPositionObj[clientId].ownerNetProfitLossSelf +=
        -1 * ownerProfitLoss;
  
      profitLossPositionObj[clientId].agentLedgerAmt += -1 * agentLedgerAmount;
      profitLossPositionObj[clientId].superagentLedgerAmt +=
        -1 * superagentLedgerAmount;
      profitLossPositionObj[clientId].masterLedgerAmt += -1 * masterLedgerAmount;
      profitLossPositionObj[clientId].subadminLedgerAmt +=
        -1 * subadminLedgerAmount;
      profitLossPositionObj[clientId].adminLedgerAmt += -1 * adminLedgerAmount;
      profitLossPositionObj[clientId].superadminLedgerAmt +=
        -1 * superadminLedgerAmount;
      profitLossPositionObj[clientId].subownerLedgerAmt +=
        -1 * subownerLedgerAmount;
      profitLossPositionObj[clientId].ownerLedgerAmt += -1 * ownerLedgerAmount;
  
    });




  // _dx(userLedgerObj['6a0eafbbfb647e3c87df411e'], "userLedgerObj")

    for (let key in userLedgerObj) {
      if (userLedgerObj.hasOwnProperty(key)) {
        let ledger = userLedgerObj[key];
        userLedger.push(ledger);
      }
    }
  
    for (let key in profitLossPositionObj) {
      if (profitLossPositionObj.hasOwnProperty(key)) {
        let profitLossPosition = profitLossPositionObj[key];
        profitLossPositionArray.push(profitLossPosition);
      }
    }
  
    try {
    
      await ledgerModel.deleteMany({
        eventId: matkaEventId,
        date: dateWhere,
        ledgerType: "matka",
      });
      await ledgerModel.insertMany(userLedger);
  
      await profitLossPosition.deleteMany({
        eventId: matkaEventId,
        date: dateWhere,
      });
      
      await profitLossPosition.insertMany(
        profitLossPositionArray
      );
  
    } catch (error) {
      console.error("Transaction aborted:", error);
    }

  }catch(error){
     console.log(`error in generate in matka ledger` , error)
  }
}


module.exports = {
  matkaResult,
};
