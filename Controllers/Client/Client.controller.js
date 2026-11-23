const { SendResponse } = require("../../Helpers/ResponseMapper");
const UserService = require("../../Services/User/User.service");
const { UpdateUserCoins } = require("../../Helpers/TransactionHelper");
const { get } = require("../../Helpers/RedisHelper");
const { _dx } = require("../../Helpers/CommonHelper");

module.exports = {
  Details: async (req, res) => {
    try {
      await UserService.GetDetails(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_CREATE";
      // return res.status(422).json(msg);
      SendResponse(res, "error", msg);
    }
  },

  Create: async (req, res) => {
    try {
      await UserService.UserCreate(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_CREATE";
      // return res.status(422).json(msg);
      SendResponse(res, "error", msg);
    }
  },

  Login: async (req, res) => {
    try {
      await UserService.UserLogin(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_LOGIN";
      return res.status(422).json(msg);
    }
  },

  userUpdate: async (req, res) => {
    try {
      await UserService.userUpdate(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return res.status(422).json(msg);
    }
  },

  updateTransactionPassword: async (req, res) => {
    try {
      await UserService.updateTransactionPassword(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return res.status(422).json(msg);
    }
  },

  updateUserPassword: async (req, res) => {
    try {
      await UserService.updateUserPassword(req, res);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      return res.status(422).json(msg);
    }
  },

  userList: async (req, res) => {
    try {
      let sendData = {
        data: req.body,
        userData: req.loggedInUser,
      };

      let resData = await UserService.getUserList(sendData);
      SendResponse(res, resData.status, resData.message, resData.data);
    } catch (err) {
      var msg = err.message || "SOMETHING_WENT_WRONG_IN_USER_UPDATE";
      SendResponse(res, "error", msg);
    }
  },

  updateCoins: async (req, res) => {
    try {
      const bodyData = req.body;
      const coins = bodyData.coins;
      const userId = bodyData.userId; // update user userId
      const parentData = req.loggedInUser;
      const userRemark = bodyData.userRemark ? bodyData.userRemark : "";
      const transactionPassword = bodyData.transactionPassword
        ? bodyData.transactionPassword
        : "";

      const updateData = await UpdateUserCoins(
        coins,
        userId,
        parentData,
        userRemark,
        transactionPassword
      );
      SendResponse(res, updateData.status, updateData.message);
    } catch (error) {
      console.log("Update Coins Error", error);
    }
  },

  verifyOtp: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      let redisUserData = await get(userData.userId);
      let returnData = "error";
      if (!redisUserData) {
        returnData = await UserService.verifyOtp(userData, data);
      }
      if (redisUserData) {
        redisUserData = JSON.parse(redisUserData);
        if (redisUserData.otp === data.otp) {
          returnData = "success";
        }
      }
      const msgData = { verifyOtpStatus: returnData };
      SendResponse(res, returnData, "", msgData);
    } catch (error) {
      console.log("Verify Otp Error", error);
    }
  },

  getUserAccountDetails: async (req, res) => {
    try {
      const data = req.body;
      const userData = req.loggedInUser;
      returnData = await UserService.getUserAccountDetails(userData.userId);
      SendResponse(res, returnData.status, returnData.message, returnData.data);
    } catch (error) {
      console.log("Account Details Error", error);
    }
  },

  shareDetails: async (req, res) => {
    try {
      const bodyData = req.body;
      const userId = bodyData.userId; // update user userId
      if (!userId) {
        SendResponse(res, "error", "userId is mandatory");
      }
      const parentData = req.loggedInUser;
      const sendShareData = await UserService.shareDetails(parentData, userId);
      SendResponse(
        res,
        sendShareData.status,
        sendShareData.message,
        sendShareData
      );
    } catch (error) {
      console.log("fetch share data details Error", error);
    }
  },
};
