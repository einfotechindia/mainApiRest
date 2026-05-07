const moment = require("moment");
moment.tz.setDefault("Asia/Kolkata");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

let FancyCateogeory = new Schema(
  {
    cateogeryType: {
      type: [String],
      required: true,
      validate: {
        validator: function(value) {
          return Array.isArray(value) && value.every(item => typeof item === 'string');
        },
        message: props => `cateogeryType must be an array of strings.`
      }
    },
    cateogeryName: {
      type: String,
      required: true,
    },
    maximumAmount: {
      type: Number,
      required: [true, 'Maximum amount is required'],
      min: [100, 'Maximum amount should be greater than 100'],
      max: [50000, 'Maximum amount cannot exceed 50000']
    },
    minimumAmount: {
      type: Number,
      default: 100,
      min: [1, 'Minimum amount should be at least 1'],
    },
    betDelay: {
      type: Number,
      default: 0,
      min: [0, 'Bet delay cannot be negative'],
      max: [30, 'Bet delay cannot exceed 30 seconds'],
    },
    commission: {
      type: String,
      enum: ["allow", "disallow"],
      default: "allow",
    },
    color: {
      type: String,
      default: "#6366f1",
    },
    icon: {
      type: String,
      default: "",
    },
    permission: {
      type: String,
      enum: ["allow", "disallow"],
      default: "allow",
    },
    status: {
      type: Boolean,
      default: true,
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

// Custom transformation to remove __v field
FancyCateogeory.options.toJSON = {
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  },
};

module.exports = mongoose.model("FancyCateogeory", FancyCateogeory, "FancyCateogeory");
