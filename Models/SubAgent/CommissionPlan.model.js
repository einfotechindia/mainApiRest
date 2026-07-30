const mongoose = require("mongoose");

const TierSchema = new mongoose.Schema({
  minTurnover: { type: Number, default: 0 },
  turnoverPct: { type: Number, default: 0 },
  lossPct: { type: Number, default: 0 },
}, { _id: false });

const CommissionPlanSchema = new mongoose.Schema(
  {
    planName: { type: String, required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    registrationBonus: { type: Number, default: 0 },

    turnoverEnabled: { type: Boolean, default: false },
    turnoverPercentage: { type: Number, default: 0 },
    turnoverMinBets: { type: Number, default: 0 },

    lossCommissionEnabled: { type: Boolean, default: false },
    lossPercentage: { type: Number, default: 0 },
    lossMinAmount: { type: Number, default: 0 },

    tiersEnabled: { type: Boolean, default: false },
    tiers: [TierSchema],

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { transform(doc, ret) { ret.id = ret._id; delete ret.__v; } } }
);

module.exports = mongoose.model("CommissionPlan", CommissionPlanSchema);
