const mongoose = require("mongoose");
const AccountType = new mongoose.Schema(
  {
      accountTypeName: {
          type: String,
          default: null,
        },
      accountTypeImg: {
        type: String,
        default: null,
      },
      priority: {
          type: Number,
          default: 0,
        },
      remark: {
        type: String,
        default: null,
      },
      status: {
        type: Boolean,
        default: true,
      },
 
  },
  {
    timestamps: true,
  }
);

const AccountTypeModel = mongoose.model("AccountType", AccountType);

module.exports = AccountTypeModel;
