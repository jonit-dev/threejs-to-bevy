---
name: code-quality-audit
description: Generic workflow for auditing a codebase and producing ranked refactor opportunities without immediately changing behavior. Use when asked to review, audit, scan, or assess code quality, maintainability, complexity, duplication, architecture drift, unclear boundaries, hard-to-test code, risky abstractions, or performance-related refactor candidates across a repository or subsystem.
---

# Code Quality Audit

## Overview

Audit before refactoring. Build enough context to distinguish real quality problems from local style preferences, then return a ranked, actionable report. Do not edit files unless the user explicitly asks to implement fixes.

## Workflow

1. Establish scope and baseline:
   - Identify the language, framework, package boundaries, test commands, build commands, and user-requested scope.
   - Read local project instructions and neighboring code before judging patterns.
   - Inspect tests and public contracts for the audited area so refactor suggestions preserve behavior.
   - Use static scans, metrics, dependency graphs, profiling, or code search when useful. Treat tool output as leads, not proof.

2. Audit through multiple lenses:
   - Maintainability: long functions, deep nesting, unclear names, scattered responsibilities, dense conditionals, and excessive cleverness.
   - Duplication: repeated logic, parallel implementations, copy-pasted validation, repeated serialization, and repeated test setup.
   - Boundaries: modules that know too much, circular dependencies, leaky abstractions, inconsistent ownership, and mixed concerns.
   - Testability: hidden side effects, global state, time or randomness coupling, hard-coded IO, and behavior not covered by focused tests.
   - Complexity: nested scans, repeated lookups, N+1 calls, expensive render or recomputation paths, and data transformations that can grow poorly.
   - Risk: security-sensitive paths, data migrations, public APIs, generated artifacts, concurrency, permissions, and error handling.

3. Rank findings:
   - Prioritize issues with broad blast radius, high change frequency, user-visible risk, large-input paths, shared utilities, or repeated developer friction.
   - Separate correctness risk from readability cleanup and performance complexity.
   - Prefer a few high-signal findings over a long list of minor style notes.
   - Exclude refactors where the current shape is consistent, intentionally constrained, or cheaper than the proposed abstraction.

4. Define refactor paths:
   - For each finding, explain the current pattern, why it matters, and the recommended change.
   - Include expected benefit, risk level, affected files, and tests or checks needed.
   - Keep recommendations incremental. Favor extract, isolate, consolidate, index, batch, or simplify before proposing rewrites.
   - Note behavior that must be preserved: APIs, outputs, ordering, errors, side effects, permissions, pagination, and serialization formats.

5. Score the current state:
   - Include an overall code quality score when producing an audit report. Use a 0-10 scale unless the user requests another scale.
   - Make the score reproducible by naming the scoring areas, such as correctness baseline, test coverage, maintainability, architecture boundaries, verification workflow, and security or robustness.
   - Treat a passing build or test suite as positive evidence, not as proof that no quality risks exist.
   - Avoid false precision. One decimal place is enough when a single overall score is useful.

6. Report clearly:
   - Start with top findings ranked by impact.
   - When the user asks for an artifact or the audit is repo-wide, write the report to a Markdown file in the repository's appropriate docs/status, reports, or audit location.
   - Include the overall score near the top of the report, followed by a short scorecard or rationale.
   - Include file and line references where possible.
   - State the scope inspected, commands or scans run, and any areas not covered.
   - Say explicitly that no files were modified unless implementation was requested.

## Report Shape

Use this structure unless the user asks for something else:

- Scope inspected.
- Overall quality score and scorecard/rationale.
- Top findings, ordered by severity or leverage.
- For each finding: file/line, current pattern, impact, recommendation, risk, and verification needed.
- Lower-priority opportunities, if useful.
- Open questions or assumptions.
- Confirmation that the audit did not modify files.

## Implementation Follow-Up

When the user asks to implement audit findings:

- Implement one coherent refactor at a time.
- Add or update tests before changing behavior-adjacent code.
- Preserve public APIs, observable output, ordering, side effects, and diagnostics unless the user approves a behavior change.
- Run the narrowest relevant verification first, then broader checks when shared contracts are affected.
- Report changed files, verification run, and residual risk.
