/**
 * Simple Session Manager for Master Password Authentication
 * SECURITY: Sessions are in-memory only and do NOT persist across browser restarts
 * Users must re-login every time the browser is restarted for enhanced security
 */
class SimpleSessionManager {
    constructor() {
        this.isLoggedIn = false;
        this.sessionTimeout = null;
        this.sessionDuration = 30 * 60 * 1000; // 30 minutes
        this.sessionKey = 'passwordManagerSession';
        this.initialized = true; // No initialization needed - always start logged out
        
        // Clear any existing sessions on startup for security
        this.clearSession().catch(error => {
            console.error('Failed to clear existing session:', error);
        });
    }

    /**
     * Initialize session - always starts logged out for security
     */
    async initializeSession() {
        // Always start logged out on browser restart for enhanced security
        console.log('SimpleSessionManager: Starting fresh - user must login after browser restart');
        this.isLoggedIn = false;
        await this.clearSession();
    }

    /**
     * Create new session after successful login
     * @param {string} masterPassword - Master password (not stored, just used for validation)
     */
    async createSession(masterPassword) {
        try {
            // Create in-memory session only (no persistence across browser restarts)
            this.isLoggedIn = true;
            this.startSessionTimeout();
            
            console.log('SimpleSessionManager: In-memory session created (expires on browser restart or after 30 minutes)');
        } catch (error) {
            console.error('SimpleSessionManager: Failed to create session:', error);
            throw error;
        }
    }

    /**
     * Check if user is currently logged in
     */
    async isUserLoggedIn() {
        // Always return current login state - no persistence across browser restarts
        return this.isLoggedIn;
    }

    /**
     * Update session activity
     */
    async updateActivity() {
        if (!this.isLoggedIn) {
            return;
        }

        // Just restart the timeout for in-memory session
        this.startSessionTimeout();
        console.log('SimpleSessionManager: Session activity updated');
    }

    /**
     * Clear session and logout
     */
    async clearSession() {
        try {
            if (this.sessionTimeout) {
                clearTimeout(this.sessionTimeout);
                this.sessionTimeout = null;
            }

            this.isLoggedIn = false;
            // Clear any stored session data for security
            await this.removeSessionFromStorage();
            
            console.log('SimpleSessionManager: Session cleared');
        } catch (error) {
            console.error('SimpleSessionManager: Failed to clear session:', error);
        }
    }

    /**
     * Logout user
     */
    async logout() {
        await this.clearSession();
    }

    /**
     * Start session timeout
     */
    startSessionTimeout() {
        if (this.sessionTimeout) {
            clearTimeout(this.sessionTimeout);
        }

        this.sessionTimeout = setTimeout(async () => {
            console.log('Session timed out');
            await this.clearSession();
        }, this.sessionDuration);
    }

    /**
     * Check if session is valid
     */
    isSessionValid(sessionData) {
        if (!sessionData || !sessionData.expiresAt) {
            return false;
        }
        return Date.now() < sessionData.expiresAt;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2);
    }

    /**
     * Save session to Chrome storage
     */
    async saveSessionToStorage(sessionData) {
        return new Promise((resolve, reject) => {
            console.log('SimpleSessionManager: Saving session to storage:', sessionData);
            chrome.storage.local.set({ 
                [this.sessionKey]: sessionData 
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error('SimpleSessionManager: Failed to save session:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    console.log('SimpleSessionManager: Session saved successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Get session from Chrome storage
     */
    async getSessionFromStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.sessionKey], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('SimpleSessionManager: Failed to get session from storage:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    const sessionData = result[this.sessionKey] || null;
                    console.log('SimpleSessionManager: Retrieved session from storage:', sessionData ? 'found' : 'not found');
                    if (sessionData) {
                        console.log('SimpleSessionManager: Session details - expires at:', new Date(sessionData.expiresAt), 'current time:', new Date());
                    }
                    resolve(sessionData);
                }
            });
        });
    }

    /**
     * Remove session from Chrome storage
     */
    async removeSessionFromStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove([this.sessionKey], () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get current user info (simplified for password-based auth)
     */
    getCurrentUser() {
        if (!this.isLoggedIn) {
            return null;
        }
        return { type: 'local', authenticated: true };
    }
}

// Make available globally for importScripts
if (typeof window !== 'undefined') {
    window.SimpleSessionManager = SimpleSessionManager;
} else {
    // For service worker context
    self.SimpleSessionManager = SimpleSessionManager;
}