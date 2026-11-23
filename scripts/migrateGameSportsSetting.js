require("dotenv").config();
const db = require("../Models/Connection");
const UserModel = require("../Models/User/User.model");
const { syncSettingDocs } = require("../Services/GameSportsSetting/gameSportsSetting.service");

(async () => {
  try {
    await db.initialize();
    const owners = await UserModel.find({ userType: "owner" }).lean();
    for (const owner of owners) {
      console.log(`migrating ${owner.username}`);
      await syncSettingDocs(owner, true);
    }
    console.log("done");
    process.exit(0);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
