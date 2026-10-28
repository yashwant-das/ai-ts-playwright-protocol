import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const checker = resolve('scripts/check-text.ts');
const run = (files: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', checker, ...files], { encoding: 'utf8' });
for (const [name, filename, content] of [
  ['strict JSON', 'invalid.json', '{"x":1,}\n'],
  ['YAML syntax', 'invalid.yml', 'x: [\n'],
  ['JSONC syntax', 'invalid.jsonc', '{ "x": }\n'],
  [
    'conflict markers',
    'conflict.ts',
    '<<<<<<< ours\nlet value = 1;\n=======\nlet value = 2;\n>>>>>>> theirs\n',
  ],
  ['trailing whitespace', 'space.ts', 'const value = 1; \n'],
  ['final newline', 'newline.ts', 'const value = 1;'],
] as const) {
  void test(`text checker rejects ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'spp-text-'));
    try {
      const file = join(root, filename);
      writeFileSync(file, content);
      const result = run([file]);
      assert.equal(result.status, 1, result.stderr + result.stdout);
      assert.match(result.stderr, new RegExp(filename.replace('.', '\\.')));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

void test('text checker accepts JSONC comments and Markdown hard breaks with spaces in filenames', () => {
  const root = mkdtempSync(join(tmpdir(), 'spp-text-'));
  try {
    const config = join(root, 'comment config.jsonc');
    const markdown = join(root, 'hard break.md');
    writeFileSync(config, '{\n // Comment\n "value": 1,\n}\n');
    writeFileSync(markdown, '# Heading\n\nHard break  \nNext line\n');
    const result = run([config, markdown, join(root, 'deleted.ts')]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
