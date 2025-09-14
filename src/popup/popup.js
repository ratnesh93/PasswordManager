// Chrome Password Manager - Popup Script
// This file handles the popup UI interactions and communication with background script

console.log('🔍 SCRIPT START: popup.js is loading...');

class PopupController {
    constructor() {
        console.log('🔍 Constructor step 1: Setting up properties');
        this.allCredentials = [];
        this.filteredCredentials = [];
        this.currentEditingCredential = null;
        this.credentialToDelete = null;
        this.currentKeyPhrase = null;

        // Password visibility state management
        this.passwordVisibilityState = {};

        // Master password verification state
        this.masterPasswordAttempts = 0;
        this.masterPasswordLockoutUntil = null;
        this.masterPasswordContext = null;
        this.sessionVerificationExpiry = null;
        this.sessionVerificationDuration = 5 * 60 * 1000; // 5 minutes

        // Debug logging
        console.log('🔍 Constructor step 2: Properties set, calling methods');

        try {
            console.log('🔍 Constructor step 3: Calling initializeEventListeners');
            this.initializeEventListeners();
            console.log('🔍 Constructor step 4: Calling setupSecurityListeners');
            this.setupSecurityListeners();
            console.log('🔍 Constructor step 5: Calling checkPendingKeyPhrase');
            this.checkPendingKeyPhrase();
            console.log('🔍 Constructor step 6: Calling checkAuthState');
            this.checkAuthState();
            console.log('🔍 Constructor step 7: All methods called successfully');
        } catch (error) {
            console.error('🔍 Constructor error:', error);
            throw error;
        }
    }

    // Password Visibility State Management Methods

    /**
     * Show password for a specific credential
     * @param {string} credentialId - The ID of the credential
     * @param {string} actualPassword - The actual decrypted password
     */
    showCredentialPassword(credentialId, actualPassword) {
        // Clear any existing timeout for this credential
        if (this.passwordVisibilityState[credentialId]?.autoHideTimeout) {
            clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
        }

        // Set up visibility state
        this.passwordVisibilityState[credentialId] = {
            isVisible: true,
            actualPassword: actualPassword,
            revealedAt: Date.now(),
            autoHideTimeout: null
        };

        // Set up auto-hide timeout (30 seconds)
        this.passwordVisibilityState[credentialId].autoHideTimeout = setTimeout(() => {
            this.hideCredentialPassword(credentialId);
            this.updatePasswordVisibilityUI(credentialId);
            this.showTemporaryMessage('Password automatically hidden after 30 seconds for security', 3000, 'info');
            this.announceToScreenReader(`Password automatically hidden for ${this.getCredentialDisplayName(credentialId)} after 30 seconds for security`);
        }, 30000);

        console.log(`Password revealed for credential ${credentialId}`);
    }

    /**
     * Hide password for a specific credential
     * @param {string} credentialId - The ID of the credential
     */
    hideCredentialPassword(credentialId) {
        if (this.passwordVisibilityState[credentialId]) {
            // Clear timeout if it exists
            if (this.passwordVisibilityState[credentialId].autoHideTimeout) {
                clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
            }

            // Clear the state
            delete this.passwordVisibilityState[credentialId];
        }

        console.log(`Password hidden for credential ${credentialId}`);
    }

    /**
     * Check if a credential's password is currently visible
     * @param {string} credentialId - The ID of the credential
     * @returns {boolean} True if password is visible
     */
    isPasswordVisible(credentialId) {
        return this.passwordVisibilityState[credentialId]?.isVisible || false;
    }

    /**
     * Get the actual password for a credential if it's visible
     * @param {string} credentialId - The ID of the credential
     * @returns {string|null} The actual password or null if not visible
     */
    getVisiblePassword(credentialId) {
        return this.passwordVisibilityState[credentialId]?.actualPassword || null;
    }

    /**
     * Clear all revealed passwords from memory (security cleanup)
     */
    clearAllRevealedPasswords() {
        Object.keys(this.passwordVisibilityState).forEach(credentialId => {
            this.hideCredentialPassword(credentialId);
        });
        this.passwordVisibilityState = {};
        console.log('All revealed passwords cleared from memory');
    }

    /**
     * Clear revealed passwords for credentials that are no longer in the list
     */
    cleanupStalePasswordStates() {
        const currentCredentialIds = new Set(this.allCredentials.map(c => c.id));
        
        Object.keys(this.passwordVisibilityState).forEach(credentialId => {
            if (!currentCredentialIds.has(credentialId)) {
                this.hideCredentialPassword(credentialId);
            }
        });
    }

    /**
     * Reset auto-hide timeout for a credential (extends visibility time)
     * @param {string} credentialId - The ID of the credential
     */
    resetAutoHideTimeout(credentialId) {
        if (this.passwordVisibilityState[credentialId]?.isVisible) {
            // Clear existing timeout
            if (this.passwordVisibilityState[credentialId].autoHideTimeout) {
                clearTimeout(this.passwordVisibilityState[credentialId].autoHideTimeout);
            }

            // Set new timeout
            this.passwordVisibilityState[credentialId].autoHideTimeout = setTimeout(() => {
                this.hideCredentialPassword(credentialId);
                this.updatePasswordVisibilityUI(credentialId);
                this.showTemporaryMessage('Password automatically hidden after 30 seconds for security', 3000, 'info');
                this.announceToScreenReader(`Password automatically hidden for ${this.getCredentialDisplayName(credentialId)} after 30 seconds for security`);
            }, 30000);

            // Update revealed timestamp
            this.passwordVisibilityState[credentialId].revealedAt = Date.now();
        }
    }

    /**
     * Announce message to screen readers
     * @param {string} message - The message to announce
     */
    announceToScreenReader(message) {
        // Create or get existing announcement element
        let announcer = document.getElementById('screen-reader-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'screen-reader-announcer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.className = 'sr-only';
            document.body.appendChild(announcer);
        }

        // Clear and set new message
        announcer.textContent = '';
        setTimeout(() => {
            announcer.textContent = message;
        }, 100);
    }

    /**
     * Get display name for a credential (for screen reader announcements)
     * @param {string} credentialId - The ID of the credential
     * @returns {string} Display name for the credential
     */
    getCredentialDisplayName(credentialId) {
        const credential = this.allCredentials.find(c => c.id === credentialId);
        if (!credential) return 'credential';
        
        const url = this.formatUrl(credential.url);
        return `${url} (${credential.username})`;
    }

    /**
     * Navigate between credential items using arrow keys
     * @param {HTMLElement} currentItem - The currently focused credential item
     * @param {number} direction - Direction to navigate (1 for down, -1 for up)
     */
    navigateCredentialItems(currentItem, direction) {
        const credentialItems = Array.from(document.querySelectorAll('.credential-item'));
        const currentIndex = credentialItems.indexOf(currentItem);
        
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex + direction;
        
        // Wrap around navigation
        if (nextIndex < 0) {
            nextIndex = credentialItems.length - 1;
        } else if (nextIndex >= credentialItems.length) {
            nextIndex = 0;
        }
        
        const nextItem = credentialItems[nextIndex];
        if (nextItem) {
            nextItem.focus();
            
            // Announce navigation to screen readers
            const credentialId = nextItem.getAttribute('data-credential-id');
            if (credentialId) {
                this.announceToScreenReader(`Focused on ${this.getCredentialDisplayName(credentialId)}`);
            }
        }
    }

    /**
     * Show visual feedback for action button success/error states
     * @param {HTMLElement} button - The button element
     * @param {string} state - 'success' or 'error'
     * @param {number} duration - Duration to show the state in milliseconds
     */
    showActionFeedback(button, state, duration = 2000) {
        if (!button) return;
        
        // Remove any existing state classes
        button.classList.remove('success', 'error');
        
        // Add the new state class
        button.classList.add(state);
        
        // Remove the state class after duration
        setTimeout(() => {
            button.classList.remove(state);
        }, duration);
    }

    /**
     * Enhanced copy password method with visual feedback
     * @param {string} credentialId - The ID of the credential
     */
    async copyPassword(credentialId) {
        const copyBtn = document.querySelector(`[data-credential-id="${credentialId}"].copy-btn`);
        
        try {
            // Check if password is visible, if so copy the actual password
            let passwordToCopy;
            if (this.isPasswordVisible(credentialId)) {
                passwordToCopy = this.getVisiblePassword(credentialId);
            } else {
                // Need to get password from background service
                const credential = this.allCredentials.find(c => c.id === credentialId);
                if (!credential) {
                    throw new Error('Credential not found');
                }
                passwordToCopy = credential.password; // This will be the masked version
            }

            await navigator.clipboard.writeText(passwordToCopy);
            
            // Show success feedback
            this.showActionFeedback(copyBtn, 'success');
            this.announceToScreenReader(`Password copied to clipboard for ${this.getCredentialDisplayName(credentialId)}`);
            this.showTemporaryMessage('Password copied to clipboard', 2000, 'success');
            
        } catch (error) {
            console.error('Error copying password:', error);
            
            // Show error feedback
            this.showActionFeedback(copyBtn, 'error');
            this.announceToScreenReader('Failed to copy password to clipboard');
            this.showTemporaryMessage('Failed to copy password', 3000, 'error');
        }
    }

    /**
     * Handle password visibility toggle for credential list items
     * @param {string} credentialId - The ID of the credential
     */
    async handlePasswordVisibilityToggle(credentialId) {
        try {
            // If password is currently visible, hide it
            if (this.isPasswordVisible(credentialId)) {
                this.hideCredentialPassword(credentialId);
                this.updatePasswordVisibilityUI(credentialId);
                return;
            }

            // Check if locked out
            if (this.isLockedOut()) {
                const remainingTime = Math.ceil((this.masterPasswordLockoutUntil - Date.now()) / 60000);
                this.showTemporaryMessage(`Access locked. Please wait ${remainingTime} minute${remainingTime !== 1 ? 's' : ''} before trying again.`, 5000, 'error');
                return;
            }

            // Show loading state
            this.setPasswordVisibilityLoading(credentialId, true);

            // Request master password verification
            const masterPassword = await this.showMasterPasswordModal(
                'Please enter your master password to view this password:',
                'password-reveal'
            );

            if (!masterPassword) {
                // User cancelled - remove loading state
                this.setPasswordVisibilityLoading(credentialId, false);
                return;
            }

            // Request actual password from background service
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: credentialId,
                    masterPassword: masterPassword
                }
            });

            // Remove loading state
            this.setPasswordVisibilityLoading(credentialId, false);

            if (response.success && response.password) {
                // Set session verification expiry on successful verification
                this.setSessionVerificationExpiry();
                
                // Reset failed attempts counter on successful verification
                this.masterPasswordAttempts = 0;
                
                // Show the actual password
                this.showCredentialPassword(credentialId, response.password);
                this.updatePasswordVisibilityUI(credentialId);
            } else {
                // Handle failed verification
                this.handleFailedVerification();
                
                // Show clear error message
                const errorMessage = response.error || 'Failed to retrieve password. Please check your master password.';
                this.showTemporaryMessage(errorMessage, 5000, 'error');
            }

        } catch (error) {
            console.error('Error toggling password visibility:', error);
            this.setPasswordVisibilityLoading(credentialId, false);
            this.showTemporaryMessage('Error retrieving password. Please try again.', 5000, 'error');
        }
    }

    /**
     * Update the UI elements for password visibility state
     * @param {string} credentialId - The ID of the credential
     */
    updatePasswordVisibilityUI(credentialId) {
        const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
        const passwordDisplay = document.querySelector(`[data-credential-id="${credentialId}"].password-display`);
        
        if (!eyeBtn || !passwordDisplay) return;

        const isVisible = this.isPasswordVisible(credentialId);
        
        if (isVisible) {
            // Show actual password
            const actualPassword = this.getVisiblePassword(credentialId);
            passwordDisplay.textContent = actualPassword;
            passwordDisplay.classList.add('password-visible');
            
            // Update eye button to "hide" state with enhanced icons
            eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️‍🗨️</span><span class="btn-text">Hide</span>';
            eyeBtn.title = 'Hide password (currently visible)';
            eyeBtn.setAttribute('aria-label', 'Hide password for this credential');
            eyeBtn.classList.add('password-visible');
            
            // Enhanced screen reader announcements
            passwordDisplay.setAttribute('aria-label', `Password is now visible: ${actualPassword}`);
            passwordDisplay.setAttribute('aria-live', 'polite');
            
            // Announce state change to screen readers
            this.announceToScreenReader(`Password revealed for ${this.getCredentialDisplayName(credentialId)}`);
        } else {
            // Show masked password
            passwordDisplay.textContent = '••••••••';
            passwordDisplay.classList.remove('password-visible');
            
            // Update eye button to "show" state with enhanced icons
            eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️</span><span class="btn-text">Show</span>';
            eyeBtn.title = 'Show password (currently hidden)';
            eyeBtn.setAttribute('aria-label', 'Show password for this credential');
            eyeBtn.classList.remove('password-visible');
            
            // Enhanced screen reader announcements
            passwordDisplay.setAttribute('aria-label', 'Password is hidden');
            passwordDisplay.setAttribute('aria-live', 'polite');
            
            // Announce state change to screen readers
            this.announceToScreenReader(`Password hidden for ${this.getCredentialDisplayName(credentialId)}`);
        }
    }

    /**
     * Set loading state for password visibility button
     * @param {string} credentialId - The ID of the credential
     * @param {boolean} isLoading - Whether to show loading state
     */
    setPasswordVisibilityLoading(credentialId, isLoading) {
        const eyeBtn = document.querySelector(`[data-credential-id="${credentialId}"].eye-btn`);
        
        if (!eyeBtn) return;

        if (isLoading) {
            // Enhanced loading indicator with spinner
            eyeBtn.innerHTML = '<span class="btn-icon loading-spinner" aria-hidden="true"></span><span class="btn-text">Verifying...</span>';
            eyeBtn.title = 'Verifying master password, please wait...';
            eyeBtn.setAttribute('aria-label', 'Verifying master password for password reveal');
            eyeBtn.disabled = true;
            eyeBtn.classList.add('loading');
            
            // Announce loading state to screen readers
            this.announceToScreenReader(`Verifying master password for ${this.getCredentialDisplayName(credentialId)}`);
        } else {
            eyeBtn.disabled = false;
            eyeBtn.classList.remove('loading');
            
            // Restore normal state based on visibility
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

    initializeEventListeners() {
        console.log('🔍 initializeEventListeners: Starting event listener setup');

        try {
            // Auth choice buttons
            console.log('🔍 initializeEventListeners: Setting up auth choice buttons');
            document.getElementById('show-login')?.addEventListener('click', () => this.showLoginForm());
            document.getElementById('show-signup')?.addEventListener('click', () => this.showSignupForm());

            // Switch between login/signup
            document.getElementById('switch-to-signup')?.addEventListener('click', () => this.showSignupForm());
            document.getElementById('switch-to-login')?.addEventListener('click', () => this.showLoginForm());

            // Back buttons
            document.getElementById('back-to-choice')?.addEventListener('click', () => this.showAuthChoice());

            // Login/signup submit buttons
            document.getElementById('login-submit')?.addEventListener('click', () => this.handleLogin());
            document.getElementById('signup-submit')?.addEventListener('click', () => this.handleSignup());

            // Password visibility toggles
            document.getElementById('toggle-master-password')?.addEventListener('click', () => this.togglePasswordVisibility('master-password'));
            document.getElementById('toggle-new-master-password')?.addEventListener('click', () => this.togglePasswordVisibility('new-master-password'));
            document.getElementById('toggle-confirm-password')?.addEventListener('click', () => this.togglePasswordVisibility('confirm-master-password'));

            // Password validation
            document.getElementById('new-master-password')?.addEventListener('input', () => {
                this.validateNewPassword();
                this.updateSignupButton();
            });
            document.getElementById('confirm-master-password')?.addEventListener('input', () => {
                this.validatePasswordConfirmation();
                this.updateSignupButton();
            });

            // Key phrase actions
            document.getElementById('copy-key-phrase')?.addEventListener('click', () => this.copyKeyPhrase());
            document.getElementById('download-key-phrase')?.addEventListener('click', () => this.downloadKeyPhrase());
            document.getElementById('key-phrase-saved')?.addEventListener('change', () => this.toggleKeyPhraseConfirmation());
            document.getElementById('confirm-key-phrase')?.addEventListener('click', () => this.confirmKeyPhrase());

            // Search functionality
            document.getElementById('search-credentials')?.addEventListener('input', () => this.handleSearch());
            document.getElementById('clear-search')?.addEventListener('click', () => this.clearSearch());

            // Main app buttons
            document.getElementById('add-credential')?.addEventListener('click', () => this.showAddCredentialForm());
            document.getElementById('export-btn')?.addEventListener('click', () => this.handleExport());
            document.getElementById('import-btn')?.addEventListener('click', () => this.handleImport());
            document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
            document.getElementById('permissions-btn')?.addEventListener('click', () => this.showPermissionsSection());
            document.getElementById('delete-account-btn')?.addEventListener('click', () => this.showDeleteAccountModal());

            // Permissions section
            document.getElementById('request-autofill')?.addEventListener('click', () => this.requestAutofillPermissions());
            document.getElementById('refresh-permissions')?.addEventListener('click', () => this.refreshPermissionStatus());
            document.getElementById('close-permissions')?.addEventListener('click', () => this.hidePermissionsSection());

            // Credential modal
            document.getElementById('close-modal')?.addEventListener('click', () => this.hideCredentialModal());
            document.getElementById('cancel-credential')?.addEventListener('click', () => this.hideCredentialModal());

            const credentialForm = document.getElementById('credential-form');
            if (credentialForm) {
                console.log('🔍 Adding submit listener to credential-form');
                credentialForm.addEventListener('submit', (e) => this.handleCredentialSubmit(e));
            } else {
                console.log('🔍 credential-form element not found');
            }

            document.getElementById('toggle-credential-password')?.addEventListener('click', () => this.togglePasswordVisibility('credential-password'));
            document.getElementById('generate-password')?.addEventListener('click', () => this.generatePassword());

            // Delete modal
            document.getElementById('cancel-delete')?.addEventListener('click', () => this.hideDeleteModal());
            document.getElementById('confirm-delete')?.addEventListener('click', () => this.confirmDelete());

            // Export modal
            document.getElementById('close-export-modal')?.addEventListener('click', () => this.hideExportModal());
            document.getElementById('cancel-export')?.addEventListener('click', () => this.hideExportModal());
            document.getElementById('start-export')?.addEventListener('click', () => this.startExport());

            // Import modal
            document.getElementById('close-import-modal')?.addEventListener('click', () => this.hideImportModal());
            document.getElementById('cancel-import')?.addEventListener('click', () => this.hideImportModal());
            document.getElementById('import-file')?.addEventListener('change', () => this.handleFileSelection());
            document.getElementById('preview-import')?.addEventListener('click', () => this.previewImport());
            document.getElementById('start-import')?.addEventListener('click', () => this.startImport());

            // Delete account modal
            document.getElementById('cancel-delete-account')?.addEventListener('click', () => this.hideDeleteAccountModal());
            document.getElementById('confirm-delete-account')?.addEventListener('change', () => this.toggleDeleteAccountButton());
            document.getElementById('confirm-delete-account-btn')?.addEventListener('click', () => this.confirmDeleteAccount());
            document.getElementById('toggle-delete-password')?.addEventListener('click', () => this.togglePasswordVisibility('delete-master-password'));
            document.getElementById('delete-master-password')?.addEventListener('input', () => this.toggleDeleteAccountButton());

            // Master password modal
            document.getElementById('cancel-master-password')?.addEventListener('click', () => this.hideMasterPasswordModal());

            const confirmMasterPasswordBtn = document.getElementById('continue-master-password');
            if (confirmMasterPasswordBtn) {
                console.log('🔍 Adding click listener to continue-master-password');
                confirmMasterPasswordBtn.addEventListener('click', () => this.confirmMasterPassword());
            } else {
                console.log('🔍 confirm-master-password element not found');
            }

            const toggleModalPasswordBtn = document.getElementById('toggle-modal-master-password');
            if (toggleModalPasswordBtn) {
                console.log('🔍 Adding click listener to toggle-modal-master-password');
                toggleModalPasswordBtn.addEventListener('click', () => this.togglePasswordVisibility('modal-master-password'));
            } else {
                console.log('🔍 toggle-modal-master-password element not found');
            }

            console.log('🔍 initializeEventListeners: All event listeners set up successfully');
        } catch (error) {
            console.error('🔍 initializeEventListeners error:', error);
            throw error;
        }
    }

    async checkAuthState() {
        console.log('🔍 checkAuthState called');

        try {
            // Always check key phrase confirmation first, regardless of auth state
            const keyPhraseConfirmed = sessionStorage.getItem('keyPhraseConfirmed');
            const pendingKeyPhrase = sessionStorage.getItem('pendingKeyPhrase');

            console.log('🔍 keyPhraseConfirmed:', keyPhraseConfirmed);
            console.log('🔍 pendingKeyPhrase exists:', !!pendingKeyPhrase);
            console.log('🔍 this.currentKeyPhrase exists:', !!this.currentKeyPhrase);

            // If there's a pending key phrase and it hasn't been confirmed, show it
            if ((this.currentKeyPhrase || pendingKeyPhrase) && !keyPhraseConfirmed) {
                console.log('🔍 Showing key phrase (not confirmed)');
                if (!this.currentKeyPhrase && pendingKeyPhrase) {
                    try {
                        this.currentKeyPhrase = JSON.parse(pendingKeyPhrase);
                    } catch (e) {
                        console.error('Failed to parse pending key phrase:', e);
                    }
                }
                this.showKeyPhrase(this.currentKeyPhrase);
                return;
            }

            const response = await chrome.runtime.sendMessage({
                type: 'CHECK_AUTH_STATE'
            });

            console.log('🔍 Auth response:', response);

            if (response.authenticated) {
                console.log('🔍 User authenticated, showing main interface');
                this.showMainInterface();
                await this.loadCredentials();
            } else {
                console.log('🔍 User not authenticated, showing auth interface');
                this.showAuthInterface();
            }
        } catch (error) {
            console.error('Error checking auth state:', error);
            // Check if we have a pending key phrase to show
            if (this.currentKeyPhrase) {
                this.showKeyPhrase(this.currentKeyPhrase);
            } else {
                this.showAuthInterface();
            }
        }
    }



    async handleLogin() {
        const masterPassword = document.getElementById('master-password').value;

        // Clear previous errors
        this.hideFieldError('master-password-error');

        if (!masterPassword) {
            this.showFieldError('master-password-error', 'Please enter your master password');
            return;
        }

        try {
            this.showLoading();

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Login timeout')), 10000); // 10 second timeout
            });

            const messagePromise = chrome.runtime.sendMessage({
                type: 'LOGIN',
                payload: { masterPassword }
            });

            const response = await Promise.race([messagePromise, timeoutPromise]);

            console.log('Login response received:', response);

            if (response && response.success) {
                // Clear the password field for security after successful login
                const masterPasswordField = document.getElementById('master-password');
                if (masterPasswordField) {
                    masterPasswordField.value = '';
                }
                this.showMainInterface();
                await this.loadCredentials();
            } else {
                this.showLoginForm();
                // Clear the password field for security
                const masterPasswordField = document.getElementById('master-password');
                if (masterPasswordField) {
                    masterPasswordField.value = '';
                }
                const errorMessage = response && response.error ? response.error : 'Invalid master password. Please try again.';
                this.showFieldError('master-password-error', errorMessage);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginForm();
            // Clear the password field for security
            const masterPasswordField = document.getElementById('master-password');
            if (masterPasswordField) {
                masterPasswordField.value = '';
            }
            const errorMessage = error.message || 'Login failed. Please try again.';
            this.showFieldError('master-password-error', errorMessage);
        }
    }

    async handleSignup() {
        const masterPassword = document.getElementById('new-master-password').value;
        const confirmPassword = document.getElementById('confirm-master-password').value;

        // Clear previous errors
        this.hideFieldError('new-master-password-error');
        this.hideFieldError('confirm-password-error');

        // Validate password requirements
        if (!this.validateNewPassword()) {
            this.showFieldError('new-master-password-error', 'Please meet all password requirements');
            return;
        }

        // Validate password confirmation
        if (masterPassword !== confirmPassword) {
            this.showFieldError('confirm-password-error', 'Passwords do not match');
            return;
        }

        try {
            this.showLoading();

            const response = await chrome.runtime.sendMessage({
                type: 'SIGNUP',
                payload: { masterPassword }
            });

            if (response.success) {
                this.showKeyPhrase(response.keyPhrase);
            } else {
                this.showSignupForm();
                this.showFieldError('new-master-password-error', response.error || 'Signup failed. Please try again.');
            }
        } catch (error) {
            console.error('Signup error:', error);
            this.showSignupForm();
            this.showFieldError('new-master-password-error', error.message || 'Signup failed. Please try again.');
        }
    }

    async loadCredentials() {
        try {
            console.log('🔍 loadCredentials: Requesting credentials from background');
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIALS'
            });

            console.log('🔍 loadCredentials: Response received:', response);
            console.log('🔍 loadCredentials: Credentials count:', response.credentials ? response.credentials.length : 0);

            if (response.success) {
                this.displayCredentials(response.credentials || []);
            } else {
                console.log('🔍 loadCredentials: Failed to load credentials:', response.error);
                this.displayCredentials([]);
            }
        } catch (error) {
            console.error('Error loading credentials:', error);
            this.displayCredentials([]);
        }
    }

    displayCredentials(credentials) {
        console.log('🔍 displayCredentials: Received credentials:', credentials ? credentials.length : 0);
        this.allCredentials = credentials || [];
        this.filteredCredentials = [...this.allCredentials];
        console.log('🔍 displayCredentials: Set allCredentials to:', this.allCredentials.length);
        
        // Clean up password visibility states for credentials that no longer exist
        this.cleanupStalePasswordStates();
        
        this.renderCredentialList();
    }

    renderCredentialList() {
        const container = document.getElementById('credential-list');
        const noCredentialsDiv = document.getElementById('no-credentials');

        container.innerHTML = '';

        if (this.filteredCredentials.length === 0) {
            container.classList.add('hidden');
            noCredentialsDiv.classList.remove('hidden');

            if (this.allCredentials.length > 0) {
                // Show "no results" message for search
                noCredentialsDiv.querySelector('h3').textContent = 'No matching credentials';
                noCredentialsDiv.querySelector('p').textContent = 'Try adjusting your search terms';
            } else {
                // Show "no credentials" message
                noCredentialsDiv.querySelector('h3').textContent = 'No credentials found';
                noCredentialsDiv.querySelector('p').textContent = 'Add your first credential to get started';
            }
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
            item.setAttribute('title', 'Keyboard shortcuts: V=view password, C=copy, E=edit, Delete=remove, ↑↓=navigate');

            const credentialInfo = document.createElement('div');
            credentialInfo.className = 'credential-info';

            const urlDiv = document.createElement('div');
            urlDiv.className = 'credential-url';
            urlDiv.textContent = this.formatUrl(credential.url);
            urlDiv.title = credential.url;

            const usernameDiv = document.createElement('div');
            usernameDiv.className = 'credential-username';
            usernameDiv.textContent = credential.username;

            credentialInfo.appendChild(urlDiv);
            credentialInfo.appendChild(usernameDiv);

            // Add password display section
            const passwordDiv = document.createElement('div');
            passwordDiv.className = 'credential-password';
            
            const passwordDisplay = document.createElement('span');
            passwordDisplay.className = 'password-display';
            passwordDisplay.setAttribute('data-credential-id', credential.id);
            
            // Show actual password if visible, otherwise show masked password
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
            credentialInfo.appendChild(passwordDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'credential-actions';

            // Eye button for password visibility
            const eyeBtn = document.createElement('button');
            eyeBtn.className = 'action-btn eye-btn';
            eyeBtn.setAttribute('data-credential-id', credential.id);
            eyeBtn.setAttribute('tabindex', '0');
            
            // Set button state based on password visibility
            if (isVisible) {
                eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️‍🗨️</span><span class="btn-text">Hide</span>';
                eyeBtn.title = 'Hide password (currently visible)';
                eyeBtn.setAttribute('aria-label', 'Hide password for this credential');
                eyeBtn.classList.add('password-visible');
            } else {
                eyeBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">👁️</span><span class="btn-text">Show</span>';
                eyeBtn.title = 'Show password (currently hidden)';
                eyeBtn.setAttribute('aria-label', 'Show password for this credential');
                eyeBtn.classList.remove('password-visible');
            }
            
            // Enhanced event listeners for accessibility
            eyeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handlePasswordVisibilityToggle(credential.id);
            });

            eyeBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handlePasswordVisibilityToggle(credential.id);
                }
            });

            const copyBtn = document.createElement('button');
            copyBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">📋</span><span class="btn-text">Copy</span>';
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.title = 'Copy password to clipboard';
            copyBtn.setAttribute('aria-label', 'Copy password to clipboard');
            copyBtn.setAttribute('tabindex', '0');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyPassword(credential.id);
            });
            copyBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.copyPassword(credential.id);
                }
            });

            const editBtn = document.createElement('button');
            editBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">✏️</span><span class="btn-text">Edit</span>';
            editBtn.className = 'action-btn edit-btn';
            editBtn.title = 'Edit this credential';
            editBtn.setAttribute('aria-label', 'Edit this credential');
            editBtn.setAttribute('tabindex', '0');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editCredential(credential.id);
            });
            editBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.editCredential(credential.id);
                }
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '<span class="btn-icon" aria-hidden="true">🗑️</span><span class="btn-text sr-only">Delete</span>';
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.title = 'Delete this credential';
            deleteBtn.setAttribute('aria-label', 'Delete this credential');
            deleteBtn.setAttribute('tabindex', '0');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDeleteConfirmation(credential);
            });
            deleteBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showDeleteConfirmation(credential);
                }
            });

            actionsDiv.appendChild(eyeBtn);
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);

            // Enhanced keyboard navigation for credential items
            item.addEventListener('keydown', (e) => {
                // Handle arrow key navigation between credential items
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateCredentialItems(item, e.key === 'ArrowDown' ? 1 : -1);
                }
                // Handle Tab navigation to action buttons
                else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    const firstActionBtn = item.querySelector('.action-btn');
                    if (firstActionBtn) {
                        firstActionBtn.focus();
                    }
                }
                // Handle Enter/Space to edit credential
                else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.editCredential(credential.id);
                }
                // Handle keyboard shortcuts
                else if (e.key === 'v' && !e.ctrlKey && !e.metaKey) {
                    // 'v' for view/hide password
                    e.preventDefault();
                    this.handlePasswordVisibilityToggle(credential.id);
                }
                else if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
                    // 'c' for copy password
                    e.preventDefault();
                    this.copyPassword(credential.id);
                }
                else if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
                    // 'e' for edit
                    e.preventDefault();
                    this.editCredential(credential.id);
                }
                else if (e.key === 'Delete' || e.key === 'Backspace') {
                    // Delete key for delete credential
                    e.preventDefault();
                    this.showDeleteConfirmation(credential);
                }
            });

            item.appendChild(credentialInfo);
            item.appendChild(actionsDiv);
            container.appendChild(item);
        });
    }

    showAddCredentialForm() {
        this.currentEditingCredential = null;

        // Set modal title with null check
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) {
            modalTitle.textContent = 'Add New Credential';
        }

        // Set save button text with null check
        const saveBtnText = document.getElementById('save-btn-text');
        if (saveBtnText) {
            saveBtnText.textContent = 'Save Credential';
        }

        // Clear form with null check
        const credentialForm = document.getElementById('credential-form');
        if (credentialForm) {
            credentialForm.reset();
        }
        this.clearCredentialFormErrors();

        // Show modal and manage focus
        const modal = document.getElementById('credential-modal');
        modal.classList.remove('hidden');

        // Store the previously focused element
        this.previouslyFocusedElement = document.activeElement;

        // Focus the first input
        setTimeout(() => {
            document.getElementById('credential-url').focus();
        }, 100);

        // Trap focus within modal
        this.trapFocus(modal);
    }

    async handleExport() {
        this.showExportModal();
    }

    async handleImport() {
        this.showImportModal();
    }

    async handleLogout() {
        try {
            await chrome.runtime.sendMessage({ type: 'LOGOUT' });
            this.clearSensitiveData();
            this.clearKeyPhraseConfirmation();
            this.showAuthInterface();
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear sensitive data even if logout fails
            this.clearSensitiveData();
            this.clearKeyPhraseConfirmation();
            this.showAuthInterface();
        }
    }

    showLoading() {
        this.hideAll();
        document.getElementById('loading').classList.remove('hidden');
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

    showLoginForm() {
        this.hideAll();
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        this.clearErrors();
        // Focus the master password input
        setTimeout(() => {
            document.getElementById('master-password')?.focus();
        }, 100);
    }

    showSignupForm() {
        this.hideAll();
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        this.clearErrors();
        // Focus the new master password input
        setTimeout(() => {
            document.getElementById('new-master-password')?.focus();
        }, 100);
    }

    showAuthChoice() {
        this.hideAll();
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('auth-choice').classList.remove('hidden');
        this.clearErrors();
        this.clearSensitiveData();
    }



    showKeyPhrase(keyPhrase) {
        console.log('🔍 showKeyPhrase called with:', keyPhrase ? keyPhrase.length + ' words' : 'null');

        this.currentKeyPhrase = keyPhrase;

        // Store key phrase in session storage for persistence
        try {
            sessionStorage.setItem('pendingKeyPhrase', JSON.stringify(keyPhrase));
            // Ensure confirmation flag is cleared when showing key phrase
            sessionStorage.removeItem('keyPhraseConfirmed');
            console.log('🔍 Stored key phrase in sessionStorage and cleared confirmation');
        } catch (error) {
            console.warn('Failed to store key phrase in session storage:', error);
        }

        this.hideAll();
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('key-phrase-display').classList.remove('hidden');

        // Reset the confirmation checkbox
        const checkbox = document.getElementById('key-phrase-saved');
        if (checkbox) {
            checkbox.checked = false;
            console.log('🔍 Reset checkbox to unchecked');
        }

        // Disable the confirm button initially
        const confirmBtn = document.getElementById('confirm-key-phrase');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            console.log('🔍 Disabled confirm button');
        }

        // Display key phrase words in a grid
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

    showError(message) {
        alert(message); // Simple error display for now
    }

    hideAll() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('main-container').classList.add('hidden');
    }

    hideAllAuthSections() {
        document.getElementById('auth-choice').classList.add('hidden');
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('key-phrase-display').classList.add('hidden');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Search and filter functionality
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

    // Credential modal management
    hideCredentialModal() {
        // Clear sensitive password data from form fields for security
        const passwordField = document.getElementById('credential-password');
        if (passwordField) {
            passwordField.value = '';
        }

        // Clear form data
        const urlField = document.getElementById('credential-url');
        if (urlField) {
            urlField.value = '';
        }

        const usernameField = document.getElementById('credential-username');
        if (usernameField) {
            usernameField.value = '';
        }

        // Clear any form errors
        this.clearCredentialFormErrors();

        document.getElementById('credential-modal').classList.add('hidden');
        this.currentEditingCredential = null;

        // Restore focus to previously focused element
        if (this.previouslyFocusedElement) {
            this.previouslyFocusedElement.focus();
            this.previouslyFocusedElement = null;
        }
    }

    async handleCredentialSubmit(e) {
        console.log('🔍 handleCredentialSubmit called');
        e.preventDefault();

        const urlField = document.getElementById('credential-url');
        const usernameField = document.getElementById('credential-username');
        const passwordField = document.getElementById('credential-password');

        if (!urlField || !usernameField || !passwordField) {
            this.showError('Form elements not found. Please refresh and try again.');
            return;
        }

        const url = urlField.value.trim();
        const username = usernameField.value.trim();
        const password = passwordField.value;

        // Clear previous errors
        this.clearCredentialFormErrors();

        // Validate form - only check for required fields, no URL format validation
        let hasErrors = false;

        if (!url) {
            this.showFieldError('url-error', 'Website/Service name is required');
            hasErrors = true;
        }

        if (!username) {
            this.showFieldError('username-error', 'Username/Email is required');
            hasErrors = true;
        }

        if (!password) {
            this.showFieldError('password-error', 'Password is required');
            hasErrors = true;
        }

        if (hasErrors) return;

        try {
            const saveBtn = document.getElementById('save-credential');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<span>Saving...</span>';
            saveBtn.disabled = true;

            // Always require master password for save/edit operations
            console.log('🔍 Requesting master password for credential operation');
            const masterPassword = await this.showMasterPasswordModal(
                this.currentEditingCredential ?
                    'Please enter your master password to update this credential:' :
                    'Please enter your master password to save this credential:',
                'edit'
            );
            console.log('🔍 Master password received:', masterPassword ? 'YES' : 'NO');

            if (!masterPassword) {
                console.log('🔍 No master password provided');
                this.showError('Master password is required to save credentials');
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                return;
            }

            console.log('🔍 Sending credential with master password');
            const response = await chrome.runtime.sendMessage({
                type: this.currentEditingCredential ? 'UPDATE_CREDENTIAL_WITH_PASSWORD' : 'SAVE_CREDENTIAL_WITH_PASSWORD',
                payload: {
                    id: this.currentEditingCredential?.id,
                    url: url,
                    username,
                    password,
                    masterPassword
                }
            });
            console.log('🔍 Response after master password:', response);

            console.log('🔍 Final response:', response);

            if (response.success) {
                console.log('🔍 Credential saved successfully');
                this.hideCredentialModal();
                await this.loadCredentials();
                this.showTemporaryMessage(
                    this.currentEditingCredential ? 'Credential updated successfully!' : 'Credential added successfully!'
                );
            } else {
                console.log('🔍 Failed to save credential:', response.error);
                this.showError(response.error || 'Failed to save credential');
            }

            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;

        } catch (error) {
            console.error('Error saving credential:', error);
            this.showError('Failed to save credential');

            // Restore button state
            const saveBtn = document.getElementById('save-credential');
            if (saveBtn) {
                saveBtn.innerHTML = '<span id="save-btn-text">Save Credential</span>';
                saveBtn.disabled = false;
            }
        }
    }

    async editCredential(credentialId) {
        const credential = this.allCredentials.find(c => c.id === credentialId);
        if (!credential) return;

        try {
            // Check if locked out
            if (this.isLockedOut()) {
                const remainingTime = Math.ceil((this.masterPasswordLockoutUntil - Date.now()) / 60000);
                this.showTemporaryMessage(`Access locked. Please wait ${remainingTime} minute${remainingTime !== 1 ? 's' : ''} before trying again.`, 5000, 'error');
                return;
            }

            // Request master password verification for edit operation
            const masterPassword = await this.showMasterPasswordModal(
                'Please enter your master password to edit this credential:',
                'credential-edit'
            );

            if (!masterPassword) {
                // User cancelled - don't open edit form
                return;
            }

            // Request actual credential data with password from background service
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: credentialId,
                    masterPassword: masterPassword
                }
            });

            if (!response.success) {
                // Handle failed verification
                this.handleFailedVerification();
                
                // Show clear error message
                const errorMessage = response.error || 'Failed to verify master password. Please check your password and try again.';
                this.showTemporaryMessage(errorMessage, 5000, 'error');
                return;
            }

            // Set session verification expiry on successful verification
            this.setSessionVerificationExpiry();
            
            // Reset failed attempts counter on successful verification
            this.masterPasswordAttempts = 0;

            // Master password verified - proceed with edit form
            this.currentEditingCredential = credential;

            // Set modal title with null check
            const modalTitle = document.getElementById('modal-title');
            if (modalTitle) {
                modalTitle.textContent = 'Edit Credential';
            }

            // Set save button text with null check
            const saveBtnText = document.getElementById('save-btn-text');
            if (saveBtnText) {
                saveBtnText.textContent = 'Update Credential';
            }

            // Populate form with actual credential data
            const urlField = document.getElementById('credential-url');
            if (urlField) {
                urlField.value = credential.url;
            }

            const usernameField = document.getElementById('credential-username');
            if (usernameField) {
                usernameField.value = credential.username;
            }

            const passwordField = document.getElementById('credential-password');
            if (passwordField) {
                // Show the actual decrypted password from the response
                passwordField.value = response.password || '';
            }

            this.clearCredentialFormErrors();

            // Show modal with null check
            const modal = document.getElementById('credential-modal');
            if (modal) {
                modal.classList.remove('hidden');
            }

            // Focus URL field with null check
            if (urlField) {
                urlField.focus();
            }

        } catch (error) {
            console.error('Error opening edit form:', error);
            this.showTemporaryMessage('Error opening edit form');
        }
    }

    async copyPassword(credentialId) {
        const credential = this.allCredentials.find(c => c.id === credentialId);
        if (!credential) return;

        try {
            // Check if locked out
            if (this.isLockedOut()) {
                const remainingTime = Math.ceil((this.masterPasswordLockoutUntil - Date.now()) / 60000);
                this.showTemporaryMessage(`Access locked. Please wait ${remainingTime} minute${remainingTime !== 1 ? 's' : ''} before trying again.`, 5000, 'error');
                return;
            }

            // Always require master password for copy operations
            console.log('🔍 Requesting master password for copy operation');
            const masterPassword = await this.showMasterPasswordModal('Please enter your master password to copy this password:', 'copy');
            console.log('🔍 Master password received for copy:', masterPassword ? 'YES' : 'NO');

            if (!masterPassword) {
                console.log('🔍 No master password provided for copy');
                return;
            }

            // Get the specific credential password using the same method as password visibility
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIAL_PASSWORD',
                payload: {
                    credentialId: credentialId,
                    masterPassword: masterPassword
                }
            });

            if (response.success && response.password) {
                // Set session verification expiry on successful verification
                this.setSessionVerificationExpiry();
                
                // Reset failed attempts counter on successful verification
                this.masterPasswordAttempts = 0;
                
                // Copy the actual password to clipboard
                await navigator.clipboard.writeText(response.password);
                this.showTemporaryMessage('Password copied to clipboard!', 3000, 'success');
            } else {
                // Handle failed verification
                this.handleFailedVerification();
                
                // Show clear error message
                const errorMessage = response.error || 'Failed to retrieve password. Please check your master password.';
                this.showTemporaryMessage(errorMessage, 5000, 'error');
            }
        } catch (error) {
            console.error('Failed to copy password:', error);
            this.showTemporaryMessage('Failed to copy password. Please try again.', 5000, 'error');
        }
    }

    // Delete confirmation
    showDeleteConfirmation(credential) {
        this.credentialToDelete = credential;

        const previewUrl = document.getElementById('delete-preview-url');
        if (previewUrl) {
            previewUrl.textContent = this.formatUrl(credential.url);
        }

        const previewUsername = document.getElementById('delete-preview-username');
        if (previewUsername) {
            previewUsername.textContent = credential.username;
        }

        const deleteModal = document.getElementById('delete-modal');
        if (deleteModal) {
            deleteModal.classList.remove('hidden');
        }
    }

    hideDeleteModal() {
        document.getElementById('delete-modal').classList.add('hidden');
        this.credentialToDelete = null;
    }

    // Alias for tests
    showDeleteModal(credential) {
        this.showDeleteConfirmation(credential);
    }

    async confirmDelete() {
        if (!this.credentialToDelete) return;

        try {
            const deleteBtn = document.getElementById('confirm-delete');
            const originalText = deleteBtn.innerHTML;
            deleteBtn.innerHTML = '<span>Deleting...</span>';
            deleteBtn.disabled = true;

            // Always require master password for delete operations
            console.log('🔍 Requesting master password for delete operation');
            const masterPassword = await this.showMasterPasswordModal('Please enter your master password to delete this credential:', 'delete');
            console.log('🔍 Master password received for delete:', masterPassword ? 'YES' : 'NO');

            if (!masterPassword) {
                console.log('🔍 No master password provided for delete');
                this.showError('Master password is required to delete credentials');
                deleteBtn.innerHTML = originalText;
                deleteBtn.disabled = false;
                return;
            }

            const response = await chrome.runtime.sendMessage({
                type: 'DELETE_CREDENTIAL_WITH_PASSWORD',
                payload: {
                    id: this.credentialToDelete.id,
                    masterPassword: masterPassword
                }
            });

            if (response.success) {
                this.hideDeleteModal();
                await this.loadCredentials();
                this.showTemporaryMessage('Credential deleted successfully!');
            } else {
                this.showError(response.error || 'Failed to delete credential');
            }

            deleteBtn.innerHTML = originalText;
            deleteBtn.disabled = false;

        } catch (error) {
            console.error('Error deleting credential:', error);
            this.showError('Failed to delete credential');
            const deleteBtn = document.getElementById('confirm-delete');
            if (deleteBtn) {
                deleteBtn.innerHTML = 'Delete Credential';
                deleteBtn.disabled = false;
            }
        }
    }

    // Password generation
    generatePassword() {
        const length = 16;
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';

        // Ensure at least one character from each required type
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*';

        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += symbols[Math.floor(Math.random() * symbols.length)];

        // Fill the rest randomly
        for (let i = password.length; i < length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }

        // Shuffle the password
        password = password.split('').sort(() => Math.random() - 0.5).join('');

        const passwordField = document.getElementById('credential-password');
        if (passwordField) {
            passwordField.value = password;
            this.showTemporaryMessage('Strong password generated!');
        } else {
            this.showError('Password field not found. Please refresh and try again.');
        }
    }

    // Utility methods
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

    /**
     * Show master password modal with custom message and context
     * @param {string} message - Message to display
     * @param {string} context - Context for the verification ('password_reveal', 'edit', 'copy', 'delete')
     * @returns {Promise<string|null>} Master password or null if cancelled
     */
    showMasterPasswordModal(message, context = 'general') {
        console.log('🔍 showMasterPasswordModal called with message:', message, 'context:', context);
        
        // Check if currently locked out
        if (this.isLockedOut()) {
            const remainingTime = Math.ceil((this.masterPasswordLockoutUntil - Date.now()) / 60000);
            this.showTemporaryMessage(`Access temporarily locked due to multiple failed attempts. Please wait ${remainingTime} minute${remainingTime !== 1 ? 's' : ''} before trying again.`, 5000, 'error');
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            console.log('🔍 showMasterPasswordModal: Setting up resolve function');
            this.masterPasswordResolve = resolve;
            this.masterPasswordContext = context;
            console.log('🔍 showMasterPasswordModal: masterPasswordResolve set:', typeof this.masterPasswordResolve);

            // Update modal title based on context
            const modalTitle = document.getElementById('master-password-modal-title');
            if (modalTitle) {
                switch (context) {
                    case 'password_reveal':
                        modalTitle.textContent = 'Verify Master Password - View Password';
                        break;
                    case 'edit':
                        modalTitle.textContent = 'Verify Master Password - Edit Credential';
                        break;
                    case 'copy':
                        modalTitle.textContent = 'Verify Master Password - Copy Password';
                        break;
                    case 'delete':
                        modalTitle.textContent = 'Verify Master Password - Delete Credential';
                        break;
                    default:
                        modalTitle.textContent = 'Master Password Required';
                }
            }

            const messageElement = document.getElementById('master-password-message');
            if (messageElement) {
                messageElement.textContent = message;
            }

            const passwordField = document.getElementById('modal-master-password');
            if (passwordField) {
                passwordField.value = '';
            }

            this.hideFieldError('modal-master-password-error');

            // Show attempt counter if there have been failed attempts
            this.updateAttemptDisplay();

            const modal = document.getElementById('master-password-modal');
            if (modal) {
                modal.classList.remove('hidden');
            }

            // Focus the password field
            setTimeout(() => {
                if (passwordField) {
                    passwordField.focus();
                }
            }, 100);
        });
    }

    /**
     * Hide master password modal
     */
    hideMasterPasswordModal() {
        const modal = document.getElementById('master-password-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        const passwordField = document.getElementById('modal-master-password');
        if (passwordField) {
            passwordField.value = '';
        }

        // Clear context
        this.masterPasswordContext = null;

        if (this.masterPasswordResolve) {
            this.masterPasswordResolve(null);
            this.masterPasswordResolve = null;
        }
    }

    /**
     * Confirm master password from modal with verification
     */
    async confirmMasterPassword() {
        console.log('🔍 confirmMasterPassword called');
        const passwordField = document.getElementById('modal-master-password');
        if (!passwordField) {
            console.log('🔍 confirmMasterPassword: password field not found');
            this.hideMasterPasswordModal();
            return;
        }

        const password = passwordField.value;
        console.log('🔍 confirmMasterPassword: password length:', password ? password.length : 0);
        if (!password) {
            console.log('🔍 confirmMasterPassword: no password entered');
            this.showFieldError('modal-master-password-error', 'Please enter your master password');
            return;
        }

        // Show loading state
        const continueBtn = document.getElementById('continue-master-password');
        if (continueBtn) {
            continueBtn.disabled = true;
            continueBtn.innerHTML = '<span>Verifying...</span>';
        }

        try {
            // Verify password with background service
            const response = await chrome.runtime.sendMessage({
                type: 'VERIFY_MASTER_PASSWORD',
                payload: { masterPassword: password }
            });

            if (response && response.success) {
                // Reset attempts on successful verification
                this.masterPasswordAttempts = 0;
                this.masterPasswordLockoutUntil = null;
                
                console.log('🔍 confirmMasterPassword: verification successful');
                
                if (this.masterPasswordResolve) {
                    console.log('🔍 confirmMasterPassword: resolving with password');
                    this.masterPasswordResolve(password);
                    this.masterPasswordResolve = null;
                }

                // Hide modal
                const modal = document.getElementById('master-password-modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
                if (passwordField) {
                    passwordField.value = '';
                }
            } else {
                // Handle failed verification
                this.handleFailedVerification();
            }
        } catch (error) {
            console.error('Master password verification error:', error);
            this.showFieldError('modal-master-password-error', 'Verification failed. Please try again.');
        } finally {
            // Restore button state
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.innerHTML = '<span>Continue</span>';
            }
        }
    }

    /**
     * Handle failed master password verification
     */
    handleFailedVerification() {
        this.masterPasswordAttempts++;
        
        if (this.masterPasswordAttempts >= 3) {
            // Lock out for 5 minutes after 3 failed attempts
            this.masterPasswordLockoutUntil = Date.now() + (5 * 60 * 1000);
            this.showFieldError('modal-master-password-error', 'Too many failed attempts. Access locked for 5 minutes for security.');
            
            // Clear all revealed passwords immediately on lockout
            this.clearAllRevealedPasswords();
            
            // Hide modal after lockout
            setTimeout(() => {
                this.hideMasterPasswordModal();
            }, 2000);
        } else {
            const remainingAttempts = 3 - this.masterPasswordAttempts;
            this.showFieldError('modal-master-password-error', 
                `Incorrect master password. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining before temporary lockout.`);
        }

        // Clear password field
        const passwordField = document.getElementById('modal-master-password');
        if (passwordField) {
            passwordField.value = '';
            passwordField.focus();
        }

        this.updateAttemptDisplay();
    }

    /**
     * Check if currently locked out from master password attempts
     * @returns {boolean} True if locked out
     */
    isLockedOut() {
        return this.masterPasswordLockoutUntil && Date.now() < this.masterPasswordLockoutUntil;
    }

    /**
     * Set session verification expiry after successful master password verification
     */
    setSessionVerificationExpiry() {
        this.sessionVerificationExpiry = Date.now() + this.sessionVerificationDuration;
        console.log('Session verification set to expire in 5 minutes');
    }

    /**
     * Check if session verification has expired
     * @returns {boolean} True if verification has expired
     */
    isSessionVerificationExpired() {
        return !this.sessionVerificationExpiry || Date.now() > this.sessionVerificationExpiry;
    }

    /**
     * Clear session verification expiry
     */
    clearSessionVerification() {
        this.sessionVerificationExpiry = null;
        console.log('Session verification cleared');
    }

    /**
     * Check if master password verification is required
     * @returns {boolean} True if verification is required
     */
    isVerificationRequired() {
        return this.isLockedOut() || this.isSessionVerificationExpired();
    }

    /**
     * Update the attempt counter display in the modal
     */
    updateAttemptDisplay() {
        const attemptDisplay = document.getElementById('master-password-attempts');
        if (!attemptDisplay) return;

        if (this.masterPasswordAttempts > 0) {
            const remainingAttempts = 3 - this.masterPasswordAttempts;
            attemptDisplay.textContent = `${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining`;
            attemptDisplay.classList.remove('hidden');
        } else {
            attemptDisplay.classList.add('hidden');
        }
    }

    /**
     * Check for pending key phrase from session storage
     */
    checkPendingKeyPhrase() {
        try {
            const pendingKeyPhrase = sessionStorage.getItem('pendingKeyPhrase');
            const keyPhraseConfirmed = sessionStorage.getItem('keyPhraseConfirmed');

            // Only restore key phrase if it exists and hasn't been confirmed yet
            if (pendingKeyPhrase && !keyPhraseConfirmed) {
                const keyPhrase = JSON.parse(pendingKeyPhrase);
                if (Array.isArray(keyPhrase) && keyPhrase.length === 16) {
                    this.currentKeyPhrase = keyPhrase;
                    // Don't auto-show the key phrase, let checkAuthState handle the flow
                }
            } else if (keyPhraseConfirmed) {
                // User has already confirmed, clear any pending key phrase
                sessionStorage.removeItem('pendingKeyPhrase');
                this.currentKeyPhrase = null;
            }
        } catch (error) {
            console.warn('Failed to restore key phrase from session storage:', error);
        }
    }

    /**
     * Setup security-related event listeners
     */
    setupSecurityListeners() {
        // Clear sensitive data when popup is about to be closed
        window.addEventListener('beforeunload', () => {
            this.performSecurityCleanup();
        });

        // Clear sensitive data when popup loses focus (optional security measure)
        window.addEventListener('blur', () => {
            // Only clear if not authenticated to avoid disrupting normal usage
            if (!this.sessionManager || !this.sessionManager.isUserLoggedIn()) {
                this.clearSensitiveData();
            }
        });

        // Clear revealed passwords when popup is hidden (security measure)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clearAllRevealedPasswords();
                // Clear session verification when popup is hidden for extended security
                this.clearSessionVerification();
            }
        });

        // Set up periodic session verification expiry check
        this.sessionExpiryCheckInterval = setInterval(() => {
            this.checkSessionExpiry();
        }, 30000); // Check every 30 seconds

        // Handle page navigation/refresh
        window.addEventListener('pagehide', () => {
            this.performSecurityCleanup();
        });

        // Handle browser tab close
        window.addEventListener('unload', () => {
            this.performSecurityCleanup();
        });
    }

    /**
     * Clear all sensitive data from forms for security
     */
    clearSensitiveData() {
        // Clear master password fields
        const masterPasswordField = document.getElementById('master-password');
        if (masterPasswordField) {
            masterPasswordField.value = '';
        }

        const newMasterPasswordField = document.getElementById('new-master-password');
        if (newMasterPasswordField) {
            newMasterPasswordField.value = '';
        }

        const confirmMasterPasswordField = document.getElementById('confirm-master-password');
        if (confirmMasterPasswordField) {
            confirmMasterPasswordField.value = '';
        }

        // Clear modal master password field
        const modalMasterPasswordField = document.getElementById('modal-master-password');
        if (modalMasterPasswordField) {
            modalMasterPasswordField.value = '';
        }

        // Clear credential form fields
        const credentialPasswordField = document.getElementById('credential-password');
        if (credentialPasswordField) {
            credentialPasswordField.value = '';
        }

        // Clear export/import key phrase fields
        const exportKeyPhraseField = document.getElementById('export-key-phrase');
        if (exportKeyPhraseField) {
            exportKeyPhraseField.value = '';
        }

        const importKeyPhraseField = document.getElementById('import-key-phrase');
        if (importKeyPhraseField) {
            importKeyPhraseField.value = '';
        }

        // Clear delete account password field
        const deletePasswordField = document.getElementById('delete-master-password');
        if (deletePasswordField) {
            deletePasswordField.value = '';
        }

        // Clear any cached sensitive data
        this.currentKeyPhrase = null;
        this.currentEditingCredential = null;

        // Clear all revealed passwords from memory
        this.clearAllRevealedPasswords();

        console.log('Sensitive data cleared from forms');
    }

    /**
     * Perform comprehensive security cleanup on popup close/navigation
     */
    performSecurityCleanup() {
        // Clear all sensitive data
        this.clearSensitiveData();
        
        // Clear all revealed passwords
        this.clearAllRevealedPasswords();
        
        // Clear session verification
        this.clearSessionVerification();
        
        // Reset master password attempts but keep lockout if active
        if (!this.isLockedOut()) {
            this.masterPasswordAttempts = 0;
        }
        
        // Clear any running intervals
        if (this.sessionExpiryCheckInterval) {
            clearInterval(this.sessionExpiryCheckInterval);
            this.sessionExpiryCheckInterval = null;
        }
        
        console.log('Security cleanup completed');
    }

    /**
     * Check for session expiry and clear revealed passwords if expired
     */
    checkSessionExpiry() {
        if (this.isSessionVerificationExpired()) {
            // Check if there were revealed passwords before clearing them
            const hasRevealedPasswords = Object.keys(this.passwordVisibilityState).length > 0;
            
            // Clear all revealed passwords when session expires
            this.clearAllRevealedPasswords();
            
            // Show notification if there were revealed passwords
            if (hasRevealedPasswords) {
                this.showTemporaryMessage('Session expired. All passwords have been hidden for security.', 5000, 'warning');
            }
            
            console.log('Session verification expired, passwords cleared');
        }
    }

    /**
     * Clear key phrase confirmation status
     */
    clearKeyPhraseConfirmation() {
        try {
            sessionStorage.removeItem('keyPhraseConfirmed');
            sessionStorage.removeItem('pendingKeyPhrase');
        } catch (error) {
            console.warn('Failed to clear key phrase confirmation status:', error);
        }
    }

    // Delete Account functionality
    showDeleteAccountModal() {
        const modal = document.getElementById('delete-account-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }

        // Clear previous inputs
        const passwordField = document.getElementById('delete-master-password');
        if (passwordField) {
            passwordField.value = '';
        }

        const checkbox = document.getElementById('confirm-delete-account');
        if (checkbox) {
            checkbox.checked = false;
        }

        this.toggleDeleteAccountButton();

        // Focus password field
        setTimeout(() => {
            if (passwordField) {
                passwordField.focus();
            }
        }, 100);
    }

    hideDeleteAccountModal() {
        const modal = document.getElementById('delete-account-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        // Clear sensitive data
        const passwordField = document.getElementById('delete-master-password');
        if (passwordField) {
            passwordField.value = '';
        }

        this.hideFieldError('delete-master-password-error');
    }

    toggleDeleteAccountButton() {
        const checkbox = document.getElementById('confirm-delete-account');
        const passwordField = document.getElementById('delete-master-password');
        const deleteBtn = document.getElementById('confirm-delete-account-btn');

        if (checkbox && passwordField && deleteBtn) {
            const isChecked = checkbox.checked;
            const hasPassword = passwordField.value.trim().length > 0;
            deleteBtn.disabled = !(isChecked && hasPassword);
        }
    }

    async confirmDeleteAccount() {
        const passwordField = document.getElementById('delete-master-password');
        if (!passwordField) {
            this.showError('Password field not found');
            return;
        }

        const masterPassword = passwordField.value.trim();
        if (!masterPassword) {
            this.showFieldError('delete-master-password-error', 'Master password is required');
            return;
        }

        try {
            const deleteBtn = document.getElementById('confirm-delete-account-btn');
            if (deleteBtn) {
                const originalText = deleteBtn.innerHTML;
                deleteBtn.innerHTML = '<span>Deleting Account...</span>';
                deleteBtn.disabled = true;
            }

            const response = await chrome.runtime.sendMessage({
                type: 'DELETE_ACCOUNT',
                payload: { masterPassword }
            });

            if (response.success) {
                this.hideDeleteAccountModal();
                this.clearSensitiveData();
                this.clearKeyPhraseConfirmation();
                this.showAuthInterface();
                this.showTemporaryMessage('Account deleted successfully');
            } else {
                this.showFieldError('delete-master-password-error', response.error || 'Failed to delete account');
                if (deleteBtn) {
                    deleteBtn.innerHTML = '<span>Delete Account Permanently</span>';
                    deleteBtn.disabled = false;
                }
            }
        } catch (error) {
            console.error('Delete account error:', error);
            this.showFieldError('delete-master-password-error', 'Failed to delete account. Please try again.');
        }
    }

    // Export functionality
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

    async startExport() {
        const keyPhraseText = document.getElementById('export-key-phrase').value.trim();
        const includePasswords = document.getElementById('include-passwords').checked;

        // Clear previous errors
        this.hideFieldError('export-key-phrase-error');

        // Validate key phrase
        const keyPhrase = keyPhraseText.split(/\s+/).filter(word => word.length > 0);
        if (keyPhrase.length !== 16) {
            this.showFieldError('export-key-phrase-error', 'Key phrase must contain exactly 16 words');
            return;
        }

        try {
            this.showExportProgress();

            const response = await chrome.runtime.sendMessage({
                type: 'EXPORT_DATA',
                payload: {
                    keyPhrase,
                    includePasswords
                }
            });

            if (response.success) {
                // Create and download the file
                const timestamp = new Date().toISOString().split('T')[0];
                const filename = `password-manager-export-${timestamp}.json`;

                const blob = new Blob([response.data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.hideExportModal();
                this.showTemporaryMessage('Export completed successfully!');
            } else {
                this.showFieldError('export-key-phrase-error', response.error || 'Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showFieldError('export-key-phrase-error', 'Export failed. Please try again.');
        } finally {
            this.hideExportProgress();
        }
    }

    showExportProgress() {
        document.getElementById('export-progress').classList.remove('hidden');
        document.getElementById('start-export').disabled = true;

        // Animate progress bar
        const progressFill = document.querySelector('#export-progress .progress-fill');
        progressFill.style.width = '0%';
        setTimeout(() => {
            progressFill.style.width = '100%';
        }, 100);
    }

    hideExportProgress() {
        document.getElementById('export-progress').classList.add('hidden');
        document.getElementById('start-export').disabled = false;
    }

    // Import functionality
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

    async previewImport() {
        const fileInput = document.getElementById('import-file');
        const keyPhraseText = document.getElementById('import-key-phrase').value.trim();

        // Clear previous errors
        this.hideFieldError('import-file-error');
        this.hideFieldError('import-key-phrase-error');

        // Validate inputs
        if (!fileInput.files.length) {
            this.showFieldError('import-file-error', 'Please select a file to import');
            return;
        }

        const keyPhrase = keyPhraseText.split(/\s+/).filter(word => word.length > 0);
        if (keyPhrase.length !== 16) {
            this.showFieldError('import-key-phrase-error', 'Key phrase must contain exactly 16 words');
            return;
        }

        try {
            const file = fileInput.files[0];
            const fileContent = await this.readFileAsText(file);

            const response = await chrome.runtime.sendMessage({
                type: 'PREVIEW_IMPORT',
                payload: {
                    fileContent,
                    keyPhrase
                }
            });

            if (response.success) {
                this.showImportPreview(response.preview);
                document.getElementById('start-import').disabled = false;
            } else {
                this.showFieldError('import-key-phrase-error', response.error || 'Failed to decrypt file');
            }
        } catch (error) {
            console.error('Preview error:', error);
            this.showFieldError('import-file-error', 'Failed to read file');
        }
    }

    async startImport() {
        const fileInput = document.getElementById('import-file');
        const keyPhraseText = document.getElementById('import-key-phrase').value.trim();
        const overwriteExisting = document.getElementById('overwrite-existing').checked;

        try {
            this.showImportProgress();

            const file = fileInput.files[0];
            const fileContent = await this.readFileAsText(file);
            const keyPhrase = keyPhraseText.split(/\s+/).filter(word => word.length > 0);

            const response = await chrome.runtime.sendMessage({
                type: 'IMPORT_DATA',
                payload: {
                    fileContent,
                    keyPhrase,
                    overwriteExisting
                }
            });

            if (response.success) {
                this.hideImportModal();
                await this.loadCredentials();
                this.showTemporaryMessage(`Import completed! ${response.imported} credentials imported.`);
            } else {
                this.showFieldError('import-key-phrase-error', response.error || 'Import failed');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showError('Import failed. Please try again.');
        } finally {
            this.hideImportProgress();
        }
    }

    showImportPreview(preview) {
        document.getElementById('preview-count').textContent = preview.total;
        document.getElementById('preview-new').textContent = preview.new;
        document.getElementById('preview-existing').textContent = preview.existing;
        document.getElementById('import-preview').classList.remove('hidden');
    }

    hideImportPreview() {
        document.getElementById('import-preview').classList.add('hidden');
    }

    showImportProgress() {
        document.getElementById('import-progress').classList.remove('hidden');
        document.getElementById('start-import').disabled = true;
        document.getElementById('preview-import').disabled = true;

        // Animate progress bar
        const progressFill = document.querySelector('#import-progress .progress-fill');
        progressFill.style.width = '0%';
        setTimeout(() => {
            progressFill.style.width = '100%';
        }, 100);
    }

    hideImportProgress() {
        document.getElementById('import-progress').classList.add('hidden');
        document.getElementById('start-import').disabled = false;
        document.getElementById('preview-import').disabled = false;
    }

    // Utility method to read file as text
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Password visibility toggle
    togglePasswordVisibility(inputId) {
        console.log('🔍 togglePasswordVisibility called for:', inputId);
        const input = document.getElementById(inputId);
        if (!input) {
            console.log('🔍 Input element not found:', inputId);
            return;
        }

        // Find the correct toggle button based on input ID
        let toggleBtnId;
        if (inputId === 'master-password') {
            toggleBtnId = 'toggle-master-password';
        } else if (inputId === 'new-master-password') {
            toggleBtnId = 'toggle-new-master-password';
        } else if (inputId === 'confirm-master-password') {
            toggleBtnId = 'toggle-confirm-password';
        } else if (inputId === 'credential-password') {
            toggleBtnId = 'toggle-credential-password';
        } else if (inputId === 'modal-master-password') {
            toggleBtnId = 'toggle-modal-master-password';
        } else if (inputId === 'delete-master-password') {
            toggleBtnId = 'toggle-delete-password';
        }

        const toggleBtn = document.getElementById(toggleBtnId);
        if (!toggleBtn) return;

        const eyeIcon = toggleBtn.querySelector('.eye-icon');
        if (!eyeIcon) return;

        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.textContent = '🙈';
            toggleBtn.setAttribute('aria-label', 'Hide password');
        } else {
            input.type = 'password';
            eyeIcon.textContent = '👁️';
            toggleBtn.setAttribute('aria-label', 'Show password');
        }
    }

    // Password validation for signup
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

    // Password confirmation validation
    validatePasswordConfirmation() {
        const password = document.getElementById('new-master-password').value;
        const confirmPassword = document.getElementById('confirm-master-password').value;
        const errorElement = document.getElementById('confirm-password-error');

        if (confirmPassword && password !== confirmPassword) {
            this.showFieldError('confirm-password-error', 'Passwords do not match');
            return false;
        } else {
            this.hideFieldError('confirm-password-error');
            return true;
        }
    }

    // Update signup button state
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

    // Key phrase actions
    async copyKeyPhrase() {
        if (!this.currentKeyPhrase) return;

        try {
            await navigator.clipboard.writeText(this.currentKeyPhrase.join(' '));
            this.showTemporaryMessage('Key phrase copied to clipboard!');
        } catch (error) {
            console.error('Failed to copy key phrase:', error);
            this.showError('Failed to copy key phrase');
        }
    }

    downloadKeyPhrase() {
        if (!this.currentKeyPhrase) return;

        const content = `Chrome Password Manager Recovery Key Phrase\n\nGenerated: ${new Date().toISOString()}\n\nKey Phrase:\n${this.currentKeyPhrase.join(' ')}\n\nIMPORTANT: Keep this key phrase secure and private. You will need it to import your passwords on other devices.`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `password-manager-key-phrase-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showTemporaryMessage('Key phrase downloaded!');
    }

    toggleKeyPhraseConfirmation() {
        const checkbox = document.getElementById('key-phrase-saved');
        const confirmBtn = document.getElementById('confirm-key-phrase');
        confirmBtn.disabled = !checkbox.checked;
    }

    async confirmKeyPhrase() {
        console.log('🔍 confirmKeyPhrase called');

        // Set flag that user has confirmed saving the key phrase
        try {
            sessionStorage.setItem('keyPhraseConfirmed', 'true');
            sessionStorage.removeItem('pendingKeyPhrase');
            console.log('🔍 Set keyPhraseConfirmed=true and removed pendingKeyPhrase');
        } catch (error) {
            console.warn('Failed to update key phrase confirmation status:', error);
        }

        this.currentKeyPhrase = null;
        console.log('🔍 Cleared currentKeyPhrase and showing main interface');
        this.showMainInterface();
        await this.loadCredentials();
    }

    // Enhanced form validation with accessibility
    showFieldError(errorElementId, message) {
        const errorElement = document.getElementById(errorElementId);
        const inputElement = errorElement.previousElementSibling;

        errorElement.textContent = message;
        errorElement.classList.remove('hidden');

        // Add ARIA attributes
        if (inputElement && inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA') {
            inputElement.setAttribute('aria-invalid', 'true');
            inputElement.setAttribute('aria-describedby', errorElementId);
            inputElement.classList.add('error');
        } else {
            // Handle cases where input is in a wrapper
            const wrapper = errorElement.previousElementSibling;
            const input = wrapper?.querySelector('input, textarea');
            if (input) {
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', errorElementId);
                input.classList.add('error');
            }
        }
    }

    hideFieldError(errorElementId) {
        const errorElement = document.getElementById(errorElementId);
        const inputElement = errorElement.previousElementSibling;

        errorElement.classList.add('hidden');

        // Remove ARIA attributes
        if (inputElement && (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA')) {
            inputElement.removeAttribute('aria-invalid');
            inputElement.removeAttribute('aria-describedby');
            inputElement.classList.remove('error');
            inputElement.classList.add('success');

            // Remove success class after a short delay
            setTimeout(() => {
                inputElement.classList.remove('success');
            }, 2000);
        } else {
            // Handle cases where input is in a wrapper
            const wrapper = errorElement.previousElementSibling;
            const input = wrapper?.querySelector('input, textarea');
            if (input) {
                input.removeAttribute('aria-invalid');
                input.removeAttribute('aria-describedby');
                input.classList.remove('error');
                input.classList.add('success');

                setTimeout(() => {
                    input.classList.remove('success');
                }, 2000);
            }
        }
    }

    clearErrors() {
        const errorElements = document.querySelectorAll('.error-message');
        errorElements.forEach(element => element.classList.add('hidden'));
    }

    showTemporaryMessage(message, duration = 3000, type = 'info') {
        // Remove existing notifications of the same type
        const existingNotifications = document.querySelectorAll(`.temporary-notification.${type}`);
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `temporary-notification ${type}`;
        
        // Set appropriate ARIA attributes based on message type
        if (type === 'error' || type === 'warning') {
            notification.setAttribute('role', 'alert');
            notification.setAttribute('aria-live', 'assertive');
        } else {
            notification.setAttribute('role', 'status');
            notification.setAttribute('aria-live', 'polite');
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);

        // Use longer duration for error messages
        const actualDuration = type === 'error' ? Math.max(duration, 5000) : duration;

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, actualDuration);
    }

    showError(message) {
        // Remove existing error notifications
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

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Accessibility utilities
    trapFocus(element) {
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        element.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }

            if (e.key === 'Escape') {
                this.hideCredentialModal();
                this.hideDeleteModal();
                this.hideExportModal();
                this.hideImportModal();
            }
        });
    }

    // Permission Management Methods

    /**
     * Show the permissions section
     */
    showPermissionsSection() {
        document.getElementById('permissions-section').classList.remove('hidden');
        this.refreshPermissionStatus();
    }

    /**
     * Hide the permissions section
     */
    hidePermissionsSection() {
        document.getElementById('permissions-section').classList.add('hidden');
    }

    /**
     * Refresh permission status display
     */
    async refreshPermissionStatus() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CHECK_PERMISSIONS'
            });

            if (response && response.success) {
                const { hasOptional, hasHost } = response.data;
                const hasAutofillPermissions = hasOptional && hasHost;

                this.updatePermissionStatus('autofill-status', hasAutofillPermissions);
                this.updatePermissionButton('request-autofill', hasAutofillPermissions);
            } else {
                console.error('Failed to check permissions:', response?.error);
                this.updatePermissionStatus('autofill-status', false, 'Error');
            }
        } catch (error) {
            console.error('Error checking permissions:', error);
            this.updatePermissionStatus('autofill-status', false, 'Error');
        }
    }

    /**
     * Update permission status badge
     * @param {string} statusId - ID of the status element
     * @param {boolean} granted - Whether permission is granted
     * @param {string} customText - Custom status text
     */
    updatePermissionStatus(statusId, granted, customText = null) {
        const statusElement = document.getElementById(statusId);

        if (customText) {
            statusElement.textContent = customText;
            statusElement.className = 'status-badge checking';
        } else if (granted) {
            statusElement.textContent = 'Granted';
            statusElement.className = 'status-badge granted';
        } else {
            statusElement.textContent = 'Not Granted';
            statusElement.className = 'status-badge denied';
        }
    }

    /**
     * Update permission request button
     * @param {string} buttonId - ID of the button element
     * @param {boolean} granted - Whether permission is granted
     */
    updatePermissionButton(buttonId, granted) {
        const buttonElement = document.getElementById(buttonId);

        if (granted) {
            buttonElement.classList.add('hidden');
        } else {
            buttonElement.classList.remove('hidden');
        }
    }

    /**
     * Request autofill permissions
     */
    async requestAutofillPermissions() {
        try {
            const button = document.getElementById('request-autofill');
            button.disabled = true;
            button.textContent = 'Requesting...';

            const response = await chrome.runtime.sendMessage({
                type: 'REQUEST_AUTOFILL_PERMISSIONS'
            });

            if (response && response.success) {
                if (response.data.granted) {
                    this.showTemporaryMessage('Autofill permissions granted! You can now use right-click autofill.');
                    this.refreshPermissionStatus();
                } else {
                    this.showError('Autofill permissions were denied. Some features may not work properly.');
                }
            } else {
                this.showError('Failed to request permissions: ' + (response?.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error requesting autofill permissions:', error);
            this.showError('Failed to request permissions');
        } finally {
            const button = document.getElementById('request-autofill');
            button.disabled = false;
            button.textContent = 'Enable';
        }
    }

    /**
     * Request specific optional permissions
     * @param {string[]} permissions - Array of permission names
     */
    async requestOptionalPermissions(permissions) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'REQUEST_OPTIONAL_PERMISSIONS',
                payload: { permissions }
            });

            if (response && response.success) {
                return response.data.granted;
            } else {
                console.error('Failed to request optional permissions:', response?.error);
                return false;
            }
        } catch (error) {
            console.error('Error requesting optional permissions:', error);
            return false;
        }
    }

    /**
     * Request specific host permissions
     * @param {string[]} origins - Array of host origins
     */
    async requestHostPermissions(origins) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'REQUEST_HOST_PERMISSIONS',
                payload: { origins }
            });

            if (response && response.success) {
                return response.data.granted;
            } else {
                console.error('Failed to request host permissions:', response?.error);
                return false;
            }
        } catch (error) {
            console.error('Error requesting host permissions:', error);
            return false;
        }
    }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PopupController };
}

// Debug: Check initial state
console.log('🔍 popup.js loaded, window.popupController:', typeof window.popupController);

// Initialize popup controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 DOM loaded, creating PopupController');
    window.popupController = new PopupController();
    console.log('🔍 PopupController created and assigned to window.popupController');
    console.log('🔍 window.popupController type:', typeof window.popupController);
    console.log('🔍 showMasterPasswordModal exists:', typeof window.popupController.showMasterPasswordModal);
    console.log('🔍 Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.popupController)));
});

// Also try immediate initialization as fallback
if (document.readyState === 'loading') {
    console.log('🔍 Document still loading, waiting for DOMContentLoaded');
} else {
    console.log('🔍 Document already loaded, creating PopupController immediately');
    window.popupController = new PopupController();
    console.log('🔍 Immediate PopupController created');
}

// Add a global test function for debugging
window.testController = function () {
    console.log('🔍 Testing controller access...');
    console.log('🔍 window.popupController exists:', !!window.popupController);
    if (window.popupController) {
        console.log('🔍 showMasterPasswordModal exists:', typeof window.popupController.showMasterPasswordModal);
        console.log('🔍 Controller methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.popupController)).filter(name => typeof window.popupController[name] === 'function'));
        return true;
    }
    return false;
};