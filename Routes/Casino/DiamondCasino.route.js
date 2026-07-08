const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const diamondCasinoController = require("../../Controllers/diamondCasino/diamondCasino.controller");
const diamondResultController = require("../../Controllers/diamondCasino/diamondResult.Controller");
router.post(
  "/casinoBetPlace",
  verifyToken,
  diamondCasinoController.casinoBetPlace
);

router.post(
 "/casinoBetfairBetPlace",
  verifyToken,
  diamondCasinoController.casinoBetfairBetPlace
);


router.post(
  "/getDiamondCasinoData",
  verifyToken,
  diamondCasinoController.getDiamondCasinoData
);
router.post(
  "/getDiamondCasinoByEventId",
  verifyToken,
  diamondCasinoController.getDiamondCasinoByEventId
);


router.post(
  "/updateDiamondCasino",
  verifyToken,
  isOwnerAndStaff,
  diamondCasinoController.updateDiamondCasino
);

router.post(
  "/diamondBetsList",
  verifyToken,
  diamondCasinoController.diamondBetsList
);
router.post(
  "/diamondCasinoReportByUser",
  verifyToken,
  diamondCasinoController.diamondCasinoReportByUser
);

router.post(
  "/roundWiseResult",
  verifyToken,
  diamondCasinoController.roundWiseResult
);
router.post("/roudWiseData", verifyToken, diamondCasinoController.roudWiseData);
router.post(
  "/undeclaredRoundId",
  verifyToken,
  diamondCasinoController.undeclaredRoundId
);

router.post(
  "/getPlusMinusOfDiamondCasino",
  verifyToken,
  diamondCasinoController.getPlusMinusOfDiamondCasino
);

router.post(
  "/getCasinoListByDate",
  verifyToken,
  diamondCasinoController.getCasinoListByDate
);

router.post(
  "/dayWiseCasinoReport",
  verifyToken,
  diamondCasinoController.dayWiseCasinoReport
);


router.post(
  "/realTimeDataPosDataDiamondCasino",
  verifyToken,
  diamondCasinoController.realTimeDataPosDataDiamondCasino
);

router.post(
  "/getProfitLossPos",
  verifyToken,
  diamondCasinoController.getProfitLossPos
);

router.post(
  "/getPlusMinusCasinoDetail",
  verifyToken,
  diamondCasinoController.getPlusMinusCasinoDetail
);

router.post("/updateCasinoVideo", verifyToken,
  isOwnerAndStaff, diamondCasinoController.updateCasinoVideo);
router.post(
  "/redeclareRoundId",
   verifyToken,
  isOwnerAndStaff,
  diamondCasinoController.redeclareRoundId
);


router.post(
  "/resultByRoundWise",
   verifyToken,
  diamondCasinoController.resultByRoundWise
);


// diamond result Controller
router.post("/saveResult", verifyToken,
  isOwnerAndStaff, diamondResultController.saveResult);
  
router.post("/betsResultOfClient", verifyToken,
  isOwnerAndStaff, diamondResultController.betsResultOfClient);

router.post(
  "/generateDiamondLedger",
  verifyToken,
  isOwnerAndStaff,
  diamondResultController.generateDiamondLedger
);
router.post(
  "/deleteDiamondCasinoBets",
  verifyToken,
  isOwnerAndStaff,
  diamondResultController.deleteDiamondCasinoBets
);


router.post(
  "/generateClientProfitLoss",
  verifyToken,
  diamondResultController.generateClientProfitLoss
);

router.post(
  "/generateDiamondCasinoListByDate",
   verifyToken,
  isOwnerAndStaff,
  diamondResultController.generateDiamondCasinoListByDate
);


router.post(
  "/doManaualResult",verifyToken, isOwnerAndStaff,
  diamondResultController.doManaualResult
);


router.post(
  "/sendCasinoResultjson",
   verifyToken,
  isOwnerAndStaff,
  diamondResultController.sendCasinoResultjson
);



// virtualGameRoutes
router.post(
  "/avaitorGamePlace",
  verifyToken,
  diamondCasinoController.avaitorGamePlace
);

router.post(
  "/avaitorCashOut",
  verifyToken,
  diamondCasinoController.avaitorCashOut
);


router.post(
  "/saveAvaitorResults",
   verifyToken,
  isOwnerAndStaff,
  diamondResultController.saveAvaitorResults
);


router.post(
  "/saveCasinoLedgerByDateByCrickTransaction",
   verifyToken,
  isOwnerAndStaff,
  diamondResultController.saveCasinoLedgerByDateByCrickTransaction
);


router.post(
  "/saveResultRedisVirtual",
   verifyToken,
  isOwnerAndStaff,
  diamondResultController.saveResultRedisVirtual
);


router.post(
 "/newGenerateDiamondLedger",
  verifyToken,
  isOwnerAndStaff,
  diamondResultController.newGenerateDiamondLedger
);


router.post(
 "/saveVirtul",
  verifyToken,
  isOwnerAndStaff,
  diamondResultController.newGenerateDiamondLedger
);

router.post(
  "/casinoBetPlace",
  verifyToken,
  diamondCasinoController.casinoBetPlace
);


router.post(
 "/saveBetfairCasinoResults",
  verifyToken,
  isOwnerAndStaff,
  diamondResultController.saveBetfairCasinoResults
);





module.exports = router;
