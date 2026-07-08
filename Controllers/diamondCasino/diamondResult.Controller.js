const axios = require("axios");
const {
  _dx,
  _d,
  dateWhereCond,
  convertKeyObject,
  convertObjectToArray,
  removeDuplicates,
  getClientShareArray,
  _date,
  _date_time,
  casinoShareArray,
  getSettingData,
  betfairFancyCommissionHelper
} = require("../../Helpers/CommonHelper");
const moment = require("moment");
const {
  returnResponse,
  SendResponse,
} = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { casinoFetchUrl, siteSetting } = require("../../Common/Constants");
const ShareModel = require("../../Models/User/Share.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const StatementModel = require("../../Models/Statement.model");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const ledgerModel = require("../../Models/Ledger.model");
const UserModel = require("../../Models/User/User.model");
const sportListModel = require("../../Models/sportList.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const diamondCasinoList = require("../../Models/Casino/DiamondCasinoList.model");
const crickTransactionLog = require("../../Models/crickTransaction.model");
const directUserShareModel = require("../../Models/User/directUserShareModel");
const {
  updateCoinsTbl,
  updateBulkCoinsExposureUserByMarketId,
} = require("../../Helpers/TransactionHelper");

const {
  getShareChainData
} = require("../../Helpers/UsersUtils");

const { emitToUser } =  require("../../socket.js")

const DiamondCasinoService = require("../../Services/DiamondCasino/DiamondCasino.service");
axios.defaults.timeout = 1000;
const Joi = require("joi");

const showResultConvert = async (resultData, casinoType) => {
  let returnResult = "";
  if (resultData.gtype == "teen20") {
    if (resultData.win == 1) {
      returnResult = "player A";
    } else if (resultData.win == 3) {
      returnResult = "player B";
    } else {
      returnResult = "Tie";
    }
  }

  if (resultData.gtype == "Teen") {
    if (resultData.win == 1) {
      returnResult = "player A";
    } else if (resultData.win == 2) {
      returnResult = "player B";
    }
  }

  if (resultData.gtype == "dt20" || resultData.gtype == "dt202") {
    if (resultData.win == 1) {
      returnResult = "Dragon";
    } else if (resultData.win == 2) {
      returnResult = "Tiger";
    } else if (resultData.win == 3) {
      returnResult = "Tie";
    } else {
      returnResult = "";
    }
  }


  if (
    resultData.gtype == "lucky7eu" ||
    resultData.gtype == "aaa" ||
    resultData.gtype == "card32eu"
  ) {
    returnResult = resultData.desc;
  }

  if (resultData.gtype == "worli") {
    returnResult = resultData.win;
  }

  if (resultData.gtype == "card32") {
    returnResult = resultData.win;
    if (resultData.win == 1) {
      returnResult = "Player 8";
    } else if (resultData.win == 2) {
      returnResult = "Player 9";
    } else if (resultData.win == 3) {
      returnResult = "Player 10";
    } else if (resultData.win == 4) {
      returnResult = "Player 11";
    }
  }

  if (resultData.gtype == "teen9") {
    if (resultData.sid == 11 || resultData.sid == 21 || resultData.sid == 31) {
      returnResult = `winner`;
      if (resultData.sid == 11) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 21) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 31) {
        returnResult = `${returnResult} - dragon`;
      }
    }

    if (resultData.sid == 12 || resultData.sid == 22 || resultData.sid == 32) {
      returnResult = `Pair`;
      if (resultData.sid == 12) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 22) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 32) {
        returnResult = `${returnResult} - dragon`;
      }
    }

    if (resultData.sid == 13 || resultData.sid == 23 || resultData.sid == 33) {
      returnResult = `Flush`;
      if (resultData.sid == 13) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 23) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 33) {
        returnResult = `${returnResult} - dragon`;
      }
    }
    if (resultData.sid == 14 || resultData.sid == 24 || resultData.sid == 34) {
      returnResult = `Straight`;
      if (resultData.sid == 14) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 24) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 34) {
        returnResult = `${returnResult} - dragon`;
      }
    }

    if (resultData.sid == 15 || resultData.sid == 25 || resultData.sid == 35) {
      returnResult = `Trio`;
      if (resultData.sid == 15) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 25) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 35) {
        returnResult = `${returnResult} - dragon`;
      }
    }

    if (resultData.sid == 16 || resultData.sid == 26 || resultData.sid == 36) {
      returnResult = `Straight Flush`;
      if (resultData.sid == 16) {
        returnResult = `${returnResult} - tiger`;
      }
      if (resultData.sid == 26) {
        returnResult = `${returnResult} - lion`;
      }
      if (resultData.sid == 36) {
        returnResult = `${returnResult} - dragon`;
      }
    }
  }

  if (resultData.gtype == "abj") {
    let abjResultData = resultData;
    let cards = abjResultData.cards;
    let result = abjResultData.win;
    const data = cards.split(",");
    const resultCardActual = data.slice(0, data.indexOf("1")).join(",");
    let cardArray = resultCardActual.split(",");
    let resultCount = cardArray.length;
    let oddEvenResultCard = "bahar";
    if (resultCount % 2 === 0) {
      oddEvenResultCard = "andar";
    }

    let lastCard = cardArray[resultCount - 1];

    let isSideAndar = false;
    let isSideBahar = false;
    let isFirstBetAndar = false;
    let isFirstBetBahar = false;
    let isSecondBetAndar = false;
    let isSecondBetBahar = false;

    if (resultCount == 1) {
      isSideBahar = true;
    }
    if (resultCount == 2) {
      isSideAndar = true;
    }

    if (resultCount == 3) {
      isFirstBetBahar = true;
    }
    if (resultCount == 4) {
      isFirstBetAndar = true;
    }

    if (resultCount == 5) {
      isSecondBetBahar = true;
    }
    if (resultCount == 6) {
      isSecondBetAndar = true;
    }

    let lastCardDetails = await getCardDetailsByCard(lastCard);
    lastCardDetails.andarBahar = oddEvenResultCard;
    const values = Object.values(lastCardDetails);
    returnResult = values.join("||");
  }

  if (resultData.gtype == "ballbyball") {
    returnResult = resultData.desc;
  }


  // if (resultData.ename.toUpperCase() == "GOAL") {
  //   returnResult = resultData.winnat;
  // }




  return returnResult;
};

const fetchRoundWiseResultAndSave = async (
  undeclaredRoundIdArray,
  isVankyResult = false
) => {

  const declaredRoundList = [];
  const promises = undeclaredRoundIdArray.map(async (roundId) => {
    let hitUrl = `${casinoFetchUrl.casinoResultmarketWise}${roundId}`;
    if (isVankyResult) {
      hitUrl = `${casinoFetchUrl.casinoResultmarketWiseVanky}${roundId}`;
    }
    try {
      let resultData = {}
      if (isVankyResult) {
        resultData = await axios.post(hitUrl);
      } else {
        resultData = await axios.get(hitUrl);
      }


      // _d(resultData.data , "resultData")
      if (resultData.data) {
        let marketData = {};
        if (resultData.data) {
          if (isVankyResult) {
            marketData = resultData.data.resultData;
            marketData = JSON.parse(marketData);
          } else {
            marketData = resultData.data.data;
            marketData = marketData[0] ? marketData[0] : marketData.t1;
          }
        }


        //  _d(marketData , "marketData")

        if (marketData) {
          const showResult = await showResultConvert(marketData);
          const updateObj = {
            resultDetails: marketData,
            result: marketData.win,
            isPartiallyDeclare: 1,
            showResult: showResult,
          };


          //  _d(updateObj , "updateObj")

          await casinoBetModel.updateMany(
            {
              roundId: roundId,
            },
            updateObj
          );

          await client.srem(`diamondUndeclaredRoundId`, roundId);
          declaredRoundList.push(roundId);
        }
      }
      return declaredRoundList;
    } catch (e) {
      console.log(`error in save result For casino ${roundId}`, hitUrl);
    }
  });

  try {
    await Promise.all(promises);
    let sendData = {
      declaredRoundIdArray: declaredRoundList,
    };
    if (declaredRoundList.length > 0) {
      await betsResultOfClient();
    }
    return declaredRoundList;
  } catch (error) {
    console.error("At least one promise was rejected:", error.data);
  }



};

const saveResult = async (req, res) => {
  try {
    let undeclaredRound = await casinoBetModel.aggregate([
      {
        $match: {
          isDeclare: 0,
          isPartiallyDeclare: 0,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$roundId",
          casinoType: { $addToSet: "$casinoType" },
        },
      },
      {
        $project: {
          _id: 1,
          casinoType: 1,
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ]);



    let isVankyResult = false;
    if (req && req.body && req.body.isVankyResult) {
      isVankyResult = req.body.isVankyResult;
    }

    let undeclaredRoundIdArray = [];
    undeclaredRound.map((data) => {
      undeclaredRoundIdArray.push(data._id);
    });

    // _dx(undeclaredRoundIdArray);


    if (req && req.body.declaredRoundIdArray) {
      // delete where.isDeclare
      undeclaredRoundIdArray = req.body.declaredRoundIdArray;
    }


    // _d(undeclaredRoundIdArray)

   //  _d(isVankyResult , "isVankyResult")


    let declaredRoundList = await fetchRoundWiseResultAndSave(
      undeclaredRoundIdArray,
      isVankyResult
    );

    if (res) {
      return SendResponse(
        res,
        "success",
        "result save successfully",
        declaredRoundList
      );
    }
  } catch (error) {
    _d("error", error);
  }
};

const saveResultRedis = async (req, res) => {
  try {
    let undeclaredRoundIdArray = await client.smembers(
      `diamondUndeclaredRoundId`
    );

    // _d(undeclaredRoundIdArray , "undeclaredRoundIdArray")

    let isVankyResult = casinoFetchUrl.isVankyResult;
    if (req && req.body && req.body.isVankyResult) {
      isVankyResult = req.body.isVankyResult;
    }

    let declaredRoundList = await fetchRoundWiseResultAndSave(
      undeclaredRoundIdArray,
      isVankyResult
    );

    if (res) {
      return SendResponse(
        res,
        "success",
        "result save successfully",
        declaredRoundList
      );
    }
  } catch (error) {
    _d("error", error);
  }
};

const betsResultOfClient = async (req, res) => {
  try {

    let resultExecute = await client.get(`redisBetsResultOfClient`);
    if (resultExecute) {
      if (res) {
        return SendResponse(res, "success", "result already going on ");
      } else {
        _d("result already going on ");
        return false;
      }
    }
    await client.set(`redisBetsResultOfClient`, true);

    let insertCommPerBet = false;
    if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
      insertCommPerBet = true;
    }

    let where = {
      isDeclare: 0,
      isPartiallyDeclare: 1,
      isDeleted: false,
    };

    if (req && req.body.declaredRoundIdArray) {
      delete where.isDeclare
      where.roundId = { $in: req.body.declaredRoundIdArray };
    }

    const betData = await casinoBetModel.find(where);

    if (!betData || betData.length === 0) {
      await client.del(`redisBetsResultOfClient`);
      if (res) {
        return SendResponse(res, "success", "No bets found");
      } else {
        return false;
      }
    }

    let roundIdObj = {};
    let roundIdArray = [];
    let transactionLog = [];
    let clientIdObj = {};
    let clientIdArray = [];
    let statementLog = [];
    let betsIdArray = []

    let updateProfitLossArray = [];

    let bulkWriteTransaction = [];
    let bulkWriteStatement = [];


    await Promise.all(
      betData.map(async (data) => {

        let betId = data._id
        const casinoType = data.casinoType;
        const roundId = data.roundId;

        let hasKey = roundIdObj.hasOwnProperty(roundId);
        if (!hasKey) {
          roundIdObj[roundId] = roundId;
          roundIdArray.push(roundId);
        }

        let clientHasKey = clientIdObj.hasOwnProperty(data.clientId);
        if (!clientHasKey) {
          clientIdObj[data.clientId] = data.clientId;
          clientIdArray.push(data.clientId);
        }

        let creditAmount = await selectionResult(data);

       // _d(creditAmount, "creditAmount")

        const pushTransaction = {
          betId: betId,
          userId: data.userId,
          clientId: data.clientId,
          amount: creditAmount,
          agentId: data.agentId,
          superagentId: data.superagentId,
          masterId: data.masterId,
          subadminId: data.subadminId,
          adminId: data.adminId,
          superadminId: data.superadminId,
          subownerId: data.subownerId,
          ownerId: data.ownerId,
          gameType: "diamondCasino",
          gameName: data.casinoType,
          overallType: "diamondCasino",
          userType: "client",
          casinoType: casinoType,
          isDeclare: 1,
          eventId: data.eventId,
          selectionId: data.sid,
          forBet: 1,
          marketId: roundId,
          date: data.date,
          remarks: `${casinoType} (${data.eventId}) bet  for roundId ${roundId} for ${data.playerName} `,
        };

        transactionLog.push(pushTransaction);

        let statement = {
          amount: creditAmount,
          betId: betId,
          marketId: data.roundId,
          eventId: data.eventId,
          selectionId: data.sid,
          userId: data.userId,
          userType: "client",
          statementFor: "diamondCasino",
          gameType: `diamondCasino`,
          sportsType: `casino`,
          userRemark: `Diamond CasinoBet For ${casinoType} Of (${roundId}) for player ${data.playerName}`,
          remark: `Diamond CasinoBet For ${casinoType} Of (${roundId}) for player ${data.playerName}`,
        };
        statementLog.push(statement);

        let profitLossObj = {
          updateOne: {
            filter: { _id: data._id },
            update: {
              $set: {
                profitLoss: creditAmount,
              },
            },
          },
        };
        updateProfitLossArray.push(profitLossObj);
      })
    );

    let crickTransactionArray = []
    let [shareData, directUserShareData] = await Promise.all([
      ShareModel.find({ userId: { $in: clientIdArray } }),
      directUserShareModel.find({ userId: { $in: clientIdArray } })
    ])

    if (shareData) {
      shareData = convertKeyObject(shareData, "userId");
    }

    if (directUserShareData) {
      directUserShareData = convertKeyObject(directUserShareData, "userId")
    }

    const originalLogs = [...transactionLog];

    for (let key = 0; key < originalLogs.length; key++) {
      const logData = originalLogs[key];
      let clientId = logData.userId;
      let betId = logData.betId;
      let clientShareData = [];
      let directShareData = [];
      if (shareData[clientId]) {
        clientShareData = shareData[clientId];
      }

      if (directUserShareData[clientId]) {
        directShareData = directUserShareData[clientId]?.shareData;
      }


      if (directShareData) {
        let crickInsertAmount = logData.amount ? logData.amount : 0;
        let casinoRemark = `diamondCasino - ${logData.remarks} / -(${_date()})`;

        let crickPushTransactionLog = {
          amount: crickInsertAmount,
          clientProfitLoss: crickInsertAmount,
          marketId: logData.marketId,
          eventId: `${logData.eventId}-${_date()}`,
          sportId: 1000000,
          seriesId: logData.eventId,
          gameName: "casino",
          transactionType: "profitLoss",
          gameType: logData.casinoType,
          marketType: "diamondCasino",
          selectionId: logData.selectionId,
          remarks: casinoRemark,
          userId: clientShareData.userId,
          ownerId: clientShareData.ownerId,
          subownerId: clientShareData.subownerId,
          superadminId: clientShareData.superadminId,
          adminId: clientShareData.adminId,
          subadminId: clientShareData.subadminId,
          masterId: clientShareData.masterId,
          superagentId: clientShareData.superagentId,
          agentId: clientShareData.agentId,
          clientId: clientShareData.userId,
          eventName: `${logData.casinoType}-(${_date()})`,
        };

        directShareData.map((directShare) => {
          crickPushTransactionLog[`${directShare.creatorUserType}LedgerAmount`] = directShare[`${directShare.creatorUserType}LedgerCasinoShare`] * crickInsertAmount / 100
          crickPushTransactionLog[`${directShare.creatorUserType}ProfitLoss`] = directShare[`${directShare.creatorUserType}ProfitLossrCasinoShare`] * crickInsertAmount / 100
        })


        crickTransactionArray.push(crickPushTransactionLog);

        // ✅ Commission calculation with await still works
        if (insertCommPerBet && logData.amount < 0) {
          let clientComm =
            (logData.amount * clientShareData.clientCasinoCommission) / 100;
          let agentComm =
            (logData.amount * clientShareData.agentCasinoCommission) / 100;
          let superagentComm =
            (logData.amount * clientShareData.superagentCasinoCommission) / 100;
          let masterComm =
            (logData.amount * clientShareData.masterCasinoCommission) / 100;
          let subadminComm =
            (logData.amount * clientShareData.subadminCasinoCommission) / 100;
          let adminComm =
            (logData.amount * clientShareData.adminCasinoCommission) / 100;
          let superadminComm =
            (logData.amount * clientShareData.superadminCasinoCommission) / 100;
          let subownerComm =
            (logData.amount * clientShareData.subownerCasinoCommission) / 100;
          let ownerComm =
            (logData.amount * clientShareData.ownerCasinoCommission) / 100;

          let commTransaction = {
            ...transactionLog[key],
            isComm: 1,
            betId: betId,
            amount: -1 * clientComm,
            agentAmount: -1 * agentComm,
            superagentAmount: -1 * superagentComm,
            masterAmount: -1 * masterComm,
            subadminAmount: -1 * subadminComm,
            adminAmount: -1 * adminComm,
            superadminAmount: -1 * superadminComm,
            subownerAmount: -1 * subownerComm,
            ownerAmount: -1 * ownerComm,
          };
          transactionLog.push(commTransaction);

          let statementComm = {
            amount: -1 * clientComm,
            betId: betId,
            isComm: true,
            marketId: transactionLog[key].marketId,
            eventId: transactionLog[key].eventId,
            userId: transactionLog[key].userId,
            userType: "client",
            statementFor: "diamondCasino",
            gameType: `diamondCasino`,
            sportsType: `casino`,
            userRemark: `Diamond Casino Comm for ${transactionLog[key].marketId}`,
            remark: `Diamond Casino Comm for ${transactionLog[key].marketId}`,
          };

          statementLog.push(statementComm);

          let crickInsertAmountComm = -1 * clientComm ? -1 * clientComm : 0;
          let casinoRemarkComm = `${casinoRemark} - Commission`;

          const crickPushTransactionLogComm = {
            amount: crickInsertAmountComm,
            clientProfitLoss: crickInsertAmountComm,
            marketId: logData.marketId,
            eventId: `${logData.eventId}-${_date()}`,
            sportId: 1000000,
            seriesId: logData.eventId,
            gameName: "casino",
            transactionType: "profitLoss",
            gameType: logData.casinoType,
            marketType: "diamondCasino",
            selectionId: logData.selectionId,
            remarks: casinoRemarkComm,
            isComm: 1,
            userId: clientShareData.userId,
            ownerId: clientShareData.ownerId,
            subownerId: clientShareData.subownerId,
            superadminId: clientShareData.superadminId,
            adminId: clientShareData.adminId,
            subadminId: clientShareData.subadminId,
            masterId: clientShareData.masterId,
            superagentId: clientShareData.superagentId,
            agentId: clientShareData.agentId,
            clientId: clientShareData.userId,
            eventName: `${logData.casinoType}-(${_date()})`,
          };
          directShareData.map((directShare) => {
            crickPushTransactionLogComm[`${directShare.creatorUserType}LedgerAmount`] = directShare[`${directShare.creatorUserType}LedgerCasinoComm`] * crickInsertAmount / 100
            crickPushTransactionLogComm[`${directShare.creatorUserType}ProfitLoss`] = directShare[`${directShare.creatorUserType}ProfitLossCasinoComm`] * crickInsertAmount / 100
          })
          crickTransactionArray.push(crickPushTransactionLogComm);
        }
      }
    }


    //_d(transactionLog.length)
    // let transactionLogObjBulk = {
    //     updateOne: {
    //       filter: { betId: data._id },
    //       update: {
    //         $set: pushTransaction,
    //       },
    //     },
    //   };

    //   bulkWriteTransaction.push(transactionLogObjBulk);
    //   let statementLogObjBulk = {
    //     updateOne: {
    //       filter: { betId: data._id },
    //       update: {
    //         $set: statement,
    //       },
    //     },
    //   };
    //   bulkWriteStatement.push(statementLogObjBulk);
    //   _dx(transactionLog.length)


    try {
      const deleteResults = await Promise.all([
        TransactionLogModel.deleteMany({
          marketId: { $in: roundIdArray },
          gameType: "diamondCasino",
          overallType: "diamondCasino",
        }),
        crickTransactionLog.deleteMany({
          marketId: { $in: roundIdArray },
          gameName: "casino",
          transactionType: "profitLoss",
          marketType: "diamondCasino",
        }),
        StatementModel.deleteMany({
          statementFor: "diamondCasino",
          marketId: { $in: roundIdArray },
        })
      ]);

      const insertResults = await Promise.all([
        TransactionLogModel.insertMany(transactionLog),
        crickTransactionLog.insertMany(crickTransactionArray),
        StatementModel.insertMany(statementLog),
        casinoBetModel.bulkWrite(updateProfitLossArray)
      ]);

      await casinoBetModel.updateMany(
        {
          roundId: { $in: roundIdArray },
        },
        { isDeclare: true }
      )


    } catch (error) {
      console.error("Transaction aborted:", error);
    }

    const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      clientIdArray
    );

    // if (siteSetting.IS_SOCKET) {
    //   let userArray = [];
    //   clientIdArray.map(async (userId) => {
    //     userId = userId.toString();
    //     let pushData = {
    //       userId: userId,
    //       data: {
    //         fetch: true,
    //       },
    //     };
    //     userArray.push(pushData);
    //   });
    // }

    await client.del(`redisBetsResultOfClient`);

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
  } catch (error) {
    _d("error", error);
    await client.del(`redisBetsResultOfClient`);
    if (res) {
      return SendResponse(res, "error", "Internal Server Error", error);
    }
  } finally {
    await client.del(`redisBetsResultOfClient`);
  }
};

async function selectionResult(betData) {
  // _d(betData.sid , "sid")
  //   _d(betData.result , "result")
  //   _d(betData.betType , "betType")

  let isVirtual = betData.isVirtual ? betData.isVirtual : false;
  let returnAmount = 0;
  if (!isVirtual) {
    if (
      betData.eventId == 3030 ||
      betData.eventId == 3031 ||
      betData.eventId == 3035 ||
      betData.eventId == 3056 ||
      betData.eventId == 3054 ||
      betData.eventId == 3055 ||
      betData.eventId == 3048 ||
      betData.eventId == 3034 ||
      betData.eventId == 3059 ||
      betData.eventId == 3061 ||
      betData.eventId == 3065
    ) {

      if (betData.sid == betData.result && betData.betType == "L") {
        returnAmount = betData.profit;
      } else if (betData.sid != betData.result && betData.betType == "L") {
        returnAmount = betData.loss;
      } else if (betData.sid == betData.result && betData.betType == "K") {
        returnAmount = betData.loss;
      } else if (betData.sid != betData.result && betData.betType == "K") {
        returnAmount = betData.profit;
      } else {
        returnAmount = 0;
      }
    }

    if (betData.eventId == 3030 && betData.result == 0) {
      returnAmount = (-1 * betData.amount) / 2;
    }

    if (betData.casinoType == "lucky7eu") {
      returnAmount = betData.loss;
      let marketWiseData = betData.resultDetails;
      let nat = (betData.playerName).toUpperCase();
      const desc = marketWiseData.desc;
      let splitResult = desc.split("||").map((value) => value.trim());
      splitResult = splitResult.map(item => item.toUpperCase());
      if (splitResult.includes(nat)) {
        returnAmount = betData.profit;
      }
      if (betData.sid == 1 || betData.sid == 2) {
        if (betData.result != 1 && betData.result != 2) {
          returnAmount = (-1 * betData.amount) / 2;
        }
      }
    }

    if (betData.casinoType == "aaa") {
      if (betData.sid != 1 && betData.sid != 2 && betData.sid != 3) {
        returnAmount = betData.loss;
        let marketWiseData = betData.resultDetails;
        let nat = (betData.playerName).toUpperCase();
        const desc = marketWiseData.desc;
        let splitResult = desc.split("|").map((value) => value.trim());
        splitResult = splitResult.map(item => item.toUpperCase());
        if (splitResult.includes(nat)) {
          returnAmount = betData.profit;
        }
      }
    }

    if (betData.casinoType == "card32eu" && betData.betFor != "card32eu") {
      returnAmount = betData.loss;
      let betFor = betData.betFor;
      let marketWiseData = betData.resultDetails;
      //let nat = _.capitalize(betData.playerName);
      let nat = (betData.playerName);
      nat = capitalizeEachWord(nat);
      const desc = marketWiseData.desc;
      let splitResult = desc.split("|").map((value) => value.trim());

      let anyThreeResult = splitResult[2];
      let oddEvenResult = splitResult[1];
      let totalResult = splitResult[4];
      let numberResult = splitResult[3];
      let natResult = splitResult[0];
      let profitResult = false;

      if (betFor == "anyThree") {
        let splitResultAnyThree = anyThreeResult
          .split(",")
          .map((value) => value.trim());
        splitResultAnyThree.map((resultData) => {
          let anyThreeResultArray = resultData
            .split(":")
            .map((value) => value.trim());
          if (
            anyThreeResultArray[0] == "Black" &&
            anyThreeResultArray[1] == "Yes" &&
            betData.sid == "13"
          ) {
            profitResult = true;
          }

          if (
            anyThreeResultArray[0] == "Red" &&
            anyThreeResultArray[1] == "Yes" &&
            betData.sid == "14"
          ) {
            profitResult = true;
          }
          if (
            anyThreeResultArray[0] == "2-2" &&
            anyThreeResultArray[1] == "Yes" &&
            betData.sid == "27"
          ) {
            profitResult = true;
          }
        });
      }

      if (betFor == "oddEven") {
        let oddEvenResultArray = oddEvenResult
          .split(",")
          .map((value) => value.trim());
        oddEvenResultArray.map((resultData) => {
          let deepResultArray = resultData
            .split(":")
            .map((value) => value.trim());
          if (
            deepResultArray[0] == "8" &&
            deepResultArray[1] == "Odd" &&
            betData.sid == "5"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "8" &&
            deepResultArray[1] == "Even" &&
            betData.sid == "6"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "9" &&
            deepResultArray[1] == "Odd" &&
            betData.sid == "7"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "9" &&
            deepResultArray[1] == "Even" &&
            betData.sid == "8"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "10" &&
            deepResultArray[1] == "Odd" &&
            betData.sid == "9"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "10" &&
            deepResultArray[1] == "Even" &&
            betData.sid == "10"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "11" &&
            deepResultArray[1] == "Odd" &&
            betData.sid == "11"
          ) {
            profitResult = true;
          }

          if (
            deepResultArray[0] == "11" &&
            deepResultArray[1] == "Even" &&
            betData.sid == "12"
          ) {
            profitResult = true;
          }
        });
      }

      if (betFor == "number") {
        if (betData.playerName == numberResult) {
          profitResult = true;
        }
      }

      if (betFor == "total") {
        if (betData.sid == "26" && totalResult == "10-11") {
          profitLoss = true;
        }
        if (betData.sid == "25" && totalResult == "8-9") {
          profitLoss = true;
        }
      }

      if (betFor == "card32eu") {
        if (betData.playerName == natResult) {
          profitResult = true;
        }
      }

      if (profitResult) {
        returnAmount = betData.profit;
      }
    }

    if (betData.casinoType == "abj") {
      returnAmount = betData.loss;
      let abjResultData = betData.resultDetails;
      let cards = abjResultData.cards;
      let result = abjResultData.win;
      const data = cards.split(",");
      const resultCardActual = data.slice(0, data.indexOf("1")).join(",");
      let cardArray = resultCardActual.split(",");
      let resultCount = cardArray.length;
      let oddEvenResultCard = "bahar";
      if (resultCount % 2 === 0) {
        oddEvenResultCard = "andar";
      }
      let lastCard = cardArray[resultCount - 1];

      let isSideAndar = false;
      let isSideBahar = false;
      let isFirstBetAndar = false;
      let isFirstBetBahar = false;
      let isSecondBetAndar = false;
      let isSecondBetBahar = false;

      if (resultCount == 1) {
        isSideBahar = true;
      }
      if (resultCount == 2) {
        isSideAndar = true;
      }

      if (resultCount == 3) {
        isFirstBetBahar = true;
      }
      if (resultCount == 4) {
        isFirstBetAndar = true;
      }

      if (resultCount == 5) {
        isSecondBetBahar = true;
      }
      if (resultCount == 6) {
        isSecondBetAndar = true;
      }

      let lastCardDetails = await getCardDetailsByCard(lastCard);

      if (betData.betFor == "andarBahar") {
        if (
          (betData.sid == 1 || betData.sid == 2 || betData.sid == 3) &&
          result == 2
        ) {
          returnAmount = betData.profit;
        }

        if (
          (betData.sid == 4 || betData.sid == 5 || betData.sid == 6) &&
          result == 1
        ) {
          returnAmount = betData.profit;
        }
      }

      if (betData.betFor == "oddEven" || betData.betFor == "card") {
        if (betData.playerName == lastCardDetails.oddEven) {
          returnAmount = betData.profit;
        }
      }
    }

  } else {
    let result = betData.resultDetails.result;
    let nat = (betData.playerName).toUpperCase();
    if (result.includes(nat)) {
      returnAmount = betData.profit;
    } else {
      returnAmount = (-1 * betData.amount)
    }

  }

  return returnAmount;
}

const getCardDetailsByCard = async (card) => {
  let returnArray = {};

  let splitCard = card.split("");

  let number = splitCard[0];
  returnArray.realCard = number;
  let typeOfCard = splitCard[1];
  let colorOfCard = splitCard[2];

  if (number == "J") {
    number = 11;
  }
  if (number == "Q") {
    number = 12;
  }
  if (number == "K") {
    number = 13;
  }
  if (number == "A") {
    number = 1;
  }

  returnArray.number = number;

  let showColor = "black";
  if (colorOfCard == "D" || colorOfCard == "H") {
    showColor = "red";
  }
  returnArray.color = showColor;

  let oddEven = "Joker Odd";
  if (number % 2 === 0) {
    oddEven = "Joker Even";
  }
  returnArray.oddEven = oddEven;

  return returnArray;
};

function capitalizeEachWord(str) {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const generateDiamondLedger = async (req, res) => {
  try {
    let insertCommPerBet = false;
    if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
      insertCommPerBet = true;
    }
    let bodyData = {};
    let showDate = _date();
    let todayDate = moment().startOf("day").valueOf();
    if (req && req?.body && req?.body?.date) {
      bodyData = req.body;
      showDate = await _date(bodyData?.date);
      todayDate = moment(bodyData?.date).startOf("day").valueOf();
    }

    if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
      await saveCasinoInSportsList(bodyData?.date);
      let dateWiseDiamondCasinoLedger = await DiamondCasinoService.generateDiamondCasinoLedger(req, res);
      if (res) {
        return SendResponse(
          res,
          "success",
          `${showDate} casino list generatedd successfully`
        );
      } else {
        return true
      }
    }

    let casinoList = await DiamondCasinoService.getDiamondCasinoData();

    casinoList = await convertKeyObject(casinoList.data, "eventId");

    let dateWhere = await dateWhereCond(bodyData?.date, bodyData?.date);


    let where = {
      overallType: "diamondCasino",
      date: dateWhere,
      isDeclare: {
        $in: [true, 1],
      },
    };

    var resData = await TransactionLogModel.aggregate([
      {
        $match: where,
      },
      {
        $group: {
          _id: {
            userId: "$userId",
            eventId: "$eventId",
          },
          casinoName: { $first: "$gameName" },
          eventId: { $first: "$eventId" },
          userId: { $first: "$userId" },
          date: { $first: "$date" },
          createdAt: { $first: "$createdAt" },
          agentId: { $first: "$agentId" },
          ownerId: { $first: "$ownerId" },
          subownerId: { $first: "$subownerId" },
          superadminId: { $first: "$superadminId" },
          adminId: { $first: "$adminId" },
          subadminId: { $first: "$subadminId" },
          masterId: { $first: "$masterId" },
          superagentId: { $first: "$superagentId" },
          agentId: { $first: "$agentId" },
          amount: {
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
                  $and: [{ $eq: ["$isComm", 0] }, { $lt: ["$amount", 0] }],
                },
                `$amount`,
                0,
              ],
            },
          },
          clientComm: {
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
          agentComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$agentAmount`,
                0,
              ],
            },
          },
          superagentComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$superagentAmount`,
                0,
              ],
            },
          },
          masterComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$masterAmount`,
                0,
              ],
            },
          },
          subadminComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$subadminAmount`,
                0,
              ],
            },
          },
          adminComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$adminAmount`,
                0,
              ],
            },
          },
          superadminComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$superadminAmount`,
                0,
              ],
            },
          },
          subownerComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$subownerAmount`,
                0,
              ],
            },
          },
          ownerComm: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$isComm", 1] }],
                },
                `$ownerAmount`,
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
    resData.map((data, key) => {
      let clientId = data._id.userId;
      let hasKey = clientArray.hasOwnProperty(clientId);
      if (!hasKey) {
        clientArray[clientId] = clientId;
        clientIdArray.push(clientId);
      }
    });


    let [clientListData, shareClientData] = await Promise.all([
      UserModel.find(
        { userId: { $in: clientIdArray } },
        { parentData: 1, userId: 1, username: 1, name: 1 }
      ),
      ShareModel.find({
        userId: { $in: clientIdArray },
      }),
    ]);


    if (shareClientData.length > 0) {
      shareClientData = await convertKeyObject(shareClientData, "userId");
    }

    if (clientListData.length > 0) {
      clientListData = await convertKeyObject(clientListData, "userId");
    }

    let clientCommTransaction = [];
    let clientCommStatement = [];
    let clientPosArray = [];

    resData.map((data, key) => {
      let agentId = data.agentId;
      let superagentId = data.superagentId;
      let masterId = data.masterId;
      let subadminId = data.subadminId;
      let adminId = data.adminId;
      let superadminId = data.superadminId;
      let subownerId = data.subownerId;
      let ownerId = data.ownerId;
      let clientId = data.userId;
      let userId = data.userId;

      let clientShare = {};
      let clientData = {};
      let parentData = {};

      if (shareClientData[userId]) {
        clientShare = shareClientData[userId];
      }

      if (clientListData[userId]) {
        clientData = clientListData[userId];
      }

      if (clientData.parentData) {
        parentData = clientData.parentData;
      }

      const clientComm = clientShare?.clientCasinoCommission;
      const agentComm = clientShare?.agentCasinoCommission;
      const superagentComm = clientShare?.superagentCasinoCommission;
      const masterComm = clientShare?.masterCasinoCommission;
      const subadminComm = clientShare?.subadminCasinoCommission;
      const adminComm = clientShare?.adminCasinoCommission;
      const superadminComm = clientShare?.superadminCasinoCommission;
      const subownerComm = clientShare?.subownerCasinoCommission;
      const ownerComm = clientShare?.ownerCasinoCommission;

      let clientProfitLoss = data.amount;

      let clientCommAmt = data.clientComm ? data.clientComm : 0;
      let agentCommAmt = 0;
      let superagentCommAmt = 0;
      let masterCommAmt = 0;
      let subadminCommAmt = 0;
      let adminCommAmt = 0;
      let superadminCommAmt = 0;
      let subownerCommAmt = 0;

      let agentCommAmtTotal = 0;
      let superagentCommAmtTotal = 0;
      let masterCommAmtTotal = 0;
      let subadminCommAmtTotal = 0;
      let adminCommAmtTotal = 0;
      let superadminCommAmtTotal = 0;
      let subownerCommAmtTotal = 0;

      let agentLedgerAmt = 0;
      let superagentLedgerAmt = 0;
      let masterLedgerAmt = 0;
      let subadminLedgerAmt = 0;
      let adminLedgerAmt = 0;
      let superadminLedgerAmt = 0;
      let subownerLedgerAmt = 0;

      let agentNetProfitLoss = 0;
      let superagentNetProfitLoss = 0;
      let masterNetProfitLoss = 0;
      let subadminNetProfitLoss = 0;
      let adminNetProfitLoss = 0;
      let superadminNetProfitLoss = 0;
      let subownerNetProfitLoss = 0;
      let ownerNetProfitLoss = 0;

      if (clientProfitLoss < 0 && insertCommPerBet == false) {
        let userClientProfitLoss = -1 * clientProfitLoss;

        clientCommAmt = (userClientProfitLoss * clientComm) / 100;

        agentCommAmtTotal = (userClientProfitLoss * agentComm) / 100;
        agentCommAmt =
          (((100 - clientShare.agentCasinoShare) / 100) *
            (userClientProfitLoss * agentComm)) /
          100;

        superagentCommAmtTotal = (userClientProfitLoss * superagentComm) / 100;
        superagentCommAmt =
          (((100 - clientShare.superagentCasinoShare) / 100) *
            (userClientProfitLoss * superagentComm)) /
          100;

        masterCommAmtTotal = (userClientProfitLoss * masterComm) / 100;
        masterCommAmt =
          (((100 - clientShare.masterCasinoShare) / 100) *
            (userClientProfitLoss * masterComm)) /
          100;

        subadminCommAmtTotal = (userClientProfitLoss * subadminComm) / 100;
        subadminCommAmt =
          (((100 - clientShare.subadminCasinoShare) / 100) *
            (userClientProfitLoss * subadminComm)) /
          100;

        adminCommAmtTotal = (userClientProfitLoss * adminComm) / 100;
        adminCommAmt =
          (((100 - clientShare.adminCasinoShare) / 100) *
            (userClientProfitLoss * adminComm)) /
          100;

        superadminCommAmtTotal = (userClientProfitLoss * superadminComm) / 100;
        superadminCommAmt =
          (((100 - clientShare.superadminCasinoShare) / 100) *
            (userClientProfitLoss * superadminComm)) /
          100;

        subownerCommAmtTotal = (userClientProfitLoss * subownerComm) / 100;
        subownerCommAmt =
          (((100 - clientShare.subownerCasinoShare) / 100) *
            (userClientProfitLoss * subownerComm)) /
          100;



        let pushCommTransaction = {
          userId: userId,
          clientId: clientId,
          agentId: agentId,
          superagentId: superagentId,
          masterId: masterId,
          adminId: adminId,
          subadminId: subadminId,
          adminId: data.adminId,
          superadminId: superadminId,
          subownerId: subownerId,
          ownerId: ownerId,
          userType: "client",
          amount: clientCommAmt,
          clientAmount: clientCommAmt,
          agentAmount: agentCommAmt,
          superagentAmount: superagentCommAmt,
          masterAmount: masterCommAmt,
          subadminAmount: subadminCommAmt,
          adminAmount: adminCommAmt,
          superadminAmount: superadminCommAmt,
          subownerAmount: subownerCommAmt,
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


        if (clientCommAmt > 0) {
          let pushCommStatement = {
            userId: userId,
            userType: "client",
            amount: clientCommAmt,
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
          clientCommStatement.push(pushCommStatement);
        }
      }

      if (insertCommPerBet == true) {
        agentCommAmtTotal = data.agentComm ? data.agentComm : 0;
        superagentCommAmtTotal = data.superagentComm ? data.superagentComm : 0;
        masterCommAmtTotal = data.masterComm ? data.masterComm : 0;
        subadminCommAmtTotal = data.subadminComm ? data.subadminComm : 0;
        adminCommAmtTotal = data.adminComm ? data.adminComm : 0;
        superadminCommAmtTotal = data.superadminComm ? data.superadminComm : 0;
        subownerCommAmtTotal = data.subownerComm ? data.subownerComm : 0;

        agentCommAmt =
          ((100 - clientShare.agentCasinoShare) / 100) * data.agentComm;

        superagentCommAmt =
          ((100 - clientShare.superagentCasinoShare) / 100) *
          data.superagentComm;
        masterCommAmt =
          ((100 - clientShare.masterCasinoShare) / 100) * data.masterComm;

        subadminCommAmt =
          ((100 - clientShare.subadminCasinoShare) / 100) * data.subadminComm;
        adminCommAmt =
          ((100 - clientShare.adminCasinoShare) / 100) * data.adminComm;
        superadminCommAmt =
          ((100 - clientShare.superadminCasinoShare) / 100) *
          data.superadminComm;
        subownerCommAmt =
          ((100 - clientShare.subownerCasinoShare) / 100) * data.subownerComm;
      }

      agentLedgerAmt =
        (clientProfitLoss * (100 - clientShare.agentCasinoShare)) / 100 -
        agentCommAmt;

      superagentLedgerAmt =
        (clientProfitLoss * (100 - clientShare.superagentCasinoShare)) / 100 -
        superagentCommAmt;

      masterLedgerAmt =
        (clientProfitLoss * (100 - clientShare.masterCasinoShare)) / 100 -
        masterCommAmt;

      subadminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.subadminCasinoShare)) / 100 -
        subadminCommAmt;

      adminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.adminCasinoShare)) / 100 -
        adminCommAmt;

      superadminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.superadminCasinoShare)) / 100 -
        superadminCommAmt;

      subownerLedgerAmt =
        (clientProfitLoss * (100 - clientShare.subownerCasinoShare)) / 100 -
        subownerCommAmt;

      let agentProfitLossShare = clientShare.agentCasinoShare;

      let superagentProfitLossShare =
        clientShare.superagentCasinoShare - clientShare.agentCasinoShare;

      let masterProfitLossShare =
        clientShare.masterCasinoShare - clientShare.superagentCasinoShare;

      let subadminProfitLossShare =
        clientShare.subadminCasinoShare - clientShare.masterCasinoShare;

      let adminProfitLossShare =
        clientShare.adminCasinoShare - clientShare.subadminCasinoShare;

      let superadminProfitLossShare =
        clientShare.superadminCasinoShare - clientShare.adminCasinoShare;

      let subownerProfitLossShare =
        clientShare.subownerCasinoShare - clientShare.superadminCasinoShare;

      let ownerProfitLossShare =
        clientShare.ownerCasinoShare - clientShare.subownerCasinoShare;

      let agentNetProfitLossSelf =
        (-1 * (clientProfitLoss * agentProfitLossShare)) / 100 +
        ((100 - clientShare.agentCasinoShare) / 100) * clientCommAmt;

      agentNetProfitLoss =
        (clientProfitLoss * agentProfitLossShare) / 100 -
        (agentCommAmt - clientCommAmt);

      agentNetProfitLoss = -1 * agentNetProfitLoss;

      let superagentNetProfitLossSelf =
        (-1 * (clientProfitLoss * superagentProfitLossShare)) / 100 +
        ((100 - clientShare.superagentCasinoShare) / 100) * clientCommAmt;

      superagentNetProfitLoss =
        (clientProfitLoss * superagentProfitLossShare) / 100 -
        (superagentCommAmt - agentCommAmt);

      superagentNetProfitLoss = -1 * superagentNetProfitLoss;

      let masterNetProfitLossSelf =
        (-1 * (clientProfitLoss * masterProfitLossShare)) / 100 +
        ((100 - clientShare.masterCasinoShare) / 100) * clientCommAmt;

      masterNetProfitLoss =
        (clientProfitLoss * masterProfitLossShare) / 100 -
        (masterCommAmt - superagentCommAmt);

      masterNetProfitLoss = -1 * masterNetProfitLoss;

      let subadminNetProfitLossSelf =
        (-1 * (clientProfitLoss * subadminProfitLossShare)) / 100 +
        ((100 - clientShare.subadminCasinoShare) / 100) * clientCommAmt;

      subadminNetProfitLoss =
        (clientProfitLoss * subadminProfitLossShare) / 100 -
        (subadminCommAmt - masterCommAmt);

      subadminNetProfitLoss = -1 * subadminNetProfitLoss;

      let adminNetProfitLossSelf =
        (-1 * (clientProfitLoss * adminProfitLossShare)) / 100 +
        ((100 - clientShare.adminCasinoShare) / 100) * clientCommAmt;

      adminNetProfitLoss =
        (clientProfitLoss * adminProfitLossShare) / 100 -
        (adminCommAmt - subadminCommAmt);

      adminNetProfitLoss = -1 * adminNetProfitLoss;

      let superadminNetProfitLossSelf =
        (-1 * (clientProfitLoss * superadminProfitLossShare)) / 100 +
        ((100 - clientShare.superadminCasinoShare) / 100) * clientCommAmt;

      superadminNetProfitLoss =
        (clientProfitLoss * superadminProfitLossShare) / 100 -
        (superadminCommAmt - adminCommAmt);

      superadminNetProfitLoss = -1 * superadminNetProfitLoss;

      let subownerNetProfitLossSelf =
        (-1 * (clientProfitLoss * subownerProfitLossShare)) / 100 +
        ((100 - clientShare.subownerCasinoShare) / 100) * clientCommAmt;

      subownerNetProfitLoss =
        (clientProfitLoss * subownerProfitLossShare) / 100 -
        (subownerCommAmt - superadminCommAmt);

      subownerNetProfitLoss = -1 * subownerNetProfitLoss;

      ownerNetProfitLoss =
        (-1 * (clientProfitLoss * ownerProfitLossShare)) / 100 +
        ((100 - clientShare.ownerCasinoShare) / 100) * clientCommAmt;

      let ownerNetProfitLossSelf = ownerNetProfitLoss;

      let userInfo = {
        username: clientData.username,
        name: clientData.name,
      };

      let clientPosPushData = {
        positionType: "diamondCasino",
        userInfo: userInfo,
        userId: clientId,
        clientId: clientId,
        agentId: agentId,
        superagentId: superagentId,
        masterId: masterId,
        adminId: adminId,
        subadminId: subadminId,
        adminId: data.adminId,
        superadminId: superadminId,
        subownerId: subownerId,
        ownerId: ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `${data.casinoName} (${showDate})`,
        isDeclare: 1,
        isCasino: 1,
        clientOddsAmount: clientProfitLoss,
        clientOddsComm: clientCommAmt,
        clientNetAmount: clientProfitLoss + clientCommAmt,
        parentData: parentData,
        agentOddsComm: agentCommAmtTotal,
        superagentOddsComm: superagentCommAmtTotal,
        masterOddsComm: masterCommAmtTotal,
        subadminOddsComm: subadminCommAmtTotal,
        adminOddsComm: adminCommAmtTotal,
        superadminOddsComm: superadminCommAmtTotal,
        subownerOddsComm: subownerCommAmtTotal,

        agentLedgerAmt: agentLedgerAmt,
        superagentLedgerAmt: superagentLedgerAmt,
        masterLedgerAmt: masterLedgerAmt,
        subadminLedgerAmt: subadminLedgerAmt,
        adminLedgerAmt: adminLedgerAmt,
        superadminLedgerAmt: superadminLedgerAmt,
        subownerLedgerAmt: subownerLedgerAmt,
        ownerLedgerAmt: 0,

        agentNetProfitLoss: -1 * agentNetProfitLoss,
        superagentNetProfitLoss: -1 * superagentNetProfitLoss,
        masterNetProfitLoss: -1 * masterNetProfitLoss,
        subadminNetProfitLoss: -1 * subadminNetProfitLoss,
        adminNetProfitLoss: -1 * adminNetProfitLoss,
        superadminNetProfitLoss: -1 * superadminNetProfitLoss,
        subownerNetProfitLoss: -1 * subownerNetProfitLoss,
        ownerNetProfitLoss: -1 * ownerNetProfitLoss,

        agentNetProfitLossSelf: -1 * agentNetProfitLossSelf,
        superagentNetProfitLossSelf: -1 * superagentNetProfitLossSelf,
        masterNetProfitLossSelf: -1 * masterNetProfitLossSelf,
        subadminNetProfitLossSelf: -1 * subadminNetProfitLossSelf,
        adminNetProfitLossSelf: -1 * adminNetProfitLossSelf,
        superadminNetProfitLossSelf: -1 * superadminNetProfitLossSelf,
        subownerNetProfitLossSelf: -1 * subownerNetProfitLossSelf,
        ownerNetProfitLossSelf: -1 * ownerNetProfitLossSelf,
        date: todayDate,
      };


      //_d(clientPosPushData , "clientPosPushData")
      clientPosArray.push(clientPosPushData);

      let casinoData = casinoList[data.eventId];
      if (casinoData) {
        data.casinoName = casinoData.name;
      }

      let clientLedger = {
        userId: clientId,
        clientId: clientId,
        agentId: agentId,
        superagentId: superagentId,
        masterId: masterId,
        adminId: adminId,
        subadminId: subadminId,
        adminId: data.adminId,
        superadminId: superadminId,
        subownerId: subownerId,
        ownerId: ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `${data.casinoName} (${showDate})`,
        remark: `${data.casinoName} (${showDate})`,
        userType: "client",
        ledgerType: "diamondCasino",
        amount: clientProfitLoss + clientCommAmt,
        isDeclare: true,
        date: todayDate,
      };

      allData.push(clientLedger);
    });



    //  _dx(clientPosArray , "clientPosArray")


    await Promise.all([
      profitLossPosition.deleteMany({
        isCasino: 1,
        isDeclare: true,
        date: dateWhere,
      }),
      ledgerModel.deleteMany({
        date: dateWhere,
        ledgerType: "diamondCasino",
        isDeclare: true,
      }),
      TransactionLogModel.deleteMany({
        date: dateWhere,
        isComm: 1,
        overallType: "diamondCasinoComm",
      }),
      StatementModel.deleteMany({
        date: dateWhere,
        isComm: 1,
        statementFor: "diamondCasinoComm",
        gameType: "diamondCasino",
      }),
    ])





    await Promise.all([
      profitLossPosition.create(clientPosArray),
      ledgerModel.create(allData),
      TransactionLogModel.create(clientCommTransaction),
      StatementModel.create(clientCommStatement),
    ])




    await Promise.all([
      updateBulkCoinsExposureUserByMarketId(clientIdArray),
      generateUserDiamondLedger(showDate, bodyData),
    ])


    if (res) {
      return SendResponse(
        res,
        "success",
        `generate diamond Casino Ledger Successfully For Date ${showDate}`
      );
    } else {
      return true
    }
  } catch (error) {
    console.log(error);
  }
};


const generateUserDiamondLedger = async (showDate, bodyData) => {
  let findUserIdArray = [];
  let insertLedger = [];
  let keyUserIdArray = {};

  let dateWhere = await dateWhereCond(bodyData?.date, bodyData?.date);

  let todayDate = moment().startOf("day").valueOf();

  if (bodyData.date) {
    todayDate = moment(bodyData.date).startOf("day").valueOf();
  }

  let casinoList = await DiamondCasinoService.getDiamondCasinoData();
  casinoList = await convertKeyObject(casinoList.data, "eventId");

  let whereCond = {
    date: dateWhere,
    overallType: { $in: ["diamondCasino", "diamondCasinoComm"] },
    isDeclare: {
      $in: [true, 1],
    },
  };

  var agentRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$agentId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        superagentId: { $first: "$superagentId" },
        agentId: { $first: "$agentId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$agentAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  if (agentRes) {
    agentRes.map((data, key) => {
      let agentId = data._id.userId;

      let userKey = keyUserIdArray.hasOwnProperty(agentId);
      if (!userKey) {
        keyUserIdArray[agentId] = agentId;
        findUserIdArray.push(agentId);
      }
    });
  }

  let agentCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (agentCasinoShareData.length > 0) {
    agentCasinoShareData = await convertKeyObject(agentCasinoShareData, "_id");
    agentRes.map(async (data, key) => {
      let agentId = data._id.userId;

      let casinoEventId = data.eventId;
      let casinoName = data.casinoName;

      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }

      let agentCasinoShare = 0;
      const agentShareDataArray = agentCasinoShareData[agentId];
      if (agentShareDataArray && agentShareDataArray.userCasinoShare) {
        agentCasinoShare = agentShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - agentCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.agentId,
        agentId: data.agentId,
        superagentId: data.superagentId,
        masterId: data.masterId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "agent",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var superagentRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$superagentId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        superagentId: { $first: "$superagentId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$superagentAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (superagentRes) {
    superagentRes.map((data, key) => {
      let superagentId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(superagentId);
      if (!userKey) {
        keyUserIdArray[superagentId] = superagentId;
        findUserIdArray.push(superagentId);
      }
    });
  }

  let superagentCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (superagentCasinoShareData.length > 0) {
    superagentCasinoShareData = await convertKeyObject(
      superagentCasinoShareData,
      "_id"
    );
    superagentRes.map(async (data, key) => {
      let superagentId = data._id.userId;
      let casinoEventId = data.eventId;
      let casinoName = data.casinoName;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let superagentCasinoShare = 0;
      const superagentShareDataArray = superagentCasinoShareData[superagentId];
      if (
        superagentShareDataArray &&
        superagentShareDataArray.userCasinoShare
      ) {
        superagentCasinoShare = superagentShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - superagentCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.superagentId,
        superagentId: data.superagentId,
        masterId: data.masterId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "superagent",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var masterRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$masterId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$masterAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (masterRes) {
    masterRes.map((data, key) => {
      let masterId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(masterId);
      if (!userKey) {
        keyUserIdArray[masterId] = masterId;
        findUserIdArray.push(masterId);
      }
    });
  }

  let masterCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (masterCasinoShareData.length > 0) {
    masterCasinoShareData = await convertKeyObject(
      masterCasinoShareData,
      "_id"
    );
    masterRes.map(async (data, key) => {
      let masterId = data._id.userId;
      let casinoEventId = data.eventId;
      let casinoName = data.casinoName;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let masterCasinoShare = 0;
      const masterShareDataArray = masterCasinoShareData[masterId];
      if (masterShareDataArray && masterShareDataArray.userCasinoShare) {
        masterCasinoShare = masterShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - masterCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.masterId,
        masterId: data.masterId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "master",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var subadminRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$subadminId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$subadminAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (subadminRes) {
    subadminRes.map((data, key) => {
      let subadminId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(subadminId);
      if (!userKey) {
        keyUserIdArray[subadminId] = subadminId;
        findUserIdArray.push(subadminId);
      }
    });
  }

  let subadminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (subadminCasinoShareData.length > 0) {
    subadminCasinoShareData = await convertKeyObject(
      subadminCasinoShareData,
      "_id"
    );
    subadminRes.map(async (data, key) => {
      let subadminId = data._id.userId;
      let casinoName = data.casinoName;
      let casinoEventId = data.eventId;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let subadminCasinoShare = 0;
      const subadminShareDataArray = subadminCasinoShareData[subadminId];
      if (subadminShareDataArray && subadminShareDataArray.userCasinoShare) {
        subadminCasinoShare = subadminShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - subadminCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.subadminId,
        subadminId: data.subadminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "subadmin",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var adminRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$adminId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$adminAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (adminRes) {
    adminRes.map((data, key) => {
      let adminId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(adminId);
      if (!userKey) {
        keyUserIdArray[adminId] = adminId;
        findUserIdArray.push(adminId);
      }
    });
  }

  let adminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (adminCasinoShareData.length > 0) {
    adminCasinoShareData = await convertKeyObject(adminCasinoShareData, "_id");
    adminRes.map(async (data, key) => {
      let adminId = data._id.userId;
      let casinoName = data.casinoName;
      let casinoEventId = data.eventId;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let adminCasinoShare = 0;
      const adminShareDataArray = adminCasinoShareData[adminId];
      if (adminShareDataArray && adminShareDataArray.userCasinoShare) {
        adminCasinoShare = adminShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - adminCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.adminId,
        adminId: data.adminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "admin",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var superadminRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$superadminId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$superadminAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (superadminRes) {
    superadminRes.map((data, key) => {
      let superadminId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(superadminId);
      if (!userKey) {
        keyUserIdArray[superadminId] = superadminId;
        findUserIdArray.push(superadminId);
      }
    });
  }

  let superadminCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (superadminCasinoShareData.length > 0) {
    superadminCasinoShareData = await convertKeyObject(
      superadminCasinoShareData,
      "_id"
    );
    superadminRes.map(async (data, key) => {
      let superadminId = data._id.userId;
      let casinoName = data.casinoName;
      let casinoEventId = data.eventId;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let superadminCasinoShare = 0;
      const superadminShareDataArray = superadminCasinoShareData[superadminId];
      if (
        superadminShareDataArray &&
        superadminShareDataArray.userCasinoShare
      ) {
        superadminCasinoShare = superadminShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - superadminCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.superadminId,
        superadminId: data.superadminId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "superadmin",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var subowneres = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$subownerId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$subownerAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (subowneres) {
    subowneres.map((data, key) => {
      let subownerId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(subownerId);
      if (!userKey) {
        keyUserIdArray[subownerId] = subownerId;
        findUserIdArray.push(subownerId);
      }
    });
  }

  let subownerCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (subownerCasinoShareData.length > 0) {
    subownerCasinoShareData = await convertKeyObject(
      subownerCasinoShareData,
      "_id"
    );
    subowneres.map(async (data, key) => {
      let subownerId = data._id.userId;
      let casinoName = data.casinoName;
      let casinoEventId = data.eventId;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let subownerCasinoShare = 0;
      const subownerShareDataArray = subownerCasinoShareData[subownerId];
      if (subownerShareDataArray && subownerShareDataArray.userCasinoShare) {
        subownerCasinoShare = subownerShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - subownerCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.subownerId,
        subownerId: data.subownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "subowner",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  var ownerRes = await TransactionLogModel.aggregate([
    {
      $match: whereCond,
    },
    {
      $group: {
        _id: {
          userId: "$ownerId",
          eventId: "$eventId",
        },
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        ownerId: { $first: "$ownerId" },
        amount: {
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
        comm: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isComm", 1] }],
              },
              `$ownerAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);

  findUserIdArray = [];
  if (ownerRes) {
    ownerRes.map((data, key) => {
      let ownerId = data._id.userId;
      let userKey = keyUserIdArray.hasOwnProperty(ownerId);
      if (!userKey) {
        keyUserIdArray[ownerId] = ownerId;
        findUserIdArray.push(ownerId);
      }
    });
  }

  let ownerCasinoShareData = await UserModel.find(
    {
      userId: {
        $in: findUserIdArray,
      },
    },
    {
      userCasinoShare: 1,
      userCasinoCommission: 1,
      userType: 1,
    }
  );

  if (ownerCasinoShareData.length > 0) {
    ownerCasinoShareData = await convertKeyObject(ownerCasinoShareData, "_id");
    ownerRes.map(async (data, key) => {
      let ownerId = data._id.userId;
      let casinoName = data.casinoName;
      let casinoEventId = data.eventId;
      let casinoData = casinoList[casinoEventId];
      if (casinoData) {
        casinoName = casinoData.name;
      }
      let ownerCasinoShare = 0;
      const ownerShareDataArray = ownerCasinoShareData[ownerId];
      if (ownerShareDataArray && ownerShareDataArray.userCasinoShare) {
        ownerCasinoShare = ownerShareDataArray.userCasinoShare;
      }

      let userAmount = data.amount;
      let userCommAmount = data.comm;

      let shareAmount =
        ((100 - ownerCasinoShare) * userAmount) / 100 + userCommAmount;

      let Ledger = {
        userId: data.ownerId,
        ownerId: data.ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        remark: `Diamond Casino Ledger For (${casinoName} - ${showDate})`,
        date: todayDate,
        userType: "owner",
        ledgerType: "diamondCasino",
        amount: -1 * shareAmount,
        isDeclare: true,
      };
      insertLedger.push(Ledger);
    });
  }

  const deleteCount = await ledgerModel.deleteMany({
    date: dateWhere,
    ledgerType: "diamondCasino",
    isDeclare: true,
    userType: {
      $in: [
        "agent",
        "superagent",
        "master",
        "subadmin",
        "admin",
        "superadmin",
        "subowner",
        "owner",
      ],
    },
  });

  await ledgerModel.create(insertLedger);
  return true;
};

const deleteDiamondCasinoBets = async (req, res) => {
  const bodyData = req.body;
  const userData = req.loggedInUser;
  const JoiSchema = Joi.object({
    _id: Joi.array().required(),
    password: Joi.string().required(),
    isDeleted: Joi.boolean().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  if (userData.userType != "owner") {
    return SendResponse(res, "error", "Only owner authorised to update bets");
  }
  if (bodyData.password != process.env.BETS_DELETE_PASSWORD) {
    return SendResponse(
      res,
      "error",
      "bets delete password is wrong please try again later"
    );
  }

  let deletedStatus = false;
  if (bodyData.isDeleted) {
    deletedStatus = bodyData.isDeleted;
  }


  //_dx(deletedStatus , "deletedStatus")
  const response = await deleteBets(bodyData._id, deletedStatus);


  return SendResponse(res, response.status, response.message, response.data);
};


const deleteBets = async (betsIdArray, deletedStatus) => {
  let uniqueClientData = [];
  let finalClientArray = [];
  let clientData = [];
  let ResponseMapper = "";
  let deletedRemark = "Due To Not Declaration Bets Has Been Deleted";

  let betsData = await casinoBetModel.find(
    {
      _id: {
        $in: betsIdArray,
      },
    },
    {
      clientId: 1,
      casinoType: 1,
      eventId: 1,
      roundId: 1,
    }
  );

  if (!betsData) {
    return returnResponse(res, "error", "no bets found");
  }

  betsData.map(async (data) => {
    let pushData = {
      userId: data.clientId,
    };
    clientData.push(pushData);

    let deleteWhere = {
      userType: "client",
      marketId: data.roundId + "",
      eventId: data.eventId + "",
      userId: data.clientId,
      overallType: "diamondCasino",
    };

    await TransactionLogModel.deleteMany(deleteWhere);

    let statementWhere = {
      userType: "client",
      gameType: "diamondCasino",
      sportsType: "casino",
      statementFor: "diamondCasino",
      marketId: data.marketId,
      eventId: data.eventId,
    };

    await StatementModel.deleteMany(statementWhere);
  });

  let updateBetsObj = {
    isDeleted: deletedStatus,
    deletedRemark: deletedRemark,
  };

  if (deletedStatus == false) {
    updateBetsObj.deletedRemark = "rollback by admin";
    updateBetsObj.isDeclare = 0;
  }

  await casinoBetModel.updateMany(
    {
      _id: {
        $in: betsIdArray,
      },
    },
    {
      $set: updateBetsObj,
    }
  );

  clientData.map((data) => {
    let hasKey = finalClientArray.hasOwnProperty(data.userId);
    if (!hasKey) {
      finalClientArray[data.userId] = data;
      uniqueClientData.push(data.userId);
    }
  });

  ResponseMapper = await updateBulkCoinsExposureUserByMarketId(
    uniqueClientData
  );
  return returnResponse("success", "bets updated successfully", ResponseMapper);
};


const generateClientProfitLoss = async (req, res) => {
  let bodyData = {};
  let showDate = _date();
  let todayDate = moment().startOf("day").valueOf();
  if (req.body.date) {
    bodyData = req.body;
    showDate = await _date(bodyData.date);
    todayDate = moment(bodyData.date).startOf("day").valueOf();
  }
  let dateWhere = await dateWhereCond(bodyData?.date, bodyData?.date);
  let casinoType = "internationalCasino";
  if (bodyData.casinoType) {
    casinoType = bodyData.casinoType;
  }
  let where = {
    overallType: "internationalCasino",
    date: dateWhere,
    isDeclare: {
      $in: [true, 1],
    },
    forBet: 1,
  };

  let _idGroupBy = {
    userId: "$userId",
    marketId: "$eventId",
  };

  if (casinoType == "diamondCasino") {
    where.overallType = "diamondCasino";
    where.eventId = bodyData.eventId;
    idGroupBy = {
      userId: "$userId",
      eventId: "$eventId",
    };
  } else {
    where.marketId = bodyData.eventId;
  }

  if (bodyData.userId) {
    where.userId = new ObjectId(bodyData.userId);
  }


  var resData = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: _idGroupBy,
        casinoName: { $first: "$gameName" },
        eventId: { $first: "$eventId" },
        marketId: { $first: "$marketId" },
        userId: { $first: "$userId" },
        date: { $first: "$date" },
        createdAt: { $first: "$createdAt" },
        agentId: { $first: "$agentId" },
        ownerId: { $first: "$ownerId" },
        subownerId: { $first: "$subownerId" },
        superadminId: { $first: "$superadminId" },
        adminId: { $first: "$adminId" },
        subadminId: { $first: "$subadminId" },
        masterId: { $first: "$masterId" },
        superagentId: { $first: "$superagentId" },
        agentId: { $first: "$agentId" },
        amount: { $sum: "$amount" },
      },
    },
    {
      $sort: { "_id.userId": 1, "_id.eventId": 1 },
    },
  ]);

  // _dx(resData);
};

const saveCasinoInSportsList = async (date, status = "COMPLETED") => {
  let todayDate = moment(date).startOf("day").valueOf();
  let showDate = _date(date);
  let dateWhere = await dateWhereCond(date, date);
  let casinoList = await DiamondCasinoService.getDiamondCasinoData();
  casinoList = casinoList.data;
  casinoList = JSON.parse(JSON.stringify(casinoList));

  casinoList.map(async (casino) => {
    if (casino.cashinoStatus) {
      let sportList = await sportListModel.findOne({
        sportType: "diamondCasino",
        date: dateWhere,
        eventId: casino.eventId,
        sportId: 100000,
      });

      if (!sportList) {
        let insertList = {
          seriesId: casino.eventId,
          eventId: casino.eventId,
          marketId: `${casino.eventId}-${showDate}`,
          matchName: `${casino.name} - (${showDate})`,
          sportName: `${casino.name} - (${showDate})`,
          priority: casino.eventId,
          sportType: "diamondCasino",
          status: status ? status : "COMPLETED",
          sportId: 100000,
          matchDate: showDate,
          isDeclare: 1,
          date: todayDate,
        };

        await sportListModel.create(insertList);
      }
    }
  });

  return true;
};

const generateDiamondCasinoListByDate = async (req, res) => {
  try {
    const bodyData = req.body;
    if (!bodyData.date) {
      return SendResponse(res, "error", "date is required");
    }
    let date = bodyData.date;
    await saveCasinoInSportsList(bodyData?.date);

    return SendResponse(
      res,
      "success",
      `${date} casino list generated successfully`
    );
  } catch (error) {
    _d(error, "error in generateDiamondCasinoListByDate ");
  }
};

const generateProfitLossPosByUserIdAndRoundId = async (roundIdArray) => {
  try {
    _dx(roundIdArray);

    let where = {};
  } catch (error) {
    console.log(error);
  }
};


const doManaualResult = async (req, res) => {
  try {
    const bodyData = req.body;
    let eventId = bodyData.eventId
    let roundId = bodyData.roundId
    let win = bodyData.win
    let betFor = bodyData.betFor

    let sendData = {
      gtype: "",
      win: win
    }

    let casinoData = await diamondCasinoList.findOne({
      eventId: eventId
    })

    if (!casinoData) {
      return SendResponse(
        res,
        "error",
        `casino eventId Not Found`
      );
    }

    sendData.gtype = casinoData.shortName

    if (casinoData.shortName == "lucky7eu") {
      sendData.desc = `${win}`
    }

    let resultData = await showResultConvert(sendData)

    let updateWhere = {
      eventId: eventId,
      roundId: roundId,
      isDeleted: { $in: [0, false] },
      betFor: betFor
    }

    let updateResult = {
      result: win,
      showResult: resultData,
      isPartiallyDeclare: 1,
      isDeclare: 0,
    }

    if (casinoData.shortName == "worli") {
      delete updateWhere.betFor
    }

    if (casinoData.shortName == "lucky7eu") {
      if (!updateResult.resultDetails) {
        updateResult.resultDetails = {};
      }
      updateResult.resultDetails.desc = `${win}`
    }



    // _d(updateResult , "updateResult")

    let updateBetsData = await casinoBetModel.updateMany(updateWhere, updateResult)

    return SendResponse(
      res,
      "success",
      `result updated successfully`,
      updateBetsData
    );
  } catch (error) {
    _d(error, "error in generateDiamondCasinoListByDate ");
  }
}


const sendCasinoResultjson = async (req, res) => {
  try {
    let returnData = {
      "teen20": {
        "odds": {
          1: "player A",
          2: "Tie",
          3: "player B",
        },
      },
      "Teen": {
        "odds": {
          1: "player A",
          2: "player B",
        }
      },
      "dt20": {
        "odds": {
          1: "Dragon",
          2: "Tiger",
          3: "Tie",
        }
      },
      "dt202": {
        "odds": {
          1: "Dragon",
          2: "Tiger",
          3: "Tie",
        }
      },
      "lucky7eu": {
        "lowHigh": {
          1: "LOW Card",
          2: "HIGH Card",
          3: "Tie",
        },
        "color": {
          "Red": "Red",
          "Black": "Black",
        },
        "oddEven": {
          "Odd": "Odd",
          "Even": "Even",
        },
        "cards": {
          "Card A": "Card A",
          "Card 2": "Card 2",
          "Card 3": "Card 3",
          "Card 4": "Card 4",
          "Card 5": "Card 5",
          "Card 6": "Card 6",
          "Card 7": "Card 7",
          "Card 8": "Card 8",
          "Card 9": "Card 9",
          "Card 10": "Card 10",
          "Card J": "Card J",
          "Card K": "Card K",
          "Card Q": "Card Q",
        },
      },
      "worli": {
        "worli": {
          1: 1,
          2: 2,
          3: 3,
          4: 4,
          5: 5,
          6: 6,
          7: 7,
          8: 8,
          9: 9,
          0: 0,
        },
      },
    }

    return SendResponse(
      res,
      "success",
      `send data`,
      returnData
    );
  } catch (error) {
    _d(error, "error in sendCasinoResultjson ");
  }
}

const saveAvaitorResults = async (req, res) => {
  try {
    let bodyData = {}
    if (req && req.body) {
      bodyData = req.body;
    }

    let undeclareAvaitorRoundId =
      req?.body?.roundIdArray?.length > 0
        ? req.body.roundIdArray
        : await client.smembers("avaitorRoundId");




    if (bodyData.isDatabase) {
      let undeclaredRound = await casinoBetModel.aggregate([
        {
          $match: {
            isDeclare: 0,
            isPartiallyDeclare: 0,
            isDeleted: false,
            eventId: 303031
          },
        },
        {
          $group: {
            _id: "$roundId",
          },
        },
        {
          $project: {
            _id: 1,
            casinoType: 1,
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);
      let undeclaredRoundIdArray = [];
      undeclaredRound.map((data) => {
        undeclareAvaitorRoundId.push(data._id);
      });
    }


    //_d(undeclareAvaitorRoundId)



    if (!undeclareAvaitorRoundId?.length) {
      return res ? SendResponse(res, "success", "No undeclared round IDs") : [];
    }

    const hitUrl = process.env.AVAITOR_RESULT_URL;
    if (!hitUrl) {
      return res ? SendResponse(res, "error", "Cache URL not found") : [];
    }

    /* ---------------- FETCH RESULTS IN PARALLEL ---------------- */
    const apiResults = await Promise.allSettled(
      undeclareAvaitorRoundId.map((roundId) =>
        axios.post(hitUrl, { roundId })
      )
    );

    const roundResultsMap = {};
    const successRoundIds = [];

    for (let i = 0; i < apiResults.length; i++) {
      const resObj = apiResults[i];
      if (resObj.status === "fulfilled" && resObj.value?.data?.data?.data) {
        const data = resObj.value.data.data.data;
        roundResultsMap[data.roundId] = data;
        successRoundIds.push(data.roundId);
      }
    }
    if (!successRoundIds.length) {
      return res ? SendResponse(res, "success", "No valid results received") : [];
    }

    /* ---------------- FETCH BET DATA ---------------- */
    const roundBetData = await casinoBetModel.find(
      {
        roundId: { $in: successRoundIds },
      },
      {
        clientId: 1,
        amount: 1,
        roundId: 1,
        eventId: 1,
        userId: 1,
        agentId: 1,
        masterId: 1,
        superagentId: 1,
        subadminId: 1,
        adminId: 1,
        ownerId: 1,
        superadminId: 1,
      }
    );

    const bulkUpdates = [];
    const transactionLogs = [];
    const redisCleanupSet = new Set();

    for (const bet of roundBetData) {
      const resultData = roundResultsMap[bet.roundId];
      if (!resultData || resultData.gameStatus !== "close") continue;

      const lossAmount = -Math.abs(bet.amount);


      const directShareData = await getShareChainData(bet.clientId);

      const transaction = {
        amount: lossAmount,
        clientProfitLoss: lossAmount,
        marketId: bet.roundId,
        eventId: bet.eventId,
        sportId: 1000000,
        seriesId: bet.eventId,
        gameName: "casino",
        gameType: "avaitor",
        marketType: "diamondCasino",
        selectionId: bet.roundId,
        remarks: `Avaitor-Vig-(${_date()})`,
        userId: bet.clientId,
        ownerId: bet.ownerId,
        subownerId: bet.subownerId,
        superadminId: bet.superadminId,
        adminId: bet.adminId,
        subadminId: bet.subadminId,
        masterId: bet.masterId,
        superagentId: bet.superagentId,
        agentId: bet.agentId,
      };

      if (directShareData) {
        for (const share of directShareData) {
          transaction[`${share.creatorUserType}LedgerAmount`] =
            (share[`${share.creatorUserType}LedgerCasinoShare`] * lossAmount) / 100;
          transaction[`${share.creatorUserType}ProfitLoss`] =
            (share[`${share.creatorUserType}ProfitLossrCasinoShare`] * lossAmount) / 100;
        }
      }

      transactionLogs.push(transaction);

      bulkUpdates.push({
        updateMany: {
          filter: { roundId: bet.roundId, isDeclare: 0 },
          update: {
            $set: {
              isDeclare: 1,
              isPartiallyDeclare: 1,
              profit: 0,
              result: String(resultData.curentMultiplier),
              showResult: String(resultData.curentMultiplier),
            },
          },
        },
      });
      redisCleanupSet.add(bet.roundId);
    }


    /* ---------------- EXECUTE DB OPS IN PARALLEL ---------------- */
    await Promise.allSettled([
      transactionLogs.length && crickTransactionLog.insertMany(transactionLogs),
      bulkUpdates.length && casinoBetModel.bulkWrite(bulkUpdates, { ordered: false }),
      client.srem("avaitorRoundId", ...Array.from(redisCleanupSet)),
    ]);

    return res
      ? SendResponse(res, "success", "Result saved successfully")
      : successRoundIds;

  } catch (error) {
    _d("❌ saveAvaitorResults error:", error);
    if (res) return SendResponse(res, "error", "Internal server error");
    throw error;
  }
};



// const saveAvaitorResults = async (req, res) => {
//   try {
//     let bodyData = req?.body || {};

//     let undeclareAvaitorRoundId =
//       bodyData?.roundIdArray?.length > 0
//         ? bodyData.roundIdArray
//         : await client.smembers("avaitorRoundId");

//     /* ---------------- DATABASE FALLBACK ---------------- */
//     if (bodyData.isDatabase) {
//       let undeclaredRound = await casinoBetModel.aggregate([
//         {
//           $match: {
//             isDeclare: 0,
//             isPartiallyDeclare: 0,
//             isDeleted: false,
//             eventId: 303031,
//           },
//         },
//         { $group: { _id: "$roundId" } },
//         { $sort: { _id: 1 } },
//       ]);

//       undeclaredRound.forEach((data) => {
//         undeclareAvaitorRoundId.push(data._id);
//       });
//     }

//     if (!undeclareAvaitorRoundId?.length) {
//       return res
//         ? SendResponse(res, "success", "No undeclared round IDs")
//         : [];
//     }

//     const hitUrl = process.env.AVAITOR_RESULT_URL;
//     if (!hitUrl) {
//       return res
//         ? SendResponse(res, "error", "Cache URL not found")
//         : [];
//     }

//     /* ---------------- CHUNK FUNCTION ---------------- */
//     const chunkArray = (arr, size) => {
//       const result = [];
//       for (let i = 0; i < arr.length; i += size) {
//         result.push(arr.slice(i, i + size));
//       }
//       return result;
//     };

//     const chunks = chunkArray(undeclareAvaitorRoundId, 20);

//     const roundResultsMap = {};
//     const successRoundIds = [];

//     /* ---------------- FETCH RESULTS (CHUNKED) ---------------- */
//     for (const chunk of chunks) {
//       const apiResults = await Promise.allSettled(
//         chunk.map((roundId) => axios.post(hitUrl, { roundId }))
//       );

//       for (let i = 0; i < apiResults.length; i++) {
//         const resObj = apiResults[i];

//         if (resObj.status === "fulfilled" && resObj.value?.data?.data?.data) {
//           const data = resObj.value.data.data.data;
//           roundResultsMap[data.roundId] = data;
//           successRoundIds.push(data.roundId);
//         }
//       }

//       // optional small delay (prevents rate limit / spikes)
//       // await new Promise((r) => setTimeout(r, 100));
//     }

//     if (!successRoundIds.length) {
//       return res
//         ? SendResponse(res, "success", "No valid results received")
//         : [];
//     }

//     /* ---------------- FETCH BET DATA ---------------- */
//     const roundBetData = await casinoBetModel.find(
//       {
//         roundId: { $in: successRoundIds },
//         isDeclare: 0,
//       },
//       {
//         clientId: 1,
//         amount: 1,
//         roundId: 1,
//         eventId: 1,
//         userId: 1,
//         agentId: 1,
//         masterId: 1,
//         superagentId: 1,
//         subadminId: 1,
//         adminId: 1,
//         ownerId: 1,
//       }
//     );

//     const bulkUpdates = [];
//     const transactionLogs = [];
//     const redisCleanupSet = new Set();

//     /* ---------------- PROCESS BETS ---------------- */
//     for (const bet of roundBetData) {
//       const resultData = roundResultsMap[bet.roundId];
//       if (!resultData || resultData.gameStatus !== "close") continue;

//       const lossAmount = -Math.abs(bet.amount);
//       const directShareData = await getShareChainData(bet.clientId);

//       const transaction = {
//         amount: lossAmount,
//         clientProfitLoss: lossAmount,
//         marketId: bet.roundId,
//         eventId: bet.eventId,
//         sportId: 1000000,
//         seriesId: bet.eventId,
//         gameName: "casino",
//         gameType: "avaitor",
//         marketType: "diamondCasino",
//         selectionId: bet.roundId,
//         remarks: `Avaitor-Vig-(${_date()})`,
//         userId: bet.clientId,
//         ownerId: bet.ownerId,
//         subownerId: bet.subownerId,
//         superadminId: bet.superadminId,
//         adminId: bet.adminId,
//         subadminId: bet.subadminId,
//         masterId: bet.masterId,
//         superagentId: bet.superagentId,
//         agentId: bet.agentId,
//       };

//       if (directShareData) {
//         for (const share of directShareData) {
//           transaction[`${share.creatorUserType}LedgerAmount`] =
//             (share[`${share.creatorUserType}LedgerCasinoShare`] *
//               lossAmount) /
//             100;

//           transaction[`${share.creatorUserType}ProfitLoss`] =
//             (share[`${share.creatorUserType}ProfitLossrCasinoShare`] *
//               lossAmount) /
//             100;
//         }
//       }

//       transactionLogs.push(transaction);

//       bulkUpdates.push({
//         updateMany: {
//           filter: { roundId: bet.roundId, isDeclare: 0 },
//           update: {
//             $set: {
//               isDeclare: 1,
//               isPartiallyDeclare: 1,
//               profit: 0,
//               result: String(resultData.curentMultiplier),
//               showResult: String(resultData.curentMultiplier),
//             },
//           },
//         },
//       });

//       redisCleanupSet.add(bet.roundId);
//     }

//     /* ---------------- EXECUTE DB OPS ---------------- */
//     await Promise.allSettled([
//       transactionLogs.length &&
//         crickTransactionLog.insertMany(transactionLogs),
//       bulkUpdates.length &&
//         casinoBetModel.bulkWrite(bulkUpdates, { ordered: false }),
//       redisCleanupSet.size &&
//         client.srem("avaitorRoundId", ...Array.from(redisCleanupSet)),
//     ]);

//     return res
//       ? SendResponse(res, "success", "Result saved successfully")
//       : successRoundIds;
//   } catch (error) {
//     _d("❌ saveAvaitorResults error:", error);
//     if (res) return SendResponse(res, "error", "Internal server error");
//     throw error;
//   }
// };



// const saveAvaitorResults = async (req, res) => {
//   try {
//     let bodyData = req?.body || {};

//     let undeclareAvaitorRoundId =
//       bodyData?.roundIdArray?.length > 0
//         ? bodyData.roundIdArray
//         : await client.smembers("avaitorRoundId");

//     /* -------- DATABASE FALLBACK -------- */
//     if (bodyData.isDatabase) {
//       const undeclaredRound = await casinoBetModel.aggregate([
//         {
//           $match: {
//             isDeclare: 0,
//             isPartiallyDeclare: 0,
//             isDeleted: false,
//             eventId: 303031,
//           },
//         },
//         { $group: { _id: "$roundId" } },
//       ]);


//       //_d(undeclaredRound , "undeclaredRound")

//       undeclaredRound.forEach((d) =>
//         undeclareAvaitorRoundId.push(d._id)
//       );
//     }

//     if (!undeclareAvaitorRoundId?.length) {
//       return res
//         ? SendResponse(res, "success", "No undeclared round IDs")
//         : [];
//     }

//     const hitUrl = process.env.AVAITOR_RESULT_URL;
//     if (!hitUrl) {
//       return res
//         ? SendResponse(res, "error", "Cache URL not found")
//         : [];
//     }

//     /* -------- CHUNK HELPER -------- */
//     const chunkSize = 20;

//     const successRoundIds = [];

//     /* -------- PROCESS IN CHUNKS -------- */
//     for (let i = 0; i < undeclareAvaitorRoundId.length; i += chunkSize) {
//       const chunk = undeclareAvaitorRoundId.slice(i, i + chunkSize);

//       /* ---- STEP 1: FETCH API ---- */
//       const apiResults = await Promise.allSettled(
//         chunk.map((roundId) => axios.post(hitUrl, { roundId }))
//       );

//       const roundResultsMap = {};
//       const validRoundIds = [];

//       for (const resObj of apiResults) {
//         if (resObj.status === "fulfilled" && resObj.value?.data?.data?.data) {
//           const data = resObj.value.data.data.data;

//           if (data.gameStatus === "close") {
//             roundResultsMap[data.roundId] = data;
//             validRoundIds.push(data.roundId);
//           }
//         }
//       }

//       if (!validRoundIds.length) continue;

//       successRoundIds.push(...validRoundIds);

//       /* ---- STEP 2: FETCH BETS (ONLY FOR THIS CHUNK) ---- */
//       const roundBetData = await casinoBetModel.find(
//         {
//           roundId: { $in: validRoundIds },
//           isDeclare: 0,
//         },
//         {
//           clientId: 1,
//           amount: 1,
//           roundId: 1,
//           eventId: 1,
//           agentId: 1,
//           masterId: 1,
//           superagentId: 1,
//           subadminId: 1,
//           adminId: 1,
//           ownerId: 1,
//         }
//       );

//       const bulkUpdates = [];
//       const transactionLogs = [];
//       const redisCleanup = new Set();

//       /* ---- STEP 3: PROCESS BETS ---- */
//       for (const bet of roundBetData) {
//         const resultData = roundResultsMap[bet.roundId];
//         if (!resultData) continue;

//         const lossAmount = -Math.abs(bet.amount);

//         const directShareData = await getShareChainData(bet.clientId);

//         const transaction = {
//           amount: lossAmount,
//           clientProfitLoss: lossAmount,
//           marketId: bet.roundId,
//           eventId: bet.eventId,
//           sportId: 1000000,
//           seriesId: bet.eventId,
//           gameName: "casino",
//           gameType: "avaitor",
//           marketType: "diamondCasino",
//           selectionId: bet.roundId,
//           remarks: `Avaitor-Vig-(${_date()})`,
//           userId: bet.clientId,
//           ownerId: bet.ownerId,
//           subownerId: bet.subownerId,
//           superadminId: bet.superadminId,
//           adminId: bet.adminId,
//           subadminId: bet.subadminId,
//           masterId: bet.masterId,
//           superagentId: bet.superagentId,
//           agentId: bet.agentId,
//         };

//         if (directShareData) {
//           for (const share of directShareData) {
//             transaction[`${share.creatorUserType}LedgerAmount`] =
//               (share[`${share.creatorUserType}LedgerCasinoShare`] *
//                 lossAmount) /
//               100;

//             transaction[`${share.creatorUserType}ProfitLoss`] =
//               (share[`${share.creatorUserType}ProfitLossrCasinoShare`] *
//                 lossAmount) /
//               100;
//           }
//         }

//         transactionLogs.push(transaction);

//         bulkUpdates.push({
//           updateMany: {
//             filter: { roundId: bet.roundId, isDeclare: 0 },
//             update: {
//               $set: {
//                 isDeclare: 1,
//                 isPartiallyDeclare: 1,
//                 profit: 0,
//                 result: String(resultData.curentMultiplier),
//                 showResult: String(resultData.curentMultiplier),
//               },
//             },
//           },
//         });

//         redisCleanup.add(bet.roundId);
//       }

//       /* ---- STEP 4: EXECUTE PER-CHUNK DB OPS ---- */
//       await Promise.allSettled([
//         transactionLogs.length &&
//           crickTransactionLog.insertMany(transactionLogs),
//         bulkUpdates.length &&
//           casinoBetModel.bulkWrite(bulkUpdates, { ordered: false }),
//         redisCleanup.size &&
//           client.srem("avaitorRoundId", ...Array.from(redisCleanup)),
//       ]);


//       console.log("doneee" , i)

//       /* ---- OPTIONAL THROTTLE ---- */
//       // await new Promise(r => setTimeout(r, 100));
//     }

//     return res
//       ? SendResponse(res, "success", "Chunk processing completed")
//       : successRoundIds;

//   } catch (error) {
//     _d("❌ saveAvaitorResults error:", error);
//     if (res) return SendResponse(res, "error", "Internal server error");
//     throw error;
//   }
// };
const saveCasinoLedgerByDateByCrickTransaction = async (req, res) => {
  try {

    let date = moment().format("YYYY-MM-DD")
    if (req?.body?.date) {
      date = req?.body?.date;
    }

    let returnData = await DiamondCasinoService.createDiammondLedgerByCricTransaction(date);

    return res
      ? SendResponse(res, "success", `Ledger Declare Successfully For Date ${date}`)
      : true;

  } catch (error) {
    _d(error, "error in generateDiamondCasinoListByDate ");
  }
};


// const saveResultRedisVirtual = async (req, res) => {
//   try {
//     const undeclaredRoundIdArray = await client.smembers(
//       `virtualUndeclaredRoundId`
//     );

//     if (!undeclaredRoundIdArray || undeclaredRoundIdArray.length === 0) {
//       return SendResponse(
//         res,
//         "success",
//         "No undeclared roundIds found"
//       );
//     }

//     const resultUrl = casinoFetchUrl.virtualCasinoResult;

//     const promises = undeclaredRoundIdArray.map(async (roundId) => {
//       try {
//         const resultData = await axios.post(resultUrl, { roundId: roundId });
//         if (!resultData?.data?.data) {
//           throw new Error(`Invalid response for roundId: ${roundId}`);
//         }

//         const result = resultData.data.data;
//         if (result.result) {
//           await saveVirtualCasinoResult(
//             roundId,
//             result
//           );
//           return { roundId, status: "fulfilled" };
//         }
//         return { roundId, status: "partiallyResulted" };
//       } catch (err) {
//         _d(`Error in roundId ${roundId}`, err.message);
//         return { roundId, status: "rejected", error: err.message };
//       }
//     });
//     const results = await Promise.allSettled(promises);
//     const success = results.filter(r => r.status === "fulfilled").length;
//     const failed = results.filter(r => r.status === "rejected").length;
//     // _d(`Total: ${results.length}, Success: ${success}, Failed: ${failed}`);


//     return res ? SendResponse(
//       res,
//       "success",
//       "Result processing completed",
//       {
//         total: results.length,
//         success,
//         failed
//       }
//     ) : null;

//   } catch (error) {
//     _d("Outer Error:", error);
//     return res ? SendResponse(
//       res,
//       "error",
//       "Something went wrong",
//       error.message
//     ) : null;
//   }
// };



const saveVirtualCasinoResult = async (roundId, result) => {
  try {
    let gameType = result.game ? result.game : ""
    let resultData = result.result ? result.result : ""

    // _d(resultData , "resultData")

    if (resultData) {
      let showResult = ""
      resultData = resultData.split("_");
      showResult = resultData[0]
      let resultDetails = {
        roundId: roundId,
        result: resultData,
        showResult: showResult,
      }
      const updateObj = {
        resultDetails: resultDetails,
        result: showResult,
        isPartiallyDeclare: 1,
        showResult: showResult,
      };
      //  _d(updateObj , "updateObj")
      await casinoBetModel.updateMany(
        {
          roundId: roundId,
        },
        updateObj
      );
      await client.srem(`virtualUndeclaredRoundId`, roundId);
    }
  } catch (err) {
    console.log(err, "Error in saveVirtualCasinoResult:");
  }
};


const newGenerateDiamondLedger = async (req, res) => {
  try {
    let insertCommPerBet = false;
    if (process.env.INSTANT_INSERT_DIAMOND_CASINO_COMM_PER_BET == "true") {
      insertCommPerBet = true;
    }
    let bodyData = {};
    let showDate = _date();
    let todayDate = moment().startOf("day").valueOf();
    if (req && req?.body && req?.body?.date) {
      bodyData = req.body;
      showDate = await _date(bodyData?.date);
      todayDate = moment(bodyData?.date).startOf("day").valueOf();
    }

    let casinoList = await DiamondCasinoService.getDiamondCasinoData();
    casinoList = await convertKeyObject(casinoList.data, "eventId");


    let dateWhere = await dateWhereCond(bodyData?.date, bodyData?.date);

    let where = {
      overallType: "diamondCasino",
      date: dateWhere,
      isDeclare: {
        $in: [true, 1],
      },
    };


    let resDataBetList = await casinoBetModel.aggregate([
      {
        $match: {
          date: dateWhere,
          isDeclare: { $in: [true, 1] },
        },
      },
      {
        $group: {
          _id: {
            eventId: "$eventId",
            userId: "$userId",
          },
          amount: { $sum: "$profitLoss" },
          userInfo: { $first: "$userInfo" },
        },
      },
    ]);



    let allData = [];
    let clientArray = [];
    let clientIdArray = [];

    resDataBetList.map((data, key) => {
      let clientId = data._id.userId;
      let hasKey = clientArray.hasOwnProperty(clientId);
      if (!hasKey) {
        clientArray[clientId] = clientId;
        clientIdArray.push(clientId);
      }
    });

   
    let [clientListData, shareClientData , directShareData] = await Promise.all([
      UserModel.find(
        { userId: { $in: clientIdArray } },
        { parentData: 1, userId: 1, username: 1, name: 1 , agentId : 1, masterId : 1, superagentId : 1, subadminId : 1, adminId : 1, ownerId : 1, superadminId : 1 , subownerId :1 }
      ),
      ShareModel.find({
        userId: { $in: clientIdArray },
      }),
      directUserShareModel.find({
        userId: { $in: clientIdArray },
      }),
    ]);


    if (shareClientData.length > 0) {
      shareClientData = await convertKeyObject(shareClientData, "userId");
    }

    if (clientListData.length > 0) {
      clientListData = await convertKeyObject(clientListData, "userId");
    }


    if (directShareData.length > 0) {
      directShareData = await convertKeyObject(directShareData, "userId");
    }

    let clientCommTransaction = [];
    let clientCommStatement = [];
    let clientPosArray = [];

    resDataBetList.map((data, key) => {
      data.eventId = data._id.eventId;
      let clientId = data?._id?.userId;
      let userId = data?._id?.userId;
      let clientShare = {};
      let clientData = {};
      let parentData = {};
      let clientShareDirect = {};

      if (shareClientData[userId]) {
        clientShare = shareClientData[userId];
      } else {
        console.log(
          "Share data not found",
          userId,
          data.username
        );
        return true;
      }


      if (directShareData[userId]) {
        clientShareDirect = directShareData[userId]?.shareData;
      } else {
        console.log(
          "Share data not found",
          userId,
          data.username
        );
        return true;
      }

      if (clientListData[userId]) {
        clientData = clientListData[userId];
      }

      if (clientData.parentData) {
        parentData = clientData.parentData;
      }



      let agentId = clientData.agentId;
      let superagentId = clientData.superagentId;
      let masterId = clientData.masterId;
      let subadminId = clientData.subadminId;
      let adminId = clientData.adminId;
      let superadminId = clientData.superadminId;
      let subownerId = clientData.subownerId;
      let ownerId = clientData.ownerId;


      //   _dx(adminId , "adminId")
   
      const clientComm = clientShare?.clientCasinoCommission;
      const agentComm = clientShare?.agentCasinoCommission;
      const superagentComm = clientShare?.superagentCasinoCommission;
      const masterComm = clientShare?.masterCasinoCommission;
      const subadminComm = clientShare?.subadminCasinoCommission;
      const adminComm = clientShare?.adminCasinoCommission;
      const superadminComm = clientShare?.superadminCasinoCommission;
      const subownerComm = clientShare?.subownerCasinoCommission;
      const ownerComm = clientShare?.ownerCasinoCommission;

      let clientProfitLoss = data.amount;


      let clientCommAmt = data.clientComm ? data.clientComm : 0;
      let agentCommAmt = 0;
      let superagentCommAmt = 0;
      let masterCommAmt = 0;
      let subadminCommAmt = 0;
      let adminCommAmt = 0;
      let superadminCommAmt = 0;
      let subownerCommAmt = 0;

      let agentCommAmtTotal = 0;
      let superagentCommAmtTotal = 0;
      let masterCommAmtTotal = 0;
      let subadminCommAmtTotal = 0;
      let adminCommAmtTotal = 0;
      let superadminCommAmtTotal = 0;
      let subownerCommAmtTotal = 0;

      let agentLedgerAmt = 0;
      let superagentLedgerAmt = 0;
      let masterLedgerAmt = 0;
      let subadminLedgerAmt = 0;
      let adminLedgerAmt = 0;
      let superadminLedgerAmt = 0;
      let subownerLedgerAmt = 0;

      let agentNetProfitLoss = 0;
      let superagentNetProfitLoss = 0;
      let masterNetProfitLoss = 0;
      let subadminNetProfitLoss = 0;
      let adminNetProfitLoss = 0;
      let superadminNetProfitLoss = 0;
      let subownerNetProfitLoss = 0;
      let ownerNetProfitLoss = 0;

      if (clientProfitLoss < 0 && insertCommPerBet == false) {
        let userClientProfitLoss = -1 * clientProfitLoss;

        clientCommAmt = (userClientProfitLoss * clientComm) / 100;

        agentCommAmtTotal = (userClientProfitLoss * agentComm) / 100;
        agentCommAmt =
          (((100 - clientShare.agentCasinoShare) / 100) *
            (userClientProfitLoss * agentComm)) /
          100;

        superagentCommAmtTotal = (userClientProfitLoss * superagentComm) / 100;
        superagentCommAmt =
          (((100 - clientShare.superagentCasinoShare) / 100) *
            (userClientProfitLoss * superagentComm)) /
          100;

        masterCommAmtTotal = (userClientProfitLoss * masterComm) / 100;
        masterCommAmt =
          (((100 - clientShare.masterCasinoShare) / 100) *
            (userClientProfitLoss * masterComm)) /
          100;

        subadminCommAmtTotal = (userClientProfitLoss * subadminComm) / 100;
        subadminCommAmt =
          (((100 - clientShare.subadminCasinoShare) / 100) *
            (userClientProfitLoss * subadminComm)) /
          100;

        adminCommAmtTotal = (userClientProfitLoss * adminComm) / 100;
        adminCommAmt =
          (((100 - clientShare.adminCasinoShare) / 100) *
            (userClientProfitLoss * adminComm)) /
          100;

        superadminCommAmtTotal = (userClientProfitLoss * superadminComm) / 100;
        superadminCommAmt =
          (((100 - clientShare.superadminCasinoShare) / 100) *
            (userClientProfitLoss * superadminComm)) /
          100;

        subownerCommAmtTotal = (userClientProfitLoss * subownerComm) / 100;
        subownerCommAmt =
          (((100 - clientShare.subownerCasinoShare) / 100) *
            (userClientProfitLoss * subownerComm)) /
          100;



        let pushCommTransaction = {
          userId: userId,
          clientId: clientId,
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
          amount: clientCommAmt,
          clientAmount: clientCommAmt,
          agentAmount: agentCommAmt,
          superagentAmount: superagentCommAmt,
          masterAmount: masterCommAmt,
          subadminAmount: subadminCommAmt,
          adminAmount: adminCommAmt,
          superadminAmount: superadminCommAmt,
          subownerAmount: subownerCommAmt,
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


        if (clientCommAmt > 0) {
          let pushCommStatement = {
            userId: userId,
            userType: "client",
            amount: clientCommAmt,
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
          clientCommStatement.push(pushCommStatement);
        }
      }

      if (insertCommPerBet == true) {
        agentCommAmtTotal = data.agentComm ? data.agentComm : 0;
        superagentCommAmtTotal = data.superagentComm ? data.superagentComm : 0;
        masterCommAmtTotal = data.masterComm ? data.masterComm : 0;
        subadminCommAmtTotal = data.subadminComm ? data.subadminComm : 0;
        adminCommAmtTotal = data.adminComm ? data.adminComm : 0;
        superadminCommAmtTotal = data.superadminComm ? data.superadminComm : 0;
        subownerCommAmtTotal = data.subownerComm ? data.subownerComm : 0;

        agentCommAmt =
          ((100 - clientShare.agentCasinoShare) / 100) * data.agentComm;

        superagentCommAmt =
          ((100 - clientShare.superagentCasinoShare) / 100) *
          data.superagentComm;
        masterCommAmt =
          ((100 - clientShare.masterCasinoShare) / 100) * data.masterComm;

        subadminCommAmt =
          ((100 - clientShare.subadminCasinoShare) / 100) * data.subadminComm;
        adminCommAmt =
          ((100 - clientShare.adminCasinoShare) / 100) * data.adminComm;
        superadminCommAmt =
          ((100 - clientShare.superadminCasinoShare) / 100) *
          data.superadminComm;
        subownerCommAmt =
          ((100 - clientShare.subownerCasinoShare) / 100) * data.subownerComm;
      }

      agentLedgerAmt =
        (clientProfitLoss * (100 - clientShare.agentCasinoShare)) / 100 -
        agentCommAmt;

      superagentLedgerAmt =
        (clientProfitLoss * (100 - clientShare.superagentCasinoShare)) / 100 -
        superagentCommAmt;

      masterLedgerAmt =
        (clientProfitLoss * (100 - clientShare.masterCasinoShare)) / 100 -
        masterCommAmt;

      subadminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.subadminCasinoShare)) / 100 -
        subadminCommAmt;

      adminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.adminCasinoShare)) / 100 -
        adminCommAmt;

      superadminLedgerAmt =
        (clientProfitLoss * (100 - clientShare.superadminCasinoShare)) / 100 -
        superadminCommAmt;

      subownerLedgerAmt =
        (clientProfitLoss * (100 - clientShare.subownerCasinoShare)) / 100 -
        subownerCommAmt;

      let agentProfitLossShare = clientShare.agentCasinoShare;

      let superagentProfitLossShare =
        clientShare.superagentCasinoShare - clientShare.agentCasinoShare;

      let masterProfitLossShare =
        clientShare.masterCasinoShare - clientShare.superagentCasinoShare;

      let subadminProfitLossShare =
        clientShare.subadminCasinoShare - clientShare.masterCasinoShare;

      let adminProfitLossShare =
        clientShare.adminCasinoShare - clientShare.subadminCasinoShare;

      let superadminProfitLossShare =
        clientShare.superadminCasinoShare - clientShare.adminCasinoShare;

      let subownerProfitLossShare =
        clientShare.subownerCasinoShare - clientShare.superadminCasinoShare;

      let ownerProfitLossShare =
        clientShare.ownerCasinoShare - clientShare.subownerCasinoShare;

      let agentNetProfitLossSelf =
        (-1 * (clientProfitLoss * agentProfitLossShare)) / 100 +
        ((100 - clientShare.agentCasinoShare) / 100) * clientCommAmt;

      agentNetProfitLoss =
        (clientProfitLoss * agentProfitLossShare) / 100 -
        (agentCommAmt - clientCommAmt);

      agentNetProfitLoss = -1 * agentNetProfitLoss;

      let superagentNetProfitLossSelf =
        (-1 * (clientProfitLoss * superagentProfitLossShare)) / 100 +
        ((100 - clientShare.superagentCasinoShare) / 100) * clientCommAmt;

      superagentNetProfitLoss =
        (clientProfitLoss * superagentProfitLossShare) / 100 -
        (superagentCommAmt - agentCommAmt);

      superagentNetProfitLoss = -1 * superagentNetProfitLoss;

      let masterNetProfitLossSelf =
        (-1 * (clientProfitLoss * masterProfitLossShare)) / 100 +
        ((100 - clientShare.masterCasinoShare) / 100) * clientCommAmt;

      masterNetProfitLoss =
        (clientProfitLoss * masterProfitLossShare) / 100 -
        (masterCommAmt - superagentCommAmt);

      masterNetProfitLoss = -1 * masterNetProfitLoss;

      let subadminNetProfitLossSelf =
        (-1 * (clientProfitLoss * subadminProfitLossShare)) / 100 +
        ((100 - clientShare.subadminCasinoShare) / 100) * clientCommAmt;

      subadminNetProfitLoss =
        (clientProfitLoss * subadminProfitLossShare) / 100 -
        (subadminCommAmt - masterCommAmt);

      subadminNetProfitLoss = -1 * subadminNetProfitLoss;

      let adminNetProfitLossSelf =
        (-1 * (clientProfitLoss * adminProfitLossShare)) / 100 +
        ((100 - clientShare.adminCasinoShare) / 100) * clientCommAmt;

      adminNetProfitLoss =
        (clientProfitLoss * adminProfitLossShare) / 100 -
        (adminCommAmt - subadminCommAmt);

      adminNetProfitLoss = -1 * adminNetProfitLoss;

      let superadminNetProfitLossSelf =
        (-1 * (clientProfitLoss * superadminProfitLossShare)) / 100 +
        ((100 - clientShare.superadminCasinoShare) / 100) * clientCommAmt;

      superadminNetProfitLoss =
        (clientProfitLoss * superadminProfitLossShare) / 100 -
        (superadminCommAmt - adminCommAmt);

      superadminNetProfitLoss = -1 * superadminNetProfitLoss;

      let subownerNetProfitLossSelf =
        (-1 * (clientProfitLoss * subownerProfitLossShare)) / 100 +
        ((100 - clientShare.subownerCasinoShare) / 100) * clientCommAmt;

      subownerNetProfitLoss =
        (clientProfitLoss * subownerProfitLossShare) / 100 -
        (subownerCommAmt - superadminCommAmt);

      subownerNetProfitLoss = -1 * subownerNetProfitLoss;

      ownerNetProfitLoss =
        (-1 * (clientProfitLoss * ownerProfitLossShare)) / 100 +
        ((100 - clientShare.ownerCasinoShare) / 100) * clientCommAmt;

      let ownerNetProfitLossSelf = ownerNetProfitLoss;

      let userInfo = {
        username: clientData.username,
        name: clientData.name,
      };

      let clientPosPushData = {
        positionType: "diamondCasino",
        userInfo: userInfo,
        userId: clientId,
        clientId: clientId,
        agentId: agentId,
        superagentId: superagentId,
        masterId: masterId,
        adminId: adminId,
        subadminId: subadminId,
        adminId:adminId,
        superadminId: superadminId,
        subownerId: subownerId,
        ownerId: ownerId,
        marketId: `${data.eventId}-${showDate}`,
        eventId: data.eventId,
        eventName: `${data.casinoName} (${showDate})`,
        isDeclare: 1,
        isCasino: 1,
        clientOddsAmount: clientProfitLoss,
        clientOddsComm: clientCommAmt,
        clientNetAmount: clientProfitLoss + clientCommAmt,
        parentData: parentData,
        agentOddsComm: agentCommAmtTotal,
        superagentOddsComm: superagentCommAmtTotal,
        masterOddsComm: masterCommAmtTotal,
        subadminOddsComm: subadminCommAmtTotal,
        adminOddsComm: adminCommAmtTotal,
        superadminOddsComm: superadminCommAmtTotal,
        subownerOddsComm: subownerCommAmtTotal,

        agentLedgerAmt: agentLedgerAmt,
        superagentLedgerAmt: superagentLedgerAmt,
        masterLedgerAmt: masterLedgerAmt,
        subadminLedgerAmt: subadminLedgerAmt,
        adminLedgerAmt: adminLedgerAmt,
        superadminLedgerAmt: superadminLedgerAmt,
        subownerLedgerAmt: subownerLedgerAmt,
        ownerLedgerAmt: 0,

        agentNetProfitLoss: -1 * agentNetProfitLoss,
        superagentNetProfitLoss: -1 * superagentNetProfitLoss,
        masterNetProfitLoss: -1 * masterNetProfitLoss,
        subadminNetProfitLoss: -1 * subadminNetProfitLoss,
        adminNetProfitLoss: -1 * adminNetProfitLoss,
        superadminNetProfitLoss: -1 * superadminNetProfitLoss,
        subownerNetProfitLoss: -1 * subownerNetProfitLoss,
        ownerNetProfitLoss: -1 * ownerNetProfitLoss,

        agentNetProfitLossSelf: -1 * agentNetProfitLossSelf,
        superagentNetProfitLossSelf: -1 * superagentNetProfitLossSelf,
        masterNetProfitLossSelf: -1 * masterNetProfitLossSelf,
        subadminNetProfitLossSelf: -1 * subadminNetProfitLossSelf,
        adminNetProfitLossSelf: -1 * adminNetProfitLossSelf,
        superadminNetProfitLossSelf: -1 * superadminNetProfitLossSelf,
        subownerNetProfitLossSelf: -1 * subownerNetProfitLossSelf,
        ownerNetProfitLossSelf: -1 * ownerNetProfitLossSelf,
        date: todayDate,
      };


      //_d(clientPosPushData , "clientPosPushData")
      clientPosArray.push(clientPosPushData);

      let casinoData = casinoList[data.eventId];
      if (casinoData) {
        data.casinoName = casinoData.name;
      }

      let clientLedger = {
        userId: clientId,
        clientId: clientId,
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
        amount: clientProfitLoss + clientCommAmt,
        isDeclare: true,
        date: todayDate,
      };




      allData.push(clientLedger);





      _d(clientShareDirect, "clientShareDirect")
      


    });





    _dx("stop")
    

    //  _dx(clientPosArray , "clientPosArray")


    // await Promise.all([
    //   profitLossPosition.deleteMany({
    //     isCasino: 1,
    //     isDeclare: true,
    //     date: dateWhere,
    //   }),
    //   ledgerModel.deleteMany({
    //     date: dateWhere,
    //     ledgerType: "diamondCasino",
    //     isDeclare: true,
    //   }),
    //   TransactionLogModel.deleteMany({
    //     date: dateWhere,
    //     isComm: 1,
    //     overallType: "diamondCasinoComm",
    //   }),
    //   StatementModel.deleteMany({
    //     date: dateWhere,
    //     isComm: 1,
    //     statementFor: "diamondCasinoComm",
    //     gameType: "diamondCasino",
    //   }),
    // ])





    // await Promise.all([
    //   profitLossPosition.create(clientPosArray),
    //   ledgerModel.create(allData),
    //   TransactionLogModel.create(clientCommTransaction),
    //   StatementModel.create(clientCommStatement),
    // ])




    // await Promise.all([
    //   updateBulkCoinsExposureUserByMarketId(clientIdArray),
    //   generateUserDiamondLedger(showDate, bodyData),
    // ])


    if (res) {
      return SendResponse(
        res,
        "success",
        `generate diamond Casino Ledger Successfully For Date ${showDate}`
      );
    } else {
      return true
    }
  } catch (error) {
    console.log(error);
  }
};




const saveResultRedisVirtual = async (req, res) => {
  try {
    // Aggregate user-wise total amount

    const crickPromise = await StatementModel.aggregate([
      {
        $match: {
          statementFor: "diamondCasino",
        },
      },
      {
        $group: {
          _id: "$userId",
          totalCoins: { $sum: "$amount" },
        },
      },
    ]);


    _dx(crickPromise, "crickPromise")
    
    
    // Debug aggregate response
   // _dx(crickPromise, "crickPromise");

    // Handle empty data
    if (!crickPromise || crickPromise.length === 0) {
      return SendResponse(
        res,
        "success",
        "No transaction data found",
        {
          total: 0,
          success: 0,
          failed: 0,
        }
      );
    }

    let success = 0;
    let failed = 0;

    // Prepare bulk insert data
    const transactionLogs = crickPromise.map((data) => {
      try {
        return {
          betId: data?.betId || null, // prevent undefined error
          userId: data._id,
          clientId: data._id,
          amount: Number(data.totalCoins) || 0,
          gameType: "diamondCasino",
          // overallType: "diamondCasino",
           overallType: "diamondCasinoComm",
          userType: "client",
          isComm: 1,
          forBet: 1,
          isDeclare: 1,

          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } catch (err) {
        failed++;
        _d("Map Error:", err);
        return null;
      }
    }).filter(Boolean);

    // Insert using bulk operation (much faster)
    if (transactionLogs.length > 0) {
      try {
        const insertResult = await TransactionLogModel.insertMany(
          transactionLogs,
          { ordered: false }
        );
        success = insertResult.length;
      } catch (insertError) {
        _d("InsertMany Error:", insertError);

        // Count successful inserts even if partial failure
        success = insertError?.result?.result?.nInserted || 0;
        failed = transactionLogs.length - success;
      }
    }

    return SendResponse(
      res,
      "success",
      "Result processing completed",
      {
        total: transactionLogs.length,
        success,
        failed,
      }
    );
  } catch (error) {
    _d("Outer Error:", error);

    return SendResponse(
      res,
      "error",
      "Something went wrong",
      {
        message: error.message,
        stack: error.stack,
      }
    );
  }
};



const saveBetfairCasinoResults = async (req, res) => {
  try {
    let bodyData = {}
    if (req && req.body) {
      bodyData = req.body;
    }

    let betfairUndeclareRoundId =
      req?.body?.roundIdArray?.length > 0
        ? req.body.roundIdArray
        : await client.smembers("betfairCasinoRoundId");
    

    if (bodyData.isDatabase) {
        let where = {
                isDeclare: 0,
                isPartiallyDeclare: 0,
                isDeleted: false,
                isBetfairCasino : true
        }
          
          if (bodyData.roundId) {
            where.roundId = bodyData.roundId
            delete where.isPartiallyDeclare 
            delete where.isDeclare 
            delete where.isDeleted 
          }
          
      
      let undeclaredRound = await casinoBetModel.aggregate([
        {
          $match: where,
        },
        {
          $group: {
            _id: "$roundId",
          },
        },
        {
          $project: {
            _id: 1,
            casinoType: 1,
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      undeclaredRound.map((data) => {
        betfairUndeclareRoundId.push(data._id);
      });
    }

     betfairUndeclareRoundId = [...new Set(betfairUndeclareRoundId)];
    


    if (betfairUndeclareRoundId?.length < 1) {
      if (res) {
        return res ? SendResponse(res, "success", "No undeclared round IDs") : [];
      } else {
        return false
      }
      
    }

    const hitUrl = process.env.BETFAIR_CASINO_RESULT_URL;
    if (!hitUrl) {
      return res ? SendResponse(res, "error", "Cache URL not found") : [];
    }

    /* ---------------- FETCH RESULTS IN PARALLEL ---------------- */
        const apiResults = await Promise.allSettled(
        betfairUndeclareRoundId.map((roundId) => {
          let payload = { roundId: String(roundId) };
          return axios.post(hitUrl, payload);
        })
      );


    const roundResultsMap = {};
    const successRoundIds = [];


    let sideWinnerArray = []
    let mainWinnerArray = []
    let refundArray = []

    for (let i = 0; i < apiResults.length; i++) {
      const resObj = apiResults[i];
      if (resObj.status === "fulfilled" && resObj.value?.data?.data) {
        const data = resObj.value.data.data;
        let parseData = data.data
        parseData = JSON.parse(parseData)

        let selectionData = parseData.selections
        let sideSelection = parseData.side_selections

        let allResults = []
        selectionData && selectionData.map((data) => {
          allResults.push(data)

         if (data.runner_status === "WINNER" && data.name) {
              mainWinnerArray.push(data.name.toUpperCase());
          }
          
        })

         sideSelection && sideSelection.map((sideData) => {
           allResults.push(sideData)
           if (sideData.runner_status == "WINNER" && sideData.name) {
              sideWinnerArray.push(sideData.name.toUpperCase())
           }
           
         })
        
       // _d(allResults, "allResults")
        
        let winnerSelectionIdArray = []

          allResults.map((sdata) => {
            if (sdata.runner_status == "WINNER") {
              winnerSelectionIdArray.push(sdata.name.toUpperCase())
            }

            if (sdata.runner_status == "REFUND") {
              refundArray.push(sdata.name.toUpperCase())
            }

          })
        
        
        if (winnerSelectionIdArray.length > 0) {
          data['winnerSelectionIdArray'] = winnerSelectionIdArray
          roundResultsMap[data.roundId] = data;
          successRoundIds.push(data.roundId);
        }

      }
    }


    if (!successRoundIds.length) {
      return res ? SendResponse(res, "success", "No valid results received") : [];
    }

    /* ---------------- FETCH BET DATA ---------------- */
    const roundBetData = await casinoBetModel.find(
      {
        roundId: { $in: successRoundIds },
      }
    );

    const bulkUpdates = [];
    const transactionLogs = [];
    const crickTransactionLogObj = [];
    const betIdArray = []
    const roundIdArray = []
    const statementLog = [];
    const userIdArray = [];
    const redisCleanupSet = new Set();
    const finalClientArray = {};

roundBetData.forEach((bet) => {
  const { userId, roundId } = bet;

  if (!finalClientArray[userId]) {
    finalClientArray[userId] = {};
  }

  if (!finalClientArray[userId][roundId]) {
    finalClientArray[userId][roundId] = {
      userId,
      roundId,
      ownerId: bet.ownerId,
      subownerId: bet.subownerId,
      superadminId: bet.superadminId,
      adminId: bet.adminId,
      subadminId: bet.subadminId,
      masterId: bet.masterId,
      superagentId: bet.superagentId,
      agentId: bet.agentId,
      clientId: bet.clientId,
      isComm: true,
      betTurnOver: 0,
      profitLoss: 0,
      remarks :`betfairCasino - ${bet.roundId} - ${bet.casinoType} / -(${_date()})`
    };
    roundIdArray.push(roundId)
  }

  const resultData = roundResultsMap[String(roundId)];

  if (!bet.isDeleted && resultData) {
    const winnerSelectionIdArray = resultData.winnerSelectionIdArray;
    const parsedData = JSON.parse(resultData.data);
    let profitLoss = bet.loss;

    let betType = bet.betType
    let betFor = bet.betFor

    if (winnerSelectionIdArray.includes(bet.sid.toUpperCase()) && betType != "K") {
      profitLoss = bet.profit;
    } else if (betType == "K" && !winnerSelectionIdArray.includes(bet.sid.toUpperCase())) {
      profitLoss = bet.profit;
    }

    if (refundArray.includes(bet.sid.toUpperCase())) {
       profitLoss = 0;
    } 
    
    finalClientArray[userId][roundId].betTurnOver += bet.amount;
    finalClientArray[userId][roundId].profitLoss += profitLoss;
  }
});


  //  _dx(finalClientArray , "finalClientArray")

    if (roundBetData.length > 0) {
      for (const bet of roundBetData) {
        
        let resultData = roundResultsMap[bet.roundId + ""];
        if (!resultData) continue;
        let winnerSelectionIdArray = resultData.winnerSelectionIdArray

        resultData = JSON.parse(resultData.data)

        let profit = bet.profit
        let lossAmount = bet.loss;
        let profitLoss = lossAmount
        let betId = bet._id
        let roundId = bet.roundId
        let betType = bet.betType
        let betFor = bet.betFor
        
        if (winnerSelectionIdArray.includes(bet.sid.toUpperCase()) && betType != "K") {
            profitLoss = profit;
          } else if (betType == "K" && !winnerSelectionIdArray.includes(bet.sid.toUpperCase())) {
            profitLoss = profit;
        }
        
        if (refundArray.includes(bet.sid.toUpperCase())) {
            profitLoss = 0;
          } 
        
        
        betIdArray.push(betId)
        userIdArray.push(bet.userId)
        const directShareData = await getShareChainData(bet.clientId);

        const transaction = {
          amount: profitLoss,
          clientProfitLoss: profitLoss,
          marketId: bet.roundId,
          eventId: bet.eventId,
          sportId: 1000000,
          seriesId: bet.eventId,
          gameName: `betfairCasino`,
          gameType: "betfairCasino",
          marketType: "diamondCasino",
          selectionId: bet.roundId,
          userId: bet.clientId,
          ownerId: bet.ownerId,
          subownerId: bet.subownerId,
          superadminId: bet.superadminId,
          adminId: bet.adminId,
          subadminId: bet.subadminId,
          masterId: bet.masterId,
          superagentId: bet.superagentId,
          agentId: bet.agentId,
          betId: betId,
          isDeclare : 1 ,
          forBet: 1,
          date: bet.date,
          remarks: `${bet.casinoType} (${bet.eventId}) bet  for roundId ${bet.roundId} for ${bet.playerName} `,
        };

        if (directShareData) {
          for (const share of directShareData) {
            transaction[`${share.creatorUserType}LedgerAmount`] =
              (share[`${share.creatorUserType}LedgerCasinoShare`] * profitLoss) / 100;
            transaction[`${share.creatorUserType}ProfitLoss`] =
              (share[`${share.creatorUserType}ProfitLossrCasinoShare`] * profitLoss) / 100;
          }
        }

      
        transactionLogs.push(transaction);

        let statement = {
          amount: profitLoss,
          betId: betId,
          marketId: bet.roundId,
          eventId: bet.eventId,
          selectionId: bet.roundId,
          userId: bet.userId,
          userType: "client",
          statementFor: "diamondCasino",
          gameType: `betfairCasino`,
          sportsType: `casino`,
          userRemark: `Betfair CasinoBet For ${bet.casinoType} Of (${bet.roundId}) for player ${bet.playerName}`,
          remark: `Diamond CasinoBet For ${bet.casinoType} Of (${bet.roundId}) for player ${bet.playerName}`,
        };

        statementLog.push(statement);
      


        if (directShareData) {
          let crickInsertAmount = profitLoss

          let casinoRemark = `betfairCasino - ${bet.roundId} - ${bet.casinoType} / -(${_date()})`;

          let crickPushTransactionLog = {
            amount: crickInsertAmount,
            clientProfitLoss: crickInsertAmount,
            marketId: roundId,
            eventId: `${bet.eventId}-${_date()}`,
            sportId: 1000000,
            seriesId: bet.eventId,
            gameName: "casino",
            transactionType: "profitLoss",
            gameType: bet.casinoType,
            marketType: "betfairCasino",
            selectionId: roundId,
            remarks: casinoRemark,
            userId: bet.userId,
            ownerId: bet.ownerId,
            subownerId: bet.subownerId,
            superadminId: bet.superadminId,
            adminId: bet.adminId,
            subadminId: bet.subadminId,
            masterId: bet.masterId,
            superagentId: bet.superagentId,
            agentId: bet.agentId,
            clientId: bet.userId,
            eventName: `${bet.casinoType}-(${_date()})`,
            betId: betId
          };

          directShareData.map((directShare) => {
            crickPushTransactionLog[`${directShare.creatorUserType}LedgerAmount`] = directShare[`${directShare.creatorUserType}LedgerCasinoShare`] * crickInsertAmount / 100
            crickPushTransactionLog[`${directShare.creatorUserType}ProfitLoss`] = directShare[`${directShare.creatorUserType}ProfitLossrCasinoShare`] * crickInsertAmount / 100
          })

          crickTransactionLogObj.push(crickPushTransactionLog);
        }

        bulkUpdates.push({
          updateMany: {
            filter: { _id: bet._id },
            update: {
              $set: {
                isDeclare: 1,
                isPartiallyDeclare: 1,
                profitLoss: profitLoss,
                result: String(winnerSelectionIdArray),
                showResult: JSON.stringify(resultData),
              },
            },
          },
        });

        redisCleanupSet.add(bet.roundId);
      }
    }



// commissionLogic
for (const [userId, rounds] of Object.entries(finalClientArray)) {
  const directShareData = await getShareChainData(userId);
  for (const [roundId, data] of Object.entries(rounds)) {
    let profitLoss = data.profitLoss
    let betTurnOver = data.betTurnOver
    let matchShareArray = {
      clientBetfairCommission : 2
    }
    if (profitLoss > 0) {

     let commissionData = betfairFancyCommissionHelper(
                  profitLoss,
                  betTurnOver,
                  matchShareArray,
                  directShareData
     );
      
               const pushArrayTransactionComm = {
                 amount: commissionData?.clientComm,
                 clientAmount: commissionData?.clientComm,
                 userId: data.userId,
                 userType: "client",
                 gameName: `betfairCasino`,
                 gameType: "betfairCasino",
                 subownerId: data.subownerId,
                 ownerId: data.ownerId,
                 superadminId: data.superadminId,
                 adminId: data.adminId,
                 subadminId: data.subadminId,
                 masterId: data.masterId,
                 superagentId: data.superagentId,
                 agentId: data.agentId,
                 clientId: data.userId,
                 overallType: "betfairCasinoComm",
                 marketId: roundId,
                 isDeclare: 1,
                 forBet: 1,
                 isComm: 1,
                 remarks: data.remarks,
               };
     
               transactionLogs.push(pushArrayTransactionComm);
     
               const pushStatementLogComm = {
                 userId: data.userId,
                 amount: commissionData?.clientComm,
                 userType: "client",
                 gameType: "betfairCasino",
                 sportsType: "casino",
                 remark: `${data.remarks}`,
                 userRemark: "Betfair Casino Comm",
                 statementFor: "betfairCasinoComm",
                 marketId: roundId,
                 isComm: true,
               };
               statementLog.push(pushStatementLogComm);
      
     
      const crickPushTransactionLogComm = {
            amount: commissionData?.clientComm,
            clientProfitLoss: commissionData?.clientComm,
             marketId: roundId,
             selectionId: roundId,
            
            sportId: 1000000,
            gameName: "casino",
            transactionType: "profitLoss",
            marketType: "betfairCasino",
            remarks: data.remarks,
            userId: data.userId,
            ownerId: data.ownerId,
            subownerId: data.subownerId,
            superadminId: data.superadminId,
            adminId: data.adminId,
            subadminId: data.subadminId,
            masterId: data.masterId,
            superagentId: data.superagentId,
            agentId: data.agentId,
            clientId: data.userId,
            eventName: data.remarks,
            isComm: 1,
            
                 ownerLedgerAmount: commissionData?.ownerLedgerSessionComm
                   ? commissionData?.ownerLedgerSessionComm
                   : 0,
                 subownerLedgerAmount: commissionData?.subownerLedgerSessionComm
                   ? commissionData?.subownerLedgerSessionComm
                   : 0,
                 superadminLedgerAmount: commissionData?.superadminLedgerSessionComm
                   ? commissionData?.superadminLedgerSessionComm
                   : 0,
                 adminLedgerAmount: commissionData?.adminLedgerSessionComm
                   ? commissionData?.adminLedgerSessionComm
                   : 0,
                 subadminLedgerAmount: commissionData?.subadminLedgerSessionComm
                   ? commissionData?.subadminLedgerSessionComm
                   : 0,
                 masterLedgerAmount: commissionData?.masterLedgerSessionComm
                   ? commissionData?.masterLedgerSessionComm
                   : 0,
                 superagentLedgerAmount: commissionData?.superagentLedgerSessionComm
                   ? commissionData?.superagentLedgerSessionComm
                   : 0,
                 agentLedgerAmount: commissionData?.agentLedgerSessionComm
                   ? commissionData?.agentLedgerSessionComm
                   : 0,
     
                 ownerProfitLoss: commissionData?.ownerProfitLossSessionComm
                   ? -1 * commissionData?.ownerProfitLossSessionComm
                   : 0,
                 subownerProfitLoss: commissionData?.subownerProfitLossSessionComm
                   ? -1 * commissionData?.subownerProfitLossSessionComm
                   : 0,
                 superadminProfitLoss: commissionData?.superadminProfitLossSessionComm
                   ? -1 * commissionData?.superadminProfitLossSessionComm
                   : 0,
                 adminProfitLoss: commissionData?.adminProfitLossSessionComm
                   ? -1 * commissionData?.adminProfitLossSessionComm
                   : 0,
                 subadminProfitLoss: commissionData?.subadminProfitLossSessionComm
                   ? -1 * commissionData?.subadminProfitLossSessionComm
                   : 0,
                 masterProfitLoss: commissionData?.masterProfitLossSessionComm
                   ? -1 * commissionData?.masterProfitLossSessionComm
                   : 0,
                 superagentProfitLoss: commissionData?.superagentProfitLossSessionComm
                   ? -1 * commissionData?.superagentProfitLossSessionComm
                   : 0,
                 agentProfitLoss: commissionData?.agentProfitLossSessionComm
                   ? -1 * commissionData?.agentProfitLossSessionComm
                 : 0,
                 betFor: "betfairCasino",
          };

          crickTransactionLogObj.push(crickPushTransactionLogComm);
      
    }
  }
}


  
   // _d(betIdArray, "betIdArray")


  
    let crickWhere = {
      marketType: "betfairCasino",
      betId : {$in : betIdArray}
    }

    let transactionLogWhere = {
      betId: { $in: betIdArray },
      gameType: `betfairCasino`,
    }


    let statementLogWhere = {
      betId: { $in: betIdArray },
      gameType: `betfairCasino`,
    }


    let [crickDeleteStatus , transactionDeleteStatus , statementDeleteStatus] = await Promise.allSettled([
      crickTransactionLog.deleteMany(crickWhere),
      TransactionLogModel.deleteMany(transactionLogWhere),
      StatementModel.deleteMany(statementLogWhere),
    ]);


     let crickWhereComm = {
      marketType: "betfairCasino",
      marketId: { $in: roundIdArray },
      isComm :1
    }

    let transactionLogWhereComm = {
      marketId: { $in: roundIdArray },
      isComm: 1,
      gameType: "betfairCasino",
      forBet :1
    }


    let statementLogWhereComm = {
      marketId: { $in: roundIdArray },
      isComm: 1,
      gameType: `betfairCasino`,
    }


      let [crickDeleteStatusComm , transactionDeleteStatusComm , statementDeleteStatusComm] = await Promise.allSettled([
        crickTransactionLog.deleteMany(crickWhereComm),
        TransactionLogModel.deleteMany(transactionLogWhereComm),
        StatementModel.deleteMany(statementLogWhereComm),
      ]);
    
    
    
    // _d(transactionDeleteStatusComm , "transactionDeleteStatusComm")
    // _d(transactionLogWhere , "transactionLogWhere")
    // _d(statementLog , "statementLog")
    // _d(transactionLogs , "transactionLogs")
    // _d(crickTransactionLogObj , "crickTransactionLogObj")
    // _d("stop")
    // _dx(transactionLogWhereComm , "transactionLogWhereComm")
    

    let [transactionUpdate , crickUpdate , statementUpdate , bulkUpdate , removeRedis] = await Promise.allSettled([
      TransactionLogModel.length && TransactionLogModel.insertMany(transactionLogs),
      crickTransactionLog.length && crickTransactionLog.insertMany(crickTransactionLogObj),
      StatementModel.length && StatementModel.insertMany(statementLog),
      bulkUpdates.length && casinoBetModel.bulkWrite(bulkUpdates, { ordered: false }),
      client.srem("betfairCasinoRoundId", ...Array.from(redisCleanupSet)),
    ]);


   // _d(transactionUpdate, "transactionUpdate")
    
    // _d(crickUpdate, "crickUpdate")
    
     const updateUserCoins = await updateBulkCoinsExposureUserByMarketId(
      userIdArray
    );
    

    userIdArray.forEach(async (userId) => {
        await emitToUser(`betUpdate`, {status : true } , userId)
    })


    return res
      ? SendResponse(res, "success", "Result saved successfully")
      : successRoundIds;

  } catch (error) {
    _d("❌ saveBetfairCasioResults error:", error);
    if (res) return SendResponse(res, "error", "Internal server error");
    throw error;
  }
};

module.exports = {
  betsResultOfClient,
  saveResult,
  generateDiamondLedger,
  deleteDiamondCasinoBets,
  generateClientProfitLoss,
  saveResultRedis,
  generateDiamondCasinoListByDate,
  doManaualResult,
  sendCasinoResultjson,
  saveAvaitorResults,
  saveCasinoLedgerByDateByCrickTransaction,
  saveResultRedisVirtual,
  newGenerateDiamondLedger,
  saveBetfairCasinoResults
};
