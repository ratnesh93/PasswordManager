/**
 * Tests for Permission Manager
 * Tests permission checking, requesting, and management functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
    permissions: {
        contains: vi.fn(),
        request: vi.fn(),
        remove: vi.fn(),
        getAll: vi.fn(),
        onAdded: {
            addListener: vi.fn()
        },
        onRemoved: {
            addListener: vi.fn()
        }
    }
};

// Set up global chrome mock
global.chrome = mockChrome;

// Import the PermissionManager class
const PermissionManager = (await import('../src/utils/permission-manager.js')).default || 
                         (await import('../src/utils/permission-manager.js')).PermissionManager ||
                         global.PermissionManager;

describe('PermissionManager', () => {
    let permissionManager;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Create new instance
        permissionManager = new PermissionManager();
    });

    describe('Constructor', () => {
        it('should initialize with correct default permissions', () => {
            expect(permissionManager.requiredPermissions).toEqual(['storage', 'identity', 'contextMenus']);
            expect(permissionManager.optionalPermissions).toEqual(['activeTab', 'scripting']);
            expect(permissionManager.optionalHostPermissions).toEqual(['<all_urls>']);
        });
    });

    describe('hasRequiredPermissions', () => {
        it('should return true when all required permissions are granted', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.hasRequiredPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.contains).toHaveBeenCalledWith({
                permissions: ['storage', 'identity', 'contextMenus']
            });
        });

        it('should return false when required permissions are missing', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);

            const result = await permissionManager.hasRequiredPermissions();

            expect(result).toBe(false);
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));

            const result = await permissionManager.hasRequiredPermissions();

            expect(result).toBe(false);
        });
    });

    describe('hasOptionalPermissions', () => {
        it('should check default optional permissions when none specified', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.hasOptionalPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.contains).toHaveBeenCalledWith({
                permissions: ['activeTab', 'scripting']
            });
        });

        it('should check specific permissions when provided', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.hasOptionalPermissions(['activeTab']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.contains).toHaveBeenCalledWith({
                permissions: ['activeTab']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));

            const result = await permissionManager.hasOptionalPermissions();

            expect(result).toBe(false);
        });
    });

    describe('hasHostPermissions', () => {
        it('should check default host permissions when none specified', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.hasHostPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.contains).toHaveBeenCalledWith({
                origins: ['<all_urls>']
            });
        });

        it('should check specific origins when provided', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.hasHostPermissions(['https://example.com/*']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.contains).toHaveBeenCalledWith({
                origins: ['https://example.com/*']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));

            const result = await permissionManager.hasHostPermissions();

            expect(result).toBe(false);
        });
    });

    describe('requestOptionalPermissions', () => {
        it('should return true if permissions already granted', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.requestOptionalPermissions(['activeTab']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).not.toHaveBeenCalled();
        });

        it('should request permissions if not already granted', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(true);

            const result = await permissionManager.requestOptionalPermissions(['activeTab']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                permissions: ['activeTab']
            });
        });

        it('should return false if permission request is denied', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(false);

            const result = await permissionManager.requestOptionalPermissions(['activeTab']);

            expect(result).toBe(false);
        });

        it('should use default permissions when none specified', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(true);

            const result = await permissionManager.requestOptionalPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                permissions: ['activeTab', 'scripting']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));
            // Don't mock request since we should never get there due to check failure

            const result = await permissionManager.requestOptionalPermissions(['activeTab']);

            expect(result).toBe(false);
            expect(mockChrome.permissions.request).not.toHaveBeenCalled();
        });
    });

    describe('requestHostPermissions', () => {
        it('should return true if permissions already granted', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.requestHostPermissions(['https://example.com/*']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).not.toHaveBeenCalled();
        });

        it('should request permissions if not already granted', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(true);

            const result = await permissionManager.requestHostPermissions(['https://example.com/*']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                origins: ['https://example.com/*']
            });
        });

        it('should return false if permission request is denied', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(false);

            const result = await permissionManager.requestHostPermissions(['https://example.com/*']);

            expect(result).toBe(false);
        });

        it('should use default origins when none specified', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(true);

            const result = await permissionManager.requestHostPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                origins: ['<all_urls>']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));
            // Don't mock request since we should never get there due to check failure

            const result = await permissionManager.requestHostPermissions(['https://example.com/*']);

            expect(result).toBe(false);
            expect(mockChrome.permissions.request).not.toHaveBeenCalled();
        });
    });

    describe('requestAutofillPermissions', () => {
        it('should request both optional and host permissions for autofill', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request.mockResolvedValue(true);

            const result = await permissionManager.requestAutofillPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.request).toHaveBeenCalledTimes(2);
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                permissions: ['activeTab', 'scripting']
            });
            expect(mockChrome.permissions.request).toHaveBeenCalledWith({
                origins: ['<all_urls>']
            });
        });

        it('should return false if either permission request fails', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);
            mockChrome.permissions.request
                .mockResolvedValueOnce(true)  // First request succeeds
                .mockResolvedValueOnce(false); // Second request fails

            const result = await permissionManager.requestAutofillPermissions();

            expect(result).toBe(false);
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));
            // Don't mock request since we should never get there due to check failure

            const result = await permissionManager.requestAutofillPermissions();

            expect(result).toBe(false);
            expect(mockChrome.permissions.request).not.toHaveBeenCalled();
        });
    });

    describe('removeOptionalPermissions', () => {
        it('should remove specified permissions', async () => {
            mockChrome.permissions.remove.mockResolvedValue(true);

            const result = await permissionManager.removeOptionalPermissions(['activeTab']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.remove).toHaveBeenCalledWith({
                permissions: ['activeTab']
            });
        });

        it('should remove default permissions when none specified', async () => {
            mockChrome.permissions.remove.mockResolvedValue(true);

            const result = await permissionManager.removeOptionalPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.remove).toHaveBeenCalledWith({
                permissions: ['activeTab', 'scripting']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.remove.mockRejectedValue(new Error('Permission removal failed'));

            const result = await permissionManager.removeOptionalPermissions(['activeTab']);

            expect(result).toBe(false);
        });
    });

    describe('removeHostPermissions', () => {
        it('should remove specified host permissions', async () => {
            mockChrome.permissions.remove.mockResolvedValue(true);

            const result = await permissionManager.removeHostPermissions(['https://example.com/*']);

            expect(result).toBe(true);
            expect(mockChrome.permissions.remove).toHaveBeenCalledWith({
                origins: ['https://example.com/*']
            });
        });

        it('should remove default host permissions when none specified', async () => {
            mockChrome.permissions.remove.mockResolvedValue(true);

            const result = await permissionManager.removeHostPermissions();

            expect(result).toBe(true);
            expect(mockChrome.permissions.remove).toHaveBeenCalledWith({
                origins: ['<all_urls>']
            });
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.remove.mockRejectedValue(new Error('Permission removal failed'));

            const result = await permissionManager.removeHostPermissions(['https://example.com/*']);

            expect(result).toBe(false);
        });
    });

    describe('getAllPermissions', () => {
        it('should return all current permissions', async () => {
            const mockPermissions = {
                permissions: ['storage', 'identity', 'activeTab'],
                origins: ['https://example.com/*']
            };
            mockChrome.permissions.getAll.mockResolvedValue(mockPermissions);

            const result = await permissionManager.getAllPermissions();

            expect(result).toEqual(mockPermissions);
            expect(mockChrome.permissions.getAll).toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.getAll.mockRejectedValue(new Error('Failed to get permissions'));

            const result = await permissionManager.getAllPermissions();

            expect(result).toEqual({ permissions: [], origins: [] });
        });
    });

    describe('setupPermissionListeners', () => {
        it('should set up permission change listeners', () => {
            const onAdded = vi.fn();
            const onRemoved = vi.fn();

            permissionManager.setupPermissionListeners(onAdded, onRemoved);

            expect(mockChrome.permissions.onAdded.addListener).toHaveBeenCalledWith(expect.any(Function));
            expect(mockChrome.permissions.onRemoved.addListener).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should handle missing permission events gracefully', () => {
            // Remove the event listeners to test graceful handling
            delete mockChrome.permissions.onAdded;
            delete mockChrome.permissions.onRemoved;

            const onAdded = vi.fn();
            const onRemoved = vi.fn();

            expect(() => {
                permissionManager.setupPermissionListeners(onAdded, onRemoved);
            }).not.toThrow();
        });
    });

    describe('validateMinimumPermissions', () => {
        it('should return true when all required permissions are present', async () => {
            mockChrome.permissions.contains.mockResolvedValue(true);

            const result = await permissionManager.validateMinimumPermissions();

            expect(result).toBe(true);
        });

        it('should return false when required permissions are missing', async () => {
            mockChrome.permissions.contains.mockResolvedValue(false);

            const result = await permissionManager.validateMinimumPermissions();

            expect(result).toBe(false);
        });

        it('should handle errors gracefully', async () => {
            mockChrome.permissions.contains.mockRejectedValue(new Error('Permission check failed'));

            const result = await permissionManager.validateMinimumPermissions();

            expect(result).toBe(false);
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete autofill permission flow', async () => {
            // Initially no permissions
            mockChrome.permissions.contains.mockResolvedValue(false);
            
            // Permission requests succeed
            mockChrome.permissions.request.mockResolvedValue(true);

            // Check initial state
            const hasInitialPermissions = await permissionManager.requestAutofillPermissions();
            expect(hasInitialPermissions).toBe(true);

            // Verify permissions were requested
            expect(mockChrome.permissions.request).toHaveBeenCalledTimes(2);
        });

        it('should handle permission validation workflow', async () => {
            // Required permissions present
            mockChrome.permissions.contains
                .mockResolvedValueOnce(true)  // Required permissions check
                .mockResolvedValueOnce(false) // Optional permissions check
                .mockResolvedValueOnce(false); // Host permissions check

            const hasRequired = await permissionManager.validateMinimumPermissions();
            const hasOptional = await permissionManager.hasOptionalPermissions();
            const hasHost = await permissionManager.hasHostPermissions();

            expect(hasRequired).toBe(true);
            expect(hasOptional).toBe(false);
            expect(hasHost).toBe(false);
        });
    });
});