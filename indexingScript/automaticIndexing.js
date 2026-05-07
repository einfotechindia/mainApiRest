const cron = require("node-cron");
const mongoose = require("mongoose");
require("dotenv").config();
// MongoDB Connection Initialization
async function initialize() {
  try {
    const srv = process.env.DATABASE_URL; // Database URL from environment variables
    console.log("Connecting to MongoDB...");
    await mongoose.connect(srv, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("+ MongoDB is connected!! +");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

// Function to analyze logs and create indexes
const analyzeAndIndex = async () => {
  try {
    // Ensure the connection is initialized
    if (!mongoose.connection.readyState) {
      await initialize();
    }

    const db = mongoose.connection.db;

    // Ensure query profiling is enabled
    const profilingLevel = await db.command({ profile: -1 });
    if (profilingLevel.was < 1) {
      console.log("Enabling query profiling...");
      await db.command({ profile: 1, slowms: 100 }); // Logs queries slower than 100ms
    }

    const systemProfile = db.collection("system.profile");
    console.log("Analyzing queries from system.profile...");

    // Fetch slow queries
    const slowQueries = await systemProfile
      .aggregate([
        { $match: { millis: { $gt: 100 } } }, // Queries slower than 100ms
        { $project: { ns: 1, query: "$command.filter", millis: 1 } }, // Extract relevant fields
      ])
      .toArray();

    if (!slowQueries.length) {
      console.log("No slow queries found.");
      return;
    }

    const indexesToCreate = {};

    // Analyze each query and collect suggested indexes
    slowQueries.forEach(({ ns, query }) => {
      if (!query || typeof query !== "object") return; // Skip if query is invalid

      const collectionName = ns.split(".")[1]; // Extract collection name
      if (!collectionName) return;

      indexesToCreate[collectionName] = indexesToCreate[collectionName] || [];
      indexesToCreate[collectionName].push(Object.keys(query));
    });

    console.log("Suggested Indexes: ", indexesToCreate);

    // Deduplicate indexes and create them
    for (const [collectionName, indexSets] of Object.entries(indexesToCreate)) {
      const collection = db.collection(collectionName);

      // Deduplicate index sets
      const uniqueIndexes = [
        ...new Set(indexSets.map((fields) => JSON.stringify(fields))),
      ].map((fields) => JSON.parse(fields));

      for (const indexFields of uniqueIndexes) {
        const indexObject = indexFields.reduce(
          (obj, field) => ({ ...obj, [field]: 1 }),
          {}
        );
        try {
          await collection.createIndex(indexObject);
          console.log(`Index created on ${collectionName}:`, indexObject);
        } catch (err) {
          console.error(
            `Error creating index on ${collectionName}:`,
            indexObject,
            err
          );
        }
      }
    }
  } catch (err) {
    console.error("Error analyzing and creating indexes:", err);
  }
};

// Schedule the task to run daily
cron.schedule("0 0 * * *", analyzeAndIndex); // Runs at midnight every day
analyzeAndIndex();

console.log("Index analyzer is scheduled to run daily.");

module.exports = { initialize };
