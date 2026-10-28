import { test, expect, STANDARD_USER } from '../fixtures';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4173')
      throw new Error(`External request blocked: ${url.origin}`);
    await route.continue();
  });
});

test('login and logged-in fixture navigate to the inventory', async ({ page, loggedInPage }) => {
  await expect(page).toHaveURL('http://127.0.0.1:4173/inventory.html');
  await expect(loggedInPage.inventoryItems).toHaveCount(1);
  await expect(loggedInPage.inventoryItems.first()).toHaveText('Controlled item');
});

test('rejected login displays an error that can be dismissed', async ({ page, loginPage }) => {
  await loginPage.goto('/');
  await loginPage.login('locked_out_user', STANDARD_USER.password);
  await expect(loginPage.errorAlert).toHaveText(
    'Epic sadface: Sorry, this user has been locked out.',
  );
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await loginPage.dismissErrorButton.click();
  await expect(loginPage.errorAlert).toBeHidden();
  await expect(loginPage.usernameInput).toHaveValue('locked_out_user');
});
