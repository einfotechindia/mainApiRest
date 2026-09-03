const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const FancyBetsListSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    marketId: {
      type: String,
      required: true,
    },
    fancyType: {
      type: String,
      default: "Normal",
    },
    gtype: {
      type: String,
      default: "fancy",
    },
    eventId: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    selectionId: {
      type: String,
      required: true,
    },
    decisionRun: {
      type: Number,
      default: null,
    },
    sessionName: {
      type: String,
      required: true,
    },
    odds: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    run: {
      type: Number,
      required: true,
    },
    isComm: {
      type: Number,
      default: 1,
    },
    isDeclare: {
      type: Number,
      default: 0,
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
    deletedRemark: {
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
    ip: {
      type: String,
      default: null,
    },
    ownerAmount: {
      type: Number,
      default: 0,
    },
    subownerAmount: {
      type: Number,
      default: 0,
    },
    superadminAmount: {
      type: Number,
      default: 0,
    },
    adminAmount: {
      type: Number,
      default: 0,
    },
    subadminAmount: {
      type: Number,
      default: 0,
    },
    masterAmount: {
      type: Number,
      default: 0,
    },
    superagentAmount: {
      type: Number,
      default: 0,
    },
    agentAmount: {
      type: Number,
      default: 0,
    },
    clientAmount: {
      type: Number,
      default: 0,
    },
    userInfo: {},
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

const FancyListModel = mongoose.model("FancyBetList", FancyBetsListSchema);







(async () => {
  try {
    const existingIndexes = await FancyListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          ownerId: 1,
          isDeclare: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          agentId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          superagentId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          masterId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          subadminId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          adminId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          superadminId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          clientId: 1,
          marketId: 1,
          _id: -1,
          isDeleted: 1,
        },
      },
      {
        key: {
          clientId: 1,
          agentId: 1,
          isDeclare: 1,
          isDeleted: 1,
          _id: -1,
        },
      },
      {
        key: {
          marketId: 1,
          selectionId: 1,
        },
      },
      {
        key: {
          userId: 1,
        },
      },
      // Compound index for session bet placement query
      {
        key: {
          userId: 1,
          marketId: 1,
          selectionId: 1,
          isDeleted: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await FancyListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();



module.exports = FancyListModel;
