import * as fs from 'fs';
import * as path from 'path';
import fm from 'front-matter';
import {
  intro,
  outro,
  select,
  log,
  spinner as clackSpinner,
  group,
  text,
  isCancel,
  confirm,
  isCI,
  isTTY,
} from '@clack/prompts';
import { Task } from '../types/task';
import { exec } from 'child_process';
import pc from 'picocolors';
import clipboard from 'clipboardy';
import { GateError, runStaticGates, setTaskStatus } from './gate';

type TaskFile = Task & { file: string; content: string };

const ROOT_DIR = path.join(__dirname, '..');
const TASKS_DIR = path.join(ROOT_DIR, 'tasks');
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
const LOG_FILE = path.join(LOG_DIR, 'last_run.log');
const LOG_FILE_REL = path.relative(process.cwd(), LOG_FILE);
const VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as { version: string }
).version;

/**
 * Spinners and prompts need a real terminal. Piped output, CI and AI assistants
 * get plain, line-by-line output and never block on a prompt.
 */
const INTERACTIVE = isTTY(process.stdout) && !isCI();

const STATUS_COLORS: Record<Task['status'], (s: string) => string> = {
  TODO: pc.blue,
  IN_PROGRESS: pc.yellow,
  BLOCKED: pc.red,
  DONE: pc.green,
};

const theme = {
  taskId: (id: string) => pc.bold(id),
  command: (cmd: string) => pc.cyan(cmd),
  dim: (s: string) => pc.dim(s),
};

/**
 * Formats a task status as a colored label, optionally padded to a column width.
 * @param status The task status.
 * @param width Column width to pad to before coloring (ANSI codes break padEnd).
 * @returns The colored status label.
 */
function statusLabel(status: Task['status'], width = 0): string {
  const label = status.replace('_', ' ').padEnd(width);
  return STATUS_COLORS[status](label);
}

/**
 * Formats a duration since a start time, e.g. "3.2s".
 * @param startedAt Start time from Date.now().
 * @returns The elapsed time as a dim string.
 */
function elapsed(startedAt: number): string {
  return theme.dim(`${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

/**
 * Prints the CLI header.
 */
function header() {
  intro(
    `${pc.inverse(pc.bold(' SPP '))} ${pc.bold('Smart Playwright Protocol')} ${theme.dim(`v${VERSION}`)}`,
  );
}

/**
 * Prints the closing line with the recommended next step.
 * @param next The next step to suggest.
 */
function done(next: string) {
  outro(`${pc.blue('Next:')} ${next}`);
}

/**
 * Handles the cancellation of the CLI process.
 */
function handleCancel() {
  outro(theme.dim('Cancelled.'));
  process.exit(0);
}

/**
 * Appends a message to the framework's last_run.log file.
 * @param msg The message to log to the file.
 */
function mkLog(msg: string) {
  fs.appendFileSync(LOG_FILE, msg + '\n');
}

/** A failed shell command, carrying its combined output for diagnostics. */
class CommandError extends Error {
  /**
   * Creates a command failure.
   * @param command The command that failed.
   * @param output Combined stdout and stderr.
   */
  constructor(
    command: string,
    public readonly output: string,
  ) {
    super(`Command failed: ${command}`);
    this.name = 'CommandError';
  }
}

/**
 * Executes a shell command and captures its output to the log file.
 * @param command The shell command to execute.
 * @returns A promise that resolves with the combined output when the command succeeds.
 */
async function runCmd(command: string): Promise<string> {
  mkLog(`\n> ${command}\n`);
  return new Promise((resolve, reject) => {
    exec(
      `set -o pipefail && ${command}`,
      { shell: '/bin/bash', maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (stdout) mkLog(stdout);
        if (stderr) mkLog(stderr);
        const output = `${stdout}\n${stderr}`;
        if (error) {
          reject(new CommandError(command, output));
        } else {
          resolve(output);
        }
      },
    );
  });
}

/**
 * Removes ANSI escape sequences from command output.
 * @param s Raw output.
 * @returns Plain text.
 */
function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
}

/**
 * Extracts the lines that explain a failure from lint or Playwright output.
 * @param output Combined command output.
 * @returns Failure lines: lint errors with file:line, failing tests with their first error.
 */
function failureLines(output: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let eslintFile = '';
  let inFailingTest = false;
  const add = (line: string) => {
    if (!seen.has(line)) found.push(line);
    seen.add(line);
  };
  for (const raw of stripAnsi(output).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^\/\S+\.(ts|tsx|js|mjs)$/.test(line)) {
      eslintFile = path.relative(ROOT_DIR, line);
      continue;
    }
    const eslint = /^\s+(\d+:\d+)\s+error\s+(.*)$/.exec(line);
    if (eslint) {
      add(`${eslintFile}:${eslint[1]}  ${eslint[2].replace(/\s{2,}/g, '  ')}`);
      continue;
    }
    if (/^\S+\.md:\d+(:\d+)? error /.test(line)) {
      add(line);
      continue;
    }
    // Playwright failure details: "  1) [chromium] › file:line › title", then its first "Error:" line.
    const failingTest = /^\s+\d+\) (\[.*)$/.exec(line);
    if (failingTest) {
      inFailingTest = !seen.has(`✘ ${failingTest[1]}`);
      add(`✘ ${failingTest[1]}`);
      continue;
    }
    const testError = /^\s+(Error: .*)$/.exec(line);
    if (testError && inFailingTest) {
      found.push(`  ${testError[1]}`);
      inFailingTest = false;
    }
  }
  if (found.length > 0) return found;
  return stripAnsi(output)
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-8);
}

/**
 * Extracts Playwright's result counts, e.g. "2 passed, 1 flaky".
 * @param output Playwright output.
 * @returns The counts, or an empty string when none are found.
 */
function testCounts(output: string): string {
  const counts = [
    ...stripAnsi(output).matchAll(/^\s+(\d+ (?:passed|failed|flaky|skipped|did not run))/gm),
  ].map((m) => m[1]);
  return counts.join(', ');
}

/**
 * Runs one gate step with a spinner (interactive) or a single result line (plain).
 * @param label Step name, e.g. "Lint".
 * @param command Shell command to run.
 * @param detail Optional summary of the successful output shown after the label.
 * @returns The command output.
 */
async function runStep(
  label: string,
  command: string,
  detail?: (output: string) => string,
): Promise<string> {
  const startedAt = Date.now();
  const s = INTERACTIVE ? clackSpinner() : undefined;
  s?.start(`${label} ${theme.dim(command)}`);
  try {
    const output = await runCmd(command);
    const extra = detail?.(output);
    const message = `${label} passed ${theme.dim('·')} ${extra ? `${extra} ${theme.dim('·')} ` : ''}${elapsed(startedAt)}`;
    if (s) s.stop(message);
    else log.step(message);
    return output;
  } catch (err) {
    const message = `${label} failed ${theme.dim('·')} ${elapsed(startedAt)}`;
    if (s) s.error(message);
    else log.error(message);
    throw err;
  }
}

/**
 * Prints a failure excerpt and a pointer to the full log.
 * @param lines Failure lines to show.
 */
function showFailure(lines: string[]) {
  const MAX = 12;
  const shown = lines.slice(0, MAX).map((l) => (l.startsWith('  ') ? theme.dim(l) : pc.red(l)));
  if (lines.length > MAX) shown.push(theme.dim(`…and ${lines.length - MAX} more`));
  shown.push(theme.dim(`Full log: ${LOG_FILE_REL}`));
  log.message(shown.join('\n'));
}

/**
 * Copies a prompt to the clipboard and prints it without decoration so it can
 * also be copied straight from the terminal.
 * @param title What the prompt is for, e.g. "Handoff prompt".
 * @param prompt The prompt text.
 */
function showPrompt(title: string, prompt: string) {
  const copied = copyToClipboard(prompt);
  const status = copied
    ? pc.green('copied to clipboard ✓')
    : pc.yellow('clipboard unavailable, copy it from below');
  log.info(`${pc.bold(title)} ${theme.dim('·')} ${status}`);
  process.stdout.write(`\n${prompt}\n\n`);
}

/**
 * Reads all task files from the tasks/ directory and parses their front-matter.
 * @returns An array of parsed Task objects with associated file information, sorted by file name.
 */
function getAllTasks(): TaskFile[] {
  const files = fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'template.md')
    .sort();
  const tasks: TaskFile[] = [];
  for (const f of files) {
    const filePath = path.join(TASKS_DIR, f);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = fm<Task>(content);
      const attrs = parsed.attributes;

      // Simple validation: Ensure id and title exist
      if (!attrs.id || !attrs.title) {
        log.warn(`Skipping ${pc.bold(`tasks/${f}`)}: missing id or title in front-matter.`);
        continue;
      }

      tasks.push({
        ...attrs,
        file: f,
        content,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.warn(`Skipping ${pc.bold(`tasks/${f}`)}: invalid front-matter (${errorMsg}).`);
    }
  }
  return tasks;
}

/**
 * Determines the next eligible task based on SPP priority.
 * 1. IN_PROGRESS tasks (Resume)
 * 2. BLOCKED tasks (Retry)
 * 3. TODO tasks (Start, checking dependencies)
 * @param tasks The list of all tasks.
 * @returns The next Task to process, or null if none are eligible.
 */
function getNextTask(tasks: TaskFile[]) {
  // Only consider tasks with valid statuses for selection
  const eligibleTasks = tasks.filter((t) => ['TODO', 'IN_PROGRESS', 'BLOCKED'].includes(t.status));

  const inProgress = eligibleTasks.find((t) => t.status === 'IN_PROGRESS');
  if (inProgress) return inProgress;

  const blocked = eligibleTasks.find((t) => t.status === 'BLOCKED');
  if (blocked) return blocked;

  const done = new Set(tasks.filter((t) => t.status === 'DONE').map((t) => t.id));
  return (
    eligibleTasks
      .filter((t) => t.status === 'TODO')
      .filter((t) => (t.dependsOn ?? []).every((dep) => done.has(dep)))
      .at(0) ?? null
  );
}

/**
 * Attempts to copy text to the system clipboard.
 * @param text The text to copy.
 * @returns True if successful, false otherwise.
 */
function copyToClipboard(text: string) {
  try {
    clipboard.writeSync(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the AI handoff prompt for a newly activated task.
 * @param task The activated task.
 * @returns The prompt text.
 */
function handoffPrompt(task: TaskFile): string {
  return [
    'Read docs/protocol.md',
    '',
    `Task: ${task.id} ${task.title}`,
    `Task file: tasks/${task.file}`,
    '',
    'Follow the Smart Playwright Protocol:',
    '1. Understand: fill the Understanding section first',
    '2. Explore: playwright-cli attached to tests/seed.spec.ts, or the playwright-test-planner agent',
    `3. Plan: save the plan to specs/${task.id}_<feature>.plan.md and link it as **Spec:**`,
    '4. Implement: write the test (or use the playwright-test-generator agent)',
    '5. Promote: move every selector into a Page Object, import test/expect from tests/fixtures',
    `6. Verify: npm run task ${task.id}`,
  ].join('\n');
}

/**
 * Builds the repair prompt for a task that failed verification.
 * @param taskId The blocked task ID.
 * @param reason The block reason.
 * @param message The gate failure message.
 * @returns The prompt text.
 */
function repairPrompt(taskId: string, reason: string, message: string): string {
  if (reason === 'regression') {
    return [
      `Task ${taskId} is BLOCKED (regression). Human decision required.`,
      '',
      message,
      '',
      'Do not remove test.fixme() until the user confirms whether the app or the spec is wrong.',
    ].join('\n');
  }
  return [
    `Task ${taskId} is BLOCKED. Verification failed.`,
    '',
    'Read docs/protocol.md (Recover).',
    `Review ${LOG_FILE_REL}, then find the root cause with evidence:`,
    '- the playwright-test-healer agent, or npx playwright test <test file> --debug=cli + playwright-cli attach',
    '- npx playwright trace open <trace.zip> for traces from test retries',
    'Apply the smallest possible fix; selectors stay in Page Objects.',
    `Re-run: npm run task ${taskId}`,
  ].join('\n');
}

/**
 * Moves a TODO task to IN_PROGRESS and hands it to the AI assistant.
 * @param task The task to activate.
 */
function activateTask(task: TaskFile) {
  setTaskStatus(path.join(TASKS_DIR, task.file), task.content, 'IN_PROGRESS');
  mkLog(`\n[${task.id}] Task activated: ${task.title}`);
  log.success(`${theme.taskId(task.id)} ${statusLabel('TODO')} → ${statusLabel('IN_PROGRESS')}`);
  showPrompt('Handoff prompt', handoffPrompt(task));
  done(
    `paste the prompt into your AI assistant; when it is ready, run ${theme.command(`npm run task ${task.id}`)}`,
  );
}

/**
 * Runs the verification gate for a task and records the outcome.
 * @param task The task to verify (IN_PROGRESS, BLOCKED or DONE).
 */
async function verifyTask(task: TaskFile) {
  const filePath = path.join(TASKS_DIR, task.file);
  const wasDone = task.status === 'DONE';
  fs.writeFileSync(LOG_FILE, `--- Verification Run Started for ${task.id} ---\n`);

  try {
    const { testFile } = runStaticGates(task.content, ROOT_DIR);
    mkLog(`✓ static gates passed (${testFile})`);
    log.step(`Static checks passed ${theme.dim(`· ${testFile}`)}`);

    await runStep('Lint', 'npm run lint');
    await runStep('Tests', `npm test ${testFile}`, testCounts);
  } catch (err: unknown) {
    const reason = err instanceof GateError ? err.reason : 'verification';
    const message = err instanceof Error ? err.message : String(err);
    mkLog(`\n[${task.id}] Verification FAILED (${reason}): ${message}`);

    if (err instanceof GateError) {
      log.error(`Static checks failed ${theme.dim(`(${reason})`)}`);
      log.message(pc.red(message));
    } else if (err instanceof CommandError) {
      showFailure(failureLines(err.output));
    } else {
      log.message(pc.red(message));
    }

    setTaskStatus(filePath, fs.readFileSync(filePath, 'utf8'), 'BLOCKED', reason);
    log.error(`${theme.taskId(task.id)} → ${statusLabel('BLOCKED')} ${theme.dim(`(${reason})`)}`);
    showPrompt(
      reason === 'regression' ? 'Decision needed' : 'Repair prompt',
      repairPrompt(task.id, reason, message),
    );
    done(
      reason === 'regression'
        ? 'decide whether the app or the spec is wrong (see docs/protocol.md, Recover)'
        : `paste the repair prompt into your AI assistant, then run ${theme.command(`npm run task ${task.id}`)}`,
    );
    process.exitCode = 1;
    return;
  }

  if (wasDone) {
    log.success(`${theme.taskId(task.id)} remains ${statusLabel('DONE')}`);
    done(`run ${theme.command('npm run task next')} to pick up the next task`);
    return;
  }

  let markDone: boolean | symbol = true;
  if (INTERACTIVE) {
    markDone = await confirm({
      message: `Verification passed. Mark ${task.id} as DONE?`,
      initialValue: true,
    });
    if (isCancel(markDone)) handleCancel();
  }

  if (markDone === true) {
    setTaskStatus(filePath, fs.readFileSync(filePath, 'utf8'), 'DONE');
    log.success(
      `${theme.taskId(task.id)} → ${statusLabel('DONE')}${INTERACTIVE ? '' : theme.dim(' (non-interactive: gate passed)')}`,
    );
    done(`review the changes, commit, then run ${theme.command('npm run task next')}`);
  } else {
    log.info(`${theme.taskId(task.id)} remains ${statusLabel(task.status)}`);
    done(`run ${theme.command(`npm run task ${task.id}`)} again when ready`);
  }
}

/**
 * Orchestrates the processing of a task through its lifecycle (Activation, Verification, Recovery).
 * @param task The task object to process.
 */
async function processTask(task: TaskFile) {
  const action = task.status === 'TODO' ? 'activate' : 'verify: static checks → lint → tests';
  log.info(
    `${theme.taskId(task.id)} ${pc.bold(task.title)} ${statusLabel(task.status)} ${theme.dim(`· ${action}`)}`,
  );
  if (task.status === 'TODO') {
    activateTask(task);
  } else {
    await verifyTask(task);
  }
}

/**
 * Interactive wizard to create a new task markdown file with standardized structure and metadata.
 */
async function createTask() {
  if (!INTERACTIVE) {
    log.error('Creating a task needs an interactive terminal.');
    done(
      `copy ${theme.command('tasks/template.md')}, or use the SPP Lifecycle MCP ${theme.command('create_task')} tool`,
    );
    process.exitCode = 1;
    return;
  }

  const task = await group(
    {
      id: () =>
        text({
          message: 'Task ID (e.g., T-012)',
          placeholder: 'T-###',
          validate: (value) => {
            if (!value || !value.match(/^T-\d{3}$/)) return 'Invalid ID format. Use T-###';
          },
        }),
      title: () =>
        text({
          message: 'Task Title',
          placeholder: 'Verify Checkout Tax Calculation',
          validate: (value) => {
            if (!value) return 'Title is required';
          },
        }),
      pageObject: () =>
        text({
          message: 'Page Object (optional)',
          placeholder: 'CheckoutPage',
        }),
      testFile: () =>
        text({
          message: 'Test File (optional)',
          placeholder: 'tests/checkout.spec.ts',
        }),
      url: () =>
        text({
          message: 'URL (optional)',
          placeholder: '/checkout-step-one.html',
        }),
      acceptanceCriteria: () =>
        text({
          message: 'Acceptance Criteria (comma separated)',
          placeholder: 'Verify tax is 10%, Verify total includes tax',
        }),
    },
    {
      onCancel: () => {
        handleCancel();
      },
    },
  );

  const kebabTitle = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const filename = `${task.id}_${kebabTitle}.md`;
  const filePath = path.join(TASKS_DIR, filename);

  if (fs.existsSync(filePath)) {
    log.error(`Task file already exists: ${pc.bold(`tasks/${filename}`)}`);
    process.exit(1);
  }

  const acList = task.acceptanceCriteria
    ? task.acceptanceCriteria
        .split(',')
        .map((s) => `- [ ] ${s.trim()}`)
        .join('\n')
    : '- [ ] ';

  const content = `---
id: "${task.id}"
title: "${task.title}"
status: "TODO"
dependsOn: []
---

${task.id}: ${task.title}

## Understanding

Feature:
Expected Behavior:
Business Outcome:
Risk:

## Context

- **Page Object:** ${task.pageObject ? `\`pages/${task.pageObject.endsWith('.ts') ? task.pageObject : task.pageObject + '.ts'}\`` : ''}
- **Test File:** ${task.testFile ? `\`${task.testFile.endsWith('.spec.ts') ? task.testFile : task.testFile + '.spec.ts'}\`` : ''}
- **URL:** ${task.url || ''}
- **Spec:**

## Implementation Plan

1. Explore from the seed and save the plan to specs/ (link it above as **Spec:**)
2. Implement the test
3. Promote selectors into Page Objects

## Acceptance Criteria

${acList}
`;

  fs.writeFileSync(filePath, content);
  log.success(`Created ${theme.taskId(task.id)} ${theme.dim(`tasks/${filename}`)}`);

  const next = getNextTask(getAllTasks());
  if (next?.id === task.id) {
    done(`run ${theme.command('npm run task next')} to activate ${task.id}`);
  } else if (next?.status === 'IN_PROGRESS' || next?.status === 'BLOCKED') {
    done(
      `finish ${theme.taskId(next.id)} (${statusLabel(next.status)}) first: ${theme.command('npm run task next')}`,
    );
  } else {
    done(`run ${theme.command('npm run task next')} to continue`);
  }
}

/**
 * Displays the task board: status counts and one aligned row per task.
 * @param tasks The list of tasks to display.
 */
function showTaskBoard(tasks: TaskFile[]) {
  const statuses: Task['status'][] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'];
  const counts = statuses
    .map((s) => `${statusLabel(s)} ${pc.bold(String(tasks.filter((t) => t.status === s).length))}`)
    .join(theme.dim('   '));

  const idWidth = Math.max(...tasks.map((t) => t.id.length), 5);
  const rows = tasks.map((t) => {
    const reason = t.status === 'BLOCKED' && t.blockReason ? theme.dim(` · ${t.blockReason}`) : '';
    const active = t.status === 'IN_PROGRESS' ? pc.yellow(' ◀ active') : '';
    return `${theme.taskId(t.id.padEnd(idWidth))}  ${statusLabel(t.status, 11)}  ${t.title}${reason}${active}`;
  });

  log.info(`${pc.bold('Task board')} ${theme.dim(`· ${tasks.length} tasks`)}`);
  log.message([counts, '', ...rows].join('\n'));

  const next = getNextTask(tasks);
  if (!next) done('add a task with ' + theme.command('npm run task create'));
  else if (next.status === 'TODO')
    done(`run ${theme.command('npm run task next')} to activate ${theme.taskId(next.id)}`);
  else
    done(
      `run ${theme.command(`npm run task ${next.id}`)} to verify ${theme.taskId(next.id)} (${statusLabel(next.status)})`,
    );
}

/**
 * Displays a list of blocked tasks and their failure reasons.
 * @param tasks The list of tasks to filter for blocked status.
 */
function showBlockedTasks(tasks: TaskFile[]) {
  const blocked = tasks.filter((t) => t.status === 'BLOCKED');
  if (blocked.length === 0) {
    log.success('No blocked tasks.');
    done(`run ${theme.command('npm run task next')} to continue`);
    return;
  }

  const idWidth = Math.max(...blocked.map((t) => t.id.length), 5);
  const rows = blocked.map((t) => {
    const reason = t.blockReason ?? 'unknown';
    const hint = reason === 'regression' ? theme.dim(' · needs a human decision') : '';
    return `${theme.taskId(t.id.padEnd(idWidth))}  ${pc.red(reason.padEnd(12))}  ${t.title}${hint}`;
  });
  log.error(`${pc.bold('Blocked tasks')} ${theme.dim(`· ${blocked.length}`)}`);
  log.message(rows.join('\n'));
  done(
    `read ${theme.command(LOG_FILE_REL)}, fix, then run ${theme.command(`npm run task ${blocked[0].id}`)}`,
  );
}

/**
 * Prints command usage.
 */
function showHelp() {
  const commands: [string, string][] = [
    ['npm run task', 'Interactive menu'],
    ['npm run task create', 'Create a task (wizard)'],
    ['npm run task next', 'Activate or resume the next eligible task'],
    ['npm run task status', 'Show the task board'],
    ['npm run task blocked', 'List blocked tasks'],
    ['npm run task <TASK_ID>', 'Activate, verify or re-verify one task'],
    ['npm run agents', 'Regenerate Playwright agents and skills'],
  ];
  const width = Math.max(...commands.map(([c]) => c.length));
  log.message(commands.map(([c, d]) => `${theme.command(c.padEnd(width))}  ${d}`).join('\n'));
  done(`see ${theme.command('docs/development.md')} for details`);
}

/**
 * Activates or verifies one task by ID, enforcing dependencies and the
 * one-active-task rule.
 * @param tasks All tasks.
 * @param taskId The requested task ID or file prefix.
 */
async function runTaskById(tasks: TaskFile[], taskId: string) {
  const target = tasks.find(
    (t) =>
      t.file.toLowerCase().startsWith(taskId.toLowerCase() + '_') ||
      t.id.toLowerCase() === taskId.toLowerCase(),
  );
  if (!target) {
    log.error(`Task ${pc.bold(taskId)} not found in tasks/.`);
    done(
      `run ${theme.command('npm run task status')} to list tasks, or ${theme.command('npm run task help')}`,
    );
    process.exitCode = 1;
    return;
  }

  const doneIds = new Set(tasks.filter((t) => t.status === 'DONE').map((t) => t.id));
  const unmetDeps = (target.dependsOn ?? []).filter((dep) => !doneIds.has(dep));
  if (unmetDeps.length > 0) {
    log.error(`Cannot activate ${theme.taskId(target.id)}: these tasks must be DONE first`);
    log.message(
      unmetDeps
        .map(
          (d) =>
            `${theme.taskId(d)}  ${statusLabel(tasks.find((t) => t.id === d)?.status ?? 'TODO')}`,
        )
        .join('\n'),
    );
    done(`finish ${theme.taskId(unmetDeps[0])} first`);
    process.exitCode = 1;
    return;
  }

  // Protocol check: one active task at a time
  if (target.status === 'TODO') {
    const inProgressTask = tasks.find((t) => t.status === 'IN_PROGRESS');
    if (inProgressTask) {
      log.warn(
        `${theme.taskId(inProgressTask.id)} is already ${statusLabel('IN_PROGRESS')}. SPP allows one active task.`,
      );
      if (!INTERACTIVE) {
        done(`finish ${theme.taskId(inProgressTask.id)} first, or re-run in a terminal to park it`);
        process.exitCode = 1;
        return;
      }
      const shouldPark = await confirm({
        message: `Park ${inProgressTask.id} (back to TODO) and start ${target.id}?`,
        initialValue: false,
      });
      if (isCancel(shouldPark) || !shouldPark) {
        done(
          `finish ${theme.taskId(inProgressTask.id)} first: ${theme.command(`npm run task ${inProgressTask.id}`)}`,
        );
        process.exitCode = 1;
        return;
      }
      setTaskStatus(path.join(TASKS_DIR, inProgressTask.file), inProgressTask.content, 'TODO');
      log.step(`Parked ${theme.taskId(inProgressTask.id)} → ${statusLabel('TODO')}`);
    }
  }
  await processTask(target);
}

/**
 * Activates or resumes the next eligible task.
 * @param tasks All tasks.
 */
async function runNext(tasks: TaskFile[]) {
  const next = getNextTask(tasks);
  if (!next) {
    log.info('No eligible tasks. Resolve blocked work or add a TODO task.');
    done(`run ${theme.command('npm run task create')}`);
    return;
  }
  if (next.status !== 'TODO') {
    log.info(
      `Resuming ${theme.taskId(next.id)} (${statusLabel(next.status)}) before starting new work.`,
    );
  }
  await processTask(next);
}

/**
 * Dispatches a named command (create, next, status, blocked) or a task ID.
 * @param command The command or task ID.
 * @param tasks All tasks.
 */
async function runCommand(command: string, tasks: TaskFile[]) {
  switch (command) {
    case 'create':
      await createTask();
      break;
    case 'next':
      await runNext(tasks);
      break;
    case 'status':
      showTaskBoard(tasks);
      break;
    case 'blocked':
      showBlockedTasks(tasks);
      break;
    default:
      await runTaskById(tasks, command);
  }
}

/**
 * CLI Entry point. Parses arguments and launches the appropriate workflow or interactive menu.
 */
async function main() {
  const arg = process.argv[2];
  header();
  const tasks = getAllTasks();

  if (arg === 'help' || arg === '--help' || arg === '-h') {
    showHelp();
    return;
  }
  if (arg) {
    await runCommand(arg, tasks);
    return;
  }
  if (!INTERACTIVE) {
    showHelp();
    return;
  }

  const command = await select({
    message: 'What would you like to do?',
    options: [
      { value: 'next', label: 'Activate or resume next task' },
      { value: 'verify', label: 'Verify current active task' },
      { value: 'status', label: 'Show task board' },
      { value: 'blocked', label: 'Show blocked tasks' },
      { value: 'create', label: 'Create a new task' },
    ],
  });
  if (isCancel(command)) handleCancel();

  if (command === 'verify') {
    const active =
      tasks.find((t) => t.status === 'IN_PROGRESS') ?? tasks.find((t) => t.status === 'BLOCKED');
    if (!active) {
      log.info('No active task to verify.');
      done(`run ${theme.command('npm run task next')} to activate one`);
      return;
    }
    await processTask(active);
    return;
  }
  await runCommand(String(command), tasks);
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
