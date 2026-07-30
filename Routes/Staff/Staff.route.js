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

// Available Pages (dynamic from DB + Redis)
router.post("/availablePages", verifyToken, StaffController.GetAvailablePages);
router.post("/availablePages/add", verifyToken, StaffController.AddAvailablePage);
router.patch("/availablePages/update", verifyToken, StaffController.UpdateAvailablePage);
router.post("/availablePages/delete", verifyToken, StaffController.DeleteAvailablePage);

// Staff Activity Tracking
router.post("/activity/list", verifyToken, StaffController.StaffActivityList);
router.post("/activity/stats", verifyToken, StaffController.StaffActivityStats);

// Force Logout & Online Staff
router.post("/forceLogout", verifyToken, StaffController.ForceLogoutStaff);
router.post("/online", verifyToken, StaffController.GetOnlineStaff);

// Staff Change Password (staff only — self-service)
router.post("/changePassword", verifyToken, StaffController.StaffChangePassword);

// 2FA (Google Authenticator)
router.post("/2fa/setup", verifyToken, StaffController.Setup2FA);
router.post("/2fa/verify", verifyToken, StaffController.Verify2FA);
router.post("/2fa/disable", verifyToken, StaffController.Disable2FA);

module.exports = router;
