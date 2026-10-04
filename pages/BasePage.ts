import { Page } from '@playwright/test';

export class BasePage {
  /**
   * Wrapper for Playwright Page
   * @param page - Playwright Page object
   */
  constructor(protected page: Page) { }

  /**
   * Navigates to the specified URL
   * @param url - Destination URL
   */
  async goto(url: string) {
    await this.page.goto(url);
  }

  /**
   * Captures a screenshot for debugging or documentation
   * @param name - Name of the screenshot file
   */
  async takeScreenshot(name: string) {
    const fs = await import('fs');
    const screenshotDir = 'test-results/screenshots';

    // Ensure directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    await this.page.screenshot({
      path: `${screenshotDir}/${name}_${Date.now()}.png`,
      fullPage: true
    });
  }
}
