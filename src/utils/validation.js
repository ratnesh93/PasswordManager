/**
 * Validation Utility for Chrome Password Manager
 * Provides input validation for all user inputs and data sanitization
 */

import { ValidationError } from './error-handler.js';

/**
 * Validation Rules and Patterns
 */
export const ValidationRules = {
  // URL validation pattern
  URL_PATTERN: /^https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?$/,
  
  // Email validation pattern
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // Password strength requirements
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  
  // Username requirements
  USERNAME_MAX_LENGTH: 100,
  
  // URL requirements
  URL_MAX_LENGTH: 2048,
  
  // Key phrase requirements
  KEY_PHRASE_WORD_COUNT: 16,
  
  // File size limits (in bytes)
  MAX_IMPORT_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Allowed file extensions for import
  ALLOWED_IMPORT_EXTENSIONS: ['.json', '.txt'],
  
  // Domain validation pattern
  DOMAIN_PATTERN: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
};

/**
 * Main Validation Class
 */
export class Validator {
  /**
   * Validate website URL
   * @param {string} url - URL to validate
   * @param {boolean} required - Whether the field is required
   * @returns {Object} Validation result
   */
  static validateURL(url, required = true) {
    if (!url || url.trim() === '') {
      if (required) {
        throw new ValidationError('Website URL is required', 'url', 'REQUIRED_FIELD');
      }
      return { valid: true, normalized: '' };
    }

    const trimmedUrl = url.trim();
    
    // Check length
    if (trimmedUrl.length > ValidationRules.URL_MAX_LENGTH) {
      throw new ValidationError('URL is too long', 'url', 'INVALID_URL');
    }

    // Normalize URL - add protocol if missing
    let normalizedUrl = trimmedUrl;
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Additional URL validation
    try {
      const urlObj = new URL(normalizedUrl);
      
      // Check for valid domain
      if (!ValidationRules.DOMAIN_PATTERN.test(urlObj.hostname)) {
        throw new ValidationError('Invalid domain name', 'url', 'INVALID_URL');
      }

      // Validate URL format with regex as well
      if (!ValidationRules.URL_PATTERN.test(normalizedUrl)) {
        throw new ValidationError('Please enter a valid website URL', 'url', 'INVALID_URL');
      }
      
      return { 
        valid: true, 
        normalized: normalizedUrl,
        domain: urlObj.hostname,
        protocol: urlObj.protocol
      };
    } catch (error) {
      throw new ValidationError('Please enter a valid website URL', 'url', 'INVALID_URL');
    }
  }

  /**
   * Validate username
   * @param {string} username - Username to validate
   * @param {boolean} required - Whether the field is required
   * @returns {Object} Validation result
   */
  static validateUsername(username, required = true) {
    if (!username || username.trim() === '') {
      if (required) {
        throw new ValidationError('Username is required', 'username', 'REQUIRED_FIELD');
      }
      return { valid: true, sanitized: '' };
    }

    const trimmedUsername = username.trim();
    
    // Check length
    if (trimmedUsername.length > ValidationRules.USERNAME_MAX_LENGTH) {
      throw new ValidationError('Username is too long', 'username', 'VALIDATION_GENERIC');
    }

    // Sanitize username (remove potentially harmful characters)
    const sanitized = Validator.sanitizeText(trimmedUsername);
    
    return { valid: true, sanitized };
  }

  /**
   * Validate password
   * @param {string} password - Password to validate
   * @param {boolean} required - Whether the field is required
   * @returns {Object} Validation result
   */
  static validatePassword(password, required = true) {
    if (!password || password === '') {
      if (required) {
        throw new ValidationError('Password is required', 'password', 'REQUIRED_FIELD');
      }
      return { valid: true };
    }

    // Check minimum length
    if (password.length < ValidationRules.PASSWORD_MIN_LENGTH) {
      throw new ValidationError(
        `Password must be at least ${ValidationRules.PASSWORD_MIN_LENGTH} characters long`, 
        'password', 
        'PASSWORD_TOO_SHORT'
      );
    }

    // Check maximum length
    if (password.length > ValidationRules.PASSWORD_MAX_LENGTH) {
      throw new ValidationError('Password is too long', 'password', 'VALIDATION_GENERIC');
    }

    return { valid: true };
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @param {boolean} required - Whether the field is required
   * @returns {Object} Validation result
   */
  static validateEmail(email, required = true) {
    if (!email || email.trim() === '') {
      if (required) {
        throw new ValidationError('Email address is required', 'email', 'REQUIRED_FIELD');
      }
      return { valid: true, normalized: '' };
    }

    const trimmedEmail = email.trim().toLowerCase();
    
    if (!ValidationRules.EMAIL_PATTERN.test(trimmedEmail)) {
      throw new ValidationError('Please enter a valid email address', 'email', 'INVALID_EMAIL');
    }

    return { valid: true, normalized: trimmedEmail };
  }

  /**
   * Validate key phrase
   * @param {Array|string} keyPhrase - Key phrase to validate
   * @returns {Object} Validation result
   */
  static validateKeyPhrase(keyPhrase) {
    if (!keyPhrase) {
      throw new ValidationError('Key phrase is required', 'keyPhrase', 'REQUIRED_FIELD');
    }

    let words;
    if (typeof keyPhrase === 'string') {
      words = keyPhrase.trim().split(/\s+/).filter(word => word.length > 0);
    } else if (Array.isArray(keyPhrase)) {
      words = keyPhrase.filter(word => word && word.trim().length > 0);
    } else {
      throw new ValidationError('Invalid key phrase format', 'keyPhrase', 'VALIDATION_GENERIC');
    }

    if (words.length !== ValidationRules.KEY_PHRASE_WORD_COUNT) {
      throw new ValidationError(
        `Key phrase must contain exactly ${ValidationRules.KEY_PHRASE_WORD_COUNT} words`, 
        'keyPhrase', 
        'INVALID_KEY_PHRASE'
      );
    }

    // Sanitize words
    const sanitizedWords = words.map(word => Validator.sanitizeText(word.trim().toLowerCase()));
    
    return { valid: true, sanitized: sanitizedWords };
  }

  /**
   * Validate credential data
   * @param {Object} credential - Credential object to validate
   * @returns {Object} Validation result with sanitized data
   */
  static validateCredential(credential) {
    if (!credential || typeof credential !== 'object') {
      throw new ValidationError('Invalid credential data', null, 'VALIDATION_GENERIC');
    }

    const urlResult = this.validateURL(credential.url, true);
    const usernameResult = Validator.validateUsername(credential.username, true);
    const passwordResult = Validator.validatePassword(credential.password, true);

    return {
      valid: true,
      sanitized: {
        url: urlResult.normalized,
        username: usernameResult.sanitized,
        password: credential.password, // Don't sanitize passwords
        domain: urlResult.domain
      }
    };
  }

  /**
   * Validate import file
   * @param {File} file - File to validate
   * @returns {Object} Validation result
   */
  static validateImportFile(file) {
    if (!file) {
      throw new ValidationError('Please select a file to import', 'file', 'REQUIRED_FIELD');
    }

    // Check file size
    if (file.size > ValidationRules.MAX_IMPORT_FILE_SIZE) {
      throw new ValidationError(
        'File is too large. Maximum size is 10MB', 
        'file', 
        'INVALID_FILE_FORMAT'
      );
    }

    // Check file extension
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ValidationRules.ALLOWED_IMPORT_EXTENSIONS.some(ext => 
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      throw new ValidationError(
        'Invalid file format. Please select a JSON or text file', 
        'file', 
        'INVALID_FILE_FORMAT'
      );
    }

    return { valid: true };
  }

  /**
   * Validate imported data structure
   * @param {Object} data - Parsed import data
   * @returns {Object} Validation result with sanitized data
   */
  static validateImportData(data) {
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Invalid file format', null, 'INVALID_FILE_FORMAT');
    }

    // Check for required structure
    if (!data.credentials || !Array.isArray(data.credentials)) {
      throw new ValidationError('Invalid file format - missing credentials array', null, 'INVALID_FILE_FORMAT');
    }

    // Validate each credential
    const sanitizedCredentials = [];
    for (let i = 0; i < data.credentials.length; i++) {
      try {
        const credentialResult = Validator.validateCredential(data.credentials[i]);
        sanitizedCredentials.push(credentialResult.sanitized);
      } catch (error) {
        throw new ValidationError(
          `Invalid credential at position ${i + 1}: ${error.message}`, 
          null, 
          'INVALID_FILE_FORMAT'
        );
      }
    }

    return {
      valid: true,
      sanitized: {
        ...data,
        credentials: sanitizedCredentials
      }
    };
  }

  /**
   * Sanitize text input to prevent XSS and other attacks
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  static sanitizeText(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove script content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove potentially dangerous characters
      .replace(/[<>'"&]/g, (match) => {
        const entityMap = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return entityMap[match];
      })
      // Trim whitespace
      .trim();
  }

  /**
   * Sanitize JSON data to prevent injection attacks
   * @param {string} jsonString - JSON string to sanitize
   * @returns {Object} Parsed and sanitized JSON
   */
  static sanitizeJSON(jsonString) {
    if (typeof jsonString !== 'string') {
      throw new ValidationError('Invalid JSON data', null, 'INVALID_FILE_FORMAT');
    }

    try {
      // Parse JSON
      const data = JSON.parse(jsonString);
      
      // Recursively sanitize all string values
      return Validator.sanitizeObjectStrings(data);
    } catch (error) {
      throw new ValidationError('Invalid JSON format', null, 'INVALID_FILE_FORMAT');
    }
  }

  /**
   * Recursively sanitize all string values in an object
   * @param {*} obj - Object to sanitize
   * @returns {*} Sanitized object
   */
  static sanitizeObjectStrings(obj) {
    if (typeof obj === 'string') {
      return Validator.sanitizeText(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => Validator.sanitizeObjectStrings(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Don't sanitize password fields
        if (key === 'password') {
          sanitized[key] = value;
        } else {
          sanitized[key] = Validator.sanitizeObjectStrings(value);
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Validate form field detection data
   * @param {Object} fieldData - Form field data from content script
   * @returns {Object} Validation result
   */
  static validateFormFieldData(fieldData) {
    if (!fieldData || typeof fieldData !== 'object') {
      throw new ValidationError('Invalid form field data', null, 'VALIDATION_GENERIC');
    }

    const result = {
      valid: true,
      sanitized: {}
    };

    // Validate username field if present
    if (fieldData.username !== undefined) {
      const usernameResult = Validator.validateUsername(fieldData.username, false);
      result.sanitized.username = usernameResult.sanitized;
    }

    // Validate password field if present
    if (fieldData.password !== undefined) {
      const passwordResult = Validator.validatePassword(fieldData.password, false);
      result.sanitized.password = fieldData.password; // Don't sanitize passwords
    }

    // Validate URL if present
    if (fieldData.url) {
      const urlResult = Validator.validateURL(fieldData.url, false);
      result.sanitized.url = urlResult.normalized;
      result.sanitized.domain = urlResult.domain;
    }

    return result;
  }
}

/**
 * Utility functions for common validation tasks
 */
export const ValidationUtils = {
  /**
   * Check if a string is empty or only whitespace
   * @param {string} str - String to check
   * @returns {boolean} True if empty
   */
  isEmpty(str) {
    return !str || str.trim() === '';
  },

  /**
   * Normalize URL for consistent storage and matching
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  normalizeURL(url) {
    try {
      const result = Validator.validateURL(url);
      return result.normalized;
    } catch (error) {
      return url; // Return original if validation fails
    }
  },

  /**
   * Extract domain from URL for matching
   * @param {string} url - URL to extract domain from
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const result = Validator.validateURL(url);
      return result.domain;
    } catch (error) {
      return ''; // Return empty if extraction fails
    }
  },

  /**
   * Check if two URLs belong to the same domain
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {boolean} True if same domain
   */
  isSameDomain(url1, url2) {
    const domain1 = this.extractDomain(url1);
    const domain2 = this.extractDomain(url2);
    return domain1 && domain2 && domain1 === domain2;
  }
};