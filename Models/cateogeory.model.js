const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const CateogeoryList = new mongoose.Schema(
  {
      cateogeoryName: {
          type: String,
          default: null,
        },
      parentCateogeoryName: {
        type: String,
        default: null,
      },
      cateogeoryType: {
        type: String,
        required: true,
        enum: [
            "main",
            "sub",
        ],
        default: "main",
      },
      cateogeoryImg: {
        type: String,
        default: null,
      },
      cateogeoryId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      priority: {
          type: Number,
          default: 0,
        },
      remark: {
        type: String,
        default: null,
      },
      status: {
        type: Number,
        default: 1,
      },
 
  },
  {
    timestamps: true,
  }
);

const cateogeoryModel = mongoose.model("CateogeoryList", CateogeoryList);


(async () => {
  try {
    const existingIndexes = await cateogeoryModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
            cateogeoryType: 1,
        },
      },
      {
        key: {
            cateogeoryId: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await cateogeoryModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = cateogeoryModel;
