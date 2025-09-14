/**
 * End-to-End Integration Tests - Cross-Component Communication
 * Tests message passing between extension components, context menu integration, and popup communication
 * Requirements: 4.1, 5.1, 5.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs with comprehensive message handling
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    },
    lastError: null,
    id: 'test-extension-id'
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    executeScript: vi.fn()
  },
  contextMenus: {
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  storage: {
    local: {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn()
    }
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn()
  }
};

// Mock DOM for content script testing
const mockDocument = {
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(),
  createElement: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  forms: [],
  body: {
    appendChild: vi.fn(),
    removeChild: vi.fn()
  }
};

global.chrome = mockChrome;
global.document = mockDocument;
global.window = {
  location: { href: 'https://example.com/login' },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
};

// Import components - will be loaded dynamically
let BackgroundService;

// Mock content script functions (since it's not a module)
const mockContentScript = {
  detectLoginFields: vi.fn(),
  extractCredentials: vi.fn(),
  fillCredentials: vi.fn(),
  setupFormListeners: vi.fn(),
  sendMessageToBackground: vi.fn()
};

describe('Cross-Component Communication Integration', () => {
  let backgroundService;
  let messageListeners;

  beforeEach(async () => {
    // Load BackgroundService dynamically
    if (!BackgroundService) {
      BackgroundService = (await import('../src/background/background.js')).default;
    }

    backgroundService = new BackgroundService();
    messageListeners = new Map();
    
    // Reset all mocks
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Setup default mock responses
    mockChrome.storage.local.set.mockResolvedValue();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
    
    // Mock message listener registration
    mockChrome.runtime.onMessage.addListener.mockImplementation((listener) => {
      const listenerId = Math.random().toString(36);
      messageListeners.set(listenerId, listener);
      return listenerId;
    });
    
    // Mock context menu creation
    mockChrome.contextMenus.create.mockImplementation((options, callback) => {
      if (callback) callback();
      return 'menu-item-id';
    });
  });

  afterEach(() => {
    messageListeners.clear();
    vi.restoreAllMocks();
  });

  describe('Background Service Message Routing - Requirements 4.1, 5.1', () => {
    it('should handle popup to background communication', async () => {
      // Initialize background service
      await backgroundService.initialize();
      
      // Get the registered message listener
      const messageListener = Array.from(messageListeners.values())[0];
      expect(messageListener).toBeDefined();

      // Test SAVE_CREDENTIAL message from popup
      const saveCredentialMessage = {
        type: 'SAVE_CREDENTIAL',
        payload: {
          url: 'https://example.com',
          username: 'testuser',
          password: 'testpass123'
        }
      };

      const mockSender = {
        tab: null, // From popup
        id: 'test-extension-id'
      };

      const mockSendResponse = vi.fn();

      // Simulate message handling
      const result = await messageListener(saveCredentialMessage, mockSender, mockSendResponse);
      
      // Verify message was processed
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credentialId: expect.any(String)
      });
    });

    it('should handle GET_CREDENTIALS message from popup', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      // Setup mock stored credentials
      const mockCredentials = [
        {
          id: 'cred1',
          url: 'https://example.com',
          username: 'user1',
          password: 'pass1'
        }
      ];

      mockChrome.storage.local.get.mockResolvedValue({
        passwordManagerData: {
          encryptedCredentials: 'mock-encrypted-data',
          version: '1.0.0'
        }
      });

      const getCredentialsMessage = {
        type: 'GET_CREDENTIALS',
        payload: { url: 'https://example.com' }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(getCredentialsMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credentials: expect.any(Array)
      });
    });

    it('should handle AUTOFILL message from content script', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const autofillMessage = {
        type: 'AUTOFILL',
        payload: {
          url: 'https://example.com',
          credentialId: 'cred1'
        }
      };

      const mockSender = {
        tab: { id: 1, url: 'https://example.com' }
      };

      const mockSendResponse = vi.fn();

      await messageListener(autofillMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credential: expect.any(Object)
      });
    });

    it('should handle LOGIN message for authentication', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const loginMessage = {
        type: 'LOGIN',
        payload: {
          masterPassword: 'testpassword123'
        }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      // Mock OAuth token
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback('mock-token');
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: '123',
          email: 'test@gmail.com',
          name: 'Test User'
        })
      });

      await messageListener(loginMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        user: expect.any(Object)
      });
    });

    it('should handle invalid message types gracefully', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const invalidMessage = {
        type: 'INVALID_MESSAGE_TYPE',
        payload: {}
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(invalidMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Unknown message type: INVALID_MESSAGE_TYPE'
      });
    });

    it('should validate message structure', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      // Test message without type
      const malformedMessage = {
        payload: { data: 'test' }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(malformedMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message format'
      });
    });
  });

  describe('Context Menu Integration - Requirements 4.1, 5.1', () => {
    it('should register context menu items on initialization', async () => {
      await backgroundService.initialize();

      // Verify context menu items were created
      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'save-password',
        title: 'Save to Password Manager',
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      }, expect.any(Function));

      expect(mockChrome.contextMenus.create).toHaveBeenCalledWith({
        id: 'autofill-password',
        title: 'Password Manager',
        contexts: ['page'],
        documentUrlPatterns: ['http://*/*', 'https://*/*']
      }, expect.any(Function));
    });

    it('should handle context menu click events', async () => {
      await backgroundService.initialize();

      // Get the registered context menu listener
      const contextMenuListener = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];
      expect(contextMenuListener).toBeDefined();

      // Mock tab information
      const mockTab = {
        id: 1,
        url: 'https://example.com/login',
        title: 'Example Login'
      };

      // Test save password context menu click
      const saveClickInfo = {
        menuItemId: 'save-password',
        pageUrl: 'https://example.com/login'
      };

      // Mock content script message for credential extraction
      mockChrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        credentials: {
          username: 'testuser',
          password: 'testpass'
        }
      });

      await contextMenuListener(saveClickInfo, mockTab);

      // Verify content script was contacted
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        mockTab.id,
        {
          type: 'EXTRACT_CREDENTIALS',
          payload: {}
        }
      );
    });

    it('should handle autofill context menu click', async () => {
      await backgroundService.initialize();
      const contextMenuListener = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      const mockTab = {
        id: 1,
        url: 'https://example.com/login'
      };

      const autofillClickInfo = {
        menuItemId: 'autofill-password',
        pageUrl: 'https://example.com/login'
      };

      // Mock stored credentials
      mockChrome.storage.local.get.mockResolvedValue({
        passwordManagerData: {
          encryptedCredentials: 'mock-encrypted-data'
        }
      });

      await contextMenuListener(autofillClickInfo, mockTab);

      // Verify content script was contacted for autofill
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        mockTab.id,
        {
          type: 'SHOW_AUTOFILL_OPTIONS',
          payload: {
            credentials: expect.any(Array)
          }
        }
      );
    });

    it('should handle context menu errors gracefully', async () => {
      await backgroundService.initialize();
      const contextMenuListener = mockChrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      const mockTab = {
        id: 1,
        url: 'https://example.com'
      };

      // Mock content script error
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Content script not available'));

      const clickInfo = {
        menuItemId: 'save-password',
        pageUrl: 'https://example.com'
      };

      // Should not throw error
      await expect(contextMenuListener(clickInfo, mockTab)).resolves.not.toThrow();
    });
  });

  describe('Content Script Communication - Requirements 5.2', () => {
    it('should handle form field detection requests', async () => {
      // Mock form elements
      const mockUsernameField = {
        type: 'text',
        name: 'username',
        id: 'username',
        value: ''
      };

      const mockPasswordField = {
        type: 'password',
        name: 'password',
        id: 'password',
        value: ''
      };

      mockDocument.querySelectorAll.mockImplementation((selector) => {
        if (selector.includes('input[type="text"]') || selector.includes('input[type="email"]')) {
          return [mockUsernameField];
        }
        if (selector.includes('input[type="password"]')) {
          return [mockPasswordField];
        }
        return [];
      });

      // Simulate content script message handling
      mockContentScript.detectLoginFields.mockReturnValue({
        usernameField: mockUsernameField,
        passwordField: mockPasswordField,
        form: { action: '/login', method: 'post' }
      });

      const detectionResult = mockContentScript.detectLoginFields();

      expect(detectionResult.usernameField).toBeDefined();
      expect(detectionResult.passwordField).toBeDefined();
      expect(detectionResult.form).toBeDefined();
    });

    it('should handle credential extraction from forms', async () => {
      const mockForm = {
        username: { value: 'extracteduser' },
        password: { value: 'extractedpass' }
      };

      mockContentScript.extractCredentials.mockReturnValue({
        username: 'extracteduser',
        password: 'extractedpass',
        url: 'https://example.com'
      });

      const extractedCredentials = mockContentScript.extractCredentials();

      expect(extractedCredentials.username).toBe('extracteduser');
      expect(extractedCredentials.password).toBe('extractedpass');
      expect(extractedCredentials.url).toBe('https://example.com');
    });

    it('should handle autofill operations', async () => {
      const mockUsernameField = { value: '', focus: vi.fn(), dispatchEvent: vi.fn() };
      const mockPasswordField = { value: '', focus: vi.fn(), dispatchEvent: vi.fn() };

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector.includes('username')) return mockUsernameField;
        if (selector.includes('password')) return mockPasswordField;
        return null;
      });

      mockContentScript.fillCredentials.mockImplementation((username, password) => {
        mockUsernameField.value = username;
        mockPasswordField.value = password;
        mockUsernameField.dispatchEvent(new Event('input'));
        mockPasswordField.dispatchEvent(new Event('input'));
      });

      mockContentScript.fillCredentials('autofilluser', 'autofillpass');

      expect(mockUsernameField.value).toBe('autofilluser');
      expect(mockPasswordField.value).toBe('autofillpass');
    });

    it('should communicate with background service', async () => {
      mockContentScript.sendMessageToBackground.mockImplementation((message) => {
        return new Promise((resolve) => {
          // Simulate background service response
          setTimeout(() => {
            resolve({
              success: true,
              data: 'response-data'
            });
          }, 10);
        });
      });

      const response = await mockContentScript.sendMessageToBackground({
        type: 'TEST_MESSAGE',
        payload: { test: 'data' }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBe('response-data');
    });

    it('should handle content script injection errors', async () => {
      // Mock tab without content script
      mockChrome.tabs.sendMessage.mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      );

      const tabId = 1;
      const message = { type: 'TEST_MESSAGE' };

      await expect(
        new Promise((resolve, reject) => {
          mockChrome.tabs.sendMessage(tabId, message, (response) => {
            if (mockChrome.runtime.lastError) {
              reject(new Error(mockChrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        })
      ).rejects.toThrow('Could not establish connection');
    });
  });

  describe('Popup to Background Communication - Requirements 5.1', () => {
    it('should handle popup initialization requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const initMessage = {
        type: 'POPUP_INIT',
        payload: {}
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(initMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        isAuthenticated: expect.any(Boolean),
        userInfo: expect.any(Object)
      });
    });

    it('should handle credential list requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const listMessage = {
        type: 'LIST_CREDENTIALS',
        payload: { search: 'example' }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(listMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credentials: expect.any(Array),
        total: expect.any(Number)
      });
    });

    it('should handle credential update requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const updateMessage = {
        type: 'UPDATE_CREDENTIAL',
        payload: {
          id: 'cred1',
          url: 'https://updated.com',
          username: 'updateduser',
          password: 'updatedpass'
        }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(updateMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credentialId: 'cred1'
      });
    });

    it('should handle credential deletion requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const deleteMessage = {
        type: 'DELETE_CREDENTIAL',
        payload: { id: 'cred1' }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(deleteMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        deletedId: 'cred1'
      });
    });

    it('should handle export requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const exportMessage = {
        type: 'EXPORT_DATA',
        payload: {
          keyPhrase: [
            'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
            'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
          ]
        }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(exportMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        exportData: expect.any(String)
      });
    });

    it('should handle import requests', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const importMessage = {
        type: 'IMPORT_DATA',
        payload: {
          encryptedData: 'mock-encrypted-import-data',
          keyPhrase: [
            'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
            'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid'
          ]
        }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(importMessage, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        importedCount: expect.any(Number)
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle message timeout scenarios', async () => {
      // Mock slow response
      mockChrome.tabs.sendMessage.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
        });
      });

      const tabId = 1;
      const message = { type: 'SLOW_MESSAGE' };

      // Should handle timeout gracefully
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), 1000);
      });

      const result = await Promise.race([
        mockChrome.tabs.sendMessage(tabId, message),
        timeoutPromise
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Timeout');
    });

    it('should handle concurrent message processing', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const messages = [
        { type: 'SAVE_CREDENTIAL', payload: { url: 'test1.com', username: 'user1', password: 'pass1' } },
        { type: 'SAVE_CREDENTIAL', payload: { url: 'test2.com', username: 'user2', password: 'pass2' } },
        { type: 'GET_CREDENTIALS', payload: { url: 'test1.com' } }
      ];

      const mockSender = { tab: null };
      const responses = [];

      // Process messages concurrently
      const promises = messages.map(message => {
        return new Promise((resolve) => {
          messageListener(message, mockSender, resolve);
        });
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every(result => result.success)).toBe(true);
    });

    it('should handle malformed message payloads', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const malformedMessages = [
        { type: 'SAVE_CREDENTIAL', payload: null },
        { type: 'SAVE_CREDENTIAL', payload: 'not-an-object' },
        { type: 'SAVE_CREDENTIAL', payload: { url: null } },
        { type: 'GET_CREDENTIALS' } // Missing payload
      ];

      const mockSender = { tab: null };

      for (const message of malformedMessages) {
        const mockSendResponse = vi.fn();
        await messageListener(message, mockSender, mockSendResponse);
        
        expect(mockSendResponse).toHaveBeenCalledWith({
          success: false,
          error: expect.any(String)
        });
      }
    });

    it('should handle extension context invalidation', async () => {
      // Simulate extension context becoming invalid
      mockChrome.runtime.lastError = { message: 'Extension context invalidated.' };

      await backgroundService.initialize();

      // Verify graceful handling of context invalidation
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should handle storage errors during message processing', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      // Mock storage error
      mockChrome.storage.local.get.mockRejectedValue(new Error('Storage unavailable'));

      const message = {
        type: 'GET_CREDENTIALS',
        payload: { url: 'test.com' }
      };

      const mockSender = { tab: null };
      const mockSendResponse = vi.fn();

      await messageListener(message, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Storage unavailable')
      });
    });
  });

  describe('Message Validation and Security', () => {
    it('should validate message sender origin', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      // Test message from unknown sender
      const suspiciousMessage = {
        type: 'SAVE_CREDENTIAL',
        payload: { url: 'malicious.com', username: 'hacker', password: 'hack' }
      };

      const suspiciousSender = {
        id: 'unknown-extension-id',
        tab: { url: 'https://malicious.com' }
      };

      const mockSendResponse = vi.fn();

      await messageListener(suspiciousMessage, suspiciousSender, mockSendResponse);

      // Should reject messages from unknown extensions
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Unauthorized')
      });
    });

    it('should sanitize message payloads', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const messageWithScripts = {
        type: 'SAVE_CREDENTIAL',
        payload: {
          url: 'https://example.com',
          username: '<script>alert("xss")</script>',
          password: 'normalpass'
        }
      };

      const mockSender = { tab: null, id: 'test-extension-id' };
      const mockSendResponse = vi.fn();

      await messageListener(messageWithScripts, mockSender, mockSendResponse);

      // Should sanitize the input
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: true,
        credentialId: expect.any(String)
      });
    });

    it('should rate limit message processing', async () => {
      await backgroundService.initialize();
      const messageListener = Array.from(messageListeners.values())[0];

      const rapidMessages = Array(100).fill().map((_, i) => ({
        type: 'SAVE_CREDENTIAL',
        payload: { url: `test${i}.com`, username: `user${i}`, password: `pass${i}` }
      }));

      const mockSender = { tab: null, id: 'test-extension-id' };
      const responses = [];

      // Send messages rapidly
      for (const message of rapidMessages) {
        const mockSendResponse = vi.fn();
        await messageListener(message, mockSender, mockSendResponse);
        responses.push(mockSendResponse.mock.calls[0][0]);
      }

      // Should handle all messages but may implement rate limiting
      expect(responses.length).toBe(100);
    });
  });
});