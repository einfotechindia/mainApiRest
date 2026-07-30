const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const fancyBetListModel = require("../../Models/BetsList/FancyBetsList.model");
const oddsBetListModel = require("../../Models/BetsList/OddsBetsList.model");
const crickTransaction = require("../../Models/crickTransaction.model");
const LedgerModel = require("../../Models/Ledger.model");
const { UserTypes } = require("../../Common/Constants");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const {
  _dx,
  _d,
  convertKeyObject,
  whereHelper,
  dateWhereCond,
  parentDataAppend,
  _date_time,
  getSettingData
} = require("../../Helpers/CommonHelper");
const {
  gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");
const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const BetService = require("../../Services/Sports/Bet.service");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");


const radheDashboard = async (req, res) => {
  try {
    const bodyData = req.body || {};
    const loginData = req.loggedInUser;

    if (!loginData) {
      return SendResponse(
        res,
        "error",
        "Unauthorized user",
        null
      );
    }

    const userType = loginData.userType;

    if (!userType) {
      return SendResponse(
        res,
        "error",
        "User type is required",
        null
      );
    }

    const {
      fromDate = null,
      toDate = null,
    } = bodyData;

    const dateFilter = await dateWhereCond(
      fromDate,
      toDate
    );

    const userProfitLossField =
      `${userType}ProfitLoss`;

    const userLedgerField =
      `${userType}LedgerAmount`;

    const matchFilter = {
      ...whereHelper(loginData),
      transactionType: "profitLoss",
      date: dateFilter,
    };

    const aggregationOptions = {
      allowDiskUse: true,
    };

    //  _d(matchFilter, "matchFilter")
      

    const results = await Promise.allSettled([

      // Summary
      CrickTransactionLogModel.aggregate([
        {
          $match: matchFilter,
        },
        {
          $group: {
            _id: null,
            totalTransactions: {
              $sum: 1,
            },
            totalClientProfitLoss: {
              $sum: {
                $ifNull: [
                  "$clientProfitLoss",
                  0,
                ],
              },
            },
            totalUserProfitLoss: {
              $sum: {
                $ifNull: [
                  `$${userProfitLossField}`,
                  0,
                ],
              },
            },
            totalUserLedger: {
              $sum: {
                $ifNull: [
                  `$${userLedgerField}`,
                  0,
                ],
              },
            },
          },
        },
      ]).option(aggregationOptions),

      // Top Winners + Top Losers
      CrickTransactionLogModel.aggregate([
        {
          $match: matchFilter,
        },
        {
          $group: {
            _id: "$clientId",
            clientProfitLoss: {
              $sum: {
                $ifNull: [
                  "$clientProfitLoss",
                  0,
                ],
              },
            },
            userProfitLoss: {
              $sum: {
                $ifNull: [
                  `$${userProfitLossField}`,
                  0,
                ],
              },
            },
            userLedger: {
              $sum: {
                $ifNull: [
                  `$${userLedgerField}`,
                  0,
                ],
              },
            },
            totalBets: {
              $sum: 1,
            },
          },
        },
        {
          $facet: {
            winners: [
              {
                $match: {
                  clientProfitLoss: {
                    $gt: 0,
                  },
                },
              },
              {
                $sort: {
                  clientProfitLoss: -1,
                },
              },
              {
                $limit: 5,
              },
            ],
            losers: [
              {
                $match: {
                  clientProfitLoss: {
                    $lt: 0,
                  },
                },
              },
              {
                $sort: {
                  clientProfitLoss: 1,
                },
              },
              {
                $limit: 5,
              },
            ],
          },
        },
      ]).option(aggregationOptions),

      // Top Games
      CrickTransactionLogModel.aggregate([
        {
          $match: matchFilter,
        },
        {
          $group: {
            _id: "$gameName",
            eventName: {
              $first: "$eventName",
            },
            totalBets: {
              $sum: 1,
            },
            totalClientProfitLoss: {
              $sum: {
                $ifNull: [
                  "$clientProfitLoss",
                  0,
                ],
              },
            },
            totalUserProfitLoss: {
              $sum: {
                $ifNull: [
                  `$${userProfitLossField}`,
                  0,
                ],
              },
            },
            totalUserLedger: {
              $sum: {
                $ifNull: [
                  `$${userLedgerField}`,
                  0,
                ],
              },
            },
          },
        },
        {
          $sort: {
            totalBets: -1,
          },
        },
        {
          $limit: 20,
        },
      ]).option(aggregationOptions),
      
      // User Type Summary
      CrickTransactionLogModel.aggregate([
        {
          $match: matchFilter,
        },
        {
          $group: {
            _id: "$userType",
            totalProfitLoss: {
              $sum: {
                $ifNull: [
                  "$clientProfitLoss",
                  0,
                ],
              },
            },
            userProfitLoss: {
              $sum: {
                $ifNull: [
                  `$${userProfitLossField}`,
                  0,
                ],
              },
                },
            userCommission: {
                $sum: {
                    $cond: [
                        { $eq: ["$isComm", 1] },
                        { $ifNull: [`$${userProfitLossField}`, 0] },
                        0,
                    ],
                },
            },
            userLedger: {
              $sum: {
                $ifNull: [
                  `$${userLedgerField}`,
                  0,
                ],
              },
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
      ]).option(aggregationOptions),

      // Winning + Losing Markets
      CrickTransactionLogModel.aggregate([
        {
          $match: matchFilter,
        },
        {
          $group: {
            _id: "$marketType",
            marketType: {
              $first: "$marketType",
            },
            totalBets: {
              $sum: 1,
            },
            totalClientProfitLoss: {
              $sum: {
                $ifNull: [
                  "$clientProfitLoss",
                  0,
                ],
              },
            },
            totalUserProfitLoss: {
              $sum: {
                $ifNull: [
                  `$${userProfitLossField}`,
                  0,
                ],
              },
            },
            totalUserLedger: {
              $sum: {
                $ifNull: [
                  `$${userLedgerField}`,
                  0,
                ],
              },
            },
          },
        },
        {
          $facet: {
            winningMarkets: [
              {
                $match: {
                  totalUserProfitLoss: {
                    $gt: 0,
                  },
                },
              },
              {
                $sort: {
                  totalUserProfitLoss: -1,
                },
              },
              {
                $limit: 5,
              },
            ],
            losingMarkets: [
              {
                $match: {
                  totalUserProfitLoss: {
                    $lt: 0,
                  },
                },
              },
              {
                $sort: {
                  totalUserProfitLoss: 1,
                },
              },
              {
                $limit: 5,
              },
            ],
          },
        },
      ]).option(aggregationOptions),
    ]);

    const getResult = (
      result,
      defaultValue = []
    ) => {
      if (result.status === "fulfilled") {
        return result.value;
      }

      console.error(
        "Dashboard aggregation error:",
        result.reason
      );

      return defaultValue;
    };

    // Summary
    const summaryData = getResult(
      results[0]
    );

    const summaryDocument =
      summaryData[0] || {};

    const summary = {
      totalTransactions:
        summaryDocument.totalTransactions || 0,
      totalClientProfitLoss:
        summaryDocument.totalClientProfitLoss || 0,
      totalUserProfitLoss:
        summaryDocument.totalUserProfitLoss || 0,
      totalUserLedger:
        summaryDocument.totalUserLedger || 0,
    };

    // Winners / Losers
    const winnersLosersData = getResult(
      results[1],
      [
        {
          winners: [],
          losers: [],
        },
      ]
    );

    const topWinnersData =
      winnersLosersData[0]?.winners || [];

    const topLosersData =
      winnersLosersData[0]?.losers || [];

    // Top Games
    const topGames = getResult(
      results[2]
    );

    // User Type Summary
    const userTypeSummary = getResult(
      results[3]
    );

    // Winning / Losing Markets
    const marketsData = getResult(
      results[4],
      [
        {
          winningMarkets: [],
          losingMarkets: [],
        },
      ]
    );

    const topWinningMarkets =
      marketsData[0]?.winningMarkets || [];

    const topLosingMarkets =
      marketsData[0]?.losingMarkets || [];

    // Unique Client IDs
    const allClientIds = [
      ...new Map(
        [
          ...topWinnersData,
          ...topLosersData,
        ]
          .filter(
            (item) => item._id
          )
          .map((item) => [
            item._id.toString(),
            item._id,
          ])
      ).values(),
    ];

    // Fetch Client Details
    let clientUsers = [];

    if (allClientIds.length > 0) {
      try {
        clientUsers =
          await UserModel.find(
            {
              _id: {
                $in: allClientIds,
              },
            },
            {
              username: 1,
              name: 1,
            }
          ).lean();
      } catch (error) {
        console.error(
          "Client user query error:",
          error
        );
      }
    }

    // Client Map
    const clientUserMap =
      convertKeyObject(
        clientUsers.map(
          (user) => ({
            ...user,
            _id: user._id.toString(),
          })
        ),
        "_id"
      );

    // Format Client Data
    const formatClientData = (
      item
    ) => {
      const clientId =
        item._id
          ? item._id.toString()
          : "";

      const userInfo =
        clientUserMap[clientId] || {};

      return {
        clientId: item._id,
        username:
          userInfo.username || "",
        name:
          userInfo.name || "",
        clientProfitLoss:
          item.clientProfitLoss || 0,
        userProfitLoss:
          item.userProfitLoss || 0,
        userLedger:
          item.userLedger || 0,
        totalBets:
          item.totalBets || 0,
      };
    };

    const topWinners =
      topWinnersData.map(
        formatClientData
      );

    const topLosers =
      topLosersData.map(
        formatClientData
      );

    const responseData = {
      summary,
      topWinners,
      topLosers,
      topGames,
      topWinningMarkets,
      topLosingMarkets,
      userTypeSummary,
    };

    return SendResponse(
      res,
      "success",
      "Dashboard report fetched successfully",
      responseData
    );

  } catch (error) {
    console.error(
      "radheDashboard error:",
      error
    );

    return SendResponse(
      res,
      "error",
      "Something went wrong",
      error.message
    );
  }
};



const sportWiseFilterData = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;

    const fromDate = bodyData.fromDate || null;
    const toDate = bodyData.toDate || null;

    const dateFilter = await dateWhereCond(fromDate, toDate);

    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;
      matchFilter.gameName = "sports"
      
      if (bodyData.gameType && bodyData.gameType != null && bodyData.gameType!="all") {
        matchFilter.gameType = bodyData.gameType
      }
    

    // Top Games by volume
    const sportTypeFilterData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameType",
          gameType: { $first: "$gameType" },
          totalBets: { $sum: 1 },
          totalClientProfitLoss: { $sum: "$clientProfitLoss" },
          totalUserProfitLoss: { $sum: `$${userProfitLossField}` },
          totalUserLedger: { $sum: `$${userLedgerField}` },
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 20 },
    ]);

    
    const responseData = {
      sportTypeFilterData
    };

    return SendResponse(res, "success", "Dashboard report fetched successfully", responseData);
  } catch (error) {
    console.log("getDashboardReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};


const casinoWiseFilterData = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;

    const fromDate = bodyData.fromDate || null;
    const toDate = bodyData.toDate || null;

    const dateFilter = await dateWhereCond(fromDate, toDate);

    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;

    let matchFilter = whereHelper(loginData);
    matchFilter.transactionType = "profitLoss";
    matchFilter.date = dateFilter;
      matchFilter.gameName = "casino"
      
      if (bodyData.gameType && bodyData.gameType != null && bodyData.gameType!="all") {
        matchFilter.gameType = bodyData.gameType
      }
    

    // Top Games by volume
    const sportTypeFilterData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: "$gameType",
          eventName: { $first: "$eventName" },
          totalBets: { $sum: 1 },
          totalClientProfitLoss: { $sum: "$clientProfitLoss" },
          totalUserProfitLoss: { $sum: `$${userProfitLossField}` },
          totalUserLedger: { $sum: `$${userLedgerField}` },
        },
      },
      { $sort: { totalBets: -1 } },
      { $limit: 20 },
    ]);

    
    const responseData = {
      sportTypeFilterData
    };

    return SendResponse(res, "success", "Dashboard report fetched successfully", responseData);
  } catch (error) {
    console.log("getDashboardReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};



const dashboardProfitLoss = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const userId = loginData.userId || loginData._id;
    const fromDate = bodyData.fromDate || null;
    const toDate = bodyData.toDate || null;
    const dateFilter = await dateWhereCond(fromDate, toDate);
    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;
    let matchFilter = whereHelper(loginData);
    matchFilter.date = dateFilter;
 
    const sportTypeFilterData = await CrickTransactionLogModel.aggregate([
      { $match: matchFilter },
      {
       $group: {
            _id: `$${userType}Id`,
            clienProfitLoss: {
                $sum: {
                    $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        { $ifNull: [`$amount`, 0] },
                        0,
                    ],
                },
            },
            userProfitLoss: {
                $sum: {
                    $cond: [
                        { $eq: ["$transactionType", "profitLoss"] },
                        { $ifNull: [`$${userProfitLossField}`, 0]  },
                        0,
                    ],
                },
              },
            userWithdrawal: {
                $sum: {
                    $cond: [
                    {
                        $and: [
                        { $lt: ["$amount", 0] },
                        { $eq: ["$transactionType", "depositWithdrawal"] },
                        ],
                    },
                    { $abs: { $ifNull: [`$${userProfitLossField}`, 0] } },
                    0,
                    ],
                },
            },
            userDeposit: {
                $sum: {
                    $cond: [
                    {
                        $and: [
                        { $gt: ["$amount", 0] },
                        { $eq: ["$transactionType", "depositWithdrawal"] },
                        ],
                    },
                    { $ifNull: [`$${userProfitLossField}`, 0] },
                    0,
                    ],
                },
            },
            userCommission: {
                    $sum: {
                        $cond: [
                        {
                            $and: [
                                { $eq: ["$isComm", 1] },
                                { $eq: ["$transactionType", "profitLoss"] },
                            ],
                        },
                        { $ifNull: [`$${userProfitLossField}`, 0] },
                        0,
                     ],
                    },
                },
            userLedgerAmount: {
                $sum: {
                    $cond: [
                        { $eq: ["$transactionType", "ledgerAmount"] },
                        { $ifNull: [`$${userProfitLossField}`, 0]  },
                        0,
                    ],
                },
            },
          },
      },
    ]);

    
    const responseData = {
      sportTypeFilterData
    };

    return SendResponse(res, "success", "Dashboard report fetched successfully", responseData);
  } catch (error) {
    console.log("getDashboardReport error:", error);
    return SendResponse(res, "error", "Something went wrong", error.message);
  }
};



module.exports = {
    radheDashboard,
    sportWiseFilterData,
    casinoWiseFilterData,
    dashboardProfitLoss
};
