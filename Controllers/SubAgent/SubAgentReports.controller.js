const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/SubAgent/SubAgentReports.service");

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
};

module.exports = {
  OverviewReport: wrap(S.OverviewReport),
  DWSummaryReport: wrap(S.DWSummaryReport),
  ClientSummaryReport: wrap(S.ClientSummaryReport),
  CommissionSummaryReport: wrap(S.CommissionSummaryReport),
  PerformanceReport: wrap(S.PerformanceReport),
  SubAgentListStats: wrap(S.SubAgentListStats),
  BettingReport: wrap(S.BettingReport),
  PLReport: wrap(S.PLReport),
  SubAgentCasinoReport: wrap(S.SubAgentCasinoReport),
  SubAgentFancyReport: wrap(S.SubAgentFancyReport),
  ClientLoginReport: wrap(S.ClientLoginReport),
  DuplicateIPReport: wrap(S.DuplicateIPReport),
  ClientBalanceReport: wrap(S.ClientBalanceReport),
  PaymentMethodReport: wrap(S.PaymentMethodReport),
  UTRReport: wrap(S.UTRReport),
  SettlementReport: wrap(S.SettlementReport),
  ClientGrowthReport: wrap(S.ClientGrowthReport),
  TurnoverReport: wrap(S.TurnoverReport),
  SubAgentComparison: wrap(S.SubAgentComparison),
  ReferralFunnelReport: wrap(S.ReferralFunnelReport),
  HighExposureClients: wrap(S.HighExposureClients),
  SubAgentAudit: wrap(S.SubAgentAudit),
};
