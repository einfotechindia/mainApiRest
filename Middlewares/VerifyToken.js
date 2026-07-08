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
var requestIp = require("request-ip");
const TrackingModel = require("../Models/User/Tracking.model");

async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return SendResponse(res, "Unauthorized", "Token Required");
  }
  try {
    var clientIp = requestIp.getClientIp(req);
    const path = req.route.path;
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    
    let user = {};
    let userStatus = 0;
    let userDeletedStatus = true;
    let check = true;

    const currentHash = crypto
        .createHash("sha256")
        .update(clientIp)
        .digest("hex");
    
    // if (!decodedToken.deviceHash || decodedToken.deviceHash !== currentHash) {
    //   return SendResponse(res, "Unauthorized", "token expired ! Please login again");
    // }


    if (!decodedToken.authToken) {
      return SendResponse(
        res,
        "Unauthorized",
        "Authtoken Required ! Please Login Again"
      );
    }

    if (siteSetting.IS_REDIS) {
      user = await client.hgetall(decodedToken.userId);
      if (user && user.status != null && user.isDeleted != null) {
        userStatus = user.status;
        userDeletedStatus = user.isDeleted;
        check = false;
      }
    }
    

    if (check) {
      user = await UserModel.findOne({
        _id: decodedToken.userId,
        status: 1,
        isDeleted: false,
      });

      if (!user) {
        return SendResponse(res, "Unauthorized", "user not found");
      }

      if (siteSetting.IS_REDIS) {
        UserService11.setUserRedisData(decodedToken.userId, user);
      }
      userStatus = user.status;
      userDeletedStatus = user.isDeleted;
    }

    if (user.jwtToken == "" || !user.jwtToken) {
      return SendResponse(
        res,
        "Unauthorized",
        "token expired ! Please login again"
      );
    }

    // if (
    //   user.authenticateToken != decodedToken.authToken &&
    //   decodedToken.userType != "owner"
    // ) {
    //   return SendResponse(
    //     res,
    //     "Unauthorized",
    //     "token expired ! Please login again"
    //   );
    // }

 

    
    if (token !== user.jwtToken && decodedToken.userType == "client" && !user.isDemoClient) {
      return SendResponse(
        res,
        "Unauthorized",
        "token expired ! Please login again"
      );
    }

    if (!user || !userStatus) {
      return SendResponse(res, "Unauthorized", AuthErrMsg.invalidUser);
    }

    if (path == "/userBalance" && decodedToken.userType == "client") {
      return SendResponse(res, "Success", "", {
        coins: user.coins,
        exposure: user.exposure,
        profitLoss:  user.profitLoss ? user.profitLoss : 0,
      });
    }


    if (decodedToken.userType !== "client" && path !== "/userBalance") {
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
        }).catch(console.error);
      });
    }

    req.loggedInUser = decodedToken;
    next();
  } catch (error) {
    return SendResponse(res, "Unauthorized", error.message);
  }
}



// async function verifyToken(req, res, next) {
//   try {
   
//     const token = req.headers.authorization?.split(" ")[1];
//     if (!token) {
//       return SendResponse(res, "Unauthorized", "Token Required");
//     }
//     var clientIp = requestIp.getClientIp(req);
//     const path = req.route.path;
//     const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
//     let user = {};
//     let userStatus = 0;
//     let userDeletedStatus = false;
//     let check = true;
//     if (process.env.ENABLE_DEVICE_BINDING === "true") { 
//        const currentHash = crypto
//         .createHash("sha256")
//         .update(clientIp)
//         .digest("hex");
//         if (!decodedToken.deviceHash || decodedToken.deviceHash !== currentHash) {
//           return SendResponse(res, "Unauthorized", "token expired ! Please login again");
//         }
//     }
//     if (!decodedToken.authToken) {
//       return SendResponse(
//         res,
//         "Unauthorized",
//         "token required ! Please login again"
//       );
//     }
//     let loginUserType = decodedToken?.userType

//     if (siteSetting.IS_REDIS) {
//       user = await client.hgetall(decodedToken.userId);
//       if (user && user.status != null && user.isDeleted != null) {
//         userStatus = user.status;
//         userDeletedStatus = user.isDeleted
//         check = false;
//       }
//     }
    
//     if (check) {
//       if(loginUserType === "staff"){
//         user = await StaffModel.findById(decodedToken.userId)
//           .lean();
//       } else {  
//         user = await UserModel.findOne({
//           _id: decodedToken.userId,
//           status: 1,
//           isDeleted: false,
//         }); 
//       }
//       if (!user) {
//         return SendResponse(res, "Unauthorized", "user not found");
//       }

//       if (siteSetting.IS_REDIS) {
//         UserService11.setUserRedisData(decodedToken.userId, user);
//       }
//       userStatus = user.status;
//       userDeletedStatus = user.isDeleted ? user.isDeleted : false;
//     }
//     if (user.jwtToken == "" || !user.jwtToken) {
//       return SendResponse(
//         res,
//         "Unauthorized",
//         "token expired ! Please login again"
//       );
//     }

//     let checkOneDeviceLogin = false;
//     if(loginUserType === "client" && process.env.IS_CLIENT_ONE_DEVICE_LOGIN === "true"){
//       checkOneDeviceLogin = true;
//     } else if(loginUserType === "staff" && process.env.IS_STAFF_ONE_DEVICE_LOGIN === "true"){
//       checkOneDeviceLogin = true;
//     } else if(loginUserType !== "client" && loginUserType !== "staff" && process.env.IS_USER_ONE_DEVICE_LOGIN === "true"){
//       checkOneDeviceLogin = true;
//     }   

//     if(checkOneDeviceLogin && user.authenticateToken != decodedToken.authToken && decodedToken.userType != "owner"){
//       return SendResponse(
//         res,
//         "Unauthorized",
//         "token expired ! Please login again"
//       );
//     }

//     if (token !== user.jwtToken && decodedToken.userType == "client" && !user.isDemoClient) {
//       return SendResponse(
//         res,
//         "Unauthorized",
//         "token expired ! Please login again"
//       );
//     }

//     if (!user || !userStatus) {
//       return SendResponse(res, "Unauthorized", AuthErrMsg.invalidUser);
//     }


//     if (path == "/userBalance" && loginUserType == "client") {
//       return SendResponse(res, "success", "", {
//         coins: user.coins,
//         exposure: user.exposure,
//         profitLoss:  user.profitLoss ? user.profitLoss : 0,
//       });
//     }

    
//     if (decodedToken.userType !== "client" && path !== "/userBalance") {
//       setImmediate(() => {
//         TrackingModel.create({
//           userId: decodedToken.userId,
//           username: decodedToken.username,
//           authToken: user.authenticateToken,
//           jwtToken: token,
//           bodyData: req.body,
//           headers: req.headers,
//           ip: clientIp,
//           hitUrl: path,
//         }).catch(console.error);
//       });
//     }

//     req.loggedInUser = decodedToken;
//     next();
//   } catch (error) {
//     console.log(error)
//     return SendResponse(res, "Unauthorized", error.message);
//   }
// }





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
    return SendResponse(res, "Unauthorized", "Token Required");
  }
  next();
};

const isOwnerAndStaff = (req, res, next) => {
  const userType = req?.loggedInUser?.userType;
  if (!userType) {
    return SendResponse(res, "error", "unauthorized");
  }
  if (!["owner", "staff"].includes(userType)) {
    return SendResponse(res, "error", "you are not authorised to access this");
  }
  next();
};

module.exports = {
  verifyToken,
  verifyCasinoToken,
  companyVerifyToken,
  isOwnerAndStaff
};