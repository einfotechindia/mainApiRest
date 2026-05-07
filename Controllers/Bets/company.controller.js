const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { ObjectId } = require("mongodb");
var requestIp = require("request-ip");
const Joi = require("joi");
const { siteSetting } = require("../../Common/Constants");
const DomainModel = require("../../Models/Domain.model");
const {
  UserCreate,
  userDetailsByUserId,
} = require("../../Services/User/User.service");
const {
  _dx,
  whereHelper,
  _d,
  mongoToJson,
  convertKeyObject,
  dateWhereCond,
} = require("../../Helpers/CommonHelper");

const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
} = require("../../Helpers/TransactionHelper");

const registerClient = async (req, res) => {
  try {
    const bodyData = req.body;
    const JoiSchema = Joi.object({
      domainUrl: Joi.string().required(),
      mobileNo: Joi.number().required(),
      name: Joi.string().required(),
      username: Joi.string().required(),
      password: Joi.string().required(),
    }).options({ abortEarly: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    const websiteData = await DomainModel.findOne({
      domainUrl: bodyData.domainUrl,
    });

    if (!websiteData || websiteData.isDeleted || !websiteData.status) {
      return SendResponse(
        res,
        "error",
        `website not found  for domain ${bodyData.domainUrl}`
      );
    }

    if (!websiteData.isRegister) {
      return SendResponse(
        res,
        "error",
        `temporary signup is blocked by admin please try afte sometime`
      );
    }

    let assignAgentId = websiteData.assignAgentId
      ? websiteData.assignAgentId
      : "65b268f529ab5fdb1a3055c1";

    assignAgentId = new ObjectId(assignAgentId);
    if (!websiteData || !websiteData.status || !assignAgentId) {
      return SendResponse(res, "error", "Domain Not Found");
    }

    const agentData = await userDetailsByUserId(assignAgentId, {
      userId: 1,
      userType: 1,
      username: 1,
      userPriority: 1,
      name: 1,
    });
    if (!agentData || agentData.userType != "agent") {
      return SendResponse(res, "error", "Agent Not Found");
    }

    const objectData = {
      parentId: assignAgentId,
      mobile: bodyData.mobileNo,
      password: bodyData.password,
      name: bodyData.name,
      formatedUsername: bodyData.username,
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
    };

    const userRes = await UserCreate(objectData, agentData);

    return SendResponse(res, userRes.status, userRes.message);
  } catch (error) {
    return SendResponse(
      res,
      "error",
      "something went wrong in client registration"
    );
  }
};

module.exports = {
  registerClient,
};
