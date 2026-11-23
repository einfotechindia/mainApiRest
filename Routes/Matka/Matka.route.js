const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const matkaController = require("../../Controllers/matka/Matka.Controller");
const matkaResultController = require("../../Controllers/matka/matkaResult.controller");


router.post("/createMatka", verifyToken, matkaController.createMatka);
router.post("/updateMatka", verifyToken, matkaController.updateMatka);
router.post("/getMatkaList", verifyToken, matkaController.getMatkaList);
router.post(
  "/getMatkaByMatkaEventId",
  verifyToken,
  matkaController.getMatkaByMatkaEventId
);
router.post("/matkaPlaceBet", verifyToken, matkaController.matkaPlaceBet);
router.post("/matkaBetList", verifyToken, matkaController.matkaBetList);
router.post(
  "/matkaGameTypeList",
  verifyToken,
  matkaController.matkaGameTypeList
);
router.post("/deleteMatkaBets", verifyToken, matkaController.deleteMatkaBets);
router.post(
  "/dayWiseMatkaReport",
  verifyToken,
  matkaController.dayWiseMatkaReport
);
router.post("/countMatkaBets", verifyToken, matkaController.countMatkaBets);
router.post(
  "/getProfitLossPosMatka",
  verifyToken,
  matkaController.getProfitLossPosMatka
);
router.post("/updateMatkaTypes", verifyToken, matkaController.updateMatkaTypes);
router.post(
  "/getResultPanelList",
  verifyToken,
  matkaController.getResultPanelList
);

router.post(
  "/matkaReportByUser",
  verifyToken,
  matkaController.matkaReportByUser
);

router.post(
  "/matkaBetDelete",
  verifyToken,
  matkaController.matkaBetDelete
);

router.post(
  "/matkaBetCancel",
  verifyToken,
  matkaController.matkaBetCancel
);


// resultController
router.post("/matkaResult", verifyToken, matkaResultController.matkaResult);




module.exports = router;
