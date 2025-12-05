#!/bin/bash

# LootLook Update Script
# Usage: sudo bash update.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/lootlook"

echo -e "${GREEN}--- STARTING LOOTLOOK UPDATE ---${NC}"

# 1. Root Check
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root.${NC}" 
   exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Error: LootLook installation not found at $APP_DIR${NC}"
    exit 1
fi

# 2. Stop Service
echo -e "${YELLOW}Stopping LootLook service...${NC}"
systemctl stop lootlook

# 3. Pull Latest Code
echo -e "${YELLOW}Pulling latest changes from GitHub...${NC}"
cd $APP_DIR
# Reset any local file changes to ensure clean pull (except ignored files like .env/screenshots)
git reset --hard HEAD
git pull origin main

# 4. Re-Install Backend Deps (in case package.json changed)
echo -e "${YELLOW}Updating Backend dependencies...${NC}"
cd $APP_DIR/backend
npm install --production

# 5. Re-Build Frontend (in case UI changed)
echo -e "${YELLOW}Rebuilding Frontend PWA...${NC}"
cd $APP_DIR/frontend
npm install
npm run build

# 6. Restart Service
echo -e "${YELLOW}Restarting LootLook...${NC}"
systemctl daemon-reload
systemctl start lootlook

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   LootLook Updated Successfully!        ${NC}"
echo -e "${GREEN}=========================================${NC}"