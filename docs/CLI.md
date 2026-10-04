# Smart Playwright Protocol CLI

`scripts/task.ts` is the local CLI that moves Markdown task files through the framework lifecycle. Use this document when you need exact command behavior, board usage, and configuration.

> [!NOTE]
> For first-time setup and onboarding, start with [README.md](../README.md). For the architectural source of truth (workflow, states, rules), see [PROTOCOL.md](PROTOCOL.md).

## Commands

| Command | Purpose |
| :--- | :--- |
| `npm run task` | Open the interactive task menu. |
| `npm run task create` | Launch the task creation wizard. |
| `npm run task next` | Activate or resume the next eligible task. |
| `npm run task status` | Show project task summary and board. |
| `npm run task blocked` | List all tasks currently in BLOCKED state. |
| `npm run task <TASK_ID>` | Activate, verify, or re-verify one specific task. |
| `npm run agents` | Regenerate Playwright Test Agents and skills for every supported assistant (run after each Playwright upgrade). |
| `npm run agents -- <loop...>` | Regenerate for specific assistants only: `claude`, `vscode`, `codex`, `opencode`. |

## Interactive Menu

Run:

```bash
npm run task
```

Available menu actions:

| Action | Behavior |
| :--- | :--- |
| `Create a new task` | Launches the interactive wizard to generate a new task file. |
| `Activate or resume next task` | Selects the current active task first, then the next dependency-ready `TODO` task. Copies the AI handoff prompt to the clipboard. |
| `Verify current active task` | Runs verification for the current active task. Copies a repair prompt if verification fails. |
| `Show task board` | Prints task summary, active task, and recent tasks. |
| `Show blocked tasks` | Lists tasks currently marked `BLOCKED` with reasons. |

## Task Creation Wizard

Run `npm run task create` to start the interactive task generator. It prompts for:

- **Task ID**: Must follow `T-###`.
- **Title**: Descriptive name for the task.
- **Page Object**: (Optional) The target Page Object name.
- **Test File**: (Optional) The target spec file path.
- **URL**: (Optional) The starting URL.
- **Acceptance Criteria**: (Optional) Comma-separated list of requirements.

The wizard generates an SPP v3 Markdown file in `tasks/`, including an empty `- **Spec:**` line to link the test plan once it exists.

## AI Handoff Prompts

When a task is activated or blocked, the runner generates a concise prompt for the AI assistant and **automatically copies it to your clipboard**.

### Activation Prompt

Generated when a task moves to `IN_PROGRESS`. Includes the task file path and the SPP phases, with the Playwright tool to use for each (CLI or planner for Explore/Plan, generator for Implement, then Promote and Verify).

### Repair Prompt

Generated when verification fails and the task moves to `BLOCKED`.

- `verification`: points the agent to `logs/last_run.log` and the recovery tools (healer agent, `--debug=cli`, trace CLI) and asks for the smallest possible fix.
- `regression`: the test contains `test.fixme()`. The prompt asks the agent to stop and get a human decision before changing anything.

> [!TIP]
> After activating a task or seeing a failure, simply switch to your AI assistant's chat and paste (Ctrl+V/Cmd+V) to provide all necessary context.

## Task Board & Status

`npm run task status` provides a summary of the current project state:

- **Summary Counts:** Total tasks by state (`TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`).
- **Current Task:** The task currently being worked on.
- **Recent Tasks:** A list of the most recently modified tasks.

## Verification & Logs

The runner executes quality gates for `IN_PROGRESS` and `BLOCKED` tasks.

### Command

```bash
npm run task <TASK_ID>
```

Example:

```bash
npm run task T-011
```

The gate runs, in order:

1. **Static checks**: the declared `Test File` exists; the declared `Spec` (if any) exists; the test file has no `test.fixme()` (→ `BLOCKED`, `regression`) or `test.skip()` (→ `BLOCKED`, `verification`).
2. `npm run lint`: ESLint, including the rule that rejects `page.getBy*()`, `page.locator()` and selector-string page actions in `.spec.ts` files, plus markdownlint.
3. `npm test <declared-test-file>`.

The block reason is written to the task's front-matter.

### Protocol Enforcement

If you attempt to activate a new `TODO` task while another task is currently `IN_PROGRESS`, the CLI will detect a protocol violation. To prioritize developer experience while maintaining the SPP "one-task-at-a-time" rule, the CLI will interactively ask if you want to **park** the current active task (safely reverting it to `TODO`) before promoting your new urgent task.

### Logs

The runner writes command output to:

```text
logs/last_run.log
```

The log includes stdout, stderr, lint failures, and Playwright failures. **Always read this file when a task becomes `BLOCKED`.**

## Playwright Agent Tooling

Everything below ships with `@playwright/test` (1.63.0), so it always matches the installed version. No global installs are required.

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

`.playwright/cli.config.json` sets `testIdAttribute` to `data-test` so CLI-generated locators match `playwright.config.ts`. CLI snapshots are written to `.playwright-cli/` (git-ignored).

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
npm install -D @playwright/test@<version>
npm run agents
npm run lint
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

Exposes task creation, activation and verification (the same gate as the CLI) as MCP tools.

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

Lint found a selector in a `.spec.ts` file, usually in a generator draft. Move it into a Page Object and call the Page Object from the spec (the Promote phase in [PROTOCOL.md](PROTOCOL.md)).

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
| [PROTOCOL.md](PROTOCOL.md) | **Architectural source of truth**: workflow, states, and rules. |
| [ROADMAP.md](ROADMAP.md) | Future enhancements and planned improvements. |
| [../AGENTS.md](../AGENTS.md) | Lightweight instructions for AI assistants. |
| [../scripts/task.ts](../scripts/task.ts) | Task runner implementation. |
| [../scripts/gate.ts](../scripts/gate.ts) | Shared verification-gate checks. |
| [../scripts/agents.ts](../scripts/agents.ts) | Regenerates Playwright agents and skills. |
| [../mcp/server.ts](../mcp/server.ts) | Custom protocol lifecycle MCP server. |
