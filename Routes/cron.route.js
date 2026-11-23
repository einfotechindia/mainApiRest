const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const cronController = require("../Controllers/cron.controller");

router.post(
  "/throughFancyBookmakerBySocket",
  verifyToken,
  cronController.throughFancyBookmakerBySocket
);


module.exports = router;
