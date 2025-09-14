/**
 * Tests for Validation Utility
 */

import { describe, it, expect } from 'vitest';
import { Validator, ValidationUtils, ValidationRules } from '../src/utils/validation.js';
import { ValidationError } from '../src/utils/error-handler.js';

describe('Validator', () => {
  describe('URL Validation', () => {
    it('should validate correct URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://test.org',
        'https://sub.domain.com/path',
        'https://example.com:8080/path?query=value#hash'
      ];

      validUrls.forEach(url => {
        const result = Validator.validateURL(url);
        expect(result.valid).toBe(true);
        expect(result.normalized).toBeTruthy();
        expect(result.domain).toBeTruthy();
      });
    });

    it('should normalize URLs by adding protocol', () => {
      const result = Validator.validateURL('example.com');
      expect(result.normalized).toBe('https://example.com');
      expect(result.domain).toBe('example.com');
    });

    it('should throw ValidationError for invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://invalid-protocol.com',
        'javascript:alert(1)',
        'http://',
        ''
      ];

      invalidUrls.forEach(url => {
        expect(() => Validator.validateURL(url)).toThrow(ValidationError);
      });
    });

    it('should handle required vs optional URL validation', () => {
      expect(() => Validator.validateURL('', true)).toThrow(ValidationError);
      
      const result = Validator.validateURL('', false);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe('');
    });

    it('should reject URLs that are too long', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(ValidationRules.URL_MAX_LENGTH);
      expect(() => Validator.validateURL(longUrl)).toThrow(ValidationError);
    });
  });

  describe('Username Validation', () => {
    it('should validate correct usernames', () => {
      const validUsernames = [
        'user@example.com',
        'john.doe',
        'user123',
        'test_user'
      ];

      validUsernames.forEach(username => {
        const result = Validator.validateUsername(username);
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBeTruthy();
      });
    });

    it('should sanitize usernames', () => {
      const result = Validator.validateUsername('  user@example.com  ');
      expect(result.sanitized).toBe('user@example.com');
    });

    it('should handle required vs optional username validation', () => {
      expect(() => Validator.validateUsername('', true)).toThrow(ValidationError);
      
      const result = Validator.validateUsername('', false);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('');
    });

    it('should reject usernames that are too long', () => {
      const longUsername = 'a'.repeat(ValidationRules.USERNAME_MAX_LENGTH + 1);
      expect(() => Validator.validateUsername(longUsername)).toThrow(ValidationError);
    });
  });

  describe('Password Validation', () => {
    it('should validate correct passwords', () => {
      const validPasswords = [
        'password123',
        'MySecureP@ssw0rd!',
        'a'.repeat(ValidationRules.PASSWORD_MIN_LENGTH)
      ];

      validPasswords.forEach(password => {
        const result = Validator.validatePassword(password);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject passwords that are too short', () => {
      const shortPassword = 'a'.repeat(ValidationRules.PASSWORD_MIN_LENGTH - 1);
      expect(() => Validator.validatePassword(shortPassword)).toThrow(ValidationError);
    });

    it('should reject passwords that are too long', () => {
      const longPassword = 'a'.repeat(ValidationRules.PASSWORD_MAX_LENGTH + 1);
      expect(() => Validator.validatePassword(longPassword)).toThrow(ValidationError);
    });

    it('should handle required vs optional password validation', () => {
      expect(() => Validator.validatePassword('', true)).toThrow(ValidationError);
      
      const result = Validator.validatePassword('', false);
      expect(result.valid).toBe(true);
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email+tag@domain.co.uk',
        'user123@test-domain.org'
      ];

      validEmails.forEach(email => {
        const result = Validator.validateEmail(email);
        expect(result.valid).toBe(true);
        expect(result.normalized).toBeTruthy();
      });
    });

    it('should normalize email addresses to lowercase', () => {
      const result = Validator.validateEmail('USER@EXAMPLE.COM');
      expect(result.normalized).toBe('user@example.com');
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'not-an-email',
        '@domain.com',
        'user@',
        'user..name@domain.com'
      ];

      invalidEmails.forEach(email => {
        expect(() => Validator.validateEmail(email)).toThrow(ValidationError);
      });
    });
  });

  describe('Key Phrase Validation', () => {
    it('should validate correct key phrases as array', () => {
      const keyPhrase = Array(ValidationRules.KEY_PHRASE_WORD_COUNT).fill('word');
      const result = Validator.validateKeyPhrase(keyPhrase);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toHaveLength(ValidationRules.KEY_PHRASE_WORD_COUNT);
    });

    it('should validate correct key phrases as string', () => {
      const keyPhrase = Array(ValidationRules.KEY_PHRASE_WORD_COUNT).fill('word').join(' ');
      const result = Validator.validateKeyPhrase(keyPhrase);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized).toHaveLength(ValidationRules.KEY_PHRASE_WORD_COUNT);
    });

    it('should reject key phrases with wrong word count', () => {
      const shortPhrase = Array(ValidationRules.KEY_PHRASE_WORD_COUNT - 1).fill('word');
      const longPhrase = Array(ValidationRules.KEY_PHRASE_WORD_COUNT + 1).fill('word');
      
      expect(() => Validator.validateKeyPhrase(shortPhrase)).toThrow(ValidationError);
      expect(() => Validator.validateKeyPhrase(longPhrase)).toThrow(ValidationError);
    });

    it('should sanitize key phrase words', () => {
      const keyPhrase = Array(ValidationRules.KEY_PHRASE_WORD_COUNT).fill('  WORD  ');
      const result = Validator.validateKeyPhrase(keyPhrase);
      
      result.sanitized.forEach(word => {
        expect(word).toBe('word');
      });
    });

    it('should reject invalid key phrase formats', () => {
      expect(() => Validator.validateKeyPhrase(null)).toThrow(ValidationError);
      expect(() => Validator.validateKeyPhrase(123)).toThrow(ValidationError);
      expect(() => Validator.validateKeyPhrase({})).toThrow(ValidationError);
    });
  });

  describe('Credential Validation', () => {
    it('should validate complete credential objects', () => {
      const credential = {
        url: 'https://example.com',
        username: 'user@example.com',
        password: 'password123'
      };
      
      const result = Validator.validateCredential(credential);
      expect(result.valid).toBe(true);
      expect(result.sanitized.url).toBe('https://example.com');
      expect(result.sanitized.username).toBeTruthy();
      expect(result.sanitized.password).toBe('password123');
      expect(result.sanitized.domain).toBe('example.com');
    });

    it('should reject invalid credential objects', () => {
      const invalidCredentials = [
        null,
        undefined,
        'not-an-object',
        {},
        { url: 'invalid-url' },
        { url: 'https://example.com', username: '' },
        { url: 'https://example.com', username: 'user', password: 'short' }
      ];

      invalidCredentials.forEach(credential => {
        expect(() => Validator.validateCredential(credential)).toThrow(ValidationError);
      });
    });
  });

  describe('Import File Validation', () => {
    it('should validate correct import files', () => {
      const validFile = new File(['{}'], 'backup.json', { type: 'application/json' });
      const result = Validator.validateImportFile(validFile);
      expect(result.valid).toBe(true);
    });

    it('should reject files that are too large', () => {
      const largeContent = 'a'.repeat(ValidationRules.MAX_IMPORT_FILE_SIZE + 1);
      const largeFile = new File([largeContent], 'large.json', { type: 'application/json' });
      
      expect(() => Validator.validateImportFile(largeFile)).toThrow(ValidationError);
    });

    it('should reject files with invalid extensions', () => {
      const invalidFile = new File(['{}'], 'backup.exe', { type: 'application/octet-stream' });
      expect(() => Validator.validateImportFile(invalidFile)).toThrow(ValidationError);
    });

    it('should reject null or undefined files', () => {
      expect(() => Validator.validateImportFile(null)).toThrow(ValidationError);
      expect(() => Validator.validateImportFile(undefined)).toThrow(ValidationError);
    });
  });

  describe('Import Data Validation', () => {
    it('should validate correct import data structure', () => {
      const importData = {
        credentials: [
          {
            url: 'https://example.com',
            username: 'user@example.com',
            password: 'password123'
          }
        ]
      };
      
      const result = Validator.validateImportData(importData);
      expect(result.valid).toBe(true);
      expect(result.sanitized.credentials).toHaveLength(1);
    });

    it('should reject invalid import data structures', () => {
      const invalidData = [
        null,
        undefined,
        'not-an-object',
        {},
        { credentials: 'not-an-array' },
        { credentials: [{ invalid: 'credential' }] }
      ];

      invalidData.forEach(data => {
        expect(() => Validator.validateImportData(data)).toThrow(ValidationError);
      });
    });

    it('should provide detailed error for invalid credentials in import', () => {
      const importData = {
        credentials: [
          { url: 'https://example.com', username: 'user', password: 'password123' },
          { url: 'invalid-url', username: 'user', password: 'password123' }
        ]
      };
      
      expect(() => Validator.validateImportData(importData)).toThrow(ValidationError);
    });
  });

  describe('Form Field Data Validation', () => {
    it('should validate form field data', () => {
      const fieldData = {
        username: 'user@example.com',
        password: 'password123',
        url: 'https://example.com'
      };
      
      const result = Validator.validateFormFieldData(fieldData);
      expect(result.valid).toBe(true);
      expect(result.sanitized.username).toBeTruthy();
      expect(result.sanitized.password).toBe('password123');
      expect(result.sanitized.url).toBe('https://example.com');
    });

    it('should handle partial form field data', () => {
      const fieldData = { username: 'user@example.com' };
      const result = Validator.validateFormFieldData(fieldData);
      
      expect(result.valid).toBe(true);
      expect(result.sanitized.username).toBeTruthy();
      expect(result.sanitized.password).toBeUndefined();
    });

    it('should reject invalid form field data', () => {
      expect(() => Validator.validateFormFieldData(null)).toThrow(ValidationError);
      expect(() => Validator.validateFormFieldData('not-an-object')).toThrow(ValidationError);
    });
  });

  describe('Text Sanitization', () => {
    it('should sanitize text input', () => {
      const maliciousText = '<script>alert("xss")</script>Hello & "World"';
      const sanitized = Validator.sanitizeText(maliciousText);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('Hello');
    });
  });

  describe('JSON Sanitization', () => {
    it('should sanitize and parse JSON', () => {
      const jsonString = '{"name": "test", "value": "safe"}';
      const result = Validator.sanitizeJSON(jsonString);
      
      expect(result.name).toBe('test');
      expect(result.value).toBe('safe');
    });

    it('should reject invalid JSON', () => {
      const invalidJson = '{"invalid": json}';
      expect(() => Validator.sanitizeJSON(invalidJson)).toThrow(ValidationError);
    });

    it('should sanitize malicious JSON content', () => {
      const maliciousJson = '{"script": "<script>alert(1)</script>", "safe": "value"}';
      const result = Validator.sanitizeJSON(maliciousJson);
      
      expect(result.script).not.toContain('<script>');
      expect(result.safe).toBe('value');
    });
  });
});

describe('ValidationUtils', () => {
  describe('isEmpty', () => {
    it('should detect empty strings', () => {
      expect(ValidationUtils.isEmpty('')).toBe(true);
      expect(ValidationUtils.isEmpty('   ')).toBe(true);
      expect(ValidationUtils.isEmpty(null)).toBe(true);
      expect(ValidationUtils.isEmpty(undefined)).toBe(true);
      expect(ValidationUtils.isEmpty('text')).toBe(false);
    });
  });

  describe('normalizeURL', () => {
    it('should normalize valid URLs', () => {
      const normalized = ValidationUtils.normalizeURL('example.com');
      expect(normalized).toBe('https://example.com');
    });

    it('should return original URL if normalization fails', () => {
      const invalid = 'not-a-url';
      const result = ValidationUtils.normalizeURL(invalid);
      expect(result).toBe(invalid);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URLs', () => {
      const domain = ValidationUtils.extractDomain('https://sub.example.com/path');
      expect(domain).toBe('sub.example.com');
    });

    it('should return empty string for invalid URLs', () => {
      const domain = ValidationUtils.extractDomain('not-a-url');
      expect(domain).toBe('');
    });
  });

  describe('isSameDomain', () => {
    it('should detect same domains', () => {
      const url1 = 'https://example.com/path1';
      const url2 = 'https://example.com/path2';
      
      expect(ValidationUtils.isSameDomain(url1, url2)).toBe(true);
    });

    it('should detect different domains', () => {
      const url1 = 'https://example.com';
      const url2 = 'https://different.com';
      
      expect(ValidationUtils.isSameDomain(url1, url2)).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(ValidationUtils.isSameDomain('invalid', 'also-invalid')).toBe(false);
    });
  });
});