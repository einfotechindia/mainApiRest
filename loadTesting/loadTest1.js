const loadtest = require("loadtest");

const options = {
  url: "https://oddsapi.winx777.com/v2/api/oddsData?market_id=1.229691932", // Update with your server URL and endpoint
  maxRequests: 1000000, // Total number of requests to make
  concurrency: 2000, // Number of requests to make concurrently
  requestsPerSecond: 2000, // Number of requests per second
  method: "GET",
};

loadtest.loadTest(options, function (error, result) {
  if (error) {
    return console.error("Got an error: %s", error);
  }
  console.log("Tests run successfully");
  console.log(result);
});
