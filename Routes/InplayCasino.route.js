const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const ctrl = require("../Controllers/Reports/InplayCasino.controller");

router.post("/overview", verifyToken, ctrl.overview);

module.exports = router;
