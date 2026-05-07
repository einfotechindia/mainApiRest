const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();

const bpexchService = require("../Services/Reports/bpexch.service");

router.post(
  "/dashboardMatchList",
  verifyToken,
  bpexchService.dashboardMatchList
);

router.post(
  "/profitLossrepostByGameWise",
  verifyToken,
  bpexchService.profitLossrepostByGameWise
);


router.post(
  "/loadBalance",
  verifyToken,
  bpexchService.loadBalance
);



router.post(
  "/profitLossAccordingToDate",
  verifyToken,
  bpexchService.profitLossAccordingToDate
);


router.post(
  "/commissionReport",
  verifyToken,
  bpexchService.commissionReport
);


router.post(
  "/checkExposuerForUsers",
  verifyToken,
  bpexchService.checkExposuerForUsers
);

router.post(
  "/userExposure",
  verifyToken,
  bpexchService.userExposure
);


router.post(
  "/bookDetails1",
  verifyToken,
  bpexchService.bookDetails1
);

router.post(
  "/bpexchAccountStatement",
  verifyToken,
  bpexchService.bpexchAccountStatement
);


router.post(
  "/bpexchClientStatement",
  verifyToken,
  bpexchService.bpexchClientStatement
);


router.post(
  "/userCashCreditData",
  verifyToken,
  bpexchService.userCashCreditData
);


router.post(
  "/depositCredit",
  verifyToken,
  bpexchService.depositCredit
);

router.post(
  "/MaxProfitLossByUserWise",
  verifyToken,
  bpexchService.MaxProfitLossByUserWise
);


router.post(
  "/profitLossSettlement",
  verifyToken,
  bpexchService.profitLossSettlement
);


router.post(
  "/checkTpin",
  verifyToken,
  bpexchService.checkTpin
);


router.post(
  "/clientCashCreditData",
  verifyToken,
  bpexchService.clientCashCreditData
);



module.exports = router;
