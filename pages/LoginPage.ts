import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
    /**
     * @selector placeholder="Username"
     * @strategy getByPlaceholder
     * @verified 2026-06-01
     */
    public readonly usernameInput: Locator;

    /**
     * @selector placeholder="Password"
     * @strategy getByPlaceholder
     * @verified 2026-06-01
     */
    public readonly passwordInput: Locator;

    /**
     * @selector name="Login"
     * @strategy getByRole
     * @verified 2026-06-01
     */
    public readonly loginButton: Locator;

    /**
     * Initializes the login page object
     * @param page - Playwright Page object
     */
    constructor(page: Page) {
        super(page);
        this.usernameInput = page.getByPlaceholder('Username');
        this.passwordInput = page.getByPlaceholder('Password');
        this.loginButton = page.getByRole('button', { name: 'Login' });
    }

    /**
     * Verifies page is ready by checking all required elements are visible
     */
    async isLoaded(): Promise<void> {
        await this.usernameInput.waitFor({ state: 'visible' });
        await this.passwordInput.waitFor({ state: 'visible' });
        await this.loginButton.waitFor({ state: 'visible' });
    }

    /**
     * Submits the login form with the given credentials
     * @param username - Account username
     * @param password - Account password
     */
    async login(username: string, password: string): Promise<void> {
        await this.usernameInput.fill(username);
        await this.passwordInput.fill(password);
        await this.loginButton.click();
    }
}
