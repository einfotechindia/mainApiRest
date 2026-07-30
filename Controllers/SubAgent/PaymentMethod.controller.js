const { SendResponse } = require("../../Helpers/ResponseMapper");
const S = require("../../Services/SubAgent/PaymentMethod.service");

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
};

module.exports = {
  List: wrap(S.List),
  Create: wrap(S.Create),
  Update: wrap(S.Update),
  Delete: wrap(S.Delete),
  ToggleStatus: wrap(S.ToggleStatus),
  Duplicate: wrap(S.Duplicate),
  Reorder: wrap(S.Reorder),
  Stats: wrap(S.Stats),
  ClientGetMethods: wrap(S.ClientGetMethods),
  GetById: wrap(S.GetById),
  AccountWiseReport: wrap(S.AccountWiseReport),
  DWListByAccount: wrap(S.DWListByAccount),
};
