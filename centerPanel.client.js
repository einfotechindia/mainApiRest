/**
 * ═══════════════════════════════════════════════════════════════
 *  CENTERPANEL CLIENT — How to call secured APIs
 * ═══════════════════════════════════════════════════════════════
 *
 *  Use this code on your CenterPanel server to call the secured APIs.
 *
 *  ENV on CenterPanel:
 *    API_URL=https://api.yourdomain.com/v1
 *    CENTERPANEL_SECRET=same-secret-as-api-server
 *
 *  ENV on API server (.env):
 *    CENTERPANEL_SECRET=your-super-secret-key-min-32-chars
 *    CENTERPANEL_IPS=123.45.67.89,98.76.54.32  (optional — your centerpanel server IPs)
 */

const crypto = require("crypto");
const axios = require("axios");

const API_URL = process.env.API_URL || "http://localhost:5001/v1";
const SECRET = process.env.CENTERPANEL_SECRET || "your-super-secret-key-here-min-32-chars";

/**
 * Call a secured CenterPanel API endpoint
 * @param {string} endpoint - e.g. "/cp/bookmakerDecision"
 * @param {object} body - Request payload
 * @returns {Promise<object>} API response
 */
async function callSecuredAPI(endpoint, body = {}) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyStr = JSON.stringify(body);

  // Create HMAC-SHA256 signature
  const payload = bodyStr + timestamp + nonce;
  const signature = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");

  try {
    const response = await axios.post(`${API_URL}${endpoint}`, body, {
      headers: {
        "Content-Type": "application/json",
        "X-CP-Signature": signature,
        "X-CP-Timestamp": timestamp,
        "X-CP-Nonce": nonce,
      },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    console.error(`CenterPanel API error [${endpoint}]:`, error.response?.data || error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
//  USAGE EXAMPLES (uncomment and use on CenterPanel server):
// ═══════════════════════════════════════════════════════════════

// // Bookmaker Decision
// callSecuredAPI("/cp/bookmakerDecision", {
//   marketId: "1.234567890",
//   result: "teamA",
// }).then(res => console.log("Bookmaker:", res));

// // Fancy Decision
// callSecuredAPI("/cp/fancyDecision", {
//   marketId: "1.234567890",
//   selectionId: "12345",
//   decisionRun: 42,
// }).then(res => console.log("Fancy:", res));

// // Fancy Rollback
// callSecuredAPI("/cp/fancyRollback", {
//   marketId: "1.234567890",
//   selectionId: "12345",
// }).then(res => console.log("Rollback:", res));

module.exports = { callSecuredAPI };
