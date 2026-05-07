const fs = require("fs");
const crypto = require("crypto");

function createSignature(payload, privateKey) {
  const privateKeyBuffer = Buffer.from(privateKey, "utf8");
  // console.log("PRBuffer   ",privateKeyBuffer)
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(JSON.stringify(payload));
  const signature = signer.sign(privateKeyBuffer, "base64");
  return signature;
}

// Example Usage
const privateKey = fs.readFileSync("./private.pem", "utf8");
const payload = {
  operatorId: "smartmade",
  userId: "xyz_user_id",
  providerName: "RG",
  platformId: "desktop",
  currency: "INR",
  clientIp: "1.1.1.1",
  username: "xyzuser",
  lobby: false,
  gameId: "900001",
};
const signature = createSignature(payload, privateKey);
console.log(JSON.stringify(payload));
console.log("dd", signature);
