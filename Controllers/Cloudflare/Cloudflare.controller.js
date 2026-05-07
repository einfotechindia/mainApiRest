const { SendResponse } = require("../../Helpers/ResponseMapper");
const CloudflareService = require("../../Services/Cloudflare/Cloudflare.service");

module.exports = {
  ZoneOverview: async (req, res) => {
    try {
      await CloudflareService.zoneOverview(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  TrafficAnalytics: async (req, res) => {
    try {
      await CloudflareService.trafficAnalytics(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  BlockedIPsList: async (req, res) => {
    try {
      await CloudflareService.blockedIPsList(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  BlockIP: async (req, res) => {
    try {
      await CloudflareService.blockIP(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  UnblockIP: async (req, res) => {
    try {
      await CloudflareService.unblockIP(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  FirewallEvents: async (req, res) => {
    try {
      await CloudflareService.firewallEvents(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  TopAttackers: async (req, res) => {
    try {
      await CloudflareService.topAttackers(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  RequestsPerMinute: async (req, res) => {
    try {
      await CloudflareService.requestsPerMinute(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  TopIPs: async (req, res) => {
    try {
      await CloudflareService.topIPs(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  ThreatAnalytics: async (req, res) => {
    try {
      await CloudflareService.threatAnalytics(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  FullDashboard: async (req, res) => {
    try {
      await CloudflareService.fullDashboard(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  DnsRecords: async (req, res) => {
    try {
      await CloudflareService.dnsRecords(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  CreateDnsRecord: async (req, res) => {
    try {
      await CloudflareService.createDnsRecord(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  UpdateDnsRecord: async (req, res) => {
    try {
      await CloudflareService.updateDnsRecord(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  DeleteDnsRecord: async (req, res) => {
    try {
      await CloudflareService.deleteDnsRecord(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  GetSecurityLevel: async (req, res) => {
    try {
      await CloudflareService.getSecurityLevel(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  SetSecurityLevel: async (req, res) => {
    try {
      await CloudflareService.setSecurityLevel(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  ToggleUnderAttack: async (req, res) => {
    try {
      await CloudflareService.toggleUnderAttack(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  LiveAttackers: async (req, res) => {
    try {
      await CloudflareService.liveAttackers(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  AttackerProfile: async (req, res) => {
    try {
      await CloudflareService.attackerProfile(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  LiveTrafficSnapshot: async (req, res) => {
    try {
      await CloudflareService.liveTrafficSnapshot(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  AttackerBehaviorReport: async (req, res) => {
    try {
      await CloudflareService.attackerBehaviorReport(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  IpLookup: async (req, res) => {
    try {
      await CloudflareService.ipLookup(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },

  SecurityRules: async (req, res) => {
    try {
      await CloudflareService.securityRules(req, res);
    } catch (err) {
      return SendResponse(res, "error", err.message || "Something went wrong");
    }
  },
  GeoAnalytics: async (req, res) => {
    try { await CloudflareService.geoAnalytics(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  BlockCountry: async (req, res) => {
    try { await CloudflareService.blockCountry(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  TrafficComparison: async (req, res) => {
    try { await CloudflareService.trafficComparison(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  CreateFirewallRule: async (req, res) => {
    try { await CloudflareService.createFirewallRule(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  SuspiciousPassedIPs: async (req, res) => {
    try { await CloudflareService.suspiciousPassedIPs(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
  BrowserAnalytics: async (req, res) => {
    try { await CloudflareService.browserAnalytics(req, res); }
    catch (err) { return SendResponse(res, "error", err.message || "Something went wrong"); }
  },
};
