/**
 * Tests for Data Sanitization Utility
 */

import { describe, it, expect } from 'vitest';
import { DataSanitizer, SanitizationConfig, SanitizationUtils } from '../src/utils/sanitization.js';

describe('DataSanitizer', () => {
  describe('Text Sanitization', () => {
    it('should sanitize basic text input', () => {
      const input = 'Hello World';
      const result = DataSanitizer.sanitizeText(input);
      expect(result).toBe('Hello World');
    });

    it('should remove dangerous script patterns', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello World';
      const result = DataSanitizer.sanitizeText(maliciousInput);
      
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('Hello World');
    });

    it('should remove SQL injection patterns', () => {
      const sqlInput = "'; DROP TABLE users; --";
      const result = DataSanitizer.sanitizeText(sqlInput);
      
      expect(result).not.toContain('DROP TABLE');
      expect(result).not.toContain('--');
    });

    it('should remove path traversal patterns', () => {
      const pathInput = '../../../etc/passwd';
      const result = DataSanitizer.sanitizeText(pathInput);
      
      expect(result).not.toContain('../');
    });

    it('should remove control characters', () => {
      const controlInput = 'Hello\x00\x01World\x7F';
      const result = DataSanitizer.sanitizeText(controlInput);
      
      expect(result).toBe('HelloWorld');
    });

    it('should HTML escape when requested', () => {
      const htmlInput = '<div>Hello & "World"</div>';
      const result = DataSanitizer.sanitizeText(htmlInput, { htmlEscape: true });
      
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
    });

    it('should enforce maximum length', () => {
      const longInput = 'a'.repeat(1000);
      const result = DataSanitizer.sanitizeText(longInput, { maxLength: 100 });
      
      expect(result.length).toBe(100);
    });

    it('should preserve patterns when requested', () => {
      const input = 'SELECT * FROM users';
      const result = DataSanitizer.sanitizeText(input, { preservePatterns: true });
      
      expect(result).toContain('SELECT');
    });

    it('should handle non-string input', () => {
      expect(DataSanitizer.sanitizeText(null)).toBe('');
      expect(DataSanitizer.sanitizeText(undefined)).toBe('');
      expect(DataSanitizer.sanitizeText(123)).toBe('');
      expect(DataSanitizer.sanitizeText({})).toBe('');
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize valid URLs', () => {
      const url = 'https://example.com/path';
      const result = DataSanitizer.sanitizeURL(url);
      expect(result).toBe('https://example.com/path');
    });

    it('should add https protocol to URLs without protocol', () => {
      const url = 'example.com';
      const result = DataSanitizer.sanitizeURL(url);
      expect(result).toBe('https://example.com');
    });

    it('should remove dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd'
      ];

      dangerousUrls.forEach(url => {
        const result = DataSanitizer.sanitizeURL(url);
        expect(result).toStartWith('https:');
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('vbscript:');
        expect(result).not.toContain('data:');
        expect(result).not.toContain('file:');
      });
    });

    it('should handle non-string input', () => {
      expect(DataSanitizer.sanitizeURL(null)).toBe('');
      expect(DataSanitizer.sanitizeURL(undefined)).toBe('');
      expect(DataSanitizer.sanitizeURL(123)).toBe('');
    });
  });

  describe('Username Sanitization', () => {
    it('should sanitize usernames with HTML escaping', () => {
      const username = 'user<script>alert(1)</script>@example.com';
      const result = DataSanitizer.sanitizeUsername(username);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
      expect(result).toContain('user');
      expect(result).toContain('@example.com');
    });

    it('should enforce username length limits', () => {
      const longUsername = 'a'.repeat(200);
      const result = DataSanitizer.sanitizeUsername(longUsername);
      
      expect(result.length).toBeLessThanOrEqual(SanitizationConfig.MAX_LENGTHS.USERNAME);
    });
  });

  describe('Password Sanitization', () => {
    it('should minimally sanitize passwords', () => {
      const password = 'MyP@ssw0rd!';
      const result = DataSanitizer.sanitizePassword(password);
      expect(result).toBe('MyP@ssw0rd!');
    });

    it('should remove control characters from passwords', () => {
      const password = 'Pass\x00word\x01';
      const result = DataSanitizer.sanitizePassword(password);
      expect(result).toBe('Password');
    });

    it('should enforce password length limits', () => {
      const longPassword = 'a'.repeat(200);
      const result = DataSanitizer.sanitizePassword(longPassword);
      
      expect(result.length).toBeLessThanOrEqual(SanitizationConfig.MAX_LENGTHS.PASSWORD);
    });

    it('should preserve special characters in passwords', () => {
      const password = 'P@$$w0rd!#$%^&*()';
      const result = DataSanitizer.sanitizePassword(password);
      expect(result).toBe(password);
    });
  });

  describe('Import Data Sanitization', () => {
    it('should sanitize import data recursively', () => {
      const importData = {
        credentials: [
          {
            url: 'https://example.com',
            username: 'user<script>alert(1)</script>',
            password: 'password123'
          }
        ],
        metadata: {
          version: '1.0',
          description: 'Test <b>data</b>'
        }
      };

      const result = DataSanitizer.sanitizeImportData(importData);
      
      expect(result.credentials[0].username).not.toContain('<script>');
      expect(result.credentials[0].password).toBe('password123');
      expect(result.metadata.description).not.toContain('<b>');
    });

    it('should handle different field types appropriately', () => {
      const importData = {
        url: 'example.com',
        website: 'test.com',
        username: 'user@test.com',
        email: 'user@test.com',
        password: 'secret123',
        notes: 'Some <b>notes</b>'
      };

      const result = DataSanitizer.sanitizeImportData(importData);
      
      expect(result.url).toBe('https://example.com');
      expect(result.website).toBe('https://test.com');
      expect(result.password).toBe('secret123');
      expect(result.notes).not.toContain('<b>');
    });

    it('should handle arrays in import data', () => {
      const importData = {
        credentials: [
          { username: 'user1<script>', password: 'pass1' },
          { username: 'user2<script>', password: 'pass2' }
        ]
      };

      const result = DataSanitizer.sanitizeImportData(importData);
      
      expect(result.credentials).toHaveLength(2);
      result.credentials.forEach(cred => {
        expect(cred.username).not.toContain('<script>');
      });
    });

    it('should handle non-object input', () => {
      expect(DataSanitizer.sanitizeImportData(null)).toEqual({});
      expect(DataSanitizer.sanitizeImportData('string')).toEqual({});
      expect(DataSanitizer.sanitizeImportData(123)).toEqual({});
    });
  });

  describe('Form Data Sanitization', () => {
    it('should sanitize form field data', () => {
      const formData = {
        username: 'user<script>alert(1)</script>',
        password: 'password123',
        url: 'example.com',
        domain: 'example.com'
      };

      const result = DataSanitizer.sanitizeFormData(formData);
      
      expect(result.username).not.toContain('<script>');
      expect(result.password).toBe('password123');
      expect(result.url).toBe('https://example.com');
      expect(result.domain).toBe('example.com');
    });

    it('should handle partial form data', () => {
      const formData = { username: 'user@test.com' };
      const result = DataSanitizer.sanitizeFormData(formData);
      
      expect(result.username).toBe('user@test.com');
      expect(result.password).toBeUndefined();
    });

    it('should handle invalid form data', () => {
      expect(DataSanitizer.sanitizeFormData(null)).toEqual({});
      expect(DataSanitizer.sanitizeFormData('string')).toEqual({});
    });
  });

  describe('HTML Escaping', () => {
    it('should escape HTML characters', () => {
      const html = '<div class="test">Hello & "World"</div>';
      const result = DataSanitizer.escapeHTML(html);
      
      expect(result).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;World&quot;&lt;&#x2F;div&gt;');
    });

    it('should unescape HTML characters', () => {
      const escaped = '&lt;div&gt;Hello &amp; &quot;World&quot;&lt;&#x2F;div&gt;';
      const result = DataSanitizer.unescapeHTML(escaped);
      
      expect(result).toBe('<div>Hello & "World"</div>');
    });

    it('should handle non-string input for HTML operations', () => {
      expect(DataSanitizer.escapeHTML(null)).toBe('');
      expect(DataSanitizer.unescapeHTML(undefined)).toBe('');
    });
  });

  describe('JSON Sanitization', () => {
    it('should sanitize JSON strings', () => {
      const jsonString = '{"name": "test<script>", "value": "safe"}';
      const result = DataSanitizer.sanitizeJSONString(jsonString);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('test');
    });

    it('should handle non-string JSON input', () => {
      expect(DataSanitizer.sanitizeJSONString(null)).toBe('{}');
      expect(DataSanitizer.sanitizeJSONString(123)).toBe('{}');
    });
  });

  describe('Deep Sanitization', () => {
    it('should deeply sanitize nested objects', () => {
      const obj = {
        level1: {
          level2: {
            dangerous: '<script>alert(1)</script>',
            safe: 'value'
          },
          array: ['<script>test</script>', 'safe']
        },
        number: 123,
        boolean: true
      };

      const result = DataSanitizer.deepSanitize(obj);
      
      expect(result.level1.level2.dangerous).not.toContain('<script>');
      expect(result.level1.level2.safe).toBe('value');
      expect(result.level1.array[0]).not.toContain('<script>');
      expect(result.level1.array[1]).toBe('safe');
      expect(result.number).toBe(123);
      expect(result.boolean).toBe(true);
    });

    it('should handle primitive values', () => {
      expect(DataSanitizer.deepSanitize('test')).toBe('test');
      expect(DataSanitizer.deepSanitize(123)).toBe(123);
      expect(DataSanitizer.deepSanitize(true)).toBe(true);
      expect(DataSanitizer.deepSanitize(null)).toBe(null);
    });
  });

  describe('Dangerous Content Detection', () => {
    it('should detect dangerous script content', () => {
      const dangerous = '<script>alert(1)</script>';
      expect(DataSanitizer.containsDangerousContent(dangerous)).toBe(true);
    });

    it('should detect SQL injection patterns', () => {
      const dangerous = "'; DROP TABLE users; --";
      expect(DataSanitizer.containsDangerousContent(dangerous)).toBe(true);
    });

    it('should not flag safe content', () => {
      const safe = 'This is safe content';
      expect(DataSanitizer.containsDangerousContent(safe)).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(DataSanitizer.containsDangerousContent(null)).toBe(false);
      expect(DataSanitizer.containsDangerousContent(123)).toBe(false);
    });
  });

  describe('HTML Stripping', () => {
    it('should strip HTML tags', () => {
      const html = '<div class="test">Hello <b>World</b></div>';
      const result = DataSanitizer.stripHTML(html);
      
      expect(result).toBe('Hello World');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should remove HTML entities', () => {
      const html = 'Hello &amp; &quot;World&quot;';
      const result = DataSanitizer.stripHTML(html);
      
      expect(result).toBe('Hello World');
    });

    it('should normalize whitespace', () => {
      const html = '<div>  Hello   \n\n  World  </div>';
      const result = DataSanitizer.stripHTML(html);
      
      expect(result).toBe('Hello World');
    });
  });

  describe('File Name Sanitization', () => {
    it('should sanitize file names', () => {
      const fileName = 'My File<>:"/\\|?*.txt';
      const result = DataSanitizer.sanitizeFileName(fileName);
      
      expect(result).toBe('my_file.txt');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain(':');
    });

    it('should remove leading and trailing dots', () => {
      const fileName = '...file.txt...';
      const result = DataSanitizer.sanitizeFileName(fileName);
      
      expect(result).toBe('file.txt');
    });

    it('should replace spaces with underscores', () => {
      const fileName = 'my file name.txt';
      const result = DataSanitizer.sanitizeFileName(fileName);
      
      expect(result).toBe('my_file_name.txt');
    });

    it('should handle non-string input', () => {
      expect(DataSanitizer.sanitizeFileName(null)).toBe('untitled');
      expect(DataSanitizer.sanitizeFileName(undefined)).toBe('untitled');
    });
  });
});

describe('SanitizationUtils', () => {
  describe('Quick Sanitization Methods', () => {
    it('should sanitize for display', () => {
      const text = '<script>alert(1)</script>Hello';
      const result = SanitizationUtils.forDisplay(text);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
    });

    it('should sanitize for storage', () => {
      const text = '<script>alert(1)</script>Hello';
      const result = SanitizationUtils.forStorage(text);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('should sanitize URLs', () => {
      const url = 'example.com';
      const result = SanitizationUtils.forURL(url);
      
      expect(result).toBe('https://example.com');
    });

    it('should sanitize credentials', () => {
      const credential = {
        url: 'example.com',
        username: 'user<script>',
        password: 'password123'
      };
      
      const result = SanitizationUtils.forCredential(credential);
      
      expect(result.url).toBe('https://example.com');
      expect(result.username).not.toContain('<script>');
      expect(result.password).toBe('password123');
    });

    it('should handle missing credential fields', () => {
      const credential = {};
      const result = SanitizationUtils.forCredential(credential);
      
      expect(result.url).toBe('https://');
      expect(result.username).toBe('');
      expect(result.password).toBe('');
    });
  });
});