const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const bethubService = require("../Services/Reports/bethub.service");

router.post(
  "/myLedger",
  verifyToken,
  bethubService.myLedger
);

router.post(
  "/clienttree",
  verifyToken,
  bethubService.clientTree
);

router.post(
  "/totalProfitLoss",
  verifyToken,
  bethubService.totalProfitLoss
);

router.post(
  "/topProfitLossUsers",
  verifyToken,
  bethubService.topProfitLossUsers
);


router.post(
  "/sportsProfitLoss",
  verifyToken,
  bethubService.sportsProfitLoss
);


router.post(
  "/bethubPlusMinus",
  verifyToken,
  bethubService.bethubPlusMinus
);


router.post(
  "/sessionProfitLossOfUserByMarket",
  verifyToken,
  bethubService.sessionProfitLossOfUserByMarket
);





module.exports = router;
