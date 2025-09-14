// Chrome Password Manager - Background Service Worker
// This file handles core business logic, message routing, and API coordination

// Import required services (using importScripts for service worker)
importScripts('../crypto/bip39-words.js');
importScripts('../crypto/crypto.js');
importScripts('../storage/storage.js');
importScripts('../auth/simple-session-manager.js');
importScripts('../utils/permission-manager.js');

class BackgroundService {
    constructor() {
        // Initialize services
        this.cryptoService = new CryptoService();
        this.storageManager = new StorageManager();
        this.sessionManager = new SimpleSessionManager();
        this.permissionManager = new PermissionManager();
        
        // Credential cache (cleared on logout/timeout)
        this.credentialCache = null;
        this.cacheTimestamp = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        // Message validation schema
        this.messageSchema = {
            'CHECK_AUTH_STATE': { required: [] },
            'LOGIN': { required: ['masterPassword'] },
            'SIGNUP': { required: ['masterPassword'] },
            'LOGOUT': { required: [] },
            'GET_CREDENTIALS': { required: [] },
            'GET_CREDENTIALS_WITH_PASSWORD': { required: ['masterPassword'] },
            'SAVE_CREDENTIAL': { required: ['url', 'username', 'password'] },
            'ADD_CREDENTIAL': { required: ['url', 'username', 'password'] },
            'SAVE_CREDENTIAL_WITH_PASSWORD': { required: ['url', 'username', 'password', 'masterPassword'] },
            'UPDATE_CREDENTIAL': { required: ['id', 'url', 'username', 'password'] },
            'UPDATE_CREDENTIAL_WITH_PASSWORD': { required: ['id', 'url', 'username', 'password', 'masterPassword'] },
            'DELETE_CREDENTIAL': { required: ['id'] },
            'DELETE_CREDENTIAL_WITH_PASSWORD': { required: ['id', 'masterPassword'] },
            'SEARCH_CREDENTIALS': { required: ['query'] },
            'SEARCH_CREDENTIALS_WITH_PASSWORD': { required: ['query', 'masterPassword'] },
            'AUTOFILL_REQUEST': { required: ['url'] },
            'GET_CREDENTIAL_FOR_AUTOFILL': { required: ['credentialId'] },
            'CONTEXT_MENU_SAVE': { required: ['url', 'username', 'password'] },
            'EXPORT_DATA': { required: ['keyPhrase'] },
            'IMPORT_DATA': { required: ['file', 'keyPhrase'] },
            'CHECK_PERMISSIONS': { required: [] },
            'REQUEST_AUTOFILL_PERMISSIONS': { required: [] },
            'REQUEST_OPTIONAL_PERMISSIONS': { required: ['permissions'] },
            'REQUEST_HOST_PERMISSIONS': { required: ['origins'] },
            'REMOVE_OPTIONAL_PERMISSIONS': { required: ['permissions'] },
            'GET_ALL_PERMISSIONS': { required: [] },
            'DELETE_ACCOUNT': { required: ['masterPassword'] },
            'VERIFY_MASTER_PASSWORD': { required: ['masterPassword'] },
            'GET_CREDENTIAL_PASSWORD': { required: ['credentialId', 'masterPassword'] },
            'VERIFY_MASTER_PASSWORD': { required: ['masterPassword'] }
        };
        
        this.initializeListeners();
        this.initializeContextMenus();
    }

    initializeListeners() {
        // Handle messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender)
                .then(response => {
                    sendResponse(response);
                })
                .catch(error => {
                    console.error('Message handling error:', error);
                    sendResponse({ 
                        success: false, 
                        error: error.message,
                        type: 'BACKGROUND_ERROR'
                    });
                });
            
            // Return true to indicate we'll send a response asynchronously
            return true;
        });

        // Handle extension installation
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Chrome Password Manager installed');
            this.initializeContextMenus();
        });

        // Handle extension startup
        chrome.runtime.onStartup.addListener(() => {
            console.log('Chrome Password Manager started');
        });
    }

    async handleMessage(message, sender) {
        try {
            // Validate message structure
            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message format');
            }

            const { type, payload = {} } = message;

            // Validate message type
            if (!type || typeof type !== 'string') {
                throw new Error('Message type is required');
            }

            // Validate message against schema
            if (!this.validateMessage(type, payload)) {
                throw new Error(`Invalid message payload for type: ${type}`);
            }

            // Update session activity for authenticated operations
            if (await this.sessionManager.isUserLoggedIn()) {
                await this.sessionManager.updateActivity();
            }

            // Route message to appropriate handler
            switch (type) {
                case 'CHECK_AUTH_STATE':
                    return await this.handleAuthStateCheck();

                case 'LOGIN':
                    return await this.handleLogin(payload.masterPassword);

                case 'SIGNUP':
                    return await this.handleSignup(payload.masterPassword);

                case 'LOGOUT':
                    return await this.handleLogout();

                case 'GET_CREDENTIALS':
                    return await this.getCredentials();

                case 'GET_CREDENTIALS_WITH_PASSWORD':
                    return await this.getCredentialsWithPassword(payload.masterPassword);

                case 'SAVE_CREDENTIAL':
                    return await this.saveCredential(payload);

                case 'ADD_CREDENTIAL':
                    return await this.saveCredential(payload);

                case 'SAVE_CREDENTIAL_WITH_PASSWORD':
                    return await this.saveCredentialWithPassword(payload);

                case 'UPDATE_CREDENTIAL':
                    return await this.updateCredential(payload);

                case 'UPDATE_CREDENTIAL_WITH_PASSWORD':
                    return await this.updateCredentialWithPassword(payload);

                case 'DELETE_CREDENTIAL':
                    return await this.deleteCredential(payload.id);

                case 'DELETE_CREDENTIAL_WITH_PASSWORD':
                    return await this.deleteCredentialWithPassword(payload.id, payload.masterPassword);

                case 'SEARCH_CREDENTIALS':
                    return await this.searchCredentials(payload.query);

                case 'SEARCH_CREDENTIALS_WITH_PASSWORD':
                    return await this.searchCredentialsWithPassword(payload.query, payload.masterPassword);

                case 'GET_CREDENTIAL_FOR_AUTOFILL':
                    return await this.getCredentialForAutofill(payload.credentialId);

                case 'AUTOFILL_REQUEST':
                    return await this.handleAutofillRequest(payload);

                case 'CONTEXT_MENU_SAVE':
                    return await this.handleContextMenuSave(payload);

                case 'EXPORT_DATA':
                    return await this.handleExport(payload.keyPhrase);

                case 'IMPORT_DATA':
                    return await this.handleImport(payload.file, payload.keyPhrase);

                case 'CHECK_PERMISSIONS':
                    return await this.handleCheckPermissions();

                case 'REQUEST_AUTOFILL_PERMISSIONS':
                    return await this.handleRequestAutofillPermissions();

                case 'REQUEST_OPTIONAL_PERMISSIONS':
                    return await this.handleRequestOptionalPermissions(payload.permissions);

                case 'REQUEST_HOST_PERMISSIONS':
                    return await this.handleRequestHostPermissions(payload.origins);

                case 'REMOVE_OPTIONAL_PERMISSIONS':
                    return await this.handleRemoveOptionalPermissions(payload.permissions);

                case 'GET_ALL_PERMISSIONS':
                    return await this.handleGetAllPermissions();

                case 'DELETE_ACCOUNT':
                    return await this.handleDeleteAccount(payload.masterPassword);

                case 'GET_CREDENTIAL_PASSWORD':
                    return await this.getCredentialPassword(payload.credentialId, payload.masterPassword);

                case 'VERIFY_MASTER_PASSWORD':
                    return await this.verifyMasterPassword(payload.masterPassword);

                default:
                    throw new Error(`Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('Message handling error:', error);
            throw error;
        }
    }

    /**
     * Validate message payload against schema
     * @param {string} type - Message type
     * @param {object} payload - Message payload
     * @returns {boolean} True if valid
     */
    validateMessage(type, payload) {
        try {
            const schema = this.messageSchema[type];
            if (!schema) {
                return false;
            }

            // Check required fields
            for (const field of schema.required) {
                if (!(field in payload)) {
                    console.error(`Missing required field: ${field} for message type: ${type}`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Message validation error:', error);
            return false;
        }
    }

    /**
     * Check current authentication state
     * @returns {Promise<object>} Authentication state
     */
    async handleAuthStateCheck() {
        try {
            const isAuthenticated = await this.sessionManager.isUserLoggedIn();
            const userInfo = this.sessionManager.getCurrentUser();
            
            return {
                success: true,
                authenticated: isAuthenticated,
                userInfo: userInfo
            };
        } catch (error) {
            console.error('Auth state check error:', error);
            return { success: false, error: error.message };
        }
    }



    /**
     * Handle user login with master password
     * @param {string} masterPassword - Master password
     * @returns {Promise<object>} Login result
     */
    async handleLogin(masterPassword) {
        try {
            console.log('Login attempt with master password');
            
            // Load user profile to verify master password
            const userProfile = await this.storageManager.loadUserProfile();
            if (!userProfile) {
                throw new Error('No user profile found. Please sign up first.');
            }
            
            // Validate master password by attempting to decrypt stored data
            const encryptedData = await this.storageManager.loadEncryptedData();
            if (!encryptedData) {
                throw new Error('No encrypted data found. Please sign up first.');
            }
            
            try {
                console.log('Attempting to decrypt data with provided password...');
                const deserializedData = this.cryptoService.deserializeEncryptedData(encryptedData);
                await this.cryptoService.decryptWithPassword(deserializedData, masterPassword);
                console.log('Password validation successful');
            } catch (decryptError) {
                console.log('Password validation failed:', decryptError.message);
                return { success: false, error: 'Invalid master password. Please try again.' };
            }
            
            // Hash master password for session validation using Web Crypto API
            const encoder = new TextEncoder();
            const data = encoder.encode(masterPassword);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const masterPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Create session
            await this.sessionManager.createSession(masterPassword);
            
            // Load credentials into cache for immediate availability
            try {
                await this.loadCredentialsWithPassword(masterPassword);
                console.log('Credentials loaded into cache after login');
            } catch (cacheError) {
                console.warn('Failed to cache credentials after login:', cacheError.message);
                // Don't fail login if caching fails
            }
            
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle user signup with master password
     * @param {string} masterPassword - Master password
     * @returns {Promise<object>} Signup result with key phrase
     */
    async handleSignup(masterPassword) {
        try {
            console.log('Signup attempt with master password');
            
            // Check if user already exists
            const existingProfile = await this.storageManager.loadUserProfile();
            if (existingProfile) {
                throw new Error('User already exists. Please login instead.');
            }
            
            // Generate key phrase
            const keyPhrase = this.cryptoService.generateKeyPhrase();
            
            // Create initial empty credentials
            const initialCredentials = [];
            const serializedCredentials = this.storageManager.serializeCredentials(initialCredentials);
            
            // Encrypt credentials with master password
            const encryptedData = await this.cryptoService.encryptWithPassword(
                serializedCredentials, 
                masterPassword
            );
            const serializedEncryptedData = this.cryptoService.serializeEncryptedData(encryptedData);
            
            // Create user profile
            const userInfo = { email: 'user@local', name: 'Local User' };
            const userProfile = {
                userId: 'local-user',
                keyPhraseSalt: this.cryptoService.arrayBufferToBase64(this.cryptoService.generateSalt()),
                createdAt: new Date().toISOString()
            };
            
            // Save to storage
            await this.storageManager.saveEncryptedData(serializedEncryptedData, userProfile);
            
            // Hash master password for session validation using Web Crypto API
            const encoder = new TextEncoder();
            const data = encoder.encode(masterPassword);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const masterPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            await this.sessionManager.createSession(masterPassword);
            
            return { 
                success: true, 
                keyPhrase: keyPhrase 
            };
        } catch (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle user logout
     * @returns {Promise<object>} Logout result
     */
    async handleLogout() {
        try {
            await this.sessionManager.logout();
            console.log('User logged out');
            
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all stored credentials (cached version)
     * @returns {Promise<object>} Credentials result
     */
    async getCredentials() {
        try {
            if (!(await this.sessionManager.isUserLoggedIn())) {
                throw new Error('Not authenticated');
            }
            
            console.log('Getting credentials from cache');
            
            // Load cached credentials (will be empty if no cache)
            const credentials = await this.loadAndDecryptCredentials();
            
            // Mask passwords for security
            const maskedCredentials = credentials.map(cred => ({
                ...cred,
                password: '********'
            }));
            
            return { 
                success: true, 
                credentials: maskedCredentials,
                cached: this.isCacheValid()
            };
        } catch (error) {
            console.error('Get credentials error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get specific credential password with master password verification
     * @param {string} credentialId - ID of the credential
     * @param {string} masterPassword - Master password for verification
     * @returns {Promise<object>} Result with actual password
     */
    async getCredentialPassword(credentialId, masterPassword) {
        try {
            if (!(await this.sessionManager.isUserLoggedIn())) {
                return { success: false, error: 'Not authenticated' };
            }

            // Verify master password first
            const isValidPassword = await this.verifyMasterPasswordInternal(masterPassword);
            if (!isValidPassword) {
                return { success: false, error: 'Invalid master password' };
            }

            // Load credentials with the verified master password
            const credentials = await this.loadAndDecryptCredentialsWithPassword(masterPassword);
            
            // Find the specific credential
            const credential = credentials.find(cred => cred.id === credentialId);
            if (!credential) {
                return { success: false, error: 'Credential not found' };
            }

            // Return only the password (actual, not masked)
            return { 
                success: true, 
                password: credential.password 
            };
        } catch (error) {
            console.error('Get credential password error:', error);
            return { success: false, error: 'Failed to retrieve password' };
        }
    }

    /**
     * Verify master password without returning credentials
     * @param {string} masterPassword - Master password to verify
     * @returns {Promise<object>} Verification result
     */
    async verifyMasterPassword(masterPassword) {
        try {
            if (!(await this.sessionManager.isUserLoggedIn())) {
                return { success: false, error: 'Not authenticated' };
            }

            const isValid = await this.verifyMasterPasswordInternal(masterPassword);
            return { success: isValid, error: isValid ? null : 'Invalid master password' };
        } catch (error) {
            console.error('Master password verification error:', error);
            return { success: false, error: 'Verification failed' };
        }
    }

    /**
     * Internal method to verify master password against stored data
     * @param {string} masterPassword - Master password to verify
     * @returns {Promise<boolean>} True if password is valid
     */
    async verifyMasterPasswordInternal(masterPassword) {
        try {
            // Load encrypted data and attempt to decrypt with provided password
            const encryptedData = await this.storageManager.loadEncryptedData();
            if (!encryptedData) {
                return false;
            }

            const deserializedData = this.cryptoService.deserializeEncryptedData(encryptedData);
            await this.cryptoService.decryptWithPassword(deserializedData, masterPassword);
            return true;
        } catch (error) {
            // Decryption failure means invalid password
            return false;
        }
    }

    /**
     * Get all stored credentials with master password
     * @param {string} masterPassword - Master password for decryption
     * @returns {Promise<object>} Credentials result
     */
    async getCredentialsWithPassword(masterPassword) {
        try {
            if (!(await this.sessionManager.isUserLoggedIn())) {
                throw new Error('Not authenticated');
            }
            
            console.log('Getting credentials with password');
            
            // Verify master password first
            const isValidPassword = await this.verifyMasterPasswordInternal(masterPassword);
            if (!isValidPassword) {
                return { success: false, error: 'Invalid master password' };
            }
            
            // Load and decrypt credentials with password
            const credentials = await this.loadCredentialsWithPassword(masterPassword);
            
            // Return actual passwords since master password was verified
            return { 
                success: true, 
                credentials: credentials 
            };
        } catch (error) {
            console.error('Get credentials with password error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load and decrypt credentials from storage (with caching)
     * @returns {Promise<Array>} Decrypted credentials
     */
    async loadAndDecryptCredentials() {
        try {
            // Check cache first
            if (this.credentialCache && this.isCacheValid()) {
                return this.credentialCache;
            }
            
            // If no cache, we need master password
            // For this implementation, we'll return empty array and require re-authentication
            // In a production app, you might implement secure key derivation caching
            
            const encryptedData = await this.storageManager.loadEncryptedData();
            if (!encryptedData) {
                return [];
            }
            
            // Return empty array - credentials will be loaded when master password is provided
            return [];
        } catch (error) {
            console.error('Failed to load credentials:', error);
            throw error;
        }
    }

    /**
     * Load credentials with master password and cache them
     * @param {string} masterPassword - Master password
     * @returns {Promise<Array>} Decrypted credentials
     */
    async loadCredentialsWithPassword(masterPassword) {
        try {
            const credentials = await this.loadAndDecryptCredentialsWithPassword(masterPassword);
            
            // Cache credentials for performance
            this.credentialCache = credentials;
            this.cacheTimestamp = Date.now();
            
            return credentials;
        } catch (error) {
            console.error('Failed to load credentials with password:', error);
            throw error;
        }
    }

    /**
     * Check if credential cache is valid
     * @returns {boolean} True if cache is valid
     */
    isCacheValid() {
        return this.cacheTimestamp && 
               (Date.now() - this.cacheTimestamp) < this.cacheTimeout;
    }

    /**
     * Clear credential cache
     */
    clearCredentialCache() {
        this.credentialCache = null;
        this.cacheTimestamp = null;
    }

    /**
     * Save new credential (requires cached credentials)
     * @param {object} credentialData - Credential data to save
     * @returns {Promise<object>} Save result
     */
    async saveCredential(credentialData) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Saving credential for:', credentialData.url);
            
            // Validate credential data
            this.validateCredentialData(credentialData);
            
            // Create credential object
            const credential = {
                id: this.generateCredentialId(),
                url: credentialData.url, // Don't normalize to allow flexible input
                username: credentialData.username,
                password: credentialData.password,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // If we don't have valid cache, we need to load credentials first
            // This is a simplified approach - in production you might want better session management
            if (!this.isCacheValid()) {
                // Return a special response indicating we need master password
                return {
                    success: false,
                    error: 'Master password required',
                    needsMasterPassword: true,
                    pendingCredential: credential
                };
            }
            
            // Load existing credentials from cache
            const existingCredentials = [...this.credentialCache];
            
            // Add new credential
            existingCredentials.push(credential);
            
            // Update cache
            this.credentialCache = existingCredentials;
            
            // For now, we'll just update the cache. In production, you'd want to persist immediately
            // or implement a proper sync mechanism
            return { 
                success: true, 
                credential: { ...credential, password: '********' }, // Don't return actual password
                requiresSync: true // Indicates that changes need to be saved with master password
            };
        } catch (error) {
            console.error('Save credential error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save new credential with master password
     * @param {object} credentialData - Credential data including master password
     * @returns {Promise<object>} Save result
     */
    async saveCredentialWithPassword(credentialData) {
        try {
            console.log('🔍 saveCredentialWithPassword called for:', credentialData.url);
            
            if (!(await this.sessionManager.isUserLoggedIn())) {
                console.log('🔍 User not authenticated');
                throw new Error('Not authenticated');
            }
            
            console.log('Saving credential with password for:', credentialData.url);
            
            // Validate credential data
            this.validateCredentialData(credentialData);
            
            // Create credential object
            const credential = {
                id: this.generateCredentialId(),
                url: this.normalizeUrl(credentialData.url),
                username: credentialData.username,
                password: credentialData.password,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            // Load existing credentials with password
            console.log('🔍 Loading existing credentials with master password');
            const existingCredentials = await this.loadCredentialsWithPassword(credentialData.masterPassword);
            console.log('🔍 Loaded', existingCredentials.length, 'existing credentials');
            
            // Add new credential
            existingCredentials.push(credential);
            console.log('🔍 Added new credential, total:', existingCredentials.length);
            
            // Save updated credentials
            console.log('🔍 Encrypting and saving credentials');
            await this.encryptAndSaveCredentials(existingCredentials, credentialData.masterPassword);
            console.log('🔍 Credentials saved successfully');
            
            return { 
                success: true, 
                credential: { ...credential, password: '********' } // Don't return actual password
            };
        } catch (error) {
            console.error('🔍 Save credential with password error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update existing credential
     * @param {object} credentialData - Updated credential data
     * @returns {Promise<object>} Update result
     */
    async updateCredential(credentialData) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Updating credential:', credentialData.id);
            
            // Validate credential data
            this.validateCredentialData(credentialData);
            
            // Load existing credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Find credential to update
            const credentialIndex = credentials.findIndex(c => c.id === credentialData.id);
            if (credentialIndex === -1) {
                throw new Error('Credential not found');
            }
            
            // Update credential
            credentials[credentialIndex] = {
                ...credentials[credentialIndex],
                url: this.normalizeUrl(credentialData.url),
                username: credentialData.username,
                password: credentialData.password,
                updatedAt: new Date().toISOString()
            };
            
            // Save updated credentials
            await this.encryptAndSaveCredentials(credentials);
            
            return { 
                success: true, 
                credential: { ...credentials[credentialIndex], password: '********' }
            };
        } catch (error) {
            console.error('Update credential error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete credential
     * @param {string} credentialId - ID of credential to delete
     * @returns {Promise<object>} Delete result
     */
    async deleteCredential(credentialId) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Deleting credential:', credentialId);
            
            // Load existing credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Find credential to delete
            const credentialIndex = credentials.findIndex(c => c.id === credentialId);
            if (credentialIndex === -1) {
                throw new Error('Credential not found');
            }
            
            // Remove credential
            credentials.splice(credentialIndex, 1);
            
            // Save updated credentials
            await this.encryptAndSaveCredentials(credentials);
            
            return { success: true };
        } catch (error) {
            console.error('Delete credential error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search credentials by query
     * @param {string} query - Search query
     * @returns {Promise<object>} Search results
     */
    async searchCredentials(query) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Searching credentials:', query);
            
            // Load credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Filter credentials based on query
            const filteredCredentials = credentials.filter(cred => {
                const searchText = query.toLowerCase();
                return cred.url.toLowerCase().includes(searchText) ||
                       cred.username.toLowerCase().includes(searchText);
            });
            
            // Mask passwords in results
            const maskedCredentials = filteredCredentials.map(cred => ({
                ...cred,
                password: '********'
            }));
            
            return { 
                success: true, 
                credentials: maskedCredentials 
            };
        } catch (error) {
            console.error('Search credentials error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle autofill request from content script
     * @param {object} payload - Autofill request data
     * @returns {Promise<object>} Autofill result
     */
    async handleAutofillRequest(payload) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Autofill request for:', payload.url);
            
            // Load credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Find matching credentials for the URL
            const normalizedUrl = this.normalizeUrl(payload.url);
            const matchingCredentials = credentials.filter(cred => 
                this.urlsMatch(cred.url, normalizedUrl)
            );
            
            // Return matching credentials (with masked passwords for selection)
            const maskedCredentials = matchingCredentials.map(cred => ({
                id: cred.id,
                url: cred.url,
                username: cred.username,
                password: '********' // Mask password for selection UI
            }));
            
            return { 
                success: true, 
                credentials: maskedCredentials 
            };
        } catch (error) {
            console.error('Autofill error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get full credential data for autofill (including actual password)
     * @param {string} credentialId - ID of credential to retrieve
     * @returns {Promise<object>} Credential data
     */
    async getCredentialForAutofill(credentialId) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            // Load credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Find specific credential
            const credential = credentials.find(c => c.id === credentialId);
            if (!credential) {
                throw new Error('Credential not found');
            }
            
            return { 
                success: true, 
                credential: credential 
            };
        } catch (error) {
            console.error('Get credential for autofill error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle save credential from context menu
     * @param {object} payload - Credential data from context menu
     * @returns {Promise<object>} Save result
     */
    async handleContextMenuSave(payload) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Context menu save for:', payload.url);
            
            // Use the same save credential logic
            return await this.saveCredential(payload);
        } catch (error) {
            console.error('Context menu save error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle data export with key phrase
     * @param {string[]} keyPhrase - Key phrase for encryption
     * @returns {Promise<object>} Export result
     */
    async handleExport(keyPhrase) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Export requested with key phrase');
            
            // Validate key phrase
            if (!this.cryptoService.validateKeyPhrase(keyPhrase)) {
                throw new Error('Invalid key phrase format');
            }
            
            // Load credentials
            const credentials = await this.loadAndDecryptCredentials();
            
            // Serialize credentials
            const serializedCredentials = this.storageManager.serializeCredentials(credentials);
            
            // Encrypt with key phrase
            const encryptedData = await this.cryptoService.encryptWithKeyPhrase(
                serializedCredentials, 
                keyPhrase
            );
            
            // Create export data structure
            const exportData = {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                data: encryptedData,
                type: 'chrome-password-manager-export'
            };
            
            return { 
                success: true, 
                data: JSON.stringify(exportData, null, 2)
            };
        } catch (error) {
            console.error('Export error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle data import with key phrase
     * @param {File} file - Import file
     * @param {string[]} keyPhrase - Key phrase for decryption
     * @returns {Promise<object>} Import result
     */
    async handleImport(file, keyPhrase) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Import requested');
            
            // Validate key phrase
            if (!this.cryptoService.validateKeyPhrase(keyPhrase)) {
                throw new Error('Invalid key phrase format');
            }
            
            // Import and validate file
            const encryptedData = await this.storageManager.importFromFile(file);
            
            // Decrypt with key phrase
            const decryptedData = await this.cryptoService.decryptWithKeyPhrase(
                encryptedData, 
                keyPhrase
            );
            
            // Deserialize imported credentials
            const importedCredentials = this.storageManager.deserializeCredentials(decryptedData);
            
            // Load existing credentials
            const existingCredentials = await this.loadAndDecryptCredentials();
            
            // Merge credentials
            const mergedCredentials = this.storageManager.mergeCredentials(
                existingCredentials, 
                importedCredentials
            );
            
            // Save merged credentials
            await this.encryptAndSaveCredentials(mergedCredentials);
            
            return { 
                success: true, 
                imported: importedCredentials.length,
                total: mergedCredentials.length
            };
        } catch (error) {
            console.error('Import error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Utility methods
     */

    /**
     * Validate credential data
     * @param {object} credentialData - Credential data to validate
     */
    validateCredentialData(credentialData) {
        if (!credentialData.url || typeof credentialData.url !== 'string') {
            throw new Error('Valid URL is required');
        }
        
        if (!credentialData.username || typeof credentialData.username !== 'string') {
            throw new Error('Username is required');
        }
        
        if (!credentialData.password || typeof credentialData.password !== 'string') {
            throw new Error('Password is required');
        }
        
        // Additional validation
        if (credentialData.url.length > 2048) {
            throw new Error('URL too long');
        }
        
        if (credentialData.username.length > 255) {
            throw new Error('Username too long');
        }
        
        if (credentialData.password.length > 1000) {
            throw new Error('Password too long');
        }
    }

    /**
     * Generate unique credential ID
     * @returns {string} Unique credential ID
     */
    generateCredentialId() {
        return 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Normalize URL for consistent storage and matching
     * @param {string} url - URL to normalize
     * @returns {string} Normalized URL
     */
    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
        } catch (error) {
            // If URL parsing fails, return as-is but cleaned
            return url.toLowerCase().trim();
        }
    }

    /**
     * Check if two URLs match for credential lookup
     * @param {string} storedUrl - Stored credential URL
     * @param {string} currentUrl - Current page URL
     * @returns {boolean} True if URLs match
     */
    urlsMatch(storedUrl, currentUrl) {
        try {
            const stored = new URL(storedUrl);
            const current = new URL(currentUrl);
            
            // Match by hostname and optionally path
            return stored.hostname === current.hostname;
        } catch (error) {
            // Fallback to simple string comparison
            return storedUrl.toLowerCase().includes(currentUrl.toLowerCase()) ||
                   currentUrl.toLowerCase().includes(storedUrl.toLowerCase());
        }
    }

    /**
     * Encrypt and save credentials to storage
     * @param {Array} credentials - Credentials to encrypt and save
     * @param {string} masterPassword - Master password for encryption (optional, will prompt if not provided)
     */
    async encryptAndSaveCredentials(credentials, masterPassword = null) {
        try {
            // If no master password provided, we need to get it from the user
            // In a real implementation, you might store the derived key temporarily in memory
            // For now, we'll implement a basic version that requires re-authentication
            
            if (!masterPassword) {
                // Send message to popup to request master password
                // This is a simplified approach - in production, consider more secure methods
                throw new Error('Master password required for encryption. Please re-authenticate.');
            }
            
            // Serialize credentials
            const serializedCredentials = this.storageManager.serializeCredentials(credentials);
            
            // Encrypt with master password
            const encryptedData = await this.cryptoService.encryptWithPassword(
                serializedCredentials, 
                masterPassword
            );
            
            // Serialize encrypted data
            const serializedEncryptedData = this.cryptoService.serializeEncryptedData(encryptedData);
            
            // Save to storage
            await this.storageManager.saveEncryptedData(serializedEncryptedData);
            
            console.log('Credentials encrypted and saved successfully');
        } catch (error) {
            console.error('Failed to encrypt and save credentials:', error);
            throw error;
        }
    }

    /**
     * Load and decrypt credentials with master password
     * @param {string} masterPassword - Master password for decryption
     * @returns {Promise<Array>} Decrypted credentials
     */
    async loadAndDecryptCredentialsWithPassword(masterPassword) {
        try {
            const encryptedData = await this.storageManager.loadEncryptedData();
            if (!encryptedData) {
                return [];
            }
            
            // Deserialize encrypted data
            const deserializedData = this.cryptoService.deserializeEncryptedData(encryptedData);
            
            // Decrypt with master password
            const decryptedData = await this.cryptoService.decryptWithPassword(
                deserializedData, 
                masterPassword
            );
            
            // Deserialize credentials
            return this.storageManager.deserializeCredentials(decryptedData);
        } catch (error) {
            console.error('Failed to load and decrypt credentials:', error);
            throw error;
        }
    }

    /**
     * Initialize context menu items
     */
    initializeContextMenus() {
        try {
            // Remove existing context menus
            chrome.contextMenus.removeAll(() => {
                // Create context menu items for password manager functionality
                chrome.contextMenus.create({
                    id: 'password-manager-save',
                    title: 'Save to Password Manager',
                    contexts: ['page'],
                    documentUrlPatterns: ['http://*/*', 'https://*/*']
                });

                chrome.contextMenus.create({
                    id: 'password-manager-fill',
                    title: 'Password Manager',
                    contexts: ['page'],
                    documentUrlPatterns: ['http://*/*', 'https://*/*']
                });

                console.log('Context menus initialized');
            });

            // Handle context menu clicks
            chrome.contextMenus.onClicked.addListener((info, tab) => {
                this.handleContextMenuClick(info, tab);
            });
        } catch (error) {
            console.error('Failed to initialize context menus:', error);
        }
    }

    /**
     * Handle context menu clicks
     * @param {object} info - Context menu info
     * @param {object} tab - Tab info
     */
    async handleContextMenuClick(info, tab) {
        try {
            console.log('Context menu clicked:', info.menuItemId, 'on tab:', tab.url);
            
            // Check if user is authenticated
            if (!this.sessionManager.isUserLoggedIn()) {
                // Try to open popup for login
                try {
                    await chrome.action.openPopup();
                } catch (popupError) {
                    console.log('Could not open popup, sending message to content script');
                    // Fallback: send message to content script to show login prompt
                    await this.sendMessageToContentScript(tab.id, {
                        type: 'SHOW_LOGIN_PROMPT',
                        message: 'Please login to use Password Manager'
                    });
                }
                return;
            }

            // Handle different menu items
            switch (info.menuItemId) {
                case 'password-manager-save':
                    await this.handleContextMenuSave(tab);
                    break;
                    
                case 'password-manager-fill':
                    await this.handleContextMenuFill(tab);
                    break;
                    
                default:
                    console.warn('Unknown context menu item:', info.menuItemId);
            }
        } catch (error) {
            console.error('Context menu click error:', error);
            
            // Show error notification to user
            await this.showNotification('Error', 'Failed to process context menu action');
        }
    }

    /**
     * Handle context menu save action
     * @param {object} tab - Tab info
     */
    async handleContextMenuSave(tab) {
        try {
            // Check if user is authenticated
            if (!this.sessionManager.isUserLoggedIn()) {
                await this.showNotification('Authentication Required', 'Please login to Password Manager first');
                // Open the extension popup for login
                chrome.action.openPopup();
                return;
            }
            
            // Send message to content script to extract credentials
            const response = await this.sendMessageToContentScript(tab.id, {
                type: 'EXTRACT_CREDENTIALS',
                url: tab.url
            });
            
            if (response && response.success && response.credentials) {
                // Credentials extracted, try to save them
                let saveResult = await this.saveCredential({
                    url: response.credentials.url || tab.url,
                    username: response.credentials.username,
                    password: response.credentials.password
                });
                
                // If save requires master password, prompt for it
                if (!saveResult.success && saveResult.needsMasterPassword) {
                    await this.showNotification('Master Password Required', 'Please open Password Manager to enter your master password');
                    chrome.action.openPopup();
                    return;
                }
                
                if (saveResult.success) {
                    await this.showNotification('Success', 'Credentials saved successfully');
                } else {
                    await this.showNotification('Error', saveResult.error || 'Failed to save credentials');
                }
            } else {
                await this.showNotification('Info', 'No login form detected on this page');
            }
        } catch (error) {
            console.error('Context menu save error:', error);
            await this.showNotification('Error', 'Failed to save credentials');
        }
    }

    /**
     * Handle context menu fill action
     * @param {object} tab - Tab info
     */
    async handleContextMenuFill(tab) {
        try {
            // Get matching credentials for this URL
            const credentialsResult = await this.handleAutofillRequest({ url: tab.url });
            
            if (credentialsResult.success && credentialsResult.credentials.length > 0) {
                // Send credentials to content script for autofill
                await this.sendMessageToContentScript(tab.id, {
                    type: 'SHOW_AUTOFILL_OPTIONS',
                    url: tab.url,
                    credentials: credentialsResult.credentials
                });
            } else {
                await this.showNotification('Info', 'No saved credentials found for this site');
            }
        } catch (error) {
            console.error('Context menu fill error:', error);
            await this.showNotification('Error', 'Failed to retrieve credentials');
        }
    }

    /**
     * Send message to content script with error handling and injection fallback
     * @param {number} tabId - Tab ID
     * @param {object} message - Message to send
     * @returns {Promise<object>} Response from content script
     */
    async sendMessageToContentScript(tabId, message) {
        try {
            const response = await chrome.tabs.sendMessage(tabId, message);
            return response;
        } catch (error) {
            console.log('Content script not available, attempting injection');
            
            try {
                // Check if scripting API is available
                if (!chrome.scripting || !chrome.scripting.executeScript) {
                    throw new Error('Scripting API not available');
                }
                
                // Inject content script
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['src/content/content.js']
                });
                
                // Wait a moment for script to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Retry sending message
                const response = await chrome.tabs.sendMessage(tabId, message);
                return response;
            } catch (injectionError) {
                console.error('Failed to inject content script:', injectionError);
                throw new Error('Could not communicate with page content');
            }
        }
    }

    /**
     * Show notification to user
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     */
    async showNotification(title, message) {
        try {
            // Check if notifications API is available
            if (!chrome.notifications || !chrome.notifications.create) {
                console.log('Notifications API not available, skipping notification');
                return;
            }
            
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: title,
                message: message
            });
        } catch (error) {
            console.error('Failed to show notification:', error);
        }
    }

    // Permission Management Methods

    /**
     * Check current permission status
     * @returns {Promise<Object>} Permission status
     */
    async handleCheckPermissions() {
        try {
            const hasRequired = await this.permissionManager.hasRequiredPermissions();
            const hasOptional = await this.permissionManager.hasOptionalPermissions();
            const hasHost = await this.permissionManager.hasHostPermissions();
            const allPermissions = await this.permissionManager.getAllPermissions();

            return {
                success: true,
                data: {
                    hasRequired,
                    hasOptional,
                    hasHost,
                    allPermissions
                }
            };
        } catch (error) {
            console.error('Error checking permissions:', error);
            return {
                success: false,
                error: 'Failed to check permissions'
            };
        }
    }

    /**
     * Request permissions needed for autofill functionality
     * @returns {Promise<Object>} Request result
     */
    async handleRequestAutofillPermissions() {
        try {
            const granted = await this.permissionManager.requestAutofillPermissions();
            
            return {
                success: true,
                data: { granted }
            };
        } catch (error) {
            console.error('Error requesting autofill permissions:', error);
            return {
                success: false,
                error: 'Failed to request autofill permissions'
            };
        }
    }

    /**
     * Request optional permissions
     * @param {string[]} permissions - Array of permission names
     * @returns {Promise<Object>} Request result
     */
    async handleRequestOptionalPermissions(permissions) {
        try {
            const granted = await this.permissionManager.requestOptionalPermissions(permissions);
            
            return {
                success: true,
                data: { granted, permissions }
            };
        } catch (error) {
            console.error('Error requesting optional permissions:', error);
            return {
                success: false,
                error: 'Failed to request optional permissions'
            };
        }
    }

    /**
     * Request host permissions
     * @param {string[]} origins - Array of host origins
     * @returns {Promise<Object>} Request result
     */
    async handleRequestHostPermissions(origins) {
        try {
            const granted = await this.permissionManager.requestHostPermissions(origins);
            
            return {
                success: true,
                data: { granted, origins }
            };
        } catch (error) {
            console.error('Error requesting host permissions:', error);
            return {
                success: false,
                error: 'Failed to request host permissions'
            };
        }
    }

    /**
     * Remove optional permissions
     * @param {string[]} permissions - Array of permission names
     * @returns {Promise<Object>} Remove result
     */
    async handleRemoveOptionalPermissions(permissions) {
        try {
            const removed = await this.permissionManager.removeOptionalPermissions(permissions);
            
            return {
                success: true,
                data: { removed, permissions }
            };
        } catch (error) {
            console.error('Error removing optional permissions:', error);
            return {
                success: false,
                error: 'Failed to remove optional permissions'
            };
        }
    }

    /**
     * Get all currently granted permissions
     * @returns {Promise<Object>} All permissions
     */
    async handleGetAllPermissions() {
        try {
            const allPermissions = await this.permissionManager.getAllPermissions();
            
            return {
                success: true,
                data: allPermissions
            };
        } catch (error) {
            console.error('Error getting all permissions:', error);
            return {
                success: false,
                error: 'Failed to get all permissions'
            };
        }
    }

    /**
     * Handle account deletion
     * @param {string} masterPassword - Master password for verification
     * @returns {Promise<object>} Delete result
     */
    async handleDeleteAccount(masterPassword) {
        try {
            console.log('Delete account request received');
            
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            // Verify master password by attempting to decrypt stored data
            const encryptedData = await this.storageManager.loadEncryptedData();
            if (!encryptedData) {
                throw new Error('No account data found');
            }
            
            try {
                const deserializedData = this.cryptoService.deserializeEncryptedData(encryptedData);
                await this.cryptoService.decryptWithPassword(deserializedData, masterPassword);
                console.log('Master password verified for account deletion');
            } catch (decryptError) {
                console.log('Invalid master password for account deletion');
                return { success: false, error: 'Invalid master password' };
            }
            
            // Clear all stored data
            await this.storageManager.clearAllData();
            
            // Clear session
            await this.sessionManager.clearSession();
            
            // Clear credential cache
            this.clearCredentialCache();
            
            console.log('Account deleted successfully');
            return { success: true };
        } catch (error) {
            console.error('Delete account error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update credential with master password
     * @param {object} credentialData - Updated credential data including master password
     * @returns {Promise<object>} Update result
     */
    async updateCredentialWithPassword(credentialData) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Updating credential with password:', credentialData.id);
            
            // Validate credential data
            this.validateCredentialData(credentialData);
            
            // Load existing credentials with password
            const credentials = await this.loadCredentialsWithPassword(credentialData.masterPassword);
            
            // Find credential to update
            const credentialIndex = credentials.findIndex(c => c.id === credentialData.id);
            if (credentialIndex === -1) {
                throw new Error('Credential not found');
            }
            
            // Update credential
            credentials[credentialIndex] = {
                ...credentials[credentialIndex],
                url: this.normalizeUrl(credentialData.url),
                username: credentialData.username,
                password: credentialData.password,
                updatedAt: new Date().toISOString()
            };
            
            // Save updated credentials
            await this.encryptAndSaveCredentials(credentials, credentialData.masterPassword);
            
            return { 
                success: true, 
                credential: { ...credentials[credentialIndex], password: '********' }
            };
        } catch (error) {
            console.error('Update credential with password error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete credential with master password
     * @param {string} credentialId - ID of credential to delete
     * @param {string} masterPassword - Master password
     * @returns {Promise<object>} Delete result
     */
    async deleteCredentialWithPassword(credentialId, masterPassword) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Deleting credential with password:', credentialId);
            
            // Load existing credentials with password
            const credentials = await this.loadCredentialsWithPassword(masterPassword);
            
            // Find credential to delete
            const credentialIndex = credentials.findIndex(c => c.id === credentialId);
            if (credentialIndex === -1) {
                throw new Error('Credential not found');
            }
            
            // Remove credential
            credentials.splice(credentialIndex, 1);
            
            // Save updated credentials
            await this.encryptAndSaveCredentials(credentials, masterPassword);
            
            return { success: true };
        } catch (error) {
            console.error('Delete credential with password error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Search credentials with master password
     * @param {string} query - Search query
     * @param {string} masterPassword - Master password
     * @returns {Promise<object>} Search results
     */
    async searchCredentialsWithPassword(query, masterPassword) {
        try {
            if (!this.sessionManager.isUserLoggedIn()) {
                throw new Error('Not authenticated');
            }
            
            console.log('Searching credentials with password:', query);
            
            // Load credentials with password
            const credentials = await this.loadCredentialsWithPassword(masterPassword);
            
            // Filter credentials based on query
            const filteredCredentials = credentials.filter(cred => {
                const searchText = query.toLowerCase();
                return cred.url.toLowerCase().includes(searchText) ||
                       cred.username.toLowerCase().includes(searchText);
            });
            
            // Mask passwords in results
            const maskedCredentials = filteredCredentials.map(cred => ({
                ...cred,
                password: '********'
            }));
            
            return { 
                success: true, 
                credentials: maskedCredentials 
            };
        } catch (error) {
            console.error('Search credentials with password error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize background service
const backgroundService = new BackgroundService();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackgroundService;
} else if (typeof window !== 'undefined') {
    window.BackgroundService = BackgroundService;
}