import { Project, SyntaxKind, CallExpression, PropertyDeclaration } from 'ts-morph';
import pc from 'picocolors';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const requested = process.argv.slice(2);
const pageObjects = requested.length
  ? project.getSourceFiles().filter((file) => requested.includes(file.getFilePath()))
  : project.getSourceFiles('pages/**/*.ts');

const violations: string[] = [];
const warnings: string[] = [];

/**
 * Determines if a call expression is a Playwright locator or selector call.
 * @param call The call expression to check.
 * @returns True if the call is a locator call.
 */
function isLocatorCall(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
    if (propAccess) {
      const name = propAccess.getName();
      return name === 'locator' || name.startsWith('getBy');
    }
  }
  return false;
}

/**
 * Validates if a locator call follows ARIA-first best practices.
 * @param call The call expression to check.
 * @returns True if the locator is an ARIA-based selector.
 */
function isARIALocator(call: CallExpression): boolean {
  const expr = call.getExpression();
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
    if (propAccess) {
      const name = propAccess.getName();
      const validMethods = [
        'getByRole',
        'getByText',
        'getByLabel',
        'getByPlaceholder',
        'getByAltText',
        'getByTitle',
        'getByTestId',
      ];
      return validMethods.includes(name);
    }
  }
  return false;
}

/**
 * Checks the @verified JSDoc tag on a property and issues a warning if the selector
 * has not been verified within the last 90 days.
 * @param prop The property declaration to check.
 */
function checkVerificationDate(prop: PropertyDeclaration) {
  const jsdocs = prop.getJsDocs();
  if (jsdocs.length === 0) {
    return;
  }

  const tags = jsdocs[0].getTags();
  const verifiedTag = tags.find((tag) => tag.getTagName() === 'verified');
  if (!verifiedTag) {
    return;
  }

  const dateStr = verifiedTag.getCommentText()?.trim();
  if (!dateStr) {
    return;
  }

  const verifiedDate = new Date(dateStr);
  if (isNaN(verifiedDate.getTime())) {
    return;
  }

  const diffDays = Math.floor((Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 90) {
    warnings.push(
      `${pc.yellow(prop.getSourceFile().getFilePath())}:${prop.getStartLineNumber()} — ${pc.bold(prop.getName())} was last verified ${diffDays} days ago (${dateStr}). Recommendation: Review selector.`,
    );
  }
}

for (const file of pageObjects) {
  file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(isLocatorCall)
    .filter((call) => {
      return !isARIALocator(call);
    })
    .forEach((call) => {
      violations.push(
        `${file.getFilePath()}:${call.getStartLineNumber()} — raw locator: ${call.getText()}`,
      );
    });

  file.getDescendantsOfKind(SyntaxKind.PropertyDeclaration).forEach((prop) => {
    checkVerificationDate(prop);
  });
}

if (warnings.length > 0) {
  console.log(pc.yellow('\nSelector Health Warnings'));
  warnings.forEach((w) => {
    console.log(`  ${w}`);
  });
}

if (violations.length > 0) {
  console.error(
    pc.red(
      '\nSelector health check failed. Raw locators (like page.locator) are FORBIDDEN in Page Objects.',
    ),
  );
  console.error(pc.red('Please use ARIA-first strategies (e.g. page.getByRole). Violations:'));
  violations.forEach((v) => {
    console.error(`  ${pc.red(v)}`);
  });
  process.exit(1);
}
