/**
 * Error Handler Utility for Chrome Password Manager
 * Provides categorized error types, user-friendly messages, and recovery mechanisms
 */

// Error Categories
export const ErrorTypes = {
  AUTHENTICATION: 'AUTHENTICATION',
  ENCRYPTION: 'ENCRYPTION',
  STORAGE: 'STORAGE',
  VALIDATION: 'VALIDATION',
  NETWORK: 'NETWORK',
  IMPORT_EXPORT: 'IMPORT_EXPORT'
};

// Specific Error Classes
export class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_GENERIC') {
    super(message);
    this.name = 'AuthenticationError';
    this.type = ErrorTypes.AUTHENTICATION;
    this.code = code;
    this.retryable = true;
  }
}

export class EncryptionError extends Error {
  constructor(message, code = 'CRYPTO_GENERIC') {
    super(message);
    this.name = 'EncryptionError';
    this.type = ErrorTypes.ENCRYPTION;
    this.code = code;
    this.retryable = false;
  }
}

export class StorageError extends Error {
  constructor(message, code = 'STORAGE_GENERIC') {
    super(message);
    this.name = 'StorageError';
    this.type = ErrorTypes.STORAGE;
    this.code = code;
    this.retryable = true;
  }
}

export class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_GENERIC') {
    super(message);
    this.name = 'ValidationError';
    this.type = ErrorTypes.VALIDATION;
    this.code = code;
    this.field = field;
    this.retryable = true;
  }
}

export class NetworkError extends Error {
  constructor(message, code = 'NETWORK_GENERIC') {
    super(message);
    this.name = 'NetworkError';
    this.type = ErrorTypes.NETWORK;
    this.code = code;
    this.retryable = true;
  }
}

export class ImportExportError extends Error {
  constructor(message, code = 'IMPORT_EXPORT_GENERIC') {
    super(message);
    this.name = 'ImportExportError';
    this.type = ErrorTypes.IMPORT_EXPORT;
    this.code = code;
    this.retryable = true;
  }
}

/**
 * Main Error Handler Class
 */
export class ErrorHandler {
  constructor() {
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  /**
   * Handle and format errors for user display
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context for error handling
   * @returns {Object} Formatted error response
   */
  handleError(error, context = {}) {
    const errorInfo = this.categorizeError(error);
    const userMessage = this.formatUserMessage(errorInfo);
    const recoveryOptions = this.getRecoveryOptions(errorInfo);

    // Log error for debugging (in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error handled:', {
        error: errorInfo,
        context,
        stack: error.stack
      });
    }

    return {
      type: errorInfo.type,
      code: errorInfo.code,
      message: userMessage,
      recoveryOptions,
      retryable: errorInfo.retryable,
      canRetry: this.canRetry(errorInfo.code)
    };
  }

  /**
   * Categorize error and extract relevant information
   * @param {Error} error - The error to categorize
   * @returns {Object} Error information
   */
  categorizeError(error) {
    if (error instanceof AuthenticationError ||
        error instanceof EncryptionError ||
        error instanceof StorageError ||
        error instanceof ValidationError ||
        error instanceof NetworkError ||
        error instanceof ImportExportError) {
      return {
        type: error.type,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        field: error.field || null
      };
    }

    // Handle generic errors
    if (error.message.includes('OAuth') || error.message.includes('authentication')) {
      return {
        type: ErrorTypes.AUTHENTICATION,
        code: 'AUTH_GENERIC',
        message: error.message,
        retryable: true
      };
    }

    if (error.message.includes('decrypt') || error.message.includes('encrypt')) {
      return {
        type: ErrorTypes.ENCRYPTION,
        code: 'CRYPTO_GENERIC',
        message: error.message,
        retryable: false
      };
    }

    // Default categorization
    return {
      type: ErrorTypes.VALIDATION,
      code: 'GENERIC_ERROR',
      message: error.message,
      retryable: true
    };
  }

  /**
   * Format user-friendly error messages
   * @param {Object} errorInfo - Error information
   * @returns {string} User-friendly message
   */
  formatUserMessage(errorInfo) {
    const messageMap = {
      // Authentication Errors
      'INVALID_MASTER_PASSWORD': 'The master password you entered is incorrect. Please try again.',
      'OAUTH_FAILED': 'Gmail authentication failed. Please try signing in again.',
      'SESSION_EXPIRED': 'Your session has expired. Please sign in again.',
      'AUTH_GENERIC': 'Authentication failed. Please check your credentials and try again.',

      // Encryption Errors
      'INVALID_KEY_PHRASE': 'The key phrase you entered is incorrect. Please check and try again.',
      'DECRYPTION_FAILED': 'Unable to decrypt the data. The file may be corrupted or the key phrase is incorrect.',
      'ENCRYPTION_FAILED': 'Failed to encrypt the data. Please try again.',
      'CRYPTO_GENERIC': 'A security error occurred. Please try again.',

      // Storage Errors
      'STORAGE_QUOTA_EXCEEDED': 'Storage space is full. Please free up space and try again.',
      'STORAGE_ACCESS_DENIED': 'Unable to access storage. Please check permissions.',
      'FILE_NOT_FOUND': 'The requested file could not be found.',
      'STORAGE_GENERIC': 'A storage error occurred. Please try again.',

      // Validation Errors
      'INVALID_URL': 'Please enter a valid website URL.',
      'INVALID_EMAIL': 'Please enter a valid email address.',
      'REQUIRED_FIELD': 'This field is required.',
      'PASSWORD_TOO_SHORT': 'Password must be at least 8 characters long.',
      'VALIDATION_GENERIC': 'Please check your input and try again.',

      // Network Errors
      'NETWORK_UNAVAILABLE': 'No internet connection available. Some features may be limited.',
      'REQUEST_TIMEOUT': 'The request timed out. Please check your connection and try again.',
      'NETWORK_GENERIC': 'A network error occurred. Please check your connection.',

      // Import/Export Errors
      'INVALID_FILE_FORMAT': 'The selected file is not in the correct format.',
      'FILE_CORRUPTED': 'The file appears to be corrupted and cannot be imported.',
      'EXPORT_FAILED': 'Failed to export data. Please try again.',
      'IMPORT_FAILED': 'Failed to import data. Please check the file and key phrase.',
      'IMPORT_EXPORT_GENERIC': 'An error occurred during the operation. Please try again.'
    };

    return messageMap[errorInfo.code] || errorInfo.message || 'An unexpected error occurred.';
  }

  /**
   * Get recovery options for different error types
   * @param {Object} errorInfo - Error information
   * @returns {Array} Array of recovery options
   */
  getRecoveryOptions(errorInfo) {
    const recoveryMap = {
      [ErrorTypes.AUTHENTICATION]: [
        'Try entering your password again',
        'Sign out and sign back in',
        'Check your internet connection'
      ],
      [ErrorTypes.ENCRYPTION]: [
        'Verify your key phrase is correct',
        'Check if the file is corrupted',
        'Try importing a different backup file'
      ],
      [ErrorTypes.STORAGE]: [
        'Free up storage space',
        'Check browser permissions',
        'Try refreshing the page'
      ],
      [ErrorTypes.VALIDATION]: [
        'Check your input format',
        'Ensure all required fields are filled',
        'Try a different value'
      ],
      [ErrorTypes.NETWORK]: [
        'Check your internet connection',
        'Try again in a few moments',
        'Use offline features if available'
      ],
      [ErrorTypes.IMPORT_EXPORT]: [
        'Verify the file format is correct',
        'Check your key phrase',
        'Try with a different file'
      ]
    };

    return recoveryMap[errorInfo.type] || ['Try again', 'Refresh the page'];
  }

  /**
   * Check if an error can be retried
   * @param {string} errorCode - Error code
   * @returns {boolean} Whether retry is allowed
   */
  canRetry(errorCode) {
    const attempts = this.retryAttempts.get(errorCode) || 0;
    return attempts < this.maxRetries;
  }

  /**
   * Record a retry attempt
   * @param {string} errorCode - Error code
   */
  recordRetry(errorCode) {
    const attempts = this.retryAttempts.get(errorCode) || 0;
    this.retryAttempts.set(errorCode, attempts + 1);
  }

  /**
   * Reset retry count for an error code
   * @param {string} errorCode - Error code
   */
  resetRetries(errorCode) {
    this.retryAttempts.delete(errorCode);
  }

  /**
   * Create specific error instances
   */
  static createAuthError(message, code = 'AUTH_GENERIC') {
    return new AuthenticationError(message, code);
  }

  static createEncryptionError(message, code = 'CRYPTO_GENERIC') {
    return new EncryptionError(message, code);
  }

  static createStorageError(message, code = 'STORAGE_GENERIC') {
    return new StorageError(message, code);
  }

  static createValidationError(message, field = null, code = 'VALIDATION_GENERIC') {
    return new ValidationError(message, field, code);
  }

  static createNetworkError(message, code = 'NETWORK_GENERIC') {
    return new NetworkError(message, code);
  }

  static createImportExportError(message, code = 'IMPORT_EXPORT_GENERIC') {
    return new ImportExportError(message, code);
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();