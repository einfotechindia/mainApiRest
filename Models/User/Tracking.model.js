const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const TrackingActivitySchema = new mongoose.Schema(
  {
    username: {
      type: String,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      required: true,
    },
    ip: {
      type: String,
    },
    previousUrl: {
      type: String,
    },
    hitUrl: {
      type: String,
    },
    authToken: {
      type: String,
    },
    jwtToken: {
      type: String,
    },
    postData: {},
    getData: {},
    bodyData: {},
    headers: {},
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
  },
  {
    timestamps: true,
  }
);

const TrackingActivityModel = mongoose.model(
  "TrackingActivity",
  TrackingActivitySchema
);

TrackingActivitySchema.index({
  username: 1,
});

TrackingActivitySchema.index({
  ip: 1,
});

TrackingActivitySchema.index({
  hitUrl: 1,
});

module.exports = TrackingActivityModel;
