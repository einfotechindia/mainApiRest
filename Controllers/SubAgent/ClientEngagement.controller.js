const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/SubAgent/ClientEngagement.service");

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
};

module.exports = {
  CreditBonus: wrap(S.CreditBonus),
  FreezeClient: wrap(S.FreezeClient),
  UnfreezeClient: wrap(S.UnfreezeClient),
  TransferClient: wrap(S.TransferClient),
  GetSettlement: wrap(S.GetSettlement),
  CommissionReport: wrap(S.CommissionReport),
  TransactionLog: wrap(S.TransactionLog),
  BetList: wrap(S.BetList),
  DailyPLReport: wrap(S.DailyPLReport),
  ClientRetention: wrap(S.ClientRetention),
};
