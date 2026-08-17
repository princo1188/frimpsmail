#!/usr/bin/env bash
set -euo pipefail

# Production deployment script for Frimps Mail sync service
# Run this on your target server after copying /sync-service contents.

APP_DIR="/opt/frimps-mail-sync"
LOG_DIR="/var/log/frimps-mail-sync"
SERVICE_USER="frimps"

# --- System dependencies ---
echo "[deploy] Installing Node.js dependencies..."
cd "$(dirname "$0")"
npm ci
npm run build

# --- User + dirs ---
echo "[deploy] Creating service user and log directory..."
if ! id -u "$SERVICE_USER" &>/dev/null; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
sudo mkdir -p "$APP_DIR" "$LOG_DIR"

# --- Copy artifacts ---
echo "[deploy] Copying artifacts to $APP_DIR..."
sudo cp -r dist package*.json .env ecosystem.config.cjs frimps-mail-sync.service "$APP_DIR/"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR" "$LOG_DIR"

# --- systemd install ---
echo "[deploy] Installing systemd service..."
sudo cp "$APP_DIR/frimps-mail-sync.service" /etc/systemd/system/frimps-mail-sync.service
sudo systemctl daemon-reload
sudo systemctl enable frimps-mail-sync.service
sudo systemctl restart frimps-mail-sync.service

# --- Verify ---
sleep 3
if systemctl is-active --quiet frimps-mail-sync.service; then
  echo "[deploy] ✅ Service is running"
  systemctl status frimps-mail-sync.service --no-pager
else
  echo "[deploy] ❌ Service failed to start"
  journalctl -u frimps-mail-sync.service --no-pager -n 50
  exit 1
fi

echo "[deploy] Done. Logs: journalctl -u frimps-mail-sync.service -f"
