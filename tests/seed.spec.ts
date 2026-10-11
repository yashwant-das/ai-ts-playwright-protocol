import { test, expect } from './fixtures';

/**
 * Default seed for Playwright Test Agents and `playwright test --debug=cli`.
 * Starting state: logged in as standard_user on the inventory page.
 */
test.describe('Seed', () => {
    test('seed', async ({ loggedInPage }) => {
        await expect(loggedInPage.inventoryItems.first()).toBeVisible();
    });
});
