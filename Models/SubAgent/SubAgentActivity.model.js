const mongoose = require("mongoose");

const SubAgentActivitySchema = new mongoose.Schema(
  {
    subAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    subAgentName: {
      type: String,
      required: true,
    },
    subAgentUsername: {
      type: String,
      required: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      // login, deposit_approve, deposit_reject, withdraw_approve, withdraw_reject,
      // client_status_update, client_bet_status, client_casino_status, client_matka_status, client_match_status,
      // account_update, domain_update, password_change, subagent_create, subagent_update, subagent_delete,
      // role_create, role_update, role_delete
    },
    category: {
      type: String,
      enum: ["auth", "deposit_withdraw", "client", "account", "domain", "subagent", "role", "other"],
      default: "other",
    },
    description: {
      type: String,
      required: true,
    },
    targetUser: {
      type: String,
      default: null, // username of affected client/subagent
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: null,
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

// Index for fast agent-scoped queries
SubAgentActivitySchema.index({ agentId: 1, createdAt: -1 });
SubAgentActivitySchema.index({ subAgentId: 1, createdAt: -1 });

const SubAgentActivityModel = mongoose.model("SubAgentActivity", SubAgentActivitySchema);

module.exports = SubAgentActivityModel;
