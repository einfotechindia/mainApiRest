const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../Middlewares/VerifyToken");
const router = express.Router();
const operatingController = require("../Controllers/Bets/operating.controller");

router.post("/getSessionList", verifyToken, isOwnerAndStaff, operatingController.getSessionList);
router.post("/getBetsList", verifyToken, isOwnerAndStaff, operatingController.getBetsList);




module.exports = router;
