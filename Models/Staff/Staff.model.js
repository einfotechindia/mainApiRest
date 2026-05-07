const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_WORK_FACTOR = 10;

const StaffSchema = new mongoose.Schema(
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
      default: "staff",
      enum: ["staff"],
    },
    designation: {
      type: String,
      required: true,
    },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
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
StaffSchema.pre("save", function (next) {
  const staff = this;
  if (!staff.isModified("password")) return next();
  bcrypt.genSalt(SALT_WORK_FACTOR, (err, salt) => {
    if (err) return next(err);
    bcrypt.hash(staff.password, salt, (err, hash) => {
      if (err) return next(err);
      staff.password = hash;
      next();
    });
  });
});

const StaffModel = mongoose.model("Staff", StaffSchema);

module.exports = StaffModel;
