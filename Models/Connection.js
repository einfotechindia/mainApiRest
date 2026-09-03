const mongoose = require("mongoose");

async function initialize() {
  try {
    const srv = process.env.DATABASE_URL;
    console.log("srv  ", srv);

    await mongoose.connect(srv, {
      // ============================================================
      // CONNECTION POOL — million users ke liye optimized
      // ============================================================
      maxPoolSize: 50,           // max 50 concurrent connections (default 5)
      minPoolSize: 10,           // 10 connections always ready
      maxIdleTimeMS: 30000,      // idle connection 30s baad close
      serverSelectionTimeoutMS: 10000,  // 10s mein server select na ho toh error
      socketTimeoutMS: 45000,    // 45s mein response na aaye toh timeout
      connectTimeoutMS: 10000,   // 10s mein connect na ho toh error
      heartbeatFrequencyMS: 10000,  // 10s mein server health check
    });

    console.log("+ MongoDB is connected!! (Pool: 10-50) +");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

module.exports.initialize = initialize;