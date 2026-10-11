import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  ...tseslint.configs.strictTypeChecked,
  {
    plugins: {
      jsdoc
    },
    rules: {
      'jsdoc/check-tag-names': ['error', { definedTags: ['selector', 'strategy', 'verified', 'reason'] }],
      // Ignore unused vars when starting with underscore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }]
    },
  },
  {
    // Mandatory JSDoc for Core Framework and CLI
    files: ['scripts/**/*.ts', 'mcp/**/*.ts', 'mcp/server.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', { 
        require: { 
          FunctionDeclaration: true, 
          MethodDefinition: true 
        },
        contexts: ['ExportDefaultDeclaration', 'ExportNamedDeclaration'] 
      }],
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
    }
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['**/*.spec.ts'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-raw-locators': 'error',     // forbid page.locator() in specs
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-wait-for-timeout': 'error', // Ban hard waits
      'playwright/no-focused-test': 'error',    // Ban test.only and describe.only
      'playwright/no-skipped-test': 'warn',     // Detect test.skip (Warning)
      // Selectors belong in Page Objects. Catches agent-generated drafts that still
      // locate elements on `page` directly; see the Promote step in docs/PROTOCOL.md.
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='page'][callee.property.name=/^(locator|frameLocator|getBy|\\$)/]",
        message: 'No raw locators in specs: move this selector into a Page Object (SPP Promote step).',
      }, {
        selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='page'][callee.property.name=/^(click|dblclick|fill|type|press|check|uncheck|hover|tap|focus|selectOption|setInputFiles|dragAndDrop|textContent|innerText|innerHTML|inputValue|getAttribute|isVisible|isHidden|isChecked|isEnabled|isDisabled|isEditable|waitForSelector)$/]",
        message: 'No selector-string page actions in specs: call a Page Object method instead (SPP Promote step).',
      }],
    },
  },
  {
    languageOptions: {
      parserOptions: { project: true }
    }
  }
];
