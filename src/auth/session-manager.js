/**
 * Session Manager for handling user authentication state and session lifecycle
 * Manages session persistence, timeout, and cleanup
 */
class SessionManager {
  constructor(oauthHandler) {
    this.oauthHandler = oauthHandler;
    this.sessionData = null;
    this.sessionTimeout = null;
    this.sessionDuration = 10 * 60 * 1000; // 10 minutes for security
    this.isLoggedIn = false;
    
    // Bind methods to preserve context
    this.handleSessionTimeout = this.handleSessionTimeout.bind(this);
    
    // Initialize session from storage on startup
    this.initializeSession();
  }

  /**
   * Initialize session from stored data
   * @returns {Promise<void>}
   */
  async initializeSession() {
    try {
      const storedSession = await this.loadSessionFromStorage();
      if (storedSession && this.isSessionValid(storedSession)) {
        this.sessionData = storedSession;
        this.isLoggedIn = true;
        this.startSessionTimeout();
        console.log('Session restored from storage');
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
      await this.clearSession();
    }
  }

  /**
   * Create new user session after successful authentication
   * @param {string} token - OAuth token
   * @param {object} userInfo - User information from OAuth
   * @param {string} masterPasswordHash - Hashed master password for verification
   * @returns {Promise<object>} Session data
   */
  async createSession(token, userInfo, masterPasswordHash) {
    try {
      const sessionId = this.generateSessionId();
      const now = Date.now();
      
      this.sessionData = {
        sessionId,
        token,
        userInfo,
        masterPasswordHash,
        createdAt: now,
        lastActivity: now,
        expiresAt: now + this.sessionDuration
      };
      
      // Save session to storage
      await this.saveSessionToStorage(this.sessionData);
      
      // Mark as logged in and start timeout
      this.isLoggedIn = true;
      this.startSessionTimeout();
      
      console.log('New session created:', sessionId);
      return this.sessionData;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error(`Session creation failed: ${error.message}`);
    }
  }

  /**
   * Update session activity timestamp
   * @returns {Promise<void>}
   */
  async updateActivity() {
    if (!this.sessionData) {
      return;
    }
    
    try {
      const now = Date.now();
      this.sessionData.lastActivity = now;
      this.sessionData.expiresAt = now + this.sessionDuration;
      
      await this.saveSessionToStorage(this.sessionData);
      
      // Reset timeout
      this.startSessionTimeout();
    } catch (error) {
      console.error('Failed to update session activity:', error);
    }
  }

  /**
   * Validate master password against stored hash
   * @param {string} password - Master password to validate
   * @returns {boolean} True if password is valid
   */
  validateMasterPassword(password) {
    if (!this.sessionData || !this.sessionData.masterPasswordHash) {
      return false;
    }
    
    try {
      // In a real implementation, you'd use proper password hashing
      // For now, we'll use a simple hash comparison
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      
      return hash === this.sessionData.masterPasswordHash;
    } catch (error) {
      console.error('Password validation error:', error);
      return false;
    }
  }

  /**
   * Get current session data
   * @returns {object|null} Session data or null if not logged in
   */
  getSession() {
    if (!this.isLoggedIn || !this.sessionData) {
      return null;
    }
    
    // Return copy without sensitive data
    return {
      sessionId: this.sessionData.sessionId,
      userInfo: this.sessionData.userInfo,
      createdAt: this.sessionData.createdAt,
      lastActivity: this.sessionData.lastActivity,
      expiresAt: this.sessionData.expiresAt
    };
  }

  /**
   * Check if user is currently logged in
   * @returns {boolean} True if logged in with valid session
   */
  isUserLoggedIn() {
    return this.isLoggedIn && 
           this.sessionData && 
           this.isSessionValid(this.sessionData);
  }

  /**
   * Get current user information
   * @returns {object|null} User info or null if not logged in
   */
  getCurrentUser() {
    if (!this.isUserLoggedIn()) {
      return null;
    }
    
    return this.sessionData.userInfo;
  }

  /**
   * Logout user and clear session
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      // Sign out from OAuth
      if (this.oauthHandler) {
        await this.oauthHandler.signOut();
      }
      
      // Clear session
      await this.clearSession();
      
      console.log('User logged out successfully');
    } catch (error) {
      console.error('Logout failed:', error);
      // Force clear session even if OAuth signout fails
      await this.clearSession();
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  /**
   * Clear all session data and cleanup
   * @returns {Promise<void>}
   */
  async clearSession() {
    try {
      // Clear timeout
      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
        this.sessionTimeout = null;
      }
      
      // Clear session data
      this.sessionData = null;
      this.isLoggedIn = false;
      
      // Remove from storage
      await this.removeSessionFromStorage();
      
      console.log('Session cleared');
    } catch (error) {
      console.error('Failed to clear session:', error);
    }
  }

  /**
   * Handle session timeout
   * @returns {Promise<void>}
   */
  async handleSessionTimeout() {
    console.log('Session timed out');
    await this.clearSession();
    
    // Notify other components about session timeout
    this.notifySessionTimeout();
  }

  /**
   * Start or restart session timeout
   */
  startSessionTimeout() {
    // Clear existing timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }
    
    // Set new timeout
    this.sessionTimeout = setTimeout(
      this.handleSessionTimeout,
      this.sessionDuration
    );
  }

  /**
   * Check if session is valid (not expired)
   * @param {object} session - Session data to validate
   * @returns {boolean} True if session is valid
   */
  isSessionValid(session) {
    if (!session || !session.expiresAt) {
      return false;
    }
    
    return Date.now() < session.expiresAt;
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    return `session_${timestamp}_${random}`;
  }

  /**
   * Save session data to Chrome storage
   * @param {object} sessionData - Session data to save
   * @returns {Promise<void>}
   */
  async saveSessionToStorage(sessionData) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ 
        userSession: sessionData 
      }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Load session data from Chrome storage
   * @returns {Promise<object|null>} Session data or null
   */
  async loadSessionFromStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['userSession'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result.userSession || null);
      });
    });
  }

  /**
   * Remove session data from Chrome storage
   * @returns {Promise<void>}
   */
  async removeSessionFromStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(['userSession'], () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Notify other components about session timeout
   */
  notifySessionTimeout() {
    // Send message to popup and content scripts about session timeout
    chrome.runtime.sendMessage({
      type: 'SESSION_TIMEOUT',
      timestamp: Date.now()
    }).catch(error => {
      // Ignore errors if no listeners
      console.log('No listeners for session timeout notification');
    });
  }

  /**
   * Set custom session duration
   * @param {number} duration - Duration in milliseconds
   */
  setSessionDuration(duration) {
    if (duration > 0) {
      this.sessionDuration = duration;
      
      // Restart timeout with new duration if session is active
      if (this.isLoggedIn) {
        this.startSessionTimeout();
      }
    }
  }

  /**
   * Get session duration
   * @returns {number} Session duration in milliseconds
   */
  getSessionDuration() {
    return this.sessionDuration;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
}

// Make available globally for importScripts
if (typeof window !== 'undefined') {
    window.SessionManager = SessionManager;
} else {
    // For service worker context
    self.SessionManager = SessionManager;
}