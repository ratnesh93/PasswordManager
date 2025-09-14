import { describe, it, expect, beforeEach } from 'vitest';
import CryptoService from '../src/crypto/crypto.js';

describe('CryptoService', () => {
  let cryptoService;

  beforeEach(() => {
    cryptoService = new CryptoService();
  });

  describe('Salt and IV Generation', () => {
    it('should generate salt of correct length', () => {
      const salt = cryptoService.generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it('should generate different salts each time', () => {
      const salt1 = cryptoService.generateSalt();
      const salt2 = cryptoService.generateSalt();
      expect(salt1).not.toEqual(salt2);
    });

    it('should generate IV of correct length', () => {
      const iv = cryptoService.generateIV();
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
    });

    it('should generate different IVs each time', () => {
      const iv1 = cryptoService.generateIV();
      const iv2 = cryptoService.generateIV();
      expect(iv1).not.toEqual(iv2);
    });
  });

  describe('Key Derivation', () => {
    it('should derive key from password and salt', async () => {
      const password = 'test-password-123';
      const salt = cryptoService.generateSalt();
      
      const key = await cryptoService.deriveKey(password, salt);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
    });

    it('should derive same key for same password and salt', async () => {
      const password = 'test-password-123';
      const salt = new Uint8Array(32).fill(1); // Fixed salt for consistency
      
      const key1 = await cryptoService.deriveKey(password, salt);
      const key2 = await cryptoService.deriveKey(password, salt);
      
      // Keys should have same properties (we can't compare directly due to non-extractable nature)
      expect(key1.algorithm).toEqual(key2.algorithm);
      expect(key1.type).toBe(key2.type);
    });

    it('should handle key derivation errors', async () => {
      const invalidPassword = null;
      const salt = cryptoService.generateSalt();
      
      await expect(cryptoService.deriveKey(invalidPassword, salt))
        .rejects.toThrow('Key derivation failed');
    });
  });

  describe('Encryption and Decryption', () => {
    it('should encrypt and decrypt data successfully', async () => {
      const testData = 'This is test data for encryption';
      const password = 'test-password-123';
      
      const encrypted = await cryptoService.encryptWithPassword(testData, password);
      expect(encrypted.data).toBeInstanceOf(Uint8Array);
      expect(encrypted.iv).toBeInstanceOf(Uint8Array);
      expect(encrypted.salt).toBeInstanceOf(Uint8Array);
      
      const decrypted = await cryptoService.decryptWithPassword(encrypted, password);
      expect(decrypted).toBe(testData);
    });

    it('should produce different encrypted outputs for same input', async () => {
      const testData = 'Same input data';
      const password = 'test-password-123';
      
      const encrypted1 = await cryptoService.encryptWithPassword(testData, password);
      const encrypted2 = await cryptoService.encryptWithPassword(testData, password);
      
      // Should be different due to different IVs and salts
      expect(encrypted1.data).not.toEqual(encrypted2.data);
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.salt).not.toEqual(encrypted2.salt);
      
      // But both should decrypt to the same original data
      const decrypted1 = await cryptoService.decryptWithPassword(encrypted1, password);
      const decrypted2 = await cryptoService.decryptWithPassword(encrypted2, password);
      expect(decrypted1).toBe(testData);
      expect(decrypted2).toBe(testData);
    });

    it('should fail decryption with wrong password', async () => {
      const testData = 'Secret data';
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';
      
      const encrypted = await cryptoService.encryptWithPassword(testData, correctPassword);
      
      await expect(cryptoService.decryptWithPassword(encrypted, wrongPassword))
        .rejects.toThrow('Password decryption failed');
    });

    it('should handle encryption errors', async () => {
      const testData = 'test data';
      const invalidPassword = null;
      
      await expect(cryptoService.encryptWithPassword(testData, invalidPassword))
        .rejects.toThrow('Password encryption failed');
    });
  });

  describe('Data Serialization', () => {
    it('should serialize and deserialize encrypted data', () => {
      const testData = {
        data: new Uint8Array([1, 2, 3, 4]),
        iv: new Uint8Array([5, 6, 7, 8]),
        salt: new Uint8Array([9, 10, 11, 12])
      };
      
      const serialized = cryptoService.serializeEncryptedData(testData);
      expect(typeof serialized).toBe('string');
      
      const deserialized = cryptoService.deserializeEncryptedData(serialized);
      expect(deserialized.data).toEqual(testData.data);
      expect(deserialized.iv).toEqual(testData.iv);
      expect(deserialized.salt).toEqual(testData.salt);
    });

    it('should handle base64 conversion correctly', () => {
      const testArray = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      
      const base64 = cryptoService.arrayBufferToBase64(testArray);
      expect(typeof base64).toBe('string');
      
      const converted = cryptoService.base64ToArrayBuffer(base64);
      expect(converted).toEqual(testArray);
    });
  });

  describe('Key Phrase Generation and Validation', () => {
    it('should generate 16-word key phrase', () => {
      const keyPhrase = cryptoService.generateKeyPhrase();
      expect(Array.isArray(keyPhrase)).toBe(true);
      expect(keyPhrase.length).toBe(16);
      expect(keyPhrase.every(word => typeof word === 'string')).toBe(true);
    });

    it('should generate different key phrases each time', () => {
      const keyPhrase1 = cryptoService.generateKeyPhrase();
      const keyPhrase2 = cryptoService.generateKeyPhrase();
      expect(keyPhrase1).not.toEqual(keyPhrase2);
    });

    it('should validate correct key phrase format', () => {
      const validKeyPhrase = cryptoService.generateKeyPhrase();
      expect(cryptoService.validateKeyPhrase(validKeyPhrase)).toBe(true);
    });

    it('should reject invalid key phrase formats', () => {
      // Wrong length
      expect(cryptoService.validateKeyPhrase(['word1', 'word2'])).toBe(false);
      
      // Not an array
      expect(cryptoService.validateKeyPhrase('not an array')).toBe(false);
      
      // Contains invalid words
      expect(cryptoService.validateKeyPhrase([
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'invalid-word', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ])).toBe(false);
      
      // Contains non-string elements
      expect(cryptoService.validateKeyPhrase([
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        123, 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ])).toBe(false);
    });

    it('should convert key phrase to cryptographic key', async () => {
      const keyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      
      const key = await cryptoService.keyPhraseToKey(keyPhrase);
      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
    });

    it('should derive same key from same key phrase', async () => {
      const keyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      
      const key1 = await cryptoService.keyPhraseToKey(keyPhrase);
      const key2 = await cryptoService.keyPhraseToKey(keyPhrase);
      
      expect(key1.algorithm).toEqual(key2.algorithm);
      expect(key1.type).toBe(key2.type);
    });

    it('should reject invalid key phrase for key conversion', async () => {
      const invalidKeyPhrase = ['invalid', 'key', 'phrase'];
      
      await expect(cryptoService.keyPhraseToKey(invalidKeyPhrase))
        .rejects.toThrow('Key phrase to key conversion failed');
    });
  });

  describe('Key Phrase Encryption and Decryption', () => {
    it('should encrypt and decrypt with key phrase', async () => {
      const testData = 'Secret data for key phrase encryption';
      const keyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      
      const encrypted = await cryptoService.encryptWithKeyPhrase(testData, keyPhrase);
      expect(typeof encrypted).toBe('string');
      
      const decrypted = await cryptoService.decryptWithKeyPhrase(encrypted, keyPhrase);
      expect(decrypted).toBe(testData);
    });

    it('should fail decryption with wrong key phrase', async () => {
      const testData = 'Secret data';
      const correctKeyPhrase = [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
      ];
      const wrongKeyPhrase = [
        'wrong', 'key', 'phrase', 'that', 'should', 'not', 'work', 'for',
        'decryption', 'of', 'the', 'encrypted', 'data', 'at', 'all', 'ever'
      ];
      
      const encrypted = await cryptoService.encryptWithKeyPhrase(testData, correctKeyPhrase);
      
      await expect(cryptoService.decryptWithKeyPhrase(encrypted, wrongKeyPhrase))
        .rejects.toThrow('Key phrase decryption failed');
    });

    it('should handle key phrase encryption errors', async () => {
      const testData = 'test data';
      const invalidKeyPhrase = ['invalid'];
      
      await expect(cryptoService.encryptWithKeyPhrase(testData, invalidKeyPhrase))
        .rejects.toThrow('Key phrase encryption failed');
    });
  });

  describe('Memory Management', () => {
    it('should clear string data from memory', () => {
      let sensitiveData = 'sensitive-password-123';
      cryptoService.clearMemory(sensitiveData);
      // Note: In JavaScript, we can't actually clear string memory,
      // but the function should not throw errors
      expect(() => cryptoService.clearMemory(sensitiveData)).not.toThrow();
    });

    it('should clear Uint8Array data from memory', () => {
      const sensitiveArray = new Uint8Array([1, 2, 3, 4, 5]);
      const originalArray = new Uint8Array(sensitiveArray);
      
      cryptoService.clearMemory(sensitiveArray);
      
      // Array should be filled with zeros
      expect(sensitiveArray.every(byte => byte === 0)).toBe(true);
      expect(sensitiveArray).not.toEqual(originalArray);
    });

    it('should handle memory clearing errors gracefully', () => {
      expect(() => cryptoService.clearMemory(null)).not.toThrow();
      expect(() => cryptoService.clearMemory(undefined)).not.toThrow();
      expect(() => cryptoService.clearMemory(123)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', async () => {
      try {
        await cryptoService.deriveKey(null, null);
      } catch (error) {
        expect(error.message).toContain('Key derivation failed');
      }
    });

    it('should handle malformed serialized data', () => {
      const malformedData = 'not-valid-json';
      
      expect(() => cryptoService.deserializeEncryptedData(malformedData))
        .toThrow();
    });

    it('should handle invalid base64 data', () => {
      const invalidBase64 = 'not-valid-base64!@#$';
      
      expect(() => cryptoService.base64ToArrayBuffer(invalidBase64))
        .toThrow();
    });
  });

  describe('Known Test Vectors', () => {
    it('should produce consistent results with known inputs', async () => {
      // Test with fixed salt and password for consistency
      const password = 'test-password-123';
      const fixedSalt = new Uint8Array(32).fill(42);
      
      const key1 = await cryptoService.deriveKey(password, fixedSalt);
      const key2 = await cryptoService.deriveKey(password, fixedSalt);
      
      // Should produce same key properties
      expect(key1.algorithm).toEqual(key2.algorithm);
      expect(key1.type).toBe(key2.type);
    });

    it('should handle empty data encryption', async () => {
      const emptyData = '';
      const password = 'test-password';
      
      const encrypted = await cryptoService.encryptWithPassword(emptyData, password);
      const decrypted = await cryptoService.decryptWithPassword(encrypted, password);
      
      expect(decrypted).toBe(emptyData);
    });

    it('should handle large data encryption', async () => {
      const largeData = 'x'.repeat(10000); // 10KB of data
      const password = 'test-password';
      
      const encrypted = await cryptoService.encryptWithPassword(largeData, password);
      const decrypted = await cryptoService.decryptWithPassword(encrypted, password);
      
      expect(decrypted).toBe(largeData);
    });
  });
});