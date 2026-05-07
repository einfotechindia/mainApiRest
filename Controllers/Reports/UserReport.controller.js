const userReportService = require("../../Services/Reports/UserReport.service");

const getDashboardReport = async (req, res) => {
  return userReportService.getDashboardReport(req, res);
};

const getIpReport = async (req, res) => {
  return userReportService.getIpReport(req, res);
};

const getGameReport = async (req, res) => {
  return userReportService.getGameReport(req, res);
};

const getUserActivityReport = async (req, res) => {
  return userReportService.getUserActivityReport(req, res);
};

module.exports = {
  getDashboardReport,
  getIpReport,
  getGameReport,
  getUserActivityReport,
};
