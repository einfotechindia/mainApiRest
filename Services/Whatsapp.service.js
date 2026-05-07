const axios = require("axios");

class WhatsAppService {
  constructor() {
    this.baseURL = "https://graph.facebook.com/v19.0"; // latest version
    this.token = process.env.WHATSAPP_TOKEN; // put your token here
    this.phoneNumberId = process.env.PHONE_NUMBER_ID;
  }

  // 🔹 Common Send Function
  async sendMessage(payload) {
    try {
      const url = `${this.baseURL}/${this.phoneNumberId}/messages`;

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error("WhatsApp Error:", error.response?.data || error.message);
      throw error;
    }
  }

  // 🔹 Send OTP Message
  async sendOTP(to, otp) {
    return this.sendMessage({
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: "otp_template", // create in Meta dashboard
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: otp }
            ]
          }
        ]
      }
    });
  }

  // 🔹 Send Bill Message
  async sendBill(to, name, amount) {
    return this.sendMessage({
      messaging_product: "whatsapp",
      to: to,
      type: "template",
      template: {
        name: "bill_template",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: name },
              { type: "text", text: amount }
            ]
          }
        ]
      }
    });
  }

  // 🔹 Send Custom Text (Session Message)
  async sendText(to, message) {
    return this.sendMessage({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: {
        body: message
      }
    });
  }

  // 🔹 Bulk Messages
  async sendBulk(messages = []) {
    const results = [];

    for (let msg of messages) {
      try {
        const res = await this.sendText(msg.to, msg.message);
        results.push({ success: true, to: msg.to, data: res });
      } catch (err) {
        results.push({ success: false, to: msg.to, error: err.message });
      }
    }

    return results;
  }
}

module.exports = new WhatsAppService();