const mongoose = require("mongoose");
const Cateogeory = new mongoose.Schema(
  {
    cateogeoryName: {
      type: String,
      default: null,
    },
    cateogeoryType: {
      type: String,
      default: null,
    },
    cateogeoryId: {
        type: mongoose.Schema.Types.ObjectId,
      default: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    }
  },
  {
    timestamps: true,
  }
);

const CateogeorykModel = mongoose.model("Cateogeory", Cateogeory);

module.exports = CateogeorykModel;
