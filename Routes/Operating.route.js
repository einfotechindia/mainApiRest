const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../Middlewares/VerifyToken");
const router = express.Router();
const operatingController = require("../Controllers/Bets/operating.controller");

router.post("/getSessionList", verifyToken, isOwnerAndStaff, operatingController.getSessionList);
router.post("/getBetsList", verifyToken, isOwnerAndStaff, operatingController.getBetsList);

// User Analytics
const userAnalyticsController = require("../Controllers/Reports/userAnalytics.controller");
router.post("/userAnalytics", verifyToken, isOwnerAndStaff, userAnalyticsController.getUserAnalytics);


module.exports = router;
