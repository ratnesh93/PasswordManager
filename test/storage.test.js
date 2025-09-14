import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock Chrome Storage API
const mockChromeStorage = {
  local: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    getBytesInUse: vi.fn()
  }
};

// Mock global chrome object
global.chrome = {
  storage: mockChromeStorage
};

// Mock DOM APIs for file operations
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
        this.result = file.content || '{"type":"chrome-password-manager-export","version":"1.0.0","data":"test-data"}';
        this.onload({ target: { result: this.result } });
      }
    }, 0);
  }
};

// Import StorageManager after mocks are set up
const StorageManager = (await import('../src/storage/storage.js')).default || 
                      (await import('../src/storage/storage.js')).StorageManager ||
                      global.StorageManager;

describe('StorageManager', () => {
  let storageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
    // Reset all mocks
    vi.clearAllMocks();
    mockChromeStorage.local.set.mockResolvedValue();
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.remove.mockResolvedValue();
    mockChromeStorage.local.getBytesInUse.mockResolvedValue(1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveEncryptedData', () => {
    it('should save encrypted data successfully', async () => {
      const encryptedData = 'base64-encrypted-data';
      const userProfile = { gmailId: 'test@gmail.com' };

      await storageManager.saveEncryptedData(encryptedData, userProfile);

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(2);
      
      // Check credential data call
      const credentialCall = mockChromeStorage.local.set.mock.calls[0][0];
      expect(credentialCall.passwordManagerData).toBeDefined();
      expect(credentialCall.passwordManagerData.encryptedCredentials).toBe(encryptedData);
      expect(credentialCall.passwordManagerData.version).toBe('1.0.0');
      
      // Check user profile call
      const profileCall = mockChromeStorage.local.set.mock.calls[1][0];
      expect(profileCall.userProfile).toBeDefined();
      expect(profileCall.userProfile.gmailId).toBe('test@gmail.com');
    });

    it('should save without user profile', async () => {
      const encryptedData = 'base64-encrypted-data';

      await storageManager.saveEncryptedData(encryptedData);

      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
    });

    it('should handle storage errors', async () => {
      mockChromeStorage.local.set.mockRejectedValue(new Error('Storage full'));

      await expect(storageManager.saveEncryptedData('test-data'))
        .rejects.toThrow('Storage save failed: Storage full');
    });
  });

  describe('loadEncryptedData', () => {
    it('should load encrypted data successfully', async () => {
      const mockData = {
        passwordManagerData: {
          encryptedCredentials: 'base64-encrypted-data',
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z'
        }
      };
      mockChromeStorage.local.get.mockResolvedValue(mockData);

      const result = await storageManager.loadEncryptedData();

      expect(result).toBe('base64-encrypted-data');
      expect(mockChromeStorage.local.get).toHaveBeenCalledWith(['passwordManagerData']);
    });

    it('should return null when no data exists', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const result = await storageManager.loadEncryptedData();

      expect(result).toBeNull();
    });

    it('should handle invalid data structure', async () => {
      const mockData = {
        passwordManagerData: {
          // Missing encryptedCredentials
          version: '1.0.0'
        }
      };
      mockChromeStorage.local.get.mockResolvedValue(mockData);

      await expect(storageManager.loadEncryptedData())
        .rejects.toThrow('Storage load failed: Invalid storage data structure');
    });

    it('should handle storage errors', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      await expect(storageManager.loadEncryptedData())
        .rejects.toThrow('Storage load failed: Storage error');
    });
  });

  describe('loadUserProfile', () => {
    it('should load user profile successfully', async () => {
      const mockProfile = {
        userProfile: {
          gmailId: 'test@gmail.com',
          keyPhraseSalt: 'salt123',
          createdAt: '2024-01-01T00:00:00Z'
        }
      };
      mockChromeStorage.local.get.mockResolvedValue(mockProfile);

      const result = await storageManager.loadUserProfile();

      expect(result).toEqual(mockProfile.userProfile);
    });

    it('should return null when no profile exists', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const result = await storageManager.loadUserProfile();

      expect(result).toBeNull();
    });
  });

  describe('clearAllData', () => {
    it('should clear all storage data', async () => {
      await storageManager.clearAllData();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith([
        'passwordManagerData',
        'userProfile'
      ]);
    });

    it('should handle clear errors', async () => {
      mockChromeStorage.local.remove.mockRejectedValue(new Error('Clear failed'));

      await expect(storageManager.clearAllData())
        .rejects.toThrow('Storage clear failed: Clear failed');
    });
  });

  describe('getStorageInfo', () => {
    it('should return storage information', async () => {
      const mockData = {
        passwordManagerData: { encryptedCredentials: 'data' },
        userProfile: { gmailId: 'test@gmail.com' }
      };
      mockChromeStorage.local.getBytesInUse.mockResolvedValue(2048);
      mockChromeStorage.local.get.mockResolvedValue(mockData);

      const result = await storageManager.getStorageInfo();

      expect(result).toEqual({
        bytesInUse: 2048,
        itemCount: 2,
        hasCredentials: true,
        hasUserProfile: true
      });
    });
  });

  describe('serializeCredentials', () => {
    it('should serialize credentials successfully', () => {
      const credentials = [
        {
          id: 'cred1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1'
        },
        {
          id: 'cred2',
          url: 'https://test.com',
          username: 'user2',
          password: 'pass2'
        }
      ];

      const result = storageManager.serializeCredentials(credentials);
      const parsed = JSON.parse(result);

      expect(parsed.credentials).toEqual(credentials);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.exportedAt).toBeDefined();
    });

    it('should validate credential structure', () => {
      const invalidCredentials = [
        {
          id: 'cred1',
          // Missing required fields
          url: 'https://example.com'
        }
      ];

      expect(() => storageManager.serializeCredentials(invalidCredentials))
        .toThrow('Invalid credential structure at index 0');
    });

    it('should require array input', () => {
      expect(() => storageManager.serializeCredentials('not-an-array'))
        .toThrow('Credentials must be an array');
    });
  });

  describe('deserializeCredentials', () => {
    it('should deserialize credentials successfully', () => {
      const credentials = [
        {
          id: 'cred1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1'
        }
      ];
      const serializedData = JSON.stringify({
        credentials,
        exportedAt: '2024-01-01T00:00:00Z',
        version: '1.0.0'
      });

      const result = storageManager.deserializeCredentials(serializedData);

      expect(result).toEqual(credentials);
    });

    it('should handle invalid JSON', () => {
      expect(() => storageManager.deserializeCredentials('invalid-json'))
        .toThrow('Deserialization failed');
    });

    it('should validate data structure', () => {
      const invalidData = JSON.stringify({ version: '1.0.0' }); // Missing credentials

      expect(() => storageManager.deserializeCredentials(invalidData))
        .toThrow('Invalid credential data structure');
    });

    it('should validate credential structure', () => {
      const invalidCredentials = JSON.stringify({
        credentials: [{ id: 'cred1' }], // Missing required fields
        version: '1.0.0'
      });

      expect(() => storageManager.deserializeCredentials(invalidCredentials))
        .toThrow('Invalid credential structure at index 0');
    });
  });

  describe('exportToFile', () => {
    it('should export data to file successfully', async () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn()
      };
      global.document.createElement.mockReturnValue(mockLink);

      await storageManager.exportToFile('encrypted-data', 'test-export.json');

      expect(global.document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('test-export.json');
      expect(mockLink.click).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should generate filename if not provided', async () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn()
      };
      global.document.createElement.mockReturnValue(mockLink);

      await storageManager.exportToFile('encrypted-data');

      expect(mockLink.download).toMatch(/password-manager-export-\d{4}-\d{2}-\d{2}\.json/);
    });

    it('should handle missing data', async () => {
      await expect(storageManager.exportToFile(''))
        .rejects.toThrow('Export failed: No data to export');
    });
  });

  describe('importFromFile', () => {
    it('should import valid file successfully', async () => {
      const mockFile = {
        name: 'export.json',
        size: 1024,
        content: JSON.stringify({
          type: 'chrome-password-manager-export',
          version: '1.0.0',
          data: 'dGVzdC1kYXRh' // base64 encoded 'test-data'
        })
      };

      const result = await storageManager.importFromFile(mockFile);

      expect(result).toBe('dGVzdC1kYXRh');
    });

    it('should reject invalid file types', async () => {
      const mockFile = {
        name: 'export.txt',
        size: 1024
      };

      await expect(storageManager.importFromFile(mockFile))
        .rejects.toThrow('Invalid file type. Please select a JSON file.');
    });

    it('should reject oversized files', async () => {
      const mockFile = {
        name: 'export.json',
        size: 11 * 1024 * 1024 // 11MB
      };

      await expect(storageManager.importFromFile(mockFile))
        .rejects.toThrow('File too large. Maximum size is 10MB.');
    });

    it('should handle invalid JSON', async () => {
      const mockFile = {
        name: 'export.json',
        size: 1024,
        content: 'invalid-json'
      };

      await expect(storageManager.importFromFile(mockFile))
        .rejects.toThrow('Invalid JSON file format');
    });

    it('should validate export file type', async () => {
      const mockFile = {
        name: 'export.json',
        size: 1024,
        content: JSON.stringify({
          type: 'other-export',
          version: '1.0.0',
          data: 'test-data'
        })
      };

      await expect(storageManager.importFromFile(mockFile))
        .rejects.toThrow('Invalid export file. This file was not created by Chrome Password Manager.');
    });

    it('should handle file read errors', async () => {
      const mockFile = {
        name: 'export.json',
        size: 1024,
        shouldFail: true
      };

      await expect(storageManager.importFromFile(mockFile))
        .rejects.toThrow('Import failed');
    });
  });

  describe('validateImportFile', () => {
    it('should validate correct file', async () => {
      const mockFile = {
        name: 'export.json',
        size: 1024,
        content: JSON.stringify({
          type: 'chrome-password-manager-export',
          version: '1.0.0',
          exportedAt: '2024-01-01T00:00:00Z',
          data: 'test-data'
        })
      };

      const result = await storageManager.validateImportFile(mockFile);

      expect(result.valid).toBe(true);
      expect(result.fileInfo.name).toBe('export.json');
      expect(result.fileInfo.version).toBe('1.0.0');
    });

    it('should reject invalid file type', async () => {
      const mockFile = {
        name: 'export.txt',
        size: 1024
      };

      const result = await storageManager.validateImportFile(mockFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should handle no file', async () => {
      const result = await storageManager.validateImportFile(null);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No file provided');
    });
  });

  describe('mergeCredentials', () => {
    it('should merge credentials correctly', () => {
      const existing = [
        {
          id: 'cred1',
          url: 'https://example.com',
          username: 'user1',
          password: 'oldpass',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];

      const imported = [
        {
          id: 'cred2',
          url: 'https://example.com',
          username: 'user1',
          password: 'newpass',
          createdAt: '2024-01-02T00:00:00Z'
        },
        {
          id: 'cred3',
          url: 'https://newsite.com',
          username: 'user2',
          password: 'pass2',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];

      const result = storageManager.mergeCredentials(existing, imported);

      expect(result).toHaveLength(2);
      expect(result[0].password).toBe('newpass'); // Should be updated
      expect(result[1].url).toBe('https://newsite.com'); // Should be added
    });

    it('should handle empty arrays', () => {
      const result = storageManager.mergeCredentials([], []);
      expect(result).toEqual([]);
    });

    it('should handle null inputs', () => {
      const result = storageManager.mergeCredentials(null, null);
      expect(result).toEqual([]);
    });
  });

  describe('validateStorageData', () => {
    it('should validate correct base64 data', () => {
      const validData = 'dGVzdC1kYXRh'; // base64 encoded 'test-data'
      expect(storageManager.validateStorageData(validData)).toBe(true);
    });

    it('should reject invalid data', () => {
      expect(storageManager.validateStorageData('')).toBe(false);
      expect(storageManager.validateStorageData(null)).toBe(false);
      expect(storageManager.validateStorageData(123)).toBe(false);
      expect(storageManager.validateStorageData('invalid-base64!')).toBe(false);
    });
  });
});