const moment = require("moment");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let matkaGameTypeSchema = new Schema({
  gameType: {
    type: String,
    required: true,
  },
  timesAmount: {
    type: Number,
    required: true,
  },
});

matkaGameTypeSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model(
  "matkaGameType",
  matkaGameTypeSchema,
  "matkaGameType"
);
