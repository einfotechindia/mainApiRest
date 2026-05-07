const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const ctrl = require("../Controllers/Reports/BtoCReports.controller");

router.post("/financialOverview", verifyToken, ctrl.financialOverview);
router.post("/betAnalysis", verifyToken, ctrl.betAnalysis);
router.post("/clientPnl", verifyToken, ctrl.clientPnl);
router.post("/gamePerformance", verifyToken, ctrl.gamePerformance);
router.post("/commissionReport", verifyToken, ctrl.commissionReport);
router.post("/exposureReport", verifyToken, ctrl.exposureReport);
router.post("/depositWithdrawAnalytics", verifyToken, ctrl.depositWithdrawAnalytics);
router.post("/fraudDetection", verifyToken, ctrl.fraudDetection);
router.post("/userGrowth", verifyToken, ctrl.userGrowth);
router.post("/settlementReport", verifyToken, ctrl.settlementReport);

module.exports = router;
