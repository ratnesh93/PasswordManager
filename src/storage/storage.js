/**
 * StorageManager - Handles local storage operations using Chrome Storage API
 * Manages encrypted credential data persistence and file operations
 */
class StorageManager {
  constructor() {
    this.storageKey = 'passwordManagerData';
    this.userProfileKey = 'userProfile';
  }

  /**
   * Save encrypted credential data to Chrome storage
   * @param {string} encryptedData - Base64 encoded encrypted credential data
   * @param {Object} userProfile - User profile information
   * @returns {Promise<void>}
   */
  async saveEncryptedData(encryptedData, userProfile = null) {
    try {
      const storageData = {
        encryptedCredentials: encryptedData,
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      };

      // Save main credential data
      await chrome.storage.local.set({
        [this.storageKey]: storageData
      });

      // Save user profile if provided
      if (userProfile) {
        await chrome.storage.local.set({
          [this.userProfileKey]: {
            ...userProfile,
            lastUpdated: new Date().toISOString()
          }
        });
      }

      console.log('Encrypted data saved successfully');
    } catch (error) {
      console.error('Failed to save encrypted data:', error);
      throw new Error(`Storage save failed: ${error.message}`);
    }
  }

  /**
   * Load encrypted credential data from Chrome storage
   * @returns {Promise<string|null>} Base64 encoded encrypted data or null if not found
   */
  async loadEncryptedData() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      
      if (!result[this.storageKey]) {
        console.log('No encrypted data found in storage');
        return null;
      }

      const storageData = result[this.storageKey];
      
      // Validate data structure
      if (!storageData.encryptedCredentials || !storageData.version) {
        throw new Error('Invalid storage data structure');
      }

      console.log('Encrypted data loaded successfully');
      return storageData.encryptedCredentials;
    } catch (error) {
      console.error('Failed to load encrypted data:', error);
      throw new Error(`Storage load failed: ${error.message}`);
    }
  }

  /**
   * Load user profile from Chrome storage
   * @returns {Promise<Object|null>} User profile object or null if not found
   */
  async loadUserProfile() {
    try {
      const result = await chrome.storage.local.get([this.userProfileKey]);
      
      if (!result[this.userProfileKey]) {
        console.log('No user profile found in storage');
        return null;
      }

      return result[this.userProfileKey];
    } catch (error) {
      console.error('Failed to load user profile:', error);
      throw new Error(`User profile load failed: ${error.message}`);
    }
  }

  /**
   * Clear all stored data (for logout or reset)
   * @returns {Promise<void>}
   */
  async clearAllData() {
    try {
      await chrome.storage.local.remove([this.storageKey, this.userProfileKey]);
      console.log('All storage data cleared');
    } catch (error) {
      console.error('Failed to clear storage data:', error);
      throw new Error(`Storage clear failed: ${error.message}`);
    }
  }

  /**
   * Get storage usage information
   * @returns {Promise<Object>} Storage usage statistics
   */
  async getStorageInfo() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const allData = await chrome.storage.local.get(null);
      
      return {
        bytesInUse,
        itemCount: Object.keys(allData).length,
        hasCredentials: !!allData[this.storageKey],
        hasUserProfile: !!allData[this.userProfileKey]
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      throw new Error(`Storage info failed: ${error.message}`);
    }
  }

  /**
   * Serialize credential data for storage
   * @param {Array} credentials - Array of credential objects
   * @returns {string} Serialized JSON string
   */
  serializeCredentials(credentials) {
    try {
      if (!Array.isArray(credentials)) {
        throw new Error('Credentials must be an array');
      }

      // Validate credential structure
      credentials.forEach((cred, index) => {
        if (!cred.id || !cred.url || !cred.username || !cred.password) {
          throw new Error(`Invalid credential structure at index ${index}`);
        }
      });

      return JSON.stringify({
        credentials,
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Failed to serialize credentials:', error);
      throw new Error(`Serialization failed: ${error.message}`);
    }
  }

  /**
   * Deserialize credential data from storage
   * @param {string} serializedData - JSON string of credential data
   * @returns {Array} Array of credential objects
   */
  deserializeCredentials(serializedData) {
    try {
      if (!serializedData || typeof serializedData !== 'string') {
        throw new Error('Invalid serialized data');
      }

      const parsed = JSON.parse(serializedData);
      
      if (!parsed.credentials || !Array.isArray(parsed.credentials)) {
        throw new Error('Invalid credential data structure');
      }

      // Validate each credential
      parsed.credentials.forEach((cred, index) => {
        if (!cred.id || !cred.url || !cred.username || !cred.password) {
          throw new Error(`Invalid credential structure at index ${index}`);
        }
      });

      return parsed.credentials;
    } catch (error) {
      console.error('Failed to deserialize credentials:', error);
      throw new Error(`Deserialization failed: ${error.message}`);
    }
  }

  /**
   * Export encrypted data to downloadable file
   * @param {string} encryptedData - Encrypted credential data
   * @param {string} filename - Name for the exported file
   * @returns {Promise<void>}
   */
  async exportToFile(encryptedData, filename = null) {
    try {
      if (!encryptedData) {
        throw new Error('No data to export');
      }

      // Create export data structure
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        data: encryptedData,
        type: 'chrome-password-manager-export'
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Generate filename if not provided
      const exportFilename = filename || `password-manager-export-${new Date().toISOString().split('T')[0]}.json`;
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = exportFilename;
      
      // Trigger download
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up object URL
      URL.revokeObjectURL(url);
      
      console.log('Export completed successfully:', exportFilename);
    } catch (error) {
      console.error('Export failed:', error);
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Import encrypted data from uploaded file
   * @param {File} file - File object from file input
   * @returns {Promise<string>} Encrypted data from file
   */
  async importFromFile(file) {
    try {
      if (!file) {
        throw new Error('No file provided for import');
      }

      // Validate file type
      if (!file.name.endsWith('.json')) {
        throw new Error('Invalid file type. Please select a JSON file.');
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 10MB.');
      }

      // Read file content
      const fileContent = await this._readFileAsText(file);
      
      // Parse and validate JSON
      let importData;
      try {
        importData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error('Invalid JSON file format');
      }

      // Validate import data structure
      if (!importData.type || importData.type !== 'chrome-password-manager-export') {
        throw new Error('Invalid export file. This file was not created by Chrome Password Manager.');
      }

      if (!importData.version || !importData.data) {
        throw new Error('Corrupted export file. Missing required data.');
      }

      // Validate encrypted data format (for import, we just check it's a non-empty string)
      if (!importData.data || typeof importData.data !== 'string' || importData.data.length === 0) {
        throw new Error('Invalid encrypted data format in import file');
      }

      console.log('Import file validated successfully');
      return importData.data;
    } catch (error) {
      console.error('Import failed:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Read file content as text
   * @private
   * @param {File} file - File to read
   * @returns {Promise<string>} File content as string
   */
  _readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        resolve(event.target.result);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Validate import file before processing
   * @param {File} file - File to validate
   * @returns {Promise<Object>} Validation result with file info
   */
  async validateImportFile(file) {
    try {
      if (!file) {
        return { valid: false, error: 'No file provided' };
      }

      // Check file extension
      if (!file.name.endsWith('.json')) {
        return { valid: false, error: 'Invalid file type. Please select a JSON file.' };
      }

      // Check file size
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        return { valid: false, error: 'File too large. Maximum size is 10MB.' };
      }

      // Try to read and parse file
      const content = await this._readFileAsText(file);
      let parsedData;
      
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        return { valid: false, error: 'Invalid JSON file format' };
      }

      // Validate structure
      if (!parsedData.type || parsedData.type !== 'chrome-password-manager-export') {
        return { valid: false, error: 'Not a valid Chrome Password Manager export file' };
      }

      return {
        valid: true,
        fileInfo: {
          name: file.name,
          size: file.size,
          exportedAt: parsedData.exportedAt,
          version: parsedData.version
        }
      };
    } catch (error) {
      return { valid: false, error: `Validation failed: ${error.message}` };
    }
  }

  /**
   * Merge imported credentials with existing ones
   * @param {Array} existingCredentials - Current credentials
   * @param {Array} importedCredentials - Credentials from import
   * @returns {Array} Merged credential array
   */
  mergeCredentials(existingCredentials, importedCredentials) {
    try {
      const existing = existingCredentials || [];
      const imported = importedCredentials || [];

      // Create a map of existing credentials by URL and username
      const existingMap = new Map();
      existing.forEach(cred => {
        const key = `${cred.url}:${cred.username}`;
        existingMap.set(key, cred);
      });

      // Merge imported credentials
      const merged = [...existing];
      let addedCount = 0;
      let updatedCount = 0;

      imported.forEach(importedCred => {
        const key = `${importedCred.url}:${importedCred.username}`;
        
        if (existingMap.has(key)) {
          // Update existing credential if imported one is newer
          const existingCred = existingMap.get(key);
          const importedDate = new Date(importedCred.updatedAt || importedCred.createdAt);
          const existingDate = new Date(existingCred.updatedAt || existingCred.createdAt);
          
          if (importedDate > existingDate) {
            const index = merged.findIndex(c => c.id === existingCred.id);
            merged[index] = { ...importedCred, updatedAt: new Date().toISOString() };
            updatedCount++;
          }
        } else {
          // Add new credential
          merged.push({
            ...importedCred,
            id: this._generateId(),
            updatedAt: new Date().toISOString()
          });
          addedCount++;
        }
      });

      console.log(`Merge completed: ${addedCount} added, ${updatedCount} updated`);
      return merged;
    } catch (error) {
      console.error('Credential merge failed:', error);
      throw new Error(`Merge failed: ${error.message}`);
    }
  }

  /**
   * Generate unique ID for credentials
   * @private
   * @returns {string} Unique identifier
   */
  _generateId() {
    return 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Validate storage data integrity
   * @param {string} encryptedData - Encrypted data to validate
   * @returns {boolean} True if data appears valid
   */
  validateStorageData(encryptedData) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        return false;
      }

      // Check if it looks like base64 encoded data
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      return base64Regex.test(encryptedData) && encryptedData.length > 0;
    } catch (error) {
      console.error('Data validation failed:', error);
      return false;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
} else if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}

// Make available globally for importScripts
if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
} else {
    // For service worker context
    self.StorageManager = StorageManager;
}