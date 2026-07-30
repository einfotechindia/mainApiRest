const mongoose = require("mongoose");

const SubAgentRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    status: {
      type: Number,
      default: 1,
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

// Unique role name per agent
SubAgentRoleSchema.index({ name: 1, agentId: 1 }, { unique: true });

const SubAgentRoleModel = mongoose.model("SubAgentRole", SubAgentRoleSchema);

module.exports = SubAgentRoleModel;
