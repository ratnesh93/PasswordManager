// BIP39_WORDS will be available globally via importScripts

/**
 * CryptoService - Handles all encryption/decryption operations for the password manager
 * Uses Web Crypto API with AES-256-GCM for authenticated encryption
 */
class CryptoService {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12; // 96 bits for GCM
    this.saltLength = 32; // 256 bits
    this.tagLength = 128; // 128 bits for GCM tag
    this.iterations = 100000; // PBKDF2 iterations
    
    // Initialize memory manager for secure cleanup
    this.memoryManager = null;
    this.initializeMemoryManager();
  }

  /**
   * Initialize memory manager for secure data handling
   */
  async initializeMemoryManager() {
    try {
      // Dynamically import MemoryManager to avoid circular dependencies
      if (typeof window !== 'undefined' && window.MemoryManager) {
        this.memoryManager = new window.MemoryManager();
      } else if (typeof require !== 'undefined') {
        const MemoryManager = require('../utils/memory-manager.js');
        this.memoryManager = new MemoryManager();
      }
      
      if (this.memoryManager) {
        this.memoryManager.startMemoryWatchdog();
      }
    } catch (error) {
      console.warn('Failed to initialize memory manager:', error.message);
    }
  }

  /**
   * Generates a cryptographically secure random salt
   * @returns {Uint8Array} Random salt of specified length
   */
  generateSalt() {
    return crypto.getRandomValues(new Uint8Array(this.saltLength));
  }

  /**
   * Generates a cryptographically secure random IV
   * @returns {Uint8Array} Random IV of specified length
   */
  generateIV() {
    return crypto.getRandomValues(new Uint8Array(this.ivLength));
  }

  /**
   * Derives a cryptographic key from a password using PBKDF2
   * @param {string} password - The master password
   * @param {Uint8Array} salt - The salt for key derivation
   * @returns {Promise<CryptoKey>} The derived key
   */
  async deriveKey(password, salt) {
    try {
      // Import the password as a key
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive the actual encryption key
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.iterations,
          hash: 'SHA-256'
        },
        passwordKey,
        {
          name: this.algorithm,
          length: this.keyLength
        },
        false,
        ['encrypt', 'decrypt']
      );

      return derivedKey;
    } catch (error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * Encrypts data using AES-256-GCM
   * @param {string} data - The data to encrypt
   * @param {CryptoKey} key - The encryption key
   * @returns {Promise<Object>} Object containing encrypted data, IV, and salt
   */
  async encrypt(data, key) {
    try {
      const iv = this.generateIV();
      const encodedData = new TextEncoder().encode(data);

      const encryptedData = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv,
          tagLength: this.tagLength
        },
        key,
        encodedData
      );

      return {
        data: new Uint8Array(encryptedData),
        iv: iv
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts data using AES-256-GCM
   * @param {Object} encryptedData - Object containing encrypted data and IV
   * @param {CryptoKey} key - The decryption key
   * @returns {Promise<string>} The decrypted data
   */
  async decrypt(encryptedData, key) {
    try {
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: encryptedData.iv,
          tagLength: this.tagLength
        },
        key,
        encryptedData.data
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypts data with a password (convenience method)
   * @param {string} data - The data to encrypt
   * @param {string} password - The password to use for encryption
   * @returns {Promise<Object>} Object containing encrypted data, IV, and salt
   */
  async encryptWithPassword(data, password) {
    try {
      const salt = this.generateSalt();
      const key = await this.deriveKey(password, salt);
      const encrypted = await this.encrypt(data, key);

      return {
        data: encrypted.data,
        iv: encrypted.iv,
        salt: salt
      };
    } catch (error) {
      throw new Error(`Password encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts data with a password (convenience method)
   * @param {Object} encryptedData - Object containing encrypted data, IV, and salt
   * @param {string} password - The password to use for decryption
   * @returns {Promise<string>} The decrypted data
   */
  async decryptWithPassword(encryptedData, password) {
    try {
      const key = await this.deriveKey(password, encryptedData.salt);
      return await this.decrypt(encryptedData, key);
    } catch (error) {
      throw new Error(`Password decryption failed: ${error.message}`);
    }
  }

  /**
   * Converts Uint8Array to base64 string for storage
   * @param {Uint8Array} buffer - The buffer to convert
   * @returns {string} Base64 encoded string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Converts base64 string to Uint8Array
   * @param {string} base64 - The base64 string to convert
   * @returns {Uint8Array} The converted buffer
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Serializes encrypted data for storage
   * @param {Object} encryptedData - Object containing encrypted data, IV, and salt
   * @returns {string} JSON string representation
   */
  serializeEncryptedData(encryptedData) {
    return JSON.stringify({
      data: this.arrayBufferToBase64(encryptedData.data),
      iv: this.arrayBufferToBase64(encryptedData.iv),
      salt: this.arrayBufferToBase64(encryptedData.salt)
    });
  }

  /**
   * Deserializes encrypted data from storage
   * @param {string} serializedData - JSON string representation
   * @returns {Object} Object containing encrypted data, IV, and salt as Uint8Arrays
   */
  deserializeEncryptedData(serializedData) {
    const parsed = JSON.parse(serializedData);
    return {
      data: this.base64ToArrayBuffer(parsed.data),
      iv: this.base64ToArrayBuffer(parsed.iv),
      salt: this.base64ToArrayBuffer(parsed.salt)
    };
  }

  /**
   * Generates a 16-word key phrase using BIP39 word list
   * @returns {string[]} Array of 16 words
   */
  generateKeyPhrase() {
    try {
      const words = this.getBIP39Words();
      const keyPhrase = [];
      
      for (let i = 0; i < 16; i++) {
        const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % words.length;
        keyPhrase.push(words[randomIndex]);
      }
      
      return keyPhrase;
    } catch (error) {
      throw new Error(`Key phrase generation failed: ${error.message}`);
    }
  }

  /**
   * Validates a key phrase format and words
   * @param {string[]} keyPhrase - Array of words to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validateKeyPhrase(keyPhrase) {
    try {
      if (!Array.isArray(keyPhrase) || keyPhrase.length !== 16) {
        return false;
      }

      const words = this.getBIP39Words();
      const wordSet = new Set(words);

      return keyPhrase.every(word => 
        typeof word === 'string' && 
        word.length > 0 && 
        wordSet.has(word.toLowerCase())
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Converts key phrase to a cryptographic key
   * @param {string[]} keyPhrase - Array of 16 words
   * @returns {Promise<CryptoKey>} Derived key from key phrase
   */
  async keyPhraseToKey(keyPhrase) {
    try {
      if (!this.validateKeyPhrase(keyPhrase)) {
        throw new Error('Invalid key phrase format or words');
      }

      const keyPhraseString = keyPhrase.join(' ').toLowerCase();
      const salt = new TextEncoder().encode('keyphrase-salt'); // Fixed salt for key phrases
      
      // Import the key phrase as a key
      const keyPhraseKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(keyPhraseString),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      // Derive the actual encryption key
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.iterations,
          hash: 'SHA-256'
        },
        keyPhraseKey,
        {
          name: this.algorithm,
          length: this.keyLength
        },
        false,
        ['encrypt', 'decrypt']
      );

      return derivedKey;
    } catch (error) {
      throw new Error(`Key phrase to key conversion failed: ${error.message}`);
    }
  }

  /**
   * Encrypts data using a key phrase
   * @param {string} data - The data to encrypt
   * @param {string[]} keyPhrase - Array of 16 words
   * @returns {Promise<string>} Serialized encrypted data
   */
  async encryptWithKeyPhrase(data, keyPhrase) {
    try {
      const key = await this.keyPhraseToKey(keyPhrase);
      const encrypted = await this.encrypt(data, key);
      
      // For key phrase encryption, we don't need to store the salt separately
      // since it's derived from the key phrase itself
      return this.serializeEncryptedData({
        data: encrypted.data,
        iv: encrypted.iv,
        salt: new Uint8Array(0) // Empty salt since we use fixed salt for key phrases
      });
    } catch (error) {
      throw new Error(`Key phrase encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypts data using a key phrase
   * @param {string} encryptedData - Serialized encrypted data
   * @param {string[]} keyPhrase - Array of 16 words
   * @returns {Promise<string>} The decrypted data
   */
  async decryptWithKeyPhrase(encryptedData, keyPhrase) {
    try {
      const key = await this.keyPhraseToKey(keyPhrase);
      const deserializedData = this.deserializeEncryptedData(encryptedData);
      
      return await this.decrypt({
        data: deserializedData.data,
        iv: deserializedData.iv
      }, key);
    } catch (error) {
      throw new Error(`Key phrase decryption failed: ${error.message}`);
    }
  }

  /**
   * Gets the complete BIP39 word list containing all 2048 words
   * 
   * Why exactly 2048 words instead of all English words?
   * 
   * 1. MATHEMATICAL PRECISION: 2048 = 2^11, which means each word represents exactly 11 bits of entropy.
   *    This makes calculations clean and precise for cryptographic purposes.
   * 
   * 2. ENTROPY CALCULATION: With 2048 words, a 12-word phrase provides 132 bits of entropy (12 × 11),
   *    and a 24-word phrase provides 264 bits - both cryptographically secure levels.
   * 
   * 3. CHECKSUM COMPATIBILITY: BIP39 uses the last word as a checksum. With 2048 words (11 bits each),
   *    the math works perfectly for checksum validation.
   * 
   * 4. STANDARDIZATION: BIP39 is an industry standard used by hardware wallets, software wallets,
   *    and cryptocurrency applications worldwide. Using the exact 2048-word list ensures compatibility.
   * 
   * 5. COLLISION AVOIDANCE: The 2048 words were carefully selected to avoid similar-sounding words,
   *    words that differ by only one letter, and ambiguous words to prevent user errors.
   * 
   * 6. MULTILINGUAL SUPPORT: The BIP39 standard defines exactly 2048 words for each supported language,
   *    maintaining consistency across different languages.
   * 
   * Using all English words (~170,000+) would:
   * - Break mathematical precision (not a power of 2)
   * - Make entropy calculations complex and imprecise
   * - Introduce similar-sounding words leading to user errors
   * - Break compatibility with existing BIP39 implementations
   * - Make checksum validation impossible with current algorithms
   * 
   * @returns {string[]} Array of all 2048 BIP39 words
   */
  getBIP39Words() {
    return BIP39_WORDS;
  }

  /**
   * Securely clears sensitive data from memory
   * @param {string|Uint8Array} data - Data to clear
   */
  clearMemory(data) {
    try {
      if (typeof data === 'string') {
        // For strings, we can't directly clear memory, but we can overwrite the reference
        data = null;
      } else if (data instanceof Uint8Array) {
        // For Uint8Arrays, we can overwrite with zeros
        data.fill(0);
      }
    } catch (error) {
      // Silently handle errors in memory clearing
      console.warn('Memory clearing failed:', error.message);
    }
  }
}

// Make available globally for importScripts
if (typeof window !== 'undefined') {
    window.CryptoService = CryptoService;
} else {
    // For service worker context
    self.CryptoService = CryptoService;
}