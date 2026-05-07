// const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

let InternationalCasinoBetListSchema = new Schema(
  {
    betType: {
      type: String,
      default: "",
    },
    txnType: {
      type: String,
      default: "",
    },
    actualBetAmount: {
      type: Number,
      default: 0,
    },
    amount: {
      type: Number,
      default: 0,
    },
    debitAmount: {
      type: Number,
      default: 0,
    },
    creditAmount: {
      type: Number,
      default: 0,
    },
    rollbackAmount: {
      type: Number,
      default: 0,
    },
    profitLoss: {
      type: Number,
      default: 0,
    },
    rollbackType: {
      type: String,
      default: "",
    },
    rollbackReason: {
      type: String,
      default: "",
    },
    gameId: {
      type: String,
      default: "",
      required: true,
    },
    gameName: {
      type: String,
      default: "",
      required: true,
    },
    gameCode: {
      type: String,
      default: "",
      required: true,
    },
    providerName: {
      type: String,
      default: "",
      required: true,
    },
    subProviderName: {
      type: String,
      default: "",
      required: true,
    },
    operatorId: {
      type: String,
      default: "",
    },
    reqId: {
      type: String,
      default: "",
      required: true,
    },
    transactionId: {
      type: String,
      default: "",
      required: true,
    },
    roundId: {
      type: String,
      default: "",
      required: true,
    },
    token: {
      type: String,
      default: "",
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
    isDeclare: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isRollback: {
      type: Boolean,
      default: false,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
    time: {
      type: Number,
      default: () => Date.now(),
    },
    bodyData: {},
    betDetails: {},
    userInfo: {},
    ip: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

InternationalCasinoBetListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};



const InternationalCasinoBetListModel = mongoose.model(
  "InternationalCasinoBetList",
  InternationalCasinoBetListSchema,
  "InternationalCasinoBetList"
);

(async () => {
  try {
    const existingIndexes =
      await InternationalCasinoBetListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          clientId: 1,
          agentId: 1,
          superagentId: 1,
          masterId: 1,
          adminId: 1,
          subadminId: 1,
          subownerId: 1,
          superadminId: 1,
          ownerId: 1,
        },
      },
      {
        key: {
          clientId: 1,
        },
      },
      {
        key: {
          date: -1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await InternationalCasinoBetListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = InternationalCasinoBetListModel;
