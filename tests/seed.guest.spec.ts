import { test, expect } from './fixtures';

/**
 * Guest seed for scenarios that start logged out (login, login errors).
 * Starting state: the login page, no session.
 */
test.describe('Seed (guest)', () => {
    test('seed', async ({ loginPage }) => {
        await loginPage.goto('/');
        await expect(loginPage.loginButton).toBeVisible();
    });
});
