# 📁 Repository Structure Requirements

## Naye Repo (`lern-docker`) ke liye Required Folder Structure

**Repo URL:** `https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main`

---

## ✅ Minimum Required Structure

```
lern-docker/
│
├── setup_script                    # ✅ REQUIRED - Main setup script (executable)
│
├── backend/                        # ✅ REQUIRED - Setup script checks for this
│   └── (can be empty initially, but directory must exist)
│
├── frontend/                       # ⚠️ OPTIONAL - Warning if missing, but won't fail
│   └── (can be empty initially)
│
└── scripts/
    └── softap/                     # ✅ REQUIRED - For SoftAP functionality
        ├── setup-softap.sh        # ✅ REQUIRED - SoftAP management script
        ├── auto-ap.sh              # ✅ REQUIRED - Auto-AP controller
        ├── wifi-setup-server.js    # ✅ REQUIRED - WiFi setup web server
        └── cbridge-setup-ap.service # ✅ REQUIRED - Systemd service file
```

---

## 📋 Detailed File Requirements

### 1. **Root Level Files**

#### `setup_script` ✅ REQUIRED
- **Location:** Repository root
- **Purpose:** Main installation script
- **Must be:** Executable (`chmod +x`)
- **What it does:**
  - Installs Node.js, PostgreSQL, Docker, etc.
  - Calls `setup_softap()` function
  - Expects `backend/` directory to exist
  - Looks for SoftAP scripts at `scripts/softap/`

**Download URL:**
```
https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/setup_script
```

---

### 2. **Backend Directory** ✅ REQUIRED

#### `backend/` directory
- **Location:** Repository root
- **Purpose:** Setup script verifies this exists (line 319)
- **Can be:** Empty initially (just directory needed)
- **Later:** Will contain backend code

**Why Required:**
```bash
# From setup_script line 319:
if [ ! -d "backend" ]; then
    print_error "Backend directory not found!"
    exit 1  # Script exits if not found
fi
```

---

### 3. **Frontend Directory** ⚠️ OPTIONAL

#### `frontend/` directory
- **Location:** Repository root
- **Purpose:** Setup script checks for this (line 324)
- **Can be:** Empty initially
- **Warning:** Script shows warning if missing, but continues

**Why Optional:**
```bash
# From setup_script line 324:
if [ ! -d "frontend" ]; then
    print_warning "Frontend directory not found"  # Warning only, no exit
fi
```

---

### 4. **SoftAP Scripts** ✅ REQUIRED

#### `scripts/softap/` directory

**Required Files:**

1. **`setup-softap.sh`** ✅
   - **Purpose:** SoftAP management (start/stop/install)
   - **Must be:** Executable (`chmod +x`)
   - **Download URL:**
     ```
     https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/setup-softap.sh
     ```

2. **`auto-ap.sh`** ✅
   - **Purpose:** Auto-AP controller (monitors WiFi, starts SoftAP when needed)
   - **Must be:** Executable (`chmod +x`)
   - **Download URL:**
     ```
     https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/auto-ap.sh
     ```

3. **`wifi-setup-server.js`** ✅
   - **Purpose:** WiFi setup web server (Node.js)
   - **Runs on:** Port 8080
   - **URL:** http://192.168.4.1:8080
   - **Download URL:**
     ```
     https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/wifi-setup-server.js
     ```

4. **`cbridge-setup-ap.service`** ✅
   - **Purpose:** Systemd service file for auto-AP
   - **Installed to:** `/etc/systemd/system/`
   - **Download URL:**
     ```
     https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/cbridge-setup-ap.service
     ```

**Why Required:**
```bash
# From setup_script line 761:
SOFTAP_DIR="${APP_DIR}/scripts/softap"
if [ ! -d "$SOFTAP_DIR" ]; then
    print_warning "Softap scripts not found at $SOFTAP_DIR"
    print_info "Skipping softap setup - will need manual configuration"
    return 0  # Continues but SoftAP won't work
fi
```

---

## 🔍 Cloud-Init Download Flow

### What Cloud-Init Downloads:

```bash
# 1. Setup script (root)
curl -fsSL "$REPO_URL/setup_script" -o setup_script

# 2. SoftAP scripts
curl -fsSL "$REPO_URL/scripts/softap/setup-softap.sh" -o scripts/softap/setup-softap.sh
curl -fsSL "$REPO_URL/scripts/softap/auto-ap.sh" -o scripts/softap/auto-ap.sh
curl -fsSL "$REPO_URL/scripts/softap/wifi-setup-server.js" -o scripts/softap/wifi-setup-server.js
curl -fsSL "$REPO_URL/scripts/softap/cbridge-setup-ap.service" -o scripts/softap/cbridge-setup-ap.service

# 3. Creates minimal structure
mkdir -p backend frontend
```

---

## 📝 Complete Structure Example

```
lern-docker/
│
├── setup_script                    # Main setup script
│
├── backend/                        # Backend directory (can be empty)
│   └── (empty or with backend code)
│
├── frontend/                       # Frontend directory (can be empty)
│   └── (empty or with frontend code)
│
└── scripts/
    └── softap/
        ├── setup-softap.sh        # SoftAP management
        ├── auto-ap.sh              # Auto-AP controller
        ├── wifi-setup-server.js    # WiFi setup server
        └── cbridge-setup-ap.service # Systemd service
```

---

## ✅ Verification Checklist

### Before Using Repo:

1. ✅ **Setup Script:**
   ```bash
   curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/setup_script
   # Should return 200 OK
   ```

2. ✅ **Backend Directory:**
   ```bash
   # Just needs to exist (can be empty)
   ```

3. ✅ **SoftAP Scripts:**
   ```bash
   curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/setup-softap.sh
   curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/auto-ap.sh
   curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/wifi-setup-server.js
   curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/cbridge-setup-ap.service
   # All should return 200 OK
   ```

---

## 🚀 Quick Setup Script for New Repo

Agar naye repo mein structure nahi hai, to ye script use karo:

```bash
#!/bin/bash
# Setup script for lern-docker repo structure

REPO_DIR="lern-docker"
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

# Create required directories
mkdir -p backend frontend scripts/softap

# Copy setup_script (if you have it)
# cp /path/to/setup_script ./

# Copy SoftAP scripts (if you have them)
# cp /path/to/scripts/softap/* scripts/softap/

echo "✅ Repository structure created!"
echo "Now add your files and commit to GitHub"
```

---

## 📌 Important Notes

1. **File Permissions:**
   - `setup_script` must be executable
   - `*.sh` files must be executable
   - `.js` and `.service` files don't need execute permission

2. **File Paths:**
   - All paths are relative to repository root
   - Cloud-init downloads from `raw.githubusercontent.com`
   - Use exact paths as shown above

3. **Empty Directories:**
   - `backend/` and `frontend/` can be empty initially
   - Setup script just checks if directory exists
   - You can add code later

4. **SoftAP Scripts:**
   - Must be at exact path: `scripts/softap/`
   - Setup script looks for them there
   - If missing, SoftAP setup will be skipped

---

## 🎯 Summary

**Minimum Required:**
- ✅ `setup_script` (root)
- ✅ `backend/` directory (can be empty)
- ✅ `scripts/softap/setup-softap.sh`
- ✅ `scripts/softap/auto-ap.sh`
- ✅ `scripts/softap/wifi-setup-server.js`
- ✅ `scripts/softap/cbridge-setup-ap.service`

**Optional:**
- ⚠️ `frontend/` directory (warning if missing)

**Total Files Needed:** 5 files + 2 directories

---

**Last Updated:** Repository structure requirements for `lern-docker` repo
