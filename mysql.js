// const mysql = require("mysql2");
// const util = require("util");

// // Create MySQL connection pool
// const MysqlPool = mysql.createPool({
//   connectionLimit: 400,
//   host: "216.48.181.178",
//   port: 3306, // Tunnel port (make sure SSH tunnel is running)
//   user: "testing",
//   password: "database",
//   database: "balaji",
// });

// // Promisify query for async/await usage
// MysqlPool.query = util.promisify(MysqlPool.query);

// // Test the connection
// MysqlPool.query("SELECT 1")
//   .then(() => {
//     console.log("✅ MySQL connection successful.");
//   })
//   .catch((err) => {
//     console.error("❌ MySQL connection failed:", err.message);
//   });

// module.exports = MysqlPool;


