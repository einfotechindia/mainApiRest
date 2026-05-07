const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const UserController = require("../../Controllers/User/User.controller");
router.post("/login", UserController.Login);

// router.post("/create", verifyToken, UserController.Create);

module.exports = router;
