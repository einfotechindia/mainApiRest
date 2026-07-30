const mongoose = require("mongoose");

const CommissionLogSchema = new mongoose.Schema(
  {
    subAgentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subAgentUsername: { type: String, default: "" },
    agentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientUsername: { type: String, default: "" },

    type: { type: String, enum: ["registration", "turnover", "loss"], required: true },
    amount: { type: Number, default: 0 },

    clientTurnover: { type: Number, default: 0 },
    clientLoss: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    period: { type: String, default: "" },

    planName: { type: String, default: "" },
    status: { type: String, enum: ["pending", "settled", "paid"], default: "pending" },
    settledAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform(doc, ret) { ret.id = ret._id; delete ret.__v; } } }
);

CommissionLogSchema.index({ subAgentId: 1, createdAt: -1 });
CommissionLogSchema.index({ agentId: 1, status: 1 });

module.exports = mongoose.model("CommissionLog", CommissionLogSchema);
