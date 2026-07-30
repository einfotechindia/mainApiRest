const mongoose = require("mongoose");

const AvailablePageSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    group: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    status: {
      type: Number,
      default: 1, // 1=active, 0=inactive
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
      },
    },
  }
);

const AvailablePageModel = mongoose.model("AvailablePage", AvailablePageSchema);

module.exports = AvailablePageModel;
