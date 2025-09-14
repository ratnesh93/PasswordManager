// Test setup for Chrome extension environment
// Mock Chrome APIs and Web Crypto API for testing

// Mock crypto.subtle for testing
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
    subtle: {
      importKey: async (format, keyData, algorithm, extractable, keyUsages) => {
        return { type: 'secret', algorithm, extractable, usages: keyUsages };
      },
      deriveKey: async (algorithm, baseKey, derivedKeyType, extractable, keyUsages) => {
        return { type: 'secret', algorithm: derivedKeyType, extractable, usages: keyUsages };
      },
      encrypt: async (algorithm, key, data) => {
        // Simple mock encryption - just return the data with some modification
        const result = new Uint8Array(data.length + 16); // Add space for tag
        result.set(new Uint8Array(data));
        // Add mock tag
        for (let i = data.length; i < result.length; i++) {
          result[i] = i % 256;
        }
        return result.buffer;
      },
      decrypt: async (algorithm, key, data) => {
        // Simple mock decryption - remove the last 16 bytes (mock tag)
        const dataArray = new Uint8Array(data);
        return dataArray.slice(0, -16).buffer;
      }
    }
  },
  writable: true,
  configurable: true
});

// Mock TextEncoder and TextDecoder
global.TextEncoder = class {
  encode(str) {
    return new Uint8Array(str.split('').map(char => char.charCodeAt(0)));
  }
};

global.TextDecoder = class {
  decode(buffer) {
    return String.fromCharCode(...new Uint8Array(buffer));
  }
};

// Mock btoa and atob for base64 operations
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');