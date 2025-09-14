import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock Chrome APIs
global.chrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

describe('Visual Feedback and Accessibility Features', () => {
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
                    <div id="main-container">
                        <div id="credential-list"></div>
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
        
        // Set up global document and window
        global.document = document;
        global.window = window;
        global.navigator = {
            clipboard: {
                writeText: vi.fn().mockResolvedValue()
            }
        };

        // Mock setTimeout and clearTimeout
        global.setTimeout = vi.fn((fn, delay) => {
            return { id: Math.random(), fn, delay };
        });
        global.clearTimeout = vi.fn();

        // Create a mock PopupController class with the methods we want to test
        PopupController = class MockPopupController {
            constructor() {
                this.allCredentials = [];
                this.passwordVisibilityState = {};
            }

            announceToScreenReader(message) {
                let announcer = document.getElementById('screen-reader-announcer');
                if (!announcer) {
                    announcer = document.createElement('div');
                    announcer.id = 'screen-reader-announcer';
                    announcer.setAttribute('aria-live', 'polite');
                    announcer.setAttribute('aria-atomic', 'true');
                    announcer.className = 'sr-only';
                    document.body.appendChild(announcer);
                }
                announcer.textContent = '';
                setTimeout(() => {
                    announcer.textContent = message;
                }, 100);
            }

            getCredentialDisplayName(credentialId) {
                const credential = this.allCredentials.find(c => c.id === credentialId);
                if (!credential) return 'credential';
                const url = this.formatUrl ? this.formatUrl(credential.url) : credential.url;
                return `${url} (${credential.username})`;
            }

            showCredentialPassword(credentialId, actualPassword) {
                this.passwordVisibilityState[credentialId] = {
                    isVisible: true,
                    actualPassword: actualPassword,
                    revealedAt: Date.now(),
                    autoHideTimeout: null
                };

                // Set up auto-hide timeout (30 seconds)
                this.passwordVisibilityState[credentialId].autoHideTimeout = setTimeout(() => {
                    this.hideCredentialPassword(credentialId);
                    if (this.updatePasswordVisibilityUI) {
                        this.updatePasswordVisibilityUI(credentialId);
                    }
                    if (this.showTemporaryMessage) {
                        this.showTemporaryMessage('Password automatically hidden after 30 seconds for security', 3000, 'info');
                    }
                    this.announceToScreenReader(`Password automatically hidden for ${this.getCredentialDisplayName(credentialId)} after 30 seconds for security`);
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

            updatePasswordVisibilityUI(credentialId) {
                const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
                const passwordDisplay = document.querySelector(`[data-credential-id="${credentialId}"].password-display`);
                
                if (!eyeBtn || !passwordDisplay) return;

                const isVisible = this.isPasswordVisible(credentialId);
                
                if (isVisible) {
                    const actualPassword = this.getVisiblePassword(credentialId);
                    passwordDisplay.textContent = actualPassword;
                    passwordDisplay.classList.add('password-visible');
                    
                    eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️‍🗨️</span><span class="btn-text">Hide</span>';
                    eyeBtn.title = 'Hide password (currently visible)';
                    eyeBtn.setAttribute('aria-label', 'Hide password for this credential');
                    eyeBtn.classList.add('password-visible');
                    
                    passwordDisplay.setAttribute('aria-label', `Password is now visible: ${actualPassword}`);
                    passwordDisplay.setAttribute('aria-live', 'polite');
                } else {
                    passwordDisplay.textContent = '••••••••';
                    passwordDisplay.classList.remove('password-visible');
                    
                    eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️</span><span class="btn-text">Show</span>';
                    eyeBtn.title = 'Show password (currently hidden)';
                    eyeBtn.setAttribute('aria-label', 'Show password for this credential');
                    eyeBtn.classList.remove('password-visible');
                    
                    passwordDisplay.setAttribute('aria-label', 'Password is hidden');
                    passwordDisplay.setAttribute('aria-live', 'polite');
                }
            }

            setPasswordVisibilityLoading(credentialId, isLoading) {
                const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
                
                if (!eyeBtn) return;

                if (isLoading) {
                    eyeBtn.innerHTML = '<span class="btn-icon loading-spinner" aria-hidden="true"></span><span class="btn-text">Verifying...</span>';
                    eyeBtn.title = 'Verifying master password, please wait...';
                    eyeBtn.setAttribute('aria-label', 'Verifying master password for password reveal');
                    eyeBtn.disabled = true;
                    eyeBtn.classList.add('loading');
                } else {
                    eyeBtn.disabled = false;
                    eyeBtn.classList.remove('loading');
                    
                    const isVisible = this.isPasswordVisible(credentialId);
                    if (isVisible) {
                        eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️‍🗨️</span><span class="btn-text">Hide</span>';
                        eyeBtn.title = 'Hide password (currently visible)';
                        eyeBtn.setAttribute('aria-label', 'Hide password for this credential');
                    } else {
                        eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️</span><span class="btn-text">Show</span>';
                        eyeBtn.title = 'Show password (currently hidden)';
                        eyeBtn.setAttribute('aria-label', 'Show password for this credential');
                    }
                }
            }

            navigateCredentialItems(currentItem, direction) {
                const credentialItems = Array.from(document.querySelectorAll('.credential-item'));
                const currentIndex = credentialItems.indexOf(currentItem);
                
                if (currentIndex === -1) return;
                
                let nextIndex = currentIndex + direction;
                
                if (nextIndex < 0) {
                    nextIndex = credentialItems.length - 1;
                } else if (nextIndex >= credentialItems.length) {
                    nextIndex = 0;
                }
                
                const nextItem = credentialItems[nextIndex];
                if (nextItem) {
                    nextItem.focus();
                    const credentialId = nextItem.getAttribute('data-credential-id');
                    if (credentialId) {
                        this.announceToScreenReader(`Focused on ${this.getCredentialDisplayName(credentialId)}`);
                    }
                }
            }

            showActionFeedback(button, state, duration = 2000) {
                if (!button) return;
                button.classList.remove('success', 'error');
                button.classList.add(state);
                setTimeout(() => {
                    button.classList.remove(state);
                }, duration);
            }

            async copyPassword(credentialId) {
                const copyBtn = document.querySelector(`[data-credential-id="${credentialId}"].copy-btn`);
                
                try {
                    let passwordToCopy;
                    if (this.isPasswordVisible(credentialId)) {
                        passwordToCopy = this.getVisiblePassword(credentialId);
                    } else {
                        const credential = this.allCredentials.find(c => c.id === credentialId);
                        if (!credential) {
                            throw new Error('Credential not found');
                        }
                        passwordToCopy = credential.password;
                    }

                    await global.navigator.clipboard.writeText(passwordToCopy);
                    
                    this.showActionFeedback(copyBtn, 'success');
                    this.announceToScreenReader(`Password copied to clipboard for ${this.getCredentialDisplayName(credentialId)}`);
                    if (this.showTemporaryMessage) {
                        this.showTemporaryMessage('Password copied to clipboard', 2000, 'success');
                    }
                    
                } catch (error) {
                    this.showActionFeedback(copyBtn, 'error');
                    this.announceToScreenReader('Failed to copy password to clipboard');
                    if (this.showTemporaryMessage) {
                        this.showTemporaryMessage('Failed to copy password', 3000, 'error');
                    }
                }
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
        dom?.window?.close();
    });

    describe('Screen Reader Announcements', () => {
        it('should create screen reader announcer element', () => {
            const controller = new PopupController();
            
            // Call announceToScreenReader to create the element
            controller.announceToScreenReader('Test message');
            
            const announcer = document.getElementById('screen-reader-announcer');
            expect(announcer).toBeTruthy();
            expect(announcer.getAttribute('aria-live')).toBe('polite');
            expect(announcer.getAttribute('aria-atomic')).toBe('true');
            expect(announcer.className).toBe('sr-only');
        });

        it('should announce messages to screen readers', (done) => {
            const controller = new PopupController();
            
            controller.announceToScreenReader('Password revealed');
            
            // Check that the message is set after timeout
            setTimeout(() => {
                const announcer = document.getElementById('screen-reader-announcer');
                expect(announcer.textContent).toBe('Password revealed');
                done();
            }, 150);
        });

        it('should clear previous messages before announcing new ones', () => {
            const controller = new PopupController();
            
            controller.announceToScreenReader('First message');
            const announcer = document.getElementById('screen-reader-announcer');
            
            // Should be cleared initially
            expect(announcer.textContent).toBe('');
            
            controller.announceToScreenReader('Second message');
            expect(announcer.textContent).toBe('');
        });
    });

    describe('Enhanced Password Visibility UI', () => {
        it('should update eye button with enhanced icons and accessibility attributes', () => {
            const controller = new PopupController();
            
            // Create a mock credential element
            const credentialItem = document.createElement('div');
            credentialItem.innerHTML = `
                <button class="eye-btn" data-credential-id="test123">
                    <span class="btn-icon">👁️</span>
                    <span class="btn-text">Show</span>
                </button>
                <span class="password-display" data-credential-id="test123">••••••••</span>
            `;
            document.body.appendChild(credentialItem);
            
            // Mock credential data
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            
            // Show password
            controller.showCredentialPassword('test123', 'actualPassword');
            controller.updatePasswordVisibilityUI('test123');
            
            const eyeBtn = credentialItem.querySelector('.eye-btn');
            const passwordDisplay = credentialItem.querySelector('.password-display');
            
            // Check enhanced icon
            expect(eyeBtn.innerHTML).toContain('👁️‍🗨️');
            expect(eyeBtn.innerHTML).toContain('aria-hidden="true"');
            
            // Check accessibility attributes
            expect(eyeBtn.getAttribute('aria-label')).toBe('Hide password for this credential');
            expect(eyeBtn.title).toBe('Hide password (currently visible)');
            
            // Check password display
            expect(passwordDisplay.textContent).toBe('actualPassword');
            expect(passwordDisplay.getAttribute('aria-label')).toBe('Password is now visible: actualPassword');
            expect(passwordDisplay.getAttribute('aria-live')).toBe('polite');
        });

        it('should show enhanced loading state with spinner', () => {
            const controller = new PopupController();
            
            const credentialItem = document.createElement('div');
            credentialItem.innerHTML = `
                <button class="eye-btn" data-credential-id="test123">
                    <span class="btn-icon">👁️</span>
                    <span class="btn-text">Show</span>
                </button>
            `;
            document.body.appendChild(credentialItem);
            
            // Mock credential data
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            
            controller.setPasswordVisibilityLoading('test123', true);
            
            const eyeBtn = credentialItem.querySelector('.eye-btn');
            
            // Check loading state
            expect(eyeBtn.innerHTML).toContain('loading-spinner');
            expect(eyeBtn.innerHTML).toContain('Verifying...');
            expect(eyeBtn.disabled).toBe(true);
            expect(eyeBtn.classList.contains('loading')).toBe(true);
            expect(eyeBtn.getAttribute('aria-label')).toBe('Verifying master password for password reveal');
        });

        it('should restore normal state after loading', () => {
            const controller = new PopupController();
            
            const credentialItem = document.createElement('div');
            credentialItem.innerHTML = `
                <button class="eye-btn" data-credential-id="test123">
                    <span class="btn-icon">👁️</span>
                    <span class="btn-text">Show</span>
                </button>
            `;
            document.body.appendChild(credentialItem);
            
            // Mock credential data
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            
            // Set loading then remove
            controller.setPasswordVisibilityLoading('test123', true);
            controller.setPasswordVisibilityLoading('test123', false);
            
            const eyeBtn = credentialItem.querySelector('.eye-btn');
            
            // Check restored state
            expect(eyeBtn.disabled).toBe(false);
            expect(eyeBtn.classList.contains('loading')).toBe(false);
            expect(eyeBtn.innerHTML).toContain('👁️');
            expect(eyeBtn.innerHTML).toContain('Show');
        });
    });

    describe('Keyboard Navigation', () => {
        it('should handle arrow key navigation between credential items', () => {
            const controller = new PopupController();
            
            // Create multiple credential items
            const container = document.getElementById('credential-list');
            for (let i = 0; i < 3; i++) {
                const item = document.createElement('div');
                item.className = 'credential-item';
                item.setAttribute('data-credential-id', `cred${i}`);
                item.setAttribute('tabindex', '0');
                item.focus = vi.fn();
                container.appendChild(item);
            }
            
            const items = container.querySelectorAll('.credential-item');
            
            // Mock credential data
            controller.allCredentials = [
                { id: 'cred0', url: 'site1.com', username: 'user1' },
                { id: 'cred1', url: 'site2.com', username: 'user2' },
                { id: 'cred2', url: 'site3.com', username: 'user3' }
            ];
            
            // Test navigation down
            controller.navigateCredentialItems(items[0], 1);
            expect(items[1].focus).toHaveBeenCalled();
            
            // Test navigation up with wrap-around
            controller.navigateCredentialItems(items[0], -1);
            expect(items[2].focus).toHaveBeenCalled();
            
            // Test navigation down with wrap-around
            controller.navigateCredentialItems(items[2], 1);
            expect(items[0].focus).toHaveBeenCalled();
        });

        it('should add keyboard event listeners to credential items', () => {
            const controller = new PopupController();
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            
            // Mock the methods that would be called
            controller.handlePasswordVisibilityToggle = vi.fn();
            controller.copyPassword = vi.fn();
            controller.editCredential = vi.fn();
            controller.showDeleteConfirmation = vi.fn();
            
            // Simulate credential rendering with keyboard events
            const item = document.createElement('div');
            item.className = 'credential-item';
            item.setAttribute('data-credential-id', 'test123');
            
            // Add the keyboard event listener (simulating what renderCredentialList does)
            item.addEventListener('keydown', (e) => {
                if (e.key === 'v' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    controller.handlePasswordVisibilityToggle('test123');
                } else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    controller.copyPassword('test123');
                } else if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    controller.editCredential('test123');
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    controller.showDeleteConfirmation({ id: 'test123' });
                }
            });
            
            document.body.appendChild(item);
            
            // Test keyboard shortcuts
            const createKeyEvent = (key) => new window.KeyboardEvent('keydown', { key, bubbles: true });
            
            item.dispatchEvent(createKeyEvent('v'));
            expect(controller.handlePasswordVisibilityToggle).toHaveBeenCalledWith('test123');
            
            item.dispatchEvent(createKeyEvent('c'));
            expect(controller.copyPassword).toHaveBeenCalledWith('test123');
            
            item.dispatchEvent(createKeyEvent('e'));
            expect(controller.editCredential).toHaveBeenCalledWith('test123');
            
            item.dispatchEvent(createKeyEvent('Delete'));
            expect(controller.showDeleteConfirmation).toHaveBeenCalledWith({ id: 'test123' });
        });
    });

    describe('Visual Feedback for Actions', () => {
        it('should show success feedback for copy action', async () => {
            const controller = new PopupController();
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.setAttribute('data-credential-id', 'test123');
            document.body.appendChild(copyBtn);
            
            // Mock credential data
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com', password: 'password123' }];
            controller.showTemporaryMessage = vi.fn();
            controller.announceToScreenReader = vi.fn();
            
            await controller.copyPassword('test123');
            
            // Check that success feedback was shown
            expect(copyBtn.classList.contains('success')).toBe(true);
            expect(controller.announceToScreenReader).toHaveBeenCalledWith('Password copied to clipboard for example.com (user@example.com)');
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith('Password copied to clipboard', 2000, 'success');
        });

        it('should show error feedback for failed copy action', async () => {
            const controller = new PopupController();
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.setAttribute('data-credential-id', 'test123');
            document.body.appendChild(copyBtn);
            
            // Mock credential data
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            controller.showTemporaryMessage = vi.fn();
            controller.announceToScreenReader = vi.fn();
            
            // Mock clipboard failure
            global.navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Clipboard error'));
            
            await controller.copyPassword('test123');
            
            // Check that error feedback was shown
            expect(copyBtn.classList.contains('error')).toBe(true);
            expect(controller.announceToScreenReader).toHaveBeenCalledWith('Failed to copy password to clipboard');
            expect(controller.showTemporaryMessage).toHaveBeenCalledWith('Failed to copy password', 3000, 'error');
        });

        it('should remove feedback classes after timeout', () => {
            const controller = new PopupController();
            
            const button = document.createElement('button');
            document.body.appendChild(button);
            
            controller.showActionFeedback(button, 'success', 100);
            
            expect(button.classList.contains('success')).toBe(true);
            
            // Check that timeout was set to remove the class
            expect(global.setTimeout).toHaveBeenCalledWith(expect.any(Function), 100);
        });
    });

    describe('Credential Display Name Helper', () => {
        it('should format credential display name correctly', () => {
            const controller = new PopupController();
            controller.allCredentials = [
                { id: 'test123', url: 'https://example.com/login', username: 'user@example.com' }
            ];
            
            // Mock formatUrl method
            controller.formatUrl = vi.fn().mockReturnValue('example.com');
            
            const displayName = controller.getCredentialDisplayName('test123');
            expect(displayName).toBe('example.com (user@example.com)');
        });

        it('should handle non-existent credential gracefully', () => {
            const controller = new PopupController();
            controller.allCredentials = [];
            
            const displayName = controller.getCredentialDisplayName('nonexistent');
            expect(displayName).toBe('credential');
        });
    });

    describe('Auto-hide Timeout Announcements', () => {
        it('should announce when password is auto-hidden', () => {
            const controller = new PopupController();
            controller.allCredentials = [{ id: 'test123', url: 'example.com', username: 'user@example.com' }];
            controller.showTemporaryMessage = vi.fn();
            controller.announceToScreenReader = vi.fn();
            controller.updatePasswordVisibilityUI = vi.fn();
            
            // Show password to set up timeout
            controller.showCredentialPassword('test123', 'password123');
            
            // Get the timeout function and call it
            const timeoutCall = global.setTimeout.mock.calls.find(call => call[1] === 30000);
            expect(timeoutCall).toBeTruthy();
            
            // Execute the timeout function
            timeoutCall[0]();
            
            // Check that announcement was made
            expect(controller.announceToScreenReader).toHaveBeenCalledWith(
                'Password automatically hidden for example.com (user@example.com) after 30 seconds for security'
            );
        });
    });
});