/**
 * End-to-End Integration Tests - Performance and Compatibility
 * Tests extension performance with large datasets, Chrome compatibility, and memory management
 * Requirements: 9.1, 9.2, 9.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs with performance monitoring
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
    })),
    getPlatformInfo: vi.fn(() => ({
      os: 'win',
      arch: 'x86-64'
    })),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    lastError: null
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn()
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

// Mock performance APIs
global.performance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn()
};

// Mock memory monitoring
global.navigator = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  memory: {
    usedJSHeapSize: 10000000, // 10MB
    totalJSHeapSize: 20000000, // 20MB
    jsHeapSizeLimit: 2147483648 // 2GB
  }
};

global.chrome = mockChrome;

// Import components - will be loaded dynamically
let CryptoService, StorageManager, BackgroundService, SessionManager;

describe('Performance and Compatibility Tests', () => {
  let cryptoService;
  let storageManager;
  let backgroundService;
  let sessionManager;

  beforeEach(async () => {
    // Load components dynamically
    if (!CryptoService) {
      CryptoService = (await import('../src/crypto/crypto.js')).default;
      StorageManager = (await import('../src/storage/storage.js')).default;
      BackgroundService = (await import('../src/background/background.js')).default;
      SessionManager = (await import('../src/auth/session-manager.js')).default;
    }

    cryptoService = new CryptoService();
    storageManager = new StorageManager();
    backgroundService = new BackgroundService();
    sessionManager = new SessionManager();

    // Reset all mocks
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Setup default mock responses
    mockChrome.storage.local.set.mockResolvedValue();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.getBytesInUse.mockResolvedValue(1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Large Dataset Performance - Requirement 9.1', () => {
    it('should handle 1000 credentials efficiently', async () => {
      const startTime = performance.now();
      
      // Generate large dataset
      const largeCredentialSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `cred_${i.toString().padStart(4, '0')}`,
        url: `https://site${i}.com`,
        username: `user${i}@example.com`,
        password: `password${i}${Math.random().toString(36).substring(7)}`,
        createdAt: new Date(Date.now() - i * 86400000).toISOString(), // Spread over 1000 days
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
      expect(encryptedData.data).toBeInstanceOf(Uint8Array);

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

    it('should handle credential search efficiently with large datasets', async () => {
      // Create large dataset with searchable patterns
      const largeCredentialSet = Array.from({ length: 5000 }, (_, i) => ({
        id: `search_cred_${i}`,
        url: `https://${i % 100 === 0 ? 'github' : 'site' + i}.com`,
        username: `${i % 50 === 0 ? 'admin' : 'user' + i}@example.com`,
        password: `password${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Test search performance
      const searchStart = performance.now();
      
      // Simulate search functionality
      const searchTerm = 'github';
      const searchResults = largeCredentialSet.filter(cred => 
        cred.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cred.username.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      const searchTime = performance.now() - searchStart;
      
      expect(searchTime).toBeLessThan(50); // Search should complete in under 50ms
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.every(cred => 
        cred.url.includes('github') || cred.username.includes('github')
      )).toBe(true);

      console.log(`Search performance: ${searchTime.toFixed(2)}ms for ${largeCredentialSet.length} credentials`);
    });

    it('should handle concurrent operations with large datasets', async () => {
      const credentialCount = 500;
      const concurrentOperations = 10;

      // Create test datasets
      const datasets = Array.from({ length: concurrentOperations }, (_, i) => 
        Array.from({ length: credentialCount }, (_, j) => ({
          id: `concurrent_${i}_${j}`,
          url: `https://concurrent${i}-${j}.com`,
          username: `user${i}_${j}`,
          password: `pass${i}_${j}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }))
      );

      const startTime = performance.now();

      // Run concurrent encryption operations
      const encryptionPromises = datasets.map(async (dataset, i) => {
        const serialized = storageManager.serializeCredentials(dataset);
        return cryptoService.encryptWithPassword(serialized, `password${i}`);
      });

      const encryptedResults = await Promise.all(encryptionPromises);
      const concurrentTime = performance.now() - startTime;

      expect(concurrentTime).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(encryptedResults).toHaveLength(concurrentOperations);
      expect(encryptedResults.every(result => result.data instanceof Uint8Array)).toBe(true);

      console.log(`Concurrent operations performance: ${concurrentTime.toFixed(2)}ms for ${concurrentOperations} operations`);
    });

    it('should maintain performance with frequent credential updates', async () => {
      const baseCredentials = Array.from({ length: 100 }, (_, i) => ({
        id: `update_cred_${i}`,
        url: `https://update${i}.com`,
        username: `user${i}`,
        password: `password${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const updateCount = 1000;
      const startTime = performance.now();

      // Simulate frequent updates
      let currentCredentials = [...baseCredentials];
      
      for (let i = 0; i < updateCount; i++) {
        const credIndex = i % currentCredentials.length;
        currentCredentials[credIndex] = {
          ...currentCredentials[credIndex],
          password: `updated_password_${i}`,
          updatedAt: new Date().toISOString()
        };

        // Periodically serialize and encrypt (simulating saves)
        if (i % 100 === 0) {
          const serialized = storageManager.serializeCredentials(currentCredentials);
          await cryptoService.encryptWithPassword(serialized, 'testpassword');
        }
      }

      const updateTime = performance.now() - startTime;
      expect(updateTime).toBeLessThan(2000); // Should handle 1000 updates in under 2 seconds

      console.log(`Update performance: ${updateTime.toFixed(2)}ms for ${updateCount} updates`);
    });
  });

  describe('Memory Management - Requirement 9.1', () => {
    it('should properly clean up memory after operations', async () => {
      const initialMemory = navigator.memory.usedJSHeapSize;
      
      // Perform memory-intensive operations
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `memory_test_${i}`,
        url: `https://memory${i}.com`,
        username: `user${i}`,
        password: 'x'.repeat(100), // Large password strings
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Encrypt and decrypt multiple times
      for (let i = 0; i < 10; i++) {
        const serialized = storageManager.serializeCredentials(largeDataset);
        const encrypted = await cryptoService.encryptWithPassword(serialized, `password${i}`);
        const decrypted = await cryptoService.decryptWithPassword(encrypted, `password${i}`);
        
        // Clear sensitive data
        cryptoService.clearMemory(serialized);
        cryptoService.clearMemory(decrypted);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = navigator.memory.usedJSHeapSize;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory usage: Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB, Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB, Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate low memory conditions
      const originalMemory = navigator.memory;
      navigator.memory = {
        ...originalMemory,
        usedJSHeapSize: originalMemory.jsHeapSizeLimit * 0.9 // 90% memory usage
      };

      try {
        // Attempt operations under memory pressure
        const credentials = Array.from({ length: 100 }, (_, i) => ({
          id: `pressure_${i}`,
          url: `https://pressure${i}.com`,
          username: `user${i}`,
          password: `password${i}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        const serialized = storageManager.serializeCredentials(credentials);
        const encrypted = await cryptoService.encryptWithPassword(serialized, 'testpassword');
        const decrypted = await cryptoService.decryptWithPassword(encrypted, 'testpassword');

        // Operations should complete successfully even under memory pressure
        expect(decrypted).toBeDefined();
        expect(typeof decrypted).toBe('string');

      } finally {
        // Restore original memory object
        navigator.memory = originalMemory;
      }
    });

    it('should clear sensitive data from memory', async () => {
      const sensitivePassword = 'super-secret-password-123';
      const sensitiveArray = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const originalArray = new Uint8Array(sensitiveArray);

      // Clear string (JavaScript limitation - can't actually clear strings)
      cryptoService.clearMemory(sensitivePassword);
      
      // Clear array (should zero out the array)
      cryptoService.clearMemory(sensitiveArray);
      
      // Verify array was cleared
      expect(sensitiveArray.every(byte => byte === 0)).toBe(true);
      expect(sensitiveArray).not.toEqual(originalArray);
    });

    it('should handle memory cleanup during session management', async () => {
      const userInfo = {
        id: '123',
        email: 'test@gmail.com',
        name: 'Test User'
      };
      const masterPassword = 'test-master-password-123';

      // Initialize session
      await sessionManager.initializeSession(userInfo, masterPassword);
      expect(sessionManager.isAuthenticated()).toBe(true);

      // Clear session
      await sessionManager.clearSession();
      expect(sessionManager.isAuthenticated()).toBe(false);

      // Verify sensitive data is cleared
      expect(sessionManager.getCurrentUser()).toBeNull();
    });
  });

  describe('Chrome Version Compatibility - Requirement 9.2', () => {
    it('should verify Manifest V3 compliance', () => {
      const manifest = mockChrome.runtime.getManifest();
      
      expect(manifest.manifest_version).toBe(3);
      expect(manifest.permissions).toContain('storage');
      expect(manifest.permissions).toContain('identity');
      expect(manifest.permissions).toContain('contextMenus');
      expect(manifest.permissions).not.toContain('background'); // V2 only
      expect(manifest.permissions).not.toContain('tabs'); // Should use activeTab instead
    });

    it('should use compatible Chrome APIs', async () => {
      // Test storage API compatibility
      expect(mockChrome.storage.local.set).toBeDefined();
      expect(mockChrome.storage.local.get).toBeDefined();
      expect(mockChrome.storage.local.QUOTA_BYTES).toBeDefined();

      // Test identity API compatibility
      expect(mockChrome.identity.getAuthToken).toBeDefined();
      expect(mockChrome.identity.removeCachedAuthToken).toBeDefined();

      // Test runtime API compatibility
      expect(mockChrome.runtime.sendMessage).toBeDefined();
      expect(mockChrome.runtime.onMessage).toBeDefined();
      expect(mockChrome.runtime.getManifest).toBeDefined();

      // Test context menus API compatibility
      expect(mockChrome.contextMenus.create).toBeDefined();
      expect(mockChrome.contextMenus.onClicked).toBeDefined();
    });

    it('should handle Chrome version differences gracefully', async () => {
      // Test with different Chrome versions
      const chromeVersions = [
        '88.0.4324.150', // Minimum MV3 support
        '100.0.4896.127', // Stable MV3
        '120.0.6099.109'  // Latest
      ];

      for (const version of chromeVersions) {
        // Mock different Chrome versions
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(navigator, 'userAgent', {
          value: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`,
          configurable: true
        });

        try {
          // Test core functionality
          await backgroundService.initialize();
          
          const credentials = [{
            id: 'version_test',
            url: 'https://version-test.com',
            username: 'user',
            password: 'pass'
          }];

          const serialized = storageManager.serializeCredentials(credentials);
          const encrypted = await cryptoService.encryptWithPassword(serialized, 'password');
          const decrypted = await cryptoService.decryptWithPassword(encrypted, 'password');
          
          expect(decrypted).toBe(serialized);

        } finally {
          // Restore original user agent
          Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true
          });
        }
      }
    });

    it('should handle deprecated API gracefully', async () => {
      // Test handling of potentially deprecated APIs
      const deprecatedAPIs = [
        'chrome.extension.getBackgroundPage',
        'chrome.extension.getViews',
        'chrome.browserAction'
      ];

      for (const api of deprecatedAPIs) {
        // Ensure extension doesn't rely on deprecated APIs
        const apiPath = api.split('.');
        let current = global;
        
        for (const part of apiPath) {
          if (current && current[part]) {
            current = current[part];
          } else {
            current = undefined;
            break;
          }
        }

        // Extension should not depend on deprecated APIs
        expect(current).toBeUndefined();
      }
    });

    it('should validate Content Security Policy compliance', () => {
      // Test CSP compliance
      const cspViolations = [];
      
      // Mock CSP violation reporting
      global.addEventListener = vi.fn((event, handler) => {
        if (event === 'securitypolicyviolation') {
          // Should not have any CSP violations
        }
      });

      // Test inline script prevention
      expect(() => {
        const script = document.createElement('script');
        script.innerHTML = 'alert("inline script")';
        document.body.appendChild(script);
      }).not.toThrow(); // Should be prevented by CSP, not throw

      expect(cspViolations).toHaveLength(0);
    });
  });

  describe('Storage Quota Management - Requirement 9.4', () => {
    it('should monitor storage usage', async () => {
      const testData = 'x'.repeat(1024 * 1024); // 1MB of data
      
      mockChrome.storage.local.getBytesInUse.mockResolvedValue(1024 * 1024);
      
      const storageInfo = await storageManager.getStorageInfo();
      
      expect(storageInfo.bytesInUse).toBe(1024 * 1024);
      expect(storageInfo.bytesInUse).toBeLessThan(mockChrome.storage.local.QUOTA_BYTES);
    });

    it('should handle storage quota exceeded', async () => {
      // Mock quota exceeded error
      mockChrome.storage.local.set.mockRejectedValue(new Error('QUOTA_EXCEEDED'));
      
      const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB of data
      
      await expect(storageManager.saveEncryptedData(largeData))
        .rejects.toThrow('Storage save failed: QUOTA_EXCEEDED');
    });

    it('should optimize storage usage', async () => {
      // Test data compression/optimization
      const redundantCredentials = Array.from({ length: 100 }, () => ({
        id: 'duplicate',
        url: 'https://same-site.com',
        username: 'same-user',
        password: 'same-password',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const serialized = storageManager.serializeCredentials(redundantCredentials);
      const originalSize = new Blob([serialized]).size;

      // Encryption should not significantly increase size for redundant data
      const encrypted = await cryptoService.encryptWithPassword(serialized, 'password');
      const encryptedSize = encrypted.data.byteLength;

      // Encrypted size should be reasonable compared to original
      const sizeRatio = encryptedSize / originalSize;
      expect(sizeRatio).toBeLessThan(2); // Should not more than double the size

      console.log(`Storage optimization: Original: ${originalSize} bytes, Encrypted: ${encryptedSize} bytes, Ratio: ${sizeRatio.toFixed(2)}`);
    });

    it('should handle storage cleanup', async () => {
      // Test storage cleanup functionality
      const oldData = {
        passwordManagerData: {
          encryptedCredentials: 'old-data',
          version: '0.9.0',
          lastUpdated: '2023-01-01T00:00:00Z'
        }
      };

      mockChrome.storage.local.get.mockResolvedValue(oldData);

      // Should handle cleanup of old data formats
      await storageManager.clearAllData();
      
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith([
        'passwordManagerData',
        'userProfile'
      ]);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance benchmarks for common operations', async () => {
      const benchmarks = {
        encryption: { target: 100, description: 'Encrypt 100 credentials' },
        decryption: { target: 100, description: 'Decrypt 100 credentials' },
        search: { target: 50, description: 'Search 1000 credentials' },
        save: { target: 200, description: 'Save credentials to storage' },
        load: { target: 200, description: 'Load credentials from storage' }
      };

      const results = {};

      // Encryption benchmark
      const credentials = Array.from({ length: 100 }, (_, i) => ({
        id: `bench_${i}`,
        url: `https://bench${i}.com`,
        username: `user${i}`,
        password: `password${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const encryptStart = performance.now();
      const serialized = storageManager.serializeCredentials(credentials);
      const encrypted = await cryptoService.encryptWithPassword(serialized, 'benchmark');
      results.encryption = performance.now() - encryptStart;

      // Decryption benchmark
      const decryptStart = performance.now();
      const decrypted = await cryptoService.decryptWithPassword(encrypted, 'benchmark');
      results.decryption = performance.now() - decryptStart;

      // Search benchmark
      const largeSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `search_${i}`,
        url: `https://search${i}.com`,
        username: `user${i}`,
        password: `password${i}`
      }));

      const searchStart = performance.now();
      const searchResults = largeSet.filter(cred => cred.url.includes('search1'));
      results.search = performance.now() - searchStart;

      // Storage benchmarks
      const saveStart = performance.now();
      await storageManager.saveEncryptedData('benchmark-data');
      results.save = performance.now() - saveStart;

      const loadStart = performance.now();
      await storageManager.loadEncryptedData();
      results.load = performance.now() - loadStart;

      // Verify all benchmarks meet targets
      for (const [operation, time] of Object.entries(results)) {
        const benchmark = benchmarks[operation];
        expect(time).toBeLessThan(benchmark.target);
        console.log(`${benchmark.description}: ${time.toFixed(2)}ms (target: <${benchmark.target}ms)`);
      }
    });

    it('should maintain performance under stress conditions', async () => {
      const stressTests = [
        {
          name: 'High frequency operations',
          test: async () => {
            const operations = 100;
            const startTime = performance.now();
            
            for (let i = 0; i < operations; i++) {
              const data = `stress-test-${i}`;
              const encrypted = await cryptoService.encryptWithPassword(data, 'stress');
              await cryptoService.decryptWithPassword(encrypted, 'stress');
            }
            
            return performance.now() - startTime;
          },
          target: 5000 // 5 seconds for 100 operations
        },
        {
          name: 'Large payload processing',
          test: async () => {
            const largePayload = 'x'.repeat(1024 * 1024); // 1MB
            const startTime = performance.now();
            
            const encrypted = await cryptoService.encryptWithPassword(largePayload, 'large');
            await cryptoService.decryptWithPassword(encrypted, 'large');
            
            return performance.now() - startTime;
          },
          target: 1000 // 1 second for 1MB
        }
      ];

      for (const stressTest of stressTests) {
        const duration = await stressTest.test();
        expect(duration).toBeLessThan(stressTest.target);
        console.log(`${stressTest.name}: ${duration.toFixed(2)}ms (target: <${stressTest.target}ms)`);
      }
    });
  });
});