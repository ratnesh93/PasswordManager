/**
 * Tests for Retry Mechanism Utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RetryMechanism,
  RetryConfigs,
  authRetry,
  networkRetry,
  storageRetry,
  importExportRetry,
  retryOperation
} from '../src/utils/retry-mechanism.js';
import { ValidationError, NetworkError, StorageError } from '../src/utils/error-handler.js';

describe('RetryMechanism', () => {
  let retryMechanism;

  beforeEach(() => {
    retryMechanism = new RetryMechanism({
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2
    });
  });

  describe('Successful Execution', () => {
    it('should execute function successfully on first try', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await retryMechanism.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should return result immediately on success', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      const result = await retryMechanism.execute(mockFn);
      
      expect(result).toEqual({ data: 'test' });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new NetworkError('Network timeout'))
        .mockRejectedValueOnce(new NetworkError('Network timeout'))
        .mockResolvedValue('success');
      
      const result = await retryMechanism.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new ValidationError('Invalid input'));
      
      await expect(retryMechanism.execute(mockFn)).rejects.toThrow(ValidationError);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should respect maximum retry limit', async () => {
      const mockFn = vi.fn().mockRejectedValue(new NetworkError('Network error'));
      
      await expect(retryMechanism.execute(mockFn)).rejects.toThrow(NetworkError);
      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new NetworkError('Network error'))
        .mockResolvedValue('success');
      
      const onRetry = vi.fn();
      
      await retryMechanism.execute(mockFn, { onRetry });
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(NetworkError),
        1,
        expect.any(Number)
      );
    });
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff delays', () => {
      const delay1 = retryMechanism.calculateDelay(1);
      const delay2 = retryMechanism.calculateDelay(2);
      const delay3 = retryMechanism.calculateDelay(3);
      
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should respect maximum delay', () => {
      const mechanism = new RetryMechanism({
        baseDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 10
      });
      
      const delay = mechanism.calculateDelay(5);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should add jitter when enabled', () => {
      const mechanism = new RetryMechanism({
        baseDelay: 1000,
        jitter: true
      });
      
      const delays = Array.from({ length: 10 }, () => mechanism.calculateDelay(1));
      const uniqueDelays = new Set(delays);
      
      // With jitter, delays should vary
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should not add jitter when disabled', () => {
      const mechanism = new RetryMechanism({
        baseDelay: 1000,
        jitter: false
      });
      
      const delays = Array.from({ length: 5 }, () => mechanism.calculateDelay(1));
      const uniqueDelays = new Set(delays);
      
      // Without jitter, all delays should be the same
      expect(uniqueDelays.size).toBe(1);
    });
  });

  describe('Default Retry Condition', () => {
    it('should not retry validation errors', () => {
      const error = new ValidationError('Invalid input');
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(false);
    });

    it('should not retry invalid master password errors', () => {
      const error = new Error('Invalid password');
      error.code = 'INVALID_MASTER_PASSWORD';
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(false);
    });

    it('should not retry invalid key phrase errors', () => {
      const error = new Error('Invalid key phrase');
      error.code = 'INVALID_KEY_PHRASE';
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(false);
    });

    it('should retry network errors', () => {
      const error = new NetworkError('Network timeout');
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(true);
    });

    it('should retry storage errors', () => {
      const error = new StorageError('Storage access denied');
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(true);
    });

    it('should retry timeout errors', () => {
      const error = new Error('Request timeout');
      error.code = 'REQUEST_TIMEOUT';
      expect(retryMechanism.defaultRetryCondition(error, 1)).toBe(true);
    });
  });

  describe('Custom Retry Conditions', () => {
    it('should use custom retry condition', async () => {
      const mockFn = vi.fn().mockRejectedValue(new ValidationError('Custom error'));
      
      const customRetryCondition = (error, attempt) => {
        return error instanceof ValidationError && attempt <= 1;
      };
      
      await expect(
        retryMechanism.execute(mockFn, { retryCondition: customRetryCondition })
      ).rejects.toThrow(ValidationError);
      
      expect(mockFn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe('Function Wrapping', () => {
    it('should wrap function with retry logic', async () => {
      const originalFn = vi.fn()
        .mockRejectedValueOnce(new NetworkError('Network error'))
        .mockResolvedValue('success');
      
      const wrappedFn = retryMechanism.wrap(originalFn);
      const result = await wrappedFn('arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('Delay Function', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await retryMechanism.delay(100);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });
});

describe('Retry Configurations', () => {
  it('should have different configurations for different operation types', () => {
    expect(RetryConfigs.AUTH.maxRetries).toBe(2);
    expect(RetryConfigs.NETWORK.maxRetries).toBe(3);
    expect(RetryConfigs.STORAGE.maxRetries).toBe(2);
    expect(RetryConfigs.IMPORT_EXPORT.maxRetries).toBe(1);
    
    expect(RetryConfigs.AUTH.baseDelay).toBeLessThan(RetryConfigs.NETWORK.baseDelay);
  });
});

describe('Pre-configured Retry Mechanisms', () => {
  it('should export pre-configured retry mechanisms', () => {
    expect(authRetry).toBeInstanceOf(RetryMechanism);
    expect(networkRetry).toBeInstanceOf(RetryMechanism);
    expect(storageRetry).toBeInstanceOf(RetryMechanism);
    expect(importExportRetry).toBeInstanceOf(RetryMechanism);
  });

  it('should use correct configurations', () => {
    expect(authRetry.maxRetries).toBe(RetryConfigs.AUTH.maxRetries);
    expect(networkRetry.maxRetries).toBe(RetryConfigs.NETWORK.maxRetries);
  });
});

describe('retryOperation Utility', () => {
  it('should retry with AUTH configuration', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new NetworkError('Network error'))
      .mockResolvedValue('success');
    
    const result = await retryOperation(mockFn, 'AUTH');
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should retry with NETWORK configuration', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new NetworkError('Network error'))
      .mockResolvedValue('success');
    
    const result = await retryOperation(mockFn, 'NETWORK');
    
    expect(result).toBe('success');
  });

  it('should default to NETWORK configuration for unknown types', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    
    const result = await retryOperation(mockFn, 'UNKNOWN_TYPE');
    
    expect(result).toBe('success');
  });

  it('should pass additional options', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new ValidationError('Validation error'))
      .mockResolvedValue('success');
    
    const customRetryCondition = () => true;
    
    const result = await retryOperation(mockFn, 'NETWORK', {
      retryCondition: customRetryCondition
    });
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});

describe('Error Scenarios', () => {
  let retryMechanism;

  beforeEach(() => {
    retryMechanism = new RetryMechanism({
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2
    });
  });

  it('should handle synchronous errors', async () => {
    const mockFn = vi.fn().mockImplementation(() => {
      throw new Error('Synchronous error');
    });
    
    await expect(retryMechanism.execute(mockFn)).rejects.toThrow('Synchronous error');
  });

  it('should handle promise rejections', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Async error'));
    
    await expect(retryMechanism.execute(mockFn)).rejects.toThrow('Async error');
  });

  it('should preserve original error after max retries', async () => {
    const originalError = new NetworkError('Original network error');
    const mockFn = vi.fn().mockRejectedValue(originalError);
    
    await expect(retryMechanism.execute(mockFn)).rejects.toBe(originalError);
  });
});

describe('Integration Scenarios', () => {
  it('should handle authentication retry scenario', async () => {
    let attempts = 0;
    const mockAuthFn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 2) {
        throw new NetworkError('Network timeout');
      }
      return Promise.resolve({ token: 'auth-token' });
    });
    
    const result = await authRetry.execute(mockAuthFn);
    
    expect(result).toEqual({ token: 'auth-token' });
    expect(mockAuthFn).toHaveBeenCalledTimes(2);
  });

  it('should handle storage retry scenario', async () => {
    let attempts = 0;
    const mockStorageFn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 2) {
        const error = new StorageError('Storage access denied');
        error.code = 'STORAGE_ACCESS_DENIED';
        throw error;
      }
      return Promise.resolve('data-saved');
    });
    
    const result = await storageRetry.execute(mockStorageFn);
    
    expect(result).toBe('data-saved');
    expect(mockStorageFn).toHaveBeenCalledTimes(2);
  });

  it('should not retry permanent failures', async () => {
    const mockFn = vi.fn().mockImplementation(() => {
      const error = new Error('Invalid master password');
      error.code = 'INVALID_MASTER_PASSWORD';
      throw error;
    });
    
    await expect(authRetry.execute(mockFn)).rejects.toThrow('Invalid master password');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});