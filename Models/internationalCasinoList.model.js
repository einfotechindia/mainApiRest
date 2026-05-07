const mongoose = require("mongoose");

const InternationalCasinoListSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
    },
    gameName: {
      type: String,
    },
    gameCode: {
      type: String,
    },
    providerName: {
      type: String,
    },
    subProviderName: {
      type: String,
    },
    imgUrl: {
      type: String,
    },
    category: {
      type: String,
    },
    status: {
      type: String,
      default: "ACTIVE",
    },
    isLobby: {
      type: Boolean,
      default: false,
    },
    isTrending: {
      type: Boolean,
      default: false,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      default: 0,
    },
    cateogeoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subCateogeoryId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    urlThumb: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const InternationalCasinoListModel = mongoose.model(
  "InternationalCasinoList",
  InternationalCasinoListSchema
);

(async () => {
  try {
    const existingIndexes =
      await InternationalCasinoListModel.collection.indexes();
    const neededIndexes = [
      {
        key: {
          gameId: 1,
        },
      },
      {
        key: {
          category: 1,
        },
      },
      {
        key: {
          providerName: 1,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await InternationalCasinoListModel.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();

module.exports = InternationalCasinoListModel;
