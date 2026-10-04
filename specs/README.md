# Specs

Test plans written by the Playwright **planner** agent (or by hand) during the SPP **Plan** phase.

- Name each plan after its task: `specs/T-011_checkout-tax.plan.md`.
- Link it from the task file: `- **Spec:** \`specs/T-011_checkout-tax.plan.md\``.
- Each `- expect:` bullet should map to an Acceptance Criterion in the task.
- Start scenarios from `tests/seed.spec.ts` (logged in) or `tests/seed.guest.spec.ts` (logged out).

See [docs/PROTOCOL.md](../docs/PROTOCOL.md) for how plans move through Implement, Promote and Verify.
