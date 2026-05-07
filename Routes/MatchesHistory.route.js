const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const ctrl = require("../Controllers/Reports/MatchesHistory.controller");

router.post("/list", verifyToken, ctrl.list);

module.exports = router;
