const { SendResponse } = require("../../Helpers/ResponseMapper");
const { client } = require("../../Helpers/RedisHelper");
const { ObjectId } = require("mongodb");
const crypto = require("crypto");
const Joi = require("joi");
const { siteSetting } = require("../../Common/Constants");
const {
  UserCreate,
  userDetailsByUserId,
} = require("../../Services/User/User.service");
const {
  _dx,
  whereHelper,
  _d,
  mongoToJson,
  convertKeyObject,
  dateWhereCond,
  sanitize
} = require("../../Helpers/CommonHelper");
const multer = require("multer");
const UserModel = require("../../Models/User/User.model");
const axios = require("axios");
const {
  UpdateUserCoins,
  userIntCasinoExpoLimit,
} = require("../../Helpers/TransactionHelper");

let PAYMENT_PAY_IN_API = "https://api8189.paytofa.com/v2/upi/payin"
let PAYMENT_CHECK_BALANCE_API = "https://api8189.paytofa.com/v2/transaction/balance"
// PAYMENT_PAY_IN_STATUS_API = "https://api8189.paytofa.com/v2/upi/status"
// PAYMENT_PAYOUT_API = "https://api8189.paytofa.com/v2/payout"
// PAYMENT_PAYOUT_STATUS_API = "https://api8189.paytofa.com/v2/payout/status"


const bearerToken = process.env.PAYMENT_LIVE_SECREAT_KEY;
const hashSecreatKey = process.env.PAYMENT_LIVE_SECREAT_HASH;
let ivHex = 'a1f4c88b637e29cd3e1bc5a9d4b087ac';

function encryptData(data) {
  const secretHashKey = Buffer.from(hashSecreatKey, "base64"); // decode just like PHP
  const iv = Buffer.from(ivHex, "hex");
  const json = JSON.stringify(data);
  const cipher = crypto.createCipheriv("aes-256-cbc", secretHashKey, iv);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  return encrypted.toString("base64");
}

function generateMerchantOrderId() {
  const random = Math.floor(10000000 + Math.random() * 90000000);
  return `96${random}`;
}

async function payInRequest(req, res) {
  try {
    let {amount} = req.body
    const loginData = req.loggedInUser;
    let userId = loginData.userId
    let clientData = await UserModel.findOne({
      userId : userId
    })

    if (!clientData.status) {
        return SendResponse(res, "error", "client is inactive");
    }
    
    let merchantOrderId = generateMerchantOrderId()
    const payload = {
      customer_user_id: clientData.userId+"",
      first_name: clientData.username,
      last_name: clientData.name,
      email: `${clientData.username}@gmail.com`,
      phone_number: merchantOrderId,
      amount: amount.toFixed(2),
      merchant_order_id: `ORD-${merchantOrderId}`,
      membership_duration: 3,
      response_url: "https://ministerexch.com/",
      webhook_url: "http://101.53.148.246:5001/getPaymentInfo",
    };

    // _d(payload, "payload")
    
    // _d(PAYMENT_PAY_IN_API , "PAYMENT_PAY_IN_API")
  
    let encryptDatapayLoad = encryptData(payload)
    const requestBody = { encrypted_data: encryptDatapayLoad };

    let apiResponse;
    try {
      apiResponse = await axios.post(
        PAYMENT_PAY_IN_API,
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + bearerToken,
          },
          timeout: 3000,
          maxRedirects: 5,
        }
      );
    } catch (error) {
      console.log(error.message)
      return SendResponse(res, "error", "cURL/Network error",error.message);
    }


   // _d(apiResponse.data)

  } catch (error) {
    console.error("payInRequest ERROR:", error);
    
  }
}



async function checkStatus(req, res) {
  try {
    // Sanitize Query Params
    let status = sanitize(req.query.status);
    let message = sanitize(req.query.message);
    let orderId = sanitize(req.query.order_id);
    let transactionId = sanitize(req.query.transaction_id);

    let transactionData = null;
    let transactionAmount = null;
    let transactionStatus = status; // default from URL

    // ---------------------------
    // Call PayToFA API
    // ---------------------------
    if (transactionId && orderId) {
      let payload = {
        merchant_order_id: orderId,
        transaction_id: transactionId,
      };

      try {
        const apiRes = await axios.post(
          "https://api8189.paytofa.com/v2/upi/status",
          payload,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + bearerToken,
            },
            timeout: 30000,
          }
        );

        transactionData = apiRes.data;

        // Prefer API status/message
        if (transactionData.status) {
          transactionStatus = transactionData.status;
        }
        if (transactionData.message) {
          message = transactionData.message;
        }
        if (transactionData.amount) {
          transactionAmount = transactionData.amount;
        }
      } catch (e) {
        console.error("PayToFA API Error:", e.message);
      }
    }

    // ---------------------------
    // Final Output JSON
    // ---------------------------
    return res.json({
      success: true,
      transactionStatus,
      message,
      details: {
        amount: transactionAmount || null,
        orderId,
        transactionId,
      },
    });

  } catch (error) {
    console.error("PayInApi Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

async function checkBalance(req, res) {
  try {
   // _d(PAYMENT_CHECK_BALANCE_API, "PAYMENT_CHECK_BALANCE_API")
    
        let headers =  {
            "Content-Type": "application/json",
            Authorization: "Bearer " + bearerToken,
          }

   // _d(headers , "headers")

    let apiResponse;
    try {
      apiResponse = await axios.post(
        PAYMENT_CHECK_BALANCE_API,
        {
          headers: headers,
          timeout: 3000,
        }
      );
    } catch (error) {
      console.log(error.message)
      return SendResponse(res, "error", "",error.message);
    }


   // _d(apiResponse)

  } catch (error) {
    console.error("payInRequest ERROR:", error);
    
  }
}






module.exports = {
  payInRequest,
  checkStatus,
  checkBalance
};
