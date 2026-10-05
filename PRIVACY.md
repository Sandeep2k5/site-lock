# Site Lock Privacy Policy

_Last updated: October 5, 2026_

Site Lock is a browser extension that password-protects websites you choose. This policy explains what data it handles.

## What Site Lock stores

All of the following is stored **only on your device**, in your browser's extension storage:

- **Your password, as a hash.** Site Lock never stores your password itself. It stores a salted PBKDF2-SHA256 hash, which is used only to check the password you type.
- **Your list of locked sites** (domain names such as `example.com`).
- **Your settings**, such as how long a site stays unlocked.
- **Which sites are unlocked right now.** This is kept in session storage and erased when the browser closes.

## What Site Lock does not do

- It does not send any data to the developer or to any third party.
- It does not collect browsing history, analytics, or personal information.
- It does not use cookies, trackers, or advertising.
- It does not sell or share data.

## Permissions

Site Lock reads the address of the page you are opening only to decide whether that site is on your lock list. That check happens locally and the address is not recorded or transmitted.

## Deleting your data

Removing the extension from your browser deletes all of the data above.

## Contact

Questions about this policy: [open an issue on GitHub](https://github.com/Sandeep2k5/site-lock/issues).
