// Password Visibility Integration Test Suite
// Comprehensive end-to-end tests for the complete password visibility workflow

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock Chrome APIs
global.chrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

describe('Password Visibility Integration Tests', () => {
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

                    <!-- Credential Modal -->
                    <div id="credential-modal" class="modal hidden">
                        <div class="modal-content">
                            <h3 id="modal-title">Add New Credential</h3>
                            <form id="credential-form">
                                <input type="text" id="credential-url" placeholder="Website/Service" />
                                <input type="text" id="credential-username" placeholder="Username/Email" />
                                <input type="password" id="credential-password" placeholder="Password" />
                                <button type="submit" id="save-credential">
                                    <span id="save-btn-text">Save Credential</span>
                                </button>
                            </form>
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

    describe('Complete Password Visibility Workflow', () => {
        it('should handle complete password reveal workflow with security features', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API responses
            chrome.runtime.sendMessage.mockImplementation((message) => {
                if (message.type === 'GET_CREDENTIAL_PASSWORD') {
                    return Promise.resolve({
                        success: true,
                        password: 'actual-secret-password-123'
                    });
                }
                return Promise.resolve({ success: true });
            });

            // Mock credentials data
            const mockCredentials = [
                {
                    id: 'cred-1',
                    url: 'https://example.com',
                    username: 'user@example.com',
                    password: '••••••••'
                },
                {
                    id: 'cred-2', 
                    url: 'https://test.com',
                    username: 'testuser',
                    password: '••••••••'
                }
            ];

            // Set up credentials in controller
            controller.allCredentials = mockCredentials;
            controller.filteredCredentials = [...mockCredentials];

            // Render credential list
            controller.renderCredentialList();

            // Verify credentials are rendered
            const credentialItems = document.querySelectorAll('.credential-item');
            expect(credentialItems).toHaveLength(2);

            // Find eye button for first credential
            const eyeBtn = document.querySelector('[data-credential-id="cred-1"].eye-btn');
            expect(eyeBtn).toBeTruthy();
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');

            // Mock master password modal interaction
            let masterPasswordResolve;
            controller.showMasterPasswordModal = vi.fn().mockImplementation(() => {
                return new Promise((resolve) => {
                    masterPasswordResolve = resolve;
                    // Simulate user entering master password
                    setTimeout(() => resolve('correct-master-password'), 100);
                });
            });

            // Mock UI update methods
            controller.updatePasswordVisibilityUI = vi.fn();
            controller.setPasswordVisibilityLoading = vi.fn();

            // Click eye button to reveal password
            const clickPromise = controller.handlePasswordVisibilityToggle('cred-1');

            // Wait for the workflow to complete
            await clickPromise;

            // Verify master password modal was shown
            expect(controller.showMasterPasswordModal).toHaveBeenCalledWith(
                'Please enter your master password to view this password:',
                'password-reveal'
            );

            // Verify Chrome API was called with correct parameters
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: 'cred-1',
                    masterPassword: 'correct-master-password'
                }
            });

            // Verify password is now visible in state
            expect(controller.isPasswordVisible('cred-1')).toBe(true);
            expect(controller.getVisiblePassword('cred-1')).toBe('actual-secret-password-123');

            // Verify session verification was set
            expect(controller.sessionVerificationExpiry).toBeTruthy();
            expect(controller.sessionVerificationExpiry).toBeGreaterThan(Date.now());

            // Verify UI was updated
            expect(controller.updatePasswordVisibilityUI).toHaveBeenCalledWith('cred-1');

            // Verify auto-hide timeout was set
            const passwordState = controller.passwordVisibilityState['cred-1'];
            expect(passwordState.autoHideTimeout).toBeTruthy();
        });

        it('should handle failed master password verification with proper error handling', async () => {
            const controller = new PopupController();
            
            // Mock failed Chrome API response
            chrome.runtime.sendMessage.mockResolvedValue({
                success: false,
                error: 'Invalid master password'
            });

            // Mock master password modal
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('wrong-password');
            
            // Mock UI methods
            controller.setPasswordVisibilityLoading = vi.fn();
            controller.showTemporaryMessage = vi.fn();
            controller.handleFailedVerification = vi.fn();

            // Attempt to reveal password
            await controller.handlePasswordVisibilityToggle('cred-1');

            // Verify error handling was called
            expect(controller.handleFailedVerification).toHaveBeenCalled();
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                'Invalid master password',
                5000,
                'error'
            );

            // Verify password is not visible
            expect(controller.isPasswordVisible('cred-1')).toBe(false);
        });

        it('should handle lockout state correctly', async () => {
            const controller = new PopupController();
            
            // Set lockout state
            controller.masterPasswordLockoutUntil = Date.now() + 300000; // 5 minutes
            
            // Mock UI methods
            controller.showTemporaryMessage = vi.fn();

            // Attempt to reveal password while locked out
            await controller.handlePasswordVisibilityToggle('cred-1');

            // Verify lockout message was shown
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                expect.stringContaining('Access locked'),
                5000,
                'error'
            );

            // Verify Chrome API was not called for password retrieval (only CHECK_AUTH_STATE during init)
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'GET_CREDENTIAL_PASSWORD'
                })
            );
        });

        it('should handle secure edit workflow with password visibility', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API responses
            chrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: 'actual-edit-password-456'
            });

            // Mock credentials
            const mockCredential = {
                id: 'edit-cred-1',
                url: 'https://edit-example.com',
                username: 'edit-user@example.com',
                password: '••••••••'
            };

            controller.allCredentials = [mockCredential];

            // Mock master password modal
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('correct-master-password');

            // Mock UI methods
            controller.showTemporaryMessage = vi.fn();

            // Call edit credential
            await controller.editCredential('edit-cred-1');

            // Verify master password modal was shown for edit
            expect(controller.showMasterPasswordModal).toHaveBeenCalledWith(
                'Please enter your master password to edit this credential:',
                'credential-edit'
            );

            // Verify Chrome API was called
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: 'edit-cred-1',
                    masterPassword: 'correct-master-password'
                }
            });

            // Verify session verification was set
            expect(controller.sessionVerificationExpiry).toBeTruthy();

            // Verify current editing credential was set
            expect(controller.currentEditingCredential).toEqual(mockCredential);

            // Verify password field would be populated with actual password
            const passwordField = document.getElementById('credential-password');
            expect(passwordField.value).toBe('actual-edit-password-456');
        });

        it('should handle session expiry and automatic password clearing', () => {
            const controller = new PopupController();
            
            // Set up revealed passwords
            controller.showCredentialPassword('cred-1', 'password1');
            controller.showCredentialPassword('cred-2', 'password2');
            
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(2);

            // Mock showTemporaryMessage
            controller.showTemporaryMessage = vi.fn();

            // Expire the session
            controller.sessionVerificationExpiry = Date.now() - 1000;

            // Check session expiry
            controller.checkSessionExpiry();

            // Verify all passwords were cleared
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(0);

            // Verify warning message was shown
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                'Session expired. All passwords have been hidden for security.',
                5000,
                'warning'
            );
        });

        it('should handle comprehensive security cleanup on popup close', () => {
            const controller = new PopupController();
            
            // Set up various sensitive data
            controller.showCredentialPassword('cred-1', 'sensitive-password');
            controller.setSessionVerificationExpiry();
            controller.masterPasswordAttempts = 2;
            controller.sessionExpiryCheckInterval = setInterval(() => {}, 1000);

            // Add form fields with sensitive data
            const masterPasswordField = document.createElement('input');
            masterPasswordField.id = 'master-password';
            masterPasswordField.value = 'master-secret';
            document.body.appendChild(masterPasswordField);

            const modalPasswordField = document.getElementById('modal-master-password');
            modalPasswordField.value = 'modal-secret';

            // Perform security cleanup
            controller.performSecurityCleanup();

            // Verify all sensitive data was cleared
            expect(Object.keys(controller.passwordVisibilityState)).toHaveLength(0);
            expect(controller.sessionVerificationExpiry).toBeNull();
            expect(controller.masterPasswordAttempts).toBe(0);
            expect(controller.sessionExpiryCheckInterval).toBeNull();
            expect(masterPasswordField.value).toBe('');
            expect(modalPasswordField.value).toBe('');
        });

        it('should handle multiple credentials with independent password visibility', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API to return different passwords
            chrome.runtime.sendMessage.mockImplementation((message) => {
                if (message.payload.credentialId === 'cred-1') {
                    return Promise.resolve({ success: true, password: 'password-one' });
                } else if (message.payload.credentialId === 'cred-2') {
                    return Promise.resolve({ success: true, password: 'password-two' });
                }
                return Promise.resolve({ success: false });
            });

            // Mock master password modal
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('master-password');
            
            // Mock UI methods
            controller.updatePasswordVisibilityUI = vi.fn();
            controller.setPasswordVisibilityLoading = vi.fn();

            // Reveal first credential password
            await controller.handlePasswordVisibilityToggle('cred-1');
            
            // Reveal second credential password
            await controller.handlePasswordVisibilityToggle('cred-2');

            // Verify both passwords are visible with correct values
            expect(controller.isPasswordVisible('cred-1')).toBe(true);
            expect(controller.isPasswordVisible('cred-2')).toBe(true);
            expect(controller.getVisiblePassword('cred-1')).toBe('password-one');
            expect(controller.getVisiblePassword('cred-2')).toBe('password-two');

            // Hide first password
            controller.hideCredentialPassword('cred-1');

            // Verify only first password is hidden
            expect(controller.isPasswordVisible('cred-1')).toBe(false);
            expect(controller.isPasswordVisible('cred-2')).toBe(true);
            expect(controller.getVisiblePassword('cred-2')).toBe('password-two');
        });

        it('should handle copy password workflow with master password verification', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API responses
            chrome.runtime.sendMessage.mockImplementation((message) => {
                if (message.type === 'GET_CREDENTIAL_PASSWORD') {
                    return Promise.resolve({
                        success: true,
                        password: 'copy-password-789'
                    });
                }
                return Promise.resolve({ success: true });
            });

            // Mock master password modal
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('master-password');
            
            // Mock UI methods
            controller.showTemporaryMessage = vi.fn();

            // Set up credential
            controller.allCredentials = [{
                id: 'copy-cred-1',
                url: 'https://copy-example.com',
                username: 'copy-user',
                password: '••••••••'
            }];

            // Call copy password
            await controller.copyPassword('copy-cred-1');

            // Verify master password modal was shown
            expect(controller.showMasterPasswordModal).toHaveBeenCalledWith(
                'Please enter your master password to copy this password:',
                'copy'
            );

            // Verify Chrome API was called with the new method
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: 'copy-cred-1',
                    masterPassword: 'master-password'
                }
            });

            // Verify clipboard write was called
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy-password-789');

            // Verify success message was shown
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith('Password copied to clipboard!', 3000, 'success');
        });
    });

    describe('Error Scenarios and Edge Cases', () => {
        it('should handle Chrome API communication errors gracefully', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API to throw error
            chrome.runtime.sendMessage.mockRejectedValue(new Error('Communication failed'));

            // Mock UI methods
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('master-password');
            controller.setPasswordVisibilityLoading = vi.fn();
            controller.showTemporaryMessage = vi.fn();

            // Attempt to reveal password
            await controller.handlePasswordVisibilityToggle('cred-1');

            // Verify error handling
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                'Error retrieving password. Please try again.',
                5000,
                'error'
            );

            // Verify loading state was cleared
            expect(controller.setPasswordVisibilityLoading).toHaveBeenCalledWith('cred-1', false);
        });

        it('should handle user cancellation of master password modal', async () => {
            const controller = new PopupController();
            
            // Mock master password modal to return null (user cancelled)
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue(null);
            
            // Mock UI methods
            controller.setPasswordVisibilityLoading = vi.fn();

            // Attempt to reveal password
            await controller.handlePasswordVisibilityToggle('cred-1');

            // Verify Chrome API was not called for password retrieval (only CHECK_AUTH_STATE during init)
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'GET_CREDENTIAL_PASSWORD'
                })
            );

            // Verify loading state was cleared
            expect(controller.setPasswordVisibilityLoading).toHaveBeenCalledWith('cred-1', false);

            // Verify password is not visible
            expect(controller.isPasswordVisible('cred-1')).toBe(false);
        });

        it('should handle non-existent credential gracefully', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API to return credential not found
            chrome.runtime.sendMessage.mockResolvedValue({
                success: false,
                error: 'Credential not found'
            });

            // Mock UI methods
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('master-password');
            controller.setPasswordVisibilityLoading = vi.fn();
            controller.showTemporaryMessage = vi.fn();
            controller.handleFailedVerification = vi.fn();

            // Attempt to reveal non-existent credential
            await controller.handlePasswordVisibilityToggle('non-existent-cred');

            // Verify error handling
            expect(controller.handleFailedVerification).toHaveBeenCalled();
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith(
                'Credential not found',
                5000,
                'error'
            );
        });

        it('should handle rapid successive password visibility toggles', async () => {
            const controller = new PopupController();
            
            // Mock Chrome API
            chrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: 'test-password'
            });

            // Mock UI methods
            controller.showMasterPasswordModal = vi.fn().mockResolvedValue('master-password');
            controller.updatePasswordVisibilityUI = vi.fn();
            controller.setPasswordVisibilityLoading = vi.fn();

            // Rapid successive calls
            const promise1 = controller.handlePasswordVisibilityToggle('cred-1');
            const promise2 = controller.handlePasswordVisibilityToggle('cred-1');
            const promise3 = controller.handlePasswordVisibilityToggle('cred-1');

            // Wait for all to complete
            await Promise.all([promise1, promise2, promise3]);

            // Verify the system handled rapid calls gracefully
            // (exact behavior may vary, but should not crash)
            expect(controller.setPasswordVisibilityLoading).toHaveBeenCalled();
        });
    });
});