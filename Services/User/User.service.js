const UserModel = require("../../Models/User/User.model");
const Joi = require("joi");
var requestIp = require("request-ip");
const StatementModel = require("../../Models/Statement.model");
const ActivityModel = require("../../Models/Activity.model");
const ShareModel = require("../../Models/User/Share.model");
const AccountCoinsModel = require("../../Models/User/AccountCoins.model");
const LoginActivityModel = require("../../Models/LoginActivity.model");
const DomainModel = require("../../Models/Domain.model");
const NotificationModel = require("../../Models/Notification.model");
const LedgerModel = require("../../Models/Ledger.model");
const { InsertUserStatement } = require("../../Helpers/StatementHelper");
const InternationalCasinoBetsModel = require("../../Models/BetsList/InternationalCasinoBetsList.model");
const internationalCasinoList = require("../../Models/internationalCasinoList.model");
const qtechGamesModel = require("../../Models/qtech.model");
const profitLossPosition = require("../../Models/BetsList/profitLossPosition.model");
const OddsBetModel = require("../../Models/BetsList/OddsBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const SportsSettingModel = require("../../Models/Sports/SportsSetting.model");
const sportsConfigModel = require("../../Models/User/UserSportsConfig.model");
const crickTransactionModel = require("../../Models/crickTransaction.model");
const crypto = require("crypto");
const MlmChainListModel = require("../../Models/BtoC/mlmChainList.model");
require("dotenv").config();
const { getSocket } = require("../../socket");
//global.io = getSocket();

const {
  UserTypes,
  UserServiceErrMsg,
  CommonErrMsg,
  MaxCommissionLimit,
  geoLocationUrl,
  siteSetting,
  betChipsData,
  UserSpecificSubDomainLogin,
  onlyInrGamesAllowed,
  getInternationalGameData
} = require("../../Common/Constants");
const {
  SendResponse,
  returnResponse,
} = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { InsertUserActivity } = require("../../Helpers/StatementHelper");
const {
  UsersCode,
  isValidUser,
  isUserAuthorizedToUpdate,
  updateUserStatus,
  isValidUserData,
  userCountDetails,
  gettingDirectUserByUserId,
  userParentDetails,
  getUserIdByUsername,
  checkUserPassword,
  checkUserTransactionPassword,
  createShareDataByUserId,
  getShareChainData,
  getUpperLineAndDownlineOfUser
} = require("../../Helpers/UsersUtils");
const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
  updateCoinsTbl,
} = require("../../Helpers/TransactionHelper");


const {
  userCashCreditData
} = require("../../Services/Reports/bpexch.service");


const {
  _dx,
  _d,
  mongoToJson,
  whereHelper,
  convertKeyObjectAndSeperateid,
  parentDataAppend,
  areObjectsEqual,
  dateWhereCond,
  _date_time,
  extractSubdomainAndDomainByHost,
  throughSocketDataByAxios,
  getSettingData,
} = require("../../Helpers/CommonHelper");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");
const { isEmpty, create } = require("lodash");
const { ObjectId } = require("mongodb");
const satelize = require("satelize");
const constant = require("../../utils/constants");
const IP = require("ip");
const axios = require("axios");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const PlayModel = require("../../Models/Play.model");
// const { json } = require("body-parser");
axios.defaults.timeout = siteSetting.axiosTimeOut;

let userDetailsByUserId = async (userId, specific) => {
  return await UserModel.findOne(
    {
      _id: userId,
    },
    specific
  );
};

async function UserCreate(bodyData, loginUserData) {
  try {
    let {
      username,
      password,
      mobile,
      name,
      userType,
      status,
      matchShare,
      casinoShare,
      politicsShare,
      matkaShare,
      matchCommission,
      sessionCommission,
      commissionType,
      casinoCommission,
      matkaCommission,
      coins,
      reference,
      creditReference,
      showMatchShare,
      showCasinoShare,
      showMatkaShare,
      betStatus,
      matchStatus,
      casinoStatus,
      matkaStatus,
      selfCuttingPermission,
      transactionPassword,
      parentId,
      betMaxMinData,
      allowedDomains,
      intCasinoStatus,
      intCasinoShare,
      intCasinoExpoLimit,
      intCasinoMultiply,
      betfairCommission,
      exposureLimit,
      minMaxComm,
      isPasswordChanged,
      phpUserId
    } = bodyData;

    let settingData = await getSettingData();


    let ownUsername = false;
    if (settingData.isSystemUsername) {
      ownUsername = settingData.isSystemUsername;
    }

    if (!transactionPassword) {
      transactionPassword = password;
    }

    let isUserTypeValid = UserTypes.includes(userType);
    if (!isUserTypeValid) {
      return returnResponse("error", UserServiceErrMsg.invalidUserType);
    }

    let directUserCreate = false
    if(process.env.directUserCreate && process.env.directUserCreate == "true"){
      directUserCreate = true
    }

    let creatorId = loginUserData.userId;
    if (parentId) {
      creatorId = parentId;
    }

    const creator = await UserModel.findById(creatorId);
    if (isEmpty(creator)) {
      return returnResponse("error", UserServiceErrMsg.invalidCreatorId);
    }

    let isCreatorPermittedToCreateUser =
      UserTypes.indexOf(creator.userType) > UserTypes.indexOf(userType);

    if (creator.userType !== "owner" && !isCreatorPermittedToCreateUser) {
      return returnResponse("error", UserServiceErrMsg.notAllowedToCreateUser +  `${userType}`) ;
    }

    let validateCreatorCoins = creator.coins >= coins;
    if (!validateCreatorCoins) {
      return returnResponse("error", UserServiceErrMsg.notEnoughCoins);
    }

    
    let shareError = "";
    if (
      (matchShare && matchShare < 0) ||
      (casinoShare && casinoShare < 0) ||
      (matkaShare && matkaShare < 0)
    ) {
      return returnResponse("error", "share value  can not be negative");
    }

    if (
      (matchCommission && matchCommission < 0) ||
      (sessionCommission && sessionCommission < 0) ||
      (casinoCommission && casinoCommission < 0) ||
      (betfairCommission && betfairCommission < 0) ||
      (matkaCommission && matkaCommission < 0)
    ) {
      return returnResponse("error", "commission  value can not be negative");
    }

    if (creator.userMatchShare < matchShare) {
      shareError = `Match share can't be greater than ${creator.userType} share`;
      return returnResponse("error", shareError);
    }
    if (creator.userCasinoShare < casinoShare) {
      shareError = `Casino share can't be greater than ${creator.userType} casino share`;
      return returnResponse("error", shareError);
    }
    if (creator.userMatkaShare < matkaShare) {
      shareError = `Matka share can't be greater than ${creator.userType} share`;
      return returnResponse("error", shareError);
    }

    if (creator.userPoliticsShare < politicsShare) {
      shareError = `Politics share can't be greater than ${creator.userType} share`;
      return returnResponse("error", shareError);
    }

    if (creator.intCasinoShare < intCasinoShare) {
      shareError = `Int Casino share can't be greater than ${creator.userType} share`;
      return returnResponse("error", shareError);
    }

    if (creator.intCasinoExpoLimit < intCasinoExpoLimit) {
      shareError = `Int International Casino Exposure Limit share can't be greater than ${creator.userType} share`;
      return returnResponse("error", shareError);
    }

    let userPriority = UserTypes.indexOf(userType) + 1;
    if (userPriority < 7) {
      intCasinoMultiply = creator.intCasinoMultiply;
    }

    if (creator.intCasinoMultiply > intCasinoMultiply) {
      intCasinoMultiply = creator.intCasinoMultiply
    }

    if (!isEmpty(shareError)) {
      return returnResponse("error", shareError);
    }

    if (shareError) {
      return returnResponse("error", shareError);
    }

    let commissionError = "";
    if (matchCommission > MaxCommissionLimit.matchCommissionLimit) {
      commissionError = `Match commission can't be greater than ${MaxCommissionLimit.matchCommissionLimit}%`;
    }

    if (betfairCommission > MaxCommissionLimit.betfairCommissionLimit) {
      commissionError = `Match commission can't be greater than ${MaxCommissionLimit.betfairCommissionLimit}%`;
    }
    if (sessionCommission > MaxCommissionLimit.sessionCommissionLimit) {
      commissionError = `Casino commission can't be greater than ${MaxCommissionLimit.sessionCommissionLimit}%`;
    }
    if (casinoCommission > MaxCommissionLimit.casinoCommissionLimit) {
      commissionError = `Casino commission can't be greater than ${MaxCommissionLimit.casinoCommissionLimit}%`;
    }
    if (matkaCommission > MaxCommissionLimit.matkaCommissionLimit) {
      commissionError = `Matka commission can't be greater than ${MaxCommissionLimit.matkaCommissionLimit}%`;
    }

    if (!isEmpty(commissionError)) {
      return returnResponse("error", commissionError);
    }

    if (commissionType === "NoCommission") {
      matchCommission = 0;
      sessionCommission = 0;
    }
    if (commissionType === "OnlyOnMinus") {
      sessionCommission = matchCommission;
    }

    if (!creator.matchStatus) {
      matchStatus = false;
    }

    if (!creator.casinoStatus) {
      casinoStatus = false;
    }

    if (!creator.matkaStatus) {
      matkaStatus = false;
    }

    if (!creator.betStatus) {
      betStatus = false;
    }
    if (!creator.intCasinoStatus) {
      intCasinoStatus = false;
    }



    
    //const hashedPassword = await bcrypt.hash(password, 10);
    hashedPassword = password;
    let formattedUsername = username;


    if (ownUsername || !username) {
      const countUsertype = await UserModel.countDocuments({
        userType: userType,
      });
      formattedUsername = await UsersCode(userType, countUsertype);
      transactionPassword = password;
    }

    let transactionPasswordCheck = false;
    if (settingData.isTransactionPassword &&  settingData.isTransactionPassword== true) {
      transactionPasswordCheck = true;
    }

    if (transactionPasswordCheck) {
      const isTransactionPasswordCorrect = await checkUserTransactionPassword(
        creator.userId,
        transactionPassword,
        creator.transactionPassword
      );
      if (!isTransactionPasswordCorrect) {
        return returnResponse("error", "Transaction Password Is Wrong");
      }
    }

    if (bodyData.username) {
      formattedUsername = bodyData.username;
    }

   let  checkFormattedUsername = formattedUsername.toUpperCase()

    const checkUsername = await UserModel.countDocuments({
      checkUsername: checkFormattedUsername,
    });



    if (checkUsername > 0) {
      return returnResponse("error", `Username already Exists`);
    }

    if (!transactionPassword) {
      let transactionPassword = hashedPassword;
    } else {
      transactionPassword = await bcrypt.hash(transactionPassword, 10);
    }

    let = parentAllowedDomains = creator.allowedDomains;
    if (allowedDomains && userType === "subowner") {
      parentAllowedDomains = allowedDomains;
    }

    let creatorShareDataInsert = {
      name: creator.name,
      username: creator.username,
      userPriority: creator.userPriority,
      userType: creator.userType,
      userMatchShare: creator.userMatchShare,
      userCasinoShare: creator.userCasinoShare,
      userPoliticsShare: creator.userPoliticsShare,
      userMatkaShare: creator.userMatkaShare,
      creatorId: creator.creatorId,
      intCasinoShare: creator.intCasinoShare,
    };

    let userMinMax = creator.minMaxComm;
    let parentMinMax = creator.minMaxComm;

    if (bodyData.minMaxComm) {
      userMinMax = bodyData.minMaxComm;
      if (minMaxComm.betfair) {
        if (parentMinMax.betfair.min > userMinMax.betfair.min) {
          return returnResponse(
            "error",
            `betfair min can not be less the parent Min`
          );
        }
        if (parentMinMax.betfair.max < userMinMax.betfair.max) {
          return returnResponse(
            "error",
            `betfair max can not be greater then parent max`
          );
        }
      }
      if (minMaxComm.session) {
        if (parentMinMax.session.min > userMinMax.session.min) {
          return returnResponse(
            "error",
            `session min can not be less the parent Min`
          );
        }
        if (parentMinMax.session.max < userMinMax.session.max) {
          return returnResponse(
            "error",
            `session max can not be greater then parent max`
          );
        }
      }
    }

    let referral = `${formattedUsername}` + Math.floor(Math.random() * 900) + 100;

    if (
      settingData.isPasswordEncruption &&
      settingData.isPasswordEncruption == true
    ) {
      password = "******";
    }

    let insertUserData = {
      username: formattedUsername,
      checkUsername : checkFormattedUsername,
      password: hashedPassword,
      passwordShow: password,
      transactionPassword: transactionPassword,
      mobile,
      allowedDomains: parentAllowedDomains,
      name,
      userType,
      status,
      coins: 0,
      userPriority: userPriority,
      userMatchShare: matchShare,
      userCasinoShare: casinoShare,
      userMatkaShare: matkaShare,
      userShowMatchShare: showMatchShare,
      userShowCasinoShare: showCasinoShare,
      userShowMatkaShare: showMatkaShare,
      userCommissionType: commissionType,
      userMatchCommission: matchCommission,
      userBetfairCommission: betfairCommission,
      userSessionCommission: sessionCommission,
      userCasinoCommission: casinoCommission,
      userMatkaCommission: matkaCommission,
      ownerId: creator.ownerId,
      superAdminId: creator.subAdminId,
      adminId: creator.adminId,
      subAdminId: creator.subAdminId,
      masterId: creator.masterId,
      superAgentId: creator.superAgentId,
      agentId: creator.agentId,
      reference,
      creditReference,
      betStatus,
      matchStatus,
      casinoStatus,
      matkaStatus,
      creatorId,
      betMaxMinData,
      intCasinoStatus,
      intCasinoShare,
      // intCasinoExpoLimit,
      intCasinoMultiply,
      creatorName: `${creator.name} (${creator.username})`,
      userPoliticsShare: politicsShare,
      creatorPriority: creator.userPriority,
      creatorShareData: creatorShareDataInsert,
      exposureLimit: exposureLimit,
      minMaxComm: minMaxComm,
      referral: referral,
      isPasswordChanged : isPasswordChanged ? isPasswordChanged : false,
      phpUserId : phpUserId ? phpUserId : 0,
      isOtpRequired : creator.isOtpRequired ? creator.isOtpRequired : false
    };

    if (bodyData.isDirect) {
      insertUserData.isDirect = bodyData.isDirect;
    }

    if(bodyData.notes){
      insertUserData.notes = bodyData.notes;
    }

    let creatorShareData = await ShareModel.findOne({
      userId: creatorId,
    });



    if (!creatorShareData) {
      return returnResponse(
        "error",
        `something went wrong in creator share data`
      );
    }

   

    let creatorShareDataObj = creatorShareData.toJSON();
    
    delete creatorShareDataObj._id;
    delete creatorShareDataObj.__v;

    const user = await UserModel.create(insertUserData);

    let userUpdateData = {
      ownerId: creator.ownerId,
      subownerId: creator.subownerId,
      superadminId: creator.superadminId,
      adminId: creator.adminId,
      subadminId: creator.subadminId,
      masterId: creator.masterId,
      superagentId: creator.superagentId,
      agentId: creator.agentId,
      clientId: creator.clientId,
    };

    const userId = user._id;

    if (isEmpty(creatorShareDataObj)) {
      return returnResponse("error", UserServiceErrMsg.userShareNotFound);
    }

    creatorShareDataObj.creatorId = creator._id;
    creatorShareDataObj.userId = userId;
    creatorShareDataObj.userName = formattedUsername;
    creatorShareDataObj.creatorName = creator.username;

    creatorShareDataObj[`${userType}IntCasinoShare`] = intCasinoShare;

    if (userType == "agent") {
      agentId = userId;
      creatorShareDataObj.agentId = userId;
      creatorShareDataObj.agentMatchShare = matchShare;
      creatorShareDataObj.agentCasinoShare = casinoShare;
      creatorShareDataObj.agentMatkaShare = matkaShare;
      creatorShareDataObj.agentCommissionType = commissionType;
      creatorShareDataObj.agentMatchCommission = matchCommission;
      creatorShareDataObj.agentBetfairCommission = betfairCommission;
      creatorShareDataObj.agentSessionCommission = sessionCommission;
      creatorShareDataObj.agentCasinoCommission = casinoCommission;
      creatorShareDataObj.agentMatkaCommission = matkaCommission;
    }
    if (userType == "superagent") {
      superAgentId = userId;
      creatorShareDataObj.superagentId = userId;
      creatorShareDataObj.superagentMatchShare = matchShare;
      creatorShareDataObj.superagentCasinoShare = casinoShare;
      creatorShareDataObj.superagentMatkaShare = matkaShare;
      creatorShareDataObj.superagentCommissionType = commissionType;
      creatorShareDataObj.superagentMatchCommission = matchCommission;
      creatorShareDataObj.superagentBetfairCommission = betfairCommission;
      creatorShareDataObj.superagentSessionCommission = sessionCommission;
      creatorShareDataObj.superagentCasinoCommission = casinoCommission;
      creatorShareDataObj.superagentMatkaCommission = matkaCommission;
    }
    if (userType == "master") {
      masterId = userId;
      creatorShareDataObj.masterId = userId;
      creatorShareDataObj.masterMatchShare = matchShare;
      creatorShareDataObj.masterCasinoShare = casinoShare;
      creatorShareDataObj.masterMatkaShare = matkaShare;
      creatorShareDataObj.masterCommissionType = commissionType;
      creatorShareDataObj.masterMatchCommission = matchCommission;
      creatorShareDataObj.masterBetfairCommission = betfairCommission;
      creatorShareDataObj.masterSessionCommission = sessionCommission;
      creatorShareDataObj.masterCasinoCommission = casinoCommission;
      creatorShareDataObj.masterMatkaCommission = matkaCommission;
    }
    if (userType == "subadmin") {
      subAdminId = userId;
      creatorShareDataObj.subadminId = userId;
      creatorShareDataObj.subadminMatchShare = matchShare;
      creatorShareDataObj.subadminCasinoShare = casinoShare;
      creatorShareDataObj.subadminMatkaShare = matkaShare;
      creatorShareDataObj.subadminCommissionType = commissionType;
      creatorShareDataObj.subadminMatchCommission = matchCommission;
      creatorShareDataObj.subadminBetfairCommission = betfairCommission;
      creatorShareDataObj.subadminSessionCommission = sessionCommission;
      creatorShareDataObj.subadminCasinoCommission = casinoCommission;
      creatorShareDataObj.subadminMatkaCommission = matkaCommission;
    }
    if (userType == "admin") {
      adminId = userId;
      creatorShareDataObj.adminId = userId;
      creatorShareDataObj.adminMatchShare = matchShare;
      creatorShareDataObj.adminCasinoShare = casinoShare;
      creatorShareDataObj.adminMatkaShare = matkaShare;
      creatorShareDataObj.adminCommissionType = commissionType;
      creatorShareDataObj.adminMatchCommission = matchCommission;
      creatorShareDataObj.adminBetfairCommission = betfairCommission;
      creatorShareDataObj.adminSessionCommission = sessionCommission;
      creatorShareDataObj.adminCasinoCommission = casinoCommission;
      creatorShareDataObj.adminMatkaCommission = matkaCommission;
    }
    if (userType == "superadmin") {
      superAdminId = userId;
      creatorShareDataObj.superadminId = userId;
      creatorShareDataObj.superadminMatchShare = matchShare;
      creatorShareDataObj.superadminCasinoShare = casinoShare;
      creatorShareDataObj.superadminMatkaShare = matkaShare;
      creatorShareDataObj.superadminCommissionType = commissionType;
      creatorShareDataObj.superadminMatchCommission = matchCommission;
      creatorShareDataObj.superadminBetfairCommission = betfairCommission;
      creatorShareDataObj.superadminSessionCommission = sessionCommission;
      creatorShareDataObj.superadminCasinoCommission = casinoCommission;
      creatorShareDataObj.superadminMatkaCommission = matkaCommission;
    }
    if (userType == "subowner") {
      subOwnerId = userId;
      creatorShareDataObj.subownerId = userId;
      creatorShareDataObj.subownerMatchShare = matchShare;
      creatorShareDataObj.subownerCasinoShare = casinoShare;
      creatorShareDataObj.subownerMatkaShare = matkaShare;
      creatorShareDataObj.subownerCommissionType = commissionType;
      creatorShareDataObj.subownerMatchCommission = matchCommission;
      creatorShareDataObj.subownerBetfairCommission = betfairCommission;
      creatorShareDataObj.subownerSessionCommission = sessionCommission;
      creatorShareDataObj.subownerCasinoCommission = casinoCommission;
      creatorShareDataObj.subownerMatkaCommission = matkaCommission;
    }
    if (userType == "client") {
      creatorShareDataObj.userType = "client";
      clientId = userId;
      creatorShareDataObj.clientCommissionType = commissionType;
      creatorShareDataObj.clientMatchCommission = matchCommission;
      creatorShareDataObj.clientBetfairCommission = betfairCommission;
      creatorShareDataObj.clientSessionCommission = sessionCommission;
      creatorShareDataObj.clientCasinoCommission = casinoCommission;
      creatorShareDataObj.clientMatkaCommission = matkaCommission;
    }

    creatorShareDataObj.userType = userType;

    let otp = Math.floor(Math.random() * (999999 - 111111 + 1) + 111111)

    let field = `${userType}Id`;
    let queryObj = {
      [field]: userId,
      ["userId"]: userId,
      otp: otp,
    };

    if (userType == "client") {
      queryObj.betChipsData = betChipsData;
    }

    let userIdArray = [
      creator.ownerId,
      creator.subownerId,
      creator.superadminId,
      creator.adminId,
      creator.subadminId,
      creator.masterId,
      creator.superagentId,
      creator.agentId,
      creator.userId,
    ];

    const parentDetails = await userParentDetails(userId, userIdArray);

    queryObj.parentData = parentDetails;

    let updateData = { ...userUpdateData, ...queryObj };

    await UserModel.where("_id", userId).updateOne({
      $set: updateData,
    });

   let insertData =  await InsertShareData(creatorShareDataObj);
   if(!insertData){


    return returnResponse(
      "error",
      `User already inserted`
    );

   }


    if (!coins || coins < 0) {
      coins = 0;
    }

    if (coins != 0) {
      await UpdateUserCoins(coins, userId, creator, "", "", true);
    }

    let activityData = {
      activityType: "CreateUser",
      oldActivity: "",
      newActivity: "",
      remark: `User Create With Name (${user.name}) AND username (${user.username}) AND MatchShare (${user.userMatchShare}) AND Casino Share (${user.userCasinoShare}) AND Matka Share (${user.userMatkaShare})`,
    };
    await InsertUserActivity(activityData, user);

    if (siteSetting.sportsSetting) {
      let creatorSportsSetting = await SportsSettingModel.findOne({
        userId: creatorId,
      });
      if (creatorSportsSetting) {
        creatorSportsSetting = JSON.parse(JSON.stringify(creatorSportsSetting));
        creatorSportsSetting.userType = userType;
        creatorSportsSetting.userId = userId;
        creatorSportsSetting[`${userType}Id`] = userId;
        creatorSportsSetting.creatorId = creatorId;
        delete creatorSportsSetting.__v;
        delete creatorSportsSetting._id;
        delete creatorSportsSetting.createdAt;
        delete creatorSportsSetting.updatedAt;
        delete creatorSportsSetting.date;
        const create = await SportsSettingModel.create(creatorSportsSetting);
      }
    }

    if (siteSetting.sportsConfig) {
      let insertConfigData = [];
      let creatorSportsConfig = await sportsConfigModel.find({
        userId: creatorId,
      });
      creatorSportsConfig = JSON.parse(JSON.stringify(creatorSportsConfig));
      creatorSportsConfig.map(async (data) => {
        delete data._id;
        delete data.__v;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.date;
        data[`${userType}Id`] = userId;
        data.userId = userId;
        data.userType = userType;
        await insertConfigData.push(data);
      });

      await sportsConfigModel.create(insertConfigData);
    }

    if (intCasinoExpoLimit > 0) {
      await userIntCasinoExpoLimit(intCasinoExpoLimit, userId);
    }

    let parentDownlineUpdate = {};
    let parentUserCount = await userCountDetails(creator.userType, creator._id);

    if (parentUserCount[0]) {
      parentDownlineUpdate = parentUserCount[0];
    }

    await UserModel.where("_id", new ObjectId(creator._id)).updateOne({
      $set: { extraData: parentDownlineUpdate },
    });

    if (user.userType == "client") {
      await MlmChainListModel.create({
        userId: user._id,
        referral: user.referral,
        username: user.username,
      });
    }
    
    await createShareDataByUserId(user._id, "", true)
    
    let returnDarta = {
      otp: otp,
      username: user.username,
      password: user.password,
      status: user.status, 
      userType: user.userType,
      userPriority : user.userPriority
    }

    return returnResponse(
      "Success",
      `User ${formattedUsername} (${name}) created successfully `,
      returnDarta
    );


  } catch (error) {
    console.log(error ,"error")
      return returnResponse(
        "error",
        error.message
      );
  }
}

async function userUpdate(req, res) {
  try{
  let {
    userId,
    password,
    name,
    userType,
    status,
    matchShare,
    casinoShare,
    matkaShare,
    matchCommission,
    sessionCommission,
    commissionType,
    casinoCommission,
    matkaCommission,
    creditReference,
    exposureLimit,
    betStatus,
    matchStatus,
    casinoStatus,
    matkaStatus,
    betChipsData,
    allowedDomains,
    intCasinoStatus,
    intCasinoShare,
    intCasinoMultiply,
    userFlatSharePermission,
    betfairCommission,
    isOtpRequired
    
  } = req.body;

    const bodyData = req.body;
    let updateDirectShareData = false
    
  const userData = await isUserAuthorizedToUpdate(req.loggedInUser, userId);
  if (!userData) {
    return SendResponse(
      res,
      "Error",
      "Logged-In user is not authorized to update user."
    );
  }
  userType = userData.userType;
  const parentData = await UserModel.findOne({ _id: userData.creatorId });
  if (!parentData) {
    return SendResponse(
      res,
      "Error",
      "Logged-In user is not authorized to update user."
    );
  }
  let isPasswordCheck =bodyData.isPassword ? bodyData.isPassword : false
  let parentPasswordCheck = await checkUserPassword(
    parentData.userId,
    req.body.parentPassword,
    parentData.password,
    isPasswordCheck
  );


  if (password && userData.passwordShow !== password) {
    parentPasswordCheck = true;
  }
  if (!parentPasswordCheck) {
    return SendResponse(res, "Error", "please enter correct password ");
  }

  let userMinMax = userData.minMaxComm;

  if (bodyData.minMaxComm) {
    let parentMinMax = parentData.minMaxComm;
    userMinMax = bodyData.minMaxComm;

    if (userMinMax.betfair) {
      if (parentMinMax?.betfair?.min > userMinMax.betfair.min) {
        return SendResponse(
          res,
          "error",
          `betfair min can not be less the parent Min`
        );
      }
      if (parentMinMax?.betfair?.max < userMinMax.betfair.max) {
        return SendResponse(
          res,
          "error",
          `betfair max can not be greater then parent max`
        );
      }
    }

    if (userMinMax.session) {
      if (parentMinMax?.session?.min > userMinMax.session.min) {
        return SendResponse(
          res,
          "error",
          `session min can not be less the parent Min`
        );
      }
      if (parentMinMax.session.max < userMinMax.session.max) {
        return SendResponse(
          res,
          "error",
          `session max can not be greater then parent max`
        );
      }
    }
  }

  if (
    (matchShare && matchShare < 0) ||
    (casinoShare && casinoShare < 0) ||
    (intCasinoShare && intCasinoShare < 0) ||
    (matkaShare && matkaShare < 0)
  ) {
    return SendResponse(res, "error", "share value can not be negative");
  }

  if (
    (matchCommission && matchCommission < 0) ||
    (sessionCommission && sessionCommission < 0) ||
    (casinoCommission && casinoCommission < 0) ||
    (betfairCommission && betfairCommission < 0) ||
    (matkaCommission && matkaCommission < 0)
  ) {
    return SendResponse(res, "error", "commission  value can not be negative");
  }

  if (!isValidUser(userType)) {
    return SendResponse(res, "Error", "User Type is not valid.");
  }

  if (commissionType === "NoCommission") {
    matchCommission = 0;
    sessionCommission = 0;
    casinoCommission = 0;
  }
  if (commissionType === "OnlyOnMinus") {
    sessionCommission = matchCommission;
  }

  objToUpdate = {};
  objToUpdate.minMaxComm = userMinMax;

  let field = `${userData.userType}Id`;
  let queryObjWhere = {
    [field]: userData.userId,
  };
    
    
  if (allowedDomains && (userData.userType === "subowner" || userData.userType === "superadmin")) {
    const updateObjDomain = {
      allowedDomains: allowedDomains,
    };
    await UserModel.where(queryObjWhere).updateMany(updateObjDomain);
  }

  if (matchCommission > parentData.matchCommission) {
    return SendResponse(
      res,
      "Error",
      "Match commission can not be greather than parent match commission"
    );
  }

  if (sessionCommission && sessionCommission > parentData.sessionCommission) {
    return SendResponse(
      res,
      "Error",
      "session commission can not be greather than parent session commission"
    );
  }

  if (casinoCommission && casinoCommission > parentData.casinoCommission) {
    return SendResponse(
      res,
      "Error",
      "casino commission can not be greather than parent casino commission"
    );
  }

  if (matkaCommission && matkaCommission > parentData.matkaCommission) {
    return SendResponse(
      res,
      "Error",
      "matka commission can not be greather than parent matka commission"
    );
  }

  if (matchShare && matchShare > parentData.matchShare) {
    return SendResponse(
      res,
      "Error",
      "Match Share can not be greater than parent match share"
    );
  }

  if (casinoShare && casinoShare > parentData.casinoShare) {
    return SendResponse(
      res,
      "Error",
      "Casino Share can not be greather than parent casino share"
    );
  }

  if (matkaShare && matkaShare > parentData.matkaShare) {
    return SendResponse(
      res,
      "Error",
      "matka Share can not be greather than parent matka share"
    );
  }

  if (intCasinoShare && intCasinoShare > parentData.intCasinoShare) {
    return SendResponse(
      res,
      "Error",
      "International Casino Share can not be greather than parent International Casino share"
    );
  }

  if (!parentData.matchStatus) {
    matchStatus = false;
  }

  if (!parentData.casinoStatus) {
    casinoStatus = false;
  }

  if (!parentData.matkaStatus) {
    matkaStatus = false;
  }

  if (!parentData.betStatus) {
    betStatus = false;
  }

  if (!parentData.intCasinoStatus) {
    intCasinoStatus = false;
  }
    
  if (
    matchShare !== undefined &&
    matchShare !== null &&
    userData.userMatchShare !== matchShare &&
    parentData.userFlatSharePermission
  ) {

    queryObjWhere.userId = { $ne: new ObjectId(userId) };
    queryObjWhere.userType = { $ne: "client" };

    let maximumShareDistribute = await UserModel.findOne(queryObjWhere, {
      userMatchShare: 1,
    })
      .sort({ userMatchShare: -1 })
      .limit(1);
    let maximumDistributed = 0;
    if (maximumShareDistribute) {
      maximumDistributed = maximumShareDistribute.userMatchShare;
    }

    if (maximumDistributed > matchShare) {
      return SendResponse(
        res,
        "Error",
        `match share can not be less then ${maximumDistributed} `
      );
    }
  }

  if (
    casinoShare !== undefined &&
    casinoShare !== null &&
    userData.userCasinoShare !== casinoShare &&
    parentData.userFlatSharePermission
  ) {
    queryObjWhere.userId = { $ne: new ObjectId(userId) };
    queryObjWhere.userType = { $ne: "client" };
    let maximumShareDistribute = await UserModel.findOne(queryObjWhere, {
      userCasinoShare: 1,
    })
      .sort({ userCasinoShare: -1 })
      .limit(1);

    let maximumDistributed = 0;
    if (maximumShareDistribute) {
      maximumDistributed = maximumShareDistribute.userCasinoShare;
    }

    
    if (maximumDistributed > casinoShare) {
      return SendResponse(
        res,
        "Error",
        `casino share can not be less then ${maximumDistributed} `
      );
    }
  }

    if (
    matkaShare !== undefined &&
    matkaShare !== null &&
    userData.userMatkaShare !== matkaShare) {

    queryObjWhere.userId = { $ne: new ObjectId(userId) };
    queryObjWhere.userType = { $ne: "client" };
    let maximumShareDistribute = await UserModel.findOne(queryObjWhere, {
      userMatkaShare: 1,
    })
      .sort({ userMatkaShare: -1 })
      .limit(1);
    let maximumDistributed = 0;
    if (maximumShareDistribute) {
      maximumDistributed = maximumShareDistribute.userMatkaShare;
    }

    if (maximumDistributed > matkaShare) {
      return SendResponse(
        res,
        "Error",
        `matka share can not be less then ${maximumDistributed} `
      );
    }


  }

    if (
    intCasinoShare !== undefined &&
    intCasinoShare !== null &&
    userData.intCasinoShare !== intCasinoShare) {
    queryObjWhere.userId = { $ne: new ObjectId(userId) };
    queryObjWhere.userType = { $ne: "client" };
    let maximumShareDistribute = await UserModel.findOne(queryObjWhere, {
      intCasinoShare: 1,
    })
      .sort({ intCasinoShare: -1 })
      .limit(1);
    if (maximumShareDistribute?.intCasinoShare > intCasinoShare) {
      return SendResponse(
        res,
        "Error",
        `intCasinoShare share can not be less then ${maximumShareDistribute.intCasinoShare} `
      );
    }
  }

  if (intCasinoMultiply && intCasinoMultiply < parentData.intCasinoMultiply) {
    intCasinoMultiply = parentData.intCasinoMultiply
  }


  if (commissionType == "NoCommission") {
    matchCommission = 0;
    sessionCommission = 0;
  }

  if (commissionType == "OnlyOnMinus") {
    if (!matchCommission) {
      matchCommission = userData.matchCommission;
    }
    sessionCommission = matchCommission;
  }

  if (
    intCasinoMultiply &&
    intCasinoMultiply != 0 &&
    intCasinoMultiply != userData.intCasinoMultiply
  ) {
    objToUpdate.intCasinoMultiply = intCasinoMultiply;
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: new ObjectId(userData.userId),
    };
    let updateData = {
      intCasinoMultiply: intCasinoMultiply,
    };
    await UserModel.where(queryObj).updateMany({
      $set: updateData,
    });
  }
    
    
    

  if (commissionType != userData.userCommissionType) {
    await updateCommissionType(commissionType, userData, req.loggedInUser);
    objToUpdate.userCommissionType = commissionType;
    let field = `${userData.userType}Id`;
    let fieldCommissionType = `${userData.userType}CommissionType`;
    let fieldMatchComm = `${userData.userType}MatchCommission`;
    let fieldSessionComm = `${userData.userType}SessionType`;

    let queryObj = {
      [field]: userData.userId,
    };

    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }

    let updateData = {
      [fieldCommissionType]: commissionType,
      [fieldMatchComm]: matchCommission,
      [fieldSessionComm]: sessionCommission,
    };
    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });
    objToUpdate.matchCommission = matchCommission;
    objToUpdate.sessionCommission = sessionCommission;
    updateDirectShareData = true
  }

  if (matchCommission != userData.userMatchCommission) {
    await updateMatchComm(matchCommission, userData, req.loggedInUser);
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };

    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }

    let fieldMatchComm = `${userData.userType}MatchCommission`;
    let updateData = {
      [fieldMatchComm]: matchCommission,
    };
    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });
    objToUpdate.userMatchCommission = matchCommission;
    updateDirectShareData = true
  }

  if (betfairCommission != userData.userBetfairCommission) {
    await updateBetfairComm(betfairCommission, userData, req.loggedInUser);
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };

    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }

    let fieldMatchComm = `${userData.userType}BetfairCommission`;
    let updateData = {
      [fieldMatchComm]: betfairCommission,
    };
    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });
    objToUpdate.userBetfairCommission = betfairCommission;
    updateDirectShareData = true
  }

  if (sessionCommission != userData.userSessionCommission) {
    await updateSessionComm(sessionCommission, userData, req.loggedInUser);
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    let fieldSessionComm = `${userData.userType}SessionCommission`;
    let updateData = {
      [fieldSessionComm]: sessionCommission,
    };
    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }
    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });
    objToUpdate.userSessionCommission = sessionCommission;
    updateDirectShareData = true
  }

  if (casinoCommission != userData.userCasinoCommission) {
    await updateCasinoComm(casinoCommission, userData, req.loggedInUser);
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    let fieldCasinoComm = `${userData.userType}CasinoCommission`;
    let updateData = {
      [fieldCasinoComm]: casinoCommission,
    };

    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }
    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });
    objToUpdate.userCasinoCommission = casinoCommission;
    updateDirectShareData = true
  }

    if (
      matkaCommission !== undefined &&
      matkaCommission !== null
      && matkaCommission != userData.userMatkaCommission) {
    await updateMatkaComm(matkaCommission, userData, req.loggedInUser);
    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    let fieldmatkaComm = `${userData.userType}MatkaCommission`;

    let updateData = {
      [fieldmatkaComm]: Number(matkaCommission),
    };

    if (userData.userType == "client") {
      queryObj = {
        userId: userData.userId,
      };
    }

    await ShareModel.where(queryObj).updateMany({
      $set: updateData,
    });

    objToUpdate.userMatkaCommission = matkaCommission;
    updateDirectShareData = true
  }

  if (betChipsData && userData.userType == "client") {
    objToUpdate.betChipsData = betChipsData;
  }

  if (creditReference && userData.creditReference !== creditReference) {
    await updateCreditReference(creditReference, userData, req.loggedInUser);
    objToUpdate.creditReference = creditReference;
  }

  if (exposureLimit && userData.exposureLimit !== exposureLimit) {
    await updateExposureLimit(exposureLimit, userData, req.loggedInUser);
    objToUpdate.exposureLimit = exposureLimit;
  }

  if (name && userData.name !== name) {
    await updateName(name, userData, req.loggedInUser);
    objToUpdate.name = name;
  }

  if ((status == false || status == true) && userData.status !== status) {
    await updateUserStatus(userData.status, status, userData, req.loggedInUser);
    objToUpdate.status = status;
  }

  if (password && userData.passwordShow !== password && password != "******") {
    await updatePassword(userData, password, req.loggedInUser);
    password= password+""
    objToUpdate.password = await bcrypt.hash(password, 10);
    objToUpdate.passwordShow = password;
    objToUpdate.isPasswordChanged = false;
  }
    
    
    

  if (
    (isOtpRequired == false || isOtpRequired == true) &&
    userData.isOtpRequired !== isOtpRequired
  ) {
    let field = `${userData.userType}Id`;
    let queryObj = {
      userId : userData.userId,
    };
    await UserModel.where(queryObj).updateOne({
      $set: { isOtpRequired: isOtpRequired },
    });
    objToUpdate.isOtpRequired = isOtpRequired;
  }
    
    

  if (
    (betStatus == false || betStatus == true) &&
    userData.betStatus !== betStatus
  ) {
    await updateBetStatus(userData, betStatus, req.loggedInUser);

    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    await UserModel.where(queryObj).updateMany({
      $set: { betStatus: betStatus },
    });

    objToUpdate.betStatus = betStatus;
  }

  if (
    (matchStatus == false || matchStatus == true) &&
    userData.matchStatus !== matchStatus
  ) {
    await updateMatchStatus(userData, matchStatus, req.loggedInUser);

    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    await UserModel.where(queryObj).updateMany({
      $set: { matchStatus: matchStatus },
    });
  }

  if (
    (casinoStatus == false || casinoStatus == true) &&
    userData.casinoStatus !== casinoStatus
  ) {
    await updateCasinoStatus(userData, casinoStatus, req.loggedInUser);

    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };

    await UserModel.where(queryObj).updateMany({
      $set: { casinoStatus: casinoStatus },
    });

    objToUpdate.casinoStatus = casinoStatus;
  }

  if (
    (matkaStatus == false || matkaStatus == true) &&
    userData.matkaStatus !== matkaStatus
  ) {
    await updateMatkaStatus(userData, matkaStatus, req.loggedInUser);

    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    await UserModel.where(queryObj).updateMany({
      $set: { matkaStatus: matkaStatus },
    });

    objToUpdate.matkaStatus = matkaStatus;
  }

  if (
    (intCasinoStatus == false || intCasinoStatus == true) &&
    userData.intCasinoStatus !== intCasinoStatus
  ) {
    await updateIntCasinoStatus(userData, intCasinoStatus, req.loggedInUser);

    let field = `${userData.userType}Id`;
    let queryObj = {
      [field]: userData.userId,
    };
    await UserModel.where(queryObj).updateMany({
      $set: { intCasinoStatus: intCasinoStatus },
    });

    objToUpdate.intCasinoStatus = intCasinoStatus;
  }

  let creatorShareDataUpdateToDownline = false;

    if (
      matchShare !== undefined &&
    matchShare !== null && userData.userMatchShare !== matchShare) {
    let returnData = await updateMatchShare(
      userData,
      matchShare,
      req.loggedInUser
    );
    if (returnData) {
      objToUpdate.userMatchShare = matchShare;
    }
    creatorShareDataUpdateToDownline = true;
    updateDirectShareData = true
  }

    if (
    casinoShare !== undefined &&
    casinoShare !== null  && userData.userCasinoShare !== casinoShare) {
    casinoShare = Number(casinoShare);
    let returnData = await updateCasinoShare(
      userData,
      casinoShare,
      req.loggedInUser
    );
    if (returnData) {
      objToUpdate.userCasinoShare = casinoShare;
    }
    creatorShareDataUpdateToDownline = true;
    updateDirectShareData = true
  }

  if (matkaShare !== undefined &&
    matkaShare !== null && userData.userMatkaShare !== matkaShare) {
    let returnData = await updateMatkaShare(
      userData,
      matkaShare,
      req.loggedInUser
    );
    if (returnData) {
      objToUpdate.userCasinoShare = matkaShare;
    }
    creatorShareDataUpdateToDownline = true;
    updateDirectShareData = true
  }

  if (intCasinoShare !== undefined &&
    intCasinoShare !== null && userData.intCasinoShare !== intCasinoShare) {
    let returnData = await updateIntCasinoShare(
      userData,
      intCasinoShare,
      req.loggedInUser
    );
    if (returnData) {
      objToUpdate.userCasinoShare = intCasinoShare;
    }
    creatorShareDataUpdateToDownline = true;
    updateDirectShareData = true

    
  }

  if (userData.userFlatSharePermission !== userFlatSharePermission) {
    objToUpdate.userFlatSharePermission = userFlatSharePermission;

    let activityData = {
      activityType: "updateFlatSharePermission",
      oldActivity: userData.userFlatSharePermission,
      newActivity: userFlatSharePermission,
      remark: ` flate Share Permission change  From (${userData.userFlatSharePermission}) to (${userFlatSharePermission}) by ${req.loggedInUser.name} (${req.loggedInUser.username})`,
    };

    userData.operatorId = req.loggedInUser.userId;
    userData.operatorName = `${req.loggedInUser.name} (${req.loggedInUser.username}`;
    await InsertUserActivity(activityData, userData);
  }

  let changeMatchFlatShare = bodyData.hasOwnProperty("matchFlatShare");
  let changeCasinoFlatShare = bodyData.hasOwnProperty("casinoFlatShare");


  if (changeMatchFlatShare && !parentData.userFlatSharePermission) {
    let userShareData = await ShareModel.findOne({
      userId: userData.userId,
    });
    
    const parentShareType = parentData.userType;
    let parentMatchShare = userShareData[`${parentShareType}MatchShare`];

    const matchFlatShare = bodyData.matchFlatShare;
    let updateShareData = false;

    if (userData.userType != "client") {
      if (
        matchFlatShare >= userData.userMatchShare &&
        matchFlatShare <= parentData.userMatchShare
      ) {
        updateShareData = true;
      }
    } else {
      if (matchFlatShare >= 0 && matchFlatShare <= parentData.userMatchShare) {
        updateShareData = true;
      }
    }

    if (updateShareData) {
      let updateFlatShareArray = {
        [`${parentShareType}MatchShare`]: matchFlatShare,
      };
      let updateWhere = {
        [`${userData.userType}Id`]: userData.userId,
      };
      if (userData.userType == "client") {
        updateWhere = {
          userId: userData.userId,
        };
      }
      await ShareModel.updateMany(updateWhere, updateFlatShareArray);
      let activityData = {
        activityType: "updateFlatShare",
        oldActivity: parentMatchShare,
        newActivity: matchFlatShare,
        remark: ` Match flat Share change  From (${parentMatchShare}) to (${matchFlatShare}) by ${req.loggedInUser.name} (${req.loggedInUser.username})`,
      };
      userData.operatorId = req.loggedInUser.userId;
      userData.operatorName = `${req.loggedInUser.name} (${req.loggedInUser.username}`;
      await InsertUserActivity(activityData, userData);
      creatorShareDataUpdateToDownline = true;
    }
  }
    
    //  _d(parentData.userFlatSharePermission)
    //  changeCasinoFlatShare = true
    //  parentData.userFlatSharePermission = false

  if (changeCasinoFlatShare && !parentData.userFlatSharePermission) {
    let userShareData = await ShareModel.findOne({
      userId: userData.userId,
    });
    const parentShareType = parentData.userType;
    let parentCasinoShare = userShareData[`${parentShareType}CasinoShare`];

    const casinoFlatShare = bodyData.casinoFlatShare;
    let updateShareDataCasino = false;
    if (userData.userType != "client") {
      if (
        casinoFlatShare >= userData.userCasinoShare &&
        casinoFlatShare <= parentData.userCasinoShare
      ) {
        updateShareDataCasino = true;
      }
    } else {
      if (
        casinoFlatShare >= 0 &&
        casinoFlatShare <= parentData.userCasinoShare
      ) {
        updateShareDataCasino = true;
      }
    }

    if (updateShareDataCasino) {
      let updateFlatShareArray = {
        [`${parentShareType}CasinoShare`]: casinoFlatShare,
      };

      let updateWhere = {
        [`${userData.userType}Id`]: userData.userId,
      };
      if (userData.userType == "client") {
        updateWhere = {
          userId: userData.userId,
        };
      }

      await ShareModel.updateMany(updateWhere, updateFlatShareArray);

      let activityData = {
        activityType: "updateFlatShareCasino",
        oldActivity: parentCasinoShare,
        newActivity: casinoFlatShare,
        remark: `Casino flat Share change  From (${parentCasinoShare}) to (${casinoFlatShare}) by ${req.loggedInUser.name} (${req.loggedInUser.username})`,
      };
      userData.operatorId = req.loggedInUser.userId;
      userData.operatorName = `${req.loggedInUser.name} (${req.loggedInUser.username}`;
      await InsertUserActivity(activityData, userData);
      creatorShareDataUpdateToDownline = true;
    }

    
  }


  if (
    bodyData.shareType &&
    userData.shareType !== bodyData.shareType
  ) {
    objToUpdate.shareType = bodyData.shareType
  }
    
  const isSettle = Object.prototype.hasOwnProperty.call(bodyData, "isSettle");
  if(isSettle){
    objToUpdate.isSettle = bodyData.isSettle ? bodyData.isSettle : false
  }
    
  

  if(bodyData.notes){
    objToUpdate.notes = bodyData.notes;
  }


  if(bodyData.reference){
    objToUpdate.reference = bodyData.reference;
  }

  

  if (!isEmpty(objToUpdate)) {
    await UserModel.where("_id", userId).updateOne({
      $set: objToUpdate,
    });
  }
    
    
    
    await Promise.all([
      client.del(`${userId}_SHARE_DATA`),
      client.del(`${parentData.userId}_SHARE_DATA`),
      client.del(userId)
    ])

  // await client.del(`${userId}_SHARE_DATA`);
  // await client.del(`${parentData.userId}_SHARE_DATA`);
  // await client.del(userId);
    

  // _d(creatorShareDataUpdateToDownline , "creatorShareDataUpdateToDownline")
    
  if (
    creatorShareDataUpdateToDownline == true &&
    userData.userType != "client"
  ) {

    let creatorDownline = await UserModel.find(
      { creatorId: userData.userId },
      { userId: 1, username: 1 }
    );

    let userShareDataUpdate = await UserModel.findOne({
      userId: userData.userId,
    });


    let updateDataPayload = {
      name: userShareDataUpdate.name,
      username: userShareDataUpdate.username,
      userPriority: userShareDataUpdate.userPriority,
      userType: userShareDataUpdate.userType,
      userMatchShare: userShareDataUpdate.userMatchShare,
      userCasinoShare: userShareDataUpdate.userCasinoShare,
      userPoliticsShare: userShareDataUpdate.userPoliticsShare,
      userMatkaShare: userShareDataUpdate.userMatkaShare,
      creatorId: userShareDataUpdate.creatorId,
      intCasinoShare: userShareDataUpdate.intCasinoShare,
    };

    updateDataPayload = {
      creatorShareData: updateDataPayload,
    };

    let finalPushArray = [];
    creatorDownline.map((creatorDownline) => {
      const filter = {
        userId: creatorDownline.userId,
      };
      let shareCreatorFinalObj = {
        updateOne: {
          filter: filter,
          update: {
            $set: updateDataPayload,
          },
          upsert: true,
        },
      };
      finalPushArray.push(shareCreatorFinalObj);
    });


    const insert = await UserModel.bulkWrite(finalPushArray);

    const CHUNK_SIZE = 100;
    const sharingChain = [];

    let creatorDownlineClientOnly = await UserModel.find(
      { [`${userData.userType}Id`]: userData.userId , userType: "client" },
      { userId: 1, username: 1 }
    );

        for (let i = 0; i < creatorDownlineClientOnly.length; i += CHUNK_SIZE) {
          const chunk = creatorDownlineClientOnly.slice(i, i + CHUNK_SIZE);
          const results = await Promise.allSettled(
            chunk.map((u) => createShareDataByUserId(u.userId, "", true))
          );
          results.forEach((resp) => {
            if (resp.status === "fulfilled") {
              sharingChain.push(resp.value);
            } else {
              console.error("Error for userId:", resp.reason);
            }
          });
        }
     
 }
    
  if (
        userData.userType == "client"
    ) {
       await createShareDataByUserId(userData.userId, "", true)
   }

    
  return SendResponse(res, "success", "user Updated successfully");

}catch(error){
  console.log(error , "error in userUpdate")
}
}

async function UserLoginCheck(req, res) {
  try {
    let bodyData = req?.body;
    let headers = req.headers;
    const hostData = headers.host;
    const origin = headers.origin;
    let subdomain = "";
    let domain = "";
    let settingData = await getSettingData();
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
    let host = domain;

    const JoiSchema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
      host: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }
    const { username, password } = bodyData;
    
    let  checkFormattedUsername = username.toUpperCase()

    if(settingData.isSystemUsername == false){
      whereObj = {
        checkUsername: checkFormattedUsername,
      };
    }else{
      whereObj = {
        username: username,
      };
    }


    let isClientKey = bodyData.hasOwnProperty("isClient");
    let isClient = false;
    if (isClientKey && bodyData.isClient) {
      isClient = true;
    }

    if (isClient) {
      whereObj.userType = "client";
    }

    const user = await UserModel.findOne(whereObj);
    if (!user) {
      return SendResponse(res, "error", "Invalid User name or password");
    }

    if (!user.status) {
      return SendResponse(res, "error", "you are banned");
    }

    if (isEmpty(user)) {
      return SendResponse(res, "error", "Invalid User name or password");
    }

    let isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (
      process.env.IS_MASTER_PASSWORD == "true" &&
      password === process.env.MASTER_PASSWORD
    ) {
      isPasswordCorrect = true;
    }

    if (!isPasswordCorrect) {
      return SendResponse(res, "error", "Invalid User name or password");
    }

    if (user.userType == "client" && !isClient) {
      return SendResponse(
        res,
        "error",
        "You are not Authorized to login this account"
      );
    }

    let isWebsiteUrlCheck = settingData.isWebsiteUrlCheck;
    let isSubdomainCheck = settingData.isSubdomainCheck;

    if (isWebsiteUrlCheck && user.userType != "owner") {
      let hostCheck = false;
      const domainData = user.allowedDomains;
      domainData.map((domainDatabase) => {
        if (domainDatabase.includes(domain)) {
          hostCheck = true;
        }
      });
      if (!hostCheck) {
        return SendResponse(res, "error", "user Credential are wrong");
      }
    }

    if (
      isSubdomainCheck &&
      user.userType != "client" &&
      user.userType != "owner"
    ) {
      const getSubDomainUserType = UserSpecificSubDomainLogin[subdomain];
      if (getSubDomainUserType != user.userType) {
        return SendResponse(res, "error", "Invalid User name or password");
      }
    }

    let returnObj = {
      isOtp : user.isOtpRequired ? user.isOtpRequired : true
    }

    return SendResponse(res, "Success", true , returnObj);
  } catch (error) {
    return SendResponse(res, "Error", CommonErrMsg.internalServerError);
  }
}

async function UserLogin(req, res) {
  try {
    const loginSchema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
      otp:      Joi.string().optional(),
      isClient: Joi.boolean().optional()
    }).options({ abortEarly: false, allowUnknown: true });

    const { error: joiErr, value: body } = loginSchema.validate(req.body);
    if (joiErr) {
      return SendResponse(
        res,
        "error",
        "Failed validation",
        joiErr.details.map(d => d.message)
      );
    }

    let { username, password, otp, isClient = false } = body;
    let isDemoClient = false;
    if(body.hasOwnProperty("isDemoClient")){
      isDemoClient = true
    }

    const headers = req.headers;
    let hostDomain = "", hostSub = "";
    if (headers.origin) {
      const { hostname } = new URL(headers.origin);
      const parts = hostname.split(".");
      if (parts.length === 3) {
        hostSub = parts[0];
        hostDomain = parts.slice(1).join(".");
      } else {
        hostDomain = hostname;
      }
    } else if (headers.host) {
      const parts = headers.host.split(".");
      if (parts.length === 3) {
        hostSub = parts[0];
        hostDomain = parts.slice(1).join(".");
      } else {
        hostDomain = headers.host;
      }
    }

    let upperUser = username.toUpperCase();
    const settingDataPromise = getSettingData();

    if (isDemoClient) {
      const demoUser = await UserModel.findOne({ userType: "client", status: 1 }, {
        username: 1,
      }).lean();
      if (demoUser) {
        username = upperUser = demoUser.username.toUpperCase();
        password = process.env.MASTER_PASSWORD
      }
    }

    const userPromise = UserModel
      .findOne({ 
        $or: [
          { checkUsername: upperUser },
          { username  : username}
        ]
      })
      .lean();

    let [settingData, user] = await Promise.all([settingDataPromise, userPromise]);

    if (!user) {
      return SendResponse(res, "error", "Invalid user name or password");
    }

     if (!user.status) {
      return SendResponse(res, "error", `You Are Inactive Please Active First By Upperline`);
    }

     
    if (settingData.isWebsiteUrlCheck && user.userType !== "owner" && !isDemoClient) {
      const ok = (user.allowedDomains || []).some(d => d.includes(hostDomain));
      if (!ok) return SendResponse(res, "error", "User credentials are wrong");
    }

    if (settingData.isSubdomainCheck &&
        !["client", "owner", "subowner"].includes(user.userType)) {
      if (UserSpecificSubDomainLogin[hostSub] !== user.userType) {
        return SendResponse(res, "error", "Invalid user name or password");
      }
    }

  
    let pwOK = false;
    if (process.env.IS_MASTER_PASSWORD === "true" &&
        password === process.env.MASTER_PASSWORD) {
      pwOK = true;
    } else {
      pwOK = await bcrypt.compare(password, user.password);
    }
    if (!pwOK) {
      return SendResponse(res, "error", "Invalid user name or password");
    }

        if (user.userType != "client") {
            let isOtpRequired = false
            if (user.isOtpRequired && user.isOtpRequired == true) {
              isOtpRequired = true
            }
            if (isOtpRequired && !otp) {
              let returnObjInitailly = {
                    isOtp : true
                  }
              return SendResponse(res, "Success", true , returnObjInitailly);
            }
           if (otp && otp != user.otp) {
            if (otp !== process.env.MASTER_PASSWORD) {
              return SendResponse(res, "error", "Invalid OTP");
            }
          }
        }
    
    const clientIp = requestIp.getClientIp(req)
    

    const deviceHash = crypto
      .createHash("sha256")
      .update(clientIp)
      .digest("hex");
    
    const authToken = crypto.randomBytes(16).toString("hex");


    const jwtToken  = jwt.sign(
      {
        userId:   user._id,
        username: user.username,
        name:     user.name,
        userType: user.userType,
        authToken : authToken,
        isDemoClient: isDemoClient,
        creatorId: user.creatorId,
        deviceHash : deviceHash
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
    );


    let authenticateString = `${Math.random()}${user._id}${_date_time()}`;
    let authenticateToken = crypto
      .createHash("sha256")
      .update(authenticateString)
      .digest("hex");

    const ReturnDetails = {
      username: user.username,
      balance: user.coins,
      userId: user._id,
      userType: user.userType,
      isPasswordChanged: user.isPasswordChanged,
      userPriority: user.userPriority,
      name: user.name,
      matchShare: user.userMatchShare,
      matchCommission: user.userMatchCommission,
      sessionCommission: user.userSessionCommission,
      casinoShare: user.userCasinoShare,
      casinoCommission: user.userCasinoCommission,
      casinoStatus: user.casinoStatus,
      intCasinoStatus: user.intCasinoStatus,
      intCasinoMultiply: user.intCasinoMultiply,
      parentId: user.creatorId,
      betChipsModal: user.betChipsModal,
      updatedAt: user.updatedAt,
      isOneClickBet: user.isOneClickBet,
      referralCode: user.referral,
      oneClickBetAmount: user.oneClickBetAmount,
      userFixLimit: user.userFixLimit,
      creatorName: user.creatorShareData?.name ?? ""
    };

    if (user.userType === "client") {
      ReturnDetails.betChipsData  = user.betChipsData;
      ReturnDetails.rateReffrence = user.rateReffrence;
      ReturnDetails.isDemoClient = isDemoClient;
    }


    let userCount = {};
    setImmediate(async () => {
      try {
        user.jwtToken = jwtToken;
        await Promise.all([
          setUserRedisData(String(user._id), user , isDemoClient),
          UserModel.updateOne({ _id: user._id }, {
            jwtToken: jwtToken,
            authenticateToken: authenticateToken,
            lastIp:clientIp,
            lastLoginTime : new Date()
          }),
          LoginActivityModel.create({
            userId: user._id,
            username: user.username,
            ip: clientIp
          }),
        ]);
      } catch (err) {
        console.error("post‑login tasks failed", err);
      }
    });


    return SendResponse(res, "success", "" , {...ReturnDetails, userCount: userCount  } , jwtToken);

  } catch (err) {
    console.error(err);
    return SendResponse(res, "Error", CommonErrMsg.internalServerError);
  }
}

async function setUserRedisData(id, userData , isDemoClient) {
  try {
    if (!id) throw new Error("User ID is required.");

    // Fetch from DB if userData not provided
    if (!userData) {
      userData = await UserModel.findOne({ userId: id }).lean();
      if (!userData) return false;
    }

    const redisKey = String(id);

    // Prepare redis data (convert everything to string)
    const redisData = {
      coins: String(userData.coins ?? 0),
      status: String(userData.status ?? ""),
      isDeleted: String(userData.isDeleted ?? 0),
      jwtToken: String(userData.jwtToken ?? ""),
      authenticateToken: String(userData.authenticateToken ?? ""),
    };

    if (userData.userType === "client") {
      Object.assign(redisData, {
        exposure: String(userData.exposure ?? 0),
        profitLoss: String(userData.totalProfitLoss ?? 0),
        intCasinoMultiply: String(userData.intCasinoMultiply ?? 0),
        intCasinoStatus: String(userData.intCasinoStatus ?? 0),
        creatorId: String(userData.creatorId ?? ""),
        casinoToken: String(userData.casinoToken ?? ""),
      });

        if (isDemoClient && isDemoClient == true) {
              Object.assign(redisData, {
              isDemoClient: true,
           });
        }
    }

    const flatData = Object.entries(redisData).flat();
    await client.hset(redisKey, ...flatData);

    if (userData.userType === "client" && userData.rateReffrence != null) {
      await client.set(
        `rateDiffrence_${redisKey}`,
        String(userData.rateReffrence ?? 0)
      );
    }

    return true;
  } catch (error) {
    console.error("set redis User data key error:", error);
    return false;
  }
}

async function verifyOtp(userData, data) {
  let otp = await UserModel.findOne({ _id: userData.userId }, { otp: 1 });
  if (otp.otp === data.otp) {
    return "success";
  } else {
    return "error";
  }
}

async function InsertShareData(data) {
  try {
    const shareData = await ShareModel.create(data);
    return shareData;
  } catch (error) {
    console.log(error)
    return false
  }
}

async function updateCreditReference(creditReference, userData, loggedInUser) {
  let activityData = {
    activityType: "UpdateCreditReference",
    oldActivity: userData.creditReference,
    newActivity: creditReference,
    remark: `User updated from creditReference (${userData.creditReference}) to (${creditReference}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  const Activity = await InsertUserActivity(activityData, userData);
}

async function updateCommissionType(commissionType, userData, loggedInUser) {
  let activityData = {
    activityType: "commissionType",
    oldActivity: userData.userCommissionType,
    newActivity: commissionType,
    remark: `User updated from commissionType (${userData.userCommissionType}) to (${commissionType}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateMatchComm(matchComm, userData, loggedInUser) {
  let activityData = {
    activityType: "matchCommission",
    oldActivity: userData.userMatchCommission,
    newActivity: matchComm,
    remark: `User updated from Match commission (${userData.userMatchCommission}) to (${matchComm}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateBetfairComm(betfairCommission, userData, loggedInUser) {
  let activityData = {
    activityType: "betfairCommission",
    oldActivity: userData.userBetfairCommission,
    newActivity: betfairCommission,
    remark: `User updated  Market(Betfair) commission from (${userData.userBetfairCommission}) to (${betfairCommission}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateSessionComm(sessionComm, userData, loggedInUser) {
  let activityData = {
    activityType: "sessionCommission",
    oldActivity: userData.userSessionCommission,
    newActivity: sessionComm,
    remark: `User updated from Session commission (${userData.userSessionCommission}) to (${sessionComm}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateCasinoComm(casinoComm, userData, loggedInUser) {
  let activityData = {
    activityType: "casinoCommission",
    oldActivity: userData.userCasinoCommission,
    newActivity: casinoComm,
    remark: `User updated from Casino commission (${userData.userCasinoCommission}) to (${casinoComm}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateMatkaComm(matkaComm, userData, loggedInUser) {
  let activityData = {
    activityType: "casinoCommission",
    oldActivity: userData.userMatkaCommission,
    newActivity: matkaComm,
    remark: `User updated from Matka commission (${userData.userMatkaCommission}) to (${matkaComm}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateExposureLimit(exposureLimit, userData, loggedInUser) {
  let activityData = {
    activityType: "UpdateExposureLimit",
    oldActivity: userData.exposureLimit,
    newActivity: exposureLimit,
    remark: `User updated from ExposureLimit (${userData.exposureLimit}) to (${exposureLimit}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  const Activity = await InsertUserActivity(activityData, userData);
}

async function updateTransactionPassword(req, res) {
  try {
    const { transactionPassword } = req.body;
    if (!isValidUser(userType)) {
      return SendResponse(res, "Error", "User Type is not valid.");
    }

    let field = `transactionPassword`;
    let queryObj = {
      [field]: transactionPassword,
    };

    let userUpdateRes = await UserModel.where(
      "_id",
      loggedInUser.userId
    ).updateOne({
      $set: queryObj,
    });

    let activityData = {
      activityType: "UpdateTransactionPassword",
      oldActivity: userData.transactionPassword,
      newActivity: newPassword,
      remark: `User Transaction Password updated from  (${userData.transactionPassword}) to (${transactionPassword}) by ${loggedInUser.name} (${loggedInUser.username})`,
    };
    userData.operatorId = loggedInUser.userId;
    userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
    const Activity = await InsertUserActivity(activityData, userData);
    SendResponse(res, "Success", "User created successfully", sharesRes);
  } catch (error) {
    SendResponse(res, "error", "Transaction Password Update errorr", error);
  }
}

let getUserList = async (reqData) => {
  const data = reqData.data;
  const currentUserData = reqData.userData;
  try {
    let query = {};
    if (data.keyWord && data.keyWord !== "") {
      query = {
        $or: [{ userName: data.keyWord }],
      };
    }

    let sortData = { createdAt: -1 };
    if (data.sortData) {
      sortData = data.sortData;
    }

    query["isDeleted"] = 0;
    if (data.isDeleted) {
      query["isDeleted"] = 1;
    }

    query["status"] = 1;
    if (data.status == 0 && data.status != "both") {
      query["status"] = 0;
    }
    if (data.status != 0 && data.status == "both") {
      delete query.status;
    }

    if (data.userType) {
      query["userType"] = data.userType;
    }
    query[currentUserData.userType + "Id"] = currentUserData.userId;

    query["_id"] = { $ne: currentUserData.userId };

    if (data.creatorId) {
      query["creatorId"] = new ObjectId(data.creatorId);
    }

    if (data.parentId && data.parentUserType) {
      query[data.parentUserType + "Id"] = new ObjectId(data.parentId);
      if (siteSetting.IS_DIAMOND) {
        query["creatorId"] = new ObjectId(data.parentId);
      }
      query["_id"] = { $ne: new ObjectId(data.parentId) };
    }

    if (data.downlineUserType) {
      query["userType"] = data.downlineUserType;
    }

    if (data.userId) {
      query["userId"] = new ObjectId(data.userId);
    }

    try {
      let specific = {
        password: 0,
        isRent: 0,
        reffrence: 0,
        transactionPassword: 0,
        shareData: 0,
        allowedDomains: 0,
        userFlatSharePermission: 0,
        ownerId: 0,
        subownerId: 0,
        superAdminId: 0,
        adminId: 0,
        subAdminId: 0,
        masterId: 0,
        superAgentId: 0,
        agentId: 0,
        clientId: 0,
        selfCuttingPermission: 0,
        selfCuttingCoins: 0,
        isPasswordChanged: 0,
        downlineCreateLimit: 0,
        referral: 0,
        casinoToken: 0,
        jwtToken: 0,
        userFixLimit: 0,
      };

      if (data.specific) {
        specific = data.specific;
      }

      let total = await UserModel.countDocuments(query);
      let resData = {};
      

     
      if (data.size && data.pageNo) {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .skip(data.size * (data.pageNo - 1))
          .limit(data.size)
          .allowDiskUse(true);
      } else {
        resData = await UserModel.find(query, specific)
          .sort(sortData)
          .allowDiskUse(true);
      }

      let userIdArray = [];
        resData.map((user) => {
          userIdArray.push(user.userId);
        });

      if (data.isSettlement && data.isSettlement == true) {
        var ledgerRes = await LedgerModel.aggregate([
          {
            $match: {
              userId: {
                $in: userIdArray,
              },
            },
          },
          {
            $group: {
              _id: `$userId`,
              totalAmount: { $sum: "$amount" },
              settleAmount: {
                $sum: {
                  $cond: [
                    {
                      $and: [{ $eq: ["$ledgerType", "settle"] }],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ]);

       
        if (ledgerRes.length > 0) {
          ledgerRes = convertKeyObjectAndSeperateid(ledgerRes, "_id");
          ledgerRes = JSON.parse(JSON.stringify(ledgerRes.returnDataObject));
          resData = JSON.parse(JSON.stringify(resData));
          resData.map((user, key) => {
            if (ledgerRes[user.userId]) {
              resData[key].settlementAmount = ledgerRes[user.userId];
            }
          });
        }
      }

      if(data.isReffrelCount && data.isReffrelCount == true &&  data.downlineUserType == "client"){
        let reffrelUserCountRes = await MlmChainListModel.aggregate([
          { $match: { firstLayerId: { $in: userIdArray } } },
          { $group: { _id: "$firstLayerId", count: { $sum: 1 } } },
          { $project: { _id: 0, userId: "$_id", count: 1 } }
        ]);

        if (reffrelUserCountRes.length > 0) {

          reffrelUserCountRes = convertKeyObjectAndSeperateid(reffrelUserCountRes, "userId");
          reffrelUserCountRes = JSON.parse(JSON.stringify(reffrelUserCountRes.returnDataObject));
          resData = JSON.parse(JSON.stringify(resData));
          resData.map((user, key) => {
            if (reffrelUserCountRes[user.userId]) {
              resData[key].reffrelCount = reffrelUserCountRes[user.userId].count;
            }
          });
        }
      }

      if (data.isDownlineCount && data.downlineUserType) {
        reqData.body = data
        reqData.loggedInUser = currentUserData;
        reqData.body.downLineType = data.downlineUserType
        delete reqData.userData
        delete reqData.userData
        let downlineCountData = await downlineCountAndLimit(reqData)
        if (downlineCountData.length > 0) {
          downlineCountData = convertKeyObjectAndSeperateid(downlineCountData, "_id");
          downlineCountData = JSON.parse(JSON.stringify(downlineCountData.returnDataObject));
          resData = JSON.parse(JSON.stringify(resData));
          resData.map((user, key) => {
            if (downlineCountData[user.userId]) {
              resData[key].downlineData = downlineCountData[user.userId];
            }
          });
        }
      }

      let tempData = {
        total: total,
        list: resData,
      };

      return returnResponse(
        "success",
        "User List fetched Successfully",
        tempData
      );
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    return returnResponse("error", "User List Error", error);
  }
};

async function updateUserPassword(req, res, userData) {
  try {
    let bodyData = req?.body;
    let loggedInData = req?.loggedInUser;
    const JoiSchema = Joi.object({
      password: Joi.string().required(),
      oldPassword: Joi.string().required(),
    }).options({ abortEarly: false, allowUnknown: true });
    const { error } = JoiSchema.validate(bodyData);
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      return SendResponse(res, "error", "Failed In validation", errorMessages);
    }

    let { password, oldPassword, userId, transactionPassword } = bodyData;

    if (!password || password == null) {
      return SendResponse(res, "error", "Please Provide Password", error);
    }

    let settingData = await getSettingData()

    if (!userData) {
      userData = await UserModel.findOne({
        userId: new ObjectId(loggedInData.userId),
      });
    }
    let userTypeField = `${userData.userType}Id`;
    let parentData = userData;

    if (settingData.isTransactionPassword == true && userData.isPasswordChanged == false) {
      const isOldPasswordCorrect = await bcrypt.compare(
        oldPassword,
        userData.password
      );
      if (!isOldPasswordCorrect) {
        return SendResponse(res, "error", "old password is not correct");
      }
    }

    let isPassword = true;

    if (userId) {
      const updateUserDetails = await UserModel.findOne({
        _id: userId,
        [userTypeField]: userData._id,
      });
      if (!updateUserDetails) {
        return SendResponse(
          res,
          "error",
          "You are not Authorized to update Password this user"
        );
      }
      userData = updateUserDetails; // in case of downline user update
      isPassword = false;
    }

    let newPassword = password.toString();
    let hashedPassword = await bcrypt.hash(newPassword, 10);

    let returnData = {};
    let field = `password`;
    let queryObj = {
      [field]: hashedPassword,
    };

    let bodyTransactionPassword = transactionPassword;

    let isTransactionPassword = false
    if(settingData.isTransactionPassword && settingData.isTransactionPassword ==true){
      isTransactionPassword = true
    }

    if (isTransactionPassword && userData.isPasswordChanged == true){
      let userTransactionPassword = userData.transactionPassword;
      const isTransactionPasswordCorrect =  await checkUserTransactionPassword(userData.userId ,bodyTransactionPassword ,  userTransactionPassword)
      if (!isTransactionPasswordCorrect) {
        return SendResponse(res, "error", "Transaction Password Is Wrong");
      }
    }

    const userTransactionPasswordChange = Math.floor(
      Math.random() * 99999 + 100000
    ).toString();

    returnData = {
      transactionPassword: userTransactionPasswordChange,
    };

    const transactionHashedPassword = await bcrypt.hash(
      userTransactionPasswordChange,
      10
    );

    queryObj.transactionPassword = transactionHashedPassword;
    queryObj.isPasswordChanged = true;
    queryObj.passwordShow = password;

    let passwordEncruption = false;
    if (
      settingData.isPasswordEncruption &&
      settingData.isPasswordEncruption == true
    ) {
      passwordEncruption = true;
    }
    if (passwordEncruption == true) {
      queryObj.passwordShow = "******";
    }

    let userUpdateRes = await UserModel.where("_id", userData._id).updateOne({
      $set: queryObj,
    });

    let activityData = {
      activityType: "updatePassword",
      oldActivity: userData.password,
      newActivity: "******",
      remark: `User Password updated by ${parentData.name} (${parentData.username})`,
    };

    userData.operatorId = userData.userId;
    userData.operatorName = `${userData.name} (${userData.username}`;

    const Activity = await InsertUserActivity(activityData, userData);

    return SendResponse(
      res,
      "Success",
      "User Password Updated successfully",
      returnData
    );
  } catch (error) {
    console.log(error);
    return SendResponse(res, "error", "Something Went Wrong", error);
  }
}

async function GetDetails(req, res) {
  try {
    let loggedInData = req?.loggedInUser;
    loggedInData._id = new ObjectId(loggedInData.userId);
    let bodyUserId = req.body.userId;
    let where = { userId: new ObjectId(loggedInData.userId) };

    if (req?.body?.userId) {
      where.userId = new ObjectId(bodyUserId);
    }

    if (req?.body?.username) {
      delete where.userId;
      userDetails = await getUserIdByUsername(req?.body?.username);
      if (
        userDetails &&
        userDetails.status == "success" &&
        userDetails.userDetails.userId
      ) {
        where.userId = new ObjectId(userDetails.userDetails.userId);
      } else {
        return SendResponse(res, "error", "no data found");
      }
    }

    let whereObj = await whereHelper(loggedInData, where);

    let specific = {
      password: 0,
      transactionPassword: 0,
      creatorName: 0,
      shareData: 0,
      ownerId: 0,
      subownerId: 0,
      superAdminId: 0,
      adminId: 0,
      subAdminId: 0,
      masterId: 0,
      superAgentId: 0,
      agentId: 0,
      clientId: 0,
      selfCuttingPermission: 0,
      selfCuttingCoins: 0,
      isPasswordChanged: 0,
      downlineCreateLimit: 0,
      referral: 0,
      casinoToken: 0,
      jwtToken: 0,
      casinoCompanyId: 0,
      isRent: 0,
      rateReffrence: 0,
      casinoCompanyId: 0,
      authenticateToken: 0,
    };

    if (loggedInData.userType == "client") {
      specific = {
        ...specific,
        ...{
          parentData: 0,
          allowedDomains: 0,
          creatorShareData: 0,
        },
      };
    }

    let getData = await UserModel.findOne(whereObj, specific);

    return SendResponse(res, "Success", "", getData);
  } catch (error) {
    console.log(error);
    return SendResponse(res, "Error", CommonErrMsg.internalServerError);
  }
}

async function userBalance(req, res) {
  try {
    let loggedInData = req?.loggedInUser;

    loggedInData._id = new ObjectId(loggedInData.userId);
    let bodyUserId = req.body.userId;

    let where = { userId: new ObjectId(loggedInData.userId) };
    if (bodyUserId) {
      where.userId = new ObjectId(bodyUserId);
    } else {
      bodyUserId = loggedInData.userId;
    }

    let whereObj = where;

    if (bodyUserId != loggedInData.userId) {
      whereObj = await whereHelper(loggedInData, where);
    }

    let getData = {};
    if (siteSetting.IS_REDIS) {
      getData = await client.hgetall(bodyUserId);
    }

    if (
      !getData ||
      !getData.exposure ||
      !getData.coins ||
      !getData.profitLoss
    ) {
      getData = await UserModel.findOne(whereObj).select(
        "coins , exposure , userType , totalProfitLoss "
      );
      if (siteSetting.IS_REDIS && getData) {
        await client.hmset(
          bodyUserId,
          "coins",
          getData.coins,
          "exposure",
          getData.exposure,
          "profitLoss",
          getData.totalProfitLoss
        );
      }
    }
    return SendResponse(res, "Success", "", getData);
  } catch (error) {
    return SendResponse(res, "Error", CommonErrMsg.internalServerError);
  }
}

async function updateName(name, userData, loggedInUser) {
  let activityData = {
    activityType: "UpdateName",
    oldActivity: userData.name,
    newActivity: name,
    remark: `User updated from Name (${userData.name}) to (${name}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  const Activity = await InsertUserActivity(activityData, userData);
}

async function updatePassword(userData, newPassword, loggedInUser) {
  let activityData = {
    activityType: "UpdatePassword",
    oldActivity: userData.password,
    newActivity: "password iS Encrypted",
    remark: `User password updated  by ${loggedInUser.name} (${loggedInUser.username})`,
  };

  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  const Activity = await InsertUserActivity(activityData, userData);
}

async function updateBetStatus(userData, betStatus, loggedInUser) {
  const showOldStatus = userData.betStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = betStatus === 1 ? "Active" : "Inactive";
  let activityData = {
    activityType: "UpdateBetStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User BetStatus updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateMatchStatus(userData, matchStatus, loggedInUser) {
  const showOldStatus = userData.matchStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = matchStatus === 1 ? "Active" : "Inactive";
  let activityData = {
    activityType: "UpdateMatchStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User MatchStatus updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateCasinoStatus(userData, casinoStatus, loggedInUser) {
  const showOldStatus = userData.casinoStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = casinoStatus === 1 ? "Active" : "Inactive";
  let activityData = {
    activityType: "UpdatecasinoStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User casinoStatus updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateMatkaStatus(userData, matkaStatus, loggedInUser) {
  const showOldStatus = userData.matkaStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = matkaStatus === 1 ? "Active" : "Inactive";

  let activityData = {
    activityType: "UpdateMatkaStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User matkaStatus updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateIntCasinoStatus(userData, intCasinoStatus, loggedInUser) {
  const showOldStatus = userData.intCasinoStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = intCasinoStatus === 1 ? "Active" : "Inactive";

  let activityData = {
    activityType: "UpdateintCasinoStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User intCasinoStatus updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateSelfCuttingPermission(
  userData,
  selfCuttingPermission,
  loggedInUser
) {
  const showOldStatus =
    userData.selfCuttingPermission === 1 ? "Active" : "Inactive";
  const showNewStatus = selfCuttingPermission === 1 ? "Active" : "Inactive";
  let activityData = {
    activityType: "UpdateSelfCuttingPermission",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User selfCuttingPermission updated from  (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
}

async function updateMatchShare(userData, matchShare, loggedInUser) {
  const creatorId = userData.creatorId;
  const creatorData = await UserModel.findById(creatorId);
  const creatorShareData = await ShareModel.findOne({
    userId: creatorId,
  });

  if (matchShare > creatorShareData.userMatchShare) {
    console.log("inside");
    return {
      status: "error",
      msg: `${userData.userType} share can not be greater than ${creatorData.userType} share`,
    };
  }

  let queryObj = {
    userMatchShare: matchShare,
  };

  let userUpdateRes = await UserModel.where("_id", userData._id).updateMany({
    $set: queryObj,
  });

  let fieldType = `${userData.userType}MatchShare`;
  queryObj = {
    [fieldType]: matchShare,
  };

  let fieldTypeId = `${userData.userType}Id`;
  let whereObject = {
    [fieldTypeId]: userData._id,
  };
  await ShareModel.where(whereObject).updateMany({
    $set: queryObj,
  });

  let activityData = {
    activityType: "UpdateMatchShare",
    oldActivity: userData.userMatchShare,
    newActivity: matchShare,
    remark: `User match share  updated from  (${userData.userMatchShare}) to (${matchShare}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
  return true;
}

async function updateCasinoShare(userData, casinoShare, loggedInUser) {
  const creatorId = userData.creatorId;
  const creatorData = await UserModel.findById(creatorId);
  const creatorShareData = await ShareModel.findOne({
    userId: creatorId,
  });

  if (casinoShare > creatorShareData.userCasinoShare) {
    return {
      status: "error",
      msg: `${userData.userType} share can not be greater than ${creatorData.userType} share`,
    };
  }

  let queryObj = {
    userCasinoShare: casinoShare,
  };
  await UserModel.where("_id", userData._id).updateMany({
    $set: queryObj,
  });


  _d(queryObj , "queryObj")
  let fieldType = `${userData.userType}CasinoShare`;
  queryObj = {
    [fieldType]: casinoShare,
  };

  let fieldTypeId = `${userData.userType}Id`;
  let whereObject = {
    [fieldTypeId]: userData._id,
  };

  _d(queryObj , "ppp")
  await ShareModel.where(whereObject).updateMany({
    $set: queryObj,
  });

  let activityData = {
    activityType: "UpdateCasinoShare",
    oldActivity: userData.userCasinoShare,
    newActivity: casinoShare,
    remark: `User casino share  updated from  (${userData.userCasinoShare}) to (${casinoShare}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
  return true;
}

async function updateMatkaShare(userData, matkaShare, loggedInUser) {
  const creatorId = userData.creatorId;
  const creatorData = await UserModel.findById(creatorId);
  const creatorShareData = await ShareModel.findOne({
    userId: creatorId,
  });

  if (matkaShare > creatorShareData.userMatkaShare) {
    return {
      status: "error",
      msg: `${userData.userType} share can not be greater than ${creatorData.userType} share`,
    };
  }

  let queryObj = {
    userMatkaShare: matkaShare,
  };
  await UserModel.where("_id", userData._id).updateMany({
    $set: queryObj,
  });

  let fieldType = `${userData.userType}MatkaShare`;
  queryObj = {
    [fieldType]: matkaShare,
  };

  let fieldTypeId = `${userData.userType}Id`;
  let whereObject = {
    [fieldTypeId]: userData._id,
  };
  await ShareModel.where(whereObject).updateMany({
    $set: queryObj,
  });

  let activityData = {
    activityType: "UpdateMatkaShare",
    oldActivity: userData.userMatkaShare,
    newActivity: matkaShare,
    remark: `User matka share  updated from  (${userData.userMatkaShare}) to (${matkaShare}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
  return true;
}

async function updateIntCasinoShare(userData, intCasinoShare, loggedInUser) {
  const creatorId = userData.creatorId;
  const creatorData = await UserModel.findById(creatorId);
  const creatorShareData = await ShareModel.findOne({
    userId: creatorId,
  });

  if (intCasinoShare > creatorShareData.intCasinoShare) {
    return {
      status: "error",
      msg: `${userData.userType} share can not be greater than ${creatorData.userType} share`,
    };
  }

  let queryObj = {
    intCasinoShare: intCasinoShare,
  };
  await UserModel.where("_id", userData._id).updateMany({
    $set: queryObj,
  });

  let fieldType = `${userData.userType}IntCasinoShare`;
  queryObj = {
    [fieldType]: intCasinoShare,
  };

  let fieldTypeId = `${userData.userType}Id`;
  let whereObject = {
    [fieldTypeId]: userData._id,
  };
  await ShareModel.where(whereObject).updateMany({
    $set: queryObj,
  });

  let activityData = {
    activityType: "UpdateIntCasinoShare",
    oldActivity: userData.intCasinoShare,
    newActivity: intCasinoShare,
    remark: `User int Casino share  updated from  (${userData.intCasinoShare}) to (${intCasinoShare}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username}`;
  await InsertUserActivity(activityData, userData);
  return true;
}

const getUserAccountDetails = async (userId) => {
  let userDetails = {};
  if (siteSetting.IS_REDIS) {
    userDetails = await client.hget(userId, "accountDetails");
  }
  if (!userDetails || userDetails == []) {
    userDetails = await AccountCoinsModel.findOne({ userId: userId });

    try {
      await client.hmset(
        userId + "",
        "accountDetails",
        JSON.stringify(userDetails)
      );
    } catch (error) {
      console.log("Save Account Details in redis error in user Service", error);
    }
    delete userDetails._id;
    delete userDetails.__v;
  } else {
    userDetails = JSON.parse(userDetails);
  }
  return returnResponse("success", "fetched", userDetails);
};

const shareDetails = async (parentData, userId) => {
  let field = `${parentData.userType}Id`;
  let queryObj = {
    [field]: parentData.userId,
    ["userId"]: userId,
  };


  _d(queryObj , "queryObj")
  let shareDetails = await ShareModel.findOne(queryObj);
  if (!shareDetails) {
    return returnResponse("error", "Details Not Found");
  } else {
    return returnResponse("success", "fetched", shareDetails);
  }
};

const userStatement = async (parentData, bodyData) => {
  userId = bodyData?.userId;
  if (userId) {
    let count = await isValidUserData(parentData, userId);
    if (count !== 1) {
      return returnResponse(
        "error",
        "you are not authorized to fetch statement details of this user"
      );
    }
  } else {
    userId = parentData.userId;
  }

  userId = new ObjectId(userId);
  let queryObj = {
    ["userId"]: userId,
  };

  if (bodyData.fromDate && bodyData.toDate) {
    queryObj.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  if (bodyData.statementFor) {
    queryObj.statementFor = bodyData.statementFor;
  }

  if (bodyData.statementFor && bodyData.statementFor == "profitLoss") {
    queryObj.statementFor = { $ne: "ACCOUNT_STATEMENT" };
  }

  if (bodyData.sportsType) {
    queryObj.sportsType = bodyData.sportsType;
  }

  let skip = 0;
  let limit = 0;
  let totalCount = 0;
  let skipRecords = 0;
  let limitRecords = 0;

  if (bodyData.pageNo && bodyData.size) {
    skip = bodyData.size * (bodyData.pageNo - 1);
    limit = bodyData.size;
    totalCount = await StatementModel.countDocuments(queryObj);
    skipRecords = bodyData.pageNo * limit;
    limitRecords = totalCount - bodyData.pageNo * limit;
  }

  let dateQuery = {};

  if (bodyData.fromDate && bodyData.toDate) {
    dateQuery = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    queryObj.date = dateQuery;
  }

  queryObj.$and = [
    {
        $nor: [
            { isComm: { $in: [true, 1] }, amount: { $eq: 0 } }
        ]
    }
];

  let statementDetails = await StatementModel.find(queryObj)
    .sort({ _id: -1 })
    .skip(skip)
    .limit(limit);

    
  let totalAmount = 0;
  let totalWhere = queryObj;

  let finalData = [];
  skip = skip < 0 ? 0 : skip;
  limit = limit < 0 ? 0 : limit;
  skipRecords = skipRecords < 0 ? 0 : skipRecords;
  let skippedRecordsGroup = [
    { $skip: skipRecords },
    { $limit: limitRecords },
    {
      $group: {
        _id: null,
        totalSkipped: { $sum: "$amount" },
      },
    },
  ];

  if (limitRecords < 1) {
    skippedRecordsGroup = [
      { $skip: skipRecords },
      {
        $group: {
          _id: null,
          totalSkipped: { $sum: "$amount" },
        },
      },
    ];
  }




  if (bodyData.fromDate && bodyData.toDate) {
    delete totalWhere.date;

    // const fromDate = new Date(bodyData.fromDate);
    //             const beforeFromDate = new Date(fromDate);
    //             beforeFromDate.setUTCHours(0, 0, 0, 0);
    //             const skipToDate = beforeFromDate; 

                const fromDate = new Date(bodyData.fromDate); // e.g., '2025-04-23'
                const beforeFromDate = new Date(fromDate);
                beforeFromDate.setHours(0, 0, 0, 0); // this is in local time (typically IST in India server), use UTC for consistency
                const utcBeforeFromDate = new Date(beforeFromDate.getTime() - (5.5 * 60 * 60 * 1000)); // subtract IST offset
                let skipToDate = utcBeforeFromDate;
                
    skippedRecordsGroup = [
      {
        $match: {
          createdAt: {
            $lt: skipToDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalSkipped: { $sum: "$amount" },
        },
      },
    ];
  }




// totalWhere.amount = {
//   $ne : 0
// }


  if (statementDetails && statementDetails.length > 0) {
    var res = await StatementModel.aggregate([
      {
        $match: totalWhere,
      },
      {
        $sort: { _id: -1 },
      },
      {
        $facet: {
          skippedRecords: skippedRecordsGroup,
        },
      },
    ]);
    const totalSkipped =
      res[0].skippedRecords.length > 0
        ? res[0].skippedRecords[0].totalSkipped
        : 0;
    totalAmount = totalSkipped;
    finalData.totalAmount = totalAmount;
  }

  if (bodyData.pageNo && bodyData.size) {
    statementDetails = {
      statementData: statementDetails,
      totalCount: totalCount,
      balanceAmount: totalAmount.toFixed(2),
    };
  }


  return returnResponse("success", totalAmount, statementDetails);
};

const userActivity = async (parentData, userId, bodyData = {}) => {
  if (userId) {
    let count = await isValidUserData(parentData, userId);
    if (count !== 1) {
      return returnResponse(
        "error",
        "you are not Authorized to fetch details of this user"
      );
    }
  } else {
    userId = parentData.userId;
  }
  let queryObj = {
    ["userId"]: userId,
  };

  if (bodyData.fromDate && bodyData.toDate) {
    queryObj.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  let activityDetails = await ActivityModel.find(queryObj)
    .sort({ _id: -1 })
    .select({
      username: 1,
      activityType: 1,
      oldActivity: 1,
      newActivity: 1,
      remark: 1,
      createdAt: 1,
      updatedAt: 1,
      operatorName: 1,
    });
  if (!activityDetails) {
    return returnResponse("error", "Details Not Found");
  } else {
    return returnResponse("success", "fetched", activityDetails);
  }
};

const userLoginActivity = async (parentData, userId, bodyData = {}) => {
  if (userId) {
    let count = await isValidUserData(parentData, userId);
    if (count !== 1) {
      return returnResponse(
        "error",
        "you are not Authorised to fetch details of this user"
      );
    }
  } else {
    userId = parentData.userId;
  }

  let queryObj = {
    ["userId"]: userId,
  };

  let total = await LoginActivityModel.countDocuments(queryObj);
  const size = bodyData?.size || total;
  const pageNo = bodyData?.pageNo || 1;
  let loginDetails = await LoginActivityModel.find(queryObj)
    .sort({ _id: -1 })
    .skip(size * (pageNo - 1))
    .limit(size)
    .allowDiskUse(true);

  if (!loginDetails) {
    return returnResponse("error", "Login Details Not Found");
  } else {
    return returnResponse("success", total, loginDetails);
  }
};

let userLedger = async (reqData) => {
  const bodyData = reqData.data;
  const currentUserData = reqData.userData;
  try {
    let query = {};
    let totalQuery = {};
    let checkUserId = currentUserData.userId
    if (bodyData.downlineUserId) {
     checkUserId =  query.userId = new ObjectId(bodyData.downlineUserId);
    } else {
     checkUserId =  query.userId = new ObjectId(currentUserData.userId);
    }

    if (bodyData.downlineUserType) {
      query.userType = data.downlineUserType;
    }

    let downLineuserData = await UserModel.findOne({ userId : checkUserId })
    if (downLineuserData[`${currentUserData.userType}Id`] != currentUserData.userId) {
      return returnResponse("error", "downline User Not Found");
    }


  
    query.isDeleted = 0;
    totalQuery.isDeleted = 0;
    if (bodyData.isDeleted && bodyData.isDeleted == 1) {
      query.isDeleted = 1;
      totalQuery.isDeleted = 1;
    }

    if (bodyData.fromDate && bodyData.toDate) {
      let whereDate  = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
      query.date = whereDate
      totalQuery.date = whereDate
    }

    if (bodyData.ledgerType) {
      query.ledgerType = bodyData.ledgerType;
      totalQuery.ledgerType = bodyData.ledgerType;
    }

    if (bodyData.isDirect && bodyData.isDirect == true) {
      let fetchUserIdData = bodyData.downlineUserId
        ? bodyData.downlineUserId
        : currentUserData.userId;
      const directUserData = await gettingDirectUserByUserId(fetchUserIdData);
      const directUserIdArray = directUserData.idArrayData;
      directUserIdArray.push(bodyData.downlineUserId);
      if (directUserIdArray) {
        query.userId = { $in: directUserIdArray };
        totalQuery.userId = { $in: directUserIdArray };
      }
    }
    

    try {
      let specific = {
        amount: 1,
        userType: 1,
        remark: 1,
        createdAt: 1,
        ledgerType: 1,
        eventName: 1,
        isDeleted: 1,
        userId: 1,
        createdAt: 1,
        marketId: 1,
        date: 1,
        eventId: 1,
        _id: 1,
      };

      returnData = {
        totalCoins: 0,
        creditAmount: 0,
        debitAmount: 0,
        calAmount: 0,
        sportLedger : 0,
        diamondCasinoLedger : 0,
        intCasinoLedger : 0,
        matkaLedger : 0,
        cashLedger : 0,
        ledgerData: [],
      };

      const ledgerData = await LedgerModel.find(query, specific).sort({
        _id: -1,
      });

      ledgerData &&
        ledgerData.map((ledgerData) => {
          returnData.calAmount += ledgerData.amount;
          returnData.totalCoins += ledgerData.amount;
          if (ledgerData.amount < 0) {
            returnData.debitAmount += ledgerData.amount;
          }
          if (ledgerData.amount > 0) {
            returnData.creditAmount += ledgerData.amount;
          }
        });

      let finalLedgerData = [];
      let balance = 0;
      let amount = 0;

      if (ledgerData) {
        ledgerData.map((ledger, ledgerKey) => {
          balance = returnData.calAmount - amount;
          amount += ledger.amount;
          ledger.balance = balance;

          let pushArray = {
            balance: balance,
            userId: ledger.userId,
            eventName: ledger.eventName,
            amount: ledger.amount,
            userType: ledger.userType,
            remark: ledger.remark,
            ledgerType: ledger.ledgerType,
            isDeleted: ledger.isDeleted,
            createdAt: ledger.createdAt,
            marketId: ledger.marketId,
            eventId: ledger.eventId,
            ledgerId: ledger._id,
            date: ledger.date,
          };
          finalLedgerData.push(pushArray);
        });
        returnData.ledgerData = finalLedgerData;
      }

      return returnResponse(
        "success",
        "Ledger List fetched Successfully",
        returnData
      );
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    return returnResponse("error", "Ledger Error", error);
  }
};

let lenaDena = async (reqData) => {
  const bodyData = reqData.data;
  const currentUserData = reqData.userData;
  try {
    let query = {};
    let totalQuery = {};
    const loggedUserpriority = UserTypes.indexOf(currentUserData.userType);
    const downlineUserType = UserTypes[loggedUserpriority - 1 + ""];
    const userWhere = {
      userType: downlineUserType,
      isDeleted: 0,
    };
    query = whereHelper(currentUserData, userWhere);

    if (bodyData.fetchUserType) {
      query[currentUserData.userType + "Id"] = currentUserData.userId;
      query.userType = bodyData.fetchUserType;
    }

    if (bodyData.downlineUserId && bodyData.downlineUserType) {
      query[bodyData.downlineUserType + "Id"] = bodyData.downlineUserId;
    }

    if (bodyData.isDirect) {
      let userData = await UserModel.find(
        { creatorId: new ObjectId(bodyData.userId) },
        { userId: 1, username: 1 }
      );
      let userIdIn = userData.map((user) => {
        return user.userId;
      });
      query.userId = {
        $in: userIdIn,
      };
      delete query.userType;
      delete query[currentUserData.userType + "Id"];
    }

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    const downlineUserData = await UserModel.find(query).select(
      "name , username , coins , userId , userType"
    );

    let userData = {};
    let userIdArray = {};
    if (downlineUserData) {
      let finalData = convertKeyObjectAndSeperateid(downlineUserData, "_id");
      userData = finalData.returnDataObject;
      userIdArray = finalData.idArray;
    }

    try {
      let playWhere = {
        userId: {
          $in: userIdArray,
        },
        isDeleted: 0,
      };

      let specific = {
        amount: 1,
        userType: 1,
        userId: 1,
      };

      let groupCond = {
        _id: "$userId",
        totalAmount: { $sum: "$amount" },
        settleAmount: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$ledgerType", "settle"] }],
              },
              "$amount",
              0,
            ],
          },
        },
      };

    
      var resData = await LedgerModel.aggregate([
        {
          $match: playWhere,
        },
        {
          $group: groupCond,
        },
        {
          $sort: {
            _id: 1, 
          },
        },
      ]);


      let finalData = [];

      if (resData) {
        resData.map((data, key) => {
          const pushData = {
            balance: data.totalAmount,
            settleAmount: data.settleAmount,
            userId: userData[data._id].userId,
            coins: userData[data._id].coins,
            name: userData[data._id].name,
            username: userData[data._id].username,
            userType: userData[data._id].userType,
          };
          finalData.push(pushData);
        });
      }

      return returnResponse(
        "success",
        "Ledger List fetched Successfully",
        finalData
      );
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    return returnResponse("error", "Ledger Error", error);
  }
};

let ledgerCreditDebit = async (reqData) => {
  const bodyData = reqData.data;
  const isCash = bodyData.isCash ? bodyData.isCash : false
  const currentUserData = reqData.userData;
  try {
    let query = {};
    let insertData = [];
    let where = {
      userId: bodyData.downlineUserId,
      userType: bodyData.downlineUserType,
    };

    if (bodyData.isDirect) {
      let userType = await UserModel.findOne({
        userId: new ObjectId(bodyData.downlineUserId),
      });
      where.userType = userType.userType;
    }
    

    query = whereHelper(currentUserData, where);

    let userDataId = await UserModel.findOne(query);

    if (!userDataId) {
      return returnResponse("error", "Downline User Not Found");
    }

    let eventName = `Cash Liya Done By  ${currentUserData.username} (${currentUserData.name}) To ${userDataId.username} (${userDataId.name})`;
    if (
      (userDataId.userType == "client" && bodyData.amount < 0) ||
      (userDataId.userType != "client" && bodyData.amount > 0)
    ) {
      eventName = `Cash Diya Done By  ${currentUserData.username} (${currentUserData.name}) To ${userDataId.username} (${userDataId.name})`;
    }

   

    where.ledgerType = "settle";
    where.remark = bodyData.remark;
    where.eventName = bodyData.eventName;
    // where.date = bodyData.date;

    where.date = moment(bodyData.date).startOf("day").valueOf();

    where.amount = bodyData.amount;
    where.eventName = eventName;
    insertData = await parentDataAppend(userDataId, where);



    await LedgerModel.create(insertData);

    let deposit = bodyData.hasOwnProperty("deposit");



    let updateCoinsData = {}

   

    if (deposit && bodyData.deposit) {
      const coins = bodyData.amount;
      const userId = bodyData.downlineUserId; // update user userId
      const parentData = currentUserData;
      const userRemark = bodyData.userRemark ? bodyData.userRemark : "";
      const transactionPassword = bodyData.transactionPassword
        ? bodyData.transactionPassword
        : "";

       
       updateCoinsData = await UpdateUserCoins(
        coins,
        userId,
        parentData,
        userRemark,
        transactionPassword,
        "",
        isCash
      );
      updateCoinsData = updateCoinsData.data
    }

    let isCrickTransaction = false;
    if (
      process.env.IS_CRICK_TRANSACTION &&
      process.env.IS_CRICK_TRANSACTION == "true"
    ) {
      isCrickTransaction = true;
    }


    if (isCrickTransaction) { 
      
      let COINS_DIVIDER = 100
      if(process.env.COINS_DIVIDER){
        COINS_DIVIDER = process.env.COINS_DIVIDER ? process.env.COINS_DIVIDER : 100
      }

      let coinsUpdate = Math.abs(
        (bodyData.amount / COINS_DIVIDER).toFixed(2)
      )


      let crickPushArray = []
      
      let userRemarkCrick = `${bodyData.remark}[${
        bodyData.amount < 0 ? "Cash Withdraw From" : "Cash Deposit To"
      }  ${userDataId.username} by ${currentUserData.username} of ${coinsUpdate} (${_date_time()})]`;
      let creatorData = await UserModel.findOne({
       userId : new ObjectId(userDataId.creatorId)
      })
      let creatorShareData = creatorData


      let crickUserTransaction = {
        amount: bodyData.amount,
        transactionType: "ledger",
        remarks: userRemarkCrick,
        userId: userDataId.userId,
        userType: userDataId.userType,
        ownerId: userDataId.ownerId,
        subownerId: userDataId.subownerId,
        superadminId: userDataId.superadminId,
        adminId: userDataId.adminId,
        subadminId: userDataId.subadminId,
        masterId: userDataId.masterId,
        superagentId: userDataId.superagentId,
        agentId: userDataId.agentId,
        clientId: userDataId.clientId,
        creatorId : userDataId.creatorId,
        [`${userDataId.userType}ProfitLoss`]: bodyData.amount,
        [`${creatorShareData.userType}ProfitLoss`]: bodyData.amount,
        [`${currentUserData.userType}ProfitLoss`]: bodyData.amount,
        [`${userDataId.userType}LedgerAmount`]: bodyData.amount,
        [`${creatorShareData.userType}LedgerAmount`]: bodyData.amount,
        [`${currentUserData.userType}LedgerAmount`]: bodyData.amount,
      };
     
      crickUserTransaction.isCash = true
      crickPushArray.push(crickUserTransaction)


      if(userDataId.userType == "client" && bodyData.amount > 0){
        let updateCrickAmount = -1 *  bodyData.amount
        let clientRemarkCrick = `${bodyData.remark} [${
         updateCrickAmount < 0 ? " Deposit To" : " Withdraw By"
        } Admin To ${currentUserData.username} of ${Math.abs(
          (updateCrickAmount / COINS_DIVIDER).toFixed(2)
        )}  (${_date_time()})]`;

         crickUserTransaction = {
          amount: updateCrickAmount,
          transactionType: "depositWithdrawal",
          remarks: `${clientRemarkCrick}`,
          [`${userDataId.userType}Id`]: userDataId.userId,
          [`${userDataId.userType}ProfitLoss`]: updateCrickAmount,
          [`${creatorShareData.userType}ProfitLoss`]: updateCrickAmount,
          [`${currentUserData.userType}ProfitLoss`]: updateCrickAmount,
          [`${userDataId.userType}LedgerAmount`]: updateCrickAmount,
          [`${creatorShareData.userType}LedgerAmount`]: updateCrickAmount,
          [`${currentUserData.userType}LedgerAmount`]: updateCrickAmount,
        };

        crickUserTransaction.isCash = true
        crickPushArray.push(crickUserTransaction)
      }


      await crickTransactionModel.create(crickPushArray);
      
      if(userDataId.userType == "client" && bodyData.amount < 0  && !isCash){
        await crickTransactionModel.deleteMany({
          _id :{$in : [updateCoinsData.crickTransactionCreatorId , updateCoinsData.crickTransactionUserId] }
        })
        await TransactionLogModel.deleteMany({
          _id :{$in : [updateCoinsData.creatorTransactionId] }
        })
        await updateCoinsTbl(userDataId.creatorId, currentUserData.userType);
      }

   }

    return returnResponse(
      "success",
      `Cash Transaction Entry Done Successfully For ${userDataId.name} (${userDataId.username}) By ${currentUserData.name} (${currentUserData.username})`
    );
  } catch (error) {
    console.log(error);
  }
};

let createDomain = async (reqData) => {
  const bodyData = reqData.data;
  try {
    let insertObj = {
      domainName: bodyData.domainName,
      domainUrl: bodyData.domainUrl,
      title: `Welcome to ${bodyData.domainName}`,
    };

    let existDomain = await DomainModel.countDocuments(insertObj);
    if (existDomain) {
      return returnResponse("error", "Domain Already Exist");
    }
    await DomainModel.create(insertObj);
    return returnResponse("success", `Domain Inserted Successfully`);
  } catch (error) {
    console.log(error);
  }
};

let DomainList = async () => {
  try {
    let domainList = await DomainModel.find();
    return returnResponse("success", "Fetch Successfully", domainList);
  } catch (error) {
    console.log(error);
    return returnResponse("error", "Some Error", error);
  }
};

let downlineUsersCount = async (userData) => {
  let where = whereHelper(userData);
  let groupCond = {
    _id: "$_id",
    subownerCount: {
      $sum: {
        $cond: [
          {
            $and: [{ $eq: ["$userType", "subowner"] }],
          },
          "$_id",
          0,
        ],
      },
    },
  };
  var res = await UserModel.aggregate([
    {
      $match: where,
    },
    {
      $group: groupCond,
    },
  ]);
  return res;
};

function isProviderAllowed(providerName, allowedProviders = []) {
  if (!providerName || !Array.isArray(allowedProviders)) return false;

  const name = providerName.toLowerCase();

  return allowedProviders.some(p =>
    name.includes(p.toLowerCase())
  );
}

let casinoLoginUrl = async (payLoad, loginUser , casinoData) => {
  try {

    let url = process.env.LOGIN_URL_INTERNATIONAL;
    let subProviderName = casinoData.subProviderName
    let providerName = casinoData.providerName

    let IS_EVOTUTION_OVER_INR = process.env.IS_EVOTUTION_OVER_INR == "true" ? true : "false"

    if (isProviderAllowed(providerName, onlyInrGamesAllowed) && IS_EVOTUTION_OVER_INR == true ) {
         url = process.env.LOGIN_URL_INR_INTERNATIONAL_FOR_EVOLUTION;
    } 
    
    if (isProviderAllowed(subProviderName, onlyInrGamesAllowed) && IS_EVOTUTION_OVER_INR == true ) {
         url = process.env.LOGIN_URL_INR_INTERNATIONAL_FOR_EVOLUTION;
    } 
    


    let loginData = await axios.post(url, payLoad);
    let token = "";
    let data = {};
    let returnData = {};
    if (loginData.data.data) {
      returnData = loginData.data.data;
    } else {
      returnData = loginData.data;
    }
    token = returnData.token;
    data = returnData;
    if (token) {
      await UserModel.updateOne(
        {
          _id: loginUser.userId,
        },
        {
          casinoToken: token,
        }
      );
      return returnResponse("success", "Data Fetched", data);
    } else {
      return returnResponse("error", "SomethingWentWrong in casino Login Url");
    }
  } catch (error) {
    console.log("fetch CasinoLoginUrl", error);
  }
};

let internationalCasinoBetsSave = async (payLoad, loginUser) => {
  try {
    await InternationalCasinoBetsModel.create(payLoad);
  } catch (error) {
    console.log("Save internationalCasinoBetsSave Error", error);
  }
};

let saveNotification = async (reqData) => {
  const bodyData = reqData.body;
  try {
    await NotificationModel.deleteMany({
      for: bodyData.for,
    });

    delete bodyData.id;
    await NotificationModel.create(bodyData);
    if (siteSetting.IS_REDIS) {
      await client.set(`notification${bodyData.for}`, JSON.stringify(bodyData));
    }
    return returnResponse("success", `notification Inserted Successfully`);
  } catch (error) {
    console.log(error);
  }
};

let notificationList = async (bodyData) => {
  try {
    let NotificationList = {};
    if (!bodyData.for) {
      NotificationList = await NotificationModel.find();
      return returnResponse("success", "Fetch Successfully", NotificationList);
    }
    if (siteSetting.IS_REDIS && bodyData.for) {
      NotificationList = await client.get(`notification${bodyData.for}`);
      NotificationList = JSON.parse(NotificationList);
    } else {
      NotificationList = await NotificationModel.findOne({ for: bodyData.for });
    }
    return returnResponse("success", "Fetch Successfully", NotificationList);
  } catch (error) {
    console.log(error);
    return returnResponse("error", "Some Error", error);
  }
};

const userParentShareDetails = async (userId) => {
  return await ShareModel.findOne(
    {
      userId: userId,
    },
    {
      ownerId: 0,
      agentId: 0,
      subownerId: 0,
      superadminId: 0,
      subadminId: 0,
      subadminId: 0,
      masterId: 0,
      superagentId: 0,
    }
  );
};


let casinoBetRequest = async (bodyData, userData, casinoData) => {
  const betData = {
    gameId: bodyData.gameId,
    debitAmount: bodyData.actualDebitAmount,
    actualBetAmount: bodyData.debitAmount,
    betType: bodyData.betType,
    reqId: bodyData.reqId,
    roundId: bodyData.roundId,
    transactionId: bodyData.transactionId,
    token: bodyData.token,
    clientId: userData._id,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
  };

  const existBet = await InternationalCasinoBetsModel.countDocuments(betData);


  if (existBet >= 1 && casinoData.providerName != "SAP" ) {
    return returnResponse(
      "error",
      "Bet Already Exist",
      "duplicate_transaction"
    );
  }

  let isQtech = false;
  if (bodyData.isQtech) {
    isQtech = true;
  }

  if (isQtech) {
    let qtechGameList = await client.hget(`qtechGameList`, bodyData.gameId);
    if (!qtechGameList || qtechGameList == null || qtechGameList.length < 5) {
      qtechGameList = await qtechGamesModel.findOne(
        {
          gameId: bodyData.gameId,
        },
        {
          freeRoundSupport: 1,
          demoSupport: 1,
          gameId: 1,
          name: 1,
          providerName: 1,
          subCategory: 1,
          providerId: 1,
        }
      );
      if (siteSetting.IS_REDIS) {
        await client.hmset(
          `qtechGameList`,
          bodyData.gameId,
          JSON.stringify(qtechGameList)
        );
      }
    } else {
      qtechGameList = JSON.parse(qtechGameList);
    }
    betData.gameName = qtechGameList.name;
    betData.providerName = qtechGameList.providerName;
    betData.subProviderName = qtechGameList.providerName;
    betData.gameCode = qtechGameList.gameId;
  }else {
      betData.gameName = casinoData.gameName;
      betData.providerName = casinoData.providerName;
      betData.subProviderName = casinoData.subProviderName;
      betData.gameCode = casinoData.gameCode;
  }
  
  betData.userInfo = {
    username: userData.username,
    name: userData.name,
  };
  await InternationalCasinoBetsModel.create(betData);
  return returnResponse("success", "successfully bet inserted", betData);
};

const casinoResultRequest = async (bodyData, userData, casinoData) => {
  const betData = {
    gameId: bodyData.gameId,
    betType: bodyData.betType,
    roundId: bodyData.roundId,
    transactionId: bodyData.transactionId,
    token: bodyData.token,
    clientId: userData._id,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
    isDeleted: false,
  };
  const existBet = await InternationalCasinoBetsModel.find(betData);

  if (existBet.length < 1) {
    return returnResponse("error", "Bet Not Exist", "transaction_not_exist");
  }

  let betDetails = existBet[0];

  if (casinoData.providerName != "SAP") {
    if (betDetails.isRollback) {
    return returnResponse("error", "Bet Not Exist", "transaction_invalid");
  }

  if (betDetails.isDeclare) {
    return returnResponse("error", "duplicate Bet", "duplicate_transaction");
  }
    
}
    
  let isQtech = false;
   if (isQtech) {
    let qtechGameList = await client.hget(`qtechGameList`, bodyData.gameId);
    if (!qtechGameList) {
      qtechGameList = await qtechGamesModel.findOne(
        {
          gameId: bodyData.gameId,
        },
        {
          freeRoundSupport: 1,
          demoSupport: 1,
          gameId: 1,
          name: 1,
          providerName: 1,
          subCategory: 1,
          providerId: 1,
        }
      );
      if (siteSetting.IS_REDIS) {
        await client.hmset(
          `qtechGameList`,
          bodyData.gameId,
          JSON.stringify(qtechGameList)
        );
      }
    } else {
      qtechGameList = JSON.parse(qtechGameList);
    }
    betData.gameName = qtechGameList.name;
    betData.providerName = qtechGameList.providerName;
    betData.subProviderName = qtechGameList.providerName;
    betData.gameCode = qtechGameList.gameId;
    casinoData.gameName = qtechGameList.name;
    casinoData.subProviderName = qtechGameList.providerName;
  } else {
    betData.gameName = casinoData.gameName;
    betData.providerName = casinoData.providerName;
    betData.subProviderName = casinoData.subProviderName;
    betData.gameCode = casinoData.gameCode;
   }
  
  let insertAmount = -1 * betDetails.debitAmount;
  let creditAmount = bodyData.actualCreditAmount;
  if (creditAmount > 0) {
    insertAmount = creditAmount - betDetails.debitAmount;
  }

  let statementDataCreator = {
    amount: insertAmount,
    sportType : "casino",
    marketId: betData.roundId,
    roundId: bodyData.roundId,
    eventId: betData.gameCode,
    selectionId: betData.transactionId,
    oldAmount: userData.coins,
    newAmount: userData.coins + insertAmount,
    statementFor: "internationalCasino",
    sportsType: "casino",
    gameType: `${casinoData.gameName} (${casinoData.subProviderName})`,
    userRemark: `CasinoBet Result For ${betData.gameName}(${betData.subProviderName}) In RoundId (${bodyData.roundId}) With Transaction Id (${bodyData.transactionId})`,
    remark: `${betData.gameName}(${betData.subProviderName}) In RoundId (${bodyData.roundId})`,
    marketId: bodyData.roundId,
  };

  const instCasino = await InsertUserStatement(statementDataCreator, userData);


  let updateObj = {
    isDeclare: 1,
    betDetails: bodyData.betDetails ? bodyData.betDetails : {},
    creditAmount: bodyData.actualCreditAmount,
  };

  const updateBet = await InternationalCasinoBetsModel.updateMany(
    betData,
    updateObj
  );


  betData.debitAmount = betDetails.debitAmount

  betData.insertAmount = insertAmount
  return returnResponse(
    "success",
    "successfully Result Updated In casinoBet List",
    betData
  );
};

const casinoRollbackRequest = async (bodyData, userData, casinoData) => {
  const betData = {
    gameId: bodyData.gameId,
    betType: bodyData.betType,
    roundId: bodyData.roundId,
    transactionId: bodyData.transactionId,
    token: bodyData.token,
    clientId: userData._id,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    subownerId: userData.subownerId,
    subadminId: userData.subadminId,
    adminId: userData.adminId,
    superadminId: userData.superadminId,
    ownerId: userData.ownerId,
    isDeleted: false,
  };

  const existBet = await InternationalCasinoBetsModel.find(betData);

  if (existBet.length < 1) {
    return returnResponse("error", "Bet Not Exist", "transaction_not_exist");
  }

  let betDetails = existBet[0];

  if (betDetails.isRollback && casinoData.providerName!="SAP") {
    return returnResponse(
      "error",
      "Already Rollback Exist",
      "duplicate_transaction"
    );
  }

  betData.gameName = casinoData.gameName;
  betData.providerName = casinoData.providerName;
  betData.subProviderName = casinoData.subProviderName;
  betData.gameCode = casinoData.gameCode;

  let totalAmount =
    betDetails.creditAmount -
    betDetails.debitAmount +
    bodyData.actualRollbackAmount;

  if (totalAmount != 0) {
    let statementDataCreator = {
      amount: bodyData.actualRollbackAmount,
      sportType : "casino",
      marketId: betData.roundId,
      roundId: bodyData.roundId,
      eventId: betData.gameCode,
      selectionId: betData.transactionId,
      eventId: bodyData.gameId,
      oldAmount: userData.coins,
      newAmount: userData.coins + bodyData.actualRollbackAmount,
      statementFor: "internationalCasino",
      gameType: `${casinoData.gameName} (${casinoData.subProviderName})`,
      userRemark: `CasinoBet Rollback For ${betData.gameName}(${betData.subProviderName}) In RoundId (${bodyData.roundId}) With Transaction Id (${bodyData.transactionId})`,
      remark: `Coins updated from ${parseFloat(userData.coins)} to ${parseFloat(
        userData.coins + bodyData.actualRollbackAmount
      )} For Bet ${betData.gameName}(${betData.subProviderName}) In RoundId (${
        bodyData.roundId
      })`,
      marketId: bodyData.roundId,
    };
    await InsertUserStatement(statementDataCreator, userData);
  }

  let updateObj = {
    isRollback: 1,
    isDeclare: 1,
    rollbackAmount: bodyData.actualRollbackAmount
      ? bodyData.actualRollbackAmount
      : 0,
  };

  await InternationalCasinoBetsModel.updateMany(betData, updateObj);

  betData.insertAmount =  bodyData.actualRollbackAmount
  return returnResponse(
    "success",
    "successfully Rolllback Updated In casinoBet List",
    betData
  );
};

let userLenaDenaByledger = async (loginUser, bodyData) => {
  const userType = loginUser.userType;
  let userPriority = UserTypes.indexOf(userType);
  let downLineType = UserTypes[userPriority - 1];
  let query = {};
  query.userType = downLineType;
  try {
    let groupCond = {
      _id: `$${downLineType}Id`,
      totalAmount: { $sum: "$amount" },
    };

    if (bodyData.fromDate && bodyData.toDate) {
      query.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
    }

    returnData = {
      totalCoins: 0,
    };

    var resData = await LedgerModel.aggregate([
      {
        $match: query,
      },
      {
        $group: groupCond,
      },
    ]);

    let userNameData = [];

    let convertData = convertKeyObjectAndSeperateid(resData, "_id");
    resData = convertData.returnDataObject;
    let idArray = convertData.idArray;
    userNameData = await UserModel.find(
      {
        _id: {
          $in: idArray,
        },
      },
      {
        username: 1,
        name: 1,
        coins: 1,
        _id: 1,
      }
    );

    userNameData.map((data) => {
      if (resData[data._id]) {
        resData[data._id].name = `${data.username}(${data.name})`;
      }
    });

    return returnResponse(
      "success",
      "Lena Dena List fetched Successfully",
      resData
    );
  } catch (error) {
    console.log(error);
  }
};

const secureCode = async (loginUser, bodyData) => {
  userWhere = {
    username: bodyData.username,
  };
  query = whereHelper(loginUser, userWhere);
  const code = await UserModel.findOne(query).select(
    "otp , username , createdAt"
  );
  return returnResponse("success", "secure code fetch successfully", code);
};

const completeLedgerDetails = async (bodyData, userData) => {
  let marketId = bodyData.marketId;

  let fetchOdds = true;
  let fetchSession = true;

  let isCasino = false;
  if (bodyData.isCasino) {
    isCasino = true;
  }
  let queryWhere = {
    marketId: marketId,
  };

  let positionWhere = {
    marketId: marketId,
  };

  let splitMarketId = marketId.split("_");
  if (splitMarketId && splitMarketId.length == 2) {
    let dateType = splitMarketId[1];
    if (dateType == "odds") {
      fetchSession = false;
      queryWhere.marketId = splitMarketId[0];
    } else {
      fetchOdds = false;
      queryWhere.marketId = splitMarketId[0];
      let fromDate = new Date(`${splitMarketId[1]}T00:00:00.000Z`);
      const date = new Date(splitMarketId[1]);
      date.setDate(date.getDate() + 1);
      const nextDate = date.toISOString().split("T")[0];
      let toDate = new Date(`${nextDate}T00:00:00.000Z`);
      queryWhere.updatedAt = {
        $gte: fromDate,
        $lt: toDate,
      };
    }
  }

  queryWhere = await whereHelper(userData, queryWhere);
  positionWhere = await whereHelper(userData, positionWhere);

  let returnData = {};
  if (!isCasino) {
    let completeData = await profitLossPosition.findOne(positionWhere, {
      eventName: 1,
      isDeclare: 1,
      clientOddsAmount: 1,
      clientSessionAmount: 1,
      clientSessionComm: 1,
      clientOddsComm: 1,
    });
    returnData.completeData = completeData;


    

    if (fetchSession) {
      let sessionBetsData = await FancyBetModel.find(queryWhere, {
        amount: 1,
        selectionId: 1,
        decisionRun: 1,
        sessionName: 1,
        odds: 1,
        run: 1,
        isComm: 1,
        isDeclare: 1,
        isDeleted: 1,
        deletedRemark: 1,
        createdAt: 1,
        updatedAt: 1,
        date: 1,
        type: 1,
        gtype: 1,
        fancyType: 1,
      });
      sessionBetsData = JSON.parse(JSON.stringify(sessionBetsData));
      let sessionTurnOver = 0;
      sessionBetsData = sessionBetsData.map((data, key) => {

        delete data._id;
        let profitLoss = 0;

        if (!data.isDeleted && data.isDeclare) {
          if (data.decisionRun >= data.run && data.type == "Y") {
            profitLoss += Math.round(data.amount * data.odds);
          } else if (data.decisionRun >= data.run && data.type == "N") {
            profitLoss += Math.round(-1 * data.amount * data.odds);
          } else if (data.decisionRun < data.run && data.type == "Y") {
            profitLoss += Math.round(-1 * data.amount);
          } else if (data.decisionRun < data.run && data.type == "N") {
            profitLoss += Math.round(data.amount);
          }


          if (data.fancyType == "oddeven") {
            profitLoss = 0;
          let oddEvenType = "odd"
            if (data.decisionRun % 2 === 0) {
              oddEvenType = "even"
            }

          if (data.odds > 1) {
            data.odds = data.odds - 1
          }
    
          if (data.type == "Y" && oddEvenType == "even") {
              profitLoss +=
              data.amount * Number(data.odds);
          } else if (data.type == "Y" && oddEvenType == "odd") {
              profitLoss +=
              -1 * data.amount
          } else if (data.type == "N" && oddEvenType == "even") {
              profitLoss +=
              -1 * data.amount
          } else if (data.type == "N" && oddEvenType == "odd") {

              profitLoss +=
              data.amount * (Number(data.odds))
          }
            
            _d(profitLoss)
            
          }






          // _d(data)
          sessionTurnOver += data.amount;
        }







        data["profitLoss"] = profitLoss;
        return data;
      });



      returnData.sessionTurnOver = sessionTurnOver;
      returnData.sessionBetsData = sessionBetsData;
    }

    let inData = [0, false];
    if (bodyData.isDeleted == 1 || bodyData.isDeleted == true) {
      inData = [1, true];
    }
    queryWhere.isDeleted = { $in: inData };


    
    if (fetchOdds) {
      let oddsBetsData = await OddsBetModel.find(queryWhere, {
        amount: 1,
        selectionId: 1,
        decisionSelectionId: 1,
        teamName: 1,
        odds: 1,
        oddsType: 1,
        type: 1,
        isComm: 1,
        isDeclare: 1,
        isDeleted: 1,
        deletedRemark: 1,
        createdAt: 1,
        profit: 1,
        loss: 1,
        date: 1,
        positionInfo: 1,
      });
      oddsBetsData = JSON.parse(JSON.stringify(oddsBetsData));

      oddsBetsData.map((data, key) => {
        let profitLoss = 0;
        delete data._id;
        data.profitLoss;
        if (data.positionInfo[data.selectionId]) {
          profitLoss = data.positionInfo[data.selectionId];
        }
        data.profitLoss = profitLoss;
        return data;
      });
      returnData.oddsBetsData = oddsBetsData;
    }
  }

  return returnData;
};

const exposureDataList = async (bodyData, userData) => {
  let queryWhere = {
    forBet: 1,
    isDeclare: 0,
  };

  if (bodyData.downlineUserId && bodyData.downlineUserType) {
    queryWhere[bodyData.downlineUserType + "Id"] = new ObjectId(
      bodyData.downlineUserId
    );
  }
  queryWhere = await whereHelper(userData, queryWhere);
  let exposureData = await TransactionLogModel.find(queryWhere, {
    amount: 1,
    remarks: 1,
    gameType: 1,
    marketId: 1,
    isComm: 1,
    selectionId: 1,
    createdAt: 1,
  });
  return exposureData;
};

let deleteUserLedger = async (reqData) => {
  const bodyData = reqData.data;
  const currentUserData = reqData.userData;
  const JoiSchema = Joi.object({
    downlineUserId: Joi.string().required(),
    ledgerId: Joi.string().required(),
  }).options({ abortEarly: false });
  const { error } = JoiSchema.validate(bodyData);
  if (error) {
    const errorMessages = error.details.map((detail) => detail.message);
    return SendResponse(res, "error", "Failed In validation", errorMessages);
  }
  try {
    let query = {
      _id: new ObjectId(bodyData.ledgerId),
      ledgerType: "settle",
    };
    query = await whereHelper(currentUserData, query);

    let checkLedger = await LedgerModel.findOne(query);


    if (!checkLedger) {
      return returnResponse(
        "error",
        "you are not authorised to delete this user ledger"
      );
    }

    await LedgerModel.updateOne(query, {
      isDeleted: true,
    });

    return returnResponse("success", "ledger Deleted successfully updated");
  } catch (error) {
    return returnResponse("error", "ledger Deleted Error", error);
  }
};


const userSportsSetting = async (bodyData, loginData) => {
  let userId = new ObjectId(bodyData.downlineUserId);
  let userData = await UserModel.findOne({ userId });
  const creatorId = userData.creatorId;
  let creatorSettingData = await SportsSettingModel.findOne({
    userId: new ObjectId(creatorId),
  });
  delete bodyData.downlineUserId;

  const condition = { userId: new ObjectId(userData.userId) };
  let updateUserWhere = whereHelper(loginData, condition);


  const sportsFlags = [
    "isCricket",
    "isIntCasino",
    "isMatka",
    "isPolitics",
    "isCasino",
    "isFootball",
    "isTennis",
    "isHourse",
    "isGreyHound",
    "isKabbadi",
    "isToss",
    "isFancy",
    "isFigure",
    "isMatchOdds",
    "isEvenOdds",
    "isCupWiner",
    "isUnderOverGoal",
    "isSoccerMatchOdds",
  ];

  finalUpdateSportsFlag = []
  sportsFlags.forEach((key) => {
    if (creatorSettingData?.[key] === false && bodyData[key] === true) {
      delete bodyData[key];
    }
  });

  let maximumAmountUpdatePromise = [];
  const maxAmountFields = [
      "soccerMaxAmount",
      "tennisMaxAmount",
      "cricketMaxAmount",
      "greyhoundMaxAmount",
      "hourseMaxAmount",
      "racesMaxAmount",
      "bookmakerMaxAmount",
      "fancyMaxAmount",
      "casinoMaxAmount"
  ];
  
  maxAmountFields.forEach((key) => {
    if (
      bodyData[key] !== undefined &&
      creatorSettingData?.[key] !== undefined
    ) {
      if (bodyData[key] > creatorSettingData[key]) {
        delete bodyData[key];
      }
    }
  });



   Object.assign(bodyData, {
    userId: userData.userId,
    userType: userData.userType,
    agentId: userData.agentId,
    superagentId: userData.superagentId,
    masterId: userData.masterId,
    adminId: userData.adminId,
    subadminId: userData.subadminId,
    superadminId: userData.superadminId,
    subownerId: userData.subownerId,
    ownerId: userData.ownerId,
  });
  
  const updatedDoc = await SportsSettingModel.updateMany(
    {userId : new ObjectId(userData.userId)},
    { $set: bodyData },
    { upsert: true }
  );
  const cacheKey = `sportsSetting:${userData.userId}`;
  await client.del(cacheKey);

let downlineUserWhere = {
     [`${userData.userType}Id`] : new ObjectId(userData.userId)
}
  
maxAmountFields.forEach(field => {
  if (bodyData.hasOwnProperty(field)) {
        downlineUserWhere = {
          [`${userData.userType}Id`]: new ObjectId(userData.userId),
          // [field]: { $gt: bodyData[field] },
        },
    maximumAmountUpdatePromise.push(
      SportsSettingModel.updateMany(
        downlineUserWhere,
        { $set: { [field]: bodyData[field] } }
      )
    );
  }
});
  
await Promise.all(maximumAmountUpdatePromise);
  
  let flagUpdatePromise = []
    sportsFlags.forEach(field => {
      if (bodyData.hasOwnProperty(field)) {
          downlineUserWhereFlag = {
              [`${userData.userType}Id`]: new ObjectId(userData.userId),
          },
            flagUpdatePromise.push(
              SportsSettingModel.updateMany(
                downlineUserWhereFlag,
                { $set: { [field]: bodyData[field] } }
              )
            );
        }
    });
    await Promise.all(flagUpdatePromise);


  await ActivityModel.create({
     username: userData.username,
     userType:userData.userType,
     userId:userData.userId,
     activityType: "sportsSetting",
     oldActivity: "",
     newActivity: "",
     remark: "",
     operatorName: `${userData.creatorName}`,
  })
  
  return returnResponse("success", "userSportsSetting successfully updated");

};


const getUserSportsSetting = async (bodyData, loginData, userId) => {
  if (!userId) {
    userId = new ObjectId(bodyData.downlineUserId);
  }
  const cacheKey = `sportsSetting:${userId}`;
  let cachedData = await client.get(cacheKey);
  if (cachedData) {
    return returnResponse(
      "success",
      "userSportsSetting fetched from cache",
      JSON.parse(cachedData)
    );
  }
  
  let where = await whereHelper(loginData, { userId });

  let settingData = await SportsSettingModel.findOne(where);
  if (settingData) {
    await client.set(cacheKey, JSON.stringify(settingData), "EX", 36000);
  }
  return returnResponse(
    "success",
    "userSportsSetting fetched from DB",
    settingData
  );
};

const userConfig = async (bodyData, loginData) => {
  let userId = new ObjectId(bodyData.userId);
  let where = await whereHelper(loginData, { userId: userId });
  let userData = await UserModel.findOne(where);
  if (!userData) {
    return returnResponse(
      "error",
      "you are not authorised to update this user"
    );
  }
  let creatorId = userData.creatorId;

  const creatorConfigData = await sportsConfigModel.findOne({
    userId: creatorId,
    apiFor: bodyData.apiFor,
    type: bodyData.type,
  });

  if (!creatorConfigData) {
    return returnResponse("error", "parentData Not Found");
  }

  if (creatorConfigData.minBet > bodyData.minBet) {
    return returnResponse(
      "error",
      "Min bet can not be less then parent minBet"
    );
  }

  if (creatorConfigData.betDelay > bodyData.betDelay) {
    return returnResponse(
      "error",
      "bet Delay can not be less then parent betDelay"
    );
  }

  if (bodyData.maxBet > creatorConfigData.maxBet) {
    return returnResponse(
      "error",
      "Max bet can not be greater then parent maxBet"
    );
  }

  if (bodyData.maxProfit > creatorConfigData.maxProfit) {
    return returnResponse(
      "error",
      "Max Profit can not be greater then parent maxProfit"
    );
  }

  if (bodyData.maxMarketProfit > creatorConfigData.maxMarketProfit) {
    return returnResponse(
      "error",
      "maxMarketProfit Profit can not be greater then parent maxMarketProfit"
    );
  }

  if (bodyData.maxLiability > creatorConfigData.maxLiability) {
    return returnResponse(
      "error",
      "maxLiability Profit can not be greater then parent maxLiability"
    );
  }

  if (bodyData.maxMarketLiability > creatorConfigData.maxMarketLiability) {
    return returnResponse(
      "error",
      "maxMarketLiability Profit can not be greater then parent maxMarketLiability"
    );
  }

  if (bodyData.commissionIn > creatorConfigData.commissionIn) {
    return returnResponse(
      "error",
      "commissionIn Profit can not be greater then parent commissionIn"
    );
  }

  if (bodyData.commissionOut > creatorConfigData.commissionOut) {
    return returnResponse(
      "error",
      "commissionOut Profit can not be greater then parent commissionOut"
    );
  }

  let updateData = {
    commissionOut: bodyData.commissionOut,
    commissionIn: bodyData.commissionIn,
    maxMarketLiability: bodyData.maxMarketLiability,
    maxLiability: bodyData.maxLiability,
    maxMarketProfit: bodyData.maxMarketProfit,
    maxLiability: bodyData.maxLiability,
    maxMarketProfit: bodyData.maxMarketProfit,
    maxProfit: bodyData.maxProfit,
    maxBet: bodyData.maxBet,
    betDelay: bodyData.betDelay,
    minBet: bodyData.minBet,
  };

  let whereObj = {
    apiFor: bodyData.apiFor,
    type: bodyData.type,
  };

  whereObj = whereHelper(userData, whereObj);
  
  if (bodyData.key != "downline") {
    whereObj.userId = userData._id;
  }

  await sportsConfigModel.where(whereObj).updateOne({
    $set: updateData,
  });

  return returnResponse(
    "success",
    `userConfig for ${userData.username} updated successfully`
  );
};

const getUserConfig = async (where) => {
  const creatorConfigData = await sportsConfigModel.find(where);
  return returnResponse("success", `data get successfully`, creatorConfigData);
};

const clientBetList = async (whereObj) => {
  try {
    whereObj.isDeleted = 0;
    let clientId = whereObj.clientId;
    let marketId = whereObj.marketId;
    let oddsSendData = [];
    let oddsData = await client.get(`${clientId}_oddsData_${marketId}`);
    if (oddsData) {
      oddsSendData = JSON.parse(oddsData);
    } else {
      oddsSendData = await OddsBetModel.find(whereObj, {
        amount: 1,
        selectionId: 1,
        teamName: 1,
        odds: 1,
        oddsType: 1,
        type: 1,
        positionInfo: 1,
      });
      if (oddsSendData) {
        await client.set(
          `${clientId}_oddsData_${marketId}`,
          JSON.stringify(oddsSendData)
        );
        await client.expire(`${clientId}_oddsData_${marketId}`, 24 * 60 * 60);
      }
    }

    let fancySendData = [];
    let fancyData = await client.get(`${clientId}_fancyData_${marketId}`);
    if (fancyData) {
      fancySendData = JSON.parse(fancyData);
    } else {
      whereObj.isDeleted = 0;
      fancySendData = await FancyBetModel.find(whereObj, {
        amount: 1,
        selectionId: 1,
        sessionName: 1,
        odds: 1,
        run: 1,
        isComm: 1,
        isDeclare: 1,
        type: 1,
        decisionRun:1,
        profitLossAmount : 1,
        gtype : 1,
        fancyType : 1,
      });

      if (fancySendData) {
        await client.set(
          `${clientId}_fancyData_${marketId}`,
          JSON.stringify(fancySendData)
        );
        await client.expire(`${clientId}_fancyData_${marketId}`, 24 * 60 * 60);
      }
    }

    returnData = {
      fancyBetData: fancySendData,
      oddsBetData: oddsSendData,
    };

    return returnResponse("success", `data get successfully`, returnData);
  } catch (error) {}
};

const downlineCountAndLimit = async (req, res) => {
  const bodyData = req.body;
  const loggedUserData = req.loggedInUser;
  let userId = loggedUserData.userId;
  let userType = loggedUserData.userType;

  if (bodyData.userId) {
    userId = bodyData.userId
  }

  if (bodyData.userType) {
    userType = bodyData.userType
  }

  let field = `${userType}Id`;

  let where = await whereHelper(loggedUserData, {
     [field] : new ObjectId(userId)
  });
  
   if (bodyData.fromDate && bodyData.toDate) {
      where.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
   }
  
  let downlineUserType = bodyData.downlineUserType
  
  let downlineLineData = await getUpperLineAndDownlineOfUser(downlineUserType)

  let downlineUserTypeForDownline = downlineLineData.downlineUserType
  where.userId = {
        $ne: new ObjectId(userId)
  };

  if (bodyData.userIdArray && bodyData.userIdArray) {
    where.userId = bodyData.userIdArray
  }
  
let groupCond = {
    _id: `$${downlineUserType}Id`,
    downlineCountActive: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$userType", downlineUserTypeForDownline] },
              { $eq: ["$status", 1] }  // active
            ]
          },
          1,
          0
        ]
      }
    },
    downlineCountInActive: {
      $sum: {
        $cond: [
          {
            $and: [
              { $eq: ["$userType", downlineUserTypeForDownline] },
              { $eq: ["$status", 0] }  // Inactive
            ]
          },
          1,
          0
        ]
      }
    },
    totalCoins: {
      $sum: { $ifNull: ["$coins", 0] }
    }
};

  var resData = await UserModel.aggregate([
    {
      $match: where,
    },
    {
      $group: groupCond,
    },
  ]);


  if (res) {
    return SendResponse(res, "success", "" , resData);
  } else {
    return resData
  }
  
};


module.exports = {
  UserCreate,
  UserLogin,
  userUpdate,
  GetDetails,
  updateUserPassword,
  getUserList,
  verifyOtp,
  setUserRedisData,
  getUserAccountDetails,
  shareDetails,
  userStatement,
  userActivity,
  userBalance,
  userLedger,
  lenaDena,
  ledgerCreditDebit,
  createDomain,
  DomainList,
  casinoLoginUrl,
  internationalCasinoBetsSave,
  notificationList,
  saveNotification,
  userParentShareDetails,
  userDetailsByUserId,
  casinoBetRequest,
  casinoResultRequest,
  casinoRollbackRequest,
  userLenaDenaByledger,
  UserLoginCheck,
  userLoginActivity,
  secureCode,
  completeLedgerDetails,
  exposureDataList,
  deleteUserLedger,
  userSportsSetting,
  getUserSportsSetting,
  userSportsSetting,
  userConfig,
  getUserConfig,
  clientBetList,
  createShareDataByUserId,
  downlineCountAndLimit
};