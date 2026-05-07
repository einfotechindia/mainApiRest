const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const { getStats, getBlockedIPs, blockIP, unblockIP } = require('./ddosProtection');
const { getHealthStats } = require('./connectionGuard');
const { getBlockedIPStats, HISTORY_FILE, PLAIN_LIST_FILE, CLOUDFLARE_RULES_FILE } = require('./blockedIPLogger');
const cloudflareBlocker = require('./cloudflareBlocker');
const { getEndpointStats } = require('./endpointShield');

const router = express.Router();

const adminAuth = (req, res, next) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const expectedSecret = process.env.ADMIN_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ status: 401, message: 'Unauthorized' });
  }
  next();
};

// Health check — no auth required
router.post('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  const connectionHealth = getHealthStats();

  res.json({
    status: mongoState === 1 ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    mongo: mongoStates[mongoState] || 'unknown',
    connections: connectionHealth,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    },
    timestamp: new Date().toISOString(),
  });
});

// DDoS stats
router.post('/admin/ddos-stats', adminAuth, (req, res) => {
  res.json({
    ddos: getStats(),
    connections: getHealthStats(),
    endpoints: getEndpointStats(),
  });
});

// List blocked IPs
router.post('/admin/blocked-ips', adminAuth, (req, res) => {
  res.json({ blockedIPs: getBlockedIPs() });
});

// Block an IP
router.post('/admin/block-ip', adminAuth, (req, res) => {
  const { ip, duration } = req.body;
  if (!ip) return res.status(400).json({ message: 'IP address required' });

  blockIP(ip, duration || 3600000);
  res.json({ message: `Blocked ${ip}`, blockedIPs: getBlockedIPs() });
});

// Unblock an IP
router.post('/admin/unblock-ip', adminAuth, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ message: 'IP address required' });

  unblockIP(ip);
  res.json({ message: `Unblocked ${ip}` });
});

// --- Blocked IP History & Cloudflare Export ---

// Full blocked IP history with stats (country breakdown, repeat offenders)
router.post('/admin/blocked-ip-history', adminAuth, (req, res) => {
  const stats = getBlockedIPStats();
  res.json(stats);
});

// Download full blocked IP history as JSON
router.post('/admin/blocked-ip-history/download', adminAuth, (req, res) => {
  if (fs.existsSync(HISTORY_FILE)) {
    res.setHeader('Content-Disposition', 'attachment; filename="blocked-ips-history.json"');
    res.setHeader('Content-Type', 'application/json');
    return res.sendFile(HISTORY_FILE);
  }
  res.status(404).json({ message: 'No blocked IP history found yet' });
});

// Download plain IP list (one per line) — for Cloudflare bulk import
router.post('/admin/blocked-ip-list', adminAuth, (req, res) => {
  if (fs.existsSync(PLAIN_LIST_FILE)) {
    res.setHeader('Content-Disposition', 'attachment; filename="blocked-ips-list.txt"');
    res.setHeader('Content-Type', 'text/plain');
    return res.sendFile(PLAIN_LIST_FILE);
  }
  res.status(404).json({ message: 'No blocked IPs yet' });
});

// Download ready-to-use Cloudflare WAF rule expressions
router.post('/admin/cloudflare-rules', adminAuth, (req, res) => {
  if (fs.existsSync(CLOUDFLARE_RULES_FILE)) {
    res.setHeader('Content-Disposition', 'attachment; filename="cloudflare-block-rules.txt"');
    res.setHeader('Content-Type', 'text/plain');
    return res.sendFile(CLOUDFLARE_RULES_FILE);
  }
  res.status(404).json({ message: 'No Cloudflare rules generated yet' });
});

// --- Cloudflare Auto-Blocker Endpoints ---

// Get Cloudflare blocker status
router.post('/admin/cloudflare-blocker/status', adminAuth, (req, res) => {
  res.json(cloudflareBlocker.getStatus());
});

// Get list of IPs already pushed to Cloudflare
router.post('/admin/cloudflare-blocker/synced-ips', adminAuth, (req, res) => {
  res.json({ syncedIPs: cloudflareBlocker.getSyncedIPs() });
});

// Manually push a single IP to Cloudflare
router.post('/admin/cloudflare-blocker/block', adminAuth, async (req, res) => {
  const { ip, note } = req.body;
  if (!ip) return res.status(400).json({ message: 'IP address required' });

  const success = await cloudflareBlocker.blockIPInCloudflare(
    ip,
    note || `Manual block via admin API | ${new Date().toISOString()}`
  );
  res.json({ success, ip, message: success ? `${ip} blocked in Cloudflare` : `Failed to block ${ip}` });
});

// Manually remove an IP from Cloudflare
router.post('/admin/cloudflare-blocker/unblock', adminAuth, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ message: 'IP address required' });

  const success = await cloudflareBlocker.unblockIPInCloudflare(ip);
  res.json({ success, ip, message: success ? `${ip} unblocked in Cloudflare` : `Failed to unblock ${ip}` });
});

// Force sync now (push all pending blocked IPs to Cloudflare)
router.post('/admin/cloudflare-blocker/sync-now', adminAuth, async (req, res) => {
  await cloudflareBlocker.syncBlockedIPs();
  res.json({ message: 'Sync completed', status: cloudflareBlocker.getStatus() });
});

module.exports = router;
