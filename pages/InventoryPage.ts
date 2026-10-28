import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class InventoryPage extends BasePage {
  /**
   * @selector data-test="inventory-item"
   * @strategy getByTestId
   * @verified 2026-06-01
   */
  public readonly inventoryItems: Locator;

  /**
   * @selector data-test="shopping-cart-badge"
   * @strategy getByTestId
   * @verified 2026-06-01
   */
  public readonly cartBadge: Locator;

  /**
   * @selector name="Add to cart"
   * @strategy getByRole
   * @verified 2026-06-01
   */
  public readonly addToCartButtons: Locator;

  /**
   * Initializes the inventory page object
   * @param page - Playwright Page object
   */
  constructor(page: Page) {
    super(page);
    this.inventoryItems = page.getByTestId('inventory-item');
    this.cartBadge = page.getByTestId('shopping-cart-badge');
    this.addToCartButtons = page.getByRole('button', { name: 'Add to cart' });
  }

  /**
   * Verifies page is ready by checking at least one inventory item is visible
   */
  async isLoaded(): Promise<void> {
    await this.inventoryItems.first().waitFor({ state: 'visible' });
  }

  /**
   * Gets the count of inventory items
   * @returns number of items
   */
  async getItemCount(): Promise<number> {
    return await this.inventoryItems.count();
  }

  /**
   * Adds an item to the cart by its index
   * @param index - Zero-based index of the item to add
   */
  async addItemToCart(index: number = 0): Promise<void> {
    await this.addToCartButtons.nth(index).click();
  }

  /**
   * Gets the current count displayed on the cart badge
   * @returns the number as text, or '0' if badge is not visible
   */
  async getCartCount(): Promise<string> {
    if (await this.cartBadge.isVisible()) {
      return (await this.cartBadge.textContent()) || '0';
    }
    return '0';
  }
}
