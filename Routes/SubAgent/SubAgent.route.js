const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const { verifySubAgentToken } = require("../../Middlewares/VerifySubAgentToken");
const router = express.Router();
const SubAgentController = require("../../Controllers/SubAgent/SubAgent.controller");
const PMController = require("../../Controllers/SubAgent/PaymentMethod.controller");
const { upload, handleUpload } = require("../../Controllers/SubAgent/FileUpload.controller");
const CEController = require("../../Controllers/SubAgent/ClientEngagement.controller");
const AdvController = require("../../Controllers/SubAgent/Advanced.controller");
const AffController = require("../../Controllers/SubAgent/Affiliate.controller");
const ReportsController = require("../../Controllers/SubAgent/SubAgentReports.controller");

// File Upload (local - works without S3)
router.post("/upload", verifySubAgentToken, upload.single("image"), handleUpload);

// SubAgent Login (no token needed)
router.post("/login", SubAgentController.SubAgentLogin);

// Client facing - no subagent auth needed, uses verifyToken (client's own token)
router.post("/client/payment-accounts", verifyToken, SubAgentController.GetClientPaymentAccounts);

// SubAgent CRUD (agent uses verifyToken, subagent uses verifySubAgentToken)
router.post("/create", verifyToken, SubAgentController.CreateSubAgent);
router.patch("/update", verifyToken, SubAgentController.UpdateSubAgent);
router.post("/delete", verifyToken, SubAgentController.DeleteSubAgent);
router.post("/list", verifySubAgentToken, SubAgentController.SubAgentList);
router.post("/details", verifySubAgentToken, SubAgentController.SubAgentDetails);

// Role CRUD (agent only - verifyToken)
router.post("/role/create", verifyToken, SubAgentController.CreateRole);
router.patch("/role/update", verifyToken, SubAgentController.UpdateRole);
router.post("/role/delete", verifyToken, SubAgentController.DeleteRole);
router.post("/role/list", verifySubAgentToken, SubAgentController.RoleList);

// Available Pages
router.post("/available-pages", verifySubAgentToken, SubAgentController.GetAvailablePages);
router.post("/seed-roles", verifyToken, SubAgentController.SeedDefaultRoles);
router.post("/seed-subagents", verifyToken, SubAgentController.SeedDefaultSubAgents);
router.post("/seed-clients", verifyToken, SubAgentController.SeedClients);

// Client (agent + subagent)
router.post("/client/list", verifySubAgentToken, SubAgentController.ClientList);
router.post("/client/update-status", verifySubAgentToken, SubAgentController.UpdateClientStatus);

// Deposit/Withdraw (agent + subagent)
router.post("/deposit-withdraw/list", verifySubAgentToken, SubAgentController.GetDepositWithdrawList);
router.post("/deposit-withdraw/approve-reject", verifySubAgentToken, SubAgentController.ApproveRejectRequest);
router.post("/deposit-withdraw/view", verifySubAgentToken, SubAgentController.ViewDepositWithdrawRequest);

// Dashboard
router.post("/dashboard-stats", verifySubAgentToken, SubAgentController.DashboardStats);

// Activity Log
router.post("/activity-log", verifySubAgentToken, SubAgentController.GetActivityLog);

// 2FA - Google Authenticator (agent only)
router.post("/2fa/setup", verifyToken, SubAgentController.Setup2FA);
router.post("/2fa/verify", verifyToken, SubAgentController.Verify2FA);
router.post("/2fa/disable", verifyToken, SubAgentController.Disable2FA);

// Profile & Password
router.post("/profile", verifySubAgentToken, SubAgentController.GetProfile);
router.post("/change-password", verifySubAgentToken, SubAgentController.ChangePassword);

// Reports
router.post("/deposit-withdraw/report", verifySubAgentToken, SubAgentController.DepositWithdrawReport);

// Payment Accounts (agent + subagent)
router.post("/account/list", verifySubAgentToken, SubAgentController.GetAccountDetails);
router.post("/account/create", verifySubAgentToken, SubAgentController.CreatePaymentAccount);
router.post("/account/update", verifySubAgentToken, SubAgentController.UpdateAccountDetails);
router.post("/account/delete", verifySubAgentToken, SubAgentController.DeletePaymentAccount);
router.post("/account/toggle-status", verifySubAgentToken, SubAgentController.TogglePaymentAccountStatus);
router.post("/account/duplicate", verifySubAgentToken, SubAgentController.DuplicatePaymentAccount);
router.post("/account/stats", verifySubAgentToken, SubAgentController.AccountTransactionStats);
router.post("/account/update-priority", verifySubAgentToken, SubAgentController.UpdateAccountPriority);

// Domain Settings (agent + subagent)
router.post("/domain/list", verifySubAgentToken, SubAgentController.GetDomainList);
router.post("/domain/details", verifySubAgentToken, SubAgentController.GetDomainDetails);
router.post("/domain/update", verifySubAgentToken, SubAgentController.UpdateDomain);

// Security
router.post("/force-logout", verifyToken, SubAgentController.ForceLogoutSubAgent);
router.post("/login-history", verifySubAgentToken, SubAgentController.GetLoginAttempts);

// Client Management
router.post("/client/reset-password", verifySubAgentToken, SubAgentController.ResetClientPassword);
router.post("/client/update-credit", verifySubAgentToken, SubAgentController.UpdateClientCreditRef);
router.post("/client/direct-dw", verifySubAgentToken, SubAgentController.DirectDepositWithdraw);
router.post("/client/login-history", verifySubAgentToken, SubAgentController.ClientLoginHistory);
router.post("/client/dw-history", verifySubAgentToken, SubAgentController.ClientDWHistory);
router.post("/client/profit-loss", verifySubAgentToken, SubAgentController.ClientProfitLoss);

// Bulk D/W
router.post("/deposit-withdraw/bulk", verifySubAgentToken, SubAgentController.BulkApproveReject);

// Notifications
router.post("/pending-counts", verifySubAgentToken, SubAgentController.GetPendingCounts);

// Export
router.post("/export", verifySubAgentToken, SubAgentController.ExportData);

// Payment Methods (new model)
router.post("/pm/list", verifySubAgentToken, PMController.List);
router.post("/pm/create", verifySubAgentToken, PMController.Create);
router.post("/pm/update", verifySubAgentToken, PMController.Update);
router.post("/pm/delete", verifySubAgentToken, PMController.Delete);
router.post("/pm/toggle", verifySubAgentToken, PMController.ToggleStatus);
router.post("/pm/duplicate", verifySubAgentToken, PMController.Duplicate);
router.post("/pm/reorder", verifySubAgentToken, PMController.Reorder);
router.post("/pm/stats", verifySubAgentToken, PMController.Stats);
router.post("/pm/client", verifyToken, PMController.ClientGetMethods);
router.post("/pm/get-by-id", verifySubAgentToken, PMController.GetById);
router.post("/pm/account-report", verifySubAgentToken, PMController.AccountWiseReport);
router.post("/pm/dw-by-account", verifySubAgentToken, PMController.DWListByAccount);

// Client Engagement
router.post("/client/bonus", verifySubAgentToken, CEController.CreditBonus);
router.post("/client/freeze", verifySubAgentToken, CEController.FreezeClient);
router.post("/client/unfreeze", verifySubAgentToken, CEController.UnfreezeClient);
router.post("/client/transfer", verifyToken, CEController.TransferClient);

// Financial
router.post("/settlement", verifySubAgentToken, CEController.GetSettlement);
router.post("/commission-report", verifySubAgentToken, CEController.CommissionReport);
router.post("/transaction-log", verifySubAgentToken, CEController.TransactionLog);

// Sports/Bets
router.post("/bet-list", verifySubAgentToken, CEController.BetList);

// Reports
router.post("/daily-pl", verifySubAgentToken, CEController.DailyPLReport);
router.post("/client-retention", verifySubAgentToken, CEController.ClientRetention);

// Messaging
router.post("/notify/send", verifySubAgentToken, AdvController.SendNotification);
router.post("/notify/bulk", verifySubAgentToken, AdvController.BulkNotification);

// Auto Deposit / UTR
router.post("/utr/match", verifySubAgentToken, AdvController.AutoMatchUTR);
router.post("/utr/pending", verifySubAgentToken, AdvController.GetPendingUTRs);

// IP/Device
router.post("/client/devices", verifySubAgentToken, AdvController.GetClientDevices);
router.post("/client/duplicate-ips", verifySubAgentToken, AdvController.DetectDuplicateIPs);

// Bet Limits
router.post("/client/bet-limits", verifySubAgentToken, AdvController.GetBetLimits);
router.post("/client/update-bet-limits", verifySubAgentToken, AdvController.UpdateBetLimits);

// Casino/Fancy Reports
router.post("/fancy-report", verifySubAgentToken, AdvController.FancyReport);
router.post("/casino-report", verifySubAgentToken, AdvController.CasinoReport);

// Affiliate Commission System
router.post("/affiliate/plan/create", verifySubAgentToken, AffController.CreatePlan);
router.post("/affiliate/plan/update", verifySubAgentToken, AffController.UpdatePlan);
router.post("/affiliate/plan/list", verifySubAgentToken, AffController.ListPlans);
router.post("/affiliate/plan/delete", verifySubAgentToken, AffController.DeletePlan);
router.post("/affiliate/plan/seed", verifySubAgentToken, AffController.SeedPlans);
router.post("/affiliate/plan/assign", verifySubAgentToken, AffController.AssignPlan);
router.post("/affiliate/my-clients", verifySubAgentToken, AffController.MyClients);
router.post("/affiliate/calculate", verifySubAgentToken, AffController.CalculateCommission);
router.post("/affiliate/earnings", verifySubAgentToken, AffController.Earnings);
router.post("/affiliate/settle", verifySubAgentToken, AffController.SettleCommission);
router.post("/affiliate/mark-paid", verifySubAgentToken, AffController.MarkPaid);
router.post("/affiliate/dashboard", verifySubAgentToken, AffController.AffiliateDashboard);

// SubAgent Reports
router.post("/reports/overview", verifySubAgentToken, ReportsController.OverviewReport);
router.post("/reports/dw-summary", verifySubAgentToken, ReportsController.DWSummaryReport);
router.post("/reports/client-summary", verifySubAgentToken, ReportsController.ClientSummaryReport);
router.post("/reports/commission-summary", verifySubAgentToken, ReportsController.CommissionSummaryReport);
router.post("/reports/performance", verifySubAgentToken, ReportsController.PerformanceReport);
router.post("/reports/subagent-list-stats", verifySubAgentToken, ReportsController.SubAgentListStats);
router.post("/reports/betting", verifySubAgentToken, ReportsController.BettingReport);
router.post("/reports/pl", verifySubAgentToken, ReportsController.PLReport);
router.post("/reports/casino", verifySubAgentToken, ReportsController.SubAgentCasinoReport);
router.post("/reports/fancy", verifySubAgentToken, ReportsController.SubAgentFancyReport);
router.post("/reports/client-login", verifySubAgentToken, ReportsController.ClientLoginReport);
router.post("/reports/duplicate-ip", verifySubAgentToken, ReportsController.DuplicateIPReport);
router.post("/reports/client-balance", verifySubAgentToken, ReportsController.ClientBalanceReport);
router.post("/reports/payment-method", verifySubAgentToken, ReportsController.PaymentMethodReport);
router.post("/reports/utr", verifySubAgentToken, ReportsController.UTRReport);
router.post("/reports/settlement", verifySubAgentToken, ReportsController.SettlementReport);
router.post("/reports/client-growth", verifySubAgentToken, ReportsController.ClientGrowthReport);
router.post("/reports/turnover", verifySubAgentToken, ReportsController.TurnoverReport);
router.post("/reports/comparison", verifySubAgentToken, ReportsController.SubAgentComparison);
router.post("/reports/referral-funnel", verifySubAgentToken, ReportsController.ReferralFunnelReport);
router.post("/reports/high-exposure", verifySubAgentToken, ReportsController.HighExposureClients);
router.post("/reports/audit", verifySubAgentToken, ReportsController.SubAgentAudit);

module.exports = router;
