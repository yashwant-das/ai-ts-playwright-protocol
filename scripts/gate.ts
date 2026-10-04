import * as fs from 'fs';
import * as path from 'path';
import { BlockReason } from '../types/task';

/**
 * Shared SPP verification-gate checks used by the task CLI (scripts/task.ts)
 * and the lifecycle MCP server (mcp/server.ts).
 */

/** A gate failure that carries the block reason to record on the task. */
export class GateError extends Error {
    /**
     * Creates a gate failure.
     * @param message Human- and agent-readable failure description.
     * @param reason Block reason written to the task front-matter.
     */
    constructor(message: string, public readonly reason: BlockReason) {
        super(message);
        this.name = 'GateError';
    }
}

/** Files a task declares in its Context section. */
export interface TaskFiles {
    testFile: string;
    specFile?: string;
}

const TEST_FILE_LINE = /- \*\*Test File:\*\* `(.*)`/;
const SPEC_FILE_LINE = /- \*\*Spec:\*\* `(.*)`/;
const FIXME_CALL = /\b(test|describe)(\.describe)?\.fixme\s*\(/;
const SKIP_CALL = /\b(test|describe)(\.describe)?\.skip\s*\(/;

/**
 * Extracts the declared test file and optional spec file from a task body.
 * @param taskContent Raw task markdown.
 * @returns The declared files, or null when no test file is declared.
 */
export function getTaskFiles(taskContent: string): TaskFiles | null {
    const testMatch = TEST_FILE_LINE.exec(taskContent);
    if (!testMatch) return null;
    const specMatch = SPEC_FILE_LINE.exec(taskContent);
    return { testFile: testMatch[1], specFile: specMatch?.[1] };
}

/**
 * Runs the static gates that need no browser: declared files exist, and the
 * task's test file has no fixme (regression) or skip (verification) markers.
 * @param taskContent Raw task markdown.
 * @param root Repository root used to resolve declared paths.
 * @returns The declared files when every static gate passes.
 */
export function runStaticGates(taskContent: string, root: string): TaskFiles {
    const files = getTaskFiles(taskContent);
    if (!files) {
        throw new GateError(
            'Task does not declare a test file. Expected a line like: - **Test File:** `tests/example.spec.ts`',
            'verification',
        );
    }

    if (files.specFile && !fs.existsSync(path.resolve(root, files.specFile))) {
        throw new GateError(`Declared spec does not exist: ${files.specFile}`, 'verification');
    }

    const testPath = path.resolve(root, files.testFile);
    if (!fs.existsSync(testPath)) {
        throw new GateError(`Declared test file does not exist: ${files.testFile}`, 'verification');
    }

    const source = fs.readFileSync(testPath, 'utf8');
    if (FIXME_CALL.test(source)) {
        throw new GateError(
            `${files.testFile} contains test.fixme(). The app appears to contradict the test or spec. ` +
            'A human must decide: if the app is wrong, report the regression and keep the task BLOCKED; ' +
            'if the change is intended, update the spec and test, remove fixme, and re-verify.',
            'regression',
        );
    }
    if (SKIP_CALL.test(source)) {
        throw new GateError(
            `${files.testFile} contains test.skip(). A task cannot reach DONE with skipped tests.`,
            'verification',
        );
    }

    return files;
}

/**
 * Writes a new status (and, for BLOCKED, a block reason) into a task file's
 * front-matter. Any previous block reason is cleared.
 * @param filePath Path to the task markdown file.
 * @param fullContent The current raw content of the file.
 * @param newStatus The new status to set.
 * @param blockReason Reason recorded when newStatus is BLOCKED.
 */
export function setTaskStatus(
    filePath: string,
    fullContent: string,
    newStatus: string,
    blockReason?: BlockReason,
): void {
    let updated = fullContent
        .replace(/^status: .*$/m, `status: "${newStatus}"`)
        .replace(/^blockReason: .*\r?\n/m, '');
    if (newStatus === 'BLOCKED' && blockReason) {
        updated = updated.replace(/^(status: .*)$/m, `$1\nblockReason: "${blockReason}"`);
    }
    if (newStatus === 'DONE') {
        updated = updated.replace(/- \[ \]/g, '- [x]');
    }
    fs.writeFileSync(filePath, updated);
}
