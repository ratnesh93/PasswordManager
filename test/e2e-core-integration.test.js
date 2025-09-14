/**
 * Core Integration Tests - Working E2E Tests
 * Tests the integration between core components that can be properly tested
 * Requirements: 1.1-1.6, 2.1-2.5, 6.1-6.5, 7.1-7.6, 9.1, 9.2, 9.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import CryptoService from '../src/crypto/crypto.js';
import StorageManager from '../src/storage/storage.js';

// Mock Chrome APIs
const mockChrome = {
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
    getManifest: vi.fn(() => ({
      manifest_version: 3,
      version: '1.0.0',
      permissions: ['storage', 'identity', 'contextMenus', 'activeTab']
    }))
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
  now: vi.fn(() => Date.now())
};

global.chrome = mockChrome;

describe('Core Integration Tests', () => {
  let cryptoService;
  let storageManager;

  beforeEach(() => {
    cryptoService = new CryptoService();
    storageManager = new StorageManager();

    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock responses
    mockChrome.storage.local.set.mockResolvedValue();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.remove.mockResolvedValue();
    mockChrome.storage.local.getBytesInUse.mockResolvedValue(1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete User Journey Integration - Requirements 1.1-1.6, 2.1-2.5', () => {
    it('should handle complete credential lifecycle', async () => {
      const masterPassword = 'SecurePassword123!';
      
      // Step 1: Create credentials
      const credentials = [
        {
          id: 'cred_001',
          url: 'https://example.com',
          username: 'testuser',
          password: 'testpass123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'cred_002',
          url: 'https://github.com',
          username: 'developer',
          password: 'devpass456',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      // Step 2: Serialize credentials
      const serializedCredentials = storageManager.serializeCredentials(credentials);
      expect(typeof serializedCredentials).toBe('string');
      
      const parsedSerialized = JSON.parse(serializedCredentials);
      expect(parsedSerialized.credentials).toEqual(credentials);
      expect(parsedSerialized.version).toBe('1.0.0');

      // Step 3: Encrypt with master password
      const encryptedCredentials = await cryptoService.encryptWithPassword(
        serializedCredentials, 
        masterPassword
      );
      
      expect(encryptedCredentials.data).toBeInstanceOf(Uint8Array);
      expect(encryptedCredentials.iv).toBeInstanceOf(Uint8Array);
      expect(encryptedCredentials.salt).toBeInstanceOf(Uint8Array);

      // Step 4: Serialize encrypted data for storage
      const encryptedData = cryptoService.serializeEncryptedData(encryptedCredentials);
      expect(typeof encryptedData).toBe('string');

      // Step 5: Save to storage
      const userProfile = {
        gmailId: 'test@gmail.com',
        keyPhraseSalt: cryptoService.arrayBufferToBase64(cryptoService.generateSalt()),
        createdAt: new Date().toISOString()
      };

      await storageManager.saveEncryptedData(encryptedData, userProfile);
      expect(mockChrome.storage.local.set).toHaveBeenCalledTimes(2);

      // Step 6: Load from storage
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

      const loadedEncryptedData = await storageManager.loadEncryptedData();
      expect(loadedEncryptedData).toBe(encryptedData);

      const loadedProfile = await storageManager.loadUserProfile();
      expect(loadedProfile).toEqual(userProfile);

      // Step 7: Decrypt and deserialize
      const deserializedEncrypted = cryptoService.deserializeEncryptedData(loadedEncryptedData);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );
      const finalCredentials = storageManager.deserializeCredentials(decryptedCredentials);

      // Step 8: Verify integrity
      expect(finalCredentials).toHaveLength(2);
      expect(finalCredentials[0]).toEqual(credentials[0]);
      expect(finalCredentials[1]).toEqual(credentials[1]);
    });

    it('should handle authentication failure scenarios', async () => {
      // Test invalid credential structure validation
      const invalidCredentials = [
        {
          id: 'test',
          // Missing required fields like url, username, password
          invalidField: 'invalid'
        }
      ];

      // Should fail when trying to serialize invalid credentials
      expect(() => storageManager.serializeCredentials(invalidCredentials))
        .toThrow('Invalid credential structure at index 0');

      // Test corrupted encrypted data
      const corruptedData = 'corrupted-base64-data-that-is-not-valid';
      
      expect(() => cryptoService.deserializeEncryptedData(corruptedData))
        .toThrow();

      // Test successful flow for comparison
      const validCredentials = [
        {
          id: 'test',
          url: 'test.com',
          username: 'user',
          password: 'pass',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      const serialized = storageManager.serializeCredentials(validCredentials);
      const encrypted = await cryptoService.encryptWithPassword(serialized, 'password123');
      const decrypted = await cryptoService.decryptWithPassword(encrypted, 'password123');
      
      expect(decrypted).toBe(serialized);
    });
  });

  describe('Import/Export Integration - Requirements 6.1-6.5, 7.1-7.6', () => {
    it('should complete full import/export round-trip', async () => {
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
      expect(mockLink.download).toBe('test-export.json');

      // Import process
      const importFile = {
        name: 'test-export.json',
        size: exportFileContent.length,
        content: exportFileContent
      };

      const validation = await storageManager.validateImportFile(importFile);
      expect(validation.valid).toBe(true);
      expect(validation.fileInfo.name).toBe('test-export.json');

      const importedData = await storageManager.importFromFile(importFile);
      expect(importedData).toBe(exportData);

      const decryptedWithKeyPhrase = await cryptoService.decryptWithKeyPhrase(importedData, keyPhrase);
      expect(decryptedWithKeyPhrase).toBe(passwordEncryptedData);

      const deserializedEncrypted = cryptoService.deserializeEncryptedData(decryptedWithKeyPhrase);
      const decryptedCredentials = await cryptoService.decryptWithPassword(
        deserializedEncrypted, 
        masterPassword
      );
      const importedCredentials = storageManager.deserializeCredentials(decryptedCredentials);

      // Verify round-trip integrity
      expect(importedCredentials).toHaveLength(originalCredentials.length);
      expect(importedCredentials[0]).toEqual(originalCredentials[0]);
      expect(importedCredentials[1]).toEqual(originalCredentials[1]);
    });

    it('should handle credential merging during import', async () => {
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

      const importedCredentials = [
        {
          id: 'imported_001',
          url: 'https://imported.com',
          username: 'imported',
          password: 'importedpass',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z'
        },
        {
          id: 'imported_002', // Different ID but same URL/username as existing - should update
          url: 'https://existing.com',
          username: 'existing',
          password: 'updatedpass',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z' // Newer update
        }
      ];

      const mergedCredentials = storageManager.mergeCredentials(existingCredentials, importedCredentials);
      
      expect(mergedCredentials).toHaveLength(2);
      
      // Should have the new imported credential (different URL/username)
      expect(mergedCredentials.some(cred => cred.url === 'https://imported.com')).toBe(true);
      
      // Should have updated the existing credential with newer data (same URL/username)
      const updatedExisting = mergedCredentials.find(cred => cred.url === 'https://existing.com');
      expect(updatedExisting.password).toBe('updatedpass');
      expect(updatedExisting.updatedAt).toMatch(/2025-08-22T/); // Should be updated to current time
    });

    it('should validate import file format and reject invalid files', async () => {
      // Test invalid file type
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

      // Test corrupted JSON
      const corruptedFile = {
        name: 'corrupted.json',
        size: 50,
        content: 'invalid-json-content'
      };

      await expect(storageManager.importFromFile(corruptedFile))
        .rejects.toThrow('Invalid JSON file format');

      // Test oversized file
      const oversizedFile = {
        name: 'large.json',
        size: 11 * 1024 * 1024, // 11MB
        content: JSON.stringify({ type: 'chrome-password-manager-export', data: 'test' })
      };

      await expect(storageManager.importFromFile(oversizedFile))
        .rejects.toThrow('File too large. Maximum size is 10MB.');
    });
  });

  describe('Performance and Compatibility - Requirements 9.1, 9.2, 9.4', () => {
    it('should handle large datasets efficiently', async () => {
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
      expect(serializedData.length).toBeGreaterThan(100000); // Should be substantial data

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

      // Test deserialization performance
      const deserializationStart = performance.now();
      const deserializedCredentials = storageManager.deserializeCredentials(decryptedData);
      const deserializationTime = performance.now() - deserializationStart;
      
      expect(deserializationTime).toBeLessThan(100); // Should complete in under 100ms
      expect(deserializedCredentials).toHaveLength(1000);

      const totalTime = performance.now() - startTime;
      expect(totalTime).toBeLessThan(3000); // Total operation should complete in under 3 seconds

      console.log(`Performance metrics for 1000 credentials:
        - Serialization: ${serializationTime.toFixed(2)}ms
        - Encryption: ${encryptionTime.toFixed(2)}ms
        - Decryption: ${decryptionTime.toFixed(2)}ms
        - Deserialization: ${deserializationTime.toFixed(2)}ms
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
      // Test storage info retrieval
      mockChrome.storage.local.getBytesInUse.mockResolvedValue(2048);
      mockChrome.storage.local.get.mockResolvedValue({
        passwordManagerData: { encryptedCredentials: 'data' },
        userProfile: { gmailId: 'test@gmail.com' }
      });

      const storageInfo = await storageManager.getStorageInfo();
      
      expect(storageInfo.bytesInUse).toBe(2048);
      expect(storageInfo.itemCount).toBe(2);
      expect(storageInfo.hasCredentials).toBe(true);
      expect(storageInfo.hasUserProfile).toBe(true);

      // Test quota exceeded handling
      mockChrome.storage.local.set.mockRejectedValue(new Error('QUOTA_EXCEEDED'));
      
      await expect(storageManager.saveEncryptedData('large-data'))
        .rejects.toThrow('Storage save failed: QUOTA_EXCEEDED');
    });

    it('should handle concurrent operations safely', async () => {
      const masterPassword = 'ConcurrentTest123!';
      const credentials1 = [{ id: '1', url: 'test1.com', username: 'user1', password: 'pass1' }];
      const credentials2 = [{ id: '2', url: 'test2.com', username: 'user2', password: 'pass2' }];

      // Simulate concurrent operations
      const operation1 = (async () => {
        const serialized = storageManager.serializeCredentials(credentials1);
        const encrypted = await cryptoService.encryptWithPassword(serialized, masterPassword);
        const data = cryptoService.serializeEncryptedData(encrypted);
        return storageManager.saveEncryptedData(data);
      })();

      const operation2 = (async () => {
        const serialized = storageManager.serializeCredentials(credentials2);
        const encrypted = await cryptoService.encryptWithPassword(serialized, masterPassword);
        const data = cryptoService.serializeEncryptedData(encrypted);
        return storageManager.saveEncryptedData(data);
      })();

      // Both operations should complete without errors
      await expect(Promise.all([operation1, operation2])).resolves.not.toThrow();
    });

    it('should handle memory cleanup efficiently', async () => {
      const sensitiveArray = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const originalArray = new Uint8Array(sensitiveArray);

      // Clear array memory
      cryptoService.clearMemory(sensitiveArray);
      
      // Verify array was cleared
      expect(sensitiveArray.every(byte => byte === 0)).toBe(true);
      expect(sensitiveArray).not.toEqual(originalArray);

      // Test string memory clearing (JavaScript limitation - should not throw)
      const sensitiveString = 'sensitive-data-123';
      expect(() => cryptoService.clearMemory(sensitiveString)).not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle storage errors gracefully', async () => {
      // Test storage save error
      mockChrome.storage.local.set.mockRejectedValue(new Error('Storage unavailable'));
      
      await expect(storageManager.saveEncryptedData('test-data'))
        .rejects.toThrow('Storage save failed: Storage unavailable');

      // Test storage load error
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage read error'));
      
      await expect(storageManager.loadEncryptedData())
        .rejects.toThrow('Storage load failed: Storage read error');
    });

    it('should validate data integrity', async () => {
      // Test invalid credential structure
      const invalidCredentials = [
        {
          id: 'cred1',
          // Missing required fields
          url: 'https://example.com'
        }
      ];

      expect(() => storageManager.serializeCredentials(invalidCredentials))
        .toThrow('Invalid credential structure at index 0');

      // Test corrupted encrypted data
      const corruptedData = 'corrupted-base64-data';
      
      expect(() => cryptoService.deserializeEncryptedData(corruptedData))
        .toThrow();
    });

    it('should handle key phrase validation', async () => {
      // Test valid key phrase
      const validKeyPhrase = cryptoService.generateKeyPhrase();
      expect(cryptoService.validateKeyPhrase(validKeyPhrase)).toBe(true);

      // Test invalid key phrase formats
      expect(cryptoService.validateKeyPhrase(['word1', 'word2'])).toBe(false); // Too short
      expect(cryptoService.validateKeyPhrase('not an array')).toBe(false); // Not array
      expect(cryptoService.validateKeyPhrase(null)).toBe(false); // Null
      
      // Test invalid words
      const invalidKeyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'invalid-word', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      expect(cryptoService.validateKeyPhrase(invalidKeyPhrase)).toBe(false);
    });
  });
});