const express = require("express");
const {
  verifyToken,
  verifyCasinoToken,
  convertDecruptToEncrupt,
} = require("../../Middlewares/VerifyToken");
const router = express.Router();
const paymentController = require("../../Controllers/Bets/paymentGateway.controller");

router.post(
  "/payInRequest",verifyToken,paymentController.payInRequest
);


router.post(
  "/checkBalance",verifyToken,paymentController.checkBalance
);
module.exports = router;
