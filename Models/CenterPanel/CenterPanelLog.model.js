const mongoose = require("mongoose");

const CenterPanelLogSchema = new mongoose.Schema(
  {
    ip: { type: String, default: null },
    path: { type: String, default: null },
    method: { type: String, default: "POST" },
    body: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["allowed", "blocked"],
      default: "blocked",
    },
    reason: { type: String, default: "" },
    responseMessage: { type: String, default: "" },
    operationType: { type: String, default: "" }, // bookmakerDecision, fancyDecision, etc.
    executionTime: { type: Number, default: 0 }, // ms
    timestamp: { type: Date, default: Date.now },
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

CenterPanelLogSchema.index({ createdAt: -1 });
CenterPanelLogSchema.index({ status: 1, createdAt: -1 });
CenterPanelLogSchema.index({ ip: 1, createdAt: -1 });
CenterPanelLogSchema.index({ operationType: 1, createdAt: -1 });

const CenterPanelLogModel = mongoose.model("CenterPanelLog", CenterPanelLogSchema);

module.exports = CenterPanelLogModel;
