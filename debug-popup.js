// Debug script to test popup functionality
console.log('🔧 Debug script loaded');

// Test if popup controller is working
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, testing popup...');
    
    // Check if elements exist
    const elements = [
        'loading',
        'auth-container', 
        'auth-choice',
        'show-login',
        'show-signup',
        'gmail-login',
        'gmail-signup'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Element ${id}:`, element ? '✅ Found' : '❌ Missing');
    });
    
    // Test Gmail login button
    const gmailLoginBtn = document.getElementById('gmail-login');
    if (gmailLoginBtn) {
        gmailLoginBtn.addEventListener('click', () => {
            console.log('🔧 Gmail login clicked - testing...');
            
            // Test message sending
            chrome.runtime.sendMessage({
                type: 'GMAIL_AUTH',
                payload: { mode: 'login' }
            }).then(response => {
                console.log('🔧 Gmail auth response:', response);
            }).catch(error => {
                console.error('🔧 Gmail auth error:', error);
            });
        });
    }
});

// Test background service connection
chrome.runtime.sendMessage({
    type: 'CHECK_AUTH_STATE'
}).then(response => {
    console.log('🔧 Auth state check:', response);
}).catch(error => {
    console.error('🔧 Auth state error:', error);
});