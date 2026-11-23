const crypto = require("crypto");
const talkstryService = require("../../Services/Talkstry/Talkstry.service");
const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { sendTalkstryMessage } = require("../../Helpers/CommonHelper");

const sendError = (res, error) => {
  if (error instanceof talkstryService.TalkstryError) {
    return SendResponse(res, "error", error.message, {
      code: error.code,
      status: error.status,
      requestId: error.requestId,
      details: error.data,
    });
  }
  console.error("Talkstry controller error:", error);
  return SendResponse(res, "error", "Something went wrong");
};

const organization = async (req, res) => {
  try {
    const data = await talkstryService.getOrganization();
    // Organisation ka naam / email / id panel ko nahi bhejna — sirf connection ki jankari
    return SendResponse(res, "success", "Organization fetched", {
      connected: true,
      environment: data.environment,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

const sendMessage = async (req, res) => {
  try {
    const { to, text, template, idempotencyKey } = req.body;
    const data = await talkstryService.sendMessage({
      to,
      text,
      template,
      // Panel se key na aaye to har request ek naya send maana jayega
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
    });
    return SendResponse(res, "success", "Message queued", data);
  } catch (error) {
    return sendError(res, error);
  }
};

// Panel ka "send" — ek ya bulk numbers, attachment me uploadMedia se mili media id aati hai
const send = async (req, res) => {
  try {
    const { numbers, msg, title, attachment } = req.body;
    const result = await sendTalkstryMessage(numbers, msg, attachment || null, { title });
    if (result.error) return SendResponse(res, "error", result.error, result);
    return SendResponse(res, "success", `${result.sent} sent, ${result.failed} failed`, result);
  } catch (error) {
    return sendError(res, error);
  }
};

const uploadMedia = async (req, res) => {
  try {
    if (!req.file) return SendResponse(res, "error", "file is required");
    const data = await talkstryService.uploadMedia({
      buffer: req.file.buffer,
      fileName: req.file.originalname.replace(/\s+/g, "_"),
      mimeType: req.file.mimetype,
    });
    return SendResponse(res, "success", "File uploaded", data);
  } catch (error) {
    return sendError(res, error);
  }
};

const messageStatus = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return SendResponse(res, "error", "id is required");
    const data = await talkstryService.getMessage(id);
    return SendResponse(res, "success", "Message status fetched", data);
  } catch (error) {
    return sendError(res, error);
  }
};

const sendOtp = async (req, res) => {
  try {
    const { phone, template } = req.body;
    const data = await talkstryService.sendOtp({ phone, template });
    return SendResponse(res, "success", "OTP sent", data);
  } catch (error) {
    return sendError(res, error);
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, code } = req.body;
    const data = await talkstryService.verifyOtp({ phone, code });
    if (!data.verified) return SendResponse(res, "error", data.message || "Invalid OTP", data);
    return SendResponse(res, "success", "OTP verified", data);
  } catch (error) {
    return sendError(res, error);
  }
};

const broadcast = async (req, res) => {
  try {
    const { text, idempotencyKey } = req.body;
    const data = await talkstryService.broadcast({
      text,
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
    });
    return SendResponse(res, "success", "Broadcast queued", data);
  } catch (error) {
    return sendError(res, error);
  }
};

// TalksTry -> hum. req.body yahan raw Buffer hai (app.js me express.raw se mount hai).
// 10s ke andar 2xx dena hai warna TalksTry retry karta hai (at-least-once delivery).
const webhook = async (req, res) => {
  if (!talkstryService.verifyWebhookSignature(req.body, req.headers["talkstry-signature"])) {
    return res.status(401).json({ error: true, message: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch (_) {
    return res.status(400).json({ error: true, message: "Invalid JSON" });
  }

  // Retry pe same event dobara aa sakta hai — event id se dedupe
  const eventId = req.headers["talkstry-event-id"] || event.id;
  if (eventId) {
    const isNew = await client.set(`talkstry:webhook:${eventId}`, "1", "EX", 86400, "NX").catch(() => "OK");
    if (!isNew) return res.status(200).json({ received: true, duplicate: true });
  }

  // Events: message.sent, message.delivered, message.read, message.inbound, otp.sent, otp.verified
  console.log("TalksTry webhook:", event.type, JSON.stringify(event.data || {}));

  return res.status(200).json({ received: true });
};

module.exports = {
  organization,
  sendMessage,
  send,
  uploadMedia,
  messageStatus,
  sendOtp,
  verifyOtp,
  broadcast,
  webhook,
};
