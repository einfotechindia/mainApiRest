const svc = require("../../Services/Reports/BtoCReports.service.js");

const financialOverview = async (req, res) => svc.financialOverview(req, res);
const betAnalysis = async (req, res) => svc.betAnalysis(req, res);
const clientPnl = async (req, res) => svc.clientPnl(req, res);
const gamePerformance = async (req, res) => svc.gamePerformance(req, res);
const commissionReport = async (req, res) => svc.commissionReport(req, res);
const exposureReport = async (req, res) => svc.exposureReport(req, res);
const depositWithdrawAnalytics = async (req, res) => svc.depositWithdrawAnalytics(req, res);
const fraudDetection = async (req, res) => svc.fraudDetection(req, res);
const userGrowth = async (req, res) => svc.userGrowth(req, res);
const settlementReport = async (req, res) => svc.settlementReport(req, res);

module.exports = {
  financialOverview, betAnalysis, clientPnl, gamePerformance,
  commissionReport, exposureReport, depositWithdrawAnalytics,
  fraudDetection, userGrowth, settlementReport,
};
