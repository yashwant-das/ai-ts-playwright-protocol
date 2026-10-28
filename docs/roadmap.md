# Roadmap

Pending work for the file-backed SPP workflow. Current capabilities and runtime/CI settings are documented in the [README](../README.md) and [development guide](development.md). Completed v2.1/v3.0 rollout entries have been removed from this working backlog; their original descriptions remain in Git history.

## Backlog

| Priority | Work | Intended outcome |
| --- | --- | --- |
| Medium | Migrate existing specs to fixtures | Replace repeated login setup and direct Page Object construction in older specs with the shared `loggedInPage` and Page Object fixtures |
| Low | Spec-to-tasks import | Optionally create one task per scenario group from a planner-produced spec |
| Low | Configurable quality gates | Let teams configure selected checks while retaining the current defaults |
| Low | Priority-aware task selection | Add optional priorities while preserving simple next-task selection by default |

## Non-Goals

- Custom agent frameworks; use Playwright's agents and skills
- Agents marking tasks complete without verification
- Parallel or distributed task execution
- Database-backed storage or cloud task management
- Vector databases or AI memory systems

Keep additions focused on task usability, verification and maintainable tests.
