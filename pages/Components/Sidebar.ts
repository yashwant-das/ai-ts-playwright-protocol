import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Sidebar component page object for Sauce Demo navigation menu.
 * Covers hamburger menu toggle, sidebar links, and logout flow.
 */
export class Sidebar extends BasePage {
  /**
   * @selector name="Open Menu"
   * @strategy getByRole
   * @verified 2026-09-26
   */
  readonly hamburgerMenuButton: Locator;

  /**
   * @selector name="Logout"
   * @strategy getByRole
   * @verified 2026-09-26
   */
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.hamburgerMenuButton = page.getByRole('button', { name: 'Open Menu' });
    this.logoutButton = page.getByRole('button', { name: 'Logout' });
  }

  /**
   * Opens the sidebar navigation menu by clicking the hamburger button.
   */
  async open() {
    await this.hamburgerMenuButton.click();
  }

  /**
   * Logs out the current user by opening the sidebar and clicking logout.
   */
  async logout() {
    await this.open();
    await this.logoutButton.click();
  }
}
