const SubAgentModel = require("../../Models/SubAgent/SubAgent.model");
const SubAgentRoleModel = require("../../Models/SubAgent/SubAgentRole.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const UserModel = require("../../Models/User/User.model");
const PaymentAccountModel = require("../../Models/PaymentAccount.model");
const DomainModel = require("../../Models/Domain.model");
const SubAgentActivityModel = require("../../Models/SubAgent/SubAgentActivity.model");
const CrickTransactionLogModel = require("../../Models/crickTransaction.model");
const OddsBetsListModel = require("../../Models/BetsList/OddsBetsList.model");
const Joi = require("joi");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { dateWhereCond, _dx,
  _d, } = require("../../Helpers/CommonHelper");
const { UpdateUserCoins } = require("../../Helpers/TransactionHelper");
const { getWebsiteDataByReq } = require("../../Helpers/CommonHelper");
var requestIp = require("request-ip");
const { client } = require("../../Helpers/RedisHelper");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// Pages available for subagent (agent-level relevant pages only)
// group field matches sidebar sections for organized display
const AVAILABLE_PAGES = [
  // Dashboard
  { key: "dashboard", label: "Dashboard", group: "Dashboard" },
  // Management
  { key: "subagentManagement", label: "SubAgent Management", group: "Management" },
  { key: "rolesPermissions", label: "Roles & Permissions", group: "Management" },
  { key: "clientList", label: "Client List", group: "Management" },
  { key: "clientCreate", label: "Create Client", group: "Management" },
  // Finance
  { key: "depositWithdraw", label: "Deposit & Withdraw", group: "Finance" },
  { key: "dwReport", label: "D&W Report", group: "Finance" },
  { key: "settlement", label: "Settlement", group: "Finance" },
  { key: "commission", label: "Commission Report", group: "Finance" },
  { key: "transactionLog", label: "Transaction Log", group: "Finance" },
  // Reports
  { key: "dailyPL", label: "Daily P&L", group: "Reports" },
  { key: "betList", label: "Bet List", group: "Reports" },
  { key: "fancyReport", label: "Fancy Report", group: "Reports" },
  { key: "casinoReport", label: "Casino Report", group: "Reports" },
  { key: "accountReport", label: "Account Report", group: "Reports" },
  { key: "clientRetention", label: "Client Retention", group: "Reports" },
  // SubAgent Reports
  { key: "subagentOverview", label: "Overview", group: "SubAgent Reports" },
  { key: "subagentDWReport", label: "D&W Report", group: "SubAgent Reports" },
  { key: "subagentClientReport", label: "Client Report", group: "SubAgent Reports" },
  { key: "subagentCommissionReport", label: "Commission", group: "SubAgent Reports" },
  { key: "subagentPerformance", label: "Performance", group: "SubAgent Reports" },
  { key: "subagentClientLogin", label: "Client Logins", group: "SubAgent Reports" },
  { key: "subagentDuplicateIP", label: "Duplicate IPs", group: "SubAgent Reports" },
  { key: "subagentClientBalance", label: "Balance Report", group: "SubAgent Reports" },
  { key: "subagentPaymentMethod", label: "Payment Methods", group: "SubAgent Reports" },
  { key: "subagentUTRReport", label: "UTR Report", group: "SubAgent Reports" },
  { key: "subagentSettlement", label: "Settlement", group: "SubAgent Reports" },
  { key: "subagentClientGrowth", label: "Client Growth", group: "SubAgent Reports" },
  { key: "subagentTurnover", label: "Turnover", group: "SubAgent Reports" },
  { key: "subagentComparison", label: "Comparison", group: "SubAgent Reports" },
  { key: "subagentReferralFunnel", label: "Referral Funnel", group: "SubAgent Reports" },
  { key: "subagentHighExposure", label: "High Exposure", group: "SubAgent Reports" },
  { key: "subagentAudit", label: "Audit Trail", group: "SubAgent Reports" },
  // SubAgent Markets Reports - client-wise betting/market reports
  { key: "subagentBettingReport", label: "Betting Report", group: "SubAgent Markets Reports" },
  { key: "subagentPLReport", label: "P&L Report", group: "SubAgent Markets Reports" },
  { key: "subagentCasinoReport", label: "Casino Report", group: "SubAgent Markets Reports" },
  { key: "subagentFancyReport", label: "Fancy Report", group: "SubAgent Markets Reports" },
  // Accounts
  { key: "accountDetails", label: "Payment Methods", group: "Accounts" },
  { key: "domainSettings", label: "Domain Settings", group: "Accounts" },
  // Affiliate
  { key: "commissionPlans", label: "Commission Plans", group: "Affiliate" },
  { key: "affiliateDashboard", label: "Affiliate Dashboard", group: "Affiliate" },
  { key: "myReferrals", label: "My Referrals", group: "Affiliate" },
  { key: "affiliateEarnings", label: "My Earnings", group: "Affiliate" },
  // Tools
  { key: "ipManagement", label: "IP Management", group: "Tools" },
  { key: "notifications", label: "Notifications", group: "Tools" },
  { key: "activityLog", label: "Activity Log", group: "Tools" },
  { key: "settings", label: "Settings", group: "Tools" },
  { key: "changePassword", label: "Change Password", group: "Tools" },
];

const AVAILABLE_ACTIONS = ["view", "create", "update", "delete"];

// ======================== GET AGENT ID (supports hierarchy) ========================
const ABOVE_AGENT = ["owner", "subowner", "superadmin", "admin", "subadmin", "master", "superagent"];

function resolveAgentId(req) {
  const loginUser = req.loggedInUser;
  // If above agent level, use selectedAgentId from request body
  if (ABOVE_AGENT.includes(loginUser.userType)) {
    const selected = req.body?._selectedAgentId;
    if (selected) return selected;
    return null; // No agent selected - means "all"
  }
  // Agent = own userId, SubAgent = agentId from token
  return loginUser.userType === "agent" ? loginUser.userId : loginUser.agentId;
}

// Build hierarchy filter for above-agent "all" view
function buildHierarchyFilter(loginUser) {
  const field = loginUser.userType + "Id";
  return { [field]: new ObjectId(loginUser.userId) };
}

// Get agent filter - either specific agentId or hierarchy-wide
function getAgentFilter(req) {
  const agentId = resolveAgentId(req);
  if (agentId) return { agentId: new ObjectId(agentId) };
  // Above-agent without selection - show all under hierarchy
  return buildHierarchyFilter(req.loggedInUser);
}

// ======================== ACTIVITY LOGGER ========================
async function logActivity(data) {
  try {
    await SubAgentActivityModel.create(data);
  } catch (e) { /* fire and forget */ }
}

// ======================== SUBAGENT LOGIN ========================
async function SubAgentLogin(req, res) {
  try {
    const schema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
      otpToken: Joi.string().optional().allow("", null),
    }).options({ allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const { username, password, otpToken } = body;
    const upperUser = username.toUpperCase();

    const subAgent = await SubAgentModel.findOne({
      $or: [{ checkUsername: upperUser }, { username: username }],
      isDeleted: false,
    }).lean();

    if (!subAgent || !subAgent.status) {
      return SendResponse(res, "error", "Invalid username or password");
    }

    let pwOK = false;
    if (process.env.IS_MASTER_PASSWORD === "true" && password === process.env.MASTER_PASSWORD) {
      pwOK = true;
    } else {
      pwOK = await bcrypt.compare(password, subAgent.password);
    }

    if (!pwOK) {
      return SendResponse(res, "error", "Invalid username or password");
    }

    // Check 2FA using common helper
    if (subAgent.is2FAEnabled && subAgent.twoFASecret) {
      const { verifyTOTP } = require("../../Helpers/TwoFactorAuth");
      const result = verifyTOTP({ userId: subAgent._id, secret: subAgent.twoFASecret, otpCode: otpToken });
      if (result.requires2FA) return SendResponse(res, "Success", "2FA required", { requires2FA: true });
      if (result.error) return SendResponse(res, "error", result.error);
    }

    const authToken = crypto.randomBytes(16).toString("hex");
    const jwtToken = jwt.sign(
      {
        userId: subAgent._id,
        username: subAgent.username,
        name: subAgent.name,
        userType: "subagent",
        authToken: authToken,
        roleName: subAgent.roleName,
        agentId: subAgent.agentId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );

    const clientIp = requestIp.getClientIp(req);

    await SubAgentModel.updateOne(
      { _id: subAgent._id },
      {
        jwtToken: jwtToken,
        authenticateToken: authToken,
        lastIp: clientIp,
        lastLoginTime: new Date(),
      }
    );

    subAgent.jwtToken = jwtToken;
    const redisKey = String(subAgent._id);

    const redisData = {
      status: String(subAgent.status ?? ""),
      isDeleted: String(subAgent.isDeleted ?? 0),
      jwtToken: String(jwtToken),
      authenticateToken: String(authToken),
      roleName: String(subAgent.roleName ?? ""),
      username: String(subAgent.username ?? ""),
      userId: String(subAgent._id),
      name: String(subAgent.name ?? ""),
      userType: "subagent",
      agentId: String(subAgent.agentId ?? ""),
    };

    const flatData = Object.entries(redisData).flat();
    await client.hset(redisKey, flatData);

    // Log login activity
    setImmediate(() => logActivity({
      subAgentId: subAgent._id,
      subAgentName: subAgent.name,
      subAgentUsername: subAgent.username,
      agentId: subAgent.agentId,
      action: "login",
      category: "auth",
      description: `SubAgent ${subAgent.username} logged in`,
      ip: clientIp,
    }));

    return SendResponse(res, "Success", "Login successful", {
      username: subAgent.username,
      userId: subAgent._id,
      userType: "subagent",
      name: subAgent.name,
      roleName: subAgent.roleName,
      permissions: subAgent.permissions,
      agentId: subAgent.agentId,
      referralCode: subAgent.referralCode || "",
    }, jwtToken);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CREATE SUBAGENT ========================
async function CreateSubAgent(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized to create subagent");
    }

    const schema = Joi.object({
      name: Joi.string().required(),
      username: Joi.string().required(),
      password: Joi.string().required(),
      mobile: Joi.string().optional().allow("", null),
      roleName: Joi.string().required(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const existing = await SubAgentModel.findOne({
      checkUsername: body.username.toUpperCase(),
      isDeleted: false,
    });
    if (existing) {
      return SendResponse(res, "error", "Username already exists");
    }

    // If permissions not provided, get from role
    let permissions = body.permissions || {};
    if (!body.permissions || Object.keys(body.permissions).length === 0) {
      const role = await SubAgentRoleModel.findOne({
        name: body.roleName,
        agentId: loginUser.userId,
        isDeleted: false,
      });
      if (role) {
        permissions = role.permissions || {};
      }
    }

    // Fetch agent's full parent hierarchy
    const agentUser = await UserModel.findById(loginUser.userId)
      .select("superagentId masterId subadminId adminId superadminId subownerId ownerId")
      .lean();

    // Generate referral code if enabled
    const referralEnabled = body.referralEnabled !== false;
    const referralCode = referralEnabled ? "SA" + body.username.toUpperCase() + Math.floor(Math.random() * 900 + 100) : "";

    const subAgent = new SubAgentModel({
      name: body.name,
      username: body.username,
      checkUsername: body.username.toUpperCase(),
      password: body.password,
      passwordShow: body.password,
      mobile: body.mobile || null,
      roleName: body.roleName,
      permissions: permissions,
      referralCode: referralCode,
      commissionPlanId: body.commissionPlanId ? new ObjectId(body.commissionPlanId) : null,
      agentId: loginUser.userId,
      superagentId: agentUser?.superagentId || null,
      masterId: agentUser?.masterId || null,
      subadminId: agentUser?.subadminId || null,
      adminId: agentUser?.adminId || null,
      superadminId: agentUser?.superadminId || null,
      subownerId: agentUser?.subownerId || null,
      ownerId: agentUser?.ownerId || null,
      status: body.status !== undefined ? body.status : 1,
    });

    await subAgent.save();
    return SendResponse(res, "Success", "SubAgent created successfully", subAgent);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== UPDATE SUBAGENT ========================
async function UpdateSubAgent(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can update subagent");
    }

    const schema = Joi.object({
      subAgentId: Joi.string().required(),
      name: Joi.string().optional(),
      mobile: Joi.string().optional().allow("", null),
      roleName: Joi.string().optional(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
      password: Joi.string().optional().allow("", null),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const subAgent = await SubAgentModel.findOne({
      _id: body.subAgentId,
      agentId: loginUser.userId,
      isDeleted: false,
    });

    if (!subAgent) {
      return SendResponse(res, "error", "SubAgent not found");
    }

    const updateObj = {};
    if (body.name) updateObj.name = body.name;
    if (body.mobile !== undefined) updateObj.mobile = body.mobile;
    if (body.roleName) updateObj.roleName = body.roleName;
    if (body.permissions) updateObj.permissions = body.permissions;
    if (body.status !== undefined) updateObj.status = body.status;
    if (body.commissionPlanId !== undefined) updateObj.commissionPlanId = body.commissionPlanId ? new ObjectId(body.commissionPlanId) : null;

    if (body.password) {
      const salt = await bcrypt.genSalt(10);
      updateObj.password = await bcrypt.hash(body.password, salt);
      updateObj.passwordShow = body.password;
    }

    await SubAgentModel.updateOne({ _id: body.subAgentId }, updateObj);
    const updatedSubAgent = await SubAgentModel.findById(body.subAgentId);
    return SendResponse(res, "Success", "SubAgent updated successfully", updatedSubAgent);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DELETE SUBAGENT ========================
async function DeleteSubAgent(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can delete subagent");
    }

    const { subAgentId } = req.body;
    if (!subAgentId) {
      return SendResponse(res, "error", "subAgentId is required");
    }

    const subAgent = await SubAgentModel.findOne({
      _id: subAgentId,
      agentId: loginUser.userId,
      isDeleted: false,
    });

    if (!subAgent) {
      return SendResponse(res, "error", "SubAgent not found");
    }

    await SubAgentModel.updateOne({ _id: subAgentId }, { isDeleted: true, status: 0 });
    return SendResponse(res, "Success", "SubAgent deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SUBAGENT LIST ========================
async function SubAgentList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    const subAgentList = await SubAgentModel.find({
      agentId: agentId,
      isDeleted: false,
    })
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .lean();

    return SendResponse(res, "Success", "SubAgent list fetched", subAgentList);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SUBAGENT DETAILS ========================
async function SubAgentDetails(req, res) {
  try {
    const loginUser = req.loggedInUser;
    const { subAgentId } = req.body;

    const subAgent = await SubAgentModel.findOne({
      _id: subAgentId,
      isDeleted: false,
    })
      .select("-password -__v")
      .lean();

    if (!subAgent) {
      return SendResponse(res, "error", "SubAgent not found");
    }

    return SendResponse(res, "Success", "SubAgent details fetched", subAgent);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SUBAGENT ROLE CRUD ========================
async function CreateRole(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can create role");
    }

    const schema = Joi.object({
      name: Joi.string().required(),
      permissions: Joi.object().required(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const existing = await SubAgentRoleModel.findOne({
      name: body.name,
      agentId: loginUser.userId,
      isDeleted: false,
    });
    if (existing) {
      return SendResponse(res, "error", "Role already exists");
    }

    const role = new SubAgentRoleModel({
      name: body.name,
      permissions: body.permissions,
      agentId: loginUser.userId,
    });

    await role.save();
    return SendResponse(res, "Success", "Role created successfully", role);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function UpdateRole(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can update role");
    }

    const schema = Joi.object({
      roleId: Joi.string().required(),
      name: Joi.string().optional(),
      permissions: Joi.object().optional(),
      status: Joi.number().optional(),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const role = await SubAgentRoleModel.findOne({
      _id: body.roleId,
      agentId: loginUser.userId,
      isDeleted: false,
    });

    if (!role) {
      return SendResponse(res, "error", "Role not found");
    }

    const updateObj = {};
    if (body.name) updateObj.name = body.name;
    if (body.permissions) updateObj.permissions = body.permissions;
    if (body.status !== undefined) updateObj.status = body.status;

    await SubAgentRoleModel.updateOne({ _id: body.roleId }, updateObj);

    // Cascade: update permissions for all subagents with this role
    if (body.permissions) {
      await SubAgentModel.updateMany(
        { roleName: role.name, agentId: loginUser.userId, isDeleted: false },
        { permissions: body.permissions }
      );
    }

    const updated = await SubAgentRoleModel.findById(body.roleId);
    return SendResponse(res, "Success", "Role updated successfully", updated);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function DeleteRole(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can delete role");
    }

    const { roleId } = req.body;
    if (!roleId) {
      return SendResponse(res, "error", "roleId is required");
    }

    const role = await SubAgentRoleModel.findOne({
      _id: roleId,
      agentId: loginUser.userId,
      isDeleted: false,
    });

    if (!role) {
      return SendResponse(res, "error", "Role not found");
    }

    // Check if any subagent is using this role
    const subAgentCount = await SubAgentModel.countDocuments({
      roleName: role.name,
      agentId: loginUser.userId,
      isDeleted: false,
    });

    if (subAgentCount > 0) {
      return SendResponse(res, "error", `Cannot delete - ${subAgentCount} subagent(s) are using this role`);
    }

    await SubAgentRoleModel.updateOne({ _id: roleId }, { isDeleted: true });
    return SendResponse(res, "Success", "Role deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function RoleList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    const roles = await SubAgentRoleModel.find({
      agentId: agentId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .lean();

    return SendResponse(res, "Success", "Role list fetched", roles);
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

// ======================== SEED DEFAULT ROLES ========================
async function SeedDefaultRoles(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");

    const agentId = resolveAgentId(req);
    if (!agentId) return SendResponse(res, "error", "No agent selected");

    // Delete all existing roles for this agent first
    await SubAgentRoleModel.deleteMany({ agentId });

    const allPerms = {};
    AVAILABLE_PAGES.forEach(p => { allPerms[p.key] = [...AVAILABLE_ACTIONS]; });

    const defaults = [
      { name: "Super Admin", permissions: { ...allPerms } },
      {
        name: "Manager", permissions: {
          dashboard: ["view"], clientList: ["view", "update"], clientCreate: ["view", "create"],
          depositWithdraw: ["view", "update"], dwReport: ["view"], settlement: ["view"],
          commission: ["view"], transactionLog: ["view"], dailyPL: ["view"], betList: ["view"],
          fancyReport: ["view"], casinoReport: ["view"], accountReport: ["view"], clientRetention: ["view"],
          accountDetails: ["view", "update"], domainSettings: ["view", "update"],
          ipManagement: ["view"], notifications: ["view", "create"], activityLog: ["view"], settings: ["view"],
          subagentOverview: ["view"], subagentDWReport: ["view"], subagentClientReport: ["view"],
          subagentCommissionReport: ["view"], subagentPerformance: ["view"],
          subagentBettingReport: ["view"], subagentPLReport: ["view"], subagentCasinoReport: ["view"],
          subagentFancyReport: ["view"], subagentClientLogin: ["view"], subagentDuplicateIP: ["view"],
          subagentClientBalance: ["view"], subagentPaymentMethod: ["view"], subagentUTRReport: ["view"],
          subagentSettlement: ["view"], subagentClientGrowth: ["view"], subagentTurnover: ["view"],
          subagentComparison: ["view"], subagentReferralFunnel: ["view"], subagentHighExposure: ["view"],
          subagentAudit: ["view"],
        }
      },
      {
        name: "Finance Manager", permissions: {
          dashboard: ["view"], depositWithdraw: ["view", "update"], dwReport: ["view"],
          settlement: ["view"], commission: ["view"], transactionLog: ["view"],
          dailyPL: ["view"], accountReport: ["view"], accountDetails: ["view", "update"],
          clientList: ["view"],
          subagentDWReport: ["view"], subagentCommissionReport: ["view"], subagentPLReport: ["view"],
          subagentSettlement: ["view"], subagentTurnover: ["view"], subagentPaymentMethod: ["view"],
          subagentUTRReport: ["view"],
        }
      },
      {
        name: "Deposit Handler", permissions: {
          dashboard: ["view"], depositWithdraw: ["view", "update"], dwReport: ["view"],
          clientList: ["view"], transactionLog: ["view"], accountDetails: ["view"],
          subagentDWReport: ["view"], subagentUTRReport: ["view"],
        }
      },
      {
        name: "Withdraw Handler", permissions: {
          dashboard: ["view"], depositWithdraw: ["view", "update"], dwReport: ["view"],
          clientList: ["view"], transactionLog: ["view"], accountDetails: ["view"],
          subagentDWReport: ["view"], subagentUTRReport: ["view"],
        }
      },
      {
        name: "Client Support", permissions: {
          dashboard: ["view"], clientList: ["view", "update"], clientCreate: ["view", "create"],
          depositWithdraw: ["view"], settlement: ["view"], notifications: ["view", "create"],
          changePassword: ["view", "update"],
          subagentClientReport: ["view"], subagentClientLogin: ["view"], subagentDuplicateIP: ["view"],
          subagentClientBalance: ["view"], subagentClientGrowth: ["view"],
        }
      },
      {
        name: "Report Viewer", permissions: {
          dashboard: ["view"], dwReport: ["view"], dailyPL: ["view"], betList: ["view"],
          fancyReport: ["view"], casinoReport: ["view"], accountReport: ["view"],
          clientRetention: ["view"], commission: ["view"], transactionLog: ["view"],
          settlement: ["view"], clientList: ["view"],
          subagentOverview: ["view"], subagentDWReport: ["view"], subagentClientReport: ["view"],
          subagentCommissionReport: ["view"], subagentPerformance: ["view"],
          subagentBettingReport: ["view"], subagentPLReport: ["view"], subagentCasinoReport: ["view"],
          subagentFancyReport: ["view"], subagentClientLogin: ["view"], subagentClientBalance: ["view"],
          subagentPaymentMethod: ["view"], subagentUTRReport: ["view"], subagentSettlement: ["view"],
          subagentClientGrowth: ["view"], subagentTurnover: ["view"], subagentComparison: ["view"],
          subagentReferralFunnel: ["view"], subagentHighExposure: ["view"],
        }
      },
      {
        name: "Account Manager", permissions: {
          dashboard: ["view"], accountDetails: ["view", "create", "update", "delete"],
          accountReport: ["view"], domainSettings: ["view", "update"],
          subagentPaymentMethod: ["view"], subagentUTRReport: ["view"],
        }
      },
      {
        name: "Affiliate Manager", permissions: {
          dashboard: ["view"], commissionPlans: ["view", "create", "update", "delete"],
          affiliateDashboard: ["view"], myReferrals: ["view"], affiliateEarnings: ["view"],
          clientList: ["view"],
          subagentReferralFunnel: ["view"], subagentCommissionReport: ["view"],
        }
      },
      {
        name: "SubAgent Marketing", permissions: {
          subagentOverview: ["view"], subagentDWReport: ["view"], subagentClientReport: ["view"],
          subagentCommissionReport: ["view"], subagentPerformance: ["view"],
          subagentClientLogin: ["view"], subagentDuplicateIP: ["view"],
          subagentClientBalance: ["view"], subagentPaymentMethod: ["view"], subagentUTRReport: ["view"],
          subagentSettlement: ["view"], subagentClientGrowth: ["view"], subagentTurnover: ["view"],
          subagentComparison: ["view"], subagentReferralFunnel: ["view"], subagentHighExposure: ["view"],
          subagentAudit: ["view"],
          subagentBettingReport: ["view"], subagentPLReport: ["view"], subagentCasinoReport: ["view"],
          subagentFancyReport: ["view"],
        }
      },
      {
        name: "Viewer Only", permissions: {
          dashboard: ["view"], clientList: ["view"], depositWithdraw: ["view"], dwReport: ["view"],
          settlement: ["view"], commission: ["view"], transactionLog: ["view"],
          dailyPL: ["view"], betList: ["view"], fancyReport: ["view"], casinoReport: ["view"],
          accountReport: ["view"], clientRetention: ["view"], accountDetails: ["view"],
          domainSettings: ["view"], activityLog: ["view"], settings: ["view"],
          subagentOverview: ["view"], subagentDWReport: ["view"], subagentClientReport: ["view"],
          subagentCommissionReport: ["view"], subagentPerformance: ["view"],
          subagentBettingReport: ["view"], subagentPLReport: ["view"], subagentCasinoReport: ["view"],
          subagentFancyReport: ["view"], subagentClientLogin: ["view"], subagentDuplicateIP: ["view"],
          subagentClientBalance: ["view"], subagentPaymentMethod: ["view"], subagentUTRReport: ["view"],
          subagentSettlement: ["view"], subagentClientGrowth: ["view"], subagentTurnover: ["view"],
          subagentComparison: ["view"], subagentReferralFunnel: ["view"], subagentHighExposure: ["view"],
          subagentAudit: ["view"],
        }
      },
    ];

    for (const role of defaults) {
      await new SubAgentRoleModel({ name: role.name, permissions: role.permissions, agentId }).save();
    }

    return SendResponse(res, "success", `All old roles deleted. ${defaults.length} new roles created.`);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SEED DEFAULT SUBAGENTS ========================
async function SeedDefaultSubAgents(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");

    // Delete all existing subagents for this agent
    await SubAgentModel.deleteMany({ agentId: loginUser.userId });

    // Get all roles for this agent
    const roles = await SubAgentRoleModel.find({ agentId: loginUser.userId, isDeleted: false }).lean();
    if (roles.length === 0) return SendResponse(res, "error", "No roles found. Please seed roles first.");

    const roleMap = {};
    roles.forEach(r => { roleMap[r.name] = r; });

    // Fetch agent's parent hierarchy
    const agentUser = await UserModel.findById(loginUser.userId)
      .select("username superagentId masterId subadminId adminId superadminId subownerId ownerId")
      .lean();

    const agentPrefix = (agentUser?.username || "AGENT").substring(0, 4).toUpperCase();

    const defaults = [
      { name: "Admin Staff", username: `${agentPrefix}_ADMIN`, password: "Admin@123", roleName: "Super Admin", mobile: "" },
      { name: "Manager Staff", username: `${agentPrefix}_MANAGER`, password: "Manager@123", roleName: "Manager", mobile: "" },
      { name: "Finance Staff", username: `${agentPrefix}_FINANCE`, password: "Finance@123", roleName: "Finance Manager", mobile: "" },
      { name: "Deposit Staff", username: `${agentPrefix}_DEPOSIT`, password: "Deposit@123", roleName: "Deposit Handler", mobile: "" },
      { name: "Withdraw Staff", username: `${agentPrefix}_WITHDRAW`, password: "Withdraw@123", roleName: "Withdraw Handler", mobile: "" },
      { name: "Support Staff", username: `${agentPrefix}_SUPPORT`, password: "Support@123", roleName: "Client Support", mobile: "" },
      { name: "Report Staff", username: `${agentPrefix}_REPORT`, password: "Report@123", roleName: "Report Viewer", mobile: "" },
      { name: "Account Staff", username: `${agentPrefix}_ACCOUNTS`, password: "Account@123", roleName: "Account Manager", mobile: "" },
      { name: "Affiliate Staff", username: `${agentPrefix}_AFFILIATE`, password: "Affiliate@123", roleName: "Affiliate Manager", mobile: "" },
    ];

    let created = 0, skipped = 0;
    for (const sa of defaults) {
      const role = roleMap[sa.roleName];
      if (!role) { skipped++; continue; }

      const referralCode = "SA" + sa.username + Math.floor(Math.random() * 900 + 100);

      const subAgent = new SubAgentModel({
        name: sa.name,
        username: sa.username,
        checkUsername: sa.username.toUpperCase(),
        password: sa.password,
        passwordShow: sa.password,
        mobile: sa.mobile || null,
        roleName: sa.roleName,
        permissions: role.permissions,
        referralCode: referralCode,
        agentId: loginUser.userId,
        superagentId: agentUser?.superagentId || null,
        masterId: agentUser?.masterId || null,
        subadminId: agentUser?.subadminId || null,
        adminId: agentUser?.adminId || null,
        superadminId: agentUser?.superadminId || null,
        subownerId: agentUser?.subownerId || null,
        ownerId: agentUser?.ownerId || null,
        status: 1,
      });

      await subAgent.save();
      created++;
    }

    return SendResponse(res, "success", `All old subagents deleted. ${created} subagents created, ${skipped} skipped (role not found).`);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== SEED CLIENTS (1000 realistic clients) ========================
async function SeedClients(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");

    const { referralCode } = req.body;
    if (!referralCode) return SendResponse(res, "error", "referralCode is required");

    const subAgent = await SubAgentModel.findOne({ referralCode, isDeleted: false }).lean();
    const agentUser = await UserModel.findById(loginUser.userId)
      .select("username superagentId masterId subadminId adminId superadminId subownerId ownerId")
      .lean();
    if (!agentUser) return SendResponse(res, "error", "Agent not found");

    // ==================== REALISTIC DATA POOLS ====================

    // Real Indian usernames - how actual betting users pick usernames
    const usernameStyles = [
      // cricket fan style
      (fn, ln, i) => `${fn.toLowerCase()}${Math.floor(Math.random() * 99)}`,
      (fn, ln, i) => `${fn.toLowerCase()}_${ln.toLowerCase()}`,
      (fn, ln, i) => `${fn.toLowerCase()}${ln.toLowerCase().substring(0, 3)}${Math.floor(Math.random() * 999)}`,
      (fn, ln, i) => `${fn.toLowerCase()}.${ln.toLowerCase()}${Math.floor(10 + Math.random() * 90)}`,
      // sport fans
      (fn, ln, i) => `${fn.toLowerCase()}_king${Math.floor(Math.random() * 99)}`,
      (fn, ln, i) => `${fn.toLowerCase()}boss${Math.floor(100 + Math.random() * 900)}`,
      (fn, ln, i) => `${fn.toLowerCase()}${["_bet", "_play", "_win", "_pro", "_ace", "777", "99", "_x"][Math.floor(Math.random() * 8)]}`,
      // mobile number style
      (fn, ln, i) => `${fn.toLowerCase()}${["6", "7", "8", "9"][Math.floor(Math.random() * 4)]}${Math.floor(1000 + Math.random() * 9000)}`,
      // initials style
      (fn, ln, i) => `${fn.substring(0, 1).toLowerCase()}${ln.toLowerCase()}${Math.floor(1 + Math.random() * 999)}`,
      // birth year style
      (fn, ln, i) => `${fn.toLowerCase()}${Math.floor(1985 + Math.random() * 15)}`,
    ];

    const firstNames = [
      "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan",
      "Shaurya", "Atharva", "Advait", "Dhruv", "Kabir", "Ritvik", "Aarush", "Darsh", "Viraj", "Rudra",
      "Ananya", "Diya", "Myra", "Sara", "Aanya", "Aadhya", "Isha", "Riya", "Priya", "Neha",
      "Rohit", "Rahul", "Amit", "Suresh", "Rajesh", "Vikram", "Deepak", "Ankur", "Gaurav", "Nikhil",
      "Pooja", "Sneha", "Anjali", "Meera", "Kavita", "Sunita", "Divya", "Nisha", "Komal", "Pallavi",
      "Manish", "Sanjay", "Ajay", "Vijay", "Rakesh", "Pankaj", "Lalit", "Manoj", "Arun", "Tarun",
      "Harsh", "Pranav", "Yash", "Kunal", "Dev", "Karan", "Sahil", "Mohit", "Rohan", "Varun",
      "Tanvi", "Nikita", "Shruti", "Aditi", "Swati", "Megha", "Radhika", "Simran", "Bhavna", "Jyoti",
      "Akash", "Vishal", "Sachin", "Tushar", "Chirag", "Hemant", "Jayesh", "Nilesh", "Paresh", "Umesh",
      "Zara", "Kiara", "Aisha", "Fatima", "Hina", "Rukhsar", "Nazia", "Saba", "Aliya", "Mariam",
      "Surya", "Chandan", "Ravi", "Mohan", "Sohan", "Gopal", "Hari", "Shiv", "Ram", "Lakshman",
      "Prachi", "Varsha", "Sonal", "Heena", "Rina", "Manju", "Suman", "Lata", "Geeta", "Seema",
      "Aryan", "Ishan", "Shivam", "Abhi", "Aman", "Neeraj", "Sunil", "Dinesh", "Mukesh", "Ramesh",
      "Tanya", "Khushi", "Aanchal", "Mansi", "Sakshi", "Ritika", "Payal", "Chetna", "Deepa", "Shilpa",
      "Zubin", "Farhan", "Imran", "Irfan", "Asif", "Danish", "Sameer", "Tariq", "Wasim", "Salman",
      "Naveen", "Praveen", "Santosh", "Jitendra", "Mahendra", "Narendra", "Bharat", "Sumit", "Puneet", "Vinay",
      "Raghav", "Shivansh", "Vedant", "Ansh", "Laksh", "Arnav", "Ayush", "Parth", "Kartik", "Madhav",
      "Kriti", "Mahi", "Navya", "Pihu", "Shanaya", "Trisha", "Vidya", "Yamini", "Zoya", "Suhana",
    ];

    const lastNames = [
      "Sharma", "Verma", "Gupta", "Singh", "Kumar", "Patel", "Shah", "Mehta", "Joshi", "Yadav",
      "Chauhan", "Thakur", "Mishra", "Pandey", "Dubey", "Tiwari", "Srivastava", "Agarwal", "Jain", "Bansal",
      "Reddy", "Rao", "Nair", "Menon", "Iyer", "Pillai", "Varma", "Bhat", "Shetty", "Hegde",
      "Das", "Ghosh", "Bose", "Sen", "Mukherjee", "Chatterjee", "Banerjee", "Roy", "Sarkar", "Dutta",
      "Malhotra", "Kapoor", "Khanna", "Chopra", "Arora", "Bedi", "Dhawan", "Grewal", "Oberoi", "Sethi",
      "Saxena", "Mathur", "Rastogi", "Goel", "Mittal", "Singhal", "Bhatt", "Trivedi", "Dave", "Desai",
      "Patil", "Kulkarni", "Deshpande", "Jog", "Pawar", "Jadhav", "More", "Gaikwad", "Shinde", "Sawant",
      "Chowdhury", "Mazumdar", "Mitra", "Bhattacharya", "Saha", "Pal", "Mondal", "Halder", "Nandi", "Basu",
      "Rathore", "Solanki", "Rajput", "Parmar", "Bhati", "Sisodia", "Shekhawat", "Deora", "Tanwar", "Gehlot",
    ];

    // Cities with weighted distribution (metros get more clients)
    const cityWeighted = [
      ...Array(12).fill("Mumbai"), ...Array(11).fill("Delhi"), ...Array(8).fill("Bangalore"),
      ...Array(7).fill("Hyderabad"), ...Array(6).fill("Kolkata"), ...Array(5).fill("Chennai"),
      ...Array(5).fill("Pune"), ...Array(4).fill("Ahmedabad"), ...Array(4).fill("Jaipur"),
      ...Array(3).fill("Lucknow"), ...Array(3).fill("Noida"), ...Array(3).fill("Gurgaon"),
      ...Array(3).fill("Thane"), ...Array(2).fill("Surat"), ...Array(2).fill("Indore"),
      ...Array(2).fill("Chandigarh"), ...Array(2).fill("Patna"), ...Array(2).fill("Nagpur"),
      ...Array(2).fill("Bhopal"), ...Array(2).fill("Ghaziabad"),
      "Kanpur", "Vadodara", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Varanasi",
      "Aurangabad", "Dhanbad", "Amritsar", "Jodhpur", "Ranchi", "Raipur", "Coimbatore", "Visakhapatnam",
      "Mysore", "Guwahati", "Dehradun", "Udaipur", "Kochi", "Mangalore", "Bhubaneswar", "Trichy",
    ];

    // Realistic Indian ISP IP ranges
    const ispRanges = [
      // Jio
      { prefix: "49.36", label: "Jio" }, { prefix: "49.40", label: "Jio" },
      { prefix: "157.33", label: "Jio" }, { prefix: "157.34", label: "Jio" },
      // Airtel
      { prefix: "103.1", label: "Airtel" }, { prefix: "122.17", label: "Airtel" },
      { prefix: "182.71", label: "Airtel" }, { prefix: "14.139", label: "Airtel" },
      // Vi (Vodafone Idea)
      { prefix: "106.51", label: "Vi" }, { prefix: "115.242", label: "Vi" },
      // BSNL
      { prefix: "117.195", label: "BSNL" }, { prefix: "59.90", label: "BSNL" },
      { prefix: "117.200", label: "BSNL" },
      // Hathway / ACT / broadband
      { prefix: "106.193", label: "Hathway" }, { prefix: "49.205", label: "ACT" },
      { prefix: "223.226", label: "Tata" },
    ];

    // Realistic passwords that Indian users actually set
    const passwords = [
      "India@123", "Pass@1234", "Hello@123", "Kumar@123", "Rohit@123", "Test@1234",
      "Cricket@7", "Admin@123", "Abc@12345", "Qwerty@1", "Lucky@777", "Boss@1234",
      "Virat@18", "Dhoni@07", "King@1234", "Star@2024", "Bet@12345", "Win@99999",
      "Play@2025", "Sachin@10", "Power@123", "Delhi@123", "Mumbai@99", "Royal@777",
    ];

    const now = Date.now();
    const DAY = 86400000;
    const usedUsernames = new Set();

    // ==================== CLIENT SEGMENTS (realistic distribution) ====================
    // Real betting platforms have these segments:
    // 5% VIP/Whale (high balance, high activity, high credit)
    // 15% Regular Active (medium balance, daily login)
    // 30% Casual (low-medium balance, weekly login)
    // 20% Low Activity (deposited but rarely play)
    // 15% Dormant (haven't logged in 30+ days)
    // 8% New (registered in last 7 days)
    // 4% Blocked/Frozen (rule violators)
    // 3% Zero Balance (withdrew everything)

    function getSegment(i) {
      if (i < 50) return "vip";           // 5% - high rollers
      if (i < 200) return "regular";      // 15% - daily players
      if (i < 500) return "casual";       // 30% - weekend players
      if (i < 700) return "low";          // 20% - low activity
      if (i < 850) return "dormant";      // 15% - inactive
      if (i < 930) return "newbie";       // 8% - new registrations
      if (i < 970) return "blocked";      // 4% - banned/frozen
      return "zero";                       // 3% - zero balance
    }

    function generateClient(i) {
      const segment = getSegment(i);
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      const name = fn + " " + ln;
      const city = cityWeighted[Math.floor(Math.random() * cityWeighted.length)];

      // Generate unique username
      let username;
      let attempts = 0;
      do {
        const style = usernameStyles[Math.floor(Math.random() * usernameStyles.length)];
        username = style(fn, ln, i);
        if (usedUsernames.has(username)) username += Math.floor(Math.random() * 99);
        attempts++;
      } while (usedUsernames.has(username) && attempts < 10);
      if (usedUsernames.has(username)) username = fn.toLowerCase() + "_" + i;
      usedUsernames.add(username);

      // Indian mobile (realistic Jio/Airtel prefixes)
      const mobilePrefixes = ["6350", "6367", "6375", "6392", "7014", "7023", "7042", "7065", "7206", "7300",
        "7355", "7428", "7500", "7568", "7620", "7698", "7737", "7791", "7838", "7880",
        "8003", "8058", "8107", "8168", "8219", "8279", "8318", "8368", "8433", "8505",
        "8587", "8630", "8700", "8756", "8800", "8851", "8920", "8989", "9015", "9050",
        "9118", "9166", "9205", "9256", "9311", "9350", "9412", "9456", "9501", "9555",
        "9610", "9649", "9680", "9718", "9760", "9810", "9868", "9899", "9910", "9958"];
      const mob = mobilePrefixes[Math.floor(Math.random() * mobilePrefixes.length)] + String(Math.floor(100000 + Math.random() * 900000));

      // Password
      const pwd = passwords[Math.floor(Math.random() * passwords.length)];

      // IP from realistic ISP
      const isp = ispRanges[Math.floor(Math.random() * ispRanges.length)];
      const lastIp = `${isp.prefix}.${Math.floor(Math.random() * 255)}.${Math.floor(1 + Math.random() * 254)}`;

      // ---- Segment-based realistic values ----
      let coins, creditReference, exposure, totalProfitLoss, status, betStatus, casinoStatus, matkaStatus;
      let lastLoginTime, createdAt, userCommissionType, notes;
      let userMatchCommission, userSessionCommission, userCasinoCommission;
      let userMatchShare, userCasinoShare;

      switch (segment) {
        case "vip": // High rollers - big balance, big credit, active daily
          coins = Math.floor(200000 + Math.random() * 2800000); // 2L - 30L
          creditReference = Math.floor(500000 + Math.random() * 4500000); // 5L - 50L
          exposure = Math.floor(coins * (0.1 + Math.random() * 0.3)); // 10-40% of balance in exposure
          totalProfitLoss = Math.floor(Math.random() * 1000000) - 300000; // mostly in profit
          status = 1; betStatus = true; casinoStatus = true; matkaStatus = Math.random() > 0.3;
          createdAt = new Date(now - Math.floor((90 + Math.random() * 275) * DAY)); // 3-12 months old
          lastLoginTime = new Date(now - Math.floor(Math.random() * 2 * DAY)); // logged in today/yesterday
          userCommissionType = "BetByBet";
          userMatchCommission = 2; userSessionCommission = 2; userCasinoCommission = 3;
          userMatchShare = Math.floor(70 + Math.random() * 25); // 70-95%
          userCasinoShare = Math.floor(60 + Math.random() * 30);
          notes = ["VIP Client", "Premium Player", "High Roller", "Top Client"][Math.floor(Math.random() * 4)];
          break;

        case "regular": // Active daily players
          coins = Math.floor(10000 + Math.random() * 190000); // 10K - 2L
          creditReference = Math.floor(50000 + Math.random() * 450000); // 50K - 5L
          exposure = Math.floor(coins * (0.05 + Math.random() * 0.25));
          totalProfitLoss = Math.floor(Math.random() * 100000) - 60000; // slight loss bias
          status = 1; betStatus = true; casinoStatus = Math.random() > 0.15; matkaStatus = Math.random() > 0.5;
          createdAt = new Date(now - Math.floor((30 + Math.random() * 300) * DAY));
          lastLoginTime = new Date(now - Math.floor(Math.random() * 3 * DAY)); // last 3 days
          userCommissionType = ["BetByBet", "OnlyOnMinus"][Math.floor(Math.random() * 2)];
          userMatchCommission = Math.floor(1 + Math.random() * 2); userSessionCommission = 1; userCasinoCommission = Math.floor(1 + Math.random() * 3);
          userMatchShare = Math.floor(50 + Math.random() * 40);
          userCasinoShare = Math.floor(40 + Math.random() * 40);
          notes = "";
          break;

        case "casual": // Weekend/occasional players
          coins = Math.floor(1000 + Math.random() * 49000); // 1K - 50K
          creditReference = Math.floor(10000 + Math.random() * 90000); // 10K - 1L
          exposure = Math.floor(coins * Math.random() * 0.15);
          totalProfitLoss = Math.floor(Math.random() * 30000) - 18000; // mostly small losses
          status = 1; betStatus = true; casinoStatus = Math.random() > 0.3; matkaStatus = Math.random() > 0.6;
          createdAt = new Date(now - Math.floor((14 + Math.random() * 350) * DAY));
          lastLoginTime = new Date(now - Math.floor((1 + Math.random() * 14) * DAY)); // last 2 weeks
          userCommissionType = ["NoCommission", "BetByBet"][Math.floor(Math.random() * 2)];
          userMatchCommission = Math.floor(Math.random() * 2); userSessionCommission = 0; userCasinoCommission = Math.floor(Math.random() * 2);
          userMatchShare = Math.floor(30 + Math.random() * 50);
          userCasinoShare = Math.floor(20 + Math.random() * 50);
          notes = "";
          break;

        case "low": // Deposited but rarely play
          coins = Math.floor(500 + Math.random() * 15000); // 500 - 15K
          creditReference = Math.floor(5000 + Math.random() * 25000);
          exposure = 0;
          totalProfitLoss = Math.floor(Math.random() * 5000) - 3000;
          status = 1; betStatus = true; casinoStatus = Math.random() > 0.5; matkaStatus = false;
          createdAt = new Date(now - Math.floor((60 + Math.random() * 300) * DAY));
          lastLoginTime = new Date(now - Math.floor((7 + Math.random() * 45) * DAY)); // 1-6 weeks ago
          userCommissionType = "NoCommission";
          userMatchCommission = 0; userSessionCommission = 0; userCasinoCommission = 0;
          userMatchShare = Math.floor(20 + Math.random() * 40);
          userCasinoShare = Math.floor(10 + Math.random() * 40);
          notes = "";
          break;

        case "dormant": // Haven't logged in 30+ days
          coins = Math.floor(Math.random() * 8000); // mostly low balance
          creditReference = Math.floor(5000 + Math.random() * 50000);
          exposure = 0;
          totalProfitLoss = Math.floor(Math.random() * 20000) - 15000; // mostly lost
          status = 1; betStatus = true; casinoStatus = Math.random() > 0.4; matkaStatus = false;
          createdAt = new Date(now - Math.floor((90 + Math.random() * 275) * DAY));
          lastLoginTime = new Date(now - Math.floor((30 + Math.random() * 180) * DAY)); // 1-7 months ago
          userCommissionType = "NoCommission";
          userMatchCommission = 0; userSessionCommission = 0; userCasinoCommission = 0;
          userMatchShare = Math.floor(20 + Math.random() * 30);
          userCasinoShare = Math.floor(10 + Math.random() * 30);
          notes = "";
          break;

        case "newbie": // Registered in last 7 days
          coins = Math.floor(Math.random() * 25000);
          creditReference = Math.floor(10000 + Math.random() * 40000);
          exposure = Math.floor(Math.random() * 2000);
          totalProfitLoss = Math.floor(Math.random() * 5000) - 2000;
          status = 1; betStatus = true; casinoStatus = true; matkaStatus = false;
          createdAt = new Date(now - Math.floor(Math.random() * 7 * DAY)); // last week
          lastLoginTime = new Date(now - Math.floor(Math.random() * 2 * DAY));
          userCommissionType = "NoCommission";
          userMatchCommission = 0; userSessionCommission = 0; userCasinoCommission = 0;
          userMatchShare = Math.floor(30 + Math.random() * 30);
          userCasinoShare = Math.floor(20 + Math.random() * 30);
          notes = "New Registration";
          break;

        case "blocked": // Rule violators, banned
          coins = Math.floor(Math.random() * 5000);
          creditReference = Math.floor(10000 + Math.random() * 100000);
          exposure = 0;
          totalProfitLoss = Math.floor(Math.random() * 50000); // some were in profit (suspicious)
          status = 0; betStatus = false; casinoStatus = false; matkaStatus = false;
          createdAt = new Date(now - Math.floor((30 + Math.random() * 300) * DAY));
          lastLoginTime = new Date(now - Math.floor((5 + Math.random() * 60) * DAY));
          userCommissionType = "NoCommission";
          userMatchCommission = 0; userSessionCommission = 0; userCasinoCommission = 0;
          userMatchShare = 0; userCasinoShare = 0;
          const reasons = [
            "Frozen: Multiple account detected | Auto-unfreeze: manual",
            "Frozen: Suspicious betting pattern | Auto-unfreeze: manual",
            "Frozen: Bonus abuse | Auto-unfreeze: manual",
            "Frozen: Payment dispute | Auto-unfreeze: manual",
            "Frozen: ID verification pending | Auto-unfreeze: manual",
          ];
          notes = reasons[Math.floor(Math.random() * reasons.length)];
          break;

        case "zero": // Withdrew everything
          coins = 0;
          creditReference = Math.floor(5000 + Math.random() * 30000);
          exposure = 0;
          totalProfitLoss = Math.floor(Math.random() * 20000) - 5000; // mixed
          status = 1; betStatus = true; casinoStatus = Math.random() > 0.5; matkaStatus = false;
          createdAt = new Date(now - Math.floor((14 + Math.random() * 200) * DAY));
          lastLoginTime = new Date(now - Math.floor((3 + Math.random() * 30) * DAY));
          userCommissionType = "NoCommission";
          userMatchCommission = 0; userSessionCommission = 0; userCasinoCommission = 0;
          userMatchShare = Math.floor(20 + Math.random() * 40);
          userCasinoShare = Math.floor(10 + Math.random() * 30);
          notes = "";
          break;
      }

      return {
        userType: "client",
        name,
        username,
        checkUsername: username.toUpperCase(),
        password: pwd,
        passwordShow: pwd,
        mobile: mob,
        coins,
        creditReference,
        exposure,
        totalProfitLoss,
        status,
        betStatus,
        casinoStatus,
        matkaStatus,
        matchStatus: status === 1,
        isDeleted: false,
        isDirect: true,
        isPasswordChanged: true,
        intCasinoStatus: casinoStatus,
        userCommissionType,
        userMatchCommission,
        userSessionCommission,
        userCasinoCommission,
        userMatchShare,
        userCasinoShare,
        userShowMatchShare: userMatchShare,
        userShowCasinoShare: userCasinoShare,
        reference: city,
        notes: notes || "",
        lastIp,
        lastLoginTime,
        subagentReferralCode: referralCode,
        subagentId: subAgent ? subAgent._id : null,
        creatorId: loginUser.userId,
        creatorName: agentUser.username,
        agentId: loginUser.userId,
        superagentId: agentUser.superagentId || null,
        masterId: agentUser.masterId || null,
        subadminId: agentUser.subadminId || null,
        adminId: agentUser.adminId || null,
        superadminId: agentUser.superadminId || null,
        subownerId: agentUser.subownerId || null,
        ownerId: agentUser.ownerId || null,
        createdAt,
        updatedAt: lastLoginTime || createdAt,
      };
    }

    // Shuffle indices so segments are mixed, not sorted
    const indices = Array.from({ length: 1000 }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const clients = indices.map(i => generateClient(i));

    // Hash all unique passwords
    const bcryptLib = require("bcrypt");
    const uniquePwds = [...new Set(clients.map(c => c.passwordShow))];
    const hashMap = {};
    for (const p of uniquePwds) { hashMap[p] = await bcryptLib.hash(p, 10); }
    clients.forEach(c => { c.password = hashMap[c.passwordShow]; });

    const result = await UserModel.insertMany(clients, { ordered: false });
    return SendResponse(res, "success", `${result.length} realistic clients seeded with referral code ${referralCode}`);
  } catch (err) {
    if (err.code === 11000) {
      const inserted = err.insertedDocs?.length || err.result?.nInserted || 0;
      return SendResponse(res, "success", `${inserted} clients inserted (some usernames already existed)`);
    }
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== UPDATE CLIENT STATUS FLAGS ========================
async function UpdateClientStatus(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    const schema = Joi.object({
      clientId: Joi.string().required(),
      field: Joi.string().valid("status", "betStatus", "casinoStatus", "matkaStatus", "matchStatus").required(),
    }).options({ allowUnknown: true });

    const { error: joiErr, value: bodyData } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    const clientUser = await UserModel.findOne({
      _id: new ObjectId(bodyData.clientId),
      agentId: new ObjectId(agentId),
      userType: "client",
      isDeleted: false,
    });

    if (!clientUser) {
      return SendResponse(res, "error", "Client not found");
    }

    const field = bodyData.field;
    let newValue;

    if (field === "status") {
      newValue = clientUser.status === 1 ? 0 : 1;
    } else {
      newValue = !clientUser[field];
    }

    await UserModel.updateOne({ _id: clientUser._id }, { $set: { [field]: newValue } });

    // Update Redis cache
    try {
      const redisKey = String(clientUser._id);
      await client.hset(redisKey, field, String(newValue));
    } catch (e) { /* optional */ }

    const fieldLabels = {
      status: "Account Status",
      betStatus: "Bet Status",
      casinoStatus: "Casino Status",
      matkaStatus: "Matka Status",
      matchStatus: "Match Status",
    };

    // Log activity
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId,
        subAgentName: loginUser.name,
        subAgentUsername: loginUser.username,
        agentId: agentId,
        action: `client_${field}`,
        category: "client",
        description: `${fieldLabels[field]} changed to ${newValue} for ${clientUser.username}`,
        targetUser: clientUser.username,
        targetUserId: clientUser._id,
        metadata: { field, newValue },
        ip: requestIp.getClientIp(req),
      }));
    }

    return SendResponse(res, "success", `${fieldLabels[field]} updated for ${clientUser.username}`);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DEPOSIT/WITHDRAW LIST ========================
async function GetDepositWithdrawList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    let whereObj = agentId ? { agentId: new ObjectId(agentId) } : getAgentFilter(req);

    if (bodyData.status) {
      whereObj.status = bodyData.status;
    }
    if (bodyData.fromDate && bodyData.toDate) {
      let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      whereObj.date = dateWhere;
    }
    if (bodyData.userId) {
      whereObj.userId = new ObjectId(bodyData.userId);
    }
    if (bodyData.reqType) {
      whereObj.reqType = bodyData.reqType;
    }

    const specific = {
      name: 1,
      amount: 1,
      username: 1,
      utrNo: 1,
      userId: 1,
      userType: 1,
      approveUserId: 1,
      approverDetails: 1,
      remark: 1,
      reqType: 1,
      canceledRemark: 1,
      status: 1,
      ip: 1,
      createdAt: 1,
      accountDetails: 1,
      wallet: 1,
      screenShotImg: 1,
      paymentMethod: 1,
      paymentTypeId: 1,
    };

    const reqList = await DepositWithdrawModel.find(whereObj, specific).sort({ _id: -1 });
    return SendResponse(res, "success", "List Fetch Successfully", reqList);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== APPROVE/REJECT DEPOSIT WITHDRAW ========================
async function ApproveRejectRequest(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    const schema = Joi.object({
      reqId: Joi.string().required(),
      status: Joi.string().valid("accept", "cancel").required(),
      remark: Joi.string().optional().allow("", null),
      paymentTypeId: Joi.string().optional().allow("", null),
    }).options({ abortEarly: true, allowUnknown: true });

    const { error: joiErr, value: bodyData } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    // Find request scoped to this agent's clients
    const reqData = await DepositWithdrawModel.findOne({
      _id: new ObjectId(bodyData.reqId),
      agentId: new ObjectId(agentId),
    });

    if (!reqData) {
      return SendResponse(res, "error", "Request not found");
    }
    // if (reqData.status !== "pending") {
    //   return SendResponse(res, "error", "Request already processed");
    // }

    // Approver details - use subagent's name but mark it
    const approverName = loginUser.userType === "subagent"
      ? `${loginUser.name} (SubAgent)`
      : loginUser.name;

    const updateRes = {
      status: bodyData.status,
      approverDetails: {
        name: approverName,
        username: loginUser.username,
        userType: loginUser.userType,
      },
      approveUserId: loginUser.userId,
      remark: bodyData.remark || (reqData.reqType === "deposit" ? "deposit by agent" : "withdraw by agent"),
    };
    if (bodyData.paymentTypeId) updateRes.paymentTypeId = new ObjectId(bodyData.paymentTypeId);

    if (reqData.reqType === "deposit") {
      // For deposit accept - add coins to user
      if (bodyData.status === "accept") {
        const parentData = await UserModel.find({ userId: reqData.creatorId });
        const coins = reqData.amount;

        _d(coins , "coins")
       let rrr =  await UpdateUserCoins(coins, reqData.userId, parentData, "user deposit approved");

        _d(rrr, "rrr")
        
        // Check deposit bonus
        try {
          const websiteSettting = await getWebsiteDataByReq(req);
          const websiteData = websiteSettting?.domainData || {};
          if (websiteData?.bonusSetting?.depositBonus) {
            let bonusType = websiteData.bonusSetting.firstTimeDepositBonusType;
            let bonusValue = websiteData.bonusSetting.firstTimeDepositBonusValue;

            const depositCount = await DepositWithdrawModel.countDocuments({
              reqType: "deposit",
              status: "accept",
              userId: new ObjectId(reqData.userId),
            });

            if (depositCount !== 0) {
              bonusType = websiteData.bonusSetting.everyTimeDepositBonusType;
              bonusValue = websiteData.bonusSetting.everyTimeDepositBonusValue;
            }

            if (bonusValue && bonusValue !== 0) {
              const depositCoins = bonusType === "flat" ? bonusValue : (bonusValue * coins) / 100;
              await UpdateUserCoins(depositCoins, reqData.userId, parentData, "depositBonus");
            }
          }
        } catch (e) {
          // Bonus is optional, don't fail the whole request
        }
      }
    } else if (reqData.reqType === "withdraw") {
      // For withdraw cancel - refund coins back
      if (bodyData.status === "cancel") {
        const parentData = await UserModel.find({ userId: reqData.creatorId });
        updateRes.remark = bodyData.remark || "cancel by agent";
        await UpdateUserCoins(reqData.amount, reqData.userId, parentData, "user withdraw request cancel");
      }
    }

    await DepositWithdrawModel.updateOne({ _id: reqData._id }, { $set: updateRes });

    // Log activity
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId,
        subAgentName: loginUser.name,
        subAgentUsername: loginUser.username,
        agentId: agentId,
        action: `${reqData.reqType}_${bodyData.status === "accept" ? "approve" : "reject"}`,
        category: "deposit_withdraw",
        description: `${reqData.reqType} ${bodyData.status === "accept" ? "approved" : "rejected"} for ${reqData.name} (${reqData.username}) - Amount: ${reqData.amount}`,
        targetUser: reqData.username,
        targetUserId: reqData.userId,
        metadata: { amount: reqData.amount, reqType: reqData.reqType, status: bodyData.status },
        ip: requestIp.getClientIp(req),
      }));
    }

    return SendResponse(
      res,
      "success",
      `Request ${bodyData.status === "accept" ? "approved" : "rejected"} for ${reqData.name} (${reqData.username})`
    );
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== VIEW SINGLE REQUEST ========================
async function ViewDepositWithdrawRequest(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { reqId } = req.body;

    if (!reqId) {
      return SendResponse(res, "error", "reqId is required");
    }

    const reqData = await DepositWithdrawModel.findOne({
      _id: new ObjectId(reqId),
      agentId: new ObjectId(agentId),
    }).lean();

    if (!reqData) {
      return SendResponse(res, "error", "Request not found");
    }

    return SendResponse(res, "success", "Request details fetched", reqData);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CLIENT LIST ========================
async function ClientList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }
    let loginUserType = loginUser.userType;

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    let whereObj = {
      ...(agentId ? { agentId: new ObjectId(agentId) } : buildHierarchyFilter(loginUser)),
      userType: "client",
      isDeleted: false,
    };

    // Search
    if (bodyData.searchValue) {
      const regex = new RegExp(bodyData.searchValue, "i");
      whereObj.$or = [
        { username: regex },
        { name: regex },
        { mobile: regex },
      ];
    }

    // Status filter
    if (bodyData.status !== undefined && bodyData.status !== "") {
      whereObj.status = Number(bodyData.status);
    }

    // Date filter (createdAt)
    if (bodyData.fromDate && bodyData.toDate) {
      const from = new Date(bodyData.fromDate); from.setHours(0, 0, 0, 0);
      const to = new Date(bodyData.toDate); to.setHours(23, 59, 59, 999);
      whereObj.createdAt = { $gte: from, $lte: to };
    }

    // Domain filter
    if (bodyData.domain) {
      whereObj.allowedDomains = { $regex: bodyData.domain, $options: "i" };
    }

    // Bet status filter
    if (bodyData.betStatus !== undefined && bodyData.betStatus !== "") {
      whereObj.betStatus = bodyData.betStatus === "true" || bodyData.betStatus === true;
    }

    // Balance filter
    if (bodyData.balanceFilter === "zero") whereObj.coins = 0;
    else if (bodyData.balanceFilter === "positive") whereObj.coins = { $gt: 0 };
    else if (bodyData.balanceFilter === "negative") whereObj.exposure = { $lt: 0 };

    // Sort
    let sortObj = { createdAt: -1 };
    if (bodyData.sortBy === "coins") sortObj = { coins: -1 };
    else if (bodyData.sortBy === "exposure") sortObj = { exposure: 1 };
    else if (bodyData.sortBy === "lastLogin") sortObj = { lastLoginTime: -1 };
    else if (bodyData.sortBy === "name") sortObj = { name: 1 };

    const specific = {
      name: 1, username: 1, mobile: 1, userType: 1,
      coins: 1, exposure: 1, creditReference: 1,
      status: 1, betStatus: 1, matchStatus: 1, casinoStatus: 1, intCasinoStatus: 1, matkaStatus: 1,
      createdAt: 1, lastLoginTime: 1, lastIp: 1,
      userMatchShare: 1, userCasinoShare: 1, userMatkaShare: 1,
      userMatchCommission: 1, userSessionCommission: 1, userCasinoCommission: 1,
      userCommissionType: 1, reference: 1, allowedDomains: 1, passwordShow: 1,
    };

    // Pagination
    const page = bodyData.pageNo || 1;
    const size = bodyData.size || 50;
    const skip = (page - 1) * size;


    if (loginUserType === "subagent") {
      whereObj[`subagentId`] = new ObjectId(loginUser.userId);
    }

    ///_d(whereObj , "")

    const [clients, totalCount] = await Promise.all([
      UserModel.find(whereObj, specific).sort(sortObj).skip(skip).limit(size).lean(),
      UserModel.countDocuments(whereObj),
    ]);

    return SendResponse(res, "success", "Client list fetched", { data: clients, totalCount, page, size });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== ACCOUNT DETAILS (Agent's payment info) ========================
// ======================== PAYMENT ACCOUNTS CRUD ========================
async function GetAccountDetails(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    let whereObj = agentId ? { agentId: new ObjectId(agentId) } : getAgentFilter(req);
    if (bodyData.accountType) whereObj.accountType = bodyData.accountType;
    if (bodyData.status) whereObj.status = bodyData.status;

    const accounts = await PaymentAccountModel.find(whereObj).sort({ createdAt: -1 }).lean();
    return SendResponse(res, "success", "Account list fetched", accounts);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function CreatePaymentAccount(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    const schema = Joi.object({
      accountName: Joi.string().required(),
      accountType: Joi.string().valid("Bank", "Paytm", "PhonePe", "GPay", "BhimUPI", "Crypto").required(),
      fromAmount: Joi.number().default(0),
      toAmount: Joi.number().default(0),
      reference: Joi.string().optional().allow("", null),
      bankName: Joi.string().optional().allow(""),
      accountNumber: Joi.string().optional().allow(""),
      accountHolderName: Joi.string().optional().allow(""),
      ifscCode: Joi.string().optional().allow(""),
      branchName: Joi.string().optional().allow(""),
      upiId: Joi.string().optional().allow(""),
      mobileNo: Joi.string().optional().allow(""),
      qrImage: Joi.string().optional().allow(""),
      walletId: Joi.string().optional().allow(""),
      cryptoType: Joi.string().optional().allow(""),
      cryptoQrImage: Joi.string().optional().allow(""),
      priority: Joi.number().default(0),
      dailyLimit: Joi.number().default(0),
      scheduleEnabled: Joi.boolean().default(false),
      scheduleFrom: Joi.string().default("00:00"),
      scheduleTo: Joi.string().default("23:59"),
      assignedDomains: Joi.array().items(Joi.string()).default([]),
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));

    const agentUser = await UserModel.findById(agentId).lean();
    if (!agentUser) return SendResponse(res, "error", "Agent not found");

    const account = new PaymentAccountModel({
      ...body,
      userId: agentUser._id,
      username: agentUser.username,
      userType: agentUser.userType,
      ownerId: agentUser.ownerId,
      subownerId: agentUser.subownerId,
      superadminId: agentUser.superadminId,
      adminId: agentUser.adminId,
      subadminId: agentUser.subadminId,
      masterId: agentUser.masterId,
      superagentId: agentUser.superagentId,
      agentId: agentUser._id,
      creatorId: agentUser.creatorId,
    });

    await account.save();

    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "account_create", category: "account",
        description: `Payment account "${body.accountName}" (${body.accountType}) created`,
        ip: requestIp.getClientIp(req),
      }));
    }

    return SendResponse(res, "success", "Account created successfully", account);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function UpdateAccountDetails(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    if (!bodyData.accountId) return SendResponse(res, "error", "accountId is required");

    const account = await PaymentAccountModel.findOne({ _id: new ObjectId(bodyData.accountId), agentId: new ObjectId(agentId) });
    if (!account) return SendResponse(res, "error", "Account not found");

    const allowedFields = [
      "accountName", "accountType", "status", "reference", "fromAmount", "toAmount",
      "bankName", "accountNumber", "accountHolderName", "ifscCode", "branchName",
      "upiId", "mobileNo", "qrImage", "walletId", "cryptoType", "cryptoQrImage",
      "priority", "dailyLimit", "scheduleEnabled", "scheduleFrom", "scheduleTo", "assignedDomains",
    ];

    const updateObj = {};
    allowedFields.forEach((f) => { if (bodyData[f] !== undefined) updateObj[f] = bodyData[f]; });

    await PaymentAccountModel.updateOne({ _id: account._id }, { $set: updateObj });

    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "account_update", category: "account",
        description: `Payment account "${account.accountName}" updated`,
        ip: requestIp.getClientIp(req),
      }));
    }

    const updated = await PaymentAccountModel.findById(account._id).lean();
    return SendResponse(res, "success", "Account updated successfully", updated);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function DeletePaymentAccount(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { accountId } = req.body;
    if (!accountId) return SendResponse(res, "error", "accountId is required");

    const account = await PaymentAccountModel.findOne({ _id: new ObjectId(accountId), agentId: new ObjectId(agentId) });
    if (!account) return SendResponse(res, "error", "Account not found");

    await PaymentAccountModel.deleteOne({ _id: account._id });

    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "account_delete", category: "account",
        description: `Payment account "${account.accountName}" (${account.accountType}) deleted`,
        ip: requestIp.getClientIp(req),
      }));
    }

    return SendResponse(res, "success", "Account deleted successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function TogglePaymentAccountStatus(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { accountId } = req.body;
    if (!accountId) return SendResponse(res, "error", "accountId is required");

    const account = await PaymentAccountModel.findOne({ _id: new ObjectId(accountId), agentId: new ObjectId(agentId) });
    if (!account) return SendResponse(res, "error", "Account not found");

    const newStatus = account.status === "active" ? "inactive" : "active";
    await PaymentAccountModel.updateOne({ _id: account._id }, { status: newStatus });

    return SendResponse(res, "success", `Account ${newStatus === "active" ? "activated" : "deactivated"} successfully`);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function DuplicatePaymentAccount(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { accountId } = req.body;
    if (!accountId) return SendResponse(res, "error", "accountId is required");

    const original = await PaymentAccountModel.findOne({ _id: new ObjectId(accountId), agentId: new ObjectId(agentId) }).lean();
    if (!original) return SendResponse(res, "error", "Account not found");

    const { _id, createdAt, updatedAt, ...cloneData } = original;
    cloneData.accountName = `${original.accountName} (Copy)`;
    cloneData.status = "inactive";
    cloneData.todayDeposits = 0;
    cloneData.todayDepositAmount = 0;

    const newAccount = new PaymentAccountModel(cloneData);
    await newAccount.save();

    return SendResponse(res, "success", "Account duplicated successfully", newAccount);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function AccountTransactionStats(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    // Get all accounts
    const accounts = await PaymentAccountModel.find({ agentId: new ObjectId(agentId) }).lean();
    if (accounts.length === 0) return SendResponse(res, "success", "No accounts", []);

    // Get last 7 days deposits per account (match by paymentMethod which stores account type)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const depositStats = await DepositWithdrawModel.aggregate([
      {
        $match: {
          agentId: new ObjectId(agentId),
          reqType: "deposit",
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          totalDeposits: { $sum: 1 },
          totalAmount: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, "$amount", 0] } },
          acceptedCount: { $sum: { $cond: [{ $eq: ["$status", "accept"] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancel"] }, 1, 0] } },
        },
      },
    ]);

    // Map stats to accounts
    const result = accounts.map((acc) => {
      const stats = depositStats.find((s) => s._id === acc.accountType) || {};
      return {
        _id: acc._id,
        accountName: acc.accountName,
        accountType: acc.accountType,
        status: acc.status,
        last7Days: {
          totalDeposits: stats.totalDeposits || 0,
          totalAmount: stats.totalAmount || 0,
          acceptedCount: stats.acceptedCount || 0,
          pendingCount: stats.pendingCount || 0,
          cancelledCount: stats.cancelledCount || 0,
          successRate: stats.totalDeposits ? Math.round(((stats.acceptedCount || 0) / stats.totalDeposits) * 100) : 0,
        },
      };
    });

    return SendResponse(res, "success", "Account stats fetched", result);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function UpdateAccountPriority(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { accounts } = req.body; // [{accountId, priority}]

    if (!Array.isArray(accounts) || accounts.length === 0) {
      return SendResponse(res, "error", "accounts array is required");
    }

    const bulkOps = accounts.map((a) => ({
      updateOne: {
        filter: { _id: new ObjectId(a.accountId), agentId: new ObjectId(agentId) },
        update: { $set: { priority: a.priority } },
      },
    }));

    await PaymentAccountModel.bulkWrite(bulkOps);
    return SendResponse(res, "success", "Priority updated successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DOMAIN SETTINGS ========================
async function GetDomainList(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);

    // Get agent's allowedDomains
    const agentUser = await UserModel.findById(agentId).select("allowedDomains").lean();
    const allowedDomains = agentUser?.allowedDomains || [];

    if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
      return SendResponse(res, "success", "Domain list fetched", []);
    }

    // Build regex patterns to match domainUrl containing any of the allowed domains
    const domainRegexes = allowedDomains.map((d) => new RegExp(d, "i"));

    const domains = await DomainModel.find({
      $or: domainRegexes.map((r) => ({ domainUrl: r })),
      isDeleted: false,
    }).lean();

    return SendResponse(res, "success", "Domain list fetched", domains);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function GetDomainDetails(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const { domainId } = req.body;

    if (!domainId) {
      return SendResponse(res, "error", "domainId is required");
    }

    // Verify domain belongs to agent's allowedDomains
    const agentUser = await UserModel.findById(agentId).select("allowedDomains").lean();
    const allowedDomains = agentUser?.allowedDomains || [];

    const domain = await DomainModel.findOne({
      _id: new ObjectId(domainId),
      isDeleted: false,
    }).lean();

    if (!domain) {
      return SendResponse(res, "error", "Domain not found");
    }

    // Check if domain URL matches any allowed domain
    const isAllowed = Array.isArray(allowedDomains) && allowedDomains.some((d) =>
      domain.domainUrl && domain.domainUrl.includes(d)
    );

    if (!isAllowed) {
      return SendResponse(res, "error", "Domain not assigned to you");
    }

    return SendResponse(res, "success", "Domain details fetched", domain);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function UpdateDomain(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    if (!bodyData.domainId) {
      return SendResponse(res, "error", "domainId is required");
    }

    // Verify domain belongs to agent's allowedDomains
    const agentUser = await UserModel.findById(agentId).select("allowedDomains").lean();
    const allowedDomains = agentUser?.allowedDomains || [];

    const domain = await DomainModel.findOne({
      _id: new ObjectId(bodyData.domainId),
      isDeleted: false,
    });


    if (!domain) {
      return SendResponse(res, "error", "Domain not found");
    }

    const isAllowed = Array.isArray(allowedDomains) && allowedDomains.some((d) =>
      domain.domainUrl && domain.domainUrl.includes(d)
    );

    if (!isAllowed) {
      return SendResponse(res, "error", "Domain not assigned to you");
    }

    // Allowed fields that agent/subagent can update
    const updateData = {};
    const allowedFields = [
      "userNotification", "clientNotification", "logo", "favicon", "title",
      "whatsappNumber", "helplineNumber", "isRegister", "isReferral",
      "talkTo", "maximumWithdrawAmount", "minimumWithdrawAmount",
      "themeSetting", "banner", "socialMedia", "barcode", "upi", "account",
      "bonusSetting", "color", "sportsSetting", "registerBonus", "onEveryDeposit",
      "isAffilation", "isSignupBonus", "isSignUpOtp", "isCashOut",
      "reffrelSetting", "signUpBonusSetting", "imgBaseUrl",
      "depositSetting", "clientRestrictions", "maintenance", "seoMeta", "contentPages", "popupSetting",
    ];

    allowedFields.forEach((field) => {
      if (bodyData[field] !== undefined) {
        updateData[field] = bodyData[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return SendResponse(res, "error", "No valid fields to update");
    }


    await DomainModel.updateOne({ _id: domain._id }, { $set: updateData });
    const updated = await DomainModel.findById(domain._id).lean();
    await client.set(updated.domainUrl, JSON.stringify(updated));

    try {
      await client.hset(updated.domainUrl, Object.entries({
        domainData: JSON.stringify(updated),
      }).flat());
    //  _d(updated, "updated")

    } catch (e) { /* Redis update optional */ }


    const updatedDomain = await DomainModel.findById(domain._id).lean();
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "domain_update", category: "domain",
        description: `Domain ${domain.domainUrl} updated by ${loginUser.username}`,
        metadata: { domainUrl: domain.domainUrl, fields: Object.keys(updateData) },
        ip: requestIp.getClientIp(req),
      }));
    }



    return SendResponse(res, "success", "Domain updated successfully", updatedDomain);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== GET PROFILE ========================
async function GetProfile(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    let profile;
    if (loginUser.userType === "agent") {
      profile = await UserModel.findById(loginUser.userId)
        .select("name username mobile userType coins exposure creditReference status lastIp lastLoginTime createdAt")
        .lean();
    } else {
      profile = await SubAgentModel.findById(loginUser.userId)
        .select("name username mobile userType roleName permissions status lastIp lastLoginTime createdAt agentId")
        .lean();
      // Get agent name
      if (profile?.agentId) {
        const agent = await UserModel.findById(profile.agentId).select("name username").lean();
        if (agent) {
          profile.agentName = agent.name;
          profile.agentUsername = agent.username;
        }
      }
    }

    if (!profile) {
      return SendResponse(res, "error", "Profile not found");
    }

    return SendResponse(res, "success", "Profile fetched", profile);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CHANGE PASSWORD ========================
async function ChangePassword(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const schema = Joi.object({
      oldPassword: Joi.string().required(),
      newPassword: Joi.string().min(4).required(),
    }).options({ allowUnknown: true });

    const { error: joiErr, value: bodyData } = schema.validate(req.body);
    if (joiErr) {
      return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    }

    let user;
    if (loginUser.userType === "agent") {
      user = await UserModel.findById(loginUser.userId);
    } else {
      user = await SubAgentModel.findById(loginUser.userId);
    }

    if (!user) {
      return SendResponse(res, "error", "User not found");
    }

    // Verify old password
    const pwOK = await bcrypt.compare(bodyData.oldPassword, user.password);
    if (!pwOK) {
      return SendResponse(res, "error", "Current password is incorrect");
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(bodyData.newPassword, salt);

    const updateObj = {
      password: hashedPassword,
      passwordShow: bodyData.newPassword,
    };

    if (loginUser.userType === "agent") {
      await UserModel.updateOne({ _id: loginUser.userId }, updateObj);
    } else {
      await SubAgentModel.updateOne({ _id: loginUser.userId }, updateObj);
    }

    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId: loginUser.agentId, action: "password_change", category: "auth",
        description: `Password changed by ${loginUser.username}`,
        ip: requestIp.getClientIp(req),
      }));
    }

    return SendResponse(res, "success", "Password changed successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DEPOSIT/WITHDRAW REPORT ========================
async function DepositWithdrawReport(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    let matchStage = { agentId: new ObjectId(agentId) };

    if (bodyData.fromDate && bodyData.toDate) {
      const from = new Date(bodyData.fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(bodyData.toDate);
      to.setHours(23, 59, 59, 999);
      matchStage.createdAt = { $gte: from, $lte: to };
    }
    if (bodyData.reqType) matchStage.reqType = bodyData.reqType;
    if (bodyData.status) matchStage.status = bodyData.status;
    if (bodyData.userId) matchStage.userId = new ObjectId(bodyData.userId);

    // Summary stats
    const summaryPipeline = [
      { $match: { agentId: new ObjectId(agentId), ...(matchStage.createdAt ? { createdAt: matchStage.createdAt } : {}) } },
      {
        $group: {
          _id: null,
          totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          cancelledDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
          cancelledWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
          totalDepositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          totalWithdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
          pendingDepositCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, 1, 0] } },
          pendingWithdrawCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, 1, 0] } },
        },
      },
    ];

    // Datewise breakdown
    const datewisePipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
          deposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          withdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ];

    // Userwise breakdown
    const userwisePipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$userId",
          name: { $first: "$name" },
          username: { $first: "$username" },
          totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
          depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
          withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
        },
      },
      { $addFields: { net: { $subtract: ["$totalDeposit", "$totalWithdraw"] } } },
      { $sort: { totalDeposit: -1 } },
    ];

    const [summary, datewise, userwise] = await Promise.all([
      DepositWithdrawModel.aggregate(summaryPipeline),
      DepositWithdrawModel.aggregate(datewisePipeline),
      DepositWithdrawModel.aggregate(userwisePipeline),
    ]);

    return SendResponse(res, "success", "Report fetched", {
      summary: summary[0] || {
        totalDeposit: 0, totalWithdraw: 0, pendingDeposit: 0, pendingWithdraw: 0,
        cancelledDeposit: 0, cancelledWithdraw: 0, totalDepositCount: 0, totalWithdrawCount: 0,
        pendingDepositCount: 0, pendingWithdrawCount: 0,
      },
      datewise,
      userwise,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== ACTIVITY LOG ========================
async function GetActivityLog(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    let whereObj = agentId ? { agentId: new ObjectId(agentId) } : getAgentFilter(req);

    // Filters
    if (bodyData.subAgentId) whereObj.subAgentId = new ObjectId(bodyData.subAgentId);
    if (bodyData.category) whereObj.category = bodyData.category;
    if (bodyData.action) whereObj.action = bodyData.action;
    if (bodyData.fromDate && bodyData.toDate) {
      const from = new Date(bodyData.fromDate); from.setHours(0, 0, 0, 0);
      const to = new Date(bodyData.toDate); to.setHours(23, 59, 59, 999);
      whereObj.createdAt = { $gte: from, $lte: to };
    }

    const page = bodyData.pageNo || 1;
    const size = bodyData.size || 50;
    const skip = (page - 1) * size;

    const [logs, totalCount] = await Promise.all([
      SubAgentActivityModel.find(whereObj).sort({ createdAt: -1 }).skip(skip).limit(size).lean(),
      SubAgentActivityModel.countDocuments(whereObj),
    ]);

    return SendResponse(res, "success", "Activity log fetched", { data: logs, totalCount, page, size });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== 2FA - GOOGLE AUTHENTICATOR ========================
async function Setup2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can setup 2FA");
    }

    const { subAgentId } = req.body;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId is required");

    const subAgent = await SubAgentModel.findOne({
      _id: new ObjectId(subAgentId),
      agentId: new ObjectId(loginUser.userId),
      isDeleted: false,
    });
    if (!subAgent) return SendResponse(res, "error", "SubAgent not found");

    // Generate secret using common helper
    const { generateSecret } = require("../../Helpers/TwoFactorAuth");
    const secretData = await generateSecret(subAgent.username, "StaffPanel");

    await SubAgentModel.updateOne({ _id: subAgent._id }, { twoFASecret: secretData.secret });

    return SendResponse(res, "success", "2FA setup initiated", {
      secret: secretData.secret,
      qrCode: secretData.qrCode,
      otpauthUrl: secretData.otpauthUrl,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function Verify2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can verify 2FA");
    }

    const { subAgentId, otpToken } = req.body;
    if (!subAgentId || !otpToken) return SendResponse(res, "error", "subAgentId and otpToken required");

    const subAgent = await SubAgentModel.findOne({
      _id: new ObjectId(subAgentId),
      agentId: new ObjectId(loginUser.userId),
      isDeleted: false,
    });
    if (!subAgent) return SendResponse(res, "error", "SubAgent not found");
    if (!subAgent.twoFASecret) return SendResponse(res, "error", "2FA not setup yet");

    const { verifySetupCode } = require("../../Helpers/TwoFactorAuth");
    if (!verifySetupCode(subAgent.twoFASecret, otpToken)) return SendResponse(res, "error", "Invalid OTP code. Try again.");

    await SubAgentModel.updateOne({ _id: subAgent._id }, { is2FAEnabled: true });

    setImmediate(() => logActivity({
      subAgentId: loginUser.userId,
      subAgentName: loginUser.name,
      subAgentUsername: loginUser.username,
      agentId: loginUser.userId,
      action: "2fa_enable",
      category: "subagent",
      description: `2FA enabled for ${subAgent.username}`,
      targetUser: subAgent.username,
      targetUserId: subAgent._id,
      ip: requestIp.getClientIp(req),
    }));

    return SendResponse(res, "success", "2FA enabled successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

async function Disable2FA(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Only agent can disable 2FA");
    }

    const { subAgentId } = req.body;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId is required");

    const subAgent = await SubAgentModel.findOne({
      _id: new ObjectId(subAgentId),
      agentId: new ObjectId(loginUser.userId),
      isDeleted: false,
    });
    if (!subAgent) return SendResponse(res, "error", "SubAgent not found");

    await SubAgentModel.updateOne({ _id: subAgent._id }, { is2FAEnabled: false, twoFASecret: null });

    setImmediate(() => logActivity({
      subAgentId: loginUser.userId,
      subAgentName: loginUser.name,
      subAgentUsername: loginUser.username,
      agentId: loginUser.userId,
      action: "2fa_disable",
      category: "subagent",
      description: `2FA disabled for ${subAgent.username}`,
      targetUser: subAgent.username,
      targetUserId: subAgent._id,
      ip: requestIp.getClientIp(req),
    }));

    return SendResponse(res, "success", "2FA disabled successfully");
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== DASHBOARD STATS ========================
async function DashboardStats(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) {
      return SendResponse(res, "error", "Not authorized");
    }

    const isSubAgent = loginUser.userType === "subagent";
    const agentId = resolveAgentId(req);
    const bodyData = req.body;

    // Date range - default today
    const from = new Date(bodyData.fromDate || new Date().toISOString().split("T")[0]);
    from.setHours(0, 0, 0, 0);
    const to = new Date(bodyData.toDate || new Date().toISOString().split("T")[0]);
    to.setHours(23, 59, 59, 999);

    const agentFilter = agentId ? { agentId: new ObjectId(agentId) } : buildHierarchyFilter(loginUser);
    const dateFilter = { $gte: from, $lte: to };

    // SubAgent-specific: filter activity/performance by subAgentId
    const subAgentObjId = isSubAgent ? new ObjectId(loginUser.userId) : null;
    const activityFilter = isSubAgent
      ? { ...agentFilter, subAgentId: subAgentObjId }
      : agentFilter;

    // SubAgent-specific: filter D/W by approveUserId (who processed it)
    const dwProcessedFilter = isSubAgent
      ? { ...agentFilter, approveUserId: subAgentObjId, createdAt: dateFilter }
      : { ...agentFilter, createdAt: dateFilter };

    // Run all queries in parallel
    const [
      totalClients,
      activeClients,
      depositStats,
      topWinners,
      topLosers,
      recentActivity,
      todayLogins,
      totalExposure,
    ] = await Promise.all([
      // 1. Total clients count
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false }),

      // 2. Active clients count
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, status: 1 }),

      // 3. Deposit/Withdraw summary - for subagent show what they processed
      DepositWithdrawModel.aggregate([
        { $match: dwProcessedFilter },
        {
          $group: {
            _id: null,
            totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            cancelledDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
            cancelledWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "cancel"] }] }, "$amount", 0] } },
            depositCount: { $sum: { $cond: [{ $eq: ["$reqType", "deposit"] }, 1, 0] } },
            withdrawCount: { $sum: { $cond: [{ $eq: ["$reqType", "withdraw"] }, 1, 0] } },
            pendingDepositCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, 1, 0] } },
            pendingWithdrawCount: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, 1, 0] } },
          },
        },
      ]),

      // 4. Top 5 winning clients
      CrickTransactionLogModel.aggregate([
        { $match: { ...agentFilter, transactionType: "profitLoss", createdAt: dateFilter } },
        { $group: { _id: "$clientId", totalPL: { $sum: "$clientProfitLoss" } } },
        { $sort: { totalPL: -1 } },
        { $limit: 5 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", pipeline: [{ $project: { name: 1, username: 1 } }], as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { userId: "$_id", name: "$user.name", username: "$user.username", profitLoss: "$totalPL" } },
      ]),

      // 5. Top 5 losing clients
      CrickTransactionLogModel.aggregate([
        { $match: { ...agentFilter, transactionType: "profitLoss", createdAt: dateFilter } },
        { $group: { _id: "$clientId", totalPL: { $sum: "$clientProfitLoss" } } },
        { $sort: { totalPL: 1 } },
        { $limit: 5 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", pipeline: [{ $project: { name: 1, username: 1 } }], as: "user" } },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $project: { userId: "$_id", name: "$user.name", username: "$user.username", profitLoss: "$totalPL" } },
      ]),

      // 6. Recent activity - subagent sees only own activity
      SubAgentActivityModel.find(activityFilter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("subAgentName action category description createdAt")
        .lean(),

      // 7. Today's logins - subagent sees own login count
      isSubAgent
        ? SubAgentActivityModel.countDocuments({ ...activityFilter, action: "login", createdAt: dateFilter })
        : SubAgentActivityModel.countDocuments({ ...agentFilter, action: "login", createdAt: dateFilter }),

      // 8. Total exposure of all clients
      UserModel.aggregate([
        { $match: { ...agentFilter, userType: "client", isDeleted: false } },
        { $group: { _id: null, totalExposure: { $sum: "$exposure" }, totalCoins: { $sum: "$coins" } } },
      ]),
    ]);

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [
      newClientsToday,
      todayBetsCount,
      todayTurnover,
      last24hLogins,
      last1hActive,
      neverLoggedIn,
      dwTrend,
      subAgentPerformance,
      highExposureClients,
      largePendingWithdraws,
      subAgentCount,
      // SubAgent-specific: my processed count today
      myProcessedToday,
    ] = await Promise.all([
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      OddsBetsListModel.countDocuments({ ...agentFilter, createdAt: { $gte: todayStart, $lte: todayEnd } }),
      OddsBetsListModel.aggregate([
        { $match: { ...agentFilter, createdAt: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: { $gte: oneDayAgo } }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: { $gte: oneHourAgo } }),
      UserModel.countDocuments({ ...agentFilter, userType: "client", isDeleted: false, lastLoginTime: null }),

      // D/W trend - for subagent show only what they processed
      DepositWithdrawModel.aggregate([
        {
          $match: isSubAgent
            ? { ...agentFilter, approveUserId: subAgentObjId, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
            : { ...agentFilter, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
            deposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            withdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // SubAgent performance - for subagent show only own, for agent show all
      isSubAgent
        ? SubAgentActivityModel.aggregate([
          { $match: { ...agentFilter, subAgentId: subAgentObjId, createdAt: { $gte: todayStart, $lte: todayEnd } } },
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 },
              approved: { $sum: { $cond: [{ $in: ["$action", ["deposit_approve", "withdraw_approve"]] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $in: ["$action", ["deposit_reject", "withdraw_reject"]] }, 1, 0] } },
            },
          },
        ])
        : SubAgentActivityModel.aggregate([
          { $match: { ...agentFilter, category: "deposit_withdraw", createdAt: { $gte: todayStart, $lte: todayEnd } } },
          {
            $group: {
              _id: { subAgentId: "$subAgentId", subAgentName: "$subAgentName" },
              approved: { $sum: { $cond: [{ $in: ["$action", ["deposit_approve", "withdraw_approve"]] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $in: ["$action", ["deposit_reject", "withdraw_reject"]] }, 1, 0] } },
              totalActions: { $sum: 1 },
            },
          },
          { $sort: { totalActions: -1 } },
          { $limit: 10 },
        ]),

      UserModel.find({ ...agentFilter, userType: "client", isDeleted: false, exposure: { $lt: -5000 } })
        .select("name username exposure coins").sort({ exposure: 1 }).limit(5).lean(),

      DepositWithdrawModel.find({ ...agentFilter, reqType: "withdraw", status: "pending", amount: { $gt: 10000 } })
        .select("name username amount createdAt").sort({ amount: -1 }).limit(5).lean(),

      SubAgentModel.countDocuments({ ...agentFilter, isDeleted: false }),

      // My processed D/W today (subagent only)
      isSubAgent
        ? DepositWithdrawModel.aggregate([
          { $match: { ...agentFilter, approveUserId: subAgentObjId, createdAt: { $gte: todayStart, $lte: todayEnd }, status: { $in: ["accept", "cancel"] } } },
          { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$amount" } } },
        ])
        : Promise.resolve([]),
    ]);

    const dwStats = depositStats[0] || {
      totalDeposit: 0, totalWithdraw: 0, pendingDeposit: 0, pendingWithdraw: 0,
      cancelledDeposit: 0, cancelledWithdraw: 0, depositCount: 0, withdrawCount: 0,
      pendingDepositCount: 0, pendingWithdrawCount: 0,
    };

    const exposureData = totalExposure[0] || { totalExposure: 0, totalCoins: 0 };

    // Build subagent performance response
    let subAgentPerfData;
    if (isSubAgent) {
      // For subagent: show category-wise breakdown of their own actions
      const totalActions = subAgentPerformance.reduce((s, c) => s + c.count, 0);
      const totalApproved = subAgentPerformance.reduce((s, c) => s + (c.approved || 0), 0);
      const totalRejected = subAgentPerformance.reduce((s, c) => s + (c.rejected || 0), 0);
      subAgentPerfData = [{ name: loginUser.name || "You", approved: totalApproved, rejected: totalRejected, total: totalActions }];
    } else {
      subAgentPerfData = subAgentPerformance.map((s) => ({
        name: s._id.subAgentName,
        approved: s.approved,
        rejected: s.rejected,
        total: s.totalActions,
      }));
    }

    // SubAgent: my processed summary
    let myStats = null;
    if (isSubAgent) {
      const accepted = myProcessedToday.find(m => m._id === "accept") || { count: 0, total: 0 };
      const cancelled = myProcessedToday.find(m => m._id === "cancel") || { count: 0, total: 0 };
      myStats = {
        processedToday: accepted.count + cancelled.count,
        approvedCount: accepted.count,
        approvedAmount: accepted.total,
        rejectedCount: cancelled.count,
        rejectedAmount: cancelled.total,
      };
    }

    return SendResponse(res, "success", "Dashboard stats fetched", {
      isSubAgent,
      clients: { total: totalClients, active: activeClients, inactive: totalClients - activeClients },
      balance: { totalCoins: exposureData.totalCoins, totalExposure: exposureData.totalExposure },
      depositWithdraw: dwStats,
      topWinners: topWinners.filter((w) => w.name),
      topLosers: topLosers.filter((l) => l.name),
      recentActivity,
      todayLogins,
      subAgentCount,
      todayQuick: {
        newClients: newClientsToday,
        totalBets: todayBetsCount,
        totalTurnover: (todayTurnover[0] || {}).total || 0,
      },
      onlineClients: {
        last24h: last24hLogins,
        last1h: last1hActive,
        neverLoggedIn,
      },
      dwTrend,
      subAgentPerformance: subAgentPerfData,
      riskAlerts: {
        highExposure: highExposureClients,
        largePendingWithdraws,
      },
      myStats,
    });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== CLIENT FACING - GET PAYMENT ACCOUNTS ========================
async function GetClientPaymentAccounts(req, res) {
  try {
    const bodyData = req.body;
    const { clientId, amount, domain } = bodyData;

    if (!clientId) {
      return SendResponse(res, "error", "clientId is required");
    }

    // Get client to find agentId
    const clientUser = await UserModel.findById(clientId).select("agentId status isDeleted username name").lean();
    if (!clientUser || clientUser.isDeleted) {
      return SendResponse(res, "error", "Client not found");
    }
    if (!clientUser.status) {
      return SendResponse(res, "error", "Client is inactive");
    }
    if (!clientUser.agentId) {
      return SendResponse(res, "error", "No agent assigned to this client");
    }



    // Build query - only active accounts for this agent
    let whereObj = {
      agentId: new ObjectId(clientUser.agentId),
      status: "active",
    };

    // Amount range filter: account shows if (fromAmount=0 AND toAmount=0) OR (fromAmount <= amount <= toAmount)
    // We handle this after fetching since MongoDB can't easily do "if both 0 then skip check"

    const allAccounts = await PaymentAccountModel.find(whereObj)
      .select("-userId -ownerId -subownerId -superadminId -adminId -subadminId -masterId -superagentId -agentId -creatorId -__v -todayDeposits -todayDepositAmount -todayDate")
      .sort({ priority: 1, createdAt: -1 })
      .lean();


    // _d(allAccounts, "allAccounts")
    // Now filter by conditions
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const filtered = allAccounts.filter((acc) => {
      // 1. Amount range check
      if (amount && amount > 0) {
        const hasRange = acc.fromAmount > 0 || acc.toAmount > 0;
        if (hasRange) {
          if (amount < acc.fromAmount || amount > acc.toAmount) return false;
        }
      }

      // 2. Schedule check
      if (acc.scheduleEnabled && acc.scheduleFrom && acc.scheduleTo) {
        if (currentTime < acc.scheduleFrom || currentTime > acc.scheduleTo) return false;
      }

      // 3. Daily limit check
      if (acc.dailyLimit > 0) {
        const today = new Date().toISOString().split("T")[0];
        if (acc.todayDate === today && acc.todayDepositAmount >= acc.dailyLimit) return false;
      }

      // 4. Domain check
      if (domain && acc.assignedDomains && acc.assignedDomains.length > 0) {
        const domainMatch = acc.assignedDomains.some((d) => domain.includes(d) || d.includes(domain));
        if (!domainMatch) return false;
      }

      return true;
    });

    // Clean response - remove internal fields
    const cleanAccounts = filtered.map((acc) => ({
      _id: acc._id,
      accountName: acc.accountName,
      accountType: acc.accountType,
      reference: acc.reference,
      fromAmount: acc.fromAmount,
      toAmount: acc.toAmount,
      // Bank
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountHolderName: acc.accountHolderName,
      ifscCode: acc.ifscCode,
      branchName: acc.branchName,
      // UPI
      upiId: acc.upiId,
      mobileNo: acc.mobileNo,
      qrImage: acc.qrImage,
      // Crypto
      walletId: acc.walletId,
      cryptoType: acc.cryptoType,
      cryptoQrImage: acc.cryptoQrImage,
    }));

    return SendResponse(res, "success", "Payment accounts fetched", cleanAccounts);
  } catch (err) {
    return SendResponse(res, "error", err.message || "Something went wrong");
  }
}

// ======================== TASK 1: SECURITY ========================
async function ForceLogoutSubAgent(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (loginUser.userType !== "agent") return SendResponse(res, "error", "Only agent can force logout");
    const { subAgentId } = req.body;
    if (!subAgentId) return SendResponse(res, "error", "subAgentId required");
    const sa = await SubAgentModel.findOne({ _id: new ObjectId(subAgentId), agentId: new ObjectId(loginUser.userId), isDeleted: false });
    if (!sa) return SendResponse(res, "error", "SubAgent not found");
    await SubAgentModel.updateOne({ _id: sa._id }, { jwtToken: "", authenticateToken: null });
    try { await client.del(String(sa._id)); } catch (e) { }
    setImmediate(() => logActivity({
      subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
      agentId: loginUser.userId, action: "force_logout", category: "auth",
      description: `Force logged out ${sa.username}`, targetUser: sa.username, targetUserId: sa._id,
      ip: requestIp.getClientIp(req),
    }));
    return SendResponse(res, "success", `${sa.username} logged out successfully`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function GetLoginAttempts(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const logs = await SubAgentActivityModel.find({ agentId: new ObjectId(agentId), action: "login" })
      .sort({ createdAt: -1 }).limit(50).lean();
    return SendResponse(res, "success", "Login history fetched", logs);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TASK 3: CLIENT MANAGEMENT ========================
async function ResetClientPassword(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { clientId, newPassword } = req.body;
    if (!clientId || !newPassword) return SendResponse(res, "error", "clientId and newPassword required");
    if (newPassword.length < 4) return SendResponse(res, "error", "Password must be at least 4 characters");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), agentId: new ObjectId(agentId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");
    const salt = await bcrypt.genSalt(10);
    await UserModel.updateOne({ _id: cl._id }, { password: await bcrypt.hash(newPassword, salt), passwordShow: newPassword, isPasswordChanged: false });
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "client_password_reset", category: "client",
        description: `Password reset for ${cl.username}`, targetUser: cl.username, targetUserId: cl._id,
        ip: requestIp.getClientIp(req),
      }));
    }
    return SendResponse(res, "success", `Password reset for ${cl.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function UpdateClientCreditRef(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { clientId, creditReference } = req.body;
    if (!clientId || creditReference === undefined) return SendResponse(res, "error", "clientId and creditReference required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), agentId: new ObjectId(agentId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");
    const oldRef = cl.creditReference;
    await UserModel.updateOne({ _id: cl._id }, { creditReference: Number(creditReference) });
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: "client_credit_update", category: "client",
        description: `Credit ref updated for ${cl.username}: ${oldRef} → ${creditReference}`,
        targetUser: cl.username, targetUserId: cl._id, metadata: { oldValue: oldRef, newValue: creditReference },
        ip: requestIp.getClientIp(req),
      }));
    }
    return SendResponse(res, "success", `Credit reference updated for ${cl.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function DirectDepositWithdraw(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const schema = Joi.object({
      clientId: Joi.string().required(),
      amount: Joi.number().required().not(0),
      remark: Joi.string().optional().allow("", null),
    }).options({ allowUnknown: true });
    const { error: joiErr, value: body } = schema.validate(req.body);
    if (joiErr) return SendResponse(res, "error", "Validation failed", joiErr.details.map(d => d.message));
    const cl = await UserModel.findOne({ _id: new ObjectId(body.clientId), agentId: new ObjectId(agentId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");
    if (body.amount < 0 && Math.abs(body.amount) > cl.coins) return SendResponse(res, "error", "Insufficient client balance");
    const parentData = await UserModel.find({ userId: cl.creatorId });
    const remark = body.remark || (body.amount > 0 ? "Direct deposit by agent" : "Direct withdraw by agent");
    await UpdateUserCoins(body.amount, cl._id, parentData, remark);
    const action = body.amount > 0 ? "direct_deposit" : "direct_withdraw";
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action, category: "deposit_withdraw",
        description: `${body.amount > 0 ? "Deposited" : "Withdrew"} ${Math.abs(body.amount)} ${body.amount > 0 ? "to" : "from"} ${cl.username}`,
        targetUser: cl.username, targetUserId: cl._id, metadata: { amount: body.amount, remark },
        ip: requestIp.getClientIp(req),
      }));
    }
    return SendResponse(res, "success", `${Math.abs(body.amount)} ${body.amount > 0 ? "deposited to" : "withdrawn from"} ${cl.username}`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

async function ClientLoginHistory(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), agentId: new ObjectId(agentId), userType: "client", isDeleted: false })
      .select("name username lastLoginTime lastIp createdAt").lean();
    if (!cl) return SendResponse(res, "error", "Client not found");
    // Get from tracking model if available
    const TrackingModel = require("../../Models/User/Tracking.model");
    const history = await TrackingModel.find({ userId: new ObjectId(clientId) })
      .select("ip hitUrl createdAt").sort({ createdAt: -1 }).limit(30).lean();
    return SendResponse(res, "success", "Login history fetched", { client: cl, history });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT D/W HISTORY ========================
async function ClientDWHistory(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");
    const cl = await UserModel.findOne({ _id: new ObjectId(clientId), agentId: new ObjectId(agentId), userType: "client", isDeleted: false });
    if (!cl) return SendResponse(res, "error", "Client not found");

    const [list, summary] = await Promise.all([
      DepositWithdrawModel.find({ userId: new ObjectId(clientId), agentId: new ObjectId(agentId) })
        .select("amount utrNo reqType status remark createdAt paymentMethod screenShotImg")
        .sort({ createdAt: -1 }).limit(100).lean(),
      DepositWithdrawModel.aggregate([
        { $match: { userId: new ObjectId(clientId), agentId: new ObjectId(agentId) } },
        {
          $group: {
            _id: null,
            totalDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            totalWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "accept"] }] }, "$amount", 0] } },
            pendingDeposit: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "deposit"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            pendingWithdraw: { $sum: { $cond: [{ $and: [{ $eq: ["$reqType", "withdraw"] }, { $eq: ["$status", "pending"] }] }, "$amount", 0] } },
            totalCount: { $sum: 1 },
          }
        },
      ]),
    ]);

    const s = summary[0] || { totalDeposit: 0, totalWithdraw: 0, pendingDeposit: 0, pendingWithdraw: 0, totalCount: 0 };
    return SendResponse(res, "success", "History fetched", { list, summary: { ...s, net: s.totalDeposit - s.totalWithdraw }, client: { name: cl.name, username: cl.username } });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== CLIENT P&L ========================
async function ClientProfitLoss(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { clientId } = req.body;
    if (!clientId) return SendResponse(res, "error", "clientId required");

    const pl = await CrickTransactionLogModel.aggregate([
      { $match: { clientId: new ObjectId(clientId), agentId: new ObjectId(agentId), transactionType: "profitLoss" } },
      {
        $group: {
          _id: "$gameType",
          totalPL: { $sum: "$clientProfitLoss" },
          count: { $sum: 1 },
        }
      },
      { $sort: { totalPL: 1 } },
    ]);

    const overall = pl.reduce((s, p) => s + p.totalPL, 0);
    return SendResponse(res, "success", "P&L fetched", { breakdown: pl, overall });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TASK 2 & 5: D/W BULK + PAGINATION ========================
async function BulkApproveReject(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { reqIds, status, remark } = req.body;
    if (!Array.isArray(reqIds) || reqIds.length === 0) return SendResponse(res, "error", "reqIds array required");
    if (!["accept", "cancel"].includes(status)) return SendResponse(res, "error", "Invalid status");

    let processed = 0, failed = 0;
    for (const reqId of reqIds) {
      try {
        const reqData = await DepositWithdrawModel.findOne({ _id: new ObjectId(reqId), agentId: new ObjectId(agentId), status: "pending" });
        if (!reqData) { failed++; continue; }
        const approverName = loginUser.userType === "subagent" ? `${loginUser.name} (SubAgent)` : loginUser.name;
        const updateRes = {
          status, approverDetails: { name: approverName, username: loginUser.username, userType: loginUser.userType },
          approveUserId: loginUser.userId, remark: remark || `Bulk ${status} by agent`,
        };
        if (reqData.reqType === "deposit" && status === "accept") {
          const parentData = await UserModel.find({ userId: reqData.creatorId });
          await UpdateUserCoins(reqData.amount, reqData.userId, parentData, "deposit approved");
        } else if (reqData.reqType === "withdraw" && status === "cancel") {
          const parentData = await UserModel.find({ userId: reqData.creatorId });
          await UpdateUserCoins(reqData.amount, reqData.userId, parentData, "withdraw request cancel");
        }
        await DepositWithdrawModel.updateOne({ _id: reqData._id }, { $set: updateRes });
        processed++;
      } catch { failed++; }
    }
    if (loginUser.userType === "subagent") {
      setImmediate(() => logActivity({
        subAgentId: loginUser.userId, subAgentName: loginUser.name, subAgentUsername: loginUser.username,
        agentId, action: `bulk_${status}`, category: "deposit_withdraw",
        description: `Bulk ${status}: ${processed} processed, ${failed} failed`, metadata: { processed, failed, total: reqIds.length },
        ip: requestIp.getClientIp(req),
      }));
    }
    return SendResponse(res, "success", `Bulk ${status}: ${processed} processed, ${failed} failed`);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TASK 6: NOTIFICATION COUNT ========================
async function GetPendingCounts(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const [pendingDeposits, pendingWithdraws] = await Promise.all([
      DepositWithdrawModel.countDocuments({ agentId: new ObjectId(agentId), reqType: "deposit", status: "pending" }),
      DepositWithdrawModel.countDocuments({ agentId: new ObjectId(agentId), reqType: "withdraw", status: "pending" }),
    ]);
    return SendResponse(res, "success", "Counts fetched", { pendingDeposits, pendingWithdraws, total: pendingDeposits + pendingWithdraws });
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

// ======================== TASK 4: EXPORT DATA ========================
async function ExportData(req, res) {
  try {
    const loginUser = req.loggedInUser;
    if (!["agent", "subagent", ...ABOVE_AGENT].includes(loginUser.userType)) return SendResponse(res, "error", "Not authorized");
    const agentId = resolveAgentId(req);
    const { type, fromDate, toDate } = req.body;

    let data = [];
    const dateFilter = fromDate && toDate ? { createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate + "T23:59:59.999Z") } } : {};

    if (type === "clients") {
      data = await UserModel.find({ agentId: new ObjectId(agentId), userType: "client", isDeleted: false })
        .select("name username mobile coins exposure creditReference status betStatus casinoStatus matkaStatus matchStatus createdAt lastLoginTime")
        .sort({ createdAt: -1 }).lean();
    } else if (type === "deposits" || type === "withdrawals") {
      const reqType = type === "deposits" ? "deposit" : "withdraw";
      data = await DepositWithdrawModel.find({ agentId: new ObjectId(agentId), reqType, ...dateFilter })
        .select("name username amount utrNo status remark reqType createdAt approverDetails paymentMethod")
        .sort({ createdAt: -1 }).lean();
    } else if (type === "activity") {
      data = await SubAgentActivityModel.find({ agentId: new ObjectId(agentId), ...dateFilter })
        .select("subAgentName subAgentUsername action category description targetUser ip createdAt")
        .sort({ createdAt: -1 }).lean();
    } else {
      return SendResponse(res, "error", "Invalid type. Use: clients, deposits, withdrawals, activity");
    }

    return SendResponse(res, "success", "Export data fetched", data);
  } catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
}

module.exports = {
  SubAgentLogin,
  CreateSubAgent,
  UpdateSubAgent,
  DeleteSubAgent,
  SubAgentList,
  SubAgentDetails,
  CreateRole,
  UpdateRole,
  DeleteRole,
  RoleList,
  GetAvailablePages,
  SeedDefaultRoles,
  SeedDefaultSubAgents,
  SeedClients,
  ClientList,
  UpdateClientStatus,
  GetDepositWithdrawList,
  ApproveRejectRequest,
  ViewDepositWithdrawRequest,
  GetAccountDetails,
  CreatePaymentAccount,
  UpdateAccountDetails,
  DeletePaymentAccount,
  TogglePaymentAccountStatus,
  DuplicatePaymentAccount,
  AccountTransactionStats,
  UpdateAccountPriority,
  GetDomainList,
  GetDomainDetails,
  UpdateDomain,
  DepositWithdrawReport,
  GetProfile,
  ChangePassword,
  GetActivityLog,
  Setup2FA,
  Verify2FA,
  Disable2FA,
  DashboardStats,
  GetClientPaymentAccounts,
  ForceLogoutSubAgent,
  GetLoginAttempts,
  ResetClientPassword,
  UpdateClientCreditRef,
  DirectDepositWithdraw,
  ClientLoginHistory,
  ClientDWHistory,
  ClientProfitLoss,
  BulkApproveReject,
  GetPendingCounts,
  ExportData,
};
