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
};
