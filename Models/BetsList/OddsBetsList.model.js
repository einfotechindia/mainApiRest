const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const OddsBetsListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    marketId: {
      type: String,
      default: null,
    },
    betfairMarketId: {
      type: String,
      default: null,
    },
    matchName: {
      type: String,
      default: null,
    },
    eventId: {
      type: String,
      default: null,
    },
    sportsId: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: null,
    },
    selectionId: {
      type: String,
      default: null,
    },
    decisionSelectionId: {
      type: String,
      default: null,
    },
    decisionSelectionIdArray: [],
    wonTeamName: {
      type: String,
      default: null,
    },
    teamName: {
      type: String,
      default: null,
    },
    odds: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      default: null,
    },
    oddsType: {
      type: String,
      default: null,
    },
    profit: {
      type: Number,
      default: null,
    },
    loss: {
      type: Number,
      default: null,
    },
    profitLossAmount: {
      type: Number,
      default: null,
    },
    isDeleted: {
      type: Number,
      default: 0,
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    deletedRemark: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
    userInfo: {},
    positionInfo: {},
  },
  {
    timestamps: true,
  }
);

const OddsBetsListModel = mongoose.model("OddsBetsList", OddsBetsListSchema);





(async () => {
  try {
    const existingIndexes = await OddsBetsListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          subownerId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          ownerId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          superadminId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          adminId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          subadminId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          masterId: 1,
          isDeclare: 1,
          marketId: 1,
          _id: -1,
        },
      },
      {
        key: {
          superagentId: 1,
          clientId: 1,
          isDeclare: 1,
          isDeleted: 1,
          _id: -1,
        },
      },
      {
        key: {
          agentId: 1,
          eventId: 1,
          isDeleted: 1,
          _id: -1,
        },
      },
      {
        key: {
          marketId: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await OddsBetsListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = OddsBetsListModel;
