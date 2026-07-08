const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { getUserIdByUsername } = require("../../Helpers/UsersUtils");
const { ObjectId } = require("mongodb");
const Joi = require("joi");
const { siteSetting, bonusArray } = require("../../Common/Constants");
const {
  UserCreate,
  userDetailsByUserId,
} = require("../../Services/User/User.service");
const {
  _dx,
  whereHelper,
  _d,
  dateWhereCond,
  extractSubdomainAndDomainByHost,
  throughSocketDataByAxios,
  updateDomainBySocket,
  getWebsiteDataByReq,
  convertKeyObject,
  chunkArrayNew,
  _date,
  getSettingData
} = require("../../Helpers/CommonHelper");
const isRedis = siteSetting.IS_REDIS;
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const UserModel = require("../../Models/User/User.model");
const DomainModel = require("../../Models/Domain.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const SettingModel = require("../../Models/Setting.model");
const LedgerModel = require("../../Models/Ledger.model");
const FancyListModel = require("../../Models/fancyList.model");
const sportResultModel = require("../../Models/sportsResult.model");
const StatementModel = require("../../Models/Statement.model");
const internationalCasinoList = require("../../Models/internationalCasinoList.model");
const PlayModel = require("../../Models/Play.model")
const profitLossModel = require("../../Models/BetsList/profitLossPosition.model")
const fancyBetListModel = require("../../Models/BetsList/FancyBetsList.model")
const shareModel = require("../../Models/User/Share.model")
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");
const AccountModel = require("../../Models/BtoC/Account.model");
const AccountDetailsModel = require("../../Models/accountDetails.model");
const MlmChainListModel = require("../../Models/BtoC/mlmChainList.model");
const casinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const cateogeoryModel = require("../../Models/cateogeory.model");
const accountTypeModel = require("../../Models/AccountType.model.js");
const crickTransaction = require("../../Models/crickTransaction.model");
const oddsBetsModel = require("../../Models/BetsList/OddsBetsList.model");
const { checkWithdrawlAmount } = require("../../Services/Daman/daman.service");
const casinoListJson = require("../../casinoList");
var requestIp = require("request-ip");

const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");


const { emitToAllActiveUsers } = require("../../socket.js")

const {
  sessionDecision,
  cancelFancy,
  betfairMarketDecision,
  oddsDecision,
} = require("./Decision.controller");

const bcrypt = require("bcrypt");
const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
  updateCoinsTbl,
  updateBulkCoinsExposureUserByMarketId,
  wholeTransactionMarketData,
} = require("../../Helpers/TransactionHelper");
const AWS = require("aws-sdk");
AWS.config.update({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECREAT_KEY,
  region: process.env.S3_REGION,
});
const s3 = new AWS.S3();

const axios = require("axios");
const { TRUE } = require("../../utils/constants");
const { TransactGetItemsCommand } = require("@aws-sdk/client-dynamodb");
const ShareModel = require("../../Models/User/Share.model");

let createDomain = async (req, res) => {
  const bodyData = req.body;
  try {
    let insertObj = {
      domainName: bodyData.domainName,
      domainUrl: bodyData.domainUrl,
      title: `Welcome to ${bodyData.domainName}`,
    };

    let existDomain = await DomainModel.countDocuments(insertObj);
    if (existDomain) {
      return SendResponse(res, "error", "Domain Already Exist");
    }
    await DomainModel.create(insertObj);
    return SendResponse(res, "success", `Domain Inserted Successfully`);
  } catch (error) {
    console.log(error);
  }
};

let DomainList = async (req, res) => {
  try {
    let query = {};
    let isDeleted = false;
    if (req.body.isDeleted) {
      isDeleted = req.body.isDeleted;
    }
    query.isDeleted = isDeleted;
    let domainList = await DomainModel.find(query);
    return SendResponse(res, "success", "Fetch Successfully", domainList);
  } catch (error) {
    return SendResponse(res, "error", "Some Error", error.msg);
  }
};

const deleteDomain = async (req, res) => {
  const bodyData = req.body;
  if (!bodyData.domainId) {
    return SendResponse(res, "error", `domain Id Is Required`);
  }
  await DomainModel.updateOne(
    {
      _id: bodyData.domainId,
    },
    {
      $set: {
        isDeleted: true,
      },
    }
  );
  return SendResponse(res, "success", `Domain Deleted Successfully`);
};

const updateDomain = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  if (userType == "owner" || userType == "subowner") {
    let updateWhere = {};
    if (userType == "subowner") {
      let domainDataBySubownerId = await DomainModel.findOne({
        assignSubownerId: new ObjectId(userId),
      });
      if (!domainDataBySubownerId) {
        return SendResponse(res, "error", `subowner User Not Found`);
      }
      updateWhere._id = domainDataBySubownerId._id;
    } else {
      if (!bodyData.domainId) {
        return SendResponse(res, "error", `domain Id Is Required`);
      }
      updateWhere._id = bodyData.domainId;
    }
    let updateData = bodyData;
    delete updateData.domainId
    let update = await DomainModel.updateOne(updateWhere, {
      $set: updateData,
    });


    // await throughSocketDataByAxios(userArrayList, "sportsListUpdate");

    if (bodyData.domainUrl) {
      await client.set(bodyData.domainUrl, JSON.stringify(bodyData));
    }

    await updateDomainBySocket(req, {
      isDomainSettingUpdate: true,
    });

    return SendResponse(res, "success", `Domain Updated Successfully`);
  } else {
    return SendResponse(
      res,
      "error",
      `only owner or subowner authorised to update domain setting`
    );
  }
};

const getDomainSetting = async (req, res) => {
  const bodyData = req.body;
  let where = {};
  if (bodyData.subownerId) {
    where.assignSubownerId = new ObjectId(bodyData.subownerId);
  } else {
    if (!bodyData.domainId) {
      return SendResponse(res, "error", `domain Id Is Required`);
    }
    where._id = bodyData.domainId;
  }
  let domainData = await DomainModel.findOne(where);
  return SendResponse(res, "success", `fetch Details Successfully`, domainData);
};

const domainSettingByDomainName = async (req, res) => {
  let bodyData = req?.body;
  let headers = req.headers;
  isReturn = false;
  if (req.isReturn) {
    isReturn = req.isReturn;
  }
  const hostData = headers.host;
  const origin = headers.origin;
  let subdomain = "";
  let domain = "";
  if (origin) {
    const originURL = new URL(origin);
    let domainOriginalData = await extractSubdomainAndDomainByHost(
      originURL.hostname
    );
    subdomain = domainOriginalData.subdomain;
    domain = domainOriginalData.domain;
  } else {
    const parts = hostData.split(".");
    if (parts.length === 3) {
      subdomain = parts[0];
      domain = parts.slice(1).join(".");
    } else {
      subdomain = null;
      domain = hostData;
    }
  }


  let domainUrl = domain;

  let domainData = {};
  if (isRedis) {
    domainData = await client.get(domainUrl);
    if (domainData) {
      domainData = JSON.parse(domainData);
    }
  }

  if (!domainData) {
    domainData = await DomainModel.findOne({
      domainUrl: domainUrl + "",
    });
    await client.set(domainUrl, JSON.stringify(domainData));
  }

  if (domainData) {
    delete domainData.isDeleted;
    delete domainData.updatedAt;
    delete domainData.createdAt;
    delete domainData.__v;
    delete domainData._id;
  }

  if (isReturn) {
    return domainData;
  }

  return SendResponse(
    res,
    "success",
    `Domain fetched Successfully`,
    domainData
  );
};

const depositReq = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  const JoiSchema = Joi.object({
    amount: Joi.number().required(),
    utrNo: Joi.number().required(),
  }).options({ abortEarly: true, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  if (bodyData.amount < 0) {
    return SendResponse(res, "error", "amount can not be in negative value");
  }

  if (userType != "client") {
    return SendResponse(
      res,
      "error",
      "only client is allowed to deposit and withdraw request"
    );
  }

  const userData = await UserModel.findOne({ userId: userId });

  if (!userData.status) {
    return SendResponse(
      res,
      "error",
      "you are banned you can not do deposit request please contact customer care"
    );
  }

  let screenShotImg = "";

  if (bodyData.screenShotImg) {
    screenShotImg = bodyData.screenShotImg;
  }

  const clientIp = requestIp.getClientIp(req);

  let depositObj = {
    userId: userData.userId,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
    creatorId: userData.creatorId,
    amount: bodyData.amount,
    utrNo: bodyData.utrNo,
    reqType: "deposit",
    status: "pending",
    name: userData.name,
    username: userData.username,
    screenShotImg: screenShotImg,
    ip: clientIp,
    accountMethod: bodyData.accountMethod ? bodyData.accountMethod : "account",
  };

  await DepositWithdrawModel.create(depositObj);
  return SendResponse(res, "success", "deposit request initiate successfully ");
};

const withdrawReq = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  const JoiSchema = Joi.object({
    amount: Joi.number().required(),
  }).options({ abortEarly: true, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  if (bodyData.amount < 1) {
    return SendResponse(res, "error", "amount can not be less then 1");
  }


  if (userType != "client") {
    return SendResponse(
      res,
      "error",
      "only client is allowed to deposit and withdraw request"
    );
  }

  const checkExisteWithdrawReq = await DepositWithdrawModel.find({
    userId: userId,
    reqType: "withdraw",
    status: "pending",
  });

  if (checkExisteWithdrawReq.length > 0) {
    return SendResponse(
      res,
      "error",
      "already withdraw request is initiated please try after sometime once the previous is completed"
    );
  }

  const userData = await UserModel.findOne({ userId: userId });

  if (!userData.status) {
    return SendResponse(
      res,
      "error",
      "you are banned you can not do deposit request please contact customer care"
    );
  }

  if (bodyData.amount > userData.coins) {
    return SendResponse(
      res,
      "error",
      `withdraw amount can not be greater then your amount ${userData.coins}`
    );
  }


  let isWallet = bodyData.hasOwnProperty("wallet")

  if (process.env.CHECK_WITHDRAW_AMOUNT == "true") {

    let allowWithdrawAmount = await checkWithdrawlAmount(userId);

    if (bodyData.amount > allowWithdrawAmount) {
      return SendResponse(
        res,
        "error",
        `maximum withdraw amount can be ${allowWithdrawAmount}`
      );
    }


  }


  // let websiteSettting = await domainSettingByDomainName(req, res);

  // _d(websiteSettting , "websiteSettting")

  // let isSignUpBonusCheck = false


  const parentData = await UserModel.findOne({ userId: userData.creatorId });

  let accountDetails = await AccountDetailsModel.findOne({ userId: userData.userId })

  if (!accountDetails && !isWallet) {
    return SendResponse(
      res,
      "error",
      `firstly fill account details`
    );
  }



  let account = {}

  if (!isWallet) {
    account = {
      accountHolder: accountDetails.accountHolder,
      accountNumber: accountDetails.accountNumber,
      branchName: accountDetails.branchName,
      bankName: accountDetails.bankName,
      ifscCode: accountDetails.ifscCode,
    }
  }

  const clientIp = requestIp.getClientIp(req);
  let depositObj = {
    userId: userData.userId,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
    creatorId: userData.creatorId,
    amount: bodyData.amount,
    reqType: "withdraw",
    name: userData.name,
    username: userData.username,
    status: "pending",
    accountDetails: account,
    wallet: isWallet ? bodyData.wallet : {},
    ip: clientIp,
    accountMethod: bodyData.accountMethod ? bodyData.accountMethod : "account",
    cryptoBarCodeImg: bodyData.cryptoBarCodeImg ? bodyData.cryptoBarCodeImg : "",
    cryptoAddress: bodyData.cryptoAddress ? bodyData.cryptoAddress : "",
  };

  await DepositWithdrawModel.create(depositObj);

  const coins = -1 * bodyData.amount;
  const userRemark = "user withdraw request";
  const updateCoins = await UpdateUserCoins(
    coins,
    userId,
    parentData,
    userRemark
  );

  return SendResponse(
    res,
    "success",
    "withdraw request initiate successfully "
  );
};

const approveDisapproveReq = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  const JoiSchema = Joi.object({
    reqId: Joi.string().required(),
    status: Joi.string().required(),
  }).options({ abortEarly: true, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  if (userType == "client") {
    return SendResponse(res, "error", "client can not perform this operation");
  }

  let websiteSettting = await getWebsiteDataByReq(req);
  let isdepositBonusCheck = false
  let depositBonusType = "flat"
  let depositBonusValue = 0
  let websiteData = {}
  if (websiteSettting && websiteSettting.domainData) {
    websiteData = websiteSettting.domainData
  }

  if (websiteData && websiteData.bonusSetting && websiteData.bonusSetting.depositBonus) {
    isdepositBonusCheck = websiteData.bonusSetting.depositBonus
    depositBonusType = websiteData.bonusSetting.firstTimeDepositBonusType
    depositBonusValue = websiteData.bonusSetting.firstTimeDepositBonusValue
  }


  let where = await whereHelper(loggedUserData, { _id: bodyData.reqId });
  let reqData = await DepositWithdrawModel.findOne(where);
  if (!reqData) {
    return SendResponse(res, "error", "request not found");
  }

  if (reqData.status != "pending") {
    return SendResponse(res, "error", "request already done");
  }

  let reqType = reqData.reqType;
  if (reqType == "deposit") {
    let updateRes = {
      status: bodyData.status,
      approverDetails: {
        name: loggedUserData.name,
        username: loggedUserData.username,
        userType: loggedUserData.userType,
      },
      approveUserId: loggedUserData.userId,
      remark: bodyData.remark ? bodyData.remark : "deposit by admin ",
    };

    if (bodyData.depositType == "automatic" && bodyData.status == "accept") {
      let parentData = await UserModel.find({ userId: reqData.creatorId });
      let clientId = reqData.userId;
      const coins = reqData.amount;
      const userRemark = "user deposit automatic by system";

      const updateCoins = await UpdateUserCoins(
        coins,
        clientId,
        parentData,
        userRemark
      );

      if (isdepositBonusCheck) {
        let isFirstTimeDeposit = await DepositWithdrawModel.countDocuments({
          reqType: "deposit",
          status: "accept",
          userId: new ObjectId(clientId)
        })


        if (isFirstTimeDeposit != 0) {
          depositBonusType = websiteData.bonusSetting.everyTimeDepositBonusType
          depositBonusValue = websiteData.bonusSetting.everyTimeDepositBonusValue
        }

        if (depositBonusValue != 0) {
          let depositCoins = depositBonusType == "flat" ? depositBonusValue : (depositBonusValue * coins) / 100
          let depositremarks = `depositBonus`;

          const updateCoins = await UpdateUserCoins(
            depositCoins,
            clientId,
            parentData,
            depositremarks
          );

        }

      }
    }

    const update = await DepositWithdrawModel.updateOne(
      { _id: reqData._id },
      { $set: updateRes }
    );

    req.isReturn = true;

  } else if (reqType == "withdraw") {
    let status = bodyData.status;

    let updateRes = {
      status: bodyData.status,
      approverDetails: {
        name: loggedUserData.name,
        username: loggedUserData.username,
        userType: loggedUserData.userType,
      },
      approveUserId: loggedUserData.userId,
      remark: bodyData.remark ? bodyData.remark : "withdraw by admin ",
    };

    if (status == "cancel") {

      let parentData = await UserModel.find({ userId: reqData.creatorId });
      const coins = reqData.amount;
      const userRemark = "user withdraw request cancel";

      updateRes.remark = bodyData.remark ? bodyData.remark : "cancel by admin "

      const updateCoins = await UpdateUserCoins(
        coins,
        reqData.userId,
        parentData,
        userRemark
      );
    }

    await DepositWithdrawModel.updateOne(
      { _id: reqData._id },
      { $set: updateRes }
    );
  }

  if (res) {
    return SendResponse(
      res,
      "success",
      `request initiate successfully for ${reqData.name} (${reqData.username})`
    );
  }
};

const updateAccountDetails = async (req, res) => {
  let bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  const userData = await UserModel.findOne({ _id: userId });

  if (!userData) {
    return SendResponse(res, "error", `user Not Fund`);
  }



  // _dx(bodyData, "bodyData")


  let accountObj = {
    userId: userData._id,
    username: bodyData.username,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
    creatorId: userData.creatorId,
    name: userData.name,
    username: userData.username,
    userType: userType
  };

  bodyData = Object.assign(bodyData, accountObj);



  let isAccountExist = await AccountModel.findOne({ userId: userId });
  if (isAccountExist) {
    await AccountModel.updateOne(
      {
        userId: userId,
      },
      {
        $set: bodyData,
      }
    );
  } else {
    await AccountModel.create(bodyData);
  }

  await client.set(`accountDetails_${userId + ""}`, JSON.stringify(bodyData));

  if (res) {
    return SendResponse(res, "success", `account details updated successfully`);
  }
};

const getAccountDetailsByUserId = async (req, res) => {
  let bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userId = loggedUserData.userId;
  if (bodyData.creatorId) {
    userId = bodyData.creatorId;
  }

  accountData = await AccountModel.findOne(
    { userId: userId },
    {
      barcode: 1,
      upi: 1,
      account: 1,
      crypto: 1,
    }
  );
  if (res) {
    return SendResponse(
      res,
      "success",
      `account details fetch successfully`,
      accountData
    );
  }
};

const getDepositWithdrawList = async (req, res) => {
  const bodyData = req.body;

  _d(bodyData, "bodyData ")
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  let whereObj = await whereHelper(loggedUserData);

  if (userType == "client") {
    whereObj = {
      userId: new ObjectId(userId),
    };
  }
  if (bodyData.status) {
    whereObj.status = bodyData.status;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    whereObj.date = dateWhere;
  }

  if (bodyData.userId) {
    whereObj.userId = bodyData.userId;
  }

  if (bodyData.reqType) {
    whereObj.reqType = bodyData.reqType;
  }

  let specific = {
    name: 1,
    amount: 1,
    username: 1,
    utrNo: 1,
    userId: 1,
    userType: 1,
    approveUserId: 1,
    remark: 1,
    reqType: 1,
    canceledRemark: 1,
    status: 1,
    ip: 1,
    createdAt: 1,
    accountDetails: 1,
    wallet: 1,
  };

  if (userType == "client") {
    specific = {
      amount: 1,
      utrNo: 1,
      remark: 1,
      status: 1,
      reqType: 1,
      canceledRemark: 1,
      ip: 1,
      createdAt: 1,
    };
  }

  _d(whereObj, "whereObj")

  const reqList = await DepositWithdrawModel.find(whereObj, specific).sort({
    _id: -1,
  });

  if (res) {
    return SendResponse(res, "success", `List Fetch Successfully`, reqList);
  }
};

const allUserTypePasswordUpdate = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  if (userType !== "owner") {
    return SendResponse(
      res,
      "error",
      `You are not authorized to change passwords.`
    );
  }

  let userWhere = await whereHelper(loggedUserData);
  let bulkUpdateArray = [];

  if (bodyData.userType) {
    userWhere.userType = bodyData.userType;
  }

  let findUsersList = await UserModel.find(userWhere, {
    userId: 1,
    username: 1,
  });

  findUsersList = JSON.parse(JSON.stringify(findUsersList));

  const promises = findUsersList.map((userData, key) => {
    return new Promise(async (resolve, reject) => {
      try {


        let newPassword = Math.floor(Math.random() * 1000000).toString();
        let otp = Math.floor(Math.random() * 1000000);
        let hashedPassword = await bcrypt.hash(newPassword, 10);
        let updatePasswordObj = {
          updateOne: {
            filter: { _id: userData.userId },
            update: {
              $set: {
                password: hashedPassword,
                passwordShow: newPassword,
                jwtToken: "",
                otp: otp,
              },
            },
          },
        };
        await client.del(userData.userId + "");
        resolve(updatePasswordObj);
      } catch (error) {
        reject(error);
      }
    });
  });

  try {
    bulkUpdateArray = await Promise.all(promises);
    if (bulkUpdateArray) {
      await UserModel.bulkWrite(bulkUpdateArray);
    }
    if (res) {
      return SendResponse(
        res,
        "success",
        `password changed successfully to all`
      );
    }
  } catch (error) {
    console.error("Error occurred:", error);
    if (res) {
      return SendResponse(res, "error", `something went wrong`);
    }
  }
};

const flushAllRedisKeys = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  if (userType !== "owner") {
    return SendResponse(
      res,
      "error",
      `You are not authorized to change passwords.`
    );
  }
  const flushData = await client.flushall();
  if (res) {
    return SendResponse(
      res,
      "success",
      `flushed all redis keys success`,
      flushData
    );
  } else {
    return flushData;
  }
};

const forceLogOutAllUser = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userType = loggedUserData.userType;
  let userWhere = {};
  let updateObj = {
    jwtToken: "",
  };

  if (bodyData.userType) {
    userWhere.userType = bodyData.userType;
  }

  if (userType !== "owner") {
    userWhere = await whereHelper(loggedUserData, userWhere);
    userWhere.userType = "client";
  }


  const updateAllUser = await UserModel.updateMany(userWhere, updateObj);

  if (userType !== "owner") {
    let clientData = await UserModel.updateMany(userWhere, { userId: 1 });
    clientData.map(async (client) => {
      await client.del(client.userId + "");
    });
  }

  if (isRedis) {
    await client.flushall();
  }

  return SendResponse(
    res,
    "success",
    `logout Script Has Been Done Successfully`
  );
};

const view = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userType = loggedUserData.userType;

  let where = await whereHelper(loggedUserData, {
    _id: new ObjectId(bodyData.reqId),
  });

  const reqList = await DepositWithdrawModel.findOne(where);

  if (!reqList) {
    return SendResponse(res, "error", `req not found`);
  }

  let accountDetails = {};

  let isAccountExist = await AccountModel.findOne({ userId: reqList.userId });

  let returnData = {
    reqData: reqList,
    accountDetails: isAccountExist,
  };
  return SendResponse(
    res,
    "success",
    `logout Script Has Been Done Successfully`,
    returnData
  );
};

const checkExposureClient = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userType = loggedUserData.userType;
  let userId = loggedUserData.userId;

  if (userType == "owner" && bodyData.username) {
    let usernameData = await getUserIdByUsername(bodyData.username);
    if (usernameData.status != "success") {
      return SendResponse(res, "error", usernameData.msg);
    }
    userId = new ObjectId(usernameData.userDetails.userId);
  }


  let where = await whereHelper(loggedUserData, {
    userId: userId,
    forBet: 1,
    isDeclare: 0,
  });

  let exposerList = await TransactionLogModel.find(where, {
    gameType: 1,
    gameName: 1,
    marketId: 1,
    eventId: 1,
    remarks: 1,
    overallType: 1,
    createdAt: 1,
    date: 1,
    amount: 1,
    sportId: 1,
  });

  return SendResponse(res, "success", "", exposerList);
};

const mergeCoins = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userType = loggedUserData.userType;
  if (userType !== "owner") {
    return SendResponse(res, "error", `You are not authorized to merge coins`);
  }
  let userWhere = {};
  if (bodyData.userType) {
    userWhere.userType = bodyData.userType;
  }
  let userData = await UserModel.find(userWhere);

  let saveTransactionLog = [];

  userData.map((user) => {
    let depositAmount = user.coins;
    let pushTransaction = {
      userType: user.userType,
      userId: user.userId,
      amount: depositAmount,
    };
    saveTransactionLog.push(pushTransaction);
  });
};

const updateSetting = async (req, res) => {
  try {
    let bodyData = req.body;
   const loggedUserData = req.loggedInUser;
    let settingData = await SettingModel.find();
    let update = {};
    if (settingData.length == 0) {
      update = await SettingModel.create(bodyData);
    } else {
      update = await SettingModel.updateMany(
        { _id: settingData[0]._id },
        bodyData
      );
    }
    await client.set(`websiteSetting`, JSON.stringify(bodyData));
    return SendResponse(res, "success", "updated successfully", update);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "something went wrong in update setting",
      error
    );
  }
};

const getSetting = async (req, res) => {
  try {
    let settingData = await getSettingData()
    return SendResponse(res, "success", "get successfully", settingData);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "something went wrong in update setting",
      error
    );
  }
};

const mergeLedger = async (req, res) => {
  try {

      const loggedUserData = req.loggedInUser;
      const userType = loggedUserData.userType;
      if (userType !== "owner") {
        return SendResponse(res, "error", `You are not authorized to merge Ledger`);
      }
    
    
    const bodyData = req.body;
    let where = {
      isDeleted: { $in: [0, false] },
    };
    if (bodyData.userType) {
      where.userType = bodyData.userType;
    }

    const groupCond = {
      _id: "$userId",
      amount: { $sum: "$amount" },
      userType: { $first: "$userType" },
      clientId: { $first: "$clientId" },
      agentId: { $first: "$agentId" },
      superagentId: { $first: "$superagentId" },
      masterId: { $first: "$masterId" },
      subadminId: { $first: "$subadminId" },
      adminId: { $first: "$adminId" },
      superadminId: { $first: "$superadminId" },
      subownerId: { $first: "$subownerId" },
      ownerId: { $first: "$ownerId" },
    };

    const resData = await LedgerModel.aggregate([
      { $match: where },
      { $group: groupCond },
      { $sort: { _id: 1 } },
    ]).allowDiskUse(true);

    delete where.isDeleted;
    await LedgerModel.deleteMany(where);

    const CHUNK_SIZE = 5000;
    for (let i = 0; i < resData.length; i += CHUNK_SIZE) {
      const chunk = resData.slice(i, i + CHUNK_SIZE);

      const bulkLedger = chunk.map((ledgerData) => ({
        userId: ledgerData._id,
        amount: ledgerData.amount,
        clientId: ledgerData.clientId,
        agentId: ledgerData.agentId,
        superagentId: ledgerData.superagentId,
        masterId: ledgerData.masterId,
        subadminId: ledgerData.subadminId,
        adminId: ledgerData.adminId,
        superadminId: ledgerData.superadminId,
        subownerId: ledgerData.subownerId,
        ownerId: ledgerData.ownerId,
        userType: ledgerData.userType,
        ledgerType: "oldLedger",
        eventName: "old Ledger",
      }));

      await LedgerModel.insertMany(bulkLedger, { ordered: false });

      console.log(`Inserted ledger ${i + 1} - ${i + chunk.length}`);
    }

    return SendResponse(
      res,
      "success",
      `ledger updated successfully for ${bodyData.userType}`
    );
  } catch (error) {
    _d("error in merging ledger", error);
    return SendResponse(res, "error", "ledger merge failed");
  }
};


const mergeTransaction = async (req, res) => {
  try {

  const loggedUserData = req.loggedInUser;
  const userType = loggedUserData.userType;
  if (userType !== "owner") {
    return SendResponse(res, "error", `You are not authorized to mergeTransaction`);
  }
    
    
    let bodyData = req.body;
    let where = {};
    if (bodyData.userType) {
      where.userType = bodyData.userType;
    }

    let userData = await UserModel.find(where, {
      coins: 1,
      exposure: 1,
      userId: 1,
      userType: 1,
      username: 1,
      name: 1,
      name: 1,
      status: 1,
    });

    await StatementModel.deleteMany(where);
    await TransactionLogModel.deleteMany(where);

    const CHUNK_SIZE = 5000;
    for (let i = 0; i < userData.length; i += CHUNK_SIZE) {
      const chunk = userData.slice(i, i + CHUNK_SIZE);

      const statementAllData = [];
      const transactionAllData = [];

      for (const user of chunk) {

        statementAllData.push({
          userId: user.userId,
          username: user.username,
          userType: user.userType,
          amount: user.coins,
          oldAmount: user.coins,
          newAmount: user.coins,
          remark: "old Statement",
          statementFor: "ACCOUNT_STATEMENT",
        });

        transactionAllData.push({
          userId: user.userId,
          userType: user.userType,
          amount: user.coins,
          remarks: "merge coins",
          forBet: 0,
          clientId: user.clientId,
          agentId: user.agentId,
          superagentId: user.superagentId,
          masterId: user.masterId,
          subadminId: user.subadminId,
          adminId: user.adminId,
          superadminId: user.superadminId,
          subownerId: user.subownerId,
          ownerId: user.ownerId,
        });
      }


      

      if (statementAllData.length) {
        await StatementModel.insertMany(statementAllData, { ordered: false });
      }
      if (transactionAllData.length) {
        await TransactionLogModel.insertMany(transactionAllData, { ordered: false });
      }
      console.log(`Processed users ${i + 1} to ${i + chunk.length}`);
    }

    return SendResponse(
      res,
      "success",
      `transaction merge successfully for ${bodyData.userType}`
    );
  } catch (error) {
    _d("error in merging ledger", error);
  }
};

const hitReq = async (req, res) => {
  // Define the parameters of the request
  const apiURL = "https://imp99.com/api-v1/getOpenUserBets";
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    cookie:
      "_ga=GA1.2.1032378425.1717520663; _ga_3YMJYDCZRX=GS1.2.1718819263.16.1.1718820650.0.0.0; subadm_imp99com=mHjPkwTPVhhaCVssHWMp5gpzstbgokZZ68ei9M1b",
    origin: "https://imp99.com",
    priority: "u=1, i",
    referer: "https://imp99.com/user/events/33830385/",
    "sec-ch-ua":
      '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  };

  // Define the data template
  const betData = {
    event_id: "33830385",
  };

  // Function to hit the API multiple times
  const sendBatchRequests = async (numRequests) => {
    const requests = [];
    for (let i = 0; i < numRequests; i++) {
      requests.push(axios.post(apiURL, betData, { headers }));
    }
    // Execute all requests in parallel
    try {
      const responses = await Promise.all(requests);
      console.log(`Batch of ${numRequests} requests sent successfully.`);
    } catch (error) {
      console.error("Error in batch request:", error.message);
    }
  };

  // Schedule to hit 500 requests per second for 1 minute
  const duration = 60000; // 1 minute in milliseconds
  const requestsPerSecond = 500; // Number of requests per second

  let startTime = Date.now();

  const interval = setInterval(() => {
    if (Date.now() - startTime > duration) {
      clearInterval(interval);
      console.log("Finished sending requests for 1 minute.");
    } else {
      sendBatchRequests(requestsPerSecond);
    }
  }, 1000); // Run every second

  return SendResponse(res, "success", "Requests are being sent for 1 minute.");
};

const checkDuplicateFancy = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;

  let where = {
    forBet: 1,
    isDeclare: 1,
    isComm: 0,
    overallType: "fancyOdds",
  };

  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }

  let checkDuplicateFancyByDatabase = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: {
          selectionId: "$selectionId",
          userId: "$userId",
        },
        count: { $sum: 1 }, // Count occurrences
        fancyName: { $first: "$remarks" }, // Count occurrences
      },
    },
    {
      $match: {
        count: { $gt: 1 }, // Only keep groups with more than 1 occurrence
      },
    },
    {
      $limit: 1, // Return only one document
    },
  ]);

  return SendResponse(
    res,
    "success",
    "data fetch successfully",
    checkDuplicateFancyByDatabase
  );
};

const insertFancyByCenterPanel = async (req, res) => {
  try {
    let bodyData = req.body;
    let fancyData = bodyData.data;
    let saveData = {
      selectionId: fancyData.SelectionId,
      marketId: fancyData?.marketId,
      eventId: fancyData.match_id,
      sessionName: fancyData.RunnerName,
    };

    await FancyListModel.updateOne(
      {
        selectionId: fancyData.SelectionId,
        eventId: fancyData.match_id,
      },
      {
        $set: saveData,
      },
      {
        upsert: true,
      }
    );

    return SendResponse(res, "success", "insert data  successfully");
  } catch (error) {
    _d(`error in insertFancyByCenterpanel`);
  }
};

const asNumber = (value, defaultValue = 0) => {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
};

const fancyDecisionByCenterPanel = async (req, res) => {
  try {
    const b = req.body || {};
    const isCancel = Boolean(b.isCancel);

    const payload = {
      selectionId: String(b.selectionId || ""),
      marketId: String(b.marketId || ""),
      decisionRun: isCancel ? undefined : asNumber(b.decisionRun, 0),
      isDeclare: Boolean(b.isDeclare),
      isRollback: Boolean(b.isRollback),
      fancyName: b.fancyName || "",
      eventId: String(b.eventId || ""),
    };

    let returnData;
    if (isCancel) {
      returnData = await cancelFancy({ body: payload });
    } else {
      returnData = await sessionDecision({ body: payload });
    }

    const saveData = {
      isDeclare: payload.isDeclare,
      isRollback: payload.isRollback,
      decisionRun: payload.decisionRun,
      sessionName: payload.fancyName,
    };

    await FancyListModel.updateOne(
      { selectionId: payload.selectionId, eventId: payload.eventId },
      { $set: saveData },
      { upsert: true }
    );

    return SendResponse(res, "success", "decision updated successfully", returnData);
  } catch (error) {
    console.error("[fancyDecisionByCenterPanel] error:", error);
    return SendResponse(res, "error", "Failed to update decision", error?.message || "Unknown error");
  }
};



const matchDecisionByCenterPanel = async (req, res) => {
  try {
    let bodyData = req.body;
    req.body.eventId = bodyData.eventId;

    _dx("stop match decision");

    if (!bodyData.isToss) {
      await betfairMarketDecision(req);
    }

    req.body.marketId = bodyData.marketId;
    req.body.decisionSelectionId = bodyData.decisionSelectionId + "";
    if (bodyData.isToss) {
      req.body.isToss = bodyData.isToss;
    }
    await oddsDecision(req);

    return SendResponse(res, "success", "decision updated successfully");
  } catch (error) {
    console.log(error);
  }
};

const checkExposuerByMarketIdForFancy = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;

  let where = {
    forBet: 1,
    isDeclare: 0,
    isComm: 0,
    overallType: "fancyOdds",
  };

  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }

  let checkDuplicateFancyByDatabase = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: {
          selectionId: "$selectionId",
          userId: "$userId",
        },
        count: { $sum: 1 }, // Count occurrences
        fancyName: { $first: "$remarks" }, // Count occurrences
      },
    },
    {
      $match: {
        count: { $gt: 1 }, // Only keep groups with more than 1 occurrence
      },
    },
    {
      $limit: 1, // Return only one document
    },
  ]);

  return SendResponse(
    res,
    "success",
    "data fetch successfully",
    checkDuplicateFancyByDatabase
  );
};

const moveFancyToAdvance = async (req, res) => {
  try {
    let bodyData = req.body;
    const JoiSchema = Joi.object({
      selectionId: Joi.string().required(),
      marketId: Joi.string().required(),
      eventId: Joi.string().required(),
      sessionName: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    let selectionId = bodyData.selectionId;
    let marketId = bodyData.marketId;
    let eventId = bodyData.eventId;
    let sessionName = bodyData.sessionName;
    let isAdvance = bodyData.isAdvance ? bodyData.isAdvance : false;

    let saveData = {
      selectionId: selectionId,
      marketId: marketId,
      eventId: eventId,
      sessionName: sessionName,
      isAdvance: isAdvance,
    };

    await FancyListModel.updateOne(
      {
        selectionId: selectionId,
        eventId: eventId,
      },
      {
        $set: saveData,
      },
      {
        upsert: true,
      }
    );

    return SendResponse(res, "success", "fancy Moved To Advance Successsfully");
  } catch (e) {
    const errorMessage = {
      message: e.message || "An unknown error occurred.",
      name: e.name || "Error",
      details: e.details || null,
    };
    console.error("Error caught:", errorMessage);
  }
};

const fancyList = async (req, res) => {
  try {
    let bodyData = req.body;
    if (req.query.eventId) {
      bodyData.eventId = req.query.eventId
    }
    const JoiSchema = Joi.object({
      eventId: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    let cacheFancyList = await client.get(`fancyList_${bodyData.eventId}`);


    if (cacheFancyList) {
      cacheFancyList = JSON.parse(cacheFancyList);
      return SendResponse(res, "success", "fetched list", cacheFancyList);
    }

    let where = {
      eventId: bodyData.eventId,
    };

    if (bodyData.isAdvance) {
      where.isAdvance = bodyData.isAdvance;
    }

    if (bodyData.selectionId) {
      where.selectionId = bodyData.selectionId;
    }

    if (bodyData.decisionRun) {
      where.decisionRun = bodyData.decisionRun;
    }

    if (bodyData.deletedRemark) {
      where.deletedRemark = bodyData.deletedRemark;
    }

    if (bodyData.isCancel) {
      where.isCancel = bodyData.isCancel;
    }

    if (bodyData.isRollback) {
      where.isRollback = bodyData.isRollback;
    }

    if (bodyData.isDeclare) {
      where.isDeclare = bodyData.isDeclare;
    }

    let fancyList = await FancyListModel.find(where);

    if (fancyList && fancyList.length > 0) {
      await client.set(`fancyList_${bodyData.eventId}`, JSON.stringify(fancyList));
      await client.expire(`fancyList_${bodyData.eventId}`, 30); // Cache for 1 hour
    }

    return SendResponse(res, "success", "fetched list", fancyList);
  } catch (e) {
    console.log(e.message);
  }
};

const storage = multer.diskStorage({
  filename: (req, file, cb) => {
    req.body.imageFileName = Date.now() + path.extname(file.originalname);
    cb(null, Date.now() + path.extname(file.originalname));
  },
  destination: (req, file, cb) => {
    const imgFolderPath = "public/Img";
    if (!fs.existsSync(imgFolderPath)) {
      fs.mkdirSync(imgFolderPath);
    }
    cb(null, imgFolderPath);
  },
});

const upload = multer({ storage: storage });

const uploadImage = async (req, res) => {
  if (!req.file) {
    return SendResponse(res, "error", "Please send image in form data.");
  }

  let sendData = {
    imageName: req.body.imageFileName,
    imageUrl: req.body.imageFileName,
  };
  return SendResponse(res, "success", "file upload successfully", sendData);
};

const fileUploadToS3 = async (req, res) => {
  try {
    let bodyData = req.body;
    let fileData = req.file;

    let fileSize = fileData.size;
    const sizeInMB = (fileSize / (1024 * 1024)).toFixed(2); // convert it into MB
    if (sizeInMB > 3) {
      return SendResponse(res, "error", "image more then 3 mb is not accepted");
    }

    const filePath = fileData.path; // Path to your image file
    const bucketName = process.env.S3_BUCKET_NAME;
    uploadImageToS3(filePath, bucketName)
      .then((url) => {
        let sendData = {
          imageName: fileData.filename,
          imageUrl: url,
        };

        return SendResponse(res, "success", `successfully uploaded`, sendData);
      })
      .catch((error) => {
        console.error(`Upload failed: ${error.message}`);
        return SendResponse(res, "error", `Upload failed: ${error.message}`);
      });
  } catch (e) {
    console.log(e.message);
  }
};

// Function to upload image
const uploadImageToS3 = async (filePath, bucketName) => {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: fileContent,
    ContentType: "image/jpeg", // Adjust content type based on your image format
  };

  try {
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully. ${data.Location}`);
    return data.Location; // URL of the uploaded file
  } catch (error) {
    console.error(`Error uploading file: ${error.message}`);
    throw error;
  }
};

const getResults = async (req, res) => {
  try {
    let bodyData = req.body;
    let query = {};

    if (bodyData.marketId) {
      query.marketId = bodyData.marketId;
    }

    if (bodyData.marketType) {
      query.marketType = bodyData.marketType;
    }

    if (bodyData.sportId) {
      query.sportId = bodyData.sportId;
    }

    if (bodyData.sportType) {
      query.sportType = bodyData.sportType;
    }

    if (bodyData.fromDate && bodyData.toDate) {
      let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      query.date = dateWhere;
    }

    if (bodyData.isOdds) {
      query.marketType = { $ne: "fancy" }
    }

    let totalData = await sportResultModel.countDocuments(query);

    let resData = await sportResultModel
      .find(query)
      .sort({
        _id: -1,
      })
      .skip(bodyData.size * (bodyData.pageNo - 1))
      .limit(bodyData.size)
      .allowDiskUse(true);

    let tempData = {
      total: totalData,
      list: resData,
    };

    return SendResponse(res, "success", "data get successfully", tempData);
  } catch (e) { }
};

const saveAccountDetails = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;

    let where = await whereHelper(loginData, { userId: loginData.userId });

    let userDetails = await UserModel.findOne(where);

    if (!userDetails) {
      return SendResponse(
        res,
        "error",
        "you are not aithorized to update details of this user"
      );
    }

    bodyData.userId = userDetails.userId;
    bodyData.agentId = userDetails.agentId;
    bodyData.superagentId = userDetails.superagentId;
    bodyData.masterId = userDetails.masterId;
    bodyData.subadminId = userDetails.subadminId;
    bodyData.adminId = userDetails.adminId;
    bodyData.superadminId = userDetails.superadminId;
    bodyData.subownerId = userDetails.subownerId;
    bodyData.ownerId = userDetails.ownerId;

    await AccountDetailsModel.updateOne(
      { userId: new ObjectId(loginData.userId) },
      { $set: bodyData },
      { upsert: true }
    );

    await client.set(
      `accountDetails_${loginData.userId + ""}`,
      JSON.stringify(bodyData)
    );

    return SendResponse(
      res,
      "success",
      `account details updated successfully for ${loginData.username}`
    );
  } catch (e) {
    console.log(e.message);
  }
};

const getBankDetailsByUserId = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let userId = loginData.userId;
    if (bodyData.userId) {
      userId = bodyData.userId;
    }
    let where = await whereHelper(loginData, {
      userId: new ObjectId(userId),
    });
    let accountDetails = {};
    if (loginData.userType != "client") {
      accountDetails = await AccountModel.findOne(where);
      await client.set(
        `accountDetails_${userId + ""}`,
        JSON.stringify(accountDetails)
      );
    } else {
      let agentId = await client.get(`agentId_${loginData.userId}`);
      if (!agentId || agentId == null) {
        agentId = await UserModel.findOne(
          { _id: new ObjectId(loginData.userId) },
          { agentId: 1 }
        );
        agentId = agentId.agentId;
        await client.set(`agentId_${loginData.userId}`, agentId + "");
      }

      accountDetails = await client.get(`accountDetails_${agentId + ""}`);
      if (accountDetails) {
        accountDetails = JSON.parse(accountDetails);
      } else {
        accountDetails = await AccountModel.findOne({
          userId: new ObjectId(agentId),
        });
        if (!accountDetails) {
          req.isReturn = true;
          accountDetails = await domainSettingByDomainName(req, res);
        }

        await client.set(
          `accountDetails_${agentId + ""}`,
          JSON.stringify(accountDetails)
        );
      }
    }

    if (!accountDetails) {
      return SendResponse(res, "error", `details not found`);
    }


    let sendData = {
      barcode: accountDetails?.barcode,
      account: accountDetails?.account,
      crypto: accountDetails?.crypto,
      upi: accountDetails?.upi,
      helplineNumber: accountDetails?.helplineNumber,
      whatsappNumber: accountDetails?.whatsappNumber,
      isRegister: accountDetails?.isRegister,
      isReferral: accountDetails?.isReferral,
    };


    return SendResponse(res, "success", `data fetched`, sendData);
  } catch (e) {
    console.log(e.message);
  }
};

const updateFancyDateInTransaction = async (req, res) => {
  let bodyData = req.body;
  let date = bodyData.date;

  let convertDate = moment(date).format("YYYY-MM-DD");
  convertDate = moment(convertDate).startOf("day").toDate();
  convertDate = convertDate.getTime();

  let updateArray = {
    date: convertDate,
  };

  let where = {
    selectionId: bodyData.selectionId,
    marketId: bodyData.marketId,
  };

  let update = await TransactionLogModel.updateMany(where, {
    $set: updateArray,
  });

  return SendResponse(res, "success", `data fetched`, update);
};

const registerClient = async (req, res) => {
  try {
    const bodyData = req.body;
    const JoiSchema = Joi.object({
      mobileNo: Joi.number().required(),
      name: Joi.string().required(),
      username: Joi.string().required(),
      password: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    let websiteData = {};
    let websiteReqData = await getWebsiteDataByReq(req);


    if (websiteReqData.domainData) {
      websiteData = websiteReqData.domainData;
    }

    if (!websiteData || websiteData.isDeleted || !websiteData.status) {
      return SendResponse(res, "error", `Domain Data not found `);
    }

    let isSignupBonusCheck = false
    let signupBonusType = "flat"
    let signupBonusValue = 0

    if (websiteData && websiteData.signUpBonusSetting && websiteData.signUpBonusSetting.signupBonus) {
      isSignupBonusCheck = websiteData.signUpBonusSetting.signupBonus
      signupBonusType = websiteData.signUpBonusSetting.signupBonusType
      signupBonusValue = websiteData.signUpBonusSetting.signupBonusValue
    }


    if (!websiteData.isRegister) {
      return SendResponse(
        res,
        "error",
        `temporary signup is blocked by admin please try afte sometime`
      );
    }


    if (websiteData && websiteData.isSignUpOtp) {
      let mobileNo = bodyData.mobileNo
      if (!bodyData.otp) {
        return SendResponse(
          res,
          "error",
          `otp is reqired`
        );
      }
      let otp = bodyData.otp
      let clientOtpByPhoneNo = await client.get(`otp:value:${mobileNo}`);

      if (!clientOtpByPhoneNo) {
        return SendResponse(
          res,
          "error",
          `otp is expired ! trye again after sometime`
        );
      }
      if (clientOtpByPhoneNo != otp) {
        return SendResponse(
          res,
          "error",
          `otp is incorrect ! Please enter correct otp`
        );
      }
    }




    if (!websiteData.assignAgentId) {
      return SendResponse(res, "error", `agent not found something went wrong`);
    }

    let referralCode = ""
    let assignAgentId = new ObjectId(websiteData.assignAgentId);

    if (!websiteData || !websiteData.status || !assignAgentId) {
      return SendResponse(res, "error", "Domain Not Found");
    }


    if (bodyData.referralCode && bodyData.referralCode != "") {
      referralCode = bodyData.referralCode
      let reffrelData = await MlmChainListModel.findOne({ referral: referralCode })
      let userIdRefrel = reffrelData.userId
      let reffrerUserData = await UserModel.findOne({
        _id: new ObjectId(userIdRefrel)
      })
      if (reffrerUserData.agentId && reffrerUserData.agentId != null) {
        assignAgentId = new ObjectId(reffrerUserData.agentId)
      }
    }

    const agentData = await userDetailsByUserId(assignAgentId);


    if (!agentData || agentData.userType != "agent") {
      return SendResponse(res, "error", "Agent Not Found");
    }

    const objectData = {
      parentId: assignAgentId,
      mobile: bodyData.mobileNo,
      password: bodyData.password,
      name: bodyData.name,
      formatedUsername: bodyData.username,
      username: bodyData.username,
      status: 1,
      userType: "client",
      matchCommission: 0,
      sessionCommission: 0,
      casinoCommission: 0,
      matkaCommission: 0,
      coins: 0,
      reference: bodyData.domainUrl,
      commissionType: "OnlyOnMinus",
      betStatus: true,
      matchStatus: true,
      matkaStatus: true,
      isDirect: true,
      intCasinoStatus: true,
      isPasswordChanged: true,
    };


    let mobileNo = bodyData.mobileNo

    let userCountMobile = await UserModel.countDocuments({
      mobile: mobileNo
    })

    if (userCountMobile != 0) {
      return SendResponse(
        res,
        "error",
        "mobile no already exists",
        error
      );
    }

    const userRes = await UserCreate(objectData, agentData);

    let clientId = null
    if (userRes && userRes.data) {
      clientId = userRes.data._id
    }



    let isReferral = false;

    websiteData.isReferral = true;

    if (websiteData.isReferral) {
      isReferral = websiteData.isReferral;
    }

    if (isReferral) {
      let registerData = await registerClientReferral(
        bodyData.referralCode,
        bodyData.username
      );
    }


    if (isSignupBonusCheck && signupBonusValue != 0) {
      let depositCoins = signupBonusType == "flat" ? signupBonusValue : (signupBonusValue * coins) / 100
      let depositremarks = `signupBonus`;
      const updateCoins = await UpdateUserCoins(
        depositCoins,
        clientId,
        agentData,
        depositremarks
      );
    }


    return SendResponse(res, userRes.status, userRes.message);
  } catch (error) {
    console.log(error);
    return SendResponse(
      res,
      "error",
      "something went wrong in client registration",
      error
    );
  }
};

const registerClientReferral = async (referralCode, username) => {
  try {
    let userDataByReferral = await MlmChainListModel.findOne({
      referral: referralCode,
    });

    if (!userDataByReferral) {
      return returnResponse("error", "referral code not found");
    }

    if (userDataByReferral) {
      let userData = await UserModel.findOne(
        { username: username },
        { userId: 1, username: 1 }
      );

      let insertArray = {
        username: userData.username,
        userId: userData.userId,
        firstLayerId: userDataByReferral?.userId,
        secondLayerId: userDataByReferral?.firstLayerId,
        thirdLayerId: userDataByReferral?.secondLayerId,
        fourthLayerId: userDataByReferral?.thirdLayerId,
        fifthLayerId: userDataByReferral?.fourthLayerId,
        sixLayerId: userDataByReferral?.fifthLayerId,
      };

      await MlmChainListModel.updateOne(
        {
          username: username,
        },
        insertArray
      );
    }

    return returnResponse("success", "referral set successfully done");
  } catch (e) { }
};

const getAccountDetailsOfClient = async (req, res) => {
  try {
    let bodyData = req.body;
    const loginData = req.loggedInUser;
    let userId = loginData.userId;
    if (bodyData.userId) {
      userId = bodyData.userId;
    }
    let where = await whereHelper(loginData, {
      userId: new ObjectId(userId),
    });
    let accountDetails = {};

    accountDetails = await client.get(`accountDetails_${userId + ""}`);
    if (accountDetails && accountDetails !== null) {
      accountDetails = JSON.parse(accountDetails);
    } else {
      accountDetails = await AccountDetailsModel.findOne(where);
      await client.set(
        `accountDetails_${userId + ""}`,
        JSON.stringify(accountDetails)
      );
    }

    return SendResponse(res, "success", `data fetched`, accountDetails);
  } catch (e) {
    console.log(e.message);
  }
};

const declareCasinoResultAgain = async (req, res) => {
  let bodyData = req.body;
  let roundId = bodyData.roundId;

  const updateAllUser = await casinoBetModel.updateMany(
    { roundId: roundId },
    {
      isDeclare: 0,
    }
  );

  return SendResponse(
    res,
    "success",
    `round Id ${roundId} is Declared Again Successfully`,
    updateAllUser
  );
};

const getTransactionData = async (req, res) => {
  let bodyData = req.body;
  const JoiSchema = Joi.object({
    username: Joi.string().required(),
  }).options({ abortEarly: true, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  let username = bodyData.username;
  let userData = await getUserIdByUsername(username);

  if (userData.status != "success") {
    return SendResponse(res, "error", userData.msg);
  }

  let userId = new ObjectId(userData.userDetails.userId);
  let where = {
    amount: {
      $ne: 0,
    },
    userId: userId,
  };

  if (bodyData.isExposure && bodyData.isExposure == true) {
    where.forBet = 1;
    where.isDeclare = 0;
  }

  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }

  if (bodyData.forBet) {
    where.forBet = bodyData.forBet;
  }

  if (bodyData.eventId) {
    where.eventId = bodyData.eventId;
  }

  if (bodyData.overallType) {
    where.overallType = bodyData.overallType;
  }

  if (bodyData.isComm) {
    where.isComm = bodyData.isComm;
  }

  if (bodyData.selectionId) {
    where.selectionId = bodyData.selectionId;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    where.date = dateWhere;
  }

  const data = await TransactionLogModel.find(
    where,
    {
      amount: 1,
      gameType: 1,
      createdAt: 1,
      updatedAt: 1,
      marketId: 1,
      eventId: 1,
      remarks: 1,
      overallType: 1,
      forBet: 1,
      isDeclare: 1,
      _id: 1,
      selectionId: 1,
      isComm: 1,
    },
    {
      sort: {
        _id: -1,
      },
    }
  );

  return SendResponse(res, "success", "", data);
};

const updateExposureOfUser = async (req, res) => {
  try {
    let bodyData = req.body;
    const JoiSchema = Joi.object({
      username: Joi.string().required(),
    }).options({ abortEarly: true, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    
    let username = bodyData.username;
    let userData = await getUserIdByUsername(username);
    if (userData.status != "success") {
      return SendResponse(res, "error", userData.msg);
    }
    let userId = userData.userDetails.userId;
    let userType = userData.userDetails.userType;
    let update = await updateCoinsTbl(userId, userType);

    return SendResponse(res, "success", "", update);
  } catch (error) {
    console.log(error);
  }
};

const updateInternationalCasinoGamesInDatabase = async (req, res) => {
  try {
    const hitUrl = "https://kinr.intcasino.club/gapCasino/getGapCasinoList";
    const payLoad = {
      operatorId: process.env.OPERATOR_ID,
    };
    const response = await axios.post(hitUrl, payLoad);

    if (response.data && response.data.data) {
      const casinoGames = response.data.data;
      const insertArray = casinoGames.map((casinoData) => {
        delete casinoData._id;
        return casinoData;
      });

      await internationalCasinoList.deleteMany();
      const inserted = await internationalCasinoList.insertMany(insertArray);

      await updateInternationalCasinoListInRedis();

      if (res) {
        return SendResponse(res, "success", "updated successfully", inserted);
      } else {
        return true;
      }
    } else {
      if (res) {
        return SendResponse(res, "error", "No data received from the API", []);
      } else {
        return true;
      }
    }
  } catch (error) {
    console.error("Error updating casino games:", error);
    return SendResponse(
      res,
      "error",
      "Failed to update casino games",
      error.message
    );
  }
};

const updateInternationalCasinoListInRedis = async (req, res) => {
  try {
    let [data, databaseCateogeoryList] = await Promise.all([
      internationalCasinoList.find({
        status: { $in: ["ACTIVE", 1] },
      }),
      cateogeoryModel.find()
    ])

    if (databaseCateogeoryList) {
      databaseCateogeoryList = convertKeyObject(databaseCateogeoryList, "_id")
    }



    await client.set(`allInternationalCasinoList`, JSON.stringify(data));

    // Fast Sets for uniqueness
    const providerSet = new Set();
    const subProviderSet = new Set();
    const categorySet = new Set();

    // Fast arrays
    const trendingGames = [];
    const popularGames = [];
    const liveGames = [];
    const lobbyGames = [];

    // Mapped outputs
    const casinoListByCategory = {};
    const casinoListByProviderName = {};
    const subCateogeoryIdArray = {};
    const mainCateogeoryIdArray = {};

    // FAST LOOP
    for (const casino of data) {
      const provider = casino.providerName;
      const subProvider = casino.subProviderName;
      const category = casino.category;
      const subCatId = casino.subCateogeoryId ? String(casino.subCateogeoryId) : null;
      const catId = casino.cateogeoryId ? String(casino.cateogeoryId) : null;

      // Sets (O(1))
      providerSet.add(provider);
      subProviderSet.add(subProvider);
      categorySet.add(category);

      // Simple condition checks
      if (casino.isTrending) trendingGames.push(casino);
      if (casino.isPopular) popularGames.push(casino);
      if (casino.isLive) liveGames.push(casino);
      if (casino.isLobby) lobbyGames.push(casino);

      // Category grouping
      if (!casinoListByCategory[category]) {
        casinoListByCategory[category] = [];
      }
      casinoListByCategory[category].push(casino);

      // Provider grouping
      if (!casinoListByProviderName[provider]) {
        casinoListByProviderName[provider] = [];
      }
      casinoListByProviderName[provider].push(casino);

      // Subcategory grouping
      if (subCatId) {
        if (!subCateogeoryIdArray[subCatId]) {
          subCateogeoryIdArray[subCatId] = [];
        }
        subCateogeoryIdArray[subCatId].push(casino);
      }

      // Main category grouping
      if (catId) {
        if (!mainCateogeoryIdArray[catId]) {
          mainCateogeoryIdArray[catId] = [];
        }
        mainCateogeoryIdArray[catId].push(casino);
      }
    }

    // Convert sets to arrays
    const providers = [...providerSet];
    const subProviders = [...subProviderSet];
    const categories = [...categorySet];

    // JSON safe converter
    const safeJSON = (value) => {
      try {
        if (!value || typeof value === "undefined") return "[]";
        return JSON.stringify(value);
      } catch {
        return "[]";
      }
    };

    // Redis write tasks
    const tasks = [
      // Category wise
      ...Object.entries(casinoListByCategory).map(([category, games]) =>
        client.set(`category_${category}`, JSON.stringify(games))
      ),

      // Provider wise
      ...Object.entries(casinoListByProviderName).map(([provider, games]) =>
        client.set(`provider_${provider}`, JSON.stringify(games))
      ),

      // Subcategory wise
      ...Object.entries(subCateogeoryIdArray).map(([categoryId, games]) =>
        client.set(`subcategory_${categoryId}`, JSON.stringify(games))
      ),

      // Main category wise
      ...Object.entries(mainCateogeoryIdArray).map(([categoryId, games]) =>
        client.set(`maincategory_${categoryId}`, JSON.stringify(games))
      ),
    ];

    await Promise.allSettled(tasks);
    let mainCateogeoryCasinoObj = {}
    Object.entries(mainCateogeoryIdArray).map(([categoryId, games]) => {
      if (databaseCateogeoryList[categoryId]) {
        let mainData = databaseCateogeoryList[categoryId]
        mainCateogeoryCasinoObj[mainData.cateogeoryName] = {
          cateogeoryName: mainData.cateogeoryName,
          cateogeoryId: mainData._id,
          cateogeoryType: mainData.cateogeoryType,
          cateogeoryImg: mainData.cateogeoryImg,
          cateogeoryPriority: mainData.priority,
          cateogeoryRemark: mainData.remark,
          gamesList: games
        }
      }
    });

    await Promise.allSettled([
      client.set(`providerList`, JSON.stringify(providers)),
      client.set(`subProviderList`, JSON.stringify(subProviders)),
      client.set(`trendingGames`, JSON.stringify(trendingGames)),
      client.set(`popularGames`, JSON.stringify(popularGames)),
      client.set(`liveGames`, JSON.stringify(liveGames)),
      client.set(`categoriesList`, JSON.stringify(categories)),
      client.set(`lobbygames`, JSON.stringify(lobbyGames)),
      client.set(`mainCateogeoryListByDatabase`, safeJSON(mainCateogeoryCasinoObj)),
    ]);

    if (res) {
      return SendResponse(
        res,
        "success",
        "Casino games updated successfully",
        data
      );
    }

    return true;

  } catch (error) {
    console.error("Error updating casino games:", error);
    return SendResponse(res, "error", "Failed to update casino games");
  }
};


const getInternationalGroupCasinoList = async (req, res) => {
  try {
    const bodyData = req.body || {};
    let returnData = {};

    const tasks = [];
    const taskMap = [];

    const pushTask = (key, redisKey) => {
      tasks.push(client.get(redisKey));
      taskMap.push({ key, redisKey });
    };

    if (bodyData.categoriesList) {
      pushTask("categoriesList", "categoriesList");
    }

    if (bodyData.providerList) {
      pushTask("providerList", "providerList");
    }

    if (bodyData.subProviderList) {
      pushTask("subProviderList", "subProviderList");
    }

    if (bodyData.trendingGames) {
      pushTask("trendingGames", "trendingGames");
    }

    if (bodyData.popularGames) {
      pushTask("popularGames", "popularGames");
    }

    if (bodyData.lobbygames) {
      pushTask("lobbygames", "lobbygames");
    }

    if (bodyData.liveGames) {
      pushTask("liveGames", "liveGames");
    }

    if (bodyData.subCateogeoryId) {
      pushTask(
        "subCateogeoryId",
        `subcategory_${bodyData.subCateogeoryId}`
      );
    }

    if (bodyData.mainCateogeoryId) {
      pushTask(
        "mainCateogeoryData",
        `maincategory_${bodyData.mainCateogeoryId}`
      );
    }

    if (bodyData.mainCateogeoryAllData) {
      pushTask(
        "mainCateogeoryAllData",
        "mainCateogeoryListByDatabase"
      );
    }

    const results = await Promise.allSettled(tasks);

    results.forEach((result, index) => {
      const { key } = taskMap[index];

      if (result.status === "fulfilled" && result.value) {
        try {
          returnData[key] = JSON.parse(result.value);
        } catch (err) {
          console.error(`JSON parse error for ${key}`, err);
          returnData[key] = null;
        }
      } else {
        returnData[key] = null;
      }
    });

    if (res) {
      return SendResponse(res, "success", "updated successfully", returnData);
    }

    return returnData;
  } catch (error) {
    console.error("Error updating casino games:", error);
    return SendResponse(
      res,
      "error",
      "Failed to update casino games",
      error.message
    );
  }
};


const getCasinoListByCateogeory = async (req, res) => {
  try {
    let bodyData = req.body;
    let category = bodyData.category;
    if (!bodyData.category) {
      return SendResponse(res, "error", "category is required");
    }
    let categoryList = await client.get(`category_${category}`);
    categoryList = JSON.parse(categoryList);
    if (res) {
      return SendResponse(res, "success", "updated successfully", categoryList);
    } else {
      return resData;
    }
  } catch (error) {
    console.error("Error updating casino games:", error);
    return SendResponse(
      res,
      "error",
      "Failed to update casino games",
      error.message
    );
  }
};

const getCasinoListByProviderName = async (req, res) => {
  try {
    let bodyData = req.body;
    let provider = bodyData.provider;
    if (!bodyData.provider) {
      return SendResponse(res, "error", "provider is required");
    }
    let providerList = await client.get(`provider_${provider}`);
    providerList = JSON.parse(providerList);
    if (res) {
      return SendResponse(res, "success", "updated successfully", providerList);
    } else {
      return providerList;
    }
  } catch (error) {
    console.error("Error updating casino games:", error);
    return SendResponse(
      res,
      "error",
      "Failed to update casino games",
      error.message
    );
  }
};

const getAllCasinoInternationalList = async (req, res) => {
  try {
    let allInternationalCasinoList = await client.get(
      `allInternationalCasinoList`
    );
    allInternationalCasinoList = JSON.parse(allInternationalCasinoList);
    if (res) {
      return SendResponse(
        res,
        "success",
        "updated successfully",
        allInternationalCasinoList
      );
    } else {
      return allInternationalCasinoList;
    }
  } catch (error) {
    console.error("Error allInternationalCasinoList:", error);
    return SendResponse(res, "error", "Failed allInternationalCasinoList");
  }
};

const updateInternationalCasinoByOperating = async (req, res) => {
  try {
    const bodyData = req.body;
    const gameId = bodyData.gameId;
    const update = await internationalCasinoList.updateMany(
      {
        gameId: gameId,
      },
      bodyData
    );

    if (res) {
      return SendResponse(res, "success", "updated successfully");
    } else {
      return true;
    }
  } catch (error) {
    console.error("Error updateInternationalCasinoByOperating:", error);
    return SendResponse(
      res,
      "error",
      "Failed updateInternationalCasinoByOperating"
    );
  }
};



const getNegativeUserDetails = async (req, res) => {
  try {
    let bodyData = req.body;
    let where = {
      coins: {
        $lt: -1,
      },
    };
    if (bodyData.userType) {
      where.userType = bodyData.userType;
    }

    let userDetails = await UserModel.find(where, {
      userId: 1,
      username: 1,
      userType: 1,
      name: 1,
      coins: 1,
    });

    if (res) {
      return SendResponse(res, "success", "fetch successfully", userDetails);
    } else {
      return userDetails;
    }
  } catch (error) {
    console.log(error);
  }
};

const fillNegativeCoinsToUser = async (req, res) => {
  try {
    let bodyData = req.body;


    let where = {}

    if (bodyData.userId) {
      where._id = new ObjectId(bodyData.userId)
    }

    if (bodyData.username) {
      where.username = bodyData.username
    }


    let userDetails = await UserModel.findOne(
      where,
      {
        userId: 1,
        username: 1,
        userType: 1,
        name: 1,
        coins: 1,
        creatorId: 1,
        status: 1,
      }
    );


    if (userDetails.coins >= 0) {
      return SendResponse(res, "error", "coins is not negative");
    }

    const parentData = await UserModel.findOne({
      userId: userDetails.creatorId,
    });

    const userRemark = "negative coin adjustment by company";

    // const transaction = await TransactionLogModel.create({
    //   userId: userDetails.userId,
    //   userType: "client",
    //   amount: userDetails.coins,
    //   overallType: "depositWithdraw",
    //   remarks:userRemark,
    //   isDeclare: 1, 
    // });
    // _d(transaction)

    const updateCoins = await UpdateUserCoins(
      Math.abs(userDetails.coins),
      userDetails.userId,
      parentData,
      userRemark
    );

    if (res) {
      return SendResponse(res, "success", "updated  successfully", updateCoins);
    } else {
      return userDetails;
    }
  } catch (error) {
    console.log(error);
  }
};

const deleteAllUserData = async (req, res) => {
  try {
    let bodyData = req.bdy
    const loginData = req.loggedInUser;
    if (loginData.userType != "owner") {
      return SendResponse(res, "error", "only owner authorized to perform, this task");
    }


    let deleteDataUserId = bodyData.deleteDataUserId

    let deleteUserData = await UserModel.findOne({
      userId: new ObjectId(deleteDataUserId)
    })



    _dx(deleteUserData)

    let where = await userWhere(loginData)

  } catch (error) { console.log(error) }

}


const findDuplicateTransactionForDiamondcasino = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;

  let where = {
    forBet: 1,
    isDeclare: 1,
    isComm: 0,
    overallType: "diamondCasino",
    betId: { $ne: null },
  };

  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }


  // _d(where)
  let checkDuplicateFancyByDatabase = await TransactionLogModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: {
          marketId: "$marketId",
          amount: "$amount",
          userId: "$userId",
          betId: "$betId",
        },
        count: { $sum: 1 }, // Count occurrences
        remarks: { $first: "$remarks" }, // Count occurrences
      },
    },
    {
      $match: {
        count: { $gt: 2 }, // Only keep groups with more than 1 occurrence
      },
    },

  ]);

  return SendResponse(
    res,
    "success",
    "data fetch successfully",
    checkDuplicateFancyByDatabase
  );


}

const rollBackfancyList = async (req, res) => {
  try {
    const bodyData = req.body;
    const loggedUserData = req.loggedInUser;
    let where = {}
    if (bodyData.marketId) {
      where.marketId = bodyData.marketId
    }
    if (bodyData.eventId) {
      where.eventId = bodyData.eventId
    }
    if (bodyData.isRollback) {
      where.isRollback = bodyData.isRollback
    }
    if (bodyData.isRollback) {
      where.isRollback = bodyData.isRollback
    }
    if (bodyData.isAdvance) {
      where.isAdvance = bodyData.isAdvance
    }
    if (bodyData.fromDate && bodyData.toDate) {
      let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      where.date = dateWhere;
    }
    let fanycList = await FancyListModel.find(where)
    return SendResponse(
      res,
      "success",
      "fanycList",
      fanycList
    );
  } catch (e) {
    console.log(`fetch error in fancy list`, fanycList)
  }
}

const getDuplicateResultsOfCasino = async (req, res) => {
  try {
    let where = { gameType: "diamondCasino", isComm: 0, userType: "client", isDeclare: 1, forBet: 1 };

    let groupCond = {
      _id: "$marketId",
      amount: { $sum: "$amount" },
      createdAt: { $first: "$createdAt" },
      updatedAt: { $first: "$updatedAt" },
      date: { $first: "$date" },
      gameName: { $first: "$gameName" },
      eventId: { $first: "$eventId" },
      betIds: { $push: "$betId" }, // Collect all betIds for this marketId
    };

    var resData = await TransactionLogModel.aggregate([
      {
        $match: where, // Match the initial conditions
      },
      {
        $group: groupCond, // Group by marketId and collect betIds
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          createdAt: 1,
          updatedAt: 1,
          date: 1,
          gameName: 1,
          eventId: 1,
          betIds: 1,
          duplicateBetIds: {
            $filter: {
              input: {
                $map: {
                  input: { $setDifference: ["$betIds", []] },
                  as: "betId",
                  in: {
                    $cond: {
                      if: { $gt: [{ $size: { $filter: { input: "$betIds", as: "b", cond: { $eq: ["$$b", "$$betId"] } } } }, 1] },
                      then: "$$betId",
                      else: null
                    }
                  }
                }
              },
              as: "item",
              cond: { $ne: ["$$item", null] }
            }
          }
        }
      },
      {
        $match: {
          duplicateBetIds: { $ne: [] }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }
    ])
    Promise.all(
      resData.map(async (data) => {
        let roundId = data._id
        const updateAllUser = await casinoBetModel.updateMany(
          { roundId: roundId },
          {
            isDeclare: 0,
          }
        );
        console.log(updateAllUser)
      })
    )

    if (res) {
      return SendResponse(
        res,
        "success",
        "fanycList",
        resData
      );
    }

    return resData

  } catch (e) {
    console.log(`getDuplicateResultsOfCasino`, e)
  }
}



const cateogeoryCrud = async (req, res) => {
  try {
    const bodyData = req.body;
    if (bodyData.cateogeoryId) {
      let checkcateogeoryName = await cateogeoryModel.findOne({
        _id: new ObjectId(bodyData.cateogeoryId)
      })

      if (!checkcateogeoryName) {
        return SendResponse(
          res,
          "error",
          "cateogeory not found"
        );
      }
      bodyData.parentCateogeoryName = checkcateogeoryName.cateogeoryName
    }
    let updateCateogeory = await cateogeoryModel.updateMany({
      cateogeoryName: bodyData.cateogeoryName
    }, bodyData, {
      upsert: true
    })
    await saveCateogeoryInRedis()
    return SendResponse(
      res,
      "success",
      "fanycList",
      updateCateogeory
    );
  } catch (e) {
    console.log(`update error in cateogeoryCrud`, e)
  }
}


const saveCateogeoryInRedis = async () => {
  let updateCateogeory = await cateogeoryModel.find({ status: 1 })
  await client.set(`cateogeoryListAll`, JSON.stringify(updateCateogeory))
  const mainCateogeory = [];
  const casinoListByCategory = {};
  updateCateogeory.forEach((data) => {
    if (data.cateogeoryType == "main") {
      mainCateogeory.push({
        cateogeoryName: data.cateogeoryName,
        cateogeoryImg: data.cateogeoryImg,
        priority: data.priority,
        _id: data._id
      });
    }
    if (data.cateogeoryType == "sub") {
      if (!casinoListByCategory[data.parentCateogeoryName]) {
        casinoListByCategory[data.parentCateogeoryName] = [];
      }
      casinoListByCategory[data.parentCateogeoryName].push(data);
    }
  });

  await client.set(`subCateogeoryListAll`, JSON.stringify(casinoListByCategory))
  await client.set(`cateogeoryListOnly`, JSON.stringify(mainCateogeory))
  return updateCateogeory
}



const getCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;
    let cateogeoryList = {}
    if (bodyData.all) {
      cateogeoryList = await client.get(`cateogeoryListAll`)
      if (cateogeoryList && cateogeoryList != null) {
        cateogeoryList = JSON.parse(cateogeoryList)
      } else {
        cateogeoryList = await saveCateogeoryInRedis()
      }
    }

    if (!bodyData.all) {
      let where = {}
      if (bodyData.cateogeoryId) {
        where.cateogeoryId = bodyData.cateogeoryId
      }

      if (bodyData.cateogeoryName) {
        where.cateogeoryName = bodyData.cateogeoryName
      }

      if (bodyData.cateogeoryType) {
        where.cateogeoryType = bodyData.cateogeoryType
      }

      if (bodyData.status) {
        where.status = bodyData.status
      }

      if (bodyData._id) {
        where._id = bodyData._id
      }
      cateogeoryList = await cateogeoryModel.find(where)
    }


    return SendResponse(
      res,
      "success",
      "fanycList",
      cateogeoryList
    );
  } catch (e) {
    console.log(`fetch error in getCateogeory`, e)
  }
}



const deleteUserData = async (req, res) => {
  let bodyData = req.body
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;
  if (userType != "owner") {
    return SendResponse(
      res,
      "error",
      "only owner authorised to perform this action",
    );
  }

  if (bodyData.username) {
    let username = bodyData.username;
    let userData = await getUserIdByUsername(username);
    if (userData.status != "success") {
      return SendResponse(res, "error", userData.msg);
    }
    bodyData.userId = userData.userDetails.userId
  }


  let where = await whereHelper(loggedUserData, { _id: new ObjectId(bodyData.userId) })
  let userData = await UserModel.findOne(where)

  if (!userData) {
    return SendResponse(
      res,
      "error",
      "user not found",
    );
  }

  if (userData.status) {
    return SendResponse(
      res,
      "error",
      "user need to inactive first",
    );
  }

  let deleteWhere = {
    [`${userData.userType}Id`]: new ObjectId(userData._id)
  }

  _d(userData.username, userData.name)
  _d(deleteWhere)

  let returnArray = {}




  let [transaction, statement, user, ledger, play, fancy, profitLossPosition] = await Promise.all([
    // TransactionLogModel.deleteMany(deleteWhere),
    // StatementModel.deleteMany(deleteWhere),
    UserModel.deleteMany(deleteWhere),
    // LedgerModel.deleteMany(deleteWhere),
    // PlayModel.deleteMany(deleteWhere),
    // fancyBetListModel.deleteMany(deleteWhere),
    // profitLossModel.deleteMany(deleteWhere)

  ])



  // let transaction = await TransactionLogModel.deleteMany(deleteWhere)

  // let statement = await StatementModel.deleteMany(deleteWhere)

  // let user = await UserModel.deleteMany(deleteWhere)

  // let ledger = await LedgerModel.deleteMany(deleteWhere)

  // let play = await PlayModel.deleteMany(deleteWhere)

  // let fancy = await fancyBetListModel.deleteMany(deleteWhere)

  // let profitLossPosition = await profitLossModel.deleteMany(deleteWhere)



  returnArray.transaction = transaction
  returnArray.transaction = statement
  returnArray.user = user
  returnArray.ledger = ledger
  returnArray.play = play
  returnArray.fancy = fancy
  returnArray.profitLossPosition = profitLossPosition

  return SendResponse(
    res,
    "success",
    "",
    returnArray
  );


}


async function missingShareDoc(req, res) {
  try {

    let bodyData = req.body

    let where = {
      userType: "client"
    }

    if (bodyData.userId) {
      where.userId = new ObjectId(bodyData.userId)
    }
    let userList = await UserModel.find(where, {
      userCommissionType: 1,
      userMatchCommission: 1,
      userBetfairCommission: 1,
      userSessionCommission: 1,
      userCasinoCommission: 1,
      userMatkaCommission: 1,
      userId: 1,
      username: 1,
      userType: 1,
      creatorId: 1,
      userId: 1,
    }
    )



    let userIdArray = []
    userList.map((user) => {
      userIdArray.push(user.userId)
    })


    let shareData = await shareModel.find({
      userId: { $in: userIdArray },
    },
      {
        userId: 1,
        userName: 1
      });


    let shareDataUsername = convertKeyObject(shareData, "userName")
    shareData = convertKeyObject(shareData, "userId")



    let notSharedataIdList = []
    let notSharedataIdListArray = []
    let creatorIdArray = []
    userList.map((user) => {
      let userId = user.userId
      let username = user.username

      if (!shareData[userId]) {
        notSharedataIdList.push(user)
        notSharedataIdListArray.push(user.username)
        creatorIdArray.push(user.creatorId)
      }

      //    if(shareDataUsername[username] && !shareData[userId]){
      //   notSharedataIdList.push(user)
      //   notSharedataIdListArray.push(user.username)
      //   creatorIdArray.push(user.creatorId)
      // }



    })

    let creatorShareData = await shareModel.find({
      userId: { $in: creatorIdArray },
    });

    creatorShareData = convertKeyObject(creatorShareData, "userId")

    let shareInsertData = []



    //  let deleteData =await shareModel.deleteMany({
    //   userName : {$in : notSharedataIdListArray }
    //  })




    // _d(notSharedataIdList)
    //_dx(notSharedataIdList.length)


    Promise.all(
      notSharedataIdList.map(async (user) => {
        console.log("chunk start")
        let creatorShare = creatorShareData[user.creatorId];
        if (creatorShare) {
          let pushObj = creatorShare
          if (pushObj) {
            let updateData = { ...pushObj.toObject() };
            delete updateData.__v;
            delete updateData._id;
            updateData.userType = 'client';
            updateData.clientCommissionType = user.userCommissionType;
            updateData.clientMatchCommission = user.userMatchCommission;
            updateData.clientBetfairCommission = user.userBetfairCommission;
            updateData.clientSessionCommission = user.userSessionCommission;
            updateData.clientCasinoCommission = user.userCasinoCommission;
            updateData.clientMatkaCommission = user.userMatkaCommission;
            updateData.clientId = user.userId;
            updateData.userName = user.username;
            updateData.userType = user.userType;
            updateData.creatorId = user.creatorId;
            updateData.userId = user.userId;

            //updateUser =   await shareModel.create(updateData)



            let updateUser = await shareModel.updateOne(
              {
                $or: [
                  { userId: updateData.userId },
                  // { userName: updateData.userName },
                ],
              },
              { $set: updateData },
              { upsert: true }
            );

            _d(updateUser, "ddd")
          }
        }
      })

    )





    return SendResponse(
      res,
      "success",
      "",
      notSharedataIdList.length
    );


  } catch (e) {
    console.log(e)
    //await client.close();
  }
}


const distributeBonusToUpperline = async (req, res) => {
  try {
    let settingData = await getSettingData()

    //_d(settingData , "getSettingData")
    let isBonusDistribution = false
    if (settingData.isBonusDistribution && settingData.isBonusDistribution == true) {
      isBonusDistribution = true
    }

    if (isBonusDistribution) {
      let bodyData = {};
      let showDate = _date();
      let todayDate = moment().startOf("day").valueOf();
      if (req && req.body && req.body.date) {
        bodyData = req.body;
        showDate = await _date(bodyData.date);
        todayDate = moment(bodyData.date).startOf("day").valueOf();
      }

      let where = {
        date: todayDate,
        userType: "client",
        forBet: 1,
        isDeclare: 1
      }

      let isBonusAllow = bonusArray.bonusAllow
      let bonusSetting = bonusArray.setting
      let allowMarketTypeBonus = bonusArray.allowMarketTypeBonus


      if (isBonusAllow) {
        var totalClientAmountByUserWise = await TransactionLogModel.aggregate([
          {
            $match: where,
          },
          {
            $group: {
              _id: "$userId",
              totalAmount: {
                $sum: { $abs: "$amount" },
              },
              bookmakerAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$overallType", "bookmakerOdds"] }],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              matchOddsAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$overallType", "bookmakerOdds"] },
                        { $eq: ["$remarks", "matchOddsOdds"] },
                      ],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              internationCasinoAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$overallType", "internationalCasino"] }],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              diamondCasinoAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$overallType", "diamondCasino"] }],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              fancyAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$overallType", "fancyOdds"] }],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
              matkaAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$overallType", "matkaOdds"] }],
                    },
                    { $abs: "$amount" },
                    0,
                  ],
                },
              },
            },
          },
        ]);

        let userIdArray = []
        totalClientAmountByUserWise.map((userData) => {
          userIdArray.push(userData._id)
        })

        let mlmData = await MlmChainListModel.find({
          userId: { $in: userIdArray }
        })

        let transactionLogInsert = []
        let finalUpdateuserIdTotables = []

        let finalUserObj = {}

        let totalClientAmountByUserWiseIdWise = convertKeyObject(totalClientAmountByUserWise, "_id")
        totalClientAmountByUserWiseIdWise = JSON.parse(JSON.stringify(totalClientAmountByUserWiseIdWise))
        let bonusLayerAllow = bonusSetting.bonusLayerAllow

        mlmData.map((mlmUser) => {
          let userId = mlmUser.userId.toString()
          let userTransactionData = totalClientAmountByUserWiseIdWise[userId]
          let directAmount = 0
          if (allowMarketTypeBonus.bookmakerAmount && allowMarketTypeBonus.bookmakerAmount == true) {
            directAmount += userTransactionData.bookmakerAmount
          }
          if (allowMarketTypeBonus.matchOddsAmount && allowMarketTypeBonus.matchOddsAmount == true) {
            directAmount += userTransactionData.matchOddsAmount
          }
          if (allowMarketTypeBonus.internationCasinoAmount && allowMarketTypeBonus.internationCasinoAmount == true) {
            directAmount += userTransactionData.internationCasinoAmount
          }
          if (allowMarketTypeBonus.diamondCasinoAmount && allowMarketTypeBonus.diamondCasinoAmount == true) {
            directAmount += userTransactionData.diamondCasinoAmount
          }
          if (allowMarketTypeBonus.fancyAmount && allowMarketTypeBonus.fancyAmount == true) {
            directAmount += userTransactionData.fancyAmount
          }
          if (allowMarketTypeBonus.matkaAmount && allowMarketTypeBonus.matkaAmount == true) {
            directAmount += userTransactionData.matkaAmount
          }

          if (mlmUser.firstLayerId == null && bonusLayerAllow.directByAgent != 0) {
            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.userId?.toString()) &&
              mlmUser?.userId
            ) {
              finalUpdateuserIdTotables.push(mlmUser.userId);
            }

            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "directByAgent",
              sessionTurnOver: directAmount,
              userId: mlmUser.userId,
              date: todayDate
            }

            let agentAmount = directAmount * bonusLayerAllow.directByAgent / 100


            if (agentAmount == NaN || !agentAmount || agentAmount == null) {
              agentAmount = 0
            }



            diretctAgentTransaction.amount = agentAmount



            transactionLogInsert.push(diretctAgentTransaction)

            if (!finalUserObj[mlmUser.userId]) {
              finalUserObj[mlmUser.userId] = 0
            }
            finalUserObj[mlmUser.userId] += agentAmount
          }


          if (mlmUser.firstLayerId != null && bonusLayerAllow.firstLayer != 0) {

            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.firstLayerId?.toString()) &&
              mlmUser?.firstLayerId
            ) {
              finalUpdateuserIdTotables.push(mlmUser.firstLayerId);
            }

            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "firstLayerId",
              sessionTurnOver: directAmount,
              userId: mlmUser.firstLayerId,
              date: todayDate
            }
            let firstLayerAmount = directAmount * bonusLayerAllow.firstLayer / 100

            if (firstLayerAmount == NaN || !firstLayerAmount || firstLayerAmount == null) {
              firstLayerAmount = 0
            }


            diretctAgentTransaction.amount = firstLayerAmount


            transactionLogInsert.push(diretctAgentTransaction)

            if (!finalUserObj[mlmUser.firstLayerId]) {
              finalUserObj[mlmUser.firstLayerId] = 0
            }
            finalUserObj[mlmUser.firstLayerId] += firstLayerAmount
          }

          if (mlmUser.secondLayerId != null && bonusLayerAllow.secondLayer != 0) {
            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.secondLayerId?.toString()) &&
              mlmUser?.secondLayerId
            ) {
              finalUpdateuserIdTotables.push(mlmUser.secondLayerId);
            }

            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "secondLayerId",
              sessionTurnOver: directAmount,
              userId: mlmUser.secondLayerId,
              date: todayDate
            }
            let secondLayerAmount = directAmount * bonusLayerAllow.secondLayer / 100
            if (secondLayerAmount == NaN || !secondLayerAmount || secondLayerAmount == null) {
              secondLayerAmount = 0
            }
            diretctAgentTransaction.amount = secondLayerAmount
            transactionLogInsert.push(diretctAgentTransaction)


            if (!finalUserObj[mlmUser.secondLayerId]) {
              finalUserObj[mlmUser.secondLayerId] = 0
            }
            finalUserObj[mlmUser.secondLayerId] += secondLayerAmount
          }

          if (mlmUser.thirdLayerId != null && bonusLayerAllow.thirdLayer != 0) {
            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.thirdLayer?.toString()) &&
              mlmUser?.thirdLayer
            ) {
              finalUpdateuserIdTotables.push(mlmUser.thirdLayer);
            }
            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "thirdLayerId",
              sessionTurnOver: directAmount,
              userId: mlmUser.thirdLayerId,
              date: todayDate
            }
            let thirdLayerAmount = directAmount * bonusLayerAllow.thirdLayer / 100

            if (thirdLayerAmount == NaN || !thirdLayerAmount || thirdLayerAmount == null) {
              thirdLayerAmount = 0
            }


            diretctAgentTransaction.amount = thirdLayerAmount
            transactionLogInsert.push(diretctAgentTransaction)


            if (!finalUserObj[mlmUser.thirdLayerId]) {
              finalUserObj[mlmUser.thirdLayerId] = 0
            }
            finalUserObj[mlmUser.thirdLayerId] += thirdLayerAmount
          }


          if (mlmUser.fourthLayerId != null && bonusLayerAllow.fourthLayer != 0) {
            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.fourthLayer?.toString()) &&
              mlmUser?.fourthLayer
            ) {
              finalUpdateuserIdTotables.push(mlmUser.fourthLayer);
            }
            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "fourthLayerId",
              sessionTurnOver: directAmount,
              userId: mlmUser.fourthLayerId,
              date: todayDate
            }
            let fourthLayerAmount = directAmount * bonusLayerAllow.fourthLayer / 100

            if (fourthLayerAmount == NaN || !fourthLayerAmount || fourthLayerAmount == null) {
              fourthLayerAmount = 0
            }

            diretctAgentTransaction.amount = fourthLayerAmount
            transactionLogInsert.push(diretctAgentTransaction)
            if (!finalUserObj[mlmUser.fourthLayerId]) {
              finalUserObj[mlmUser.fourthLayerId] = 0
            }
            finalUserObj[mlmUser.fourthLayerId] += fourthLayerAmount
          }

          if (mlmUser.fifthLayerId != null && bonusLayerAllow.fifthLayer != 0) {
            if (
              !finalUpdateuserIdTotables.some(id => id.toString() === mlmUser?.fifthLayerId?.toString()) &&
              mlmUser?.fifthLayerId
            ) {
              finalUpdateuserIdTotables.push(mlmUser.fifthLayerId);
            }
            let diretctAgentTransaction = {
              overallType: "isBonus",
              remarks: "fifthLayerId",
              sessionTurnOver: directAmount,
              userId: mlmUser.fifthLayerId,
              date: todayDate
            }
            let fifthLayerAmount = directAmount * bonusLayerAllow.fifthLayer / 100

            if (fifthLayerAmount == NaN || !fifthLayerAmount || fifthLayerAmount == null) {
              fifthLayerAmount = 0
            }

            diretctAgentTransaction.amount = fifthLayerAmount
            transactionLogInsert.push(diretctAgentTransaction)

            if (!finalUserObj[mlmUser.fifthLayerId]) {
              finalUserObj[mlmUser.fifthLayerId] = 0
            }
            finalUserObj[mlmUser.fifthLayerId] += fifthLayerAmount
          }
        })






        let statementLogInsert = []
        Object.entries(finalUserObj).forEach(([key, value]) => {
          if (value == NaN || !value || value == null) {
            value = 0
          }
          let pushStatement = {
            userId: key,
            userType: "client",
            amount: value,
            remark: `bonusCredited`,
            date: todayDate
          }
          statementLogInsert.push(pushStatement)
        });

        await TransactionLogModel.deleteMany({
          date: todayDate,
          overallType: "isBonus"
        })
        await TransactionLogModel.create(transactionLogInsert)


        await StatementModel.deleteMany({
          date: todayDate,
          remark: `bonusCredited`,
        })
        await StatementModel.create(statementLogInsert)
        await updateBulkCoinsExposureUserByMarketId(finalUpdateuserIdTotables)



        if (res) {
          return SendResponse(
            res,
            "success",
            "successfully done",
          );
        } else {
          return true
        }
      }
    } else {
      if (res) {
        return SendResponse(
          res,
          "error",
          "distibution is not allowed",
        );
      } else {
        console.log(`bonus distribution not allowed`)
        return false
      }
    }
  } catch (e) {
    console.log(e, `erro in distributeBonusToUpperline`)
  }
}


const checkRollbackCasinoWithTransactionAdnDeleteInCrickTransaction = async (req, res) => {
  let getTransaction = await TransactionLogModel.find({ isRollback: 1 }, {
    eventId: 1,
    amount: 1
  })

  let eventIdArray = []

  getTransaction.map((eventId) => {
    eventIdArray.push(eventId.eventId)
  })

  let deleteData = await crickTransaction.deleteMany({
    selectionId: { $in: eventIdArray }
  })

  if (res) {
    return SendResponse(
      res,
      "success",
      "deleted successfully done",
    );
  } else {
    return true
  }
}


const createOwner = async (req, res) => {
  let bodyData = req.body
  bodyData.username.toUpperCase()

  let userData = {
    username: bodyData.username,
    checkUsername: bodyData.username.toUpperCase(),
    password: bodyData.password ? bodyData.password : 1122,
    passwordShow: bodyData.password ? bodyData.password : 1122,
    mobile: "1122334455",
    name: bodyData.username,
    userType: "owner",
    status: 1,
    intCasinoMultiply: 1,
    matchShare: 0,
    casinoShare: 0,
    matkaShare: 0,
    userMatchShare: 0,
    userCasinoShare: 0,
    userMatkaShare: 0,
    userPoliticsShare: 0,
    intCasinoShare: 0,
    userShowMatchShare: 0,
    userShowCasinoShare: 0,
    userShowMatkaShare: 0,
    intCasinoExpoLimit: 100000000000,
    userCommissionType: "BetByBet",
    userMatchCommission: 10,
    userSessionCommission: 10,
    userCasinoCommission: 10,
    userMatkaCommission: 20,
    userFixLimit: 1000000000,
    matchCommission: 5,
    sessionCommission: 5,
    commissionType: "BetByBet",
    casinoCommission: 5,
    matkaCommission: 5,
    coins: "100000000000",
    reference: "company",
    creditReference: "100000000000",
    showMatchShare: 0,
    showCasinoShare: 0,
    showMatkaShare: 0,
    betStatus: true,
    matchStatus: true,
    casinoStatus: true,
    matkaStatus: true,
    intCasinoStatus: true,
    selfCuttingPermission: true,
    selfCuttingCoins: 100000000000,
    transactionPassword: bodyData.password ? bodyData.password : "1122",
    matkaLimitPerNumber: 100000000,
    userPriority: 9,
    betMaxMinData: {
      cricket: { minimumBet: "10", maximumBet: "100000000", betDelay: "5" },
      soccer: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      tennis: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      fancy: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
      casino: { minimumBet: "10", maximumBet: "10000000", betDelay: "5" },
    },
    minMaxComm: {
      betfair: { min: 1, max: 10 },
      session: { min: 0, max: 10 },
      bookmaker: { min: 0, max: 10 },
    },
    otp: 112233,
    userBetfairCommission: 10,
    allowedDomains: [],
  };

  let count = await UserModel.countDocuments({
    username: bodyData.username
  });


  if (count != 0) {
    return SendResponse(
      res,
      "error",
      "username already exists",
    );
  }


  let userResponse = await UserModel.create(userData);

  let field = `userId`;
  let queryObj = {
    [field]: userResponse._id,
    ownerId: userResponse._id,
    userId: userResponse._id,
  };

  await UserModel.where("_id", userResponse._id).updateOne({
    $set: queryObj,
  });


  if (res) {
    return SendResponse(
      res,
      "success",
      "staff created succcessfully",
    );
  } else {
    return true
  }
}



const clientCoinsProfitExposure = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userType = loggedUserData.userType
  let userId = loggedUserData.userId

  let returnObj = {
    exposure: 0,
    totalCoins: 0,
    profitLoss: 0
  }

  let where = {
  };

  where = await whereHelper(loggedUserData, where)
  if (bodyData.marketId) {
    where.marketId = bodyData.marketId;
  }

  where.userType = "client"


  if (bodyData.userType) {
    where.userType = bodyData.userType
  }


  let getData = await UserModel.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        exposure: { $sum: `$exposure` },
        totalCoins: { $sum: `$coins` },
        profitLoss: { $sum: `$totalProfitLoss` },
      },
    },
  ]);


  returnObj.exposure = getData[0] ? getData[0].exposure : 0
  returnObj.totalCoins = getData[0] ? getData[0].totalCoins : 0
  returnObj.profitLoss = getData[0] ? getData[0].profitLoss : 0

  return SendResponse(
    res,
    "success",
    "data fetch successfully",
    returnObj
  );
};



const upperLineLedger = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userType = loggedUserData.userType
  let userId = loggedUserData.userId

  let where = {
    transactionType: "profitLoss"
  };

  where = await whereHelper(loggedUserData, where)

  let getData = await crickTransaction.aggregate([
    {
      $match: where,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        ledger: { $sum: `$${userType}LedgerAmount` },
      },
    },
  ]);

  let returnObj = {
    upplerLineLedger: getData[0] ? getData[0].ledger : getData[0].ledger
  }

  if (res) {
    return SendResponse(
      res,
      "success",
      "get data",
      returnObj
    );
  } else {
    return true
  }
}

const getMlmChainList = async (req, res) => {
  const bodyData = req.body;
  const loginData = req.loggedInUser;

  const JoiSchema = Joi.object({
    userId: Joi.string().required(),
  }).options({ abortEarly: false, allowUnknown: true });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }

  let userId = new ObjectId(bodyData.userId)
  let layerId = "firstLayerId"
  if (bodyData && bodyData.layerId) {
    layerId = bodyData.layerId
  }

  let reffrelDataByLayer = await MlmChainListModel.find({
    [layerId]: userId
  }, {
    username: 1,
    userId: 1,
  })


  let userIdArray = []
  reffrelDataByLayer.map((user) => {
    userIdArray.push(user.userId)
  })


  let userData = await UserModel.find({
    _id: userIdArray
  })

  let returnData = {
    userData: userData,
    type: layerId,
    userIdArray: userIdArray,
    totalDeposit: 0,
    totalWithdraw: 0,
    totalProfitLoss: 0,
  }


  let whereObj = {
    userId: { $in: userIdArray }
  }

  if (bodyData.fromDate && bodyData.toDate) {
    let dateWhere = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    whereObj.date = dateWhere;
  }

  var resData = await TransactionLogModel.aggregate([
    {
      $match: whereObj,
    },
    {
      $group: {
        _id: null,
        totalDeposit: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$overallType", "depositWithdraw"] },
                  { $gt: ["$amount", 0] }
                ]
              },
              "$amount",
              0
            ]
          }
        },
        totalWithdraw: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$overallType", "depositWithdraw"] },
                  { $lt: ["$amount", 0] }
                ]
              },
              "$amount",
              0
            ]
          }
        },
        totalProfitLoss: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$isDeclare", 1] }, { $eq: ["$forBet", 1] }],
              },
              `$amount`,
              0,
            ],
          },
        },
      },
    },
  ]);


  if (resData[0]) {
    returnData.totalDeposit = resData[0].totalDeposit ? resData[0].totalDeposit : 0
    returnData.totalWithdraw = resData[0].totalWithdraw ? resData[0].totalWithdraw : 0
    returnData.totalProfitLoss = resData[0].totalProfitLoss ? resData[0].totalProfitLoss : 0
  }

  return SendResponse(res, "success", `data get successfully`, returnData);
}

const getWhatsAppOtp = async (req, res) => {
  try {
    const bodyData = req.body;
    const phone = bodyData.phone;
    if (!phone) {
      if (res) {
        return SendResponse(res, "error", "Phone number is required.");
      } else {
        console.log("error", "Phone number is required.")
      }

    }
    const ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    const otpCountKey = `otp:count:${phone}`;
    const otpCooldownKey = `otp:cooldown:${phone}`;
    const ipCountKey = `otp:ipcount:${ip}`;
    const ipBlockKey = `otp:ipblock:${ip}`;
    const isIpBlocked = await client.exists(ipBlockKey);

    if (isIpBlocked) {
      const blockTTL = await client.ttl(ipBlockKey);
      return SendResponse(res, "error", `Too many requests from your IP. Try again in ${blockTTL}s.`);
    }

    let ipCount = await client.incr(ipCountKey);
    if (ipCount === 1) {
      await client.expire(ipCountKey, 300);
    }

    if (ipCount > 10) {
      await client.setex(ipBlockKey, 600, "blocked");
      return SendResponse(res, "error", "Too many OTP requests from your IP. Try again later.");
    }

    const cooldownTTL = await client.ttl(otpCooldownKey);
    if (cooldownTTL > 0) {
      return SendResponse(res, "error", `Please wait ${cooldownTTL}s before requesting another OTP.`);
    }

    let otpCount = parseInt(await client.get(otpCountKey)) || 0;


    let cooldown = 0;
    if (otpCount === 0) cooldown = 30;
    else if (otpCount === 1) cooldown = 60;
    else cooldown = 300;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let returnData = await sendMessageotpByMessageApi(phone, otp)

    await client.setex(`otp:value:${phone}`, 300, otp);
    await client.incr(otpCountKey);
    await client.expire(otpCountKey, 600);
    await client.setex(otpCooldownKey, cooldown, "locked");
    return SendResponse(res, "success", "OTP sent successfully", otp);
  } catch (err) {
    console.error("Unexpected OTP Error:", err);
    return SendResponse(res, "error", "An unexpected error occurred. Please try again.");
  }
};


const sendWhatsAppOtp = async (numbers, otp) => {
  try {
    if (!numbers || !otp) {
      return "Phone number and OTP are required";
    }
    const url = "https://waba-be-whatsapp.its.com.pk/v1/template/message";
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/json;charset=UTF-8",
      origin: "https://waba-whatsapp.its.com.pk",
      pragma: "no-cache",
      referer: "https://waba-whatsapp.its.com.pk/templateMessage-hsm",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "xt-user-token":
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRUb2tlbklkIjoiOTcwMzI4NjYtNTA5OC00MzZjLWI3YmQtOTdlZmYxODQ4ZGFlIiwiY2xpZW50VXVpZCI6IjkxNjJkNjIwLTQ1NWUtNDAwNi04ZTM5LWNhNmZhZTEyYzA0MCIsImNsaWVudCI6IjI1NCIsImFjdG9yIjoiNzA3IiwidXNlclRva2VuSWQiOiI5MGU5N2JlMC00NThiLTQzYWUtOGY4OS01MTkzNGQ4ZjgzYzgiLCJ0aW1lIjoxNzU0MDQ1NDY4Njc0LCJtYXhfdG9rZW5fY291bnQiOi0xLCJpYXQiOjE3NTQwNDU0Njh9.yVbZwkCG7OTSrnVRE_2UtC2OGPFiGK5lWioMP8ro1Ac",
    };

    const data = {
      clientId: "254",
      template_message_id: "1732",
      numbers: numbers, // e.g., "923200887206"
      template_params: {
        body: {
          type: "BODY",
          text: `${otp} is your verification code. For your security, Please do not share this code To Anyone.`,
          parameters: [
            {
              paramName: "",
              sampleValue: "123456",
              value: otp, // dynamic OTP
            },
          ],
        },
        buttons: [
          {
            url: `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp${otp}`,
            text: "Copy code",
            sub_type: "URL",
            value: otp,
            type: "BUTTONS",
            sampleValue: `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=${otp}`,
          },
        ],
      },
    };

    const response = await axios.post(url, data, { headers });

    console.log(response.data)
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:", error.message);

  }
};

const sendMessageotpByMessageApi = async (numbers, otp, isForget = false) => {
  try {
    let returnData = {
      status: false,
      data: {}
    }
    if (!numbers || !otp) {
      return "Phone number and OTP are required";
    }
    let message = `your signup otp is ${otp} ! thanks for connecting with us`

    if (isForget) {
      message = `your forget password  otp is ${otp} ! thanks for connecting with us`
    }

    // const url = `https://www.fast2sms.com/dev/bulkV2?authorization=WnilL4H61qgFAvMGhcKfs5IzCQZjxt9dkNVm0TOJ7eab2Xur3UqBtEoKhR6e8AT9b5xYldmjykDn3P1p&route=q&message=${message}&flash=0&numbers=${numbers}&schedule_time=`;
    // const response = await axios.get(url);

    const response = await axios.post(
      `https://ninzasms.in.net/auth/send_sms`,
      {
        sender_id: "15851",
        variables_values: otp,
        numbers: numbers,
       // rout: "waninza"
      },
      {
        headers: {
          authorization: "NINZASMS7917c30ccd6d01e499614fc7f6195d21d1c86be584fa7d2d01c7",
          "content-type": "application/json"
        }
      }
    );


    console.log("Response:", response.data);
 
    if (response && response.data) {
      returnData.data = response.data
      returnData.status = true
    }

    return returnData
  
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:", error.message);
  }
};

const userPasswordChangeByMobile = async (req, res) => {
  try {
    const { mobile, otp, password } = req.body;
    const ip = req.ip;

    if (!mobile) {
      return SendResponse(res, "error", "Mobile number is required.");
    }

    if (!otp) {
      return SendResponse(res, "error", "OTP is required.");
    }

    const blockKey = `otp:block:${mobile}:${ip}`;
    const attemptsKey = `otp:attempts:${mobile}:${ip}`;


    // Check if the IP is blocked for this mobile
    const isBlocked = await client.get(blockKey);

    if (isBlocked) {
      return SendResponse(res, "error", "Too many incorrect attempts. Try again later.");
    }

    // Get OTP from Redis
    const clientOtp = await client.get(`otp:value:${mobile}`);
    if (!clientOtp) {
      return SendResponse(res, "error", "OTP has expired. Please request a new one.");
    }

    // Validate OTP
    if (clientOtp !== otp) {
      // Track wrong attempts
      const attempts = await client.incr(attemptsKey);

      if (attempts === 1) {
        await client.expire(attemptsKey, 300); // 5 minutes window
      }

      if (attempts >= 10) {
        await client.set(blockKey, "1", "EX", 600); // Block for 10 minutes
        await client.del(attemptsKey); // Reset attempts after blocking
        return SendResponse(res, "error", "Too many wrong attempts. You are temporarily blocked.");
      }

      return SendResponse(res, "error", "Incorrect OTP. Please try again.");
    }

    // OTP is correct — clear any previous attempt counters
    await client.del(attemptsKey);
    await client.del(blockKey);


    const lookupBlockKey = `mobile:block:${mobile}:${ip}`;
    const lookupAttemptsKey = `mobile:attempts:${mobile}:${ip}`;

    // Check if IP is blocked for wrong mobile lookups
    const isLookupBlocked = await client.get(lookupBlockKey);
    if (isLookupBlocked) {
      return SendResponse(res, "error", "Too many invalid attempts. You are temporarily blocked for 10 minutes.");
    }

    // Find user by mobile
    const userData = await UserModel.findOne(
      { mobile },
      {
        otp: 1,
        username: 1,
        userId: 1,
        status: 1,
      }
    );

    if (!userData) {
      // Increment failed lookup attempts
      const lookupAttempts = await client.incr(lookupAttemptsKey);

      if (lookupAttempts === 1) {
        await client.expire(lookupAttemptsKey, 300); // Set 5-minute window
      }

      if (lookupAttempts >= 3) {
        await client.set(lookupBlockKey, "1", "EX", 600); // Block for 10 minutes
        await client.del(lookupAttemptsKey); // Clear attempts after blocking
        return SendResponse(res, "error", "Too many invalid attempts. You are blocked for 10 minutes.");
      }



      return SendResponse(res, "error", "Phone number not found. Please enter a correct number.");
    }

    // Generate new OTP to overwrite old one
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();


    let newPassword = password.toString();
    let hashedPassword = await bcrypt.hash(newPassword, 10);
    let passwordShow = "******";

    let updateArray = {
      otp: newOtp,
      passwordShow: passwordShow,
      password: hashedPassword,
      jwtToken: "",
    }

    let update = await UserModel.updateOne({ userId: userData._id }, updateArray);

    console.log(update, "update")

    return SendResponse(res, "success", "password updated successfully");
  } catch (error) {
    console.error("Error in getUserDataByMobile:", error.message);
    return SendResponse(res, "error", "Internal server error");
  }
};


const getTurnOverAndWithdrawAmountData = async (req, res) => {
  ``
  let bodyData = req.body;
  const loginData = req.loggedInUser;
  let allowWithdrawAmount = await checkWithdrawlAmount(loginData.userId, true);
  return SendResponse(res, "success", "password updated successfully", allowWithdrawAmount);
}


const assignClientToAgent = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  if (!loggedUserData || !["owner", "subowner"].includes(loggedUserData.userType)) {
    return SendResponse(res, "error", "Only owner or subowner is authorised to assign clients");
  }


  let clientId = bodyData.userId
  let assignAgentId = bodyData.assignAgentId


  let whereObj = await whereHelper(loggedUserData, {
    agentId: new ObjectId(assignAgentId)
  })


  let asignAgentData = await UserModel.findOne(whereObj)

  if (!asignAgentData) {
    return SendResponse(res, "error", "this agent not found under you");
  }

  let clientWhere = {
    userId: new ObjectId(clientId)
  }

  let clientExists = await UserModel.countDocuments(clientWhere)

  if (clientExists == 0) {
    return SendResponse(res, "error", "no client found");
  }


  let agentShareModel = await ShareModel.findOne({
    userId: asignAgentData._id
  })




  let updateObj = {
    agentId: asignAgentData._id
  }


  await UserModel.updateOne(clientWhere, updateObj)

  await ShareModel.updateOne(clientWhere, {
    creatorId: asignAgentData._id,
    creatorName: asignAgentData.name,
    agentId: asignAgentData._id,
    agentMatchShare: agentShareModel.agentMatchShare,
    agentCasinoShare: agentShareModel.agentCasinoShare,
    agentMatkaShare: agentShareModel.agentMatkaShare,
    agentIntCasinoShare: agentShareModel.agentIntCasinoShare,
    agentCommissionType: agentShareModel.agentCommissionType,
    agentMatchCommission: agentShareModel.agentMatchCommission,
    agentCasinoCommission: agentShareModel.agentCasinoCommission,
    agentMatkaCommission: agentShareModel.agentMatkaCommission,
  })



}

const doOddsRollbackDecision = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  const userId = loggedUserData.userId;
  const userType = loggedUserData.userType;

  if (!loggedUserData || !["owner"].includes(loggedUserData.userType)) {
    return SendResponse(res, "error", "Only owner  is authorised to rollback Decision");
  }
}


const getBankDetailsFromRolexpanel = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    let userId = loginData.userId;

    let allUserBankDetails = await AccountDetailsModel.find({
      userId: new ObjectId(userId)
    })


    _d(allUserBankDetails, "allUserBankDetails")
    if (res) {
      return SendResponse(res, "success", `data fetched`, allUserBankDetails);
    } else {
      return allUserBankDetails
    }

  } catch (e) {
    console.log(e.message);
  }
};


const accountTypeCrud = async (req, res) => {
  try {
    const bodyData = req.body;
    if (bodyData.accountTypeId) {
      let checkcateogeoryName = await accountTypeModel.findOne({
        _id: new ObjectId(bodyData.accountTypeId)
      })
      if (!checkcateogeoryName) {
        return SendResponse(
          res,
          "error",
          "cateogeory not found"
        );
      }
    }

    let updateCateogeory = await accountTypeModel.updateMany({
      accountTypeName: bodyData.accountTypeName
    }, bodyData, {
      upsert: true
    })

    await client.del(`accountTypes`)
    return SendResponse(
      res,
      "success",
      "account cateogary updated successfully",
    );
  } catch (e) {
    console.log(`update error in cateogeoryCrud`, e)
  }
}

const getAccountType = async (req, res) => {
  try {
    const bodyData = req.body;
    let accountTypesData = await client.get(`accountTypes`)
    if (!accountTypesData) {
      accountTypesData = await accountTypeModel.find()
      await client.set("accountTypes", JSON.stringify(accountTypesData))
    } else {
      accountTypesData = JSON.parse(accountTypesData)
    }
    return SendResponse(
      res,
      "success",
      "",
      accountTypesData
    );
  } catch (e) {
    console.log(`getAccountType error in getAccountType`, e)
  }
}


const accountDetailsForClient = async (req, res) => {
  try {
    let bodyData = req.body
    const loginData = req.loggedInUser;
    let userId = loginData.userId;
    let agentId = await client.get(`agentId_${userId}`);
    if (!agentId || agentId == null) {
      agentId = await UserModel.findOne(
        { _id: new ObjectId(userId) },
        { agentId: 1 }
      );
      agentId = agentId.agentId;
      await client.set(`agentId_${userId}`, agentId + "");
    }

    let accountDetailsByAgentId = await client.get(`accountDetailsNew_${agentId + ""}`)

    if (!accountDetailsByAgentId) {
      let allUserBankDetails = await AccountDetailsModel.find({
        agentId: new ObjectId(agentId)
      })
      if (allUserBankDetails) {
        accountDetailsByAgentId = allUserBankDetails
        await client.set(`accountDetailsNew_${agentId + ""}`, JSON.stringify(accountDetailsByAgentId))
      }
    } else {
      accountDetailsByAgentId = JSON.parse(accountDetailsByAgentId)
    }


    _dx(accountDetailsByAgentId, "accountDetailsByAgentId")
    if (res) {
      return SendResponse(res, "success", `data fetched`, accountDetailsByAgentId);
    } else {
      return accountDetailsByAgentId
    }

  } catch (e) {
    console.log(e.message);
  }
};

const getContactDetailsByCreatorId = async (req, res) => {
  try {
    const loginData = req.loggedInUser;
    if (loginData.userType != "client") {
      return SendResponse(
        res,
        "error",
        "only client can access this request"
      );
    }
    let creatorId = loginData.creatorId;
    let contactDetails = await client.get(`contactDetailsByCreatorId_${creatorId}`)
    if (!contactDetails) {
      contactDetails = await AccountModel.findOne({
        userId: new ObjectId(creatorId)
      }, {
        whatsappNumber: 1,
        helplineNumber: 1,
      })
      await client.set(`contactDetailsByCreatorId_${creatorId}`, JSON.stringify(contactDetails))
    } else {
      contactDetails = JSON.parse(contactDetails)
    }
    return SendResponse(
      res,
      "success",
      "",
      contactDetails
    );
  } catch (e) {
    console.log(e.message);
  }
};

const forgetPassword = async (req, res) => {
  try {

    const bodyData = req.body;
    if (!bodyData.mobileNo) {
      return SendResponse(
        res,
        "error",
        "mobileNo is required",
      );
    }
    let username = bodyData.mobileNo
    let otp = bodyData.otp
    let query = {
      $or: [
        { mobile: username },
      ],
    };

    query = {
      $and: [{ userType: "client" }, query],
    };

    query.status = 1
    let userData = await UserModel.findOne(query, {
      checkUsername: 1,
      mobile: 1,
      name: 1,
    })

    if (!userData) {
      return SendResponse(
        res,
        "error",
        "user not found",
      );
    }
    if (!userData.mobile) {
      return SendResponse(
        res,
        "error",
        "mobile no not exists",
      );
    }


    const clientOtp = await client.get(`otp:value:${username}`);

    if (!clientOtp) {
      return SendResponse(
        res,
        "error",
        "otp not found for mobile No " + username,
      );
    }

    if (otp != clientOtp) {
      return SendResponse(
        res,
        "error",
        "otp not matched please insert correct otp",
      );
    }


    let newPassword = bodyData.password + ""

    let hashedPassword = await bcrypt.hash(newPassword, 10);

    let queryObj = {
      password: hashedPassword,
      showPassword: "******",
    };

    let userUpdateRes = await UserModel.where("_id", userData._id).updateOne({
      $set: queryObj,
    });


    return SendResponse(
      res,
      "success",
      "password updated successfully changed",
    );
  } catch (e) {
    console.log(e.message);
  }
}


const countPlayCountBymarketId = async (req, res) => {
  try {
    const { marketId } = req.body;
    const pipeline = [];
    if (marketId) {
      pipeline.push({
        $match: { marketId: marketId },
      });
    }
    pipeline.push(
      {
        $group: {
          _id: {
            userId: "$userId",
            marketId: "$marketId",
          },
          count: { $sum: 1 },
          allIds: { $push: "$_id" },
          userInfo: { $first: "$userInfo" },
        },
      },
      {
        $match: {
          count: { $gt: 1 }, // only duplicates
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id.userId",
          marketId: "$_id.marketId",
          totalCount: "$count",
          userInfo: 1,
          duplicateIds: {
            $slice: ["$allIds", 1, { $subtract: ["$count", 1] }],
          },
        },
      }
    );
    const resData = await PlayModel.aggregate(pipeline);
    const duplicateIds = resData.flatMap(item => item.duplicateIds);
    if (duplicateIds.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No duplicates found",
        deletedCount: 0
      });
    }
    let deleteResult = {}
     deleteResult = await PlayModel.deleteMany({
      _id: { $in: duplicateIds }
    });
    return SendResponse(
      res,
      "success",
      resData,
      deleteResult,
    );

  } catch (error) {
    console.error("countPlayCountBymarketId error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};


const sameBetsAtSameTime = async (req, res) => {  
  try {
    const { marketId } = req.body;

    if (!marketId) {
      return res.status(400).json({
        status: false,
        message: "marketId is required",
      });
    }

   const resData = await oddsBetsModel.aggregate([
  {
    $match: {
      marketId: marketId,
    },
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        marketId: "$marketId",
        createdAt: "$createdAt",
      },
      userCount: { $sum: 1 },
      allIds: { $push: "$_id" },
      userInfo: { $first: "$userInfo" },
    },
  },
  {
    $match: {
      userCount: { $gt: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      userId: "$_id.userId",
      marketId: "$_id.marketId",
      createdAt: "$_id.createdAt",
      userCount: 1,
      userInfo: 1,
      duplicateIds: {
        $slice: ["$allIds", 1, { $subtract: ["$userCount", 1] }],
      },
    },
  },
   ]);
    
    
  return SendResponse(
    res,
    "success",
    "Duplicate bets found",
    resData
  );




  } catch (error) {
    console.error("sameBetsAtSameTime error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }

  
};  


const removeDuplicateUsersAndGetReport = async (req,res) => {
  try {
    let bodyData = req.body;
    if(!bodyData.userType){
      return SendResponse(res, "error", "userType is required");
    }
    const userType = bodyData.userType;
    const duplicates = await UserModel.aggregate([
      {
        $match: {
          userType: userType   // 👈 filter early (IMPORTANT)
        }
      },
      {
        $group: {
          _id: "$username",
          count: { $sum: 1 },
          docs: { $push: "$$ROOT" }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    let deleteIds = [];
    let duplicateReport = [];

    for (const item of duplicates) {
      const username = item._id;

      // status = 0 wale nikal lo
      const statusZeroDocs = item.docs.filter(d => d.status === 0);

      deleteIds.push(...statusZeroDocs.map(d => d._id));

      duplicateReport.push({
        username: username,
        totalCount: item.count,
        deleteCount: statusZeroDocs.length
      });
    }

    let deletedCount = 0;

    // OPTIONAL DELETE
    // if (deleteIds.length > 0) {
    //   const result = await UserModel.deleteMany({
    //     _id: { $in: deleteIds }
    //   });
    //   deletedCount = result.deletedCount;
    // }

    return {
      success: true,
      totalDuplicateUsernames: duplicateReport.length,
      totalDeletedRecords: deletedCount,
      duplicates: duplicateReport
    };

  } catch (error) {
    console.error("Error:", error);

    return {
      success: false,
      message: "Something went wrong",
      error: error.message
    };
  }
};


// ===================== Fancy Cateogeory CRUD =====================

const FancyCateogeoryModel = require("../../Models/BetsList/FancyCateogeory.model");
const FancyCateogeoryAuditModel = require("../../Models/BetsList/FancyCateogeoryAudit.model");

const FANCY_CATEOGEORY_REDIS_KEY = "fancyCateogeory";

// // Fix old records + seed default categories
// (async () => {
//   try {
//     await FancyCateogeoryModel.collection.updateMany(
//       { $or: [{ commission: { $type: "number" } }, { commission: { $exists: false } }] },
//       { $set: { commission: "allow" } }
//     );
//     console.log("FancyCateogeory: fixed old commission values to 'allow'");

//     // Seed default cricket fancy categories if empty
//     let count = await FancyCateogeoryModel.countDocuments();
//     if (count === 0) {
//       let defaults = [
//         { cateogeryName: "Session Runs", cateogeryType: ["session", "cricket"], maximumAmount: 25000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#3b82f6", icon: "cricket", status: true },
//         { cateogeryName: "Over Runs", cateogeryType: ["over", "session", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#10b981", icon: "cricket", status: true },
//         { cateogeryName: "Ball By Ball", cateogeryType: ["ball by ball", "cricket"], maximumAmount: 5000, minimumAmount: 100, betDelay: 0, commission: "allow", permission: "allow", color: "#f59e0b", icon: "cricket", status: true },
//         { cateogeryName: "Player Runs", cateogeryType: ["player", "runs", "cricket"], maximumAmount: 25000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#8b5cf6", icon: "player", status: true },
//         { cateogeryName: "Partnership Runs", cateogeryType: ["partnership", "cricket"], maximumAmount: 20000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#06b6d4", icon: "cricket", status: true },
//         { cateogeryName: "Total Match Runs", cateogeryType: ["match", "runs", "cricket"], maximumAmount: 50000, minimumAmount: 500, betDelay: 3, commission: "allow", permission: "allow", color: "#ef4444", icon: "match", status: true },
//         { cateogeryName: "Lambi Runs", cateogeryType: ["lambi", "runs", "cricket"], maximumAmount: 50000, minimumAmount: 500, betDelay: 3, commission: "allow", permission: "allow", color: "#e11d48", icon: "cricket", status: true },
//         { cateogeryName: "Total Boundaries", cateogeryType: ["boundaries", "cricket"], maximumAmount: 15000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#22c55e", icon: "boundaries", status: true },
//         { cateogeryName: "Total Sixes", cateogeryType: ["boundaries", "sixes", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#a855f7", icon: "boundaries", status: true },
//         { cateogeryName: "Total Fours", cateogeryType: ["boundaries", "fours", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#14b8a6", icon: "boundaries", status: true },
//         { cateogeryName: "Total Wickets", cateogeryType: ["wickets", "cricket"], maximumAmount: 15000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#f97316", icon: "wickets", status: true },
//         { cateogeryName: "Fall Of Wicket", cateogeryType: ["wickets", "fall of wicket", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#ec4899", icon: "wickets", status: true },
//         { cateogeryName: "Total Extras", cateogeryType: ["extras", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#84cc16", icon: "extras", status: true },
//         { cateogeryName: "Total Wides", cateogeryType: ["extras", "wides", "cricket"], maximumAmount: 5000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#0ea5e9", icon: "extras", status: true },
//         { cateogeryName: "Top Batsman", cateogeryType: ["player", "top batsman", "cricket"], maximumAmount: 25000, minimumAmount: 100, betDelay: 3, commission: "allow", permission: "allow", color: "#6366f1", icon: "player", status: true },
//         { cateogeryName: "Top Bowler", cateogeryType: ["player", "top bowler", "cricket"], maximumAmount: 25000, minimumAmount: 100, betDelay: 3, commission: "allow", permission: "allow", color: "#7c3aed", icon: "player", status: true },
//         { cateogeryName: "Player Boundaries", cateogeryType: ["player", "boundaries", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#059669", icon: "player", status: true },
//         { cateogeryName: "Innings Runs", cateogeryType: ["innings", "runs", "cricket"], maximumAmount: 50000, minimumAmount: 500, betDelay: 3, commission: "allow", permission: "allow", color: "#dc2626", icon: "cricket", status: true },
//         { cateogeryName: "Run Rate", cateogeryType: ["run rate", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "disallow", permission: "allow", color: "#d97706", icon: "cricket", status: true },
//         { cateogeryName: "Dot Balls", cateogeryType: ["dot balls", "cricket"], maximumAmount: 5000, minimumAmount: 100, betDelay: 2, commission: "disallow", permission: "allow", color: "#64748b", icon: "cricket", status: true },
//         { cateogeryName: "Highest Over Runs", cateogeryType: ["over", "highest", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#fb923c", icon: "cricket", status: true },
//         { cateogeryName: "Caught Out", cateogeryType: ["wickets", "caught", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#c026d3", icon: "wickets", status: true },
//         { cateogeryName: "Bowled", cateogeryType: ["wickets", "bowled", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#9333ea", icon: "wickets", status: true },
//         { cateogeryName: "LBW", cateogeryType: ["wickets", "lbw", "cricket"], maximumAmount: 10000, minimumAmount: 100, betDelay: 2, commission: "allow", permission: "allow", color: "#4f46e5", icon: "wickets", status: true },
//         { cateogeryName: "Toss Winner", cateogeryType: ["toss", "cricket"], maximumAmount: 50000, minimumAmount: 100, betDelay: 0, commission: "disallow", permission: "allow", color: "#eab308", icon: "match", status: true },
//       ];
//       await FancyCateogeoryModel.insertMany(defaults);
//       console.log("FancyCateogeory: seeded", defaults.length, "default cricket categories");
//     }
//   } catch (e) {
//     console.log("FancyCateogeory migration/seed skip:", e.message);
//   }
// })();

const saveFancyCateogeoryInRedis = async () => {
  let allList = await FancyCateogeoryModel.find().sort({ createdAt: -1 });
  let activeList = allList.filter(c => c.status === true);
  await client.set(FANCY_CATEOGEORY_REDIS_KEY, JSON.stringify(activeList));

  // Build lookup for bet validation: allow/disallow arrays with word-level data
  let allow = [];
  let disallow = [];
  let wordMap = {}; // track best match per word (highest maxAmount wins)

  allList.forEach(cat => {
    if (!cat.cateogeryType || cat.cateogeryType.length === 0) return;

    cat.cateogeryType.forEach(word => {
      let w = word.toLowerCase().trim();
      if (!w) return;

      let entry = {
        word: w,
        cateogeryName: cat.cateogeryName,
        maximumAmount: cat.maximumAmount || 0,
        minimumAmount: cat.minimumAmount || 100,
        betDelay: cat.betDelay || 0,
        commission: cat.commission || "allow",
        permission: cat.permission || "allow",
        status: cat.status,
      };

      // If category is inactive or permission is disallow -> disallow
      let isAllowed = cat.status === true && cat.permission === "allow";

      // If same word appears in multiple categories, use the one with highest maxAmount
      if (!wordMap[w] || cat.maximumAmount > (wordMap[w].maximumAmount || 0)) {
        wordMap[w] = { ...entry, isAllowed };
      }
    });
  });

  Object.values(wordMap).forEach(item => {
    let obj = {
      word: item.word,
      cateogeryName: item.cateogeryName,
      maximumAmount: item.maximumAmount,
      minimumAmount: item.minimumAmount,
      betDelay: item.betDelay,
      commission: item.commission,
    };
    if (item.isAllowed) {
      allow.push(obj);
    } else {
      disallow.push(obj);
    }
  });

  let lookup = { allow, disallow };
  await client.set("fancyCateogeoryLookup", JSON.stringify(lookup));

  return activeList;
};

const logFancyCateogeoryAudit = async (cateogeoryId, action, req, previousData, newData, description) => {
  try {
    let loggedUser = req.loggedInUser || {};
    await FancyCateogeoryAuditModel.create({
      fancyCateogeoryId: cateogeoryId,
      action,
      changedBy: loggedUser.username || "system",
      changedByUserId: loggedUser.userId || null,
      previousData,
      newData,
      description,
    });
  } catch (e) {
    console.log("Error logging FancyCateogeory audit:", e);
  }
};

const createFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData.cateogeryName || !bodyData.cateogeryType || !bodyData.maximumAmount) {
      return SendResponse(res, "error", "cateogeryName, cateogeryType and maximumAmount are required");
    }

    let existing = await FancyCateogeoryModel.findOne({ cateogeryName: bodyData.cateogeryName });
    if (existing) {
      return SendResponse(res, "error", "Fancy cateogeory with this name already exists");
    }

    let createData = {
      cateogeryName: bodyData.cateogeryName,
      cateogeryType: bodyData.cateogeryType,
      maximumAmount: bodyData.maximumAmount,
      minimumAmount: bodyData.minimumAmount || 100,
      betDelay: bodyData.betDelay || 0,
      commission: bodyData.commission || "allow",
      color: bodyData.color || "#6366f1",
      icon: bodyData.icon || "",
      permission: bodyData.permission || "allow",
      status: bodyData.status !== undefined ? bodyData.status : true,
    };

    let newCateogeory = await FancyCateogeoryModel.create(createData);

    await logFancyCateogeoryAudit(newCateogeory._id, "create", req, {}, createData, `Created category: ${bodyData.cateogeryName}`);
    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", "Fancy cateogeory created successfully", newCateogeory);
  } catch (e) {
    console.log("Error in createFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

const updateFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData._id) {
      return SendResponse(res, "error", "_id is required");
    }

    let existing = await FancyCateogeoryModel.findById(bodyData._id);
    if (!existing) {
      return SendResponse(res, "error", "Fancy cateogeory not found");
    }

    let previousData = existing.toJSON();

    let updateData = {};
    if (bodyData.cateogeryName) updateData.cateogeryName = bodyData.cateogeryName;
    if (bodyData.cateogeryType) updateData.cateogeryType = bodyData.cateogeryType;
    if (bodyData.maximumAmount !== undefined) updateData.maximumAmount = bodyData.maximumAmount;
    if (bodyData.minimumAmount !== undefined) updateData.minimumAmount = bodyData.minimumAmount;
    if (bodyData.betDelay !== undefined) updateData.betDelay = bodyData.betDelay;
    if (bodyData.commission !== undefined) updateData.commission = bodyData.commission;
    if (bodyData.color !== undefined) updateData.color = bodyData.color;
    if (bodyData.icon !== undefined) updateData.icon = bodyData.icon;
    if (bodyData.permission) updateData.permission = bodyData.permission;
    if (bodyData.status !== undefined) updateData.status = bodyData.status;

    let updated = await FancyCateogeoryModel.findByIdAndUpdate(bodyData._id, updateData, { new: true });

    await logFancyCateogeoryAudit(bodyData._id, "update", req, previousData, updateData, `Updated category: ${existing.cateogeryName}`);
    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", "Fancy cateogeory updated successfully", updated);
  } catch (e) {
    console.log("Error in updateFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

const deleteFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData._id) {
      return SendResponse(res, "error", "_id is required");
    }

    let existing = await FancyCateogeoryModel.findById(bodyData._id);
    if (!existing) {
      return SendResponse(res, "error", "Fancy cateogeory not found");
    }

    let previousData = existing.toJSON();
    await FancyCateogeoryModel.findByIdAndDelete(bodyData._id);

    await logFancyCateogeoryAudit(bodyData._id, "delete", req, previousData, {}, `Deleted category: ${existing.cateogeryName}`);
    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", "Fancy cateogeory deleted successfully", previousData);
  } catch (e) {
    console.log("Error in deleteFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

const getFancyCateogeoryList = async (req, res) => {
  try {
    const bodyData = req.body;

    // If requesting only active categories with no other filters, try Redis first
    let hasFilters = bodyData.permission || bodyData.cateogeryName || bodyData.status !== undefined;
    if (!hasFilters || (bodyData.status === true && !bodyData.permission && !bodyData.cateogeryName)) {
      let redisData = await client.get(FANCY_CATEOGEORY_REDIS_KEY);
      if (redisData && redisData !== null) {
        let parsed = JSON.parse(redisData);
        if (bodyData.status === true && !bodyData.permission && !bodyData.cateogeryName) {
          return SendResponse(res, "success", "Fancy cateogeory list", parsed);
        }
      }
    }

    let where = {};
    if (bodyData.status !== undefined) where.status = bodyData.status;
    if (bodyData.permission) where.permission = bodyData.permission;
    if (bodyData.cateogeryName) where.cateogeryName = { $regex: bodyData.cateogeryName, $options: "i" };

    let list = await FancyCateogeoryModel.find(where).sort({ createdAt: -1 });

    // If fetching all or active, refresh Redis cache
    if (!bodyData.status || bodyData.status === true) {
      await saveFancyCateogeoryInRedis();
    }

    return SendResponse(res, "success", "Fancy cateogeory list", list);
  } catch (e) {
    console.log("Error in getFancyCateogeoryList:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

const updateFancyCateogeoryStatus = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData._id) {
      return SendResponse(res, "error", "_id is required");
    }

    let existing = await FancyCateogeoryModel.findById(bodyData._id);
    if (!existing) {
      return SendResponse(res, "error", "Fancy cateogeory not found");
    }

    let previousData = existing.toJSON();
    let newStatus = bodyData.status !== undefined ? bodyData.status : !existing.status;
    let newPermission = bodyData.permission || existing.permission;

    let updated = await FancyCateogeoryModel.findByIdAndUpdate(
      bodyData._id,
      { status: newStatus, permission: newPermission },
      { new: true }
    );

    let action = bodyData.permission ? "permissionChange" : "statusChange";
    await logFancyCateogeoryAudit(bodyData._id, action, req, previousData, { status: newStatus, permission: newPermission }, `${action}: ${existing.cateogeryName}`);
    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", "Fancy cateogeory status updated", updated);
  } catch (e) {
    console.log("Error in updateFancyCateogeoryStatus:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

// Bulk update - status, permission, maximumAmount, minimumAmount
const bulkUpdateFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData.ids || !Array.isArray(bodyData.ids) || bodyData.ids.length === 0) {
      return SendResponse(res, "error", "ids array is required");
    }

    let updateData = {};
    if (bodyData.status !== undefined) updateData.status = bodyData.status;
    if (bodyData.permission) updateData.permission = bodyData.permission;
    if (bodyData.maximumAmount !== undefined) updateData.maximumAmount = bodyData.maximumAmount;
    if (bodyData.minimumAmount !== undefined) updateData.minimumAmount = bodyData.minimumAmount;
    if (bodyData.betDelay !== undefined) updateData.betDelay = bodyData.betDelay;
    if (bodyData.commission !== undefined) updateData.commission = bodyData.commission;

    if (Object.keys(updateData).length === 0) {
      return SendResponse(res, "error", "No update fields provided");
    }

    let objectIds = bodyData.ids.map(id => new ObjectId(id));

    let result = await FancyCateogeoryModel.updateMany(
      { _id: { $in: objectIds } },
      { $set: updateData }
    );

    // Log audit for bulk
    let loggedUser = req.loggedInUser || {};
    await FancyCateogeoryAuditModel.create({
      fancyCateogeoryId: objectIds[0],
      action: "bulkUpdate",
      changedBy: loggedUser.username || "system",
      changedByUserId: loggedUser.userId || null,
      previousData: { ids: bodyData.ids },
      newData: updateData,
      description: `Bulk updated ${bodyData.ids.length} categories`,
    });

    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", `${result.modifiedCount} categories updated successfully`, result);
  } catch (e) {
    console.log("Error in bulkUpdateFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

// Export CSV
const exportFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;
    let where = {};
    if (bodyData.status !== undefined) where.status = bodyData.status;
    if (bodyData.permission) where.permission = bodyData.permission;

    let list = await FancyCateogeoryModel.find(where).sort({ createdAt: -1 });

    let csvHeader = "Name,Types,Min Amount,Max Amount,Bet Delay(s),Commission,Permission,Status,Color,Created At\n";
    let csvRows = list.map(item => {
      return [
        `"${item.cateogeryName || ""}"`,
        `"${(item.cateogeryType || []).join(', ')}"`,
        item.minimumAmount || 0,
        item.maximumAmount || 0,
        item.betDelay || 0,
        item.commission || "allow",
        item.permission || "allow",
        item.status ? "Active" : "Inactive",
        `"${item.color || ""}"`,
        `"${item.createdAt ? new Date(item.createdAt).toLocaleString("en-IN") : ""}"`,
      ].join(",");
    }).join("\n");

    return SendResponse(res, "success", "Export data", { csv: csvHeader + csvRows, count: list.length });
  } catch (e) {
    console.log("Error in exportFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

// Import CSV
const importFancyCateogeory = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData.csvData || !Array.isArray(bodyData.csvData) || bodyData.csvData.length === 0) {
      return SendResponse(res, "error", "csvData array is required");
    }

    let created = 0;
    let skipped = 0;
    let errors = [];

    for (let i = 0; i < bodyData.csvData.length; i++) {
      let row = bodyData.csvData[i];
      try {
        if (!row.cateogeryName || !row.cateogeryName.trim()) {
          skipped++;
          errors.push(`Row ${i + 1}: name missing`);
          continue;
        }

        let types = [];
        if (row.cateogeryType) {
          if (Array.isArray(row.cateogeryType)) {
            types = row.cateogeryType;
          } else {
            types = row.cateogeryType.split(",").map(t => t.trim()).filter(t => t);
          }
        }

        let maxAmt = Number(row.maximumAmount) || 1000;
        if (maxAmt < 100) maxAmt = 100;
        if (maxAmt > 50000) maxAmt = 50000;

        let minAmt = Number(row.minimumAmount) || 100;
        if (minAmt < 1) minAmt = 1;

        let betDelay = Number(row.betDelay) || 0;
        if (betDelay < 0) betDelay = 0;
        if (betDelay > 30) betDelay = 30;

        let commission = row.commission;
        if (commission !== "allow" && commission !== "disallow") commission = "allow";

        let permission = row.permission;
        if (permission !== "allow" && permission !== "disallow") permission = "allow";

        let status = true;
        if (row.status === false || row.status === "Inactive" || row.status === "false") status = false;

        let doc = await FancyCateogeoryModel.findOneAndUpdate(
          { cateogeryName: row.cateogeryName.trim() },
          {
            cateogeryName: row.cateogeryName.trim(),
            cateogeryType: types,
            maximumAmount: maxAmt,
            minimumAmount: minAmt,
            betDelay: betDelay,
            commission: commission,
            color: row.color || "#6366f1",
            icon: row.icon || "",
            permission: permission,
            status: status,
          },
          { upsert: true, new: true }
        );

        created++;
      } catch (rowErr) {
        skipped++;
        errors.push(`Row ${i + 1}: ${rowErr.message}`);
      }
    }

    let loggedUser = req.loggedInUser || {};
    await FancyCateogeoryAuditModel.create({
      fancyCateogeoryId: new ObjectId(),
      action: "bulkUpdate",
      changedBy: loggedUser.username || "system",
      changedByUserId: loggedUser.userId || null,
      previousData: {},
      newData: { totalRows: bodyData.csvData.length, created, skipped },
      description: `CSV Import: ${created} created/updated, ${skipped} skipped`,
    });

    await saveFancyCateogeoryInRedis();

    return SendResponse(res, "success", `Imported ${created} categories, ${skipped} skipped`, { created, skipped, errors });
  } catch (e) {
    console.log("Error in importFancyCateogeory:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

// Audit log
const getFancyCateogeoryAuditLog = async (req, res) => {
  try {
    const bodyData = req.body;
    let where = {};

    if (bodyData.fancyCateogeoryId) where.fancyCateogeoryId = new ObjectId(bodyData.fancyCateogeoryId);
    if (bodyData.action) where.action = bodyData.action;
    if (bodyData.changedBy) where.changedBy = { $regex: bodyData.changedBy, $options: "i" };

    let limit = bodyData.limit || 100;
    let skip = bodyData.skip || 0;

    let [logs, total] = await Promise.all([
      FancyCateogeoryAuditModel.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
      FancyCateogeoryAuditModel.countDocuments(where),
    ]);

    return SendResponse(res, "success", "Audit log", { logs, total });
  } catch (e) {
    console.log("Error in getFancyCateogeoryAuditLog:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};

// Validate multiple fancy names at once - for frontend bulk check
const validateMultipleFancy = async (req, res) => {
  try {
    const bodyData = req.body;

    if (!bodyData.fancies || !Array.isArray(bodyData.fancies) || bodyData.fancies.length === 0) {
      return SendResponse(res, "error", "fancies array is required. Send [{ name: 'fancy name', selectionId?: '123' }, ...]");
    }

    // Get lookup from Redis first, fallback to rebuild
    let lookupStr = await client.get("fancyCateogeoryLookup");
    if (!lookupStr) {
      await saveFancyCateogeoryInRedis();
      lookupStr = await client.get("fancyCateogeoryLookup");
    }

    let lookup = JSON.parse(lookupStr);
    let allowWords = lookup.allow || [];
    let disallowWords = lookup.disallow || [];

    let results = bodyData.fancies.map(fancy => {
      let fancyName = (fancy.name || "").toLowerCase().trim();
      if (!fancyName) {
        return {
          name: fancy.name || "",
          selectionId: fancy.selectionId || "",
          allowed: false,
          reason: "empty name",
          matchedAllow: [],
          matchedDisallow: [],
          maximumAmount: 0,
          minimumAmount: 0,
          betDelay: 0,
          commission: "disallow",
        };
      }

      // Find all matching allow words
      let matchedAllow = allowWords.filter(item => fancyName.includes(item.word));
      // Find all matching disallow words
      let matchedDisallow = disallowWords.filter(item => fancyName.includes(item.word));

      // If any disallow word matched -> blocked
      if (matchedDisallow.length > 0) {
        return {
          name: fancy.name,
          selectionId: fancy.selectionId || "",
          allowed: false,
          reason: "disallowed word found: " + matchedDisallow.map(m => m.word).join(", "),
          matchedAllow: matchedAllow.map(m => ({ word: m.word, cateogeryName: m.cateogeryName })),
          matchedDisallow: matchedDisallow.map(m => ({ word: m.word, cateogeryName: m.cateogeryName, maximumAmount: m.maximumAmount })),
          maximumAmount: 0,
          minimumAmount: 0,
          betDelay: 0,
          commission: "disallow",
        };
      }

      // If allow words matched -> allowed with limits
      if (matchedAllow.length > 0) {
        let maxAmount = Math.max(...matchedAllow.map(m => m.maximumAmount));
        let minAmount = Math.min(...matchedAllow.map(m => m.minimumAmount));
        let maxDelay = Math.max(...matchedAllow.map(m => m.betDelay));
        let hasCommission = matchedAllow.some(m => m.commission === "allow");

        return {
          name: fancy.name,
          selectionId: fancy.selectionId || "",
          allowed: true,
          reason: "matched: " + matchedAllow.map(m => m.word).join(", "),
          matchedAllow: matchedAllow.map(m => ({ word: m.word, cateogeryName: m.cateogeryName, maximumAmount: m.maximumAmount })),
          matchedDisallow: [],
          maximumAmount: maxAmount,
          minimumAmount: minAmount,
          betDelay: maxDelay,
          commission: hasCommission ? "allow" : "disallow",
        };
      }

      // No match found - unmatched fancy
      return {
        name: fancy.name,
        selectionId: fancy.selectionId || "",
        allowed: true,
        reason: "no category match - default allow",
        matchedAllow: [],
        matchedDisallow: [],
        maximumAmount: 0,
        minimumAmount: 0,
        betDelay: 0,
        commission: "allow",
      };
    });

    let summary = {
      total: results.length,
      allowed: results.filter(r => r.allowed).length,
      blocked: results.filter(r => !r.allowed).length,
    };

    return SendResponse(res, "success", "Fancy validation result", { results, summary });
  } catch (e) {
    console.log("Error in validateMultipleFancy:", e);
    return SendResponse(res, "error", e.message || "Something went wrong");
  }
};


const userExposureList = async (req, res) => {
  const loggedUserData = req.loggedInUser;
  let where = await whereHelper(loggedUserData, {
    exposure: { $lt: 0 },
    userType : "client"
  });
  let exposerList = await UserModel.find(where, {
    exposure: 1,
    username: 1,
    userId: 1,
    coins: 1,
    name: 1,
    totalProfitLoss: 1,
    creatorShareData:1
  });
  return SendResponse(res, "success", "", exposerList);
};

const userExposureListUpdateBulk = async (req, res) => {
  try {
    const loggedUserData = req.loggedInUser;

    const where = await whereHelper(loggedUserData, {
      exposure: { $lt: 0 },
      userType: "client",
    });

    const exposerList = await UserModel.find(
      where,
      {
        exposure: 1,
        username: 1,
        userId: 1,
        userType: 1,
        coins: 1,
        name: 1,
        totalProfitLoss: 1,
        creatorShareData: 1,
      }
    ).lean();
    await Promise.all(
      exposerList.map((user) =>
        updateCoinsTbl(user.userId, user.userType)
      )
    );
    return SendResponse(
      res,
      "Update Exposure Success",
      "",
      exposerList
    );
  } catch (error) {
    console.error("userExposureListUpdateBulk Error:", error);
    return SendResponse(
      res,
      "Something went wrong",
      error.message,
      [],
      false
    );
  }
};


module.exports = {
  createDomain,
  DomainList,
  deleteDomain,
  updateDomain,
  getDomainSetting,
  domainSettingByDomainName,
  registerClient,
  upload,
  uploadImage,
  depositReq,
  withdrawReq,
  approveDisapproveReq,
  updateAccountDetails,
  getAccountDetailsByUserId,
  getDepositWithdrawList,
  allUserTypePasswordUpdate,
  flushAllRedisKeys,
  forceLogOutAllUser,
  view,
  checkExposureClient,
  updateSetting,
  mergeLedger,
  mergeTransaction,
  hitReq,
  checkDuplicateFancy,
  insertFancyByCenterPanel,
  fancyDecisionByCenterPanel,
  matchDecisionByCenterPanel,
  checkExposuerByMarketIdForFancy,
  moveFancyToAdvance,
  fancyList,
  fileUploadToS3,
  getResults,
  saveAccountDetails,
  getBankDetailsByUserId,
  updateFancyDateInTransaction,
  getAccountDetailsOfClient,
  declareCasinoResultAgain,
  getSetting,
  getTransactionData,
  updateExposureOfUser,
  updateInternationalCasinoGamesInDatabase,
  updateInternationalCasinoListInRedis,
  getInternationalGroupCasinoList,
  getCasinoListByCateogeory,
  getCasinoListByProviderName,
  getAllCasinoInternationalList,
  updateInternationalCasinoByOperating,
  getNegativeUserDetails,
  fillNegativeCoinsToUser,
  deleteAllUserData,
  findDuplicateTransactionForDiamondcasino,
  rollBackfancyList,
  cateogeoryCrud,
  getCateogeory,
  getDuplicateResultsOfCasino,
  deleteUserData,
  missingShareDoc,
  distributeBonusToUpperline,
  checkRollbackCasinoWithTransactionAdnDeleteInCrickTransaction,
  createOwner,
  clientCoinsProfitExposure,
  upperLineLedger,
  getMlmChainList,
  getWhatsAppOtp,
  sendWhatsAppOtp,
  userPasswordChangeByMobile,
  assignClientToAgent,
  getTurnOverAndWithdrawAmountData,
  doOddsRollbackDecision,
  getBankDetailsFromRolexpanel,
  accountTypeCrud,
  getAccountType,
  accountDetailsForClient,
  getContactDetailsByCreatorId,
  forgetPassword,
  countPlayCountBymarketId,
  sameBetsAtSameTime,
  removeDuplicateUsersAndGetReport,
  createFancyCateogeory,
  updateFancyCateogeory,
  deleteFancyCateogeory,
  getFancyCateogeoryList,
  updateFancyCateogeoryStatus,
  bulkUpdateFancyCateogeory,
  exportFancyCateogeory,
  importFancyCateogeory,
  getFancyCateogeoryAuditLog,
  validateMultipleFancy,
  userExposureList,
  userExposureListUpdateBulk
};