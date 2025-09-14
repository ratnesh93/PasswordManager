#!/usr/bin/env node

/**
 * Development Setup Script
 * Switches between development and production configurations
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const mode = args[0] || 'dev';

console.log(`🔧 Setting up Chrome Password Manager in ${mode} mode...`);

if (mode === 'dev') {
    // Copy development manifest
    if (fs.existsSync('manifest-dev.json')) {
        fs.copyFileSync('manifest-dev.json', 'manifest.json');
        console.log('✅ Copied development manifest');
    }
    
    // Update background service to use mock OAuth
    const backgroundPath = 'src/background/background.js';
    if (fs.existsSync(backgroundPath)) {
        let content = fs.readFileSync(backgroundPath, 'utf8');
        content = content.replace('const USE_MOCK_OAUTH = false;', 'const USE_MOCK_OAUTH = true;');
        fs.writeFileSync(backgroundPath, content);
        console.log('✅ Enabled mock OAuth in background service');
    }
    
    console.log(`
🎉 Development mode setup complete!

Next steps:
1. Open Chrome and go to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked" and select this folder
4. Click the extension icon to test

The extension will now use mock authentication instead of real Gmail OAuth.
Mock user: developer@example.com
    `);
    
} else if (mode === 'prod') {
    // Restore production manifest
    if (fs.existsSync('manifest.json.backup')) {
        fs.copyFileSync('manifest.json.backup', 'manifest.json');
        console.log('✅ Restored production manifest');
    }
    
    // Update background service to use real OAuth
    const backgroundPath = 'src/background/background.js';
    if (fs.existsSync(backgroundPath)) {
        let content = fs.readFileSync(backgroundPath, 'utf8');
        content = content.replace('const USE_MOCK_OAUTH = true;', 'const USE_MOCK_OAUTH = false;');
        fs.writeFileSync(backgroundPath, content);
        console.log('✅ Enabled real OAuth in background service');
    }
    
    console.log(`
🚀 Production mode setup complete!

Remember to:
1. Set up Google OAuth Client ID in manifest.json
2. Configure proper permissions
3. Test thoroughly before publishing
    `);
    
} else {
    console.log(`
Usage: node setup-dev.js [mode]

Modes:
  dev  - Setup for development (mock OAuth)
  prod - Setup for production (real OAuth)

Example:
  node setup-dev.js dev
    `);
}