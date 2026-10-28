import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { Sidebar } from '../pages/Components/Sidebar';

test.describe('Logout Flow', () => {
  test('should logout user and redirect to login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);
    const sidebar = new Sidebar(page);

    // 1. Arrange: Login and navigate to inventory page
    await loginPage.goto('/');
    await loginPage.usernameInput.fill('standard_user');
    await loginPage.passwordInput.fill('secret_sauce');
    await loginPage.loginButton.click();

    // Wait for navigation to inventory page
    await expect(page).toHaveURL(/.*inventory.html/);
    await inventoryPage.isLoaded();

    // 2. Act: Click logout via sidebar
    await sidebar.logout();

    // 3. Assert: Verify redirect to login page
    await expect(loginPage.usernameInput).toBeVisible();
  });
});
