const { SendResponse } = require("../../Helpers/ResponseMapper");
const StaffService = require("../../Services/Staff/Staff.service");

module.exports = {
  // Staff Login
  StaffLogin: async (req, res) => {
    try {
      await StaffService.StaffLogin(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Staff CRUD
  CreateStaff: async (req, res) => {
    try {
      await StaffService.CreateStaff(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateStaff: async (req, res) => {
    try {
      await StaffService.UpdateStaff(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DeleteStaff: async (req, res) => {
    try {
      await StaffService.DeleteStaff(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  StaffList: async (req, res) => {
    try {
      await StaffService.StaffList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  StaffDetails: async (req, res) => {
    try {
      await StaffService.StaffDetails(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Designation CRUD
  CreateDesignation: async (req, res) => {
    try {
      await StaffService.CreateDesignation(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateDesignation: async (req, res) => {
    try {
      await StaffService.UpdateDesignation(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DeleteDesignation: async (req, res) => {
    try {
      await StaffService.DeleteDesignation(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DesignationList: async (req, res) => {
    try {
      await StaffService.DesignationList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Available Pages
  GetAvailablePages: async (req, res) => {
    try {
      await StaffService.GetAvailablePages(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  AddAvailablePage: async (req, res) => {
    try {
      await StaffService.AddAvailablePage(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateAvailablePage: async (req, res) => {
    try {
      await StaffService.UpdateAvailablePage(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DeleteAvailablePage: async (req, res) => {
    try {
      await StaffService.DeleteAvailablePage(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Staff Activity
  StaffActivityList: async (req, res) => {
    try {
      await StaffService.StaffActivityList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  StaffActivityStats: async (req, res) => {
    try {
      await StaffService.StaffActivityStats(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Force Logout & Online Staff
  ForceLogoutStaff: async (req, res) => {
    try {
      await StaffService.ForceLogoutStaff(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  GetOnlineStaff: async (req, res) => {
    try {
      await StaffService.GetOnlineStaff(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // 2FA
  Setup2FA: async (req, res) => {
    try { await StaffService.Setup2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  Verify2FA: async (req, res) => {
    try { await StaffService.Verify2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  Disable2FA: async (req, res) => {
    try { await StaffService.Disable2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  StaffChangePassword: async (req, res) => {
    try { await StaffService.StaffChangePassword(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
};
