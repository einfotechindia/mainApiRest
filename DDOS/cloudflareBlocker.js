/**
 * Cloudflare IP Auto-Blocker
 *
 * Automatically pushes blocked IPs from your DDoS protection to Cloudflare
 * so they get blocked at the EDGE (before reaching your server).
 *
 * This is DOMAIN SPECIFIC — uses Zone ID, so it only affects ONE domain.
 *
 * How it works:
 *   1. When ddosProtection blocks an IP, it calls logBlockedIP()
 *   2. This module picks up new blocked IPs and pushes them to Cloudflare
 *   3. Uses Cloudflare's "IP Access Rules" API (zone-level, not account-level)
 *   4. Batches requests to avoid hitting Cloudflare API rate limits
 *   5. Tracks which IPs are already pushed to avoid duplicates
 *
 * Required .env variables:
 *   CLOUDFLARE_API_TOKEN   — API Token (NOT Global API Key)
 *   CLOUDFLARE_ZONE_ID     — Zone ID of YOUR specific domain
 *   CF_AUTO_BLOCK=true     — Enable/disable this feature
 *
 * HOW TO GET THESE VALUES:
 *
 *   CLOUDFLARE_ZONE_ID:
 *     1. Login to Cloudflare Dashboard (https://dash.cloudflare.com)
 *     2. Click on YOUR DOMAIN
 *     3. Scroll down on the Overview page — right side panel
 *     4. Copy "Zone ID" (32-character hex string like "abcd1234ef567890...")
 *
 *   CLOUDFLARE_API_TOKEN:
 *     1. Go to https://dash.cloudflare.com/profile/api-tokens
 *     2. Click "Create Token"
 *     3. Use "Custom Token" template
 *     4. Set permissions:
 *        - Zone > Firewall Services > Edit
 *        - Zone > Zone > Read
 *     5. Under "Zone Resources":
 *        - Select "Include" → "Specific zone" → YOUR DOMAIN
 *        (This makes the token work ONLY for your domain — safe!)
 *     6. Click "Continue to summary" → "Create Token"
 *     7. Copy the token (you can only see it once!)
 *
 *   DO NOT use Global API Key — it has access to ALL your domains.
 *   API Token with zone-specific permissions is much safer.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const CONFIG = {
  enabled: process.env.CF_AUTO_BLOCK === 'true',
  apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  zoneId: process.env.CLOUDFLARE_ZONE_ID || '',

  // How often to sync blocked IPs to Cloudflare (in ms)
  syncIntervalMs: Number(process.env.CF_SYNC_INTERVAL_MS || 30000), // 30 seconds

  // Only auto-block IPs that have been blocked N+ times (avoid false positives)
  minBlockCount: Number(process.env.CF_MIN_BLOCK_COUNT || 2),

  // Max IPs to push per sync cycle (Cloudflare API rate limit: 1200 req/5min)
  maxPerSync: 20,

  // File to track which IPs are already pushed to Cloudflare
  syncStateFile: path.join(__dirname, '..', 'errorLog', 'cloudflare-synced-ips.json'),

  // Blocked IPs history file (written by blockedIPLogger)
  historyFile: path.join(__dirname, '..', 'errorLog', 'blocked-ips-history.json'),
};

// In-memory set of IPs already synced to Cloudflare
let syncedIPs = new Set();
let syncTimer = null;

// --- Load synced state ---
function loadSyncedState() {
  try {
    if (fs.existsSync(CONFIG.syncStateFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.syncStateFile, 'utf-8'));
      if (Array.isArray(data)) {
        syncedIPs = new Set(data);
        console.log(`[CF-BLOCKER] Loaded ${syncedIPs.size} previously synced IPs`);
      }
    }
  } catch (err) {
    console.warn('[CF-BLOCKER] Could not load sync state:', err.message);
  }
}

// --- Save synced state ---
function saveSyncedState() {
  try {
    const logsDir = path.dirname(CONFIG.syncStateFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.syncStateFile, JSON.stringify([...syncedIPs], null, 2));
  } catch (err) {
    console.error('[CF-BLOCKER] Failed to save sync state:', err.message);
  }
}

// --- Cloudflare API Call ---
function cloudflareAPI(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${CONFIG.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success) {
            resolve(parsed);
          } else {
            const errMsg = parsed.errors?.map(e => e.message).join(', ') || 'Unknown error';
            reject(new Error(`Cloudflare API error: ${errMsg}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Cloudflare response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Cloudflare API request timeout'));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// --- Block a single IP in Cloudflare ---
async function blockIPInCloudflare(ip, note) {
  try {
    await cloudflareAPI('POST', `/zones/${CONFIG.zoneId}/firewall/access_rules/rules`, {
      mode: 'block',
      configuration: {
        target: 'ip',
        value: ip,
      },
      notes: note || `Auto-blocked by DDoS protection | ${new Date().toISOString()}`,
    });

    syncedIPs.add(ip);
    console.log(`[CF-BLOCKER] Blocked in Cloudflare: ${ip}`);
    return true;
  } catch (err) {
    // "firewallaccessrules.api.duplicate_of_existing" means already blocked — that's fine
    if (err.message && err.message.includes('duplicate')) {
      syncedIPs.add(ip);
      return true;
    }
    console.error(`[CF-BLOCKER] Failed to block ${ip}:`, err.message);
    return false;
  }
}

// --- Unblock a single IP in Cloudflare ---
async function unblockIPInCloudflare(ip) {
  try {
    // First, find the rule ID for this IP
    const response = await cloudflareAPI(
      'GET',
      `/zones/${CONFIG.zoneId}/firewall/access_rules/rules?configuration.target=ip&configuration.value=${ip}&mode=block`
    );

    if (response.result && response.result.length > 0) {
      const ruleId = response.result[0].id;
      await cloudflareAPI('DELETE', `/zones/${CONFIG.zoneId}/firewall/access_rules/rules/${ruleId}`);
      syncedIPs.delete(ip);
      console.log(`[CF-BLOCKER] Unblocked in Cloudflare: ${ip}`);
      saveSyncedState();
      return true;
    } else {
      console.log(`[CF-BLOCKER] IP not found in Cloudflare rules: ${ip}`);
      syncedIPs.delete(ip);
      return false;
    }
  } catch (err) {
    console.error(`[CF-BLOCKER] Failed to unblock ${ip}:`, err.message);
    return false;
  }
}

// --- Sync: push new blocked IPs to Cloudflare ---
async function syncBlockedIPs() {
  if (!CONFIG.enabled || !CONFIG.apiToken || !CONFIG.zoneId) return;

  try {
    // Read history file
    if (!fs.existsSync(CONFIG.historyFile)) return;

    const history = JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf-8'));
    if (!Array.isArray(history)) return;

    // Find IPs that qualify for Cloudflare blocking but haven't been synced yet
    const toBlock = history
      .filter(entry =>
        entry.ip &&
        (entry.totalBlocks || 1) >= CONFIG.minBlockCount &&
        !syncedIPs.has(entry.ip)
      )
      .slice(0, CONFIG.maxPerSync); // Limit per cycle

    if (toBlock.length === 0) return;

    console.log(`[CF-BLOCKER] Syncing ${toBlock.length} IPs to Cloudflare...`);

    let successCount = 0;
    for (const entry of toBlock) {
      const note = [
        `Auto-blocked`,
        `blocks:${entry.totalBlocks}`,
        `country:${entry.country || '?'}`,
        `reasons:${(entry.lastReasons || []).join('+')}`,
        `first:${entry.firstBlockedAt || '?'}`,
      ].join(' | ');

      const success = await blockIPInCloudflare(entry.ip, note);
      if (success) successCount++;

      // Small delay between API calls to respect rate limits
      await new Promise(r => setTimeout(r, 250));
    }

    if (successCount > 0) {
      saveSyncedState();
      console.log(`[CF-BLOCKER] Synced ${successCount}/${toBlock.length} IPs to Cloudflare`);
    }
  } catch (err) {
    console.error('[CF-BLOCKER] Sync error:', err.message);
  }
}

// --- Verify Cloudflare credentials on startup ---
async function verifyCredentials() {
  if (!CONFIG.apiToken || !CONFIG.zoneId) {
    console.warn('[CF-BLOCKER] Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — auto-block disabled');
    return false;
  }

  try {
    // Verify token is valid
    const tokenCheck = await cloudflareAPI('GET', '/user/tokens/verify');
    console.log(`[CF-BLOCKER] API Token verified: ${tokenCheck.result?.status || 'active'}`);

    // Verify zone access and get zone name
    const zoneCheck = await cloudflareAPI('GET', `/zones/${CONFIG.zoneId}`);
    const zoneName = zoneCheck.result?.name || 'unknown';
    console.log(`[CF-BLOCKER] Zone verified: ${zoneName} (${CONFIG.zoneId})`);
    console.log(`[CF-BLOCKER] Auto-blocking is ACTIVE for domain: ${zoneName}`);

    return true;
  } catch (err) {
    console.error(`[CF-BLOCKER] Credential verification failed: ${err.message}`);
    console.error('[CF-BLOCKER] Auto-block will NOT work. Check your CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID');
    return false;
  }
}

// --- Start/Stop ---

async function start() {
  if (!CONFIG.enabled) {
    console.log('[CF-BLOCKER] Cloudflare auto-block is DISABLED (set CF_AUTO_BLOCK=true to enable)');
    return;
  }

  loadSyncedState();

  const valid = await verifyCredentials();
  if (!valid) {
    CONFIG.enabled = false;
    return;
  }

  // Run first sync immediately
  await syncBlockedIPs();

  // Then run on interval
  syncTimer = setInterval(syncBlockedIPs, CONFIG.syncIntervalMs);
  console.log(`[CF-BLOCKER] Sync scheduled every ${CONFIG.syncIntervalMs / 1000}s`);
}

function stop() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  saveSyncedState();
  console.log('[CF-BLOCKER] Stopped');
}

// --- Get status ---
function getStatus() {
  return {
    enabled: CONFIG.enabled,
    zoneId: CONFIG.zoneId ? `${CONFIG.zoneId.substring(0, 8)}...` : 'not set',
    tokenSet: !!CONFIG.apiToken,
    syncedIPCount: syncedIPs.size,
    minBlockCount: CONFIG.minBlockCount,
    syncIntervalMs: CONFIG.syncIntervalMs,
  };
}


function getSyncedIPs() {
  return [...syncedIPs];
}



module.exports = {
  start,
  stop,
  getStatus,
  getSyncedIPs,
  blockIPInCloudflare,
  unblockIPInCloudflare,
  syncBlockedIPs,
};
