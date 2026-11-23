const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const GameSportsSettingController = require("../../Controllers/GameSportsSetting/gameSportsSetting.controller");

router.post("/update", verifyToken, GameSportsSettingController.updateGameSportsSetting);
router.post("/get", verifyToken, GameSportsSettingController.getGameSportsSetting);
router.post("/report", verifyToken, GameSportsSettingController.getGameSportsSettingReport);

module.exports = router;
