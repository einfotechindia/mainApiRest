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



// const mongoose = require("mongoose");

// let connecting = null;

// async function initialize() {
//   const uri = process.env.DATABASE_URL;
//   if (!uri) throw new Error("DATABASE_URL is missing");

//   // already connected
//   if (mongoose.connection.readyState === 1) return mongoose.connection;

//   // connection already in progress
//   if (connecting) return connecting;

//   mongoose.set("strictQuery", true);
//   mongoose.set("autoIndex", false);

//   // Allow buffering only during initial connect
//   mongoose.set("bufferCommands", true);

//   const options = {
//     maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 15),
//     minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 2),

//     // Fail fast when pool is exhausted (protects during DDoS)
//     waitQueueTimeoutMS: Number(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS || 500),

//     // Timeouts
//     serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
//     connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 5000),
//     socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 20000),

//     family: 4,
//   };

//   const maxRetries = Number(process.env.MONGO_CONNECT_RETRIES || 10);
//   const baseDelay = Number(process.env.MONGO_RETRY_BASE_DELAY_MS || 500);

//   mongoose.connection.on("connected", () => console.log("+ MongoDB connected +"));
//   mongoose.connection.on("disconnected", () => console.warn("! MongoDB disconnected !"));
//   mongoose.connection.on("error", (err) => console.error("Mongo error:", err?.message || err));

//   connecting = (async () => {
//     let lastErr;

//     for (let attempt = 1; attempt <= maxRetries; attempt++) {
//       try {
//         await mongoose.connect(uri, options);

//         // After first connect: disable buffering for fail-fast during DDoS
//         mongoose.set("bufferCommands", false);

//         return mongoose.connection;
//       } catch (err) {
//         lastErr = err;
//         const delay = Math.min(10000, baseDelay * 2 ** (attempt - 1));
//         console.error(`Mongo connect failed (${attempt}/${maxRetries}):`, err?.message || err);
//         await sleep(delay);
//       }
//     }

//     throw lastErr;
//   })().finally(() => {
//     connecting = null;
//   });

//   return connecting;
// }

// function sleep(ms) {
//   return new Promise((r) => setTimeout(r, ms));
// }

// module.exports = { initialize };
