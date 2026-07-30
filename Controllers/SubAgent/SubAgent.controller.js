const { SendResponse } = require("../../Helpers/ResponseMapper");
const SubAgentService = require("../../Services/SubAgent/SubAgent.service");

module.exports = {
  // SubAgent Login
  SubAgentLogin: async (req, res) => {
    try {
      await SubAgentService.SubAgentLogin(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // SubAgent CRUD
  CreateSubAgent: async (req, res) => {
    try {
      await SubAgentService.CreateSubAgent(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateSubAgent: async (req, res) => {
    try {
      await SubAgentService.UpdateSubAgent(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DeleteSubAgent: async (req, res) => {
    try {
      await SubAgentService.DeleteSubAgent(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  SubAgentList: async (req, res) => {
    try {
      await SubAgentService.SubAgentList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  SubAgentDetails: async (req, res) => {
    try {
      await SubAgentService.SubAgentDetails(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Role CRUD
  CreateRole: async (req, res) => {
    try {
      await SubAgentService.CreateRole(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateRole: async (req, res) => {
    try {
      await SubAgentService.UpdateRole(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  DeleteRole: async (req, res) => {
    try {
      await SubAgentService.DeleteRole(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  RoleList: async (req, res) => {
    try {
      await SubAgentService.RoleList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Available Pages
  GetAvailablePages: async (req, res) => {
    try { await SubAgentService.GetAvailablePages(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  SeedDefaultRoles: async (req, res) => {
    try { await SubAgentService.SeedDefaultRoles(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  SeedDefaultSubAgents: async (req, res) => {
    try { await SubAgentService.SeedDefaultSubAgents(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  SeedClients: async (req, res) => {
    try { await SubAgentService.SeedClients(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },

  // Deposit/Withdraw
  GetDepositWithdrawList: async (req, res) => {
    try {
      await SubAgentService.GetDepositWithdrawList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  ApproveRejectRequest: async (req, res) => {
    try {
      await SubAgentService.ApproveRejectRequest(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  ViewDepositWithdrawRequest: async (req, res) => {
    try {
      await SubAgentService.ViewDepositWithdrawRequest(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Client List
  ClientList: async (req, res) => {
    try {
      await SubAgentService.ClientList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Client Status Update
  UpdateClientStatus: async (req, res) => {
    try {
      await SubAgentService.UpdateClientStatus(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Payment Accounts
  GetAccountDetails: async (req, res) => {
    try { await SubAgentService.GetAccountDetails(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  CreatePaymentAccount: async (req, res) => {
    try { await SubAgentService.CreatePaymentAccount(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  UpdateAccountDetails: async (req, res) => {
    try { await SubAgentService.UpdateAccountDetails(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  DeletePaymentAccount: async (req, res) => {
    try { await SubAgentService.DeletePaymentAccount(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  TogglePaymentAccountStatus: async (req, res) => {
    try { await SubAgentService.TogglePaymentAccountStatus(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  DuplicatePaymentAccount: async (req, res) => {
    try { await SubAgentService.DuplicatePaymentAccount(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  AccountTransactionStats: async (req, res) => {
    try { await SubAgentService.AccountTransactionStats(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  UpdateAccountPriority: async (req, res) => {
    try { await SubAgentService.UpdateAccountPriority(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  GetClientPaymentAccounts: async (req, res) => {
    try { await SubAgentService.GetClientPaymentAccounts(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ForceLogoutSubAgent: async (req, res) => {
    try { await SubAgentService.ForceLogoutSubAgent(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  GetLoginAttempts: async (req, res) => {
    try { await SubAgentService.GetLoginAttempts(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ResetClientPassword: async (req, res) => {
    try { await SubAgentService.ResetClientPassword(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  UpdateClientCreditRef: async (req, res) => {
    try { await SubAgentService.UpdateClientCreditRef(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  DirectDepositWithdraw: async (req, res) => {
    try { await SubAgentService.DirectDepositWithdraw(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ClientLoginHistory: async (req, res) => {
    try { await SubAgentService.ClientLoginHistory(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ClientDWHistory: async (req, res) => {
    try { await SubAgentService.ClientDWHistory(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ClientProfitLoss: async (req, res) => {
    try { await SubAgentService.ClientProfitLoss(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  BulkApproveReject: async (req, res) => {
    try { await SubAgentService.BulkApproveReject(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  GetPendingCounts: async (req, res) => {
    try { await SubAgentService.GetPendingCounts(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  ExportData: async (req, res) => {
    try { await SubAgentService.ExportData(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },

  // Domain
  GetDomainList: async (req, res) => {
    try {
      await SubAgentService.GetDomainList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  GetDomainDetails: async (req, res) => {
    try {
      await SubAgentService.GetDomainDetails(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  UpdateDomain: async (req, res) => {
    try {
      await SubAgentService.UpdateDomain(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Profile
  GetProfile: async (req, res) => {
    try {
      await SubAgentService.GetProfile(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  ChangePassword: async (req, res) => {
    try {
      await SubAgentService.ChangePassword(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  // Activity Log
  GetActivityLog: async (req, res) => {
    try { await SubAgentService.GetActivityLog(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },

  // 2FA
  Setup2FA: async (req, res) => {
    try { await SubAgentService.Setup2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  Verify2FA: async (req, res) => {
    try { await SubAgentService.Verify2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  Disable2FA: async (req, res) => {
    try { await SubAgentService.Disable2FA(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },

  // Dashboard
  DashboardStats: async (req, res) => {
    try { await SubAgentService.DashboardStats(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },

  // Report
  DepositWithdrawReport: async (req, res) => {
    try {
      await SubAgentService.DepositWithdrawReport(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
};
