const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_WORK_FACTOR = 10;

const SubAgentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      unique: true,
      required: true,
    },
    checkUsername: {
      type: String,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    passwordShow: {
      type: String,
      required: true,
    },
    mobile: {
      type: String,
      default: null,
    },
    userType: {
      type: String,
      default: "subagent",
      enum: ["subagent"],
    },
    roleName: {
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
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    referralCode: {
      type: String,
      default: "",
    },
    commissionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: Number,
      default: 1, // 1=active, 0=inactive
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    jwtToken: {
      type: String,
      default: "",
    },
    authenticateToken: {
      type: String,
      default: null,
    },
    lastIp: {
      type: String,
      default: null,
    },
    lastLoginTime: {
      type: Date,
      default: null,
    },
    is2FAEnabled: {
      type: Boolean,
      default: false,
    },
    twoFASecret: {
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

// Password hashing
SubAgentSchema.pre("save", function (next) {
  const subAgent = this;
  if (!subAgent.isModified("password")) return next();
  bcrypt.genSalt(SALT_WORK_FACTOR, (err, salt) => {
    if (err) return next(err);
    bcrypt.hash(subAgent.password, salt, (err, hash) => {
      if (err) return next(err);
      subAgent.password = hash;
      next();
    });
  });
});

const SubAgentModel = mongoose.model("SubAgent", SubAgentSchema);

module.exports = SubAgentModel;
