const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let CasinoBetListSchema = new Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  amount: {
    type: Number,
    default: "",
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
  roundId: {
    type: String,
    default: "",
    required: true,
  },
  sid: {
    type: String,
    default: 0,
    required: true,
  },
  eventId: {
    type: Number,
    default: 0,
    required: true,
  },
  betFor: {
    type: String,
    default: "",
  },
  odds: {
    type: Number,
    default: 0,
  },
  userInfo: {},
  posArray: {},
  casinoType: {
    type: String,
    default: "",
    required: true,
  },
  betType: {
    type: String,
    default: "L",
  },
  playerName: {
    type: String,
    default: "",
    required: true,
  },
  result: {
    type: String,
    default: "",
  },
  showResult: {
    type: String,
    default: "",
  },
  resultDetails: {},
  isVirtual: {
    type: Boolean,
    default: false,
  },
   isBetfairCasino: {
    type: Boolean,
    default: false,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  isPartiallyDeclare: {
    type: Number,
    default: 0,
  },
  isDeclare: {
    type: Number,
    default: 0,
  },
  date: {
    type: Number,
    default: () => moment().startOf("day").toDate(),
  },
  createdAt: {
    type: Number,
    default: () => Date.now(),
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
  ip: {
    type: String,
    default: null,
  },
});

CasinoBetListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

// CasinoBetListSchema.index(
//   {
//     isDeclare: 1,
//     isPartiallyDeclare: 1,
//     isDeleted: 1,
//   },
//   { expireAfterSeconds: 3600 }
// );





const CasinoBetListModel = mongoose.model(
  "CasinoBetList",
  CasinoBetListSchema,
  "CasinoBetList"
);



(async () => {
  try {
    const existingIndexes = await CasinoBetListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          roundId: 1,
          isDeleted: 1,
          _id: -1,
        },
      },
      {
        key: {
          clientId: 1,
          eventId: 1,
          isDeclare: 1,
          isDeleted: 1,
          _id: -1,
          date: 1,
        },
      },
      {
        key: {
          isDeclare: 1,
          isPartiallyDeclare: 1,
          isDeleted: 1,
        },
      },
      {
        key: {
          roundId: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await CasinoBetListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = CasinoBetListModel;
