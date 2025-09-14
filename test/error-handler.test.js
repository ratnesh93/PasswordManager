/**
 * Tests for Error Handler Utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorHandler,
  AuthenticationError,
  EncryptionError,
  StorageError,
  ValidationError,
  NetworkError,
  ImportExportError,
  ErrorTypes,
  errorHandler
} from '../src/utils/error-handler.js';

describe('Error Handler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('Error Classes', () => {
    it('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Invalid password', 'INVALID_MASTER_PASSWORD');
      
      expect(error.name).toBe('AuthenticationError');
      expect(error.type).toBe(ErrorTypes.AUTHENTICATION);
      expect(error.code).toBe('INVALID_MASTER_PASSWORD');
      expect(error.message).toBe('Invalid password');
      expect(error.retryable).toBe(true);
    });

    it('should create EncryptionError with correct properties', () => {
      const error = new EncryptionError('Decryption failed', 'DECRYPTION_FAILED');
      
      expect(error.name).toBe('EncryptionError');
      expect(error.type).toBe(ErrorTypes.ENCRYPTION);
      expect(error.code).toBe('DECRYPTION_FAILED');
      expect(error.retryable).toBe(false);
    });

    it('should create ValidationError with field information', () => {
      const error = new ValidationError('Invalid URL', 'url', 'INVALID_URL');
      
      expect(error.name).toBe('ValidationError');
      expect(error.type).toBe(ErrorTypes.VALIDATION);
      expect(error.field).toBe('url');
      expect(error.code).toBe('INVALID_URL');
    });
  });

  describe('Error Categorization', () => {
    it('should categorize custom error types correctly', () => {
      const authError = new AuthenticationError('Auth failed', 'OAUTH_FAILED');
      const result = handler.categorizeError(authError);
      
      expect(result.type).toBe(ErrorTypes.AUTHENTICATION);
      expect(result.code).toBe('OAUTH_FAILED');
      expect(result.retryable).toBe(true);
    });

    it('should categorize generic errors by message content', () => {
      const oauthError = new Error('OAuth authentication failed');
      const result = handler.categorizeError(oauthError);
      
      expect(result.type).toBe(ErrorTypes.AUTHENTICATION);
      expect(result.code).toBe('AUTH_GENERIC');
    });

    it('should categorize encryption errors by message content', () => {
      const cryptoError = new Error('Failed to decrypt data');
      const result = handler.categorizeError(cryptoError);
      
      expect(result.type).toBe(ErrorTypes.ENCRYPTION);
      expect(result.code).toBe('CRYPTO_GENERIC');
    });

    it('should default to validation error for unknown errors', () => {
      const unknownError = new Error('Something went wrong');
      const result = handler.categorizeError(unknownError);
      
      expect(result.type).toBe(ErrorTypes.VALIDATION);
      expect(result.code).toBe('GENERIC_ERROR');
    });
  });

  describe('User Message Formatting', () => {
    it('should format authentication error messages', () => {
      const errorInfo = {
        type: ErrorTypes.AUTHENTICATION,
        code: 'INVALID_MASTER_PASSWORD'
      };
      
      const message = handler.formatUserMessage(errorInfo);
      expect(message).toBe('The master password you entered is incorrect. Please try again.');
    });

    it('should format encryption error messages', () => {
      const errorInfo = {
        type: ErrorTypes.ENCRYPTION,
        code: 'INVALID_KEY_PHRASE'
      };
      
      const message = handler.formatUserMessage(errorInfo);
      expect(message).toBe('The key phrase you entered is incorrect. Please check and try again.');
    });

    it('should format validation error messages', () => {
      const errorInfo = {
        type: ErrorTypes.VALIDATION,
        code: 'INVALID_URL'
      };
      
      const message = handler.formatUserMessage(errorInfo);
      expect(message).toBe('Please enter a valid website URL.');
    });

    it('should use fallback message for unknown error codes', () => {
      const errorInfo = {
        type: ErrorTypes.VALIDATION,
        code: 'UNKNOWN_ERROR',
        message: 'Custom error message'
      };
      
      const message = handler.formatUserMessage(errorInfo);
      expect(message).toBe('Custom error message');
    });
  });

  describe('Recovery Options', () => {
    it('should provide authentication recovery options', () => {
      const errorInfo = { type: ErrorTypes.AUTHENTICATION };
      const options = handler.getRecoveryOptions(errorInfo);
      
      expect(options).toContain('Try entering your password again');
      expect(options).toContain('Sign out and sign back in');
    });

    it('should provide encryption recovery options', () => {
      const errorInfo = { type: ErrorTypes.ENCRYPTION };
      const options = handler.getRecoveryOptions(errorInfo);
      
      expect(options).toContain('Verify your key phrase is correct');
      expect(options).toContain('Check if the file is corrupted');
    });

    it('should provide default recovery options for unknown types', () => {
      const errorInfo = { type: 'UNKNOWN_TYPE' };
      const options = handler.getRecoveryOptions(errorInfo);
      
      expect(options).toContain('Try again');
      expect(options).toContain('Refresh the page');
    });
  });

  describe('Retry Management', () => {
    it('should allow retries within limit', () => {
      const errorCode = 'TEST_ERROR';
      
      expect(handler.canRetry(errorCode)).toBe(true);
      
      handler.recordRetry(errorCode);
      expect(handler.canRetry(errorCode)).toBe(true);
      
      handler.recordRetry(errorCode);
      handler.recordRetry(errorCode);
      expect(handler.canRetry(errorCode)).toBe(false);
    });

    it('should reset retry count', () => {
      const errorCode = 'TEST_ERROR';
      
      handler.recordRetry(errorCode);
      handler.recordRetry(errorCode);
      handler.recordRetry(errorCode);
      
      expect(handler.canRetry(errorCode)).toBe(false);
      
      handler.resetRetries(errorCode);
      expect(handler.canRetry(errorCode)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle error and return formatted response', () => {
      const error = new AuthenticationError('Invalid password', 'INVALID_MASTER_PASSWORD');
      const result = handler.handleError(error);
      
      expect(result.type).toBe(ErrorTypes.AUTHENTICATION);
      expect(result.code).toBe('INVALID_MASTER_PASSWORD');
      expect(result.message).toBe('The master password you entered is incorrect. Please try again.');
      expect(result.retryable).toBe(true);
      expect(result.canRetry).toBe(true);
      expect(result.recoveryOptions).toBeInstanceOf(Array);
    });

    it('should log errors in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const error = new Error('Test error');
      handler.handleError(error);
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Static Error Creation Methods', () => {
    it('should create authentication errors', () => {
      const error = ErrorHandler.createAuthError('Auth failed', 'OAUTH_FAILED');
      
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.code).toBe('OAUTH_FAILED');
    });

    it('should create encryption errors', () => {
      const error = ErrorHandler.createEncryptionError('Crypto failed', 'DECRYPTION_FAILED');
      
      expect(error).toBeInstanceOf(EncryptionError);
      expect(error.code).toBe('DECRYPTION_FAILED');
    });

    it('should create validation errors', () => {
      const error = ErrorHandler.createValidationError('Invalid input', 'username', 'INVALID_USERNAME');
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.field).toBe('username');
      expect(error.code).toBe('INVALID_USERNAME');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton error handler instance', () => {
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle master password retry scenario', () => {
      const error = new AuthenticationError('Invalid password', 'INVALID_MASTER_PASSWORD');
      const result = handler.handleError(error);
      
      expect(result.retryable).toBe(true);
      expect(result.canRetry).toBe(true);
      expect(result.message).toContain('incorrect');
      expect(result.recoveryOptions).toContain('Try entering your password again');
    });

    it('should handle key phrase retry scenario', () => {
      const error = new EncryptionError('Invalid key phrase', 'INVALID_KEY_PHRASE');
      const result = handler.handleError(error);
      
      expect(result.retryable).toBe(false); // Encryption errors are not retryable by default
      expect(result.message).toContain('key phrase');
      expect(result.recoveryOptions).toContain('Verify your key phrase is correct');
    });

    it('should handle import failure scenario', () => {
      const error = new ImportExportError('Decryption failed', 'DECRYPTION_FAILED');
      const result = handler.handleError(error);
      
      expect(result.type).toBe(ErrorTypes.IMPORT_EXPORT);
      expect(result.retryable).toBe(true);
      expect(result.recoveryOptions).toContain('Try with a different file');
    });
  });

  describe('Context Handling', () => {
    it('should handle error with additional context', () => {
      const error = new ValidationError('Invalid URL', 'url', 'INVALID_URL');
      const context = { operation: 'addCredential', url: 'invalid-url' };
      
      const result = handler.handleError(error, context);
      
      expect(result.type).toBe(ErrorTypes.VALIDATION);
      expect(result.code).toBe('INVALID_URL');
    });
  });
});