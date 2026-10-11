# T-009 Verify Locked Out User

## Application Overview

Focused plan for SPP task T-009 (Verify Locked Out User). Covers the Sauce Demo (Swag Labs) login page behavior when `locked_out_user` / `secret_sauce` is submitted: access is denied, the user stays on the login page, and the error "Epic sadface: Sorry, this user has been locked out." is shown. One related edge case covers dismissing the error. Observed during exploration: the error renders as an alert containing a "Dismiss error" button plus the message text; after dismissal the alert is removed and the username/password fields keep their values. Page Object: pages/LoginPage.ts. Base URL comes from playwright.config.ts (never hard-code hosts); navigate with the relative path '/'.

## Test Scenarios

### 1. Login Error - Locked Out User

**Seed:** `tests/seed.guest.spec.ts`

#### 1.1. locked-out-user-denied-with-error

**File:** `tests/login-error/locked-out-user-denied-with-error.spec.ts`

**Steps:**
  1. Starting state: fresh, logged-out browser session on the login page ('/'), as set up by tests/seed.guest.spec.ts. Confirm the Username field, Password field and Login button are visible.
    - expect: The login form is displayed
    - expect: No error message is displayed initially
  2. Enter 'locked_out_user' in the Username field.
    - expect: The Username field contains 'locked_out_user'
  3. Enter 'secret_sauce' in the Password field.
    - expect: The Password field is filled (masked input)
  4. Click the Login button.
    - expect: An error alert is displayed with the exact text 'Epic sadface: Sorry, this user has been locked out.'
    - expect: The user stays on the login page: the URL remains the base URL path '/' and does not navigate to the inventory page
    - expect: The Login button and login form are still visible
    - expect: No inventory/product list is shown (access denied)

#### 1.2. locked-out-user-error-can-be-dismissed

**File:** `tests/login-error/locked-out-user-error-can-be-dismissed.spec.ts`

**Steps:**
  1. Starting state: fresh, logged-out session on the login page ('/') from tests/seed.guest.spec.ts. Log in with Username 'locked_out_user' and Password 'secret_sauce' by clicking Login.
    - expect: The error alert 'Epic sadface: Sorry, this user has been locked out.' is displayed
    - expect: The alert contains a 'Dismiss error' button
  2. Click the 'Dismiss error' button in the error alert.
    - expect: The error alert and its message text are no longer visible
    - expect: The user remains on the login page at '/'
    - expect: The Login button is still visible, and the Username and Password fields retain their entered values ('locked_out_user' and 'secret_sauce')
  3. Click the Login button again with the same credentials.
    - expect: The error 'Epic sadface: Sorry, this user has been locked out.' is displayed again
    - expect: The user still remains on the login page and is not granted access
