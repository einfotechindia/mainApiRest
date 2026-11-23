const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const ActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
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
    operatorName: {
      type: String,
      default: null,
    },
    username: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
    },
    activityType: {
      type: String,
      default: null,
    },
    oldActivity: {
      type: String,
      default: 0,
    },
    newActivity: {
      type: String,
      default: 0,
    },
    remark: {
      type: String,
      default: null,
    },
    date: {
      type: String,
      default: () => moment().unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

const ActivityModel = mongoose.model("activity", ActivitySchema);


(async () => {
  try {
    const existingIndexes = await ActivityModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          userId: 1,
        },
      },
      {
        key: {
          activityType: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await ActivityModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = ActivityModel;
