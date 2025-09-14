# Design Document

## Overview

This design implements secure password visibility functionality that requires master password verification before revealing actual passwords. The system maintains security by requiring authentication for each password reveal operation and automatically masking passwords after a timeout period.

## Architecture

### Components Involved

1. **Popup Controller** - Handles UI interactions and master password prompts
2. **Background Service** - Provides secure credential retrieval with master password
3. **Master Password Modal** - Reusable component for password verification
4. **Credential Item Components** - Enhanced with password visibility controls

### Security Model

- Passwords are masked by default in all UI displays
- Master password verification required for each password reveal
- Actual passwords only transmitted when explicitly requested with valid master password
- Automatic timeout and re-masking for security
- No persistent storage of revealed passwords in popup

## Components and Interfaces

### Background Service API Extensions

```javascript
// New message types for secure password retrieval
'GET_CREDENTIAL_PASSWORD': { required: ['credentialId', 'masterPassword'] }
'VERIFY_MASTER_PASSWORD': { required: ['masterPassword'] }
```

### Popup Controller Methods

```javascript
// Password visibility management
async showCredentialPassword(credentialId)
async hideCredentialPassword(credentialId)
async verifyMasterPasswordForCredential(credentialId, action)

// Edit form with password visibility
async openEditFormWithPassword(credentialId)
async handleEditWithMasterPassword(credentialId)
```

### UI State Management

```javascript
// Track password visibility state
passwordVisibilityState = {
  [credentialId]: {
    isVisible: boolean,
    revealedAt: timestamp,
    autoHideTimeout: timeoutId
  }
}
```

## Data Models

### Password Visibility State

```javascript
{
  credentialId: string,
  isVisible: boolean,
  actualPassword: string | null,
  revealedAt: number,
  autoHideTimeout: number | null
}
```

### Master Password Verification Request

```javascript
{
  type: 'GET_CREDENTIAL_PASSWORD',
  payload: {
    credentialId: string,
    masterPassword: string
  }
}
```

### Master Password Verification Response

```javascript
{
  success: boolean,
  password?: string,
  error?: string
}
```

## Error Handling

### Master Password Verification Failures

1. **Invalid Password**: Show error message, keep password masked
2. **Network/Service Errors**: Show generic error, maintain security
3. **Multiple Failed Attempts**: Implement temporary lockout (3 attempts)
4. **Session Timeout**: Require fresh authentication

### UI Error States

- Clear error messages for password verification failures
- Loading states during verification process
- Graceful fallback to masked state on errors
- User feedback for timeout-based auto-masking

## Testing Strategy

### Unit Tests

1. **Password Visibility State Management**
   - Test state transitions (masked → visible → masked)
   - Test timeout-based auto-hiding
   - Test multiple credential password states

2. **Master Password Verification**
   - Test correct password verification
   - Test incorrect password handling
   - Test verification timeout scenarios

3. **UI Component Behavior**
   - Test eye button state changes
   - Test edit form password visibility
   - Test error message display

### Integration Tests

1. **End-to-End Password Reveal Flow**
   - Click eye button → enter master password → see actual password
   - Click edit button → enter master password → edit with visible password

2. **Security Scenarios**
   - Test auto-masking after timeout
   - Test password clearing on popup close
   - Test failed verification lockout

### Security Tests

1. **Password Exposure Prevention**
   - Verify passwords not logged to console
   - Verify passwords cleared from DOM after masking
   - Verify no persistent storage of revealed passwords

2. **Authentication Security**
   - Test master password is not stored in popup
   - Test verification is required for each reveal
   - Test session-based verification expiry

## Implementation Flow

### Password Reveal Flow (Eye Button)

1. User clicks eye button on credential
2. System shows master password modal
3. User enters master password
4. System sends verification request to background
5. Background verifies password and returns actual credential password
6. Popup displays actual password and updates eye button state
7. System starts auto-hide timeout (30 seconds)
8. On timeout or user click, password is masked again

### Edit Flow with Password Visibility

1. User clicks edit button on credential
2. System shows master password modal
3. User enters master password
4. System verifies password and retrieves actual credential data
5. Edit form opens with actual password visible in input field
6. User can modify password and other fields
7. On save, system encrypts and stores updated credential
8. Form closes and returns to masked credential list

### Auto-Hide Security Feature

1. When password is revealed, start 30-second timer
2. On timer expiry, automatically mask password
3. Show brief notification about auto-masking
4. Clear actual password from memory and DOM
5. Reset eye button to "show" state

## UI/UX Considerations

### Visual Feedback

- Eye button changes icon based on password visibility state
- Loading spinner during master password verification
- Clear error messages for failed verification
- Success indicators for successful password reveal

### Accessibility

- Screen reader announcements for password state changes
- Keyboard navigation support for password visibility controls
- High contrast support for visibility state indicators
- Focus management in master password modal

### Performance

- Minimal DOM manipulation for password reveal/hide
- Efficient cleanup of revealed passwords from memory
- Optimized re-rendering of credential list items
- Debounced auto-hide timeout management