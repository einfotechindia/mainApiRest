const { SendResponse } = require("../../Helpers/ResponseMapper");
const GameSportsSettingService = require("../../Services/GameSportsSetting/gameSportsSetting.service");

module.exports = {
  updateGameSportsSetting: async (req, res) => {
    try {
      let resData = await GameSportsSettingService.updateGameSportsSetting(
        req.body,
        req.loggedInUser
      );
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_GAME_SPORTS_SETTING_UPDATE";
      return SendResponse(res, "error", msg);
    }
  },
  getGameSportsSetting: async (req, res) => {
    try {
      let resData = await GameSportsSettingService.getGameSportsSetting(
        req.body,
        req.loggedInUser
      );
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_GAME_SPORTS_SETTING";
      return SendResponse(res, "error", msg);
    }
  },
  getGameSportsSettingReport: async (req, res) => {
    try {
      let resData = await GameSportsSettingService.getGameSportsSettingReport(
        req.body,
        req.loggedInUser
      );
      return SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_GAME_SPORTS_SETTING_REPORT";
      return SendResponse(res, "error", msg);
    }
  },
};
