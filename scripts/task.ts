import * as fs from 'fs';
import * as path from 'path';
import fm from 'front-matter';
import { intro, outro, select, log, spinner as clackSpinner, note, group, text, isCancel, confirm } from '@clack/prompts';
import { Task } from '../types/task';
import { exec } from 'child_process';
import pc from 'picocolors';
import clipboard from 'clipboardy';
import { GateError, runStaticGates, setTaskStatus } from './gate';

const theme = {
    status: (s: string) => {
        if (s === 'DONE') return pc.green(s);
        if (s === 'IN_PROGRESS') return pc.yellow(s);
        if (s === 'BLOCKED') return pc.red(s);
        return pc.blue(s);
    },
    taskId: (id: string) => pc.bold(`[${id}]`),
    title: (text: string) => pc.bold(text),
    step: (text: string) => pc.dim(text),
    success: (text: string) => pc.green(text),
    error: (text: string) => pc.red(text),
    noteTitle: (text: string) => pc.bold(text),
    noteWarning: (text: string) => pc.red(pc.bold(text)),
};

/**
 * Handles the cancellation of the CLI process.
 */
function handleCancel() {
    outro('Cancelled.');
    process.exit(0);
}

const ROOT_DIR = path.join(__dirname, '..');
const TASKS_DIR = path.join(ROOT_DIR, 'tasks');
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
const LOG_FILE = path.join(LOG_DIR, 'last_run.log');

/**
 * Appends a message to the framework's last_run.log file.
 * @param msg The message to log to the file.
 */
function mkLog(msg: string) {
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

/**
 * Executes a shell command and captures its output to the log file.
 * @param command The shell command to execute.
 * @returns A promise that resolves when the command completes.
 */
async function runCmd(command: string): Promise<void> {
    mkLog(`\n> ${command}\n`);
    return new Promise((resolve, reject) => {
        exec(`set -o pipefail && ${command}`, { shell: '/bin/bash' }, (error, stdout, stderr) => {
            if (stdout) mkLog(stdout);
            if (stderr) mkLog(stderr);
            if (error) {
                reject(new Error(`Command failed: ${command}`));
            } else {
                resolve();
            }
        });
    });
}

/**
 * Reads all task files from the tasks/ directory and parses their front-matter.
 * @returns An array of parsed Task objects with associated file information.
 */
function getAllTasks(): (Task & { file: string, content: string })[] {
    const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.md') && f !== 'template.md').sort();
    const tasks: (Task & { file: string, content: string })[] = [];
    for (const f of files) {
        const filePath = path.join(TASKS_DIR, f);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = fm<Task>(content);
            const attrs = parsed.attributes;

            // Simple validation: Ensure id and title exist
            if (!attrs.id || !attrs.title) {
                console.warn(pc.yellow(`\n[Warning] Task ${f} is missing required metadata (id or title). Skipping.`));
                continue;
            }

            tasks.push({
                ...attrs,
                file: f,
                content
            });
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.warn(pc.yellow(`\n[Warning] Failed to parse front-matter in ${pc.bold(f)}: ${errorMsg}`));
            console.warn(pc.dim(`Please check that the YAML syntax is correct in tasks/${f}. Continuing...\n`));
            continue;
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
function getNextTask(tasks: (Task & { file: string, content: string })[]) {
    // Only consider tasks with valid statuses for selection
    const eligibleTasks = tasks.filter(t => ['TODO', 'IN_PROGRESS', 'BLOCKED'].includes(t.status));

    const inProgress = eligibleTasks.find(t => t.status === 'IN_PROGRESS');
    if (inProgress) return inProgress;

    const blocked = eligibleTasks.find(t => t.status === 'BLOCKED');
    if (blocked) return blocked;

    const done = new Set(tasks.filter(t => t.status === 'DONE').map(t => t.id));
    return eligibleTasks
      .filter(t => t.status === 'TODO')
      .filter(t => (t.dependsOn ?? []).every(dep => done.has(dep)))
      .at(0) ?? null;
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
 * Orchestrates the processing of a task through its lifecycle (Activation, Verification, Recovery).
 * @param task The task object to process.
 */
async function processTask(task: Task & { file: string, content: string }) {
    const filePath = path.join(TASKS_DIR, task.file);
    const actualTaskId = task.id;

    mkLog(`\n[${actualTaskId}] Task selected: ${task.title}`);
    log.step(`${theme.taskId(actualTaskId)} ${theme.title(task.title)}`);

    let s: ReturnType<typeof clackSpinner> | undefined;

    try {
        if (task.status === 'TODO') {
            log.step(`Status: ${theme.status('TODO')}. Moving task to ${theme.status('IN_PROGRESS')}.`);
            setTaskStatus(filePath, task.content, 'IN_PROGRESS');
            
            const prompt = [
                'Read docs/PROTOCOL.md',
                '',
                `Task: ${actualTaskId} ${task.title}`,
                `Task file: tasks/${task.file}`,
                '',
                'Follow the Smart Playwright Protocol:',
                '1. Understand: fill the Understanding section first',
                '2. Explore: playwright-cli attached to tests/seed.spec.ts, or the playwright-test-planner agent',
                `3. Plan: save the plan to specs/${actualTaskId}_<feature>.plan.md and link it as **Spec:**`,
                '4. Implement: write the test (or use the playwright-test-generator agent)',
                '5. Promote: move every selector into a Page Object, import test/expect from tests/fixtures',
                `6. Verify: npm run task ${actualTaskId}`,
            ].join('\n');
            const copied = copyToClipboard(prompt);

            note(
                `Copy and paste this prompt to your AI assistant:\n${copied ? theme.success('(Already copied to clipboard ✓)') : theme.error('(Clipboard unavailable. Prompt displayed below.)')}\n\n"${prompt}"`,
                theme.noteTitle('AI handoff')
            );
            log.info(`${pc.blue('Next:')} Paste the prompt into your AI assistant.`);
        }
        else if (task.status === 'IN_PROGRESS' || task.status === 'BLOCKED') {
            log.step(`Status: ${theme.status(task.status)}. Running verification.`);
            
            fs.writeFileSync(LOG_FILE, `--- Verification Run Started for ${actualTaskId} ---\n`);

            const { testFile } = runStaticGates(task.content, ROOT_DIR);
            mkLog(`✓ static gates passed (${testFile})`);

            s = clackSpinner();
            s.start('Running lint');
            await runCmd('npm run lint');
            s.stop(theme.success('Lint passed'));

            s = clackSpinner();
            s.start(`Running Playwright test: ${testFile}`);
            await runCmd(`npm test ${testFile}`);
            s.stop(theme.success('Test passed'));

            log.success(theme.success('Verification passed.'));
            note(
                `✓ declared files exist, no fixme/skip\n✓ lint passed (no raw locators, focused tests or hard waits)\n✓ tests passed`,
                theme.noteTitle('Verification Summary')
            );
            
            const markDone = await confirm({
                message: 'Verification passed. Mark task as DONE?',
                initialValue: true
            });
            
            if (isCancel(markDone)) {
                handleCancel();
            }
            
            if (markDone) {
                setTaskStatus(filePath, task.content, 'DONE');
                log.info(`${pc.blue('Next:')} Run ${pc.bold('npm run task next')} to pick up the next task.`);
            } else {
                log.info(`Task remains ${theme.status(task.status)}.`);
            }
        }
        else {
            // Task status is DONE
            log.step(`Status: ${theme.status('DONE')}. Re-running verification.`);
            
            fs.writeFileSync(LOG_FILE, `--- Verification Run Started for ${actualTaskId} ---\n`);

            const { testFile } = runStaticGates(task.content, ROOT_DIR);

            s = clackSpinner();
            s.start('Running lint');
            await runCmd('npm run lint');
            s.stop(theme.success('Lint passed'));

            const cmd = `npm test ${testFile}`;
            
            s = clackSpinner();
            s.start('Running tests');
            await runCmd(cmd);
            s.stop(theme.success('Verification passed. Task remains DONE.'));
        }
    } catch (err: unknown) {
        if (s) {
            s.stop(theme.error('Command failed.'));
        }
        const reason = err instanceof GateError ? err.reason : 'verification';
        const message = err instanceof Error ? err.message : String(err);
        mkLog(`\n[${actualTaskId}] Verification FAILED (${reason}): ${message}`);
        log.error(theme.error(`Verification failed (${reason}): ${message}`));
        setTaskStatus(filePath, fs.readFileSync(filePath, 'utf8'), 'BLOCKED', reason);

        const repairPrompt = reason === 'regression'
            ? [
                `Task ${actualTaskId} is BLOCKED (regression). Human decision required.`,
                '',
                message,
                '',
                'Do not remove test.fixme() until the user confirms whether the app or the spec is wrong.',
            ].join('\n')
            : [
                `Task ${actualTaskId} is BLOCKED. Verification failed.`,
                '',
                'Read docs/PROTOCOL.md (Recover).',
                'Review logs/last_run.log, then find the root cause with evidence:',
                `- the playwright-test-healer agent, or npx playwright test <test file> --debug=cli + playwright-cli attach`,
                '- npx playwright trace open <trace.zip> for traces from CI retries',
                'Apply the smallest possible fix; selectors stay in Page Objects.',
                `Re-run: npm run task ${actualTaskId}`,
            ].join('\n');
        const copied = copyToClipboard(repairPrompt);

        note(
            `Copy and paste this prompt to your AI assistant:\n${copied ? theme.success('(Already copied to clipboard ✓)') : theme.error('(Clipboard unavailable. Prompt displayed below.)')}\n\n"${repairPrompt}"`,
            theme.noteTitle('Repair required')
        );
        log.info(`${pc.blue('Next:')} Paste the repair prompt into your AI assistant.`);
    }
}

/**
 * Interactive wizard to create a new task markdown file with standardized structure and metadata.
 */
async function createTask() {
    const task = await group(
        {
            id: () => text({
                message: 'Task ID (e.g., T-012)',
                placeholder: 'T-###',
                validate: (value) => {
                    if (!value || !value.match(/^T-\d{3}$/)) return 'Invalid ID format. Use T-###';
                }
            }),
            title: () => text({
                message: 'Task Title',
                placeholder: 'Verify Checkout Tax Calculation',
                validate: (value) => {
                    if (!value) return 'Title is required';
                }
            }),
            pageObject: () => text({
                message: 'Page Object (optional)',
                placeholder: 'CheckoutPage'
            }),
            testFile: () => text({
                message: 'Test File (optional)',
                placeholder: 'tests/checkout.spec.ts'
            }),
            url: () => text({
                message: 'URL (optional)',
                placeholder: '/checkout-step-one.html'
            }),
            acceptanceCriteria: () => text({
                message: 'Acceptance Criteria (comma separated)',
                placeholder: 'Verify tax is 10%, Verify total includes tax'
            })
        },
        {
            onCancel: () => {
                handleCancel();
            }
        }
    );

    const kebabTitle = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${task.id}_${kebabTitle}.md`;
    const filePath = path.join(TASKS_DIR, filename);

    if (fs.existsSync(filePath)) {
        log.error(`Task file already exists: ${filename}`);
        process.exit(1);
    }

    const acList = task.acceptanceCriteria
        ? task.acceptanceCriteria.split(',').map(s => `- [ ] ${s.trim()}`).join('\n')
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
    log.success(`Created task: ${theme.taskId(task.id)} ${pc.dim(filename)}`);

    const allTasks = getAllTasks();
    const next = getNextTask(allTasks);

    if (next?.id === task.id) {
        log.info(`${pc.blue('Next:')} Run ${pc.bold('npm run task next')} to activate ${theme.taskId(task.id)}.`);
    } else if (next?.status === 'IN_PROGRESS') {
        log.info(`${pc.blue('Next:')} An active task already exists (${theme.taskId(next.id)}).`);
        log.info(`      Run ${pc.bold('npm run task next')} to continue protocol execution.`);
    } else if (next?.status === 'BLOCKED') {
        log.info(`${pc.blue('Next:')} A BLOCKED task currently exists (${theme.taskId(next.id)}).`);
        log.info(`      Run ${pc.bold('npm run task next')} to continue protocol execution.`);
    } else {
        log.info(`${pc.blue('Next:')} Run ${pc.bold('npm run task next')} to continue protocol execution.`);
    }
}

/**
 * Displays a summary of the task board, including status counts and active/recent tasks.
 * @param tasks The list of tasks to display.
 */
function showTaskBoard(tasks: (Task & { file: string, content: string })[]) {
    const summary = {
        TODO: tasks.filter(t => t.status === 'TODO').length,
        IN_PROGRESS: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        BLOCKED: tasks.filter(t => t.status === 'BLOCKED').length,
        DONE: tasks.filter(t => t.status === 'DONE').length,
    };
    
    log.info('Task Board Summary');
    log.message(`${theme.status('TODO')}: ${summary.TODO} | ${theme.status('IN_PROGRESS')}: ${summary.IN_PROGRESS} | ${theme.status('BLOCKED')}: ${summary.BLOCKED} | ${theme.status('DONE')}: ${summary.DONE}`);
    
    const active = tasks.find(t => t.status === 'IN_PROGRESS');
    if (active) {
        log.info('Current Task');
        log.message(`  ${theme.taskId(active.id)} ${active.title}`);
    }

    log.info('Recent Tasks');
    tasks.slice(0, 10).forEach(t => {
        log.message(`  ${theme.taskId(t.id)} ${t.title} (${theme.status(t.status)})`);
    });
}

/**
 * Displays a list of blocked tasks and their failure reasons.
 * @param tasks The list of tasks to filter for blocked status.
 */
function showBlockedTasks(tasks: (Task & { file: string, content: string })[]) {
    const blocked = tasks.filter(t => t.status === 'BLOCKED');
    if (blocked.length === 0) log.success('No blocked tasks.');
    else {
        log.info('Blocked Tasks');
        blocked.forEach(t => {
            const reason = t.blockReason ? ` | Reason: ${theme.status(t.blockReason)}` : '';
            log.error(`  ${theme.taskId(t.id)} ${t.title}${reason}`);
        });
        log.info(`${pc.blue('Next:')} Read logs/last_run.log to diagnose failures.`);
    }
}

/**
 * CLI Entry point. Parses arguments and launches the appropriate workflow or interactive menu.
 */
async function main() {
    const argTask = process.argv[2];
    const tasks = getAllTasks();

    if (argTask) {
        if (argTask === 'create') {
            await createTask();
            process.exit(0);
        } else if (argTask === 'next') {
            const next = getNextTask(tasks);
            if (!next) {
                log.info('No eligible tasks found. Resolve blocked work or add a TODO task.');
                process.exit(0);
            }
            if (next.status === 'IN_PROGRESS') {
                log.info("No new TODO tasks available (or current is unfinished). Re-running verification on currently active task.");
            }
            await processTask(next);
            process.exit(0);
        } else if (argTask === 'status') {
            showTaskBoard(tasks);
            process.exit(0);
        } else if (argTask === 'blocked') {
            showBlockedTasks(tasks);
            process.exit(0);
        } else {
            const target = tasks.find(t => 
                t.file.toLowerCase().startsWith(argTask.toLowerCase() + '_') || 
                t.id.toLowerCase() === argTask.toLowerCase()
            );
            if (!target) {
                log.error(`Task ${argTask} not found.`);
                process.exit(1);
            }

            const done = new Set(tasks.filter(t => t.status === 'DONE').map(t => t.id));
            const unmetDeps = (target.dependsOn ?? []).filter(dep => !done.has(dep));
            if (unmetDeps.length > 0) {
                log.error(theme.error(`Cannot activate ${target.id}.`));
                note(
                    `The following tasks must be marked as DONE first:\n${unmetDeps.map(d => `- ${d}`).join('\n')}`,
                    theme.noteWarning('Unmet Dependencies')
                );
                process.exit(1);
            }

            // Protocol Check: Prevent forcing a new TODO if there is already an active task
            if (target.status === 'TODO') {
                const inProgressTask = tasks.find(t => t.status === 'IN_PROGRESS');
                if (inProgressTask) {
                    log.error(`Protocol Violation: Task ${inProgressTask.id} is currently IN_PROGRESS.`);
                    const shouldPark = await confirm({
                        message: `Do you want to park it (revert to TODO) and start ${target.id} instead?`,
                        initialValue: false
                    });

                    if (isCancel(shouldPark) || !shouldPark) {
                        log.error(`Cannot start a new TODO task while ${inProgressTask.id} is IN_PROGRESS.`);
                        process.exit(1);
                    }

                    // Park the current task
                    const inProgressPath = path.join(process.cwd(), 'tasks', inProgressTask.file);
                    setTaskStatus(inProgressPath, inProgressTask.content, 'TODO');
                    log.step(`Parked ${inProgressTask.id} back to TODO.`);
                }
            }
            await processTask(target);
            process.exit(0);
        }
    }

    intro(pc.bold('Smart Playwright Task CLI'));
    const command = await select({
        message: 'What would you like to do?',
        options: [
            { value: 'create',   label: 'Create a new task' },
            { value: 'next',     label: 'Activate or resume next task' },
            { value: 'verify',   label: 'Verify current active task' },
            { value: 'status',   label: 'Show task board' },
            { value: 'blocked',  label: 'Show blocked tasks' },
        ]
    });

    if (isCancel(command)) {
        handleCancel();
    }

    if (command === 'create') {
        await createTask();
    } else if (command === 'next') {
        const next = getNextTask(tasks);
        if (!next) {
            log.info('No eligible tasks found. Resolve blocked work or add a TODO task.');
        } else {
            if (next.status === 'IN_PROGRESS') {
                log.info("No new TODO tasks available (or current is unfinished). Re-running verification on currently active task.");
            }
            await processTask(next);
        }
    } else if (command === 'verify') {
        const active = tasks.find(t => t.status === 'IN_PROGRESS') ?? tasks.find(t => t.status === 'BLOCKED');
        if (!active) {
            log.info('No active tasks to verify. Run "next" to activate a new task.');
        } else {
            await processTask(active);
        }
    } else if (command === 'status') {
        showTaskBoard(tasks);
    } else if (command === 'blocked') {
        showBlockedTasks(tasks);
    }

    outro('Done.');
}

main().catch(console.error);
