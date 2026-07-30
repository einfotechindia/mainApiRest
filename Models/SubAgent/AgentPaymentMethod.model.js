const mongoose = require("mongoose");

const AgentPaymentMethodSchema = new mongoose.Schema(
  {
    // Display
    label: { type: String, required: true }, // "My HDFC Account", "PhonePe Main"
    type: {
      type: String,
      required: true,
      enum: ["bank", "paytm", "phonepe", "gpay", "bhim_upi", "generic_upi", "usdt_trc20", "usdt_erc20", "usdt_bep20", "other_crypto"],
    },

    // Method icon/image (shown to client on frontend)
    methodIcon: { type: String, default: "" },

    // Bank fields
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountHolder: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    branch: { type: String, default: "" },

    // UPI fields
    upiId: { type: String, default: "" },
    upiName: { type: String, default: "" },
    mobile: { type: String, default: "" },
    qrImage: { type: String, default: "" },

    // Crypto fields
    walletAddress: { type: String, default: "" },
    network: { type: String, default: "" },
    cryptoQr: { type: String, default: "" },

    // Conditions
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 0 }, // 0 = no limit
    dailyLimit: { type: Number, default: 0 }, // 0 = unlimited
    dailyUsed: { type: Number, default: 0 },
    dailyUsedDate: { type: String, default: "" },

    // Schedule
    scheduleEnabled: { type: Boolean, default: false },
    scheduleFrom: { type: String, default: "00:00" },
    scheduleTo: { type: String, default: "23:59" },

    // Assignment
    domains: [{ type: String }], // empty = all domains
    note: { type: String, default: "" }, // internal note

    // Status & Priority
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    priority: { type: Number, default: 0 }, // lower = shown first

    // Hierarchy
    agentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    createdBy: { type: String, default: "" }, // "agent" or subagent username
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

AgentPaymentMethodSchema.index({ agentId: 1, status: 1, priority: 1 });

module.exports = mongoose.model("AgentPaymentMethod", AgentPaymentMethodSchema);
