const express = require("express");
const { companyVerifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
// const companyController = require("../Controllers/Bets/company.controller");

// router.post(
//   "/registerClient",
//   companyVerifyToken,
//   companyController.registerClient
// );

module.exports = router;
