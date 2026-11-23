const axios = require("axios");
const crypto = require("crypto");

// TalksTry Business API client — https://talkstry.com/documents/docs
// .env: TALKSTRY_BASE_URL (host developer console me milta hai, bina /v1 ke),
//       TALKSTRY_CLIENT_ID, TALKSTRY_CLIENT_SECRET, TALKSTRY_WEBHOOK_SECRET,
//       TALKSTRY_OTP_TEMPLATE (approved authentication template ka naam)

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const WEBHOOK_TOLERANCE_SECONDS = 300;

class TalkstryError extends Error {
  constructor(message, { status, code, data, requestId } = {}) {
    super(message);
    this.name = "TalkstryError";
    this.status = status;
    this.code = code;
    this.data = data;
    this.requestId = requestId;
  }
}

const baseURL = () => {
  const host = (process.env.TALKSTRY_BASE_URL || "").replace(/\/+$/, "").replace(/\/v1$/, "");
  if (!host) throw new TalkstryError("TALKSTRY_BASE_URL not configured", { code: "not_configured" });
  return `${host}/v1`;
};

// Docs error body ka exact shape nahi batate — jo bhi common field mile wahi utha lo
const toTalkstryError = (error) => {
  if (error instanceof TalkstryError) return error;
  const res = error.response;
  if (!res) return new TalkstryError(error.message, { code: "network_error" });
  const body = res.data || {};
  const nested = body.error && typeof body.error === "object" ? body.error : {};
  const code = body.code || nested.code || (typeof body.error === "string" ? body.error : undefined);
  const message = body.message || nested.message || code || `TalksTry request failed (${res.status})`;
  return new TalkstryError(message, {
    status: res.status,
    code,
    data: body.data || nested.data || { retryAfter: res.headers?.["retry-after"] },
    requestId: res.headers?.["talkstry-request-id"],
  });
};

// 🔹 Access token (1 ghante ka hota hai) — expiry tak cache, parallel calls ek hi request share karte hain
let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

const fetchAccessToken = async () => {
  const { TALKSTRY_CLIENT_ID, TALKSTRY_CLIENT_SECRET } = process.env;
  if (!TALKSTRY_CLIENT_ID || !TALKSTRY_CLIENT_SECRET) {
    throw new TalkstryError("TALKSTRY_CLIENT_ID / TALKSTRY_CLIENT_SECRET not configured", { code: "not_configured" });
  }
  try {
    const response = await axios.post(
      `${baseURL()}/auth/token`,
      {
        grant_type: "client_credentials",
        client_id: TALKSTRY_CLIENT_ID,
        client_secret: TALKSTRY_CLIENT_SECRET,
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );
    cachedToken = response.data.access_token;
    // 60s pehle hi expire maan lo taaki beech request me token na mare
    tokenExpiresAt = Date.now() + ((response.data.expires_in || 3600) - 60) * 1000;
    return cachedToken;
  } catch (error) {
    throw toTalkstryError(error);
  }
};

const getAccessToken = async (forceRefresh = false) => {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = fetchAccessToken().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
};

// 🔹 Common request function
const request = async (method, path, { data, headers = {} } = {}, isRetry = false) => {
  const token = await getAccessToken(isRetry);
  try {
    const response = await axios({
      method,
      url: `${baseURL()}${path}`,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      timeout: 15000,
    });
    return response.data;
  } catch (error) {
    // Token beech me revoke/expire ho gaya — ek baar naye token se retry
    if (error.response?.status === 401 && !isRetry) {
      return request(method, path, { data, headers }, true);
    }
    const err = toTalkstryError(error);
    console.error("TalksTry Error:", method, path, err.status, err.code, err.message, err.requestId || "");
    throw err;
  }
};

const assertPhone = (phone) => {
  if (typeof phone !== "string" || !E164_REGEX.test(phone)) {
    throw new TalkstryError("Phone number must be in E.164 format, e.g. +919876543210", { status: 400, code: "invalid_request" });
  }
};

// 🔹 Organization info — keys sahi hain ya nahi check karne ke liye
const getOrganization = () => request("get", "/organization");

// 🔹 Send message — text YA template, dono saath nahi.
// idempotencyKey business event se banao (e.g. `deposit-${id}`), timestamp se nahi.
const sendMessage = async ({ to, text, template, idempotencyKey }) => {
  assertPhone(to);
  if (!idempotencyKey) {
    throw new TalkstryError("idempotencyKey is required", { status: 400, code: "invalid_request" });
  }
  if ((text && template) || (!text && !template)) {
    throw new TalkstryError("Send either text or template", { status: 400, code: "invalid_request" });
  }
  const data = { to };
  if (text) data.text = text;
  else data.template = template;
  return request("post", "/messages/send", { data, headers: { "Idempotency-Key": String(idempotencyKey) } });
};

// 🔹 Message status (sent / delivered / read / failed)
const getMessage = (id) => request("get", `/messages/${encodeURIComponent(id)}`);

// 🔹 Media upload — PNG/JPG/WebP 5 MB tak, MP4/PDF 16 MB tak. Milne wali id 30 din valid rehti hai,
// usko sendMessage ke template.header.mediaId me do.
const uploadMedia = async ({ buffer, fileName, mimeType }) => {
  if (!Buffer.isBuffer(buffer) || !fileName) {
    throw new TalkstryError("buffer and fileName are required", { status: 400, code: "invalid_request" });
  }
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), fileName);
  form.append("file_name", fileName);
  const result = await request("post", "/media", { data: form, headers: { "Content-Type": "multipart/form-data" } });
  // Guide me response { data: {...} } me wrapped dikhta hai, docs me top-level — dono chalne do
  return result?.data?.id ? result.data : result;
};

// 🔹 Media info (expire hua ya nahi)
const getMedia = (id) => request("get", `/media/${encodeURIComponent(id)}`);

// 🔹 Send OTP — code TalksTry khud banata hai, hume kabhi wapas nahi milta. 5 min valid, single use.
const sendOtp = async ({ phone, template } = {}) => {
  assertPhone(phone);
  const data = { phone };
  const otpTemplate = template || (process.env.TALKSTRY_OTP_TEMPLATE ? { name: process.env.TALKSTRY_OTP_TEMPLATE } : null);
  if (otpTemplate) data.template = otpTemplate;
  return request("post", "/otp/send", { data });
};

// 🔹 Verify OTP — galat/expired/used code pe TalksTry 400 deta hai, usko verified:false me badal dete hain
const verifyOtp = async ({ phone, code } = {}) => {
  assertPhone(phone);
  if (!/^\d{4,8}$/.test(String(code || ""))) {
    throw new TalkstryError("code must be 4 to 8 digits", { status: 400, code: "invalid_request" });
  }
  try {
    return await request("post", "/otp/verify", { data: { phone, code: String(code) } });
  } catch (error) {
    if (error.status === 400) {
      return { verified: false, status: "invalid", message: error.message };
    }
    throw error;
  }
};

// 🔹 Broadcast — organisation ke saare member accounts ko (sirf live keys pe chalta hai)
const broadcast = async ({ text, idempotencyKey }) => {
  if (!text || !idempotencyKey) {
    throw new TalkstryError("text and idempotencyKey are required", { status: 400, code: "invalid_request" });
  }
  return request("post", "/organizations/broadcast", {
    data: { text },
    headers: { "Idempotency-Key": String(idempotencyKey) },
  });
};

// 🔹 Webhook signature — header: `Talkstry-Signature: t=<unix seconds>,v1=<hex hmac>`
// HMAC-SHA256(secret, `${t}.${rawBody}`) — rawBody parse hone se pehle wala Buffer hona chahiye
const verifyWebhookSignature = (rawBody, signatureHeader) => {
  const secret = process.env.TALKSTRY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;

  const parts = {};
  for (const part of String(signatureHeader).split(",")) {
    const idx = part.indexOf("=");
    if (idx > 0) parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${parts.t}.`), rawBody]))
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(parts.v1);
  return expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
};

module.exports = {
  TalkstryError,
  getAccessToken,
  getOrganization,
  sendMessage,
  getMessage,
  uploadMedia,
  getMedia,
  sendOtp,
  verifyOtp,
  broadcast,
  verifyWebhookSignature,
};
