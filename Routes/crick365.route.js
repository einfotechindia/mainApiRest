const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const crick365Services = require("../Services/Reports/crick365.service");

router.post(
  "/mondayToMondayReportProfitLoss",
  verifyToken,
  crick365Services.mondayToMondayReportProfitLoss
);

router.post(
  "/userProfitLossCrick",
  verifyToken,
  crick365Services.userProfitLossCrick
);

router.post(
  "/userProfitLossCrickMarketWise",
  verifyToken,
  crick365Services.userProfitLossCrickMarketWise
);

router.post(
  "/crickAccountStatement",
  verifyToken,
  crick365Services.crickAccountStatement
);

router.post(
  "/crickMarketWiseReport",
  verifyToken,
  crick365Services.crickMarketWiseReport
);

router.post("/crickDashBoard", verifyToken, crick365Services.crickDashBoard);
router.post(
  "/loginClientDetails",
  verifyToken,
  crick365Services.loginClientDetails
);

router.post(
  "/userLogoutAndBlock",
  verifyToken,
  crick365Services.userLogoutAndBlock
);

router.post("/sportListFilter", verifyToken, crick365Services.sportListFilter);


router.post(
  "/userShareDetails",
  verifyToken,
  crick365Services.userShareDetails
);


router.post(
  "/agentProfitLossMarketWise",
  verifyToken,
  crick365Services.agentProfitLossMarketWise
);

router.post(
  "/agentProfitLossCrick",
  verifyToken,
  crick365Services.agentProfitLossCrick
);


router.post(
  "/activeBetsCount",
  verifyToken,
  crick365Services.activeBetsCount
);

router.post(
  "/myCashAndParentCash",
  verifyToken,
  crick365Services.myCashAndParentCash
);

router.post(
  "/skyUserList",
  verifyToken,
  crick365Services.skyUserList
);

router.post(
  "/balanceSheet",
  verifyToken,
  crick365Services.balanceSheet
);

router.post(
  "/createShareDataOfUsers",
  verifyToken,
  crick365Services.createShareDataOfUsers
);

router.post(
  "/cricSettlement",
  verifyToken,
  crick365Services.cricSettlement
);


router.post(
  "/crickUserList",
  verifyToken,
  crick365Services.crickUserList
);


router.post(
  "/profitLossCom",
  verifyToken,
  crick365Services.profitLossCom
);


router.post(
  "/checkMaximumWithdrwalAmount",
  verifyToken,
  crick365Services.checkMaximumWithdrwalAmount
);


module.exports = router;
