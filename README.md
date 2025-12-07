
## 🛍️ LootLook (Self-Hosted Price Tracker)

**The Smart Bookmark Manager that secretly saves you money.**

LootLook is an *AI made* private, self-hosted web application that masquerades as a beautiful bookmark manager. While it organizes your links with rich previews and glassmorphism UI, its core engine silently monitors e-commerce links in the background.

When prices drop, LootLook notifies you instantly via Push Notifications, tracks the history, calculates trends, and visualizes the data. It even uses Optical Character Recognition (OCR) to read prices from screenshots when standard scraping fails.

*Version: 1.0.0 (Gold)*

License: MIT

## ✨ Features

**🕵️‍♂️ Intelligent Tracking**

"Trojan Horse" Mode: Add any link. If it's a product, LootLook detects it and starts tracking. If not, it's just a beautiful bookmark.

Hybrid Scraper: Uses JSON-LD (Metadata), CSS Selectors, and Visual AI (OCR) to find prices even on difficult sites.

Headful Stealth: Runs a real desktop browser engine (inside a virtual X11 display) to bypass anti-bot protections on sites.

**🔔 Smart Notifications (Ntfy)**

Instant Alerts: Get push notifications on your phone (iOS/Android) via the Ntfy app.

Granular Control: Toggle alerts for:

📉 Price Drops: "Headphones dropped by ₹2,000!"

📈 Price Hikes: Know when a deal ends.

**🎁 Sharing: "@user shared a link with you."**

✅ Sync Status: "12-Hour Scan Complete."

Multi-User Routing: Each user can have their own private notification channel.

**📸 Visual Intelligence**

High-Res Snips: Captures full 1080x1920 mobile screenshots of the product page.

On-Demand OCR: Click the "Scan" button to force the server to read the price directly from the image text if the website code changes.

**🌍 Global Support**

Multi-Currency: Automatically detects and displays symbols for ₹, $, €, £, ¥, AED, and more.

Timezone Smart: Automatically adapts dates to your local device time (IST, EST, PST, etc.).

**🤝 Collaborative Shopping**

Share & Sync: Share bookmarks with other users on your server.

Sender/Receiver Tags: Clear visual indicators (FROM @user, TO @user).

Auto-Sync: Background polling keeps your mobile and desktop sessions in sync instantly.

## 🚀 Installation (One-Line Command) ##

LootLook is designed for LXC Containers (Proxmox/LXD) running Ubuntu 24.04 / 25.04.

## Requirements: 2GB or more RAM recommended (for Headful Chrome + OCR).

***Run this single command as root to Install LootLook:***
```
curl -O [https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/install.sh](https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/install.sh) && sudo bash install.sh
```

What this script installs:

Node.js 20 & PostgreSQL

Chromium & Xvfb (Virtual Display)

Tesseract OCR (for image scanning)

Systemd Service (for 24/7 uptime)

## 🔄 Updates & Maintenance

**To Update: (Safely backups DB & Screenshots, then pulls latest code)**
```
curl -O [https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/update.sh](https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/update.sh) && sudo bash update.sh
```

## To Uninstall:
```
curl -O [https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/uninstall.sh](https://raw.githubusercontent.com/JungleeAadmi/Loot-Look/main/uninstall.sh) && sudo bash uninstall.sh
```

## 🛠️ Configuration

Port: 3000 (Default)

Check Interval: Every 12 Hours (Managed by internal Cron)

Database: PostgreSQL (Internal)

Data Path: /opt/lootlook/

Setting up Notifications (Ntfy)

Install the Ntfy App on your phone.

Subscribe to a unique topic (e.g., loot_rahul).

In LootLook, click the Bell Icon 🔔.

Enter your Ntfy Server URL (e.g., https://ntfy.sh or self-hosted) and your Topic name.

Click Test to verify.

## 🔮 Roadmap

[ ] Collections: Organize bookmarks into folders.

[ ] Browser Extension: One-click add from Chrome.

[ ] Price History Graph: Enhanced analytics.

## ⚠️ Disclaimer

This tool is for personal use only. Scraping e-commerce websites may violate their Terms of Service. The developers of LootLook are not responsible for IP bans or account suspensions resulting from excessive scraping. Use responsibly.

Built with ❤️ by JungleeAadmi



