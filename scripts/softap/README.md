# C-Bridge Soft AP (Access Point) for Device Setup

This module creates a WiFi access point for initial device configuration when no WiFi network is configured.

## Overview

When the C-Bridge hub powers on without WiFi configuration:
1. It automatically creates a "CBridge-Setup" WiFi network
2. Users connect to this network with their phone/laptop
3. A captive portal-style web UI allows selecting and configuring WiFi
4. Once connected, the AP disables and normal operation begins

## 📋 Recent Updates

**Latest Work (Feb 9, 2026):**
- ✅ Manual SoftAP setup successful
- ✅ Phone connection working
- 🔄 WiFi configuration error - debugging in progress
- 🔄 Automation implementation ongoing

**See:** `TODAYS_WORK_UPDATE.md` for complete update  
**Debugging:** `WIFI_CONFIG_ERROR_DEBUG.md` for error troubleshooting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOFT AP COMPONENTS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │   hostapd   │     │   dnsmasq   │     │  WiFi Setup │       │
│  │  (AP Mode)  │────▶│    (DHCP)   │────▶│  Web Server │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│        │                    │                   │               │
│        └────────────────────┴───────────────────┘               │
│                            │                                    │
│                      ┌─────┴─────┐                             │
│                      │  auto-ap  │                             │
│                      │ controller│                             │
│                      └───────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `setup-softap.sh` | Main script to install, start, stop the AP |
| `auto-ap.sh` | Controller that monitors WiFi and switches to AP when needed |
| `wifi-setup-server.js` | Web UI for WiFi configuration (Node.js) |
| `cbridge-setup-ap.service` | Systemd service file |

## Installation

### 🚀 Automated Installation (No Git Clone Required!)

**Users को manually clone करने की जरूरत नहीं!** See `AUTOMATION_ALTERNATIVES.md` for complete guide.

#### Option 1: One-Line Install (Simplest)
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/C-Bridge-Production/main/scripts/softap/install.sh | bash
```

curl -fsSL https://github.com/cbridge-org/C-Bridge-Production/scripts/softap/setup-softap.sh | bash
#### Option 2: Cloud-Init (Fully Automated - Recommended) ⭐
1. Download `cloud-init-user-data.yaml`
2. Pi Imager → Advanced Options → Custom cloud-init user-data
3. Select the file and flash
4. **Done!** Setup runs automatically on first boot ✅

**📖 Complete Step-by-Step Guide:** See `CLOUD_INIT_SETUP_GUIDE.md` for detailed instructions with screenshots and troubleshooting.

#### Option 3: Manual Installation

### 1. Install the Soft AP:

```bash
cd /home/cbridge/C-Bridge-Production/scripts/softap
sudo chmod +x setup-softap.sh auto-ap.sh
sudo ./setup-softap.sh install
```

### 2. Install the systemd service (optional):

```bash
sudo cp cbridge-setup-ap.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cbridge-setup-ap
```

## Usage

### Manual Control:

```bash
# Start the Soft AP
sudo ./setup-softap.sh start

# Stop the Soft AP
sudo ./setup-softap.sh stop

# Check status
./setup-softap.sh status

# Restart
sudo ./setup-softap.sh restart
```

### Auto-AP Controller:

```bash
# Run in background (continuous monitoring)
sudo ./auto-ap.sh run &

# Single check (useful for boot)
sudo ./auto-ap.sh check
```

## Configuration

Edit environment variables before running:

| Variable | Default | Description |
|----------|---------|-------------|
| `AP_SSID` | CBridge-Setup | WiFi network name |
| `AP_PASSWORD` | cbridge123 | WiFi password (8+ chars) |
| `AP_CHANNEL` | 6 | WiFi channel (1-11) |
| `WIFI_INTERFACE` | wlan0 | Wireless interface |
| `SETUP_PORT` | 8080 | Web server port |

Example:
```bash
AP_SSID="MyBridge-Setup" AP_PASSWORD="mypassword" sudo ./setup-softap.sh start
```

## Default Credentials

- **SSID:** CBridge-Setup
- **Password:** cbridge123
- **Setup URL:** http://192.168.4.1:8080

## How It Works

### 1. hostapd
Creates the access point. Configuration at `/etc/hostapd/hostapd.conf`.

### 2. dnsmasq
Provides DHCP for clients connecting to the AP. Assigns IPs from 192.168.4.10-50.

### 3. WiFi Setup Server (Node.js)
- Scans for available networks using `iwlist`
- Presents a mobile-friendly web UI
- Saves credentials and triggers connection via `nmcli` or `wpa_supplicant`

### 4. Auto-AP Controller
Continuously monitors WiFi connection and internet/router connectivity:
- **WiFi connected + Internet available** → Ensure AP is off (normal operation)
- **WiFi connected but NO internet/router** → Start AP mode (allows reconfiguration)
- **WiFi configured but disconnected** → Try to reconnect, if fails → Start AP mode
- **No WiFi configuration** → Start AP mode (initial setup)

**Router IP Detection:** The controller checks gateway/router IP connectivity first (as configured in `network-config`), then verifies internet connectivity. If either fails, SoftAP activates automatically.

**Check Interval:** Monitors every 30 seconds (configurable via `CHECK_INTERVAL` in `auto-ap.sh`)

## Troubleshooting

### AP not starting?

```bash
# Check hostapd status
sudo systemctl status hostapd
sudo journalctl -u hostapd -n 20

# Check if interface supports AP mode
iw list | grep -A5 "Supported interface modes"

# Check for conflicting processes
sudo killall wpa_supplicant
sudo nmcli device set wlan0 managed no
```

### Clients can't get IP?

```bash
# Check dnsmasq
sudo systemctl status dnsmasq
sudo journalctl -u dnsmasq -n 20

# Check interface has correct IP
ip addr show wlan0
```

### Web UI not loading?

```bash
# Check if server is running
ps aux | grep wifi-setup-server

# Check if port is open
netstat -tlnp | grep 8080

# Start manually
node /home/cbridge/C-Bridge-Production/scripts/softap/wifi-setup-server.js
```

## Integration with Docker

The Soft AP runs on the **host** system, not inside Docker containers. When a user configures WiFi through the setup portal:

1. The AP configures the host's wlan0 interface
2. Docker containers (cbridge-backend, cbridge-frontend) continue running
3. When WiFi connects, Docker networks through the host's new connection

## Security Considerations

1. **Change default password** in production
2. The setup portal is only available when AP is active
3. After WiFi is configured, the AP automatically disables
4. Consider using WPA3 if hardware supports it

## Logs

- AP operations: `/var/log/cbridge-softap.log`
- Auto-AP controller: `/var/log/cbridge-auto-ap.log`
- WiFi credentials: `/var/lib/cbridge/wifi_credentials.json`

## Reverting to AP Mode

If you need to reconfigure WiFi:

```bash
# Remove saved configuration
sudo rm /var/lib/cbridge/wifi-configured
sudo rm /etc/wpa_supplicant/wpa_supplicant.conf

# Start AP mode
sudo ./setup-softap.sh start
node ./wifi-setup-server.js
```

