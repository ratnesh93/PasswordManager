/**
 * Unit tests for OAuth Handler
 * Tests OAuth flow, token validation, and refresh logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn()
  },
  runtime: {
    lastError: null
  }
};

// Mock fetch for API calls
global.fetch = vi.fn();
global.chrome = mockChrome;

// Import the class after mocking
const OAuthHandler = await import('../src/auth/oauth-handler.js').then(m => m.default || m);

describe('OAuthHandler', () => {
  let oauthHandler;
  
  beforeEach(() => {
    oauthHandler = new OAuthHandler();
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should successfully authenticate user', async () => {
      const mockToken = 'mock_oauth_token';
      const mockUserInfo = {
        id: '123456789',
        email: 'test@gmail.com',
        name: 'Test User'
      };

      // Mock successful token retrieval
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      // Mock successful user info fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const result = await oauthHandler.authenticate();

      expect(result.token).toBe(mockToken);
      expect(result.userInfo).toEqual(mockUserInfo);
      expect(oauthHandler.currentToken).toBe(mockToken);
      expect(oauthHandler.userInfo).toEqual(mockUserInfo);
      expect(oauthHandler.tokenExpiry).toBeGreaterThan(Date.now());
    });

    it('should handle OAuth token retrieval failure', async () => {
      mockChrome.runtime.lastError = { message: 'User cancelled OAuth flow' };
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.authenticate()).rejects.toThrow('Authentication failed: User cancelled OAuth flow');
    });

    it('should handle token validation failure', async () => {
      const mockToken = 'invalid_token';

      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      await expect(oauthHandler.authenticate()).rejects.toThrow('Authentication failed: Token validation failed: 401');
    });

    it('should handle missing user info fields', async () => {
      const mockToken = 'mock_token';
      const incompleteUserInfo = { name: 'Test User' }; // Missing email and id

      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(mockToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(incompleteUserInfo)
      });

      await expect(oauthHandler.authenticate()).rejects.toThrow('Authentication failed: Invalid user information received');
    });
  });

  describe('getAuthToken', () => {
    it('should get token with interactive mode', async () => {
      const mockToken = 'test_token';
      
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        expect(options.interactive).toBe(true);
        callback(mockToken);
      });

      const token = await oauthHandler.getAuthToken();
      expect(token).toBe(mockToken);
    });

    it('should handle Chrome runtime error', async () => {
      mockChrome.runtime.lastError = { message: 'Network error' };
      
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.getAuthToken()).rejects.toThrow('Network error');
    });

    it('should handle null token response', async () => {
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.getAuthToken()).rejects.toThrow('No token received from OAuth flow');
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user info', async () => {
      const mockToken = 'valid_token';
      const mockUserInfo = {
        id: '123',
        email: 'test@gmail.com',
        name: 'Test User'
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const userInfo = await oauthHandler.validateToken(mockToken);
      
      expect(userInfo).toEqual(mockUserInfo);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${mockToken}`
      );
    });

    it('should handle API error response', async () => {
      const mockToken = 'invalid_token';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      await expect(oauthHandler.validateToken(mockToken)).rejects.toThrow('Token validation failed: 401');
    });

    it('should handle network error', async () => {
      const mockToken = 'test_token';

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(oauthHandler.validateToken(mockToken)).rejects.toThrow('Network error');
    });
  });

  describe('refreshToken', () => {
    it('should refresh expired token', async () => {
      const oldToken = 'old_token';
      const newToken = 'new_token';
      const mockUserInfo = {
        id: '123',
        email: 'test@gmail.com'
      };

      // Set up initial state
      oauthHandler.currentToken = oldToken;

      // Mock token removal
      mockChrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      // Mock new token retrieval
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(newToken);
      });

      // Mock token validation
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const refreshedToken = await oauthHandler.refreshToken();

      expect(refreshedToken).toBe(newToken);
      expect(oauthHandler.currentToken).toBe(newToken);
      expect(oauthHandler.userInfo).toEqual(mockUserInfo);
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: oldToken },
        expect.any(Function)
      );
    });

    it('should handle refresh failure', async () => {
      mockChrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      mockChrome.runtime.lastError = { message: 'Refresh failed' };
      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(null);
      });

      await expect(oauthHandler.refreshToken()).rejects.toThrow('Token refresh failed: Refresh failed');
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', () => {
      oauthHandler.currentToken = 'valid_token';
      oauthHandler.tokenExpiry = Date.now() + 1000; // 1 second in future

      expect(oauthHandler.isTokenValid()).toBe(true);
    });

    it('should return false for expired token', () => {
      oauthHandler.currentToken = 'expired_token';
      oauthHandler.tokenExpiry = Date.now() - 1000; // 1 second in past

      expect(oauthHandler.isTokenValid()).toBe(false);
    });

    it('should return false for missing token', () => {
      oauthHandler.currentToken = null;
      oauthHandler.tokenExpiry = Date.now() + 1000;

      expect(oauthHandler.isTokenValid()).toBe(false);
    });

    it('should return false for missing expiry', () => {
      oauthHandler.currentToken = 'token';
      oauthHandler.tokenExpiry = null;

      expect(oauthHandler.isTokenValid()).toBe(false);
    });
  });

  describe('getValidToken', () => {
    it('should return current token if valid', async () => {
      const validToken = 'valid_token';
      oauthHandler.currentToken = validToken;
      oauthHandler.tokenExpiry = Date.now() + 1000;

      const token = await oauthHandler.getValidToken();
      expect(token).toBe(validToken);
    });

    it('should refresh token if expired', async () => {
      const newToken = 'refreshed_token';
      const mockUserInfo = { id: '123', email: 'test@gmail.com' };

      // Set expired token
      oauthHandler.currentToken = 'expired_token';
      oauthHandler.tokenExpiry = Date.now() - 1000;

      // Mock refresh process
      mockChrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      mockChrome.identity.getAuthToken.mockImplementation((options, callback) => {
        callback(newToken);
      });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUserInfo)
      });

      const token = await oauthHandler.getValidToken();
      expect(token).toBe(newToken);
    });
  });

  describe('signOut', () => {
    it('should clear all authentication data', async () => {
      const mockToken = 'test_token';
      oauthHandler.currentToken = mockToken;
      oauthHandler.userInfo = { id: '123', email: 'test@gmail.com' };
      oauthHandler.tokenExpiry = Date.now() + 1000;

      mockChrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      await oauthHandler.signOut();

      expect(oauthHandler.currentToken).toBeNull();
      expect(oauthHandler.userInfo).toBeNull();
      expect(oauthHandler.tokenExpiry).toBeNull();
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: mockToken },
        expect.any(Function)
      );
    });

    it('should handle sign out without token', async () => {
      oauthHandler.currentToken = null;

      await expect(oauthHandler.signOut()).resolves.not.toThrow();
      expect(oauthHandler.currentToken).toBeNull();
    });

    it('should handle token removal error', async () => {
      oauthHandler.currentToken = 'test_token';
      
      mockChrome.runtime.lastError = { message: 'Removal failed' };
      mockChrome.identity.removeCachedAuthToken.mockImplementation((options, callback) => {
        callback();
      });

      await expect(oauthHandler.signOut()).rejects.toThrow('Sign out failed: Removal failed');
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when authenticated with valid token', () => {
      oauthHandler.currentToken = 'valid_token';
      oauthHandler.tokenExpiry = Date.now() + 1000;
      oauthHandler.userInfo = { id: '123', email: 'test@gmail.com' };

      expect(oauthHandler.isAuthenticated()).toBe(true);
    });

    it('should return false when not authenticated', () => {
      expect(oauthHandler.isAuthenticated()).toBe(false);
    });

    it('should return false with expired token', () => {
      oauthHandler.currentToken = 'expired_token';
      oauthHandler.tokenExpiry = Date.now() - 1000;
      oauthHandler.userInfo = { id: '123', email: 'test@gmail.com' };

      expect(oauthHandler.isAuthenticated()).toBe(false);
    });

    it('should return false without user info', () => {
      oauthHandler.currentToken = 'valid_token';
      oauthHandler.tokenExpiry = Date.now() + 1000;
      oauthHandler.userInfo = null;

      expect(oauthHandler.isAuthenticated()).toBe(false);
    });
  });
});