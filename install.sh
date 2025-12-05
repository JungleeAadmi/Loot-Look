#!/bin/bash

# LootLook Installer v3.1 (Safe Hex Fix)
# Repo: https://github.com/JungleeAadmi/Loot-Look

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}--- STARTING LOOTLOOK INSTALLER v3.1 ---${NC}"

# 1. Root Check
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root.${NC}" 
   exit 1
fi

# 2. Update System
echo -e "${YELLOW}Updating system packages...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y

# 3. Install Core Dependencies
echo -e "${YELLOW}Installing core dependencies...${NC}"
apt-get install -y curl git build-essential postgresql postgresql-contrib tzdata wget

# 3.1 Timezone
echo -e "${YELLOW}Please select your Timezone:${NC}"
unset DEBIAN_FRONTEND
dpkg-reconfigure tzdata

# 4. Install Node.js 20
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js 20...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}Node.js is already installed.${NC}"
fi

# 5. Clone/Update Repo
APP_DIR="/opt/lootlook"
REPO_URL="https://github.com/JungleeAadmi/Loot-Look.git"

if [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
    rm -rf "$APP_DIR"
fi

if [ -d "$APP_DIR/.git" ]; then
    echo -e "${YELLOW}Updating existing installation...${NC}"
    cd $APP_DIR
    git pull
else
    echo -e "${YELLOW}Cloning repository...${NC}"
    git clone $REPO_URL $APP_DIR
fi

# 6. Database Setup
DB_USER="lootlook"
DB_NAME="lootlook_db"
echo -e "${YELLOW}Configuring Database...${NC}"

generate_env() {
    local pass=$1
    mkdir -p $APP_DIR/backend
    echo "DATABASE_URL=postgresql://$DB_USER:$pass@localhost:5432/$DB_NAME" > $APP_DIR/backend/.env
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> $APP_DIR/backend/.env
    echo "PORT=3000" >> $APP_DIR/backend/.env
}

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo -e "${YELLOW}Set a DB password (leave empty to auto-generate):${NC}"
    read -sp "Enter Password: " DB_PASS
    echo
    # FIX: Use hex to avoid special chars breaking the URL
    if [ -z "$DB_PASS" ]; then DB_PASS=$(openssl rand -hex 16); fi
    
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    generate_env "$DB_PASS"
else
    echo -e "${GREEN}Database user already exists.${NC}"
    if [ ! -f "$APP_DIR/backend/.env" ]; then
        # FIX: Use hex here too for self-healing
        DB_PASS=$(openssl rand -hex 16)
        sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
        generate_env "$DB_PASS"
        echo -e "${GREEN}Recovered missing config with safe password.${NC}"
    fi
fi

# 7. Install Backend
echo -e "${YELLOW}Setting up Backend...${NC}"
cd $APP_DIR/backend
npm install

# 8. MANUAL BROWSER DEPENDENCY INSTALL
echo -e "${YELLOW}Manually installing browser dependencies...${NC}"
apt-get install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 librandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2

# Fix libicu issue for bleeding edge Ubuntu
if ! dpkg -l | grep -q libicu74; then
    echo -e "${YELLOW}Polyfilling libicu74...${NC}"
    wget -q http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu74_74.2-1ubuntu3_amd64.deb
    dpkg -i libicu74_74.2-1ubuntu3_amd64.deb || apt-get install -f -y
    rm -f libicu74_74.2-1ubuntu3_amd64.deb
fi

echo -e "${YELLOW}Downloading Chromium Binary...${NC}"
npx playwright install chromium

# 9. Install & Build Frontend
echo -e "${YELLOW}Building Frontend PWA...${NC}"
cd $APP_DIR/frontend
npm install
npm run build

# 10. System Service
echo -e "${YELLOW}Restarting Service...${NC}"
cat <<EOF > /etc/systemd/system/lootlook.service
[Unit]
Description=LootLook Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable lootlook
systemctl restart lootlook

if command -v ufw &> /dev/null; then ufw allow 3000/tcp; fi

IP_ADDR=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   LootLook Installed Successfully!      ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "Access your app at: http://$IP_ADDR:3000"