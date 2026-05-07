const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      default: true,
    },
    for: {
      type: String,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const NotificationModel = mongoose.model("Notification", NotificationSchema);

module.exports = NotificationModel;
