import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';

test.describe('Inventory Page Verification', () => {
  test('should display at least 6 products after login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    // 1. Arrange: Login to the application
    await loginPage.goto('/');
    await loginPage.usernameInput.fill('standard_user');
    await loginPage.passwordInput.fill('secret_sauce');
    await loginPage.loginButton.click();

    // 2. Act: Wait for inventory page to load
    await inventoryPage.isLoaded();

    // 3. Assert: Verify at least 6 products are displayed
    const itemCount = await inventoryPage.getItemCount();
    expect(itemCount).toBeGreaterThanOrEqual(6);

    // Additional business assertion: verify URL
    await expect(page).toHaveURL(/.*inventory.html/);
  });
});
