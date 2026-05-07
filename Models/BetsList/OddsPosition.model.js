const mongoose = require("mongoose");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Kolkata");

const OddsPositionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    marketId: { type: String, default: null },
    eventId: { type: String, default: null },
    oddsType: { type: String, default: "bookmaker" },
    amount: { type: Number, default: null },
    selectionId: { type: String, default: null },
    teamName: { type: String, default: null },
    ownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subownerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subadminId: { type: mongoose.Schema.Types.ObjectId, default: null },
    masterId: { type: mongoose.Schema.Types.ObjectId, default: null },
    superagentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ownerAmount: { type: Number, default: 0 },
    subownerAmount: { type: Number, default: 0 },
    superadminAmount: { type: Number, default: 0 },
    adminAmount: { type: Number, default: 0 },
    subadminAmount: { type: Number, default: 0 },
    masterAmount: { type: Number, default: 0 },
    superagentAmount: { type: Number, default: 0 },
    agentAmount: { type: Number, default: 0 },
    sportsId: { type: Number, default: 4 },
    date: { type: Number, default: () => moment().unix() * 1000 },
  },
  {
    timestamps: true,
  }
);



const OddsPositionModel = mongoose.model("OddsPosition", OddsPositionSchema);

  const ensureIndexes = async () => {
    try {
      const existingIndexes = await OddsPositionModel.collection.indexes();
      const requiredIndexes = [
        { key: { marketId: 1 } },
        { key: { userId: 1, marketId: 1 } },
        { key: { clientId: 1, marketId: 1 } },
        { key: { agentId: 1, marketId: 1 } },
        { key: { superagentId: 1, marketId: 1 }},
        { key: { masterId: 1, marketId: 1 } },
        { key: { subadminId: 1, marketId: 1 } },
        { key: { adminId: 1, marketId: 1 }},
        { key: { superadminId: 1, marketId: 1 } },
        { key: { subownerId: 1, marketId: 1 }},
      ];
  
      for (const index of requiredIndexes) {
        const exists = existingIndexes.some(
          (existingIndex) =>
            JSON.stringify(existingIndex.key) === JSON.stringify(index.key)
        );
        if (!exists) {
          await OddsPositionModel.collection.createIndex(index.key);
          console.log(`Index created: ${JSON.stringify(index.key)}`);
        } 
      }
    }catch(error){
        console.log(error)
      }
}


  // Ensure indexes are created
ensureIndexes();


module.exports = OddsPositionModel;
