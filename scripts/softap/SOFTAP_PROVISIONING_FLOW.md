# 🔧 SoftAP Provisioning – Complete Flow

## Overview

Complete step-by-step guide for SoftAP provisioning flow from SD card flash to user WiFi connection.

---

## 1️⃣ SD Card Flash (Raspberry Pi Imager)

### Steps:

1. **Raspberry Pi Imager** open karo
2. **OS select** karo (Raspberry Pi OS / Ubuntu Server / Lite etc.)
3. **Storage** = SD Card select karo
4. **⚙️ Advanced Options** open karo

### ⚠️ Important Settings:

**❌ WiFi Configure – Tick NAHI karna**

**Kyu?**
- Agar yaha SSID + Password fill kar diya → Device first boot me direct us WiFi se connect ho jayega
- SoftAP flow break ho jayega ❌
- Provisioning portal open nahi hoga ❌

**✔ Sirf ye set karo:**
- Username / Password
- Hostname (e.g., `cbridge1`)
- SSH enable
- Locale / Timezone

5. **Flash complete** karo

---

## 2️⃣ Flash ke baad SD Card Mount

Linux/Windows me **system-boot** / **bootfs** partition open hoga.

### Files to Update:

Yahi par tumhe **2 files** update karni hai:

1. **`user-data`** → Copy from `scripts/softap/cloud-init-user-data.yaml`
2. **`network-config`** → Copy from `scripts/softap/network-config`

### Copy Commands (Linux):

```bash
# Mount boot partition
sudo mkdir -p /media/user1/bootfs
sudo mount /dev/sdb1 /media/user1/bootfs  # Replace sdb1 with your SD card partition

# Copy files
sudo cp /path/to/C-Bridge-Production/scripts/softap/cloud-init-user-data.yaml /media/user1/bootfs/user-data
sudo cp /path/to/C-Bridge-Production/scripts/softap/network-config /media/user1/bootfs/network-config

# Unmount
sudo umount /media/user1/bootfs
```

**⚠️ Important:**
- File names must be exact: `user-data` and `network-config` (no extensions)
- Use Linux line endings (LF, not CRLF)
- Ensure proper YAML indentation (spaces, not tabs)

---

## 3️⃣ user-data (Cloud-Init Logic)

### What it does:

1. **Packages install:**
   - curl, wget, git, vim, htop

2. **First boot script:**
   - Downloads `setup_script` from repository
   - Runs complete C-Bridge setup
   - Installs hostapd, dnsmasq
   - Configures SoftAP

3. **SoftAP auto-start:**
   - Checks if WiFi is configured
   - If NOT configured → Starts SoftAP automatically
   - Starts WiFi setup web server (port 8080)

4. **Systemd service:**
   - Enables `cbridge-first-boot.service`
   - Enables `cbridge-setup-ap.service` (auto-AP monitoring)

---

## 4️⃣ network-config (SoftAP Default Network)

### Configuration:

```yaml
network:
  version: 2
  renderer: networkd

  ethernets:
    eth0:
      dhcp4: true
      optional: true

  wifis:
    wlan0:
      dhcp4: false
      addresses: [192.168.4.1/24]
      optional: true
```

### ⚠️ Important:

- **Yaha koi SSID / password mat likho**
- Ye client WiFi config nahi hai
- Ye AP interface IP assign kar raha hai (192.168.4.1)
- WiFi credentials provisioning portal se configure honge

---

## 5️⃣ First Boot Flow (Device Side)

Jab SD Card device me daalte ho + power on:

### Cloud-Init Steps Run:

1. **Files read** hoti hain (`user-data`, `network-config`)
2. **Packages install** (curl, wget, git, etc.)
3. **Network configured** (wlan0 → 192.168.4.1/24)
4. **First boot script runs:**
   - Downloads `setup_script`
   - Installs Node.js, PostgreSQL, Docker, etc.
   - **Installs hostapd & dnsmasq**
   - **Configures SoftAP**
5. **WiFi check:**
   - If NOT configured → **SoftAP starts automatically**
   - If configured → Normal operation

---

## 6️⃣ SoftAP Broadcast

Device hotspot create karega:

- **SSID:** `CBridge-Setup`
- **Password:** `cbridge123`
- **IP:** `192.168.4.1`
- **Setup URL:** `http://192.168.4.1:8080`

Phone / Laptop me visible hoga ✅

---

## 7️⃣ User Connects to Hotspot

### Steps:

1. Mobile WiFi open karega
2. **CBridge-Setup** select karega
3. Password: `cbridge123` enter karega
4. Connect karega

---

## 8️⃣ Provisioning Portal Open

### Auto ya manual open:

**http://192.168.4.1:8080**

### Web page load:

- Nearby WiFi scan
- SSID list (sorted by signal strength)
- Password field
- Manual SSID entry option

---

## 9️⃣ User Home WiFi Fill

### Example:

- **SSID:** `Office_WiFi`
- **Password:** `********`

**Submit** → Backend API call

---

## 🔟 Device Switches to Client Mode

### Backend flow:

1. **Credentials save:**
   - `/var/lib/cbridge/wifi_credentials.json`
   - `/etc/wpa_supplicant/wpa_supplicant.conf` (or NetworkManager)

2. **AP stop:**
   - hostapd stopped
   - dnsmasq stopped
   - wlan0 interface released

3. **WiFi connect attempt:**
   - nmcli or wpa_supplicant used
   - DHCP IP milega from router
   - Internet connected ✅

4. **SoftAP disabled:**
   - Auto-AP service detects WiFi connection
   - Keeps SoftAP off while connected

---

## 🔁 Next Boot Behavior (Permanent Logic)

### Boot par check:

```
IF saved WiFi exists AND connected:
    → Connect to WiFi
    → SoftAP OFF
ELSE:
    → Start SoftAP
    → Provisioning portal available
```

### Auto-AP Service (`cbridge-setup-ap.service`):

- **Runs continuously** (every 30 seconds)
- **Monitors:**
  - WiFi connection status
  - Internet/router connectivity
- **Auto-starts SoftAP** if:
  - WiFi not configured
  - WiFi disconnected
  - No internet/router connectivity

### Reset Logic:

Agar WiFi credentials delete kar diye ya reset kiya:
- Next boot par SoftAP automatically start hoga
- User phir se configure kar sakta hai

---

## 📋 Complete Flow Summary

```
1. Flash SD Card (Pi Imager)
   ↓
2. Update user-data & network-config
   ↓
3. Insert SD → Boot
   ↓
4. Cloud-Init runs
   ↓
5. Setup script downloads & runs
   ↓
6. SoftAP starts (if WiFi not configured)
   ↓
7. User connects hotspot (CBridge-Setup)
   ↓
8. Portal open (http://192.168.4.1:8080)
   ↓
9. WiFi credentials submit
   ↓
10. Device connects to WiFi
   ↓
11. SoftAP disabled
   ↓
12. Next boot → WiFi auto-connect
```

---

## ❓ Common Questions

### Q: SD card flash pehle kar liya, sirf user-data & network-config update kiya — fir se flash karu?

**Answer:** ❌ Re-flash zaroori nahi  
**✔ Sirf files replace enough hai**

Bas ensure:
- Correct partition me copy ki
- File name same hai (`user-data`, `network-config`)
- `.txt` extension nahi laga
- Linux line endings hai (LF)

### Q: WiFi configure karne ke baad SoftAP phir se start ho jayega?

**Answer:** ❌ Nahi  
- Agar WiFi connected hai → SoftAP OFF
- Agar WiFi disconnect ho → SoftAP auto-start
- Reset ke baad hi SoftAP start hoga

### Q: Multiple devices ke liye same SD card use kar sakte hain?

**Answer:** ✅ Haan  
- Har device ke liye same files use kar sakte ho
- Hostname alag set kar sakte ho (Pi Imager se)
- Ya cloud-init me hostname change kar sakte ho

---

## 🧪 Testing

### Check SoftAP Status:

```bash
# Check if SoftAP is running
sudo systemctl status hostapd
sudo systemctl status dnsmasq

# Check WiFi setup server
ps aux | grep wifi-setup-server

# Check logs
sudo tail -f /var/log/cbridge-first-boot.log
sudo tail -f /var/log/cbridge-auto-ap.log
sudo tail -f /var/log/wifi-setup-server.log
```

### Manual SoftAP Start:

```bash
sudo /home/cbridge/C-Bridge-Production/scripts/softap/setup-softap.sh start
```

### Manual SoftAP Stop:

```bash
sudo /home/cbridge/C-Bridge-Production/scripts/softap/setup-softap.sh stop
```

---

## 📝 Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `user-data` | Boot partition | Cloud-init configuration |
| `network-config` | Boot partition | Network configuration (AP IP) |
| `setup-softap.sh` | `/home/cbridge/.../scripts/softap/` | SoftAP management |
| `auto-ap.sh` | `/home/cbridge/.../scripts/softap/` | Auto-AP controller |
| `wifi-setup-server.js` | `/home/cbridge/.../scripts/softap/` | Provisioning web server |
| `cbridge-setup-ap.service` | `/etc/systemd/system/` | Auto-AP systemd service |

---

**Last Updated:** Complete SoftAP provisioning flow documentation
