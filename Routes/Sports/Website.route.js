const express = require("express");
const {
  verifyToken,
  isOwnerAndStaff
} = require("../../Middlewares/VerifyToken");
const router = express.Router();
const websiteController = require("../../Controllers/Bets/Website.controller");

router.post("/createDomain", verifyToken, isOwnerAndStaff, websiteController.createDomain);
router.post("/DomainList", verifyToken, websiteController.DomainList);
router.post("/deleteDomain", verifyToken,isOwnerAndStaff, websiteController.deleteDomain);
router.post("/updateDomain", verifyToken, websiteController.updateDomain);
router.post(
  "/checkDuplicateFancy",
  verifyToken,
  isOwnerAndStaff,
  websiteController.checkDuplicateFancy
);

router.post(
  "/domainSettingByDomainName",
  websiteController.domainSettingByDomainName
);


router.post(
  "/registerClient",
  websiteController.registerClient
);

router.post(
  "/fileUpload",
  websiteController.upload.single("image"),
  // websiteController.uploadImage
  websiteController.fileUploadToS3
);

router.post(
  "/fileUploadToS3",
  websiteController.upload.single("image"),
  websiteController.fileUploadToS3
);

router.post("/depositReq", verifyToken, websiteController.depositReq);
router.post("/withdrawReq", verifyToken, websiteController.withdrawReq);
router.post(
  "/approveDisapproveReq",
  verifyToken,
  websiteController.approveDisapproveReq
);

router.post(
  "/updateAccountDetails",
  verifyToken,
  websiteController.updateAccountDetails
);

router.post(
  "/getAccountDetailsByUserId",
  verifyToken,
  websiteController.getAccountDetailsByUserId
);

router.post(
  "/getDepositWithdrawList",
  verifyToken,
  websiteController.getDepositWithdrawList
);

router.post(
  "/allUserTypePasswordUpdate",
  verifyToken,
  isOwnerAndStaff,
  websiteController.allUserTypePasswordUpdate
);

router.post(
  `/flushAllRedisKeys`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.flushAllRedisKeys
);

router.post(
  `/forceLogOutAllUser`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.forceLogOutAllUser
);

router.post(`/view`, verifyToken, websiteController.view);

router.post(
  `/checkExposureClient`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.checkExposureClient
);

router.post(`/updateSetting`, verifyToken, isOwnerAndStaff , websiteController.updateSetting);
router.post(`/getSetting`, verifyToken, isOwnerAndStaff, websiteController.getSetting);
router.post(`/mergeLedger`, verifyToken,isOwnerAndStaff, websiteController.mergeLedger);
router.post(
  `/mergeTransaction`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.mergeTransaction
);

router.post(
  `/checkExposuerByMarketIdForFancy`,
   verifyToken,
  isOwnerAndStaff,
  websiteController.checkExposuerByMarketIdForFancy
);

router.post(`/moveFancyToAdvance`, websiteController.moveFancyToAdvance);

router.post(`/fancyList`, verifyToken, websiteController.fancyList);

router.post(`/getResults`, verifyToken, websiteController.getResults);

router.post(
  `/saveAccountDetails`,
  verifyToken,
  websiteController.saveAccountDetails
);

router.post(
  `/getBankDetailsByUserId`,
  verifyToken,
  websiteController.getBankDetailsByUserId
);

router.post(
  `/updateFancyDateInTransaction`,
  verifyToken,
  websiteController.updateFancyDateInTransaction
);

router.post(
  `/getAccountDetailsOfClient`,
  verifyToken,
  websiteController.getAccountDetailsOfClient
);

router.post(
  `/declareCasinoResultAgain`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.declareCasinoResultAgain
);

router.post(
  `/getTransactionData`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.getTransactionData
);


router.post(
  `/updateInternationalCasinoGamesInDatabase`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.updateInternationalCasinoGamesInDatabase
);

router.post(
  `/updateInternationalCasinoListInRedis`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.updateInternationalCasinoListInRedis
);


router.post(
  `/updateInternationalCasinoByOperating`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.updateInternationalCasinoByOperating
);


router.post(
  `/getNegativeUserDetails`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.getNegativeUserDetails
);

router.post(
  `/fillNegativeCoinsToUser`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.fillNegativeCoinsToUser
);


router.post(
  `/findDuplicateTransactionForDiamondcasino`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.findDuplicateTransactionForDiamondcasino
);


router.post(
  `/rollBackfancyList`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.rollBackfancyList
);



router.post(
  `/cateogeoryCrud`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.cateogeoryCrud
);

router.post(
  `/getCateogeory`,
  websiteController.getCateogeory
);


router.post(
  `/getDuplicateResultsOfCasino`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.getDuplicateResultsOfCasino
);

router.post(
  `/updateExposureOfUser`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.updateExposureOfUser
);

router.post(
  `/userExposureListUpdateBulk`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.userExposureListUpdateBulk
);

router.post(
  `/deleteUserData`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.deleteUserData
);

router.post(
  `/missingShareDoc`,
  verifyToken,
  websiteController.missingShareDoc
);


router.post(
  `/clientCoinsProfitExposure`,
  verifyToken,
  websiteController.clientCoinsProfitExposure
);


router.post(
  `/upperLineLedger`,
  verifyToken,
  websiteController.upperLineLedger
);



router.post(
  `/assignClientToAgent`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.assignClientToAgent
);


router.post(
  `/createOwner`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.createOwner
);


router.post(
  `/getMlmChainList`,
  verifyToken,
  websiteController.getMlmChainList
);


router.post(
  `/getTurnOverAndWithdrawAmountData`,
  verifyToken,
  websiteController.getTurnOverAndWithdrawAmountData
);


router.post(
  `/getBankDetailsFromRolexpanel`,
   verifyToken,
  websiteController.getBankDetailsFromRolexpanel
);


router.post(
  `/accountTypeCrud`,
   verifyToken,
  websiteController.accountTypeCrud
);


router.post(
  `/getAccountType`,
   verifyToken,
  websiteController.getAccountType
);

router.post(
  `/getDomainSetting`,
   verifyToken,
  websiteController.getDomainSetting
);


router.post(
  `/accountDetailsForClient`,
   verifyToken,
  websiteController.accountDetailsForClient
);


router.post(
  `/getContactDetailsByCreatorId`,
   verifyToken,
  websiteController.getContactDetailsByCreatorId
);

router.get(`/countPlayCountBymarketId`, verifyToken,  websiteController.countPlayCountBymarketId);

router.post(`/sameBetsAtSameTime`, verifyToken, websiteController.sameBetsAtSameTime);

router.post(`/removeDuplicateUsersAndGetReport`, verifyToken, websiteController.removeDuplicateUsersAndGetReport);


router.post(`/userExposureList`, verifyToken, isOwnerAndStaff, websiteController.userExposureList);


// router.post(
//   `/fanctCateogeryCrud`,
//   verifyToken,
//   isOwnerAndStaff,
//   websiteController.fanctCateogeryCrud
// );



// without verification routes

router.post(
  `/getWhatsAppOtp`,
  websiteController.getWhatsAppOtp
);

router.post(
  `/userPasswordChangeByMobile`,
  websiteController.userPasswordChangeByMobile
);

router.post(
  `/forgetPassword`,
  websiteController.forgetPassword
);

router.post(`/hitReq`, websiteController.hitReq);

router.post(
  `/getInternationalGroupCasinoList`,
  websiteController.getInternationalGroupCasinoList
);

router.post(
  `/getCasinoListByCateogeory`,
  websiteController.getCasinoListByCateogeory
);

router.post(
  `/getCasinoListByProviderName`,
  websiteController.getCasinoListByProviderName
);

router.post(
  `/getCasinoListByProviderName`,
  websiteController.getCasinoListByProviderName
);

router.post(
  `/getAllCasinoInternationalList`,
  websiteController.getAllCasinoInternationalList
);

router.post(
  `/distributeBonusToUpperline`,
  verifyToken,
  isOwnerAndStaff,
  websiteController.distributeBonusToUpperline
);

router.post(
  `/checkRollbackCasinoWithTransactionAdnDeleteInCrickTransaction`,
  websiteController.checkRollbackCasinoWithTransactionAdnDeleteInCrickTransaction
);

router.get(`/fancyList`, websiteController.fancyList);


// centerpanel Decision

router.post(
  `/insertFancyByCenterPanel`,
  websiteController.insertFancyByCenterPanel
);

router.post(
  `/fancyDecisionByCenterPanel`,
  websiteController.fancyDecisionByCenterPanel
);

router.post(
  `/matchDecisionByCenterPanel`,
  websiteController.matchDecisionByCenterPanel
);


// Fancy Cateogeory CRUD
router.post(`/createFancyCateogeory`, verifyToken, isOwnerAndStaff, websiteController.createFancyCateogeory);
router.post(`/updateFancyCateogeory`, verifyToken, isOwnerAndStaff, websiteController.updateFancyCateogeory);
router.post(`/deleteFancyCateogeory`, verifyToken, isOwnerAndStaff, websiteController.deleteFancyCateogeory);
router.post(`/getFancyCateogeoryList`, verifyToken, websiteController.getFancyCateogeoryList);
router.post(`/updateFancyCateogeoryStatus`, verifyToken, isOwnerAndStaff, websiteController.updateFancyCateogeoryStatus);
router.post(`/bulkUpdateFancyCateogeory`, verifyToken, isOwnerAndStaff, websiteController.bulkUpdateFancyCateogeory);
router.post(`/exportFancyCateogeory`, verifyToken, websiteController.exportFancyCateogeory);
router.post(`/importFancyCateogeory`, verifyToken, isOwnerAndStaff, websiteController.importFancyCateogeory);
router.post(`/getFancyCateogeoryAuditLog`, verifyToken, isOwnerAndStaff, websiteController.getFancyCateogeoryAuditLog);
router.post(`/validateMultipleFancy`, verifyToken, websiteController.validateMultipleFancy);

module.exports = router;
