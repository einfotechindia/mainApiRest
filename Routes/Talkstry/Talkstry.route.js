const express = require("express");
const multer = require("multer");
const { verifyToken, isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const decruptPayload = require("../../Middlewares/decruptPayload");
const router = express.Router();
const rawRouter = express.Router();
const TalkstryController = require("../../Controllers/Talkstry/Talkstry.controller");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

// ─── rawRouter — app.js me express.json / sanitizer / securityGuard se PEHLE mount hai ───
// webhook     : signature raw body pe verify hota hai
// uploadMedia : multipart file
// send        : message text jaisa likha hai waisa hi jana chahiye (sanitizer ' " ( ) ; hata deta hai)
rawRouter.post("/webhook", express.raw({ type: "*/*", limit: "1mb" }), TalkstryController.webhook);
rawRouter.post("/uploadMedia", verifyToken, isOwnerAndStaff, upload.single("file"), TalkstryController.uploadMedia);
rawRouter.post("/send", express.json({ limit: "1mb" }), decruptPayload, verifyToken, isOwnerAndStaff, TalkstryController.send);

// Account
router.post("/organization", verifyToken, isOwnerAndStaff, TalkstryController.organization);

// Messages
router.post("/sendMessage", verifyToken, isOwnerAndStaff, TalkstryController.sendMessage);
router.post("/messageStatus", verifyToken, isOwnerAndStaff, TalkstryController.messageStatus);
router.post("/broadcast", verifyToken, isOwnerAndStaff, TalkstryController.broadcast);

// OTP
router.post("/sendOtp", verifyToken, isOwnerAndStaff, TalkstryController.sendOtp);
router.post("/verifyOtp", verifyToken, isOwnerAndStaff, TalkstryController.verifyOtp);

module.exports = router;
module.exports.rawRouter = rawRouter;
