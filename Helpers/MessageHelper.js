const messages = require("../Common/messages");

const PROJECT = (process.env.PROJECT_NAME || "default").toLowerCase().trim();

/**
 * msg — Project-wise message return karta hai
 *
 * @param {string} key    - "bet.oddsSuccess", "auth.invalidCredentials" etc.
 * @param {object} params - { oddsType: "bookmaker", matchName: "IND vs AUS" }
 * @returns {string}      - Final message with placeholders replaced
 *
 * Logic:
 *   1. messages[key][PROJECT] exists? → use it
 *   2. nahi? → messages[key]["default"] use karo
 *   3. woh bhi nahi? → key hi return karo (kabhi crash nahi hoga)
 *
 * Usage:
 *   msg("bet.oddsSuccess", { oddsType: "bookmaker" })
 *   msg("transaction.insufficientCoins")
 *   msg("crick.depositRemark", { userRemark: "test", username: "john", ... })
 */
function msg(key, params) {
  const entry = messages[key];

  if (!entry) return key;

  const text = entry[PROJECT] !== undefined ? entry[PROJECT] : entry["default"];

  if (text === undefined) return key;

  if (!params) return text;

  return text.replace(/\{(\w+)\}/g, (match, k) => {
    return params[k] !== undefined ? params[k] : match;
  });
}

module.exports = { msg };
