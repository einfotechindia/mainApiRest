const express = require("express");
const {
  verifyToken,
  verifyCasinoToken,
  convertDecruptToEncrupt,
  isOwnerAndStaff,
} = require("../../Middlewares/VerifyToken");
const router = express.Router();
const UserController = require("../../Controllers/User/User.controller");

router.post("/login", UserController.Login);
router.post("/UserLoginCheck", UserController.UserLoginCheck);

router.post("/userLogout",verifyToken,UserController.userLogout);
router.post("/create", verifyToken, UserController.Create);
router.post("/userDetails", verifyToken, UserController.Details);
router.post("/userBalance", verifyToken, UserController.userBalance);
router.post("/userList", verifyToken, UserController.userList);
router.post("/verifyOtp", verifyToken, UserController.verifyOtp);
router.post("/shareDetails", verifyToken, UserController.shareDetails);
router.post(
  "/userAccountDetails",
  verifyToken,
  UserController.getUserAccountDetails
);
router.post("/userStatement", verifyToken, UserController.userStatement);
router.post("/userActivity", verifyToken, UserController.userActivity);
router.post(
  "/userLoginActivity",
  verifyToken,
  isOwnerAndStaff,
  UserController.userLoginActivity
);
router.post("/userLedger", verifyToken, UserController.userLedger);
router.post("/deleteUserLedger", verifyToken, UserController.deleteUserLedger);
router.post("/lenaDena", verifyToken, UserController.lenaDena);
router.post(
  "/ledgerCreditDebit",
  verifyToken,
  UserController.ledgerCreditDebit
);
router.post("/secureCode", verifyToken, UserController.secureCode);
router.patch("/userUpdate", verifyToken, UserController.userUpdate);


router.patch(
  "/updateUserPassword",
  verifyToken,
  UserController.updateUserPassword
);

router.patch(
  "/updateRateReffrenece",
  verifyToken,
  UserController.updateRateReffrenece
);


router.patch(
  "/updateBetChipsModal",
  verifyToken,
  UserController.updateBetChipsModal
);

router.patch(
  "/transactionPassword",
  verifyToken,
  UserController.updateTransactionPassword
);

router.patch("/updateCoins", verifyToken, UserController.updateCoins);
router.post("/createDomain", verifyToken, UserController.createDomain);
router.post("/domainList", verifyToken, UserController.domainList);

router.post("/saveNotification", verifyToken, UserController.saveNotification);
router.post("/notificationList", verifyToken, UserController.notificationList);
router.post(
  "/userParentShareDetails",
  verifyToken,
  UserController.userParentShareDetails
);

router.post(
  "/userLenaDenaByledger",
  verifyToken,
  UserController.userLenaDenaByledger
);

router.post(
  "/casinoReportByUser",
  verifyToken,
  UserController.casinoReportByUser
);

router.post(
  "/completeLedgerDetails",
  verifyToken,
  UserController.completeLedgerDetails
);

router.post("/exposureDataList", verifyToken, UserController.exposureDataList);

router.post(
  "/userSportsSetting",
  verifyToken,
  UserController.userSportsSetting
);
router.post(
  "/getUserSportsSetting",
  verifyToken,
  UserController.getUserSportsSetting
);
router.post("/userConfig", verifyToken, UserController.userConfig);
router.post("/getUserConfig", verifyToken, UserController.getUserConfig);
router.post("/userSearch", verifyToken, UserController.userSearch);
router.post("/userSuggestion", verifyToken, UserController.userSuggestion);
router.post(
  "/userExpoLimitList",
  verifyToken,
  UserController.userExpoLimitList
);
router.post(
  "/userExpoLimitCreditDebit",
  verifyToken,
  UserController.userExpoLimitCreditDebit
);

router.post("/getUserShareData", verifyToken, UserController.getUserShareData);

router.post(
  "/clientBetListByMarketId",
  verifyToken,
  UserController.clientBetListByMarketId
);


router.post(
  "/declareInternationalExposure",
  verifyToken,
  UserController.declareInternationalExposure
);


router.post("/updateMatkaLimit", verifyToken, UserController.updateMatkaLimit);
router.post(
  "/updateOneClickBet",
  verifyToken,
  UserController.updateOneClickBet
);


router.post("/updateBulkStatus", verifyToken, UserController.updateBulkStatus);


// International Casino Route
router.post(
  "/saveInternationalCasinoList",
  verifyToken,
  UserController.saveInternationalCasinoList
);
router.post("/casinoLoginUrl", verifyToken, UserController.userCasinoLoginUrl);
router.post("/qtechLoginUrl", verifyToken, UserController.qtechLoginUrl);
router.post("/balance", verifyCasinoToken, UserController.userCasinoBalance);
router.post("/betrequest", verifyCasinoToken, UserController.userBetRequest);
router.post(
  "/resultrequest",
  verifyCasinoToken,
  UserController.userResultRequest
);
router.post(
  "/rollbackrequest",
  verifyCasinoToken,
  UserController.userRollbackRequest
);


router.post("/getBetInfoyTransactionId", verifyToken, UserController.getBetInfoyTransactionId);


router.post("/downlineCount", verifyToken, UserController.downlineCount);


router.post(
  "/downlineCountAndLimit",
  verifyToken,
  UserController.downlineCountAndLimit
);

module.exports = router;
