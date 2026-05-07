#!/bin/bash
#
# Nginx IP Blocker Script
#
# Syncs blocked IPs from the Node.js DDoS protection middleware to nginx.
# This ensures malicious IPs are blocked at the nginx level BEFORE reaching Node.js.
#
# Setup:
#   1. chmod +x scripts/nginx-ip-blocker.sh
#   2. Add to crontab (runs every 30 seconds):
#      * * * * * /path/to/api/scripts/nginx-ip-blocker.sh
#      * * * * * sleep 30 && /path/to/api/scripts/nginx-ip-blocker.sh
#
# Configuration:
#   - BLOCKED_IPS_SOURCE: JSON file written by Node.js ddosProtection middleware
#   - NGINX_BLOCK_CONF: nginx config file with deny directives
#   - NGINX_RELOAD: command to reload nginx
#

set -euo pipefail

# --- Configuration ---
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BLOCKED_IPS_SOURCE="${APP_DIR}/errorLog/nginx-blocked-ips.conf"
NGINX_BLOCK_CONF="/etc/nginx/conf.d/blocked-ips.conf"
NGINX_LOG="/var/log/nginx/access.log"
LOG_FILE="${APP_DIR}/errorLog/nginx-blocker.log"
MANUAL_BLOCK_FILE="${APP_DIR}/errorLog/manual-blocked-ips.txt"

# Rate limit thresholds for nginx log analysis
RATE_THRESHOLD=100  # requests per minute from single IP triggers block
BLOCK_DURATION=3600 # seconds to block (1 hour)

# --- Functions ---

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Merge blocked IPs from Node.js app with any manual blocks
merge_blocked_ips() {
    local temp_file
    temp_file=$(mktemp)

    # Start with IPs from Node.js app
    if [ -f "$BLOCKED_IPS_SOURCE" ]; then
        cat "$BLOCKED_IPS_SOURCE" >> "$temp_file"
    fi

    # Add manually blocked IPs
    if [ -f "$MANUAL_BLOCK_FILE" ]; then
        while IFS= read -r ip; do
            ip=$(echo "$ip" | tr -d '[:space:]')
            if [[ -n "$ip" && ! "$ip" =~ ^# ]]; then
                echo "deny ${ip};" >> "$temp_file"
            fi
        done < "$MANUAL_BLOCK_FILE"
    fi

    # Remove duplicates
    sort -u "$temp_file" > "${temp_file}.sorted"
    mv "${temp_file}.sorted" "$temp_file"

    echo "$temp_file"
}

# Analyze nginx access logs for high-rate IPs
analyze_nginx_logs() {
    if [ ! -f "$NGINX_LOG" ]; then
        return
    fi

    local temp_ips
    temp_ips=$(mktemp)

    # Find IPs with more than RATE_THRESHOLD requests in the last minute
    # Uses awk to filter by timestamp and count per IP
    local one_minute_ago
    one_minute_ago=$(date -d '1 minute ago' '+%d/%b/%Y:%H:%M' 2>/dev/null || date -v-1M '+%d/%b/%Y:%H:%M' 2>/dev/null || echo "")

    if [ -n "$one_minute_ago" ]; then
        awk -v threshold="$RATE_THRESHOLD" -v timeprefix="$one_minute_ago" '
            $4 ~ timeprefix {
                ips[$1]++
            }
            END {
                for (ip in ips) {
                    if (ips[ip] > threshold) {
                        print ip
                    }
                }
            }
        ' "$NGINX_LOG" > "$temp_ips" 2>/dev/null || true
    fi

    # Add high-rate IPs to manual block list
    if [ -s "$temp_ips" ]; then
        while IFS= read -r ip; do
            if ! grep -q "^${ip}$" "$MANUAL_BLOCK_FILE" 2>/dev/null; then
                echo "$ip" >> "$MANUAL_BLOCK_FILE"
                log "AUTO-BLOCKED from nginx logs: ${ip} (exceeded ${RATE_THRESHOLD} req/min)"
            fi
        done < "$temp_ips"
    fi

    rm -f "$temp_ips"
}

# Apply blocked IPs to nginx
apply_to_nginx() {
    local merged_file
    merged_file=$(merge_blocked_ips)

    # Check if nginx conf directory exists
    local nginx_conf_dir
    nginx_conf_dir=$(dirname "$NGINX_BLOCK_CONF")
    if [ ! -d "$nginx_conf_dir" ]; then
        log "Nginx conf directory not found: ${nginx_conf_dir}. Skipping nginx update."
        rm -f "$merged_file"
        return
    fi

    # Only update if content changed
    if [ -f "$NGINX_BLOCK_CONF" ] && diff -q "$merged_file" "$NGINX_BLOCK_CONF" > /dev/null 2>&1; then
        rm -f "$merged_file"
        return
    fi

    # Count IPs
    local ip_count
    ip_count=$(grep -c "deny " "$merged_file" 2>/dev/null || echo "0")

    # Copy to nginx
    cp "$merged_file" "$NGINX_BLOCK_CONF"
    rm -f "$merged_file"

    # Test nginx config before reloading
    if nginx -t 2>/dev/null; then
        nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
        log "Nginx reloaded with ${ip_count} blocked IPs"
    else
        log "ERROR: nginx config test failed! Reverting..."
        echo "# Auto-generated - cleared due to config error" > "$NGINX_BLOCK_CONF"
        nginx -s reload 2>/dev/null || true
    fi
}

# --- CLI Commands ---

case "${1:-sync}" in
    sync)
        # Default: sync blocked IPs to nginx
        analyze_nginx_logs
        apply_to_nginx
        ;;
    block)
        # Manually block an IP: ./nginx-ip-blocker.sh block 1.2.3.4
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 block <ip-address>"
            exit 1
        fi
        touch "$MANUAL_BLOCK_FILE"
        if ! grep -q "^${2}$" "$MANUAL_BLOCK_FILE" 2>/dev/null; then
            echo "$2" >> "$MANUAL_BLOCK_FILE"
            log "Manually blocked IP: ${2}"
            apply_to_nginx
            echo "Blocked: ${2}"
        else
            echo "Already blocked: ${2}"
        fi
        ;;
    unblock)
        # Unblock an IP: ./nginx-ip-blocker.sh unblock 1.2.3.4
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 unblock <ip-address>"
            exit 1
        fi
        if [ -f "$MANUAL_BLOCK_FILE" ]; then
            sed -i.bak "/^${2}$/d" "$MANUAL_BLOCK_FILE" 2>/dev/null || \
            sed -i '' "/^${2}$/d" "$MANUAL_BLOCK_FILE" 2>/dev/null || true
            rm -f "${MANUAL_BLOCK_FILE}.bak"
            log "Unblocked IP: ${2}"
            apply_to_nginx
            echo "Unblocked: ${2}"
        fi
        ;;
    list)
        # List all blocked IPs
        echo "=== Blocked IPs ==="
        if [ -f "$NGINX_BLOCK_CONF" ]; then
            grep "deny " "$NGINX_BLOCK_CONF" | sed 's/deny //;s/;//' | sort
        else
            echo "(none)"
        fi
        echo ""
        echo "=== Manual Blocks ==="
        if [ -f "$MANUAL_BLOCK_FILE" ]; then
            cat "$MANUAL_BLOCK_FILE"
        else
            echo "(none)"
        fi
        ;;
    status)
        # Show current status
        echo "=== Nginx IP Blocker Status ==="
        local count=0
        if [ -f "$NGINX_BLOCK_CONF" ]; then
            count=$(grep -c "deny " "$NGINX_BLOCK_CONF" 2>/dev/null || echo "0")
        fi
        echo "Blocked IPs in nginx: ${count}"
        echo "Source file: ${BLOCKED_IPS_SOURCE}"
        echo "Nginx conf: ${NGINX_BLOCK_CONF}"
        echo "Manual blocks: ${MANUAL_BLOCK_FILE}"
        echo "Log file: ${LOG_FILE}"
        ;;
    *)
        echo "Usage: $0 {sync|block <ip>|unblock <ip>|list|status}"
        exit 1
        ;;
esac
