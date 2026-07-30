const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/SubAgent/Advanced.service");
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); } };

module.exports = {
  SendNotification: wrap(S.SendNotification),
  BulkNotification: wrap(S.BulkNotification),
  AutoMatchUTR: wrap(S.AutoMatchUTR),
  GetPendingUTRs: wrap(S.GetPendingUTRs),
  GetClientDevices: wrap(S.GetClientDevices),
  DetectDuplicateIPs: wrap(S.DetectDuplicateIPs),
  UpdateBetLimits: wrap(S.UpdateBetLimits),
  GetBetLimits: wrap(S.GetBetLimits),
  FancyReport: wrap(S.FancyReport),
  CasinoReport: wrap(S.CasinoReport),
};
