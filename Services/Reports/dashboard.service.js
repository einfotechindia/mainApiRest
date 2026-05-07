const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const transactionLog = require("../../Models/TransactionLog.model");
const crickTransactionlog = require("../../Models/crickTransaction.model");
const sportsListModel = require("../../Models/sportList.model");
const { siteSetting, UserTypes } = require("../../Common/Constants");
const LedgerModel = require("../../Models/Ledger.model");
const DepositWithdrawModel = require("../../Models/BtoC/DepositWithdraw.model");



const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const UserUtils = require("../../Helpers/UsersUtils");
const {
  _dx,
  _d,
  convertKeyObject,
  convertObjectToArray,
  removeDuplicates,
  getClientShareArray,
  whereHelper,
  dateWhereCond,
  convertKeyObjectAndSeperateid,
  _date,
} = require("../../Helpers/CommonHelper");




const btoc = async (req, res) => {
  try{
  let returnObj ={};
  const bodyData = req.body;
  const loginData = req.loggedInUser;
  let userId = loginData.userId;
  let userType = loginData.userType;
  if (bodyData.userId && bodyData.userType) {
    userId = bodyData.userId;
    userType = bodyData.userId;
  }
  let userWhere = {};
  let Userpriority = UserTypes.indexOf(userType);
  let downlineUserType = UserTypes[Userpriority - 1];

  if (bodyData.isCasino) {
    userWhere.isCasino = bodyData.isCasino;
  }

  if (bodyData.fromDate && bodyData.toDate) {
    userWhere.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  userWhere = await whereHelper(loginData, userWhere);

  if (bodyData.downlineUserType) {
    downlineUserType = bodyData.downlineUserType;
  }


  var profitLossRes = await crickTransactionlog.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        userProfitLoss: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${userType}ProfitLoss`,
              0,
            ],
          },
        },
        userLedgerAmout: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$transactionType", "profitLoss"] }],
              },
              `$${userType}LedgerAmount`,
              0,
            ],
          },
        },
      },
    },
  ]);


  if(profitLossRes.length > 0){
    returnObj.profitLossRes = profitLossRes
  }


  var depositWithdrawRes = await DepositWithdrawModel.aggregate([
    {
      $match: userWhere,
    },
    {
      $group: {
        _id: `$${userType}Id`,
        totalDepositSuccess: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "accept"] } , { $eq: ["$reqType", "deposit"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        totalDepositPending: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "pending"] } , { $eq: ["$reqType", "deposit"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        totalDepositCancel: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "cancel"] } , { $eq: ["$reqType", "deposit"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        totalWithdrawSuccess: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "accept"] } , { $eq: ["$reqType", "withdraw"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        totalWithdrawPending: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "pending"] } , { $eq: ["$reqType", "withdraw"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
        totalWithdrawCancel: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ["$status", "cancel"] } , { $eq: ["$reqType", "withdraw"] }],
              },
              `$amount`,
              0,
            ],
          },
        },
      },
    },
  ]);



  if(depositWithdrawRes.length > 0){
    returnObj.depositWithdrawRes = depositWithdrawRes
  }



  return SendResponse(res, "success", "dataFetched", returnObj);
}catch(e){console.log(e)}
};

module.exports = {
  btoc,
};
