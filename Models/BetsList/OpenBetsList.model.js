const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const OpenBetsListSchema = new mongoose.Schema(
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
    isDeclare: {
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
    teamName: {
      type: String,
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
  },
  {
    timestamps: true,
  }
);

const OpenBetsListModel = mongoose.model("OpenBetsList", OpenBetsListSchema);





(async () => {
  try {
    const existingIndexes = await OpenBetsListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          marketId: 1,
        },
      },
      {
        key: {
          userId: 1,
        },
      },
      {
        key: {
          userId: 1,
          marketId: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await OpenBetsListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = OpenBetsListModel;
