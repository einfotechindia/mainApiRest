const mongoose = require("mongoose");
async function initialize(msg) {
    try {
      const srv = process.env.DATABASE_URL;
       console.log("srv  ", srv);
       await mongoose.connect(srv);
      console.log("+ MongoDB is connected!! +");
    } catch (error) {
        console.error(error);
    }
}
module.exports.initialize = initialize;