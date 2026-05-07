const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const userReportController = require("../Controllers/Reports/UserReport.controller");

router.post("/dashboard", verifyToken, userReportController.getDashboardReport);
router.post("/ipReport", verifyToken, userReportController.getIpReport);
router.post("/gameReport", verifyToken, userReportController.getGameReport);
router.post("/userActivity", verifyToken, userReportController.getUserActivityReport);

module.exports = router;
