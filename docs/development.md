# Development guide

Setup and operating reference for the interactive terminal CLI, Playwright agents and skills, and MCP integrations. The CLI is implemented in TypeScript in `scripts/task.ts`.

> [!NOTE]
> For first-time setup and onboarding, start with [README.md](../README.md). For the architectural source of truth (workflow, states, rules), see [protocol.md](protocol.md).

## Setup

Run all commands from the repository root. Use the Node 24 patch in `.nvmrc` and
its supported npm toolchain. Install from the committed lockfile:

```bash
nvm install
nvm use
npm ci
npx playwright install chromium
cp .env.example .env
```

`npm ci` installs Husky through the prepare lifecycle. `npm exec husky` reinstalls
hooks if needed. Keep local credentials in ignored `.env` files.

## Configuration

| Setting | Default | Scope |
| --- | --- | --- |
| `BASE_URL` | `https://www.saucedemo.com` | Live suite, loaded from `.env`; existing shell values take precedence |
| `PLAYWRIGHT_TIMEOUT` | 45000 ms | Live test timeout, positive integer milliseconds |
| `CI` | Unset locally | Live suite forbids focus, uses one worker and two retries when set |
| Smoke target | `http://127.0.0.1:4173` | Fixed controlled fixture; does not read `.env` |

Smoke and live configs write ignored reports/results. Task commands can change task state; use maintenance checks to verify the repository without activating or completing task records.

## Quality checks

```bash
npm run check                # offline checks and unit tests
npm run test:smoke           # controlled Chromium tests, no public-site requests
npx playwright test --list   # discover eight live tests, no browser execution
npm test                    # live Sauce Demo suite
npx lint-staged --diff HEAD  # checks changes against HEAD; does not make a commit
```

`npm run check` runs code/Markdown lint, formatter checks, TypeScript, config/text
validation, selector health and unit tests. Use `npm run format` to format locally,
review the diff and restage intended changes. Markdown uses markdownlint-cli2 with
default rules except line length; generated agents/skills and planner output are
excluded. Those files must be regenerated rather than hand-edited.

Husky runs lint-staged against staged files only, hiding tracked unstaged changes
while tools run and restoring them afterward. ESLint, Prettier, Markdown,
selector and config/text checks use the same locked versions as CI. Partial-file
staging is preserved; no checks fall back to unstaged changes. JSON is strict;
JSONC permits comments/trailing commas; YAML rejects malformed or duplicate keys.
Markdown two-space hard breaks are preserved. Failed hooks block commits.

The `Quality and unit tests` job runs all maintained-file checks and live test
collection. `Controlled Chromium smoke` runs two browser checks against a local
fixture server: login through the existing logged-in fixture and denied-login
error dismissal through the existing LoginPage. Browser requests outside the
loopback origin fail. This validates SPP fixture/Page Object wiring, not the
public application's implementation. Live tests require network access to the
configured application and must be run separately for integration changes.
Failure artifacts are retained for three days. Locally, the live suite retries failures once; with `CI` set, it retries twice and uses one worker. It captures a trace on the first retry, screenshots on failure and video retained on failure. Controlled smoke has no retries and retains failure traces. Open `playwright-report/` for live results or `playwright-report/smoke/` for controlled results.

To add behavior, keep offline gate tests in `tests/unit/`, controlled browser
checks in `tests/smoke/` and live specs directly under `tests/`. The live config
excludes the other suites; the smoke config only discovers its own specs. Keep
selectors in Page Objects and import browser fixtures from `tests/fixtures.ts`.

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run task` | Open the interactive task menu. |
| `npm run task create` | Launch the task creation wizard. |
| `npm run task next` | Activate or resume the next eligible task. |
| `npm run task status` | Show project task summary and board. |
| `npm run task blocked` | List all tasks currently in BLOCKED state. |
| `npm run task <TASK_ID>` | Activate, verify, or re-verify one specific task. |
| `npm run task help` | Print the command list. |
| `npm run agents` | Regenerate Playwright Test Agents and skills for every supported assistant (run after each Playwright upgrade). |
| `npm run agents -- <loop...>` | Regenerate for specific assistants only: `claude`, `vscode`, `codex`, `opencode`. |

## Interactive Menu

Run `npm run task`, use ↑/↓ to select an action, then press Enter:

| Action | Behavior |
| :--- | :--- |
| `Create a new task` | Launches the interactive wizard to generate a new task file. |
| `Activate or resume next task` | Resumes the first `IN_PROGRESS` task, then retries the first `BLOCKED` task, then selects a dependency-ready `TODO` task. Tasks are considered in filename order. |
| `Verify current active task` | Runs verification for the current active task. Copies a repair prompt if verification fails. |
| `Show task board` | Prints status counts and one row per task (ID, status, title, block reason). |
| `Show blocked tasks` | Lists tasks currently marked `BLOCKED` with reasons. |

## Interactive and Non-Interactive Output

The CLI adapts to where it runs:

| | In a terminal | Piped output, CI, AI assistants |
| :--- | :--- | :--- |
| Progress | Spinner per gate step, replaced in place by its result | One result line per step (no spinner frames) |
| `npm run task` | Interactive menu | Prints the command list |
| Verification passed | Asks to mark the task `DONE` | Marks it `DONE` (the gate is the authority) |
| Parking an active task | Asks for confirmation | Refuses; finish or park the task in a terminal |
| `npm run task create` | Wizard | Refuses; copy `tasks/template.md` or use the MCP `create_task` tool |

Every gate step reports its duration, the test step reports Playwright's counts (for example `2 passed`), and a failure prints the lint errors (`file:line  message  rule`) or the failing tests with their first error, followed by the path to the full log.

Exit codes: `0` on success, `1` when verification fails, the task is not found, or a command refuses to run. Use `npm run -s task ...` to hide npm's own banner.

## Task Creation Wizard

Choose **Create a new task** in the menu or run `npm run task create`. Invalid IDs and empty titles keep the prompt open with a validation message; cancelling exits without creating a task. The wizard collects:

- **Task ID**: Must follow `T-###` (for example, `T-011`).
- **Title**: Descriptive name for the task.
- **Page Object**: (Optional) The target Page Object name.
- **Test File**: (Optional) The target spec file path.
- **URL**: (Optional) The starting URL.
- **Acceptance Criteria**: (Optional) Comma-separated list of requirements.

The wizard generates an SPP v3 Markdown file in `tasks/`, including an empty `- **Spec:**` line to link the test plan once it exists.

## AI Handoff Prompts

When a task is activated or verification fails, the runner generates a prompt for the AI assistant. It copies the prompt when the system clipboard is available and always prints it for manual copying.

### Activation Prompt

Generated when a task moves to `IN_PROGRESS`. Includes the task file path and the SPP phases, with the Playwright tool to use for each (CLI or planner for Explore/Plan, generator for Implement, then Promote and Verify).

Activation excerpt for a TODO task:

```text
❯ npm run task T-005
┌   SPP  Smart Playwright Protocol v3.0.0
│
●  T-005 Verify Footer Social Links TODO · activate
│
◆  T-005 TODO → IN PROGRESS
│
●  Handoff prompt · copied to clipboard ✓

Read docs/protocol.md

Task: T-005 Verify Footer Social Links
Task file: tasks/T-005_Footer.md
```

The prompt continues with the protocol steps and `npm run task T-005` as the verification command. Clipboard failure leaves the complete prompt available in terminal output.

### Repair Prompt

Generated when verification fails and the task moves to `BLOCKED`.

- `verification`: points the agent to `logs/last_run.log` and the recovery tools (healer agent, `--debug=cli`, trace CLI) and asks for the smallest possible fix.
- `regression`: the test contains `test.fixme()`. The prompt asks the agent to stop and get a human decision before changing anything.

## Task Board & Status

`npm run task status` provides a summary of the current project state:

- **Summary Counts:** Total tasks by state (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`).
- **Task Rows:** All parsed tasks in filename order, including block reasons and an active-task marker.
- **Next Action:** A suggested command based on active work, blocked work and dependency-ready TODO tasks.

## Verification & Logs

The runner verifies `IN_PROGRESS` and `BLOCKED` tasks and can re-verify `DONE` tasks. A `TODO` task is activated first.

Run `npm run task <TASK_ID>` (for example, `npm run task T-011`). The gate runs, in order:

1. **Static checks**: the declared `Test File` exists; the declared `Spec` (if any) exists; the test file has no `test.fixme()` (→ `BLOCKED`, `regression`) or `test.skip()` (→ `BLOCKED`, `verification`).
2. `npm run lint`: ESLint, including the rule that rejects `page.getBy*()`, `page.locator()` and selector-string page actions in `.spec.ts` files, plus markdownlint.
3. `npm test <declared-test-file>`.

Review acceptance criteria before verification: a DONE status write checks off their boxes automatically. See the [protocol gate boundaries](protocol.md#phase-7--verify) for the distinction between automated checks and review obligations.

The block reason is written to the task's front-matter.

### Protocol Enforcement

When a different task is already `IN_PROGRESS`, activating a TODO task asks whether to park the active task back in TODO. Piped/CI execution refuses that switch. Finish the active task or make the parking decision in a terminal.

### Logs

The runner writes command output to:

```text
logs/last_run.log
```

The log includes stdout, stderr, lint failures, and Playwright failures. **Always read this file when a task becomes `BLOCKED`.**

## Playwright Agent Tooling

The Playwright CLI, trace tools and agent/skill sources come from the locked `@playwright/test` package. Regenerate the committed definitions and skills after an upgrade to keep them aligned with that package. The SPP lifecycle MCP server is implemented in this repository. No global Playwright install is required.

### Agent CLI (recommended for exploration)

```bash
npx playwright cli open https://www.saucedemo.com   # standalone session
npx playwright cli snapshot                          # element refs (e1, e2, ...)
npx playwright cli generate-locator e5               # ARIA-first locator for a Page Object
npx playwright cli show                              # dashboard of running sessions
```

To start from the app state a test sets up (login, fixtures), attach to a paused test instead:

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli   # background
npx playwright cli attach tw-XXXX
```

`.playwright/cli.config.json` makes the CLI use Playwright's bundled Chromium (the CLI otherwise defaults to Google Chrome, which `npx playwright install` does not install) and sets `testIdAttribute` to `data-test` so CLI-generated locators match `playwright.config.ts`. CLI snapshots are written to `.playwright-cli/` (git-ignored).

### Agent Skills

Committed in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, OpenCode, Copilot and other assistants that read the shared location):

- `playwright-cli`: browser automation, test debugging, and the plan / generate / heal workflow driven by the CLI.
- `playwright-trace`: inspect trace files with `npx playwright trace`.

Assistants without skill support can learn the CLI from `npx playwright cli --help`.

### Test Agents (planner, generator, healer)

Generated by `npx playwright init-agents` and committed for each supported assistant:

| Assistant | Agent definitions | MCP configuration |
| --- | --- | --- |
| Claude Code | `.claude/agents/` | `.mcp.json` |
| VS Code / GitHub Copilot | `.github/agents/` | `.vscode/mcp.json`; Copilot coding agent setup in `.github/workflows/copilot-setup-steps.yml` |
| Codex | `.codex/agents/` | Add the server to your Codex config (below) |
| OpenCode | `.opencode/prompts/` | `opencode.json` |

All of them use the Playwright Test MCP server: `npx playwright run-test-mcp-server`.

- **VS Code** needs v1.105 or later for the agentic experience.
- **GitHub Copilot coding agent:** add the MCP server under the repository's **Settings → Copilot → Coding agent → MCP configuration**:

  ```json
  {
    "mcpServers": {
      "playwright-test": {
        "type": "stdio",
        "command": "npx",
        "args": ["playwright", "run-test-mcp-server"],
        "tools": ["*"]
      }
    }
  }
  ```

- **Codex:** add to your Codex `config.toml`:

  ```toml
  [mcp_servers.playwright-test]
  command = "npx"
  args = ["playwright", "run-test-mcp-server"]
  ```

#### Regenerating after a Playwright upgrade

```bash
# Replace VERSION with the reviewed stable version.
npm install -D @playwright/test@VERSION
npm run agents
npm run format
npm run check
npm run test:smoke
npm test
```

`npm run agents` overwrites the generated definitions, `.mcp.json` and `opencode.json`. It keeps `tests/seed.spec.ts`, `specs/README.md` and the SPP-customized `.github/workflows/copilot-setup-steps.yml`, and removes the component-testing skill (not used by this suite). Do not hand-edit generated files; SPP rules are enforced by the verification gate.

### Playwright MCP (optional)

Still supported for browser exploration in assistants that prefer MCP. Use the version bundled with Playwright:

```json
"playwright": {
  "command": "npx",
  "args": ["playwright", "mcp"]
}
```

### SPP Lifecycle MCP (optional)

Exposes `create_task`, `activate_task`, `verify_task`, `list_tasks` and `get_unmet_dependencies` as MCP tools. Verification uses the shared gate checks also used by the CLI.

```json
"spp-protocol": {
  "command": "npx",
  "args": ["tsx", "/absolute/path/to/repo/mcp/server.ts"],
  "env": {
    "NODE_OPTIONS": "--disable-warning=DEP0205"
  }
}
```

Replace `/absolute/path/to/repo/` with the actual path to your cloned repository. Add it next to the generated `playwright-test` server in your assistant's user-level MCP configuration; project files such as `.mcp.json` are overwritten by `npm run agents`.

## Troubleshooting

### `Task <ID> not found`

Check that the task file is in `tasks/` and its filename starts with the task ID (e.g., `T-011_...md`).

### `Task does not declare a test file`

Ensure the task body includes exactly one line like this:
`- **Test File:** \`tests/example.spec.ts\``

### `No raw locators in specs`

Lint found a selector in a `.spec.ts` file, usually in a generator draft. Move it into a Page Object and call the Page Object from the spec (the Promote phase in [protocol.md](protocol.md)).

### Task blocked with `regression`

The test contains `test.fixme()`. Decide whether the app or the spec is wrong, then either report the bug or update the spec and test and remove `test.fixme()`.

### Agents are missing or out of date

Run `npm run agents`. Definitions must match the installed Playwright version.

### MCP Server Does Not Start

Test the **SPP Lifecycle MCP** server manually:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | npm run mcp
```

## Related Files

| File | Purpose |
| :--- | :--- |
| [../README.md](../README.md) | Onboarding and quick start. |
| [protocol.md](protocol.md) | **Architectural source of truth**: workflow, states, and rules. |
| [roadmap.md](roadmap.md) | Future enhancements and planned improvements. |
| [../AGENTS.md](../AGENTS.md) | Lightweight instructions for AI assistants. |
| [../scripts/task.ts](../scripts/task.ts) | Task runner implementation. |
| [../scripts/gate.ts](../scripts/gate.ts) | Shared verification-gate checks. |
| [../scripts/agents.ts](../scripts/agents.ts) | Regenerates Playwright agents and skills. |
| [../mcp/server.ts](../mcp/server.ts) | Custom protocol lifecycle MCP server. |

## Standards adoption

Profile: `complete`. Pinned standards:
[`a429dd2f2da55a4c3e1c73c7c0d1111f9cd0b9a9`](https://github.com/yashwant-das/repo-standards/tree/a429dd2f2da55a4c3e1c73c7c0d1111f9cd0b9a9).
The [protocol guide](protocol.md) is the architecture guide, using the explicit
protocol alternative in the adoption matrix. Maintained guides use lowercase
names; generated Playwright files and plans remain generator-owned.

### Dependency compatibility review

Registry metadata was reviewed on 2026-10-28. The supported runtime remains Node
24, tested at 24.22.1; engines intentionally exclude unverified future majors.
Playwright 1.64.1 and its matching Chromium build passed the existing eight live
tests and the two controlled tests. Its generated agents/skills were refreshed
with `npm run agents`, preserving the customized Copilot workflow.

TypeScript 7 was excluded at adoption because typescript-eslint 8.72.1 declares
`>=4.8.4 <6.1.0` compatibility. The lockfile uses TypeScript 6.0.3;
owner: Yashwant Das; review when the parser supports TypeScript 7. ESLint 10 and
JSDoc 65 satisfy their declared peers and pass the maintained code checks.
NodeNext resolution supports current ESM dependency interop from the existing
CommonJS application; ES2023 matches APIs available in Node 24. The existing
ts-node task entrypoint and CLI help were verified without task-state changes.

Compatible audit fixes removed the high/critical findings. npm audit still
reports four low-severity entries in one transitive chain:
markdownlint-cli2 → markdownlint → micromark-extension-math → KaTeX
([GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)).
At that review, markdownlint-cli2 0.24.0 still resolved the affected dependency.
The reported automatic fix downgrades the Markdown tool to 0.16.0; it was not
applied. The dependency is a local/CI development tool, not a hosted application.
Treat this as an unresolved dependency review, not an approved exception or a
claim of safety. Owner: Yashwant Das; review on an upstream fixed dependency
release or before processing untrusted math content. A cross-major override
requires compatibility review rather than a forced audit fix.

### Verification evidence

Local checks on 2026-10-28 under Node 24.22.1:

| Check | Evidence |
| --- | --- |
| Offline quality | ESLint, markdownlint-cli2, Prettier, TypeScript, config/text and selector checks pass |
| Unit behavior | 16 tests pass: declared files/plans, gate reasons, state persistence, text/config rejection and hard-wait rejection outside specs |
| Controlled Chromium | 2 tests pass; local fixture, external request guard and existing Page Objects/fixtures |
| Live Sauce Demo | 8 tests pass; no skipped tests; this is separate from controlled CI evidence |
| Actual commit hooks | 18 disposable-repository probes pass, including invalid inputs, hard waits, filenames with spaces, deletions, generated-plan exclusion, unrelated unstaged Markdown/config and partial Markdown/TypeScript preservation |

Clean `npm ci` in a disposable checkout passed the offline checks, both controlled tests, all eight live tests and CLI help under Node 24.22.1. MCP initialization, discovery of five tools and read-only `list_tasks` also passed. Mermaid diagrams and maintained local links are checked after documentation changes.

Interactive terminal review confirmed all five menu choices, the status board and blocked-task guidance, invalid-ID validation and cancellation without task creation.

Selector dates older than 90 days remain advisory warnings; this adoption does
not rewrite metadata to imply a new manual locator review. Hosted CI is separate
from local evidence and must pass on the PR revision before merge.

### Repository settings requiring owner review

Audit snapshot: 2026-10-28. The repository is public. The active `default-branch-protection` ruleset prevents
deletion and non-fast-forward updates only. The legacy branch-protection endpoint
returns 404, and the ruleset has no required checks. Proposed required checks:
`Quality and unit tests` and `Controlled Chromium smoke`. Workflow presence alone
does not enforce them for merging.

The repository API reports secret scanning, push protection and Dependabot
security updates disabled. The code-scanning endpoint returned 404 (`no analysis
found`), with a scope notice; no enabled scanning or alert-free claim is made.
Propose enabling supported secret/code scanning and security updates after owner
review. No repository/account settings were changed by this adoption.

Repository description/topics also require owner review against the metadata
standard: a description of at most 110 characters and at most eight topics in
category/language/tool order. No public metadata was changed.
