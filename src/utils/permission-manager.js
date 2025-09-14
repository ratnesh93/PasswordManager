/**
 * Permission Manager for Chrome Extension
 * Handles runtime permission requests for optional features
 */

class PermissionManager {
  constructor() {
    this.requiredPermissions = ['storage', 'identity', 'contextMenus'];
    this.optionalPermissions = ['activeTab', 'scripting'];
    this.optionalHostPermissions = ['<all_urls>'];
  }

  /**
   * Check if required permissions are granted
   * @returns {Promise<boolean>}
   */
  async hasRequiredPermissions() {
    try {
      return await chrome.permissions.contains({
        permissions: this.requiredPermissions
      });
    } catch (error) {
      console.error('Error checking required permissions:', error);
      return false;
    }
  }

  /**
   * Check if optional permissions are granted
   * @param {string[]} permissions - Array of permission names
   * @returns {Promise<boolean>}
   */
  async hasOptionalPermissions(permissions = []) {
    try {
      const permissionsToCheck = permissions.length > 0 ? permissions : this.optionalPermissions;
      return await chrome.permissions.contains({
        permissions: permissionsToCheck
      });
    } catch (error) {
      console.error('Error checking optional permissions:', error);
      return false;
    }
  }

  /**
   * Check if host permissions are granted
   * @param {string[]} origins - Array of host origins
   * @returns {Promise<boolean>}
   */
  async hasHostPermissions(origins = []) {
    try {
      const originsToCheck = origins.length > 0 ? origins : this.optionalHostPermissions;
      return await chrome.permissions.contains({
        origins: originsToCheck
      });
    } catch (error) {
      console.error('Error checking host permissions:', error);
      return false;
    }
  }

  /**
   * Request optional permissions from user
   * @param {string[]} permissions - Array of permission names
   * @returns {Promise<boolean>}
   */
  async requestOptionalPermissions(permissions = []) {
    try {
      const permissionsToRequest = permissions.length > 0 ? permissions : this.optionalPermissions;
      
      // Check if already granted
      try {
        const alreadyGranted = await this.hasOptionalPermissions(permissionsToRequest);
        if (alreadyGranted) {
          return true;
        }
      } catch (checkError) {
        // If we can't check permissions, we can't proceed
        console.error('Error checking optional permissions:', checkError);
        return false;
      }

      // Request permissions
      const granted = await chrome.permissions.request({
        permissions: permissionsToRequest
      });

      if (granted) {
        console.log('Optional permissions granted:', permissionsToRequest);
      } else {
        console.warn('Optional permissions denied:', permissionsToRequest);
      }

      return granted;
    } catch (error) {
      console.error('Error requesting optional permissions:', error);
      return false;
    }
  }

  /**
   * Request host permissions from user
   * @param {string[]} origins - Array of host origins
   * @returns {Promise<boolean>}
   */
  async requestHostPermissions(origins = []) {
    const originsToRequest = origins.length > 0 ? origins : this.optionalHostPermissions;
  
    try {
      const alreadyGranted = await this.hasHostPermissions(originsToRequest);
      if (alreadyGranted) {
        return true;
      }
    } catch (checkError) {
      console.error('Error checking host permissions:', checkError);
      return false;
    }
  
    return new Promise((resolve) => {
      chrome.permissions.request({ permissions: this.optionalPermissions, origins: originsToRequest }, (granted) => {
        if (chrome.runtime.lastError) {
          console.error('Error requesting host permissions:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
  
        if (granted) {
          console.log('Optional permission granted: ', this.optionalPermissions);
          console.log('Host permissions granted:', originsToRequest);
          resolve(true);
        } else {
          console.warn('Host permissions denied:', originsToRequest);
          resolve(false);
        }
      });
    });
  }
  

  /**
   * Request permissions needed for autofill functionality
   * @returns {Promise<boolean>}
   */
  async requestAutofillPermissions() {
    try {
      // Check if we can even check permissions first
      try {
        await this.hasOptionalPermissions(['activeTab', 'scripting']);
        await this.hasHostPermissions(['<all_urls>']);
      } catch (checkError) {
        console.error('Error checking autofill permissions:', checkError);
        return false;
      }

      const permissionsGranted = await this.requestOptionalPermissions(['activeTab', 'scripting']);
      const hostPermissionsGranted = await this.requestHostPermissions(['<all_urls>']);
      
      return permissionsGranted && hostPermissionsGranted;
    } catch (error) {
      console.error('Error requesting autofill permissions:', error);
      return false;
    }
  }

  /**
   * Remove optional permissions
   * @param {string[]} permissions - Array of permission names
   * @returns {Promise<boolean>}
   */
  async removeOptionalPermissions(permissions = []) {
    try {
      const permissionsToRemove = permissions.length > 0 ? permissions : this.optionalPermissions;
      
      const removed = await chrome.permissions.remove({
        permissions: permissionsToRemove
      });

      if (removed) {
        console.log('Optional permissions removed:', permissionsToRemove);
      }

      return removed;
    } catch (error) {
      console.error('Error removing optional permissions:', error);
      return false;
    }
  }

  /**
   * Remove host permissions
   * @param {string[]} origins - Array of host origins
   * @returns {Promise<boolean>}
   */
  async removeHostPermissions(origins = []) {
    try {
      const originsToRemove = origins.length > 0 ? origins : this.optionalHostPermissions;
      
      const removed = await chrome.permissions.remove({
        origins: originsToRemove
      });

      if (removed) {
        console.log('Host permissions removed:', originsToRemove);
      }

      return removed;
    } catch (error) {
      console.error('Error removing host permissions:', error);
      return false;
    }
  }

  /**
   * Get all currently granted permissions
   * @returns {Promise<Object>}
   */
  async getAllPermissions() {
    try {
      return await chrome.permissions.getAll();
    } catch (error) {
      console.error('Error getting all permissions:', error);
      return { permissions: [], origins: [] };
    }
  }

  /**
   * Set up permission change listeners
   * @param {Function} onAdded - Callback for when permissions are added
   * @param {Function} onRemoved - Callback for when permissions are removed
   */
  setupPermissionListeners(onAdded, onRemoved) {
    if (chrome.permissions.onAdded) {
      chrome.permissions.onAdded.addListener((permissions) => {
        console.log('Permissions added:', permissions);
        if (onAdded) onAdded(permissions);
      });
    }

    if (chrome.permissions.onRemoved) {
      chrome.permissions.onRemoved.addListener((permissions) => {
        console.log('Permissions removed:', permissions);
        if (onRemoved) onRemoved(permissions);
      });
    }
  }

  /**
   * Check if the extension has the minimum required permissions to function
   * @returns {Promise<boolean>}
   */
  async validateMinimumPermissions() {
    const hasRequired = await this.hasRequiredPermissions();
    
    if (!hasRequired) {
      console.error('Extension is missing required permissions:', this.requiredPermissions);
      return false;
    }

    return true;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PermissionManager;
} else if (typeof window !== 'undefined') {
  window.PermissionManager = PermissionManager;
}