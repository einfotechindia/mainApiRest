const { MongoClient } = require("mongodb");
require("dotenv").config();
const uri = process.env.DATABASE_URL; // Update with your MongoDB URI
const dbName = "tvs"; // Replace with your database name

async function findSlowQueries() {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    // Enable profiling for queries slower than 100ms
    await db.command({ profile: 1, slowms: 100 });
    console.log("Profiler enabled for queries taking longer than 100ms");

    // Fetch slow queries (sorted by execution time)
    const slowQueries = await db.collection("system.profile")
      .find({ millis: { $gt: 100 } }) // Queries taking longer than 100ms
      .sort({ millis: -1 }) // Sort by execution time
      .limit(10)
      .toArray();

    if (slowQueries.length === 0) {
      console.log("No slow queries found.");
      return;
    }

    console.log("\nSlow queries detected:");
    for (const [index, query] of slowQueries.entries()) {
      console.log(`\n${index + 1}. Collection: ${query.ns}`);
      console.log(`   Query:`, JSON.stringify(query.query));
      console.log(`   Execution Time: ${query.millis}ms`);
      console.log(`   Plan Summary: ${query.planSummary}`);

      // Analyze index usage
      await analyzeIndexUsage(db, query.ns, query.query, query.planSummary);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

// Function to analyze index usage
async function analyzeIndexUsage(db, collectionName, query, planSummary) {
  const collection = db.collection(collectionName.split(".")[1]);

  // Extract query fields
  const queryFields = Object.keys(query);
  if (queryFields.length === 0) {
    console.log("   No filter fields found in query.");
    return;
  }

  // Get existing indexes
  const existingIndexes = await collection.indexes();
  const suggestedIndex = {};
  queryFields.forEach(field => {
    suggestedIndex[field] = 1; // 1 = ascending index
  });

  // Check if an index already exists
  const indexExists = existingIndexes.some(index =>
    JSON.stringify(index.key) === JSON.stringify(suggestedIndex)
  );

  if (planSummary === "COLLSCAN") {
    console.log("   ❌ No index used (Collection Scan)");

    if (indexExists) {
      console.log("   ✅ Index exists but not being used");
    } else {
      console.log("   🔹 Suggested Index:", JSON.stringify(suggestedIndex));
      console.log("   💡 Run this command to create the index:");
      console.log(`   db.${collection.collectionName}.createIndex(${JSON.stringify(suggestedIndex)})`);
    }
  } else if (planSummary.includes("IXSCAN")) {
    console.log("   ✅ Query is using an index, but still slow!");

    // Check if the index is inefficient
    const explainResult = await collection.find(query).explain("executionStats");
    const totalDocsExamined = explainResult.executionStats.totalDocsExamined;
    const nReturned = explainResult.executionStats.nReturned;

    console.log(`   📊 Docs Examined: ${totalDocsExamined}, Results Returned: ${nReturned}`);

    if (totalDocsExamined > nReturned * 10) {
      console.log("   ⚠️ Index is inefficient. Consider optimizing.");
      console.log("   🔹 Possible Solutions: Use a compound index or refine query.");
    }
  } else {
    console.log("   ℹ️ Query type is unknown, manual analysis needed.");
  }
}

// Run the function
findSlowQueries();
