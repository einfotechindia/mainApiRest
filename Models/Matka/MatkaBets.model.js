const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let MatkaBetListSchema = new Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sportsId: {
      type: Number,
      default: 1000,
    },
    matkaEventId: {
      type: Number,
      required: true,
    },
    marketId: {
      type: Number,
      default: 0,
    },
    matkaName: {
      type: String,
      default: "",
    },
    gameType: {
      type: String,
      default: "",
    },
    betType: {
      type: String,
      default: "",
    },
    betNumber: {
      type: Number,
      required: true,
    },
    amount: {
      type: Number,
      default: 0,
      required: true,
    },
    rate: {
      type: Number,
      default: 0,
      required: true,
    },
    profit: {
      type: Number,
      default: 0,
    },
    loss: {
      type: Number,
      default: 0,
    },
    profitLoss: {
      type: Number,
      default: 0,
    },
    result: {
      type: Number,
      default: null,
    },
    oddEvenResult: {
      type: String,
      default: null,
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
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
      required: true,
    },
    shareData: {},
    userInfo: {},
    ip: {
      type: String,
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

MatkaBetListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};


const MatkaBetListModel = mongoose.model(
  "MatkaBetList",
  MatkaBetListSchema,
  "MatkaBetList"
);

(async () => {
  try {
    const existingIndexes = await MatkaBetListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          matkaEventId: 1,
        },
      },
      {
        key: {
          clientId: 1,
          isDeleted: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await MatkaBetListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = MatkaBetListModel;
