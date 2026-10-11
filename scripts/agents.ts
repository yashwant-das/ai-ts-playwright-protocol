import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import pc from 'picocolors';

/**
 * Regenerates the Playwright Test Agent definitions and agent skills for every
 * supported assistant. Run after each Playwright upgrade (`npm run agents`), or
 * pass loop names to limit the run (`npm run agents -- claude codex`).
 */

const ROOT = path.resolve(__dirname, '..');

/** Agentic loops whose agent definitions are committed to the repository. */
const AGENT_LOOPS = ['claude', 'vscode', 'codex', 'opencode'];

/** Skill install targets: `.claude/skills` and the shared `.agents/skills`. */
const SKILL_LOOPS = ['claude', 'agents'];

/** Generated skills that do not apply to this end-to-end suite. */
const UNUSED_SKILLS = ['playwright-component-testing'];

/** Files the generator overwrites but SPP customizes; restored after each run. */
const PRESERVED_FILES = ['.github/workflows/copilot-setup-steps.yml'];

/**
 * Runs a Playwright CLI command from the repository root.
 * @param args Arguments passed to `npx playwright`.
 */
function playwright(args: string[]): void {
    console.log(pc.dim(`> npx playwright ${args.join(' ')}`));
    execFileSync('npx', ['playwright', ...args], { cwd: ROOT, stdio: 'inherit' });
}

/**
 * Snapshots the files that must survive regeneration.
 * @returns A map of relative path to file content for files that exist.
 */
function snapshotPreserved(): Map<string, string> {
    const saved = new Map<string, string>();
    for (const rel of PRESERVED_FILES) {
        const abs = path.join(ROOT, rel);
        if (fs.existsSync(abs)) saved.set(rel, fs.readFileSync(abs, 'utf8'));
    }
    return saved;
}

/**
 * Entry point. Regenerates agents and skills for the requested loops.
 */
function main(): void {
    const requested = process.argv.slice(2);
    const unknown = requested.filter(l => !AGENT_LOOPS.includes(l));
    if (unknown.length > 0) {
        console.error(pc.red(`Unknown loop(s): ${unknown.join(', ')}. Supported: ${AGENT_LOOPS.join(', ')}`));
        process.exit(1);
    }
    const loops = requested.length > 0 ? requested : AGENT_LOOPS;

    const saved = snapshotPreserved();

    for (const loop of loops) {
        playwright(['init-agents', `--loop=${loop}`]);
    }

    // Claude Code reads .claude/skills; Codex, OpenCode and Copilot read .agents/skills.
    const skillLoops = loops.includes('claude') ? SKILL_LOOPS : SKILL_LOOPS.filter(l => l !== 'claude');
    for (const loop of skillLoops) {
        playwright(['init-skills', `--loop=${loop}`]);
        for (const skill of UNUSED_SKILLS) {
            fs.rmSync(path.join(ROOT, `.${loop}`, 'skills', skill), { recursive: true, force: true });
        }
    }

    for (const [rel, content] of saved) {
        fs.writeFileSync(path.join(ROOT, rel), content);
        console.log(pc.dim(`Restored SPP-customized ${rel}`));
    }

    console.log(pc.green(`\nRegenerated Playwright agents for: ${loops.join(', ')}`));
    console.log('Review the diff, then run `npm run lint` before committing.');
}

main();
