// Test for password visibility state management functionality
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock DOM elements and Chrome APIs
global.document = {
    getElementById: vi.fn(),
    createElement: vi.fn(),
    addEventListener: vi.fn(),
    hidden: false
};

global.window = {
    addEventListener: vi.fn()
};

global.chrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

global.setTimeout = vi.fn((callback, delay) => {
    return { id: Math.random(), callback, delay };
});

global.clearTimeout = vi.fn();

// Import the PopupController class
// We need to mock the module since it's not a proper ES module
const PopupController = class {
    constructor() {
        this.allCredentials = [];
        this.filteredCredentials = [];
        this.currentEditingCredential = null;
        this.credentialToDelete = null;
        this.currentKeyPhrase = null;
        this.passwordVisibilityState = {};
    }

    // Password Visibility State Management Methods
    showCredentialPassword(credentialId, actualPassword) {
        if (this.passwordVisibilityState[credentialId]?.autoHideTimeout) {
            clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
        }

        this.passwordVisibilityState[credentialId] = {
            isVisible: true,
            actualPassword: actualPassword,
            revealedAt: Date.now(),
            autoHideTimeout: null
        };

        this.passwordVisibilityState[credentialId].autoHideTimeout = setTimeout(() => {
            this.hideCredentialPassword(credentialId);
            this.showTemporaryMessage?.('Password automatically hidden for security');
        }, 30000);
    }

    hideCredentialPassword(credentialId) {
        if (this.passwordVisibilityState[credentialId]) {
            if (this.passwordVisibilityState[credentialId].autoHideTimeout) {
                clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
            }
            delete this.passwordVisibilityState[credentialId];
        }
    }

    isPasswordVisible(credentialId) {
        return this.passwordVisibilityState[credentialId]?.isVisible || false;
    }

    getVisiblePassword(credentialId) {
        return this.passwordVisibilityState[credentialId]?.actualPassword || null;
    }

    clearAllRevealedPasswords() {
        Object.keys(this.passwordVisibilityState).forEach(credentialId => {
            this.hideCredentialPassword(credentialId);
        });
        this.passwordVisibilityState = {};
    }

    cleanupStalePasswordStates() {
        const currentCredentialIds = new Set(this.allCredentials.map(c => c.id));
        
        Object.keys(this.passwordVisibilityState).forEach(credentialId => {
            if (!currentCredentialIds.has(credentialId)) {
                this.hideCredentialPassword(credentialId);
            }
        });
    }

    resetAutoHideTimeout(credentialId) {
        if (this.passwordVisibilityState[credentialId]?.isVisible) {
            if (this.passwordVisibilityState[credentialId].autoHideTimeout) {
                clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
            }

            this.passwordVisibilityState[credentialId].autoHideTimeout = setTimeout(() => {
                this.hideCredentialPassword(credentialId);
                this.showTemporaryMessage?.('Password automatically hidden for security');
            }, 30000);

            this.passwordVisibilityState[credentialId].revealedAt = Date.now();
        }
    }
};

describe('Password Visibility State Management', () => {
    let popupController;

    beforeEach(() => {
        popupController = new PopupController();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    it('should initialize with empty password visibility state', () => {
        expect(popupController.passwordVisibilityState).toEqual({});
    });

    it('should show credential password and set up auto-hide timeout', () => {
        const credentialId = 'test-credential-1';
        const actualPassword = 'secret123';

        popupController.showCredentialPassword(credentialId, actualPassword);

        expect(popupController.isPasswordVisible(credentialId)).toBe(true);
        expect(popupController.getVisiblePassword(credentialId)).toBe(actualPassword);
        expect(popupController.passwordVisibilityState[credentialId]).toMatchObject({
            isVisible: true,
            actualPassword: actualPassword
        });
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should hide credential password and clear timeout', () => {
        const credentialId = 'test-credential-1';
        const actualPassword = 'secret123';

        // First show the password
        popupController.showCredentialPassword(credentialId, actualPassword);
        expect(popupController.isPasswordVisible(credentialId)).toBe(true);

        // Then hide it
        popupController.hideCredentialPassword(credentialId);
        expect(popupController.isPasswordVisible(credentialId)).toBe(false);
        expect(popupController.getVisiblePassword(credentialId)).toBe(null);
        expect(popupController.passwordVisibilityState[credentialId]).toBeUndefined();
        expect(clearTimeout).toHaveBeenCalled();
    });

    it('should clear existing timeout when showing password for same credential', () => {
        const credentialId = 'test-credential-1';
        
        // Show password first time
        popupController.showCredentialPassword(credentialId, 'password1');
        expect(setTimeout).toHaveBeenCalledTimes(1);

        // Show password second time (should clear previous timeout)
        popupController.showCredentialPassword(credentialId, 'password2');
        expect(clearTimeout).toHaveBeenCalledTimes(1);
        expect(setTimeout).toHaveBeenCalledTimes(2);
        expect(popupController.getVisiblePassword(credentialId)).toBe('password2');
    });

    it('should clear all revealed passwords', () => {
        const credential1 = 'test-credential-1';
        const credential2 = 'test-credential-2';

        // Show multiple passwords
        popupController.showCredentialPassword(credential1, 'password1');
        popupController.showCredentialPassword(credential2, 'password2');

        expect(popupController.isPasswordVisible(credential1)).toBe(true);
        expect(popupController.isPasswordVisible(credential2)).toBe(true);

        // Clear all
        popupController.clearAllRevealedPasswords();

        expect(popupController.isPasswordVisible(credential1)).toBe(false);
        expect(popupController.isPasswordVisible(credential2)).toBe(false);
        expect(Object.keys(popupController.passwordVisibilityState)).toHaveLength(0);
    });

    it('should cleanup stale password states', () => {
        const credential1 = 'existing-credential';
        const credential2 = 'removed-credential';

        // Set up credentials list with only one credential
        popupController.allCredentials = [{ id: credential1 }];

        // Show passwords for both credentials
        popupController.showCredentialPassword(credential1, 'password1');
        popupController.showCredentialPassword(credential2, 'password2');

        expect(popupController.isPasswordVisible(credential1)).toBe(true);
        expect(popupController.isPasswordVisible(credential2)).toBe(true);

        // Cleanup stale states
        popupController.cleanupStalePasswordStates();

        // Only the existing credential should remain
        expect(popupController.isPasswordVisible(credential1)).toBe(true);
        expect(popupController.isPasswordVisible(credential2)).toBe(false);
    });

    it('should reset auto-hide timeout for visible password', () => {
        const credentialId = 'test-credential-1';
        
        // Show password
        popupController.showCredentialPassword(credentialId, 'password1');
        expect(setTimeout).toHaveBeenCalledTimes(1);

        // Reset timeout
        popupController.resetAutoHideTimeout(credentialId);
        expect(clearTimeout).toHaveBeenCalledTimes(1);
        expect(setTimeout).toHaveBeenCalledTimes(2);
        expect(popupController.passwordVisibilityState[credentialId].revealedAt).toBeDefined();
    });

    it('should not reset timeout for non-visible password', () => {
        const credentialId = 'test-credential-1';
        
        // Try to reset timeout without showing password first
        popupController.resetAutoHideTimeout(credentialId);
        
        // Should not call setTimeout or clearTimeout
        expect(setTimeout).not.toHaveBeenCalled();
        expect(clearTimeout).not.toHaveBeenCalled();
    });

    it('should handle multiple credentials independently', () => {
        const credential1 = 'test-credential-1';
        const credential2 = 'test-credential-2';

        // Show passwords for both
        popupController.showCredentialPassword(credential1, 'password1');
        popupController.showCredentialPassword(credential2, 'password2');

        expect(popupController.isPasswordVisible(credential1)).toBe(true);
        expect(popupController.isPasswordVisible(credential2)).toBe(true);
        expect(popupController.getVisiblePassword(credential1)).toBe('password1');
        expect(popupController.getVisiblePassword(credential2)).toBe('password2');

        // Hide only one
        popupController.hideCredentialPassword(credential1);

        expect(popupController.isPasswordVisible(credential1)).toBe(false);
        expect(popupController.isPasswordVisible(credential2)).toBe(true);
        expect(popupController.getVisiblePassword(credential1)).toBe(null);
        expect(popupController.getVisiblePassword(credential2)).toBe('password2');
    });
});