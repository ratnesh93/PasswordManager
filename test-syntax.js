// Quick syntax test for Chrome extension files
console.log('Testing Chrome extension syntax...');

// Test if files can be loaded without syntax errors
try {
    // Simulate service worker environment
    global.self = global;
    global.chrome = {
        storage: { local: {} },
        runtime: { onMessage: { addListener: () => {} } }
    };
    
    // Load files in order
    require('./src/crypto/bip39-words.js');
    console.log('✅ bip39-words.js loaded');
    
    require('./src/crypto/crypto.js');
    console.log('✅ crypto.js loaded');
    
    require('./src/storage/storage.js');
    console.log('✅ storage.js loaded');
    
    require('./src/auth/session-manager.js');
    console.log('✅ session-manager.js loaded');
    
    require('./src/utils/permission-manager.js');
    console.log('✅ permission-manager.js loaded');
    
    console.log('🎉 All files loaded successfully - no syntax errors!');
    
} catch (error) {
    console.error('❌ Syntax error found:', error.message);
    process.exit(1);
}