# PRD-006: Mid-Size Web-First Forcing Function

## Status

Proposed

## Context

ThreeNative is strong for scaffolded small vertical slices, but mid-sized games
are still unproven. The next useful product test is not another isolated
capability slice; it is one web-first game that exercises menus, progression,
multiple phases or scenes, save/settings, audio, UI, content volume,
performance proof, and release metadata through the agent workflow.

## Goal

Build and enroll one mid-sized web-first game as a maintained forcing-function
example, using the engine's intended source, iterate, proof, and release paths.

## Non-Goals

- Do not lift the native parity freeze.
- Do not hand-author raw Three.js or Bevy gameplay.
- Do not create one-off scripts or gates that cannot generalize.

## Requirements

1. Start with `tn game plan --goal ... --project . --json` and preserve the
   generated production plan.
2. Use catalog/open-source or authored custom assets for high-value surfaces.
3. Include menus or pre-game flow, settings, progression, at least two gameplay
   phases or scenes, HUD, audio, fail/retry, win/progression state, and saved
   state.
4. Keep a friction log that classifies every repair as command gap,
   diagnostic gap, docs/API-card gap, runtime bug, asset gap, or proof gap.
5. Convert repeated friction into a PRD, command, diagnostic, descriptor, or
   manifest follow-up.

## Execution Phases

### Phase 1: Game Brief And Plan

- [ ] Pick a game concept that naturally exercises mid-size surfaces.
- [ ] Run `tn game plan --goal "<idea>" --project . --json`.
- [ ] Record controls, objective, progression, scenes/phases, assets, proof
      commands, performance expectations, and release evidence.

### Phase 2: Agent-First Build

- [ ] Use bounded CLI operations and structured source as the default mutation
      path.
- [ ] Run `tn iterate --project . --json` after gameplay/input changes.
- [ ] Log every friction event with command, artifact, expected behavior, and
      root-cause category.

### Phase 3: Proof And Release Enrollment

- [ ] Add committed playtests for movement, objective progress, fail/retry,
      UI update, persistence/settings, and release smoke.
- [ ] Add production metadata and proof commands.
- [ ] Enroll the game through the example manifest/release proof config when
      evidence is stable.

### Phase 4: Harvest Follow-Ups

- [ ] Convert repeated friction into implementation PRDs or focused issues.
- [ ] Update capability status only for actual promoted claims.
- [ ] Keep native/desktop claims limited to webview packaging unless a shipped
      game need is documented.

## Files Likely Touched

- `examples/<new-mid-size-game>/`
- `examples/manifest.json` or generated-game config.
- `tools/verify/src/gameProductionGate.ts`
- `docs/status/capabilities/game-production.md`
- `docs/status/capabilities/tooling-proof.md`
- `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md` if systemic risk is found.

## Verification

- `pnpm verify:generated-games`
- `pnpm verify:game-production`
- `pnpm verify:example-build-sweep`
- `tn iterate --project examples/<new-mid-size-game> --json`
- Targeted playtests for committed scenarios.

## Acceptance Criteria

- [ ] The game is playable web-first with readable visuals, UI, audio,
      progression, fail/retry, and saved state.
- [ ] The game has committed proof scenarios and production metadata.
- [ ] The friction log has root-cause categories and follow-up links.
- [ ] The example is classified and enrolled without one-off gate constants.
