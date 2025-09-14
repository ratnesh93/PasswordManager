/**
 * Mock OAuth Handler for Development/Testing
 * Simulates Gmail authentication without requiring real OAuth setup
 */
class MockOAuthHandler {
  constructor() {
    this.currentToken = null;
    this.tokenExpiry = null;
    this.userInfo = null;
    this.isDevMode = true;
  }

  /**
   * Simulate Gmail OAuth authentication flow
   * @returns {Promise<{token: string, userInfo: object}>} Authentication result
   */
  async authenticate() {
    try {
      console.log('🔧 Using Mock OAuth for development');
      
      // Simulate OAuth delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate mock token and user info
      const token = 'mock_token_' + Date.now();
      const userInfo = {
        id: 'mock_user_123',
        email: 'developer@example.com',
        name: 'Test Developer',
        picture: 'https://via.placeholder.com/96x96?text=DEV'
      };
      
      // Store token and user info
      this.currentToken = token;
      this.userInfo = userInfo;
      this.tokenExpiry = Date.now() + (3600 * 1000); // 1 hour expiry
      
      console.log('✅ Mock authentication successful:', userInfo);
      
      return { token, userInfo };
    } catch (error) {
      console.error('Mock OAuth authentication failed:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Mock token validation
   * @param {string} token - OAuth token
   * @returns {Promise<object>} User information
   */
  async validateToken(token) {
    if (!token || !token.startsWith('mock_token_')) {
      throw new Error('Invalid mock token');
    }
    
    return {
      id: 'mock_user_123',
      email: 'developer@example.com',
      name: 'Test Developer',
      picture: 'https://via.placeholder.com/96x96?text=DEV'
    };
  }

  /**
   * Mock token refresh
   * @returns {Promise<string>} New OAuth token
   */
  async refreshToken() {
    console.log('🔄 Refreshing mock token');
    
    const newToken = 'mock_token_' + Date.now();
    this.currentToken = newToken;
    this.tokenExpiry = Date.now() + (3600 * 1000);
    
    return newToken;
  }

  /**
   * Check if current token is valid
   * @returns {boolean} True if token is valid
   */
  isTokenValid() {
    return !!(this.currentToken && this.tokenExpiry && this.tokenExpiry > Date.now());
  }

  /**
   * Get a valid token (refresh if needed)
   * @returns {Promise<string>} Valid OAuth token
   */
  async getValidToken() {
    if (this.isTokenValid()) {
      return this.currentToken;
    }
    
    return await this.refreshToken();
  }

  /**
   * Sign out and clear all authentication data
   * @returns {Promise<void>}
   */
  async signOut() {
    console.log('👋 Mock sign out');
    
    this.currentToken = null;
    this.userInfo = null;
    this.tokenExpiry = null;
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean} True if user is authenticated
   */
  isAuthenticated() {
    return !!(this.isTokenValid() && this.userInfo !== null);
  }

  /**
   * Get current user info
   * @returns {object|null} User information or null
   */
  getCurrentUser() {
    return this.userInfo;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MockOAuthHandler;
}

export default MockOAuthHandler;