// Debug script for key phrase confirmation issue
// Add this to popup.js temporarily to debug the issue

console.log('=== KEY PHRASE DEBUG SCRIPT LOADED ===');

// Override the original methods to add debugging
const originalPopupController = window.PopupController;

if (originalPopupController) {
    const originalCheckAuthState = originalPopupController.prototype.checkAuthState;
    const originalCheckPendingKeyPhrase = originalPopupController.prototype.checkPendingKeyPhrase;
    const originalConfirmKeyPhrase = originalPopupController.prototype.confirmKeyPhrase;
    const originalShowKeyPhrase = originalPopupController.prototype.showKeyPhrase;

    // Debug checkAuthState
    originalPopupController.prototype.checkAuthState = async function() {
        console.log('🔍 DEBUG: checkAuthState called');
        console.log('🔍 DEBUG: this.currentKeyPhrase:', this.currentKeyPhrase);
        
        const keyPhraseConfirmed = sessionStorage.getItem('keyPhraseConfirmed');
        const pendingKeyPhrase = sessionStorage.getItem('pendingKeyPhrase');
        
        console.log('🔍 DEBUG: keyPhraseConfirmed from sessionStorage:', keyPhraseConfirmed);
        console.log('🔍 DEBUG: pendingKeyPhrase from sessionStorage:', pendingKeyPhrase ? 'exists' : 'null');
        
        return originalCheckAuthState.call(this);
    };

    // Debug checkPendingKeyPhrase
    originalPopupController.prototype.checkPendingKeyPhrase = function() {
        console.log('🔍 DEBUG: checkPendingKeyPhrase called');
        
        const pendingKeyPhrase = sessionStorage.getItem('pendingKeyPhrase');
        const keyPhraseConfirmed = sessionStorage.getItem('keyPhraseConfirmed');
        
        console.log('🔍 DEBUG: pendingKeyPhrase:', pendingKeyPhrase ? 'exists' : 'null');
        console.log('🔍 DEBUG: keyPhraseConfirmed:', keyPhraseConfirmed);
        
        const result = originalCheckPendingKeyPhrase.call(this);
        
        console.log('🔍 DEBUG: After checkPendingKeyPhrase, this.currentKeyPhrase:', this.currentKeyPhrase);
        
        return result;
    };

    // Debug confirmKeyPhrase
    originalPopupController.prototype.confirmKeyPhrase = async function() {
        console.log('🔍 DEBUG: confirmKeyPhrase called');
        
        const result = await originalConfirmKeyPhrase.call(this);
        
        console.log('🔍 DEBUG: After confirmKeyPhrase, keyPhraseConfirmed:', sessionStorage.getItem('keyPhraseConfirmed'));
        console.log('🔍 DEBUG: After confirmKeyPhrase, pendingKeyPhrase:', sessionStorage.getItem('pendingKeyPhrase'));
        
        return result;
    };

    // Debug showKeyPhrase
    originalPopupController.prototype.showKeyPhrase = function(keyPhrase) {
        console.log('🔍 DEBUG: showKeyPhrase called with:', keyPhrase ? keyPhrase.length + ' words' : 'null');
        
        const result = originalShowKeyPhrase.call(this, keyPhrase);
        
        console.log('🔍 DEBUG: After showKeyPhrase, sessionStorage pendingKeyPhrase:', sessionStorage.getItem('pendingKeyPhrase') ? 'set' : 'null');
        console.log('🔍 DEBUG: After showKeyPhrase, sessionStorage keyPhraseConfirmed:', sessionStorage.getItem('keyPhraseConfirmed'));
        
        return result;
    };

    console.log('🔍 DEBUG: PopupController methods overridden for debugging');
}

// Add event listener to log when popup is opened
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 DEBUG: DOMContentLoaded fired');
    console.log('🔍 DEBUG: Current sessionStorage state:');
    console.log('  - pendingKeyPhrase:', sessionStorage.getItem('pendingKeyPhrase') ? 'exists' : 'null');
    console.log('  - keyPhraseConfirmed:', sessionStorage.getItem('keyPhraseConfirmed'));
});

// Log when popup is about to close
window.addEventListener('beforeunload', () => {
    console.log('🔍 DEBUG: Popup closing, sessionStorage state:');
    console.log('  - pendingKeyPhrase:', sessionStorage.getItem('pendingKeyPhrase') ? 'exists' : 'null');
    console.log('  - keyPhraseConfirmed:', sessionStorage.getItem('keyPhraseConfirmed'));
});

// Add a global function to check current state
window.debugKeyPhraseState = function() {
    console.log('🔍 DEBUG: Current Key Phrase State:');
    console.log('  - pendingKeyPhrase:', sessionStorage.getItem('pendingKeyPhrase'));
    console.log('  - keyPhraseConfirmed:', sessionStorage.getItem('keyPhraseConfirmed'));
    
    if (window.popupController) {
        console.log('  - popupController.currentKeyPhrase:', window.popupController.currentKeyPhrase);
    }
    
    // Check which UI section is visible
    const authContainer = document.getElementById('auth-container');
    const mainContainer = document.getElementById('main-container');
    const keyPhraseDisplay = document.getElementById('key-phrase-display');
    
    console.log('  - UI State:');
    console.log('    - auth-container visible:', !authContainer?.classList.contains('hidden'));
    console.log('    - main-container visible:', !mainContainer?.classList.contains('hidden'));
    console.log('    - key-phrase-display visible:', !keyPhraseDisplay?.classList.contains('hidden'));
};

console.log('🔍 DEBUG: You can call debugKeyPhraseState() in console to check current state');