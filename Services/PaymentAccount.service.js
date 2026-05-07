const PaymentAccountModel = require("../Models/PaymentAccount.model");
const { ObjectId } = require("mongodb");
const { SendResponse } = require("../Helpers/ResponseMapper");
const { whereHelper } = require("../Helpers/CommonHelper");

const createAccount = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    if (!body.accountName || !body.accountType) {
      return SendResponse(res, "error", "Account name and type are required");
    }

    const accountData = {
      accountName: body.accountName,
      accountType: body.accountType,
      status: body.status || "active",
      reference: body.reference || "",
      fromAmount: Number(body.fromAmount) || 0,
      toAmount: Number(body.toAmount) || 0,
      // Bank
      bankName: body.bankName || "",
      accountNumber: body.accountNumber || "",
      accountHolderName: body.accountHolderName || "",
      ifscCode: body.ifscCode || "",
      branchName: body.branchName || "",
      // UPI
      upiId: body.upiId || "",
      mobileNo: body.mobileNo || "",
      qrImage: body.qrImage || "",
      // Crypto
      walletId: body.walletId || "",
      cryptoType: body.cryptoType || "",
      cryptoQrImage: body.cryptoQrImage || "",
      // Hierarchy
      userId: new ObjectId(loginData.userId || loginData._id),
      username: loginData.username,
      userType: loginData.userType,
      ownerId: loginData.ownerId ? new ObjectId(loginData.ownerId) : null,
      subownerId: loginData.subownerId ? new ObjectId(loginData.subownerId) : null,
      superadminId: loginData.superadminId ? new ObjectId(loginData.superadminId) : null,
      adminId: loginData.adminId ? new ObjectId(loginData.adminId) : null,
      subadminId: loginData.subadminId ? new ObjectId(loginData.subadminId) : null,
      masterId: loginData.masterId ? new ObjectId(loginData.masterId) : null,
      superagentId: loginData.superagentId ? new ObjectId(loginData.superagentId) : null,
      agentId: loginData.agentId ? new ObjectId(loginData.agentId) : null,
      creatorId: new ObjectId(loginData.userId || loginData._id),
    };

    const newAccount = await PaymentAccountModel.create(accountData);
    return SendResponse(res, "success", "Account created successfully", newAccount);
  } catch (error) {
    console.error("PaymentAccount create error:", error);
    return SendResponse(res, "error", error.message || "Failed to create account");
  }
};

const updateAccount = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    if (!body.accountId) {
      return SendResponse(res, "error", "Account ID is required");
    }

    const updateData = {};
    const allowedFields = [
      "accountName", "accountType", "status", "reference", "fromAmount", "toAmount",
      "bankName", "accountNumber", "accountHolderName", "ifscCode", "branchName",
      "upiId", "mobileNo", "qrImage",
      "walletId", "cryptoType", "cryptoQrImage",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = field === "fromAmount" || field === "toAmount"
          ? Number(body[field])
          : body[field];
      }
    }

    const filter = {
      _id: new ObjectId(body.accountId),
      creatorId: new ObjectId(loginData.userId || loginData._id),
    };

    const updated = await PaymentAccountModel.findOneAndUpdate(
      filter,
      { $set: updateData },
      { new: true }
    );

    if (!updated) {
      return SendResponse(res, "error", "Account not found or unauthorized");
    }

    return SendResponse(res, "success", "Account updated successfully", updated);
  } catch (error) {
    console.error("PaymentAccount update error:", error);
    return SendResponse(res, "error", error.message || "Failed to update account");
  }
};

const getAccountList = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    let filter = {
      creatorId: new ObjectId(loginData.userId || loginData._id),
    };

    if (body.status && body.status !== "all") {
      filter.status = body.status;
    }
    if (body.accountType && body.accountType !== "all") {
      filter.accountType = body.accountType;
    }
    if (body.search) {
      filter.$or = [
        { accountName: { $regex: body.search, $options: "i" } },
        { accountNumber: { $regex: body.search, $options: "i" } },
        { upiId: { $regex: body.search, $options: "i" } },
        { reference: { $regex: body.search, $options: "i" } },
        { bankName: { $regex: body.search, $options: "i" } },
        { accountHolderName: { $regex: body.search, $options: "i" } },
      ];
    }

    const accounts = await PaymentAccountModel.find(filter).sort({ createdAt: -1 });
    return SendResponse(res, "success", "Account list fetched", accounts);
  } catch (error) {
    console.error("PaymentAccount list error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch accounts");
  }
};

const getAccountById = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    if (!body.accountId) {
      return SendResponse(res, "error", "Account ID is required");
    }

    const account = await PaymentAccountModel.findOne({
      _id: new ObjectId(body.accountId),
      creatorId: new ObjectId(loginData.userId || loginData._id),
    });

    if (!account) {
      return SendResponse(res, "error", "Account not found");
    }

    return SendResponse(res, "success", "Account fetched", account);
  } catch (error) {
    console.error("PaymentAccount getById error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch account");
  }
};

const toggleStatus = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    if (!body.accountId) {
      return SendResponse(res, "error", "Account ID is required");
    }

    const account = await PaymentAccountModel.findOne({
      _id: new ObjectId(body.accountId),
      creatorId: new ObjectId(loginData.userId || loginData._id),
    });

    if (!account) {
      return SendResponse(res, "error", "Account not found");
    }

    account.status = account.status === "active" ? "inactive" : "active";
    await account.save();

    return SendResponse(res, "success", `Account ${account.status}`, account);
  } catch (error) {
    console.error("PaymentAccount toggleStatus error:", error);
    return SendResponse(res, "error", error.message || "Failed to toggle status");
  }
};

const deleteAccount = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;

    if (!body.accountId) {
      return SendResponse(res, "error", "Account ID is required");
    }

    const deleted = await PaymentAccountModel.findOneAndDelete({
      _id: new ObjectId(body.accountId),
      creatorId: new ObjectId(loginData.userId || loginData._id),
    });

    if (!deleted) {
      return SendResponse(res, "error", "Account not found or unauthorized");
    }

    return SendResponse(res, "success", "Account deleted successfully");
  } catch (error) {
    console.error("PaymentAccount delete error:", error);
    return SendResponse(res, "error", error.message || "Failed to delete account");
  }
};

const getAccountsByAmount = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    const body = req.body;
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return SendResponse(res, "error", "Valid amount is required");
    }

    let filter = whereHelper(loginData);
    filter.status = "active";
    filter.fromAmount = { $lte: amount };
    filter.toAmount = { $gte: amount };

    const accounts = await PaymentAccountModel.find(filter).sort({ createdAt: -1 });
    return SendResponse(res, "success", "Matching accounts fetched", accounts);
  } catch (error) {
    console.error("PaymentAccount getByAmount error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch accounts");
  }
};

module.exports = {
  createAccount,
  updateAccount,
  getAccountList,
  getAccountById,
  toggleStatus,
  deleteAccount,
  getAccountsByAmount,
};
