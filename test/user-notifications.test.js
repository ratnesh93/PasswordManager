/**
 * Tests for User Notifications Utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserNotifications, userNotifications } from '../src/utils/user-notifications.js';
import { ErrorTypes } from '../src/utils/error-handler.js';

// Mock DOM methods
const mockDOM = () => {
  global.document = {
    createElement: vi.fn((tag) => {
      const element = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        appendChild: vi.fn(),
        querySelector: vi.fn(),
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        addEventListener: vi.fn()
      };
      return element;
    }),
    getElementById: vi.fn(),
    body: {
      appendChild: vi.fn()
    }
  };

  global.requestAnimationFrame = vi.fn((callback) => {
    setTimeout(callback, 0);
    return 1;
  });

  global.setTimeout = vi.fn((callback, delay) => {
    callback();
    return 1;
  });
};

describe('UserNotifications', () => {
  let notifications;
  let mockElement;
  let mockContainer;

  beforeEach(() => {
    mockDOM();
    notifications = new UserNotifications();
    
    mockElement = {
      id: '',
      className: '',
      innerHTML: '',
      style: {},
      appendChild: vi.fn(),
      querySelector: vi.fn(),
      classList: { add: vi.fn() },
      addEventListener: vi.fn(),
      parentNode: {
        removeChild: vi.fn()
      }
    };

    mockContainer = {
      id: 'notification-container',
      appendChild: vi.fn()
    };

    document.createElement.mockReturnValue(mockElement);
    
    // Mock getElementById to return mockContainer for container, mockElement for notifications
    document.getElementById.mockImplementation((id) => {
      if (id === 'notification-container') {
        return mockContainer;
      } else if (id.startsWith('notification-')) {
        return mockElement;
      }
      return null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Notifications', () => {
    it('should show error notification', () => {
      const errorInfo = {
        message: 'Test error message',
        recoveryOptions: ['Try again', 'Check input'],
        retryable: true,
        canRetry: true
      };

      const notificationId = notifications.showError(errorInfo);

      expect(notificationId).toBeTruthy();
      expect(notifications.notifications.has(notificationId)).toBe(true);
      
      const notification = notifications.notifications.get(notificationId);
      expect(notification.type).toBe('error');
      expect(notification.message).toBe('Test error message');
      expect(notification.retryable).toBe(true);
    });

    it('should show error with custom title', () => {
      const errorInfo = {
        message: 'Authentication failed',
        retryable: false,
        canRetry: false
      };

      const notificationId = notifications.showError(errorInfo, {
        title: 'Login Error'
      });

      const notification = notifications.notifications.get(notificationId);
      expect(notification.title).toBe('Login Error');
    });

    it('should handle persistent error notifications', () => {
      const errorInfo = {
        message: 'Retryable error',
        retryable: true,
        canRetry: true
      };

      const notificationId = notifications.showError(errorInfo);
      const notification = notifications.notifications.get(notificationId);
      
      expect(notification.duration).toBe(0); // Persistent for retryable errors
    });

    it('should handle temporary error notifications', () => {
      const errorInfo = {
        message: 'Non-retryable error',
        retryable: false,
        canRetry: false
      };

      const notificationId = notifications.showError(errorInfo);
      const notification = notifications.notifications.get(notificationId);
      
      expect(notification.duration).toBe(5000); // Auto-dismiss
    });
  });

  describe('Success Notifications', () => {
    it('should show success notification', () => {
      const notificationId = notifications.showSuccess('Operation completed successfully');

      expect(notificationId).toBeTruthy();
      
      const notification = notifications.notifications.get(notificationId);
      expect(notification.type).toBe('success');
      expect(notification.message).toBe('Operation completed successfully');
      expect(notification.duration).toBe(3000);
    });

    it('should show success with custom options', () => {
      const notificationId = notifications.showSuccess('Saved!', {
        title: 'Success',
        duration: 2000
      });

      const notification = notifications.notifications.get(notificationId);
      expect(notification.title).toBe('Success');
      expect(notification.duration).toBe(2000);
    });
  });

  describe('Warning Notifications', () => {
    it('should show warning notification', () => {
      const notificationId = notifications.showWarning('This is a warning');

      const notification = notifications.notifications.get(notificationId);
      expect(notification.type).toBe('warning');
      expect(notification.message).toBe('This is a warning');
      expect(notification.duration).toBe(4000);
    });
  });

  describe('Info Notifications', () => {
    it('should show info notification', () => {
      const notificationId = notifications.showInfo('Information message');

      const notification = notifications.notifications.get(notificationId);
      expect(notification.type).toBe('info');
      expect(notification.message).toBe('Information message');
      expect(notification.duration).toBe(3000);
    });
  });

  describe('Notification Display', () => {
    it('should create notification container if not exists', () => {
      document.getElementById.mockReturnValue(null);
      
      const errorInfo = { message: 'Test error' };
      notifications.showError(errorInfo);

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(document.body.appendChild).toHaveBeenCalled();
    });

    it('should use existing notification container', () => {
      const errorInfo = { message: 'Test error' };
      notifications.showError(errorInfo);

      expect(document.getElementById).toHaveBeenCalledWith('notification-container');
      expect(mockContainer.appendChild).toHaveBeenCalled();
    });

    it('should create notification element with correct structure', () => {
      const errorInfo = {
        message: 'Test error',
        recoveryOptions: ['Option 1', 'Option 2'],
        retryable: true,
        canRetry: true
      };

      notifications.showError(errorInfo);

      expect(document.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.innerHTML).toContain('Test error');
    });
  });

  describe('Recovery Options', () => {
    it('should display recovery options in notification', () => {
      const errorInfo = {
        message: 'Error occurred',
        recoveryOptions: ['Try again', 'Check settings', 'Contact support']
      };

      notifications.showError(errorInfo);

      const htmlContent = mockElement.innerHTML;
      expect(htmlContent).toContain('Try these solutions:');
      expect(htmlContent).toContain('Try again');
      expect(htmlContent).toContain('Check settings');
      expect(htmlContent).toContain('Contact support');
    });

    it('should not display recovery options section when empty', () => {
      const errorInfo = {
        message: 'Error occurred',
        recoveryOptions: []
      };

      notifications.showError(errorInfo);

      const htmlContent = mockElement.innerHTML;
      expect(htmlContent).not.toContain('Try these solutions:');
    });
  });

  describe('Action Buttons', () => {
    it('should show retry button for retryable errors', () => {
      const errorInfo = {
        message: 'Retryable error',
        retryable: true,
        canRetry: true
      };

      notifications.showError(errorInfo);

      const htmlContent = mockElement.innerHTML;
      expect(htmlContent).toContain('Retry');
      expect(htmlContent).toContain('Dismiss');
    });

    it('should disable retry button when max retries reached', () => {
      const errorInfo = {
        message: 'Retryable error',
        retryable: true,
        canRetry: false
      };

      notifications.showError(errorInfo);

      const htmlContent = mockElement.innerHTML;
      expect(htmlContent).toContain('Max retries reached');
      expect(htmlContent).toContain('disabled');
    });

    it('should not show action buttons for non-retryable errors', () => {
      const errorInfo = {
        message: 'Non-retryable error',
        retryable: false
      };

      notifications.showError(errorInfo);

      const htmlContent = mockElement.innerHTML;
      expect(htmlContent).not.toContain('Retry');
    });
  });

  describe('Event Listeners', () => {
    it('should add event listeners to notification elements', () => {
      const errorInfo = {
        message: 'Test error',
        retryable: true,
        canRetry: true
      };

      const mockQuerySelector = vi.fn();
      mockElement.querySelector = mockQuerySelector;
      
      // Mock button elements
      const mockCloseBtn = { addEventListener: vi.fn() };
      const mockRetryBtn = { addEventListener: vi.fn(), disabled: false };
      const mockDismissBtn = { addEventListener: vi.fn() };

      mockQuerySelector
        .mockReturnValueOnce(mockCloseBtn)
        .mockReturnValueOnce(mockRetryBtn)
        .mockReturnValueOnce(mockDismissBtn);

      notifications.showError(errorInfo);

      expect(mockCloseBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockRetryBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockDismissBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should call onRetry callback when retry button is clicked', () => {
      const onRetry = vi.fn();
      const errorInfo = {
        message: 'Test error',
        retryable: true,
        canRetry: true
      };

      const mockRetryBtn = { 
        addEventListener: vi.fn(),
        disabled: false
      };
      mockElement.querySelector = vi.fn().mockReturnValue(mockRetryBtn);

      notifications.showError(errorInfo, { onRetry });

      // Simulate retry button click
      const clickHandler = mockRetryBtn.addEventListener.mock.calls[0][1];
      clickHandler();

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('Notification Dismissal', () => {
    it('should dismiss notification by ID', () => {
      const errorInfo = { message: 'Test error' };
      const notificationId = notifications.showError(errorInfo);

      // Mock the element for dismissal
      const mockNotificationElement = {
        style: {},
        parentNode: {
          removeChild: vi.fn()
        }
      };
      document.getElementById.mockReturnValue(mockNotificationElement);

      notifications.dismissNotification(notificationId);

      expect(mockNotificationElement.style.transform).toBe('translateX(100%)');
      expect(mockNotificationElement.style.opacity).toBe('0');
      expect(notifications.notifications.has(notificationId)).toBe(false);
    });

    it('should call onDismiss callback when notification is dismissed', () => {
      const onDismiss = vi.fn();
      const errorInfo = { message: 'Test error' };
      const notificationId = notifications.showError(errorInfo, { onDismiss });

      notifications.dismissNotification(notificationId);

      expect(onDismiss).toHaveBeenCalled();
    });

    it('should handle dismissing non-existent notification', () => {
      expect(() => {
        notifications.dismissNotification('non-existent-id');
      }).not.toThrow();
    });
  });

  describe('Clear All Notifications', () => {
    it('should clear all notifications', () => {
      const errorInfo = { message: 'Error 1' };
      const successMessage = 'Success 1';

      const errorId = notifications.showError(errorInfo);
      const successId = notifications.showSuccess(successMessage);

      expect(notifications.notifications.size).toBe(2);

      notifications.clearAll();

      expect(notifications.notifications.size).toBe(0);
    });
  });

  describe('Color Schemes', () => {
    it('should return correct colors for different notification types', () => {
      expect(notifications.getBackgroundColor('error')).toBe('#fee');
      expect(notifications.getBackgroundColor('success')).toBe('#efe');
      expect(notifications.getBackgroundColor('warning')).toBe('#fff3cd');
      expect(notifications.getBackgroundColor('info')).toBe('#e7f3ff');

      expect(notifications.getTextColor('error')).toBe('#721c24');
      expect(notifications.getTextColor('success')).toBe('#155724');
      expect(notifications.getTextColor('warning')).toBe('#856404');
      expect(notifications.getTextColor('info')).toBe('#004085');

      expect(notifications.getBorderColor('error')).toBe('#f5c6cb');
      expect(notifications.getBorderColor('success')).toBe('#c3e6cb');
      expect(notifications.getBorderColor('warning')).toBe('#ffeaa7');
      expect(notifications.getBorderColor('info')).toBe('#b3d7ff');
    });

    it('should return default colors for unknown types', () => {
      expect(notifications.getBackgroundColor('unknown')).toBe('#e7f3ff');
      expect(notifications.getTextColor('unknown')).toBe('#004085');
      expect(notifications.getBorderColor('unknown')).toBe('#b3d7ff');
    });
  });

  describe('Singleton Instance', () => {
    it('should export a singleton user notifications instance', () => {
      expect(userNotifications).toBeInstanceOf(UserNotifications);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle authentication error notification flow', () => {
      const errorInfo = {
        type: ErrorTypes.AUTHENTICATION,
        message: 'Invalid master password. Please try again.',
        recoveryOptions: ['Check your password', 'Try signing in again'],
        retryable: true,
        canRetry: true
      };

      const onRetry = vi.fn();
      const notificationId = notifications.showError(errorInfo, { onRetry });

      const notification = notifications.notifications.get(notificationId);
      expect(notification.type).toBe('error');
      expect(notification.retryable).toBe(true);
      expect(notification.duration).toBe(0); // Persistent
    });

    it('should handle import/export error notification flow', () => {
      const errorInfo = {
        type: ErrorTypes.IMPORT_EXPORT,
        message: 'Failed to decrypt import file. Please check your key phrase.',
        recoveryOptions: ['Verify key phrase', 'Try different file'],
        retryable: true,
        canRetry: true
      };

      const notificationId = notifications.showError(errorInfo);
      const notification = notifications.notifications.get(notificationId);
      
      expect(notification.message).toContain('decrypt');
      expect(notification.recoveryOptions).toContain('Verify key phrase');
    });

    it('should handle success notification for credential save', () => {
      const notificationId = notifications.showSuccess('Credential saved successfully');
      const notification = notifications.notifications.get(notificationId);
      
      expect(notification.type).toBe('success');
      expect(notification.duration).toBe(3000);
    });
  });
});