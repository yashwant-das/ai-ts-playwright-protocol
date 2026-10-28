import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/smoke',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  outputDir: 'test-results/smoke',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/smoke', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    testIdAttribute: 'data-test',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node --import tsx tests/smoke/server.ts',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
