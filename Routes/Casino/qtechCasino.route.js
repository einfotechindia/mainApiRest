const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const qtechController = require("../../Controllers/Bets/qtech.controller");

router.post("/qtechLogin", verifyToken, qtechController.qtechLoginUrl);
router.post("/balance", qtechController.qtechBalance);
router.post("/transaction", qtechController.qtechTransaction);
router.post("/rollback", qtechController.qtechRollback);

module.exports = router;
