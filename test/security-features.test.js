// Security Features Test Suite
// Tests for task 6: Add security features and error handling

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock Chrome APIs
global.chrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

describe('Security Features and Error Handling', () => {
    let dom;
    let document;
    let window;
    let PopupController;

    beforeEach(async () => {
        // Create DOM environment
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Test</title>
            </head>
            <body>
                <div id="app">
                    <div id="loading" class="hidden">Loading...</div>
                    <div id="auth-container" class="hidden">
                        <div id="auth-choice" class="hidden">Auth Choice</div>
                        <div id="login-form" class="hidden">Login Form</div>
                        <div id="signup-form" class="hidden">Signup Form</div>
                        <div id="key-phrase-display" class="hidden">Key Phrase</div>
                    </div>
                    <div id="main-container" class="hidden">
                        <div id="credential-list"></div>
                        <div id="no-credentials" class="hidden">No credentials</div>
                    </div>
                    
                    <!-- Master Password Modal -->
                    <div id="master-password-modal" class="modal hidden">
                        <div class="modal-content">
                            <h3 id="master-password-modal-title">Master Password Required</h3>
                            <p id="master-password-message">Please enter your master password:</p>
                            <input type="password" id="modal-master-password" />
                            <div id="modal-master-password-error" class="field-error hidden"></div>
                            <div id="master-password-attempts" class="hidden"></div>
                            <button id="continue-master-password">Continue</button>
                            <button id="cancel-master-password">Cancel</button>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `, { 
            url: 'chrome-extension://test/',
            pretendToBeVisual: true,
            resources: 'usable'
        });

        document = dom.window.document;
        window = dom.window;
        
        // Set up global objects
        global.document = document;
        global.window = window;
        global.navigator = {
            clipboard: {
                writeText: vi.fn().mockResolvedValue()
            }
        };
        global.sessionStorage = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn()
        };

        // Import PopupController
        const module = await import('../src/popup/popup.js');
        PopupController = module.PopupController;
    });

    afterEach(() => {
        vi.clearAllMocks();
        dom?.window?.close();
    });

    describe('Session-based Verification Expiry', () => {
        it('should set session verification expiry after successful verification', () => {
            const controller = new PopupController();
            const beforeTime = Date.now();
            
            controller.setSessionVerificationExpiry();
            
            expect(controller.sessionVerificationExpiry).toBeGreaterThan(beforeTime);
            expect(controller.sessionVerificationExpiry).toBeLessThanOrEqual(beforeTime + controller.sessionVerificationDuration);
        });

        it('should detect expired session verification', () => {
            const controller = new PopupController();
            
            // Initially should be expired (no verification set)
            expect(controller.isSessionVerificationExpired()).toBe(true);
            
            // Set verification and should not be expired
            controller.setSessionVerificationExpiry();
            expect(controller.isSessionVerificationExpired()).toBe(false);
            
            // Manually expire the session
            controller.sessionVerificationExpiry = Date.now() - 1000;
            expect(controller.isSessionVerificationExpired()).toBe(true);
        });

        it('should clear session verification', () => {
            const controller = new PopupController();
            
            controller.setSessionVerificationExpiry();
            expect(controller.sessionVerificationExpiry).not.toBeNull();
            
            controller.clearSessionVerification();
            expect(controller.sessionVerificationExpiry).toBeNull();
        });

        it('should check if verification is required', () => {
            const controller = new PopupController();
            
            // Should require verification initially
            expect(controller.isVerificationRequired()).toBe(true);
            
            // Should not require verification after setting it
            controller.setSessionVerificationExpiry();
            expect(controller.isVerificationRequired()).toBe(false);
            
            // Should require verification when locked out
            controller.masterPasswordLockoutUntil = Date.now() + 60000;
            expect(controller.isVerificationRequired()).toBe(true);
        });
    });

    describe('Automatic Password Masking', () => {
        it('should automatically hide passwords after timeout', () => {
            const controller = new PopupController();
            const credentialId = 'test-credential-1';
            const actualPassword = 'test-password-123';
            
            // Mock the UI update method
            controller.updatePasswordVisibilityUI = vi.fn();
            controller.showTemporaryMessage = vi.fn();
            
            // Show password with short timeout for testing
            controller.showCredentialPassword(credentialId, actualPassword);
            
            // Manually trigger timeout (normally 30 seconds)
            const timeoutId = controller.passwordVisibilityState[credentialId].autoHideTimeout;
            expect(timeoutId).toBeDefined();
            
            // Clear the timeout and manually call the timeout function
            clearTimeout(timeoutId);
            controller.hideCredentialPassword(credentialId);
            controller.updatePasswordVisibilityUI(credentialId);
            controller.showTemporaryMessage('Password automatically hidden after 30 seconds for security', 3000, 'info');
            
            // Verify password was hidden
            expect(controller.isPasswordVisible(credentialId)).toBe(false);
            expect(controller.updatePasswordVisibilityUI).toHaveBeenCalledWith(credentialId);
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                'Password automatically hidden after 30 seconds for security',
                3000,
                'info'
            );
        });

        it('should clear all revealed passwords on session expiry', () => {
            const controller = new PopupController();
            
            // Mock the showTemporaryMessage method after creating controller
            const showMessageSpy = vi.fn();
            controller.showTemporaryMessage = showMessageSpy;
            
            // Set up multiple revealed passwords
            controller.showCredentialPassword('cred1', 'pass1');
            controller.showCredentialPassword('cred2', 'pass2');
            
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(2);
            
            // Expire the session
            controller.sessionVerificationExpiry = Date.now() - 1000;
            
            // Check session expiry - this should clear passwords and show message
            controller.checkSessionExpiry();
            
            // All passwords should be cleared
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(0);
            expect(showMessageSpy).toHaveBeenCalledWith(
                'Session expired. All passwords have been hidden for security.',
                5000,
                'warning'
            );
        });
    });

    describe('Enhanced Error Messages', () => {
        it('should show clear error messages for verification failures', () => {
            const controller = new PopupController();
            controller.showTemporaryMessage = vi.fn();
            controller.showFieldError = vi.fn();
            controller.updateAttemptDisplay = vi.fn();
            
            // Mock password field - add to the existing modal in DOM
            const passwordField = document.getElementById('modal-master-password');
            passwordField.value = 'wrong-password';
            
            // First failed attempt
            controller.handleFailedVerification();
            
            expect(controller.masterPasswordAttempts).toBe(1);
            expect(controller.showFieldError).toHaveBeenCalledWith(
                'modal-master-password-error',
                'Incorrect master password. 2 attempts remaining before temporary lockout.'
            );
            expect(passwordField.value).toBe('');
            
            // Second failed attempt
            controller.handleFailedVerification();
            
            expect(controller.masterPasswordAttempts).toBe(2);
            expect(controller.showFieldError).toHaveBeenCalledWith(
                'modal-master-password-error',
                'Incorrect master password. 1 attempt remaining before temporary lockout.'
            );
            
            // Third failed attempt (lockout)
            controller.handleFailedVerification();
            
            expect(controller.masterPasswordAttempts).toBe(3);
            expect(controller.showFieldError).toHaveBeenCalledWith(
                'modal-master-password-error',
                'Too many failed attempts. Access locked for 5 minutes for security.'
            );
            expect(controller.isLockedOut()).toBe(true);
        });

        it('should show different message types with appropriate styling', () => {
            const controller = new PopupController();
            
            // Test error message
            controller.showTemporaryMessage('Error message', 5000, 'error');
            let notification = document.querySelector('.temporary-notification.error');
            expect(notification).toBeTruthy();
            expect(notification.textContent).toBe('Error message');
            expect(notification.getAttribute('role')).toBe('alert');
            expect(notification.getAttribute('aria-live')).toBe('assertive');
            
            // Clean up
            notification.remove();
            
            // Test warning message
            controller.showTemporaryMessage('Warning message', 3000, 'warning');
            notification = document.querySelector('.temporary-notification.warning');
            expect(notification).toBeTruthy();
            expect(notification.textContent).toBe('Warning message');
            expect(notification.getAttribute('role')).toBe('alert');
            
            // Clean up
            notification.remove();
            
            // Test info message
            controller.showTemporaryMessage('Info message', 3000, 'info');
            notification = document.querySelector('.temporary-notification.info');
            expect(notification).toBeTruthy();
            expect(notification.textContent).toBe('Info message');
            expect(notification.getAttribute('role')).toBe('status');
            expect(notification.getAttribute('aria-live')).toBe('polite');
        });
    });

    describe('Security Cleanup on Popup Close', () => {
        it('should perform comprehensive security cleanup', () => {
            const controller = new PopupController();
            
            // Set up some sensitive data
            controller.showCredentialPassword('cred1', 'password1');
            controller.setSessionVerificationExpiry();
            controller.masterPasswordAttempts = 1;
            controller.sessionExpiryCheckInterval = setInterval(() => {}, 1000);
            
            // Mock form fields - add to existing DOM structure
            const masterPasswordField = document.createElement('input');
            masterPasswordField.id = 'master-password';
            masterPasswordField.value = 'sensitive-password';
            document.body.appendChild(masterPasswordField);
            
            const modalPasswordField = document.getElementById('modal-master-password');
            modalPasswordField.value = 'another-password';
            
            // Perform cleanup
            controller.performSecurityCleanup();
            
            // Verify cleanup
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(0);
            expect(controller.sessionVerificationExpiry).toBeNull();
            expect(controller.masterPasswordAttempts).toBe(0);
            expect(controller.sessionExpiryCheckInterval).toBeNull();
            expect(masterPasswordField.value).toBe('');
            expect(modalPasswordField.value).toBe('');
        });

        it('should clear sensitive data from all form fields', () => {
            const controller = new PopupController();
            
            // Create various form fields with sensitive data
            const fields = [
                { id: 'master-password', value: 'master123' },
                { id: 'new-master-password', value: 'newmaster123' },
                { id: 'confirm-master-password', value: 'newmaster123' },
                { id: 'modal-master-password', value: 'modal123' },
                { id: 'credential-password', value: 'credpass123' },
                { id: 'export-key-phrase', value: 'export phrase' },
                { id: 'import-key-phrase', value: 'import phrase' },
                { id: 'delete-master-password', value: 'delete123' }
            ];
            
            fields.forEach(field => {
                const element = document.createElement('input');
                element.id = field.id;
                element.value = field.value;
                document.body.appendChild(element);
            });
            
            // Clear sensitive data
            controller.clearSensitiveData();
            
            // Verify all fields are cleared
            fields.forEach(field => {
                const element = document.getElementById(field.id);
                expect(element.value).toBe('');
            });
        });
    });

    describe('Lockout State Handling', () => {
        it('should prevent actions when locked out', async () => {
            const controller = new PopupController();
            controller.showTemporaryMessage = vi.fn();
            
            // Set lockout state
            controller.masterPasswordLockoutUntil = Date.now() + 300000; // 5 minutes
            
            // Try to toggle password visibility
            await controller.handlePasswordVisibilityToggle('test-credential');
            
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                expect.stringContaining('Access locked. Please wait'),
                5000,
                'error'
            );
        });

        it('should show lockout message in master password modal', () => {
            const controller = new PopupController();
            controller.showTemporaryMessage = vi.fn();
            
            // Set lockout state
            controller.masterPasswordLockoutUntil = Date.now() + 300000; // 5 minutes
            
            // Try to show master password modal
            const result = controller.showMasterPasswordModal('Test message');
            
            expect(result).resolves.toBeNull();
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                expect.stringContaining('Access temporarily locked'),
                5000,
                'error'
            );
        });
    });

    describe('Session Expiry Monitoring', () => {
        it('should set up periodic session expiry checks', () => {
            const controller = new PopupController();
            
            // Mock setInterval
            const originalSetInterval = global.setInterval;
            global.setInterval = vi.fn().mockReturnValue(12345);
            
            // Setup security listeners (which includes session monitoring)
            controller.setupSecurityListeners();
            
            expect(global.setInterval).toHaveBeenCalledWith(
                expect.any(Function),
                30000 // 30 seconds
            );
            
            // Restore original setInterval
            global.setInterval = originalSetInterval;
        });

        it('should clear intervals on cleanup', () => {
            const controller = new PopupController();
            
            // Set up interval
            controller.sessionExpiryCheckInterval = setInterval(() => {}, 1000);
            const intervalId = controller.sessionExpiryCheckInterval;
            
            // Perform cleanup
            controller.performSecurityCleanup();
            
            expect(controller.sessionExpiryCheckInterval).toBeNull();
        });
    });
});