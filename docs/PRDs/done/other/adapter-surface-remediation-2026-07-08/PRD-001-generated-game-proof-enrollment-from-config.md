# PRD-001: Generated-Game Proof Enrollment From Config

## Status

Planned

## Context

Generated-game release enrollment is currently held in compile-time arrays in
`tools/verify/src/gameProductionGate.ts`, while one proof requirement is
selected by string equality against `examples/metro-surfer-heist`. That creates
two risks called out by the diagnostic: adding a generated game requires
editing central constants, and `humanoid-physics-course` has production agent
metadata but is not held to the same agent-inventory requirement.

The gate already has partial discovery through
`discoverGeneratedGameCandidates()`, and each generated game already carries
`threenative.config.json`. Enrollment and proof policy should live with the
project that owns the evidence.

## Goals

- Move generated-game enrollment and proof requirements into project config.
- Remove path-specific proof policy conditionals.
- Add diagnostics for config/constant drift during migration and for enrolled
  projects missing required marker artifacts.
- Resolve the `agentInventory` inconsistency explicitly.

## Non-Goals

- Redesign generated-game evidence artifacts.
- Change the meaning of existing proof requirement checks beyond replacing
  where policy is declared.
- Broaden the generated-game release gate to unrelated examples.

## Requirements

1. Add a `production.releaseProof` block to generated-game
   `threenative.config.json` files with an `enrolled` flag and requirement keys
   matching existing gate requirement fields one-to-one.
2. Add config reading in `gameProductionGate.ts`, keeping the current constants
   as a temporary fallback for non-migrated projects.
3. Emit stable diagnostics when config enrollment disagrees with fallback
   constants, when an enrolled project lacks
   `artifacts/game-production/plan.json`, or when an unknown requirement key is
   present.
4. Replace the `metro-surfer-heist` string conditional with config-derived
   `agentInventory` policy.
5. Retire the hard-coded generated-game arrays only after equivalent config
   coverage is proved.

## Acceptance Criteria

- [ ] `verify:generated-games` discovers generated-game release enrollment from
      project config.
- [ ] `humanoid-physics-course` either requires `agentInventory` or records an
      explicit config-level exemption that the gate reports.
- [ ] Unknown release-proof requirement keys fail with an actionable diagnostic.
- [ ] A hard-coded or config-enrolled project without the plan marker artifact
      fails with an actionable diagnostic.
- [ ] `tools/verify/src/release.ts` consumes the config-derived project set
      instead of owning a separate release enrollment list.

## Verification

- [ ] `pnpm --filter @threenative/verify-tools test -- --run gameProductionGate`
- [ ] `pnpm verify:generated-games`
- [ ] `pnpm verify:smoke` remains unaffected or any affected output is
      documented.

## Files Likely Touched

- `tools/verify/src/gameProductionGate.ts`
- `tools/verify/src/release.ts`
- `tools/verify/src/gameProductionGate.test.ts`
- `examples/*/threenative.config.json`
- `docs/status/capabilities/game-production.md`
- `docs/status/capabilities/tooling-proof.md`
- `docs/STATUS.md`
