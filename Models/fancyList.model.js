const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const FancyListSchema = new mongoose.Schema(
  {
    marketId: {
      type: String,
      required: true,
    },
    eventId: {
      type: String,
      default: null,
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
    },
    isDeclare: {
      type: Number,
      default: 0,
    },
    isRollback: {
      type: Boolean,
      default: false,
    },
    rollBackTime: {
      type: String,
      default: "",
    },
    isCancel: {
      type: Number,
      default: 0,
    },
    deletedRemark: {
      type: String,
      default: null,
    },
    isAdvance: {
      type: Boolean,
      default: false,
    },
    fancyType: {
      type: String,
      default: "fancy",
    },
    gtype: {
      type: String,
      default: "Normal",
    },
    oldResults: [],
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

const FancyListModel = mongoose.model("FancyList", FancyListSchema);



(async () => {
  try {
    const existingIndexes = await FancyListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          eventId: 1,
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



FancyListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.chunk;
    delete ret.__v;
    return ret;
  },
};


module.exports = FancyListModel;
