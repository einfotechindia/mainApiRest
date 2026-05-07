const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const dashboardController = require("../Services/Reports/dashboard.service");

router.post(
  "/btoc",
  verifyToken,
  dashboardController.btoc
);

module.exports = router;
