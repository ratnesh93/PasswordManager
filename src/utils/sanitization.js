/**
 * Data Sanitization Utility
 * Provides comprehensive data sanitization for security
 */

/**
 * Sanitization Configuration
 */
export const SanitizationConfig = {
  // Maximum lengths for different data types
  MAX_LENGTHS: {
    URL: 2048,
    USERNAME: 100,
    PASSWORD: 128,
    DOMAIN: 253,
    TEXT_FIELD: 500
  },

  // Patterns for detecting potentially malicious content
  DANGEROUS_PATTERNS: [
    // Script injection patterns
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onclick\s*=/gi,
    
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(--|\/\*|\*\/|;)/g,
    
    // Path traversal patterns
    /\.\.\//g,
    /\.\.\\/g,
    
    // Command injection patterns
    /(\||&|;|\$\(|\`)/g
  ],

  // Characters to escape in HTML context
  HTML_ESCAPE_MAP: {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  },

  // Characters to remove completely
  FORBIDDEN_CHARS: [
    '\x00', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07',
    '\x08', '\x0B', '\x0C', '\x0E', '\x0F', '\x10', '\x11', '\x12',
    '\x13', '\x14', '\x15', '\x16', '\x17', '\x18', '\x19', '\x1A',
    '\x1B', '\x1C', '\x1D', '\x1E', '\x1F', '\x7F'
  ]
};

/**
 * Main Sanitization Class
 */
export class DataSanitizer {
  /**
   * Sanitize general text input
   * @param {string} input - Text to sanitize
   * @param {Object} options - Sanitization options
   * @returns {string} Sanitized text
   */
  static sanitizeText(input, options = {}) {
    if (typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Remove forbidden control characters
    SanitizationConfig.FORBIDDEN_CHARS.forEach(char => {
      sanitized = sanitized.replace(new RegExp(char, 'g'), '');
    });

    // HTML escape if requested (do this before removing patterns to preserve escaped content)
    if (options.htmlEscape) {
      sanitized = this.escapeHTML(sanitized);
    }

    // Remove dangerous patterns if not preserving them
    if (!options.preservePatterns) {
      SanitizationConfig.DANGEROUS_PATTERNS.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
      });
    }

    // Trim whitespace
    sanitized = sanitized.trim();

    // Enforce maximum length
    const maxLength = options.maxLength || SanitizationConfig.MAX_LENGTHS.TEXT_FIELD;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize URL input
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   */
  static sanitizeURL(url) {
    if (typeof url !== 'string') {
      return '';
    }

    let sanitized = url.trim();

    // Return empty string if input is empty
    if (!sanitized) {
      return '';
    }

    // Remove dangerous patterns
    sanitized = this.sanitizeText(sanitized, { 
      maxLength: SanitizationConfig.MAX_LENGTHS.URL,
      preservePatterns: false
    });

    // Ensure URL uses safe protocols
    if (sanitized && !sanitized.match(/^https?:\/\//)) {
      // Add https if no protocol specified
      sanitized = 'https://' + sanitized;
    }

    // Remove any remaining dangerous protocols
    sanitized = sanitized.replace(/^(javascript|vbscript|data|file):/gi, 'https:');

    return sanitized;
  }

  /**
   * Sanitize username input
   * @param {string} username - Username to sanitize
   * @returns {string} Sanitized username
   */
  static sanitizeUsername(username) {
    if (typeof username !== 'string') {
      return '';
    }

    return this.sanitizeText(username, {
      maxLength: SanitizationConfig.MAX_LENGTHS.USERNAME,
      htmlEscape: true,
      preservePatterns: false
    });
  }

  /**
   * Sanitize password (minimal sanitization to preserve functionality)
   * @param {string} password - Password to sanitize
   * @returns {string} Sanitized password
   */
  static sanitizePassword(password) {
    if (typeof password !== 'string') {
      return '';
    }

    let sanitized = password;

    // Only remove control characters, preserve everything else
    SanitizationConfig.FORBIDDEN_CHARS.forEach(char => {
      sanitized = sanitized.replace(new RegExp(char, 'g'), '');
    });

    // Enforce maximum length
    if (sanitized.length > SanitizationConfig.MAX_LENGTHS.PASSWORD) {
      sanitized = sanitized.substring(0, SanitizationConfig.MAX_LENGTHS.PASSWORD);
    }

    return sanitized;
  }

  /**
   * Sanitize imported file data
   * @param {Object} data - Data from imported file
   * @returns {Object} Sanitized data
   */
  static sanitizeImportData(data) {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const sanitized = {};

    // Sanitize each property recursively
    for (const [key, value] of Object.entries(data)) {
      const sanitizedKey = this.sanitizeText(key, { htmlEscape: true });
      
      if (Array.isArray(value)) {
        sanitized[sanitizedKey] = value.map(item => this.sanitizeImportData(item));
      } else if (value && typeof value === 'object') {
        sanitized[sanitizedKey] = this.sanitizeImportData(value);
      } else if (typeof value === 'string') {
        // Special handling for different field types
        if (key === 'password') {
          sanitized[sanitizedKey] = this.sanitizePassword(value);
        } else if (key === 'url' || key === 'website') {
          sanitized[sanitizedKey] = this.sanitizeURL(value);
        } else if (key === 'username' || key === 'email') {
          sanitized[sanitizedKey] = this.sanitizeUsername(value);
        } else {
          sanitized[sanitizedKey] = this.sanitizeText(value, { htmlEscape: true });
        }
      } else {
        sanitized[sanitizedKey] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize form field data from content scripts
   * @param {Object} fieldData - Form field data
   * @returns {Object} Sanitized field data
   */
  static sanitizeFormData(fieldData) {
    if (!fieldData || typeof fieldData !== 'object') {
      return {};
    }

    const sanitized = {};

    if (fieldData.username) {
      sanitized.username = this.sanitizeUsername(fieldData.username);
    }

    if (fieldData.password) {
      sanitized.password = this.sanitizePassword(fieldData.password);
    }

    if (fieldData.url) {
      sanitized.url = this.sanitizeURL(fieldData.url);
    }

    if (fieldData.domain) {
      sanitized.domain = this.sanitizeText(fieldData.domain, {
        maxLength: SanitizationConfig.MAX_LENGTHS.DOMAIN,
        htmlEscape: true
      });
    }

    return sanitized;
  }

  /**
   * Escape HTML characters
   * @param {string} text - Text to escape
   * @returns {string} HTML-escaped text
   */
  static escapeHTML(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text.replace(/[&<>"'\/]/g, (char) => {
      return SanitizationConfig.HTML_ESCAPE_MAP[char] || char;
    });
  }

  /**
   * Unescape HTML characters (for display purposes)
   * @param {string} text - HTML-escaped text
   * @returns {string} Unescaped text
   */
  static unescapeHTML(text) {
    if (typeof text !== 'string') {
      return '';
    }

    const reverseMap = {};
    for (const [char, entity] of Object.entries(SanitizationConfig.HTML_ESCAPE_MAP)) {
      reverseMap[entity] = char;
    }

    return text.replace(/&(amp|lt|gt|quot|#x27|#x2F);/g, (entity) => {
      return reverseMap[entity] || entity;
    });
  }

  /**
   * Sanitize JSON string before parsing
   * @param {string} jsonString - JSON string to sanitize
   * @returns {string} Sanitized JSON string
   */
  static sanitizeJSONString(jsonString) {
    if (typeof jsonString !== 'string') {
      return '{}';
    }

    let sanitized = jsonString;

    // Remove dangerous patterns that could be in JSON values
    SanitizationConfig.DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Remove control characters
    SanitizationConfig.FORBIDDEN_CHARS.forEach(char => {
      sanitized = sanitized.replace(new RegExp(char, 'g'), '');
    });

    return sanitized;
  }

  /**
   * Deep sanitize an object structure
   * @param {*} obj - Object to sanitize
   * @param {Object} options - Sanitization options
   * @returns {*} Sanitized object
   */
  static deepSanitize(obj, options = {}) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeText(obj, options);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitize(item, options));
    }

    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeText(key, { htmlEscape: true });
        sanitized[sanitizedKey] = this.deepSanitize(value, options);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Check if input contains potentially dangerous content
   * @param {string} input - Input to check
   * @returns {boolean} True if dangerous content detected
   */
  static containsDangerousContent(input) {
    if (typeof input !== 'string') {
      return false;
    }

    return SanitizationConfig.DANGEROUS_PATTERNS.some(pattern => 
      pattern.test(input)
    );
  }

  /**
   * Remove all HTML tags from text
   * @param {string} html - HTML text
   * @returns {string} Plain text
   */
  static stripHTML(html) {
    if (typeof html !== 'string') {
      return '';
    }

    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Sanitize file name for safe storage
   * @param {string} fileName - File name to sanitize
   * @returns {string} Sanitized file name
   */
  static sanitizeFileName(fileName) {
    if (typeof fileName !== 'string') {
      return 'untitled';
    }

    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid file name characters
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, '') // Remove trailing dots
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 255) // Limit length
      .toLowerCase();
  }
}

/**
 * Utility functions for common sanitization tasks
 */
export const SanitizationUtils = {
  /**
   * Quick sanitize for display in UI
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  forDisplay(text) {
    return DataSanitizer.sanitizeText(text, { htmlEscape: true });
  },

  /**
   * Quick sanitize for storage
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  forStorage(text) {
    return DataSanitizer.sanitizeText(text, { preservePatterns: false });
  },

  /**
   * Quick sanitize for URLs
   * @param {string} url - URL to sanitize
   * @returns {string} Sanitized URL
   */
  forURL(url) {
    return DataSanitizer.sanitizeURL(url);
  },

  /**
   * Quick sanitize for credentials
   * @param {Object} credential - Credential to sanitize
   * @returns {Object} Sanitized credential
   */
  forCredential(credential) {
    return {
      url: DataSanitizer.sanitizeURL(credential.url || ''),
      username: DataSanitizer.sanitizeUsername(credential.username || ''),
      password: DataSanitizer.sanitizePassword(credential.password || '')
    };
  }
};