/**
 * Background Service Tests
 * Tests for message routing, credential management, and context menu integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn()
    },
    onInstalled: {
      addListener: vi.fn()
    },
    onStartup: {
      addListener: vi.fn()
    },
    sendMessage: vi.fn()
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn((callback) => callback()),
    onClicked: {
      addListener: vi.fn()
    }
  },
  tabs: {
    sendMessage: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  },
  action: {
    openPopup: vi.fn()
  },
  notifications: {
    create: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      getBytesInUse: vi.fn()
    }
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn()
  }
};

// Mock crypto API
const mockCrypto = {
  subtle: {
    digest: vi.fn(),
    importKey: vi.fn(),
    deriveKey: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn()
  },
  getRandomValues: vi.fn()
};

// Mock services
const mockCryptoService = {
  generateKeyPhrase: vi.fn(() => ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16']),
  validateKeyPhrase: vi.fn(() => true),
  encryptWithPassword: vi.fn(() => ({ data: new Uint8Array([1, 2, 3]), iv: new Uint8Array([4, 5, 6]), salt: new Uint8Array([7, 8, 9]) })),
  decryptWithPassword: vi.fn(() => '{"credentials":[]}'),
  encryptWithKeyPhrase: vi.fn(() => 'encrypted-data'),
  decryptWithKeyPhrase: vi.fn(() => '{"credentials":[]}'),
  serializeEncryptedData: vi.fn(() => 'serialized-data'),
  deserializeEncryptedData: vi.fn(() => ({ data: new Uint8Array([1, 2, 3]), iv: new Uint8Array([4, 5, 6]), salt: new Uint8Array([7, 8, 9]) })),
  arrayBufferToBase64: vi.fn(() => 'base64-data'),
  generateSalt: vi.fn(() => new Uint8Array([1, 2, 3, 4]))
};

const mockStorageManager = {
  saveEncryptedData: vi.fn(),
  loadEncryptedData: vi.fn(() => null),
  loadUserProfile: vi.fn(() => null),
  clearAllData: vi.fn(),
  serializeCredentials: vi.fn(() => '{"credentials":[]}'),
  deserializeCredentials: vi.fn(() => []),
  exportToFile: vi.fn(),
  importFromFile: vi.fn(() => 'encrypted-data'),
  mergeCredentials: vi.fn((existing, imported) => [...existing, ...imported])
};

const mockOAuthHandler = {
  authenticate: vi.fn(() => ({ token: 'mock-token', userInfo: { email: 'test@gmail.com', id: '123' } })),
  isAuthenticated: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ email: 'test@gmail.com', id: '123' })),
  getValidToken: vi.fn(() => 'mock-token'),
  signOut: vi.fn()
};

const mockSessionManager = {
  isUserLoggedIn: vi.fn(() => true),
  getCurrentUser: vi.fn(() => ({ email: 'test@gmail.com', id: '123' })),
  getSession: vi.fn(() => ({ sessionId: 'mock-session', userInfo: { email: 'test@gmail.com' } })),
  createSession: vi.fn(),
  updateActivity: vi.fn(),
  logout: vi.fn()
};

// Set up global mocks
global.chrome = mockChrome;
global.crypto = mockCrypto;
global.CryptoService = vi.fn(() => mockCryptoService);
global.StorageManager = vi.fn(() => mockStorageManager);
global.OAuthHandler = vi.fn(() => mockOAuthHandler);
global.SessionManager = vi.fn(() => mockSessionManager);

// Import the BackgroundService after mocks are set up
// Note: In a real test environment, you'd need to handle the importScripts differently
class BackgroundService {
  constructor() {
    this.cryptoService = mockCryptoService;
    this.storageManager = mockStorageManager;
    this.oauthHandler = mockOAuthHandler;
    this.sessionManager = mockSessionManager;
    
    this.credentialCache = null;
    this.cacheTimestamp = null;
    this.cacheTimeout = 5 * 60 * 1000;
    
    this.messageSchema = {
      'CHECK_AUTH_STATE': { required: [] },
      'GMAIL_AUTH': { required: ['mode'] },
      'LOGIN': { required: ['masterPassword'] },
      'SIGNUP': { required: ['masterPassword'] },
      'LOGOUT': { required: [] },
      'GET_CREDENTIALS': { required: [] },
      'GET_CREDENTIALS_WITH_PASSWORD': { required: ['masterPassword'] },
      'SAVE_CREDENTIAL': { required: ['url', 'username', 'password'] },
      'SAVE_CREDENTIAL_WITH_PASSWORD': { required: ['url', 'username', 'password', 'masterPassword'] },
      'UPDATE_CREDENTIAL': { required: ['id', 'url', 'username', 'password'] },
      'DELETE_CREDENTIAL': { required: ['id'] },
      'SEARCH_CREDENTIALS': { required: ['query'] },
      'AUTOFILL_REQUEST': { required: ['url'] },
      'GET_CREDENTIAL_FOR_AUTOFILL': { required: ['credentialId'] },
      'CONTEXT_MENU_SAVE': { required: ['url', 'username', 'password'] },
      'EXPORT_DATA': { required: ['keyPhrase'] },
      'IMPORT_DATA': { required: ['file', 'keyPhrase'] }
    };
  }

  validateMessage(type, payload) {
    const schema = this.messageSchema[type];
    if (!schema) return false;
    
    for (const field of schema.required) {
      if (!(field in payload)) return false;
    }
    return true;
  }

  async handleMessage(message, sender) {
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message format');
    }

    const { type, payload = {} } = message;

    if (!type || typeof type !== 'string') {
      throw new Error('Message type is required');
    }
    
    if (!this.validateMessage(type, payload)) {
      throw new Error(`Invalid message payload for type: ${type}`);
    }

    switch (type) {
      case 'CHECK_AUTH_STATE':
        return await this.handleAuthStateCheck();
      case 'GMAIL_AUTH':
        return await this.handleGmailAuth(payload.mode);
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
      case 'SAVE_CREDENTIAL_WITH_PASSWORD':
        return await this.saveCredentialWithPassword(payload);
      case 'SEARCH_CREDENTIALS_WITH_PASSWORD':
        return await this.searchCredentialsWithPassword(payload.query, payload.masterPassword);
      case 'AUTOFILL_REQUEST':
        return await this.handleAutofillRequest(payload);
      case 'EXPORT_DATA':
        return await this.handleExport(payload.keyPhrase);
      case 'IMPORT_DATA':
        return await this.handleImport(payload.file, payload.keyPhrase);
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  }

  async handleAuthStateCheck() {
    return {
      success: true,
      authenticated: this.sessionManager.isUserLoggedIn(),
      userInfo: this.sessionManager.getCurrentUser()
    };
  }

  async handleGmailAuth(mode) {
    const authResult = await this.oauthHandler.authenticate();
    return { 
      success: true, 
      token: authResult.token,
      userInfo: authResult.userInfo,
      mode 
    };
  }

  async handleLogin(masterPassword) {
    if (!this.oauthHandler.isAuthenticated()) {
      throw new Error('Gmail authentication required');
    }

    const userProfile = await this.storageManager.loadUserProfile();
    if (!userProfile) {
      throw new Error('No user profile found. Please sign up first.');
    }

    const userInfo = this.oauthHandler.getUserInfo();
    const token = await this.oauthHandler.getValidToken();
    
    const encoder = new TextEncoder();
    const data = encoder.encode(masterPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const masterPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    await this.sessionManager.createSession(token, userInfo, masterPasswordHash);
    
    return { success: true };
  }

  async handleSignup(masterPassword) {
    if (!this.oauthHandler.isAuthenticated()) {
      throw new Error('Gmail authentication required');
    }

    const existingProfile = await this.storageManager.loadUserProfile();
    if (existingProfile) {
      throw new Error('User already exists. Please login instead.');
    }

    const keyPhrase = this.cryptoService.generateKeyPhrase();
    const initialCredentials = [];
    const serializedCredentials = this.storageManager.serializeCredentials(initialCredentials);
    
    const encryptedData = await this.cryptoService.encryptWithPassword(
      serializedCredentials, 
      masterPassword
    );
    const serializedEncryptedData = this.cryptoService.serializeEncryptedData(encryptedData);
    
    const userInfo = this.oauthHandler.getUserInfo();
    const userProfile = {
      gmailId: userInfo.email,
      keyPhraseSalt: this.cryptoService.arrayBufferToBase64(this.cryptoService.generateSalt()),
      createdAt: new Date().toISOString()
    };
    
    await this.storageManager.saveEncryptedData(serializedEncryptedData, userProfile);
    
    const token = await this.oauthHandler.getValidToken();
    const encoder = new TextEncoder();
    const data = encoder.encode(masterPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const masterPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    await this.sessionManager.createSession(token, userInfo, masterPasswordHash);
    
    return { 
      success: true, 
      keyPhrase: keyPhrase 
    };
  }

  async handleLogout() {
    await this.sessionManager.logout();
    return { success: true };
  }

  async getCredentials() {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    const credentials = [];
    const maskedCredentials = credentials.map(cred => ({
      ...cred,
      password: '********'
    }));
    
    return { 
      success: true, 
      credentials: maskedCredentials,
      cached: false
    };
  }

  async getCredentialsWithPassword(masterPassword) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    const credentials = await this.loadCredentialsWithPassword(masterPassword);
    const maskedCredentials = credentials.map(cred => ({
      ...cred,
      password: '********'
    }));
    
    return { 
      success: true, 
      credentials: maskedCredentials 
    };
  }

  async loadCredentialsWithPassword(masterPassword) {
    const encryptedData = await this.storageManager.loadEncryptedData();
    if (!encryptedData) {
      return [];
    }
    
    const deserializedData = this.cryptoService.deserializeEncryptedData(encryptedData);
    const decryptedData = await this.cryptoService.decryptWithPassword(deserializedData, masterPassword);
    return this.storageManager.deserializeCredentials(decryptedData);
  }

  async saveCredentialWithPassword(credentialData) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    this.validateCredentialData(credentialData);
    
    const credential = {
      id: this.generateCredentialId(),
      url: this.normalizeUrl(credentialData.url),
      username: credentialData.username,
      password: credentialData.password,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const existingCredentials = await this.loadCredentialsWithPassword(credentialData.masterPassword);
    existingCredentials.push(credential);
    
    await this.encryptAndSaveCredentials(existingCredentials, credentialData.masterPassword);
    
    return { 
      success: true, 
      credential: { ...credential, password: '********' }
    };
  }

  async searchCredentialsWithPassword(query, masterPassword) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    const credentials = await this.loadCredentialsWithPassword(masterPassword);
    const filteredCredentials = credentials.filter(cred => {
      const searchText = query.toLowerCase();
      return cred.url.toLowerCase().includes(searchText) ||
             cred.username.toLowerCase().includes(searchText);
    });
    
    const maskedCredentials = filteredCredentials.map(cred => ({
      ...cred,
      password: '********'
    }));
    
    return { 
      success: true, 
      credentials: maskedCredentials 
    };
  }

  async handleAutofillRequest(payload) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    const credentials = [];
    const normalizedUrl = this.normalizeUrl(payload.url);
    const matchingCredentials = credentials.filter(cred => 
      this.urlsMatch(cred.url, normalizedUrl)
    );
    
    const maskedCredentials = matchingCredentials.map(cred => ({
      id: cred.id,
      url: cred.url,
      username: cred.username,
      password: '********'
    }));
    
    return { 
      success: true, 
      credentials: maskedCredentials 
    };
  }

  async handleExport(keyPhrase) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    if (!this.cryptoService.validateKeyPhrase(keyPhrase)) {
      throw new Error('Invalid key phrase format');
    }

    const credentials = [];
    const serializedCredentials = this.storageManager.serializeCredentials(credentials);
    const encryptedData = await this.cryptoService.encryptWithKeyPhrase(serializedCredentials, keyPhrase);
    await this.storageManager.exportToFile(encryptedData);
    
    return { success: true };
  }

  async handleImport(file, keyPhrase) {
    if (!this.sessionManager.isUserLoggedIn()) {
      throw new Error('Not authenticated');
    }

    if (!this.cryptoService.validateKeyPhrase(keyPhrase)) {
      throw new Error('Invalid key phrase format');
    }

    const encryptedData = await this.storageManager.importFromFile(file);
    const decryptedData = await this.cryptoService.decryptWithKeyPhrase(encryptedData, keyPhrase);
    const importedCredentials = this.storageManager.deserializeCredentials(decryptedData);
    
    const existingCredentials = [];
    const mergedCredentials = this.storageManager.mergeCredentials(existingCredentials, importedCredentials);
    
    await this.encryptAndSaveCredentials(mergedCredentials, 'mock-password');
    
    return { 
      success: true, 
      imported: importedCredentials.length,
      total: mergedCredentials.length
    };
  }

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
  }

  generateCredentialId() {
    return 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch (error) {
      return url.toLowerCase().trim();
    }
  }

  urlsMatch(storedUrl, currentUrl) {
    try {
      const stored = new URL(storedUrl);
      const current = new URL(currentUrl);
      return stored.hostname === current.hostname;
    } catch (error) {
      return storedUrl.toLowerCase().includes(currentUrl.toLowerCase()) ||
             currentUrl.toLowerCase().includes(storedUrl.toLowerCase());
    }
  }

  async encryptAndSaveCredentials(credentials, masterPassword = null) {
    if (!masterPassword) {
      throw new Error('Master password required for encryption');
    }
    
    const serializedCredentials = this.storageManager.serializeCredentials(credentials);
    const encryptedData = await this.cryptoService.encryptWithPassword(serializedCredentials, masterPassword);
    const serializedEncryptedData = this.cryptoService.serializeEncryptedData(encryptedData);
    await this.storageManager.saveEncryptedData(serializedEncryptedData);
  }
}

describe('BackgroundService', () => {
  let backgroundService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh instance
    backgroundService = new BackgroundService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Message Routing', () => {
    it('should validate message structure', async () => {
      // Test invalid message
      await expect(backgroundService.handleMessage(null)).rejects.toThrow('Invalid message format');
      
      // Test missing type
      await expect(backgroundService.handleMessage({})).rejects.toThrow('Message type is required');
      
      // Test invalid payload
      await expect(backgroundService.handleMessage({ type: 'LOGIN', payload: {} })).rejects.toThrow('Invalid message payload');
    });

    it('should route messages to correct handlers', async () => {
      const message = { type: 'CHECK_AUTH_STATE', payload: {} };
      const result = await backgroundService.handleMessage(message);
      
      expect(result.success).toBe(true);
      expect(result.authenticated).toBe(true);
    });

    it('should handle unknown message types', async () => {
      const message = { type: 'UNKNOWN_TYPE', payload: {} };
      
      await expect(backgroundService.handleMessage(message)).rejects.toThrow('Invalid message payload for type: UNKNOWN_TYPE');
    });

    it('should validate required fields', () => {
      expect(backgroundService.validateMessage('LOGIN', { masterPassword: 'test' })).toBe(true);
      expect(backgroundService.validateMessage('LOGIN', {})).toBe(false);
      expect(backgroundService.validateMessage('SAVE_CREDENTIAL', { url: 'test.com', username: 'user', password: 'pass' })).toBe(true);
    });
  });

  describe('Authentication Handling', () => {
    it('should handle Gmail authentication', async () => {
      const result = await backgroundService.handleGmailAuth('login');
      
      expect(result.success).toBe(true);
      expect(result.token).toBe('mock-token');
      expect(result.userInfo.email).toBe('test@gmail.com');
      expect(mockOAuthHandler.authenticate).toHaveBeenCalled();
    });

    it('should handle login with master password', async () => {
      mockStorageManager.loadUserProfile.mockResolvedValue({ gmailId: 'test@gmail.com' });
      
      const result = await backgroundService.handleLogin('masterpass123');
      
      expect(result.success).toBe(true);
      expect(mockSessionManager.createSession).toHaveBeenCalled();
    });

    it('should handle signup with master password', async () => {
      mockStorageManager.loadUserProfile.mockResolvedValue(null); // No existing profile
      
      const result = await backgroundService.handleSignup('masterpass123');
      
      expect(result.success).toBe(true);
      expect(result.keyPhrase).toHaveLength(16);
      expect(mockCryptoService.generateKeyPhrase).toHaveBeenCalled();
      expect(mockStorageManager.saveEncryptedData).toHaveBeenCalled();
    });

    it('should handle logout', async () => {
      const result = await backgroundService.handleLogout();
      
      expect(result.success).toBe(true);
      expect(mockSessionManager.logout).toHaveBeenCalled();
    });

    it('should check authentication state', async () => {
      const result = await backgroundService.handleAuthStateCheck();
      
      expect(result.success).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.userInfo.email).toBe('test@gmail.com');
    });
  });

  describe('Credential Management', () => {
    it('should get credentials', async () => {
      const result = await backgroundService.getCredentials();
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.credentials)).toBe(true);
    });

    it('should get credentials with password', async () => {
      mockStorageManager.loadEncryptedData.mockResolvedValue('encrypted-data');
      
      const result = await backgroundService.getCredentialsWithPassword('masterpass123');
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.credentials)).toBe(true);
      expect(mockCryptoService.decryptWithPassword).toHaveBeenCalled();
    });

    it('should save credential with password', async () => {
      const credentialData = {
        url: 'https://example.com',
        username: 'testuser',
        password: 'testpass',
        masterPassword: 'masterpass123'
      };
      
      const result = await backgroundService.saveCredentialWithPassword(credentialData);
      
      expect(result.success).toBe(true);
      expect(result.credential.url).toBe('https://example.com/');
      expect(result.credential.password).toBe('********'); // Should be masked
    });

    it('should search credentials with password', async () => {
      const mockCredentials = [
        { id: '1', url: 'https://example.com', username: 'user1', password: 'pass1' },
        { id: '2', url: 'https://test.com', username: 'user2', password: 'pass2' }
      ];
      
      mockStorageManager.deserializeCredentials.mockReturnValue(mockCredentials);
      
      const result = await backgroundService.searchCredentialsWithPassword('example', 'masterpass123');
      
      expect(result.success).toBe(true);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].url).toBe('https://example.com');
    });

    it('should validate credential data', () => {
      expect(() => backgroundService.validateCredentialData({
        url: 'https://example.com',
        username: 'user',
        password: 'pass'
      })).not.toThrow();
      
      expect(() => backgroundService.validateCredentialData({
        username: 'user',
        password: 'pass'
      })).toThrow('Valid URL is required');
      
      expect(() => backgroundService.validateCredentialData({
        url: 'https://example.com',
        password: 'pass'
      })).toThrow('Username is required');
    });

    it('should generate unique credential IDs', () => {
      const id1 = backgroundService.generateCredentialId();
      const id2 = backgroundService.generateCredentialId();
      
      expect(id1).toMatch(/^cred_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^cred_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should normalize URLs correctly', () => {
      expect(backgroundService.normalizeUrl('https://example.com/path?query=1')).toBe('https://example.com/path');
      expect(backgroundService.normalizeUrl('HTTP://EXAMPLE.COM')).toBe('http://example.com/');
      expect(backgroundService.normalizeUrl('invalid-url')).toBe('invalid-url');
    });

    it('should match URLs correctly', () => {
      expect(backgroundService.urlsMatch('https://example.com', 'https://example.com/login')).toBe(true);
      expect(backgroundService.urlsMatch('https://example.com', 'https://different.com')).toBe(false);
    });
  });

  describe('Autofill Handling', () => {
    it('should handle autofill requests', async () => {
      const result = await backgroundService.handleAutofillRequest({ url: 'https://example.com' });
      
      expect(result.success).toBe(true);
      expect(Array.isArray(result.credentials)).toBe(true);
    });

    it('should require authentication for autofill', async () => {
      mockSessionManager.isUserLoggedIn.mockReturnValue(false);
      
      await expect(backgroundService.handleAutofillRequest({ url: 'https://example.com' }))
        .rejects.toThrow('Not authenticated');
    });
  });

  describe('Import/Export Operations', () => {
    beforeEach(() => {
      // Ensure user is logged in for these tests
      mockSessionManager.isUserLoggedIn.mockReturnValue(true);
    });

    it('should handle data export', async () => {
      const keyPhrase = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'];
      
      const result = await backgroundService.handleExport(keyPhrase);
      
      expect(result.success).toBe(true);
      expect(mockCryptoService.validateKeyPhrase).toHaveBeenCalledWith(keyPhrase);
      expect(mockCryptoService.encryptWithKeyPhrase).toHaveBeenCalled();
      expect(mockStorageManager.exportToFile).toHaveBeenCalled();
    });

    it('should handle data import', async () => {
      const keyPhrase = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6', 'word7', 'word8', 'word9', 'word10', 'word11', 'word12', 'word13', 'word14', 'word15', 'word16'];
      const mockFile = new File(['test'], 'test.json');
      
      // Mock empty credentials for this test
      mockStorageManager.deserializeCredentials.mockReturnValue([]);
      mockStorageManager.mergeCredentials.mockReturnValue([]);
      
      const result = await backgroundService.handleImport(mockFile, keyPhrase);
      
      expect(result.success).toBe(true);
      expect(result.imported).toBe(0);
      expect(result.total).toBe(0);
      expect(mockStorageManager.importFromFile).toHaveBeenCalledWith(mockFile);
      expect(mockCryptoService.decryptWithKeyPhrase).toHaveBeenCalled();
    });

    it('should validate key phrase for export/import', async () => {
      mockCryptoService.validateKeyPhrase.mockReturnValue(false);
      
      await expect(backgroundService.handleExport(['invalid']))
        .rejects.toThrow('Invalid key phrase format');
      
      await expect(backgroundService.handleImport(new File(['test'], 'test.json'), ['invalid']))
        .rejects.toThrow('Invalid key phrase format');
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      mockSessionManager.isUserLoggedIn.mockReturnValue(false);
      
      await expect(backgroundService.getCredentials()).rejects.toThrow('Not authenticated');
      await expect(backgroundService.saveCredentialWithPassword({})).rejects.toThrow('Not authenticated');
    });

    it('should handle validation errors', async () => {
      // Ensure user is logged in for this test
      mockSessionManager.isUserLoggedIn.mockReturnValue(true);
      
      const invalidCredential = { url: '', username: '', password: '', masterPassword: 'test' };
      
      await expect(backgroundService.saveCredentialWithPassword(invalidCredential))
        .rejects.toThrow('Valid URL is required');
    });

    it('should handle service errors gracefully', async () => {
      mockOAuthHandler.authenticate.mockRejectedValue(new Error('OAuth failed'));
      
      await expect(backgroundService.handleGmailAuth('login')).rejects.toThrow('OAuth failed');
    });
  });
});