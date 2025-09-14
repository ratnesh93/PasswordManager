/**
 * OAuth Handler for Gmail authentication using Chrome Identity API
 * Handles OAuth flow, token validation, and refresh logic
 */
class OAuthHandler {
  constructor() {
    this.currentToken = null;
    this.tokenExpiry = null;
    this.userInfo = null;
  }

  /**
   * Initiate Gmail OAuth authentication flow
   * @returns {Promise<{token: string, userInfo: object}>} Authentication result
   */
  async authenticate() {
    try {
      // Get OAuth token using Chrome Identity API
      const token = await this.getAuthToken();
      
      // Validate token and get user info
      const userInfo = await this.validateToken(token);
      
      // Store token and user info
      this.currentToken = token;
      this.userInfo = userInfo;
      this.tokenExpiry = Date.now() + (3600 * 1000); // 1 hour expiry
      
      return { token, userInfo };
    } catch (error) {
      console.error('OAuth authentication failed:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Get OAuth token from Chrome Identity API
   * @returns {Promise<string>} OAuth token
   */
  async getAuthToken() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!token) {
          reject(new Error('No token received from OAuth flow'));
          return;
        }
        
        resolve(token);
      });
    });
  }

  /**
   * Validate OAuth token and get user information
   * @param {string} token - OAuth token to validate
   * @returns {Promise<object>} User information
   */
  async validateToken(token) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${token}`
      );
      
      if (!response.ok) {
        throw new Error(`Token validation failed: ${response.status}`);
      }
      
      const userInfo = await response.json();
      
      // Validate required fields
      if (!userInfo.email || !userInfo.id) {
        throw new Error('Invalid user information received');
      }
      
      return userInfo;
    } catch (error) {
      console.error('Token validation failed:', error);
      throw error;
    }
  }

  /**
   * Refresh the current OAuth token
   * @returns {Promise<string>} New OAuth token
   */
  async refreshToken() {
    try {
      // Remove cached token to force refresh
      if (this.currentToken) {
        await this.removeToken(this.currentToken);
      }
      
      // Get new token
      const newToken = await this.getAuthToken();
      
      // Validate new token
      const userInfo = await this.validateToken(newToken);
      
      // Update stored values
      this.currentToken = newToken;
      this.userInfo = userInfo;
      this.tokenExpiry = Date.now() + (3600 * 1000);
      
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Check if current token is valid and not expired
   * @returns {boolean} True if token is valid
   */
  isTokenValid() {
    return !!(this.currentToken && 
              this.tokenExpiry && 
              Date.now() < this.tokenExpiry);
  }

  /**
   * Get current user information
   * @returns {object|null} User information or null if not authenticated
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * Get current token, refreshing if necessary
   * @returns {Promise<string>} Valid OAuth token
   */
  async getValidToken() {
    if (this.isTokenValid()) {
      return this.currentToken;
    }
    
    // Token is expired or invalid, refresh it
    return await this.refreshToken();
  }

  /**
   * Remove OAuth token from Chrome Identity API cache
   * @param {string} token - Token to remove
   * @returns {Promise<void>}
   */
  async removeToken(token) {
    return new Promise((resolve, reject) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Sign out user and clear all authentication data
   * @returns {Promise<void>}
   */
  async signOut() {
    try {
      // Remove cached token if exists
      if (this.currentToken) {
        await this.removeToken(this.currentToken);
      }
      
      // Clear stored data
      this.currentToken = null;
      this.tokenExpiry = null;
      this.userInfo = null;
      
      console.log('User signed out successfully');
    } catch (error) {
      console.error('Sign out failed:', error);
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean} True if user is authenticated
   */
  isAuthenticated() {
    return !!(this.isTokenValid() && this.userInfo !== null);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OAuthHandler;
}

export default OAuthHandler;
port default OAuthHandler;