const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/SubAgent/Affiliate.service");
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); } };

module.exports = {
  CreatePlan: wrap(S.CreatePlan), UpdatePlan: wrap(S.UpdatePlan), ListPlans: wrap(S.ListPlans),
  DeletePlan: wrap(S.DeletePlan), SeedPlans: wrap(S.SeedPlans), AssignPlan: wrap(S.AssignPlan),
  MyClients: wrap(S.MyClients), CalculateCommission: wrap(S.CalculateCommission),
  Earnings: wrap(S.Earnings), SettleCommission: wrap(S.SettleCommission),
  MarkPaid: wrap(S.MarkPaid), AffiliateDashboard: wrap(S.AffiliateDashboard),
};
