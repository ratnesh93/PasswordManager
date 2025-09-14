// Chrome Password Manager - Content Script
// This file handles web page interaction, form detection, and autofill functionality

class ContentScript {
    constructor() {
        this.loginFields = null;
        this.hasPermissions = false;
        this.checkPermissions().then(() => {
            if (this.hasPermissions) {
                this.initializeListeners();
                this.detectLoginFields();
            }
        });
    }

    /**
     * Check if the extension has necessary permissions for content script operations
     * @returns {Promise<boolean>}
     */
    async checkPermissions() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'CHECK_PERMISSIONS'
            });

            if (response && response.success) {
                this.hasPermissions = response.data.hasOptional && response.data.hasHost;
                
                if (!this.hasPermissions) {
                    console.log('Content script: Missing required permissions for autofill functionality');
                }
                
                return this.hasPermissions;
            }
            
            return false;
        } catch (error) {
            console.error('Content script: Error checking permissions:', error);
            return false;
        }
    }

    initializeListeners() {
        // Listen for messages from background script with enhanced error handling
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message)
                .then(response => {
                    console.log('Message handled successfully:', message.type, response);
                    sendResponse(response);
                })
                .catch(error => {
                    console.error('Content script message error:', error);
                    sendResponse({ 
                        success: false, 
                        error: error.message,
                        type: 'CONTENT_SCRIPT_ERROR'
                    });
                });
            
            return true; // Indicate async response
        });

        // Listen for context menu events (right-click actions)
        document.addEventListener('contextmenu', (event) => {
            this.handleContextMenu(event);
        });

        // Listen for form submissions to offer credential saving
        document.addEventListener('submit', (event) => {
            this.handleFormSubmission(event);
        });

        // Listen for input events to detect when users are typing in login fields
        document.addEventListener('input', (event) => {
            this.handleInputEvent(event);
        });

        // Listen for focus events to detect when users interact with login fields
        document.addEventListener('focus', (event) => {
            this.handleFocusEvent(event);
        }, true);

        // Re-detect fields when DOM changes
        const observer = new MutationObserver((mutations) => {
            this.handleDOMChanges(mutations);
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['type', 'name', 'id', 'class']
        });

        // Listen for page navigation events
        window.addEventListener('beforeunload', () => {
            this.handlePageUnload();
        });

        console.log('Content script listeners initialized for:', window.location.href);
    }

    async handleMessage(message) {
        // Validate message structure
        if (!message || typeof message !== 'object') {
            throw new Error('Invalid message format');
        }

        const { type, payload, requestId } = message;
        console.log('Handling message:', type, payload);

        // Add request ID to response for tracking
        const baseResponse = { requestId };

        try {
            switch (type) {
                case 'EXTRACT_CREDENTIALS':
                    const extractResult = await this.extractCredentials();
                    return { ...baseResponse, ...extractResult };

                case 'SHOW_AUTOFILL_OPTIONS':
                    const autofillResult = await this.showAutofillOptions();
                    return { ...baseResponse, ...autofillResult };

                case 'FILL_CREDENTIALS':
                    this.validateFillCredentialsPayload(payload);
                    const fillResult = await this.fillCredentials(payload.username, payload.password);
                    return { ...baseResponse, ...fillResult };

                case 'DETECT_FIELDS':
                    const detectResult = this.detectLoginFields();
                    return { ...baseResponse, ...detectResult };

                case 'GET_PAGE_INFO':
                    const pageInfo = this.getPageInfo();
                    return { ...baseResponse, success: true, pageInfo };

                case 'CONTEXT_MENU_CLICKED':
                    const contextResult = await this.handleContextMenuAction(payload);
                    return { ...baseResponse, ...contextResult };

                case 'CHECK_LOGIN_FIELDS':
                    const checkResult = this.checkLoginFieldsStatus();
                    return { ...baseResponse, success: true, ...checkResult };

                case 'PING':
                    return { ...baseResponse, success: true, message: 'Content script active' };

                default:
                    throw new Error(`Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error(`Error handling message type ${type}:`, error);
            return {
                ...baseResponse,
                success: false,
                error: error.message,
                type: 'MESSAGE_HANDLER_ERROR'
            };
        }
    }

    validateFillCredentialsPayload(payload) {
        if (!payload) {
            throw new Error('Fill credentials payload is required');
        }
        if (!payload.username && !payload.password) {
            throw new Error('Either username or password must be provided');
        }
    }

    getPageInfo() {
        return {
            url: window.location.href,
            origin: window.location.origin,
            hostname: window.location.hostname,
            title: document.title,
            hasLoginFields: !!this.loginFields,
            fieldConfidence: this.loginFields?.confidence || null,
            timestamp: new Date().toISOString()
        };
    }

    checkLoginFieldsStatus() {
        return {
            hasFields: !!this.loginFields,
            confidence: this.loginFields?.confidence || null,
            fieldsInfo: this.loginFields ? {
                hasUsername: !!this.loginFields.username,
                hasPassword: !!this.loginFields.password,
                hasForm: !!this.loginFields.form
            } : null
        };
    }

    async handleContextMenuAction(payload) {
        const { action } = payload;

        switch (action) {
            case 'SAVE_CREDENTIALS':
                return await this.extractCredentials();

            case 'SHOW_AUTOFILL':
                return await this.showAutofillOptions();

            case 'DETECT_FIELDS':
                const detection = this.detectLoginFields();
                if (detection.fieldsDetected) {
                    this.showNotification('Login fields detected!', 'success');
                } else {
                    this.showNotification('No login fields found on this page', 'warning');
                }
                return detection;

            default:
                throw new Error(`Unknown context menu action: ${action}`);
        }
    }

    detectLoginFields() {
        console.log('Detecting login fields on:', window.location.href);
        
        // First, try to find login forms
        const loginForms = this.identifyLoginForms();
        
        if (loginForms.length > 0) {
            // Analyze the best login form
            const bestForm = this.selectBestLoginForm(loginForms);
            const fields = this.analyzeFormFields(bestForm);
            
            if (fields.username && fields.password) {
                this.loginFields = {
                    username: fields.username,
                    password: fields.password,
                    form: bestForm.form,
                    confidence: bestForm.confidence
                };
                
                console.log('✅ Login fields detected in form:', this.loginFields);
                return { success: true, fieldsDetected: true, confidence: bestForm.confidence };
            }
        }
        
        // Fallback: search for fields globally if no forms found
        const globalFields = this.detectFieldsGlobally();
        
        if (globalFields.username && globalFields.password) {
            this.loginFields = {
                username: globalFields.username,
                password: globalFields.password,
                form: this.findParentForm(globalFields.username) || this.findParentForm(globalFields.password),
                confidence: 'medium'
            };
            
            console.log('✅ Login fields detected globally:', this.loginFields);
            return { success: true, fieldsDetected: true, confidence: 'medium' };
        }
        
        this.loginFields = null;
        console.log('❌ No login fields detected');
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
        
        // Check for login-related keywords in form attributes and content
        const loginKeywords = [
            'login', 'signin', 'sign-in', 'log-in', 'auth', 'authenticate',
            'password', 'username', 'email', 'user', 'account'
        ];
        
        loginKeywords.forEach(keyword => {
            if (formHtml.includes(keyword) || formText.includes(keyword)) {
                confidence += 10;
            }
        });
        
        // Check for password fields (strong indicator)
        const passwordFields = form.querySelectorAll('input[type="password"]');
        confidence += passwordFields.length * 30;
        
        // Check for username/email fields
        const usernameFields = form.querySelectorAll(
            'input[type="email"], input[type="text"], input[autocomplete="username"], input[autocomplete="email"]'
        );
        confidence += Math.min(usernameFields.length * 15, 30);
        
        // Penalty for too many fields (likely not a login form)
        const allInputs = form.querySelectorAll('input');
        if (allInputs.length > 8) {
            confidence -= 20;
        }
        
        // Bonus for submit buttons with login-related text
        const submitButtons = form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
        submitButtons.forEach(button => {
            const buttonText = (button.value || button.textContent || '').toLowerCase();
            if (loginKeywords.some(keyword => buttonText.includes(keyword))) {
                confidence += 15;
            }
        });
        
        return Math.max(0, confidence);
    }

    selectBestLoginForm(loginForms) {
        // Return the form with highest confidence
        return loginForms[0];
    }

    analyzeFormFields(formData) {
        const form = formData.form;
        const fields = { username: null, password: null };
        
        // Find password field first (most reliable)
        fields.password = this.findPasswordField(form);
        
        if (fields.password) {
            // Find username field in relation to password field
            fields.username = this.findUsernameField(form, fields.password);
        }
        
        return fields;
    }

    findPasswordField(container) {
        const passwordFields = container.querySelectorAll('input[type="password"]');
        
        if (passwordFields.length === 0) return null;
        if (passwordFields.length === 1) return passwordFields[0];
        
        // If multiple password fields, prefer the first visible one
        for (const field of passwordFields) {
            if (this.isFieldVisible(field) && this.validateFieldType(field, 'password')) {
                return field;
            }
        }
        
        return passwordFields[0];
    }

    findUsernameField(container, passwordField) {
        // Define comprehensive username field selectors
        const usernameSelectors = [
            // Explicit type and autocomplete attributes
            'input[type="email"]',
            'input[autocomplete="username"]',
            'input[autocomplete="email"]',
            
            // Name attribute patterns
            'input[name*="user" i]',
            'input[name*="email" i]',
            'input[name*="login" i]',
            'input[name="login"]',
            'input[name="user"]',
            'input[name="email"]',
            
            // ID attribute patterns
            'input[id*="user" i]',
            'input[id*="email" i]',
            'input[id*="login" i]',
            'input[id="login"]',
            'input[id="user"]',
            'input[id="email"]',
            
            // Placeholder patterns
            'input[placeholder*="email" i]',
            'input[placeholder*="username" i]',
            'input[placeholder*="user" i]',
            'input[placeholder*="login" i]',
            
            // Class patterns
            'input[class*="user" i]',
            'input[class*="email" i]',
            'input[class*="login" i]',
            
            // Generic text inputs (lower priority)
            'input[type="text"]',
            'input:not([type])'
        ];
        
        // Try each selector in order of preference
        for (const selector of usernameSelectors) {
            const candidates = container.querySelectorAll(selector);
            
            for (const candidate of candidates) {
                if (candidate !== passwordField && 
                    this.isFieldVisible(candidate) && 
                    this.validateFieldType(candidate, 'username')) {
                    
                    // Additional validation: should be before password field in DOM order
                    if (this.isFieldBeforeInDOM(candidate, passwordField)) {
                        return candidate;
                    }
                }
            }
        }
        
        return null;
    }

    detectFieldsGlobally() {
        const fields = { username: null, password: null };
        
        // Find password field globally
        const passwordSelectors = ['input[type="password"]'];
        fields.password = this.findBestField(passwordSelectors);
        
        if (fields.password) {
            // Find username field globally
            const usernameSelectors = [
                'input[type="email"]',
                'input[autocomplete="username"]',
                'input[autocomplete="email"]',
                'input[type="text"][name*="user" i]',
                'input[type="text"][name*="email" i]',
                'input[type="text"][name*="login" i]',
                'input[type="text"][id*="user" i]',
                'input[type="text"][id*="email" i]',
                'input[type="text"][id*="login" i]',
                'input[type="text"]'
            ];
            
            fields.username = this.findBestField(usernameSelectors, fields.password);
        }
        
        return fields;
    }

    validateFieldType(field, expectedType) {
        // Validate that the field is appropriate for the expected type
        if (expectedType === 'password') {
            return field.type === 'password';
        }
        
        if (expectedType === 'username') {
            // Username fields should not be password type
            if (field.type === 'password') return false;
            
            // Should be text-like input
            const validTypes = ['text', 'email', ''];
            return validTypes.includes(field.type);
        }
        
        return true;
    }

    isFieldBeforeInDOM(field1, field2) {
        const position = field1.compareDocumentPosition(field2);
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }

    findBestField(selectors, excludeField = null) {
        console.log('Searching for fields with selectors:', selectors);
        
        for (const selector of selectors) {
            const fields = document.querySelectorAll(selector);
            console.log(`Selector "${selector}" found ${fields.length} fields`);
            
            if (fields.length > 0) {
                // Return the first visible field that's not excluded
                for (const field of fields) {
                    if (field === excludeField) continue;
                    
                    console.log(`Checking field:`, field, 'Visible:', this.isFieldVisible(field));
                    if (this.isFieldVisible(field)) {
                        console.log(`✅ Selected field with selector "${selector}":`, field);
                        return field;
                    }
                }
            }
        }
        console.log('❌ No suitable field found');
        return null;
    }

    isFieldVisible(field) {
        // Check if field exists and is in DOM
        if (!field || !field.parentNode) return false;
        
        const style = window.getComputedStyle(field);
        const rect = field.getBoundingClientRect();
        
        // Check basic visibility properties
        if (style.display === 'none' || 
            style.visibility === 'hidden' || 
            style.opacity === '0') {
            return false;
        }
        
        // Check dimensions
        if (field.offsetWidth === 0 || 
            field.offsetHeight === 0 ||
            rect.width === 0 || 
            rect.height === 0) {
            return false;
        }
        
        // Check if field is disabled or readonly (still considered visible but note it)
        if (field.disabled || field.readOnly) {
            console.log('Field is disabled/readonly but visible:', field);
        }
        
        // Check if field is positioned off-screen
        if (rect.left < -1000 || rect.top < -1000) {
            return false;
        }
        
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

    async extractCredentials() {
        try {
            if (!this.loginFields) {
                // Try to detect fields again
                const detection = this.detectLoginFields();
                if (!detection.fieldsDetected) {
                    return { success: false, error: 'No login fields detected on this page' };
                }
            }

            const extractedData = this.extractFieldValues();
            
            if (!extractedData.username || !extractedData.password) {
                return { 
                    success: false, 
                    error: 'Username or password field is empty',
                    extracted: extractedData
                };
            }

            // Validate and sanitize extracted data
            const credentialData = this.sanitizeCredentialData({
                url: this.normalizeUrl(window.location.href),
                username: extractedData.username.trim(),
                password: extractedData.password,
                title: document.title.trim(),
                domain: window.location.hostname,
                extractedAt: new Date().toISOString(),
                confidence: this.loginFields.confidence || 'medium'
            });

            console.log('Extracted credential data:', { ...credentialData, password: '[REDACTED]' });

            // Send to background script for saving
            const response = await chrome.runtime.sendMessage({
                type: 'SAVE_CREDENTIAL',
                payload: credentialData
            });

            if (response.success) {
                this.showNotification('Credentials saved successfully!', 'success');
            } else {
                this.showNotification(`Failed to save: ${response.error}`, 'error');
            }

            return response;
        } catch (error) {
            console.error('Extract credentials error:', error);
            this.showNotification('Error extracting credentials', 'error');
            return { success: false, error: error.message };
        }
    }

    extractFieldValues() {
        const data = {
            username: '',
            password: '',
            additionalFields: {}
        };

        if (this.loginFields.username) {
            data.username = this.loginFields.username.value || '';
        }

        if (this.loginFields.password) {
            data.password = this.loginFields.password.value || '';
        }

        // Extract any additional relevant fields in the form
        if (this.loginFields.form) {
            const otherInputs = this.loginFields.form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
            otherInputs.forEach(input => {
                if (input !== this.loginFields.username && input.value) {
                    const fieldName = input.name || input.id || input.placeholder || 'unknown';
                    data.additionalFields[fieldName] = input.value;
                }
            });
        }

        return data;
    }

    sanitizeCredentialData(data) {
        // Sanitize and validate credential data
        return {
            url: this.sanitizeUrl(data.url),
            username: this.sanitizeText(data.username, 255),
            password: data.password, // Don't sanitize password content, just validate length
            title: this.sanitizeText(data.title, 100),
            domain: this.sanitizeText(data.domain, 100),
            extractedAt: data.extractedAt,
            confidence: data.confidence
        };
    }

    sanitizeText(text, maxLength = 255) {
        if (typeof text !== 'string') return '';
        return text.trim().substring(0, maxLength);
    }

    sanitizeUrl(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
        } catch (error) {
            console.warn('Invalid URL for sanitization:', url);
            return url.substring(0, 255);
        }
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            // Return just the origin for credential matching
            return urlObj.origin;
        } catch (error) {
            console.warn('Invalid URL for normalization:', url);
            return url;
        }
    }

    async showAutofillOptions() {
        try {
            if (!this.loginFields) {
                this.showNotification('No login fields detected on this page');
                return { success: false, error: 'No login fields detected' };
            }

            // Request credentials for current site from background script
            const response = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIALS',
                payload: { url: window.location.origin }
            });

            if (response.success && response.credentials.length > 0) {
                this.displayAutofillMenu(response.credentials);
            } else {
                this.showNotification('No saved credentials for this site');
            }

            return response;
        } catch (error) {
            console.error('Show autofill options error:', error);
            return { success: false, error: error.message };
        }
    }

    async fillCredentials(username, password) {
        try {
            if (!this.loginFields) {
                // Try to detect fields again
                const detection = this.detectLoginFields();
                if (!detection.fieldsDetected) {
                    return { success: false, error: 'No login fields detected for autofill' };
                }
            }

            const fillResult = {
                username: false,
                password: false,
                errors: []
            };

            // Fill username field with enhanced event triggering
            if (this.loginFields.username && username) {
                try {
                    await this.fillField(this.loginFields.username, username);
                    fillResult.username = true;
                    console.log('Username field filled successfully');
                } catch (error) {
                    fillResult.errors.push(`Username fill error: ${error.message}`);
                    console.error('Username fill error:', error);
                }
            }

            // Fill password field with enhanced event triggering
            if (this.loginFields.password && password) {
                try {
                    await this.fillField(this.loginFields.password, password);
                    fillResult.password = true;
                    console.log('Password field filled successfully');
                } catch (error) {
                    fillResult.errors.push(`Password fill error: ${error.message}`);
                    console.error('Password fill error:', error);
                }
            }

            // Validate fill success
            if (fillResult.username || fillResult.password) {
                const message = `Credentials filled: ${fillResult.username ? 'username' : ''} ${fillResult.password ? 'password' : ''}`.trim();
                this.showNotification(message, 'success');
                
                // Focus on the first filled field
                if (fillResult.username && this.loginFields.username) {
                    this.loginFields.username.focus();
                } else if (fillResult.password && this.loginFields.password) {
                    this.loginFields.password.focus();
                }
                
                return { 
                    success: true, 
                    filled: fillResult,
                    message: message
                };
            } else {
                const errorMessage = 'Failed to fill any credentials';
                this.showNotification(errorMessage, 'error');
                return { 
                    success: false, 
                    error: errorMessage,
                    details: fillResult.errors
                };
            }
        } catch (error) {
            console.error('Fill credentials error:', error);
            this.showNotification('Error during autofill', 'error');
            return { success: false, error: error.message };
        }
    }

    async fillField(field, value) {
        if (!field || !value) {
            throw new Error('Invalid field or value for filling');
        }

        // Clear the field first
        field.value = '';
        
        // Set the value
        field.value = value;

        // Trigger comprehensive events to ensure compatibility with various frameworks
        const events = [
            new Event('focus', { bubbles: true }),
            new Event('input', { bubbles: true, cancelable: true }),
            new Event('change', { bubbles: true, cancelable: true }),
            new Event('blur', { bubbles: true })
        ];

        // Dispatch events with small delays to simulate user interaction
        for (const event of events) {
            field.dispatchEvent(event);
            await this.sleep(10); // Small delay between events
        }

        // Additional React/Vue compatibility events
        if (field._valueTracker) {
            field._valueTracker.setValue('');
        }

        // Trigger property setter for React compatibility
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(field, value);
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    displayAutofillMenu(credentials) {
        // Remove existing menu if present
        const existingMenu = document.getElementById('password-manager-autofill-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create autofill menu
        const menu = document.createElement('div');
        menu.id = 'password-manager-autofill-menu';
        menu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 16px;
            min-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Select credentials to fill:';
        title.style.cssText = 'margin: 0 0 12px 0; font-size: 16px; color: #333;';
        menu.appendChild(title);

        credentials.forEach(credential => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin: 8px 0;
                cursor: pointer;
                transition: background-color 0.2s;
            `;
            
            item.innerHTML = `
                <div style="font-weight: bold; color: #333;">${this.escapeHtml(credential.username)}</div>
                <div style="font-size: 12px; color: #666;">${this.escapeHtml(credential.url)}</div>
            `;

            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = '#f0f0f0';
            });

            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'transparent';
            });

            item.addEventListener('click', () => {
                this.fillCredentials(credential.username, credential.password);
                menu.remove();
            });

            menu.appendChild(item);
        });

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.cssText = `
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 8px 16px;
            cursor: pointer;
            margin-top: 12px;
            width: 100%;
        `;
        
        closeButton.addEventListener('click', () => {
            menu.remove();
        });
        
        menu.appendChild(closeButton);

        document.body.appendChild(menu);

        // Auto-remove menu after 10 seconds
        setTimeout(() => {
            if (menu.parentNode) {
                menu.remove();
            }
        }, 10000);
    }

    handleFormSubmission(event) {
        console.log('Form submission detected:', event.target);
        
        // Check if this is a login form submission
        const isLoginForm = this.isLoginFormSubmission(event);
        
        if (isLoginForm) {
            const credentials = this.extractFormSubmissionData(event.target);
            
            if (credentials.username && credentials.password) {
                console.log('Login credentials detected in form submission');
                
                // Delay to allow form submission to complete and check for success
                setTimeout(() => {
                    this.handlePotentialLoginSuccess(credentials);
                }, 1500);
            }
        }
    }

    isLoginFormSubmission(event) {
        const form = event.target;
        
        // Check if we have detected login fields in this form
        if (this.loginFields && this.loginFields.form === form) {
            return true;
        }
        
        // Check if form contains password fields (likely login)
        const passwordFields = form.querySelectorAll('input[type="password"]');
        if (passwordFields.length > 0) {
            return true;
        }
        
        // Check form attributes and content for login indicators
        const formHtml = form.outerHTML.toLowerCase();
        const loginIndicators = ['login', 'signin', 'sign-in', 'auth', 'authenticate'];
        
        return loginIndicators.some(indicator => formHtml.includes(indicator));
    }

    extractFormSubmissionData(form) {
        const data = { username: '', password: '' };
        
        // Get password field
        const passwordField = form.querySelector('input[type="password"]');
        if (passwordField) {
            data.password = passwordField.value;
        }
        
        // Get username field (look for email or text inputs)
        const usernameSelectors = [
            'input[type="email"]',
            'input[autocomplete="username"]',
            'input[autocomplete="email"]',
            'input[type="text"]'
        ];
        
        for (const selector of usernameSelectors) {
            const field = form.querySelector(selector);
            if (field && field !== passwordField && field.value) {
                data.username = field.value;
                break;
            }
        }
        
        return data;
    }

    handlePotentialLoginSuccess(credentials) {
        // Check if we're still on the same page (failed login) or redirected (success)
        const currentUrl = window.location.href;
        
        // Simple heuristic: if URL changed or no error messages visible, assume success
        const errorElements = document.querySelectorAll(
            '.error, .alert-danger, .login-error, [class*="error"], [class*="invalid"]'
        );
        
        const hasVisibleErrors = Array.from(errorElements).some(el => 
            this.isFieldVisible(el) && el.textContent.trim()
        );
        
        if (!hasVisibleErrors) {
            // Likely successful login, offer to save credentials
            this.offerToSaveCredentials(credentials.username, credentials.password);
        } else {
            console.log('Login appears to have failed, not offering to save credentials');
        }
    }

    offerToSaveCredentials(username, password) {
        // Create a more user-friendly save prompt
        this.showSaveCredentialsDialog(username, password);
    }

    showSaveCredentialsDialog(username, password) {
        // Remove existing dialog if present
        const existingDialog = document.getElementById('password-manager-save-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // Create save dialog
        const dialog = document.createElement('div');
        dialog.id = 'password-manager-save-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 16px;
            max-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        dialog.innerHTML = `
            <div style="margin-bottom: 12px;">
                <strong>Save Password?</strong>
            </div>
            <div style="margin-bottom: 12px; font-size: 14px; color: #666;">
                Save credentials for <strong>${this.escapeHtml(window.location.hostname)}</strong>?
            </div>
            <div style="margin-bottom: 12px; font-size: 12px; color: #888;">
                Username: ${this.escapeHtml(username)}
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="save-credentials-yes" style="
                    background: #4285f4;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    flex: 1;
                ">Save</button>
                <button id="save-credentials-no" style="
                    background: #f0f0f0;
                    color: #333;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    flex: 1;
                ">Not Now</button>
            </div>
        `;

        // Add event listeners
        dialog.querySelector('#save-credentials-yes').addEventListener('click', () => {
            this.extractCredentials();
            dialog.remove();
        });

        dialog.querySelector('#save-credentials-no').addEventListener('click', () => {
            dialog.remove();
        });

        document.body.appendChild(dialog);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (dialog.parentNode) {
                dialog.remove();
            }
        }, 10000);
    }

    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.getElementById('password-manager-notification');
        if (existing) {
            existing.remove();
        }

        // Define colors for different notification types
        const colors = {
            success: '#4caf50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#4285f4'
        };

        // Create notification
        const notification = document.createElement('div');
        notification.id = 'password-manager-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            max-width: 300px;
            word-wrap: break-word;
        `;

        document.body.appendChild(notification);

        // Auto-remove after duration based on type
        const duration = type === 'error' ? 5000 : 3000;
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    handleContextMenu(event) {
        // Store context menu position and target for potential use
        this.lastContextMenuEvent = {
            x: event.clientX,
            y: event.clientY,
            target: event.target,
            timestamp: Date.now()
        };

        // Check if right-click was on a login field
        if (this.loginFields) {
            const isOnLoginField = event.target === this.loginFields.username || 
                                 event.target === this.loginFields.password;
            
            if (isOnLoginField) {
                console.log('Context menu on login field detected');
                // Notify background script about context menu on login field
                chrome.runtime.sendMessage({
                    type: 'CONTEXT_MENU_ON_LOGIN_FIELD',
                    payload: {
                        fieldType: event.target === this.loginFields.username ? 'username' : 'password',
                        hasCredentials: !!(this.loginFields.username?.value || this.loginFields.password?.value)
                    }
                }).catch(error => {
                    console.error('Error sending context menu notification:', error);
                });
            }
        }
    }

    handleInputEvent(event) {
        // Check if input is in a login field
        if (this.loginFields && 
            (event.target === this.loginFields.username || event.target === this.loginFields.password)) {
            
            // Debounce input events
            clearTimeout(this.inputTimeout);
            this.inputTimeout = setTimeout(() => {
                this.notifyFieldInput(event.target);
            }, 500);
        }
    }

    handleFocusEvent(event) {
        // Check if focus is on a login field
        if (this.loginFields && 
            (event.target === this.loginFields.username || event.target === this.loginFields.password)) {
            
            console.log('Focus on login field:', event.target);
            
            // Notify background script about field focus
            chrome.runtime.sendMessage({
                type: 'LOGIN_FIELD_FOCUSED',
                payload: {
                    fieldType: event.target === this.loginFields.username ? 'username' : 'password',
                    url: window.location.origin
                }
            }).catch(error => {
                console.error('Error sending focus notification:', error);
            });
        }
    }

    handleDOMChanges(mutations) {
        // Debounce DOM change detection
        clearTimeout(this.domChangeTimeout);
        this.domChangeTimeout = setTimeout(() => {
            let shouldRedetect = false;

            // Check if mutations affect form elements
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasFormElements = addedNodes.some(node => 
                        node.nodeType === Node.ELEMENT_NODE && 
                        (node.tagName === 'FORM' || 
                         node.tagName === 'INPUT' || 
                         node.querySelector('form, input'))
                    );
                    
                    if (hasFormElements) {
                        shouldRedetect = true;
                        break;
                    }
                }
            }

            if (shouldRedetect) {
                console.log('DOM changes detected, re-detecting login fields');
                this.detectLoginFields();
            }
        }, 1000);
    }

    handlePageUnload() {
        // Clean up and notify background script
        console.log('Page unloading, cleaning up content script');
        
        chrome.runtime.sendMessage({
            type: 'CONTENT_SCRIPT_UNLOADING',
            payload: {
                url: window.location.href,
                hadLoginFields: !!this.loginFields
            }
        }).catch(error => {
            // Ignore errors during page unload
            console.log('Error during unload notification (expected):', error);
        });
    }

    notifyFieldInput(field) {
        const fieldType = field === this.loginFields.username ? 'username' : 'password';
        const hasValue = !!field.value;

        chrome.runtime.sendMessage({
            type: 'LOGIN_FIELD_INPUT',
            payload: {
                fieldType,
                hasValue,
                url: window.location.origin
            }
        }).catch(error => {
            console.error('Error sending input notification:', error);
        });
    }

    // Secure data transfer methods
    async sendSecureMessage(type, payload) {
        try {
            // Add timestamp and origin for security
            const securePayload = {
                ...payload,
                timestamp: Date.now(),
                origin: window.location.origin,
                contentScriptId: this.getContentScriptId()
            };

            const response = await chrome.runtime.sendMessage({
                type,
                payload: securePayload,
                requestId: this.generateRequestId()
            });

            return response;
        } catch (error) {
            console.error('Secure message send error:', error);
            throw error;
        }
    }

    getContentScriptId() {
        if (!this.contentScriptId) {
            this.contentScriptId = `cs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        return this.contentScriptId;
    }

    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize content script
const contentScript = new ContentScript();