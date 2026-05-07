const { MongoClient } = require("mongodb");
require("dotenv").config();
const uri = process.env.DATABASE_URL; // Update with your MongoDB URI
const dbName = "test"; // Replace with your database name

async function findSlowQueries() {
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    // Enable profiling for queries slower than 100ms
    await db.command({ profile: 1, slowms: 100 });

    // Fetch slow queries
    const slowQueries = await db.collection("system.profile")
      .find({ millis: { $gt: 100 } })
      .sort({ millis: -1 })
      .limit(10)
      .toArray();

    if (slowQueries.length === 0) {
      console.log(JSON.stringify({ message: "No slow queries found." }, null, 2));
      return;
    }

    let result = { slow_queries: [] };

    for (const query of slowQueries) {
      const queryData = {
        collection: query.ns,
        query: query.query,
        execution_time_ms: query.millis,
        plan_summary: query.planSummary,
      };

      queryData.index_analysis = await analyzeIndexUsage(db, query.ns, query.query, query.planSummary);
      result.slow_queries.push(queryData);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }, null, 2));
  } finally {
    await client.close();
  }
}

// Function to analyze index usage
async function analyzeIndexUsage(db, collectionName, query, planSummary) {
  const collection = db.collection(collectionName.split(".")[1]);
  const queryFields = Object.keys(query);
  const existingIndexes = await collection.indexes();

  let indexData = {
    index_status: "Unknown",
    suggested_index: null,
    existing_indexes: existingIndexes.map(index => index.key),
    duplicate_indexes: [],
    inefficient_index: false,
    index_cleanup_suggestions: [],
  };

  if (queryFields.length === 0) {
    indexData.index_status = "No filter fields in query";
    return indexData;
  }

  const suggestedIndex = {};
  queryFields.forEach(field => { suggestedIndex[field] = 1; });

  const indexExists = existingIndexes.some(index => JSON.stringify(index.key) === JSON.stringify(suggestedIndex));

  if (planSummary === "COLLSCAN") {
    indexData.index_status = "No index used (Collection Scan)";
    indexData.suggested_index = indexExists ? "Index exists but not being used" : suggestedIndex;
  } else if (planSummary.includes("IXSCAN")) {
    indexData.index_status = "Query is using an index, but still slow";

    const explainResult = await collection.find(query).explain("executionStats");
    const totalDocsExamined = explainResult.executionStats.totalDocsExamined;
    const nReturned = explainResult.executionStats.nReturned;

    indexData.docs_examined = totalDocsExamined;
    indexData.docs_returned = nReturned;
    indexData.inefficient_index = totalDocsExamined > nReturned * 10;
  }

  indexData.duplicate_indexes = findDuplicateIndexes(existingIndexes);
  indexData.index_cleanup_suggestions = findUnusedIndexes(existingIndexes);

  return indexData;
}

// Function to detect duplicate indexes
function findDuplicateIndexes(indexes) {
  const indexKeys = indexes.map(index => JSON.stringify(index.key));
  const duplicateIndexes = {};

  indexKeys.forEach((key, i) => {
    if (!duplicateIndexes[key]) {
      duplicateIndexes[key] = [indexes[i].name];
    } else {
      duplicateIndexes[key].push(indexes[i].name);
    }
  });

  return Object.values(duplicateIndexes).filter(indexList => indexList.length > 1);
}

// Function to suggest index cleanup
function findUnusedIndexes(indexes) {
  return indexes
    .filter(index => index.name !== "_id_")
    .map(index => ({
      index_name: index.name,
      index_key: index.key,
      suggestion: "Check if this index is unused and consider dropping it.",
    }));
}

// Run the function
findSlowQueries();
