const svc = require("../../Services/Reports/InplayCasino.service");

const overview = async (req, res) => svc.overview(req, res);

module.exports = { overview };
