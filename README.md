# Smart Playwright Protocol (SPP)

[![SPP](https://img.shields.io/badge/-SPP_v2.1.1-%232EAD33?style=for-the-badge)](https://github.com/yashwant-das/ai-ts-playwright-protocol)
[![Release](https://img.shields.io/badge/-Release_v2.1.1-%23007ACC?style=for-the-badge)](https://github.com/yashwant-das/ai-ts-playwright-protocol/releases/tag/v2.1.1)
[![Playwright](https://img.shields.io/badge/-playwright-%232EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![ESLint](https://img.shields.io/badge/ESLint-4B3263?style=for-the-badge&logo=eslint&logoColor=white)](https://eslint.org)
[![NodeJS](https://img.shields.io/badge/node.js-6DA55F.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

## Smart Playwright Protocol (SPP) v2.1.1

AI-assisted Playwright automation using a structured, protocol-driven workflow. This framework keeps human-AI collaboration explicit, reviewable, and repeatable.

## Protocol Workflow

The framework enforces a single, disciplined workflow for all automation tasks:

```text
Select
  ↓
Understand
  ↓
Explore
  ↓
Plan
  ↓
Implement
  ↓
Verify
  ├─ PASS → DONE
  └─ FAIL → BLOCKED → Recover → Verify
```

## Quick Start

Get started and complete your first task in minutes.

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
npx playwright install
```

### 2. Environment Configuration

Copy the example environment file and update it with your application's settings:

```bash
cp .env.example .env
```

The `BASE_URL` in `.env` will be used as the target for all tests.

### 3. Configure MCP Servers (Recommended)

This framework supports MCP servers to let AI agents explore the browser and manage tasks. While not mandatory, they significantly improve the AI implementation experience.
**See [docs/CLI.md](docs/CLI.md#configure-mcp-servers) for setup instructions.**

### 4. Create Your First Task

Launch the interactive wizard to generate a new task file:

```bash
npm run task create
```

### 5. Activate the Task

Select and move the task to `IN_PROGRESS`. This automatically copies an AI handoff prompt to your clipboard:

```bash
npm run task next
```

### 6. Hand Off to AI

Paste the copied prompt into your AI assistant. The assistant will:

- Read [docs/PROTOCOL.md](docs/PROTOCOL.md).
- Follow the SPP workflow.
- Implement Page Objects and tests.

### 7. Verify Completion

Once the AI finishes, run the verification gate:

```bash
npm run task T-001
```

## Documentation

| File | Purpose |
| :--- | :--- |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | **Architectural source of truth**: workflow, states, and rules. |
| [docs/CLI.md](docs/CLI.md) | **Command reference**: tools, menu, board, and troubleshooting. |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Future enhancements and planned improvements. |
| [AGENTS.md](AGENTS.md) | Lightweight instructions for AI assistants. |
