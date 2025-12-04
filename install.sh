#!/bin/bash

# LootLook Installer
# Repo: https://github.com/JungleeAadmi/Loot-Look

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting LootLook Installation...${NC}"

# 1. Root Check
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root.${NC}" 
   exit 1
fi

# 2. Update & Upgrade System
echo -e "${YELLOW}Updating system packages...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y

# 3. Install Dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get install -y curl git build-essential postgresql postgresql-contrib tzdata

# 3.1 Configure Timezone (Interactive)
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

# 5. Clone/Update Repo (MOVED BEFORE DB SETUP)
APP_DIR="/opt/lootlook"
REPO_URL="https://github.com/JungleeAadmi/Loot-Look.git"

# Fix broken state from previous failed installs
if [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
    echo -e "${YELLOW}Detected broken installation. Cleaning up...${NC}"
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

# Check if user exists
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo -e "${YELLOW}Set a DB password (leave empty to auto-generate):${NC}"
    read -sp "Enter Password: " DB_PASS
    echo

    # Auto-generate if empty
    if [ -z "$DB_PASS" ]; then
        echo -e "${YELLOW}Generating random password...${NC}"
        DB_PASS=$(openssl rand -base64 12)
    fi

    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    
    # Save creds for the app
    echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME" > $APP_DIR/backend/.env
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> $APP_DIR/backend/.env
    echo "PORT=3000" >> $APP_DIR/backend/.env
else
    echo -e "${GREEN}Database user already exists. Skipping creation.${NC}"
fi

# 7. Install Backend
echo -e "${YELLOW}Setting up Backend...${NC}"
cd $APP_DIR/backend
npm install
npx playwright install-deps
npx playwright install chromium

# 8. Install & Build Frontend
echo -e "${YELLOW}Building Frontend PWA...${NC}"
cd $APP_DIR/frontend
npm install
npm run build

# 9. Setup Systemd Service
echo -e "${YELLOW}Creating System Service...${NC}"
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

# 10. Firewall
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp
fi

IP_ADDR=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   LootLook Installed Successfully!      ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "Access your app at: http://$IP_ADDR:3000"