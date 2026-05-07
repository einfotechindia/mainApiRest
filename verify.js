const crypto = require("crypto");

function verifySignature(payload, signature, publicKey) {
  const publicKeyBuffer = Buffer.from(publicKey, "utf8");
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(JSON.stringify(payload));
  const isSignatureValid = verifier.verify(
    publicKeyBuffer,
    signature,
    "base64"
  );
  return isSignatureValid;
}

// Sample payload, private key, and public key
const payload = { message: "Hello, world!" };
const privateKey = "your_private_key_here";
const publicKey = "your_public_key_here";

// Create a digital signature
const signature = createSignature(payload, privateKey);

console.log("Signature:", signature);

// Verify the signature
const isSignatureValid = verifySignature(payload, signature, publicKey);

if (isSignatureValid) {
  console.log("Signature is valid.");
} else {
  console.log("Signature is not valid.");
}
