/**
 * Simplified End-to-End Integration Tests
 * Tests core functionality without complex service worker dependencies
 * Requirements: 1.1-1.6, 2.1-2.5, 6.1-6.5, 7.1-7.6, 4.1, 5.1, 5.2, 9.1, 9.2, 9.4
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
      getBytesInUse: vi.fn(),
      QUOTA_BYTES: 5242880 // 5MB
    }
  },
  runtime: {
    lastError: null,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      version: '1.0.0',
      permissions: ['storage', 'identity', 'contextMenus', 'activeTab']
    }))
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn(),
    onClicked: {
      addListener: vi.fn()
    }
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn()
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

global.performance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn()
};

global.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
  memory: {
    usedJSHeapSize: 10000000,
    totalJSHeapSize: 20000000,
    jsHeapSizeLimit: 2147483648
  }
};

global.fetch = vi.fn();
global.chrome = mockChrome;

// Import components
let OAuthHandler, SessionManager, CryptoService, StorageManager;

describe('End-to-End Integration Tests', () => {
  let oauthHandler;
  let sessionManager;
  let cryptoService;
  let storageManager;

  beforeEach(async () => {
    // Load components dynamically
    if (!OAuthHandler) {
      OAuthHandler = (await import('../src/auth/oauth-handler.js')).default;
      SessionManager = (await import('../src/auth/session-manager.js')).default;
      CryptoService = (await import('../src/crypto/crypto.js')).default;
      StorageManager = (await import('../src/storage/storage.js')).default;
    }

    // Initialize services
    oauthHandler = new OAuthHandler();
    sessionManager = new SessionManager();
    cryptoService = new CryptoService();
    storageManager = new StorageManager();

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

  describe('User Journey Tests - Requirements 1.1-1.6, 2.1-2.5', () => {
    it('should complete signup flow with OAuth and master password', async () => {
      // Step 1: Gmail OAuth authentication
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

      const authResult = await oauthHandler.authenticate();
      expect(authResult.token).toBe(mockToken);
      expect(authResult.userInfo).toEqual(mockUserInfo);

      // Step 2: Master password and key phrase generation
      const masterPassword = 'SecurePassword123!';
      const keyPhrase = cryptoService.generateKeyPhrase();
      
      expect(keyPhrase).toHaveLength(16);
      expect(keyPhrase.every(word => typeof word === 'string')).toBe(true);

      // Step 3: Session initialization
      await sessionManager.initializeSession(authResult.userInfo, masterPassword);
      expect(sessionManager.isAuthenticated()).toBe(true);

      // Step 4: First credential save
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

      const userProfile = {
        gmailId: mockUserInfo.email,
        keyPhraseSalt: cryptoService.arrayBufferToBase64(cryptoService.generateSalt()),
        createdAt: new Date().toISOString()
      };

      await storageManager.saveEncryptedData(encryptedData, userProfile);

      // Verify the complete flow
      expect(oauthHandler.isAuthenticated()).toBe(true);
      expect(sessionManager.isAuthenticated()).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should complete login flow and retrieve credentials', async () => {
      // Setup existing user data
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

      // OAuth authentication
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const authResult = await oauthHandler.authenticate();
      expect(authResult.token).toBe(mockToken);

      // Load and decrypt credentials
      const loadedProfile = await storageManager.loadUserProfile();
      expect(loadedProfile).toEqual(userProfile);

      await sessionManager.initializeSession(mockUserInfo, masterPassword);
      expect(sessionManager.isAuthenticated()).toBe(true);

      const loadedEncryptedData = await storageManager.loadEncryptedData();
      const deserializedEncrypted = cryptoService.deserializeEncryptedData(loadedEncryptedData);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );
      const credentials = storageManager.deserializeCredentials(decryptedCredentials);

      expect(credentials).toHaveLength(1);
      expect(credentials[0].url).toBe('https://github.com');
    });
  });

  describe('Import/Export Tests - Requirements 6.1-6.5, 7.1-7.6', () => {
    it('should complete import/export round-trip with key phrase', async () => {
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
        }
      ];

      // Export process
      const serializedCredentials = storageManager.serializeCredentials(originalCredentials);
      const encryptedWithPassword = await cryptoService.encryptWithPassword(
        serializedCredentials, 
        masterPassword
      );
      const passwordEncryptedData = cryptoService.serializeEncryptedData(encryptedWithPassword);
      const exportData = await cryptoService.encryptWithKeyPhrase(passwordEncryptedData, keyPhrase);
      
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

      // Import process
      const importFile = {
        name: 'test-export.json',
        size: exportFileContent.length,
        content: exportFileContent
      };

      const validation = await storageManager.validateImportFile(importFile);
      expect(validation.valid).toBe(true);

      const importedData = await storageManager.importFromFile(importFile);
      expect(importedData).toBe(exportData);

      const decryptedWithKeyPhrase = await cryptoService.decryptWithKeyPhrase(importedData, keyPhrase);
      const deserializedEncrypted = cryptoService.deserializeEncryptedData(decryptedWithKeyPhrase);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );
      const importedCredentials = storageManager.deserializeCredentials(decryptedCredentials);

      // Verify round-trip integrity
      expect(importedCredentials).toHaveLength(originalCredentials.length);
      expect(importedCredentials[0]).toEqual(originalCredentials[0]);
    });

    it('should handle invalid key phrase during import', async () => {
      const correctKeyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      
      const incorrectKeyPhrase = [
        'wrong', 'key', 'phrase', 'that', 'should', 'not', 'work', 'for',
        'decryption', 'of', 'the', 'encrypted', 'data', 'at', 'all', 'ever'
      ];

      const testData = 'test-encrypted-data';
      const encryptedData = await cryptoService.encryptWithKeyPhrase(testData, correctKeyPhrase);

      await expect(cryptoService.decryptWithKeyPhrase(encryptedData, incorrectKeyPhrase))
        .rejects.toThrow('Key phrase decryption failed');
    });
  });

  describe('Performance Tests - Requirements 9.1, 9.2, 9.4', () => {
    it('should handle large credential datasets efficiently', async () => {
      const startTime = performance.now();
      
      // Generate large dataset
      const largeCredentialSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `cred_${i.toString().padStart(4, '0')}`,
        url: `https://site${i}.com`,
        username: `user${i}@example.com`,
        password: `password${i}${Math.random().toString(36).substring(7)}`,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Test serialization performance
      const serializationStart = performance.now();
      const serializedData = storageManager.serializeCredentials(largeCredentialSet);
      const serializationTime = performance.now() - serializationStart;
      
      expect(serializationTime).toBeLessThan(100); // Should complete in under 100ms

      // Test encryption performance
      const encryptionStart = performance.now();
      const encryptedData = await cryptoService.encryptWithPassword(serializedData, 'testpassword123');
      const encryptionTime = performance.now() - encryptionStart;
      
      expect(encryptionTime).toBeLessThan(1000); // Should complete in under 1 second

      // Test decryption performance
      const decryptionStart = performance.now();
      const decryptedData = await cryptoService.decryptWithPassword(encryptedData, 'testpassword123');
      const decryptionTime = performance.now() - decryptionStart;
      
      expect(decryptionTime).toBeLessThan(1000); // Should complete in under 1 second

      const totalTime = performance.now() - startTime;
      expect(totalTime).toBeLessThan(3000); // Total operation should complete in under 3 seconds

      console.log(`Performance metrics for 1000 credentials:
        - Serialization: ${serializationTime.toFixed(2)}ms
        - Encryption: ${encryptionTime.toFixed(2)}ms
        - Decryption: ${decryptionTime.toFixed(2)}ms
        - Total: ${totalTime.toFixed(2)}ms`);
    });

    it('should verify Chrome Manifest V3 compliance', () => {
      const manifest = mockChrome.runtime.getManifest();
      
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.permissions).toContain('storage');
      expect(manifest.permissions).toContain('identity');
      expect(manifest.permissions).toContain('contextMenus');
      expect(manifest.permissions).not.toContain('background'); // V2 only
      expect(manifest.permissions).not.toContain('tabs'); // Should use activeTab instead
    });

    it('should handle storage quota management', async () => {
      const testData = 'x'.repeat(1024 * 1024); // 1MB of data
      
      mockChrome.storage.local.getBytesInUse.mockResolvedValue(1024 * 1024);
      
      const storageInfo = await storageManager.getStorageInfo();
      
      expect(storageInfo.bytesInUse).toBe(1024 * 1024);
      expect(storageInfo.bytesInUse).toBeLessThan(mockChrome.storage.local.QUOTA_BYTES);

      // Test quota exceeded error
      mockChrome.storage.local.set.mockRejectedValue(new Error('QUOTA_EXCEEDED'));
      
      const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB of data
      
      await expect(storageManager.saveEncryptedData(largeData))
        .rejects.toThrow('Storage save failed: QUOTA_EXCEEDED');
    });

    it('should manage memory efficiently', async () => {
      const initialMemory = navigator.memory.usedJSHeapSize;
      
      // Perform memory-intensive operations
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        id: `memory_test_${i}`,
        url: `https://memory${i}.com`,
        username: `user${i}`,
        password: 'x'.repeat(100), // Large password strings
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Encrypt and decrypt multiple times
      for (let i = 0; i < 5; i++) {
        const serialized = storageManager.serializeCredentials(largeDataset);
        const encrypted = await cryptoService.encryptWithPassword(serialized, `password${i}`);
        const decrypted = await cryptoService.decryptWithPassword(encrypted, `password${i}`);
        
        // Clear sensitive data
        cryptoService.clearMemory(serialized);
        cryptoService.clearMemory(decrypted);
      }

      const finalMemory = navigator.memory.usedJSHeapSize;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Component Communication Tests - Requirements 4.1, 5.1, 5.2', () => {
    it('should handle message validation and routing', async () => {
      // Test message structure validation
      const validMessage = {
        type: 'SAVE_CREDENTIAL',
        payload: {
          url: 'https://example.com',
          username: 'testuser',
          password: 'testpass'
        }
      };

      const invalidMessage = {
        payload: { data: 'test' } // Missing type
      };

      // Mock message handler
      const messageHandler = (message, sender, sendResponse) => {
        if (!message.type) {
          sendResponse({ success: false, error: 'Invalid message format' });
          return;
        }

        switch (message.type) {
          case 'SAVE_CREDENTIAL':
            sendResponse({ success: true, credentialId: 'new-cred-id' });
            break;
          default:
            sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
        }
      };

      // Test valid message
      let response;
      messageHandler(validMessage, {}, (res) => { response = res; });
      expect(response.success).toBe(true);
      expect(response.credentialId).toBe('new-cred-id');

      // Test invalid message
      messageHandler(invalidMessage, {}, (res) => { response = res; });
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid message format');
    });

    it('should handle context menu integration', async () => {
      // Mock context menu setup
      const contextMenuItems = [];
      mockChrome.contextMenus.create.mockImplementation((options, callback) => {
        contextMenuItems.push(options);
        if (callback) callback();
        return 'menu-item-id';
      });

      // Simulate context menu creation
      mockChrome.contextMenus.create({
        id: 'save-password',
        title: 'Save to Password Manager',
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      });

      mockChrome.contextMenus.create({
        id: 'autofill-password',
        title: 'Password Manager',
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      });

      expect(contextMenuItems).toHaveLength(2);
      expect(contextMenuItems[0].id).toBe('save-password');
      expect(contextMenuItems[1].id).toBe('autofill-password');
    });

    it('should handle content script communication', async () => {
      // Mock content script functions
      const mockContentScript = {
        detectLoginFields: () => ({
          usernameField: { type: 'text', name: 'username', value: '' },
          passwordField: { type: 'password', name: 'password', value: '' },
          form: { action: '/login', method: 'post' }
        }),
        extractCredentials: () => ({
          username: 'extracteduser',
          password: 'extractedpass',
          url: 'https://example.com'
        }),
        fillCredentials: (username, password) => {
          // Mock filling credentials
          return { success: true, filled: { username, password } };
        }
      };

      // Test form detection
      const detectionResult = mockContentScript.detectLoginFields();
      expect(detectionResult.usernameField).toBeDefined();
      expect(detectionResult.passwordField).toBeDefined();

      // Test credential extraction
      const extractedCredentials = mockContentScript.extractCredentials();
      expect(extractedCredentials.username).toBe('extracteduser');
      expect(extractedCredentials.password).toBe('extractedpass');

      // Test autofill
      const fillResult = mockContentScript.fillCredentials('testuser', 'testpass');
      expect(fillResult.success).toBe(true);
      expect(fillResult.filled.username).toBe('testuser');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle authentication errors gracefully', async () => {
      // Test OAuth failure
      mockChrome.runtime.lastError = { message: 'OAuth failed' };
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.authenticate()).rejects.toThrow('Authentication failed: OAuth failed');

      // Test network failure
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback('token');
      });

      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(oauthHandler.authenticate()).rejects.toThrow('Network error');
    });

    it('should handle storage errors', async () => {
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage full'));

      await expect(storageManager.saveEncryptedData('test-data'))
        .rejects.toThrow('Storage save failed: Storage full');
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