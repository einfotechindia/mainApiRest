const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const FancyManagerController = require("../../Controllers/FancyManager/FancyManager.controller");

router.post("/create", verifyToken, FancyManagerController.Create);
router.patch("/update", verifyToken, FancyManagerController.Update);
router.post("/toggleStatus", verifyToken, FancyManagerController.ToggleStatus);
router.post("/list", verifyToken, FancyManagerController.List);
router.post("/getById", verifyToken, FancyManagerController.GetById);
router.post("/delete", verifyToken, FancyManagerController.Delete);
router.post("/bulkUpdate", verifyToken, FancyManagerController.BulkUpdate);
router.post("/syncRedis", verifyToken, FancyManagerController.SyncRedis);
router.post("/runSeed", verifyToken, FancyManagerController.RunSeed);

module.exports = router;
