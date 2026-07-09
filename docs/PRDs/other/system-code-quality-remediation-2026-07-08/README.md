34# Systems Code Quality Remediation (2026-07-08)

This active PRD bundle slices the four urgent red rows from
`docs/status/systems-code-quality-diagnostic-2026-07-08.md` into executable
work. The order follows the diagnostic's risk ranking and dependency notes:
fix live native spawn/despawn behavior first, pin loop scheduling semantics
second, close the cheapest contract-drift holes third, then split compiler
bundle emission so future contract work is easier to prove.

## Execution Order

1. [Native Scripted Spawn/Despawn Live Reconciliation](PRD-001-native-scripted-spawn-despawn-live-reconciliation.md)
2. [Native/Web Game Loop Scheduling Contract](PRD-002-native-web-game-loop-scheduling-contract.md)
3. [IR Document Contract Truth Hardening](PRD-003-ir-document-contract-truth-hardening.md)
4. [Compiler Bundle Planning and Writer Split](PRD-004-compiler-bundle-planning-writer-split.md)

## Source Evidence

- Diagnostic:
  `docs/status/systems-code-quality-diagnostic-2026-07-08.md`
- Status row owner:
  `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
- Front door:
  `docs/STATUS.md`

## Bundle Acceptance

- [ ] All four PRDs complete or explicitly superseded.
- [ ] The four matching red rows in `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`
      are downgraded only after implementation evidence is linked.
- [ ] Any promoted Bevy parity claim is reflected in
      `docs/bevy-feature-parity.md`.
- [ ] Final verification includes the narrow per-PRD commands plus
      `pnpm verify:conformance`.
