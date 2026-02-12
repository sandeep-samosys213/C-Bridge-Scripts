#!/bin/bash
# ============================================================
# C-Bridge Soft AP Setup Script
# Creates a WiFi access point for initial device configuration
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/cbridge-softap.log"

# AP Configuration
AP_SSID="${AP_SSID:-CBridge-Setup}"
AP_PASSWORD="${AP_PASSWORD:-cbridge123}"
AP_CHANNEL="${AP_CHANNEL:-6}"
AP_IP="192.168.4.1"
AP_SUBNET="192.168.4.0/24"
AP_DHCP_START="192.168.4.10"
AP_DHCP_END="192.168.4.50"
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (sudo)"
        exit 1
    fi
}

# Install required packages
install_dependencies() {
    log "Installing required packages..."
    
    apt-get update -qq
    
    # Install hostapd if not present
    if ! command -v hostapd &> /dev/null; then
        log "Installing hostapd..."
        apt-get install -y hostapd
    else
        log_success "hostapd already installed"
    fi
    
    # Install dnsmasq if not present
    if ! command -v dnsmasq &> /dev/null; then
        log "Installing dnsmasq..."
        apt-get install -y dnsmasq
    else
        log_success "dnsmasq already installed"
    fi
    
    # Ensure they're stopped initially
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    
    # Unmask hostapd (Raspberry Pi OS masks it by default)
    systemctl unmask hostapd 2>/dev/null || true
    
    log_success "Dependencies installed"
}

# Create hostapd configuration
create_hostapd_config() {
    log "Creating hostapd configuration..."
    
    cat > /etc/hostapd/hostapd.conf << EOF
# C-Bridge Soft AP Configuration
interface=${WIFI_INTERFACE}
driver=nl80211
ssid=${AP_SSID}
hw_mode=g
channel=${AP_CHANNEL}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${AP_PASSWORD}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
# Country code (adjust as needed)
country_code=US
EOF

    # Point hostapd to config file
    sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd 2>/dev/null || true
    
    log_success "hostapd configuration created"
}

# Create dnsmasq configuration for AP
create_dnsmasq_config() {
    log "Creating dnsmasq configuration..."
    
    # Backup original config if exists
    [ -f /etc/dnsmasq.conf ] && cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
    
    # Create AP-specific dnsmasq config
    cat > /etc/dnsmasq.d/cbridge-ap.conf << EOF
# C-Bridge Soft AP DHCP Configuration
interface=${WIFI_INTERFACE}
bind-interfaces
server=8.8.8.8
domain-needed
bogus-priv
dhcp-range=${AP_DHCP_START},${AP_DHCP_END},255.255.255.0,12h
dhcp-option=option:router,${AP_IP}
dhcp-option=option:dns-server,${AP_IP}
# Captive portal redirect (optional)
# address=/#/${AP_IP}
EOF

    log_success "dnsmasq configuration created"
}

# Configure network interface for AP mode
configure_interface() {
    log "Configuring ${WIFI_INTERFACE} for AP mode..."
    
    # Stop NetworkManager from managing wlan0 when in AP mode
    if command -v nmcli &> /dev/null; then
        log "Stopping NetworkManager management of ${WIFI_INTERFACE}..."
        nmcli device set ${WIFI_INTERFACE} managed no 2>/dev/null || true
    fi
    
    # Bring down interface
    ip link set ${WIFI_INTERFACE} down 2>/dev/null || true
    
    # Flush existing IP
    ip addr flush dev ${WIFI_INTERFACE} 2>/dev/null || true
    
    # Set static IP for AP
    ip addr add ${AP_IP}/24 dev ${WIFI_INTERFACE}
    ip link set ${WIFI_INTERFACE} up
    
    log_success "Interface configured with IP ${AP_IP}"
}

# Start Soft AP services
start_softap() {
    log "Starting Soft AP services..."
    
    # Configure interface
    configure_interface
    
    # Start dnsmasq
    log "Starting dnsmasq..."
    systemctl start dnsmasq
    if systemctl is-active --quiet dnsmasq; then
        log_success "dnsmasq started"
    else
        log_error "dnsmasq failed to start"
        systemctl status dnsmasq | tail -10
        return 1
    fi
    
    # Start hostapd
    log "Starting hostapd..."
    systemctl start hostapd
    if systemctl is-active --quiet hostapd; then
        log_success "hostapd started"
    else
        log_error "hostapd failed to start"
        journalctl -u hostapd -n 20
        return 1
    fi
    
    log_success "==================================="
    log_success "Soft AP is now running!"
    log_success "==================================="
    log "SSID: ${AP_SSID}"
    log "Password: ${AP_PASSWORD}"
    log "Setup URL: http://${AP_IP}:8080"
    log_success "==================================="
}

# Stop Soft AP and return to client mode
stop_softap() {
    log "Stopping Soft AP services..."
    
    # Stop services
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    
    # Flush interface
    ip addr flush dev ${WIFI_INTERFACE} 2>/dev/null || true
    
    # Return control to NetworkManager
    if command -v nmcli &> /dev/null; then
        log "Returning ${WIFI_INTERFACE} to NetworkManager..."
        nmcli device set ${WIFI_INTERFACE} managed yes 2>/dev/null || true
        sleep 2
        nmcli device connect ${WIFI_INTERFACE} 2>/dev/null || true
    fi
    
    log_success "Soft AP stopped"
}

# Check current AP status
status() {
    echo ""
    echo "=== C-Bridge Soft AP Status ==="
    echo ""
    
    # Check hostapd
    if systemctl is-active --quiet hostapd; then
        echo -e "hostapd:  ${GREEN}RUNNING${NC}"
    else
        echo -e "hostapd:  ${RED}STOPPED${NC}"
    fi
    
    # Check dnsmasq
    if systemctl is-active --quiet dnsmasq; then
        echo -e "dnsmasq:  ${GREEN}RUNNING${NC}"
    else
        echo -e "dnsmasq:  ${RED}STOPPED${NC}"
    fi
    
    # Check interface
    if ip addr show ${WIFI_INTERFACE} 2>/dev/null | grep -q "${AP_IP}"; then
        echo -e "Interface: ${GREEN}${AP_IP}${NC} (AP mode)"
    else
        CURRENT_IP=$(ip addr show ${WIFI_INTERFACE} 2>/dev/null | grep "inet " | awk '{print $2}')
        echo -e "Interface: ${YELLOW}${CURRENT_IP:-No IP}${NC} (Client mode)"
    fi
    
    # Check connected clients
    if systemctl is-active --quiet hostapd; then
        CLIENTS=$(iw dev ${WIFI_INTERFACE} station dump 2>/dev/null | grep -c "Station" || echo "0")
        echo -e "Clients:   ${CLIENTS} connected"
    fi
    
    echo ""
}

# Full installation
install() {
    check_root
    log "=== C-Bridge Soft AP Installation ==="
    
    install_dependencies
    create_hostapd_config
    create_dnsmasq_config
    
    # Disable services from auto-starting (we control them manually)
    systemctl disable hostapd 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true
    
    log_success "Installation complete!"
    log "Run 'sudo $0 start' to activate the Soft AP"
}

# Main
case "${1:-}" in
    install)
        install
        ;;
    start)
        check_root
        start_softap
        ;;
    stop)
        check_root
        stop_softap
        ;;
    restart)
        check_root
        stop_softap
        sleep 2
        start_softap
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {install|start|stop|restart|status}"
        echo ""
        echo "Commands:"
        echo "  install  - Install required packages and create configs"
        echo "  start    - Start the Soft AP"
        echo "  stop     - Stop the Soft AP and return to client mode"
        echo "  restart  - Restart the Soft AP"
        echo "  status   - Show current status"
        echo ""
        echo "Environment variables:"
        echo "  AP_SSID      - WiFi network name (default: CBridge-Setup)"
        echo "  AP_PASSWORD  - WiFi password (default: cbridge123)"
        echo "  AP_CHANNEL   - WiFi channel (default: 6)"
        exit 1
        ;;
esac

