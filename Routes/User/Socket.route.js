const express = require("express");
const router = express.Router();

const UserController = require("../../Controllers/User/User.controller");

router.post("./", UserController.Create);

module.exports = router;
