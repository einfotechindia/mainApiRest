const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const reportsServices = require("../Services/Reports/Reports.service");

router.post(
  "/getPlusMinusByMarketIdByUserWise",
  verifyToken,
  reportsServices.getPlusMinusByMarketIdByUserWise
);

router.post("/userProfitLoss", verifyToken, reportsServices.userProfitLoss);
router.post(
  "/generateCasinoProfitLossAndComm",
  verifyToken,
  reportsServices.generateCasinoProfitLossAndComm
);
router.post(
  "/groupByBetsForEventId",
  verifyToken,
  reportsServices.groupByBetsForEventId
);

router.post("/sportsProfitLoss", verifyToken, reportsServices.sportsProfitLoss);
router.post("/chipSummary", verifyToken, reportsServices.chipSummary);
router.post("/weeklyReport", verifyToken, reportsServices.weeklyReport);

module.exports = router;
