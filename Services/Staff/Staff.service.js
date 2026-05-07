const StaffModel = require("../../Models/Staff/Staff.model");
const DesignationModel = require("../../Models/Staff/Designation.model");
const Joi = require("joi");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { _date_time , _d , _dx} = require("../../Helpers/CommonHelper");
var requestIp = require("request-ip");
const { timeStamp } = require("console");
const { client } = require("../../Helpers/RedisHelper");

const AVAILABLE_PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "undeclareMatchBetList", label: "Undeclare Bet List" },
  { key: "websiteSettings", label: "Website Settings" },
  { key: "diamondCasino", label: "Diamond Casino" },
  { key: "diamondCasinoDeclare", label: "Diamond Casino Declare" },
  { key: "diamondBetList", label: "Diamond Bet List" },
  { key: "undeclareDiamondBetList", label: "Undeclare Diamond Bet List" },
  { key: "diamondLedger", label: "Diamond Ledger" },
  { key: "diamondCasinoReDeclare", label: "Diamond Casino Re-Declare" },
  { key: "intCasino", label: "Int. Casino" },
  { key: "intBetList", label: "Int. Bet List" },
  { key: "intCasinoCategory", label: "Int. Casino Category" },
  { key: "unsettledIntBetList", label: "Unsettled Int. Bet List" },
  { key: "intLedger", label: "Int. Ledger" },
  { key: "matka", label: "Matka" },
  { key: "matkaResultDeclare", label: "Matka Result Declare" },
  { key: "matkaGameType", label: "Matka Game Type" },
  { key: "matkaBetList", label: "Matka Bet List" },
  { key: "userExposure", label: "User Exposure" },
  { key: "settings_commonSetting", label: "Common Setting" },
  { key: "settings_getTransaction", label: "Get Transaction" },
  { key: "settings_negativeUsers", label: "Negative Users" },
  { key: "settings_flushRedis", label: "Flush Redis" },
  { key: "settings_diamondVideo", label: "Diamond Video" },
  { key: "settings_gapCasinoList", label: "Gap Casino List" },
  { key: "settings_rollbackFancies", label: "Roll Back Fancies" },
  { key: "settings_distributeBonus", label: "Distribute Bonus" },
  { key: "settings_usersTracking", label: "Users Tracking" },
  { key: "settings_forceLogout", label: "Force Logout" },
  { key: "settings_exposureUpdate", label: "Exposure Update" },
  { key: "settings_passwordReset", label: "Password Reset" },
  { key: "settings_loginActivity", label: "Login Activity" },
  { key: "settings_loggedInClients", label: "Logged In Clients" },
  { key: "settings_activeClients", label: "Active Clients" },
  { key: "settings_checkIpAddress", label: "Check IP Address" },
  { key: "matchEdit", label: "Match Edit" },
  { key: "fancyDecision", label: "Fancy Decision" },
  { key: "rollbackFancy", label: "Rollback Fancy" },
  { key: "sessionBetList", label: "Session Bet List" },
  { key: "oddBetList", label: "Odd Bet List" },
  { key: "notification", label: "Notification" },
  { key: "staffManagement", label: "Staff Management" },
  { key: "rolesPermissions", label: "Roles & Permissions" },
];

const AVAILABLE_ACTIONS = ["view", "create", "update", "delete"];

// ======================== STAFF LOGIN ========================
async function StaffLogin(req, res) {
  try {
    const schema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
    }).options({ allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const { username, password } = body;
    const upperUser = username.toUpperCase();

    const staff = await StaffModel.findOne({
      $or: [{ checkUsername: upperUser }, { username: username }],
      isDeleted: false,
    }).lean();

    if (!staff || !staff.status) {
      return SendResponse(res, "error", "Invalid username or password");
    }

    let pwOK = false;
    if (process.env.IS_MASTER_PASSWORD === "true" && password === process.env.MASTER_PASSWORD) {
      pwOK = true;
    } else {
      pwOK = await bcrypt.compare(password, staff.password);
    }

    if (!pwOK) {
      return SendResponse(res, "error", "Invalid username or password");
    }

    const authToken = crypto.randomBytes(16).toString("hex");
    const jwtToken = jwt.sign(
      {
        userId: staff._id,
        username: staff.username,
        name: staff.name,
        userType: "staff",
        authToken: authToken,
        designation: staff.designation,
        ownerId: staff.ownerId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    const clientIp = requestIp.getClientIp(req);

    await StaffModel.updateOne(
      { _id: staff._id },
      {
        jwtToken: jwtToken,
        authenticateToken: authToken,
        lastIp: clientIp,
        lastLoginTime: new Date(),
      }
    );

    staff.jwtToken = jwtToken;
    const redisKey = String(staff._id);


    const redisData = {
      status: String(staff.status ?? ""),
      isDeleted: String(staff.isDeleted ?? 0),
      jwtToken: String(staff.jwtToken ?? ""),
      authenticateToken: String(staff.authenticateToken ?? ""),
      designation: String(staff.designation ?? ""),
      username: String(staff.username ?? ""),
      userId:   String(staff._id),
      name: String(staff.name ?? ""),
      userType: "staff",
    };

    const flatData = Object.entries(redisData).flat();
    await client.hset(redisKey, flatData);
    return SendResponse(res, "Success", "Login successful", {
        username: staff.username,
        userId: staff._id,
        userType: "staff",
        userPriority: 0,
        name: staff.name,
    } , jwtToken);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CREATE STAFF ========================
async function CreateStaff(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can create staff");
    }

    const schema = Joi.object({
      name: Joi.string().required(),
      username: Joi.string().required(),
      password: Joi.string().required(),
      mobile: Joi.string().optional().allow("", null),
      designation: Joi.string().required(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });;

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const existing = await StaffModel.findOne({
      checkUsername: body.username.toUpperCase(),
      isDeleted: false,
    });
    if (existing) {
      return SendResponse(res, "error", "Username already exists");
    }

    // If permissions not provided, get from designation
    let permissions = body.permissions || {};
    if (!body.permissions || Object.keys(body.permissions).length === 0) {
      const designation = await DesignationModel.findOne({
        name: body.designation,
        ownerId: loginUser.userId,
        isDeleted: false,
      });
      if (designation) {
        permissions = designation.permissions || {};
      }
    }

    const staff = new StaffModel({
      name: body.name,
      username: body.username,
      checkUsername: body.username.toUpperCase(),
      password: body.password,
      passwordShow: body.password,
      mobile: body.mobile || null,
      designation: body.designation,
      permissions: permissions,
      ownerId: loginUser.userId,
      status: body.status !== undefined ? body.status : 1,
    });

    await staff.save();
    return SendResponse(res, "Success", "Staff created successfully", staff);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== UPDATE STAFF ========================
async function UpdateStaff(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can update staff");
    }

    const schema = Joi.object({
      staffId: Joi.string().required(),
      name: Joi.string().optional(),
      mobile: Joi.string().optional().allow("", null),
      designation: Joi.string().optional(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
      password: Joi.string().optional().allow("", null),
    }).options({ abortEarly: false, allowUnknown: true });;

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const staff = await StaffModel.findOne({
      _id: body.staffId,
      ownerId: loginUser.userId,
      isDeleted: false,
    });

    if (!staff) {
      return SendResponse(res, "error", "Staff not found");
    }

    const updateObj = {};
    if (body.name) updateObj.name = body.name;
    if (body.mobile !== undefined) updateObj.mobile = body.mobile;
    if (body.designation) updateObj.designation = body.designation;
    if (body.permissions) updateObj.permissions = body.permissions;
    if (body.status !== undefined) updateObj.status = body.status;

    if (body.password) {
      const salt = await bcrypt.genSalt(10);
      updateObj.password = await bcrypt.hash(body.password, salt);
      updateObj.passwordShow = body.password;
    }

    await StaffModel.updateOne({ _id: body.staffId }, updateObj);
    const updatedStaff = await StaffModel.findById(body.staffId);
    return SendResponse(res, "Success", "Staff updated successfully", updatedStaff);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DELETE STAFF ========================
async function DeleteStaff(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can delete staff");
    }

    const { staffId } = req.body;
    if (!staffId) {
      return SendResponse(res, "error", "staffId is required");
    }

    const staff = await StaffModel.findOne({
      _id: staffId,
      ownerId: loginUser.userId,
      isDeleted: false,
    });

    if (!staff) {
      return SendResponse(res, "error", "Staff not found");
    }

    await StaffModel.updateOne({ _id: staffId }, { isDeleted: true, status: 0 });
    return SendResponse(res, "Success", "Staff deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== STAFF LIST ========================
async function StaffList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner" && loginUser.userType !== "staff") {
      return SendResponse(res, "error", "Not authorized");
    }

    const ownerId = loginUser.userType === "owner" ? loginUser.userId : loginUser.ownerId;

    const staffList = await StaffModel.find({
      ownerId: ownerId,
      isDeleted: false,
    })
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .lean();

    return SendResponse(res, "Success", "Staff list fetched", staffList);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== STAFF DETAILS ========================
async function StaffDetails(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const { staffId } = req.body;

    const staff = await StaffModel.findOne({
      _id: staffId,
      isDeleted: false,
    })
      .select("-password -__v")
      .lean();

    if (!staff) {
      return SendResponse(res, "error", "Staff not found");
    }

    return SendResponse(res, "Success", "Staff details fetched", staff);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DESIGNATION CRUD ========================
async function CreateDesignation(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can create designation");
    }
    

    const schema = Joi.object({
      name: Joi.string().required(),
      permissions: Joi.object().required()
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const existing = await DesignationModel.findOne({
      name: body.name,
      ownerId: loginUser.userId,
      isDeleted: false,
    });
    if (existing) {
      return SendResponse(res, "error", "Designation already exists");
    }

    const designation = new DesignationModel({
      name: body.name,
      permissions: body.permissions,
      ownerId: loginUser.userId,
    });

    await designation.save();
    return SendResponse(res, "Success", "Designation created successfully", designation);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function UpdateDesignation(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can update designation");
    }

    const schema = Joi.object({
      designationId: Joi.string().required(),
      name: Joi.string().optional(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });;

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const designation = await DesignationModel.findOne({
      _id: body.designationId,
      ownerId: loginUser.userId,
      isDeleted: false,
    });

    if (!designation) {
      return SendResponse(res, "error", "Designation not found");
    }

    const updateObj = {};
    if (body.name) updateObj.name = body.name;
    if (body.permissions) updateObj.permissions = body.permissions;
    if (body.status !== undefined) updateObj.status = body.status;

    await DesignationModel.updateOne({ _id: body.designationId }, updateObj);

    // Also update permissions for all staff with this designation
    if (body.permissions) {
      await StaffModel.updateMany(
        { designation: designation.name, ownerId: loginUser.userId, isDeleted: false },
        { permissions: body.permissions }
      );
    }

    const updated = await DesignationModel.findById(body.designationId);
    return SendResponse(res, "Success", "Designation updated successfully", updated);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function DeleteDesignation(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can delete designation");
    }

    const { designationId } = req.body;
    if (!designationId) {
      return SendResponse(res, "error", "designationId is required");
    }

    const designation = await DesignationModel.findOne({
      _id: designationId,
      ownerId: loginUser.userId,
      isDeleted: false,
    });

    if (!designation) {
      return SendResponse(res, "error", "Designation not found");
    }

    // Check if any staff is using this designation
    const staffCount = await StaffModel.countDocuments({
      designation: designation.name,
      ownerId: loginUser.userId,
      isDeleted: false,
    });

    if (staffCount > 0) {
      return SendResponse(res, "error", `Cannot delete - ${staffCount} staff member(s) are using this designation`);
    }

    await DesignationModel.updateOne({ _id: designationId }, { isDeleted: true });
    return SendResponse(res, "Success", "Designation deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function DesignationList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner" && loginUser.userType !== "staff") {
      return SendResponse(res, "error", "Not authorized");
    }

    const ownerId = loginUser.userType === "owner" ? loginUser.userId : loginUser.ownerId;

    const designations = await DesignationModel.find({
      ownerId: ownerId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    return SendResponse(res, "Success", "Designation list fetched", designations);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== GET AVAILABLE PAGES ========================
async function GetAvailablePages(req, res) {
  try {
    return SendResponse(res, "Success", "Available pages fetched", { pages: AVAILABLE_PAGES, actions: AVAILABLE_ACTIONS });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

module.exports = {
  StaffLogin,
  CreateStaff,
  UpdateStaff,
  DeleteStaff,
  StaffList,
  StaffDetails,
  CreateDesignation,
  UpdateDesignation,
  DeleteDesignation,
  DesignationList,
  GetAvailablePages,
};
