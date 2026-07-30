const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const radheService = require("../Services/Reports/radhe.service");

router.post(
  "/radheDashboard",
  verifyToken,
  radheService.radheDashboard
);



router.post(
  "/sportWiseFilterData",
  verifyToken,
  radheService.sportWiseFilterData
);

router.post(
  "/casinoWiseFilterData",
  verifyToken,
  radheService.casinoWiseFilterData
);

router.post(
  "/dashboardProfitLoss",
  verifyToken,
  radheService.dashboardProfitLoss
);




module.exports = router;
