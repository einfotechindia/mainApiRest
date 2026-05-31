const mongoose = require("mongoose");
const CurrencySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
    },
    symbol: {
      type: String,
      required: false,
    },
    rate: {
      type: String,
      required: false,
    },
    conversionRate: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const CurrencyModel = mongoose.model("currency", CurrencySchema);

module.exports = CurrencyModel;
