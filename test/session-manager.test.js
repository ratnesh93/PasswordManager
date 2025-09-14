/**
 * Unit tests for Session Manager
 * Tests session state tracking, persistence, and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock crypto module
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mocked_hash')
    }))
  },
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked_hash')
  }))
}));

// Mock Chrome APIs
const mockChrome = {
  storage: {
    local: {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn()
    }
  },
  runtime: {
    sendMessage: vi.fn(),
    lastError: null
  }
};

global.chrome = mockChrome;

// Mock OAuth handler
const mockOAuthHandler = {
  signOut: vi.fn()
};

// Import crypto mock
import crypto from 'crypto';

// Import the class after mocking
const SessionManager = await import('../src/auth/session-manager.js').then(m => m.default || m);

describe('SessionManager', () => {
  let sessionManager;
  
  beforeEach(() => {
    sessionManager = new SessionManager(mockOAuthHandler);
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    // Clear any existing timeouts
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('should create new session with valid data', async () => {
      const mockToken = 'oauth_token';
      const mockUserInfo = { id: '123', email: 'test@gmail.com' };
      const mockPasswordHash = 'password_hash';

      mockChrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      const session = await sessionManager.createSession(mockToken, mockUserInfo, mockPasswordHash);

      expect(session.token).toBe(mockToken);
      expect(session.userInfo).toEqual(mockUserInfo);
      expect(session.masterPasswordHash).toBe(mockPasswordHash);
      expect(session.sessionId).toMatch(/^session_\d+_/);
      expect(session.createdAt).toBeTypeOf('number');
      expect(session.expiresAt).toBeGreaterThan(session.createdAt);
      
      expect(sessionManager.isLoggedIn).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith(
        { userSession: session },
        expect.any(Function)
      );
    });

    it('should handle storage error during session creation', async () => {
      mockChrome.runtime.lastError = { message: 'Storage error' };
      mockChrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      await expect(sessionManager.createSession('token', {}, 'hash'))
        .rejects.toThrow('Session creation failed: Storage error');
    });
  });

  describe('initializeSession', () => {
    it('should restore valid session from storage', async () => {
      const validSession = {
        sessionId: 'test_session',
        token: 'stored_token',
        userInfo: { id: '123', email: 'test@gmail.com' },
        createdAt: Date.now() - 1000,
        lastActivity: Date.now() - 500,
        expiresAt: Date.now() + 10000 // Valid for 10 more seconds
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ userSession: validSession });
      });

      await sessionManager.initializeSession();

      expect(sessionManager.sessionData).toEqual(validSession);
      expect(sessionManager.isLoggedIn).toBe(true);
    });

    it('should clear expired session from storage', async () => {
      const expiredSession = {
        sessionId: 'expired_session',
        expiresAt: Date.now() - 1000 // Expired 1 second ago
      };

      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ userSession: expiredSession });
      });

      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await sessionManager.initializeSession();

      expect(sessionManager.sessionData).toBeNull();
      expect(sessionManager.isLoggedIn).toBe(false);
    });

    it('should handle missing session in storage', async () => {
      mockChrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await sessionManager.initializeSession();

      expect(sessionManager.sessionData).toBeNull();
      expect(sessionManager.isLoggedIn).toBe(false);
    });
  });

  describe('updateActivity', () => {
    it('should update session activity and extend expiry', async () => {
      const initialTime = Date.now();
      vi.setSystemTime(initialTime);

      // Create initial session
      const session = {
        sessionId: 'test_session',
        lastActivity: initialTime - 5000,
        expiresAt: initialTime + 10000
      };
      sessionManager.sessionData = session;

      mockChrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      // Advance time and update activity
      const newTime = initialTime + 1000;
      vi.setSystemTime(newTime);

      await sessionManager.updateActivity();

      expect(sessionManager.sessionData.lastActivity).toBe(newTime);
      expect(sessionManager.sessionData.expiresAt).toBeGreaterThan(initialTime + 10000);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it('should handle no active session', async () => {
      sessionManager.sessionData = null;

      await sessionManager.updateActivity();

      expect(mockChrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('validateMasterPassword', () => {
    it('should validate correct master password', () => {
      const password = 'test_password';
      const expectedHash = 'expected_hash_value';
      
      sessionManager.sessionData = {
        masterPasswordHash: expectedHash
      };

      // Mock crypto to return the expected hash
      vi.mocked(crypto.createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => expectedHash)
      });

      const isValid = sessionManager.validateMasterPassword(password);

      expect(isValid).toBe(true);
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should reject incorrect master password', () => {
      const password = 'wrong_password';
      
      sessionManager.sessionData = {
        masterPasswordHash: 'correct_hash'
      };

      vi.mocked(crypto.createHash).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => 'wrong_hash')
      });

      const isValid = sessionManager.validateMasterPassword(password);

      expect(isValid).toBe(false);
    });

    it('should return false with no session data', () => {
      sessionManager.sessionData = null;

      const isValid = sessionManager.validateMasterPassword('any_password');

      expect(isValid).toBe(false);
    });
  });

  describe('logout', () => {
    it('should logout user and clear all data', async () => {
      sessionManager.sessionData = { sessionId: 'test_session' };
      sessionManager.isLoggedIn = true;

      mockOAuthHandler.signOut.mockResolvedValue();
      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await sessionManager.logout();

      expect(mockOAuthHandler.signOut).toHaveBeenCalled();
      expect(sessionManager.sessionData).toBeNull();
      expect(sessionManager.isLoggedIn).toBe(false);
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith(
        ['userSession'],
        expect.any(Function)
      );
    });

    it('should force clear session even if OAuth signout fails', async () => {
      sessionManager.sessionData = { sessionId: 'test_session' };
      sessionManager.isLoggedIn = true;

      mockOAuthHandler.signOut.mockRejectedValue(new Error('OAuth error'));
      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await expect(sessionManager.logout()).rejects.toThrow('Logout failed: OAuth error');
      
      // Session should still be cleared
      expect(sessionManager.sessionData).toBeNull();
      expect(sessionManager.isLoggedIn).toBe(false);
    });
  });

  describe('session timeout', () => {
    it('should handle session timeout', async () => {
      sessionManager.sessionData = { sessionId: 'test_session' };
      sessionManager.isLoggedIn = true;
      sessionManager.sessionTimeout = setTimeout(() => {}, 1000);

      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      mockChrome.runtime.sendMessage.mockResolvedValue();

      await sessionManager.handleSessionTimeout();

      expect(sessionManager.sessionData).toBeNull();
      expect(sessionManager.isLoggedIn).toBe(false);
      expect(sessionManager.sessionTimeout).toBeNull();
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SESSION_TIMEOUT',
        timestamp: expect.any(Number)
      });
    });

    it('should start session timeout on session creation', async () => {
      const spy = vi.spyOn(sessionManager, 'startSessionTimeout');
      
      mockChrome.storage.local.set.mockImplementation((data, callback) => {
        callback();
      });

      await sessionManager.createSession('token', {}, 'hash');

      expect(spy).toHaveBeenCalled();
    });

    it('should clear timeout on session clear', async () => {
      const timeoutId = setTimeout(() => {}, 1000);
      sessionManager.sessionTimeout = timeoutId;

      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      await sessionManager.clearSession();

      expect(sessionManager.sessionTimeout).toBeNull();
    });
  });

  describe('session validation', () => {
    it('should validate non-expired session', () => {
      const validSession = {
        expiresAt: Date.now() + 10000 // 10 seconds in future
      };

      const isValid = sessionManager.isSessionValid(validSession);
      expect(isValid).toBe(true);
    });

    it('should invalidate expired session', () => {
      const expiredSession = {
        expiresAt: Date.now() - 1000 // 1 second in past
      };

      const isValid = sessionManager.isSessionValid(expiredSession);
      expect(isValid).toBe(false);
    });

    it('should invalidate session without expiry', () => {
      const sessionWithoutExpiry = {
        sessionId: 'test'
      };

      const isValid = sessionManager.isSessionValid(sessionWithoutExpiry);
      expect(isValid).toBe(false);
    });

    it('should invalidate null session', () => {
      const isValid = sessionManager.isSessionValid(null);
      expect(isValid).toBe(false);
    });
  });

  describe('getSession', () => {
    it('should return session data without sensitive information', () => {
      const fullSession = {
        sessionId: 'test_session',
        token: 'sensitive_token',
        masterPasswordHash: 'sensitive_hash',
        userInfo: { id: '123', email: 'test@gmail.com' },
        createdAt: 1234567890,
        lastActivity: 1234567891,
        expiresAt: 1234567892
      };

      sessionManager.sessionData = fullSession;
      sessionManager.isLoggedIn = true;

      const sessionData = sessionManager.getSession();

      expect(sessionData).toEqual({
        sessionId: 'test_session',
        userInfo: { id: '123', email: 'test@gmail.com' },
        createdAt: 1234567890,
        lastActivity: 1234567891,
        expiresAt: 1234567892
      });

      // Ensure sensitive data is not included
      expect(sessionData.token).toBeUndefined();
      expect(sessionData.masterPasswordHash).toBeUndefined();
    });

    it('should return null when not logged in', () => {
      sessionManager.isLoggedIn = false;

      const sessionData = sessionManager.getSession();
      expect(sessionData).toBeNull();
    });
  });

  describe('session duration management', () => {
    it('should set custom session duration', () => {
      const customDuration = 60 * 60 * 1000; // 1 hour
      
      sessionManager.setSessionDuration(customDuration);
      
      expect(sessionManager.getSessionDuration()).toBe(customDuration);
    });

    it('should ignore invalid duration', () => {
      const originalDuration = sessionManager.getSessionDuration();
      
      sessionManager.setSessionDuration(-1000);
      
      expect(sessionManager.getSessionDuration()).toBe(originalDuration);
    });

    it('should restart timeout with new duration for active session', () => {
      const spy = vi.spyOn(sessionManager, 'startSessionTimeout');
      sessionManager.isLoggedIn = true;
      
      sessionManager.setSessionDuration(60000);
      
      expect(spy).toHaveBeenCalled();
    });
  });
});