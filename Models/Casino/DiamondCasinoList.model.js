const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let DiamondCasinoListSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  shortName: {
    type: String,
    required: true,
  },
  eventId: {
    type: Number,
    required: true,
  },
  setting: {},
  priority: {
    type: Number,
    required: 0,
  },
  maxStake: {
    type: Number,
    default: 0,
  },
  minStake: {
    type: Number,
    default: 0,
  },
  fetchData: {
    type: String,
    enum: ["socket", "cache"],
  },
  socketURL: {
    type: String,
    default: "",
  },
  cacheURL: {
    type: String,
    default: "",
  },
  betStatus: {
    type: Boolean,
    default: false,
  },
  cashinoStatus: {
    type: Boolean,
    default: false,
  },
  videoUrl1: {
    type: String,
    default: "",
  },
  videoUrl2: {
    type: String,
    default: "",
  },
  videoUrl3: {
    type: String,
    default: "",
  },
  videoUrlType: {
    type: String,
    enum: ["1", "2", "3"],
    default: "1",
  },
  isDisable: {
    type: Boolean,
    default: false,
  },
  isVirtual: {
    type: Boolean,
    default: false,
  },
  date: {
    type: Number,
    default: () => moment().startOf("day").unix() * 1000,
  },
  time: {
    type: Number,
    default: () => Date.now(),
  },
  selectionIdArray: {},
  betDelay: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Number,
    default: () => Date.now(),
  },
});

DiamondCasinoListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

DiamondCasinoListSchema.index({ eventId: 1 });

module.exports = mongoose.model(
  "diamondCasinoList",
  DiamondCasinoListSchema,
  "diamondCasinoList"
);
