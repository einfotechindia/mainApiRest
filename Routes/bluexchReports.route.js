const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const bluexchServices = require("../Services/Reports/BluexchReport.service");

router.post("/clientPlusMinus", verifyToken, bluexchServices.clientPlusMinus);
router.post("/getUserNameByDefault", bluexchServices.getUserNameByDefault);
router.post(
  "/makeNegativeToPositiveUsers",
  bluexchServices.makeNegativeToPositiveUsers
);
router.post(
  "/getPlusMinusByEventWise",
  verifyToken,
  bluexchServices.getPlusMinusByEventWise
);
router.post(
  "/clientPlusMinusByMarketWise",
  verifyToken,
  bluexchServices.clientPlusMinusByMarketWise
);


router.post(
  "/getPlusMinusByUserWise",
  verifyToken,
  bluexchServices.getPlusMinusByUserWise
);


router.post(
  "/groupByLedgerByDownline",
  verifyToken,
  bluexchServices.groupByLedgerByDownline
);




module.exports = router;
