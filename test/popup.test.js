// Chrome Password Manager - Popup Interface Tests
// Tests for popup UI components, interactions, and accessibility

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock Chrome APIs
const mockChrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

// Setup DOM environment
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
            <meta charset="UTF-8">
            <title>Test</title>
        </head>
        <body>
            <div id="app">
                <div id="loading" class="hidden" role="status" aria-live="polite">
                    <div class="loading-spinner" aria-hidden="true"></div>
                    <p>Loading...</p>
                </div>
                
                <div id="auth-container">
                    <div class="auth-header">
                        <h1>Password Manager</h1>
                        <p class="auth-subtitle">Secure your passwords with Gmail authentication</p>
                    </div>
                    
                    <div id="auth-choice" class="auth-section">
                        <button id="show-login" class="auth-choice-btn">Login</button>
                        <button id="show-signup" class="auth-choice-btn">Sign Up</button>
                    </div>
                    
                    <div id="login-form" class="auth-section hidden">
                        <div class="oauth-section">
                            <button id="gmail-login" class="gmail-btn">Continue with Gmail</button>
                        </div>
                        <div id="master-password-section" class="hidden">
                            <input type="password" id="master-password" placeholder="Enter your master password">
                            <button type="button" id="toggle-master-password" class="password-toggle">👁️</button>
                            <div id="master-password-error" class="error-message hidden"></div>
                            <button id="login-submit" class="primary-btn">Login</button>
                            <button id="back-to-gmail" class="secondary-btn">Back</button>
                        </div>
                        <button id="switch-to-signup" class="link-btn">Sign up</button>
                    </div>
                    
                    <div id="signup-form" class="auth-section hidden">
                        <div class="oauth-section">
                            <button id="gmail-signup" class="gmail-btn">Continue with Gmail</button>
                        </div>
                        <div id="new-master-password-section" class="hidden">
                            <input type="password" id="new-master-password" placeholder="Create a strong master password">
                            <button type="button" id="toggle-new-master-password" class="password-toggle">👁️</button>
                            <div class="password-requirements">
                                <ul id="password-requirements-list">
                                    <li id="req-length" class="requirement">At least 8 characters</li>
                                    <li id="req-uppercase" class="requirement">One uppercase letter</li>
                                    <li id="req-lowercase" class="requirement">One lowercase letter</li>
                                    <li id="req-number" class="requirement">One number</li>
                                </ul>
                            </div>
                            <div id="new-master-password-error" class="error-message hidden"></div>
                            <input type="password" id="confirm-master-password" placeholder="Confirm your master password">
                            <button type="button" id="toggle-confirm-password" class="password-toggle">👁️</button>
                            <div id="confirm-password-error" class="error-message hidden"></div>
                            <button id="signup-submit" class="primary-btn" disabled>Create Account</button>
                            <button id="back-to-gmail-signup" class="secondary-btn">Back</button>
                        </div>
                        <button id="switch-to-login" class="link-btn">Login</button>
                    </div>
                    
                    <div id="key-phrase-display" class="auth-section hidden">
                        <h2>Your Recovery Key Phrase</h2>
                        <div id="key-phrase-words" class="key-phrase-grid"></div>
                        <button id="copy-key-phrase" class="secondary-btn">Copy Key Phrase</button>
                        <button id="download-key-phrase" class="secondary-btn">Download as File</button>
                        <input type="checkbox" id="key-phrase-saved" class="checkbox">
                        <label for="key-phrase-saved">I have securely saved my key phrase</label>
                        <button id="confirm-key-phrase" class="primary-btn" disabled>Continue to Password Manager</button>
                    </div>
                </div>
                
                <div id="main-container" class="hidden">
                    <div class="main-header">
                        <h2>Password Manager</h2>
                        <button id="logout-btn" class="logout-btn">🚪</button>
                    </div>
                    
                    <div class="search-section" role="search">
                        <input type="text" id="search-credentials" placeholder="Search credentials..." class="search-input" aria-label="Search credentials">
                        <button id="clear-search" class="clear-search-btn hidden" aria-label="Clear search">×</button>
                    </div>
                    
                    <button id="add-credential" class="add-credential-btn">Add New Credential</button>
                    
                    <div id="credentials-container">
                        <div id="credential-list" class="credential-list" role="list" aria-label="Saved credentials"></div>
                        <div id="no-credentials" class="no-credentials hidden" role="status">
                            <h3>No credentials found</h3>
                            <p>Add your first credential to get started</p>
                        </div>
                    </div>
                    
                    <div class="bottom-menu">
                        <button id="export-btn" class="menu-btn">Export</button>
                        <button id="import-btn" class="menu-btn">Import</button>
                    </div>
                </div>
                
                <div id="credential-modal" class="modal hidden" role="dialog" aria-labelledby="modal-title" aria-modal="true">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="modal-title">Add New Credential</h3>
                            <button id="close-modal" class="close-btn" aria-label="Close modal">×</button>
                        </div>
                        <form id="credential-form" class="credential-form">
                            <input type="url" id="credential-url" placeholder="https://example.com" required>
                            <div id="url-error" class="error-message hidden"></div>
                            <input type="text" id="credential-username" placeholder="your@email.com" required>
                            <div id="username-error" class="error-message hidden"></div>
                            <input type="password" id="credential-password" placeholder="Enter password" required>
                            <button type="button" id="toggle-credential-password" class="password-toggle">👁️</button>
                            <button type="button" id="generate-password" class="generate-btn">Generate Strong Password</button>
                            <div id="password-error" class="error-message hidden"></div>
                            <button type="button" id="cancel-credential" class="secondary-btn">Cancel</button>
                            <button type="submit" id="save-credential" class="primary-btn">
                                <span id="save-btn-text">Save Credential</span>
                            </button>
                        </form>
                    </div>
                </div>
                
                <div id="delete-modal" class="modal hidden" role="dialog" aria-labelledby="delete-modal-title" aria-modal="true">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="delete-modal-title">Delete Credential</h3>
                        </div>
                        <div class="delete-content">
                            <p>Are you sure you want to delete this credential?</p>
                            <div class="credential-preview">
                                <div class="preview-url" id="delete-preview-url"></div>
                                <div class="preview-username" id="delete-preview-username"></div>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button id="cancel-delete" class="secondary-btn">Cancel</button>
                            <button id="confirm-delete" class="danger-btn">Delete Credential</button>
                        </div>
                    </div>
                </div>
                
                <div id="export-modal" class="modal hidden" role="dialog" aria-labelledby="export-modal-title" aria-modal="true">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="export-modal-title">Export Passwords</h3>
                            <button id="close-export-modal" class="close-btn" aria-label="Close modal">×</button>
                        </div>
                        <div class="export-content">
                            <textarea id="export-key-phrase" placeholder="Enter your 16-word key phrase" rows="3" required></textarea>
                            <div id="export-key-phrase-error" class="error-message hidden"></div>
                            <input type="checkbox" id="include-passwords" class="checkbox" checked>
                            <label for="include-passwords">Include passwords in export</label>
                            <div class="export-progress hidden" id="export-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill"></div>
                                </div>
                                <p class="progress-text">Encrypting and preparing your data...</p>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button id="cancel-export" class="secondary-btn">Cancel</button>
                            <button id="start-export" class="primary-btn">Export Data</button>
                        </div>
                    </div>
                </div>
                
                <div id="import-modal" class="modal hidden" role="dialog" aria-labelledby="import-modal-title" aria-modal="true">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="import-modal-title">Import Passwords</h3>
                            <button id="close-import-modal" class="close-btn" aria-label="Close modal">×</button>
                        </div>
                        <div class="import-content">
                            <input type="file" id="import-file" accept=".json,.txt" required>
                            <span id="file-name">No file selected</span>
                            <div id="import-file-error" class="error-message hidden"></div>
                            <textarea id="import-key-phrase" placeholder="Enter the 16-word key phrase" rows="3" required></textarea>
                            <div id="import-key-phrase-error" class="error-message hidden"></div>
                            <div class="import-preview hidden" id="import-preview">
                                <h4>Import Preview</h4>
                                <div class="preview-stats">
                                    <span class="stat-number" id="preview-count">0</span>
                                    <span class="stat-number" id="preview-new">0</span>
                                    <span class="stat-number" id="preview-existing">0</span>
                                </div>
                                <input type="checkbox" id="overwrite-existing" class="checkbox">
                                <label for="overwrite-existing">Overwrite existing credentials</label>
                            </div>
                            <div class="import-progress hidden" id="import-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill"></div>
                                </div>
                                <p class="progress-text">Decrypting and importing your data...</p>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button id="cancel-import" class="secondary-btn">Cancel</button>
                            <button id="preview-import" class="secondary-btn">Preview</button>
                            <button id="start-import" class="primary-btn" disabled>Import Data</button>
                        </div>
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

    window = dom.window;
    document = window.document;
    
    // Setup global objects
    global.window = window;
    global.document = document;
    global.chrome = mockChrome;
    global.navigator = {
        clipboard: {
            writeText: vi.fn().mockResolvedValue(undefined)
        }
    };
    global.URL = {
        createObjectURL: vi.fn().mockReturnValue('blob:test'),
        revokeObjectURL: vi.fn()
    };

    // Create PopupController class for testing
    // Since we can't easily import the class from popup.js, we'll create a test version
    PopupController = class {
            constructor() {
                this.allCredentials = [];
                this.filteredCredentials = [];
                this.currentEditingCredential = null;
                this.credentialToDelete = null;
                this.currentKeyPhrase = null;
                this.previouslyFocusedElement = null;
                
                this.initializeEventListeners();
                this.checkAuthState();
            }
            
            initializeEventListeners() {
                // Mock event listener setup
            }
            
            async checkAuthState() {
                try {
                    const response = await chrome.runtime.sendMessage({
                        type: 'CHECK_AUTH_STATE'
                    });
                    
                    if (response.authenticated) {
                        this.showMainInterface();
                        await this.loadCredentials();
                    } else {
                        this.showAuthInterface();
                    }
                } catch (error) {
                    this.showAuthInterface();
                }
            }
            
            showAuthInterface() {
                this.hideAll();
                document.getElementById('auth-container').classList.remove('hidden');
                document.getElementById('auth-choice').classList.remove('hidden');
            }
            
            showMainInterface() {
                this.hideAll();
                document.getElementById('main-container').classList.remove('hidden');
            }
            
            hideAll() {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('main-container').classList.add('hidden');
            }
            
            showLoginForm() {
                this.hideAllAuthSections();
                document.getElementById('login-form').classList.remove('hidden');
                document.getElementById('master-password-section').classList.add('hidden');
                this.clearErrors();
            }
            
            showSignupForm() {
                this.hideAllAuthSections();
                document.getElementById('signup-form').classList.remove('hidden');
                document.getElementById('new-master-password-section').classList.add('hidden');
                this.clearErrors();
            }
            
            hideAllAuthSections() {
                document.getElementById('auth-choice').classList.add('hidden');
                document.getElementById('login-form').classList.add('hidden');
                document.getElementById('signup-form').classList.add('hidden');
                document.getElementById('key-phrase-display').classList.add('hidden');
            }
            
            showMasterPasswordInput(mode) {
                if (mode === 'login') {
                    document.getElementById('master-password-section').classList.remove('hidden');
                } else {
                    document.getElementById('new-master-password-section').classList.remove('hidden');
                }
            }
            
            showKeyPhrase(keyPhrase) {
                this.currentKeyPhrase = keyPhrase;
                this.hideAllAuthSections();
                document.getElementById('key-phrase-display').classList.remove('hidden');
                
                const wordsContainer = document.getElementById('key-phrase-words');
                wordsContainer.innerHTML = '';
                
                keyPhrase.forEach((word, index) => {
                    const wordElement = document.createElement('div');
                    wordElement.className = 'key-phrase-word';
                    wordElement.innerHTML = `
                        <span class="word-number">${index + 1}</span>
                        <span class="word-text">${this.escapeHtml(word)}</span>
                    `;
                    wordsContainer.appendChild(wordElement);
                });
            }
            
            displayCredentials(credentials) {
                this.allCredentials = credentials || [];
                this.filteredCredentials = [...this.allCredentials];
                this.renderCredentialList();
            }
            
            renderCredentialList() {
                const container = document.getElementById('credential-list');
                const noCredentialsDiv = document.getElementById('no-credentials');
                
                container.innerHTML = '';
                
                if (this.filteredCredentials.length === 0) {
                    container.classList.add('hidden');
                    noCredentialsDiv.classList.remove('hidden');
                    return;
                }
                
                container.classList.remove('hidden');
                noCredentialsDiv.classList.add('hidden');
                
                this.filteredCredentials.forEach(credential => {
                    const item = document.createElement('div');
                    item.className = 'credential-item';
                    item.setAttribute('data-credential-id', credential.id);
                    item.setAttribute('role', 'listitem');
                    item.setAttribute('tabindex', '0');
                    item.setAttribute('aria-label', `Credential for ${credential.url}, username: ${credential.username}`);
                    
                    const credentialInfo = document.createElement('div');
                    credentialInfo.className = 'credential-info';
                    
                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'credential-url';
                    urlDiv.textContent = this.formatUrl(credential.url);
                    
                    const usernameDiv = document.createElement('div');
                    usernameDiv.className = 'credential-username';
                    usernameDiv.textContent = credential.username;
                    
                    credentialInfo.appendChild(urlDiv);
                    credentialInfo.appendChild(usernameDiv);
                    
                    const actionsDiv = document.createElement('div');
                    actionsDiv.className = 'credential-actions';
                    
                    // Add keyboard navigation
                    item.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            this.editCredential(credential.id);
                        }
                    });
                    
                    item.appendChild(credentialInfo);
                    item.appendChild(actionsDiv);
                    container.appendChild(item);
                });
            }
            
            handleSearch() {
                const searchTerm = document.getElementById('search-credentials').value.toLowerCase().trim();
                const clearBtn = document.getElementById('clear-search');
                
                if (searchTerm) {
                    clearBtn.classList.remove('hidden');
                    this.filteredCredentials = this.allCredentials.filter(credential => 
                        credential.url.toLowerCase().includes(searchTerm) ||
                        credential.username.toLowerCase().includes(searchTerm)
                    );
                } else {
                    clearBtn.classList.add('hidden');
                    this.filteredCredentials = [...this.allCredentials];
                }
                
                this.renderCredentialList();
            }
            
            clearSearch() {
                document.getElementById('search-credentials').value = '';
                document.getElementById('clear-search').classList.add('hidden');
                this.filteredCredentials = [...this.allCredentials];
                this.renderCredentialList();
            }
            
            showAddCredentialForm() {
                this.currentEditingCredential = null;
                document.getElementById('modal-title').textContent = 'Add New Credential';
                document.getElementById('save-btn-text').textContent = 'Save Credential';
                
                document.getElementById('credential-form').reset();
                this.clearCredentialFormErrors();
                
                const modal = document.getElementById('credential-modal');
                modal.classList.remove('hidden');
                
                this.previouslyFocusedElement = document.activeElement;
                
                setTimeout(() => {
                    document.getElementById('credential-url').focus();
                }, 100);
                
                this.trapFocus(modal);
            }
            
            hideCredentialModal() {
                document.getElementById('credential-modal').classList.add('hidden');
                this.currentEditingCredential = null;
                
                if (this.previouslyFocusedElement) {
                    this.previouslyFocusedElement.focus();
                    this.previouslyFocusedElement = null;
                }
            }
            
            showDeleteConfirmation(credential) {
                this.credentialToDelete = credential;
                document.getElementById('delete-preview-url').textContent = this.formatUrl(credential.url);
                document.getElementById('delete-preview-username').textContent = credential.username;
                document.getElementById('delete-modal').classList.remove('hidden');
            }
            
            hideDeleteModal() {
                document.getElementById('delete-modal').classList.add('hidden');
                this.credentialToDelete = null;
            }
            
            showExportModal() {
                document.getElementById('export-modal').classList.remove('hidden');
                document.getElementById('export-key-phrase').focus();
                this.hideExportProgress();
            }
            
            hideExportModal() {
                document.getElementById('export-modal').classList.add('hidden');
                document.getElementById('export-key-phrase').value = '';
                this.hideFieldError('export-key-phrase-error');
                this.hideExportProgress();
            }
            
            showImportModal() {
                document.getElementById('import-modal').classList.remove('hidden');
                this.hideImportPreview();
                this.hideImportProgress();
                this.clearImportForm();
            }
            
            hideImportModal() {
                document.getElementById('import-modal').classList.add('hidden');
                this.clearImportForm();
                this.hideImportPreview();
                this.hideImportProgress();
            }
            
            clearImportForm() {
                document.getElementById('import-file').value = '';
                document.getElementById('file-name').textContent = 'No file selected';
                document.getElementById('import-key-phrase').value = '';
                this.hideFieldError('import-file-error');
                this.hideFieldError('import-key-phrase-error');
                document.getElementById('start-import').disabled = true;
            }
            
            handleFileSelection() {
                const fileInput = document.getElementById('import-file');
                const fileName = document.getElementById('file-name');
                
                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    fileName.textContent = file.name;
                    this.hideFieldError('import-file-error');
                } else {
                    fileName.textContent = 'No file selected';
                }
                
                this.hideImportPreview();
                document.getElementById('start-import').disabled = true;
            }
            
            hideExportProgress() {
                document.getElementById('export-progress').classList.add('hidden');
                document.getElementById('start-export').disabled = false;
            }
            
            hideImportPreview() {
                document.getElementById('import-preview').classList.add('hidden');
            }
            
            hideImportProgress() {
                document.getElementById('import-progress').classList.add('hidden');
                document.getElementById('start-import').disabled = false;
                document.getElementById('preview-import').disabled = false;
            }
            
            async loadCredentials() {
                // Mock implementation
            }
            
            editCredential(credentialId) {
                // Mock implementation
            }
            
            validateNewPassword() {
                const password = document.getElementById('new-master-password').value;
                const requirements = {
                    'req-length': password.length >= 8,
                    'req-uppercase': /[A-Z]/.test(password),
                    'req-lowercase': /[a-z]/.test(password),
                    'req-number': /\d/.test(password)
                };

                let allValid = true;
                Object.entries(requirements).forEach(([reqId, isValid]) => {
                    const element = document.getElementById(reqId);
                    if (element) {
                        if (isValid) {
                            element.classList.add('valid');
                            element.classList.remove('invalid');
                        } else {
                            element.classList.add('invalid');
                            element.classList.remove('valid');
                            allValid = false;
                        }
                    }
                });

                // Don't call updateSignupButton here to avoid recursion
                return allValid;
            }
            
            validatePasswordConfirmation() {
                const password = document.getElementById('new-master-password').value;
                const confirmPassword = document.getElementById('confirm-master-password').value;

                if (confirmPassword && password !== confirmPassword) {
                    this.showFieldError('confirm-password-error', 'Passwords do not match');
                    return false;
                } else {
                    this.hideFieldError('confirm-password-error');
                    return true;
                }
            }
            
            updateSignupButton() {
                const password = document.getElementById('new-master-password')?.value || '';
                const confirmPassword = document.getElementById('confirm-master-password')?.value || '';
                const signupBtn = document.getElementById('signup-submit');
                
                if (!signupBtn) return;
                
                // Check password requirements without calling validateNewPassword to avoid recursion
                const isPasswordValid = password.length >= 8 && 
                                       /[A-Z]/.test(password) && 
                                       /[a-z]/.test(password) && 
                                       /\d/.test(password);
                const isConfirmValid = password === confirmPassword && confirmPassword.length > 0;
                
                signupBtn.disabled = !(isPasswordValid && isConfirmValid);
            }
            
            async copyKeyPhrase() {
                if (!this.currentKeyPhrase) return;
                
                try {
                    await navigator.clipboard.writeText(this.currentKeyPhrase.join(' '));
                    this.showTemporaryMessage('Key phrase copied to clipboard!');
                } catch (error) {
                    this.showError('Failed to copy key phrase');
                }
            }
            
            toggleKeyPhraseConfirmation() {
                const checkbox = document.getElementById('key-phrase-saved');
                const confirmBtn = document.getElementById('confirm-key-phrase');
                if (confirmBtn) {
                    confirmBtn.disabled = !checkbox.checked;
                }
            }
            
            generatePassword() {
                const length = 16;
                const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                let password = '';
                
                const lowercase = 'abcdefghijklmnopqrstuvwxyz';
                const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const numbers = '0123456789';
                const symbols = '!@#$%^&*';
                
                password += lowercase[Math.floor(Math.random() * lowercase.length)];
                password += uppercase[Math.floor(Math.random() * uppercase.length)];
                password += numbers[Math.floor(Math.random() * numbers.length)];
                password += symbols[Math.floor(Math.random() * symbols.length)];
                
                for (let i = password.length; i < length; i++) {
                    password += charset[Math.floor(Math.random() * charset.length)];
                }
                
                password = password.split('').sort(() => Math.random() - 0.5).join('');
                
                document.getElementById('credential-password').value = password;
                this.showTemporaryMessage('Strong password generated!');
            }
            
            formatUrl(url) {
                try {
                    const urlObj = new URL(url);
                    return urlObj.hostname;
                } catch {
                    return url;
                }
            }
            
            normalizeUrl(url) {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    return 'https://' + url;
                }
                return url;
            }
            
            isValidUrl(url) {
                try {
                    new URL(this.normalizeUrl(url));
                    return true;
                } catch {
                    return false;
                }
            }
            
            clearCredentialFormErrors() {
                this.hideFieldError('url-error');
                this.hideFieldError('username-error');
                this.hideFieldError('password-error');
            }
            
            clearErrors() {
                const errorElements = document.querySelectorAll('.error-message');
                errorElements.forEach(element => element.classList.add('hidden'));
            }
            
            showFieldError(errorElementId, message) {
                const errorElement = document.getElementById(errorElementId);
                if (errorElement) {
                    errorElement.textContent = message;
                    errorElement.classList.remove('hidden');
                }
            }
            
            hideFieldError(errorElementId) {
                const errorElement = document.getElementById(errorElementId);
                if (errorElement) {
                    errorElement.classList.add('hidden');
                }
            }
            
            showError(message) {
                const existingErrors = document.querySelectorAll('.error-notification');
                existingErrors.forEach(error => error.remove());
                
                const notification = document.createElement('div');
                notification.className = 'error-notification';
                notification.setAttribute('role', 'alert');
                notification.setAttribute('aria-live', 'assertive');
                notification.innerHTML = `
                    <span class="error-icon" aria-hidden="true">⚠️</span>
                    <span class="error-text">${this.escapeHtml(message)}</span>
                    <button class="error-close" onclick="this.parentNode.remove()" aria-label="Close error message">×</button>
                `;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 5000);
            }
            
            showTemporaryMessage(message, duration = 3000) {
                const existingNotifications = document.querySelectorAll('.temporary-notification');
                existingNotifications.forEach(notification => notification.remove());
                
                const notification = document.createElement('div');
                notification.className = 'temporary-notification';
                notification.setAttribute('role', 'status');
                notification.setAttribute('aria-live', 'polite');
                notification.textContent = message;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, duration);
            }
            
            trapFocus(element) {
                // Mock implementation for testing
            }
            
            escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
        };
});

afterEach(() => {
    vi.clearAllMocks();
    dom?.window?.close();
});

describe('PopupController Initialization', () => {
    it('should initialize with correct default values', () => {
        const controller = new PopupController();
        
        expect(controller.allCredentials).toEqual([]);
        expect(controller.filteredCredentials).toEqual([]);
        expect(controller.currentEditingCredential).toBeNull();
        expect(controller.credentialToDelete).toBeNull();
        expect(controller.currentKeyPhrase).toBeNull();
    });

    it('should check auth state on initialization', () => {
        mockChrome.runtime.sendMessage.mockResolvedValue({ authenticated: false });
        
        new PopupController();
        
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'CHECK_AUTH_STATE'
        });
    });
});

describe('Authentication UI Components', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
    });

    describe('Login Form', () => {
        it('should show login form when show-login button is clicked', () => {
            const showLoginBtn = document.getElementById('show-login');
            const loginForm = document.getElementById('login-form');
            
            showLoginBtn.click();
            
            expect(loginForm.classList.contains('hidden')).toBe(false);
        });

        it('should validate master password input', async () => {
            controller.showLoginForm();
            controller.showMasterPasswordInput('login');
            
            const loginBtn = document.getElementById('login-submit');
            const passwordInput = document.getElementById('master-password');
            
            // Test empty password
            passwordInput.value = '';
            loginBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const errorElement = document.getElementById('master-password-error');
            expect(errorElement.classList.contains('hidden')).toBe(false);
            expect(errorElement.textContent).toContain('Please enter your master password');
        });

        it('should handle Gmail authentication', async () => {
            mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });
            
            const gmailBtn = document.getElementById('gmail-login');
            gmailBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'GMAIL_AUTH',
                payload: { mode: 'login' }
            });
        });

        it('should toggle password visibility', () => {
            const passwordInput = document.getElementById('master-password');
            const toggleBtn = document.getElementById('toggle-master-password');
            
            expect(passwordInput.type).toBe('password');
            
            toggleBtn.click();
            
            expect(passwordInput.type).toBe('text');
            
            toggleBtn.click();
            
            expect(passwordInput.type).toBe('password');
        });
    });

    describe('Signup Form', () => {
        it('should show signup form when show-signup button is clicked', () => {
            const showSignupBtn = document.getElementById('show-signup');
            const signupForm = document.getElementById('signup-form');
            
            showSignupBtn.click();
            
            expect(signupForm.classList.contains('hidden')).toBe(false);
        });

        it('should validate password requirements', () => {
            controller.showSignupForm();
            controller.showMasterPasswordInput('signup');
            
            const passwordInput = document.getElementById('new-master-password');
            
            // Test weak password
            passwordInput.value = 'weak';
            controller.validateNewPassword();
            
            const lengthReq = document.getElementById('req-length');
            const uppercaseReq = document.getElementById('req-uppercase');
            const lowercaseReq = document.getElementById('req-lowercase');
            const numberReq = document.getElementById('req-number');
            
            expect(lengthReq.classList.contains('invalid')).toBe(true);
            expect(uppercaseReq.classList.contains('invalid')).toBe(true);
            expect(lowercaseReq.classList.contains('valid')).toBe(true);
            expect(numberReq.classList.contains('invalid')).toBe(true);
            
            // Test strong password
            passwordInput.value = 'StrongPass123';
            controller.validateNewPassword();
            
            expect(lengthReq.classList.contains('valid')).toBe(true);
            expect(uppercaseReq.classList.contains('valid')).toBe(true);
            expect(lowercaseReq.classList.contains('valid')).toBe(true);
            expect(numberReq.classList.contains('valid')).toBe(true);
        });

        it('should validate password confirmation', () => {
            controller.showSignupForm();
            controller.showMasterPasswordInput('signup');
            
            const passwordInput = document.getElementById('new-master-password');
            const confirmInput = document.getElementById('confirm-master-password');
            
            passwordInput.value = 'StrongPass123';
            confirmInput.value = 'DifferentPass123';
            
            const isValid = controller.validatePasswordConfirmation();
            
            expect(isValid).toBe(false);
            
            const errorElement = document.getElementById('confirm-password-error');
            expect(errorElement.classList.contains('hidden')).toBe(false);
            expect(errorElement.textContent).toContain('Passwords do not match');
            
            // Test matching passwords
            confirmInput.value = 'StrongPass123';
            const isValidMatching = controller.validatePasswordConfirmation();
            
            expect(isValidMatching).toBe(true);
            expect(errorElement.classList.contains('hidden')).toBe(true);
        });

        it('should enable signup button only when all validations pass', () => {
            controller.showSignupForm();
            controller.showMasterPasswordInput('signup');
            
            const passwordInput = document.getElementById('new-master-password');
            const confirmInput = document.getElementById('confirm-master-password');
            const signupBtn = document.getElementById('signup-submit');
            
            expect(signupBtn.disabled).toBe(true);
            
            passwordInput.value = 'StrongPass123';
            confirmInput.value = 'StrongPass123';
            controller.updateSignupButton();
            
            expect(signupBtn.disabled).toBe(false);
        });
    });

    describe('Key Phrase Display', () => {
        it('should display key phrase words in grid format', () => {
            const testKeyPhrase = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'];
            
            controller.showKeyPhrase(testKeyPhrase);
            
            const keyPhraseDisplay = document.getElementById('key-phrase-display');
            const wordsContainer = document.getElementById('key-phrase-words');
            
            expect(keyPhraseDisplay.classList.contains('hidden')).toBe(false);
            expect(wordsContainer.children.length).toBe(16);
            
            // Check first word element
            const firstWord = wordsContainer.children[0];
            expect(firstWord.querySelector('.word-number').textContent).toBe('1');
            expect(firstWord.querySelector('.word-text').textContent).toBe('word1');
        });

        it('should copy key phrase to clipboard', async () => {
            const testKeyPhrase = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'];
            
            controller.showKeyPhrase(testKeyPhrase);
            
            const copyBtn = document.getElementById('copy-key-phrase');
            copyBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testKeyPhrase.join(' '));
        });

        it('should enable continue button only when checkbox is checked', () => {
            const testKeyPhrase = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'];
            
            controller.showKeyPhrase(testKeyPhrase);
            
            const checkbox = document.getElementById('key-phrase-saved');
            const continueBtn = document.getElementById('confirm-key-phrase');
            
            expect(continueBtn.disabled).toBe(true);
            
            checkbox.checked = true;
            controller.toggleKeyPhraseConfirmation();
            
            expect(continueBtn.disabled).toBe(false);
        });
    });
});

describe('Credential Management Interface', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
        controller.showMainInterface();
    });

    describe('Credential List', () => {
        it('should display credentials in list format', () => {
            const testCredentials = [
                { id: '1', url: 'https://example.com', username: 'user1@example.com', password: 'pass1' },
                { id: '2', url: 'https://test.com', username: 'user2@test.com', password: 'pass2' }
            ];
            
            controller.displayCredentials(testCredentials);
            
            const credentialList = document.getElementById('credential-list');
            expect(credentialList.children.length).toBe(2);
            
            const firstItem = credentialList.children[0];
            expect(firstItem.getAttribute('data-credential-id')).toBe('1');
            expect(firstItem.querySelector('.credential-url').textContent).toBe('example.com');
            expect(firstItem.querySelector('.credential-username').textContent).toBe('user1@example.com');
        });

        it('should show no credentials message when list is empty', () => {
            controller.displayCredentials([]);
            
            const noCredentials = document.getElementById('no-credentials');
            const credentialList = document.getElementById('credential-list');
            
            expect(noCredentials.classList.contains('hidden')).toBe(false);
            expect(credentialList.classList.contains('hidden')).toBe(true);
        });

        it('should filter credentials based on search input', () => {
            const testCredentials = [
                { id: '1', url: 'https://example.com', username: 'user1@example.com', password: 'pass1' },
                { id: '2', url: 'https://test.com', username: 'user2@test.com', password: 'pass2' },
                { id: '3', url: 'https://github.com', username: 'developer@github.com', password: 'pass3' }
            ];
            
            controller.displayCredentials(testCredentials);
            
            const searchInput = document.getElementById('search-credentials');
            searchInput.value = 'example';
            controller.handleSearch();
            
            const credentialList = document.getElementById('credential-list');
            expect(credentialList.children.length).toBe(1);
            expect(credentialList.children[0].getAttribute('data-credential-id')).toBe('1');
        });

        it('should clear search when clear button is clicked', () => {
            const testCredentials = [
                { id: '1', url: 'https://example.com', username: 'user1@example.com', password: 'pass1' },
                { id: '2', url: 'https://test.com', username: 'user2@test.com', password: 'pass2' }
            ];
            
            controller.displayCredentials(testCredentials);
            
            const searchInput = document.getElementById('search-credentials');
            searchInput.value = 'example';
            controller.handleSearch();
            
            const clearBtn = document.getElementById('clear-search');
            clearBtn.click();
            
            expect(searchInput.value).toBe('');
            expect(clearBtn.classList.contains('hidden')).toBe(true);
            
            const credentialList = document.getElementById('credential-list');
            expect(credentialList.children.length).toBe(2);
        });
    });

    describe('Add/Edit Credential Modal', () => {
        it('should show add credential modal when add button is clicked', () => {
            const addBtn = document.getElementById('add-credential');
            addBtn.click();
            
            const modal = document.getElementById('credential-modal');
            const modalTitle = document.getElementById('modal-title');
            
            expect(modal.classList.contains('hidden')).toBe(false);
            expect(modalTitle.textContent).toBe('Add New Credential');
        });

        it('should validate form inputs', async () => {
            controller.showAddCredentialForm();
            
            const form = document.getElementById('credential-form');
            const urlInput = document.getElementById('credential-url');
            const usernameInput = document.getElementById('credential-username');
            const passwordInput = document.getElementById('credential-password');
            
            // Test empty form submission
            const submitEvent = new window.Event('submit');
            form.dispatchEvent(submitEvent);
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const urlError = document.getElementById('url-error');
            const usernameError = document.getElementById('username-error');
            const passwordError = document.getElementById('password-error');
            
            expect(urlError.classList.contains('hidden')).toBe(false);
            expect(usernameError.classList.contains('hidden')).toBe(false);
            expect(passwordError.classList.contains('hidden')).toBe(false);
            
            // Test invalid URL
            urlInput.value = 'invalid-url';
            usernameInput.value = 'test@example.com';
            passwordInput.value = 'password123';
            
            form.dispatchEvent(submitEvent);
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(urlError.textContent).toContain('Please enter a valid URL');
        });

        it('should generate strong password', () => {
            controller.showAddCredentialForm();
            
            const generateBtn = document.getElementById('generate-password');
            const passwordInput = document.getElementById('credential-password');
            
            generateBtn.click();
            
            const generatedPassword = passwordInput.value;
            expect(generatedPassword.length).toBe(16);
            expect(/[a-z]/.test(generatedPassword)).toBe(true);
            expect(/[A-Z]/.test(generatedPassword)).toBe(true);
            expect(/\d/.test(generatedPassword)).toBe(true);
            expect(/[!@#$%^&*]/.test(generatedPassword)).toBe(true);
        });

        it('should toggle password visibility in credential form', () => {
            controller.showAddCredentialForm();
            
            const passwordInput = document.getElementById('credential-password');
            const toggleBtn = document.getElementById('toggle-credential-password');
            
            expect(passwordInput.type).toBe('password');
            
            toggleBtn.click();
            
            expect(passwordInput.type).toBe('text');
        });

        it('should close modal when cancel button is clicked', () => {
            controller.showAddCredentialForm();
            
            const cancelBtn = document.getElementById('cancel-credential');
            const modal = document.getElementById('credential-modal');
            
            cancelBtn.click();
            
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('Delete Confirmation', () => {
        it('should show delete confirmation modal', () => {
            const testCredential = { id: '1', url: 'https://example.com', username: 'user@example.com' };
            
            controller.showDeleteConfirmation(testCredential);
            
            const modal = document.getElementById('delete-modal');
            const previewUrl = document.getElementById('delete-preview-url');
            const previewUsername = document.getElementById('delete-preview-username');
            
            expect(modal.classList.contains('hidden')).toBe(false);
            expect(previewUrl.textContent).toBe('example.com');
            expect(previewUsername.textContent).toBe('user@example.com');
        });

        it('should cancel delete when cancel button is clicked', () => {
            const testCredential = { id: '1', url: 'https://example.com', username: 'user@example.com' };
            
            controller.showDeleteConfirmation(testCredential);
            
            const cancelBtn = document.getElementById('cancel-delete');
            const modal = document.getElementById('delete-modal');
            
            cancelBtn.click();
            
            expect(modal.classList.contains('hidden')).toBe(true);
            expect(controller.credentialToDelete).toBeNull();
        });
    });
});

describe('Import/Export Functionality', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
        controller.showMainInterface();
    });

    describe('Export Modal', () => {
        it('should show export modal when export button is clicked', () => {
            const exportBtn = document.getElementById('export-btn');
            exportBtn.click();
            
            const modal = document.getElementById('export-modal');
            expect(modal.classList.contains('hidden')).toBe(false);
        });

        it('should validate key phrase input', async () => {
            controller.showExportModal();
            
            const keyPhraseInput = document.getElementById('export-key-phrase');
            const startBtn = document.getElementById('start-export');
            
            // Test invalid key phrase (less than 16 words)
            keyPhraseInput.value = 'word1 word2 word3';
            startBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const errorElement = document.getElementById('export-key-phrase-error');
            expect(errorElement.classList.contains('hidden')).toBe(false);
            expect(errorElement.textContent).toContain('Key phrase must contain exactly 16 words');
        });

        it('should close export modal when cancel button is clicked', () => {
            controller.showExportModal();
            
            const cancelBtn = document.getElementById('cancel-export');
            const modal = document.getElementById('export-modal');
            
            cancelBtn.click();
            
            expect(modal.classList.contains('hidden')).toBe(true);
        });
    });

    describe('Import Modal', () => {
        it('should show import modal when import button is clicked', () => {
            const importBtn = document.getElementById('import-btn');
            importBtn.click();
            
            const modal = document.getElementById('import-modal');
            expect(modal.classList.contains('hidden')).toBe(false);
        });

        it('should handle file selection', () => {
            controller.showImportModal();
            
            const fileInput = document.getElementById('import-file');
            const fileName = document.getElementById('file-name');
            
            // Mock file selection
            const mockFile = new window.File(['test content'], 'test.json', { type: 'application/json' });
            Object.defineProperty(fileInput, 'files', {
                value: [mockFile],
                writable: false
            });
            
            controller.handleFileSelection();
            
            expect(fileName.textContent).toBe('test.json');
        });

        it('should validate inputs for preview', async () => {
            controller.showImportModal();
            
            const previewBtn = document.getElementById('preview-import');
            previewBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 0));
            
            const fileError = document.getElementById('import-file-error');
            expect(fileError.classList.contains('hidden')).toBe(false);
            expect(fileError.textContent).toContain('Please select a file to import');
        });
    });
});

describe('Accessibility Features', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
    });

    it('should have proper ARIA attributes on modals', () => {
        const credentialModal = document.getElementById('credential-modal');
        const deleteModal = document.getElementById('delete-modal');
        const exportModal = document.getElementById('export-modal');
        const importModal = document.getElementById('import-modal');
        
        expect(credentialModal.getAttribute('role')).toBe('dialog');
        expect(credentialModal.getAttribute('aria-modal')).toBe('true');
        expect(credentialModal.getAttribute('aria-labelledby')).toBe('modal-title');
        
        expect(deleteModal.getAttribute('role')).toBe('dialog');
        expect(exportModal.getAttribute('role')).toBe('dialog');
        expect(importModal.getAttribute('role')).toBe('dialog');
    });

    it('should have proper ARIA attributes on search section', () => {
        const searchSection = document.querySelector('.search-section');
        const searchInput = document.getElementById('search-credentials');
        
        expect(searchSection.getAttribute('role')).toBe('search');
        expect(searchInput.getAttribute('aria-label')).toBe('Search credentials');
    });

    it('should have proper ARIA attributes on credential list', () => {
        const credentialList = document.getElementById('credential-list');
        const noCredentials = document.getElementById('no-credentials');
        
        expect(credentialList.getAttribute('role')).toBe('list');
        expect(credentialList.getAttribute('aria-label')).toBe('Saved credentials');
        expect(noCredentials.getAttribute('role')).toBe('status');
    });

    it('should add proper ARIA attributes to credential items', () => {
        const testCredentials = [
            { id: '1', url: 'https://example.com', username: 'user@example.com', password: 'pass1' }
        ];
        
        controller.displayCredentials(testCredentials);
        
        const credentialItem = document.querySelector('.credential-item');
        expect(credentialItem.getAttribute('role')).toBe('listitem');
        expect(credentialItem.getAttribute('tabindex')).toBe('0');
        expect(credentialItem.getAttribute('aria-label')).toContain('Credential for https://example.com');
    });

    it('should handle keyboard navigation on credential items', () => {
        const testCredentials = [
            { id: '1', url: 'https://example.com', username: 'user@example.com', password: 'pass1' }
        ];
        
        controller.displayCredentials(testCredentials);
        
        const credentialItem = document.querySelector('.credential-item');
        const editSpy = vi.spyOn(controller, 'editCredential');
        
        // Test Enter key
        const enterEvent = new window.KeyboardEvent('keydown', { key: 'Enter' });
        credentialItem.dispatchEvent(enterEvent);
        
        expect(editSpy).toHaveBeenCalledWith('1');
        
        // Test Space key
        const spaceEvent = new window.KeyboardEvent('keydown', { key: ' ' });
        credentialItem.dispatchEvent(spaceEvent);
        
        expect(editSpy).toHaveBeenCalledTimes(2);
    });

    it('should manage focus properly in modals', () => {
        // Mock focus methods
        const focusSpy = vi.fn();
        document.getElementById('credential-url').focus = focusSpy;
        
        controller.showAddCredentialForm();
        
        // Focus should be set to first input after a short delay
        setTimeout(() => {
            expect(focusSpy).toHaveBeenCalled();
        }, 150);
    });

    it('should add ARIA attributes to form validation errors', () => {
        controller.showFieldError('url-error', 'Test error message');
        
        const errorElement = document.getElementById('url-error');
        expect(errorElement.classList.contains('hidden')).toBe(false);
        expect(errorElement.textContent).toBe('Test error message');
    });

    it('should add ARIA live regions to notifications', () => {
        controller.showError('Test error');
        
        const errorNotification = document.querySelector('.error-notification');
        expect(errorNotification.getAttribute('role')).toBe('alert');
        expect(errorNotification.getAttribute('aria-live')).toBe('assertive');
        
        controller.showTemporaryMessage('Test success');
        
        const successNotification = document.querySelector('.temporary-notification');
        expect(successNotification.getAttribute('role')).toBe('status');
        expect(successNotification.getAttribute('aria-live')).toBe('polite');
    });
});

describe('Error Handling', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
    });

    it('should display error messages with proper styling', () => {
        controller.showError('Test error message');
        
        const errorNotification = document.querySelector('.error-notification');
        expect(errorNotification).toBeTruthy();
        expect(errorNotification.textContent).toContain('Test error message');
    });

    it('should display temporary success messages', () => {
        controller.showTemporaryMessage('Test success message');
        
        const notification = document.querySelector('.temporary-notification');
        expect(notification).toBeTruthy();
        expect(notification.textContent).toBe('Test success message');
    });

    it('should handle Chrome runtime errors gracefully', async () => {
        mockChrome.runtime.sendMessage.mockRejectedValue(new Error('Runtime error'));
        
        const errorSpy = vi.spyOn(controller, 'showError');
        
        await controller.checkAuthState();
        
        expect(errorSpy).not.toHaveBeenCalled(); // Should show auth interface instead
        
        const authContainer = document.getElementById('auth-container');
        expect(authContainer.classList.contains('hidden')).toBe(false);
    });

    it('should validate URL format', () => {
        expect(controller.isValidUrl('https://example.com')).toBe(true);
        expect(controller.isValidUrl('http://example.com')).toBe(true);
        expect(controller.isValidUrl('example.com')).toBe(true);
        expect(controller.isValidUrl('invalid-url')).toBe(false);
        expect(controller.isValidUrl('')).toBe(false);
    });

    it('should normalize URLs properly', () => {
        expect(controller.normalizeUrl('example.com')).toBe('https://example.com');
        expect(controller.normalizeUrl('https://example.com')).toBe('https://example.com');
        expect(controller.normalizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should format URLs for display', () => {
        expect(controller.formatUrl('https://example.com/path')).toBe('example.com');
        expect(controller.formatUrl('http://subdomain.example.com')).toBe('subdomain.example.com');
        expect(controller.formatUrl('invalid-url')).toBe('invalid-url');
    });
});

describe('Background Service Communication', () => {
    let controller;

    beforeEach(() => {
        controller = new PopupController();
    });

    it('should send correct message for credential operations', async () => {
        mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });
        
        // Mock form submission
        controller.showAddCredentialForm();
        
        const urlInput = document.getElementById('credential-url');
        const usernameInput = document.getElementById('credential-username');
        const passwordInput = document.getElementById('credential-password');
        
        urlInput.value = 'https://example.com';
        usernameInput.value = 'test@example.com';
        passwordInput.value = 'password123';
        
        const form = document.getElementById('credential-form');
        const submitEvent = new window.Event('submit');
        form.dispatchEvent(submitEvent);
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'ADD_CREDENTIAL',
            payload: {
                id: undefined,
                url: 'https://example.com',
                username: 'test@example.com',
                password: 'password123'
            }
        });
    });

    it('should handle authentication messages', async () => {
        mockChrome.runtime.sendMessage.mockResolvedValue({ success: true });
        
        const gmailBtn = document.getElementById('gmail-login');
        gmailBtn.click();
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'GMAIL_AUTH',
            payload: { mode: 'login' }
        });
    });

    it('should handle export/import messages', async () => {
        mockChrome.runtime.sendMessage.mockResolvedValue({ success: true, data: '{}' });
        
        controller.showExportModal();
        
        const keyPhraseInput = document.getElementById('export-key-phrase');
        keyPhraseInput.value = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16';
        
        const startBtn = document.getElementById('start-export');
        startBtn.click();
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'EXPORT_DATA',
            payload: {
                keyPhrase: ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'],
                includePasswords: true
            }
        });
    });
});