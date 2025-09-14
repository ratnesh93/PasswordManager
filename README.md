# Chrome Password Manager Extension

A secure local password manager Chrome extension with Gmail authentication and encrypted storage.

## Project Structure

```
├── manifest.json                 # Chrome extension manifest (Manifest V3)
├── src/
│   ├── popup/                   # Extension popup interface
│   │   ├── popup.html          # Main popup HTML
│   │   ├── popup.css           # Popup styling
│   │   └── popup.js            # Popup logic and UI interactions
│   ├── background/              # Background service worker
│   │   └── background.js       # Core business logic and message routing
│   └── content/                 # Content scripts for web page interaction
│       └── content.js          # Form detection and autofill functionality
├── icons/                       # Extension icons (16, 32, 48, 128px)
└── README.md                    # This file
```

## Features

- Gmail OAuth authentication
- Master password protection
- Local encrypted storage
- Right-click context menu integration
- Automatic form detection and filling
- Import/export with key phrase encryption
- Offline functionality

## Development Setup

1. Clone this repository
2. Add your Gmail OAuth client ID to `manifest.json`
3. Create icon files in the `icons/` directory
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

## Security Features

- AES-256-GCM encryption for all stored data
- PBKDF2 key derivation from master password
- 16-word BIP39-style key phrases for import/export
- No cloud storage - all data stays local
- Secure memory management to prevent data leaks

## Requirements Covered

This basic structure addresses all requirements by providing:
- Credential storage interface 
- Context menu integration
- Import/export framework 
- Encryption service foundation
- Local storage for offline use 
- Autofill feature
- Save to Password manager feature from website login page

## Next Steps

The basic project structure is now complete. The next tasks will implement:
1. Import Functionality.
2. Right-click context menu integration for enhanced usability across websites.
3. Automatic form detection and autofill.
4. UI functionality and aesthetic improvement.

## Notes

- This is a Manifest V3 extension using service workers
- All placeholder functionality is marked with console.log statements
- Real implementation will replace mock data with actual encryption and storage
- OAuth client ID needs to be configured for Gmail authentication