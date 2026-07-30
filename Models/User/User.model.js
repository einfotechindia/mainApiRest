const moment = require("moment");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const SALT_WORK_FACTOR = 10;

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    phpUserId: {
      type: Number,
      default: 0,
    },
    userType: {
      type: String,
      required: true,
      enum: [
        "client",
        "agent",
        "superagent",
        "master",
        "subadmin",
        "admin",
        "superadmin",
        "subowner",
        "owner",
      ],
      default: "client",
    },
    authenticateToken: {
      type: String,
      default: null,
    },
    mobile: {
      type: String,
      default: null,
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
    transactionPassword: {
      type: String,
      required: false,
    },
    name: {
      type: String,
      default: null,
    },
    userPriority: {
      type: Number,
      default: 1,
    },
    coins: {
      type: Number,
      default: 0,
    },
    exposure: {
      type: Number,
      default: 0,
    },
    totalProfitLoss: {
      type: Number,
      default: 0,
    },
    exposureLimit: {
      type: Number,
      default: 0,
    },
    downlineCount: {},
    parentDeatails: {},
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorName: {
      type: String,
      default: null,
    },
    status: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    betStatus: {
      type: Boolean,
      default: true,
    },
    matchStatus: {
      type: Boolean,
      default: true,
    },
    casinoStatus: {
      type: Boolean,
      default: true,
    },
    matkaStatus: {
      type: Boolean,
      default: true,
    },
    userMatchShare: {
      type: Number,
      default: 0,
    },
    userPoliticsShare: {
      type: Number,
      default: 0,
    },
    userCasinoShare: {
      type: Number,
      default: 0,
    },
    userMatkaShare: {
      type: Number,
      default: 0,
    },
    userShowMatchShare: {
      type: Number,
      default: 0,
    },
    userShowCasinoShare: {
      type: Number,
      default: 0,
    },
    userShowMatkaShare: {
      type: Number,
      default: 0,
    },
    userCommissionType: {
      type: String,
      enum: ["NoCommission", "BetByBet", "OnlyOnMinus"],
      default: "NoCommission",
    },
    userMatchCommission: {
      type: Number,
      default: 0,
    },
    userSessionCommission: {
      type: Number,
      default: 0,
    },
    userBetfairCommission: {
      type: Number,
      default: 0,
    },
    userCasinoCommission: {
      type: Number,
      default: 0,
    },
    userMatkaCommission: {
      type: Number,
      default: 0,
    },
    userFlatCommissionPermission: {
      type: Boolean,
      default: true,
    },
    userFlatSharePermission: {
      type: Boolean,
      default: true,
    },
    userFixLimit: {
      type: Number,
      default: 0,
    },
    reference: {
      type: String,
      default: null,
    },
    creditReference: {
      type: Number,
      default: 0,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    subadminId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    masterId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    superagentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    casinoCompanyId: {
      type: String,
      default: null,
    },
    casinoToken: {
      type: String,
      default: null,
    },
    selfCuttingPermission: {
      type: Boolean,
      default: false,
    },
    selfCuttingCoins: {
      type: Number,
      default: 0,
    },
    isPasswordChanged: {
      type: Boolean,
      default: false,
    },
    isRent: {
      type: Boolean,
      default: false,
    },
    isDirect: {
      type: Boolean,
      default: false,
    },
    downlineCreateLimit: {
      type: Number,
      default: 100000,
    },
    referral: {
      type: String,
      default: "",
    },
    jwtToken: {
      type: String,
      default: null,
    },
    otp: {
      type: Number,
      default: 0,
    },
    shareType: {
      type: String,
      default: "fixed",
    },
    rateReffrence: {
      type: Number,
      default: 0.01,
    },
    intCasinoStatus: {
      type: Boolean,
      default: false,
    },
    intCasinoShare: {
      type: Number,
      default: 0,
    },
    intCasinoExpoLimit: {
      type: Number,
      default: 0,
    },
    intCasinoMultiply: {
      type: Number,
      default: 1,
    },
    creatorPriority: {
      type: Number,
      default: 0,
    },
    matkaLimitPerNumber: {
      type: Number,
      default: 0,
    },
    isOneClickBet: {
      type: Boolean,
      default: false,
    },
    oneClickBetAmount: {
      type: Number,
      default: 10,
    },
    statusUpdateId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    betStatusUpdateId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    creatorShareData: {},
    shareData: {},
    betChipsData: {},
    betMaxMinData: {},
    allowedDomains: {},
    subagentReferralCode: { type: String, default: null },
    subagentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    parentData: {},
    extraData: {},
    minMaxComm: {},
    date: {
      type: Number,
      default: () => moment().startOf("day").toDate(),
    },
    betChipsModal: {
      type: Boolean,
      default: false,
    },
    lastIp: {
      type: String,
      default: "",
    },
    lastLoginTime: {
      type: Date,
      default: null
    },
    isSettle: {
      type: Boolean,
      default: false
    },
    notes: {
      type: String,
      default: ""
    },
    isOtpRequired: {
      type: Boolean,
      default: false
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    betDelay: {
      type: Number,
      default: 0
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

UserSchema.pre("save", function (next) {
  var user = this;
  if (!user.isModified("password")) return next();
  bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
    if (err) return next(err);
    bcrypt.hash(user.password, salt, function (err, hash) {
      if (err) return next(err);
      user.password = hash;
      next();
    });
  });
});

UserSchema.pre("save", function (next) {
  var user = this;
  if (!user.isModified("transactionPassword")) return next();
  bcrypt.genSalt(SALT_WORK_FACTOR, function (err, salt) {
    if (err) return next(err);
    bcrypt.hash(user.transactionPassword, salt, function (err, hash) {
      if (err) return next(err);
      user.transactionPassword = hash;
      next();
    });
  });
});

UserSchema.options.toJSON = {
  transform: function (doc, ret, options) {
    ret.id = ret._id;
    delete ret._id;
    // delete ret.password;
    // delete ret.otp;
    delete ret.chunk;
    delete ret.__v;
    return ret;
  },
};

const UserModel = mongoose.model("user", UserSchema);

const parentFields = [
  "ownerId",
  "subownerId",
  "superadminId",
  "adminId",
  "subadminId",
  "masterId",
  "superagentId",
  "agentId",
];

(async () => {
  try {
    const existingIndexes = await UserModel.collection.indexes();

    const neededIndexes = [
      ...parentFields.map((field) => ({
        key: { [field]: 1, userType: 1, isDeleted: 1, createdAt: -1, _id: -1 },
        options: {
          name: `idx_${field}_userType_isDeleted_createdAt_id_desc`,
        },
      })),

      { key: { creatorId: 1 }, options: { name: "idx_creatorId" } },
      { key: { clientId: 1 }, options: { name: "idx_clientId" } },
      { key: { userId: 1 }, options: { name: "idx_userId" } },

      {
        key: { checkUsername: 1 },
        options: {
          name: "uq_checkUsername",
          unique: true,
          partialFilterExpression: {
            checkUsername: { $type: "string" },
          },
        },
      },

      {
        key: { username: 1 },
        options: {
          name: "uq_username",
          unique: true,
        },
      },
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => existing.name === index.options.name
      );

      if (!exists) {
        await UserModel.collection.createIndex(index.key, index.options);
        console.log(`Index created: ${index.options.name}`);
      }
    }
  } catch (err) {
    // console.error("Error checking/creating indexes:", err);
  }
})();


module.exports = UserModel;
