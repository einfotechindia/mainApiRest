const {
    SendResponse,
    returnResponse,
  } = require("../Helpers/ResponseMapper");
  const { client } = require("../Helpers/RedisHelper");
  const {
    getUserIdByUsername,
    checkUserPassword,
  } = require("../Helpers/UsersUtils");
  const { ObjectId } = require("mongodb");
  const Joi = require("joi");
  const { siteSetting } = require("../Common/Constants");
  const {
    _dx,
    whereHelper,
    _d,
    dateWhereCond,
    chunkArrayNew,
  } = require("../Helpers/CommonHelper");
  const UserModel = require("../Models/User/User.model");
  const UserModelPhp = require("../Models/User/phpUserList.model");
  const userLedgerModel = require("../Models/Ledger.model");
  const StatementModel = require("../Models/Statement.model");
  const TransactionLogModel = require("../Models/TransactionLog.model");

  const { UserCreate } = require("../Services/User/User.service")
  const db = require('../Helpers/SqlHelper');

const insertUserListToMongo = async (req, res) => {
  try {
    let bodyData = req.body
    const BATCH_SIZE = 5000;
    let offset = 0;
    let done = false;


    while (!done) {
      const rows = await db.findBatch('users', `type="${bodyData.userType}"`, BATCH_SIZE, offset);
      const userData = rows?.data || [];
      if (userData.length === 0 || BATCH_SIZE == 86000) {
        done = true;
        break;
      }
      const insertData = userData.map(user => ({
        data: user
      }));

      if (insertData.length > 0) {
        await UserModelPhp.create(insertData);
      }
      offset += BATCH_SIZE;
    }
    return SendResponse(res, "success", "done");
  } catch (error) {
    console.error("Error in insertUserListToMongo:", error);
    return SendResponse(res, "error", "Something went wrong", error);
  }
};


const getParentUserType = async(userType)=>{
  let returnUserType = ""
  if(userType == "admin"){
    returnUserType = "superadmin"
  }else if (userType == "subadmin"){
    returnUserType = "admin"
  }else if (userType == "master"){
    returnUserType = "madmin"
  }
  else if (userType == "superagent"){
    returnUserType = "master"
  }
  else if (userType == "agent"){
    returnUserType = "super"
  }else if (userType == "client"){
    returnUserType = "agent"
  }

  return returnUserType
}

// Function to handle single user creation logic
const processUser = async (userDoc, loginData , bodyData) => {
  try {
    
    let userData = userDoc.data;
    let userType = userData.type;

    let matchShare = `${userType}_share`;
    let casinoShare = `${userType}_casino_share`;
    let matchCommission = `${userType}_odds_comm`;
    let sessionCommission = `${userType}_sess_comm`;
    let casinoCommission = `${userType}_casino_comm`;
    let commissionType =
      userData.comm_type === "bbb" ? "BetByBet" : "NoCommission";

    if (userType === "super") userType = "superagent";
    if (userType === "madmin") userType = "subadmin";

    let creatorUsername = userData.appiline_name || "";
    if (creatorUsername === "SSD") creatorUsername = "Admin";

    let parentId = null;

    if (creatorUsername) {
      let phpUserCreatorType  = await getParentUserType(userType)
      let phpCreatorId = userData[`${phpUserCreatorType}`]
      const creatorData = await UserModel.findOne(
        { phpUserId : phpCreatorId },
        { _id: 1 }
      );
      parentId = creatorData?._id || null;
    }

    if(userType == "admin"){
      parentId = bodyData.parentId
      matchCommission = 5 
      sessionCommission = 5 
      casinoCommission = 5 
    }

    const insertData = {
      reference: userData.ref_name,
      notes: userData.chips,
      rateReffrence: userData.rate_diff,
      username: userData.name,
      password: userData.txt_password,
      mobile: userData.contact_no,
      name: userData.fullName,
      userType: userType,
      status: userData.status,
      matchShare: userData[matchShare] || 0,
      casinoShare: userData[casinoShare] || 0,
      matkaShare: 0,
      matchCommission: userData[matchCommission] || 0,
      sessionCommission: userData[sessionCommission] || 0,
      commissionType: commissionType,
      casinoCommission: userData[casinoCommission] || 0,
      matkaCommission: 0,
      coins: 0,
      reference: userData.ref_name || "",
      showMatchShare: true,
      showCasinoShare: true,
      showMatkaShare: true,
      betStatus: true,
      matchStatus: true,
      casinoStatus: true,
      matkaStatus: true,
      transactionPassword: userData.txt_password,
      phpUserId: userData.id,
      parentId: parentId,
    };

    const createdUser = await UserCreate(insertData, loginData);
    _d("User created:", createdUser);
  } catch (error) {
    console.error("Error creating user:", error.message);
  }
};

const createUser = async (req, res) => {
  try {
    let bodyData = req.body
    const loginData = req.loggedInUser;

    const data = await UserModelPhp.find({ "data.type": `${bodyData.userType}` });

    
    if (!Array.isArray(data) || data.length === 0) {
      return SendResponse(res, "error", "No admin users found");
    }

    const batches = chunkArrayNew(data, 1000); // 500 users per batch
    for (const batch of batches) {
      await Promise.all(batch.map((userDoc) => processUser(userDoc, loginData , bodyData)));
      if (global.gc) global.gc();
    }


    console.log(`all users created successfully done`)

    return SendResponse(res, "success", "All users processed");
  } catch (err) {
    console.error("Unexpected error:", err);
    return SendResponse(res, "error", "Something went wrong");
  }
};


const createLedger = async (req, res) => {
  try {
    let bodyData = req.body
    const loginData = req.loggedInUser;

    const BATCH_SIZE = 5000;
    let offset = 0;
    let done = false;

    const chunkArray = (arr, size) => {
      const result = [];
      for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
      }
      return result;
    };

    const runInBatches = async (array, fn, concurrency = 100) => {
      const results = [];
      for (let i = 0; i < array.length; i += concurrency) {
        const chunk = array.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(fn));
        results.push(...chunkResults);
      }
      return results;
    };

    const processLedger = async (userDoc, loginData) => {
      try {
        const userData = userDoc.data || userDoc;
        const userTypeRaw = userData.type;

      
        const userPhpId = userData.user_id;


        if (!userPhpId) {
          console.log("Missing userPhpId for type:", userTypeRaw, userData);
          return null;
        }

        let realUserData;
        const redisData = await client.get(`${userPhpId}`);
        if (!redisData) {
          realUserData = await UserModel.findOne({ phpUserId: userPhpId });
          if (realUserData) {
            await client.set(`${userPhpId}`, JSON.stringify(realUserData));
          } else {
            return null;
          }
        } else {
          realUserData = JSON.parse(redisData);
        }

      
        const {
          ownerId, subownerId, superadminId, adminId,
          subadminId, masterId, superagentId, agentId,
          clientId, userId
        } = realUserData;

        let userType = userTypeRaw;
        if (userType === "super") userType = "superagent";
        if (userType === "madmin") userType = "subadmin";

        let ledgerType = userData.event_type === "match" ? "cricket" : "diamondCasino";


        if(userData.collection_name =="CASH"){
          ledgerType = "settle"
        }


        if(userType == "client"){
          userData.amt = -1 * userData.amt
        }

        return {
          userId: userId || null,
          userType: userType || null,
          clientId: clientId || null,
          agentId: agentId || null,
          superagentId: superagentId || null,
          masterId: masterId || null,
          subadminId: subadminId || null,
          adminId: adminId || null, 
          superadminId: superadminId || null,
          subownerId: subownerId || null,
          ownerId: ownerId || null,
          ledgerType: ledgerType,
          marketId: userData.event_id || null,
          amount: userData.amt ?? 0,
          isDeclare: 1,
          eventName: userData.comment || "",
          remark: `${userData.remarks || userData.comment || ""} Win The Match`,
          priority: "",
          doneBy : userData.done_by,
          remark : userData.remarks,
          eventDate : userData.post_date,
          createdAt : userData.created_at,
        };
      } catch (error) {
        console.error("Error processing ledger:", error.message);
        return null;
      }
    };

    const safeInsertMany = async (docs) => {

     
      const chunks = chunkArray(docs, 5000);
      for (const chunk of chunks) {
        try {


          
       await userLedgerModel.insertMany(chunk, { ordered: false });

      //  _d(insert , "insert")
        } catch (e) {
          console.error("Insert chunk error:", e.message);
        }
      }
    };

    while (!done) {
      const rows = await db.findBatch('client_lenden', `type="${bodyData.userType}"` , BATCH_SIZE, offset);
      const ledgerData = rows?.data || [];

      if (ledgerData.length === 0) {
        done = true;
        break;
      }

      const batches = chunkArray(ledgerData, 5000); // Process sub-batches'

      for (const batch of batches) {
        const ledgerData = await runInBatches(batch, ledger => processLedger(ledger, loginData), 5000);

        const validLedgerData = ledgerData.filter(Boolean);


        //_d(validLedgerData , "validLedgerData")

        if (validLedgerData.length > 0) {
          await safeInsertMany(validLedgerData);
        }

        if (global.gc) global.gc(); // memory clear
      }

      offset += BATCH_SIZE;

      if (offset % 10000 === 0) {
        console.log(`Processed ${offset} records`);
      }
    }

    console.log("All user ledgers successfully inserted");
    return SendResponse(res, "success", "All users processed");
  } catch (err) {
    console.error("Unexpected error:", err);
    return SendResponse(res, "error", "Something went wrong");
  }
};



const mergeTransaction = async (req, res) => {
  try {
    const bodyData = req.body;

    // Input validation
    if (!bodyData.userType) {
      return res.status(400).json({
        status: "error",
        message: "userType is required",
      });
    }

    const BATCH_SIZE = 5000; // adjust as needed based on your server's capacity
    const query = {
      userType: bodyData.userType,
      phpUserId: { $gt: 0 }
    };

    const projection = {
      exposure: 1,
      userId: 1,
      userType: 1,
      username: 1,
      name: 1,
      status: 1,
      notes: 1,
      clientId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    };

    const cursor = UserModel.find(query, projection).cursor({ batchSize: BATCH_SIZE });

    let bulkUpdates = [];
    let statementAllData = [];
    let transactionAllData = [];
    let counter = 0;

    for await (const user of cursor) {
      const coins = user.notes ? parseInt(user.notes) : 0;

      bulkUpdates.push({
        updateOne: {
          filter: { _id: new ObjectId(user.userId) },
          update: { $set: { coins: coins } }
        }
      });

      transactionAllData.push({
        userId: user.userId,
        userType: user.userType,
        amount: coins,
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

      statementAllData.push({
        userId: user.userId,
        username: user.username,
        userType: user.userType,
        amount: coins,
        oldAmount: coins,
        newAmount: coins,
        remark: "old Statement",
        statementFor: "ACCOUNT_STATEMENT",
      });

      counter++;

      if (counter % BATCH_SIZE === 0) {
        await flushBatch(bulkUpdates, statementAllData, transactionAllData);
        bulkUpdates = [];
        statementAllData = [];
        transactionAllData = [];
      }
    }

    // Flush any remaining operations
    if (bulkUpdates.length > 0 || statementAllData.length > 0 || transactionAllData.length > 0) {
      await flushBatch(bulkUpdates, statementAllData, transactionAllData);
    }

    return res.status(200).json({
      status: "success",
      message: `Transaction merged successfully for userType: ${bodyData.userType}`
    });

  } catch (error) {
    console.error("Error in merging ledger:", error);
    return res.status(500).json({
      status: "error",
      message: "An error occurred while merging transactions",
      error: error.message
    });
  }
};

// Helper function to flush batch inserts and updates
const flushBatch = async (bulkUpdates, statementAllData, transactionAllData) => {
  const tasks = [];

  if (bulkUpdates.length > 0) {
    tasks.push(UserModel.bulkWrite(bulkUpdates, { ordered: false }));
  }
  if (statementAllData.length > 0) {
    tasks.push(StatementModel.insertMany(statementAllData, { ordered: false }));
  }
  if (transactionAllData.length > 0) {
    tasks.push(TransactionLogModel.insertMany(transactionAllData, { ordered: false }));
  }

  await Promise.all(tasks);
};




  module.exports = {
    insertUserListToMongo,
    createLedger,
    createUser,
    mergeTransaction
  };
