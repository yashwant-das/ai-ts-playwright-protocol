import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test.describe('Login Page Navigation', () => {
  test('should navigate to login page and verify elements', async ({ page, baseURL }) => {
    const loginPage = new LoginPage(page);

    // Navigate to the login page
    await loginPage.goto('/');

    // 1. Verify page is loaded with all required elements
    await loginPage.isLoaded();

    // 2. Meaningful assertions - verify page title and URL
    await expect(page).toHaveTitle(/Swag Labs/);
    await expect(page).toHaveURL(`${baseURL}/`);

    // 3. Verify form elements are present and enabled
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.usernameInput).toBeEnabled();
    await expect(loginPage.usernameInput).toHaveAttribute('placeholder', 'Username');

    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeEnabled();
    await expect(loginPage.passwordInput).toHaveAttribute('placeholder', 'Password');

    await expect(loginPage.loginButton).toBeVisible();
    await expect(loginPage.loginButton).toBeEnabled();
    await expect(loginPage.loginButton).toHaveValue('Login');
  });
});
