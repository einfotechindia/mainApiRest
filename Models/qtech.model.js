const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let QtechGamesSchema = new Schema({
  gameId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  providerName: {
    type: String,
    required: true,
  },
  providerId: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  subCategory: {
    type: String,
    required: true,
  },
  gameType: {
    type: String,
    required: true,
  },
  demoSupport: {
    type: Boolean,
    required: false,
  },
  freeRoundSupport: {
    type: Boolean,
    required: false,
  },
  languages: {},
  themes: {},
  features: {},
  volatility: {},
  clientTypes: {},
  images: {},
  date: {
    type: Number,
    default: () => moment().startOf("day").toDate(),
  },
  createdAt: {
    type: Number,
    default: () => Date.now(),
  },
});

QtechGamesSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
};
module.exports = mongoose.model("QtechGames", QtechGamesSchema, "QtechGames");
