#!/bin/bash

# LootLook Robust Update Script v2
# Usage: sudo bash update.sh

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/lootlook"
BACKUP_DIR="/tmp/lootlook_update_backup_$(date +%s)"
REPO_URL="https://github.com/JungleeAadmi/Loot-Look.git"

echo -e "${GREEN}--- STARTING ROBUST LOOTLOOK UPDATE ---${NC}"

# 1. Root Check
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root.${NC}" 
   exit 1
fi

# 2. Preparation & Backup
echo -e "${YELLOW}Creating temporary backup of user data...${NC}"
mkdir -p "$BACKUP_DIR"

# 2a. Backup Config (.env)
if [ -f "$APP_DIR/backend/.env" ]; then
    cp "$APP_DIR/backend/.env" "$BACKUP_DIR/.env"
else
    echo -e "${RED}Error: Configuration file missing! Cannot proceed safely.${NC}"
    exit 1
fi

# 2b. Backup Screenshots
if [ -d "$APP_DIR/backend/public/screenshots" ]; then
    cp -r "$APP_DIR/backend/public/screenshots" "$BACKUP_DIR/screenshots"
fi

# 2c. Backup Database (Critical)
echo "Dumping database..."
# Extract password from .env for pg_dump
DB_URL=$(grep DATABASE_URL "$APP_DIR/backend/.env" | cut -d '=' -f2)
DB_PASS=$(echo $DB_URL | sed -r 's/.*:([^@]+)@.*/\1/')

if [ ! -z "$DB_PASS" ]; then
    PGPASSWORD=$DB_PASS pg_dump -U lootlook -h localhost lootlook_db > "$BACKUP_DIR/db_dump.sql"
    echo "Database dumped successfully."
else
    echo -e "${RED}Warning: Could not read DB password. Skipping DB dump (unsafe).${NC}"
    exit 1
fi

# 3. Stop Service & Clean Old Files
echo -e "${YELLOW}Stopping service and cleaning old files...${NC}"
systemctl stop lootlook
# We remove the directory to force a clean git clone (solves conflict issues)
rm -rf "$APP_DIR"

# 4. Re-Clone & Rebuild
echo -e "${YELLOW}Downloading fresh code...${NC}"
git clone "$REPO_URL" "$APP_DIR"

echo -e "${YELLOW}Installing dependencies...${NC}"
cd "$APP_DIR/backend"
npm install --production

# Fix node-cron mismatch automatically if package.json is old
npm list node-cron || npm install node-cron

cd "$APP_DIR/frontend"
npm install
npm run build

# 5. Restore User Data
echo -e "${YELLOW}Restoring user data...${NC}"

# 5a. Restore Config
cp "$BACKUP_DIR/.env" "$APP_DIR/backend/.env"

# 5b. Restore Screenshots
mkdir -p "$APP_DIR/backend/public"
if [ -d "$BACKUP_DIR/screenshots" ]; then
    cp -r "$BACKUP_DIR/screenshots" "$APP_DIR/backend/public/"
    # Fix permissions
    chmod -R 755 "$APP_DIR/backend/public/screenshots"
fi

# 5c. Restore Database (Optional but safe)
# Note: We technically don't need to restore the DB dump because the Postgres server
# wasn't touched by deleting the app folder. The data is still safely in Postgres.
# But we keep the dump in $BACKUP_DIR just in case.
echo "Database data preserved in Postgres (Backup dump saved at $BACKUP_DIR/db_dump.sql just in case)."

# 6. Restart Service
echo -e "${YELLOW}Restarting LootLook...${NC}"
systemctl daemon-reload
systemctl enable lootlook
systemctl start lootlook

# 7. Cleanup
# rm -rf "$BACKUP_DIR" # Uncomment to auto-delete backup, or keep it for safety
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}   Update Complete! Data Restored.       ${NC}"
echo -e "${GREEN}=========================================${NC}"