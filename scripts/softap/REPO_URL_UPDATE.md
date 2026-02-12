# 🔄 Repository URL Update - Notes

## ✅ Current Status

**New Repository URL:** `https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main`

**Updated in:** `cloud-init-user-data.yaml` (line 34)

---

## 📋 Important Notes

### 1. **SoftAP Scripts Path**

Current code expects SoftAP scripts at:
```
$REPO_URL/scripts/softap/setup-softap.sh
$REPO_URL/scripts/softap/auto-ap.sh
$REPO_URL/scripts/softap/wifi-setup-server.js
$REPO_URL/scripts/softap/cbridge-setup-ap.service
```

**⚠️ Action Required:**
- Verify that `lern-docker` repo has SoftAP scripts at this path
- If different path, update lines 83-94 in `cloud-init-user-data.yaml`

### 2. **Setup Script Location**

Current code downloads setup script from:
```
$REPO_URL/setup_script
```

**✅ Verified:** Matches your provided URL structure

### 3. **Repository Structure**

Current approach:
- Creates `/home/$USER/C-Bridge-Production` directory
- Downloads setup_script there
- Downloads SoftAP scripts to `scripts/softap/`
- Creates minimal `backend/` and `frontend/` directories
- Runs setup_script from repository directory

**Why this approach?**
- Setup script expects to run from repository directory
- Needs `backend/` directory structure
- SoftAP scripts need to be accessible to setup_script

---

## 🔍 Verification Steps

### Check if SoftAP scripts exist in new repo:

```bash
# Test URLs
curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/setup_script
curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/setup-softap.sh
curl -I https://raw.githubusercontent.com/sandeep-samosys213/lern-docker/refs/heads/main/scripts/softap/auto-ap.sh
```

### If scripts don't exist at expected path:

**Option 1:** Copy SoftAP scripts to new repo
```bash
# Copy from current repo to new repo
cp scripts/softap/* /path/to/lern-docker/scripts/softap/
```

**Option 2:** Update paths in cloud-init-user-data.yaml
```yaml
# If scripts are at different location, update lines 83-94
curl -fsSL "$REPO_URL/different/path/setup-softap.sh" -o scripts/softap/setup-softap.sh
```

---

## 📝 Comparison: Old vs New Approach

### **Old Approach (Simple - /tmp based):**
```bash
curl -fsSL "$SETUP_SCRIPT_URL" -o /tmp/setup_script
cd /tmp
/tmp/setup_script
```

**Issues:**
- Setup script expects repository directory structure
- SoftAP scripts not found (setup_script looks for `scripts/softap/`)
- May fail if setup_script needs backend/ directory

### **New Approach (Improved - Repository directory):**
```bash
APP_DIR="/home/$USER/C-Bridge-Production"
mkdir -p "$APP_DIR"
cd "$APP_DIR"
curl -fsSL "$SETUP_SCRIPT_URL" -o setup_script
mkdir -p scripts/softap
# Download SoftAP scripts
mkdir -p backend frontend
sudo ./setup_script
```

**Benefits:**
- ✅ Proper directory structure
- ✅ SoftAP scripts available to setup_script
- ✅ Matches setup_script expectations
- ✅ Better error handling

---

## 🎯 Recommendation

**Keep the improved approach** (repository directory) because:
1. Setup script expects repository structure
2. SoftAP integration needs scripts in correct location
3. More reliable and maintainable

**Just verify:**
- SoftAP scripts exist in new repo at `scripts/softap/`
- If not, either copy them or update paths

---

## 🔧 Quick Fix if Scripts Missing

If SoftAP scripts don't exist in new repo, you can:

1. **Download from current repo as fallback:**
```bash
# In cloud-init-user-data.yaml, add fallback:
if ! curl -fsSL "$REPO_URL/scripts/softap/setup-softap.sh" -o scripts/softap/setup-softap.sh; then
    log "Downloading from fallback repo..."
    curl -fsSL "https://raw.githubusercontent.com/cbridge-org/C-Bridge-Production/lakshya-sandeep/scripts/softap/setup-softap.sh" -o scripts/softap/setup-softap.sh
fi
```

2. **Or skip SoftAP scripts download** (setup_script will handle if it has them):
```bash
# Remove lines 81-95 if scripts are in setup_script's repo
# Setup script will download/clone repo itself
```

---

**Last Updated:** After repo URL change to `sandeep-samosys213/lern-docker`
