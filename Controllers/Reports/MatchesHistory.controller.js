const svc = require("../../Services/Reports/MatchesHistory.service");

const list = async (req, res) => svc.list(req, res);

module.exports = { list };
