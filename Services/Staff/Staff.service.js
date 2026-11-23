const StaffModel = require("../../Models/Staff/Staff.model");
const DesignationModel = require("../../Models/Staff/Designation.model");
const AvailablePageModel = require("../../Models/Staff/AvailablePage.model");
const StaffActivityModel = require("../../Models/Staff/StaffActivity.model");
const Joi = require("joi");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { _d , _dx} = require("../../Helpers/CommonHelper");
var requestIp = require("request-ip");
const { client } = require("../../Helpers/RedisHelper");

// Log staff activity (fire-and-forget, never blocks main flow)
function logStaffActivity(data) {
  setImmediate(() => {
    StaffActivityModel.create(data).catch(err => {
      console.error("StaffActivity log error:", err.message);
    });
  });
}

const AVAILABLE_ACTIONS = ["view", "create", "update", "delete"];
const REDIS_PAGES_KEY = "available_pages";
const REDIS_PAGES_TTL = 86400; // 24 hours

// Fetch available pages from Redis cache, fallback to DB
async function getAvailablePagesFromDB() {
  try {
    // Try Redis first
    const cached = await client.get(REDIS_PAGES_KEY).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch (_) {}
    }

    // Fetch from DB
    const pages = await AvailablePageModel.find({ status: 1, isDeleted: false })
      .sort({ sortOrder: 1 })
      .select("key label group sortOrder -_id")
      .lean();

    // Cache in Redis
    if (pages.length > 0) {
      await client.set(REDIS_PAGES_KEY, JSON.stringify(pages), "EX", REDIS_PAGES_TTL).catch(() => {});
    }

    return pages;
  } catch (err) {
    console.error("getAvailablePagesFromDB error:", err.message);
    return [];
  }
}

// Invalidate Redis cache when pages are modified
async function invalidatePagesCache() {
  await client.del(REDIS_PAGES_KEY).catch(() => {});
}

// ─── Login Rate Limiter (per IP + per username) ───────────────
const LOGIN_ATTEMPTS = new Map(); // key → { count, lastAttempt, lockedUntil }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 min lockout
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 min window

function checkLoginRateLimit(key) {
  const now = Date.now();
  const entry = LOGIN_ATTEMPTS.get(key);
  if (!entry) return { allowed: true };
  // Locked out?
  if (entry.lockedUntil && now < entry.lockedUntil) {
    const waitSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, waitSec };
  }
  // Reset if window expired
  if (now - entry.lastAttempt > ATTEMPT_WINDOW_MS) {
    LOGIN_ATTEMPTS.delete(key);
    return { allowed: true };
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_DURATION_MS;
    return { allowed: false, waitSec: Math.ceil(LOCK_DURATION_MS / 1000) };
  }
  return { allowed: true };
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = LOGIN_ATTEMPTS.get(key) || { count: 0, lastAttempt: now };
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_DURATION_MS;
  }
  LOGIN_ATTEMPTS.set(key, entry);
}

function clearLoginAttempts(key) {
  LOGIN_ATTEMPTS.delete(key);
}

// Periodic cleanup of expired entries (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of LOGIN_ATTEMPTS) {
    if (now - entry.lastAttempt > ATTEMPT_WINDOW_MS) LOGIN_ATTEMPTS.delete(key);
  }
}, 600000);

// OTP replay protection moved to common helper: Helpers/TwoFactorAuth.js

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
    const clientIpLogin = requestIp.getClientIp(req);
    const userAgentLogin = req.headers["user-agent"] || null;

    // ─── Rate Limit Check (by IP + by username) ───
    const ipKey = `ip:${clientIpLogin}`;
    const userKey = `user:${upperUser}`;
    const ipCheck = checkLoginRateLimit(ipKey);
    const userCheck = checkLoginRateLimit(userKey);

    if (!ipCheck.allowed) {
      return SendResponse(res, "error", `Too many attempts. Try again in ${ipCheck.waitSec} seconds`);
    }
    if (!userCheck.allowed) {
      return SendResponse(res, "error", `Account temporarily locked. Try again in ${userCheck.waitSec} seconds`);
    }

    const staff = await StaffModel.findOne({
      $or: [{ checkUsername: upperUser }, { username: username }],
      isDeleted: false,
    }).lean();

    // ─── Generic error for invalid user (don't reveal if user exists) ───
    if (!staff || !staff.status) {
      recordLoginFailure(ipKey);
      recordLoginFailure(userKey);
      if (staff) {
        logStaffActivity({
          staffId: staff._id, staffName: staff.name, staffUsername: staff.username, ownerId: staff.ownerId,
          action: "login_failed", category: "auth",
          description: staff.status ? "Login failed - user not found" : "Login failed - account inactive",
          ip: clientIpLogin, userAgent: userAgentLogin,
        });
      }
      return SendResponse(res, "error", "Invalid credentials");
    }

    // ─── Password Verification ───
    let pwOK = false;
    if (process.env.IS_MASTER_PASSWORD === "true" && password === process.env.MASTER_PASSWORD) {
      // Master password STILL requires 2FA if enabled (cannot bypass)
      pwOK = true;
    } else {
      pwOK = await bcrypt.compare(password, staff.password);
    }

    if (!pwOK) {
      recordLoginFailure(ipKey);
      recordLoginFailure(userKey);
      logStaffActivity({
        staffId: staff._id, staffName: staff.name, staffUsername: staff.username, ownerId: staff.ownerId,
        action: "login_failed", category: "auth",
        description: `Login failed - wrong password (attempt ${(LOGIN_ATTEMPTS.get(userKey)?.count || 0)})`,
        ip: clientIpLogin, userAgent: userAgentLogin,
      });
      return SendResponse(res, "error", "Invalid credentials");
    }

    // ─── 2FA Check (cannot be bypassed, even with master password) ───
    if (staff.twoFactorEnabled && staff.twoFactorSecret) {
      const otpCode = body.otpCode;
      const { verifyTOTP } = require("../../Helpers/TwoFactorAuth");

      // Rate limit on OTP attempts
      const otpIpCheck = checkLoginRateLimit(`otp:${clientIpLogin}`);
      if (!otpIpCheck.allowed) {
        return SendResponse(res, "error", `Too many OTP attempts. Try again in ${otpIpCheck.waitSec} seconds`);
      }

      const result = verifyTOTP({ userId: staff._id, secret: staff.twoFactorSecret, otpCode });

      if (result.requires2FA) {
        return SendResponse(res, "Success", "2FA required", { requires2FA: true });
      }

      if (result.error) {
        recordLoginFailure(ipKey);
        recordLoginFailure(userKey);
        recordLoginFailure(`otp:${clientIpLogin}`);
        logStaffActivity({
          staffId: staff._id, staffName: staff.name, staffUsername: staff.username, ownerId: staff.ownerId,
          action: "login_failed", category: "auth",
          description: `Login failed - ${result.error}`,
          ip: clientIpLogin, userAgent: userAgentLogin,
        });
        return SendResponse(res, "error", result.error);
      }
    }

    // ─── Login Success — clear rate limits ───
    clearLoginAttempts(ipKey);
    clearLoginAttempts(userKey);
    clearLoginAttempts(`otp:${clientIpLogin}`);

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

    // Get permissions - from staff document, or fallback to designation
    let permissions = staff.permissions || {};
    if (!permissions || Object.keys(permissions).length === 0) {
      const designation = await DesignationModel.findOne({
        name: staff.designation,
        ownerId: staff.ownerId,
        isDeleted: false,
      }).lean();
      if (designation && designation.permissions) {
        permissions = designation.permissions;
      }
    }

    // Log successful login
    logStaffActivity({
      staffId: staff._id,
      staffName: staff.name,
      staffUsername: staff.username,
      ownerId: staff.ownerId,
      action: "login",
      category: "auth",
      description: `Staff logged in successfully`,
      ip: clientIp,
      userAgent: req.headers["user-agent"] || null,
    });

    return SendResponse(res, "Success", "Login successful", {
        username: staff.username,
        userId: staff._id,
        userType: "staff",
        userPriority: 0,
        name: staff.name,
        ownerId: staff.ownerId,
        designation: staff.designation,
        permissions: permissions,
        forcePasswordChange: !staff.isPasswordChanged,
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

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "create_staff",
      category: "staff_management",
      description: `Created staff "${body.name}" (${body.username}) with designation "${body.designation}"`,
      targetUser: body.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
      metadata: { designation: body.designation },
    });

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

    // Build change description
    const changes = [];
    if (body.name) changes.push(`name → "${body.name}"`);
    if (body.designation) changes.push(`designation → "${body.designation}"`);
    if (body.status !== undefined) changes.push(`status → ${body.status === 1 ? "Active" : "Inactive"}`);
    if (body.permissions) changes.push("permissions updated");
    if (body.password) changes.push("password changed");

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: body.status !== undefined ? "status_change_staff" : "update_staff",
      category: "staff_management",
      description: `Updated staff "${staff.username}": ${changes.join(", ")}`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
      metadata: { changes: updateObj, previous: { name: staff.name, designation: staff.designation, status: staff.status } },
    });

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

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "delete_staff",
      category: "staff_management",
      description: `Deleted staff "${staff.username}" (${staff.name})`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
    });

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
      .select("-password -passwordShow -__v")
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
      .select("-password -passwordShow -__v")
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

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "create_designation",
      category: "designation",
      description: `Created designation "${body.name}" with ${Object.keys(body.permissions).length} page permissions`,
      ip: requestIp.getClientIp(req),
      metadata: { designationName: body.name, permissionCount: Object.keys(body.permissions).length },
    });

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

    const changes = [];
    if (body.name) changes.push(`name → "${body.name}"`);
    if (body.permissions) changes.push(`permissions updated (${Object.keys(body.permissions).length} pages)`);
    if (body.status !== undefined) changes.push(`status → ${body.status === 1 ? "Active" : "Inactive"}`);

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "update_designation",
      category: "designation",
      description: `Updated designation "${designation.name}": ${changes.join(", ")}`,
      ip: requestIp.getClientIp(req),
      metadata: { designationId: body.designationId, changes: updateObj, staffAffected: body.permissions ? "all staff with this designation" : "none" },
    });

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

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "delete_designation",
      category: "designation",
      description: `Deleted designation "${designation.name}"`,
      ip: requestIp.getClientIp(req),
    });

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
    const pages = await getAvailablePagesFromDB();
    return SendResponse(res, "Success", "Available pages fetched", { pages, actions: AVAILABLE_ACTIONS });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== ADD AVAILABLE PAGE ========================
async function AddAvailablePage(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can add pages");
    }

    const schema = Joi.object({
      key: Joi.string().required().trim(),
      label: Joi.string().required().trim(),
      group: Joi.string().required().trim(),
      sortOrder: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const existing = await AvailablePageModel.findOne({ key: body.key });
    if (existing) {
      if (existing.isDeleted) {
        // Restore deleted page
        await AvailablePageModel.updateOne({ key: body.key }, { ...body, isDeleted: false, status: 1 });
        await invalidatePagesCache();
        const restored = await AvailablePageModel.findOne({ key: body.key });
        return SendResponse(res, "Success", "Page restored successfully", restored);
      }
      return SendResponse(res, "error", "Page key already exists");
    }

    // Auto sortOrder if not provided
    if (!body.sortOrder) {
      const lastPage = await AvailablePageModel.findOne({ group: body.group }).sort({ sortOrder: -1 });
      body.sortOrder = lastPage ? lastPage.sortOrder + 1 : 1;
    }

    const page = await AvailablePageModel.create(body);
    await invalidatePagesCache();
    return SendResponse(res, "Success", "Page added successfully", page);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== UPDATE AVAILABLE PAGE ========================
async function UpdateAvailablePage(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can update pages");
    }

    const schema = Joi.object({
      pageId: Joi.string().required(),
      label: Joi.string().optional().trim(),
      group: Joi.string().optional().trim(),
      sortOrder: Joi.number().optional(),
      status: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const page = await AvailablePageModel.findOne({ _id: body.pageId, isDeleted: false });
    if (!page) {
      return SendResponse(res, "error", "Page not found");
    }

    const updateObj = {};
    if (body.label) updateObj.label = body.label;
    if (body.group) updateObj.group = body.group;
    if (body.sortOrder !== undefined) updateObj.sortOrder = body.sortOrder;
    if (body.status !== undefined) updateObj.status = body.status;

    await AvailablePageModel.updateOne({ _id: body.pageId }, updateObj);
    await invalidatePagesCache();

    const updated = await AvailablePageModel.findById(body.pageId);
    return SendResponse(res, "Success", "Page updated successfully", updated);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DELETE AVAILABLE PAGE ========================
async function DeleteAvailablePage(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can delete pages");
    }

    const { pageId } = req.body;
    if (!pageId) {
      return SendResponse(res, "error", "pageId is required");
    }

    const page = await AvailablePageModel.findOne({ _id: pageId, isDeleted: false });
    if (!page) {
      return SendResponse(res, "error", "Page not found");
    }

    await AvailablePageModel.updateOne({ _id: pageId }, { isDeleted: true, status: 0 });
    await invalidatePagesCache();
    return SendResponse(res, "Success", "Page deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== STAFF ACTIVITY LOG ========================
async function StaffActivityList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner" && loginUser.userType !== "staff") {
      return SendResponse(res, "error", "Not authorized");
    }

    const {
      staffId,
      category,
      action,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
    } = req.body;

    const ownerId = loginUser.userType === "owner" ? loginUser.userId : loginUser.ownerId;

    const query = { ownerId };

    // Staff can only see their own activity
    if (loginUser.userType === "staff") {
      query.staffId = loginUser.userId;
    } else if (staffId) {
      query.staffId = staffId;
    }

    if (category) query.category = category;
    if (action) query.action = action;

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      StaffActivityModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StaffActivityModel.countDocuments(query),
    ]);

    return SendResponse(res, "Success", "Activity list fetched", {
      list: activities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== STAFF ACTIVITY STATS ========================
async function StaffActivityStats(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can view stats");
    }

    const ownerId = loginUser.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalToday, byCategory, byStaff, recentLogins] = await Promise.all([
      StaffActivityModel.countDocuments({ ownerId, createdAt: { $gte: today } }),
      StaffActivityModel.aggregate([
        { $match: { ownerId: ownerId, createdAt: { $gte: today } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      StaffActivityModel.aggregate([
        { $match: { ownerId: ownerId, createdAt: { $gte: today } } },
        { $group: { _id: { staffId: "$staffId", staffName: "$staffName", staffUsername: "$staffUsername" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      StaffActivityModel.find({ ownerId, action: "login", createdAt: { $gte: today } })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("staffName staffUsername ip createdAt")
        .lean(),
    ]);

    return SendResponse(res, "Success", "Stats fetched", {
      totalToday,
      byCategory,
      byStaff: byStaff.map(s => ({ staffId: s._id.staffId, staffName: s._id.staffName, staffUsername: s._id.staffUsername, count: s.count })),
      recentLogins,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== FORCE LOGOUT STAFF ========================
async function ForceLogoutStaff(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can force logout staff");
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

    // Invalidate JWT and auth token in DB
    await StaffModel.updateOne(
      { _id: staffId },
      { jwtToken: "", authenticateToken: "" }
    );

    // Clear Redis cached data
    const redisKey = String(staffId);
    await client.hset(redisKey, ["jwtToken", "", "authenticateToken", ""]).catch(() => {});

    // Emit socket event to force disconnect
    const { emitToUser } = require("../../socket");
    await emitToUser("forceLogout", { reason: "You have been logged out by the owner" }, staffId);

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "force_logout_staff",
      category: "auth",
      description: `Force logged out staff "${staff.username}" (${staff.name})`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
    });

    return SendResponse(res, "Success", `Staff "${staff.username}" has been logged out`);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== GET ONLINE STAFF ========================
async function GetOnlineStaff(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can view online staff");
    }

    const ownerId = String(loginUser.userId);
    const REDIS_STAFF_KEY = `staff_online:${ownerId}`;

    // Get all online staff from Redis hash
    const onlineData = await client.hgetall(REDIS_STAFF_KEY).catch(() => ({}));

    const staffList = [];
    if (onlineData && Object.keys(onlineData).length > 0) {
      for (const [staffId, jsonStr] of Object.entries(onlineData)) {
        try {
          const data = JSON.parse(jsonStr);
          // Consider staff offline if no heartbeat in 2 minutes
          if (Date.now() - data.lastSeen < 120000) {
            staffList.push({ staffId, ...data });
          } else {
            // Cleanup stale entry
            await client.hdel(REDIS_STAFF_KEY, staffId).catch(() => {});
          }
        } catch (_) {}
      }
    }

    return SendResponse(res, "Success", "Online staff fetched", staffList);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== 2FA: SETUP ========================
// Generates secret + QR code for Google Authenticator
async function Setup2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    // Staff can setup their own, owner can setup for any staff
    let staffId = loginUser.userType === "staff" ? loginUser.userId : req.body.staffId;
    if (!staffId) return SendResponse(res, "error", "staffId is required");

    const staff = await StaffModel.findOne({ _id: staffId, isDeleted: false });
    if (!staff) return SendResponse(res, "error", "Staff not found");

    if (staff.twoFactorEnabled) {
      return SendResponse(res, "error", "2FA is already enabled for this staff");
    }

    // Generate secret using common helper
    const { generateSecret } = require("../../Helpers/TwoFactorAuth");
    const secretData = await generateSecret(staff.username, "StaffPanel");

    // Save secret (not yet enabled until verified)
    await StaffModel.updateOne({ _id: staffId }, { twoFactorSecret: secretData.secret });

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userType === "owner" ? loginUser.userId : loginUser.ownerId,
      action: "setup_2fa",
      category: "auth",
      description: `2FA setup initiated for "${staff.username}"`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
    });

    return SendResponse(res, "Success", "Scan QR code with Google Authenticator", {
      qrCode: secretData.qrCode,
      secret: secretData.secret,
      staffId: staff._id,
      username: staff.username,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== 2FA: VERIFY & ENABLE ========================
// Verifies OTP code and enables 2FA
async function Verify2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    let staffId = loginUser.userType === "staff" ? loginUser.userId : req.body.staffId;
    const { otpCode } = req.body;

    if (!staffId || !otpCode) return SendResponse(res, "error", "staffId and otpCode required");

    const staff = await StaffModel.findOne({ _id: staffId, isDeleted: false });
    if (!staff) return SendResponse(res, "error", "Staff not found");
    if (!staff.twoFactorSecret) return SendResponse(res, "error", "2FA setup not initiated. Call setup first.");
    if (staff.twoFactorEnabled) return SendResponse(res, "error", "2FA is already enabled");

    const { verifySetupCode } = require("../../Helpers/TwoFactorAuth");
    if (!verifySetupCode(staff.twoFactorSecret, otpCode)) {
      return SendResponse(res, "error", "Invalid code. Please check Google Authenticator and try again.");
    }

    await StaffModel.updateOne({ _id: staffId }, { twoFactorEnabled: true });

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userType === "owner" ? loginUser.userId : loginUser.ownerId,
      action: "enable_2fa",
      category: "auth",
      description: `2FA enabled for "${staff.username}"`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
    });

    return SendResponse(res, "Success", "2FA enabled successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== 2FA: DISABLE ========================
async function Disable2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "owner") {
      return SendResponse(res, "error", "Only owner can disable 2FA");
    }

    const { staffId } = req.body;
    if (!staffId) return SendResponse(res, "error", "staffId is required");

    const staff = await StaffModel.findOne({ _id: staffId, isDeleted: false });
    if (!staff) return SendResponse(res, "error", "Staff not found");

    await StaffModel.updateOne({ _id: staffId }, { twoFactorEnabled: false, twoFactorSecret: null });

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.userId,
      action: "disable_2fa",
      category: "auth",
      description: `2FA disabled for "${staff.username}"`,
      targetUser: staff.username,
      targetUserId: staff._id,
      ip: requestIp.getClientIp(req),
    });

    return SendResponse(res, "Success", "2FA disabled successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== STAFF CHANGE PASSWORD ========================
async function StaffChangePassword(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "staff") {
      return SendResponse(res, "error", "Only staff can change their own password");
    }

    const schema = Joi.object({
      oldPassword: Joi.string().required(),
      newPassword: Joi.string().min(4).required(),
    }).options({ allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));

    const staff = await StaffModel.findOne({ _id: loginUser.userId, isDeleted: false });
    if (!staff) return SendResponse(res, "error", "Staff not found");

    // Verify old password
    const pwMatch = await bcrypt.compare(body.oldPassword, staff.password);
    if (!pwMatch) return SendResponse(res, "error", "Old password is incorrect");

    // Don't allow same password
    if (body.oldPassword === body.newPassword) return SendResponse(res, "error", "New password must be different from old password");

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(body.newPassword, salt);

    await StaffModel.updateOne({ _id: loginUser.userId }, {
      password: hashedPassword,
      passwordShow: "******", // Never store plain text for staff
      isPasswordChanged: true,
      passwordChangedAt: new Date(),
    });

    logStaffActivity({
      staffId: loginUser.userId,
      staffName: loginUser.name,
      staffUsername: loginUser.username,
      ownerId: loginUser.ownerId,
      action: "change_password",
      category: "auth",
      description: `Staff changed their password`,
      ip: requestIp.getClientIp(req),
    });

    return SendResponse(res, "Success", "Password changed successfully");
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
  AddAvailablePage,
  UpdateAvailablePage,
  DeleteAvailablePage,
  StaffActivityList,
  StaffActivityStats,
  logStaffActivity,
  ForceLogoutStaff,
  GetOnlineStaff,
  Setup2FA,
  Verify2FA,
  Disable2FA,
  StaffChangePassword,
};
