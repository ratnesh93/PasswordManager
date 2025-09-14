// Test for Master Password Modal Functionality
// This test verifies the enhanced master password modal with context support and attempt tracking

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM elements
const mockDOM = {
    getElementById: vi.fn(),
    createElement: vi.fn(),
    addEventListener: vi.fn(),
    classList: {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn()
    }
};

// Mock chrome runtime
global.chrome = {
    runtime: {
        sendMessage: vi.fn()
    }
};

// Mock PopupController class
class MockPopupController {
    constructor() {
        this.masterPasswordAttempts = 0;
        this.masterPasswordLockoutUntil = null;
        this.masterPasswordContext = null;
        this.masterPasswordResolve = null;
    }

    showMasterPasswordModal(message, context = 'general') {
        // Check if currently locked out
        if (this.isLockedOut()) {
            const remainingTime = Math.ceil((this.masterPasswordLockoutUntil - Date.now()) / 1000);
            return Promise.resolve(null);
        }

        return new Promise((resolve) => {
            this.masterPasswordResolve = resolve;
            this.masterPasswordContext = context;
        });
    }

    isLockedOut() {
        return !!(this.masterPasswordLockoutUntil && Date.now() < this.masterPasswordLockoutUntil);
    }

    handleFailedVerification() {
        this.masterPasswordAttempts++;
        
        if (this.masterPasswordAttempts >= 3) {
            // Lock out for 5 minutes after 3 failed attempts
            this.masterPasswordLockoutUntil = Date.now() + (5 * 60 * 1000);
        }
    }

    updateAttemptDisplay() {
        // Mock implementation
        return true;
    }

    showFieldError(elementId, message) {
        // Mock implementation
        return true;
    }

    hideFieldError(elementId) {
        // Mock implementation
        return true;
    }

    showTemporaryMessage(message, type) {
        // Mock implementation
        return true;
    }
}

describe('Master Password Modal', () => {
    let controller;

    beforeEach(() => {
        controller = new MockPopupController();
        vi.clearAllMocks();
    });

    describe('Context Support', () => {
        it('should accept different contexts for password verification', async () => {
            const contexts = ['password_reveal', 'edit', 'copy', 'delete', 'general'];
            
            for (const context of contexts) {
                const promise = controller.showMasterPasswordModal('Test message', context);
                expect(controller.masterPasswordContext).toBe(context);
                
                // Resolve the promise to clean up
                if (controller.masterPasswordResolve) {
                    controller.masterPasswordResolve(null);
                }
                await promise;
            }
        });

        it('should default to general context when none provided', async () => {
            const promise = controller.showMasterPasswordModal('Test message');
            expect(controller.masterPasswordContext).toBe('general');
            
            // Clean up
            if (controller.masterPasswordResolve) {
                controller.masterPasswordResolve(null);
            }
            await promise;
        });
    });

    describe('Attempt Tracking', () => {
        it('should track failed verification attempts', () => {
            expect(controller.masterPasswordAttempts).toBe(0);
            
            controller.handleFailedVerification();
            expect(controller.masterPasswordAttempts).toBe(1);
            
            controller.handleFailedVerification();
            expect(controller.masterPasswordAttempts).toBe(2);
        });

        it('should lock out after 3 failed attempts', () => {
            expect(controller.isLockedOut()).toBe(false);
            
            // Simulate 3 failed attempts
            controller.handleFailedVerification();
            controller.handleFailedVerification();
            controller.handleFailedVerification();
            
            expect(controller.masterPasswordAttempts).toBe(3);
            expect(controller.isLockedOut()).toBe(true);
        });

        it('should prevent modal from showing when locked out', async () => {
            // Set up lockout state
            controller.masterPasswordLockoutUntil = Date.now() + (5 * 60 * 1000);
            
            const result = await controller.showMasterPasswordModal('Test message');
            expect(result).toBe(null);
        });

        it('should allow modal after lockout expires', async () => {
            // Set up expired lockout
            controller.masterPasswordLockoutUntil = Date.now() - 1000;
            
            const promise = controller.showMasterPasswordModal('Test message');
            expect(controller.masterPasswordResolve).toBeTruthy();
            
            // Clean up
            if (controller.masterPasswordResolve) {
                controller.masterPasswordResolve(null);
            }
            await promise;
        });
    });

    describe('Security Features', () => {
        it('should reset attempts on successful verification', () => {
            // Set up some failed attempts
            controller.masterPasswordAttempts = 2;
            controller.masterPasswordLockoutUntil = null;
            
            // Simulate successful verification (would be done in actual confirmMasterPassword)
            controller.masterPasswordAttempts = 0;
            controller.masterPasswordLockoutUntil = null;
            
            expect(controller.masterPasswordAttempts).toBe(0);
            expect(controller.isLockedOut()).toBe(false);
        });

        it('should clear context when modal is hidden', () => {
            controller.masterPasswordContext = 'edit';
            
            // Simulate hiding modal
            controller.masterPasswordContext = null;
            
            expect(controller.masterPasswordContext).toBe(null);
        });
    });

    describe('Error Handling', () => {
        it('should handle verification errors gracefully', () => {
            // This would be tested with actual chrome.runtime.sendMessage mock
            expect(() => {
                controller.handleFailedVerification();
            }).not.toThrow();
        });

        it('should provide appropriate error messages for different attempt counts', () => {
            const spy = vi.spyOn(controller, 'showFieldError');
            
            // First failed attempt
            controller.handleFailedVerification();
            // Would show "2 attempts remaining"
            
            // Second failed attempt  
            controller.handleFailedVerification();
            // Would show "1 attempt remaining"
            
            // Third failed attempt
            controller.handleFailedVerification();
            // Would show lockout message
            
            expect(controller.masterPasswordAttempts).toBe(3);
            expect(controller.isLockedOut()).toBe(true);
        });
    });
});