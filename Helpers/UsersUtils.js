const Constants = require("../Common/Constants");
const UserModel = require("../Models/User/User.model");
const { InsertUserActivity } = require("../Helpers/StatementHelper");
const { _dx, _d, getSettingData } = require("./CommonHelper");
const { ObjectId } = require("mongodb");
const { client } = require("./RedisHelper");
const ShareModel = require("../Models/User/Share.model");
const directUserShareModel = require("../Models/User/directUserShareModel");
const bcrypt = require("bcrypt");

async function UsersCode(UserType, countUsertype) {
  let settingData = await getSettingData();
  let count = 100;
  let Name = "";
  switch (UserType.toLowerCase()) {
    case "owner":
      Name = "OW";
      break;

    case "subowner":
      Name = "SOW";
      break;

    case "superadmin":
      Name = "SU";
      break;

    case "admin":
      Name = "ADM";
      break;

    case "subadmin":
      Name = "AD";
      break;

    case "master":
      Name = "MA";
      break;

    case "superagent":
      Name = "SA";
      break;

    case "agent":
      Name = "A";
      break;

    case "client":
      Name = "C";
      break;
  }

  if (UserType == "client") {
    count = settingData.clientCount ? settingData.clientCount : count;
  } else {
    count = settingData.userCount ? settingData.userCount : count;
  }

  Name = settingData[`${UserType}Code`] ? settingData[`${UserType}Code`] : Name
  Name = Name.replace(/\s+/g, '')
   countUsertype = Number(count) + Number(countUsertype) +1;
  let Username = Name + countUsertype;
  return Username;
}

function isValidUser(userType) {
  return Constants.UserTypes.includes(userType);
}

async function isUserAuthorizedToUpdate(loggedInUser, userId) {
  const creatorId = loggedInUser.userId;
  const creatorType = loggedInUser.userType;
  let field = `${creatorType}Id`;
  let userData = await UserModel.findOne()
    .where("_id", userId)
    .where(field, creatorId);
  return userData ?? false;
}

async function updateUserStatus(oldStatus, newStatus, userData, loggedInUser) {
  let field = `${userData.userType}Id`;
  const update = await UserModel.where(field, userData._id).updateMany({
    $set: { status: newStatus, jwtToken: "", authenticateToken: null },
  });

  let where = {
    [field]: new ObjectId(userData._id),
  };

  let userList = await UserModel.find(where, {
    userId: 1,
  });

  userList.map(async (userData) => {
    await client.del(`${userData.userId}`);
    if (global.io) {
      global.io.to(userData.userId).emit("userLoggedOut", userData.userId);
    }
  });

  const showOldStatus = oldStatus === 1 ? "Active" : "Inactive";
  const showNewStatus = newStatus === 1 ? "Active" : "Inactive";

  let activityData = {
    activityType: "UpdateStatus",
    oldActivity: showOldStatus,
    newActivity: showNewStatus,
    remark: `User status updated from (${showOldStatus}) to (${showNewStatus}) by ${loggedInUser.name} (${loggedInUser.username})`,
  };
  userData.operatorId = loggedInUser.userId;
  userData.operatorName = `${loggedInUser.name} (${loggedInUser.username})`;
  const Activity = await InsertUserActivity(activityData, userData);
}

const isValidUserData = async (parentData, userId) => {
  let field = `${parentData.userType}Id`;
  let queryObj = {
    ["userId"]: userId,
    [field]: parentData.userId,
  };
  return (userCount = await UserModel.countDocuments(queryObj));
};

// const userCountDetails = async (userType, userId) => {
//   let field = `${userType}Id`;
//   let queryObj = {
//     status: 1,
//     [field]: new ObjectId(userId),
//   };
//   let groupCond = {
//     _id: `$${field}`,
//     sunOwnerCount: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "subowner"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     superadminCount: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "superadmin"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     subadminCount: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "subadmin"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     admin: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "admin"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     master: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "master"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     superagent: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "superagent"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     agent: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "agent"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//     client: {
//       $sum: {
//         $cond: [
//           {
//             $and: [{ $eq: ["$userType", "client"] }],
//           },
//           "$status",
//           0,
//         ],
//       },
//     },
//   };

//   var res = await UserModel.aggregate([
//     {
//       $match: queryObj,
//     },
//     {
//       $group: groupCond,
//     },
//   ]);


//   return res;
// };


// const userCountDetails = async (parentUserType, parentId) => {
//   try {
//     const allowedParentTypes = [
//       "owner",
//       "subowner",
//       "superadmin",
//       "admin",
//       "subadmin",
//       "master",
//       "superagent",
//       "agent",
//     ];

//     const childUserTypes = [
//       "subowner",
//       "superadmin",
//       "subadmin",
//       "admin",
//       "master",
//       "superagent",
//       "agent",
//       "client",
//     ];

//     if (!allowedParentTypes.includes(parentUserType)) {
//       throw new Error("Invalid parent user type");
//     }

//     const field = `${parentUserType}Id`;

//     const aggData = await UserModel.aggregate([
//       {
//         $match: {
//           [field]: new ObjectId(parentId),
//           userType: { $in: childUserTypes },
//           status: { $in: [0, 1] }, // 0 = inactive, 1 = active
//           isDeleted: false,
//         },
//       },
//       {
//         $group: {
//           _id: {
//             userType: "$userType",
//             status: "$status",
//           },
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     const result = {
//       subowner: { active: 0, inactive: 0, total: 0 },
//       superadmin: { active: 0, inactive: 0, total: 0 },
//       subadmin: { active: 0, inactive: 0, total: 0 },
//       admin: { active: 0, inactive: 0, total: 0 },
//       master: { active: 0, inactive: 0, total: 0 },
//       superagent: { active: 0, inactive: 0, total: 0 },
//       agent: { active: 0, inactive: 0, total: 0 },
//       client: { active: 0, inactive: 0, total: 0 },
//     };

//     for (const row of aggData) {
//       const type = row._id.userType;
//       const statusKey = row._id.status === 1 ? "active" : "inactive";

//       if (result[type]) {
//         result[type][statusKey] = row.count;
//         result[type].total += row.count;
//       }
//     }

//     return result;
//   } catch (error) {
//     throw error;
//   }
// };

const userCountDetails = async (parentUserType, parentId) => {
  try {
    const allowedParentTypes = [
      "owner",
      "subowner",
      "superadmin",
      "admin",
      "subadmin",
      "master",
      "superagent",
      "agent",
    ];

    const childUserTypes = [
      "subowner",
      "superadmin",
      "subadmin",
      "admin",
      "master",
      "superagent",
      "agent",
      "client",
    ];

    if (!allowedParentTypes.includes(parentUserType)) {
      throw new Error("Invalid parent user type");
    }

    const field = `${parentUserType}Id`;

    const aggData = await UserModel.aggregate([
      {
        $match: {
          [field]: new ObjectId(parentId),
          userType: { $in: childUserTypes },
          status: { $in: [0, 1] },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            userType: "$userType",
            status: "$status",
          },
          count: { $sum: 1 },
          coins: { $sum: "$coins" }, // coins sum
        },
      },
    ]);

    const result = {
      subowner: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      superadmin: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      subadmin: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      admin: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      master: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      superagent: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      agent: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
      client: { active: 0, inactive: 0, total: 0, activeCoins: 0, inactiveCoins: 0, totalCoins: 0 },
    };

    for (const row of aggData) {
      const type = row._id.userType;
      const statusKey = row._id.status === 1 ? "active" : "inactive";
      const coinsKey = row._id.status === 1 ? "activeCoins" : "inactiveCoins";

      if (result[type]) {
        result[type][statusKey] = row.count;
        result[type][coinsKey] = row.coins;

        result[type].total += row.count;
        result[type].totalCoins += row.coins;
      }
    }

    return result;
  } catch (error) {
    throw error;
  }
};

let userParentDetails = async (userId, idArray) => {
  if (!idArray) {
    let userDetails = await UserModel.findOne({
      _id: userId,
    });
    idArray = [
      userDetails.ownerId,
      userDetails.subownerId,
      userDetails.superadminId,
      userDetails.adminId,
      userDetails.subadminId,
      userDetails.masterId,
      userDetails.superagentId,
      userDetails.agentId,
      userId,
    ];
  }
  let returnObj = {};
  const parentDetails = await UserModel.find(
    {
      _id: { $in: idArray },
    },
    {
      _id: 1,
      userId: 1,
      userType: 1,
      name: 1,
      username: 1,
      userPriority: 1,
    }
  );

  parentDetails.map((mapData) => {
    returnObj[mapData.userType + "Id"] = mapData.userId;
    returnObj[mapData.userType + "userName"] = mapData.username;
    returnObj[mapData.userType + "name"] = mapData.name;
  });

  return returnObj;
};

const gettingDirectUserByUserId = async (creatorId, where = {}) => {
  let idArrayData = [];
  let userDataArray = {};
  let idArrayWhere = {};

  let clientId = [];
  let agentId = [];
  let superagentId = [];
  let masterId = [];
  let subadminId = [];
  let adminId = [];
  let superadminId = [];
  let subownerId = [];

  let userWhere = { creatorId: new ObjectId(creatorId) };

  if (where) {
    userWhere = { ...userWhere, ...where };
  }

  let userData = await UserModel.find(userWhere, {
    userId: 1,
    username: 1,
    name: 1,
    userType: 1,
    userMatchShare: 1,
    intCasinoShare: 1,
    userCasinoShare: 1,
    creatorShareData: 1,
    coins: 1,
    exposure: 1,
    profitLoss: 1,
  });

  userData.map((user) => {
    let userTypeIdArray = `${user.userType}Id`;
    if (!idArrayWhere.hasOwnProperty(userTypeIdArray)) {
      idArrayWhere[userTypeIdArray] = {
        $in: [],
      };
    }
    idArrayWhere[userTypeIdArray].$in.push(user.userId);
    idArrayData.push(new ObjectId(user.userId));
    userDataArray[user.userId] = user;
  });
  
  const returnData = {
    idArrayData: idArrayData,
    userDataArray: userDataArray,
    idArrayWhere: idArrayWhere,
  };
  return returnData;
};

const getUserIdByUsername = async (username) => {
  let userDetails = {};
  let status = "success";
  let msg = "";
  const isRedis = Constants.siteSetting.IS_REDIS;
  if (isRedis) {
    userDetails = await client.get(`${username}_USERNAME`);
  }
  if (userDetails && userDetails != null) {
    userDetails = JSON.parse(userDetails);
  } else {
    userDetails = await UserModel.findOne(
      { username: username },
      { username: 1, userId: 1, creatorId: 1, name: 1, userType: 1 }
    );

    if (userDetails) {
      await client.set(`${username}_USERNAME`, JSON.stringify(userDetails));
    } else {
      status = "error";
      msg = "user Details Not Found";
    }
  }
  return {
    status: status,
    msg: msg,
    userDetails: userDetails,
  };
};

const getShareDataByUserId = async (userId) => {
  let shareData = {};
  let status = "success";
  let msg = "";
  const isRedis = Constants.siteSetting.IS_REDIS;
  if (isRedis) {
    shareData = await client.get(`${userId}_SHARE_DATA`);
  }
  if (shareData && shareData != null) {
    shareData = JSON.parse(shareData);
  } else {
    shareData = await ShareModel.findOne({ userId: new ObjectId(userId) });
    if (shareData) {
      await client.set(`${userId}_SHARE_DATA`, JSON.stringify(shareData));
      await client.expire(`${userId}_SHARE_DATA`, 60 * 1000 * 60);
    } else {
      status = "error";
      msg = "shareData Not Found";
    }
  }
  return {
    status: status,
    msg: msg,
    shareData: shareData,
  };
};

const checkUserPassword = async (
  userId,
  password,
  userPassword = "",
  isCheck = true
) => {
  try {
    // _d(isCheck, "isCheck");
    let isPasswordCorrect = true;
    if (process.env.is_PASSWORD_CHECH_CRICK == "true" && isCheck) {
      if (!password) {
        isPasswordCorrect = false;
      }
      if (!userPassword) {
        let user = await UserModel.findOne(
          { _id: new ObjectId(userId) },
          { password: 1 }
        );
        userPassword = user.password;
      }

      isPasswordCorrect = await bcrypt.compare(password, userPassword);
    }
    return isPasswordCorrect;
  } catch (error) {}
};

const checkUserTransactionPassword = async (
  userId,
  bodyDataPassword,
  userTransactionPassword = ""
) => {
  try {
    let isPasswordCorrect = false;
      if (!userTransactionPassword) {
        let user = await UserModel.findOne(
          { _id: new ObjectId(userId) },
          { transactionPassword: 1 }
        );
        userTransactionPassword = user.transactionPassword;
      }
      isPasswordCorrect = await bcrypt.compare(bodyDataPassword, userTransactionPassword);
    return isPasswordCorrect;
  } catch (error) {}
};

const convertToOrQuery = async (input) => {
  const orQuery = [];
  for (const [key, condition] of Object.entries(input)) {
    if (condition && condition["$in"]) {
      orQuery.push({ [key]: { $in: condition["$in"] } });
    }
  }
  return { $or: orQuery };
};

const getShareChainData = async (userId) => {
  let sharingChain = {}
      sharingChain = await client.get(`sharingChain _${userId}`)
      
      if(!sharingChain || sharingChain == null || sharingChain == undefined){
        let existingData = await directUserShareModel.findOne({ userId: new ObjectId(userId) });
        if (existingData && existingData.shareData && existingData.shareData.length > 0) {
          if (existingData.shareData) {
            sharingChain = existingData.shareData;
            await client.set(`sharingChain _${userId}` , JSON.stringify(sharingChain))
          }
        }
      } else {
        sharingChain = JSON.parse(sharingChain)
      }
  
  
  // if (!sharingChain) {
  //   _d(userId , "getShareChainData not getting userId")
  // }
  
  return sharingChain
}

// const createShareDataByUserId = async (userId , username , isUpdateInsert) => {
//    if (username) {
//       let userD = await UserModel.findOne({ username })
//       if (!userD) {
//         return []
//       }
//       userId = userD._id
//     }
//   let sharingChain = []
//   let current = await ShareModel.findOne({ userId });
//   let firstUserData = current


//   while (current && current.creatorId) {
//     let userShareData = current
    
//     let userId = current.userId
//     let creatorId = current.creatorId
//     let userType = current.userType
//     let creatorData = await ShareModel.findOne({ userId: creatorId });
//     let pushData = {}

//     let userMatchShare = userShareData.userType == "client" ? 0 : userShareData[`${userShareData.userType}MatchShare`];
//     let creatorMatchShare = creatorData[`${creatorData.userType}MatchShare`];

//     let userMatkaShare = userShareData.userType == "client" ? 0 : userShareData[`${userShareData.userType}MatkaShare`];
//     let creatorMatkaShare = creatorData[`${creatorData.userType}MatkaShare`];

//     let userCasinoShare = userShareData.userType == "client" ? 0 : userShareData[`${userShareData.userType}CasinoShare`];
//     let creatorCasinoShare = creatorData[`${creatorData.userType}CasinoShare`];

//     let userIntCasinoShare = userShareData.userType == "client" ? 0 : userShareData[`${userShareData.userType}IntCasinoShare`];
//     let creatorIntCasinoShare = creatorData[`${creatorData.userType}IntCasinoShare`];


//     let userMatchComm = userShareData[`${userShareData.userType}MatchCommission`];
//     let creatorMatchComm = creatorData[`${creatorData.userType}MatchCommission`];

//     let userSessionComm = userShareData[`${userShareData.userType}SessionCommission`];
//     let creatorSessionComm = creatorData[`${creatorData.userType}SessionCommission`];

//     let userBetfairComm = userShareData[`${userShareData.userType}BetfairCommission`];
//     let creatorBetfairComm = creatorData[`${creatorData.userType}BetfairCommission`];

//     let userCasinoComm = userShareData[`${userShareData.userType}CasinoCommission`];
//     let creatorCasinoComm = creatorData[`${creatorData.userType}CasinoCommission`];

//     let userMatkaComm = userShareData[`${userShareData.userType}MatkaCommission`];
//     let creatorMatkaComm = creatorData[`${creatorData.userType}MatkaCommission`];


//     let userLedgerMatchShare = userShareData.userType == "client" ? 100 : 100 - userMatchShare
//     let creatorLedgerMatchShare = 100 - creatorMatchShare

//     let userLedgerCasinoShare = userShareData.userType == "client" ? 100 : 100 - userCasinoShare
//     let creatorLedgerCasinoShare = 100 - creatorCasinoShare

//     let userLedgerIntCasinoShare = userShareData.userType == "client" ? 100 : 100 - userIntCasinoShare
//     let creatorLedgerIntCasinoShare = 100 - creatorIntCasinoShare

//     let userLedgerMatkaShare = userShareData.userType == "client" ? 100 : 100 - userMatkaShare
//     let creatorLedgerMatkaShare = 100 - creatorMatkaShare

//     let creatorProfitLossrMatchShare = creatorMatchShare - userMatchShare
//     let creatorProfitLossrCasinoShare = creatorCasinoShare - userCasinoShare
//     let creatorProfitLossrMatkaShare = creatorMatkaShare - userMatkaShare
//     let creatorProfitLossrIntCasinoShare = creatorIntCasinoShare - userIntCasinoShare

//     let userLedgerMatchComm = (userLedgerMatchShare * (userMatchComm / 100)).toFixed(2)
//     let userLedgerBetfairComm = (userLedgerMatchShare * (userBetfairComm / 100)).toFixed(2)
//     let userLedgerCasinoComm = (userLedgerMatchShare * (userCasinoComm / 100)).toFixed(2)
//     let userLedgerMatkaComm = (userLedgerMatchShare * (userMatkaComm / 100)).toFixed(2)
//     let userLedgerSessionComm = (userLedgerMatchShare * (userSessionComm / 100)).toFixed(2)

//     let creatorLedgerMatchComm = (creatorLedgerMatchShare * (creatorMatchComm / 100)).toFixed(2)

//     let creatorLedgerBetfairComm = (creatorLedgerMatchShare * (creatorBetfairComm / 100)).toFixed(2)
//     let creatorLedgerCasinoComm = (creatorLedgerCasinoShare * (creatorCasinoComm / 100)).toFixed(2)
//     let creatorLedgerMatkaComm = (creatorLedgerMatkaShare * (creatorMatkaComm / 100)).toFixed(2)
//     let creatorLedgerSessionComm = (creatorLedgerMatchShare * (creatorSessionComm / 100)).toFixed(2)
    

//     pushData[`${creatorData.userType}LedgerMatchShare`] = creatorLedgerMatchShare
//     pushData[`${creatorData.userType}ProfitLossrMatchShare`] = creatorProfitLossrMatchShare

//     pushData[`${creatorData.userType}LedgerCasinoShare`] = creatorLedgerCasinoShare
//     pushData[`${creatorData.userType}ProfitLossrCasinoShare`] = creatorProfitLossrCasinoShare

//     pushData[`${creatorData.userType}LedgerMatkaShare`] = creatorLedgerMatkaShare
//     pushData[`${creatorData.userType}ProfitLossrMatkaShare`] = creatorProfitLossrMatkaShare

//     pushData[`${creatorData.userType}LedgerIntCasinoShare`] = creatorLedgerIntCasinoShare
//     pushData[`${creatorData.userType}ProfitLossrIntCasinoShare`] = creatorProfitLossrIntCasinoShare

//     pushData[`${creatorData.userType}LedgerMatchComm`] = creatorLedgerMatchComm
    
//     pushData[`${creatorData.userType}LedgerBetfairComm`] = creatorLedgerBetfairComm
//     pushData[`${creatorData.userType}LedgerCasinoComm`] = creatorLedgerCasinoComm
//     pushData[`${creatorData.userType}LedgerMatkaComm`] = creatorLedgerMatkaComm
//     pushData[`${creatorData.userType}LedgerSessionComm`] = creatorLedgerSessionComm


//     pushData[`${creatorData.userType}ProfitLossSessionComm`] = (creatorLedgerSessionComm - userLedgerSessionComm).toFixed(2)
//     pushData[`${creatorData.userType}ProfitLossMatchComm`] = (creatorLedgerMatchComm - userLedgerMatchComm).toFixed(2)
//     pushData[`${creatorData.userType}ProfitLossBetfairComm`] = (creatorLedgerBetfairComm - userLedgerBetfairComm).toFixed(2)
//     pushData[`${creatorData.userType}ProfitLossCasinoComm`] = (creatorLedgerCasinoComm - userLedgerCasinoComm).toFixed(2)
//     pushData[`${creatorData.userType}ProfitLossMatkaComm`] = (creatorLedgerMatkaComm - userLedgerMatkaComm).toFixed(2)

//     pushData.creatorUsername = creatorData.userName
//     pushData.userUsername = userShareData.userName

//     pushData.creatorUserType = creatorData.userType
//     pushData.userUserType = userShareData.userType

//     pushData.creatorUserId = creatorData.userId
//     pushData.userUserId = userShareData.userId

//     pushData.remark = `in commission mujhe total profitloss amount se multiply karna hai isko`
//     sharingChain.push(pushData)
//     current = creatorData;
//   }


//   // _d(sharingChain , "sharingChain")
  
//   if (firstUserData && isUpdateInsert && isUpdateInsert == true) {
//           let update = await directUserShareModel.updateOne(
//               { userId: new ObjectId(userId) },
//               { $set: { shareData: sharingChain , username : firstUserData?.userName  , userType : firstUserData.userType , creatorId : firstUserData.creatorId} },
//               { upsert: true }
//           );
    
//           await Promise.all([
//             client.del(`${userId}_SHARE_DATA`),
//             client.del(`sharingChain _${userId}`),
//             client.del(`${userId}_intCasinoShareData`),
//           ])
//   }
  
//     return sharingChain

// }

const createShareDataByUserId = async (userId , username , isUpdateInsert) => {
   if (username) {
      let userD = await UserModel.findOne({ username })
      if (!userD) {
        return []
      }
      userId = userD._id
    }
  let sharingChain = []
  let current = await ShareModel.findOne({ userId });
  let firstUserData = current

  while (current && current.creatorId) {
    let userShareData = current
    let userId = current.userId
    let creatorId = current.creatorId
    let creatorData = await ShareModel.findOne({ userId: creatorId });
    let pushData = {}

    let userDataUserType = userShareData.userType
    let creatorDataUserType = creatorData.userType

    let userMatchShare = userDataUserType == "client" ? 0 : firstUserData[`${userDataUserType}MatchShare`];
    let creatorMatchShare = firstUserData[`${creatorDataUserType}MatchShare`];

    let userMatkaShare = userDataUserType == "client" ? 0 : firstUserData[`${userDataUserType}MatkaShare`];
    let creatorMatkaShare = firstUserData[`${creatorDataUserType}MatkaShare`];

    let userCasinoShare = userDataUserType == "client" ? 0 : firstUserData[`${userDataUserType}CasinoShare`];
    let creatorCasinoShare = firstUserData[`${creatorDataUserType}CasinoShare`];

    let userIntCasinoShare = userDataUserType == "client" ? 0 : firstUserData[`${userDataUserType}IntCasinoShare`];
    let creatorIntCasinoShare = firstUserData[`${creatorDataUserType}IntCasinoShare`];


    let userMatchComm = firstUserData[`${userDataUserType}MatchCommission`];
    let creatorMatchComm = firstUserData[`${creatorDataUserType}MatchCommission`];

    let userSessionComm = firstUserData[`${userDataUserType}SessionCommission`];
    let creatorSessionComm = firstUserData[`${creatorDataUserType}SessionCommission`];

    let userBetfairComm = firstUserData[`${userDataUserType}BetfairCommission`];
    let creatorBetfairComm = firstUserData[`${creatorDataUserType}BetfairCommission`];

    let userCasinoComm = firstUserData[`${userDataUserType}CasinoCommission`];
    let creatorCasinoComm = firstUserData[`${creatorDataUserType}CasinoCommission`];

    let userMatkaComm = firstUserData[`${userDataUserType}MatkaCommission`];
    let creatorMatkaComm = firstUserData[`${creatorDataUserType}MatkaCommission`];


    let userLedgerMatchShare = userDataUserType == "client" ? 100 : 100 - userMatchShare
    let creatorLedgerMatchShare = 100 - creatorMatchShare

    let userLedgerCasinoShare = userDataUserType == "client" ? 100 : 100 - userCasinoShare
    let creatorLedgerCasinoShare = 100 - creatorCasinoShare

    let userLedgerIntCasinoShare = userDataUserType == "client" ? 100 : 100 - userIntCasinoShare
    let creatorLedgerIntCasinoShare = 100 - creatorIntCasinoShare

    let userLedgerMatkaShare = userDataUserType == "client" ? 100 : 100 - userMatkaShare
    let creatorLedgerMatkaShare = 100 - creatorMatkaShare
    

  // _d(current)

    // _d(creatorCasinoShare , current?.creatorName)
    // _d(userCasinoShare ,  current.userName)

    let creatorProfitLossrMatchShare = creatorMatchShare - userMatchShare
    let creatorProfitLossrCasinoShare = creatorCasinoShare - userCasinoShare
    let creatorProfitLossrMatkaShare = creatorMatkaShare - userMatkaShare
    let creatorProfitLossrIntCasinoShare = creatorIntCasinoShare - userIntCasinoShare

    let userLedgerMatchComm = (userLedgerMatchShare * (userMatchComm / 100)).toFixed(2)
    let userLedgerBetfairComm = (userLedgerMatchShare * (userBetfairComm / 100)).toFixed(2)
    let userLedgerCasinoComm = (userLedgerMatchShare * (userCasinoComm / 100)).toFixed(2)
    let userLedgerMatkaComm = (userLedgerMatchShare * (userMatkaComm / 100)).toFixed(2)
    let userLedgerSessionComm = (userLedgerMatchShare * (userSessionComm / 100)).toFixed(2)

    let creatorLedgerMatchComm = (creatorLedgerMatchShare * (creatorMatchComm / 100)).toFixed(2)

    let creatorLedgerBetfairComm = (creatorLedgerMatchShare * (creatorBetfairComm / 100)).toFixed(2)
    let creatorLedgerCasinoComm = (creatorLedgerCasinoShare * (creatorCasinoComm / 100)).toFixed(2)
    let creatorLedgerMatkaComm = (creatorLedgerMatkaShare * (creatorMatkaComm / 100)).toFixed(2)
    let creatorLedgerSessionComm = (creatorLedgerMatchShare * (creatorSessionComm / 100)).toFixed(2)
    

    pushData[`${creatorDataUserType}LedgerMatchShare`] = creatorLedgerMatchShare
    pushData[`${creatorDataUserType}ProfitLossrMatchShare`] = creatorProfitLossrMatchShare

    pushData[`${creatorDataUserType}LedgerCasinoShare`] = creatorLedgerCasinoShare
    pushData[`${creatorDataUserType}ProfitLossrCasinoShare`] = creatorProfitLossrCasinoShare

    pushData[`${creatorDataUserType}LedgerMatkaShare`] = creatorLedgerMatkaShare
    pushData[`${creatorDataUserType}ProfitLossrMatkaShare`] = creatorProfitLossrMatkaShare

    pushData[`${creatorDataUserType}LedgerIntCasinoShare`] = creatorLedgerIntCasinoShare
    pushData[`${creatorDataUserType}ProfitLossrIntCasinoShare`] = creatorProfitLossrIntCasinoShare

    pushData[`${creatorDataUserType}LedgerMatchComm`] = creatorLedgerMatchComm
    
    pushData[`${creatorDataUserType}LedgerBetfairComm`] = creatorLedgerBetfairComm
    pushData[`${creatorDataUserType}LedgerCasinoComm`] = creatorLedgerCasinoComm
    pushData[`${creatorDataUserType}LedgerMatkaComm`] = creatorLedgerMatkaComm
    pushData[`${creatorDataUserType}LedgerSessionComm`] = creatorLedgerSessionComm


    pushData[`${creatorDataUserType}ProfitLossSessionComm`] = (creatorLedgerSessionComm - userLedgerSessionComm).toFixed(2)
    pushData[`${creatorDataUserType}ProfitLossMatchComm`] = (creatorLedgerMatchComm - userLedgerMatchComm).toFixed(2)
    pushData[`${creatorDataUserType}ProfitLossBetfairComm`] = (creatorLedgerBetfairComm - userLedgerBetfairComm).toFixed(2)
    pushData[`${creatorDataUserType}ProfitLossCasinoComm`] = (creatorLedgerCasinoComm - userLedgerCasinoComm).toFixed(2)
    pushData[`${creatorDataUserType}ProfitLossMatkaComm`] = (creatorLedgerMatkaComm - userLedgerMatkaComm).toFixed(2)

    pushData.creatorUsername = creatorData.userName
    pushData.userUsername = userShareData.userName

    pushData.creatorUserType = creatorDataUserType
    pushData.userUserType = userDataUserType

    pushData.creatorUserId = creatorData.userId
    pushData.userUserId = userShareData.userId

    pushData.remark = `in commission mujhe total profitloss amount se multiply karna hai isko`
    sharingChain.push(pushData)
    current = creatorData;
  }


  //_d(sharingChain , "sharingChain")
  
  if (firstUserData && isUpdateInsert && isUpdateInsert == true) {
          let update = await directUserShareModel.updateOne(
              { userId: new ObjectId(userId) },
              { $set: { shareData: sharingChain , username : firstUserData?.userName  , userType : firstUserData.userType , creatorId : firstUserData.creatorId} },
              { upsert: true }
          );
    
          await Promise.all([
            client.del(`${userId}_SHARE_DATA`),
            client.del(`sharingChain _${userId}`),
            client.del(`${userId}_intCasinoShareData`),
          ])
  }
  
    return sharingChain

}


const getUpperLineAndDownlineOfUser = async (userType) => {
  let userPriority = Constants.UserTypes.indexOf(userType);
  const downlineUserType = Constants.UserTypes[userPriority - 1 + ""];
  const upperlineUserType = Constants.UserTypes[userPriority + 1 + ""];
  return {
    userType: userType,
    downlineUserType: downlineUserType,
    upperlineUserType : userType == "owner" ? "owner":upperlineUserType
  }
}

module.exports = {
  UsersCode,
  isValidUser,
  isUserAuthorizedToUpdate,
  updateUserStatus,
  isValidUserData,
  userCountDetails,
  userParentDetails,
  gettingDirectUserByUserId,
  getUserIdByUsername,
  getShareDataByUserId,
  checkUserPassword,
  checkUserTransactionPassword,
  convertToOrQuery,
  createShareDataByUserId,
  getShareChainData,
  getUpperLineAndDownlineOfUser
};
