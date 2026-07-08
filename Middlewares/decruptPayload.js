const CryptoJS = require("crypto-js");
const decruptData = async (req, res, next) => {
  try {
    if (
      (req.body &&  req.body.data && req.body.isEncruption) || process.env.IS_RECEIVED_DATA_ENCRUPTION == "true"
    ) {
      let returnStatus = false
      let encruptedData = req?.body?.data;

      if (!encruptedData) {
        returnStatus = true
        if (res) {
            return res.status(400).json({
              message: "Unauthorised Request",
              error: true,
              code : 0
            });
        }
        req.body = { returnStatus: true };
        if (next) return next();
        return req.body;
      }

      const bytes = CryptoJS.AES.decrypt(
          encruptedData,
          process.env.DATA_DECRUPTION_KEY_REACT
      );

        const decryptedData = bytes.toString(CryptoJS.enc.Utf8);
      if (decryptedData && decryptedData!=null && decryptedData!="") {
          req.body = JSON.parse(decryptedData);
        if (!req?.body.timestamp) {
          returnStatus = true
        }
        const inputTime = new Date(req?.body?.timestamp);
        const now = new Date();
        const diffInSeconds = Math.floor((now - inputTime) / 1000);

        if (diffInSeconds > 30) {
           returnStatus = true
        }
          console.log(JSON.stringify(req.body), "req.bodyddd")

        if (res && returnStatus) {
            return res.status(400).json({
              message: "Unauthorised Request",
              error: true,
              code : 0
            });
        }
        
     
        
        req.body.returnStatus = returnStatus
      } else {
        req.body = { returnStatus: true }
        
        if (res) {
            return res.status(400).json({
              message: "Unauthorised Request",
              error: true,
              code : 0
            });
        }
      }
    }

    if (next) {
      next();
    } else {
      return req.body;
    }

  } catch (e) {
    console.log(e , "error in decrupt payload function")
    if (res) {
      return res.status(400).json({
        message: "Unauthorised Request",
        error: true,
        code : 0
      });
    }
    return { returnStatus: true };
  }
};

module.exports = decruptData;