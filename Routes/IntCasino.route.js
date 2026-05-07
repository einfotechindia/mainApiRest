const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const ctrl = require("../Controllers/Reports/IntCasino.controller");

router.post("/casinoOverview", verifyToken, ctrl.casinoOverview);
router.post("/betDetails", verifyToken, ctrl.betDetails);

module.exports = router;
