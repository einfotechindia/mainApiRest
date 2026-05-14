const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const diamondController = require("../Controllers/Diamond/diamond.controller");

router.post(
  "/depositWithdrawTotal",
  verifyToken,
  diamondController.depositWithdrawTotal
);

router.post(
  "/userListNew",
  verifyToken,
  diamondController.userListNew
);

router.post(
  "/blockInternationalCasinoProviders",
  verifyToken,
  diamondController.blockInternationalCasinoProviders
);

router.post(
  "/getInternationalCasinoBlockMarket",
  verifyToken,
  diamondController.getInternationalCasinoBlockMarket
);


router.post(
  "/diamondDepositWithdraw",
   verifyToken,
  diamondController.diamondDepositWithdraw
);


router.post(
  "/diamondSettlement",
   verifyToken,
  diamondController.diamondSettlement
);


router.post(
  "/diamondBalanceSheet",
   verifyToken,
  diamondController.diamondBalanceSheet
);


router.post(
  "/diamondDashboard",
   verifyToken,
  diamondController.diamondDashboard
);


router.post(
  "/diamondAccountStatement",
   verifyToken,
  diamondController.diamondAccountStatement
);


// without verification
router.post(
  "/getUndeclareBetsListGroupwise",
  diamondController.getUndeclareBetsListGroupwise
);


module.exports = router;
