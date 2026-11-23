// Repair for gameSportsSetting (safe to run again).
// Effective values of the complete downline are made again from selfSetting, top to down.
// Use it when settings of a downline look wrong (e.g. an update stopped in between).
// Old data must be migrated first (scripts/migrateGameSportsSetting.js), otherwise old locks / limits are lost.
// Run : node scripts/repairGameSportsSetting.js            -> all owners
//       node scripts/repairGameSportsSetting.js <userId>   -> this user and its downline
require("dotenv").config();
const { ObjectId } = require("mongodb");
const db = require("../Models/Connection");
const UserModel = require("../Models/User/User.model");
const { repairSettingDocs } = require("../Services/GameSportsSetting/gameSportsSetting.service");

(async () => {
  try {
    await db.initialize();
    const userId = process.argv[2];
    if (userId && !ObjectId.isValid(userId)) throw new Error("invalid userId");

    const where = userId ? { userId: new ObjectId(userId) } : { userType: "owner" };
    const users = await UserModel.find(where).lean();
    if (!users.length) throw new Error("user not found");

    for (const user of users) {
      const repaired = await repairSettingDocs(user);
      console.log(`${user.username} : ${repaired} setting repaired`);
    }
    console.log("done");
    process.exit(0);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
