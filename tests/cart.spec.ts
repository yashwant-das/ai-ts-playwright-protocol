import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';

test.describe('Cart Functionality', () => {
  test('should increment cart badge when items are added', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const inventoryPage = new InventoryPage(page);

    // 1. Arrange: Login and navigate to inventory
    await loginPage.goto('/');
    await loginPage.usernameInput.fill('standard_user');
    await loginPage.passwordInput.fill('secret_sauce');
    await loginPage.loginButton.click();

    // Wait for navigation to inventory page
    await expect(page).toHaveURL(/.*inventory.html/);
    await inventoryPage.isLoaded();

    // 2. Act: Add first item to cart
    await inventoryPage.addItemToCart(0);

    // 3. Assert: Verify cart badge shows "1"
    await expect(inventoryPage.cartBadge).toHaveText('1');

    // 4. Act: Add second item to cart
    await inventoryPage.addItemToCart(1);

    // 5. Assert: Verify cart badge shows "2"
    await expect(inventoryPage.cartBadge).toHaveText('2');
  });
});
