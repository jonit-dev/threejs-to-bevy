# Leverage Points PRDs

Date: 2026-07-09

This bundle turns
[`docs/status/system-leverage-report-2026-07-09.md`](../../status/system-leverage-report-2026-07-09.md)
into ordered implementation slices. The goal is to spend effort and compute
where it compounds: descriptor-owned surfaces, cheaper agent loops, better
runtime diagnosis, manifest-owned proof, and one mid-sized forcing-function
game.

## Ordering

1. [PRD-001 Adapter Surface Derivation Closure](PRD-001-adapter-surface-derivation-closure.md)
2. [PRD-002 Off-Recipe Agent Churn Ratchet](PRD-002-off-recipe-agent-churn-ratchet.md)
3. [PRD-003 Runtime Observation Diagnostic Expansion](PRD-003-runtime-observation-diagnostic-expansion.md)
4. [PRD-004 Proof Gate Descriptor Manifests](PRD-004-proof-gate-descriptor-manifests.md)
5. [PRD-005 Example And Template Manifest Ownership](PRD-005-example-template-manifest-ownership.md)
6. [PRD-006 Mid-Size Web-First Forcing Function](PRD-006-mid-size-web-first-forcing-function.md)
7. [PRD-007 Visual Metrics Expansion](PRD-007-visual-metrics-expansion.md)

## Dependency Shape

- PRD-001 should land first. It reduces future adapter work across CLI, MCP,
  editor, and smoke coverage.
- PRD-002 can start in parallel with PRD-001 because it is primarily benchmark
  classification and deterministic ratcheting.
- PRD-003 should use PRD-002 evidence to prioritize silent or stagnant runtime
  failures.
- PRD-004 and PRD-005 are manifest/descriptor ownership slices; they can start
  after the current adapter-surface migration has stabilized.
- PRD-006 should wait until at least PRD-002 has churn budgets and PRD-005 has
  example ownership, otherwise the forcing-function game will create more
  one-off policy.
- PRD-007 should stay promotion-driven: add metrics only where a rendering,
  UI-fit, or game-quality claim needs automated visual evidence.

## Bundle Acceptance

- [ ] Adapter drift allowlists shrink and remaining entries are explicit
      product exclusions or named migration gaps.
- [ ] Off-recipe churn classes are measured and gated before Round 5B reruns.
- [ ] Silent runtime failures produce source-linked diagnostics rather than
      repeated artifact forensics.
- [ ] Focused/release gates and examples/templates are descriptor or
      manifest-owned.
- [ ] A mid-sized web-first game exercises menus, progression, UI, audio,
      persistence, content volume, proof, and release metadata.
- [ ] Visual metrics expand through fixture-backed, compact artifacts instead
      of broad screenshot dumps.
