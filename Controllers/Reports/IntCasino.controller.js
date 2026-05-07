const svc = require("../../Services/Reports/IntCasino.service.js");

const casinoOverview = async (req, res) => svc.casinoOverview(req, res);
const betDetails = async (req, res) => svc.betDetails(req, res);

module.exports = { casinoOverview, betDetails };
