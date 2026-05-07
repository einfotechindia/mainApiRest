const mongoose = require("mongoose");
const moment = require("moment");

const MarketBlockSchema = new mongoose.Schema(
    {
    subownerId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },
    providerArray: [],
    subProviderArray: [],
    gameIdArray: [],
    date: {
        type: Number,
        default: () => moment().unix() * 1000,
        },
  },
  {
    timestamps: true,
  }
);


const internationalCasinoBlockMarket = mongoose.model("internationalCasinoBlockMarket", MarketBlockSchema);
module.exports = internationalCasinoBlockMarket;
