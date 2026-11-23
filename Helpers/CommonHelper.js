const { ObjectId } = require("mongodb");
const DomainModel = require("../Models/Domain.model");
const SettingModel = require("../Models/Setting.model");
const internationalCasinoList = require("../Models/internationalCasinoList.model");
const SportsSettingModel = require("../Models/Sports/SportsSetting.model");
const { client } = require("../Helpers/RedisHelper");

const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

require("dotenv").config();
const axios = require("axios");

function _dx(data, secondData = "") {
  if (!data) {
    data = "Checking";
  }
  console.log(data, secondData);
  throw "abc";
}

function _d(data, secondData = "") {
  if (!data) {
    data = "Checking";
  }
  console.log(data, secondData);
}

function convertKeyObject(objectData, objectKey) {
  let returnDataObject = {};
  objectData.map((data, key) => {
    let hasKey = returnDataObject.hasOwnProperty(data.objectKey);
    if (!hasKey) {
      returnDataObject[data[objectKey]] = data;
    }
  });
  return returnDataObject;
}

function _date(date, format) {
  let returnDate = moment(date).format("DD-MM-YYYY");
  if (format) {
    returnDate = moment(date).format("YYYY-MM-DD");
  }
  return returnDate;
}

function _date_time(dateTime) {
  return moment(dateTime).format("DD-MM-YYYY HH:mm:ss");
}

// async function dateWhereCond(fromDate, toDate , isString=false) {
//   let fromDateFinal = moment().startOf("day").toDate();
//   let toDateFinal = moment().startOf("day").toDate();

//   if (fromDate) {
//     fromDate = moment(fromDate).format("YYYY-MM-DD");
//     fromDateFinal = moment(fromDate).startOf("day").toDate();
//     toDateFinal = moment(fromDate).startOf("day").toDate();
//   }
//   if (toDate) {
//     toDate = moment(toDate).format("YYYY-MM-DD");
//     toDateFinal = moment(toDate).startOf("day").toDate();
//   }
//   let fromTimeStamp = fromDateFinal.getTime();
//   let toTimeStamp = toDateFinal.getTime();
//   toTimeStamp =   toTimeStamp + 24 * 60 * 60 * 1000

//   if(isString){
//     fromTimeStamp = fromTimeStamp+""
//     toTimeStamp = toTimeStamp+""
//   }

//   return { $gte: fromTimeStamp, $lt: toTimeStamp };
// }




async function dateWhereCond(fromDate, toDate, isString = false, isTime = false) {
  let fromFinal, toFinal;

  if (isTime) { // iske case me createdAt ki where query lagani hai 
    fromFinal = fromDate
      ? moment(fromDate).startOf("second").toDate()
      : moment().startOf("day").toDate();

    toFinal = toDate
      ? moment(toDate).endOf("second").toDate()
      : moment().endOf("day").toDate();

    return {
      $gte: fromFinal,
      $lte: toFinal,
    };
  }

  fromFinal = fromDate
    ? moment(fromDate).startOf("day").toDate()
    : moment().startOf("day").toDate();


  toFinal = toDate
    ? moment(toDate).endOf("day").toDate()
    : moment().endOf("day").toDate();
  

  if (fromDate && !toDate) {
    toFinal = moment(fromDate).endOf("day").toDate();
  }


  let fromTimeStamp = fromFinal.getTime();
  let toTimeStamp = toFinal.getTime();

  if (isString) {
    fromTimeStamp = fromTimeStamp.toString();
    toTimeStamp = toTimeStamp.toString();
  }

  return {
    $gte: fromTimeStamp,
    $lte: toTimeStamp,
  };
}


function convertKeyObjectAndSeperateid(objectData, objectKey) {
  let finalArrayData = {};
  let returnDataObject = {};
  let idArray = [];
  objectData.map((data, key) => {
    let hasKey = returnDataObject.hasOwnProperty(data.objectKey);
    if (!hasKey) {
      returnDataObject[data[objectKey]] = data;
      idArray.push(data[objectKey]);
    }
  });
  finalArrayData.returnDataObject = returnDataObject;
  finalArrayData.idArray = idArray;
  return finalArrayData;
}

function getUniqueKey(objectData, objectKey) {
  let returnDataObject = {};
  objectData.map((data, key) => {
    let hasKey = returnDataObject.hasOwnProperty(data.objectKey);
    if (!hasKey) {
      returnDataObject[data[objectKey]] = data[objectKey];
    }
  });
  return returnDataObject;
}

function whereHelper(userData, where) {
  let field = `${userData.userType}Id`;
  let userId = new ObjectId(userData._id);
  if (userData.userId) {
    userId = new ObjectId(userData.userId);
  }
  let whereData = { [field]: userId };
  if (where) {
    whereData = Object.assign(whereData, where);
  }

  return whereData;
}

function convertObjectToArray(objectData) {
  return Object.entries(objectData);
}

function mongoToJson(mongoData) {
  return JSON.parse(JSON.stringify(mongoData));
}

function removeDuplicates(array) {
  return Array.from(new Set(array));
}

const getClientShareArray = (shareData, type, userData) => {
  let returnData = [];
  if (!type) {
    type = "all";
  }

  let matchShareArray = {};
  let casinoShareArray = {};
  let matkaShareArray = {};

  let ownerMatchProfitLossShare =
    (shareData.ownerMatchShare - shareData.subownerMatchShare) / 100;
  let ownerParentMatchShare = (100 - shareData.ownerMatchShare) / 100;

  let subownerMatchProfitLossShare =
    (shareData.subownerMatchShare - shareData.superadminMatchShare) / 100;
  let subownerParentMatchShare = (100 - shareData.subownerMatchShare) / 100;

  let superadminMatchProfitLossShare =
    (shareData.superadminMatchShare - shareData.adminMatchShare) / 100;
  let superadminParentMatchShare = (100 - shareData.superadminMatchShare) / 100;
  let adminMatchProfitLossShare =
    (shareData.adminMatchShare - shareData.subadminMatchShare) / 100;
  let adminParentMatchShare = (100 - shareData.adminMatchShare) / 100;
  let subadminMatchProfitLossShare =
    (shareData.subadminMatchShare - shareData.masterMatchShare) / 100;
  let subadminParentMatchShare = (100 - shareData.subadminMatchShare) / 100;
  let masterMatchProfitLossShare =
    (shareData.masterMatchShare - shareData.superagentMatchShare) / 100;
  let masterParentMatchShare = (100 - shareData.masterMatchShare) / 100;
  let superagentMatchProfitLossShare =
    (shareData.superagentMatchShare - shareData.agentMatchShare) / 100;
  let superagentParentMatchShare = (100 - shareData.superagentMatchShare) / 100;
  let agentMatchProfitLossShare = shareData.agentMatchShare / 100;
  let agentParentMatchShare = (100 - shareData.agentMatchShare) / 100;

  const agentId = userData.agentId;
  const superagentId = userData.superagentId;
  const masterId = userData.masterId;
  const subadminId = userData.subadminId;
  const adminId = userData.adminId;
  const superadminId = userData.superadminId;
  const subownerId = userData.subownerId;
  const ownerId = userData.ownerId;

  if (agentId == null) {
    agentMatchProfitLossShare = 0;
    agentParentMatchShare = 0;
  }
  if (superagentId == null) {
    superagentParentMatchShare = 0;
    superagentMatchProfitLossShare = 0;
  }
  if (masterId == null) {
    masterParentMatchShare = 0;
    masterMatchProfitLossShare = 0;
  }
  if (adminId == null) {
    adminParentMatchShare = 0;
    adminMatchProfitLossShare = 0;
  }
  if (subadminId == null) {
    subadminParentMatchShare = 0;
    subadminMatchProfitLossShare = 0;
  }
  if (superadminId == null) {
    superadminParentMatchShare = 0;
    superadminMatchProfitLossShare = 0;
  }

  let key = true;
  if (superagentId != null) {
    if (agentId == null) {
      superagentMatchProfitLossShare = shareData.superagentMatchShare / 100;
    }
  }
  key = true;
  if (masterId != null) {
    if (superagentId == null && key) {
      masterMatchProfitLossShare =
        (shareData.masterMatchShare - shareData.agentMatchShare) / 100;
      if (agentId == null && key) {
        masterMatchProfitLossShare = shareData.masterMatchShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (subadminId != null) {
    if (masterId == null) {
      subadminMatchProfitLossShare =
        (shareData.subadminMatchShare - shareData.superagentMatchShare) / 100;
      if (superagentId == null && key) {
        subadminMatchProfitLossShare =
          (shareData.subadminMatchShare - shareData.agentMatchShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        subadminMatchProfitLossShare = shareData.subadminMatchShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (adminId != null) {
    if (subadminId == null && key) {
      adminMatchProfitLossShare =
        (shareData.adminMatchShare - shareData.masterMatchShare) / 100;
      if (masterId == null && key) {
        adminMatchProfitLossShare =
          (shareData.adminMatchShare - shareData.superagentMatchShare) / 100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        adminMatchProfitLossShare =
          (shareData.adminMatchShare - shareData.agentMatchShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        adminMatchProfitLossShare = shareData.adminMatchShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (superadminId != null) {
    if (adminId == null && key) {
      superadminMatchProfitLossShare =
        (shareData.superadminMatchShare - shareData.subadminMatchShare) / 100;
      if (subadminId == null && key) {
        superadminMatchProfitLossShare =
          (shareData.superadminMatchShare - shareData.masterMatchShare) / 100;
      } else {
        key = false;
      }
      if (masterId == null && key) {
        superadminMatchProfitLossShare =
          (shareData.superadminMatchShare - shareData.superagentMatchShare) /
          100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        superadminMatchProfitLossShare =
          (shareData.superadminMatchShare - shareData.agentMatchShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        superadminMatchProfitLossShare = shareData.superadminMatchShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (subownerId != null) {
    if (superadminId == null && key) {
      subownerMatchProfitLossShare =
        (shareData.subownerMatchShare - shareData.adminMatchShare) / 100;

      if (adminId == null && key) {
        subownerMatchProfitLossShare =
          (shareData.subownerMatchShare - shareData.subadminMatchShare) / 100;
      } else {
        key = false;
      }
      if (subadminId == null && key) {
        subownerMatchProfitLossShare =
          (shareData.subownerMatchShare - shareData.masterMatchShare) / 100;
      } else {
        key = false;
      }

      if (masterId == null && key) {
        subownerMatchProfitLossShare =
          (shareData.subownerMatchShare - shareData.superagentMatchShare) / 100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        subownerMatchProfitLossShare =
          (shareData.subownerMatchShare - shareData.agentMatchShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        subownerMatchProfitLossShare = shareData.subownerMatchShare / 100;
      } else {
        key = false;
      }
    }
  }

  if (type == "all" || type == "match") {
    matchShareArray.ownerMatchProfitLossShare = ownerMatchProfitLossShare;
    matchShareArray.ownerMatchShare = shareData.ownerMatchShare / 100;
    matchShareArray.ownerParentMatchShare = ownerParentMatchShare;
    matchShareArray.ownerCommissionType = shareData.ownerCommissionType;
    matchShareArray.ownerMatchCommission = shareData.ownerMatchCommission;
    matchShareArray.ownerSessionCommission = shareData.ownerSessionCommission;

    matchShareArray.subownerMatchProfitLossShare = subownerMatchProfitLossShare;
    matchShareArray.subownerMatchShare = shareData.subownerMatchShare / 100;
    matchShareArray.subownerParentMatchShare = subownerParentMatchShare;
    matchShareArray.subownerCommissionType = shareData.subownerCommissionType;
    matchShareArray.subownerMatchCommission = shareData.subownerMatchCommission;
    matchShareArray.subownerSessionCommission =
      shareData.subownerSessionCommission;

    matchShareArray.superadminMatchProfitLossShare =
      superadminMatchProfitLossShare;
    matchShareArray.superadminMatchShare = shareData.superadminMatchShare / 100;
    matchShareArray.superadminParentMatchShare = superadminParentMatchShare;
    matchShareArray.superadminCommissionType =
      shareData.superadminCommissionType;
    matchShareArray.superadminMatchCommission =
      shareData.superadminMatchCommission;
    matchShareArray.superadminSessionCommission =
      shareData.superadminSessionCommission;

    matchShareArray.adminMatchProfitLossShare = adminMatchProfitLossShare;
    matchShareArray.adminMatchShare = shareData.adminMatchShare / 100;
    matchShareArray.adminParentMatchShare = adminParentMatchShare;
    matchShareArray.adminCommissionType = shareData.adminCommissionType;
    matchShareArray.adminMatchCommission = shareData.adminMatchCommission;
    matchShareArray.adminSessionCommission = shareData.adminSessionCommission;

    matchShareArray.subadminMatchProfitLossShare = subadminMatchProfitLossShare;
    matchShareArray.subadminMatchShare = shareData.subadminMatchShare / 100;
    matchShareArray.subadminParentMatchShare = subadminParentMatchShare;
    matchShareArray.subadminCommissionType = shareData.subadminCommissionType;
    matchShareArray.subadminMatchCommission = shareData.subadminMatchCommission;
    matchShareArray.subadminSessionCommission =
      shareData.subadminSessionCommission;

    matchShareArray.masterMatchProfitLossShare = masterMatchProfitLossShare;
    matchShareArray.masterMatchShare = shareData.masterMatchShare / 100;
    matchShareArray.masterParentMatchShare = masterParentMatchShare;
    matchShareArray.masterCommissionType = shareData.masterCommissionType;
    matchShareArray.masterMatchCommission = shareData.masterMatchCommission;
    matchShareArray.masterSessionCommission = shareData.masterSessionCommission;

    matchShareArray.superagentMatchProfitLossShare =
      superagentMatchProfitLossShare;
    matchShareArray.superagentMatchShare = shareData.superagentMatchShare / 100;
    matchShareArray.superagentParentMatchShare = superagentParentMatchShare;
    matchShareArray.superagentCommissionType =
      shareData.superagentCommissionType;
    matchShareArray.superagentMatchCommission =
      shareData.superagentMatchCommission;
    matchShareArray.superagentSessionCommission =
      shareData.superagentSessionCommission;

    matchShareArray.agentMatchProfitLossShare = agentMatchProfitLossShare;
    matchShareArray.agentMatchShare = shareData.agentMatchShare / 100;
    matchShareArray.agentParentMatchShare = agentParentMatchShare;
    matchShareArray.agentCommissionType = shareData.agentCommissionType;
    matchShareArray.agentMatchCommission = shareData.agentMatchCommission;
    matchShareArray.agentSessionCommission = shareData.agentSessionCommission;
    matchShareArray.clientCommissionType = shareData.clientCommissionType;
    matchShareArray.clientMatchCommission = shareData.clientMatchCommission;
    matchShareArray.clientSessionCommission = shareData.clientSessionCommission;

    matchShareArray.clientBetfairCommission = shareData.clientBetfairCommission;
    matchShareArray.agentBetfairCommission = shareData.agentBetfairCommission;
    matchShareArray.superagentBetfairCommission =
      shareData.superagentBetfairCommission;
    matchShareArray.masterBetfairCommission = shareData.masterBetfairCommission;
    matchShareArray.subadminBetfairCommission =
      shareData.subadminBetfairCommission;
    matchShareArray.adminBetfairCommission = shareData.adminBetfairCommission;
    matchShareArray.superadminBetfairCommission =
      shareData.superadminBetfairCommission;
    matchShareArray.subownerBetfairCommission =
      shareData.subownerBetfairCommission;
    matchShareArray.ownerBetfairCommission = shareData.ownerBetfairCommission;
  }

  if (type == "all" || type == "matka") {
    let ownerMatkaProfitLossShare =
      (shareData.ownerMatkaShare - shareData.subownerMatkaShare) / 100;
    let ownerParentMatkaShare = (100 - shareData.ownerMatkaShare) / 100;
    matkaShareArray.ownerMatkaProfitLossShare = ownerMatkaProfitLossShare;
    matkaShareArray.ownerMatkaShare = shareData.ownerMatkaShare / 100;
    matkaShareArray.ownerParentMatkaShare = ownerParentMatkaShare;
    matkaShareArray.ownerMatkaCommission = shareData.ownerMatkaCommission;

    let subownerMatkaProfitLossShare =
      (shareData.subownerMatkaShare - shareData.superadminMatkaShare) / 100;
    let subownerParentMatkaShare = (100 - shareData.subownerMatkaShare) / 100;
    matkaShareArray.subownerMatkaProfitLossShare = subownerMatkaProfitLossShare;
    matkaShareArray.subownerMatkaShare = shareData.subownerMatkaShare / 100;
    matkaShareArray.subownerParentMatkaShare = subownerParentMatkaShare;
    matkaShareArray.subownerMatkaCommission = shareData.subownerMatkaCommission;

    let superadminMatkaProfitLossShare =
      (shareData.superadminMatkaShare - shareData.adminMatkaShare) / 100;
    let superadminParentMatkaShare =
      (100 - shareData.superadminMatkaShare) / 100;
    matkaShareArray.superadminMatkaProfitLossShare =
      superadminMatkaProfitLossShare;
    matkaShareArray.superadminMatkaShare = shareData.superadminMatkaShare / 100;
    matkaShareArray.superadminParentMatkaShare = superadminParentMatkaShare;
    matkaShareArray.superadminMatkaCommission =
      shareData.superadminMatkaCommission;

    let adminMatkaProfitLossShare =
      (shareData.adminMatkaShare - shareData.subadminMatkaShare) / 100;
    let adminParentMatkaShare = (100 - shareData.adminMatkaShare) / 100;
    matkaShareArray.adminMatkaProfitLossShare = adminMatkaProfitLossShare;
    matkaShareArray.adminMatkaShare = shareData.adminMatkaShare / 100;
    matkaShareArray.adminParentMatkaShare = adminParentMatkaShare;
    matkaShareArray.adminMatkaCommission = shareData.adminMatkaCommission;

    let subadminMatkaProfitLossShare =
      (shareData.subadminMatkaShare - shareData.masterMatkaShare) / 100;
    let subadminParentMatkaShare = (100 - shareData.subadminMatkaShare) / 100;
    matkaShareArray.subadminMatkaProfitLossShare = subadminMatkaProfitLossShare;
    matkaShareArray.subadminMatkaShare = shareData.subadminMatkaShare / 100;
    matkaShareArray.subadminParentMatkaShare = subadminParentMatkaShare;
    matkaShareArray.subadminMatkaCommission = shareData.subadminMatkaCommission;

    let masterMatkaProfitLossShare =
      (shareData.masterMatkaShare - shareData.superagentMatkaShare) / 100;
    let masterParentMatkaShare = (100 - shareData.masterMatkaShare) / 100;
    matkaShareArray.masterMatkaProfitLossShare = masterMatkaProfitLossShare;
    matkaShareArray.masterMatkaShare = shareData.masterMatkaShare / 100;
    matkaShareArray.masterParentMatkaShare = masterParentMatkaShare;
    matkaShareArray.masterMatkaCommission = shareData.masterMatkaCommission;

    let superagentMatkaProfitLossShare =
      (shareData.superagentMatkaShare - shareData.agentMatkaShare) / 100;
    let superagentParentMatkaShare =
      (100 - shareData.superagentMatkaShare) / 100;
    matkaShareArray.superagentMatkaProfitLossShare =
      superagentMatkaProfitLossShare;
    matkaShareArray.superagentMatkaShare = shareData.superagentMatkaShare / 100;
    matkaShareArray.superagentParentMatkaShare = superagentParentMatkaShare;
    matkaShareArray.superagentMatkaCommission =
      shareData.superagentMatkaCommission;

    let agentMatkaProfitLossShare = shareData.agentMatkaShare / 100;
    let agentParentMatkaShare = (100 - shareData.agentMatkaShare) / 100;
    matkaShareArray.agentMatkaProfitLossShare = agentMatkaProfitLossShare;
    matkaShareArray.agentMatkaShare = shareData.agentMatkaShare / 100;
    matkaShareArray.agentParentMatkaShare = agentParentMatkaShare;
    matkaShareArray.agentMatkaCommission = shareData.agentMatkaCommission;
    matkaShareArray.clientMatkaCommission = shareData.clientMatkaCommission;
  }

  if (type == "all" || type == "casino") {
    let ownerCasinoProfitLossShare =
      (shareData.ownerCasinoShare - shareData.subownerCasinoShare) / 100;
    let ownerParentCasinoShare = (100 - shareData.ownerCasinoShare) / 100;
    casinoShareArray.ownerCasinoProfitLossShare = ownerCasinoProfitLossShare;
    casinoShareArray.ownerCasinoShare = shareData.ownerCasinoShare / 100;
    casinoShareArray.ownerParentCasinoShare = ownerParentCasinoShare;
    casinoShareArray.ownerCasinoCommission = shareData.ownerCasinoCommission;

    let subownerCasinoProfitLossShare =
      (shareData.subownerCasinoShare - shareData.superadminCasinoShare) / 100;
    let subownerParentCasinoShare = (100 - shareData.subownerCasinoShare) / 100;
    casinoShareArray.subownerCasinoProfitLossShare =
      subownerCasinoProfitLossShare;
    casinoShareArray.subownerCasinoShare = shareData.subownerCasinoShare / 100;
    casinoShareArray.subownerParentCasinoShare = subownerParentCasinoShare;
    casinoShareArray.subownerCasinoCommission =
      shareData.subownerCasinoCommission;

    let superadminCasinoProfitLossShare =
      (shareData.superadminCasinoShare - shareData.adminCasinoShare) / 100;
    let superadminParentCasinoShare =
      (100 - shareData.superadminCasinoShare) / 100;
    casinoShareArray.superadminCasinoProfitLossShare =
      superadminCasinoProfitLossShare;
    casinoShareArray.superadminCasinoShare =
      shareData.superadminCasinoShare / 100;
    casinoShareArray.superadminParentCasinoShare = superadminParentCasinoShare;
    casinoShareArray.superadminCasinoCommission =
      shareData.superadminCasinoCommission;

    let adminCasinoProfitLossShare =
      (shareData.adminCasinoShare - shareData.masterCasinoShare) / 100;
    let adminParentCasinoShare = (100 - shareData.adminCasinoShare) / 100;
    casinoShareArray.adminCasinoProfitLossShare = adminCasinoProfitLossShare;
    casinoShareArray.adminCasinoShare = shareData.adminCasinoShare / 100;
    casinoShareArray.adminParentCasinoShare = adminParentCasinoShare;
    casinoShareArray.adminCasinoCommission = shareData.adminCasinoCommission;

    let masterCasinoProfitLossShare =
      (shareData.masterCasinoShare - shareData.superagentCasinoShare) / 100;
    let masterParentCasinoShare = (100 - shareData.masterCasinoShare) / 100;
    casinoShareArray.masterCasinoProfitLossShare = masterCasinoProfitLossShare;
    casinoShareArray.masterCasinoShare = shareData.masterCasinoShare / 100;
    casinoShareArray.masterParentCasinoShare = masterParentCasinoShare;
    casinoShareArray.masterCasinoCommission = shareData.masterCasinoCommission;

    let superagentCasinoProfitLossShare =
      (shareData.superagentCasinoShare - shareData.agentCasinoShare) / 100;
    let superagentParentCasinoShare =
      (100 - shareData.superagentCasinoShare) / 100;
    casinoShareArray.superagentCasinoProfitLossShare =
      superagentCasinoProfitLossShare;
    casinoShareArray.superagentCasinoShare =
      shareData.superagentCasinoShare / 100;
    casinoShareArray.superagentParentCasinoShare = superagentParentCasinoShare;
    casinoShareArray.superagentCasinoCommission =
      shareData.superagentCasinoCommission;

    let agentCasinoProfitLossShare = shareData.agentCasinoShare / 100;
    let agentParentCasinoShare = (100 - shareData.agentCasinoShare) / 100;
    casinoShareArray.agentCasinoProfitLossShare = agentCasinoProfitLossShare;
    casinoShareArray.agentCasinoShare = shareData.agentCasinoShare / 100;
    casinoShareArray.agentParentCasinoShare = agentParentCasinoShare;
    casinoShareArray.agentCasinoCommission = shareData.agentCasinoCommission;
    casinoShareArray.clientCasinoCommission = shareData.clientCasinoCommission;
  }

  return {
    matchShareArray: matchShareArray,
    casinoShareArray: casinoShareArray,
    matkaShareArray: matkaShareArray,
  };
};

const fancyCommissionHelper = (
  profitLoss,
  sessionTurnOver,
  matchShareArray,
  directShareData

) => {
  let returnData = {
    clientComm: 0,
    agentComm: 0,
    superagentComm: 0,
    masterComm: 0,
    subadminComm: 0,
    adminComm: 0,
    superadminComm: 0,
    subownerComm: 0,
    ownerComm: 0,
  };


  


  if (matchShareArray.clientCommissionType == "BetByBet") {
    returnData.clientComm = Math.round(
      (sessionTurnOver * matchShareArray.clientSessionCommission) / 100
    );
  }
  if (matchShareArray.clientCommissionType == "OnlyOnMinus" && profitLoss < 0) {
    returnData.clientComm = Math.round(
      (Math.abs(profitLoss) * matchShareArray.clientSessionCommission) / 100
    );
  }

  if (matchShareArray.agentCommissionType == "BetByBet") {
    returnData.agentComm = Math.round(
      (sessionTurnOver *
        matchShareArray.agentSessionCommission) /
        100
    );
  }
  if (matchShareArray.agentCommissionType == "OnlyOnMinus") {
    returnData.agentComm = Math.round(
      (Math.abs(profitLoss) *
        matchShareArray.agentSessionCommission) /
        100
    );
  }

  if (matchShareArray.superagentCommissionType == "BetByBet") {
    returnData.superagentComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.superagentMatchProfitLossShare *
        matchShareArray.superagentSessionCommission) /
        100
    );
  }
  if (matchShareArray.superagentCommissionType == "OnlyOnMinus") {
    returnData.superagentComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.superagentMatchProfitLossShare *
        matchShareArray.superagentSessionCommission) /
        100
    );
  }

  if (matchShareArray.masterCommissionType == "BetByBet") {
    returnData.masterComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.masterMatchProfitLossShare *
        matchShareArray.masterSessionCommission) /
        100
    );
  }
  if (matchShareArray.masterCommissionType == "OnlyOnMinus") {
    returnData.masterComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.masterMatchProfitLossShare *
        matchShareArray.masterSessionCommission) /
        100
    );
  }

  if (matchShareArray.subadminCommissionType == "BetByBet") {
    returnData.subadminComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.subadminMatchProfitLossShare *
        matchShareArray.subadminSessionCommission) /
        100
    );
  }
  if (matchShareArray.subadminCommissionType == "OnlyOnMinus") {
    returnData.subadminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.subadminMatchProfitLossShare *
        matchShareArray.subadminSessionCommission) /
        100
    );
  }

  if (matchShareArray.adminCommissionType == "BetByBet") {
    returnData.adminComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.adminMatchProfitLossShare *
        matchShareArray.adminSessionCommission) /
        100
    );
  }
  if (matchShareArray.adminCommissionType == "OnlyOnMinus") {
    returnData.adminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.adminMatchProfitLossShare *
        matchShareArray.adminSessionCommission) /
        100
    );
  }

  if (matchShareArray.superadminCommissionType == "BetByBet") {
    returnData.superadminComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.superadminMatchProfitLossShare *
        matchShareArray.superadminSessionCommission) /
        100
    );
  }
  if (matchShareArray.superadminCommissionType == "OnlyOnMinus") {
    returnData.superadminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.superadminMatchProfitLossShare *
        matchShareArray.superadminSessionCommission) /
        100
    );
  }

  if (matchShareArray.subownerCommissionType == "BetByBet") {
    returnData.subownerComm = Math.round(
      (sessionTurnOver *
        // matchShareArray.subownerMatchProfitLossShare *
        matchShareArray.subownerSessionCommission) /
        100
    );
  }
  if (matchShareArray.subownerCommissionType == "OnlyOnMinus") {
    returnData.subownerComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.subownerMatchProfitLossShare *
        matchShareArray.subownerSessionCommission) /
        100
    );
  }

  if (matchShareArray.ownerCommissionType == "BetByBet") {
    returnData.ownerComm = Math.round(
      (sessionTurnOver *
        matchShareArray.ownerSessionCommission) /
        100
    );
  }
  if (matchShareArray.ownerCommissionType == "OnlyOnMinus") {
    returnData.ownerComm = Math.round(
      (Math.abs(profitLoss) *
        matchShareArray.ownerSessionCommission) /
        100
    );
  }


  //_d(directShareData , "directShareData")

    if (directShareData) {
        for (let index = 0; index < directShareData.length; index++) {
          const element = directShareData[index];
          if (matchShareArray[`${element.creatorUserType}CommissionType`] == "OnlyOnMinus") {
            sessionTurnOver = profitLoss < 0 ? Math.abs(profitLoss) : 0 
          }
          returnData[`${element.creatorUserType}LedgerSessionComm`] =
            ((Math.abs(sessionTurnOver) * element[`${element.creatorUserType}LedgerSessionComm`]))/100
          returnData[`${element.creatorUserType}ProfitLossSessionComm`] =
            ((Math.abs(sessionTurnOver) * element[`${element.creatorUserType}ProfitLossSessionComm`])) / 100
          
        }
    }
  
  return returnData;
};


const betfairFancyCommissionHelper = (
  profitLoss,
  sessionTurnOver,
  matchShareArray,
  directShareData

) => {
  let returnData = {
    clientComm: 0,
    agentComm: 0,
    superagentComm: 0,
    masterComm: 0,
    subadminComm: 0,
    adminComm: 0,
    superadminComm: 0,
    subownerComm: 0,
    ownerComm: 0,
  };

  if (profitLoss > 0) {

      returnData.clientComm = -1 * Math.round(
        (profitLoss * matchShareArray.clientBetfairCommission) / 100
      );
    
    
    returnData.clientComm  = returnData.clientComm /2
    
    for (let index = 0; index < directShareData.length; index++) {
      const element = directShareData[index];
          returnData[`${element.creatorUserType}Comm`] = +(-1 * ((Math.abs(profitLoss) * matchShareArray[`${element.creatorUserType}BetfairCommission`]))/100)
          returnData[`${element.creatorUserType}LedgerSessionComm`] =
           +(-1 *  ((Math.abs(profitLoss) * element[`${element.creatorUserType}LedgerBetfairComm`]))/100)
          returnData[`${element.creatorUserType}ProfitLossSessionComm`] =
            +(-1 * ((Math.abs(profitLoss) * element[`${element.creatorUserType}ProfitLossBetfairComm`])) / 100)
      
          returnData[`${element.creatorUserType}Comm`] = (returnData[`${element.creatorUserType}Comm`] / 2).toFixed(2)
          returnData[`${element.creatorUserType}LedgerSessionComm`] = (returnData[`${element.creatorUserType}LedgerSessionComm`] / 2).toFixed(2)
          returnData[`${element.creatorUserType}ProfitLossSessionComm`] = (returnData[`${element.creatorUserType}ProfitLossSessionComm`] / 2).toFixed(2)
        
        }
  }

  return returnData;
};

const oddsCommissionHelper = (profitLoss, matchShareArray, oddsType = {}) => {
  let returnData = {
    clientComm: 0,
    agentComm: 0,
    superagentComm: 0,
    masterComm: 0,
    subadminComm: 0,
    adminComm: 0,
    superadminComm: 0,
    subownerComm: 0,
    ownerComm: 0,
  };

  // if (oddsType && oddsType == "matchOdds") {
  //   if (profitLoss > 0) {
  //     returnData.clientComm =
  //       -1 *
  //       Math.round(
  //         (Math.abs(profitLoss) * matchShareArray.clientMatchCommission) / 100
  //       );
  //   }
  // } else {
  // }

  if (
    (matchShareArray.clientCommissionType == "BetByBet" ||
      matchShareArray.clientCommissionType == "OnlyOnMinus") &&
    profitLoss < 0
  ) {
    returnData.clientComm = Math.round(
      (Math.abs(profitLoss) * matchShareArray.clientMatchCommission) / 100
    );
  }

  if (profitLoss < 0) {
    returnData.agentComm = Math.round(
      (Math.abs(profitLoss) *
        matchShareArray.agentMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.superagentCommissionType == "BetByBet" ||
      matchShareArray.superagentCommissionType == "OnlyOnMinus")
  ) {
    returnData.superagentComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.superagentMatchProfitLossShare *
        matchShareArray.superagentMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.masterCommissionType == "BetByBet" ||
      matchShareArray.masterCommissionType == "OnlyOnMinus")
  ) {
    returnData.masterComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.masterMatchProfitLossShare *
        matchShareArray.masterMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.subadminCommissionType == "BetByBet" ||
      matchShareArray.subadminCommissionType == "OnlyOnMinus")
  ) {
    returnData.subadminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.subadminMatchProfitLossShare *
        matchShareArray.subadminMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.adminCommissionType == "BetByBet" ||
      matchShareArray.adminCommissionType == "OnlyOnMinus")
  ) {
    returnData.adminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.adminMatchProfitLossShare *
        matchShareArray.adminMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.superadminCommissionType == "BetByBet" ||
      matchShareArray.superadminCommissionType == "OnlyOnMinus")
  ) {
    returnData.superadminComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.superadminMatchProfitLossShare *
        matchShareArray.superadminMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.subownerCommissionType == "BetByBet" ||
      matchShareArray.subownerCommissionType == "OnlyOnMinus")
  ) {
    returnData.subownerComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.subownerMatchProfitLossShare *
        matchShareArray.subownerMatchCommission) /
        100
    );
  }

  if (
    profitLoss < 0 &&
    (matchShareArray.ownerCommissionType == "BetByBet" ||
      matchShareArray.ownerCommissionType == "OnlyOnMinus")
  ) {
    returnData.ownerComm = Math.round(
      (Math.abs(profitLoss) *
        // matchShareArray.ownerMatchProfitLossShare *
        matchShareArray.ownerMatchCommission) /
        100
    );
  }









  return returnData;
};

const parentDataAppend = async (userData, insertData) => {
  let returnData = {
    ownerId: userData.ownerId,
    subownerId: userData.subownerId,
    superadminId: userData.superadminId,
    adminId: userData.adminId,
    subadminId: userData.subadminId,
    masterId: userData.masterId,
    superagentId: userData.superagentId,
    agentId: userData.agentId,
    clientId: userData.clientId,
  };

  if (insertData) {
    Object.assign(returnData, insertData);
  }

  return returnData;
};

const onlyOwnerPermit = (userData) => {
  return userData.userType === "owner";
};

const areObjectsEqual = async (obj1, obj2) => {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
};

const arrayToChunk = (arr, size = 500) => {
  return arr.reduce(
    (acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]),
    []
  );
};

const writeChunkToRedis = async (chunkedData) => {
  try {
    for (let index = 0; index < chunkedData.length; index++) {
      const element = chunkedData[index];
      try {
        await client.set(SETTING.CHUNK_NAME + index, JSON.stringify(element));
      } catch (error) {
        console.log("errorerrorerrorerrorCHUNK_NAMEerror   ", error);
      }
      console.log("index  ", index, "length ", chunkedData[index].length);
    }
  } catch (error) {
    console.log("Error in writeChunkToRedis");
  }
};

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const casinoShareArray = async (
  shareData,
  userData,
  casinoType = "internationalCasino"
) => {
  
  const cacheKey = `${userData.userId}_intCasinoShareData`;
  const cached = await client.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const shareKey = (role) => {
    const map = {
      owner: {
        international: "ownerCasinoShare",
        domestic: "ownerCasinoShare", // original used same key for both
      },
      subowner: {
        international: "subownerIntCasinoShare",
        domestic: "subownerCasinoShare",
      },
      superadmin: {
        international: "superadminIntCasinoShare",
        domestic: "superadminCasinoShare",
      },
      admin: {
        international: "adminIntCasinoShare",
        domestic: "adminCasinoShare",
      },
      subadmin: {
        international: "subadminIntCasinoShare",
        domestic: "subadminCasinoShare",
      },
      master: {
        international: "masterIntCasinoShare",
        domestic: "masterCasinoShare",
      },
      superagent: {
        international: "superagentIntCasinoShare",
        domestic: "superagentCasinoShare",
      },
      agent: {
        international: "agentIntCasinoShare",
        domestic: "agentCasinoShare",
      },
      clientCasinoCommission: {
        international: "clientCasinoCommission",
        domestic: "clientCasinoCommission",
      },
    };

    return (
      map[role][casinoType === "internationalCasino" ? "international" : "domestic"]
    );
  };

  // roles top -> bottom (owner -> agent)
  const roles = [
    "owner",
    "subowner",
    "superadmin",
    "admin",
    "subadmin",
    "master",
    "superagent",
    "agent",
  ];

  // build an array of objects with id and raw share number (0-100)
  const roleInfos = roles.map((role) => {
    const idKey = `${role}Id`; // userData uses ownerId, subownerId, etc.
    const id =
      userData[idKey] !== undefined ? userData[idKey] : userData[`${role}Id`];
    const shareField = shareKey(role);
    const rawShare =
      shareData && shareField in shareData ? Number(shareData[shareField]) : 0;
    return { role, id: id == null ? null : id, rawShare };
  });

  // helper to find next existing descendant share (lower in hierarchy)
  const findNextExistingShare = (startIndex) => {
    for (let i = startIndex + 1; i < roleInfos.length; i++) {
      if (roleInfos[i].id != null) return roleInfos[i].rawShare;
    }
    // if no descendant has an id, but the agent still might have share value
    // If agent exists in shareData even without id, we still used rawShare above.
    // If none found, return null to indicate "no lower role present"
    return null;
  };

  const result = {};

  // compute for each role
  for (let i = 0; i < roleInfos.length; i++) {
    const { role, id, rawShare } = roleInfos[i];

    // default parent share (100 - roleShare)/100
    const parentShare = (100 - rawShare) / 100;

    let profitLossShare = 0; // will be in decimal (eg 0.12 for 12%)

    if (id == null) {
      // If role not present for this user, zero-out like original
      profitLossShare = 0;
    } else {
      // find next descendant that actually exists (has id)
      const nextExistingShare = findNextExistingShare(i);

      if (nextExistingShare == null) {
        // No lower role exists -> the role takes full share proportion
        profitLossShare = rawShare / 100;
      } else {
        // difference between this role share and nearest existing lower-level share
        profitLossShare = (rawShare - nextExistingShare) / 100;
      }
    }

    
    result[`${role}CasinoProfitLossShare`] = profitLossShare;
    result[`${role}CasinoShare`] = rawShare / 100;
    result[`${role}ParentCasinoShare`] = parentShare;
  }

  // client commission (copied as-is)
  const commissionField = shareKey("clientCasinoCommission");
  result.clientCasinoCommission =
    shareData && commissionField in shareData
      ? shareData[commissionField]
      : shareData.clientCasinoCommission;

  // cache only for internationalCasino like original
  if (casinoType === "internationalCasino") {
    await client.set(cacheKey, JSON.stringify(result));
    await client.expire(cacheKey, 60 * 60 * 12);
  }

  return result;
};

const extractSubdomainAndDomainByHost = async (hostname) => {
  const parts = hostname.split(".");
  let subdomain, domain;

  // Check if it's a subdomain
  if (parts.length >= 3) {
    subdomain = parts.slice(0, parts.length - 2).join(".");
    domain = parts.slice(parts.length - 2).join(".");
  } else {
    subdomain = null;
    domain = hostname;
  }

  return { subdomain, domain };
};

const betfairCommissionHelper =  (
  profitLoss,
  matchShareArray,
  directShareData = {}
) => {
  let returnData = {
    clientComm: 0,
    agentComm: 0,
    superagentComm: 0,
    masterComm: 0,
    subadminComm: 0,
    adminComm: 0,
    superadminComm: 0,
    subownerComm: 0,
    ownerComm: 0,
  };

  if (profitLoss > 0) {
    returnData.clientComm =
      (-1 * (Math.abs(profitLoss) * matchShareArray.clientBetfairCommission)) /
      100;

    returnData.agentComm =
      (-1 * (Math.abs(profitLoss) * matchShareArray.agentBetfairCommission)) /
      100;

    returnData.superagentComm =
      (-1 *
        (Math.abs(profitLoss) * matchShareArray.superagentBetfairCommission)) /
      100;

    returnData.masterComm =
      (-1 * (Math.abs(profitLoss) * matchShareArray.masterBetfairCommission)) /
      100;

    returnData.subadminComm =
      (-1 *
        (Math.abs(profitLoss) * matchShareArray.subadminBetfairCommission)) /
      100;

    returnData.adminComm =
      (-1 * (Math.abs(profitLoss) * matchShareArray.adminBetfairCommission)) /
      100;

    returnData.superadminComm =
      (-1 *
        (Math.abs(profitLoss) * matchShareArray.superadminBetfairCommission)) /
      100;

    returnData.subownerComm =
      (-1 *
        (Math.abs(profitLoss) * matchShareArray.subownerBetfairCommission)) /
      100;

    returnData.ownerComm =
      (-1 * (Math.abs(profitLoss) * matchShareArray.ownerBetfairCommission)) /
      100;
    
    
    if (directShareData) {
      for (let index = 0; index < directShareData.length; index++) {
        const element = directShareData[index];
        returnData[`${element.creatorUserType}LedgerBetfairComm`] =
          (-1 * (Math.abs(profitLoss) * element[`${element.creatorUserType}LedgerBetfairComm`])) / 100
        
        returnData[`${element.creatorUserType}ProfitLossBetfairComm`] =
            (-1 * (Math.abs(profitLoss) * element[`${element.creatorUserType}ProfitLossBetfairComm`]))/100
      }
    }

  }


  return returnData;
};


const bookmakerCommissionHelper =  (
  profitLoss,
  matchShareArray,
  directShareData = {}
) => {
  let returnData = {
    clientComm: 0,
    agentComm: 0,
    superagentComm: 0,
    masterComm: 0,
    subadminComm: 0,
    adminComm: 0,
    superadminComm: 0,
    subownerComm: 0,
    ownerComm: 0,
  };

  if (profitLoss < 0) {
    returnData.clientComm =
      ((Math.abs(profitLoss) * matchShareArray.clientMatchCommission)) /
      100;

    returnData.agentComm =
      ((Math.abs(profitLoss) * matchShareArray.agentMatchCommission)) /
      100;

    returnData.superagentComm =
      (
        (Math.abs(profitLoss) * matchShareArray.superagentMatchCommission)) /
      100;

    returnData.masterComm =
      ((Math.abs(profitLoss) * matchShareArray.masterMatchCommission)) /
      100;

    returnData.subadminComm =
      (
        (Math.abs(profitLoss) * matchShareArray.subadminMatchCommission)) /
      100;

    returnData.adminComm =
      ((Math.abs(profitLoss) * matchShareArray.adminMatchCommission)) /
      100;

    returnData.superadminComm =
      (
        (Math.abs(profitLoss) * matchShareArray.superadminMatchCommission)) /
      100;

    returnData.subownerComm =
      (
        (Math.abs(profitLoss) * matchShareArray.subownerMatchCommission)) /
      100;

    returnData.ownerComm =
      ((Math.abs(profitLoss) * matchShareArray.ownerMatchCommission)) /
      100;
    
    
    if (directShareData) {
      for (let index = 0; index < directShareData.length; index++) {
        const element = directShareData[index];

        returnData[`${element.creatorUserType}LedgerBetfairComm`] =
          ( (Math.abs(profitLoss) * element[`${element.creatorUserType}LedgerMatchComm`])) / 100
        
        returnData[`${element.creatorUserType}ProfitLossBetfairComm`] =
            ( (Math.abs(profitLoss) * element[`${element.creatorUserType}ProfitLossMatchComm`]))/100
      }
    }

  }


  return returnData;
};


const getMondayRange = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Adjust to Monday

  // Set start of the last Monday
  lastMonday.setHours(0, 0, 0, 0);

  // Calculate next Monday
  const nextMonday = new Date(lastMonday);
  nextMonday.setDate(lastMonday.getDate() + 7); // Add 7 days for next Monday

  return { startMonday: lastMonday, endMonday: nextMonday };
};

const throughSocketDataByAxios = async (userArray, emitKey) => {
  // setImmediate(async () => {
  //   try {
  //     let sendData = {
  //       userArray: userArray,
  //       emitKey: emitKey,
  //     };
  //     let sendUrl = `${process.env.SOCKET_URL}/api/emitMultipleDataUser`;
  //     await axios.post(sendUrl, sendData);
  //   } catch (error) {
  //     console.error("Background process error:", error);
  //   }
  // });
  return true;
};

const updateDomainBySocket = async (req, data) => {
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
  setImmediate(async () => {
    try {
      let sendData = {
        domain: domain,
        emitKey: "domainUpdate",
        data: data,
      };
     // emitToAllActiveUsers("domainUpdate", sendData);     
    } catch (error) {
      console.error("Background process error:", error);
    }
  });

  return true;
};

const catchErrorReason = async (error) => {
  let reason = "";
  if (error.code === "ECONNABORTED") {
    reason = "Timeout";
  } else if (error.response) {
    reason = `Reason: ${e.response.statusText || "HTTP Error"} (${
      e.response.status
    })`;
  } else if (error.request) {
    reason = "Reason: No Response from Server";
  } else {
    reason = `Reason: ${error.message}`;
  }
  return reason;
};

const getWebsiteDataByReq = async (req, isWebsite = true) => {
  let subdomain = "";
  let domain = "";
  if (!req.domainName) {
    let headers = req.headers;
    const hostData = headers?.host;
    const origin = headers?.origin;
    if (origin) {
      const originURL = new URL(origin);
      let domainOriginalData = await extractSubdomainAndDomainByHost(
        originURL.hostname
      );

    //  _dx(domainOriginalData , "domainOriginalData")
      subdomain = domainOriginalData.subdomain;
      domain = domainOriginalData.domain;
    } else {
      const parts = hostData?.split(".");
      if (parts && parts.length === 3) {
        subdomain = parts[0];
        domain = parts.slice(1).join(".");
      } else {
        subdomain = null;
        domain = hostData;
      }
    }
  } else {
    domain = req.domainName;
  }

  let returnData = {
    domain: domain,
    subdomain: subdomain,
    domainData: {},
  };

  if (isWebsite) {
    let domainData = await client.get(domain);
    if (domainData) {
      domainData = JSON.parse(domainData);
    } else {
      domainData = await DomainModel.findOne({
        domainUrl: domain,
      });
      if (domainData) {
        await client.set(domain, JSON.stringify(domainData));
      }
    }
    returnData.domainData = domainData;
  }
  return returnData;
};

const getSettingData = async () => {
  try {
    let returnData = {};
    let settingData = await client.get(`websiteSetting`);
    if (!settingData || settingData == null) {
      settingData = await SettingModel.findOne({});
      if (settingData) {
        await client.set(`websiteSetting`, JSON.stringify(settingData));
      }
      returnData = settingData;
    } else {
      returnData = JSON.parse(settingData);
    }
    return returnData;
  } catch (error) {
    console.log(error);
  }
};


let caclculateTime = async (startTime , consoleData = "")=>{
  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;
  console.log(`Process took ${duration.toFixed(2)} seconds`, consoleData);
  return true;
}

const chunkArrayNew = (array, size) => {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
  }
  return chunked;
};

const commissionProfitLoss = async (
  shareData,
  profitLoss,
  turnOver,
) => {
  let returnData = [];
  let casinoShareArray = {};

  let ownerMatchProfitLossShare =
    (shareData.ownerMatchShare - shareData.subownerMatchShare) / 100;
  let ownerMatchLedgerShare = 0 


  let subownerMatchProfitLossShare =
    (shareData.subownerMatchShare - shareData.superadminMatchShare) / 100;

  let subownerParentMatchShare = (100 - shareData.subownerMatchShare) / 100;

  let superadminMatchProfitLossShare =
    (shareData.superadminMatchShare - shareData.adminMatchShare) / 100;

  let superadminParentMatchShare = (100 - shareData.superadminMatchShare) / 100;

  let adminMatchProfitLossShare =
    (shareData.adminMatchShare - shareData.subadminMatchShare) / 100;

  let adminParentMatchShare = (100 - shareData.adminMatchShare) / 100;

  let subadminMatchProfitLossShare =
    (shareData.subadminMatchShare - shareData.masterMatchShare) / 100;

  let subadminParentMatchShare = (100 - shareData.subadminMatchShare) / 100;

  let masterMatchProfitLossShare =
    (shareData.masterMatchShare - shareData.superagentMatchShare) / 100;

  let masterParentMatchShare = (100 - shareData.masterMatchShare) / 100;

  let superagentMatchProfitLossShare =
    (shareData.superagentMatchShare - shareData.agentMatchShare) / 100;

  let superagentParentMatchShare = (100 - shareData.superagentMatchShare) / 100;

  let agentMatchProfitLossShare = shareData.agentMatchShare / 100;

  let agentParentMatchShare = (100 - shareData.agentMatchShare) / 100;

  const agentId = userData.agentId;
  const superagentId = userData.superagentId;
  const masterId = userData.masterId;
  const subadminId = userData.subadminId;
  const adminId = userData.adminId;
  const superadminId = userData.superadminId;
  const subownerId = userData.subownerId;
  const ownerId = userData.ownerId;

  if (agentId == null) {
    agentCasinoProfitLossShare = 0;
    agentParentCasinoShare = 0;
  }
  if (superagentId == null) {
    superagentParentCasinoShare = 0;
    superagentCasinoProfitLossShare = 0;
  }
  if (masterId == null) {
    masterParentCasinoShare = 0;
    masterCasinoProfitLossShare = 0;
  }
  if (adminId == null) {
    adminParentCasinoShare = 0;
    adminCasinoProfitLossShare = 0;
  }
  if (subadminId == null) {
    subadminParentCasinoShare = 0;
    subadminCasinoProfitLossShare = 0;
  }
  if (superadminId == null) {
    superadminParentCasinoShare = 0;
    superadminCasinoProfitLossShare = 0;
  }

  let key = true;
  if (superagentId != null) {
    if (agentId == null) {
      superagentCasinoProfitLossShare = superagentCasinoShare / 100;
    }
  }
  key = true;
  if (masterId != null) {
    if (superagentId == null && key) {
      masterCasinoProfitLossShare =
        (masterCasinoShare - agentCasinoShare) / 100;
      if (agentId == null && key) {
        masterCasinoProfitLossShare = masterCasinoShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (subadminId != null) {
    if (masterId == null) {
      subadminCasinoProfitLossShare =
        (subadminCasinoShare - superagentCasinoShare) / 100;
      if (superagentId == null && key) {
        subadminCasinoProfitLossShare =
          (subadminCasinoShare - agentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        subadminCasinoProfitLossShare = subadminCasinoShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (adminId != null) {
    if (subadminId == null && key) {
      adminCasinoProfitLossShare = (adminCasinoShare - masterCasinoShare) / 100;
      if (masterId == null && key) {
        adminCasinoProfitLossShare =
          (adminCasinoShare - superagentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        adminCasinoProfitLossShare =
          (adminCasinoShare - agentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        adminCasinoProfitLossShare = adminCasinoShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (superadminId != null) {
    if (adminId == null && key) {
      superadminCasinoProfitLossShare =
        (superadminCasinoShare - subadminCasinoShare) / 100;
      if (subadminId == null && key) {
        superadminCasinoProfitLossShare =
          (superadminCasinoShare - masterCasinoShare) / 100;
      } else {
        key = false;
      }
      if (masterId == null && key) {
        superadminCasinoProfitLossShare =
          (superadminCasinoShare - superagentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        superadminCasinoProfitLossShare =
          (superadminCasinoShare - agentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        superadminCasinoProfitLossShare = superadminCasinoShare / 100;
      } else {
        key = false;
      }
    }
  }

  key = true;
  if (subownerId != null) {
    if (superadminId == null && key) {
      subownerCasinoProfitLossShare =
        (subownerCasinoShare - adminCasinoShare) / 100;

      if (adminId == null && key) {
        subownerCasinoProfitLossShare =
          (subownerCasinoShare - subadminCasinoShare) / 100;
      } else {
        key = false;
      }
      if (subadminId == null && key) {
        subownerCasinoProfitLossShare =
          (subownerCasinoShare - masterCasinoShare) / 100;
      } else {
        key = false;
      }

      if (masterId == null && key) {
        subownerCasinoProfitLossShare =
          (subownerCasinoShare - superagentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (superagentId == null && key) {
        subownerCasinoProfitLossShare =
          (subownerCasinoShare - agentCasinoShare) / 100;
      } else {
        key = false;
      }
      if (agentId == null && key) {
        subownerCasinoProfitLossShare = subownerCasinoShare / 100;
      } else {
        key = false;
      }
    }
  }

  casinoShareArray.ownerCasinoProfitLossShare = ownerCasinoProfitLossShare;
  casinoShareArray.ownerCasinoShare = ownerCasinoShare / 100;
  casinoShareArray.ownerParentCasinoShare = ownerParentCasinoShare;

  casinoShareArray.subownerCasinoProfitLossShare =
    subownerCasinoProfitLossShare;
  casinoShareArray.subownerCasinoShare = subownerCasinoShare / 100;
  casinoShareArray.subownerParentCasinoShare = subownerParentCasinoShare;

  casinoShareArray.superadminCasinoProfitLossShare =
    superadminCasinoProfitLossShare;
  casinoShareArray.superadminCasinoShare = superadminCasinoShare / 100;
  casinoShareArray.superadminParentCasinoShare = superadminParentCasinoShare;

  casinoShareArray.adminCasinoProfitLossShare = adminCasinoProfitLossShare;
  casinoShareArray.adminCasinoShare = adminCasinoShare / 100;
  casinoShareArray.adminParentCasinoShare = adminParentCasinoShare;

  casinoShareArray.subadminCasinoProfitLossShare =
    subadminCasinoProfitLossShare;
  casinoShareArray.subadminCasinoShare = subadminCasinoShare / 100;
  casinoShareArray.subadminParentCasinoShare = subadminParentCasinoShare;

  casinoShareArray.masterCasinoProfitLossShare = masterCasinoProfitLossShare;
  casinoShareArray.masterCasinoShare = masterCasinoShare / 100;
  casinoShareArray.masterParentCasinoShare = masterParentCasinoShare;

  casinoShareArray.superagentCasinoProfitLossShare =
    superagentCasinoProfitLossShare;
  casinoShareArray.superagentCasinoShare = superagentCasinoShare / 100;
  casinoShareArray.superagentParentCasinoShare = superagentParentCasinoShare;

  casinoShareArray.agentCasinoProfitLossShare = agentCasinoProfitLossShare;
  casinoShareArray.agentCasinoShare = agentCasinoShare / 100;
  casinoShareArray.agentParentCasinoShare = agentParentCasinoShare;

  casinoShareArray.clientCasinoCommission = shareData.clientCasinoCommission;


  if(casinoType == "internationalCasino"){
      await client.set(`${userData.userId}_intCasinoShareData`, JSON.stringify(casinoShareArray))
  }

  return casinoShareArray;
};

function isBetweenTime(fromHours  , toHours) {
  const now = new Date();
  const hours = now.getHours(); // 0 - 23
  
  return hours >= fromHours && hours < toHours;
}

const sendWhatsAppMessage = async (toNumber="918114467911", otp = "8907755") => {
  try {
    const response = await axios.post(
      'https://waba-be-whatsapp.its.com.pk/v1/template/message',
      {
        clientId: '254',
        template_message_id: '1732',
        numbers: toNumber,
        template_params: {
          body: {
            type: 'BODY',
            text: `${otp} is your verification code. For your security, do not share this code.`,
            parameters: [
              {
                paramName: '',
                sampleValue: otp,
                value: otp,
              },
            ],
          },
          buttons: [
            {
              url: 'https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}',
              text: 'Copy code',
              sub_type: 'URL',
              value: otp,
              type: 'BUTTONS',
              sampleValue: `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=${otp}`,
            },
          ],
        },
      },
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'no-cache',
          'content-type': 'application/json;charset=UTF-8',
          'origin': 'https://waba-whatsapp.its.com.pk',
          'pragma': 'no-cache',
          'referer': 'https://waba-whatsapp.its.com.pk/templateMessage-hsm',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          'xt-user-token':
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRUb2tlbklkIjoiOTcwMzI4NjYtNTA5OC00MzZjLWI3YmQtOTdlZmYxODQ4ZGFlIiwiY2xpZW50VXVpZCI6IjkxNjJkNjIwLTQ1NWUtNDAwNi04ZTM5LWNhNmZhZTEyYzA0MCIsImNsaWVudCI6IjI1NCIsImFjdG9yIjoiNzA3IiwidXNlclRva2VuSWQiOiI5MGU5N2JlMC00NThiLTQzYWUtOGY4OS01MTkzNGQ4ZjgzYzgiLCJ0aW1lIjoxNzU0MDQ1NDY4Njc0LCJtYXhfdG9rZW5fY291bnQiOi0xLCJpYXQiOjE3NTQwNDU0Njh9.yVbZwkCG7OTSrnVRE_2UtC2OGPFiGK5lWioMP8ro1Ac',
        },
      }
    );

    console.log('✅ Response:', response.data);
    console.log('✅ Response:', response.data.data.data.result);
    return response.data
  } catch (error) {
    console.error('❌ Error sending message:', error.response?.data || error.message);
  }
};

const getTimeDifference = (startTime, label = "checking time") => {
  const duration = Date.now() - startTime;
  console.log(`${label}: ${duration} ms`);
  return duration;
}

function sanitize(input) {
  if (!input) return "";
  return String(input)
    .replace(/[<>&'"]/g, "") // basic HTML sanitization
    .trim();
}


const getInternationalGameData = async (gameId) => {
  try {
    if (!gameId) return null;
    let casinoData = await client.hget("internationalCasinoList", gameId);
    if (casinoData) {
      return JSON.parse(casinoData);
    }
    const dbData = await internationalCasinoList.findOne(
      { gameId },
      { _id: 0, createdAt: 0, __v: 0  , createdAt: 0  , updatedAt : 0  , urlThumb : 0 }
    ).lean();
    if (!dbData) return null;
    await client.hset(
      "internationalCasinoList",
      gameId,
      JSON.stringify(dbData)
    );
    return dbData;
  } catch (error) {
    console.error("getInternationalGameData Error:", error);
    return null;
  }
};

async function ipDetailsFromIp(ip) {
  const net = require("node:net");
  const https = require("node:https");

  const getJson = (url, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = https.request(
        url,
        { method: "GET", headers, timeout: 6000 },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              const json = JSON.parse(data || "{}");
              // Treat non-2xx as error but keep body for debugging
              if (res.statusCode < 200 || res.statusCode > 299) {
                const err = new Error(`HTTP ${res.statusCode}`);
                err.response = json;
                return reject(err);
              }
              resolve(json);
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Request timeout")));
      req.end();
    });

  // --- validate ip ---
  const cleanIp = String(ip || "").trim().replace(/^::ffff:/, "");
  if (!cleanIp || net.isIP(cleanIp) === 0) {
    return { ok: false, error: "Invalid IP address", ip: cleanIp || null };
  }

  // --- helper to normalize output shape ---
  const out = {
    ok: true,
    ip: cleanIp,
    city: null,
    state: null,       // region/state
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    carrier: null,     // true mobile carrier (only if provider supplies it)
    isp: null,         // ISP/Org (often available)
    asn: null,
    source: null
  };

  // NOTE: private/reserved IPs won't geo-locate reliably
  // We won't over-block; we just attempt and return nulls if it fails.

  // --- Try IPinfo first (best for carrier, needs token) ---
  const token = process.env.IPINFO_TOKEN || "";
  if (token) {
    try {
      // IPinfo "loc" = "lat,long"
      const url = `https://ipinfo.io/${encodeURIComponent(cleanIp)}?token=${encodeURIComponent(token)}`;
      const d = await getJson(url);

      const loc = typeof d.loc === "string" ? d.loc.split(",") : [];
      const lat = loc[0] ? Number(loc[0]) : null;
      const lon = loc[1] ? Number(loc[1]) : null;

      out.city = d.city || null;
      out.state = d.region || null;
      out.countryCode = d.country || null;
      out.country = null; // IPinfo basic endpoint gives country code; name not always included
      out.latitude = Number.isFinite(lat) ? lat : null;
      out.longitude = Number.isFinite(lon) ? lon : null;

      // ISP-ish fields
      out.isp = d.org || null; // e.g. "AS15169 Google LLC"
      out.asn = typeof d.org === "string" && d.org.startsWith("AS")
        ? d.org.split(" ")[0].replace("AS", "")
        : null;

      // Carrier (only shows on plans/endpoints that include mobile details)
      // Some responses include: d.mobile = { name, mcc, mnc } or similar
      out.carrier = d.mobile?.name || null;

      out.source = "ipinfo";
      return out;
    } catch (e) {
      // fall through to ipapi.co
    }
  }

  // --- Fallback: ipapi.co (geo without token; carrier usually not available) ---
  try {
    const url = `https://ipapi.co/${encodeURIComponent(cleanIp)}/json/`;
    const d = await getJson(url, { "User-Agent": "node-ip-lookup/1.0" });

    out.city = d.city || null;
    out.state = d.region || d.region_code || null;
    out.country = d.country_name || null;
    out.countryCode = d.country_code || null;
    out.latitude = typeof d.latitude === "number" ? d.latitude : (d.latitude ? Number(d.latitude) : null);
    out.longitude = typeof d.longitude === "number" ? d.longitude : (d.longitude ? Number(d.longitude) : null);

    out.asn = d.asn || null;               // e.g. "AS15169"
    out.isp = d.org || d.network || null;  // org can be present depending on response
    out.carrier = null;                    // usually not provided by ipapi.co

    out.source = "ipapi.co";
    return out;
  } catch (e) {
    return { ok: false, ip: cleanIp, error: "Lookup failed", detail: String(e?.message || e) };
  }
}


let checkBetByRedis = async (redisKey, type) => {
  let returnData = true
  if (type == "set") {
    await client.set(redisKey)
    await client.expire(redisKey , 30)
  }
  else if (type == "delete") {
     await client.del(redisKey)
  } else {
    returnData  = await client.get(redisKey)
  }
  return returnData
}


const parseFilterDate = (input) => {
  if (!input) throw new Error("fromDate is required");

  // supports DD-MM-YYYY
  if (typeof input === "string" && /^\d{2}-\d{2}-\d{4}$/.test(input)) {
    const [dd, mm, yyyy] = input.split("-").map(Number);
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // supports YYYY-MM-DD / ISO / Date object
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new Error("Invalid date format");
  }
  d.setHours(0, 0, 0, 0);
  return d;
};


function detectIsTime(fromDate, toDate) {
  const hasTime = (val) => {
    if (!val) return false;
    return (
      typeof val === "string" &&
      (val.includes(":") || val.split(" ").length > 1)
    );
  };
  return hasTime(fromDate) || hasTime(toDate);
}

const gameBetValidaterRedis = async (userId, action = "set") => {
  userId = String(userId);
  const redisKey = `gameBet_${userId}`;
  switch (action) {
   case "set": {
      const result = await client.set(redisKey, "true", "NX", "EX", 10);
      return result === "OK";  // false if key already exists, true if set successfully
    }
      
    case "check": {
      const exists = await client.exists(redisKey);
      return exists === 1; 
    }

    case "del": {
      await client.del(redisKey);
      return true;
    }
    default:
      throw new Error("Invalid action. Use 'set', 'check', or 'del'");
  }
};


const getUserSportsSetting = async (userId) => {
  const cacheKey = `sportsSetting:${userId}`;
  let cachedData = await client.get(cacheKey);
  if (cachedData && cachedData !== "null" && cachedData !== "undefined" && cachedData !== "") {
    return JSON.parse(cachedData)
  }
  let settingData = await SportsSettingModel.findOne({ userId: userId }).lean();
  if (settingData) {
    await client.set(cacheKey, JSON.stringify(settingData), "EX", 3600);
  }
  return settingData
};


// TalksTry se message bhejna — ek number ya bulk (array), attachment optional.
//   numbers    : "8114467911" | "+918114467911" | ["...", "..."]  (10 digit ho to +91 lag jata hai)
//   msg        : message text
//   attachment : https URL | local file path | "media_..." id | { buffer, fileName, mimeType }
//   options    : { title, template, variables, eventKey }
// 24 ghante ki window ke bahar TalksTry sirf approved template leta hai, isliye message
// TALKSTRY_MESSAGE_TEMPLATE (default "universal_template") se jata hai: {{1}} = title, {{2}} = msg.
// Kabhi throw nahi karta — har number ka result return hota hai.
const TALKSTRY_MIME_TYPES = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4" };
const sendTalkstryMessage = async (numbers, msg, attachment = null, options = {}) => {
  const talkstryService = require("../Services/Talkstry/Talkstry.service");
  const crypto = require("crypto");
  const path = require("path");
  const fs = require("fs");

  const list = [...new Set((Array.isArray(numbers) ? numbers : [numbers])
    .map((n) => String(n || "").replace(/[^\d+]/g, ""))
    .filter(Boolean)
    .map((n) => {
      if (n.startsWith("+")) return n;
      if (n.length === 10) return "+91" + n;
      return "+" + n;
    }))];
  const result = { total: list.length, sent: 0, failed: 0, results: [] };
  if (!list.length || !msg) {
    return { ...result, error: "numbers and msg are required" };
  }

  const template = {
    name: options.template || process.env.TALKSTRY_MESSAGE_TEMPLATE || "universal_template",
    variables: options.variables || [options.title || process.env.PROJECT_NAME || "Notification", String(msg)],
  };

  // Attachment ek hi baar upload hota hai, phir saare numbers pe wahi media id jati hai
  if (attachment) {
    try {
      if (typeof attachment === "string" && /^https:\/\//i.test(attachment)) {
        template.header = { mediaUrl: attachment };
      } else if (typeof attachment === "string" && attachment.startsWith("media_")) {
        template.header = { mediaId: attachment };
      } else {
        const fileData = typeof attachment === "string"
          ? { buffer: await fs.promises.readFile(attachment), fileName: path.basename(attachment) }
          : attachment;
        const ext = path.extname(fileData.fileName || "").slice(1).toLowerCase();
        const media = await talkstryService.uploadMedia({
          buffer: fileData.buffer,
          fileName: fileData.fileName,
          mimeType: fileData.mimeType || TALKSTRY_MIME_TYPES[ext],
        });
        template.header = { mediaId: media.id, mediaFileName: fileData.fileName };
      }
    } catch (error) {
      console.error("sendTalkstryMessage attachment error:", error.message);
      return { ...result, failed: list.length, error: "Attachment failed: " + error.message };
    }
  }

  // eventKey do (e.g. `deposit-${id}`) to retry pe same message dobara nahi jayega
  const eventKey = options.eventKey || crypto.randomUUID();
  const sendOne = async (to) => {
    try {
      const data = await talkstryService.sendMessage({ to, template, idempotencyKey: `${eventKey}-${to}` });
      result.sent++;
      result.results.push({ number: to, success: true, id: data.id, status: data.status });
    } catch (error) {
      result.failed++;
      result.results.push({ number: to, success: false, code: error.code, error: error.message });
    }
  };

  // Rate limit ke andar rehne ke liye 5-5 ke batch me
  for (const batch of chunkArrayNew(list, 5)) {
    await Promise.all(batch.map(sendOne));
  }
  return result;
};


module.exports = {
  _dx,
  _d,
  convertKeyObject,
  whereHelper,
  convertObjectToArray,
  mongoToJson,
  removeDuplicates,
  getUniqueKey,
  getClientShareArray,
  fancyCommissionHelper,
  oddsCommissionHelper,
  convertKeyObjectAndSeperateid,
  parentDataAppend,
  onlyOwnerPermit,
  areObjectsEqual,
  arrayToChunk,
  sleep,
  dateWhereCond,
  _date,
  _date_time,
  casinoShareArray,
  extractSubdomainAndDomainByHost,
  betfairCommissionHelper,
  getMondayRange,
  throughSocketDataByAxios,
  updateDomainBySocket,
  catchErrorReason,
  getWebsiteDataByReq,
  getSettingData,
  caclculateTime,
  chunkArrayNew,
  commissionProfitLoss,
  isBetweenTime,
  sendWhatsAppMessage,
  sendTalkstryMessage,
  getTimeDifference,
  betfairFancyCommissionHelper,
  sanitize,
  getInternationalGameData,
  ipDetailsFromIp,
  checkBetByRedis,
  parseFilterDate,
  detectIsTime,
  gameBetValidaterRedis,
  bookmakerCommissionHelper,
  getUserSportsSetting
};
