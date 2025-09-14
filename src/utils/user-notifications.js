/**
 * User Notifications Utility
 * Handles displaying error messages and notifications to users
 */

export class UserNotifications {
  constructor() {
    this.notifications = new Map();
    this.notificationId = 0;
  }

  /**
   * Show an error notification to the user
   * @param {Object} errorInfo - Error information from ErrorHandler
   * @param {Object} options - Display options
   * @returns {string} Notification ID
   */
  showError(errorInfo, options = {}) {
    const notification = {
      id: ++this.notificationId,
      type: 'error',
      title: options.title || 'Error',
      message: errorInfo.message,
      recoveryOptions: errorInfo.recoveryOptions || [],
      retryable: errorInfo.retryable,
      canRetry: errorInfo.canRetry,
      timestamp: Date.now(),
      duration: options.duration || (errorInfo.retryable ? 0 : 5000), // 0 = persistent for retryable errors
      onRetry: options.onRetry,
      onDismiss: options.onDismiss
    };

    this.notifications.set(notification.id, notification);
    this.displayNotification(notification);

    // Auto-dismiss non-persistent notifications
    if (notification.duration > 0) {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, notification.duration);
    }

    return notification.id;
  }

  /**
   * Show a success notification
   * @param {string} message - Success message
   * @param {Object} options - Display options
   * @returns {string} Notification ID
   */
  showSuccess(message, options = {}) {
    const notification = {
      id: ++this.notificationId,
      type: 'success',
      title: options.title || 'Success',
      message,
      timestamp: Date.now(),
      duration: options.duration || 3000
    };

    this.notifications.set(notification.id, notification);
    this.displayNotification(notification);

    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, notification.duration);

    return notification.id;
  }

  /**
   * Show a warning notification
   * @param {string} message - Warning message
   * @param {Object} options - Display options
   * @returns {string} Notification ID
   */
  showWarning(message, options = {}) {
    const notification = {
      id: ++this.notificationId,
      type: 'warning',
      title: options.title || 'Warning',
      message,
      timestamp: Date.now(),
      duration: options.duration || 4000
    };

    this.notifications.set(notification.id, notification);
    this.displayNotification(notification);

    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, notification.duration);

    return notification.id;
  }

  /**
   * Show an info notification
   * @param {string} message - Info message
   * @param {Object} options - Display options
   * @returns {string} Notification ID
   */
  showInfo(message, options = {}) {
    const notification = {
      id: ++this.notificationId,
      type: 'info',
      title: options.title || 'Information',
      message,
      timestamp: Date.now(),
      duration: options.duration || 3000
    };

    this.notifications.set(notification.id, notification);
    this.displayNotification(notification);

    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, notification.duration);

    return notification.id;
  }

  /**
   * Display notification in the UI
   * @param {Object} notification - Notification object
   */
  displayNotification(notification) {
    // Create notification element
    const notificationElement = this.createNotificationElement(notification);
    
    // Get or create notification container
    let container = document.getElementById('notification-container');
    if (!container) {
      container = this.createNotificationContainer();
      document.body.appendChild(container);
    }

    // Add notification to container
    container.appendChild(notificationElement);

    // Animate in
    requestAnimationFrame(() => {
      notificationElement.classList.add('show');
    });
  }

  /**
   * Create notification container
   * @returns {HTMLElement} Container element
   */
  createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 400px;
      pointer-events: none;
    `;
    return container;
  }

  /**
   * Create notification element
   * @param {Object} notification - Notification object
   * @returns {HTMLElement} Notification element
   */
  createNotificationElement(notification) {
    const element = document.createElement('div');
    element.id = `notification-${notification.id}`;
    element.className = `notification notification-${notification.type}`;
    element.style.cssText = `
      background: ${this.getBackgroundColor(notification.type)};
      color: ${this.getTextColor(notification.type)};
      border: 1px solid ${this.getBorderColor(notification.type)};
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
      opacity: 0;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;

    // Create content
    const content = document.createElement('div');
    content.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between;">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px;">${notification.title}</div>
          <div style="margin-bottom: ${notification.recoveryOptions?.length ? '12px' : '0'};">${notification.message}</div>
          ${this.createRecoveryOptionsHTML(notification)}
        </div>
        <button class="notification-close" style="
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 0;
          margin-left: 12px;
          opacity: 0.7;
        ">&times;</button>
      </div>
      ${this.createActionButtonsHTML(notification)}
    `;

    element.appendChild(content);

    // Add event listeners
    this.addNotificationEventListeners(element, notification);

    return element;
  }

  /**
   * Create recovery options HTML
   * @param {Object} notification - Notification object
   * @returns {string} HTML string
   */
  createRecoveryOptionsHTML(notification) {
    if (!notification.recoveryOptions || notification.recoveryOptions.length === 0) {
      return '';
    }

    const options = notification.recoveryOptions
      .map(option => `<li style="margin-bottom: 4px;">${option}</li>`)
      .join('');

    return `
      <div style="margin-top: 8px;">
        <div style="font-weight: 500; margin-bottom: 6px; font-size: 13px;">Try these solutions:</div>
        <ul style="margin: 0; padding-left: 16px; font-size: 13px; opacity: 0.9;">
          ${options}
        </ul>
      </div>
    `;
  }

  /**
   * Create action buttons HTML
   * @param {Object} notification - Notification object
   * @returns {string} HTML string
   */
  createActionButtonsHTML(notification) {
    if (notification.type !== 'error' || !notification.retryable) {
      return '';
    }

    const retryDisabled = !notification.canRetry;
    
    return `
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="notification-retry" ${retryDisabled ? 'disabled' : ''} style="
          background: ${retryDisabled ? '#ccc' : '#007cba'};
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: ${retryDisabled ? 'not-allowed' : 'pointer'};
          font-weight: 500;
        ">
          ${retryDisabled ? 'Max retries reached' : 'Retry'}
        </button>
        <button class="notification-dismiss" style="
          background: transparent;
          color: inherit;
          border: 1px solid currentColor;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          opacity: 0.8;
        ">
          Dismiss
        </button>
      </div>
    `;
  }

  /**
   * Add event listeners to notification element
   * @param {HTMLElement} element - Notification element
   * @param {Object} notification - Notification object
   */
  addNotificationEventListeners(element, notification) {
    // Close button
    const closeBtn = element.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.dismissNotification(notification.id);
      });
    }

    // Retry button
    const retryBtn = element.querySelector('.notification-retry');
    if (retryBtn && !retryBtn.disabled) {
      retryBtn.addEventListener('click', () => {
        if (notification.onRetry) {
          notification.onRetry();
        }
        this.dismissNotification(notification.id);
      });
    }

    // Dismiss button
    const dismissBtn = element.querySelector('.notification-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.dismissNotification(notification.id);
      });
    }
  }

  /**
   * Dismiss a notification
   * @param {string} notificationId - Notification ID
   */
  dismissNotification(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    const element = document.getElementById(`notification-${notificationId}`);
    if (element) {
      element.style.transform = 'translateX(100%)';
      element.style.opacity = '0';
      
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 300);
    }

    // Call dismiss callback
    if (notification.onDismiss) {
      notification.onDismiss();
    }

    this.notifications.delete(notificationId);
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    this.notifications.forEach((_, id) => {
      this.dismissNotification(id);
    });
  }

  /**
   * Get background color for notification type
   * @param {string} type - Notification type
   * @returns {string} Background color
   */
  getBackgroundColor(type) {
    const colors = {
      error: '#fee',
      success: '#efe',
      warning: '#fff3cd',
      info: '#e7f3ff'
    };
    return colors[type] || colors.info;
  }

  /**
   * Get text color for notification type
   * @param {string} type - Notification type
   * @returns {string} Text color
   */
  getTextColor(type) {
    const colors = {
      error: '#721c24',
      success: '#155724',
      warning: '#856404',
      info: '#004085'
    };
    return colors[type] || colors.info;
  }

  /**
   * Get border color for notification type
   * @param {string} type - Notification type
   * @returns {string} Border color
   */
  getBorderColor(type) {
    const colors = {
      error: '#f5c6cb',
      success: '#c3e6cb',
      warning: '#ffeaa7',
      info: '#b3d7ff'
    };
    return colors[type] || colors.info;
  }
}

// Export singleton instance
export const userNotifications = new UserNotifications();