const StatementModel = require("../Models/Statement.model");
const ActivityModel = require("../Models/Activity.model");
const { _dx } = require("./CommonHelper");

function InsertUserStatement(statementData, userData) {
  
  const statement = {
    userId: userData._id,
    username: userData?.username,
    name: userData?.name,
    userType: userData.userType,
    gameType: statementData?.gameType,
    transactionId: statementData?.transactionId,
    amount: statementData.amount,
    oldAmount: statementData.oldAmount,
    newAmount: statementData.newAmount,
    remark: statementData.remark,
    userRemark: statementData.userRemark,
    statementFor: statementData.statementFor,
  };

  if(statementData.roundId){
    statement.roundId = statementData.roundId +""
  }
 

  return StatementModel.create(statement);
}

function InsertUserActivity(activityData, userData) {
  return ActivityModel.create({
    userId: userData._id,
    creatorId: userData.creatorId,
    operatorId: userData.operatorId,
    operatorName: userData.operatorName,
    username: userData.username,
    userType: userData.userType,
    ownerId : userData.ownerId,
    subownerId : userData.subownerId,
    superadminId : userData.superadminId,
    adminId : userData.adminId,
    subadminId : userData.subadminId,
    masterId : userData.masterId,
    superagentId : userData.superagentId,
    agentId : userData.agentId,
    clientId : userData.clientId,
    activityType: activityData.activityType,
    oldActivity: activityData.oldActivity,
    newActivity: activityData.newActivity,
    remark: activityData.remark,
  });
}

module.exports = { InsertUserStatement, InsertUserActivity };
