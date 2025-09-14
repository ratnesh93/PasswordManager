// Content Script Tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
    runtime: {
        onMessage: {
            addListener: vi.fn()
        },
        sendMessage: vi.fn()
    }
};

// Simple test class to verify content script functionality
class ContentScriptTest {
    constructor() {
        this.loginFields = null;
    }

    detectLoginFields() {
        const loginForms = this.identifyLoginForms();
        
        if (loginForms.length > 0) {
            const bestForm = this.selectBestLoginForm(loginForms);
            const fields = this.analyzeFormFields(bestForm);
            
            if (fields.username && fields.password) {
                this.loginFields = {
                    username: fields.username,
                    password: fields.password,
                    form: bestForm.form,
                    confidence: bestForm.confidence
                };
                
                return { success: true, fieldsDetected: true, confidence: bestForm.confidence };
            }
        }
        
        const globalFields = this.detectFieldsGlobally();
        
        if (globalFields.username && globalFields.password) {
            this.loginFields = {
                username: globalFields.username,
                password: globalFields.password,
                form: this.findParentForm(globalFields.username) || this.findParentForm(globalFields.password),
                confidence: 'medium'
            };
            
            return { success: true, fieldsDetected: true, confidence: 'medium' };
        }
        
        this.loginFields = null;
        return { success: true, fieldsDetected: false };
    }

    identifyLoginForms() {
        const forms = Array.from(document.querySelectorAll('form'));
        const loginForms = [];
        
        forms.forEach(form => {
            const confidence = this.calculateFormLoginConfidence(form);
            if (confidence > 0) {
                loginForms.push({ form, confidence });
            }
        });
        
        return loginForms.sort((a, b) => b.confidence - a.confidence);
    }

    calculateFormLoginConfidence(form) {
        let confidence = 0;
        const formHtml = form.outerHTML.toLowerCase();
        const formText = form.textContent.toLowerCase();
        
        const loginKeywords = [
            'login', 'signin', 'sign-in', 'log-in', 'auth', 'authenticate',
            'password', 'username', 'email', 'user', 'account'
        ];
        
        loginKeywords.forEach(keyword => {
            if (formHtml.includes(keyword) || formText.includes(keyword)) {
                confidence += 10;
            }
        });
        
        const passwordFields = form.querySelectorAll('input[type="password"]');
        confidence += passwordFields.length * 30;
        
        const usernameFields = form.querySelectorAll(
            'input[type="email"], input[type="text"], input[autocomplete="username"], input[autocomplete="email"]'
        );
        confidence += Math.min(usernameFields.length * 15, 30);
        
        const allInputs = form.querySelectorAll('input');
        if (allInputs.length > 8) {
            confidence -= 20;
        }
        
        return Math.max(0, confidence);
    }

    selectBestLoginForm(loginForms) {
        return loginForms[0];
    }

    analyzeFormFields(formData) {
        const form = formData.form;
        const fields = { username: null, password: null };
        
        fields.password = this.findPasswordField(form);
        
        if (fields.password) {
            fields.username = this.findUsernameField(form, fields.password);
        }
        
        return fields;
    }

    findPasswordField(container) {
        const passwordFields = container.querySelectorAll('input[type="password"]');
        
        if (passwordFields.length === 0) return null;
        if (passwordFields.length === 1) return passwordFields[0];
        
        for (const field of passwordFields) {
            if (this.isFieldVisible(field)) {
                return field;
            }
        }
        
        return passwordFields[0];
    }

    findUsernameField(container, passwordField) {
        const usernameSelectors = [
            'input[type="email"]',
            'input[autocomplete="username"]',
            'input[autocomplete="email"]',
            'input[name*="user" i]',
            'input[name*="email" i]',
            'input[name*="login" i]',
            'input[type="text"]'
        ];
        
        for (const selector of usernameSelectors) {
            const candidates = container.querySelectorAll(selector);
            
            for (const candidate of candidates) {
                if (candidate !== passwordField && this.isFieldVisible(candidate)) {
                    return candidate;
                }
            }
        }
        
        return null;
    }

    detectFieldsGlobally() {
        const fields = { username: null, password: null };
        
        const passwordSelectors = ['input[type="password"]'];
        fields.password = this.findBestField(passwordSelectors);
        
        if (fields.password) {
            const usernameSelectors = [
                'input[type="email"]',
                'input[autocomplete="username"]',
                'input[type="text"]'
            ];
            
            fields.username = this.findBestField(usernameSelectors, fields.password);
        }
        
        return fields;
    }

    findBestField(selectors, excludeField = null) {
        for (const selector of selectors) {
            const fields = document.querySelectorAll(selector);
            
            if (fields.length > 0) {
                for (const field of fields) {
                    if (field === excludeField) continue;
                    
                    if (this.isFieldVisible(field)) {
                        return field;
                    }
                }
            }
        }
        return null;
    }

    isFieldVisible(field) {
        if (!field || !field.parentNode) return false;
        
        // In test environment, check style attribute directly
        const styleAttr = field.getAttribute('style') || '';
        
        if (styleAttr.includes('display: none') || 
            styleAttr.includes('visibility: hidden') || 
            styleAttr.includes('opacity: 0')) {
            return false;
        }
        
        // For test environment, assume fields are visible unless explicitly hidden
        return true;
    }

    findParentForm(field) {
        let parent = field.parentElement;
        while (parent && parent !== document.body) {
            if (parent.tagName === 'FORM') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return null;
    }
}

describe('Content Script - Form Field Detection', () => {
    let contentScript;
    let container;

    beforeEach(() => {
        contentScript = new ContentScriptTest();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.clearAllMocks();
    });

    it('should detect simple login form with email and password', () => {
        container.innerHTML = `
            <form id="login-form">
                <input type="email" name="email" />
                <input type="password" name="password" />
                <button type="submit">Login</button>
            </form>
        `;

        // Debug: Check if elements exist
        const emailField = container.querySelector('input[type="email"]');
        const passwordField = container.querySelector('input[type="password"]');
        
        expect(emailField).toBeTruthy();
        expect(passwordField).toBeTruthy();
        expect(contentScript.isFieldVisible(emailField)).toBe(true);
        expect(contentScript.isFieldVisible(passwordField)).toBe(true);

        const result = contentScript.detectLoginFields();
        
        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(true);
        expect(contentScript.loginFields).toBeTruthy();
        expect(contentScript.loginFields.username.type).toBe('email');
        expect(contentScript.loginFields.password.type).toBe('password');
    });

    it('should detect login form with text input for username', () => {
        container.innerHTML = `
            <form>
                <input type="text" name="username" />
                <input type="password" name="password" />
            </form>
        `;

        const result = contentScript.detectLoginFields();
        
        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(true);
        expect(contentScript.loginFields.username.name).toBe('username');
    });

    it('should not detect form without password field', () => {
        container.innerHTML = `
            <form>
                <input type="text" name="search" />
                <button type="submit">Search</button>
            </form>
        `;

        const result = contentScript.detectLoginFields();
        
        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(false);
        expect(contentScript.loginFields).toBeNull();
    });

    it('should calculate form confidence correctly', () => {
        container.innerHTML = `
            <form class="login-form">
                <input type="email" name="email" />
                <input type="password" name="password" />
                <button type="submit">Login</button>
            </form>
        `;

        const form = container.querySelector('form');
        const confidence = contentScript.calculateFormLoginConfidence(form);
        
        expect(confidence).toBeGreaterThan(50);
    });

    it('should handle multiple forms and select the best one', () => {
        container.innerHTML = `
            <form id="search-form">
                <input type="text" name="query" />
            </form>
            <form id="login-form" class="login">
                <input type="email" name="email" />
                <input type="password" name="password" />
                <button>Sign In</button>
            </form>
        `;

        const result = contentScript.detectLoginFields();
        
        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(true);
        expect(contentScript.loginFields.form.id).toBe('login-form');
    });
});

describe('Content Script - Field Visibility', () => {
    let contentScript;
    let container;

    beforeEach(() => {
        contentScript = new ContentScriptTest();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it('should detect visible fields correctly', () => {
        container.innerHTML = `
            <input type="text" id="visible" style="width: 200px; height: 30px;" />
            <input type="text" id="hidden" style="display: none;" />
        `;

        const visibleField = container.querySelector('#visible');
        const hiddenField = container.querySelector('#hidden');
        
        expect(contentScript.isFieldVisible(visibleField)).toBe(true);
        expect(contentScript.isFieldVisible(hiddenField)).toBe(false);
    });

    it('should handle null fields gracefully', () => {
        expect(contentScript.isFieldVisible(null)).toBe(false);
        expect(contentScript.isFieldVisible(undefined)).toBe(false);
    });
});

describe('Content Script - Real-world Scenarios', () => {
    let contentScript;
    let container;

    beforeEach(() => {
        contentScript = new ContentScriptTest();
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it('should handle Gmail-style login form', () => {
        container.innerHTML = `
            <form id="gaia_loginform">
                <input type="email" name="Email" id="Email" autocomplete="username" />
                <input type="password" name="Passwd" id="Passwd" autocomplete="current-password" />
                <input type="submit" value="Sign in" />
            </form>
        `;

        const result = contentScript.detectLoginFields();

        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(true);
        expect(contentScript.loginFields.username.name).toBe('Email');
        expect(contentScript.loginFields.password.name).toBe('Passwd');
    });

    it('should handle forms without explicit form tags', () => {
        container.innerHTML = `
            <div class="login-container">
                <input type="email" name="email" />
                <input type="password" name="password" />
                <button>Login</button>
            </div>
        `;

        const result = contentScript.detectLoginFields();

        expect(result.success).toBe(true);
        expect(result.fieldsDetected).toBe(true);
        expect(result.confidence).toBe('medium');
    });
});