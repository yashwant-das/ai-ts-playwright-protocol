import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GateError, getTaskFiles, runStaticGates, setTaskStatus } from '../../scripts/gate';

const body = '- **Test File:** `tests/example.spec.ts`';

void test('task files include optional plan without requiring one', () => {
  assert.deepEqual(getTaskFiles(body), { testFile: 'tests/example.spec.ts', specFile: undefined });
  assert.equal(getTaskFiles('No declaration'), null);
  assert.deepEqual(getTaskFiles(`${body}\n- **Spec:** \`specs/example.plan.md\``), {
    testFile: 'tests/example.spec.ts',
    specFile: 'specs/example.plan.md',
  });
});

for (const [name, source, reason] of [
  ['fixme', 'test.fixme("regression")', 'regression'],
  ['skip', 'test.skip("missing")', 'verification'],
  ['describe skip', 'test.describe.skip("missing")', 'verification'],
] as const) {
  void test(`gate blocks ${name} with the correct recovery reason`, () => {
    const root = mkdtempSync(join(tmpdir(), 'spp-gate-'));
    try {
      mkdirSync(join(root, 'tests'));
      writeFileSync(join(root, 'tests/example.spec.ts'), source);
      assert.throws(
        () => runStaticGates(body, root),
        (error: unknown) => error instanceof GateError && error.reason === reason,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

void test('gate requires declared files and accepts an existing optional plan', () => {
  const root = mkdtempSync(join(tmpdir(), 'spp-gate-'));
  try {
    assert.throws(() => runStaticGates('No declaration', root), GateError);
    assert.throws(() => runStaticGates(body, root), GateError);
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests/example.spec.ts'), 'test("business outcome", () => {});');
    assert.equal(runStaticGates(body, root).testFile, 'tests/example.spec.ts');
    const withPlan = `${body}\n- **Spec:** \`specs/example.plan.md\``;
    assert.throws(() => runStaticGates(withPlan, root), GateError);
    mkdirSync(join(root, 'specs'));
    writeFileSync(join(root, 'specs/example.plan.md'), '# Plan\n');
    assert.equal(runStaticGates(withPlan, root).specFile, 'specs/example.plan.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('status writes persist BLOCKED reason and DONE completes criteria and clears reason', () => {
  const root = mkdtempSync(join(tmpdir(), 'spp-status-'));
  const file = join(root, 'task.md');
  try {
    const content = '---\nid: T-011\nstatus: TODO\n---\n\n- [ ] Business outcome\n';
    setTaskStatus(file, content, 'BLOCKED', 'regression');
    assert.match(readFileSync(file, 'utf8'), /status: "BLOCKED"\nblockReason: "regression"/);
    setTaskStatus(file, readFileSync(file, 'utf8'), 'DONE');
    const result = readFileSync(file, 'utf8');
    assert.match(result, /status: "DONE"/);
    assert.match(result, /- \[x\] Business outcome/);
    assert.doesNotMatch(result, /blockReason:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
