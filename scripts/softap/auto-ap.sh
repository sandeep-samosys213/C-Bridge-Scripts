#!/bin/bash
# ============================================================
# C-Bridge Auto AP Mode Controller
# Automatically switches to AP mode when:
#   - No WiFi is configured
#   - WiFi client mode disconnects
#   - WiFi is connected but loses internet/router connectivity
# 
# This ensures users can always access the device via SoftAP
# (http://192.168.4.1:8080) to reconfigure WiFi when needed.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOFTAP_SCRIPT="${SCRIPT_DIR}/setup-softap.sh"
WIFI_SETUP_SERVER="/home/cbridge/C-Bridge-Production/scripts/softap/wifi-setup-server.js"
LOG_FILE="/var/log/cbridge-auto-ap.log"
STATE_FILE="/var/lib/cbridge/wifi-configured"
CHECK_INTERVAL=30  # seconds

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if WiFi is connected to a network
is_wifi_connected() {
    local SSID=$(iwgetid -r 2>/dev/null)
    if [ -n "$SSID" ] && [ "$SSID" != "CBridge-Setup" ]; then
        return 0  # Connected to a real network (not our own AP)
    fi
    return 1  # Not connected
}

# Get gateway/router IP
get_gateway_ip() {
    ip route | grep default | awk '{print $3}' | head -1
}

# Check if we have internet connectivity
# First checks router/gateway IP connectivity, then internet (8.8.8.8)
# Returns 0 if both gateway and internet are reachable, 1 otherwise
has_internet() {
    local GATEWAY=$(get_gateway_ip)
    
    # First check gateway/router connectivity (router IP configured in network-config)
    if [ -n "$GATEWAY" ]; then
        if ping -c 1 -W 2 "$GATEWAY" &>/dev/null; then
            # Gateway/router is reachable, now check internet
            if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
                return 0  # Both gateway and internet are reachable
            else
                log "Gateway/router ($GATEWAY) reachable but no internet connectivity"
                return 1  # Gateway OK but no internet
            fi
        else
            log "Gateway/router ($GATEWAY) not reachable"
            return 1  # Gateway/router not reachable - will trigger SoftAP
        fi
    else
        # No gateway configured, try direct internet check
        if ping -c 1 -W 3 8.8.8.8 &>/dev/null; then
            return 0
        else
            log "No gateway configured and no internet connectivity"
            return 1
        fi
    fi
}

# Check if WiFi credentials are configured
has_wifi_config() {
    # Check wpa_supplicant for networks
    if grep -q 'ssid=' /etc/wpa_supplicant/wpa_supplicant.conf 2>/dev/null; then
        return 0
    fi
    
    # Check NetworkManager connections
    if nmcli connection show 2>/dev/null | grep -q wifi; then
        return 0
    fi
    
    # Check our state file
    if [ -f "$STATE_FILE" ]; then
        return 0
    fi
    
    return 1
}

# Start AP mode with setup server
start_setup_mode() {
    log "Starting Setup Mode (Soft AP)..."
    
    # Start the Soft AP
    sudo "$SOFTAP_SCRIPT" start
    
    # Start the WiFi setup web server
    if [ -f "$WIFI_SETUP_SERVER" ]; then
        log "Starting WiFi Setup Web Server..."
        cd "$(dirname "$WIFI_SETUP_SERVER")"
        node "$WIFI_SETUP_SERVER" &
        echo $! > /var/run/cbridge-wifi-setup.pid
        log "WiFi Setup Server running on http://192.168.4.1:8080"
    else
        log "Warning: WiFi Setup Server not found at $WIFI_SETUP_SERVER"
    fi
}

# Stop AP mode
stop_setup_mode() {
    log "Stopping Setup Mode..."
    
    # Stop the WiFi setup web server
    if [ -f /var/run/cbridge-wifi-setup.pid ]; then
        kill $(cat /var/run/cbridge-wifi-setup.pid) 2>/dev/null
        rm /var/run/cbridge-wifi-setup.pid
    fi
    
    # Stop the Soft AP
    sudo "$SOFTAP_SCRIPT" stop
}

# Main auto-AP logic
run_auto_ap() {
    log "C-Bridge Auto AP Controller started"
    
    while true; do
        if is_wifi_connected && has_internet; then
            # WiFi is connected AND has internet/router connectivity - mark as configured
            mkdir -p "$(dirname "$STATE_FILE")"
            touch "$STATE_FILE"
            
            # Make sure AP mode is off
            if systemctl is-active --quiet hostapd; then
                log "WiFi connected with internet, stopping AP mode..."
                stop_setup_mode
            fi
            
        elif is_wifi_connected && ! has_internet; then
            # WiFi connected but no internet/router connectivity - start AP mode for reconfiguration
            log "WiFi connected but no internet/router connectivity detected, starting AP mode..."
            if ! systemctl is-active --quiet hostapd; then
                start_setup_mode
            fi
            
        elif has_wifi_config; then
            # WiFi config exists but not connected - try to reconnect
            log "WiFi not connected but config exists, attempting to reconnect..."
            nmcli device connect wlan0 2>/dev/null || true
            sleep 10
            
            # If still not connected after attempt, start AP mode
            if ! is_wifi_connected; then
                log "Failed to reconnect, starting AP mode..."
                if ! systemctl is-active --quiet hostapd; then
                    start_setup_mode
                fi
            elif ! has_internet; then
                # Connected but no internet - start AP mode
                log "Connected but no internet, starting AP mode..."
                if ! systemctl is-active --quiet hostapd; then
                    start_setup_mode
                fi
            fi
            
        else
            # No WiFi config - start AP mode for setup
            if ! systemctl is-active --quiet hostapd; then
                log "No WiFi configuration found, starting Setup Mode..."
                start_setup_mode
            fi
        fi
        
        sleep $CHECK_INTERVAL
    done
}

# Single check mode (for systemd or manual use)
check_once() {
    if is_wifi_connected && has_internet; then
        echo "WiFi: Connected ($(iwgetid -r)) with internet"
        exit 0
    elif is_wifi_connected && ! has_internet; then
        echo "WiFi: Connected but no internet/router connectivity"
        if ! systemctl is-active --quiet hostapd; then
            start_setup_mode
        fi
        exit 1
    elif has_wifi_config; then
        echo "WiFi: Configured but disconnected"
        if ! systemctl is-active --quiet hostapd; then
            start_setup_mode
        fi
        exit 1
    else
        echo "WiFi: Not configured (Setup mode needed)"
        if ! systemctl is-active --quiet hostapd; then
            start_setup_mode
        fi
        exit 2
    fi
}

# Main
case "${1:-run}" in
    run)
        run_auto_ap
        ;;
    check)
        check_once
        ;;
    start-ap)
        start_setup_mode
        ;;
    stop-ap)
        stop_setup_mode
        ;;
    *)
        echo "Usage: $0 {run|check|start-ap|stop-ap}"
        echo ""
        echo "Commands:"
        echo "  run       - Run continuous auto-AP controller (default)"
        echo "  check     - Single check and start AP if needed"
        echo "  start-ap  - Force start AP mode"
        echo "  stop-ap   - Force stop AP mode"
        exit 1
        ;;
esac

