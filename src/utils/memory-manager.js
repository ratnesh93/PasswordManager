/**
 * MemoryManager - Handles secure memory operations for sensitive data
 * Provides utilities to clear sensitive data from memory and prevent memory leaks
 */
class MemoryManager {
  constructor() {
    this.sensitiveDataRegistry = new WeakSet();
    this.clearanceCallbacks = new Map();
    this.memoryWatchdog = null;
    this.watchdogInterval = 60000; // 1 minute
  }

  /**
   * Register sensitive data for tracking and automatic cleanup
   * @param {any} data - Sensitive data to track
   * @param {Function} clearCallback - Optional custom cleanup function
   */
  registerSensitiveData(data, clearCallback = null) {
    try {
      if (data && typeof data === 'object') {
        this.sensitiveDataRegistry.add(data);
        
        if (clearCallback && typeof clearCallback === 'function') {
          this.clearanceCallbacks.set(data, clearCallback);
        }
      }
    } catch (error) {
      console.warn('Failed to register sensitive data:', error.message);
    }
  }

  /**
   * Securely clear a string from memory by overwriting its internal representation
   * Note: This is a best-effort approach as JavaScript doesn't provide direct memory control
   * @param {string} str - String to clear
   * @returns {string} Empty string
   */
  clearString(str) {
    try {
      if (typeof str !== 'string') {
        return str;
      }

      // Create a new string filled with zeros of the same length
      const clearStr = '\0'.repeat(str.length);
      
      // Attempt to overwrite the original string reference
      // Note: This doesn't guarantee memory clearing in JavaScript due to string immutability
      str = clearStr;
      
      // Force garbage collection hint (not guaranteed to work)
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
      
      return '';
    } catch (error) {
      console.warn('String clearing failed:', error.message);
      return '';
    }
  }

  /**
   * Securely clear a Uint8Array by overwriting with zeros
   * @param {Uint8Array} buffer - Buffer to clear
   * @returns {Uint8Array} Cleared buffer
   */
  clearBuffer(buffer) {
    try {
      if (!(buffer instanceof Uint8Array)) {
        return buffer;
      }

      // Overwrite with cryptographically secure random data first
      const randomData = crypto.getRandomValues(new Uint8Array(buffer.length));
      buffer.set(randomData);
      
      // Then overwrite with zeros
      buffer.fill(0);
      
      return buffer;
    } catch (error) {
      console.warn('Buffer clearing failed:', error.message);
      return buffer;
    }
  }

  /**
   * Securely clear an object by overwriting its properties
   * @param {Object} obj - Object to clear
   * @returns {Object} Cleared object
   */
  clearObject(obj) {
    try {
      if (!obj || typeof obj !== 'object') {
        return obj;
      }

      // Clear all enumerable properties
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          
          if (typeof value === 'string') {
            obj[key] = this.clearString(value);
          } else if (value instanceof Uint8Array) {
            obj[key] = this.clearBuffer(value);
          } else if (typeof value === 'object' && value !== null) {
            obj[key] = this.clearObject(value);
          } else {
            obj[key] = null;
          }
        }
      }

      return obj;
    } catch (error) {
      console.warn('Object clearing failed:', error.message);
      return obj;
    }
  }

  /**
   * Clear sensitive data based on its type
   * @param {any} data - Data to clear
   * @returns {any} Cleared data
   */
  clearSensitiveData(data) {
    try {
      if (data === null || data === undefined) {
        return data;
      }

      // Check if there's a custom clearance callback
      if (this.clearanceCallbacks.has(data)) {
        const callback = this.clearanceCallbacks.get(data);
        callback(data);
        this.clearanceCallbacks.delete(data);
        return null;
      }

      // Clear based on data type
      if (typeof data === 'string') {
        return this.clearString(data);
      } else if (data instanceof Uint8Array) {
        return this.clearBuffer(data);
      } else if (typeof data === 'object') {
        return this.clearObject(data);
      } else {
        // For primitive types, just nullify
        return null;
      }
    } catch (error) {
      console.warn('Sensitive data clearing failed:', error.message);
      return null;
    }
  }

  /**
   * Clear multiple sensitive data items
   * @param {Array} dataItems - Array of data items to clear
   */
  clearMultipleSensitiveData(dataItems) {
    try {
      if (!Array.isArray(dataItems)) {
        return;
      }

      dataItems.forEach((item, index) => {
        dataItems[index] = this.clearSensitiveData(item);
      });
    } catch (error) {
      console.warn('Multiple data clearing failed:', error.message);
    }
  }

  /**
   * Clear credential object securely
   * @param {Object} credential - Credential object to clear
   * @returns {Object} Cleared credential object
   */
  clearCredential(credential) {
    try {
      if (!credential || typeof credential !== 'object') {
        return credential;
      }

      // Clear sensitive fields
      if (credential.password) {
        credential.password = this.clearString(credential.password);
      }
      
      if (credential.username) {
        credential.username = this.clearString(credential.username);
      }
      
      if (credential.encryptedData) {
        credential.encryptedData = this.clearSensitiveData(credential.encryptedData);
      }

      return credential;
    } catch (error) {
      console.warn('Credential clearing failed:', error.message);
      return credential;
    }
  }

  /**
   * Clear encryption keys and related data
   * @param {Object} keyData - Key data object to clear
   * @returns {Object} Cleared key data
   */
  clearKeyData(keyData) {
    try {
      if (!keyData || typeof keyData !== 'object') {
        return keyData;
      }

      // Clear key-related fields
      const sensitiveFields = ['key', 'salt', 'iv', 'keyPhrase', 'masterPassword', 'derivedKey'];
      
      sensitiveFields.forEach(field => {
        if (keyData[field]) {
          keyData[field] = this.clearSensitiveData(keyData[field]);
        }
      });

      return keyData;
    } catch (error) {
      console.warn('Key data clearing failed:', error.message);
      return keyData;
    }
  }

  /**
   * Start memory watchdog to periodically check for memory leaks
   */
  startMemoryWatchdog() {
    try {
      if (this.memoryWatchdog) {
        return; // Already running
      }

      this.memoryWatchdog = setInterval(() => {
        this.performMemoryCleanup();
      }, this.watchdogInterval);

      console.log('Memory watchdog started');
    } catch (error) {
      console.warn('Failed to start memory watchdog:', error.message);
    }
  }

  /**
   * Stop memory watchdog
   */
  stopMemoryWatchdog() {
    try {
      if (this.memoryWatchdog) {
        clearInterval(this.memoryWatchdog);
        this.memoryWatchdog = null;
        console.log('Memory watchdog stopped');
      }
    } catch (error) {
      console.warn('Failed to stop memory watchdog:', error.message);
    }
  }

  /**
   * Perform periodic memory cleanup
   */
  performMemoryCleanup() {
    try {
      // Clear any remaining callbacks
      this.clearanceCallbacks.clear();
      
      // Force garbage collection hint
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
      
      // Log memory usage if available
      if (performance && performance.memory) {
        const memInfo = performance.memory;
        console.log('Memory usage:', {
          used: Math.round(memInfo.usedJSHeapSize / 1024 / 1024) + 'MB',
          total: Math.round(memInfo.totalJSHeapSize / 1024 / 1024) + 'MB',
          limit: Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024) + 'MB'
        });
      }
    } catch (error) {
      console.warn('Memory cleanup failed:', error.message);
    }
  }

  /**
   * Create a secure variable that automatically clears itself
   * @param {any} value - Initial value
   * @param {number} ttl - Time to live in milliseconds (optional)
   * @returns {Object} Secure variable object
   */
  createSecureVariable(value, ttl = null) {
    const secureVar = {
      _value: value,
      _cleared: false,
      _timeout: null,

      get() {
        if (this._cleared) {
          throw new Error('Secure variable has been cleared');
        }
        return this._value;
      },

      set(newValue) {
        if (this._cleared) {
          throw new Error('Cannot set value on cleared secure variable');
        }
        this._value = newValue;
      },

      clear() {
        if (!this._cleared) {
          this._value = this.clearSensitiveData(this._value);
          this._cleared = true;
          
          if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
          }
        }
      },

      isCleared() {
        return this._cleared;
      }
    };

    // Set up automatic clearing if TTL is specified
    if (ttl && ttl > 0) {
      secureVar._timeout = setTimeout(() => {
        secureVar.clear();
      }, ttl);
    }

    // Register for tracking
    this.registerSensitiveData(secureVar, (data) => data.clear());

    return secureVar;
  }

  /**
   * Secure function wrapper that clears parameters after execution
   * @param {Function} fn - Function to wrap
   * @returns {Function} Wrapped function
   */
  secureFunction(fn) {
    return (...args) => {
      try {
        const result = fn.apply(this, args);
        
        // Clear arguments after execution
        args.forEach((arg, index) => {
          args[index] = this.clearSensitiveData(arg);
        });
        
        return result;
      } catch (error) {
        // Clear arguments even if function throws
        args.forEach((arg, index) => {
          args[index] = this.clearSensitiveData(arg);
        });
        throw error;
      }
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage information
   */
  getMemoryStats() {
    try {
      const stats = {
        registeredItems: this.sensitiveDataRegistry ? 'WeakSet (size unknown)' : 0,
        clearanceCallbacks: this.clearanceCallbacks.size,
        watchdogActive: !!this.memoryWatchdog
      };

      // Add browser memory info if available
      if (performance && performance.memory) {
        const memInfo = performance.memory;
        stats.heapUsed = Math.round(memInfo.usedJSHeapSize / 1024 / 1024);
        stats.heapTotal = Math.round(memInfo.totalJSHeapSize / 1024 / 1024);
        stats.heapLimit = Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024);
      }

      return stats;
    } catch (error) {
      console.warn('Failed to get memory stats:', error.message);
      return { error: error.message };
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemoryManager;
} else if (typeof window !== 'undefined') {
  window.MemoryManager = MemoryManager;
}