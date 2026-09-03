const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const { rateLimit } = require("../../Middlewares/routeRateLimit");
const router = express.Router();
const decisionController = require("../../Controllers/Bets/Decision.controller");

// Long-running decision routes — 10 min timeout
const longTimeout = (req, res, next) => {
  req.setTimeout(600000); // 10 min
  res.setTimeout(600000);
  next();
};

router.post("/sessionDecision", verifyToken, isOwnerAndStaff, longTimeout, decisionController.sessionDecision);
router.post("/cancelFancy", verifyToken , isOwnerAndStaff , decisionController.cancelFancy);
router.post("/rollbackFancy",verifyToken, isOwnerAndStaff , decisionController.rollbackFancy);
router.post("/oddsDecision", verifyToken, isOwnerAndStaff, longTimeout, decisionController.oddsDecision);
router.post("/sessionUpdate", verifyToken, isOwnerAndStaff, decisionController.sessionUpdate);

router.post(
  "/generateCasinoClientLedger",
  verifyToken,
   isOwnerAndStaff,
  decisionController.generateCasinoClientLedger
);

router.post("/betsDelete", verifyToken, isOwnerAndStaff, rateLimit(5, 60), decisionController.betsDelete);
router.post("/betfairMarketDecision", verifyToken,  isOwnerAndStaff, decisionController.betfairMarketDecision);


router.post(
  "/clearExposureByMarketId",
  verifyToken,
   isOwnerAndStaff,
  decisionController.clearExposureByMarketId
);



router.post(
  "/commissionListByUserId",
  verifyToken,
  decisionController.commissionListByUserId
);


router.post(
  "/dateWiseLedgerAndPosition",
  verifyToken,
   isOwnerAndStaff,
  decisionController.dateWiseLedgerAndPosition
);

router.post(
  "/manualBetfairDecision",
  verifyToken,
   isOwnerAndStaff,
  decisionController.manualBetfairDecision
);


router.post(
  "/automaticBetfairDecision",
  isOwnerAndStaff,
  decisionController.automaticBetfairDecision
);



router.post(
  "/decisionBookmakerOddsAutomatic",
  isOwnerAndStaff,
  decisionController.decisionBookmakerOddsAutomatic
);

router.post(
  "/fancyAutomaticDecision",
  isOwnerAndStaff,
  decisionController.fancyAutomaticDecision
);



router.post(
  "/userCommissionCoinsInsert",
  verifyToken,
  isOwnerAndStaff,
  decisionController.userCommissionCoinsInsert
);



// routes Without isOwnerAndStaff middleware (accessible to all logged-in users)

router.post(
  "/positionLogData",
  verifyToken,
  decisionController.positionLogData
);
router.post(
  "/getPlusMinusByMarketId",
  verifyToken,
  decisionController.getPlusMinusByMarketId
);
router.post(
  "/completeSportList",
  verifyToken,
  decisionController.completeSportList
);

router.post(
  "/commissionReport",
  verifyToken,
  decisionController.commissionReport
);

router.post(
  "/userCommissionReport",
  verifyToken,
  decisionController.userCommissionReport
);

router.post("/resetComm", verifyToken, decisionController.resetComm);
router.post("/resetCommList", verifyToken, decisionController.resetCommList);

router.post("/sessionDecisionByCenterpanel", decisionController.sessionDecision);


module.exports = router;
