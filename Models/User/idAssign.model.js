const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        phpUserId: {
          type: Number,
          default: 0,
        },
        username: {
          type: String,
          default: "",
        },
        userType: {
            type: String,
            default: "",
          },
          mongoDbId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
          },
      },
      {
        timestamps: true,
      }
);





const idAssignSystem = mongoose.model("idAssignSystem", UserSchema);

(async () => {
  try {
    const existingIndexes = await idAssignSystem.collection.indexes();

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
        await idAssignSystem.collection.createIndex(index.key);
        console.log(`Index ${JSON.stringify(index.key)} created.`);
      } else {
        // console.log(`Index ${JSON.stringify(index.key)} already exists.`);
      }
    }
  } catch (err) {
    console.error("Error checking/creating indexes:", err);
  }
})();



module.exports = idAssignSystem;
