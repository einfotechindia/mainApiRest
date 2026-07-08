const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const halkaBhariService = require("../Services/Reports/halkaBhari.service");

router.post(
  "/accountHalkaBhari",
  verifyToken,
  halkaBhariService.accountHalkaBhari
);

router.post(
  "/inplayOddsPositionHalkaBhari",
  verifyToken,
  halkaBhariService.inplayOddsPositionHalkaBhari
);

router.post(
  "/halkaBhariPlusMinus",
  verifyToken,
  halkaBhariService.halkaBhariPlusMinus
);

router.post(
  "/halkaBhariPlusMinusMarketWise",
  verifyToken,
  halkaBhariService.halkaBhariPlusMinusMarketWise
);

router.post(
  "/halkaBhariSportsProfitLoss",
  verifyToken,
  halkaBhariService.halkaBhariSportsProfitLoss
);

router.post(
  "/getClientPositionByMarket",
  verifyToken,
  halkaBhariService.getClientPositionByMarket
);


router.post(
  "/clientProfitLossByMarket",
  verifyToken,
  halkaBhariService.clientProfitLossByMarket
);


router.post(
  "/fancyScale",
  verifyToken,
  halkaBhariService.fancyScale
);


router.post(
  "/matchScale",
  verifyToken,
  halkaBhariService.matchScale
);



module.exports = router;
