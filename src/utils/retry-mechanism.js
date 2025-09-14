/**
 * Retry Mechanism Utility
 * Provides configurable retry logic for failed operations
 */

export class RetryMechanism {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 10000; // 10 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter || true;
  }

  /**
   * Execute a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise} Result of the function or final error
   */
  async execute(fn, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const retryCondition = options.retryCondition || this.defaultRetryCondition;
    const onRetry = options.onRetry || (() => {});

    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await fn();
        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        // Check if we should retry
        if (attempt > maxRetries || !retryCondition(error, attempt)) {
          throw error;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        
        // Call retry callback
        onRetry(error, attempt, delay);

        // Wait before retrying
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Default retry condition - retry on network and temporary errors
   * @param {Error} error - The error that occurred
   * @param {number} attempt - Current attempt number
   * @returns {boolean} Whether to retry
   */
  defaultRetryCondition(error, attempt) {
    // Don't retry validation errors or permanent failures
    if (error.name === 'ValidationError' || 
        error.code === 'INVALID_MASTER_PASSWORD' ||
        error.code === 'INVALID_KEY_PHRASE') {
      return false;
    }

    // Retry network errors, storage errors, and temporary failures
    return error.name === 'NetworkError' || 
           error.name === 'StorageError' ||
           error.code === 'REQUEST_TIMEOUT' ||
           error.code === 'STORAGE_ACCESS_DENIED';
  }

  /**
   * Calculate delay for next retry attempt using exponential backoff
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    
    // Cap the delay
    delay = Math.min(delay, this.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Promise-based delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry wrapper for a specific function
   * @param {Function} fn - Function to wrap
   * @param {Object} options - Retry options
   * @returns {Function} Wrapped function with retry logic
   */
  wrap(fn, options = {}) {
    return (...args) => {
      return this.execute(() => fn(...args), options);
    };
  }
}

/**
 * Specific retry configurations for different operation types
 */
export const RetryConfigs = {
  // Authentication operations - quick retries
  AUTH: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 1.5
  },

  // Network operations - longer delays
  NETWORK: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 8000,
    backoffMultiplier: 2
  },

  // Storage operations - moderate retries
  STORAGE: {
    maxRetries: 2,
    baseDelay: 800,
    maxDelay: 3000,
    backoffMultiplier: 2
  },

  // Import/Export operations - patient retries
  IMPORT_EXPORT: {
    maxRetries: 1,
    baseDelay: 1500,
    maxDelay: 5000,
    backoffMultiplier: 2
  }
};

/**
 * Pre-configured retry mechanisms
 */
export const authRetry = new RetryMechanism(RetryConfigs.AUTH);
export const networkRetry = new RetryMechanism(RetryConfigs.NETWORK);
export const storageRetry = new RetryMechanism(RetryConfigs.STORAGE);
export const importExportRetry = new RetryMechanism(RetryConfigs.IMPORT_EXPORT);

/**
 * Utility function to retry with specific configuration
 * @param {Function} fn - Function to retry
 * @param {string} type - Type of operation (AUTH, NETWORK, STORAGE, IMPORT_EXPORT)
 * @param {Object} options - Additional options
 * @returns {Promise} Result of the function
 */
export async function retryOperation(fn, type = 'NETWORK', options = {}) {
  const retryMechanism = {
    AUTH: authRetry,
    NETWORK: networkRetry,
    STORAGE: storageRetry,
    IMPORT_EXPORT: importExportRetry
  }[type] || networkRetry;

  return retryMechanism.execute(fn, options);
}