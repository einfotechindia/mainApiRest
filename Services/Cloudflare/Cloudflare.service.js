/**
 * Cloudflare Service
 *
 * Cloudflare Dashboard ka poora data API se — login karne ki zaroorat nahi
 * Zone analytics, firewall events, blocked IPs, top attackers, bandwidth, threats sab milega
 */

const https = require("https");
const { SendResponse } = require("../../Helpers/ResponseMapper");

// --- Cloudflare API Helper ---
function cfAPI(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: "api.cloudflare.com",
      port: 443,
      path: `/client/v4${endpoint}`,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    };

    if (postData) {
      options.headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse Cloudflare response"));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Cloudflare API timeout"));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

// --- GraphQL Helper (for detailed analytics) ---
function cfGraphQL(query, variables) {
  return cfAPI("POST", "/graphql", { query, variables });
}

// ==========================================
// 1. ZONE OVERVIEW — Domain ka basic info
// ==========================================
const zoneOverview = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const result = await cfAPI("GET", `/zones/${zoneId}`);
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to fetch zone");
    }

    const zone = result.result;
    const data = {
      domain: zone.name,
      status: zone.status,
      paused: zone.paused,
      plan: zone.plan?.name || "unknown",
      nameServers: zone.name_servers,
      ssl: zone.ssl?.status || "unknown",
      createdOn: zone.created_on,
      modifiedOn: zone.modified_on,
    };

    return SendResponse(res, "success", "Zone overview fetched", data);
  } catch (error) {
    console.error("CF zoneOverview error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch zone overview");
  }
};

// ==========================================
// 2. TRAFFIC ANALYTICS — Requests, bandwidth, threats (GraphQL API)
// ==========================================
const trafficAnalytics = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    // hours: 24 = 1 day, 168 = 7 days, 720 = 30 days
    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    const periodLabel = startDate && endDate
      ? `${since} to ${until}`
      : hours <= 24 ? "24 hours" : hours <= 168 ? "7 days" : hours <= 720 ? "30 days" : `${hours} hours`;

    // Parallel GraphQL queries for traffic + threats + top countries + paths + UAs + timeline + rate limits
    const [trafficResult, threatResult, countryResult, statusResult, pathResult, uaResult, timelineResult, rateLimitResult, topIPsResult] = await Promise.all([
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 1
            ) {
              count
              sum { edgeResponseBytes }
              dimensions { datetimeMinute }
            }
          }
        }
      }`),
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}"}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientCountryName action source }
            }
          }
        }
      }`),
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientCountryName }
            }
          }
        }
      }`),
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 20
              orderBy: [count_DESC]
            ) {
              count
              dimensions { edgeResponseStatus }
            }
          }
        }
      }`),
      // Top paths
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 25
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath }
            }
          }
        }
      }`),
      // Top user agents
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 20
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent }
            }
          }
        }
      }`),
      // Per-minute timeline (last portion)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 200
              orderBy: [datetimeFiveMinutes_ASC]
            ) {
              count
              dimensions { datetimeFiveMinutes }
            }
          }
        }
      }`),
      // Rate limit rules
      cfAPI("GET", `/zones/${zoneId}/rate_limits`).catch(() => null),
      // Top IPs
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 20
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP clientCountryName }
            }
          }
        }
      }`)
    ]);

    // Parse traffic
    const trafficGroups = trafficResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const totalRequests = trafficGroups.reduce((s, g) => s + g.count, 0);
    const totalBytes = trafficGroups.reduce((s, g) => s + (g.sum?.edgeResponseBytes || 0), 0);

    // Parse threats
    const fwGroups = threatResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    let totalThreats = 0;
    const threatsByCountry = {};
    const threatsByAction = {};
    const threatsBySource = {};
    fwGroups.forEach(g => {
      totalThreats += g.count;
      const c = g.dimensions.clientCountryName || "Unknown";
      threatsByCountry[c] = (threatsByCountry[c] || 0) + g.count;
      const a = g.dimensions.action || "unknown";
      threatsByAction[a] = (threatsByAction[a] || 0) + g.count;
      const s = g.dimensions.source || "unknown";
      threatsBySource[s] = (threatsBySource[s] || 0) + g.count;
    });

    // Parse countries
    const countryGroups = countryResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const byCountry = {};
    countryGroups.forEach(g => {
      const c = g.dimensions.clientCountryName || "Unknown";
      byCountry[c] = (byCountry[c] || 0) + g.count;
    });

    // Parse status codes
    const statusGroups = statusResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const httpStatus = {};
    statusGroups.forEach(g => {
      const code = g.dimensions.edgeResponseStatus || "unknown";
      httpStatus[code] = (httpStatus[code] || 0) + g.count;
    });

    // Parse top paths
    const pathGroups = pathResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const topPaths = pathGroups.map(g => ({ path: g.dimensions.clientRequestPath || "/", count: g.count }));

    // Parse top user agents
    const uaGroups = uaResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const topUserAgents = uaGroups.map(g => ({ userAgent: g.dimensions.userAgent || "Unknown", count: g.count }));

    // Parse timeline
    const timelineGroups = timelineResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const timeline = timelineGroups.map(g => ({ time: g.dimensions.datetimeFiveMinutes, count: g.count }));

    // Parse rate limits
    const rateLimits = (rateLimitResult?.result || []).map(r => ({
      id: r.id,
      description: r.description || "",
      threshold: r.threshold,
      period: r.period,
      action: r.action,
      match: r.match,
      disabled: r.disabled,
      bypass: r.bypass,
    }));

    // Parse top IPs
    const ipGroups = topIPsResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const topIPs = ipGroups.map(g => ({ ip: g.dimensions.clientIP, country: g.dimensions.clientCountryName || "Unknown", count: g.count }));

    const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

    const data = {
      period: periodLabel,
      requests: {
        total: totalRequests,
        httpStatus,
        topCountries: sortObj(byCountry).slice(0, 20),
      },
      bandwidth: {
        total: formatBytes(totalBytes),
        totalBytes,
      },
      threats: {
        total: totalThreats,
        byCountry: sortObj(threatsByCountry).slice(0, 20),
        byAction: sortObj(threatsByAction),
        bySource: sortObj(threatsBySource),
      },
      topPaths,
      topUserAgents,
      timeline,
      rateLimits,
      topIPs,
    };

    return SendResponse(res, "success", "Traffic analytics fetched", data);
  } catch (error) {
    console.error("CF trafficAnalytics error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch traffic analytics");
  }
};

// ==========================================
// 3. BLOCKED IPS LIST — Cloudflare me jo bhi IPs blocked hain
// ==========================================
const blockedIPsList = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const page = req.body.page || 1;
    const perPage = req.body.perPage || 50;

    const result = await cfAPI(
      "GET",
      `/zones/${zoneId}/firewall/access_rules/rules?mode=block&page=${page}&per_page=${perPage}&order=created_on&direction=desc`
    );

    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to fetch blocked IPs");
    }

    const blockedIPs = (result.result || []).map((rule) => ({
      id: rule.id,
      ip: rule.configuration?.value || "",
      target: rule.configuration?.target || "ip",
      mode: rule.mode,
      notes: rule.notes || "",
      createdOn: rule.created_on,
      modifiedOn: rule.modified_on,
    }));

    const data = {
      blockedIPs,
      pagination: {
        page: result.result_info?.page || page,
        perPage: result.result_info?.per_page || perPage,
        totalCount: result.result_info?.total_count || 0,
        totalPages: result.result_info?.total_pages || 0,
      },
    };

    return SendResponse(res, "success", "Blocked IPs fetched", data);
  } catch (error) {
    console.error("CF blockedIPsList error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch blocked IPs");
  }
};

// ==========================================
// 4. BLOCK IP — Cloudflare me IP block karo
// ==========================================
const blockIP = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { ip, note } = req.body;
    if (!ip) return SendResponse(res, "error", "IP address is required");

    const result = await cfAPI("POST", `/zones/${zoneId}/firewall/access_rules/rules`, {
      mode: "block",
      configuration: { target: "ip", value: ip },
      notes: note || `Blocked via admin panel | ${new Date().toISOString()}`,
    });

    if (!result.success) {
      const errMsg = result.errors?.[0]?.message || "Failed to block IP";
      // Duplicate check
      if (errMsg.includes("duplicate") || errMsg.includes("already exists")) {
        return SendResponse(res, "error", `IP ${ip} is already blocked in Cloudflare`);
      }
      return SendResponse(res, "error", errMsg);
    }

    return SendResponse(res, "success", `IP ${ip} blocked successfully in Cloudflare`, {
      id: result.result?.id,
      ip,
      mode: "block",
    });
  } catch (error) {
    console.error("CF blockIP error:", error);
    return SendResponse(res, "error", error.message || "Failed to block IP");
  }
};

// ==========================================
// 5. UNBLOCK IP — Cloudflare se IP unblock karo
// ==========================================
const unblockIP = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { ip } = req.body;
    if (!ip) return SendResponse(res, "error", "IP address is required");

    // Find rule ID for this IP
    const findResult = await cfAPI(
      "GET",
      `/zones/${zoneId}/firewall/access_rules/rules?configuration.target=ip&configuration.value=${ip}&mode=block`
    );

    if (!findResult.success || !findResult.result?.length) {
      return SendResponse(res, "error", `IP ${ip} not found in Cloudflare block list`);
    }

    const ruleId = findResult.result[0].id;
    const deleteResult = await cfAPI("DELETE", `/zones/${zoneId}/firewall/access_rules/rules/${ruleId}`);

    if (!deleteResult.success) {
      return SendResponse(res, "error", deleteResult.errors?.[0]?.message || "Failed to unblock IP");
    }

    return SendResponse(res, "success", `IP ${ip} unblocked successfully`, { ip });
  } catch (error) {
    console.error("CF unblockIP error:", error);
    return SendResponse(res, "error", error.message || "Failed to unblock IP");
  }
};

// ==========================================
// 6. FIREWALL EVENTS — Recent attack/block events
// ==========================================
const firewallEvents = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const limit = req.body.limit || 50;
    const { startDate, endDate } = req.body;

    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const untilDate = endDate ? new Date(endDate).toISOString() : null;
    const periodLabel = startDate && endDate ? `${since} to ${untilDate}` : `Last ${hours} hours`;

    const datetimeFilter = untilDate
      ? `datetime_gt: "${since}", datetime_lt: "${untilDate}"`
      : `datetime_gt: "${since}"`;

    const query = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          firewallEventsAdaptive(
            filter: {${datetimeFilter}}
            limit: ${limit}
            orderBy: [datetime_DESC]
          ) {
            action
            clientASNDescription
            clientCountryName
            clientIP
            clientRequestHTTPHost
            clientRequestHTTPMethodName
            clientRequestPath
            datetime
            rayName
            ruleId
            source
            userAgent
          }
        }
      }
    }`;

    const result = await cfGraphQL(query);

    if (result.errors && result.errors.length > 0) {
      return SendResponse(res, "error", result.errors[0]?.message || "GraphQL error");
    }

    const events = result.data?.viewer?.zones?.[0]?.firewallEventsAdaptive || [];

    const data = {
      totalEvents: events.length,
      period: periodLabel,
      events: events.map((e) => ({
        action: e.action,
        ip: e.clientIP,
        country: e.clientCountryName,
        asn: e.clientASNDescription,
        method: e.clientRequestHTTPMethodName,
        path: e.clientRequestPath,
        userAgent: e.userAgent,
        source: e.source,
        ruleId: e.ruleId,
        time: e.datetime,
      })),
    };

    return SendResponse(res, "success", "Firewall events fetched", data);
  } catch (error) {
    console.error("CF firewallEvents error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch firewall events");
  }
};

// ==========================================
// 7. TOP ATTACKERS — Sabse zyada attack karne wale IPs
// ==========================================
const topAttackers = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const limit = req.body.limit || 100;
    const { startDate, endDate } = req.body;

    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const untilDate = endDate ? new Date(endDate).toISOString() : null;
    const periodLabel = startDate && endDate ? `${since} to ${untilDate}` : `Last ${hours} hours`;

    const datetimeFilter = untilDate
      ? `datetime_gt: "${since}", datetime_lt: "${untilDate}"`
      : `datetime_gt: "${since}"`;

    const query = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          firewallEventsAdaptiveGroups(
            filter: {${datetimeFilter}}
            limit: ${limit}
            orderBy: [count_DESC]
          ) {
            count
            dimensions {
              clientIP
              clientCountryName
              clientASNDescription
              action
            }
          }
        }
      }
    }`;

    const result = await cfGraphQL(query);

    if (result.errors && result.errors.length > 0) {
      return SendResponse(res, "error", result.errors[0]?.message || "GraphQL error");
    }

    const groups = result.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];

    const attackers = groups.map((g) => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      asn: g.dimensions.clientASNDescription,
      action: g.dimensions.action,
      totalRequests: g.count,
    }));

    // Summary
    const totalAttacks = attackers.reduce((sum, a) => sum + a.totalRequests, 0);
    const countrySummary = {};
    attackers.forEach((a) => {
      countrySummary[a.country] = (countrySummary[a.country] || 0) + a.totalRequests;
    });

    const data = {
      period: periodLabel,
      totalAttackRequests: totalAttacks,
      uniqueAttackerIPs: attackers.length,
      topCountries: Object.entries(countrySummary)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([country, count]) => ({ country, requests: count })),
      attackers,
    };

    return SendResponse(res, "success", "Top attackers fetched", data);
  } catch (error) {
    console.error("CF topAttackers error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch top attackers");
  }
};

// ==========================================
// 8. REQUESTS PER MINUTE — Live traffic data
// ==========================================
const requestsPerMinute = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const minutes = req.body.minutes || 60;

    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const until = new Date().toISOString();

    const query = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 1000
            orderBy: [datetimeMinute_ASC]
          ) {
            count
            avg {
              sampleInterval
            }
            dimensions {
              datetimeMinute
            }
          }
        }
      }
    }`;

    const result = await cfGraphQL(query);

    if (result.errors && result.errors.length > 0) {
      return SendResponse(res, "error", result.errors[0]?.message || "GraphQL error");
    }

    const groups = result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

    const timeseries = groups.map((g) => ({
      minute: g.dimensions.datetimeMinute,
      requests: g.count,
    }));

    const totalRequests = timeseries.reduce((sum, t) => sum + t.requests, 0);
    const avgPerMinute = timeseries.length > 0 ? Math.round(totalRequests / timeseries.length) : 0;
    const peakMinute = timeseries.reduce((max, t) => (t.requests > max.requests ? t : max), { requests: 0, minute: "" });

    const data = {
      period: `Last ${minutes} minutes`,
      totalRequests,
      avgRequestsPerMinute: avgPerMinute,
      peakRequestsPerMinute: peakMinute.requests,
      peakTime: peakMinute.minute,
      currentMinuteCount: timeseries.length > 0 ? timeseries[timeseries.length - 1].requests : 0,
      timeseries,
    };

    return SendResponse(res, "success", "Requests per minute fetched", data);
  } catch (error) {
    console.error("CF requestsPerMinute error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch requests per minute");
  }
};

// ==========================================
// 9. TOP IPS — Sabse zyada request karne wale IPs (sab — attack + normal)
// ==========================================
const topIPs = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const limit = req.body.limit || 50;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const query = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}"}
            limit: ${limit}
            orderBy: [count_DESC]
          ) {
            count
            dimensions {
              clientIP
              clientCountryName
              clientRequestHTTPMethodName
            }
          }
        }
      }
    }`;

    const result = await cfGraphQL(query);

    if (result.errors && result.errors.length > 0) {
      return SendResponse(res, "error", result.errors[0]?.message || "GraphQL error");
    }

    const groups = result.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

    const ips = groups.map((g) => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      method: g.dimensions.clientRequestHTTPMethodName,
      totalRequests: g.count,
    }));

    const data = {
      period: `Last ${hours} hours`,
      totalUniqueIPs: ips.length,
      ips,
    };

    return SendResponse(res, "success", "Top IPs fetched", data);
  } catch (error) {
    console.error("CF topIPs error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch top IPs");
  }
};

// ==========================================
// 10. THREAT ANALYTICS — Country wise, type wise threats
// ==========================================
const threatAnalytics = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Get threats by country
    const countryQuery = `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          firewallEventsAdaptiveGroups(
            filter: {datetime_gt: "${since}"}
            limit: 100
            orderBy: [count_DESC]
          ) {
            count
            dimensions {
              clientCountryName
              action
              source
            }
          }
        }
      }
    }`;

    const result = await cfGraphQL(countryQuery);

    if (result.errors && result.errors.length > 0) {
      return SendResponse(res, "error", result.errors[0]?.message || "GraphQL error");
    }

    const groups = result.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];

    // Aggregate by country
    const byCountry = {};
    const byAction = {};
    const bySource = {};
    let total = 0;

    groups.forEach((g) => {
      const count = g.count;
      total += count;

      const country = g.dimensions.clientCountryName || "Unknown";
      byCountry[country] = (byCountry[country] || 0) + count;

      const action = g.dimensions.action || "unknown";
      byAction[action] = (byAction[action] || 0) + count;

      const source = g.dimensions.source || "unknown";
      bySource[source] = (bySource[source] || 0) + count;
    });

    const sortObj = (obj) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

    const data = {
      period: `Last ${hours} hours`,
      totalThreats: total,
      byCountry: sortObj(byCountry),
      byAction: sortObj(byAction),
      bySource: sortObj(bySource),
    };

    return SendResponse(res, "success", "Threat analytics fetched", data);
  } catch (error) {
    console.error("CF threatAnalytics error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch threat analytics");
  }
};

// ==========================================
// 11. FULL DASHBOARD — Ek call me sab kuch
// ==========================================
const fullDashboard = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // Parallel calls for speed — all GraphQL + REST
    const [zoneResult, blockedResult, graphqlResult] = await Promise.all([
      cfAPI("GET", `/zones/${zoneId}`).catch(() => null),
      cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?mode=block&per_page=5&order=created_on&direction=desc`).catch(() => null),
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}"}
              limit: 10
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                clientIP
                clientCountryName
                action
              }
            }
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 10
              orderBy: [count_DESC]
            ) {
              count
              sum { edgeResponseBytes }
              dimensions {
                clientIP
                clientCountryName
              }
            }
          }
        }
      }`).catch(() => null),
    ]);

    const zone = zoneResult?.result || {};
    const blockedIPs = (blockedResult?.result || []).map((r) => ({
      ip: r.configuration?.value,
      notes: r.notes,
      createdOn: r.created_on,
    }));

    const fwGroups = graphqlResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const httpGroups = graphqlResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

    const totalRequests = httpGroups.reduce((s, g) => s + g.count, 0);
    const totalBytes = httpGroups.reduce((s, g) => s + (g.sum?.edgeResponseBytes || 0), 0);
    const totalThreats = fwGroups.reduce((s, g) => s + g.count, 0);

    const topAttackersList = fwGroups.map((g) => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      action: g.dimensions.action,
      requests: g.count,
    }));

    const topIPsList = httpGroups.map((g) => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      requests: g.count,
    }));

    const data = {
      zone: {
        domain: zone.name,
        status: zone.status,
        plan: zone.plan?.name,
      },
      period: `Last ${hours} hours`,
      traffic: {
        totalRequests,
        bandwidth: formatBytes(totalBytes),
        threats: totalThreats,
        topIPs: topIPsList,
      },
      security: {
        totalThreats,
        totalBlockedIPs: blockedResult?.result_info?.total_count || 0,
        recentBlockedIPs: blockedIPs,
        topAttackers: topAttackersList,
      },
    };

    return SendResponse(res, "success", "Full dashboard fetched", data);
  } catch (error) {
    console.error("CF fullDashboard error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch dashboard");
  }
};

// ==========================================
// 12. DNS RECORDS — Domain ke DNS records
// ==========================================
const dnsRecords = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const result = await cfAPI("GET", `/zones/${zoneId}/dns_records?per_page=100`);
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to fetch DNS records");
    }

    const records = (result.result || []).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
    }));

    return SendResponse(res, "success", "DNS records fetched", { totalRecords: records.length, records });
  } catch (error) {
    console.error("CF dnsRecords error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch DNS records");
  }
};

// ==========================================
// 12b. DNS Record Management — Create, Update, Delete
// ==========================================
const createDnsRecord = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { type, name, content, ttl, proxied, priority } = req.body;
    if (!type || !name || !content) {
      return SendResponse(res, "error", "type, name, and content are required");
    }

    const body = { type, name, content, ttl: ttl || 1, proxied: !!proxied };
    if (type === "MX" && priority !== undefined) body.priority = parseInt(priority);

    const result = await cfAPI("POST", `/zones/${zoneId}/dns_records`, body);
    console.log("[CF DNS Create] Request:", JSON.stringify(body), "Response:", JSON.stringify(result));
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to create DNS record");
    }

    return SendResponse(res, "success", "DNS record created", {
      id: result.result.id,
      type: result.result.type,
      name: result.result.name,
      content: result.result.content,
      proxied: result.result.proxied,
      ttl: result.result.ttl,
    });
  } catch (error) {
    console.error("CF createDnsRecord error:", error);
    return SendResponse(res, "error", error.message || "Failed to create DNS record");
  }
};

const updateDnsRecord = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { recordId, type, name, content, ttl, proxied, priority } = req.body;
    if (!recordId || !type || !name || !content) {
      return SendResponse(res, "error", "recordId, type, name, and content are required");
    }

    const body = { type, name, content, ttl: ttl || 1, proxied: !!proxied };
    if (type === "MX" && priority !== undefined) body.priority = parseInt(priority);

    const result = await cfAPI("PUT", `/zones/${zoneId}/dns_records/${recordId}`, body);
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to update DNS record");
    }

    return SendResponse(res, "success", "DNS record updated", {
      id: result.result.id,
      type: result.result.type,
      name: result.result.name,
      content: result.result.content,
      proxied: result.result.proxied,
      ttl: result.result.ttl,
    });
  } catch (error) {
    console.error("CF updateDnsRecord error:", error);
    return SendResponse(res, "error", error.message || "Failed to update DNS record");
  }
};

const deleteDnsRecord = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { recordId } = req.body;
    if (!recordId) return SendResponse(res, "error", "recordId is required");

    const result = await cfAPI("DELETE", `/zones/${zoneId}/dns_records/${recordId}`);
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to delete DNS record");
    }

    return SendResponse(res, "success", "DNS record deleted");
  } catch (error) {
    console.error("CF deleteDnsRecord error:", error);
    return SendResponse(res, "error", error.message || "Failed to delete DNS record");
  }
};

// ==========================================
// 13. SECURITY LEVEL — Get/Set security level
// ==========================================
const getSecurityLevel = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const result = await cfAPI("GET", `/zones/${zoneId}/settings/security_level`);
    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed");
    }

    return SendResponse(res, "success", "Security level fetched", {
      securityLevel: result.result?.value,
      options: ["off", "essentially_off", "low", "medium", "high", "under_attack"],
    });
  } catch (error) {
    console.error("CF getSecurityLevel error:", error);
    return SendResponse(res, "error", error.message);
  }
};

const setSecurityLevel = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { level } = req.body;
    const validLevels = ["off", "essentially_off", "low", "medium", "high", "under_attack"];

    if (!level || !validLevels.includes(level)) {
      return SendResponse(res, "error", `Invalid level. Valid options: ${validLevels.join(", ")}`);
    }

    const result = await cfAPI("PATCH", `/zones/${zoneId}/settings/security_level`, {
      value: level,
    });

    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed to set security level");
    }

    return SendResponse(res, "success", `Security level changed to "${level}"`, {
      securityLevel: result.result?.value,
    });
  } catch (error) {
    console.error("CF setSecurityLevel error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ==========================================
// 14. UNDER ATTACK MODE — Toggle on/off
// ==========================================
const toggleUnderAttack = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { enable } = req.body;
    const level = enable ? "under_attack" : "medium";

    const result = await cfAPI("PATCH", `/zones/${zoneId}/settings/security_level`, {
      value: level,
    });

    if (!result.success) {
      return SendResponse(res, "error", result.errors?.[0]?.message || "Failed");
    }

    return SendResponse(res, "success", enable ? "Under Attack mode ENABLED" : "Under Attack mode DISABLED (set to medium)", {
      securityLevel: result.result?.value,
    });
  } catch (error) {
    console.error("CF toggleUnderAttack error:", error);
    return SendResponse(res, "error", error.message);
  }
};

// ==========================================
// 15. LIVE ATTACKERS — Real-time attackers (last 1-5 min, per-minute breakdown)
// ==========================================
const liveAttackers = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const minutes = req.body.minutes || 5; // last 5 min default
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();
    const periodLabel = startDate && endDate ? `${since} to ${until}` : `Last ${minutes} minutes`;

    // Parallel: per-IP attackers + per-minute timeline + per-IP traffic
    const [attackerResult, timelineResult, trafficResult] = await Promise.all([
      // Top attacker IPs with details
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                clientIP
                clientCountryName
                clientASNDescription
                action
                clientRequestHTTPMethodName
              }
            }
          }
        }
      }`),
      // Per-minute attack timeline
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 500
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions {
                datetimeMinute
                clientIP
                action
              }
            }
          }
        }
      }`),
      // Per-minute total traffic (attack + normal)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions {
                datetimeMinute
              }
            }
          }
        }
      }`)
    ]);

    // Parse top attackers
    const attackerGroups = attackerResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const attackers = attackerGroups.map(g => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      asn: g.dimensions.clientASNDescription,
      action: g.dimensions.action,
      method: g.dimensions.clientRequestHTTPMethodName,
      attackRequests: g.count,
      attacksPerMinute: Math.round(g.count / minutes),
    }));

    // Parse per-minute timeline (group by minute)
    const tlGroups = timelineResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const minuteMap = {};
    const ipMinuteMap = {};
    tlGroups.forEach(g => {
      const min = g.dimensions.datetimeMinute;
      const ip = g.dimensions.clientIP;
      minuteMap[min] = (minuteMap[min] || 0) + g.count;
      if (!ipMinuteMap[ip]) ipMinuteMap[ip] = {};
      ipMinuteMap[ip][min] = (ipMinuteMap[ip][min] || 0) + g.count;
    });

    const attackTimeline = Object.entries(minuteMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([minute, count]) => ({ minute, attacks: count }));

    // Parse traffic timeline
    const trafficGroups = trafficResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const trafficTimeline = trafficGroups.map(g => ({
      minute: g.dimensions.datetimeMinute,
      totalRequests: g.count,
    }));

    // Top 10 attackers with per-minute breakdown
    const topAttackersDetailed = attackers.slice(0, 10).map(a => {
      const perMin = ipMinuteMap[a.ip] || {};
      return {
        ...a,
        perMinute: Object.entries(perMin)
          .sort((x, y) => x[0].localeCompare(y[0]))
          .map(([minute, count]) => ({ minute, attacks: count })),
      };
    });

    const totalAttacks = attackers.reduce((s, a) => s + a.attackRequests, 0);
    const totalTraffic = trafficTimeline.reduce((s, t) => s + t.totalRequests, 0);

    const data = {
      period: periodLabel,
      snapshot: {
        totalAttackRequests: totalAttacks,
        totalTrafficRequests: totalTraffic,
        attackPercentage: totalTraffic > 0 ? ((totalAttacks / totalTraffic) * 100).toFixed(1) + "%" : "0%",
        uniqueAttackerIPs: attackers.length,
        avgAttacksPerMinute: Math.round(totalAttacks / minutes),
      },
      attackTimeline,
      trafficTimeline,
      topAttackers: topAttackersDetailed,
      allAttackers: attackers,
    };

    return SendResponse(res, "success", "Live attackers fetched", data);
  } catch (error) {
    console.error("CF liveAttackers error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch live attackers");
  }
};

// ==========================================
// 16. ATTACKER PROFILE — Ek specific IP ka poora behavior
// ==========================================
const attackerProfile = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { ip } = req.body;
    if (!ip) return SendResponse(res, "error", "IP address is required");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const untilDate = endDate ? new Date(endDate).toISOString() : null;
    const periodLabel = startDate && endDate ? `${since} to ${untilDate}` : `Last ${hours} hours`;

    const fwFilter = untilDate
      ? `datetime_gt: "${since}", datetime_lt: "${untilDate}", clientIP: "${ip}"`
      : `datetime_gt: "${since}", clientIP: "${ip}"`;

    // Parallel: events detail + per-minute pattern + paths + user agents
    const [eventsResult, minuteResult, pathResult, uaResult] = await Promise.all([
      // Recent events for this IP
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptive(
              filter: {${fwFilter}}
              limit: 100
              orderBy: [datetime_DESC]
            ) {
              action
              clientCountryName
              clientASNDescription
              clientRequestHTTPHost
              clientRequestHTTPMethodName
              clientRequestPath
              datetime
              source
              userAgent
              ruleId
            }
          }
        }
      }`),
      // Per-minute attack pattern
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 1000
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions { datetimeMinute action }
            }
          }
        }
      }`),
      // Paths this IP hit
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // User agents used
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 20
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent }
            }
          }
        }
      }`)
    ]);

    // Recent events
    const events = eventsResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptive || [];
    const recentEvents = events.map(e => ({
      time: e.datetime,
      action: e.action,
      method: e.clientRequestHTTPMethodName,
      path: e.clientRequestPath,
      userAgent: e.userAgent,
      source: e.source,
      ruleId: e.ruleId,
    }));

    // Per-minute timeline
    const minGroups = minuteResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const perMinute = minGroups.map(g => ({
      minute: g.dimensions.datetimeMinute,
      action: g.dimensions.action,
      count: g.count,
    }));
    const totalHits = minGroups.reduce((s, g) => s + g.count, 0);

    // Paths targeted
    const pathGroups = pathResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const targetedPaths = pathGroups.map(g => ({
      path: g.dimensions.clientRequestPath,
      method: g.dimensions.clientRequestHTTPMethodName,
      hits: g.count,
    }));

    // User agents
    const uaGroups = uaResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const userAgents = uaGroups.map(g => ({
      userAgent: g.dimensions.userAgent,
      hits: g.count,
    }));

    // Basic info from first event
    const firstEvent = events[0] || {};
    const country = firstEvent.clientCountryName || "Unknown";
    const asn = firstEvent.clientASNDescription || "Unknown";

    // Calculate behavior patterns
    const minuteTimestamps = minGroups.map(g => new Date(g.dimensions.datetimeMinute).getTime());
    let burstPeriods = 0;
    let maxBurst = 0;
    minGroups.forEach(g => {
      if (g.count > maxBurst) maxBurst = g.count;
      if (g.count > 10) burstPeriods++;
    });

    const activeMinutes = minGroups.length;
    const firstSeen = minGroups.length > 0 ? minGroups[0].dimensions.datetimeMinute : null;
    const lastSeen = minGroups.length > 0 ? minGroups[minGroups.length - 1].dimensions.datetimeMinute : null;

    const data = {
      ip,
      country,
      asn,
      period: periodLabel,
      summary: {
        totalAttackHits: totalHits,
        activeMinutes,
        avgHitsPerMinute: activeMinutes > 0 ? Math.round(totalHits / activeMinutes) : 0,
        peakHitsPerMinute: maxBurst,
        burstMinutes: burstPeriods,
        firstSeen,
        lastSeen,
        uniquePaths: targetedPaths.length,
        uniqueUserAgents: userAgents.length,
      },
      behavior: {
        isBotLikely: userAgents.length <= 2 && totalHits > 100,
        isDistributed: false,
        targetsFewPaths: targetedPaths.length <= 3 && totalHits > 50,
        highBurstRate: maxBurst > 50,
        pattern: maxBurst > 100 ? "AGGRESSIVE_FLOOD" :
                 maxBurst > 30 ? "HIGH_RATE" :
                 activeMinutes > 60 ? "LOW_SLOW" : "MODERATE",
      },
      targetedPaths,
      userAgents,
      perMinuteTimeline: perMinute,
      recentEvents: recentEvents.slice(0, 30),
    };

    return SendResponse(res, "success", `Attacker profile for ${ip}`, data);
  } catch (error) {
    console.error("CF attackerProfile error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch attacker profile");
  }
};

// ==========================================
// 17. LIVE TRAFFIC SNAPSHOT — Real-time traffic (last 5 min per-minute)
// ==========================================
const liveTrafficSnapshot = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const minutes = req.body.minutes || 5;
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const until = new Date().toISOString();

    const [trafficResult, attackResult, statusResult] = await Promise.all([
      // Per-minute total traffic
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              sum { edgeResponseBytes }
              dimensions { datetimeMinute }
            }
          }
        }
      }`),
      // Per-minute attack traffic
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}"}
              limit: 100
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions { datetimeMinute action }
            }
          }
        }
      }`),
      // Status codes in this window
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { edgeResponseStatus }
            }
          }
        }
      }`)
    ]);

    // Traffic per minute
    const tGroups = trafficResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const trafficPerMinute = tGroups.map(g => ({
      minute: g.dimensions.datetimeMinute,
      requests: g.count,
      bandwidth: formatBytes(g.sum?.edgeResponseBytes || 0),
      bandwidthBytes: g.sum?.edgeResponseBytes || 0,
    }));

    // Attack per minute
    const aGroups = attackResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const attackMinuteMap = {};
    aGroups.forEach(g => {
      const min = g.dimensions.datetimeMinute;
      if (!attackMinuteMap[min]) attackMinuteMap[min] = { total: 0, actions: {} };
      attackMinuteMap[min].total += g.count;
      const action = g.dimensions.action || "unknown";
      attackMinuteMap[min].actions[action] = (attackMinuteMap[min].actions[action] || 0) + g.count;
    });

    // Merge traffic + attack per minute
    const combined = trafficPerMinute.map(t => {
      const attack = attackMinuteMap[t.minute] || { total: 0, actions: {} };
      return {
        ...t,
        attacks: attack.total,
        legitimateRequests: t.requests - attack.total,
        attackActions: attack.actions,
        attackPercentage: t.requests > 0 ? ((attack.total / t.requests) * 100).toFixed(1) + "%" : "0%",
      };
    });

    // Status codes
    const sGroups = statusResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const statusCodes = {};
    sGroups.forEach(g => {
      statusCodes[g.dimensions.edgeResponseStatus] = (statusCodes[g.dimensions.edgeResponseStatus] || 0) + g.count;
    });

    const totalRequests = trafficPerMinute.reduce((s, t) => s + t.requests, 0);
    const totalAttacks = Object.values(attackMinuteMap).reduce((s, a) => s + a.total, 0);
    const currentMinute = combined.length > 0 ? combined[combined.length - 1] : null;

    const data = {
      period: `Last ${minutes} minutes`,
      realtime: {
        totalRequests,
        totalAttacks,
        legitimateRequests: totalRequests - totalAttacks,
        attackPercentage: totalRequests > 0 ? ((totalAttacks / totalRequests) * 100).toFixed(1) + "%" : "0%",
        avgRequestsPerMinute: combined.length > 0 ? Math.round(totalRequests / combined.length) : 0,
        avgAttacksPerMinute: combined.length > 0 ? Math.round(totalAttacks / combined.length) : 0,
      },
      currentMinute: currentMinute ? {
        minute: currentMinute.minute,
        requests: currentMinute.requests,
        attacks: currentMinute.attacks,
        attackPercentage: currentMinute.attackPercentage,
      } : null,
      statusCodes,
      perMinute: combined,
    };

    return SendResponse(res, "success", "Live traffic snapshot fetched", data);
  } catch (error) {
    console.error("CF liveTrafficSnapshot error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch live snapshot");
  }
};

// ==========================================
// 18. ATTACKER BEHAVIOR REPORT — Cloudflare ko share karne ke liye full report
// ==========================================
const attackerBehaviorReport = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 6;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();
    const periodLabel = startDate && endDate ? `${since} to ${until}` : `Last ${hours} hours`;

    const fwDateFilter = `datetime_gt: "${since}", datetime_lt: "${until}"`;

    // Parallel: all data needed for Cloudflare report
    const [topAttackerResult, pathResult, countryResult, asnResult, uaResult, timelineResult, trafficResult] = await Promise.all([
      // Top 50 attacker IPs
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                clientIP
                clientCountryName
                clientASNDescription
                action
              }
            }
          }
        }
      }`),
      // Most attacked paths
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // Attack by country
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientCountryName }
            }
          }
        }
      }`),
      // Attack by ASN (network provider)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientASNDescription }
            }
          }
        }
      }`),
      // User agents used in attacks
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent }
            }
          }
        }
      }`),
      // Per-minute attack timeline
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwDateFilter}}
              limit: 1000
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions { datetimeMinute }
            }
          }
        }
      }`),
      // Total traffic for comparison
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 1
            ) {
              count
            }
          }
        }
      }`)
    ]);

    // Top attackers
    const attackerGroups = topAttackerResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const topAttackers = attackerGroups.map(g => ({
      ip: g.dimensions.clientIP,
      country: g.dimensions.clientCountryName,
      asn: g.dimensions.clientASNDescription,
      action: g.dimensions.action,
      totalHits: g.count,
      hitsPerMinute: Math.round(g.count / (hours * 60)),
    }));
    const totalAttacks = topAttackers.reduce((s, a) => s + a.totalHits, 0);

    // Targeted paths
    const pGroups = pathResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const targetedPaths = pGroups.map(g => ({
      path: g.dimensions.clientRequestPath,
      method: g.dimensions.clientRequestHTTPMethodName,
      hits: g.count,
      percentage: totalAttacks > 0 ? ((g.count / totalAttacks) * 100).toFixed(1) + "%" : "0%",
    }));

    // Countries
    const cGroups = countryResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const byCountry = {};
    cGroups.forEach(g => {
      const c = g.dimensions.clientCountryName || "Unknown";
      byCountry[c] = (byCountry[c] || 0) + g.count;
    });
    const attackCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .map(([country, hits]) => ({
        country, hits,
        percentage: totalAttacks > 0 ? ((hits / totalAttacks) * 100).toFixed(1) + "%" : "0%",
      }));

    // ASNs (network providers)
    const asnGroups = asnResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const byASN = {};
    asnGroups.forEach(g => {
      const a = g.dimensions.clientASNDescription || "Unknown";
      byASN[a] = (byASN[a] || 0) + g.count;
    });
    const attackASNs = Object.entries(byASN)
      .sort((a, b) => b[1] - a[1])
      .map(([asn, hits]) => ({
        asn, hits,
        percentage: totalAttacks > 0 ? ((hits / totalAttacks) * 100).toFixed(1) + "%" : "0%",
      }));

    // User agents
    const uaGrps = uaResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const attackUAs = uaGrps.map(g => ({
      userAgent: g.dimensions.userAgent,
      hits: g.count,
    }));

    // Timeline
    const tlGroups = timelineResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const timeline = tlGroups.map(g => ({ minute: g.dimensions.datetimeMinute, attacks: g.count }));
    const peakMinute = timeline.reduce((max, t) => t.attacks > max.attacks ? t : max, { attacks: 0, minute: "" });

    // Total traffic
    const trafGroups = trafficResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const totalTraffic = trafGroups.reduce((s, g) => s + g.count, 0);

    // IPs list for Cloudflare (comma separated + newline separated)
    const attackerIPs = topAttackers.map(a => a.ip);

    const data = {
      reportGeneratedAt: new Date().toISOString(),
      domain: "ons3.co",
      zoneId,
      period: periodLabel,
      overallStats: {
        totalTrafficRequests: totalTraffic,
        totalAttackRequests: totalAttacks,
        attackPercentage: totalTraffic > 0 ? ((totalAttacks / totalTraffic) * 100).toFixed(1) + "%" : "0%",
        uniqueAttackerIPs: topAttackers.length,
        peakAttacksPerMinute: peakMinute.attacks,
        peakTime: peakMinute.minute,
        avgAttacksPerMinute: timeline.length > 0 ? Math.round(totalAttacks / timeline.length) : 0,
        attackDurationMinutes: timeline.length,
      },
      topAttackers,
      attackCountries,
      attackASNs,
      targetedPaths,
      attackUserAgents: attackUAs,
      attackTimeline: timeline,
      // Ready-to-share with Cloudflare
      cloudflareShareData: {
        ipListForBlock: attackerIPs.join("\n"),
        ipListCommaSeparated: attackerIPs.join(", "),
        wafExpression: attackerIPs.length > 0 ? `(ip.src in {${attackerIPs.join(" ")}})` : "",
        topASNsToBlock: attackASNs.slice(0, 5).map(a => a.asn),
        topCountriesToChallenge: attackCountries.slice(0, 5).map(c => c.country),
        suggestedActions: [
          totalAttacks > 100000 ? "ENABLE Under Attack Mode immediately" : null,
          attackCountries.length <= 3 ? `Country block suggested: ${attackCountries.slice(0, 3).map(c => c.country).join(", ")}` : null,
          attackASNs.length <= 3 ? `ASN block suggested: ${attackASNs.slice(0, 3).map(a => a.asn).join(", ")}` : null,
          targetedPaths.length <= 2 ? `Rate limit these paths: ${targetedPaths.slice(0, 2).map(p => p.path).join(", ")}` : null,
          peakMinute.attacks > 1000 ? `Peak attack rate: ${peakMinute.attacks}/min at ${peakMinute.minute}` : null,
          attackUAs.length <= 3 ? `Block these User-Agents in WAF` : null,
        ].filter(Boolean),
      },
    };

    return SendResponse(res, "success", "Attacker behavior report generated", data);
  } catch (error) {
    console.error("CF attackerBehaviorReport error:", error);
    return SendResponse(res, "error", error.message || "Failed to generate report");
  }
};

// ==========================================
// 19. IP LOOKUP — Full IP Intelligence Report (firewall + HTTP traffic)
// ==========================================
const ipLookup = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { ip } = req.body;
    if (!ip) return SendResponse(res, "error", "IP address is required");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();
    const periodLabel = startDate && endDate ? `${since} to ${until}` : `Last ${hours} hours`;

    const fwFilter = `datetime_gt: "${since}", datetime_lt: "${until}", clientIP: "${ip}"`;
    const httpFilter = `datetime_gt: "${since}", datetime_lt: "${until}", clientIP: "${ip}"`;

    // Parallel: firewall events + HTTP requests + block list check
    const [
      fwEventsResult,
      fwGroupsByActionResult,
      fwGroupsByPathResult,
      fwTimelineResult,
      httpGroupsTotalResult,
      httpGroupsByPathResult,
      httpGroupsByStatusResult,
      httpGroupsByMethodResult,
      httpTimelineResult,
      httpUAResult,
      blockCheckResult,
    ] = await Promise.all([
      // 1. Recent firewall events (blocked/challenged) for this IP
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptive(
              filter: {${fwFilter}}
              limit: 100
              orderBy: [datetime_DESC]
            ) {
              action
              clientCountryName
              clientASNDescription
              clientRequestHTTPMethodName
              clientRequestPath
              datetime
              source
              userAgent
              ruleId
            }
          }
        }
      }`),
      // 2. Firewall events grouped by action + source
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { action source }
            }
          }
        }
      }`),
      // 3. Firewall events grouped by path
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // 4. Firewall events per-minute timeline
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {${fwFilter}}
              limit: 1000
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions { datetimeMinute action }
            }
          }
        }
      }`),
      // 5. Total HTTP requests for this IP
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 1
            ) {
              count
            }
          }
        }
      }`),
      // 6. HTTP requests by path + method
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // 7. HTTP requests by status code
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { edgeResponseStatus }
            }
          }
        }
      }`),
      // 8. HTTP requests by method
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 20
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // 9. HTTP requests per-minute timeline
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 1000
              orderBy: [datetimeMinute_ASC]
            ) {
              count
              dimensions { datetimeMinute }
            }
          }
        }
      }`),
      // 10. User agents from HTTP requests
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {${httpFilter}}
              limit: 30
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent }
            }
          }
        }
      }`),
      // 11. Check if IP is currently blocked
      cfAPI(
        "GET",
        `/zones/${zoneId}/firewall/access_rules/rules?configuration.target=ip&configuration.value=${ip}&mode=block`
      ).catch(() => ({ success: false, result: [] })),
    ]);

    // --- Parse firewall events ---
    const fwEvents = fwEventsResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptive || [];
    const recentEvents = fwEvents.map(e => ({
      time: e.datetime,
      action: e.action,
      method: e.clientRequestHTTPMethodName,
      path: e.clientRequestPath,
      userAgent: e.userAgent,
      source: e.source,
      ruleId: e.ruleId,
    }));

    // Country/ASN from first firewall event or empty
    const firstFwEvent = fwEvents[0] || {};
    const country = firstFwEvent.clientCountryName || "Unknown";
    const asn = firstFwEvent.clientASNDescription || "Unknown";

    // Firewall by action and source
    const fwActionGroups = fwGroupsByActionResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const byAction = {};
    const bySource = {};
    let totalBlocked = 0;
    fwActionGroups.forEach(g => {
      totalBlocked += g.count;
      const action = g.dimensions.action || "unknown";
      byAction[action] = (byAction[action] || 0) + g.count;
      const source = g.dimensions.source || "unknown";
      bySource[source] = (bySource[source] || 0) + g.count;
    });

    // Firewall by path
    const fwPathGroups = fwGroupsByPathResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const blockedPaths = fwPathGroups.map(g => ({
      path: g.dimensions.clientRequestPath,
      method: g.dimensions.clientRequestHTTPMethodName,
      hits: g.count,
    }));

    // Firewall per-minute timeline
    const fwTlGroups = fwTimelineResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const blockedPerMinute = fwTlGroups.map(g => ({
      minute: g.dimensions.datetimeMinute,
      attacks: g.count,
      action: g.dimensions.action,
    }));

    // --- Parse HTTP requests ---
    const httpTotalGroups = httpGroupsTotalResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const totalRequests = httpTotalGroups.reduce((s, g) => s + g.count, 0);

    // HTTP by path + method
    const httpPathGroups = httpGroupsByPathResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const passedByPath = httpPathGroups.map(g => ({
      path: g.dimensions.clientRequestPath,
      method: g.dimensions.clientRequestHTTPMethodName,
      requests: g.count,
    }));

    // HTTP by status code
    const httpStatusGroups = httpGroupsByStatusResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const byStatusCode = {};
    httpStatusGroups.forEach(g => {
      const code = String(g.dimensions.edgeResponseStatus || "unknown");
      byStatusCode[code] = (byStatusCode[code] || 0) + g.count;
    });

    // HTTP by method
    const httpMethodGroups = httpGroupsByMethodResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const byMethod = {};
    httpMethodGroups.forEach(g => {
      const method = g.dimensions.clientRequestHTTPMethodName || "unknown";
      byMethod[method] = (byMethod[method] || 0) + g.count;
    });

    // HTTP per-minute timeline
    const httpTlGroups = httpTimelineResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const passedPerMinute = httpTlGroups.map(g => ({
      minute: g.dimensions.datetimeMinute,
      requests: g.count,
    }));

    // User agents from HTTP
    const httpUAGroups = httpUAResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const userAgents = httpUAGroups.map(g => ({
      userAgent: g.dimensions.userAgent,
      hits: g.count,
    }));

    // --- Is blocked check ---
    const isBlocked = !!(blockCheckResult?.success && blockCheckResult?.result?.length > 0);

    // --- Computed fields ---
    const passedRequests = totalRequests - totalBlocked;
    const blockRate = totalRequests > 0 ? ((totalBlocked / totalRequests) * 100).toFixed(1) : "0.0";
    const passRate = totalRequests > 0 ? ((passedRequests / totalRequests) * 100).toFixed(1) : "0.0";

    const uniquePaths = new Set([
      ...passedByPath.map(p => p.path),
      ...blockedPaths.map(p => p.path),
    ]).size;
    const uniqueUserAgents = userAgents.length;

    // First/last seen from timelines
    const allMinutes = [
      ...httpTlGroups.map(g => g.dimensions.datetimeMinute),
      ...fwTlGroups.map(g => g.dimensions.datetimeMinute),
    ].filter(Boolean).sort();
    const firstSeen = allMinutes.length > 0 ? allMinutes[0] : null;
    const lastSeen = allMinutes.length > 0 ? allMinutes[allMinutes.length - 1] : null;

    // --- Pattern detection ---
    const topPassedPaths = passedByPath.map(p => ({
      ...p,
      percentage: totalRequests > 0 ? ((p.requests / totalRequests) * 100).toFixed(1) + "%" : "0%",
    }));
    const topUAs = userAgents.slice(0, 10);
    const isConsistentUA = uniqueUserAgents <= 2;
    const commonStatusCodes = Object.entries(byStatusCode)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    // Pattern classification
    let pattern = "NORMAL";
    const has404 = byStatusCode["404"] || 0;
    const has403 = byStatusCode["403"] || 0;
    const hasLogin = passedByPath.some(p => /login|signin|auth|wp-login/i.test(p.path));
    const hasScanning = passedByPath.some(p => /\.env|\.git|wp-admin|phpmyadmin|\.php|xmlrpc/i.test(p.path));

    if (hasScanning || (has404 > totalRequests * 0.5 && uniquePaths > 20)) {
      pattern = "SCANNING";
    } else if (hasLogin && uniquePaths <= 3 && totalRequests > 50) {
      pattern = "BRUTE_FORCE";
    } else if (uniquePaths > 10 && totalRequests > 200 && isConsistentUA) {
      pattern = "SCRAPING";
    }

    const data = {
      ip,
      country,
      asn,
      period: periodLabel,
      overview: {
        totalRequests,
        blockedRequests: totalBlocked,
        passedRequests,
        blockRate: blockRate + "%",
        passRate: passRate + "%",
        uniquePaths,
        uniqueUserAgents,
        firstSeen,
        lastSeen,
      },
      passedTraffic: {
        totalPassed: passedRequests,
        byPath: passedByPath,
        byStatusCode,
        byMethod,
        perMinute: passedPerMinute,
      },
      blockedTraffic: {
        totalBlocked,
        byAction,
        bySource,
        byPath: blockedPaths,
        perMinute: blockedPerMinute,
        recentEvents: recentEvents.slice(0, 50),
      },
      passedPatterns: {
        topPaths: topPassedPaths.slice(0, 20),
        topUserAgents: topUAs,
        isConsistentUA,
        commonStatusCodes,
        pattern,
      },
      userAgents,
      isBlocked,
    };

    return SendResponse(res, "success", `IP lookup for ${ip}`, data);
  } catch (error) {
    console.error("CF ipLookup error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch IP lookup");
  }
};

// --- Helper ---
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ==========================================
// SECURITY RULES — All Cloudflare security rules + blocked request stats
// ==========================================
const securityRules = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // Fetch all security rules and blocked request stats in parallel
    const [
      firewallRulesRes,
      rateLimitsRes,
      rulesetsRes,
      ipAccessRulesRes,
      pageRulesRes,
      eventsByActionRes,
      blockedDetailsRes
    ] = await Promise.all([
      // a) WAF Custom Rules (Firewall Rules)
      cfAPI("GET", `/zones/${zoneId}/firewall/rules`).catch(() => null),

      // b) Rate Limiting Rules
      cfAPI("GET", `/zones/${zoneId}/rate_limits`).catch(() => null),

      // c) WAF Managed Rules (Rulesets)
      cfAPI("GET", `/zones/${zoneId}/rulesets`).catch(() => null),

      // d) IP Access Rules
      cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?per_page=50`).catch(() => null),

      // e) Page Rules
      cfAPI("GET", `/zones/${zoneId}/pagerules`).catch(() => null),

      // f) Blocked requests by rule/action (GraphQL)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                action
                ruleId
                source
              }
            }
          }
        }
      }`).catch(() => null),

      // Blocked by ruleId with clientIP details
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                ruleId
                clientIP
                clientCountryName
                action
                userAgent
              }
            }
          }
        }
      }`).catch(() => null),
    ]);

    // Parse firewall rules
    const firewallRules = (firewallRulesRes?.result || []).map((r) => ({
      id: r.id,
      description: r.description || r.title || "",
      expression: r.filter?.expression || "",
      action: r.action || "",
      enabled: r.paused === false,
      priority: r.priority || null,
    }));

    // Parse rate limit rules
    const rateLimitRules = (rateLimitsRes?.result || []).map((r) => ({
      id: r.id,
      description: r.description || "",
      match: r.match || {},
      threshold: r.threshold || 0,
      period: r.period || 0,
      action: r.action || {},
      enabled: !r.disabled,
    }));

    // Parse WAF rulesets — fetch individual ruleset details for each
    const rulesetsList = rulesetsRes?.result || [];
    const rulesetDetails = await Promise.all(
      rulesetsList.map((rs) =>
        cfAPI("GET", `/zones/${zoneId}/rulesets/${rs.id}`).catch(() => null)
      )
    );

    const wafRulesets = rulesetsList.map((rs, idx) => ({
      id: rs.id,
      name: rs.name || "",
      description: rs.description || "",
      kind: rs.kind || "",
      phase: rs.phase || "",
      rules: rulesetDetails[idx]?.result?.rules || [],
    }));

    // Parse IP access rules
    const ipAccessRules = (ipAccessRulesRes?.result || []).map((r) => ({
      id: r.id,
      mode: r.mode || "",
      ip: r.configuration?.value || "",
      target: r.configuration?.target || "",
      notes: r.notes || "",
      created_on: r.created_on || "",
    }));

    // Parse page rules
    const pageRules = (pageRulesRes?.result || []).map((r) => ({
      id: r.id,
      targets: r.targets || [],
      actions: r.actions || [],
      status: r.status || "",
      priority: r.priority || 0,
    }));

    // Parse GraphQL event stats
    const eventGroups = eventsByActionRes?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const blockedGroups = blockedDetailsRes?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];

    // Aggregate by action
    const actionMap = {};
    eventGroups.forEach((g) => {
      const action = g.dimensions?.action || "unknown";
      actionMap[action] = (actionMap[action] || 0) + g.count;
    });
    const byAction = Object.entries(actionMap).map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    // By rule
    const byRule = eventGroups.map((g) => ({
      ruleId: g.dimensions?.ruleId || "",
      source: g.dimensions?.source || "",
      count: g.count,
    }));

    // Blocked details
    const blockedDetails = blockedGroups.map((g) => ({
      ruleId: g.dimensions?.ruleId || "",
      clientIP: g.dimensions?.clientIP || "",
      country: g.dimensions?.clientCountryName || "",
      action: g.dimensions?.action || "",
      userAgent: g.dimensions?.userAgent || "",
      count: g.count,
    }));

    // Summary
    const totalBlockedByRules = byAction.reduce((sum, a) => sum + a.count, 0);
    const topAction = byAction.length > 0 ? byAction[0].action : "none";
    const topRule = byRule.length > 0 ? byRule[0].ruleId : "none";

    const data = {
      firewallRules,
      rateLimitRules,
      wafRulesets,
      ipAccessRules,
      pageRules,
      ruleStats: {
        byAction,
        byRule,
        blockedDetails,
      },
      summary: {
        totalFirewallRules: firewallRules.length,
        totalRateLimits: rateLimitRules.length,
        totalWafRulesets: wafRulesets.length,
        totalIpAccessRules: ipAccessRules.length,
        totalPageRules: pageRules.length,
        totalBlockedByRules,
        topAction,
        topRule,
      },
    };

    return SendResponse(res, "success", "Security rules fetched", data);
  } catch (error) {
    console.error("CF securityRules error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch security rules");
  }
};

// ==========================================
// GEO ANALYTICS — Country-wise traffic breakdown
// ==========================================
const geoAnalytics = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // Parallel: country traffic + country threats + existing firewall access rules (to check which countries are blocked)
    const [trafficRes, threatRes, accessRulesRes] = await Promise.all([
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientCountryName }
            }
          }
        }
      }`),
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientCountryName action }
            }
          }
        }
      }`),
      cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?mode=block&configuration.target=country&per_page=100`).catch(() => null),
    ]);

    // Parse traffic by country
    const trafficGroups = trafficRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const totalRequests = trafficGroups.reduce((s, g) => s + g.count, 0);

    // Parse threats by country
    const threatGroups = threatRes?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];
    const threatsByCountry = {};
    threatGroups.forEach(g => {
      const c = g.dimensions.clientCountryName || "Unknown";
      if (!threatsByCountry[c]) threatsByCountry[c] = { total: 0, byAction: {} };
      threatsByCountry[c].total += g.count;
      const action = g.dimensions.action || "unknown";
      threatsByCountry[c].byAction[action] = (threatsByCountry[c].byAction[action] || 0) + g.count;
    });

    // Parse blocked countries
    const blockedCountries = {};
    (accessRulesRes?.result || []).forEach(r => {
      if (r.configuration?.target === "country") {
        blockedCountries[r.configuration.value.toUpperCase()] = { id: r.id, notes: r.notes || "" };
      }
    });

    // Build country list
    const countries = trafficGroups.map(g => {
      const name = g.dimensions.clientCountryName || "Unknown";
      const threat = threatsByCountry[name] || { total: 0, byAction: {} };
      return {
        country: name,
        requests: g.count,
        percentage: totalRequests > 0 ? ((g.count / totalRequests) * 100).toFixed(1) : "0",
        threats: threat.total,
        threatActions: threat.byAction,
        isBlocked: !!blockedCountries[name.toUpperCase()] || !!blockedCountries[name],
        blockRuleId: blockedCountries[name.toUpperCase()]?.id || blockedCountries[name]?.id || null,
      };
    });

    return SendResponse(res, "success", "Geo analytics fetched", {
      countries,
      totalRequests,
      totalCountries: countries.length,
      blockedCountries: Object.keys(blockedCountries).length,
    });
  } catch (error) {
    console.error("CF geoAnalytics error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch geo analytics");
  }
};

// ==========================================
// BLOCK COUNTRY — Block or unblock a country
// ==========================================
const blockCountry = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { countryCode, action } = req.body; // action: "block" or "unblock"
    if (!countryCode) return SendResponse(res, "error", "Country code is required");

    if (action === "unblock") {
      // Find and delete the rule
      const findResult = await cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?configuration.target=country&configuration.value=${countryCode}&mode=block`);
      if (!findResult.success || !findResult.result?.length) {
        return SendResponse(res, "error", `Country ${countryCode} is not blocked`);
      }
      const ruleId = findResult.result[0].id;
      const deleteResult = await cfAPI("DELETE", `/zones/${zoneId}/firewall/access_rules/rules/${ruleId}`);
      if (!deleteResult.success) {
        return SendResponse(res, "error", deleteResult.errors?.[0]?.message || "Failed to unblock country");
      }
      return SendResponse(res, "success", `Country ${countryCode} unblocked successfully`, { countryCode });
    } else {
      // Block
      const result = await cfAPI("POST", `/zones/${zoneId}/firewall/access_rules/rules`, {
        mode: "block",
        configuration: { target: "country", value: countryCode.toUpperCase() },
        notes: `Country blocked via admin panel | ${new Date().toISOString()}`,
      });
      if (!result.success) {
        const errMsg = result.errors?.[0]?.message || "Failed to block country";
        if (errMsg.includes("duplicate") || errMsg.includes("already exists")) {
          return SendResponse(res, "error", `Country ${countryCode} is already blocked`);
        }
        return SendResponse(res, "error", errMsg);
      }
      return SendResponse(res, "success", `Country ${countryCode} blocked successfully`, { countryCode, id: result.result?.id });
    }
  } catch (error) {
    console.error("CF blockCountry error:", error);
    return SendResponse(res, "error", error.message || "Failed to process country block");
  }
};

// ==========================================
// TRAFFIC COMPARISON — Compare two time periods
// ==========================================
const trafficComparison = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const mode = req.body.mode || "today_vs_yesterday"; // today_vs_yesterday, this_week_vs_last_week, custom
    let currentSince, currentUntil, previousSince, previousUntil, label;
    const now = new Date();

    if (mode === "today_vs_yesterday") {
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      currentSince = todayStart.toISOString();
      currentUntil = now.toISOString();
      previousSince = yesterdayStart.toISOString();
      previousUntil = todayStart.toISOString();
      label = "Today vs Yesterday";
    } else if (mode === "this_week_vs_last_week") {
      const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      currentSince = weekStart.toISOString();
      currentUntil = now.toISOString();
      previousSince = lastWeekStart.toISOString();
      previousUntil = weekStart.toISOString();
      label = "This Week vs Last Week";
    } else if (mode === "24h_vs_prev_24h") {
      currentSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      currentUntil = now.toISOString();
      previousSince = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      previousUntil = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      label = "Last 24H vs Previous 24H";
    } else {
      // custom
      if (!req.body.currentStart || !req.body.currentEnd || !req.body.previousStart || !req.body.previousEnd) {
        return SendResponse(res, "error", "Custom mode requires currentStart, currentEnd, previousStart, previousEnd");
      }
      currentSince = new Date(req.body.currentStart).toISOString();
      currentUntil = new Date(req.body.currentEnd).toISOString();
      previousSince = new Date(req.body.previousStart).toISOString();
      previousUntil = new Date(req.body.previousEnd).toISOString();
      label = "Custom Comparison";
    }

    // Fetch current and previous period data in parallel
    const buildQuery = (since, until) => `query {
      viewer {
        zones(filter: {zoneTag: "${zoneId}"}) {
          traffic: httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 1
          ) {
            count
            sum { edgeResponseBytes }
          }
          threats: firewallEventsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 1
          ) {
            count
          }
          countries: httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 10
            orderBy: [count_DESC]
          ) {
            count
            dimensions { clientCountryName }
          }
          statusCodes: httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 20
            orderBy: [count_DESC]
          ) {
            count
            dimensions { edgeResponseStatus }
          }
          timeline: httpRequestsAdaptiveGroups(
            filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
            limit: 200
            orderBy: [datetimeFiveMinutes_ASC]
          ) {
            count
            dimensions { datetimeFiveMinutes }
          }
        }
      }
    }`;

    const [currentRes, previousRes] = await Promise.all([
      cfGraphQL(buildQuery(currentSince, currentUntil)),
      cfGraphQL(buildQuery(previousSince, previousUntil)),
    ]);

    const parseResult = (res) => {
      const zone = res?.data?.viewer?.zones?.[0] || {};
      const traffic = zone.traffic || [];
      const threats = zone.threats || [];
      const countries = zone.countries || [];
      const statusCodes = zone.statusCodes || [];
      const timeline = zone.timeline || [];

      const totalRequests = traffic.reduce((s, g) => s + g.count, 0);
      const totalBytes = traffic.reduce((s, g) => s + (g.sum?.edgeResponseBytes || 0), 0);
      const totalThreats = threats.reduce((s, g) => s + g.count, 0);

      const statusMap = {};
      statusCodes.forEach(g => { statusMap[g.dimensions.edgeResponseStatus] = (statusMap[g.dimensions.edgeResponseStatus] || 0) + g.count; });

      return {
        totalRequests,
        totalBytes,
        bandwidth: formatBytes(totalBytes),
        totalThreats,
        topCountries: countries.map(g => ({ country: g.dimensions.clientCountryName || "Unknown", count: g.count })),
        statusCodes: statusMap,
        timeline: timeline.map(g => ({ time: g.dimensions.datetimeFiveMinutes, count: g.count })),
      };
    };

    const current = parseResult(currentRes);
    const previous = parseResult(previousRes);

    const calcChange = (curr, prev) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return parseFloat(((curr - prev) / prev * 100).toFixed(1));
    };

    return SendResponse(res, "success", "Traffic comparison fetched", {
      label,
      mode,
      current: { ...current, period: { from: currentSince, to: currentUntil } },
      previous: { ...previous, period: { from: previousSince, to: previousUntil } },
      changes: {
        requests: calcChange(current.totalRequests, previous.totalRequests),
        bandwidth: calcChange(current.totalBytes, previous.totalBytes),
        threats: calcChange(current.totalThreats, previous.totalThreats),
      },
    });
  } catch (error) {
    console.error("CF trafficComparison error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch traffic comparison");
  }
};

// ==========================================
// CREATE FIREWALL RULE — Create or delete custom firewall rules
// ==========================================
const createFirewallRule = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const { action: reqAction, ruleAction, expression, description, ruleId } = req.body;
    // reqAction: "create" or "delete"

    if (reqAction === "delete") {
      if (!ruleId) return SendResponse(res, "error", "ruleId is required for delete");
      // First get the filter ID for this firewall rule
      const ruleRes = await cfAPI("GET", `/zones/${zoneId}/firewall/rules/${ruleId}`);
      const filterId = ruleRes?.result?.filter?.id;

      const delResult = await cfAPI("DELETE", `/zones/${zoneId}/firewall/rules/${ruleId}`);
      if (!delResult.success) {
        return SendResponse(res, "error", delResult.errors?.[0]?.message || "Failed to delete rule");
      }
      // Also clean up the filter
      if (filterId) {
        await cfAPI("DELETE", `/zones/${zoneId}/filters/${filterId}`).catch(() => null);
      }
      return SendResponse(res, "success", "Firewall rule deleted successfully", { ruleId });
    }

    // Create
    if (!expression) return SendResponse(res, "error", "Expression is required");
    if (!ruleAction) return SendResponse(res, "error", "Rule action is required (block, challenge, js_challenge, allow, log)");

    // First create filter
    const filterRes = await cfAPI("POST", `/zones/${zoneId}/filters`, [{ expression }]);
    if (!filterRes.success || !filterRes.result?.[0]?.id) {
      return SendResponse(res, "error", filterRes.errors?.[0]?.message || "Failed to create filter");
    }
    const filterId = filterRes.result[0].id;

    // Then create firewall rule using that filter
    const ruleRes = await cfAPI("POST", `/zones/${zoneId}/firewall/rules`, [{
      filter: { id: filterId },
      action: ruleAction,
      description: description || `Rule created via admin panel | ${new Date().toISOString()}`,
    }]);

    if (!ruleRes.success) {
      // Cleanup filter if rule creation failed
      await cfAPI("DELETE", `/zones/${zoneId}/filters/${filterId}`).catch(() => null);
      return SendResponse(res, "error", ruleRes.errors?.[0]?.message || "Failed to create firewall rule");
    }

    return SendResponse(res, "success", "Firewall rule created successfully", {
      id: ruleRes.result?.[0]?.id,
      expression,
      action: ruleAction,
      description,
    });
  } catch (error) {
    console.error("CF createFirewallRule error:", error);
    return SendResponse(res, "error", error.message || "Failed to process firewall rule");
  }
};

// ==========================================
// SUSPICIOUS PASSED IPS — 200 status but high requests, looks like attacker
// ==========================================
const suspiciousPassedIPs = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // Parallel queries: top IPs with 200 status, top IPs by total requests, IPs with their paths/UAs, blocked IPs list
    const [successIPsRes, allIPsRes, ipPathsRes, ipUAsRes, ipMethodsRes, blockedListRes] = await Promise.all([
      // IPs getting 200 status (successful requests)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}", edgeResponseStatus: 200}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP clientCountryName }
            }
          }
        }
      }`),
      // All IPs by total requests (to calculate ratio)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 50
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP clientCountryName }
            }
          }
        }
      }`),
      // Top paths per IP (to detect patterns)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}", edgeResponseStatus: 200}
              limit: 200
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP clientRequestPath }
            }
          }
        }
      }`),
      // User agents per IP
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}", edgeResponseStatus: 200}
              limit: 200
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP userAgent }
            }
          }
        }
      }`),
      // Methods per IP
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}", edgeResponseStatus: 200}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientIP clientRequestHTTPMethodName }
            }
          }
        }
      }`),
      // Currently blocked IPs
      cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?mode=block&per_page=100&order=created_on&direction=desc`).catch(() => null),
    ]);

    // Parse success IPs
    const successGroups = successIPsRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const allGroups = allIPsRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const pathGroups = ipPathsRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const uaGroups = ipUAsRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const methodGroups = ipMethodsRes?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

    // Build total requests map
    const totalReqMap = {};
    allGroups.forEach(g => { totalReqMap[g.dimensions.clientIP] = (totalReqMap[g.dimensions.clientIP] || 0) + g.count; });

    // Build paths map per IP
    const pathsMap = {};
    pathGroups.forEach(g => {
      const ip = g.dimensions.clientIP;
      if (!pathsMap[ip]) pathsMap[ip] = [];
      pathsMap[ip].push({ path: g.dimensions.clientRequestPath || "/", count: g.count });
    });

    // Build UA map per IP
    const uaMap = {};
    uaGroups.forEach(g => {
      const ip = g.dimensions.clientIP;
      if (!uaMap[ip]) uaMap[ip] = [];
      const existing = uaMap[ip].find(u => u.userAgent === (g.dimensions.userAgent || ""));
      if (existing) existing.count += g.count;
      else uaMap[ip].push({ userAgent: g.dimensions.userAgent || "", count: g.count });
    });

    // Build methods map per IP
    const methodMap = {};
    methodGroups.forEach(g => {
      const ip = g.dimensions.clientIP;
      if (!methodMap[ip]) methodMap[ip] = {};
      const m = g.dimensions.clientRequestHTTPMethodName || "GET";
      methodMap[ip][m] = (methodMap[ip][m] || 0) + g.count;
    });

    // Blocked IPs set
    const blockedSet = new Set();
    (blockedListRes?.result || []).forEach(r => {
      if (r.configuration?.value) blockedSet.add(r.configuration.value);
    });

    // Build IP profiles and calculate suspicion score
    const totalTraffic = allGroups.reduce((s, g) => s + g.count, 0);

    const ipProfiles = successGroups.map(g => {
      const ip = g.dimensions.clientIP;
      const country = g.dimensions.clientCountryName || "Unknown";
      const successCount = g.count;
      const totalCount = totalReqMap[ip] || successCount;
      const paths = (pathsMap[ip] || []).sort((a, b) => b.count - a.count);
      const userAgents = (uaMap[ip] || []).sort((a, b) => b.count - a.count);
      const methods = methodMap[ip] || {};
      const isBlocked = blockedSet.has(ip);

      // Calculate suspicion indicators
      const uniquePaths = paths.length;
      const uniqueUAs = userAgents.length;
      const trafficShare = totalTraffic > 0 ? ((totalCount / totalTraffic) * 100) : 0;
      const topUA = userAgents[0]?.userAgent || "";
      const isEmptyUA = topUA === "" || topUA === "Unknown";
      const isBotUA = /bot|crawl|spider|python|curl|wget|go-http|java|axios|node-fetch|scrape|phantom|headless|selenium/i.test(topUA);
      const hasLoginPaths = paths.some(p => /login|signin|auth|wp-login|admin/i.test(p.path));
      const hasScanPaths = paths.some(p => /\.env|\.git|wp-admin|phpmyadmin|\.php|xmlrpc|\.bak|\.sql/i.test(p.path));
      const postHeavy = (methods["POST"] || 0) > (methods["GET"] || 0);
      const highRate = successCount > 500;
      const veryHighRate = successCount > 2000;
      const fewPaths = uniquePaths <= 3 && successCount > 100;
      const consistentUA = uniqueUAs <= 2 && successCount > 100;

      // Suspicion score (0-100)
      let score = 0;
      if (veryHighRate) score += 30;
      else if (highRate) score += 15;
      if (trafficShare > 10) score += 15;
      else if (trafficShare > 5) score += 8;
      if (isEmptyUA) score += 20;
      if (isBotUA) score += 15;
      if (hasScanPaths) score += 20;
      if (hasLoginPaths) score += 10;
      if (postHeavy) score += 10;
      if (fewPaths) score += 10;
      if (consistentUA) score += 8;

      // Determine threat level
      let threatLevel = "low";
      if (score >= 60) threatLevel = "critical";
      else if (score >= 40) threatLevel = "high";
      else if (score >= 20) threatLevel = "medium";

      // Determine pattern
      let pattern = "NORMAL";
      if (hasScanPaths) pattern = "SCANNING";
      else if (hasLoginPaths && fewPaths) pattern = "BRUTE_FORCE";
      else if (isBotUA || isEmptyUA) pattern = "BOT";
      else if (consistentUA && uniquePaths > 10) pattern = "SCRAPING";
      else if (veryHighRate) pattern = "FLOOD";
      else if (highRate) pattern = "HIGH_RATE";

      // Flags
      const flags = [];
      if (veryHighRate) flags.push("Very High Requests");
      else if (highRate) flags.push("High Requests");
      if (isEmptyUA) flags.push("Empty User-Agent");
      if (isBotUA) flags.push("Bot User-Agent");
      if (hasScanPaths) flags.push("Scanning Paths");
      if (hasLoginPaths) flags.push("Login Targeting");
      if (postHeavy) flags.push("POST Heavy");
      if (fewPaths) flags.push("Few Unique Paths");
      if (consistentUA) flags.push("Single UA Pattern");
      if (trafficShare > 5) flags.push(`${trafficShare.toFixed(1)}% Traffic Share`);

      return {
        ip,
        country,
        successCount,
        totalCount,
        trafficShare: trafficShare.toFixed(1),
        suspicionScore: Math.min(score, 100),
        threatLevel,
        pattern,
        flags,
        isBlocked,
        topPaths: paths.slice(0, 5),
        topUA: topUA,
        uniqueUAs,
        uniquePaths,
        methods,
      };
    });

    // Sort by suspicion score, filter out low ones with few requests
    const suspicious = ipProfiles
      .filter(ip => ip.suspicionScore >= 15 || ip.successCount > 200)
      .sort((a, b) => b.suspicionScore - a.suspicionScore);

    return SendResponse(res, "success", "Suspicious passed IPs fetched", {
      suspiciousIPs: suspicious,
      totalAnalyzed: ipProfiles.length,
      totalSuspicious: suspicious.filter(ip => ip.suspicionScore >= 40).length,
      totalHighRate: suspicious.filter(ip => ip.successCount > 500).length,
      period: { since, until },
    });
  } catch (error) {
    console.error("CF suspiciousPassedIPs error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch suspicious IPs");
  }
};

// ==========================================
// BROWSER ANALYTICS — User Agent wise detailed analysis with suspicion tracking
// ==========================================
const browserAnalytics = async (req, res) => {
  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    if (!zoneId) return SendResponse(res, "error", "CLOUDFLARE_ZONE_ID not set in .env");

    const hours = req.body.hours || 24;
    const { startDate, endDate } = req.body;
    const since = startDate ? new Date(startDate).toISOString() : new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const until = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    const [uaResult, uaIPResult, uaPathResult, uaStatusResult, fwUAResult, blockedListRes] = await Promise.all([
      // Top user agents by total requests
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 100
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent }
            }
          }
        }
      }`),
      // User agents with IPs (to know which IPs use which UA)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 500
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent clientIP clientCountryName }
            }
          }
        }
      }`),
      // User agents with paths (to detect scraping patterns)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 300
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent clientRequestPath }
            }
          }
        }
      }`),
      // User agents with status codes
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            httpRequestsAdaptiveGroups(
              filter: {datetime_gt: "${since}", datetime_lt: "${until}"}
              limit: 300
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent edgeResponseStatus }
            }
          }
        }
      }`),
      // Firewall events by user agent (blocked/challenged)
      cfGraphQL(`query {
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}"}
              limit: 200
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgent action clientIP }
            }
          }
        }
      }`),
      // Currently blocked IPs
      cfAPI("GET", `/zones/${zoneId}/firewall/access_rules/rules?mode=block&per_page=100&order=created_on&direction=desc`).catch(() => null),
    ]);

    const uaGroups = uaResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const uaIPGroups = uaIPResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const uaPathGroups = uaPathResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const uaStatusGroups = uaStatusResult?.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
    const fwUAGroups = fwUAResult?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups || [];

    // Blocked IPs set
    const blockedSet = new Set();
    (blockedListRes?.result || []).forEach(r => {
      if (r.configuration?.value) blockedSet.add(r.configuration.value);
    });

    const totalTraffic = uaGroups.reduce((s, g) => s + g.count, 0);

    // Build IP map per UA
    const uaIPMap = {};
    uaIPGroups.forEach(g => {
      const ua = g.dimensions.userAgent || "";
      if (!uaIPMap[ua]) uaIPMap[ua] = {};
      const ip = g.dimensions.clientIP;
      const country = g.dimensions.clientCountryName || "Unknown";
      if (!uaIPMap[ua][ip]) uaIPMap[ua][ip] = { ip, country, count: 0, isBlocked: blockedSet.has(ip) };
      uaIPMap[ua][ip].count += g.count;
    });

    // Build paths map per UA
    const uaPathMap = {};
    uaPathGroups.forEach(g => {
      const ua = g.dimensions.userAgent || "";
      if (!uaPathMap[ua]) uaPathMap[ua] = {};
      const path = g.dimensions.clientRequestPath || "/";
      uaPathMap[ua][path] = (uaPathMap[ua][path] || 0) + g.count;
    });

    // Build status map per UA
    const uaStatusMap = {};
    uaStatusGroups.forEach(g => {
      const ua = g.dimensions.userAgent || "";
      if (!uaStatusMap[ua]) uaStatusMap[ua] = {};
      const status = g.dimensions.edgeResponseStatus || "unknown";
      uaStatusMap[ua][status] = (uaStatusMap[ua][status] || 0) + g.count;
    });

    // Build firewall events per UA
    const uaFWMap = {};
    fwUAGroups.forEach(g => {
      const ua = g.dimensions.userAgent || "";
      if (!uaFWMap[ua]) uaFWMap[ua] = { totalBlocked: 0, actions: {}, blockedIPs: new Set() };
      uaFWMap[ua].totalBlocked += g.count;
      const action = g.dimensions.action || "unknown";
      uaFWMap[ua].actions[action] = (uaFWMap[ua].actions[action] || 0) + g.count;
      if (g.dimensions.clientIP) uaFWMap[ua].blockedIPs.add(g.dimensions.clientIP);
    });

    // Build browser profiles
    const browsers = uaGroups.map(g => {
      const ua = g.dimensions.userAgent || "";
      const totalRequests = g.count;
      const trafficShare = totalTraffic > 0 ? ((totalRequests / totalTraffic) * 100) : 0;

      // IPs using this UA
      const ipsObj = uaIPMap[ua] || {};
      const ips = Object.values(ipsObj).sort((a, b) => b.count - a.count);
      const uniqueIPs = ips.length;
      const blockedIPCount = ips.filter(ip => ip.isBlocked).length;
      const unblockedIPs = ips.filter(ip => !ip.isBlocked);

      // Paths
      const pathsObj = uaPathMap[ua] || {};
      const paths = Object.entries(pathsObj).sort((a, b) => b[1] - a[1]).map(([path, count]) => ({ path, count }));
      const uniquePaths = paths.length;

      // Status codes
      const statusObj = uaStatusMap[ua] || {};
      const statusCodes = Object.entries(statusObj).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }));
      const successRate = statusObj[200] ? ((statusObj[200] / totalRequests) * 100) : 0;
      const errorRate = Object.entries(statusObj).filter(([c]) => parseInt(c) >= 400).reduce((s, [, c]) => s + c, 0) / totalRequests * 100;

      // Firewall record
      const fwData = uaFWMap[ua] || { totalBlocked: 0, actions: {}, blockedIPs: new Set() };

      // Parse browser name
      let browserName = "Unknown";
      let browserType = "unknown";
      if (!ua || ua.trim() === "") { browserName = "(Empty User-Agent)"; browserType = "suspicious"; }
      else if (/chrome/i.test(ua) && !/edge|opr|opera/i.test(ua)) { browserName = "Chrome"; browserType = "browser"; }
      else if (/firefox/i.test(ua)) { browserName = "Firefox"; browserType = "browser"; }
      else if (/safari/i.test(ua) && !/chrome/i.test(ua)) { browserName = "Safari"; browserType = "browser"; }
      else if (/edg/i.test(ua)) { browserName = "Edge"; browserType = "browser"; }
      else if (/opr|opera/i.test(ua)) { browserName = "Opera"; browserType = "browser"; }
      else if (/bot|crawl|spider/i.test(ua)) { browserName = ua.match(/([\w-]*bot[\w-]*|[\w-]*crawl[\w-]*|[\w-]*spider[\w-]*)/i)?.[1] || "Bot"; browserType = "bot"; }
      else if (/python|requests|urllib/i.test(ua)) { browserName = "Python"; browserType = "tool"; }
      else if (/curl/i.test(ua)) { browserName = "cURL"; browserType = "tool"; }
      else if (/wget/i.test(ua)) { browserName = "Wget"; browserType = "tool"; }
      else if (/go-http|golang/i.test(ua)) { browserName = "Go HTTP"; browserType = "tool"; }
      else if (/java|okhttp/i.test(ua)) { browserName = "Java"; browserType = "tool"; }
      else if (/axios|node-fetch|node\.js/i.test(ua)) { browserName = "Node.js"; browserType = "tool"; }
      else if (/phantom|headless|selenium|puppeteer|playwright/i.test(ua)) { browserName = "Headless Browser"; browserType = "automation"; }
      else if (/postman/i.test(ua)) { browserName = "Postman"; browserType = "tool"; }
      else if (/insomnia/i.test(ua)) { browserName = "Insomnia"; browserType = "tool"; }
      else { browserName = ua.substring(0, 40); browserType = "other"; }

      // Extract version
      let browserVersion = "";
      const versionMatch = ua.match(/(?:Chrome|Firefox|Safari|Edg|OPR|Opera)\/([\d.]+)/i);
      if (versionMatch) browserVersion = versionMatch[1];

      // Suspicion score
      let suspicionScore = 0;
      const flags = [];

      // Empty or no UA
      if (!ua || ua.trim() === "") { suspicionScore += 25; flags.push("Empty User-Agent"); }

      // Known bot/tool/automation
      if (browserType === "bot") { suspicionScore += 15; flags.push("Bot User-Agent"); }
      if (browserType === "tool") { suspicionScore += 20; flags.push("CLI/Script Tool"); }
      if (browserType === "automation") { suspicionScore += 30; flags.push("Headless/Automation"); }

      // High request volume from single UA
      if (totalRequests > 5000) { suspicionScore += 20; flags.push("Very High Volume"); }
      else if (totalRequests > 1000) { suspicionScore += 10; flags.push("High Volume"); }

      // Traffic share
      if (trafficShare > 20) { suspicionScore += 15; flags.push(`${trafficShare.toFixed(1)}% Traffic`); }
      else if (trafficShare > 10) { suspicionScore += 8; flags.push(`${trafficShare.toFixed(1)}% Traffic`); }

      // Few IPs = likely automated
      if (uniqueIPs === 1 && totalRequests > 200) { suspicionScore += 15; flags.push("Single IP"); }
      else if (uniqueIPs <= 3 && totalRequests > 500) { suspicionScore += 10; flags.push("Very Few IPs"); }

      // Many unique paths = scraping
      if (uniquePaths > 50) { suspicionScore += 15; flags.push("Many Paths (Scraping)"); }
      else if (uniquePaths > 20 && uniqueIPs <= 3) { suspicionScore += 10; flags.push("Path Crawling"); }

      // Few paths with high volume = targeted
      if (uniquePaths <= 3 && totalRequests > 500) { suspicionScore += 10; flags.push("Targeted Paths"); }

      // Scan paths
      const hasScanPaths = paths.some(p => /\.env|\.git|wp-admin|phpmyadmin|\.php|xmlrpc|\.bak|\.sql/i.test(p.path));
      if (hasScanPaths) { suspicionScore += 20; flags.push("Scanning Paths"); }

      // Login targeting
      const hasLoginPaths = paths.some(p => /login|signin|auth|wp-login|admin/i.test(p.path));
      if (hasLoginPaths && uniquePaths <= 5) { suspicionScore += 10; flags.push("Login Targeting"); }

      // High error rate
      if (errorRate > 50) { suspicionScore += 15; flags.push("High Error Rate"); }
      else if (errorRate > 20) { suspicionScore += 8; flags.push("Elevated Errors"); }

      // Already has firewall hits
      if (fwData.totalBlocked > 0) { suspicionScore += 10; flags.push(`${fwData.totalBlocked} Blocked Requests`); }

      suspicionScore = Math.min(suspicionScore, 100);

      let threatLevel = "safe";
      if (suspicionScore >= 60) threatLevel = "critical";
      else if (suspicionScore >= 40) threatLevel = "suspicious";
      else if (suspicionScore >= 20) threatLevel = "warning";

      return {
        userAgent: ua,
        browserName,
        browserVersion,
        browserType,
        totalRequests,
        trafficShare: parseFloat(trafficShare.toFixed(1)),
        uniqueIPs,
        uniquePaths,
        successRate: parseFloat(successRate.toFixed(1)),
        errorRate: parseFloat(errorRate.toFixed(1)),
        suspicionScore,
        threatLevel,
        flags,
        ips: ips.slice(0, 20),
        blockedIPCount,
        unblockedIPs: unblockedIPs.slice(0, 20),
        topPaths: paths.slice(0, 10),
        statusCodes: statusCodes.slice(0, 10),
        firewallRecord: {
          totalBlocked: fwData.totalBlocked,
          actions: fwData.actions,
          blockedIPCount: fwData.blockedIPs.size,
        },
      };
    });

    // Sort by suspicion score
    browsers.sort((a, b) => b.suspicionScore - a.suspicionScore);

    const data = {
      browsers,
      totalBrowsers: browsers.length,
      totalTraffic,
      suspiciousBrowsers: browsers.filter(b => b.suspicionScore >= 40).length,
      botBrowsers: browsers.filter(b => b.browserType === "bot" || b.browserType === "tool" || b.browserType === "automation").length,
      period: { since, until },
    };

    return SendResponse(res, "success", "Browser analytics fetched", data);
  } catch (error) {
    console.error("CF browserAnalytics error:", error);
    return SendResponse(res, "error", error.message || "Failed to fetch browser analytics");
  }
};

module.exports = {
  zoneOverview,
  trafficAnalytics,
  blockedIPsList,
  blockIP,
  unblockIP,
  firewallEvents,
  topAttackers,
  requestsPerMinute,
  topIPs,
  threatAnalytics,
  fullDashboard,
  dnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  getSecurityLevel,
  setSecurityLevel,
  toggleUnderAttack,
  liveAttackers,
  attackerProfile,
  liveTrafficSnapshot,
  attackerBehaviorReport,
  ipLookup,
  securityRules,
  geoAnalytics,
  blockCountry,
  trafficComparison,
  createFirewallRule,
  suspiciousPassedIPs,
  browserAnalytics,
};
