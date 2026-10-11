// spec: specs/T-009_login-error.plan.md
// seed: tests/seed.guest.spec.ts

import { test, expect, STANDARD_USER } from './fixtures';

const LOCKED_OUT_USER = 'locked_out_user';
const LOCKED_OUT_MESSAGE = 'Epic sadface: Sorry, this user has been locked out.';

test.describe('Login Error - Locked Out User', () => {
    test('locked-out-user-denied-with-error', async ({ page, loginPage, inventoryPage }) => {
        // 1. Starting state: fresh, logged-out session on the login page ('/'). Confirm the login form is visible.
        await loginPage.goto('/');
        await loginPage.isLoaded();
        await expect(loginPage.errorAlert).toBeHidden();

        // 2. Enter 'locked_out_user' in the Username field.
        await loginPage.usernameInput.fill(LOCKED_OUT_USER);
        await expect(loginPage.usernameInput).toHaveValue(LOCKED_OUT_USER);

        // 3. Enter 'secret_sauce' in the Password field.
        await loginPage.passwordInput.fill(STANDARD_USER.password);
        await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');

        // 4. Click the Login button.
        await loginPage.loginButton.click();

        // Access is denied with the exact locked-out message
        await expect(loginPage.errorAlert).toHaveText(LOCKED_OUT_MESSAGE);

        // The user stays on the login page and never reaches the inventory
        await expect(page).toHaveURL(/\/$/);
        await expect(loginPage.loginButton).toBeVisible();
        await expect(inventoryPage.inventoryItems).toHaveCount(0);
    });

    test('locked-out-user-error-can-be-dismissed', async ({ page, loginPage }) => {
        // 1. Starting state: fresh, logged-out session on the login page ('/'). Log in as locked_out_user.
        await loginPage.goto('/');
        await loginPage.login(LOCKED_OUT_USER, STANDARD_USER.password);
        await expect(loginPage.errorAlert).toHaveText(LOCKED_OUT_MESSAGE);
        await expect(loginPage.dismissErrorButton).toBeVisible();

        // 2. Click the 'Dismiss error' button in the error alert.
        await loginPage.dismissErrorButton.click();
        await expect(loginPage.errorAlert).toBeHidden();
        await expect(page).toHaveURL(/\/$/);
        await expect(loginPage.usernameInput).toHaveValue(LOCKED_OUT_USER);
        await expect(loginPage.passwordInput).toHaveValue(STANDARD_USER.password);

        // 3. Click the Login button again with the same credentials.
        await loginPage.loginButton.click();
        await expect(loginPage.errorAlert).toHaveText(LOCKED_OUT_MESSAGE);
        await expect(page).toHaveURL(/\/$/);
    });
});
