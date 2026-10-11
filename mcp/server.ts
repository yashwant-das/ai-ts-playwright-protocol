import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import fm from 'front-matter';
import { Task } from '../types/task';
import { GateError, runStaticGates, setTaskStatus } from '../scripts/gate';

// ---------------------------------------------------------------------------
// Server Setup
// ---------------------------------------------------------------------------

const server = new McpServer({
    name: 'smart-playwright-protocol',
    version: '3.0.0',
});

const ROOT_DIR = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT_DIR, 'tasks');
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'last_run.log');

// ---------------------------------------------------------------------------
// Protocol-safe logging — stdout is reserved for JSON-RPC messages.
// All diagnostics MUST go to stderr or a log file.
// ---------------------------------------------------------------------------

/**
 * Protocol-safe logging — stdout is reserved for JSON-RPC messages.
 * All diagnostics MUST go to stderr or a log file.
 * @param msg The message to log to stderr.
 */
function log(msg: string): void {
    console.error(`[spp-protocol] ${msg}`);
}

/**
 * Appends a message to the framework's last_run.log file.
 * @param msg The message to log to the file.
 */
function logToFile(msg: string): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

// ---------------------------------------------------------------------------
// Shell Command Runner (with logging)
// ---------------------------------------------------------------------------

/**
 * Executes a shell command and logs output to the framework log file.
 * @param command The shell command to execute.
 * @returns A promise that resolves with the command's stdout.
 */
function runCmd(command: string): Promise<string> {
    logToFile(`\n> ${command}\n`);
    return new Promise((resolve, reject) => {
        exec(
            command,
            { cwd: path.resolve(__dirname, '..'), timeout: 120_000 },
            (error, stdout, stderr) => {
                if (stdout) logToFile(stdout);
                if (stderr) logToFile(stderr);
                if (error) {
                    reject(
                        new Error(
                            `Command failed: ${command}\n${stderr || stdout}`,
                        ),
                    );
                } else {
                    resolve(stdout);
                }
            },
        );
    });
}

// ---------------------------------------------------------------------------
// Security: Strict test-file path validation to prevent shell injection
// ---------------------------------------------------------------------------

const SAFE_TEST_PATH = /^[a-zA-Z0-9_\-./]+\.spec\.ts$/;

/**
 * Validates a test file path for safety and existence.
 * @param testFile The relative path to the test file.
 * @returns Validation result with either absolute path or error reason.
 */
function validateTestFilePath(
    testFile: string,
): { valid: true; absolute: string } | { valid: false; reason: string } {
    if (!SAFE_TEST_PATH.test(testFile)) {
        return {
            valid: false,
            reason: `Invalid test file path format: "${testFile}". Must match pattern: <name>.spec.ts with only alphanumeric, dash, underscore, dot, and slash characters.`,
        };
    }
    // Prevent directory traversal
    if (testFile.includes('..')) {
        return {
            valid: false,
            reason: `Path traversal detected in test file path: "${testFile}".`,
        };
    }
    const absolute = path.resolve(__dirname, '..', testFile);
    if (!fs.existsSync(absolute)) {
        return {
            valid: false,
            reason: `Test file does not exist on disk: "${testFile}".`,
        };
    }
    return { valid: true, absolute };
}

// ---------------------------------------------------------------------------
// Task Helpers
// ---------------------------------------------------------------------------

type TaskWithMeta = Task & { file: string; content: string };

/**
 * Reads all task files from the tasks/ directory and parses their front-matter.
 * @returns An array of tasks with metadata.
 */
function getAllTasks(): TaskWithMeta[] {
    const files = fs
        .readdirSync(TASKS_DIR)
        .filter((f) => f.endsWith('.md') && f !== 'template.md');

    const tasks: TaskWithMeta[] = [];
    for (const f of files) {
        try {
            const content = fs.readFileSync(path.join(TASKS_DIR, f), 'utf8');
            const parsed = fm<Task>(content);
            const attrs = parsed.attributes;

            // Simple validation: Ensure id and title exist
            if (!attrs.id || !attrs.title) {
                log(`Warning: Task file ${f} is missing required metadata (id or title). Skipping.`);
                continue;
            }

            tasks.push({
                ...attrs,
                file: f,
                content,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`Warning: Failed to parse front-matter in task file tasks/${f}: ${msg}. Skipping.`);
        }
    }
    return tasks;
}

/**
 * Finds a specific task by its ID.
 * @param taskId The task ID (e.g., T-001).
 * @returns The task object or an error message.
 */
function findTask(
    taskId: string,
): TaskWithMeta | { error: string } {
    const tasks = getAllTasks();
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return { error: `Task ${taskId} not found.` };
    return target;
}

/**
 * Formats an error response for MCP.
 * @param text Error message.
 * @returns MCP error response object.
 */
function errorResponse(text: string) {
    return { content: [{ type: 'text' as const, text }], isError: true };
}

/**
 * Formats a text response for MCP.
 * @param text The message text.
 * @returns MCP text response object.
 */
function textResponse(text: string) {
    return { content: [{ type: 'text' as const, text }] };
}

// ---------------------------------------------------------------------------
// Tool: create_task
// ---------------------------------------------------------------------------

/**
 * Tool to generate a new SPP v3 compliant task file in the tasks/ directory.
 */
server.registerTool(
    'create_task',
    {
        description: 'Generate a new SPP v3 compliant task file in the tasks/ directory. This tool ensures consistent task structure and metadata.',
        inputSchema: {
            taskId: z
                .string()
                .regex(/^T-\d{3}$/, 'Must be in the format T-### (e.g. T-012)')
                .describe('The unique task ID, e.g. T-012'),
            title: z
                .string()
                .min(1)
                .describe('Descriptive title for the task'),
            pageObject: z
                .string()
                .optional()
                .describe('The name of the target Page Object (e.g. CheckoutPage)'),
            testFile: z
                .string()
                .optional()
                .describe('The target spec file path (e.g. tests/checkout.spec.ts)'),
            url: z
                .string()
                .optional()
                .describe('The entry point URL for the test'),
            acceptanceCriteria: z
                .string()
                .optional()
                .describe('Comma-separated list of requirements'),
            dependsOn: z
                .array(z.string())
                .optional()
                .describe('Optional list of task IDs that must be DONE first'),
        },
    },
    ({ taskId, title, pageObject, testFile, url, acceptanceCriteria, dependsOn }) => {
        log(`create_task called for ${taskId}`);

        const kebabTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const filename = `${taskId}_${kebabTitle}.md`;
        const filePath = path.join(TASKS_DIR, filename);

        if (fs.existsSync(filePath)) {
            return errorResponse(`Task file already exists: ${filename}`);
        }

        const acList = acceptanceCriteria
            ? acceptanceCriteria.split(',').map(s => `- [ ] ${s.trim()}`).join('\n')
            : '- [ ] ';

        const content = `---
id: "${taskId}"
title: "${title}"
status: "TODO"
dependsOn: ${JSON.stringify(dependsOn || [])}
---

${taskId}: ${title}

## Understanding

Feature:
Expected Behavior:
Business Outcome:
Risk:

## Context

- **Page Object:** ${pageObject ? `\`pages/${pageObject.endsWith('.ts') ? pageObject : pageObject + '.ts'}\`` : ''}
- **Test File:** ${testFile ? `\`${testFile.endsWith('.spec.ts') ? testFile : testFile + '.spec.ts'}\`` : ''}
- **URL:** ${url || ''}
- **Spec:**

## Implementation Plan

1. Explore from the seed and save the plan to specs/ (link it above as **Spec:**)
2. Implement the test
3. Promote selectors into Page Objects

## Acceptance Criteria

${acList}
`;

        fs.writeFileSync(filePath, content);
        return textResponse(`Successfully created task: ${taskId} (${filename})\n\nNext Step:\nCall activate_task with taskId ${taskId}.`);
    }
);

// ---------------------------------------------------------------------------
// Tool: activate_task
// ---------------------------------------------------------------------------

/**
 * Phase 1 (Select): Transition a task from TODO to IN_PROGRESS.
 */
server.registerTool(
    'activate_task',
    {
        description: 'Phase 1 (Select): Transition a task from TODO to IN_PROGRESS. Checks dependencies before allowing activation.',
        inputSchema: {
            taskId: z
                .string()
                .regex(/^T-\d{3}$/, 'Must be in the format T-### (e.g. T-001)')
                .describe('The task ID to activate, e.g. T-001'),
        },
    },
    ({ taskId }) => {
        log(`activate_task called for ${taskId}`);

        const result = findTask(taskId);
        if ('error' in result) return errorResponse(result.error);
        const target = result;

        // Enforce dependency chain
        const allTasks = getAllTasks();
        const done = new Set(
            allTasks.filter((t) => t.status === 'DONE').map((t) => t.id),
        );
        const unmetDeps = (target.dependsOn ?? []).filter(
            (dep) => !done.has(dep),
        );

        if (unmetDeps.length > 0) {
            return errorResponse(
                `Cannot activate ${taskId}. Unmet dependencies: ${unmetDeps.join(', ')}. Those tasks must be DONE first.`,
            );
        }

        if (target.status !== 'TODO') {
            return errorResponse(
                `Task ${taskId} is currently ${target.status}. Only TODO tasks can be activated.`,
            );
        }

        setTaskStatus(
            path.join(TASKS_DIR, target.file),
            target.content,
            'IN_PROGRESS',
        );

        return textResponse(
            [
                `Task ${taskId} is now IN_PROGRESS.`,
                '',
                'Follow the Smart Playwright Protocol (SPP):',
                '1. Understand: Fill out the "Understanding" section in the task file.',
                '2. Explore: Use Playwright MCP to verify selectors.',
                '3. Plan: Draft an "Implementation Plan" in the task file.',
                '4. Implement: Write Page Objects and tests.',
                '',
                `Task file: tasks/${target.file}`,
                'Source of truth: docs/PROTOCOL.md',
                '',
                'Next Step:',
                'Begin Phase 2 (Understand) by editing the task file.'
            ].join('\n')
        );
    }
);

// ---------------------------------------------------------------------------
// Tool: verify_task
// ---------------------------------------------------------------------------

/**
 * Run automated quality gates (ESLint linting and Playwright tests) for a task.
 */
server.registerTool(
    'verify_task',
    {
        description: 'Run the SPP verification gate for a task: static checks (declared test/spec files exist, no test.fixme or test.skip in the test file), ESLint (including no raw locators in specs) and the Playwright test. If every gate passes, the task transitions to DONE. Otherwise it transitions to BLOCKED with blockReason "regression" (test.fixme found: needs a human decision) or "verification", and details are written to logs/last_run.log.',
        inputSchema: {
            taskId: z
                .string()
                .regex(/^T-\d{3}$/, 'Must be in the format T-### (e.g. T-001)')
                .describe('The task ID to verify, e.g. T-001'),
            notes: z
                .string()
                .optional()
                .describe('Optional completion notes to attach to the result'),
        },
    },
    async ({ taskId, notes }) => {
        log(`verify_task called for ${taskId}`);

        const result = findTask(taskId);
        if ('error' in result) return errorResponse(result.error);
        const target = result;
        const filePath = path.join(TASKS_DIR, target.file);

        // Re-read content fresh (task may have been modified since getAllTasks)
        const freshContent = fs.readFileSync(filePath, 'utf8');

        // Clear the log file for this verification run
        logToFile(`\n${'='.repeat(60)}\n[${taskId}] MCP verification started at ${new Date().toISOString()}\n${'='.repeat(60)}`);
        fs.writeFileSync(LOG_FILE, `--- Verification Run Started for ${taskId} ---\n`);

        try {
            // ── Gate 0: Static checks (files, fixme/skip) ─────────────
            const { testFile } = runStaticGates(freshContent, ROOT_DIR);

            // Security: validate the extracted path before passing to shell
            const validation = validateTestFilePath(testFile);
            if (!validation.valid) {
                throw new Error(
                    `Security: ${validation.reason}`,
                );
            }
            logToFile(`[${taskId}] ✓ Static gates passed`);

            // ── Gate 1: Lint ──────────────────────────────────────────
            log(`[${taskId}] Running lint...`);
            logToFile(`[${taskId}] Running lint checks...`);
            await runCmd('npm run lint');
            logToFile(`[${taskId}] ✓ Lint passed`);

            // ── Gate 2: Playwright Tests ──────────────────────────────

            log(`[${taskId}] Running tests: ${testFile}`);
            logToFile(`[${taskId}] Running Playwright tests: ${testFile}`);
            await runCmd(`npm test ${testFile}`);
            logToFile(`[${taskId}] ✓ Tests passed`);

            // ── Both gates passed: mark DONE ──────────────────────────
            setTaskStatus(filePath, freshContent, 'DONE');
            log(`[${taskId}] Verification passed → DONE`);
            logToFile(`[${taskId}] Verification PASSED. Status → DONE`);

            return textResponse(
                [
                    `Task ${taskId} passed all quality gates and is now DONE.`,
                    '',
                    'Verification Summary:',
                    '  ✓ declared files exist, no fixme/skip',
                    '  ✓ lint passed (no raw locators, focused tests or hard waits)',
                    `  ✓ tests passed (${testFile})`,
                    notes ? `\nNotes: ${notes}` : '',
                ]
                    .filter(Boolean)
                    .join('\n'),
            );
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : String(err);

            // Gate failure: mark BLOCKED with the reason
            const reason = err instanceof GateError ? err.reason : 'verification';
            setTaskStatus(filePath, freshContent, 'BLOCKED', reason);
            log(`[${taskId}] Verification failed → BLOCKED (${reason})`);
            logToFile(
                `[${taskId}] Verification FAILED. Status → BLOCKED (${reason})\nError: ${message}`,
            );

            // Read last 30 lines of the log for immediate AI feedback
            let logExcerpt = '';
            try {
                const logContent = fs.readFileSync(LOG_FILE, 'utf8');
                const logLines = logContent.split('\n');
                logExcerpt = logLines.slice(-30).join('\n');
            } catch {
                logExcerpt = 'Could not retrieve last_run.log excerpt.';
            }

            return errorResponse(
                [
                    `Error: ${message}`,
                    '',
                    `Task ${taskId} is now BLOCKED (${reason}). Verification failed.`,
                    '',
                    '--- Verification Log Excerpt (Last 30 lines) ---',
                    logExcerpt,
                    '--- End of Excerpt ---',
                    '',
                    reason === 'regression'
                        ? 'Human decision required: ask the user whether the app or the spec is wrong before removing test.fixme().'
                        : 'Diagnose the root cause from the excerpt or logs/last_run.log (the playwright-test-healer agent or `npx playwright test <file> --debug=cli` can help). Keep selectors in Page Objects. Once fixed, call verify_task again.'
                ].join('\n')
            );
        }
    }
);

// ---------------------------------------------------------------------------
// Tool: list_tasks
// ---------------------------------------------------------------------------

/**
 * Tool to list all tasks with status and summary.
 */
server.registerTool(
    'list_tasks',
    {
        description: 'List all tasks with their current status, title, and dependency information. Use this to get a full overview of the project task board.',
        inputSchema: {
            status: z
                .enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'])
                .optional()
                .describe(
                    'Optional filter: only return tasks matching this status',
                ),
        },
    },
    ({ status }) => {
        log(`list_tasks called${status ? ` (filter: ${status})` : ''}`);

        const allTasks = getAllTasks();
        const done = new Set(
            allTasks.filter((t) => t.status === 'DONE').map((t) => t.id),
        );
        const tasks = status
            ? allTasks.filter((t) => t.status === status)
            : allTasks;

        const summary = {
            TODO: allTasks.filter(t => t.status === 'TODO').length,
            IN_PROGRESS: allTasks.filter(t => t.status === 'IN_PROGRESS').length,
            BLOCKED: allTasks.filter(t => t.status === 'BLOCKED').length,
            DONE: allTasks.filter(t => t.status === 'DONE').length,
        };

        if (tasks.length === 0) {
            return textResponse(
                [
                    `Task Board Summary: TODO: ${summary.TODO} | IN_PROGRESS: ${summary.IN_PROGRESS} | BLOCKED: ${summary.BLOCKED} | DONE: ${summary.DONE}`,
                    '',
                    status ? `No tasks with status ${status}.` : 'No tasks found.'
                ].join('\n')
            );
        }

        const lines = tasks.map((t) => {
            const deps = t.dependsOn ?? [];
            const unmetDeps = deps.filter((dep) => !done.has(dep));
            const depInfo =
                deps.length === 0
                    ? ''
                    : unmetDeps.length > 0
                      ? ` | Blocked by: ${unmetDeps.join(', ')}`
                      : ` | Dependencies met`;
            const reason = t.blockReason ? ` | Reason: ${t.blockReason}` : '';
            return `[${t.id}] ${t.title} (${t.status})${reason}${depInfo}`;
        });

        return textResponse(
            [
                `Task Board Summary: TODO: ${summary.TODO} | IN_PROGRESS: ${summary.IN_PROGRESS} | BLOCKED: ${summary.BLOCKED} | DONE: ${summary.DONE}`,
                '',
                ...lines
            ].join('\n')
        );
    }
);

// ---------------------------------------------------------------------------
// Tool: get_unmet_dependencies
// ---------------------------------------------------------------------------

/**
 * Tool to list tasks with unmet dependencies.
 */
server.registerTool(
    'get_unmet_dependencies',
    {
        description: 'List tasks that cannot be activated because they are waiting on unmet dependencies. A task is in this list when one or more tasks in its dependsOn list are not yet DONE.',
        inputSchema: {},
    },
    () => {
        log('get_unmet_dependencies called');

        const tasks = getAllTasks();
        const done = new Set(
            tasks.filter((t) => t.status === 'DONE').map((t) => t.id),
        );
        const blocked = tasks.filter(
            (t) =>
                t.status !== 'DONE' &&
                (t.dependsOn ?? []).some((dep) => !done.has(dep)),
        );

        if (blocked.length === 0) {
            return textResponse('No blocked tasks.');
        }

        const text = blocked
            .map((t) => {
                const unmet = (t.dependsOn ?? []).filter(
                    (dep) => !done.has(dep),
                );
                return `[${t.id}] ${t.title} — Waiting on: ${unmet.join(', ')}`;
            })
            .join('\n');

        return textResponse(text);
    }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

/**
 * Initializes the MCP server and connects it to the stdio transport.
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log('Smart Playwright Protocol MCP server connected and ready.');
}

main().catch((err: unknown) => {
    // Protocol-safe: only stderr, never stdout
    console.error('Fatal: MCP server failed to start:', err);
    process.exit(1);
});
