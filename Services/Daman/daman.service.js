const { ObjectId } = require("mongodb");
const {
  getOddsPositionByMarketWise,
  getMatchList,
  sessionPositionUserWise,
} = require("../Sports/Bet.service");

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
const StatementModel = require("../../Models/Statement.model");



const checkWithdrawlAmount = async (userId , all = false) => {
  var resData = await StatementModel.aggregate([
    {
      $match: {userId : new ObjectId(userId)},
    },
    {
      $group: {
        _id: `$userId`,
        totalAmount: { $sum: "$amount" },
        depositAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$amount", 0] }, 
                    { $eq: ["$statementFor", "ACCOUNT_STATEMENT"] }
                ],
                },
                "$amount",
                0,
              ],
            },
          },
          withdrawalAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ["$amount", 0] }, 
                    { $eq: ["$statementFor", "ACCOUNT_STATEMENT"] }
                ],
                },
                "$amount",
                0,
              ],
            },
          },
          lossAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ["$amount", 0] }, 
                    { $ne: ["$statementFor", "ACCOUNT_STATEMENT"] }
                ],
                },
                "$amount",
                0,
              ],
            },
          },
          profitAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$amount", 0] }, 
                    { $ne: ["$statementFor", "ACCOUNT_STATEMENT"] }
                ],
                },
                "$amount",
                0,
              ],
            },
          },
      },
    },
  ]);


  let acceptWithdraw = 0 
  if(resData[0]){
    let profitAmount = resData[0].profitAmount
    let lossAmount = resData[0].lossAmount

    let depositAmount = resData[0].depositAmount
    let withdrawalAmount = -1 * resData[0].withdrawalAmount

    let totalDepositWithdraw = depositAmount - withdrawalAmount
    let turnOver = profitAmount +  ( -1 * lossAmount )
    acceptWithdraw =  turnOver - withdrawalAmount
  }
  // _d(resData)
  // _d(acceptWithdraw , "acceptWithdraw")

  if(all){
    return resData[0]
  }else{
    return acceptWithdraw;
  }
 
};



module.exports = {
checkWithdrawlAmount,
};
