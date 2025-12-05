#!/bin/bash

# LootLook Uninstall Script
# Usage: sudo bash uninstall.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/lootlook"
BACKUP_DIR="/root/lootlook_backups"

echo -e "${RED}--- WARNING: LOOTLOOK UNINSTALLER ---${NC}"

# 1. Root Check
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root.${NC}" 
   exit 1
fi

# 2. Load Config for Database Access
if [ -f "$APP_DIR/backend/.env" ]; then
    # Extract DB Connection String
    DB_URL=$(grep DATABASE_URL "$APP_DIR/backend/.env" | cut -d '=' -f2)
    # Extract Password using regex
    DB_PASS=$(echo $DB_URL | sed -r 's/.*:([^@]+)@.*/\1/')
else
    echo -e "${YELLOW}Warning: Configuration file missing. Cannot auto-detect database credentials.${NC}"
fi

# 3. Backup Prompt
echo -e "\n${YELLOW}Do you want to BACKUP your data (Database + Screenshots) before uninstalling? (y/n)${NC}"
read -r DO_BACKUP

if [[ "$DO_BACKUP" =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Creating backup...${NC}"
    mkdir -p $BACKUP_DIR
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    # Export Database
    echo "Dumping database..."
    if [ ! -z "$DB_PASS" ]; then
        PGPASSWORD=$DB_PASS pg_dump -U lootlook -h localhost lootlook_db > "$BACKUP_DIR/db_dump_$TIMESTAMP.sql"
    else
        echo -e "${RED}Skipping DB dump (No credentials found).${NC}"
    fi

    # Archive Screenshots
    echo "Archiving screenshots..."
    if [ -d "$APP_DIR/backend/public/screenshots" ]; then
        tar -czf "$BACKUP_DIR/screenshots_$TIMESTAMP.tar.gz" -C "$APP_DIR/backend/public" screenshots
    fi

    echo -e "${GREEN}Backup saved to: $BACKUP_DIR${NC}"
fi

# 4. Confirmation
echo -e "\n${RED}Are you sure you want to completely uninstall LootLook App? (y/n)${NC}"
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

# 5. Remove App & Service
echo -e "${YELLOW}Stopping and removing service...${NC}"
systemctl stop lootlook
systemctl disable lootlook
rm -f /etc/systemd/system/lootlook.service
systemctl daemon-reload

echo -e "${YELLOW}Removing application files...${NC}"
rm -rf $APP_DIR

# 6. Database Cleanup Prompt
echo -e "\n${RED}Do you also want to DELETE the database and user 'lootlook'? (y/n)${NC}"
read -r DELETE_DB

if [[ "$DELETE_DB" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Dropping database and user...${NC}"
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS lootlook_db;"
    sudo -u postgres psql -c "DROP USER IF EXISTS lootlook;"
    echo -e "${GREEN}Database deleted.${NC}"
else
    echo -e "${GREEN}Database preserved.${NC}"
fi

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   LootLook Uninstalled.                 ${NC}"
echo -e "${GREEN}=========================================${NC}"