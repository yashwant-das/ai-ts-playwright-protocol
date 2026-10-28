import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { test } from 'node:test';

for (const filename of ['pages/BasePage.ts', 'tests/fixtures.ts', 'scripts/gate.ts']) {
  void test(`hard waits remain forbidden outside specs: ${filename}`, () => {
    const root = mkdtempSync(join(resolve(dirname(filename)), 'lint-probe-'));
    try {
      const file = join(root, 'probe.ts');
      writeFileSync(
        file,
        "import { Page } from '@playwright/test';\n\n/**\n * Waits for the app.\n * @param page Browser page.\n */\nexport const waitForApp = async (page: Page) => { await page.waitForTimeout(1000); };\n",
      );
      const result = spawnSync(
        process.execPath,
        [resolve('node_modules/eslint/bin/eslint.js'), file],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout, /playwright\/no-wait-for-timeout/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
