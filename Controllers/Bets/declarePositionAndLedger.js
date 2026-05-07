const {
  wholeTransactionMarketData,
} = require("../../Helpers/TransactionHelper");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const BetService = require("../../Services/Sports/Bet.service");
const { convertKeyObject } = require("../../Helpers/CommonHelper");
const { generateLedger } = require("./Decision.controller");

const declarePositionAndLedger = async (
  marketId,
  matchData,
  isFancy,
  uniqueClientArray
) => {
  let transactionData = await wholeTransactionMarketData(
    marketId,
    uniqueClientArray
  );
  if (!matchData) {
    matchData = await BetService.sportByMarketId(marketId);
  }

  if (transactionData) {
    transactionData = convertKeyObject(transactionData, "_id");
  }

  let playWhere = {
    marketId: marketId,
  };

  if (isFancy) {
    playWhere.userId = {
      $in: uniqueClientArray,
    };
  }

  let playData = await BetService.getPlayData(
    playWhere,
    "shareData , clientId , ownerId , subownerId , superadminId , adminId , subadminId , masterId , superagentId , agentId , parentData , userInfo",
    "all"
  );

  let finalPositionData = [];

  playData.map((data, key) => {
    const clientId = data.clientId;
    const matchShareData = JSON.parse(data.shareData);
    const parentData = data.parentData;

    let transaction = [];

    if (transactionData[clientId]) {
      transaction = transactionData[clientId];

      let ProfitLossPosition = {
        userId: clientId,
        userInfo: data.userInfo,
        parentData: parentData,
        clientId: clientId,
        marketId: marketId,
        eventId: matchData.eventId,
        eventName: matchData.matchName,
        isDeclare: 1,
        ownerId: data.ownerId,
        subownerId: data.subownerId,
        superadminId: data.superadminId,
        adminId: data.adminId,
        subadminId: data.subadminId,
        masterId: data.masterId,
        superagentId: data.superagentId,
        agentId: data.agentId,
        clientOddsAmount: transaction.clientTotalBookmakerOdds,
        clientSessionAmount: transaction.clientTotalSessionOdds,
        clientOddsComm: transaction.clientTotalBookmakerComm,
        clientSessionComm: transaction.clientTotalSessionComm,
        clientNetAmount: transaction.clientTotalProfitLoss,
        ownerOddsComm: transaction.ownerTotalBookmakerComm,
        ownerSessionComm: transaction.ownerTotalSessionComm,
        subownerOddsComm: transaction.subownerTotalBookmakerComm,
        subownerSessionComm: transaction.subownerTotalSessionComm,
        superadminOddsComm: transaction.superadminTotalBookmakerComm,
        superadminSessionComm: transaction.superadminTotalSessionComm,
        adminOddsComm: transaction.adminTotalBookmakerComm,
        adminSessionComm: transaction.adminTotalSessionComm,
        subadminOddsComm: transaction.subadminTotalBookmakerComm,
        subadminSessionComm: transaction.subadminTotalSessionComm,
        masterOddsComm: transaction.masterTotalBookmakerComm,
        masterSessionComm: transaction.masterTotalSessionComm,
        superagentOddsComm: transaction.superagentTotalBookmakerComm,
        superagentSessionComm: transaction.superagentTotalSessionComm,
        agentOddsComm: transaction.agentTotalBookmakerComm,
        agentSessionComm: transaction.agentTotalSessionComm,
      };

      const clientOddsSessionAmount =
        transaction.clientTotalBookmakerOdds +
        transaction.clientTotalSessionOdds;

      let agentNetProfitLoss =
        clientOddsSessionAmount * matchShareData.agentMatchProfitLossShare +
        (transaction.agentTotalBookmakerComm +
          transaction.agentTotalSessionComm) *
          matchShareData.agentParentMatchShare;

      let ownerNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.ownerTotalBookmakerComm +
          transaction.ownerTotalSessionComm) *
        matchShareData.ownerMatchProfitLossShare;

      let subownerNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.subownerTotalBookmakerComm +
          transaction.subownerTotalSessionComm) *
        matchShareData.subownerMatchProfitLossShare;

      let superadminNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.superadminTotalBookmakerComm +
          transaction.superadminTotalSessionComm) *
        matchShareData.superadminMatchProfitLossShare;

      let adminNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.adminTotalBookmakerComm +
          transaction.adminTotalSessionComm) *
        matchShareData.adminMatchProfitLossShare;

      let subadminNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.subadminTotalBookmakerComm +
          transaction.subadminTotalSessionComm) *
        matchShareData.subadminMatchProfitLossShare;

      let masterNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.masterTotalBookmakerComm +
          transaction.masterTotalSessionComm) *
        matchShareData.masterMatchProfitLossShare;

      let superagentNetProfitLoss =
        (clientOddsSessionAmount +
          transaction.superagentTotalBookmakerComm +
          transaction.superagentTotalSessionComm) *
        matchShareData.superagentMatchProfitLossShare;

      profitLossPosition.ownerNetProfitLoss = ownerNetProfitLoss;
      ProfitLossPosition.subownerNetProfitLoss = subownerNetProfitLoss;
      ProfitLossPosition.superadminNetProfitLoss = superadminNetProfitLoss;
      ProfitLossPosition.adminNetProfitLoss = adminNetProfitLoss;
      ProfitLossPosition.subadminNetProfitLoss = subadminNetProfitLoss;
      ProfitLossPosition.masterNetProfitLoss = masterNetProfitLoss;
      ProfitLossPosition.superagentNetProfitLoss = superagentNetProfitLoss;
      ProfitLossPosition.agentNetProfitLoss = agentNetProfitLoss;

      let agentLedgerAmt =
        (clientOddsSessionAmount +
          transaction.agentTotalBookmakerComm +
          transaction.agentTotalSessionComm) *
        matchShareData.agentParentMatchShare;

      ProfitLossPosition.agentLedgerAmt = agentLedgerAmt;

      let superagentLedgerAmt =
        (clientOddsSessionAmount +
          transaction.superagentTotalBookmakerComm +
          transaction.superagentTotalSessionComm) *
        matchShareData.superagentParentMatchShare;

      ProfitLossPosition.superagentLedgerAmt = superagentLedgerAmt;

      let masterLedgerAmt =
        (clientOddsSessionAmount +
          transaction.masterTotalBookmakerComm +
          transaction.masterTotalSessionComm) *
        matchShareData.masterParentMatchShare;

      ProfitLossPosition.masterLedgerAmt = masterLedgerAmt;

      let subadminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.subadminTotalBookmakerComm +
          transaction.subadminTotalSessionComm) *
        matchShareData.subadminParentMatchShare;

      ProfitLossPosition.subadminLedgerAmt = subadminLedgerAmt;

      let adminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.adminTotalBookmakerComm +
          transaction.adminTotalSessionComm) *
        matchShareData.adminParentMatchShare;

      ProfitLossPosition.adminLedgerAmt = adminLedgerAmt;

      let superadminLedgerAmt =
        (clientOddsSessionAmount +
          transaction.superadminTotalBookmakerComm +
          transaction.superadminTotalSessionComm) *
        matchShareData.superadminParentMatchShare;

      ProfitLossPosition.superadminLedgerAmt = superadminLedgerAmt;

      let subownerLedgerAmt =
        (clientOddsSessionAmount +
          transaction.subownerTotalBookmakerComm +
          transaction.subownerTotalSessionComm) *
        matchShareData.subownerParentMatchShare;

      ProfitLossPosition.subownerLedgerAmt = subownerLedgerAmt;

      let ownerLedgerAmt =
        (clientOddsSessionAmount +
          transaction.ownerTotalBookmakerComm +
          transaction.ownerTotalSessionComm) *
        matchShareData.ownerParentMatchShare;

      ProfitLossPosition.ownerLedgerAmt = ownerLedgerAmt;

      finalPositionData.push(ProfitLossPosition);
    }
  });

  await profitLossPosition.deleteMany(playWhere);
  await profitLossPosition.insertMany(finalPositionData);
  if (!isFancy) {
    await generateLedger(marketId, finalPositionData, matchData);
  }
  return true;
};
exports.declarePositionAndLedger = declarePositionAndLedger;
