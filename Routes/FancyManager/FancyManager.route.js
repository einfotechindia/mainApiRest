const express = require("express");
const { verifyToken , isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const FancyManagerController = require("../../Controllers/FancyManager/FancyManager.controller");

router.post("/create", verifyToken, isOwnerAndStaff, FancyManagerController.Create);
router.patch("/update", verifyToken, isOwnerAndStaff, FancyManagerController.Update);
router.post("/toggleStatus", verifyToken, isOwnerAndStaff, FancyManagerController.ToggleStatus);
router.post("/list", verifyToken, isOwnerAndStaff, FancyManagerController.List);
router.post("/getById", verifyToken, isOwnerAndStaff, FancyManagerController.GetById);
router.post("/delete", verifyToken, isOwnerAndStaff, FancyManagerController.Delete);
router.post("/bulkUpdate", verifyToken, isOwnerAndStaff, FancyManagerController.BulkUpdate);
router.post("/syncRedis", verifyToken, isOwnerAndStaff, FancyManagerController.SyncRedis);
router.post("/runSeed", verifyToken, isOwnerAndStaff, FancyManagerController.RunSeed);

router.post("/getFancyConfigData", verifyToken, FancyManagerController.getFancyConfigData);
module.exports = router;
