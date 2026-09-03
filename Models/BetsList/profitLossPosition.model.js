const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const ProfitLossPositionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    marketId: {
      type: String,
      default: null,
    },
    eventId: {
      type: String,
      default: null,
    },
    eventName: {
      type: String,
      default: null,
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    result: {
      type: String,
      default: "",
    },
    isCasino: {
      type: Number,
      default: 0,
    },
    positionType: {
      type: String,
      default: "cricket",
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
    clientOddsAmount: {
      type: Number,
      default: 0,
    },
    clientSessionAmount: {
      type: Number,
      default: 0,
    },
    clientSessionTurnover: {
      type: Number,
      default: 0,
    },
    clientOddsComm: {
      type: Number,
      default: 0,
    },
    clientSessionComm: {
      type: Number,
      default: 0,
    },
    clientNetAmount: {
      type: Number,
      default: 0,
    },
    ownerOddsComm: {
      type: Number,
      default: 0,
    },
    subownerOddsComm: {
      type: Number,
      default: 0,
    },
    superadminOddsComm: {
      type: Number,
      default: 0,
    },
    adminOddsComm: {
      type: Number,
      default: 0,
    },
    subadminOddsComm: {
      type: Number,
      default: 0,
    },
    masterOddsComm: {
      type: Number,
      default: 0,
    },
    superagentOddsComm: {
      type: Number,
      default: 0,
    },
    agentOddsComm: {
      type: Number,
      default: 0,
    },
    ownerSessionComm: {
      type: Number,
      default: 0,
    },
    subownerSessionComm: {
      type: Number,
      default: 0,
    },
    superadminSessionComm: {
      type: Number,
      default: 0,
    },
    adminSessionComm: {
      type: Number,
      default: 0,
    },
    subadminSessionComm: {
      type: Number,
      default: 0,
    },
    masterSessionComm: {
      type: Number,
      default: 0,
    },
    superagentSessionComm: {
      type: Number,
      default: 0,
    },
    agentSessionComm: {
      type: Number,
      default: 0,
    },
    ownerNetProfitLoss: {
      type: Number,
      default: 0,
    },
    subownerNetProfitLoss: {
      type: Number,
      default: 0,
    },
    superadminNetProfitLoss: {
      type: Number,
      default: 0,
    },
    adminNetProfitLoss: {
      type: Number,
      default: 0,
    },
    subadminNetProfitLoss: {
      type: Number,
      default: 0,
    },
    masterNetProfitLoss: {
      type: Number,
      default: 0,
    },
    superagentNetProfitLoss: {
      type: Number,
      default: 0,
    },
    agentNetProfitLoss: {
      type: Number,
      default: 0,
    },
    ownerLedgerAmt: {
      type: Number,
      default: 0,
    },
    subownerLedgerAmt: {
      type: Number,
      default: 0,
    },
    superadminLedgerAmt: {
      type: Number,
      default: 0,
    },
    adminLedgerAmt: {
      type: Number,
      default: 0,
    },
    subadminLedgerAmt: {
      type: Number,
      default: 0,
    },
    masterLedgerAmt: {
      type: Number,
      default: 0,
    },
    superagentLedgerAmt: {
      type: Number,
      default: 0,
    },
    agentLedgerAmt: {
      type: Number,
      default: 0,
    },

    ownerNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    subownerNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    superadminNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    adminNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    subadminNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    masterNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    superagentNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    agentNetProfitLossSelf: {
      type: Number,
      default: 0,
    },
    parentData: {},
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

const ProfitLossPositionModel = mongoose.model(
  "ProfitLossPosition",
  ProfitLossPositionSchema
);


(async () => {
  try {
    const existingIndexes = await ProfitLossPositionModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          superagentId: 1,
          marketId: 1,
        },
      },
      {
        key: {
          marketId: 1,
        },
      },
      {
        key: {
          eventId: 1,
          date: -1,
        },
      },
      {
        key: {
          agentId: 1,
          marketId: 1,
        },
      },
      {
        key: {
          clientId: 1,
          marketId: 1,
        },
      },
      // Missing — Reports aggregation uses these userType+marketId combos
      { key: { masterId: 1, marketId: 1 } },
      { key: { subadminId: 1, marketId: 1 } },
      { key: { adminId: 1, marketId: 1 } },
      { key: { superadminId: 1, marketId: 1 } },
      { key: { subownerId: 1, marketId: 1 } },
      { key: { ownerId: 1, marketId: 1 } },
      // Date+isDeclare+isCasino — decision deleteMany
      { key: { date: 1, isDeclare: 1, isCasino: 1 } },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await ProfitLossPositionModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();


module.exports = ProfitLossPositionModel;
