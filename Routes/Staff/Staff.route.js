const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const StaffController = require("../../Controllers/Staff/Staff.controller");

// Staff Login (no token needed)
router.post("/login", StaffController.StaffLogin);

// Staff CRUD (token required - owner only)
router.post("/create", verifyToken, StaffController.CreateStaff);
router.patch("/update", verifyToken, StaffController.UpdateStaff);
router.post("/delete", verifyToken, StaffController.DeleteStaff);
router.post("/list", verifyToken, StaffController.StaffList);
router.post("/details", verifyToken, StaffController.StaffDetails);

// Designation CRUD (token required - owner only)
router.post("/designation/create", verifyToken, StaffController.CreateDesignation);
router.patch("/designation/update", verifyToken, StaffController.UpdateDesignation);
router.post("/designation/delete", verifyToken, StaffController.DeleteDesignation);
router.post("/designation/list", verifyToken, StaffController.DesignationList);

// Available Pages
router.post("/availablePages", verifyToken, StaffController.GetAvailablePages);

module.exports = router;
