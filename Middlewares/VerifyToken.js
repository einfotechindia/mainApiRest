// auth.middleware.js
"use strict";
const jwt = require("jsonwebtoken");
const UserModel = require("../Models/User/User.model");
const StaffModel = require("../Models/Staff/Staff.model");
const crypto = require("crypto");
const {
  SendResponse,
  sendCasinoResponse,
} = require("../Helpers/ResponseMapper");
const { AuthErrMsg, siteSetting } = require("../Common/Constants");
const UserService11 = require("../Services/User/User.service");
const { client } = require("../Helpers/RedisHelper");
const { _dx, _d } = require("../Helpers/CommonHelper");
const requestIp = require("request-ip");
const TrackingModel = require("../Models/User/Tracking.model");
const { msg } = require("../Helpers/MessageHelper");



const { isBot } = require("../Helpers/BotDetector");

async function verifyToken(req, res, next) {
  // ============================================================
  // BOT/SCRIPT DETECTION — block before any processing
  // ============================================================
  if (isBot(req)) {
    return SendResponse(res, "Unauthorized", msg("auth.botDetected"));
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return SendResponse(res, "Unauthorized", msg("auth.tokenRequired"));
  }

  try {
    const clientIp = requestIp.getClientIp(req) || "";
    const path = req.route.path;

    // ============================================================
    // 1. JWT VERIFY
    // ============================================================

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      // TokenExpiredError — 12h expiry hit
      if (jwtErr.name === "TokenExpiredError") {
        return SendResponse(res, "Unauthorized", msg("auth.sessionExpiredRelogin"));
      }
      // JsonWebTokenError — tampered/invalid token
      console.error("verifyToken JWT error:", jwtErr.name, jwtErr.message);
      return SendResponse(res, "Unauthorized", msg("auth.tokenExpired"));
    }

    if (!decodedToken.authToken) {
      return SendResponse(res, "Unauthorized", msg("auth.authTokenRequired"));
    }

    const currentHash = crypto
      .createHash("sha256")
      .update(clientIp)
      .digest("hex");

    // ============================================================
    // 2. FETCH USER — Redis first, DB fallback
    // ============================================================

    let user = null;
    let userStatus = 0;
    let fromRedis = false;

    if (siteSetting.IS_REDIS) {
      try {
        const redisUser = await client.hgetall(decodedToken.userId);
        if (redisUser && Object.keys(redisUser).length > 0 && redisUser.status != null && redisUser.isDeleted != null) {
          user = redisUser;
          userStatus = Number(redisUser.status);
          fromRedis = true;
        }
      } catch (redisErr) {
        console.error("verifyToken Redis error:", redisErr.message);
      }
    }

    if (!fromRedis) {
      user = await UserModel.findOne({
        _id: decodedToken.userId,
        status: 1,
        isDeleted: false,
      });

      if (!user) {
        return SendResponse(res, "Unauthorized", msg("auth.userNotFound"));
      }

      if (siteSetting.IS_REDIS) {
        UserService11.setUserRedisData(decodedToken.userId, user);
      }
      userStatus = Number(user.status);
    }

    // ============================================================
    // 3. USER VALIDITY CHECK — must come before jwtToken access
    // ============================================================

    if (!user || !userStatus) {
      return SendResponse(res, "Unauthorized", msg("auth.invalidUser"));
    }

    // ============================================================
    // 4. JWT TOKEN CHECK — all user types
    // ============================================================

    if (!user.jwtToken || user.jwtToken === "") {
      return SendResponse(res, "Unauthorized", msg("auth.tokenExpired"));
    }

    // JWT token must match stored token — ensures single active session
    // This applies to ALL user types (client, agent, admin, owner etc.)
    // Only demo clients are exempted
    if (!user.isDemoClient && token !== user.jwtToken) {
      return SendResponse(res, "Unauthorized", msg("auth.loggedInElsewhere"));
    }

    // ============================================================
    // 5. CLIENT-SPECIFIC CHECKS — device hash + auth token
    // ============================================================

    if (decodedToken.userType === "client") {
      // Device hash or auth token mismatch — someone stole the token
      if (decodedToken.deviceHash !== currentHash || user.authenticateToken != decodedToken.authToken) {
        return SendResponse(res, "Unauthorized", msg("auth.tokenExpired"));
      }
    }

    // ============================================================
    // 6. USER BALANCE SHORTCUT — with rate limiting
    // ============================================================

    if (path === "/userBalance") {
      if (siteSetting.IS_REDIS) {
        try {
          const balanceRateKey = `balance:rate:${decodedToken.userId}`;
          const balanceAllowed = await client.set(balanceRateKey, "1", "NX", "EX", 1);
          if (balanceAllowed !== "OK") {
            return SendResponse(res, "error", msg("auth.balanceRateLimited"));
          }
        } catch (_) {}
      }

      return SendResponse(res, "Success", "", {
        coins: user.coins,
        exposure: user.exposure,
        profitLoss: user.profitLoss ? user.profitLoss : 0,
      });
    }

    // ============================================================
    // 7. REQUEST TRACKING (non-blocking)
    // ============================================================

    setImmediate(() => {
      TrackingModel.create({
        userId: decodedToken.userId,
        username: decodedToken.username,
        authToken: user.authenticateToken,
        jwtToken: token,
        bodyData: req.body,
        headers: req.headers,
        ip: clientIp,
        hitUrl: path,
      }).catch((trackErr) => {
        console.error("verifyToken tracking error:", trackErr.message);
      });
    });

    // ============================================================
    // 8. PASS TO NEXT MIDDLEWARE
    // ============================================================

    req.loggedInUser = decodedToken;
    next();
  } catch (error) {
    console.error("verifyToken unexpected error:", error.message);
    return SendResponse(res, "Unauthorized", msg("auth.genericError"));
  }
}



async function verifyCasinoToken(req, res, next) {
  const bodyData = req.body;
  const IS_REDIS = siteSetting.IS_REDIS;
  try {
    if (!bodyData.token) {
      return sendCasinoResponse(res, "token_not_found");
    }

    if (IS_REDIS) {
      const user = await client.hgetall(bodyData.userId);
      if (!bodyData.transactionId) {
        if (bodyData.isDiamond) {
          user.intCasinoMultiply = 1;
        }
        const balance = Math.round(
          user.coins /
            (user.intCasinoMultiply
              ? user.intCasinoMultiply
              : siteSetting.casinoMultipleTimesCoins)
        );
        return sendCasinoResponse(res, "success", balance);
      }
    }

    let userData = await UserModel.findOne(
      {
        _id: bodyData.userId,
      },
      {
        coins: 1,
        name: 1,
        username: 1,
        userType: 1,
        userId: 1,
        isDeleted: 1,
        status: 1,
        casinoStatus: 1,
        casinoToken: 1,
        exposure: 1,
        casinoToken: 1,
        casinoStatus: 1,
        clientId: 1,
        agentId: 1,
        superagentId: 1,
        masterId: 1,
        subadminId: 1,
        adminId: 1,
        superadminId: 1,
        subownerId: 1,
        ownerId: 1,
        intCasinoMultiply: 1,
        intCasinoStatus: 1,
        creatorId: 1,
        betStatus: 1,
      }
    );

    if (!userData) {
      return sendCasinoResponse(res, "user_not_found");
    }
    req.loggedInUser = userData;
    next();
  } catch (error) {
  console.log(error)
    return sendCasinoResponse(res, "request_time_out");
  }
}

const companyVerifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return SendResponse(res, "Unauthorized", msg("auth.tokenRequired"));
  }
  next();
};

// ─── API Route → Permission Key + Action mapping ───
// Maps backend API route paths to the permission key and required action
const API_PERMISSION_MAP = {
  // Diamond Casino
  "/casinoList": { key: "diamondCasino", action: "view" },
  "/casinoDetail": { key: "diamondCasino", action: "view" },
  "/createCasino": { key: "diamondCasino", action: "create" },
  "/updateCasino": { key: "diamondCasino", action: "update" },
  "/deleteCasino": { key: "diamondCasino", action: "delete" },
  "/declareCasinoResult": { key: "diamondCasinoDeclare", action: "update" },
  "/reDeclare": { key: "diamondCasinoReDeclare", action: "update" },
  "/casinoBetList": { key: "diamondBetList", action: "view" },
  "/generateCasinoClientLedger": { key: "diamondLedger", action: "view" },

  // Int Casino
  "/intCasinoList": { key: "intCasino", action: "view" },
  "/intCasinoDetail": { key: "intCasino", action: "view" },
  "/updateIntCasino": { key: "intCasino", action: "update" },
  "/intCasinoBetList": { key: "intBetList", action: "view" },
  "/unsettledIntBetList": { key: "unsettledIntBetList", action: "view" },
  "/generateIntCasinoLedger": { key: "intLedger", action: "view" },

  // Matka
  "/matkaList": { key: "matka", action: "view" },
  "/matkaDetail": { key: "matka", action: "view" },
  "/createMatka": { key: "matka", action: "create" },
  "/updateMatka": { key: "matka", action: "update" },
  "/deleteMatka": { key: "matka", action: "delete" },
  "/declareMatkaResult": { key: "matkaResultDeclare", action: "update" },
  "/matkaBetList": { key: "matkaBetList", action: "view" },
  "/matkaGameTypeList": { key: "matkaGameType", action: "view" },
  "/createMatkaGameType": { key: "matkaGameType", action: "create" },
  "/updateMatkaGameType": { key: "matkaGameType", action: "update" },

  // Match / Sports
  "/updateMarket": { key: "matchEdit", action: "update" },
  "/fancyDecision": { key: "fancyDecision", action: "update" },
  "/rollbackFancy": { key: "rollbackFancy", action: "update" },

  // Settings - General
  "/getSetting": { key: "settings_commonSetting", action: "view" },
  "/updateSetting": { key: "settings_commonSetting", action: "update" },
  "/getTransactionData": { key: "settings_getTransaction", action: "view" },
  "/getNegativeUserDetails": { key: "settings_negativeUsers", action: "view" },
  "/fillNegativeCoinsToUser": { key: "settings_negativeUsers", action: "update" },
  "/userExposureList": { key: "settings_userExposureList", action: "view" },
  "/userExposureListUpdateBulk": { key: "settings_userExposureList", action: "update" },

  // Settings - Operations
  "/updateCasinoVideo": { key: "settings_diamondVideo", action: "update" },
  "/updateInternationalCasinoGamesInDatabase": { key: "settings_gapCasinoList", action: "update" },
  "/updateInternationalCasinoListInRedis": { key: "settings_gapCasinoList", action: "update" },
  "/updateInternationalCasinoByOperating": { key: "settings_gapCasinoList", action: "update" },
  "/rollBackfancyList": { key: "settings_rollbackFancies", action: "view" },
  "/distributeBonusToUpperline": { key: "settings_distributeBonus", action: "update" },

  // Settings - Monitoring
  "/userLoginActivity": { key: "settings_loginActivity", action: "view" },
  "/getTrackingActivites": { key: "settings_usersTracking", action: "view" },
  "/checkExposureClient": { key: "settings_activeClients", action: "view" },

  // Settings - Danger
  "/flushAllRedisKeys": { key: "settings_flushRedis", action: "update" },
  "/forceLogOutAllUser": { key: "settings_forceLogout", action: "update" },
  "/updateExposureOfUser": { key: "settings_exposureUpdate", action: "update" },
  "/allUserTypePasswordUpdate": { key: "settings_passwordReset", action: "update" },

  // Website
  "/websiteList": { key: "websiteSettings", action: "view" },
  "/updateWebsite": { key: "websiteSettings", action: "update" },

  // Notification
  "/notificationList": { key: "notification", action: "view" },
  "/createNotification": { key: "notification", action: "create" },

  // Staff Management (these are owner-only anyway, but defense in depth)
  "/create": { key: "staffManagement", action: "create" },
  "/update": { key: "staffManagement", action: "update" },
  "/delete": { key: "staffManagement", action: "delete" },

  // Fancy Manager
  "/fancyManager/create": { key: "fancyManager", action: "create" },
  "/fancyManager/update": { key: "fancyManager", action: "update" },
  "/fancyManager/delete": { key: "fancyManager", action: "delete" },
  "/fancyManager/list": { key: "fancyManager", action: "view" },
  "/fancyManager/getById": { key: "fancyManager", action: "view" },
  "/fancyManager/toggleStatus": { key: "fancyManager", action: "update" },
  "/fancyManager/bulkUpdate": { key: "fancyManager", action: "update" },
  "/fancyManager/syncRedis": { key: "fancyManager", action: "update" },
  "/fancyManager/runSeed": { key: "fancyManager", action: "update" },
};

const isOwnerAndStaff = async (req, res, next) => {
  const userType = req?.loggedInUser?.userType;
  if (!userType) {
    return SendResponse(res, "error", msg("auth.unauthorizedAccess"));
  }
  if (!["owner", "staff"].includes(userType)) {
    return SendResponse(res, "error", msg("auth.notAuthorised"));
  }

  // Owner has full access — skip permission check
  if (userType === "owner") return next();

  // ─── Staff permission enforcement ───
  try {
    const path = req.route?.path;
    const permConfig = API_PERMISSION_MAP[path];

    // If route not in map, allow (it's either unprotected or handled by service-level checks)
    if (!permConfig) return next();

    // Get staff permissions from Redis first, then DB
    const staffId = req.loggedInUser.userId;
    let permissions = null;

    // Try Redis
    const cached = await client.hget(String(staffId), "permissions").catch(() => null);
    if (cached) {
      try { permissions = JSON.parse(cached); } catch (_) {}
    }

    // Fallback to DB
    if (!permissions) {
      const staff = await StaffModel.findOne({ _id: staffId, isDeleted: false }).select("permissions").lean();
      if (!staff) {
        return SendResponse(res, "Unauthorized", msg("auth.staffNotFound"));
      }
      permissions = staff.permissions || {};

      // Cache permissions in Redis for next time
      setImmediate(() => {
        client.hset(String(staffId), ["permissions", JSON.stringify(permissions)]).catch(() => {});
      });
    }

    const { key: permKey, action } = permConfig;
    const pagePerm = permissions[permKey];

    if (!pagePerm || !pagePerm[action]) {
      // Log unauthorized attempt
      const { logStaffActivity } = require("../Services/Staff/Staff.service");
      logStaffActivity({
        staffId: req.loggedInUser.userId,
        staffName: req.loggedInUser.name,
        staffUsername: req.loggedInUser.username,
        ownerId: req.loggedInUser.ownerId,
        action: "unauthorized_access",
        category: "auth",
        description: `Blocked: ${req.loggedInUser.username} tried ${action} on "${permKey}" (${path})`,
        ip: requestIp.getClientIp(req),
        metadata: { path, permKey, action },
      });

      return SendResponse(res, "error", msg("auth.noPermission", { action }));
    }

    next();
  } catch (err) {
    console.error("isOwnerAndStaff permission check error:", err.message);
    // On error, allow through (fail-open) to not break existing flows
    next();
  }
};

module.exports = {
  verifyToken,
  verifyCasinoToken,
  companyVerifyToken,
  isOwnerAndStaff,
};