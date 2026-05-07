const moment = require("moment");
moment.tz.setDefault("Asia/Kolkata");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let FancyCateogeoryAudit = new Schema(
  {
    fancyCateogeoryId: {
      type: Schema.Types.ObjectId,
      ref: "FancyCateogeory",
      required: true,
    },
    action: {
      type: String,
      enum: ["create", "update", "delete", "statusChange", "permissionChange", "bulkUpdate"],
      required: true,
    },
    changedBy: {
      type: String,
      required: true,
    },
    changedByUserId: {
      type: Schema.Types.ObjectId,
    },
    previousData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    newData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    description: {
      type: String,
      default: "",
    },
    date: {
      type: Number,
      default: () => moment().startOf("day").unix() * 1000,
    },
  },
  {
    timestamps: true,
  }
);

FancyCateogeoryAudit.options.toJSON = {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model("FancyCateogeoryAudit", FancyCateogeoryAudit, "FancyCateogeoryAudit");
