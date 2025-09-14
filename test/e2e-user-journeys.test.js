/**
 * End-to-End Integration Tests - Complete User Journeys
 * Tests full signup flow, login flow, and import/export round-trip
 * Requirements: 1.1-1.6, 2.1-2.5, 6.1-6.5, 7.1-7.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn()
  },
  storage: {
    local: {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      getBytesInUse: vi.fn()
    }
  },
  runtime: {
    lastError: null,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

// Mock DOM APIs
global.document = {
  createElement: vi.fn(),
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  }
};

global.URL = {
  createObjectURL: vi.fn(() => 'mock-blob-url'),
  revokeObjectURL: vi.fn()
};

global.Blob = class MockBlob {
  constructor(content, options) {
    this.content = content;
    this.options = options;
  }
};

global.FileReader = class MockFileReader {
  readAsText(file) {
    setTimeout(() => {
      if (file.shouldFail) {
        this.onerror();
      } else {
        this.result = file.content || JSON.stringify({
          type: 'chrome-password-manager-export',
          version: '1.0.0',
          data: 'dGVzdC1kYXRh'
        });
        this.onload({ target: { result: this.result } });
      }
    }, 0);
  }
};

global.fetch = vi.fn();
global.chrome = mockChrome;

// Import components - will be loaded dynamically in tests
let OAuthHandler, SessionManager, CryptoService, StorageManager, BackgroundService;

describe('End-to-End User Journeys', () => {
  let oauthHandler;
  let sessionManager;
  let cryptoService;
  let storageManager;
  let backgroundService;

  beforeEach(async () => {
    // Load components dynamically
    if (!OAuthHandler) {
      OAuthHandler = (await import('../src/auth/oauth-handler.js')).default;
      SessionManager = (await import('../src/auth/session-manager.js')).default;
      CryptoService = (await import('../src/crypto/crypto.js')).default;
      StorageManager = (await import('../src/storage/storage.js')).default;
      BackgroundService = (await import('../src/background/background.js')).default;
    }

    // Initialize all services
    oauthHandler = new OAuthHandler();
    sessionManager = new SessionManager();
    cryptoService = new CryptoService();
    storageManager = new StorageManager();
    backgroundService = new BackgroundService();

    // Reset all mocks
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Setup default mock responses
    mockChrome.storage.local.set.mockResolvedValue();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.remove.mockResolvedValue();
    mockChrome.storage.local.getBytesInUse.mockResolvedValue(1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Signup Flow - Requirements 1.1-1.6', () => {
    it('should complete full signup from Gmail OAuth to first credential save', async () => {
      // Step 1: Gmail OAuth authentication (Requirement 1.2)
      const mockToken = 'mock_oauth_token_12345';
      const mockUserInfo = {
        id: '123456789',
        email: 'testuser@gmail.com',
        name: 'Test User'
      };

      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      // Authenticate user
      const authResult = await oauthHandler.authenticate();
      expect(authResult.token).toBe(mockToken);
      expect(authResult.userInfo).toEqual(mockUserInfo);

      // Step 2: Master password creation (Requirement 1.3)
      const masterPassword = 'SecurePassword123!';
      
      // Step 3: Key phrase generation (Requirement 1.5)
      const keyPhrase = cryptoService.generateKeyPhrase();
      expect(keyPhrase).toHaveLength(16);
      expect(keyPhrase.every(word => typeof word === 'string')).toBe(true);

      // Step 4: Session initialization
      await sessionManager.initializeSession(authResult.userInfo, masterPassword);
      expect(sessionManager.isAuthenticated()).toBe(true);

      // Step 5: User profile creation and storage
      const userProfile = {
        gmailId: mockUserInfo.email,
        keyPhraseSalt: cryptoService.arrayBufferToBase64(cryptoService.generateSalt()),
        createdAt: new Date().toISOString()
      };

      await storageManager.saveEncryptedData('', userProfile);
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);

      // Step 6: First credential save (Requirement 3.2, 3.3)
      const testCredential = {
        id: 'cred_001',
        url: 'https://example.com',
        username: 'testuser',
        password: 'testpass123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const credentials = [testCredential];
      const serializedCredentials = storageManager.serializeCredentials(credentials);
      const encryptedCredentials = await cryptoService.encryptWithPassword(
        serializedCredentials, 
        masterPassword
      );
      const encryptedData = cryptoService.serializeEncryptedData(encryptedCredentials);

      await storageManager.saveEncryptedData(encryptedData, userProfile);

      // Verify the complete signup flow
      expect(oauthHandler.isAuthenticated()).toBe(true);
      expect(sessionManager.isAuthenticated()).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();

      // Step 7: Verify key phrase confirmation (Requirement 1.6)
      const keyPhraseConfirmed = cryptoService.validateKeyPhrase(keyPhrase);
      expect(keyPhraseConfirmed).toBe(true);
    });

    it('should handle signup errors gracefully', async () => {
      // Test OAuth failure
      mockChrome.runtime.lastError = { message: 'OAuth failed' };
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.authenticate()).rejects.toThrow('Authentication failed: OAuth failed');

      // Test invalid master password
      const weakPassword = '123';
      await expect(sessionManager.initializeSession({ email: 'test@gmail.com' }, weakPassword))
        .rejects.toThrow();
    });
  });

  describe('Complete Login Flow - Requirements 2.1-2.5', () => {
    it('should complete full login and credential retrieval flow', async () => {
      // Setup: Create existing user data
      const mockToken = 'existing_user_token';
      const mockUserInfo = {
        id: '987654321',
        email: 'existinguser@gmail.com',
        name: 'Existing User'
      };
      const masterPassword = 'ExistingPassword123!';

      // Create test credentials
      const existingCredentials = [
        {
          id: 'cred_001',
          url: 'https://github.com',
          username: 'developer',
          password: 'devpass123',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'cred_002',
          url: 'https://stackoverflow.com',
          username: 'coder',
          password: 'codepass456',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        }
      ];

      // Encrypt and store credentials
      const serializedCredentials = storageManager.serializeCredentials(existingCredentials);
      const encryptedCredentials = await cryptoService.encryptWithPassword(
        serializedCredentials, 
        masterPassword
      );
      const encryptedData = cryptoService.serializeEncryptedData(encryptedCredentials);

      const userProfile = {
        gmailId: mockUserInfo.email,
        keyPhraseSalt: 'mock-salt',
        createdAt: '2024-01-01T00:00:00Z'
      };

      // Mock storage responses
      mockChrome.storage.local.get.mockImplementation((keys) => {
        if (keys.includes('passwordManagerData')) {
          return Promise.resolve({
            passwordManagerData: {
              encryptedCredentials: encryptedData,
              version: '1.0.0',
              lastUpdated: new Date().toISOString()
            }
          });
        }
        if (keys.includes('userProfile')) {
          return Promise.resolve({ userProfile });
        }
        return Promise.resolve({});
      });

      // Step 1: Gmail OAuth authentication (Requirement 2.2)
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const authResult = await oauthHandler.authenticate();
      expect(authResult.token).toBe(mockToken);

      // Step 2: Load user profile
      const loadedProfile = await storageManager.loadUserProfile();
      expect(loadedProfile).toEqual(userProfile);

      // Step 3: Master password verification (Requirement 2.3)
      await sessionManager.initializeSession(mockUserInfo, masterPassword);
      expect(sessionManager.isAuthenticated()).toBe(true);

      // Step 4: Decrypt and load credentials (Requirement 2.4)
      const loadedEncryptedData = await storageManager.loadEncryptedData();
      expect(loadedEncryptedData).toBe(encryptedData);

      const deserializedEncrypted = cryptoService.deserializeEncryptedData(loadedEncryptedData);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );
      const credentials = storageManager.deserializeCredentials(decryptedCredentials);

      expect(credentials).toHaveLength(2);
      expect(credentials[0].url).toBe('https://github.com');
      expect(credentials[1].url).toBe('https://stackoverflow.com');

      // Step 5: Verify session state
      expect(sessionManager.isAuthenticated()).toBe(true);
      expect(sessionManager.getCurrentUser()).toEqual(mockUserInfo);
    });

    it('should handle incorrect master password (Requirement 2.5)', async () => {
      const mockToken = 'test_token';
      const mockUserInfo = {
        id: '123',
        email: 'test@gmail.com',
        name: 'Test User'
      };
      const correctPassword = 'CorrectPassword123!';
      const incorrectPassword = 'WrongPassword456!';

      // Setup encrypted data with correct password
      const testCredentials = [{ id: 'test', url: 'test.com', username: 'user', password: 'pass' }];
      const serialized = storageManager.serializeCredentials(testCredentials);
      const encrypted = await cryptoService.encryptWithPassword(serialized, correctPassword);
      const encryptedData = cryptoService.serializeEncryptedData(encrypted);

      mockChrome.storage.local.get.mockResolvedValue({
        passwordManagerData: {
          encryptedCredentials: encryptedData,
          version: '1.0.0'
        }
      });

      // Authenticate with OAuth
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      await oauthHandler.authenticate();

      // Try to decrypt with wrong password
      const loadedData = await storageManager.loadEncryptedData();
      const deserializedEncrypted = cryptoService.deserializeEncryptedData(loadedData);
      
      await expect(cryptoService.decryptWithPassword(deserializedEncrypted, incorrectPassword))
        .rejects.toThrow('Password decryption failed');
    });
  });

  describe('Import/Export Round-trip - Requirements 6.1-6.5, 7.1-7.6', () => {
    it('should complete full import/export round-trip with key phrase validation', async () => {
      // Setup: Create test data
      const masterPassword = 'TestPassword123!';
      const keyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];

      const originalCredentials = [
        {
          id: 'export_001',
          url: 'https://export-test.com',
          username: 'exportuser',
          password: 'exportpass123',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'export_002',
          url: 'https://another-site.com',
          username: 'anotheruser',
          password: 'anotherpass456',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        }
      ];

      // Step 1: Export process (Requirements 6.1-6.5)
      
      // Serialize credentials
      const serializedCredentials = storageManager.serializeCredentials(originalCredentials);
      
      // Encrypt with master password
      const encryptedWithPassword = await cryptoService.encryptWithPassword(
        serializedCredentials, 
        masterPassword
      );
      const passwordEncryptedData = cryptoService.serializeEncryptedData(encryptedWithPassword);

      // Encrypt with key phrase for export (Requirement 6.2)
      const exportData = await cryptoService.encryptWithKeyPhrase(passwordEncryptedData, keyPhrase);
      
      // Create export file (Requirement 6.3)
      const exportFileContent = JSON.stringify({
        type: 'chrome-password-manager-export',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: exportData
      });

      // Mock file download
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn()
      };
      global.document.createElement.mockReturnValue(mockLink);

      await storageManager.exportToFile(exportFileContent, 'test-export.json');
      expect(mockLink.click).toHaveBeenCalled();

      // Step 2: Import process (Requirements 7.1-7.6)
      
      // Create mock import file
      const importFile = {
        name: 'test-export.json',
        size: exportFileContent.length,
        content: exportFileContent
      };

      // Validate import file (Requirement 7.2)
      const validation = await storageManager.validateImportFile(importFile);
      expect(validation.valid).toBe(true);

      // Import file (Requirement 7.3)
      const importedData = await storageManager.importFromFile(importFile);
      expect(importedData).toBe(exportData);

      // Decrypt with key phrase (Requirement 7.3)
      const decryptedWithKeyPhrase = await cryptoService.decryptWithKeyPhrase(importedData, keyPhrase);
      expect(decryptedWithKeyPhrase).toBe(passwordEncryptedData);

      // Decrypt with master password
      const deserializedEncrypted = cryptoService.deserializeEncryptedData(decryptedWithKeyPhrase);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );

      // Deserialize credentials
      const importedCredentials = storageManager.deserializeCredentials(decryptedCredentials);

      // Step 3: Verify round-trip integrity
      expect(importedCredentials).toHaveLength(originalCredentials.length);
      expect(importedCredentials[0]).toEqual(originalCredentials[0]);
      expect(importedCredentials[1]).toEqual(originalCredentials[1]);

      // Step 4: Test credential merging (Requirement 7.4)
      const existingCredentials = [
        {
          id: 'existing_001',
          url: 'https://existing.com',
          username: 'existing',
          password: 'existingpass',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      const mergedCredentials = storageManager.mergeCredentials(existingCredentials, importedCredentials);
      expect(mergedCredentials).toHaveLength(3); // 1 existing + 2 imported

      // Step 5: Verify import success confirmation (Requirement 7.5)
      expect(mergedCredentials.some(cred => cred.id === 'existing_001')).toBe(true);
      expect(mergedCredentials.some(cred => cred.id === 'export_001')).toBe(true);
      expect(mergedCredentials.some(cred => cred.id === 'export_002')).toBe(true);
    });

    it('should handle invalid key phrase during import (Requirement 7.6)', async () => {
      const correctKeyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      
      const incorrectKeyPhrase = [
        'wrong', 'key', 'phrase', 'that', 'should', 'not', 'work', 'for',
        'decryption', 'of', 'the', 'encrypted', 'data', 'at', 'all', 'ever'
      ];

      // Create encrypted export data
      const testData = 'test-encrypted-data';
      const encryptedData = await cryptoService.encryptWithKeyPhrase(testData, correctKeyPhrase);

      // Try to decrypt with wrong key phrase
      await expect(cryptoService.decryptWithKeyPhrase(encryptedData, incorrectKeyPhrase))
        .rejects.toThrow('Key phrase decryption failed');
    });

    it('should handle corrupted export files (Requirement 7.6)', async () => {
      const corruptedFile = {
        name: 'corrupted-export.json',
        size: 100,
        content: 'corrupted-json-data-not-valid'
      };

      await expect(storageManager.importFromFile(corruptedFile))
        .rejects.toThrow('Invalid JSON file format');
    });

    it('should validate export file type and structure', async () => {
      // Test wrong file type
      const wrongTypeFile = {
        name: 'export.json',
        size: 100,
        content: JSON.stringify({
          type: 'other-export-type',
          version: '1.0.0',
          data: 'test-data'
        })
      };

      await expect(storageManager.importFromFile(wrongTypeFile))
        .rejects.toThrow('Invalid export file. This file was not created by Chrome Password Manager.');

      // Test missing required fields
      const incompleteFile = {
        name: 'incomplete.json',
        size: 50,
        content: JSON.stringify({
          type: 'chrome-password-manager-export'
          // Missing version and data
        })
      };

      await expect(storageManager.importFromFile(incompleteFile))
        .rejects.toThrow();
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle session timeout during operations', async () => {
      // Setup authenticated session
      const mockUserInfo = { id: '123', email: 'test@gmail.com' };
      await sessionManager.initializeSession(mockUserInfo, 'password123');
      
      // Simulate session timeout
      sessionManager.sessionExpiry = Date.now() - 1000; // Expired
      
      expect(sessionManager.isAuthenticated()).toBe(false);
    });

    it('should handle storage quota exceeded', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('QUOTA_EXCEEDED'));
      
      await expect(storageManager.saveEncryptedData('large-data'))
        .rejects.toThrow('Storage save failed: QUOTA_EXCEEDED');
    });

    it('should handle network failures during OAuth', async () => {
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback('token');
      });

      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(oauthHandler.authenticate())
        .rejects.toThrow('Network error');
    });

    it('should handle concurrent operations safely', async () => {
      const masterPassword = 'ConcurrentTest123!';
      const credentials1 = [{ id: '1', url: 'test1.com', username: 'user1', password: 'pass1' }];
      const credentials2 = [{ id: '2', url: 'test2.com', username: 'user2', password: 'pass2' }];

      // Simulate concurrent save operations
      const save1 = (async () => {
        const serialized = storageManager.serializeCredentials(credentials1);
        const encrypted = await cryptoService.encryptWithPassword(serialized, masterPassword);
        const data = cryptoService.serializeEncryptedData(encrypted);
        return storageManager.saveEncryptedData(data);
      })();

      const save2 = (async () => {
        const serialized = storageManager.serializeCredentials(credentials2);
        const encrypted = await cryptoService.encryptWithPassword(serialized, masterPassword);
        const data = cryptoService.serializeEncryptedData(encrypted);
        return storageManager.saveEncryptedData(data);
      })();

      // Both operations should complete without errors
      await expect(Promise.all([save1, save2])).resolves.not.toThrow();
    });
  });
});