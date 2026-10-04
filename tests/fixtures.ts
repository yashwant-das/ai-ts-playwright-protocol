import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { Sidebar } from '../pages/Components/Sidebar';

export { expect };

/** Public Sauce Demo credentials for the default user. */
export const STANDARD_USER = { username: 'standard_user', password: 'secret_sauce' };

interface PageObjects {
    loginPage: LoginPage;
    inventoryPage: InventoryPage;
    sidebar: Sidebar;
    /** Logged in as STANDARD_USER with the inventory page loaded. */
    loggedInPage: InventoryPage;
}

/**
 * SPP test fixtures. Specs (including agent-generated ones) import `test` and
 * `expect` from here so every selector stays inside a Page Object.
 */
export const test = base.extend<PageObjects>({
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    inventoryPage: async ({ page }, use) => {
        await use(new InventoryPage(page));
    },
    sidebar: async ({ page }, use) => {
        await use(new Sidebar(page));
    },
    loggedInPage: async ({ page, loginPage, inventoryPage }, use) => {
        await loginPage.goto('/');
        await loginPage.login(STANDARD_USER.username, STANDARD_USER.password);
        await expect(page).toHaveURL(/inventory\.html/);
        await inventoryPage.isLoaded();
        await use(inventoryPage);
    },
});
