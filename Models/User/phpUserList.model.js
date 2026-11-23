const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    data:{}
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);





const UserModelPhp = mongoose.model("UserModelPhp", UserSchema);

(async () => {
  try {
    const existingIndexes = await UserModelPhp.collection.indexes();

    const neededIndexes = [
      {
        key: { subadminId: 1, userType: 1, isDeleted: 1, createdAt: 1, _id: 1 },
      }
    ];

    for (const index of neededIndexes) {
      const exists = existingIndexes.some(
        (existing) => JSON.stringify(existing.key) === JSON.stringify(index.key)
      );
      if (!exists) {
        await UserModelPhp.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();



module.exports = UserModelPhp;
