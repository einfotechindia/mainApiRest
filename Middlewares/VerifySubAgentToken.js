const jwt = require("jsonwebtoken");
const SubAgentModel = require("../Models/SubAgent/SubAgent.model");
const UserModel = require("../Models/User/User.model");
const { SendResponse } = require("../Helpers/ResponseMapper");
const { siteSetting } = require("../Common/Constants");
const { client } = require("../Helpers/RedisHelper");
var requestIp = require("request-ip");

// Middleware that allows both agent (from UserModel) and subagent (from SubAgentModel)
async function verifySubAgentToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return SendResponse(res, "Unauthorized", "Token Required");
  }
  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    if (!decodedToken.authToken) {
      return SendResponse(res, "Unauthorized", "Authtoken Required ! Please Login Again");
    }

    const loginUserType = decodedToken.userType;
    let user = {};
    let userStatus = 0;
    let check = true;

    // Try Redis first
    if (siteSetting.IS_REDIS) {
      user = await client.hgetall(decodedToken.userId);
      if (user && user.status != null && user.isDeleted != null) {
        userStatus = user.status;
        check = false;
      }
    }

    // Fallback to DB
    if (check) {
      if (loginUserType === "subagent") {
        user = await SubAgentModel.findOne({
          _id: decodedToken.userId,
          isDeleted: false,
        }).lean();
      } else {
        user = await UserModel.findOne({
          _id: decodedToken.userId,
          status: 1,
          isDeleted: false,
        }).lean();
      }

      if (!user) {
        return SendResponse(res, "Unauthorized", "User not found");
      }
      userStatus = user.status;
    }

    if (user.jwtToken == "" || !user.jwtToken) {
      return SendResponse(res, "Unauthorized", "Token expired ! Please login again");
    }

    if (!user || !userStatus) {
      return SendResponse(res, "Unauthorized", "Invalid user or inactive account");
    }

    req.loggedInUser = decodedToken;
    next();
  } catch (error) {
    return SendResponse(res, "Unauthorized", error.message);
  }
}

module.exports = { verifySubAgentToken };
