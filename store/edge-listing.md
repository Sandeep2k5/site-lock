# Edge Add-ons submission: Site Lock 1.1.0

Paste-ready text for Partner Center (https://partner.microsoft.com/dashboard/microsoftedge).
Upload `dist/site-lock-1.1.0.zip` (build it with `tools/package.ps1`).

## Properties

- **Category:** Productivity
- **Privacy policy required:** Yes
- **Privacy policy URL:** https://github.com/Sandeep2k5/site-lock/blob/main/PRIVACY.md
- **Website URL:** https://github.com/Sandeep2k5/site-lock
- **Support contact:** https://github.com/Sandeep2k5/site-lock/issues
- **Mature content:** No

## Availability

- **Visibility:** Public
- **Markets:** All markets

## Store listing (English)

**Display name:** Site Lock (comes from `manifest.json`)

**Short description** (from `manifest.json`):

> Lock Instagram, WhatsApp and any site you choose behind a password, even if you forget to lock your laptop.

**Description:**

```
Put a password on any website.

Site Lock locks Instagram, WhatsApp and any site you choose behind a password. If you walk away and forget to lock your laptop, your chats stay private anyway. No account. No servers. No tracking.

HOW IT WORKS
1. Click the Site Lock icon and create a password.
2. Open a site you want to protect, click the icon, and choose "Lock this site".
3. Next time the site opens, you see a lock screen. Type the password to continue.

FEATURES
• Blocks before it loads: locked sites are redirected before the page appears, so nothing shows on screen.
• Re-locks itself: unlocked sites lock again after 5, 15, 30 or 60 minutes, or when you close Edge.
• Locks when you walk away: everything locks when your screen locks, the laptop sleeps, or after 1 to 10 minutes without input.
• Lock everything at once: press Alt+Shift+L or click "Lock all now".
• Covers subdomains: lock youtube.com and m.youtube.com and music.youtube.com are locked too.
• Locks open tabs: tabs already showing a site switch to the lock screen straight away.
• Settings need the password: removing a site, changing the timer or changing the password all ask for it.
• Hard to get around: the Back button is covered, and repeated wrong passwords make you wait longer each time.

PRIVATE BY DESIGN
Your password is never stored. Only a salted PBKDF2-SHA256 hash is saved, and it stays on your device. Site Lock sends no data anywhere and has no analytics.

Open source (MIT): https://github.com/Sandeep2k5/site-lock
```

**Search terms** (max 7):

```
password
site blocker
lock website
privacy
parental control
focus
block sites
```

**Logo:** `store/logo-300.png` (300×300)

**Screenshots** (1280×800):

1. `docs/hero.png`: a locked tab showing the password screen
2. `docs/popup.png`: the popup asking to lock a site, and the settings

## Notes for certification

```
HOW TO TEST
1. Click the Site Lock toolbar icon and create a password (at least 4 characters), e.g. "test1234".
2. Open https://www.youtube.com, click the icon and choose "Lock this site". The tab switches to the lock screen.
3. Reload or open youtube.com in a new tab: the lock screen appears. Enter "test1234" to open the site.
4. Click "Lock all now" (or press Alt+Shift+L): youtube.com locks again.
5. "Sites and settings" lets you remove sites, set the re-lock timer, auto-lock and change the password. Each asks for the password.

WHY EACH PERMISSION IS NEEDED
• host_permissions <all_urls>: the user can lock any website they choose, so the extension must be able to redirect any site to its lock screen and switch already-open tabs of that site to the lock screen. Page addresses are checked locally and never recorded or sent anywhere.
• declarativeNetRequest: redirects locked sites to the lock page before they load.
• scripting: injects a small guard into tabs that were already open when a site was locked, so they show the lock screen too (also covers back/forward cache).
• storage: saves the password hash, locked-site list and settings on the device.
• alarms: re-locks unlocked sites after the chosen timer.
• idle: locks all sites when the screen locks or after the chosen idle time.
• favicon: shows each locked site's icon in the popup and lock screen, from the browser's own icon cache.

The extension makes no network requests and collects no data. Source code: https://github.com/Sandeep2k5/site-lock
```
