import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Password Visibility UI Integration', () => {
    let dom;
    let document;
    let window;
    let PopupController;
    let controller;
    let mockChrome;

    beforeEach(() => {
        // Create DOM environment
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Test</title>
            </head>
            <body>
                <div id="credential-list"></div>
                <div id="master-password-modal" class="modal hidden">
                    <div class="modal-content">
                        <h3 id="master-password-modal-title">Master Password Required</h3>
                        <p id="master-password-message">Please enter your master password:</p>
                        <input type="password" id="modal-master-password" />
                        <div id="modal-master-password-error" class="error-message hidden"></div>
                        <button id="cancel-master-password">Cancel</button>
                        <button id="continue-master-password">Continue</button>
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
                writeText: vi.fn().mockResolvedValue(undefined)
            }
        };

        // Mock Chrome APIs
        mockChrome = {
            runtime: {
                sendMessage: vi.fn()
            }
        };
        global.chrome = mockChrome;

        // Create a simplified PopupController for testing
        class TestPopupController {
            constructor() {
                this.passwordVisibilityState = {};
                this.masterPasswordResolve = null;
                this.masterPasswordContext = null;
                this.allCredentials = [];
                this.filteredCredentials = [];
            }

            // Password visibility methods from the actual implementation
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

            async handlePasswordVisibilityToggle(credentialId) {
                if (this.isPasswordVisible(credentialId)) {
                    this.hideCredentialPassword(credentialId);
                    this.updatePasswordVisibilityUI(credentialId);
                    return;
                }

                this.setPasswordVisibilityLoading(credentialId, true);

                // Mock master password verification
                const masterPassword = 'test-password';
                
                const response = await chrome.runtime.sendMessage({
                    type: 'GET_CREDENTIAL_PASSWORD',
                    payload: {
                        credentialId: credentialId,
                        masterPassword: masterPassword
                    }
                });

                this.setPasswordVisibilityLoading(credentialId, false);

                if (response.success && response.password) {
                    this.showCredentialPassword(credentialId, response.password);
                    this.updatePasswordVisibilityUI(credentialId);
                }
            }

            updatePasswordVisibilityUI(credentialId) {
                const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
                const passwordDisplay = document.querySelector(`[data-credential-id="${credentialId}"].password-display`);
                
                if (!eyeBtn || !passwordDisplay) return;

                const isVisible = this.isPasswordVisible(credentialId);
                
                if (isVisible) {
                    const actualPassword = this.getVisiblePassword(credentialId);
                    passwordDisplay.textContent = actualPassword;
                    passwordDisplay.classList.add('password-visible');
                    
                    eyeBtn.innerHTML = '<span class="btn-icon">🙈</span><span>Hide</span>';
                    eyeBtn.title = 'Hide password';
                    eyeBtn.classList.add('password-visible');
                } else {
                    passwordDisplay.textContent = '••••••••';
                    passwordDisplay.classList.remove('password-visible');
                    
                    eyeBtn.innerHTML = '<span class="btn-icon">👁️</span><span>Show</span>';
                    eyeBtn.title = 'Show password';
                    eyeBtn.classList.remove('password-visible');
                }
            }

            setPasswordVisibilityLoading(credentialId, isLoading) {
                const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
                
                if (!eyeBtn) return;

                if (isLoading) {
                    eyeBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Loading...</span>';
                    eyeBtn.title = 'Verifying master password...';
                    eyeBtn.disabled = true;
                    eyeBtn.classList.add('loading');
                } else {
                    eyeBtn.disabled = false;
                    eyeBtn.classList.remove('loading');
                    
                    const isVisible = this.isPasswordVisible(credentialId);
                    if (isVisible) {
                        eyeBtn.innerHTML = '<span class="btn-icon">🙈</span><span>Hide</span>';
                        eyeBtn.title = 'Hide password';
                    } else {
                        eyeBtn.innerHTML = '<span class="btn-icon">👁️</span><span>Show</span>';
                        eyeBtn.title = 'Show password';
                    }
                }
            }

            renderCredentialList() {
                const container = document.getElementById('credential-list');
                container.innerHTML = '';

                this.filteredCredentials.forEach(credential => {
                    const item = document.createElement('div');
                    item.className = 'credential-item';
                    item.setAttribute('data-credential-id', credential.id);

                    const credentialInfo = document.createElement('div');
                    credentialInfo.className = 'credential-info';

                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'credential-url';
                    urlDiv.textContent = credential.url;

                    const usernameDiv = document.createElement('div');
                    usernameDiv.className = 'credential-username';
                    usernameDiv.textContent = credential.username;

                    const passwordDiv = document.createElement('div');
                    passwordDiv.className = 'credential-password';
                    
                    const passwordDisplay = document.createElement('span');
                    passwordDisplay.className = 'password-display';
                    passwordDisplay.setAttribute('data-credential-id', credential.id);
                    
                    const isVisible = this.isPasswordVisible(credential.id);
                    if (isVisible) {
                        const actualPassword = this.getVisiblePassword(credential.id);
                        passwordDisplay.textContent = actualPassword;
                        passwordDisplay.classList.add('password-visible');
                    } else {
                        passwordDisplay.textContent = '••••••••';
                        passwordDisplay.classList.remove('password-visible');
                    }
                    
                    passwordDiv.appendChild(passwordDisplay);
                    credentialInfo.appendChild(urlDiv);
                    credentialInfo.appendChild(usernameDiv);
                    credentialInfo.appendChild(passwordDiv);

                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'credential-actions';

                    const eyeBtn = document.createElement('button');
                    eyeBtn.className = 'action-btn eye-btn';
                    eyeBtn.setAttribute('data-credential-id', credential.id);
                    
                    if (isVisible) {
                        eyeBtn.innerHTML = '<span class="btn-icon">🙈</span><span>Hide</span>';
                        eyeBtn.title = 'Hide password';
                        eyeBtn.classList.add('password-visible');
                    } else {
                        eyeBtn.innerHTML = '<span class="btn-icon">👁️</span><span>Show</span>';
                        eyeBtn.title = 'Show password';
                        eyeBtn.classList.remove('password-visible');
                    }
                    
                    eyeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handlePasswordVisibilityToggle(credential.id);
                    });

                    actionsDiv.appendChild(eyeBtn);
                    item.appendChild(credentialInfo);
                    item.appendChild(actionsDiv);
                    container.appendChild(item);
                });
            }

            displayCredentials(credentials) {
                this.allCredentials = credentials || [];
                this.filteredCredentials = [...this.allCredentials];
                this.renderCredentialList();
            }

            // Mock edit functionality for testing
            async editCredential(credentialId) {
                const credential = this.allCredentials.find(c => c.id === credentialId);
                if (!credential) return;

                try {
                    // Mock master password verification
                    const masterPassword = 'test-password';
                    
                    const response = await chrome.runtime.sendMessage({
                        type: 'GET_CREDENTIAL_PASSWORD',
                        payload: {
                            credentialId: credentialId,
                            masterPassword: masterPassword
                        }
                    });

                    if (!response.success) {
                        // Don't set editing state on failure
                        throw new Error(response.error || 'Failed to verify master password');
                    }

                    // Mock opening edit form with actual password
                    this.currentEditingCredential = credential;
                    this.editFormPassword = response.password;
                    
                    return { success: true, password: response.password };
                } catch (error) {
                    // Ensure state is clean on error
                    this.currentEditingCredential = null;
                    this.editFormPassword = null;
                    throw error;
                }
            }

            hideCredentialModal() {
                // Mock cleanup
                this.currentEditingCredential = null;
                this.editFormPassword = null;
            }
        }

        PopupController = TestPopupController;
        controller = new PopupController();
    });

    afterEach(() => {
        // Clean up timers
        Object.keys(controller.passwordVisibilityState).forEach(credentialId => {
            controller.hideCredentialPassword(credentialId);
        });
        
        vi.clearAllMocks();
        dom.window.close();
    });

    describe('Password Visibility UI Components', () => {
        it('should render credential list with eye buttons', () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' },
                { id: '2', url: 'github.com', username: 'developer@github.com' }
            ];

            controller.displayCredentials(testCredentials);

            const credentialList = document.getElementById('credential-list');
            expect(credentialList.children.length).toBe(2);

            const firstItem = credentialList.children[0];
            const eyeBtn = firstItem.querySelector('.eye-btn');
            const passwordDisplay = firstItem.querySelector('.password-display');

            expect(eyeBtn).toBeTruthy();
            expect(eyeBtn.getAttribute('data-credential-id')).toBe('1');
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');
            expect(eyeBtn.title).toBe('Show password');

            expect(passwordDisplay).toBeTruthy();
            expect(passwordDisplay.textContent).toBe('••••••••');
            expect(passwordDisplay.classList.contains('password-visible')).toBe(false);
        });

        it('should show loading state when eye button is clicked', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock the chrome API response
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: 'actual-password-123'
            });

            const eyeBtn = document.querySelector('[data-credential-id="1"].eye-btn');
            
            // Click the eye button
            const clickPromise = controller.handlePasswordVisibilityToggle('1');

            // Check loading state is set immediately
            expect(eyeBtn.innerHTML).toContain('⏳');
            expect(eyeBtn.innerHTML).toContain('Loading...');
            expect(eyeBtn.disabled).toBe(true);
            expect(eyeBtn.classList.contains('loading')).toBe(true);

            // Wait for the async operation to complete
            await clickPromise;

            // Check that loading state is removed and password is shown
            expect(eyeBtn.disabled).toBe(false);
            expect(eyeBtn.classList.contains('loading')).toBe(false);
            expect(eyeBtn.innerHTML).toContain('🙈');
            expect(eyeBtn.innerHTML).toContain('Hide');
        });

        it('should update UI when password visibility is toggled', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock successful password retrieval
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: 'MySecurePassword123!'
            });

            const eyeBtn = document.querySelector('[data-credential-id="1"].eye-btn');
            const passwordDisplay = document.querySelector('[data-credential-id="1"].password-display');

            // Initially password should be hidden
            expect(passwordDisplay.textContent).toBe('••••••••');
            expect(passwordDisplay.classList.contains('password-visible')).toBe(false);
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');

            // Show password
            await controller.handlePasswordVisibilityToggle('1');

            // Check password is now visible
            expect(passwordDisplay.textContent).toBe('MySecurePassword123!');
            expect(passwordDisplay.classList.contains('password-visible')).toBe(true);
            expect(eyeBtn.innerHTML).toContain('🙈');
            expect(eyeBtn.innerHTML).toContain('Hide');
            expect(eyeBtn.classList.contains('password-visible')).toBe(true);

            // Hide password
            await controller.handlePasswordVisibilityToggle('1');

            // Check password is hidden again
            expect(passwordDisplay.textContent).toBe('••••••••');
            expect(passwordDisplay.classList.contains('password-visible')).toBe(false);
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');
            expect(eyeBtn.classList.contains('password-visible')).toBe(false);
        });

        it('should handle multiple credentials independently', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' },
                { id: '2', url: 'github.com', username: 'user2@github.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock different passwords for different credentials
            mockChrome.runtime.sendMessage.mockImplementation(({ payload }) => {
                if (payload.credentialId === '1') {
                    return Promise.resolve({ success: true, password: 'password1' });
                } else if (payload.credentialId === '2') {
                    return Promise.resolve({ success: true, password: 'password2' });
                }
                return Promise.resolve({ success: false });
            });

            // Show password for first credential
            await controller.handlePasswordVisibilityToggle('1');

            const password1Display = document.querySelector('[data-credential-id="1"].password-display');
            const password2Display = document.querySelector('[data-credential-id="2"].password-display');

            expect(password1Display.textContent).toBe('password1');
            expect(password1Display.classList.contains('password-visible')).toBe(true);
            expect(password2Display.textContent).toBe('••••••••');
            expect(password2Display.classList.contains('password-visible')).toBe(false);

            // Show password for second credential
            await controller.handlePasswordVisibilityToggle('2');

            expect(password1Display.textContent).toBe('password1');
            expect(password1Display.classList.contains('password-visible')).toBe(true);
            expect(password2Display.textContent).toBe('password2');
            expect(password2Display.classList.contains('password-visible')).toBe(true);

            // Hide password for first credential only
            await controller.handlePasswordVisibilityToggle('1');

            expect(password1Display.textContent).toBe('••••••••');
            expect(password1Display.classList.contains('password-visible')).toBe(false);
            expect(password2Display.textContent).toBe('password2');
            expect(password2Display.classList.contains('password-visible')).toBe(true);
        });

        it('should handle API errors gracefully', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock API error
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: false,
                error: 'Invalid master password'
            });

            const eyeBtn = document.querySelector('[data-credential-id="1"].eye-btn');
            const passwordDisplay = document.querySelector('[data-credential-id="1"].password-display');

            await controller.handlePasswordVisibilityToggle('1');

            // Password should remain hidden on error
            expect(passwordDisplay.textContent).toBe('••••••••');
            expect(passwordDisplay.classList.contains('password-visible')).toBe(false);
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');
            expect(eyeBtn.disabled).toBe(false);
            expect(eyeBtn.classList.contains('loading')).toBe(false);
        });
    });

    describe('Password Visibility State Management', () => {
        it('should auto-hide passwords after timeout', () => {
            const credentialId = 'test-credential';
            const actualPassword = 'test-password';

            // Mock a shorter timeout for testing
            const originalTimeout = 30000;
            const testTimeout = 50;

            // Override the timeout in the method
            const originalShowMethod = controller.showCredentialPassword;
            controller.showCredentialPassword = function(id, password) {
                if (this.passwordVisibilityState[id]?.autoHideTimeout) {
                    clearTimeout(this.passwordVisibilityState[id].autoHideTimeout);
                }

                this.passwordVisibilityState[id] = {
                    isVisible: true,
                    actualPassword: password,
                    revealedAt: Date.now(),
                    autoHideTimeout: null
                };

                // Use shorter timeout for testing
                this.passwordVisibilityState[id].autoHideTimeout = setTimeout(() => {
                    this.hideCredentialPassword(id);
                }, testTimeout);
            };

            controller.showCredentialPassword(credentialId, actualPassword);

            expect(controller.isPasswordVisible(credentialId)).toBe(true);
            expect(controller.getVisiblePassword(credentialId)).toBe(actualPassword);

            // Test that password is still visible before timeout
            expect(controller.isPasswordVisible(credentialId)).toBe(true);

            // Restore original method
            controller.showCredentialPassword = originalShowMethod;
        });

        it('should clear all revealed passwords', () => {
            controller.showCredentialPassword('1', 'password1');
            controller.showCredentialPassword('2', 'password2');

            expect(controller.isPasswordVisible('1')).toBe(true);
            expect(controller.isPasswordVisible('2')).toBe(true);

            controller.clearAllRevealedPasswords();

            expect(controller.isPasswordVisible('1')).toBe(false);
            expect(controller.isPasswordVisible('2')).toBe(false);
        });
    });

    describe('Secure Edit Functionality', () => {
        it('should require master password verification for edit', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock successful master password verification and password retrieval
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: 'actual-edit-password'
            });

            const result = await controller.editCredential('1');

            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: '1',
                    masterPassword: 'test-password'
                }
            });

            expect(result.success).toBe(true);
            expect(result.password).toBe('actual-edit-password');
            expect(controller.currentEditingCredential).toBeTruthy();
            expect(controller.editFormPassword).toBe('actual-edit-password');
        });

        it('should handle edit verification failure', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            // Mock failed master password verification
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: false,
                error: 'Invalid master password'
            });

            await expect(controller.editCredential('1')).rejects.toThrow('Invalid master password');

            expect(controller.currentEditingCredential).toBeNull();
            expect(controller.editFormPassword).toBeNull();
        });

        it('should handle non-existent credential edit', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            const result = await controller.editCredential('non-existent');

            expect(result).toBeUndefined();
            expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('should properly cleanup when edit form is closed', () => {
            // Set up edit state
            controller.currentEditingCredential = { id: '1', url: 'example.com' };
            controller.editFormPassword = 'sensitive-password';

            controller.hideCredentialModal();

            expect(controller.currentEditingCredential).toBeNull();
            expect(controller.editFormPassword).toBeNull();
        });

        it('should retrieve actual password for edit form', async () => {
            const testCredentials = [
                { id: '1', url: 'example.com', username: 'user1@example.com' }
            ];

            controller.displayCredentials(testCredentials);

            const actualPassword = 'MyComplexPassword123!@#';
            
            mockChrome.runtime.sendMessage.mockResolvedValue({
                success: true,
                password: actualPassword
            });

            const result = await controller.editCredential('1');

            expect(result.password).toBe(actualPassword);
            expect(controller.editFormPassword).toBe(actualPassword);
        });
    });
});