/**
 * C-Bridge WiFi Setup Web Server
 * 
 * A captive portal-style web interface for configuring WiFi credentials
 * during initial device setup via the Soft AP.
 * 
 * Features:
 * - Scans for available WiFi networks
 * - Allows manual SSID entry for hidden networks
 * - Saves credentials and triggers connection
 * - Modern, mobile-friendly UI
 */

const http = require('http');
const { exec, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Setup logging
const LOG_FILE = '/var/log/wifi-setup-server.log';
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
  } catch (e) {
    // Ignore log write errors
  }
}

// Configuration
const PORT = process.env.SETUP_PORT || 8080;
const WIFI_INTERFACE = process.env.WIFI_INTERFACE || 'wlan0';
const CREDENTIALS_FILE = '/var/lib/cbridge/wifi_credentials.json';
const STATE_FILE = '/var/lib/cbridge/wifi-configured';
const SOFTAP_SCRIPT = path.join(__dirname, 'setup-softap.sh');

// Network scan cache
let networkCache = { networks: [], timestamp: 0 };
const CACHE_TTL = 30000; // 30 seconds

// Ensure directories exist
try {
  fs.mkdirSync('/var/lib/cbridge', { recursive: true });
} catch (e) {}

/**
 * Scan for available WiFi networks
 */
async function scanNetworks() {
  return new Promise((resolve) => {
    // Check cache first
    if (Date.now() - networkCache.timestamp < CACHE_TTL) {
      return resolve(networkCache.networks);
    }

    exec(`iwlist ${WIFI_INTERFACE} scan 2>/dev/null || sudo iwlist ${WIFI_INTERFACE} scan 2>/dev/null`, (error, stdout) => {
      if (error) {
        console.error('Network scan error:', error.message);
        return resolve([]);
      }

      const networks = [];
      let currentNetwork = {};

      stdout.split('\n').forEach(line => {
        // Extract SSID
        const ssidMatch = line.match(/ESSID:"([^"]+)"/);
        if (ssidMatch && ssidMatch[1]) {
          currentNetwork.ssid = ssidMatch[1];
        }

        // Extract signal strength
        const signalMatch = line.match(/Signal level[=:](-?\d+)/);
        if (signalMatch) {
          const dBm = parseInt(signalMatch[1]);
          // Convert dBm to percentage (roughly)
          currentNetwork.signal = Math.min(100, Math.max(0, (dBm + 100) * 2));
        }

        // Extract encryption type
        if (line.includes('Encryption key:on')) {
          currentNetwork.encrypted = true;
        } else if (line.includes('Encryption key:off')) {
          currentNetwork.encrypted = false;
        }

        // Extract security type
        if (line.includes('WPA2')) {
          currentNetwork.security = 'WPA2';
        } else if (line.includes('WPA')) {
          currentNetwork.security = 'WPA';
        } else if (line.includes('WEP')) {
          currentNetwork.security = 'WEP';
        }

        // When we hit a new cell, save the previous network
        if (line.includes('Cell ') && currentNetwork.ssid) {
          networks.push({ ...currentNetwork });
          currentNetwork = {};
        }
      });

      // Add last network
      if (currentNetwork.ssid) {
        networks.push(currentNetwork);
      }

      // Remove duplicates and sort by signal
      const uniqueNetworks = networks
        .filter((net, index, self) => 
          index === self.findIndex(n => n.ssid === net.ssid)
        )
        .sort((a, b) => (b.signal || 0) - (a.signal || 0));

      // Update cache
      networkCache = { networks: uniqueNetworks, timestamp: Date.now() };
      resolve(uniqueNetworks);
    });
  });
}

/**
 * Connect to WiFi network
 */
async function connectToNetwork(ssid, password) {
  return new Promise((resolve, reject) => {
    log(`Attempting to connect to WiFi network: ${ssid}`);

    // Ensure directory exists before writing
    try {
      log(`Ensuring directory exists: /var/lib/cbridge`);
      fs.mkdirSync('/var/lib/cbridge', { recursive: true });
      if (process.getuid && process.getuid() === 0) {
        try {
          execSync('chown -R cbridge:cbridge /var/lib/cbridge 2>/dev/null || true');
          execSync('chmod 755 /var/lib/cbridge 2>/dev/null || true');
          log('Directory permissions set');
        } catch (e) {
          log(`Warning: Could not set permissions: ${e.message}`);
        }
      }
    } catch (e) {
      log(`ERROR: Failed to create directory: ${e.message}`);
      log(`Attempting with sudo...`);
      try {
        execSync('sudo mkdir -p /var/lib/cbridge', { stdio: 'inherit' });
        execSync('sudo chown -R cbridge:cbridge /var/lib/cbridge', { stdio: 'inherit' });
        execSync('sudo chmod 755 /var/lib/cbridge', { stdio: 'inherit' });
        log('Directory created with sudo');
      } catch (sudoErr) {
        log(`ERROR: Failed even with sudo: ${sudoErr.message}`);
        return reject(new Error('Failed to create credentials directory. Please run: sudo mkdir -p /var/lib/cbridge && sudo chown cbridge:cbridge /var/lib/cbridge'));
      }
    }

    // Save credentials
    try {
      log(`Saving credentials to: ${CREDENTIALS_FILE}`);
      const credentials = { ssid, password, timestamp: new Date().toISOString() };
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2));
      log(`Credentials saved successfully`);
      
      // Set permissions if running as root
      if (process.getuid && process.getuid() === 0) {
        try {
          execSync(`chown cbridge:cbridge ${CREDENTIALS_FILE} 2>/dev/null || true`);
          execSync(`chmod 644 ${CREDENTIALS_FILE} 2>/dev/null || true`);
        } catch (e) {
          log(`Warning: Could not set file permissions: ${e.message}`);
        }
      }
    } catch (e) {
      log(`ERROR: Failed to write credentials file: ${e.message}`);
      log(`Error details: ${e.stack}`);
      return reject(new Error(`Failed to save credentials: ${e.message}`));
    }

    // Use nmcli to connect (works with NetworkManager)
    const cmd = password
      ? `nmcli device wifi connect "${ssid}" password "${password}" ifname ${WIFI_INTERFACE}`
      : `nmcli device wifi connect "${ssid}" ifname ${WIFI_INTERFACE}`;

    // First, stop the AP mode
    log('Stopping AP mode...');
    exec(`sudo ${SOFTAP_SCRIPT} stop`, (stopErr) => {
      if (stopErr) {
        log(`Note: Could not stop AP (may not be running): ${stopErr.message}`);
        // Try manual stop
        exec('sudo systemctl stop hostapd 2>/dev/null || true', () => {});
        exec('sudo pkill dnsmasq 2>/dev/null || true', () => {});
      } else {
        log('AP mode stopped successfully');
      }

      // Wait a moment for interface to be available
      setTimeout(() => {
        log(`Connecting to WiFi network: ${ssid}`);
        exec(`sudo ${cmd}`, (error, stdout, stderr) => {
          if (error) {
            log(`Connection error: ${stderr || error.message}`);
            
            // Try alternative method with wpa_supplicant
            const wpaConfig = `
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=US

network={
    ssid="${ssid}"
    ${password ? `psk="${password}"` : 'key_mgmt=NONE'}
}`;
            
            try {
              log('Trying wpa_supplicant method...');
              fs.writeFileSync('/tmp/wpa_temp.conf', wpaConfig);
              execSync(`sudo cp /tmp/wpa_temp.conf /etc/wpa_supplicant/wpa_supplicant.conf`);
              execSync(`sudo systemctl restart wpa_supplicant`);
              
              // Mark as configured
              fs.writeFileSync(STATE_FILE, new Date().toISOString());
              log('WiFi configured via wpa_supplicant');
              
              // Ensure AP is stopped
              exec('sudo systemctl stop hostapd 2>/dev/null || true', () => {});
              exec('sudo pkill dnsmasq 2>/dev/null || true', () => {});
              
              resolve({ success: true, method: 'wpa_supplicant' });
            } catch (wpaError) {
              log(`ERROR: wpa_supplicant failed: ${wpaError.message}`);
              reject(new Error('Failed to configure WiFi: ' + wpaError.message));
            }
          } else {
            log(`WiFi connected successfully via nmcli`);
            // Mark as configured
            fs.writeFileSync(STATE_FILE, new Date().toISOString());
            
            // Ensure AP is completely stopped
            log('Ensuring AP mode is stopped...');
            exec('sudo systemctl stop hostapd 2>/dev/null || true', () => {});
            exec('sudo pkill dnsmasq 2>/dev/null || true', () => {});
            exec('sudo ip addr flush dev wlan0 2>/dev/null || true', () => {});
            
            // Wait a moment
            setTimeout(() => {
              log('Connection complete. AP mode should be stopped.');
              resolve({ success: true, method: 'nmcli' });
            }, 2000);
          }
        });
      }, 3000);
    });
  });
}

/**
 * Check connection status
 */
function getConnectionStatus() {
  try {
    const ssid = execSync(`iwgetid -r ${WIFI_INTERFACE} 2>/dev/null`).toString().trim();
    const ip = execSync(`ip addr show ${WIFI_INTERFACE} | grep 'inet ' | awk '{print $2}' | cut -d/ -f1`)
      .toString().trim();
    
    return {
      connected: !!ssid && !ssid.includes('CBridge'),
      ssid,
      ip,
      interface: WIFI_INTERFACE
    };
  } catch (e) {
    return { connected: false, ssid: '', ip: '' };
  }
}

/**
 * Generate HTML UI
 */
function generateHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C-Bridge WiFi Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 420px;
      width: 100%;
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #4a90d9 0%, #1e5799 100%);
      color: white;
      padding: 24px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 24px;
      margin-bottom: 8px;
    }
    
    .header p {
      opacity: 0.9;
      font-size: 14px;
    }
    
    .content {
      padding: 24px;
    }
    
    .network-list {
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    
    .network-item {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s;
    }
    
    .network-item:hover {
      background: #f5f8fa;
    }
    
    .network-item:last-child {
      border-bottom: none;
    }
    
    .network-item.selected {
      background: #e3f2fd;
    }
    
    .signal-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
    }
    
    .network-info {
      flex: 1;
    }
    
    .network-name {
      font-weight: 500;
      color: #333;
    }
    
    .network-meta {
      font-size: 12px;
      color: #888;
      margin-top: 2px;
    }
    
    .lock-icon {
      color: #888;
      font-size: 16px;
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    
    label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #333;
      margin-bottom: 6px;
    }
    
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      transition: border 0.2s;
    }
    
    input:focus {
      outline: none;
      border-color: #4a90d9;
      box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
    }
    
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #4a90d9 0%, #1e5799 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(30, 87, 153, 0.3);
    }
    
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }
    
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
      margin-top: 8px;
    }
    
    .btn-secondary:hover {
      background: #e0e0e0;
      box-shadow: none;
    }
    
    .status {
      margin-top: 16px;
      padding: 12px;
      border-radius: 8px;
      text-align: center;
      font-size: 14px;
    }
    
    .status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }
    
    .status.error {
      background: #ffebee;
      color: #c62828;
    }
    
    .status.loading {
      background: #e3f2fd;
      color: #1565c0;
    }
    
    .loader {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .hidden { display: none; }
    
    #manual-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌐 C-Bridge WiFi Setup</h1>
      <p>Select your WiFi network to complete setup</p>
    </div>
    
    <div class="content">
      <div id="loading" class="status loading">
        <span class="loader"></span> Scanning for networks...
      </div>
      
      <div id="networks-section" class="hidden">
        <div class="network-list" id="network-list"></div>
        
        <div class="form-group" id="password-group" style="display: none;">
          <label for="password">WiFi Password</label>
          <input type="password" id="password" placeholder="Enter password">
        </div>
        
        <button id="connect-btn" disabled>Connect</button>
        <button class="btn-secondary" id="refresh-btn">Refresh Networks</button>
        
        <div id="manual-section">
          <div class="form-group">
            <label for="manual-ssid">Or enter network name manually:</label>
            <input type="text" id="manual-ssid" placeholder="Network name (SSID)">
          </div>
          <div class="form-group">
            <label for="manual-password">Password</label>
            <input type="password" id="manual-password" placeholder="Password (leave empty if open)">
          </div>
          <button id="manual-connect-btn">Connect to Hidden Network</button>
        </div>
      </div>
      
      <div id="status" class="status hidden"></div>
    </div>
  </div>

  <script>
    const networkList = document.getElementById('network-list');
    const loading = document.getElementById('loading');
    const networksSection = document.getElementById('networks-section');
    const passwordGroup = document.getElementById('password-group');
    const passwordInput = document.getElementById('password');
    const connectBtn = document.getElementById('connect-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const manualSsid = document.getElementById('manual-ssid');
    const manualPassword = document.getElementById('manual-password');
    const manualConnectBtn = document.getElementById('manual-connect-btn');
    const statusDiv = document.getElementById('status');
    
    let selectedNetwork = null;
    
    async function loadNetworks() {
      loading.classList.remove('hidden');
      networksSection.classList.add('hidden');
      
      try {
        const res = await fetch('/api/networks');
        const data = await res.json();
        
        networkList.innerHTML = data.networks.map(net => \`
          <div class="network-item" data-ssid="\${net.ssid}" data-encrypted="\${net.encrypted}">
            <svg class="signal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
            </svg>
            <div class="network-info">
              <div class="network-name">\${net.ssid}</div>
              <div class="network-meta">\${net.signal || '?'}% • \${net.security || 'Open'}</div>
            </div>
            \${net.encrypted ? '<span class="lock-icon">🔒</span>' : ''}
          </div>
        \`).join('');
        
        // Add click handlers
        document.querySelectorAll('.network-item').forEach(item => {
          item.addEventListener('click', () => {
            document.querySelectorAll('.network-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedNetwork = { 
              ssid: item.dataset.ssid, 
              encrypted: item.dataset.encrypted === 'true' 
            };
            
            if (selectedNetwork.encrypted) {
              passwordGroup.style.display = 'block';
              passwordInput.focus();
            } else {
              passwordGroup.style.display = 'none';
            }
            connectBtn.disabled = false;
          });
        });
        
        loading.classList.add('hidden');
        networksSection.classList.remove('hidden');
      } catch (err) {
        showStatus('Failed to load networks. Refresh to try again.', 'error');
        loading.classList.add('hidden');
        networksSection.classList.remove('hidden');
      }
    }
    
    async function connect(ssid, password) {
      showStatus('Connecting to ' + ssid + '...', 'loading');
      
      try {
        const res = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password })
        });
        
        const data = await res.json();
        
        if (data.success) {
          showStatus('Connected! The device will now restart. You can close this page.', 'success');
          // Check status after a moment
          setTimeout(checkStatus, 5000);
        } else {
          showStatus('Connection failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showStatus('Connection failed. Please try again & again.', 'error');
      }
    }
    
    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.connected) {
          showStatus(\`Connected to \${data.ssid}! IP: \${data.ip}\`, 'success');
        }
      } catch (err) {
        // Server may have restarted - that's okay
      }
    }
    
    function showStatus(message, type) {
      statusDiv.className = 'status ' + type;
      statusDiv.innerHTML = type === 'loading' 
        ? '<span class="loader"></span> ' + message 
        : message;
      statusDiv.classList.remove('hidden');
    }
    
    // Event listeners
    connectBtn.addEventListener('click', () => {
      if (selectedNetwork) {
        connect(selectedNetwork.ssid, passwordInput.value);
      }
    });
    
    refreshBtn.addEventListener('click', loadNetworks);
    
    manualConnectBtn.addEventListener('click', () => {
      if (manualSsid.value) {
        connect(manualSsid.value, manualPassword.value);
      }
    });
    
    // Initial load
    loadNetworks();
  </script>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Routes
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(generateHTML());
  }
  else if (req.method === 'GET' && req.url === '/api/networks') {
    const networks = await scanNetworks();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ networks }));
  }
  else if (req.method === 'POST' && req.url === '/api/connect') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { ssid, password } = JSON.parse(body);
        log(`Received connection request for SSID: ${ssid}`);
        const result = await connectToNetwork(ssid, password);
        log(`Connection successful: ${JSON.stringify(result)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        log(`ERROR in /api/connect: ${err.message}`);
        log(`Stack: ${err.stack}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  }
  else if (req.method === 'GET' && req.url === '/api/status') {
    const status = getConnectionStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  }
  else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Ensure directories exist before starting server
try {
  fs.mkdirSync('/var/lib/cbridge', { recursive: true });
  if (process.getuid && process.getuid() === 0) {
    const { execSync } = require('child_process');
    try {
      execSync('chown -R cbridge:cbridge /var/lib/cbridge 2>/dev/null || true');
      execSync('chmod 755 /var/lib/cbridge 2>/dev/null || true');
    } catch (e) {
      console.error('Warning: Could not set permissions:', e.message);
    }
  }
  console.log('✅ Directory /var/lib/cbridge ready');
} catch (e) {
  console.error('❌ Failed to create /var/lib/cbridge:', e.message);
  console.error('Please run: sudo mkdir -p /var/lib/cbridge && sudo chown cbridge:cbridge /var/lib/cbridge');
}

// Start server with error handling
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== C-Bridge WiFi Setup Server ===`);
  console.log(`Running on http://192.168.4.1:${PORT}`);
  console.log(`Open this URL in your browser after connecting to the CBridge-Setup WiFi network`);
  console.log(`Logs: /var/log/wifi-setup-server.log`);
  console.log(`================================\n`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`ERROR: Port ${PORT} is already in use`);
    log(`Killing existing process on port ${PORT}...`);
    try {
      // Find and kill process using port 8080
      const { execSync } = require('child_process');
      execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || pkill -f wifi-setup-server || true`);
      log('Existing process killed. Please restart the server.');
    } catch (e) {
      log(`Failed to kill existing process: ${e.message}`);
      log(`Please manually run: sudo lsof -ti:${PORT} | xargs kill -9`);
    }
  } else {
    log(`Server error: ${err.message}`);
  }
  process.exit(1);
});

// Handle client connection errors
server.on('clientError', (err, socket) => {
  log(`Client error: ${err.message}`);
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down WiFi setup server...');
  server.close();
  process.exit(0);
});

