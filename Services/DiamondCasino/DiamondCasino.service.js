const { ObjectId } = require("mongodb");
const UserModel = require("../../Models/User/User.model");
const ShareModel = require("../../Models/User/Share.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const ledgerModel = require("../../Models/Ledger.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const statementModel = require("../../Models/Statement.model");
const casinoBet = require("../../Models/BetsList/CasinoBetsList.model");
const crickTransactionLog = require("../../Models/crickTransaction.model");
const diamondCasinoList = require("../../Models/Casino/DiamondCasinoList.model");
const { returnResponse } = require("../../Helpers/ResponseMapper");
const axios = require("axios");
axios.defaults.timeout = 1000;
const { client } = require("../../Helpers/RedisHelper");
const {
  _dx,
  _d,
  convertKeyObject,
  convertObjectToArray,
  removeDuplicates,
  getClientShareArray,
  dateWhereCond,
  _date,
} = require("../../Helpers/CommonHelper");
const moment = require("moment");

const getDiamondCasinoData = async () => {
  let casinoData = {};
  casinoData = await client.get(`diamondCasinoList`);
  if (!casinoData || casinoData.length < 5) {
    casinoData = await diamondCasinoList.find();
    await client.set(`diamondCasinoList`, JSON.stringify(casinoData));
  } else {
    casinoData = JSON.parse(casinoData);
  }
  return returnResponse("success", "data fetched", casinoData);
};

const getDiamondCasinoByEventId = async (eventId) => {
  let casinoData = {};
  casinoData = await client.get(`diamondCasinoList_${eventId}`);
  if (!casinoData || casinoData == null || casinoData.length < 5) {
    casinoData = await diamondCasinoList.findOne({ eventId: eventId });
    await client.set(
      `diamondCasinoList_${eventId}`,
      JSON.stringify(casinoData)
    );
  } else {
    casinoData = JSON.parse(casinoData);
  }
  return returnResponse("success", "data fetched", casinoData);
};

const updateDiamondCasino = async (bodyData) => {
  const eventId = bodyData.eventId;
    const result = await diamondCasinoList.updateOne(
      { eventId: eventId },      // filter
      { $set: bodyData },        // update data
      { upsert: true }           // insert if not found
    );
  await client.del(`diamondCasinoList_${eventId}`);
  await client.del(`diamondCasinoList`);
  return returnResponse("success", "data updated successfully", result);
};

const checkCasinoData = async (bodyData) => {
  let casinoData = await getDiamondCasinoByEventId(bodyData.eventId);
  if (!casinoData.data) {
    return returnResponse("error", "casino Not Found");
  }
  casinoData = casinoData.data;

  if (!casinoData.betStatus) {
    return returnResponse("error", "bet is closed by admin");
  }

  if (!casinoData.cashinoStatus) {
    return returnResponse("error", "casino is closed by admin");
  }

  if (casinoData.isDisable) {
    return returnResponse("error", "casino Not Found");
  }

  if (bodyData.amount > casinoData.maxStake) {
    return returnResponse(
      "error",
      `amount can not be greater than casino Max Amount ${casinoData.maxStake}`
    );
  }

  if (bodyData.amount < casinoData.minStake) {
    return returnResponse(
      "error",
      `amount can not be less than casino Min Amount ${casinoData.minStake}`
    );
  }

  return returnResponse("success", "data fetched", casinoData);
};

const finalOddsDataDeconstruct = async (
  oddsData,
  casinoType,
  bodyData = {}
) => {
  let filteredData = oddsData;

  if (casinoType == "teen20") {
    filteredData = oddsData.filter(
      (item) => item.sid !== "2" && item.sid !== "4"
    );
  }

  if (casinoType == "dt20") {
    filteredData = oddsData.filter(
      (item) => item.sid === "1" || item.sid === "2" || item.sid === "3"
    );
  }

  if (casinoType == "dt202") {
    filteredData = oddsData.filter(
      (item) => item.sid === "1" || item.sid === "2" || item.sid === "3"
    );
  }

  if (casinoType == "lucky7eu" || casinoType == "lucky7") {
    let betFor = bodyData.betFor;

    if (betFor == "lowHigh") {
      filteredData = oddsData.filter(
        (item) => item.sid === "1" || item.sid === "2"
      );
    }

    if (betFor == "color") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "5" && item.sid <= "6"
      );
    }

    if (betFor == "oddEven") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "3" && item.sid <= "4"
      );
    }

    if (betFor == "cards") {
      filteredData = oddsData.filter(
        (item) =>
          item.sid === "7" ||
          item.sid === "8" ||
          item.sid === "9" ||
          item.sid === "10" ||
          item.sid === "11" ||
          item.sid === "12" ||
          item.sid === "13" ||
          item.sid === "14" ||
          item.sid === "15" ||
          item.sid === "16" ||
          item.sid === "17" ||
          item.sid === "18" ||
          item.sid === "19"
      );
    }
  }

  if (casinoType == "aaa") {
    let betFor = bodyData.betFor;

    if (betFor == "aaa") {
      filteredData = oddsData.filter(
        (item) => item.sid === "1" || item.sid === "2" || item.sid === "3"
      );
    }

    if (betFor == "oddEven") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "4" && item.sid <= "5"
      );
    }

    if (betFor == "color") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "6" && item.sid <= "7"
      );
    }

    if (betFor == "cards") {
      filteredData = oddsData.filter(
        (item) =>
          item.sid === "8" ||
          item.sid === "9" ||
          item.sid === "10" ||
          item.sid === "11" ||
          item.sid === "12" ||
          item.sid === "13" ||
          item.sid === "14" ||
          item.sid === "15" ||
          item.sid === "16" ||
          item.sid === "17" ||
          item.sid === "18" ||
          item.sid === "19" ||
          item.sid === "20"
      );
    }
  }

  if (casinoType == "worli") {
    filteredData = oddsData.filter(
      (item) => item.sid != "11" && item.sid != "12" && item.sid != "13"
    );
  }

  if (casinoType == "abj") {
    let betFor = bodyData.betFor;

    if (betFor == "andarBahar") {
      filteredData = oddsData.filter(
        (item) =>
          item.sid === "1" ||
          item.sid === "2" ||
          item.sid === "3" ||
          item.sid === "4" ||
          item.sid === "5" ||
          item.sid === "6"
      );
    }

    if (betFor == "oddEven") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "24" && item.sid <= "25"
      );
    }

    if (betFor == "color") {
      filteredData = oddsData.filter(
        (item) => item.sid >= "20" && item.sid <= "23"
      );
    }

    if (betFor == "cards") {
      filteredData = oddsData.filter(
        (item) =>
          item.sid === "7" ||
          item.sid === "8" ||
          item.sid === "9" ||
          item.sid === "10" ||
          item.sid === "11" ||
          item.sid === "12" ||
          item.sid === "13" ||
          item.sid === "14" ||
          item.sid === "15" ||
          item.sid === "16" ||
          item.sid === "17" ||
          item.sid === "18" ||
          item.sid === "19"
      );
    }
  }

  if (casinoType == "card32") {
    filteredData = oddsData;
  }

  if (casinoType == "card32eu") {
    let betFor = bodyData.betFor;
    if (betFor == "card32eu") {
      filteredData = oddsData.filter(
        (item) =>
          item.sid === "1" ||
          item.sid === "2" ||
          item.sid === "3" ||
          item.sid === "4"
      );
    } else if (betFor == "oddEven") {
      filteredData = oddsData.filter((item) => item.sid >= 5 && item.sid <= 12);
    } else if (betFor == "anyThree") {
      filteredData = oddsData.filter(
        (item) => item.sid === "13" || item.sid === "14" || item.sid === "27"
      );
    } else if (betFor == "total") {
      filteredData = oddsData.filter(
        (item) => item.sid === "25" || item.sid === "26"
      );
    } else if (betFor == "number") {
      filteredData = oddsData.filter(
        (item) => item.sid >= 15 && item.sid <= 24
      );
    } else {
      filteredData = [];
    }
  }

  if (casinoType == "teen9") {
    filteredData = oddsData.filter((item) => item.nat == bodyData.nat);
  }

  if (casinoType == "goal") {
    let betFor = bodyData.betFor;
    if (betFor == "match") {
      filteredData = oddsData.filter(
        (item) =>
          item.subtype === "match" 
      );
    } else if (betFor == "player") {
      filteredData = oddsData.filter((item) => item.subtype == "player");
    } else {
      filteredData = [];
    }
  }

  return filteredData;
};

let checkCasinoOdds = async (casinoApiData, bodyData, casinoData = {}) => {
  const casinoType = bodyData.casinoType;
  casinoApiData = casinoApiData.data;
  const casinoSettingData = casinoData.setting ? casinoData.setting : {};
  let oddsDifference = 0;
  if (casinoSettingData.oddsDifference) {
    oddsDifference = casinoSettingData.oddsDifference;
  }

  let oddsFinalData = {};
  let returnRequest = true;
  let roundId = 0;
  let autotime = 0


  if (casinoApiData.data && casinoApiData.data.t1) {
    const t1Data = casinoApiData.data.t1;
    roundId = t1Data[0]?.mid;
      if (t1Data[0]?.autotime) {
        autotime = t1Data[0].autotime;
      }
  }


   if (autotime < 5) {
     return returnResponse(
       "error",
       "odds Expired ! we can not take bet because odds are expiring soon"
     );
    }
  
  

  if (casinoApiData.data && casinoApiData.data.t2) {
    oddsFinalData = casinoApiData.data.t2;
    returnRequest = false;
  }

  if (casinoApiData.data && casinoApiData.data.bf) {
    oddsFinalData = casinoApiData.data.bf;
    returnRequest = false;
  }


  if (casinoApiData.data && casinoApiData.data.t1 && casinoApiData.data.t1.gtype == "ballbyball") {
    oddsFinalData = casinoApiData.data.t1.sub
    returnRequest = false;
  }

  if (casinoApiData.data  && casinoApiData.data.gtype == "goal") {
    oddsFinalData = casinoApiData.data.sub
    returnRequest = false;
    roundId = casinoApiData.data.mid;
  }



  if (casinoType == "Teen") {
    oddsFinalData = casinoApiData.data.t1;
    returnRequest = false;
  }

  if (returnRequest) {
    return returnResponse(
      "error",
      "odds data not found ! Something went wrong"
    );
  }

  let getBySelectionId = "sid";

  if (casinoType == "teen9") {
    getBySelectionId = "nation";
  }

  if (casinoType == "Teen") {
    getBySelectionId = "sectionId";
  }

  let keyData = await convertKeyObject(oddsFinalData, getBySelectionId);

  let finalData = {};
  if (keyData[bodyData.sid]) {
    finalData = keyData[bodyData.sid];
  }
  if (casinoType == "teen9") {
    finalData = keyData[bodyData.nat];
  }

  if (!finalData) {
    return returnResponse(
      "error",
      "Odds are expired because data is not coming please do bet again"
    );
  }



  if (roundId) {
    finalData.mid = roundId;
  }

  if (casinoType == "baccarat2") {
    finalData.rate = finalData.b1;
  }

  if (casinoType == "worli2" || casinoType == "worli") {
    finalData.sid = bodyData.betFor ? bodyData.betFor : bodyData.sid;
    bodyData.sid = bodyData.betFor ? bodyData.betFor : bodyData.sid;
    finalData.rate = 9.5;
    finalData.nat = bodyData.sid ? bodyData.sid : bodyData.betFor;
  }

  if (
    casinoType == "abj" ||
    casinoType == "baccarat" ||
    casinoType == "cmeter"
  ) {
    finalData.rate = finalData.b1;
  }




  if (bodyData.isLayBack) {
    finalData.rate =
      bodyData.layBackType == "lay"
        ? Number(finalData.l1)
        : Number(finalData.b1);
  }



  //_d(finalData, "finalData")
  
  if (casinoType == "ballbyball") {
    finalData.rate = bodyData.layBackType == "lay"
        ? Number(finalData.l)
      : Number(finalData.b);
    
    bodyData.roundId = finalData.mid;
    bodyData.mid = finalData.mid;
    bodyData.sid = finalData.sid;
    bodyData.rate = finalData.rate;
    bodyData.betFor = finalData.nat;
  }



   if (casinoType == "goal") {
    finalData.rate = bodyData.layBackType == "lay"
        ? Number(finalData.l)
      : Number(finalData.b);
    
    bodyData.roundId = roundId;
    bodyData.mid = roundId;
    bodyData.sid = finalData.sid;
    bodyData.rate = finalData.rate;
    bodyData.betFor = finalData.subtype;
  }


 // _d(bodyData , finalData)



  if (casinoType == "lucky7eu") {
    bodyData.mid = bodyData.roundId;
  }

  if (casinoType == "teen9") {
    bodyData.mid = bodyData.roundId;
    if (bodyData.betFor == "tiger") {
      bodyData.rate = finalData.trate;
      finalData.rate = finalData.trate;
      finalData.sid = finalData.tsection;
      finalData.gstatus = finalData.tstatus;
    }
    if (bodyData.betFor == "dragon") {
      bodyData.rate = finalData.drate;
      finalData.rate = finalData.drate;
      finalData.sid = finalData.dsectionid;
      finalData.gstatus = finalData.dstatus;
    }
    if (bodyData.betFor == "lion") {
      bodyData.rate = finalData.lrate;
      finalData.rate = finalData.lrate;
      finalData.sid = finalData.lsection;
      finalData.gstatus = finalData.lstatus;
    }
  }

  if (casinoType == "abj") {
    if (bodyData.betFor == "andarBahar") {
      bodyData.rate = 1.95;
      finalData.rate = 1.95;
    }

    if (bodyData.betFor == "oddEven") {
      bodyData.nat = bodyData.sid == 24 ? "odd" : "even";
      finalData.nat = bodyData.nat;
    }
  }

  bodyData.rate = Number(bodyData.rate);

  if (oddsDifference && oddsDifference != 0 && bodyData.layBackType == "back") {
    finalData.rate = finalData.rate - oddsDifference;
  }

  if (
    finalData.gstatus == "ACTIVE" ||
    finalData.gstatus == true ||
    finalData.gstatus == "True" || 
    finalData.gstatus == "OPEN" 
  ) {
    finalData.gstatus = 1;
  }

  finalData.mid = finalData.marketId ? finalData.marketId : finalData.mid;

  if (
    bodyData.roundId != finalData.mid ||
    bodyData.rate != finalData.rate ||
    finalData.gstatus != 1 ||
    finalData.rate == 0 ||
    bodyData.rate == 0 ||
    bodyData.rate < 0 ||
    finalData.rate < 0
  ) {
    return returnResponse("error", "Odds are expired please do bet again");
  }

  oddsFinalData = await finalOddsDataDeconstruct(
    oddsFinalData,
    casinoType,
    bodyData
  );


  //_d(oddsFinalData , "oddsFinalData")

  if (!oddsFinalData) {
    return returnResponse("error", "something went wrong on oddsFinalData");
  }

  if (finalData.rate == 0) {
    return returnResponse("error", "odds expire");
  }

  let returnObj = {
    sid: finalData.sid ? finalData.sid : finalData.sectionId,
    roundId: bodyData.roundId,
    nat: finalData.nation ? finalData.nation : finalData.nat,
    rate: finalData.rate,
    casinoType: casinoType,
    betKey: finalData.sid ? finalData.sid : finalData.sectionId,
    amount: bodyData.amount,
    oddsFinalData: finalData,
    betFor: bodyData.betFor ? bodyData.betFor : "",
    allOddsData: oddsFinalData,
  };

  await client.sadd(`diamondUndeclaredRoundId`, bodyData.roundId);
  return returnResponse("success", "Odds Matched", returnObj);
};

const getCasinoPosition = async (betsData, oddsData) => {
  let positionArray = {};
  let amountPos = [];

  oddsData.map((odds, oddsKey) => {
    let posAmount = 0;
    let oddsSelectionId = odds.sid ? odds.sid : odds.sectionId;
    betsData.map((bets) => {
      const type = bets.betType;
      const betAmount = parseFloat(bets.amount);
      const betSelectionId = bets.sid;
      let betOdds = parseFloat(bets.odds - 1);

      if (bets.casinoType == "Teen") {
        betOdds = bets.odds / 100;
      }

      if (type == "K" && betSelectionId == oddsSelectionId) {
        posAmount += -1 * betAmount * parseFloat(betOdds);
      }
      if (type == "K" && betSelectionId != oddsSelectionId) {
        posAmount += betAmount;
      }
      if (type == "L" && betSelectionId == oddsSelectionId) {
        posAmount += betAmount * betOdds;
      }
      if (type == "L" && betSelectionId != oddsSelectionId) {
        posAmount += -1 * betAmount;
      }
    });

    positionArray[oddsSelectionId] = posAmount.toFixed(2);
    amountPos.push(posAmount.toFixed(2));
  });

  let returnArray = { positionArray, amountPos };
  return returnArray;
};

const generateDiamondCasinoLedger = async (req, res) => {
  try {
    let insertCommPerBet = false;
    if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
      insertCommPerBet = true;
    }
    let bodyData = {};
    let showDate = _date();
    let todayDate = moment().startOf("day").valueOf();
    if (req.body.date) {
      bodyData = req.body;
      showDate = await _date(bodyData.date);
      todayDate = moment(bodyData.date).startOf("day").valueOf();
    }

    let dateWhere = await dateWhereCond(bodyData?.date);
    let where = {
      date: dateWhere,
      isDeleted: false,
      isDeclare: {
        $in: [true, 1],
      },
    };



   // _dx("kk")



    var resData = await casinoBet.aggregate([
      {
        $match: where,
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            eventId: "$eventId",
          },
          casinoName: { $first: "$casinoType" },
          eventId: { $first: "$eventId" },
          userId: { $first: "$userId" },
          date: { $first: "$date" },
          userInfo: { $first: "$userInfo" },
          createdAt: { $first: "$createdAt" },
          agentId: { $first: "$agentId" },
          superagentId: { $first: "$superagentId" },
          masterId: { $first: "$masterId" },
          subadminId: { $first: "$subadminId" },
          adminId: { $first: "$adminId" },
          superadminId: { $first: "$superadminId" },
          subownerId: { $first: "$subownerId" },
          ownerId: { $first: "$ownerId" },
          amount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isDeclare", 1] }],
                },
                `$profitLoss`,
                0,
              ],
            },
          },
          debitAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $lt: ["$profitLoss", 0] }],
                },
                `$profitLoss`,
                0,
              ],
            },
          },
        },
      },
      {
        $sort: { "_id.userId": 1, "_id.eventId": 1 },
      },
    ]);


    let allData = [];
    let clientArray = [];
    let clientIdArray = [];
    let userLedger = [];
    let eventWiseLedger = [];

    // _dx(resData);

    resData.map((data, key) => {
      let clientId = data._id.userId;
      let hasKey = clientArray.hasOwnProperty(clientId);
      if (!hasKey) {
        clientArray[clientId] = clientId;
        clientIdArray.push(clientId);
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

    let shareClientData = await ShareModel.find({
      userId: { $in: clientIdArray },
    });

    if (shareClientData.length > 0) {
      shareClientData = await convertKeyObject(shareClientData, "userId");
    }

    let clientCommTransaction = [];
    let clientCommStatement = [];
    let clientPos = [];
    let clientAllLedger = [];

    let eventWiseLedgerObject = {};
    let eventWiseLedgerArray = [];

    async function processData(resData) {
      for (const data of resData) {
        let casinoEventId = data.eventId;
        let casinoName = data.casinoName;

        let userInfo = data.userInfo;
        let userId = data.userId;
        let clientShare = {};
        let parentData = {};



       if (shareClientData[userId]) {
          clientShare = shareClientData[userId];
        } else {
          _d("share data not found for userId " + userId);
           continue;
        }

        if (clientListData[userId]) {
          clientData = clientListData[userId];
        } else {
          _d("client data not found for userId " + userId);
          continue;
        }

        if (clientData.parentData) {
          parentData = clientData.parentData;
        }
        let agentId = data.agentId;
        let superagentId = data.superagentId;
        let masterId = data.masterId;
        let subadminId = data.subadminId;
        let adminId = data.adminId;
        let superadminId = data.superadminId;

        let subownerId = data.subownerId;
        let ownerId = data.ownerId;

        let clientComm = clientShare?.clientCasinoCommission;

        let agentComm = clientShare?.agentCasinoCommission;
        let superagentComm = clientShare?.superagentCasinoCommission;
        let masterComm = clientShare?.masterCasinoCommission;
        let subadminComm = clientShare?.subadminCasinoCommission;
        let adminComm = clientShare?.adminCasinoCommission;
        let superadminComm = clientShare?.superadminCasinoCommission;
        let subownerComm = clientShare?.subownerCasinoCommission;
        let ownerComm = clientShare?.ownerCasinoCommission;

        let clientProfitLoss = data.amount;
        let clientDebitAmount = data.debitAmount;
        let clientCommAmount = 0;

        if (clientComm) {
          clientCommAmount = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            clientComm
          );
        }

        let agentCasinoShare = clientShare.agentCasinoShare;
        let agentCommAmount = 0;
        let agentCommAmtTotal = 0;
        let agentLedgerAmount = 0;
        let agentNetProfitLoss = 0;
        let agentNetProfitLossSelf = 0;

        if (agentComm) {
          agentCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            agentComm
          );
          agentCommAmount =
            (agentCommAmtTotal * (100 - agentCasinoShare)) / 100;
        }

        agentLedgerAmount =
          (clientProfitLoss * (100 - agentCasinoShare)) / 100 + agentCommAmount;

        agentNetProfitLossSelf = agentNetProfitLoss =
          agentLedgerAmount - (clientProfitLoss + clientCommAmount);

        let superagentCasinoShare = clientShare.superagentCasinoShare;
        let superagentCommAmount = 0;
        let superagentCommAmtTotal = 0;
        let superagentLedgerAmount = 0;
        let superagentNetProfitLoss = 0;
        let superagentNetProfitLossSelf = 0;

        if (superagentComm) {
          superagentCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            superagentComm
          );
          superagentCommAmount =
            (superagentCommAmtTotal * (100 - superagentCasinoShare)) / 100;
        }

        superagentLedgerAmount =
          (clientProfitLoss * (100 - superagentCasinoShare)) / 100 +
          superagentCommAmount;

        superagentNetProfitLossSelf = superagentNetProfitLoss =
          superagentLedgerAmount - agentLedgerAmount;

        let masterCasinoShare = clientShare.masterCasinoShare;
        let masterCommAmount = 0;
        let masterCommAmtTotal = 0;
        let masterLedgerAmount = 0;
        let masterNetProfitLoss = 0;
        let masterNetProfitLossSelf = 0;

        if (masterComm) {
          masterCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            masterComm
          );
          masterCommAmount =
            (masterCommAmtTotal * (100 - masterCasinoShare)) / 100;
        }

        masterLedgerAmount =
          (clientProfitLoss * (100 - masterCasinoShare)) / 100 +
          masterCommAmount;

        masterNetProfitLossSelf = masterNetProfitLoss =
          masterLedgerAmount - superagentLedgerAmount;

        let subadminCasinoShare = clientShare.subadminCasinoShare;
        let subadminCommAmount = 0;
        let subadminCommAmtTotal = 0;
        let subadminLedgerAmount = 0;
        let subadminNetProfitLoss = 0;
        let subadminNetProfitLossSelf = 0;

        if (subadminComm) {
          subadminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            subadminComm
          );
          subadminCommAmount =
            (subadminCommAmtTotal * (100 - subadminCasinoShare)) / 100;
        }

        subadminLedgerAmount =
          (clientProfitLoss * (100 - subadminCasinoShare)) / 100 +
          subadminCommAmount;

        subadminNetProfitLossSelf = subadminNetProfitLoss =
          (clientProfitLoss * (subadminCasinoShare - masterCasinoShare)) / 100 -
          (subadminCommAmount - masterCommAmount);

        subadminNetProfitLossSelf = subadminNetProfitLoss =
          subadminLedgerAmount - masterLedgerAmount;

        let adminCasinoShare = clientShare.adminCasinoShare;
        let adminCommAmount = 0;
        let adminCommAmtTotal = 0;
        let adminLedgerAmount = 0;
        let adminNetProfitLoss = 0;
        let adminNetProfitLossSelf = 0;

        if (adminComm) {
          adminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            adminComm
          );
          adminCommAmount =
            (adminCommAmtTotal * (100 - adminCasinoShare)) / 100;
        }

        adminLedgerAmount =
          (clientProfitLoss * (100 - adminCasinoShare)) / 100 + adminCommAmount;

        adminNetProfitLossSelf = adminNetProfitLoss =
          adminLedgerAmount - subadminLedgerAmount;

        let superadminCasinoShare = clientShare.superadminCasinoShare;
        let superadminCommAmount = 0;
        let superadminCommAmtTotal = 0;
        let superadminLedgerAmount = 0;
        let superadminNetProfitLoss = 0;
        let superadminNetProfitLossSelf = 0;

        if (superadminComm) {
          superadminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            superadminComm
          );
          superadminCommAmount =
            (superadminCommAmtTotal * (100 - superadminCasinoShare)) / 100;
        }

        superadminLedgerAmount =
          (clientProfitLoss * (100 - superadminCasinoShare)) / 100 +
          superadminCommAmount;

        superadminNetProfitLossSelf = superadminNetProfitLoss =
          superadminLedgerAmount - adminLedgerAmount;

        let subownerCasinoShare = clientShare.subownerCasinoShare;
        let subownerCommAmount = 0;
        let subownerCommAmtTotal = 0;
        let subownerLedgerAmount = 0;
        let subownerNetProfitLoss = 0;
        let subownerNetProfitLossSelf = 0;

        if (subownerComm) {
          subownerCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            subownerComm
          );
          subownerCommAmount =
            (subownerCommAmtTotal * (100 - subownerCasinoShare)) / 100;
        }

        subownerLedgerAmount =
          (clientProfitLoss * (100 - subownerCasinoShare)) / 100 +
          subownerCommAmount;

        subownerNetProfitLossSelf = subownerNetProfitLoss =
          subownerLedgerAmount - superadminLedgerAmount;

        let ownerCasinoShare = clientShare.ownerCasinoShare;
        let ownerCommAmount = 0;
        let ownerCommAmtTotal = 0;
        let ownerLedgerAmount = 0;
        let ownerNetProfitLoss = 0;
        let ownerNetProfitLossSelf = 0;

        if (ownerComm) {
          ownerCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            ownerComm
          );
          ownerCommAmount =
            (ownerCommAmtTotal * (100 - ownerCasinoShare)) / 100;
        }

        ownerLedgerAmount =
          (clientProfitLoss * (100 - ownerCasinoShare)) / 100 + ownerCommAmount;

        ownerNetProfitLossSelf = ownerNetProfitLoss =
          ownerLedgerAmount - subownerLedgerAmount;

        let clientPosPushData = {
          userInfo: userInfo,
          userId: userId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          isDeclare: 1,
          isCasino: 1,

          clientId: userId,
          clientOddsAmount: clientProfitLoss,
          clientOddsComm: clientCommAmount,
          clientNetAmount: clientProfitLoss + clientCommAmount,

          agentId: agentId,
          agentOddsComm: agentCommAmtTotal,
          agentLedgerAmt: -1 * agentLedgerAmount,
          agentNetProfitLoss: agentNetProfitLoss,
          agentNetProfitLossSelf: agentNetProfitLossSelf,

          superagentId: superagentId,
          superagentOddsComm: superagentCommAmtTotal,
          superagentLedgerAmt: -1 * superagentLedgerAmount,
          superagentNetProfitLoss: superagentNetProfitLoss,
          superagentNetProfitLossSelf: superagentNetProfitLossSelf,

          masterId: masterId,
          masterOddsComm: masterCommAmtTotal,
          masterLedgerAmt: -1 * masterLedgerAmount,
          masterNetProfitLoss: masterNetProfitLoss,
          masterNetProfitLossSelf: masterNetProfitLossSelf,

          subadminId: subadminId,
          subadminOddsComm: subadminCommAmtTotal,
          subadminLedgerAmt: -1 * subadminLedgerAmount,
          subadminNetProfitLoss: subadminNetProfitLoss,
          subadminNetProfitLossSelf: subadminNetProfitLossSelf,

          adminId: adminId,
          adminOddsComm: adminCommAmtTotal,
          adminLedgerAmt: -1 * adminLedgerAmount,
          adminNetProfitLoss: adminNetProfitLoss,
          adminNetProfitLossSelf: adminNetProfitLossSelf,

          superadminId: superadminId,
          superadminOddsComm: superadminCommAmtTotal,
          superadminLedgerAmt: -1 * superadminLedgerAmount,
          superadminNetProfitLoss: superadminNetProfitLoss,
          superadminNetProfitLossSelf: superadminNetProfitLossSelf,

          subownerId: subownerId,
          subownerOddsComm: subownerCommAmtTotal,
          subownerLedgerAmt: -1 * subownerLedgerAmount,
          subownerNetProfitLoss: subownerNetProfitLoss,
          subownerNetProfitLossSelf: subownerNetProfitLossSelf,

          ownerId: ownerId,
          ownerOddsComm: ownerCommAmtTotal,
          ownerLedgerAmt: 0,
          ownerNetProfitLoss: ownerNetProfitLoss,
          ownerNetProfitLossSelf: ownerNetProfitLossSelf,
          date: todayDate,

          parentData: parentData,
        };
        await clientPos.push(clientPosPushData);

        let clientLedger = {
          userId: userId,
          clientId: userId,
          agentId: agentId,
          superagentId: superagentId,
          masterId: masterId,
          adminId: adminId,
          subadminId: subadminId,
          adminId: adminId,
          superadminId: superadminId,
          subownerId: subownerId,
          ownerId: ownerId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          remark: `${data.casinoName} (${showDate})`,
          userType: "client",
          ledgerType: "diamondCasino",
          amount: clientProfitLoss + clientCommAmount,
          isDeclare: true,
          date: todayDate,
        };

        await clientAllLedger.push(clientLedger);

        if (
          process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "false"
        ) {
          let pushClientCommStatement = {
            userId: userId,
            userType: "client",
            amount: clientCommAmount,
            date: todayDate,
            eventId: data.eventId,
            marketId: data.eventId,
            isComm: 1,
            statementFor: "diamondCasinoComm",
            gameType: "diamondCasino",
            sportsType: `casino`,
            remark: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
            userRemark: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
          };
          clientCommStatement.push(pushClientCommStatement);

          let pushCommTransaction = {
            userId: userId,
            clientId: userId,
            agentId: agentId,
            superagentId: superagentId,
            masterId: masterId,
            adminId: adminId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
            userType: "client",
            amount: clientCommAmount,
            clientAmount: clientCommAmount,
            date: todayDate,
            eventId: data.eventId,
            marketId: data.eventId,
            gameType: data.casinoName,
            isComm: 1,
            forBet: 1,
            isDeclare: 1,
            overallType: "diamondCasinoComm",
            remarks: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
          };
          clientCommTransaction.push(pushCommTransaction);
        }

        let userCommObjLedger = {
          agentId: agentId,
          superagentId: superagentId,
          masterId: masterId,
          adminId: adminId,
          subadminId: subadminId,
          adminId: adminId,
          superadminId: superadminId,
          subownerId: subownerId,
          ownerId: ownerId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          remark: `${data.casinoName} (${showDate})`,
          ledgerType: "diamondCasino",
          isDeclare: true,
          date: todayDate,
          amount: 0,
        };

        let eventHasKey = eventWiseLedgerObject.hasOwnProperty(casinoEventId);
        if (!eventHasKey) {
          eventWiseLedgerObject[casinoEventId] = {};
          eventWiseLedgerArray[casinoEventId] = [];
        }

        eventWiseLedgerArray[casinoEventId].push(clientPosPushData);
      }

      let subownerLedgerArray = [];
      let superadminLedgerArray = [];
      let adminLedgerArray = [];
      let masterLedgerArray = [];
      let subadminLedgerArray = [];
      let superagentLedgerArray = [];
      let agentLedgerArray = [];
      let finalUserLedgerInsert = [];

      eventWiseLedgerArray.map(async (posData, key) => {
        let casinoEventId = key;
        let subOwnerObj = {};
        let superadminObj = {};
        let adminObj = {};
        let subadminObj = {};
        let masterObj = {};
        let superagentObj = {};
        let agentObj = {};
        for (const pos of posData) {
          let subOwnerKey = subOwnerObj.hasOwnProperty(pos.subownerId);
          if (!subOwnerKey) {
            subOwnerObj[pos.subownerId] = {
              amount: 0,
              userType: "subowner",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              userId: pos.subownerId,
              subownerId: pos.subownerId,
            };
          }
          subOwnerObj[pos.subownerId].amount += pos.subownerLedgerAmt;

          let superadminKey = superadminObj.hasOwnProperty(pos.superadminId);
          if (!superadminKey) {
            superadminObj[pos.superadminId] = {
              amount: 0,
              userType: "superadmin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              userId: pos.superadminId,
              superadminId: pos.superadminId,
              subownerId: pos.subownerId,
            };
          }
          superadminObj[pos.superadminId].amount += pos.superadminLedgerAmt
            ? pos.superadminLedgerAmt
            : 0;

          let adminKey = adminObj.hasOwnProperty(pos.adminId);
          if (!adminKey) {
            adminObj[pos.adminId] = {
              amount: 0,
              userType: "admin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              userId: pos.adminId,
            };
          }
          adminObj[pos.adminId].amount += pos.adminLedgerAmt
            ? pos.adminLedgerAmt
            : 0;

          let subadminKey = subadminObj.hasOwnProperty(pos.subadminId);
          if (!subadminKey) {
            subadminObj[pos.subadminId] = {
              amount: 0,
              userType: "subadmin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              userId: pos.subadminId,
            };
          }
          subadminObj[pos.subadminId].amount += pos.subadminLedgerAmt
            ? pos.subadminLedgerAmt
            : 0;

          let masterKey = masterObj.hasOwnProperty(pos.masterId);
          if (!masterKey) {
            masterObj[pos.masterId] = {
              amount: 0,
              userType: "master",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              userId: pos.masterId,
              masterId: pos.masterId,
            };
          }
          masterObj[pos.masterId].amount += pos.masterLedgerAmt
            ? pos.masterLedgerAmt
            : 0;

          let superagentKey = superagentObj.hasOwnProperty(pos.superagentId);
          if (!superagentKey) {
            superagentObj[pos.superagentId] = {
              amount: 0,
              userType: "superagent",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              masterId: pos.masterId,
              superagentId: pos.superagentId,
              userId: pos.superagentId,
            };
          }
          superagentObj[pos.superagentId].amount += pos.superagentLedgerAmt
            ? pos.superagentLedgerAmt
            : 0;

          let agentKey = agentObj.hasOwnProperty(pos.agentId);
          if (!agentKey) {
            agentObj[pos.agentId] = {
              amount: 0,
              userType: "agent",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              masterId: pos.masterId,
              superagentId: pos.superagentId,
              agentId: pos.agentId,
              userId: pos.agentId,
            };
          }
          agentObj[pos.agentId].amount += pos.agentLedgerAmt
            ? pos.agentLedgerAmt
            : 0;
        }

        for (const key in subOwnerObj) {
          const subownerLedger = subOwnerObj[key];
          subownerLedgerArray.push(subownerLedger);
          finalUserLedgerInsert.push(subownerLedger);
        }

        for (const key in superadminObj) {
          const superadminLedger = superadminObj[key];
          superadminLedgerArray.push(superadminLedger);
          finalUserLedgerInsert.push(superadminLedger);
        }

        for (const key in adminObj) {
          const adminLedger = adminObj[key];
          adminLedgerArray.push(adminLedger);
          finalUserLedgerInsert.push(adminLedger);
        }

        for (const key in subadminObj) {
          const subadminLedger = subadminObj[key];
          subadminLedgerArray.push(subadminLedger);
          finalUserLedgerInsert.push(subadminLedger);
        }

        for (const key in masterObj) {
          const masterLedger = masterObj[key];
          masterLedgerArray.push(masterLedger);
          finalUserLedgerInsert.push(masterLedger);
        }

        for (const key in superagentObj) {
          const superagentLedger = superagentObj[key];
          superagentLedgerArray.push(superagentLedger);
          finalUserLedgerInsert.push(superagentLedger);
        }

        for (const key in agentObj) {
          const agentLedger = agentObj[key];
          agentLedgerArray.push(agentLedger);
          finalUserLedgerInsert.push(agentLedger);
        }
      });


     

      //  await ledgerModel.deleteMany({
      //    date: dateWhere,
      //    ledgerType: "diamondCasino",
      //    isDeclare: true,
      //    userType: {
      //      $in: [
      //        "agent",
      //        "superagent",
      //        "master",
      //        "subadmin",
      //        "admin",
      //        "superadmin",
      //        "subowner",
      //        "owner",
      //        "client",
      //      ],
      //    },
      //  });

      // _dx(clientCommStatement);

      // let subownerLedgerInsert = await ledgerModel.create(subownerLedgerArray);
      // let superadminLedgerInsert = await ledgerModel.create(
      //   superadminLedgerArray
      // );
      // let adminLedgerInsert = await ledgerModel.create(adminLedgerArray);
      // let subadminLedgerInsert = await ledgerModel.create(subadminLedgerArray);
      // let masterLedgerInsert = await ledgerModel.create(masterLedgerArray);
      // let superagentLedgerInsert = await ledgerModel.create(
      //   superagentLedgerArray
      // );
      // let agentLedgerInsert = await ledgerModel.create(agentLedgerArray);

      let finalClientLedger = [];
      for (const record of clientAllLedger) {
        const filter = {
          marketId: record.marketId,
          eventId: record.eventId,
          userId: record.userId,
          userType: record.userType,
        };
        let diamondLedger = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalClientLedger.push(diamondLedger);
      }

      let finalUserLedger = [];
      for (const record of finalUserLedgerInsert) {
        const filter = {
          marketId: record.marketId,
          eventId: record.eventId,
          userId: record.userId,
          userType: record.userType,
        };
        let diamondLedger = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalUserLedger.push(diamondLedger);
      }

      //_dx(finalUserLedger , "finalUserLedger")

      let finalClientCommStatement = [];
      for (const record of clientCommStatement) {
        const filter = {
          date: dateWhere,
          isComm: 1,
          statementFor: "diamondCasinoComm",
          gameType: "diamondCasino",
          userId: record.userId,
          eventId: record.eventId,
          marketId: record.marketId,
        };
        let ClientCommStatement = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalClientCommStatement.push(ClientCommStatement);
      }

      // await profitLossPosition.deleteMany({
      //   isCasino: 1,
      //   isDeclare: true,
      //   date: dateWhere,
      // });
      // await profitLossPosition.create(clientPos);

      let finalProfitLossPosition = [];
      for (const record of clientPos) {
        const filter = {
          isCasino: 1,
          isDeclare: true,
          date: dateWhere,
          userId: record.userId,
          eventId: record.eventId,
        };
        let profitLoss = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalProfitLossPosition.push(profitLoss);
      }


      await Promise.all([
        ledgerModel.bulkWrite(finalUserLedger),
        ledgerModel.bulkWrite(finalClientLedger),
        statementModel.bulkWrite(finalClientCommStatement),
        profitLossPosition.bulkWrite(finalProfitLossPosition),
      ]);

   
      if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "false") {
        await TransactionLogModel.deleteMany({
          date: dateWhere,
          isComm: 1,
          overallType: "diamondCasinoComm",
        });
        await TransactionLogModel.create(clientCommTransaction);
      }
    }

    await processData(resData);

    return returnResponse("success", "successfully updated");
  } catch (error) {
    _d(error);
    _d("generate Diamond Casino Ledger InServices");
  }
};

const getCommAmount = async (amount, debitAmount, comm) => {
  let insertCommPerBet = false;
  if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
    insertCommPerBet = true;
  }

  if (insertCommPerBet) {
    amount = debitAmount;
  }
  let returnComm = (Math.abs(amount) * comm) / 100;

  if(!insertCommPerBet && amount>0 ){
    returnComm = 0
  }


  return returnComm;
};


let checkVirtualOdds = async (casinoApiData, bodyData, casinoData = {}) => {
  casinoApiData = casinoApiData.data;
  const casinoSettingData = casinoData.setting ? casinoData.setting : {};
  let selectionData = casinoSettingData?.selectionData
  if (!selectionData) {
    return returnResponse("error", "selectionData Not Found ! Please Insert Odds Data");
  }
  if (!bodyData.betFor) {
    return returnResponse("error", "betFor Is Required");
  }
  
  let gameType = casinoApiData.game
  let status = casinoApiData.status
  let bettingPhase = casinoApiData.bettingPhase
  let roundId = casinoApiData.roundId
  let betFor = bodyData.betFor
  let sid = bodyData.sid ? bodyData.sid  : ""


  if (!bettingPhase) {
    return returnResponse("error", "Round Closed Please Try After Next Round");
  }

  let selectionDataConverted = convertKeyObject(selectionData, "sid")
  let selectionIdData = selectionDataConverted[sid]
  if (!selectionIdData) {
    return returnResponse("error", "Invalid Selection Id");
  }


  let rate = selectionIdData ? selectionIdData.rate : 0
  let nat = selectionIdData.nat ? selectionIdData.nat : ""
  let type = selectionIdData.type ? selectionIdData.type : ""
  sid = selectionIdData.sid ? selectionIdData.sid : sid
  casinoApiData.sid = sid
  casinoApiData.nat = nat


  selectionData = selectionData.filter(item => item.type === type);


  let returnObj = {
    sid: sid,
    roundId: roundId,
    nat: nat,
    rate: rate,
    casinoType: gameType,
    betKey: sid,
    amount: bodyData.amount,
    oddsFinalData: casinoApiData,
    betFor: betFor,
    allOddsData: casinoApiData,
    selectionData : selectionData
  };

  await client.sadd(`virtualUndeclaredRoundId`, roundId);
  return returnResponse("success", "Odds Matched", returnObj);
};

const createDiammondLedgerByCricTransaction = async (date , where = {}) => {
  try {

    let todayDate = moment(date).startOf("day").valueOf();
    let showDate = await _date(date);
    let dateWhere = await dateWhereCond(date);
          
    let whereCond = {
      date: dateWhere,
      transactionType: "profitLoss",
      marketType : "diamondCasino"
    }

    whereCond = { ...whereCond, ...where }

    var resData = await crickTransactionLog.aggregate([
      {
        $match: whereCond,
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            eventId: "$eventId",
          },
          seriesId: { $first: "$seriesId" },
          gameType: { $first: "$gameType" },
          eventId: { $first: "$eventId" },
          userId: { $first: "$userId" },
          date: { $first: "$date" },
          agentId: { $first: "$agentId" },
          superagentId: { $first: "$superagentId" },
          masterId: { $first: "$masterId" },
          subadminId: { $first: "$subadminId" },
          adminId: { $first: "$adminId" },
          superadminId: { $first: "$superadminId" },
          subownerId: { $first: "$subownerId" },
          ownerId: { $first: "$ownerId" },
          clientLedgerAmount: {
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
          debitAmount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $lt: ["$amount", 0] }],
                },
                `$amount`,
                0,
              ],
            },
          },
        },
      },
      {
        $sort: { "_id.userId": 1, "_id.seriesId": 1 },
      },
    ]);



const roleMap = {
  clientArray: "userId",
  agentArray: "agentId",
  superagentArray: "superagentId",
  masterArray: "masterId",
  subadminArray: "subadminId",
  adminArray: "adminId",
  superadminArray: "superadminId",
  subownerArray: "subownerId",
  ownerArray: "ownerId",
};

const resultSets = {};

Object.keys(roleMap).forEach(key => {
  resultSets[key] = new Set();
});

resData.forEach(data => {
  Object.entries(roleMap).forEach(([arrayName, field]) => {
    const value = field === "userId"
      ? data?._id?.userId
      : data?.[field];

    if (value) {
      resultSets[arrayName].add(String(value));
    }
  });
});

const finalResult = {};
Object.keys(resultSets).forEach(key => {
  finalResult[key] = [...resultSets[key]];
});


    _dx(finalResult)


    let clientListData = await UserModel.find(
      {
        userId: { $in: clientIdArray },
      },
      { parentData: 1, userId: 1, username: 1, name: 1 }
    );

    if (clientListData.length > 0) {
      clientListData = await convertKeyObject(clientListData, "userId");
    }

    let shareClientData = await ShareModel.find({
      userId: { $in: clientIdArray },
    });

    if (shareClientData.length > 0) {
      shareClientData = await convertKeyObject(shareClientData, "userId");
    }

    let clientCommTransaction = [];
    let clientCommStatement = [];
    let clientPos = [];
    let clientAllLedger = [];

    let eventWiseLedgerObject = {};
    let eventWiseLedgerArray = [];


    // _d("dd")

    async function processData(resData) {
      for (const data of resData) {
        let casinoEventId = data?._id?.eventId;
        let casinoName = data.gameType;
        let userInfo = data.userInfo;
        let userId = data?._id?.userId;

//  _dx(data)

        let agentId = data.agentId;
        let superagentId = data.superagentId;
        let masterId = data.masterId;
        let subadminId = data.subadminId;
        let adminId = data.adminId;
        let superadminId = data.superadminId;
        let subownerId = data.subownerId;
        let ownerId = data.ownerId;

        let clientComm = clientShare?.clientCasinoCommission;

        let agentComm = clientShare?.agentCasinoCommission;
        let superagentComm = clientShare?.superagentCasinoCommission;
        let masterComm = clientShare?.masterCasinoCommission;
        let subadminComm = clientShare?.subadminCasinoCommission;
        let adminComm = clientShare?.adminCasinoCommission;
        let superadminComm = clientShare?.superadminCasinoCommission;
        let subownerComm = clientShare?.subownerCasinoCommission;
        let ownerComm = clientShare?.ownerCasinoCommission;

        let clientProfitLoss = data.amount;
        let clientDebitAmount = data.debitAmount;
        let clientCommAmount = 0;

        if (clientComm) {
          clientCommAmount = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            clientComm
          );
        }

        let agentCasinoShare = clientShare.agentCasinoShare;
        let agentCommAmount = 0;
        let agentCommAmtTotal = 0;
        let agentLedgerAmount = 0;
        let agentNetProfitLoss = 0;
        let agentNetProfitLossSelf = 0;

        if (agentComm) {
          agentCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            agentComm
          );
          agentCommAmount =
            (agentCommAmtTotal * (100 - agentCasinoShare)) / 100;
        }

        agentLedgerAmount =
          (clientProfitLoss * (100 - agentCasinoShare)) / 100 + agentCommAmount;

        agentNetProfitLossSelf = agentNetProfitLoss =
          agentLedgerAmount - (clientProfitLoss + clientCommAmount);

        let superagentCasinoShare = clientShare.superagentCasinoShare;
        let superagentCommAmount = 0;
        let superagentCommAmtTotal = 0;
        let superagentLedgerAmount = 0;
        let superagentNetProfitLoss = 0;
        let superagentNetProfitLossSelf = 0;

        if (superagentComm) {
          superagentCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            superagentComm
          );
          superagentCommAmount =
            (superagentCommAmtTotal * (100 - superagentCasinoShare)) / 100;
        }

        superagentLedgerAmount =
          (clientProfitLoss * (100 - superagentCasinoShare)) / 100 +
          superagentCommAmount;

        superagentNetProfitLossSelf = superagentNetProfitLoss =
          superagentLedgerAmount - agentLedgerAmount;

        let masterCasinoShare = clientShare.masterCasinoShare;
        let masterCommAmount = 0;
        let masterCommAmtTotal = 0;
        let masterLedgerAmount = 0;
        let masterNetProfitLoss = 0;
        let masterNetProfitLossSelf = 0;

        if (masterComm) {
          masterCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            masterComm
          );
          masterCommAmount =
            (masterCommAmtTotal * (100 - masterCasinoShare)) / 100;
        }

        masterLedgerAmount =
          (clientProfitLoss * (100 - masterCasinoShare)) / 100 +
          masterCommAmount;

        masterNetProfitLossSelf = masterNetProfitLoss =
          masterLedgerAmount - superagentLedgerAmount;

        let subadminCasinoShare = clientShare.subadminCasinoShare;
        let subadminCommAmount = 0;
        let subadminCommAmtTotal = 0;
        let subadminLedgerAmount = 0;
        let subadminNetProfitLoss = 0;
        let subadminNetProfitLossSelf = 0;

        if (subadminComm) {
          subadminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            subadminComm
          );
          subadminCommAmount =
            (subadminCommAmtTotal * (100 - subadminCasinoShare)) / 100;
        }

        subadminLedgerAmount =
          (clientProfitLoss * (100 - subadminCasinoShare)) / 100 +
          subadminCommAmount;

        subadminNetProfitLossSelf = subadminNetProfitLoss =
          (clientProfitLoss * (subadminCasinoShare - masterCasinoShare)) / 100 -
          (subadminCommAmount - masterCommAmount);

        subadminNetProfitLossSelf = subadminNetProfitLoss =
          subadminLedgerAmount - masterLedgerAmount;

        let adminCasinoShare = clientShare.adminCasinoShare;
        let adminCommAmount = 0;
        let adminCommAmtTotal = 0;
        let adminLedgerAmount = 0;
        let adminNetProfitLoss = 0;
        let adminNetProfitLossSelf = 0;

        if (adminComm) {
          adminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            adminComm
          );
          adminCommAmount =
            (adminCommAmtTotal * (100 - adminCasinoShare)) / 100;
        }

        adminLedgerAmount =
          (clientProfitLoss * (100 - adminCasinoShare)) / 100 + adminCommAmount;

        adminNetProfitLossSelf = adminNetProfitLoss =
          adminLedgerAmount - subadminLedgerAmount;

        let superadminCasinoShare = clientShare.superadminCasinoShare;
        let superadminCommAmount = 0;
        let superadminCommAmtTotal = 0;
        let superadminLedgerAmount = 0;
        let superadminNetProfitLoss = 0;
        let superadminNetProfitLossSelf = 0;

        if (superadminComm) {
          superadminCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            superadminComm
          );
          superadminCommAmount =
            (superadminCommAmtTotal * (100 - superadminCasinoShare)) / 100;
        }

        superadminLedgerAmount =
          (clientProfitLoss * (100 - superadminCasinoShare)) / 100 +
          superadminCommAmount;

        superadminNetProfitLossSelf = superadminNetProfitLoss =
          superadminLedgerAmount - adminLedgerAmount;

        let subownerCasinoShare = clientShare.subownerCasinoShare;
        let subownerCommAmount = 0;
        let subownerCommAmtTotal = 0;
        let subownerLedgerAmount = 0;
        let subownerNetProfitLoss = 0;
        let subownerNetProfitLossSelf = 0;

        if (subownerComm) {
          subownerCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            subownerComm
          );
          subownerCommAmount =
            (subownerCommAmtTotal * (100 - subownerCasinoShare)) / 100;
        }

        subownerLedgerAmount =
          (clientProfitLoss * (100 - subownerCasinoShare)) / 100 +
          subownerCommAmount;

        subownerNetProfitLossSelf = subownerNetProfitLoss =
          subownerLedgerAmount - superadminLedgerAmount;

        let ownerCasinoShare = clientShare.ownerCasinoShare;
        let ownerCommAmount = 0;
        let ownerCommAmtTotal = 0;
        let ownerLedgerAmount = 0;
        let ownerNetProfitLoss = 0;
        let ownerNetProfitLossSelf = 0;

        if (ownerComm) {
          ownerCommAmtTotal = await getCommAmount(
            clientProfitLoss,
            clientDebitAmount,
            ownerComm
          );
          ownerCommAmount =
            (ownerCommAmtTotal * (100 - ownerCasinoShare)) / 100;
        }

        ownerLedgerAmount =
          (clientProfitLoss * (100 - ownerCasinoShare)) / 100 + ownerCommAmount;

        ownerNetProfitLossSelf = ownerNetProfitLoss =
          ownerLedgerAmount - subownerLedgerAmount;

        let clientPosPushData = {
          userInfo: userInfo,
          userId: userId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          isDeclare: 1,
          isCasino: 1,

          clientId: userId,
          clientOddsAmount: clientProfitLoss,
          clientOddsComm: clientCommAmount,
          clientNetAmount: clientProfitLoss + clientCommAmount,

          agentId: agentId,
          agentOddsComm: agentCommAmtTotal,
          agentLedgerAmt: -1 * agentLedgerAmount,
          agentNetProfitLoss: agentNetProfitLoss,
          agentNetProfitLossSelf: agentNetProfitLossSelf,

          superagentId: superagentId,
          superagentOddsComm: superagentCommAmtTotal,
          superagentLedgerAmt: -1 * superagentLedgerAmount,
          superagentNetProfitLoss: superagentNetProfitLoss,
          superagentNetProfitLossSelf: superagentNetProfitLossSelf,

          masterId: masterId,
          masterOddsComm: masterCommAmtTotal,
          masterLedgerAmt: -1 * masterLedgerAmount,
          masterNetProfitLoss: masterNetProfitLoss,
          masterNetProfitLossSelf: masterNetProfitLossSelf,

          subadminId: subadminId,
          subadminOddsComm: subadminCommAmtTotal,
          subadminLedgerAmt: -1 * subadminLedgerAmount,
          subadminNetProfitLoss: subadminNetProfitLoss,
          subadminNetProfitLossSelf: subadminNetProfitLossSelf,

          adminId: adminId,
          adminOddsComm: adminCommAmtTotal,
          adminLedgerAmt: -1 * adminLedgerAmount,
          adminNetProfitLoss: adminNetProfitLoss,
          adminNetProfitLossSelf: adminNetProfitLossSelf,

          superadminId: superadminId,
          superadminOddsComm: superadminCommAmtTotal,
          superadminLedgerAmt: -1 * superadminLedgerAmount,
          superadminNetProfitLoss: superadminNetProfitLoss,
          superadminNetProfitLossSelf: superadminNetProfitLossSelf,

          subownerId: subownerId,
          subownerOddsComm: subownerCommAmtTotal,
          subownerLedgerAmt: -1 * subownerLedgerAmount,
          subownerNetProfitLoss: subownerNetProfitLoss,
          subownerNetProfitLossSelf: subownerNetProfitLossSelf,

          ownerId: ownerId,
          ownerOddsComm: ownerCommAmtTotal,
          ownerLedgerAmt: 0,
          ownerNetProfitLoss: ownerNetProfitLoss,
          ownerNetProfitLossSelf: ownerNetProfitLossSelf,
          date: todayDate,

          parentData: parentData,
        };
        await clientPos.push(clientPosPushData);

        let clientLedger = {
          userId: userId,
          clientId: userId,
          agentId: agentId,
          superagentId: superagentId,
          masterId: masterId,
          adminId: adminId,
          subadminId: subadminId,
          adminId: adminId,
          superadminId: superadminId,
          subownerId: subownerId,
          ownerId: ownerId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          remark: `${data.casinoName} (${showDate})`,
          userType: "client",
          ledgerType: "diamondCasino",
          amount: clientProfitLoss + clientCommAmount,
          isDeclare: true,
          date: todayDate,
        };

        await clientAllLedger.push(clientLedger);

        if (
          process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "false"
        ) {
          let pushClientCommStatement = {
            userId: userId,
            userType: "client",
            amount: clientCommAmount,
            date: todayDate,
            eventId: data.eventId,
            marketId: data.eventId,
            isComm: 1,
            statementFor: "diamondCasinoComm",
            gameType: "diamondCasino",
            sportsType: `casino`,
            remark: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
            userRemark: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
          };
          clientCommStatement.push(pushClientCommStatement);

          let pushCommTransaction = {
            userId: userId,
            clientId: userId,
            agentId: agentId,
            superagentId: superagentId,
            masterId: masterId,
            adminId: adminId,
            subadminId: subadminId,
            adminId: adminId,
            superadminId: superadminId,
            subownerId: subownerId,
            ownerId: ownerId,
            userType: "client",
            amount: clientCommAmount,
            clientAmount: clientCommAmount,
            date: todayDate,
            eventId: data.eventId,
            marketId: data.eventId,
            gameType: data.casinoName,
            isComm: 1,
            forBet: 1,
            isDeclare: 1,
            overallType: "diamondCasinoComm",
            remarks: `diamond casino comm credit for ${data.casinoName} (${showDate})`,
          };
          clientCommTransaction.push(pushCommTransaction);
        }

        let userCommObjLedger = {
          agentId: agentId,
          superagentId: superagentId,
          masterId: masterId,
          adminId: adminId,
          subadminId: subadminId,
          adminId: adminId,
          superadminId: superadminId,
          subownerId: subownerId,
          ownerId: ownerId,
          marketId: `${data.eventId}-${showDate}`,
          eventId: data.eventId,
          eventName: `${data.casinoName} (${showDate})`,
          remark: `${data.casinoName} (${showDate})`,
          ledgerType: "diamondCasino",
          isDeclare: true,
          date: todayDate,
          amount: 0,
        };

        let eventHasKey = eventWiseLedgerObject.hasOwnProperty(casinoEventId);
        if (!eventHasKey) {
          eventWiseLedgerObject[casinoEventId] = {};
          eventWiseLedgerArray[casinoEventId] = [];
        }

        eventWiseLedgerArray[casinoEventId].push(clientPosPushData);
      }

      let subownerLedgerArray = [];
      let superadminLedgerArray = [];
      let adminLedgerArray = [];
      let masterLedgerArray = [];
      let subadminLedgerArray = [];
      let superagentLedgerArray = [];
      let agentLedgerArray = [];
      let finalUserLedgerInsert = [];

      eventWiseLedgerArray.map(async (posData, key) => {
        let casinoEventId = key;
        let subOwnerObj = {};
        let superadminObj = {};
        let adminObj = {};
        let subadminObj = {};
        let masterObj = {};
        let superagentObj = {};
        let agentObj = {};
        for (const pos of posData) {
          let subOwnerKey = subOwnerObj.hasOwnProperty(pos.subownerId);
          if (!subOwnerKey) {
            subOwnerObj[pos.subownerId] = {
              amount: 0,
              userType: "subowner",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              userId: pos.subownerId,
              subownerId: pos.subownerId,
            };
          }
          subOwnerObj[pos.subownerId].amount += pos.subownerLedgerAmt;

          let superadminKey = superadminObj.hasOwnProperty(pos.superadminId);
          if (!superadminKey) {
            superadminObj[pos.superadminId] = {
              amount: 0,
              userType: "superadmin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              userId: pos.superadminId,
              superadminId: pos.superadminId,
              subownerId: pos.subownerId,
            };
          }
          superadminObj[pos.superadminId].amount += pos.superadminLedgerAmt
            ? pos.superadminLedgerAmt
            : 0;

          let adminKey = adminObj.hasOwnProperty(pos.adminId);
          if (!adminKey) {
            adminObj[pos.adminId] = {
              amount: 0,
              userType: "admin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              userId: pos.adminId,
            };
          }
          adminObj[pos.adminId].amount += pos.adminLedgerAmt
            ? pos.adminLedgerAmt
            : 0;

          let subadminKey = subadminObj.hasOwnProperty(pos.subadminId);
          if (!subadminKey) {
            subadminObj[pos.subadminId] = {
              amount: 0,
              userType: "subadmin",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              userId: pos.subadminId,
            };
          }
          subadminObj[pos.subadminId].amount += pos.subadminLedgerAmt
            ? pos.subadminLedgerAmt
            : 0;

          let masterKey = masterObj.hasOwnProperty(pos.masterId);
          if (!masterKey) {
            masterObj[pos.masterId] = {
              amount: 0,
              userType: "master",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              userId: pos.masterId,
              masterId: pos.masterId,
            };
          }
          masterObj[pos.masterId].amount += pos.masterLedgerAmt
            ? pos.masterLedgerAmt
            : 0;

          let superagentKey = superagentObj.hasOwnProperty(pos.superagentId);
          if (!superagentKey) {
            superagentObj[pos.superagentId] = {
              amount: 0,
              userType: "superagent",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              masterId: pos.masterId,
              superagentId: pos.superagentId,
              userId: pos.superagentId,
            };
          }
          superagentObj[pos.superagentId].amount += pos.superagentLedgerAmt
            ? pos.superagentLedgerAmt
            : 0;

          let agentKey = agentObj.hasOwnProperty(pos.agentId);
          if (!agentKey) {
            agentObj[pos.agentId] = {
              amount: 0,
              userType: "agent",
              marketId: `${pos.marketId}`,
              eventId: pos.eventId,
              eventName: pos.eventName,
              remark: `${pos.eventName}`,
              ledgerType: "diamondCasino",
              isDeclare: true,
              date: todayDate,
              ownerId: pos.ownerId,
              subownerId: pos.subownerId,
              superadminId: pos.superadminId,
              adminId: pos.adminId,
              subadminId: pos.subadminId,
              masterId: pos.masterId,
              superagentId: pos.superagentId,
              agentId: pos.agentId,
              userId: pos.agentId,
            };
          }
          agentObj[pos.agentId].amount += pos.agentLedgerAmt
            ? pos.agentLedgerAmt
            : 0;
        }

        for (const key in subOwnerObj) {
          const subownerLedger = subOwnerObj[key];
          subownerLedgerArray.push(subownerLedger);
          finalUserLedgerInsert.push(subownerLedger);
        }

        for (const key in superadminObj) {
          const superadminLedger = superadminObj[key];
          superadminLedgerArray.push(superadminLedger);
          finalUserLedgerInsert.push(superadminLedger);
        }

        for (const key in adminObj) {
          const adminLedger = adminObj[key];
          adminLedgerArray.push(adminLedger);
          finalUserLedgerInsert.push(adminLedger);
        }

        for (const key in subadminObj) {
          const subadminLedger = subadminObj[key];
          subadminLedgerArray.push(subadminLedger);
          finalUserLedgerInsert.push(subadminLedger);
        }

        for (const key in masterObj) {
          const masterLedger = masterObj[key];
          masterLedgerArray.push(masterLedger);
          finalUserLedgerInsert.push(masterLedger);
        }

        for (const key in superagentObj) {
          const superagentLedger = superagentObj[key];
          superagentLedgerArray.push(superagentLedger);
          finalUserLedgerInsert.push(superagentLedger);
        }

        for (const key in agentObj) {
          const agentLedger = agentObj[key];
          agentLedgerArray.push(agentLedger);
          finalUserLedgerInsert.push(agentLedger);
        }
      });


     

      //  await ledgerModel.deleteMany({
      //    date: dateWhere,
      //    ledgerType: "diamondCasino",
      //    isDeclare: true,
      //    userType: {
      //      $in: [
      //        "agent",
      //        "superagent",
      //        "master",
      //        "subadmin",
      //        "admin",
      //        "superadmin",
      //        "subowner",
      //        "owner",
      //        "client",
      //      ],
      //    },
      //  });

      // _dx(clientCommStatement);

      // let subownerLedgerInsert = await ledgerModel.create(subownerLedgerArray);
      // let superadminLedgerInsert = await ledgerModel.create(
      //   superadminLedgerArray
      // );
      // let adminLedgerInsert = await ledgerModel.create(adminLedgerArray);
      // let subadminLedgerInsert = await ledgerModel.create(subadminLedgerArray);
      // let masterLedgerInsert = await ledgerModel.create(masterLedgerArray);
      // let superagentLedgerInsert = await ledgerModel.create(
      //   superagentLedgerArray
      // );
      // let agentLedgerInsert = await ledgerModel.create(agentLedgerArray);

      let finalClientLedger = [];
      for (const record of clientAllLedger) {
        const filter = {
          marketId: record.marketId,
          eventId: record.eventId,
          userId: record.userId,
          userType: record.userType,
        };
        let diamondLedger = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalClientLedger.push(diamondLedger);
      }

      let finalUserLedger = [];
      for (const record of finalUserLedgerInsert) {
        const filter = {
          marketId: record.marketId,
          eventId: record.eventId,
          userId: record.userId,
          userType: record.userType,
        };
        let diamondLedger = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalUserLedger.push(diamondLedger);
      }

      //_dx(finalUserLedger , "finalUserLedger")

      let finalClientCommStatement = [];
      for (const record of clientCommStatement) {
        const filter = {
          date: dateWhere,
          isComm: 1,
          statementFor: "diamondCasinoComm",
          gameType: "diamondCasino",
          userId: record.userId,
          eventId: record.eventId,
          marketId: record.marketId,
        };
        let ClientCommStatement = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalClientCommStatement.push(ClientCommStatement);
      }

      // await profitLossPosition.deleteMany({
      //   isCasino: 1,
      //   isDeclare: true,
      //   date: dateWhere,
      // });
      // await profitLossPosition.create(clientPos);

      let finalProfitLossPosition = [];
      for (const record of clientPos) {
        const filter = {
          isCasino: 1,
          isDeclare: true,
          date: dateWhere,
          userId: record.userId,
          eventId: record.eventId,
        };
        let profitLoss = {
          updateOne: {
            filter: filter,
            update: {
              $set: record,
            },
            upsert: true,
          },
        };
        finalProfitLossPosition.push(profitLoss);
      }

      await Promise.all([
        ledgerModel.bulkWrite(finalUserLedger),
        ledgerModel.bulkWrite(finalClientLedger),
        statementModel.bulkWrite(finalClientCommStatement),
        profitLossPosition.bulkWrite(finalProfitLossPosition),
      ]);

   
      if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "false") {
        await TransactionLogModel.deleteMany({
          date: dateWhere,
          isComm: 1,
          overallType: "diamondCasinoComm",
        });
        await TransactionLogModel.create(clientCommTransaction);
      }
    }

    await processData(resData);

    return returnResponse("success", "successfully updated");
  } catch (error) {
    _d(error);
    _d("generate Diamond Casino Ledger InServices");
  }
};

const getCasinoPositionVirtual = async (betsData, selectionData) => {
  let positionArray = {};
  let amountPos = [];


  selectionData.map((odds, oddsKey) => {
    let posAmount = 0;
    let oddsSelectionId = odds.sid ? odds.sid : odds.sectionId;
    betsData.map((bets) => {
      const type = bets.betType;
      const betAmount = parseFloat(bets.amount);
      const betSelectionId = bets.sid;
      let betOdds = parseFloat(bets.odds - 1);

      if (type == "K" && betSelectionId == oddsSelectionId) {
        posAmount += -1 * betAmount * parseFloat(betOdds);
      }
      if (type == "K" && betSelectionId != oddsSelectionId) {
        posAmount += betAmount;
      }
      if (type == "L" && betSelectionId == oddsSelectionId) {
        posAmount += betAmount * betOdds;
      }
      if (type == "L" && betSelectionId != oddsSelectionId) {
        posAmount += -1 * betAmount;
      }
    });

    positionArray[oddsSelectionId] = posAmount.toFixed(2);
    amountPos.push(posAmount.toFixed(2));
  });



  let returnArray = { positionArray, amountPos };

  return returnArray;
};





module.exports = {
  getDiamondCasinoData,
  getDiamondCasinoByEventId,
  updateDiamondCasino,
  checkCasinoData,
  checkCasinoOdds,
  getCasinoPosition,
  generateDiamondCasinoLedger,
  checkVirtualOdds,
  createDiammondLedgerByCricTransaction,
  getCasinoPositionVirtual
};
