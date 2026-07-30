const { SendResponse } = require("../../Helpers/ResponseMapper");
const UserAnalyticsService = require("../../Services/Reports/userAnalytics.service");

module.exports = {
  getUserAnalytics: async (req, res) => {
    try {
      await UserAnalyticsService.getUserAnalytics(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
};
