const express = require("express");
const { verifyToken } = require("../Middlewares/VerifyToken");
const router = express.Router();
const paymentAccountController = require("../Controllers/PaymentAccount.controller");

router.post("/create", verifyToken, paymentAccountController.createAccount);
router.post("/update", verifyToken, paymentAccountController.updateAccount);
router.post("/list", verifyToken, paymentAccountController.getAccountList);
router.post("/getById", verifyToken, paymentAccountController.getAccountById);
router.post("/toggleStatus", verifyToken, paymentAccountController.toggleStatus);
router.post("/delete", verifyToken, paymentAccountController.deleteAccount);
router.post("/getByAmount", verifyToken, paymentAccountController.getAccountsByAmount);

module.exports = router;
