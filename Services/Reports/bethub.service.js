const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
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
  getSettingData,
    detectIsTime
} = require("../../Helpers/CommonHelper");
const {
    gettingDirectUserByUserId,
} = require("../../Helpers/UsersUtils");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");

const clientTree = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;
        let userId = loginData.userId || loginData._id;
        let where = { userId: new ObjectId(userId) }
        if (bodyData.username) {
            where = {
                $or: [
                    { username: bodyData.username },
                    { checkUsername: bodyData.username }
                ]
            }
        }

        const userData = await UserModel.findOne(
            where,
            {
                agentId: 1,
                superagentId: 1,
                masterId: 1,
                subadminId: 1,
                adminId: 1,
                superadminId: 1,
                subownerId: 1,
                ownerId: 1,
            }
        ).lean();


        const ids = Object.values(userData)
            .filter(Boolean)
            .map(id => id);

        let responseData = await UserModel.find({
            _id: { $in: ids }
        }, {
            username: 1, name: 1, coins: 1, status: 1, betStatus: 1, userPriority: 1, userType: 1
        });

        return SendResponse(res, "success", "Client tree fetched successfully", responseData);
    } catch (error) {
        console.log("getClientTree error:", error);
        return SendResponse(res, "error", "Something went wrong", error.message);
    }
};

// const myLedger = async (req, res) => {
//     try {
//         const bodyData = req.body;
//         const loginData = req.loggedInUser;
//         let userType = bodyData.userType || loginData.userType;
//         const userId = new ObjectId(bodyData.userId || loginData.userId || loginData._id);
//         let userLedgerField = `${userType}LedgerAmount`;
//         let userProfitLossField = `${userType}ProfitLoss`;
//         let downLineType = userType

        
//         if (bodyData.isDownlineLedger === true) {
//             const index = UserTypes.indexOf(userType);
//             let userPriority = UserTypes.indexOf(userType);
//             downLineType = UserTypes[userPriority - 1];
//             if (downLineType && downLineType !== userType) {
//                 userLedgerField = `${downLineType}LedgerAmount`;
//                 userProfitLossField = `${downLineType}ProfitLoss`;
//             }else{
//                downLineType = userType;
//             }
//             if (downLineType === "client") {
//                 userLedgerField = `amount`;
//                 userProfitLossField = `amount`;
//             }
//         }

//         let matchFilter = {
//             [`${userType}Id`]: userId,
//             transactionType: { $in: [ "profitLoss" , "ledger"] },
//         };

//         if (userType === "client") {
//             matchFilter = {
//                 userId: userId,
//                 transactionType: { $in: ["profitLoss" , "ledger"] },
//             };
//         }

//         matchFilter = whereHelper(loginData, matchFilter);

//         if (bodyData.fromDate && bodyData.toDate) {
//             matchFilter.date = {
//                 $gte: new Date(bodyData.fromDate),
//                 $lte: new Date(bodyData.toDate),
//             };
//         }

//         if (bodyData.gameName) {
//             matchFilter.gameName = bodyData.gameName;
//         }

//         if (bodyData.gameType) {
//             matchFilter.gameType = bodyData.gameType;
//         }

//         if (bodyData.isSettlement === true) {
//            matchFilter.transactionType = "ledger";
//            matchFilter.userId = userId;
//            matchFilter.creatorId = { $ne: userId };
//         }

//         const search = bodyData.search?.trim();

//         _d(matchFilter , userLedgerField)

//         const matchStage = {
//             ...matchFilter,
//             ...(search && {
//                 $or: [
//                     { remarks: { $regex: search, $options: "i" } },
//                     { gameName: { $regex: search, $options: "i" } },
//                     { eventName: { $regex: search, $options: "i" } },
//                 ],
//             }),
//         };

//         const skip = Number(bodyData.size) * (Number(bodyData.pageNo) - 1);
//         const limit = Number(bodyData.size);

//         const ledgerPipeline = [
//                 { $match: matchStage },
//                 {
//                     $group: {
//                         _id: {
//                             userId: `$${userType}Id`,
//                             remarks: "$remarks",
//                         },
//                         ledger: {
//                             $sum: {
//                                 $ifNull: [`$${userLedgerField}`, 0],
//                             },
//                         },
//                         transactionType: { $first: "$transactionType" },
//                         isComm: { $first: "$isComm" },
//                         eventName: { $first: "$eventName" },
//                         remarks: { $first: "$remarks" },
//                         gameName: { $first: "$gameName" },
//                         result: { $first: "$result" },
//                         date: { $first: "$date" },
//                         createdAt: { $first: "$createdAt" },
//                         updatedAt: { $first: "$updatedAt" },
//                     },
//                 },
//                 { $sort: { createdAt: -1 } }, // or date: -1
//                 { $skip: skip },
//                 { $limit: limit },
//             ];
            
//         _d(userId, "userId")
        


//         let downlineCashCond = {
//             $and: [
//                 { $eq: ["$transactionType", "ledger"] },
//                 { $ne: ["$userId", new ObjectId(loginData.userId)] },
//                 { $eq: ["$creatorId", new ObjectId(loginData.userId)] },
//             ],
//         };
//         if (bodyData.userId && bodyData.userId !== loginData.userId) { 
//             downlineCashCond = {
//                     $and: [
//                         { $eq: ["$transactionType", "ledger"] },
//                         { $eq: ["$userId", new ObjectId(bodyData.userId)] },
//                         { $eq: ["$creatorId", new ObjectId(loginData.userId)] },
//                     ],
//                 };
//         }


//         const personelPipeline = [
//             { $match: matchStage },
//             {
//                 $group: {
//                     _id: `$${userType}Id`,
//                     userLedgerAmount: {
//                         $sum: {
//                             $cond: [
//                                 { $eq: ["$transactionType", "profitLoss"] },
//                                 { $ifNull: [`$${userLedgerField}`, 0] },
//                                 0,
//                             ],
//                         },
//                     },
//                     parentCash: {
//                         $sum: {
//                             $cond: [
//                                 {
//                                     $and: [
//                                         { $eq: ["$transactionType", "ledger"] },
//                                         { $eq: ["$userId", userId] },
//                                         { $ne: ["$creatorId", userId] },
//                                     ],
//                                 },
//                                 { $ifNull: [`$${userLedgerField}`, 0] },
//                                 0,
//                             ],
//                         },
//                     },
//                     downlineCash: downlineCashCond,
//                 },
//             },
//         ];

//         const [data, totalCount, personelData] = await Promise.all([
//             CrickTransactionLogModel.aggregate(ledgerPipeline).allowDiskUse(true),
//             CrickTransactionLogModel.countDocuments(matchStage),
//             CrickTransactionLogModel.aggregate(personelPipeline).allowDiskUse(true),
//         ]);

//         return SendResponse(
//             res,
//             "success",
//             "Dashboard report fetched successfully",
//             {
//                 data,
//                 totalCount,
//                 personelData,
//             }
//         );
//     } catch (error) {
//         console.error("myLedger Error:", {
//             message: error.message,
//             stack: error.stack,
//         });

//         return SendResponse(
//             res,
//             "error",
//             error.message || "Something went wrong"
//         );
//     }
// };


const myLedger = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;

        // ==========================================
        // USER TYPE / USER ID
        // ==========================================
        const userType = bodyData.userType || loginData.userType;

        const userId = new ObjectId(
            bodyData.userId ||
            loginData.userId ||
            loginData._id
        );

        const loginUserId = new ObjectId(
            loginData.userId || loginData._id
        );

        // ==========================================
        // DEFAULT FIELDS
        // ==========================================
        let userLedgerField = `${userType}LedgerAmount`;
        let userProfitLossField = `${userType}ProfitLoss`;

        let downLineType = userType;

        // ==========================================
        // DOWNLINE LEDGER
        // ==========================================
        if (bodyData.isDownlineLedger === true) {
            const userPriority = UserTypes.indexOf(userType);

            if (userPriority > 0) {
                downLineType = UserTypes[userPriority - 1];

                if (downLineType && downLineType !== userType) {
                    userLedgerField = `${downLineType}LedgerAmount`;
                    userProfitLossField = `${downLineType}ProfitLoss`;
                }
            }

            // Client ke liye amount field
            if (downLineType === "client") {
                userLedgerField = "amount";
                userProfitLossField = "amount";
            }
        }
      
      
        
      if (userType == "client") {
           userLedgerField = "amount";
           userProfitLossField = "amount";
        }

        // ==========================================
        // BASE MATCH FILTER
        // ==========================================
        let matchFilter = {
            [`${userType}Id`]: userId,

            transactionType: {
                $in: ["profitLoss", "ledger"],
            },
        };

        // Client ke liye userId use hoga
        if (userType === "client") {
            matchFilter = {
                userId: userId,

                transactionType: {
                    $in: ["profitLoss", "ledger"],
                },
            };
        }

        // ==========================================
        // WHERE HELPER
        // ==========================================
        matchFilter = whereHelper(
            loginData,
            matchFilter
        );

        // ==========================================
        // DATE FILTER
        // ==========================================
       if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    

        // ==========================================
        // GAME NAME
        // ==========================================
        if (bodyData.gameName) {
            matchFilter.gameName = bodyData.gameName;
        }

        // ==========================================
        // GAME TYPE
        // ==========================================
        if (bodyData.gameType) {
            matchFilter.gameType = bodyData.gameType;
        }

        // ==========================================
        // SETTLEMENT
        // ==========================================
        if (bodyData.isSettlement === true) {
            matchFilter.transactionType = "ledger";

            matchFilter.userId = userId;

            matchFilter.creatorId = {
                $ne: userId,
            };
        }
      
      
      
      

        // ==========================================
        // SEARCH
        // ==========================================
        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,

            ...(search
                ? {
                    $or: [
                        {
                            remarks: {
                                $regex: search,
                                $options: "i",
                            },
                        },
                        {
                            gameName: {
                                $regex: search,
                                $options: "i",
                            },
                        },
                        {
                            eventName: {
                                $regex: search,
                                $options: "i",
                            },
                        },
                    ],
                }
                : {}),
        };

        // ==========================================
        // PAGINATION
        // ==========================================
        const pageNo = Math.max(
            Number(bodyData.pageNo) || 1,
            1
        );

        const size = Math.min(
            Math.max(
                Number(bodyData.size) || 20,
                1
            ),
            100
        );

        const skip = size * (pageNo - 1);

        // ==========================================
        // LEDGER PIPELINE
        // ==========================================
        const ledgerPipeline = [
            {
                $match: matchStage,
            },

            {
                $group: {
                    _id: {
                        userId: `$${userType}Id`,
                        remarks: "$remarks",
                    },

                    ledger: {
                        $sum: {
                            $ifNull: [
                                `$${userLedgerField}`,
                                0,
                            ],
                        },
                    },

                    transactionType: {
                        $first: "$transactionType",
                    },

                    isComm: {
                        $first: "$isComm",
                    },

                    eventName: {
                        $first: "$eventName",
                    },

                    remarks: {
                        $first: "$remarks",
                    },

                    gameName: {
                        $first: "$gameName",
                    },

                    result: {
                        $first: "$result",
                    },

                    date: {
                        $first: "$date",
                    },

                    createdAt: {
                        $first: "$createdAt",
                    },

                    updatedAt: {
                        $first: "$updatedAt",
                    },
                },
            },

            // Latest first
            {
                $sort: {
                    createdAt: -1,
                    _id: 1,
                },
            },

            {
                $skip: skip,
            },

            {
                $limit: size,
            },
        ];

        // ==========================================
        // DOWNLINE CASH CONDITION
        // ==========================================
        let downlineCashCondition = {
            $and: [
                {
                    $eq: [
                        "$transactionType",
                        "ledger",
                    ],
                },

                {
                    $ne: [
                        "$userId",
                        loginUserId,
                    ],
                },

                {
                    $eq: [
                        "$creatorId",
                        loginUserId,
                    ],
                },
            ],
        };

        // ==========================================
        // SPECIFIC DOWNLINE USER
        // ==========================================
        if (
            bodyData.userId &&
            bodyData.userId.toString() !==
            loginUserId.toString()
        ) {
            const selectedUserId = new ObjectId(
                bodyData.userId
            );

            downlineCashCondition = {
                $and: [
                    {
                        $eq: [
                            "$transactionType",
                            "ledger",
                        ],
                    },

                    {
                        $eq: [
                            "$userId",
                            selectedUserId,
                        ],
                    },

                    {
                        $eq: [
                            "$creatorId",
                            loginUserId,
                        ],
                    },
                ],
            };
        }

      
      userLedgerField = `${userType}LedgerAmount`

      if (userType == "client") {
        userLedgerField = "amount"
      }
      
        const personelPipeline = [
            {
                $match: matchStage,
            },

            {
                $group: {
                    _id: `$${userType}Id`,
                    userLedgerAmount: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        "$transactionType",
                                        "profitLoss",
                                    ],
                                },

                                {
                                    $ifNull: [
                                        `$${userLedgerField}`,
                                        0,
                                    ],
                                },

                                0,
                            ],
                        },
                    },
                    parentCash: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        {
                                            $eq: [
                                                "$transactionType",
                                                "ledger",
                                            ],
                                        },

                                        {
                                            $eq: [
                                                "$userId",
                                                userId,
                                            ],
                                        },

                                        {
                                            $ne: [
                                                "$creatorId",
                                                userId,
                                            ],
                                        },
                                    ],
                                },

                                {
                                    $ifNull: [
                                        `$${userLedgerField}`,
                                        0,
                                    ],
                                },

                                0,
                            ],
                        },
                    },

                    // ==================================
                    // DOWNLINE CASH
                    // ==================================
                    downlineCash: {
                        $sum: {
                            $cond: [
                                downlineCashCondition,

                                {
                                    $ifNull: [
                                        `$${userLedgerField}`,
                                        0,
                                    ],
                                },

                                0,
                            ],
                        },
                    },
                },
            },
        ];

      
      
      _d(personelPipeline , "personelPipeline")
        // ==========================================
        // RUN ALL QUERIES IN PARALLEL
        // ==========================================
        const [
            data,
            totalCount,
            personelData,
        ] = await Promise.all([
            CrickTransactionLogModel
                .aggregate(ledgerPipeline)
                .allowDiskUse(true),

            CrickTransactionLogModel.countDocuments(
                matchStage
            ),

            CrickTransactionLogModel
                .aggregate(personelPipeline)
                .allowDiskUse(true),
        ]);

        // ==========================================
        // RESPONSE
        // ==========================================
        return SendResponse(
            res,
            "success",
            "Dashboard report fetched successfully",
            {
                data,

                totalCount,

                pageNo,

                size,

                totalPages: Math.ceil(
                    totalCount / size
                ),

                personelData,

                fields: {
                    userLedgerField,
                    userProfitLossField,
                    downLineType,
                },
            }
        );

    } catch (error) {
        console.error(
            "myLedger Error:",
            {
                message: error.message,
                stack: error.stack,
            }
        );

        return SendResponse(
            res,
            "error",
            error.message ||
            "Something went wrong"
        );
    }
};


const totalProfitLoss = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;

        const userType = loginData.userType;
        const userProfitLossField = `${userType}ProfitLoss`;

        let matchFilter = whereHelper(loginData, {
            transactionType: { $in: ["profitLoss"] },
        });

      
        if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    

        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,
            ...(search && {
                $or: [
                    { remarks: { $regex: search, $options: "i" } },
                    { gameName: { $regex: search, $options: "i" } },
                    { eventName: { $regex: search, $options: "i" } },
                ],
            }),
        };

        const skip = Number(bodyData.size) * (Number(bodyData.pageNo) - 1);
        const limit = Number(bodyData.size);

      
      const dataPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        userId: `$${userType}Id`,
                        remarks: "$remarks",
                    },
                    profitLoss: {
                        $sum: {
                            $ifNull: [`$${userProfitLossField}`, 0],
                        },
                    },
                    transactionType: { $first: "$transactionType" },
                    isComm: { $first: "$isComm" },
                    eventName: { $first: "$eventName" },
                    remarks: { $first: "$remarks" },
                    gameName: { $first: "$gameName" },
                    result: { $first: "$result" },
                    date: { $first: "$date" },
                    createdAt: { $first: "$createdAt" },
                    updatedAt: { $first: "$updatedAt" },
                },
            },
            { $sort: { createdAt: -1 } }, // or { date: -1 }
            { $skip: skip },
            { $limit: limit },
        ];

        const personelPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: `$${userType}Id`,
                    userProfitLoss: {
                        $sum: {
                            $cond: [
                                { $eq: ["$transactionType", "profitLoss"] },
                                { $ifNull: [`$${userType}ProfitLoss`, 0] },
                                0,
                            ],
                        },
                    },
                },
            },
        ];

        const [data, totalCount, personelData] = await Promise.all([
            CrickTransactionLogModel.aggregate(dataPipeline).allowDiskUse(true),
            CrickTransactionLogModel.countDocuments(matchStage),
            CrickTransactionLogModel.aggregate(personelPipeline).allowDiskUse(true),
        ]);

        return SendResponse(
            res,
            "success",
            "Dashboard report fetched successfully",
            {
                data,
                totalCount,
                personelData,
            }
        );
    } catch (error) {
        console.error("totalProfitLoss Error:", {
            message: error.message,
            stack: error.stack,
        });

        return SendResponse(
            res,
            "error",
            error.message || "Something went wrong"
        );
    }
};

let downlineLedger = async (req, res) => {
  let bodyData = req.body;
  const loginUser = req.loggedInUser;

  const userType = loginUser.userType;
  let userPriority = UserTypes.indexOf(userType);
  let downLineType = UserTypes[userPriority - 1];
  let query = {};

  query.userType = downLineType;
  query = await whereHelper(loginUser, query);

  try {
    let groupCond = {
      _id: {
        eventName: "$eventName",
        marketId: "$marketId",
      },
      totalAmount: { $sum: "$amount" },
      createdAt: { $first: "$createdAt" },
      ledgerType: { $first: "$ledgerType" },
    };

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    returnData = {
      totalCoins: 0,
    };

    var resData = await LedgerModel.aggregate([
      {
        $match: query,
      },
      {
        $group: groupCond,
      },
      {
        $sort: { createdAt: -1, marketId: -1 },
      },
    ]);

    return SendResponse(res, "success", "dataFetched", resData);
  } catch (error) {
    console.log(error);
  }
};

const internationCasinoTotalProfitLoss = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;

        const userType = loginData.userType;
        const userProfitLossField = `${userType}ProfitLoss`;

        let matchFilter = whereHelper(loginData, {
            transactionType: { $in: ["profitLoss"] },
        });

     if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    

        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,
            ...(search && {
                $or: [
                    { remarks: { $regex: search, $options: "i" } },
                    { gameName: { $regex: search, $options: "i" } },
                    { eventName: { $regex: search, $options: "i" } },
                ],
            }),
        };

        const skip = Number(bodyData.size) * (Number(bodyData.pageNo) - 1);
        const limit = Number(bodyData.size);

      
      const dataPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        userId: `$${userType}Id`,
                        remarks: "$remarks",
                    },
                    profitLoss: {
                        $sum: {
                            $ifNull: [`$${userProfitLossField}`, 0],
                        },
                    },
                    transactionType: { $first: "$transactionType" },
                    isComm: { $first: "$isComm" },
                    eventName: { $first: "$eventName" },
                    remarks: { $first: "$remarks" },
                    gameName: { $first: "$gameName" },
                    result: { $first: "$result" },
                    date: { $first: "$date" },
                    createdAt: { $first: "$createdAt" },
                    updatedAt: { $first: "$updatedAt" },
                },
            },
            { $sort: { createdAt: -1 } }, // or { date: -1 }
            { $skip: skip },
            { $limit: limit },
        ];

        const personelPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: `$${userType}Id`,
                    userProfitLoss: {
                        $sum: {
                            $cond: [
                                { $eq: ["$transactionType", "profitLoss"] },
                                { $ifNull: [`$${userType}ProfitLoss`, 0] },
                                0,
                            ],
                        },
                    },
                },
            },
        ];

        const [data, totalCount, personelData] = await Promise.all([
            CrickTransactionLogModel.aggregate(dataPipeline).allowDiskUse(true),
            CrickTransactionLogModel.countDocuments(matchStage),
            CrickTransactionLogModel.aggregate(personelPipeline).allowDiskUse(true),
        ]);

        return SendResponse(
            res,
            "success",
            "Dashboard report fetched successfully",
            {
                data,
                totalCount,
                personelData,
            }
        );
    } catch (error) {
        console.error("totalProfitLoss Error:", {
            message: error.message,
            stack: error.stack,
        });

        return SendResponse(
            res,
            "error",
            error.message || "Something went wrong"
        );
    }
};

const topProfitLossUsers = async (req, res) => {
  try {
    const bodyData = req.body;
    const loginData = req.loggedInUser;
    const userType = loginData.userType;
    const aggregationOptions = {
      allowDiskUse: true,
    };

    // ==========================================
    // PAGINATION
    // ==========================================
    const winnerPage = Math.max(
      parseInt(bodyData.winnerPage, 10) || 1,
      1
    );

    const loserPage = Math.max(
      parseInt(bodyData.loserPage, 10) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(bodyData.limit, 10) || 100,
        1
      ),
      100
    );

    const winnerSkip = (winnerPage - 1) * limit;
    const loserSkip = (loserPage - 1) * limit;

    // ==========================================
    // DYNAMIC FIELDS
    // ==========================================
    const userProfitLossField = `${userType}ProfitLoss`;
    const userLedgerField = `${userType}LedgerAmount`;

    // ==========================================
    // MATCH FILTER
    // ==========================================
    let matchFilter = whereHelper(loginData);

    // ==========================================
    // DATE FILTER
    // ==========================================


    if (bodyData.fromDate && bodyData.toDate) {

      const fromDate = new Date(bodyData.fromDate);
      const toDate = new Date(bodyData.toDate);
      toDate.setHours(23, 59, 59, 999);
      matchFilter.date = {
        $gte: fromDate,
        $lte: toDate,
      };
    }

      if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    
    
    if (bodyData.intCasino && bodyData.intCasino == true) {
      matchFilter.marketType =  "internationalCasino"
    }

    // ==========================================
    // AGGREGATION
    // ==========================================
    const response = await CrickTransactionLogModel
      .aggregate([
        // ----------------------------------------
        // MATCH
        // ----------------------------------------
        {
          $match: matchFilter,
        },

        // ----------------------------------------
        // GROUP BY CLIENT
        // ----------------------------------------
        {
          $group: {
            _id: "$clientId",

            // Client profit/loss
            clientProfitLoss: {
              $sum: {
                $ifNull: ["$amount", 0],
              },
            },

            // User ledger
            userLedger: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$transactionType",
                      "profitLoss",
                    ],
                  },
                  {
                    $ifNull: [
                      `$${userLedgerField}`,
                      0,
                    ],
                  },
                  0,
                ],
              },
            },

            // Parent cash
            parentCash: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$transactionType",
                      "ledger",
                    ],
                  },
                  {
                    $ifNull: ["$amount", 0],
                  },
                  0,
                ],
              },
            },

            // Total bets
            totalBets: {
              $sum: 1,
            },
          },
        },

        // ----------------------------------------
        // LOOKUP USER
        // ----------------------------------------
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  username: 1,
                  name: 1,
                },
              },
            ],
            as: "user",
          },
        },

        // ----------------------------------------
        // CONVERT USER ARRAY TO OBJECT
        // ----------------------------------------
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },

        // ----------------------------------------
        // ADD USER DETAILS
        // ----------------------------------------
        {
          $project: {
            _id: 1,

            username: {
              $ifNull: ["$user.username", ""],
            },

            name: {
              $ifNull: ["$user.name", ""],
            },

            clientProfitLoss: 1,
            userLedger: 1,
            parentCash: 1,
            totalBets: 1,
          },
        },

        // ----------------------------------------
        // WINNERS / LOSERS
        // ----------------------------------------
        {
          $facet: {
            // ======================================
            // WINNERS
            // ======================================
            winners: [
              {
                $match: {
                  clientProfitLoss: {
                    $gt: 0,
                  },
                },
              },

              // Highest profit first
              {
                $sort: {
                  clientProfitLoss: -1,
                  _id: 1,
                },
              },

              {
                $skip: winnerSkip,
              },

              {
                $limit: limit,
              },
            ],

            // ======================================
            // LOSERS
            // ======================================
            losers: [
              {
                $match: {
                  clientProfitLoss: {
                    $lt: 0,
                  },
                },
              },

              // Biggest loss first
              {
                $sort: {
                  clientProfitLoss: 1,
                  _id: 1,
                },
              },

              {
                $skip: loserSkip,
              },

              {
                $limit: limit,
              },
            ],

            // ======================================
            // WINNER COUNT
            // ======================================
            winnerCount: [
              {
                $match: {
                  clientProfitLoss: {
                    $gt: 0,
                  },
                },
              },

              {
                $count: "total",
              },
            ],

            // ======================================
            // LOSER COUNT
            // ======================================
            loserCount: [
              {
                $match: {
                  clientProfitLoss: {
                    $lt: 0,
                  },
                },
              },

              {
                $count: "total",
              },
            ],
          },
        },
      ])
      .option(aggregationOptions);

    // ==========================================
    // RESULT
    // ==========================================
    const result = response[0] || {};

    const winners = result.winners || [];
    const losers = result.losers || [];

    const totalWinners =
      result.winnerCount?.[0]?.total || 0;

    const totalLosers =
      result.loserCount?.[0]?.total || 0;

    // ==========================================
    // FINAL RESPONSE
    // ==========================================
    return res.status(200).json({
      success: true,

      data: {
        winners,
        losers,

        winnerPagination: {
          page: winnerPage,
          limit,
          total: totalWinners,
          totalPages: Math.ceil(
            totalWinners / limit
          ),
          hasNextPage:
            winnerPage * limit < totalWinners,
          hasPreviousPage:
            winnerPage > 1,
        },

        loserPagination: {
          page: loserPage,
          limit,
          total: totalLosers,
          totalPages: Math.ceil(
            totalLosers / limit
          ),
          hasNextPage:
            loserPage * limit < totalLosers,
          hasPreviousPage:
            loserPage > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "topProfitLossUsers error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const sportsProfitLoss = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;

        const userType = loginData.userType;
        const userProfitLossField = `${userType}ProfitLoss`;

        let matchFilter = whereHelper(loginData, {
            transactionType: { $in: ["profitLoss"] },
        });

      
        if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    
        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,
            ...(search && {
                $or: [
                    { eventName: { $regex: search, $options: "i" } },
                ],
            }),
        };

        const skip = Number(bodyData.size) * (Number(bodyData.pageNo) - 1);
        const limit = Number(bodyData.size);

      
    
      if (bodyData.gameType) {
        matchStage.gameType = bodyData.gameType
      }

      if (bodyData.marketType) {
        matchStage.marketType = bodyData.marketType
      }
      
      const dataPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        userId: `$${userType}Id`,
                        eventName: "$eventName",
                    },
                    profitLoss: {
                        $sum: {
                            $ifNull: [`$${userProfitLossField}`, 0],
                        },
                    },
                    transactionType: { $first: "$transactionType" },
                    isComm: { $first: "$isComm" },
                    eventName: { $first: "$eventName" },
                    gameName: { $first: "$gameName" },
                    eventId: { $first: "$eventId" },
                    marketId: { $first: "$marketId" },
                    result: {
                          $first: {
                            $cond: [
                              {
                                $in: ["$marketType", ["bookmaker", "matchOdds"]]
                              },
                              "$result",
                              null
                            ]
                          }
                        },
                    date: { $first: "$date" },
                    createdAt: { $first: "$createdAt" },
                    updatedAt: { $first: "$updatedAt" },
                },
            },
            { $sort: { createdAt: -1 } }, // or { date: -1 }
            { $skip: skip },
            { $limit: limit },
        ];

        const personelPipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: `$${userType}Id`,
                    userProfitLoss: {
                        $sum: {
                            $cond: [
                                { $eq: ["$transactionType", "profitLoss"] },
                                { $ifNull: [`$${userType}ProfitLoss`, 0] },
                                0,
                            ],
                        },
                    },
                },
            },
        ];

        const [data, totalCount, personelData] = await Promise.all([
            CrickTransactionLogModel.aggregate(dataPipeline).allowDiskUse(true),
            CrickTransactionLogModel.countDocuments(matchStage),
            CrickTransactionLogModel.aggregate(personelPipeline).allowDiskUse(true),
        ]);

        return SendResponse(
            res,
            "success",
            "Dashboard report fetched successfully",
            {
                data,
                totalCount,
                personelData,
            }
        );
    } catch (error) {
        console.error("totalProfitLoss Error:", {
            message: error.message,
            stack: error.stack,
        });

        return SendResponse(
            res,
            "error",
            error.message || "Something went wrong"
        );
    }
};

const bethubPlusMinus = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;
        let userType = loginData.userType;
        let userId = loginData.userId;
        if (bodyData.userType) {
          userType = bodyData.userType
        }
        if (bodyData.userId) {
          userId = new ObjectId(bodyData.userId)
        }
      
        let userPriority = UserTypes.indexOf(userType);
      let downLineType = UserTypes[userPriority - 1];
      
      const userProfitLossField = `${userType}ProfitLoss`;
      const downlineProfitLossField = `${downLineType}ProfitLoss`;
      const userProfitLedgerField = `${userType}ProfitLoss`;
      const downlineLedgerField= `${downLineType}ProfitLoss`;

        let matchFilter = whereHelper(loginData, {
            transactionType: { $in: ["profitLoss"] },
        });

      
        if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
      }
    

        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,
            ...(search && {
                $or: [
                    { remarks: { $regex: search, $options: "i" } },
                    { gameName: { $regex: search, $options: "i" } },
                    { eventName: { $regex: search, $options: "i" } },
                ],
            }),
        };

        const skip = Number(bodyData.size) * (Number(bodyData.pageNo) - 1);
        const limit = Number(bodyData.size);

      
      _d(matchStage , "matchStage")
      
    const dataPipeline = [
  { $match: matchStage },

  {
    $group: {
      _id: `$${downLineType}Id`,
      // Market - All
      totalOddsClient: {
       $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "market"] },
                { $eq: ["$isComm", 0] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },

      // Market - Commission
      totalOddsCommt: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "market"] },
                { $eq: ["$isComm", 1] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },

      // Casino - All
      totalCasinoClient: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$gameName", "casino"] },
                { $eq: ["$isComm", 0] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },

      // Casino - Commission
      totalCasinoClientComm: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$gameName", "casino"] },
                { $eq: ["$isComm", 1] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },

      // Fancy / Session - All
      totalFancyClient: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "session"] },
                { $eq: ["$isComm", 0] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },

      // Fancy / Session - Commission
      totalFancyClientComm: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "session"] },
                { $eq: ["$isComm", 1] },
              ],
            },
            { $ifNull: ["$amount", 0] },
            0,
          ],
        },
      },
    },
  },
];

    

        const data = await CrickTransactionLogModel.aggregate(dataPipeline).allowDiskUse(true)
      
      
      

        return SendResponse(
            res,
            "success",
            "Dashboard report fetched successfully",
            data
        );
    } catch (error) {
        console.error("totalProfitLoss Error:", {
            message: error.message,
            stack: error.stack,
        });

        return SendResponse(
            res,
            "error",
            error.message || "Something went wrong"
        );
    }
};



const sessionProfitLossOfUserByMarket = async (req, res) => {
    try {
        const bodyData = req.body;
        const loginData = req.loggedInUser;
        let userType = loginData.userType;
        let userId = loginData.userId;
        if (bodyData.userType) {
          userType = bodyData.userType
        }
        if (bodyData.userId) {
          userId = new ObjectId(bodyData.userId)
        }
      
       let matchFilter = whereHelper(loginData, {
         transactionType: { $in: ["profitLoss"] },
        });

    
        if (bodyData.fromDate && bodyData.toDate) {
          const isTime = detectIsTime(bodyData.fromDate, bodyData.toDate);
          const dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate, false, isTime);
          if (isTime) {
           matchFilter.createdAt = dateWhere;
          } else {
            matchFilter.date = dateWhere;  
          }
        }
      
      
      if (bodyData.marketId) {
        matchFilter.marketId = bodyData.marketId
      }
    
        const search = bodyData.search?.trim();

        const matchStage = {
            ...matchFilter,
            ...(search && {
                $or: [
                    { remarks: { $regex: search, $options: "i" } },
                    { gameName: { $regex: search, $options: "i" } },
                    { eventName: { $regex: search, $options: "i" } },
                ],
            }),
        };

    
  
    const dataPipeline = [
  { $match: matchStage },

  {
    $group: {
      _id: "$selectionId",
      totalFancyClientAmount: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "session"] },
                { $eq: ["$isComm", 0] },
              ],
            },
            { $ifNull: [`$${userType}ProfitLoss`, 0] },
            0,
          ],
        },
      },
      totalFancyClientComm: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$betFor", "session"] },
                { $eq: ["$isComm", 1] },
              ],
            },
            { $ifNull: [`$${userType}ProfitLoss`, 0] },
            0,
          ],
        },
      },

    },
  },
];

    

const data = await CrickTransactionLogModel.aggregate(dataPipeline).allowDiskUse(true)
      
        return SendResponse(
            res,
            "success",
            "",
            data
        );
    } catch (error) {
        console.error("totalProfitLoss Error:", {
            message: error.message,
            stack: error.stack,
        });

        return SendResponse(
            res,
            "error",
            error.message || "Something went wrong"
        );
    }
};


module.exports = {
    myLedger,
    clientTree,
    totalProfitLoss,
    downlineLedger,
    internationCasinoTotalProfitLoss,
  topProfitLossUsers,
  sportsProfitLoss,
  bethubPlusMinus,
    sessionProfitLossOfUserByMarket
};
