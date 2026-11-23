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

// bsf Routing
router.post(
  "/sessionEarningReport",
  verifyToken,
  reportsServices.getPlusMinusByMarketIdByUserWise
);
router.post("/companyReport", verifyToken, reportsServices.companyReport);
router.post("/clientReport", verifyToken, reportsServices.clientReport);

router.post("/blockMarket", verifyToken, reportsServices.blockMarket);
router.post("/topClient", verifyToken, reportsServices.topClient);
router.post("/selfStatement", verifyToken, reportsServices.selfStatement);
router.post("/marketAnalysis", verifyToken, reportsServices.marketAnalysis);
router.post(
  "/profitLossForAllExch",
  verifyToken,
  reportsServices.profitLossForAllExch
);

router.post("/myCash", verifyToken, reportsServices.myCash);
router.post(
  "/liveSettlementreport",
  verifyToken,
  reportsServices.liveSettlementreport
);

router.post(
  "/downlineOddsPosByMarketId",
  verifyToken,
  reportsServices.downlineOddsPosByMarketId
);

router.post(
  "/bsfCollectionReport",
  verifyToken,
  reportsServices.bsfCollectionReport
);

router.post("/bsfClientReport", verifyToken, reportsServices.bsfClientReport);
router.post("/bsfChipSummary", verifyToken, reportsServices.bsfChipSummary);
router.post("/matchDetails", verifyToken, reportsServices.matchDetails);

router.post(
  "/allexClientReport",
  verifyToken,
  reportsServices.allexClientReport
);

router.post(
  "/getOddsPositionForAllexch",
  verifyToken,
  reportsServices.getOddsPositionForAllexch
);

router.post(
  "/exposerListForAllexch",
  verifyToken,
  reportsServices.exposerListForAllexch
);

router.post(
  "/fancyProfitLossUserWiseAntPro",
  verifyToken,
  reportsServices.fancyProfitLossUserWiseAntPro
);

router.post(
  "/casinoTransactionReport",
  verifyToken,
  reportsServices.casinoTransactionReport
);


router.post(
  "/matchOddsRunningPos",
  verifyToken,
  reportsServices.matchOddsRunningPos
);

router.post(
  "/userWiseBlockMarketList",
  verifyToken,
  reportsServices.userWiseBlockMarketList
);


router.post(
  "/transactionSummaryForMarket",
  verifyToken,
  reportsServices.transactionSummaryForMarket
);


router.post(
  "/userOrMarketWiseCricReport",
  verifyToken,
  reportsServices.userOrMarketWiseCricReport
);

router.post(
  "/selfStatementCrick",
  verifyToken,
  reportsServices.selfStatementCrick
);

router.post(
  "/bsfProfitLoss",
  verifyToken,
  reportsServices.bsfProfitLoss
);

router.post(
  "/completedEventsNew",
  verifyToken,
  reportsServices.completedEventsNew
);



router.post(
  "/matchDetailsSummary",
  verifyToken,
  reportsServices.matchDetailsSummary
);
module.exports = router;
