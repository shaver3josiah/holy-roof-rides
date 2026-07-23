#!/usr/bin/env bash
# Holy Roof Rides — Oracle Cloud Always Free setup.
# Safe to re-run: pulls latest code, rewrites config, restarts services.
#
# Usage (as the ubuntu user, on the VM):
#   curl -fsSL https://raw.githubusercontent.com/shaver3josiah/holy-roof-rides/main/deploy/oracle/setup.sh \
#     | bash -s -- --domain NAME.duckdns.org --duckdns-token TOKEN
#
# Flags:
#   --domain NAME.duckdns.org   required unless --no-https
#   --duckdns-token TOKEN       required unless --no-https
#   --no-https                  skip Caddy/DuckDNS, serve plain HTTP on 8787
#   --repo URL                  override the git remote (default: this repo)
set -euo pipefail

DOMAIN=""
DUCKDNS_TOKEN=""
NO_HTTPS=false
REPO_URL="https://github.com/shaver3josiah/holy-roof-rides.git"
APP_DIR=/opt/holy-roof-rides
DATA_DIR=/var/lib/holyroofrides

log() { echo; echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --duckdns-token) DUCKDNS_TOKEN="$2"; shift 2 ;;
    --no-https) NO_HTTPS=true; shift ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ "$NO_HTTPS" = false ] && { [ -z "$DOMAIN" ] || [ -z "$DUCKDNS_TOKEN" ]; }; then
  echo "Error: --domain and --duckdns-token are required unless you pass --no-https" >&2
  exit 1
fi

# Oracle's cloud-init sets up passwordless sudo for 'ubuntu'; this script relies on it
# because it's meant to run non-interactively via curl | bash.
if ! sudo -n true 2>/dev/null; then
  echo "This needs passwordless sudo for the ubuntu user. Run 'sudo -v' and try again." >&2
  exit 1
fi

log "[1/7] Installing base packages"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates

log "[2/7] Checking Node.js"
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  if [ "$(printf '%s\n%s\n' "22.5.0" "$NODE_VER" | sort -V | head -n1)" = "22.5.0" ]; then
    NODE_OK=true
  fi
fi
if [ "$NODE_OK" = true ]; then
  echo "  node $NODE_VER already satisfies >=22.5, skipping install"
else
  echo "  installing Node 22 LTS via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

log "[3/7] Fetching the app"
if [ -d "$APP_DIR/.git" ]; then
  echo "  $APP_DIR already exists, pulling latest"
  git -C "$APP_DIR" pull --ff-only
else
  if [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
    echo "  $APP_DIR exists but isn't a git checkout (interrupted previous run?); removing and re-cloning"
    sudo rm -rf "$APP_DIR"
  fi
  sudo mkdir -p "$APP_DIR"
  sudo chown ubuntu:ubuntu "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
( cd "$APP_DIR/server" && npm ci --omit=dev )

log "[4/7] Setting up the service"
sudo mkdir -p "$DATA_DIR"
sudo chown ubuntu:ubuntu "$DATA_DIR"
# Persist the founding-deacon bootstrap code across restarts: generate it once
# and reuse it on every re-run, so a restart before anyone joins doesn't
# invalidate a code that's already been handed out.
BOOTSTRAP_FILE="$DATA_DIR/bootstrap-code"
if [ ! -f "$BOOTSTRAP_FILE" ]; then
  od -An -tx1 -N4 /dev/urandom | tr -d ' \n' | tr 'a-f' 'A-F' > "$BOOTSTRAP_FILE"
fi
BOOTSTRAP_CODE="$(cat "$BOOTSTRAP_FILE")"
sudo tee /etc/systemd/system/holyroofrides.service > /dev/null <<EOF
[Unit]
Description=Holy Roof Rides server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/holy-roof-rides/server
ExecStart=/usr/bin/node src/index.js
Environment=PORT=8787
Environment=HRR_DB_PATH=/var/lib/holyroofrides/holy-roof-rides.db
Environment=HRR_BOOTSTRAP_CODE=$BOOTSTRAP_CODE
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable holyroofrides
sudo systemctl restart holyroofrides

log "[5/7] Opening the firewall"
# Oracle's Ubuntu images ship an iptables rule that REJECTs everything but SSH
# (an INPUT chain entry ending "reject-with icmp-host-prohibited"). Every guide
# that only edits the OCI console's Security List misses this — the packets
# still die on the host. We insert ACCEPT rules ahead of that REJECT line.
open_port() {
  local port="$1"
  if sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "  port $port already open"
    return
  fi
  local reject_line
  reject_line="$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')"
  if [ -n "$reject_line" ]; then
    sudo iptables -I INPUT "$reject_line" -p tcp --dport "$port" -j ACCEPT
  else
    sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
  fi
  echo "  opened port $port"
}
if [ "$NO_HTTPS" = true ]; then
  open_port 8787
else
  open_port 80
  open_port 443
fi
# Preseed debconf so the package install doesn't stop to ask "save current rules?".
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | sudo debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | sudo debconf-set-selections
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
sudo netfilter-persistent save

if [ "$NO_HTTPS" = false ]; then
  log "[6/7] Setting up HTTPS (Caddy + DuckDNS)"
  if ! command -v caddy >/dev/null 2>&1; then
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y caddy
  fi
  sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$DOMAIN {
	reverse_proxy localhost:8787
}
EOF
  sudo systemctl enable --now caddy
  sudo systemctl reload caddy
  DUCKDNS_SUB="${DOMAIN%.duckdns.org}"
  sudo tee /etc/cron.d/duckdns > /dev/null <<EOF
*/5 * * * * ubuntu curl -fsS "https://www.duckdns.org/update?domains=$DUCKDNS_SUB&token=$DUCKDNS_TOKEN&ip=" >/dev/null 2>&1
EOF
else
  log "[6/7] Skipping HTTPS (--no-https): serving plain HTTP on 8787"
fi

log "[7/7] Done"
if [ "$NO_HTTPS" = false ]; then
  ADDRESS="https://$DOMAIN"
else
  PUBLIC_IP="$(curl -fsS ifconfig.me || echo 'YOUR_VM_IP')"
  ADDRESS="http://$PUBLIC_IP:8787"
fi
cat <<SUMMARY

Holy Roof Rides is up.

  App / server address to enter in the app's Settings screen:
    $ADDRESS

  Deacon portal:
    $ADDRESS/portal

  First-run bootstrap code (only shows while there are zero members):
    sudo journalctl -u holyroofrides | grep -i bootstrap

  Back up the database:
    cp $DATA_DIR/holy-roof-rides.db  ~/holy-roof-rides-backup-\$(date +%F).db

  Update later: re-run this same curl | bash command, or set up the
  GitHub Actions auto-deploy (see docs/RELEASING.md).
SUMMARY
