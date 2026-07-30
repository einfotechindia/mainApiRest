const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/CenterPanel/CenterPanel.service");

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
};

module.exports = {
  GetCenterPanelLogs: wrap(S.GetCenterPanelLogs),
  BookmakerDecision: wrap(S.BookmakerDecision),
  BetfairDecisionAutomatic: wrap(S.BetfairDecisionAutomatic),
  BetfairDecisionManual: wrap(S.BetfairDecisionManual),
  FancyDecision: wrap(S.FancyDecision),
  FancyRollback: wrap(S.FancyRollback),
  CancelFancy: wrap(S.CancelFancy),
  BetsDelete: wrap(S.BetsDelete),
  BetfairMarketDecision: wrap(S.BetfairMarketDecision),
  BookmakerOddsAutomatic: wrap(S.BookmakerOddsAutomatic),
  FancyAutomaticDecision: wrap(S.FancyAutomaticDecision),
};
