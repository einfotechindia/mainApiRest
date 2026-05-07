require("dotenv").config();
const mongoose = require("mongoose");
const db = require("../Models/Connection");
db.initialize();
const UserModel = require("../Models/User/User.model");
const ShareModel = require("../Models/User/Share.model");
const transactionModel = require("../Models/TransactionLog.model");
const statementModel = require("../Models/Statement.model");
const activityModel = require("../Models/Activity.model");
const BetModel = require("../Models/BetsList/OddsBetsList.model");
const FancyModel = require("../Models/BetsList/FancyBetsList.model");
const InternationalCasinoBetList = require("../Models/BetsList/InternationalCasinoBetsList.model");
const sportsModel = require("../Models/sportList.model");
const ledgerModel = require("../Models/Ledger.model");
const PlayModel = require("../Models/Play.model");
const oddsPosition = require("../Models/BetsList/OddsPosition.model");
const profitLossPos = require("../Models/BetsList/profitLossPosition.model");
const DiamondCasinoBetList = require("../Models/BetsList/CasinoBetsList.model");
const internationalCasinoList = require("../Models/internationalCasinoList.model");
const CommissionLedger = require("../Models/commLedger.model");

// await TransactionLogModel.collection.dropIndexes();

async function createTransactionIndexes() {
  try {
    await transactionModel.collection.createIndex({
      userId: 1,
      userType: 1,
    });

      await transactionModel.collection.createIndex({
        userId: 1,
        agentId: 1,
        superagentId: 1,
        masterId: 1,
        subadminId: 1,
        adminId: 1,
        superadminId: 1,
        subownerId: 1,
        ownerId: 1,
        marketId: 1,
      });

    console.log("transactionModel Indexes created successfully");
  } finally {
    console.log(" TransactionLogModel close");
  }
}

async function createUserIndexes() {
  try {
    await UserModel.collection.createIndex({
      userId: 1,
      creatorId: 1,
      username: 1,
      agentId: 1,
      clientId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      status: 1,
    });
    console.log("UserModel Indexes created successfully");
  } finally {
    console.log("UserModel close");
  }
}

async function createShareModelIndexes() {
  try {
    await ShareModel.collection.createIndex({
      userId: 1,
      userType: 1,
      creatorId: 1,
    });
    console.log("ShareModel Indexes created successfully");
  } finally {
    console.log("ShareModel close");
  }
}

async function createStatementModelIndexes() {
  try {
    await statementModel.collection.createIndex({
      userId: 1,
      userType: 1,
      date: -1,
    });

    await statementModel.collection.createIndex({
      userId: 1,
    });
    console.log("statementModel Indexes created successfully");
  } finally {
    console.log("statementModel close");
  }
}

async function createActivityModelIndexes() {
  try {
    await activityModel.collection.createIndex({
      userId: 1,
      creatorId: 1,
      userType: 1,
    });
    console.log("activityModel Indexes created successfully");
  } finally {
    console.log("activityModel close");
  }
}

async function createBetModelIndexes() {
  try {
    await BetModel.collection.createIndex({
      userId: 1,
      marketId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });

    await BetModel.collection.createIndex({
      marketId: 1,
    });
    console.log("BetModel Indexes created successfully");
  } finally {
    console.log("BetModel close");
  }
}

async function createFancyModelIndexes() {
  try {
    await FancyModel.collection.createIndex({
      userId: 1,
      marketId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });

    await FancyModel.collection.createIndex({
      marketId: 1,
      selectionId: 1,
    });
    console.log("FancyModel Indexes created successfully");
  } finally {
    console.log("FancyModel close");
  }
}

async function createInternationalCasinoBetListIndexes() {
  try {
    await InternationalCasinoBetList.collection.createIndex({
      userId: 1,
      gameId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
      date: -1,
    });

    await InternationalCasinoBetList.collection.createIndex({
      gameId: 1,
      roundId: 1,
      date: -1,
    });
    console.log("InternationalCasinoBetList Indexes created successfully");
  } finally {
    console.log("InternationalCasinoBetList close");
  }
}

async function createSportsModelBetListIndexes() {
  try {
    await sportsModel.collection.createIndex({
      marketId: 1,
      status: 1,
      date: -1,
    });
    console.log("sportsModelBetList Indexes created successfully");
  } finally {
    console.log("sportsModelBetList close");
  }
}

async function createLedgerModelIndexes() {
  try {
    await ledgerModel.collection.createIndex({
      userId: 1,
      marketId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });

    await ledgerModel.collection.createIndex({
      userId: 1,
    });

    console.log("ledgerModel Indexes created successfully");
  } finally {
    console.log("ledgerModel close");
  }
}

async function createPlayModelIndexes() {
  try {
    await PlayModel.collection.createIndex({
      marketId: 1,
    });

    console.log("PlayModel Indexes created successfully");
  } finally {
    console.log("PlayModel close");
  }
}

async function createOddsPositionIndexes() {
  try {
    await oddsPosition.collection.createIndex({
      userId: 1,
      clientId: 1,
      marketId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });
    console.log("oddsPosition Indexes created successfully");
  } finally {
    console.log("oddsPosition close");
  }
}

async function createProfitLossPosIndexes() {
  try {
    await profitLossPos.collection.createIndex({
      userId: 1,
      clientId: 1,
      marketId: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });
    console.log("profitLossPos Indexes created successfully");
  } finally {
    console.log("profitLossPos close");
  }
}

async function createDiamondCasinoBetListIndexes() {
  try {
    await DiamondCasinoBetList.collection.createIndex({
      userId: 1,
      clientId: 1,
      date: -1,
      casinoType: 1,
      agentId: 1,
      superagentId: 1,
      masterId: 1,
      subadminId: 1,
      adminId: 1,
      superadminId: 1,
      subownerId: 1,
      ownerId: 1,
    });
    console.log("DiamondCasinoBetList Indexes created successfully");
  } finally {
    console.log("DiamondCasinoBetList close");
  }
}

async function createInternationalCasinoListIndexes() {
  try {
    await internationalCasinoList.collection.createIndex({
      gameId: 1,
      gameCode: 1,
      providerName: 1,
    });
    console.log("internationalCasinoList Indexes created successfully");
  } finally {
    console.log("internationalCasinoList close");
  }
}

async function createCommissionLedgerIndexes() {
  try {
    await CommissionLedger.collection.createIndex({
      userId: 1,
      userType: 1,
      agentId: 1,
    });
    console.log("CommissionLedger Indexes created successfully");
  } finally {
    console.log("CommissionLedger close");
  }
}

(async () => {
  await createTransactionIndexes();
  await createUserIndexes();
  await createShareModelIndexes();
  await createStatementModelIndexes();
  await createActivityModelIndexes();
  await createBetModelIndexes();
  await createFancyModelIndexes();
  await createInternationalCasinoBetListIndexes();
  await createSportsModelBetListIndexes();
  await createLedgerModelIndexes();
  await createPlayModelIndexes();
  await createOddsPositionIndexes();
  await createProfitLossPosIndexes();
  await createDiamondCasinoBetListIndexes();
  await createInternationalCasinoListIndexes();
  await createCommissionLedgerIndexes();
})();
