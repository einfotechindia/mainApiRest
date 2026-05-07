const CryptoJS = require("crypto-js");

function SendResponse(res, status, message, data, token) {
  let statusCode = "";
  let code = "";
  let error = "";
  switch (status.toLowerCase()) {
    case "success":
      statusCode = 200;
      code = 0;
      error = false;
      break;

    case "error":
      statusCode = 400;
      error = true;
      code = 1;
      break;

    case "badrequest":
      statusCode = 400;
      error = true;
      code = 1;
      break;

    case "unauthorized":
      statusCode = 401;
      error = true;
      code = 3;
      break;

    default:
      statusCode = 500;
      break;
  }

  let sendData = {
    message: message,
    code: code,
    error: error,
    data: data,
    token: token,
  }

  let isDataEncruption = false;
    if (
      process.env.IS_DATA_ENCRUPTION &&
      process.env.IS_DATA_ENCRUPTION == "true"
    ) {
      isDataEncruption = true;
      sendData.dataEncrupt = true
    }

  if (isDataEncruption) {
    const encryptedData = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      process.env.DATA_ENCRUPTION_KEY
    ).toString();
    data = encryptedData;
    sendData.data = data
  }

  return res.status(statusCode).json(sendData);
}

function returnResponse(status, message, data) {
  const returnData = {
    status: status,
    message: message,
    data: data,
  };
  return returnData;
}

function sendCasinoResponse(res, status, balance) {
  let returnStatus = "OP_SUCCESS";
  if (!balance) {
    balance = 0;
  }
  switch (status) {
    case "success":
      returnStatus = "OP_SUCCESS";
      break;
    case "error":
      returnStatus = "OP_GENERAL_ERROR";
      break;
    case "block":
      returnStatus = "OP_USER_BLOCKED";
      break;
    case "token_not_found":
      returnStatus = "OP_TOKEN_NOT_FOUND";
      break;
    case "user_disable":
      returnStatus = "OP_USER_DISABLED";
      break;
    case "no_balance":
      returnStatus = "OP_INSUFFICIENT_FUNDS";
      break;
    case "zero_debit_amount":
      returnStatus = "OP_ZERO_DEBIT_AMOUNT";
      break;
    case "invalid_transaction":
      returnStatus = "OP_ERROR_INVALID_TRANSACTION";
      break;
    case "invalid_signature":
      returnStatus = "OP_INVALID_SIGNATURE";
      break;
    case "transaction_timed_out":
      returnStatus = "OP_TRANSACTION_TIMEOUT";
      break;
    case "token_expire":
      returnStatus = "OP_TOKEN_EXPIRED";
      break;
    case "account_lock":
      returnStatus = "OP_ACCOUNT_LOCKED";
      break;
    case "request_time_out":
      returnStatus = "OP_REQUEST_TIMEOUT";
      break;
    case "user_not_found":
      returnStatus = "OP_USER_NOT_FOUND";
      break;
    case "negative_debit_amount":
      returnStatus = "OP_ERROR_NEGATIVE_DEBIT_AMOUNT";
      break;
    case "duplicate_transaction":
      returnStatus = "OP_DUPLICATE_TRANSACTION";
      break;
    case "invalid_game_id":
      returnStatus = "OP_INVALID_GAME";
      break;
    case "invalid_param":
      returnStatus = "OP_INVALID_PARAMS";
      break;
    case "transaction_not_exist":
      returnStatus = "OP_TRANSACTION_NOT_FOUND";
      break;
    case "transaction_invalid":
      returnStatus = "OP_ERROR_TRANSACTION_INVALID";
      break;
  }

  return res.status(200).json({
    status: returnStatus,
    balance: balance,
  });
}

module.exports = { SendResponse, returnResponse, sendCasinoResponse };
