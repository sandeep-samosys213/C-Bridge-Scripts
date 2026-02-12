# SoftAP Setup — Ek Doc (Complete Guide)

Ye doc do din ki saari **sahi findings** ko ek jagah rakhta hai: SoftAP ko Pi par setup karne ka pura flow, SD card issues, user-data copy, SSH/IP. Fresh start ke baad bhi isi ek doc se follow kar sakte ho.

---

## 1. Goal

- Raspberry Pi par **SoftAP** (WiFi hotspot "CBridge-Setup") chalana.
- First boot par **cloud-init** se automatically setup script run ho (repo se download + install).
- User phone/laptop se **CBridge-Setup** WiFi se connect karke **http://192.168.4.1:8080** open karke WiFi configure kar sake.
- Baad mein **SSH** se Pi par login ho sake (hostname ya static IP).

---

## 2. Jo chahiye

- Raspberry Pi, SD card, power
- **Pi Imager** (snap ya .deb/AppImage)
- **cloud-init-user-data.yaml** — C-Bridge first-boot config (repo ke `scripts/softap/` folder se; isi mein first-boot script + SoftAP setup ka reference hai)
- Linux PC (SD card flash + copy ke liye); device name **sdb** ya **sdc** ho sakta hai (lsblk se confirm karo)

---

## 3. SD card — clean karna (optional)

Agar purani card hai ya partition mess hai to pehle clean karo. **Galat disk (sda) mat chhedna.**

```bash
lsblk
sudo wipefs -a /dev/sdb   # sdb = SD card (size se pehchano)
```

Phir Pi Imager se write karo. **Format zaruri nahi** — Pi Imager puri card overwrite karta hai.

---

## 4. Pi Imager se flash karna

1. **Pi Imager** kholo.
2. **CHOOSE OS** → **Raspberry Pi OS (64-bit)**.
3. **CHOOSE STORAGE** → SD card select karo (**sdb** ya jo lsblk mein dikhe — 29G wala).
4. **Settings (gear)** set karo:
   - Hostname (e.g. **cbridge1** ya **cbridge-pi** — SSH ke liye `cbridge-pi.local` use karne ke liye)
   - Username + password
   - WiFi (SSID + password) — optional, Ethernet se bhi chalega
   - **Enable SSH** — on (password auth)
   - Timezone (e.g. Asia/Kolkata)
5. **WRITE** dabao. Write start ho jayega.

**Important:** Pi Imager ka **default user-data** C-Bridge first-boot script **nahi** chalaata. Isliye boot partition par **apna user-data** copy karna zaruri hai (Step 5).

---

## 5. C-Bridge user-data boot partition par copy karna (sabse important)

Pi Imager **verify** shuru karte hi SD card device (**sdb**) system se **gayab** ho jati hai — isliye verify **khatam** hone ke baad partprobe/mount ka mauka nahi milta. **Window sirf write 100% aur verify start ke beech** hoti hai.

### Option A: Write 100% hote hi copy (recommended)

1. **Pehle se:** Terminal khol ke rakho; mount point banao:
   ```bash
   sudo mkdir -p /media/user1/bootfs
   ```
2. **Files ready rakho** — repo clone ke andar:
   - `scripts/softap/cloud-init-user-data.yaml` → boot partition par **user-data** naam se
   - `scripts/softap/network-config` → boot partition par **network-config** naam se (optional, WiFi client mode ke liye)
3. Pi Imager se **WRITE** start karo.
4. **Jab "Writing" 100% ho jaye** (Verify 0% ya shuru hone se pehle), **turant** terminal mein (device **sdb** ho to; agar sdc ho to sdc use karo):
   ```bash
   sync; sudo partprobe /dev/sdb; lsblk
   ```
5. Agar **sdb1** (boot partition) dikhe to **turant**:
   ```bash
   sudo mount /dev/sdb1 /media/user1/bootfs
   sudo cp /home/user1/Sandeep/C-Bridge-Production/scripts/softap/cloud-init-user-data.yaml /media/user1/bootfs/user-data
   sudo cp /home/user1/Sandeep/C-Bridge-Production/scripts/softap/network-config /media/user1/bootfs/network-config
   sudo umount /media/user1/bootfs
   ```
   **Replace** `/path/to/your/C-Bridge-Production` apne repo path se.
6. Verify complete hone do. Card nikaal ke Pi mein laga do.

### Option B: Partitions verify ke baad nahi dikhe — re-insert ya reboot

- Write + verify **pura** karo, phir card **nikaal do**.
- **Doosra USB port** use karke **wapas laga do** (ya card **laga ke PC reboot** karo).
- `lsblk` — ab **sdb/sdc** ke niche **sdb1** (boot) dikh sakta hai.
- Phir:
  ```bash
  sudo mount /dev/sdb1 /media/user1/bootfs
  sudo cp /path/to/.../cloud-init-user-data.yaml /media/user1/bootfs/user-data
  sudo cp /path/to/.../network-config /media/user1/bootfs/network-config
  sudo umount /media/user1/bootfs
  ```

### Agar reboot ke baad bhi partitions na dikhen

Iska matlab card par Pi OS image sahi se nahi. **Dobara Pi Imager se flash** karo aur **Option A** use karo (write 100% pe hi copy).

---

## 6. Optional: Static IP + SSH (bootfs se)

Agar **SSH** ke liye **fixed IP** chahiye (e.g. 192.168.0.100) taaki har bar same address use ho:

- **SSH enable:** bootfs root mein **ssh** naam ki **empty** file honi chahiye (Pi Imager “Enable SSH” se bhi banti hai).
- **Static IP:** boot partition mein **network-config** file edit karo (ya repo se copy karke edit karo):
  - `dhcp4: true` hatao.
  - Add:
    ```yaml
    addresses:
      - 192.168.0.100/24
    gateway4: 192.168.0.1
    nameservers:
      addresses: [8.8.8.8, 8.8.4.4]
    ```
  - Apna gateway (e.g. 192.168.1.1) aur IP (e.g. 192.168.1.100) hisaab se change karo.
  - Ya WiFi ke liye:
    ```yaml
    wifis:
      wlan0:
        addresses:
          - 192.168.0.100/24
        gateway4: 192.168.0.1
        nameservers:
          addresses: [8.8.8.8, 8.8.4.4]
        optional: true
    ```

**Note:** Default `network-config` file repo mein `scripts/softap/network-config` par available hai — ye WiFi client mode enable karta hai (DHCP). Static IP chahiye to isko edit karke boot partition par copy karo.

**User perspective:** Hostname (`ssh user1@cbridge-pi.local`) sabse easy agar .local resolve ho; warna static IP ek baar set karke hamesha same address use karna user ke liye simple.

---

## 7. Pi boot + SoftAP use

1. SD card Pi mein laga ke **power on** karo.
2. 2–3 min wait karo (first boot, cloud-init, setup script).
3. Pi **CBridge-Setup** WiFi create karega (password: **cbridge123**).
4. Phone/laptop se **CBridge-Setup** se connect karo.
5. Browser mein **http://192.168.4.1:8080** open karo — yahan se WiFi (home/router) configure kar sakte ho.

---

## 8. SSH se login

- **Pehle try:** `ssh user1@cbridge-pi.local` (ya jo hostname Pi Imager mein set kiya).
- **Agar .local na chale:** Static IP set kiya ho to `ssh user1@192.168.0.100` (apna IP use karo).
- **IP pata nahi:** Router admin (192.168.0.1 / 192.168.1.1) → Connected devices, ya `nmap -sn 192.168.0.0/24` (subnet apna daalna).

---

## 9. Troubleshooting (short)

| Issue | Kya karna hai |
|-------|----------------|
| Partitions nahi dikh rahe (lsblk mein sirf sdb) | Write 100% pe partprobe + mount + copy (Option A); ya re-insert doosra port / reboot (Option B). |
| "No medium found" partprobe pe | Device us waqt dikh nahi rahi — write 100% pe copy karo, ya card re-insert karke partprobe. |
| Verify ke dauran sdb gayab | Normal (Pi Imager/snap). Isliye copy **write 100%** pe karna zaruri. |
| First boot ke baad SoftAP nahi dikh raha | Logs: `sudo tail -f /var/log/cbridge-first-boot.log`; service: `sudo systemctl status cbridge-setup-ap.service`. |

---

## 10. Files / paths (reference)

- **Cloud-init (first-boot):** Repo → `scripts/softap/cloud-init-user-data.yaml` → copy as **user-data** on **boot partition**.
- **Network config:** Repo → `scripts/softap/network-config` → copy as **network-config** on **boot partition** (optional, WiFi client mode ke liye).
- **Boot partition:** Pi Imager ke baad first partition (sdb1 ya sdc1); mount point e.g. `/media/user1/bootfs`.
- **Setup URL (SoftAP):** http://192.168.4.1:8080  
- **AP network:** 192.168.4.x, gateway 192.168.4.1.

---

**Last updated:** Findings from 2 days of SoftAP + SD card + Pi Imager troubleshooting — sab ek jagah. Fresh start ke baad sirf isi doc se follow karo.
