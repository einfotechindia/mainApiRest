const express = require("express");
const { verifyToken ,isOwnerAndStaff } = require("../Middlewares/VerifyToken");
const router = express.Router();
const damanController = require("../Controllers/Daman/daman.controller");
const sqlnitinDatase = require("../Controllers/nitinDatabase");

router.post(
  "/depositWithdrawTotal",
  verifyToken,
  damanController.depositWithdrawTotal
);

router.post(
  "/transferClientToClient",
  verifyToken,
  damanController.transferClientToClient
);

router.post("/getDownlineList", verifyToken, damanController.getDownlineList);  
router.post("/getDownlineListByClientId", verifyToken, damanController.getDownlineListByClientId); 
router.post("/getTrackingActivites", verifyToken, damanController.getTrackingActivites); 
router.post("/checkIpAddress", verifyToken, damanController.checkIpAddress); 
router.post("/deleteTrackingActivities", verifyToken, damanController.deleteTrackingActivities); 

router.post("/updateBetsData", verifyToken,isOwnerAndStaff,damanController.updateBetsData); 
router.post("/deleteBetsDataPermanently", verifyToken, isOwnerAndStaff , damanController.deleteBetsDataPermanently); 
router.post("/getUpdateDeleteBetData", verifyToken, isOwnerAndStaff , damanController.getUpdateDeleteBetData); 


// nitin Database Routes
router.post("/insertUserListToMongo",verifyToken, sqlnitinDatase.insertUserListToMongo); 
router.post("/createLedger",verifyToken, sqlnitinDatase.createLedger); 
router.post("/createUser",verifyToken, sqlnitinDatase.createUser); 
router.post("/mergeTransaction",verifyToken, sqlnitinDatase.mergeTransaction); 


module.exports = router;
