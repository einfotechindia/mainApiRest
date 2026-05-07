const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let matkaResultChartSchema = new Schema(
  {
    matkaName: {
      type: String,
      default: "",
    },
    matkaEventId: {
      type: Number,
      required: true,
    },
    openNumber: {
      type: Number,
      default: null,
    },
    closeNumber: {
      type: Number,
      default: null,
    },
    jodiNumber: {
      type: Number,
      default: null,
    },
    singleOpenNumber: {
      type: Number,
      default: null,
    },
    singleCloseNumber: {
      type: Number,
      default: null,
    },
    openOddEven: {
      type: String,
      default: "",
    },
    closeOddEven: {
      type: String,
      default: "",
    },
    openDeclare: {
      type: Boolean,
      default: false,
    },
    isDeclare: {
      type: Boolean,
      default: false,
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

matkaResultChartSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};


matkaResultChartSchema.index({
  matkaEventId: 1,
});

matkaResultChartSchema.index({
  matkaEventId: 1,
  date: -1,
});

module.exports = mongoose.model(
  "matkaResultChart",
  matkaResultChartSchema,
  "matkaResultChart"
);
