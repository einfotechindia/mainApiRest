const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const StatementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "user",
    },
    betId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    username: {
      type: String,
      required: false,
      default: null,
    },
    name: {
      type: String,
      required: false,
      default: null,
    },
    userType: {
      type: String,
      required: true,
    },
    gameType: {
      type: String,
      default: null,
    },
    sportsType: {
      type: String,
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      ref: "transaction",
    },
    amount: {
      type: Number,
      default: 0,
    },
    oldAmount: {
      type: Number,
      default: 0,
    },
    newAmount: {
      type: Number,
      default: 0,
    },
    remark: {
      type: String,
      default: null,
      maxlength: 255,
    },
    userRemark: {
      type: String,
      default: null,
      maxlength: 255,
    },
    statementFor: {
      type: String,
      default: null,
    },
    marketId: {
      type: String,
      default: 0,
    },
    eventId: {
      type: Number,
      default: 0,
    },
    roundId: {
      type: String,
      default: "",
    },
    isComm: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    selectionId: {
      type: String,
      default: "",
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

const StatementModel = mongoose.model("statement", StatementSchema);

(async () => {
  try {
    const existingIndexes = await StatementModel.collection.indexes();

    const neededIndexes = [
      {
        key: { userId: 1, _id: -1 },
      },
      { key: { userId: 1 } },
      { key: { betId: 1 } },
      { key: { roundId: 1 } },
      { key: { userId: 1, userType: 1, date: -1 } },
      {
        key: { marketId: 1, statementFor: 1 },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await StatementModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = StatementModel;
