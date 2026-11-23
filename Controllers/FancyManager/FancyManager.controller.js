const { SendResponse } = require("../../Helpers/ResponseMapper");
const FancyManagerService = require("../../Services/FancyManager/FancyManager.service");

module.exports = {
  Create: async (req, res) => {
    try {
      await FancyManagerService.Create(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  Update: async (req, res) => {
    try {
      await FancyManagerService.Update(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  ToggleStatus: async (req, res) => {
    try {
      await FancyManagerService.ToggleStatus(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  List: async (req, res) => {
    try {
      await FancyManagerService.List(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  GetById: async (req, res) => {
    try {
      await FancyManagerService.GetById(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  Delete: async (req, res) => {
    try {
      await FancyManagerService.Delete(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  BulkUpdate: async (req, res) => {
    try {
      await FancyManagerService.BulkUpdate(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  SyncRedis: async (req, res) => {
    try {
      await FancyManagerService.SyncRedis(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

    RunSeed: async (req, res) => {
      try {
        await FancyManagerService.RunSeed(req, res);
      } catch (err) {
        return SendResponse(res, "error", err.message || "Something went wrong");
      }
    },

  getFancyConfigData: async (req, res) => {
    try {
      await FancyManagerService.getFancyConfigData(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  }
};
