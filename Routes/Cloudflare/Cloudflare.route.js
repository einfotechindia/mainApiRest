const express = require("express");
const { verifyToken } = require("../../Middlewares/VerifyToken");
const router = express.Router();
const CloudflareController = require("../../Controllers/Cloudflare/Cloudflare.controller");

// Zone Info
router.post("/zoneOverview", verifyToken, CloudflareController.ZoneOverview);

// Traffic & Analytics
router.post("/trafficAnalytics", verifyToken, CloudflareController.TrafficAnalytics);
router.post("/requestsPerMinute", verifyToken, CloudflareController.RequestsPerMinute);
router.post("/topIPs", verifyToken, CloudflareController.TopIPs);

// Security & Threats
router.post("/firewallEvents", verifyToken, CloudflareController.FirewallEvents);
router.post("/topAttackers", verifyToken, CloudflareController.TopAttackers);
router.post("/threatAnalytics", verifyToken, CloudflareController.ThreatAnalytics);

// Blocked IPs Management
router.post("/blockedIPs", verifyToken, CloudflareController.BlockedIPsList);
router.post("/blockIP", verifyToken, CloudflareController.BlockIP);
router.post("/unblockIP", verifyToken, CloudflareController.UnblockIP);

// Full Dashboard (sab ek call me)
router.post("/fullDashboard", verifyToken, CloudflareController.FullDashboard);

// DNS Records
router.post("/dnsRecords", verifyToken, CloudflareController.DnsRecords);
router.post("/createDnsRecord", verifyToken, CloudflareController.CreateDnsRecord);
router.post("/updateDnsRecord", verifyToken, CloudflareController.UpdateDnsRecord);
router.post("/deleteDnsRecord", verifyToken, CloudflareController.DeleteDnsRecord);

// Security Level
router.post("/getSecurityLevel", verifyToken, CloudflareController.GetSecurityLevel);
router.post("/setSecurityLevel", verifyToken, CloudflareController.SetSecurityLevel);
router.post("/toggleUnderAttack", verifyToken, CloudflareController.ToggleUnderAttack);

// Real-Time Monitoring (live attack data)
router.post("/liveAttackers", verifyToken, CloudflareController.LiveAttackers);
router.post("/attackerProfile", verifyToken, CloudflareController.AttackerProfile);
router.post("/liveTrafficSnapshot", verifyToken, CloudflareController.LiveTrafficSnapshot);
router.post("/attackerBehaviorReport", verifyToken, CloudflareController.AttackerBehaviorReport);

// IP Intelligence
router.post("/ipLookup", verifyToken, CloudflareController.IpLookup);

// Security Rules & Rate Limits
router.post("/securityRules", verifyToken, CloudflareController.SecurityRules);

// Geo Blocking
router.post("/geoAnalytics", verifyToken, CloudflareController.GeoAnalytics);
router.post("/blockCountry", verifyToken, CloudflareController.BlockCountry);

// Traffic Comparison
router.post("/trafficComparison", verifyToken, CloudflareController.TrafficComparison);

// Firewall Rule Management
router.post("/createFirewallRule", verifyToken, CloudflareController.CreateFirewallRule);

// Suspicious Passed IPs
router.post("/suspiciousPassedIPs", verifyToken, CloudflareController.SuspiciousPassedIPs);

// Browser Analytics
router.post("/browserAnalytics", verifyToken, CloudflareController.BrowserAnalytics);

module.exports = router;
