const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let MatkaListSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  shortName: {
    type: String,
    required: true,
  },
  sportsId: {
    type: String,
    default: 1000,
  },
  matkaEventId: {
    type: Number,
    required: true,
  },
  maxStake: {
    type: Number,
    default: 0,
  },
  minStake: {
    type: Number,
    default: 0,
  },
  betStatus: {
    type: Boolean,
    default: false,
  },
  matkaStatus: {
    type: Boolean,
    default: false,
  },
  isDeclare: {
    type: Number,
    default: 0,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  openTime: {
    type: String,
    default: false,
  },
  closeTime: {
    type: String,
    default: false,
  },
  showOpenTime: {
    type: String,
    default: "",
  },
  showCloseTime: {
    type: String,
    default: "",
  },
  resultTime: {
    type: String,
    default: "",
  },
  extendedCloseDay: {
    type: Number,
    default: 0,
  },
  extendedOpenDay: {
    type: Number,
    default: 0,
  },
  isHaroopAndarBahar: {
    type: Boolean,
    default: false,
  },
  chartLink: {
    type: String,
  },
  cancelRemark: {
    type: String,
    default : "cancel by system"
  },
  img: {
    type: String,
  },
  priority: {
    type: Number,
  },
  createdAt: {
    type: Number,
    default: () => Date.now(),
  },
  setting: {},
});

MatkaListSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model("MatkaList", MatkaListSchema, "MatkaList");
