const sportListModel = require("../../Models/sportList.model");
const ProfitLossPositionModel = require("../../Models/BetsList/profitLossPosition.model");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetsListModel = require("../../Models/BetsList/FancyBetsList.model");
const { ObjectId } = require("mongodb");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { whereHelper, dateWhereCond } = require("../../Helpers/CommonHelper");

const list = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const { sportId, pageNo, size, fromDate, toDate, searchQuery, sortBy, sortOrder, statusFilter } = req.body;
    const userType = loginData.userType;
    const page = pageNo || 1;
    const limit = Math.min(size || 20, 50);

    // ── Build sport list query ──
    let query = { isDeclare: 1 };
    if (sportId) query.sportId = Array.isArray(sportId) ? { $in: sportId } : sportId;
    if (searchQuery) query.matchName = { $regex: searchQuery, $options: "i" };
    if (fromDate && toDate) {
      const dateWhere = await dateWhereCond(fromDate, toDate);
      query.date = dateWhere;
    }

    const specific = {
      marketId: 1, matchName: 1, matchType: 1, eventId: 1, sportId: 1,
      sportType: 1, matchDate: 1, isDeclare: 1, status: 1, wonTeamName: 1,
      date: 1, updatedAt: 1, sportName: 1, marketName: 1,
    };

    let sortData = { _id: -1 };
    if (sortBy === "matchDate") sortData = { matchDate: sortOrder === "asc" ? 1 : -1 };
    else if (sortBy === "matchName") sortData = { matchName: sortOrder === "asc" ? 1 : -1 };

    const total = await sportListModel.countDocuments(query);
    const sportData = await sportListModel.find(query, specific).sort(sortData).skip(limit * (page - 1)).limit(limit).lean();

    const marketIds = sportData.map(s => s.marketId);

    // ── P&L from profitLossPosition ──
    const field = `${userType}Id`;
    const plData = await ProfitLossPositionModel.aggregate([
      { $match: { [field]: new ObjectId(loginData.userId), marketId: { $in: marketIds } } },
      {
        $group: {
          _id: "$marketId",
          userNetPL: { $sum: `$${userType}NetProfitLossSelf` },
          clientNetPL: { $sum: "$clientNetAmount" },
          clientOdds: { $sum: "$clientOddsAmount" },
          clientSession: { $sum: "$clientSessionAmount" },
          clientOddsComm: { $sum: "$clientOddsComm" },
          clientSessionComm: { $sum: "$clientSessionComm" },
        },
      },
    ]);
    const plMap = {};
    plData.forEach(d => {
      plMap[d._id] = {
        userNetPL: -1 * (d.userNetPL || 0),
        clientNetPL: -1 * (d.clientNetPL || 0),
        clientOdds: d.clientOdds || 0,
        clientSession: d.clientSession || 0,
        clientOddsComm: d.clientOddsComm || 0,
        clientSessionComm: d.clientSessionComm || 0,
      };
    });

    // ── Bet counts from OddsBetsList and FancyBetsList ──
    const where = whereHelper(loginData);
    const oddsCounts = await OddsBetsListModel.aggregate([
      { $match: { ...where, marketId: { $in: marketIds } } },
      { $group: { _id: "$marketId", count: { $sum: 1 }, totalStake: { $sum: "$amount" } } },
    ]);
    const oddsMap = {};
    oddsCounts.forEach(d => { oddsMap[d._id] = { count: d.count, stake: d.totalStake }; });

    const fancyCounts = await FancyBetsListModel.aggregate([
      { $match: { ...where, marketId: { $in: marketIds } } },
      { $group: { _id: "$marketId", count: { $sum: 1 }, totalStake: { $sum: "$amount" } } },
    ]);
    const fancyMap = {};
    fancyCounts.forEach(d => { fancyMap[d._id] = { count: d.count, stake: d.totalStake }; });

    // ── Merge data ──
    const matches = sportData.map(match => {
      const pl = plMap[match.marketId] || {};
      const odds = oddsMap[match.marketId] || {};
      const fancy = fancyMap[match.marketId] || {};
      return {
        ...match,
        userNetPL: pl.userNetPL || 0,
        clientNetPL: pl.clientNetPL || 0,
        clientOdds: pl.clientOdds || 0,
        clientSession: pl.clientSession || 0,
        clientOddsComm: pl.clientOddsComm || 0,
        clientSessionComm: pl.clientSessionComm || 0,
        oddsBets: odds.count || 0,
        oddsStake: odds.stake || 0,
        fancyBets: fancy.count || 0,
        fancyStake: fancy.stake || 0,
        totalBets: (odds.count || 0) + (fancy.count || 0),
      };
    });

    // ── Summary stats ──
    let totalUserPL = 0, totalClientPL = 0, totalMatches = total;
    let winCount = 0, lossCount = 0, totalOddsBets = 0, totalFancyBets = 0;
    matches.forEach(m => {
      totalUserPL += m.userNetPL;
      totalClientPL += m.clientNetPL;
      if (m.userNetPL > 0) winCount++; else if (m.userNetPL < 0) lossCount++;
      totalOddsBets += m.oddsBets;
      totalFancyBets += m.fancyBets;
    });

    SendResponse(res, "success", "Matches History", {
      userType,
      matches,
      total,
      page,
      limit,
      summary: {
        totalMatches,
        totalUserPL,
        totalClientPL,
        winCount,
        lossCount,
        totalOddsBets,
        totalFancyBets,
      },
    });
  } catch (e) {
    console.error("matchesHistory.list error:", e);
    SendResponse(res, "error", e.message);
  }
};

module.exports = { list };
