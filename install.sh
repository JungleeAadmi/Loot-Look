#!/bin/bash
# LootLook Installer Script
# Usage: sudo bash install.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Starting LootLook Installation...${NC}"

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root.${NC}" 
   exit 1
fi

# Update & Install System Deps
apt-get update && apt-get upgrade -y
apt-get install -y curl git build-essential postgresql postgresql-contrib

# Install Node.js 20
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Setup DB (Interactive)
DB_USER="lootlook"
DB_NAME="lootlook_db"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    read -sp "Enter DB Password: " DB_PASS
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi

# Install App Deps
APP_DIR="/opt/lootlook"
mkdir -p $APP_DIR
# (In real deployment, git clone goes here)

echo "Installing Dependencies..."
# Note: You would run npm install inside backend/frontend here in a real script

echo -e "${GREEN}Installation Complete!${NC}"