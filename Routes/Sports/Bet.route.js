const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const betController = require("../../Controllers/Bets/Bet.controller");


// betPlaced Routes
router.post("/oddBetPlaced", verifyToken, betController.oddBetPlaced);
router.post("/sessionBetPlaced", verifyToken, betController.sessionBetPlaced);
router.post("/meterKhadoOddEvenCricketCassinoBetPlace", verifyToken, betController.meterKhadoOddEvenCricketCassinoBetPlace);
router.post("/combinedBetPlaceOdds", verifyToken, betController.combinedBetPlaceOdds);



router.post("/betsList", verifyToken, betController.betsList);
router.post("/casinoBetList", verifyToken, betController.casinoBetList);

router.post(
  "/completedFancyByMarketId",
  verifyToken,
  betController.completedFancyByMarketId
);

router.post("/betMatchDetails", verifyToken, betController.betMatchDetails);
router.post("/getOddsPosition", verifyToken, betController.getOddsPosition);
router.post(
  "/inplayOddsPosition",
  verifyToken,
  betController.inplayOddsPosition
);
router.post(
  "/casinoSearchResult",
  verifyToken,
  betController.casinoSearchResult
);
router.post(
  "/getSessionPositionBySelectionId",
  verifyToken,  
  betController.getSessionPositionBySelectionId
);


router.post("/getSessionList", verifyToken, betController.getSessionList);

router.post("/getCasinoList", verifyToken, betController.getCasinoList);
router.post("/getMatkaList", verifyToken, betController.getMatkaList);
router.post(
  "/clientListByMarketId",
  verifyToken,
  betController.clientListByMarketId
);
router.post(
  "/loginReportsByMarketId",
  verifyToken,
  betController.loginReportsByMarketId
);
router.post(
  "/userPositionByMarketId",
  verifyToken,
  betController.userPositionByMarketId
);
router.post("/getAllSessionList", verifyToken, betController.getAllSessionList);

router.post("/deleteMarket", verifyToken,isOwnerAndStaff , betController.deleteMarket);

router.post("/actualExposerList", verifyToken, betController.actualExposerList);
router.post(
  "/insertBetfairMarket",
  verifyToken,
  betController.insertBetfairMarket
);
router.post(
  "/getOpenBetsBymarketId",
  verifyToken,
  betController.getOpenBetsBymarketId
);

router.post(
  "/cancelOpenBets",
  verifyToken,
  betController.cancelOpenBets
);

router.post("/updateMatchByMarketId", verifyToken, isOwnerAndStaff, betController.updateMatchByMarketId);
router.post("/saveSportsList", verifyToken, isOwnerAndStaff, betController.saveSportsList);
router.post("/marketReload", verifyToken, isOwnerAndStaff, betController.marketReload);



// without verifyToken
router.post("/matchList",  betController.matchList);
router.post("/sportByMarketId", betController.sportByMarketId);
router.get("/getSessionList", betController.getSessionListGet);





module.exports = router;