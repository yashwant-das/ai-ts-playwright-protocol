import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, extname } from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import { parseDocument } from 'yaml';

const generated =
  /^(?:node_modules|\.git|\.claude|\.agents|\.codex\/agents|\.github\/agents|\.opencode\/prompts|playwright-report|test-results|dist)\//;
const maintained = (file: string) =>
  !generated.test(relative(process.cwd(), file)) && !/specs\/.*\.plan\.md$/.test(file);
const files = process.argv.slice(2);
const selected = files.length
  ? files
  : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
let failures = 0;
for (const file of selected) {
  if (!maintained(file) || !existsSync(file) || !statSync(file).isFile()) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  const content = bytes.toString('utf8');
  const extension = extname(file);
  const report = (message: string) => {
    console.error(`${file}: ${message}`);
    failures++;
  };
  if (content && !content.endsWith('\n')) report('missing final newline');
  if (/^(?:<<<<<<< |=======$|>>>>>>> )/m.test(content)) report('unresolved merge-conflict marker');
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    const trailing = /[\t ]+$/.exec(line)?.[0];
    if (trailing && !(extension === '.md' && trailing === '  ' && line.trim()))
      report(`line ${index + 1}: trailing whitespace`);
  }
  try {
    if (extension === '.json') JSON.parse(content);
    if (extension === '.jsonc') {
      const errors: ParseError[] = [];
      parse(content, errors, { allowTrailingComma: true });
      if (errors.length) report(`invalid JSONC at offset ${errors[0].offset}`);
    }
    if (extension === '.yml' || extension === '.yaml') {
      const document = parseDocument(content, { uniqueKeys: true });
      if (document.errors.length) report(document.errors.map((error) => error.message).join('; '));
    }
  } catch (error: unknown) {
    report(error instanceof Error ? error.message : String(error));
  }
}
if (failures) process.exitCode = 1;
