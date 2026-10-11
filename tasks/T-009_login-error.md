---
id: "T-009"
title: "Verify Locked Out User"
status: "DONE"
dependsOn: []
---

T-009: Verify Locked Out User

## Understanding

Feature: User Authentication
Expected Behavior: Locked-out users receive a specific error message and are denied access.
Business Outcome: Prevents unauthorized access while informing the user of their account status.
Risk: Allowing locked-out users compromises security.

## Context

- **Page Object:** `pages/LoginPage.ts`
- **Test File:** `tests/login_error.spec.ts`
- **URL:** `/`
- **Spec:** `specs/T-009_login-error.plan.md`

## Implementation Plan

1. Use existing `LoginPage`.
2. Attempt login with `locked_out_user`.
3. Verify the specific error message appearance.

## Acceptance Criteria

- [x] Attempt login with locked_out_user.
- [x] Verify error: "Epic sadface: Sorry, this user has been locked out."
