# Repo Bloat Cleanup and CLI-First Authoring Report

Date: 2026-07-01

## Scope

This report audits cleanup candidates under `examples/`, `templates/`,
`tools/verify/artifacts/`, and `runtime-bevy/artifacts/`, plus the changes needed
to stop `src/game.ts` from being the default authoring route.

The audit used `find`, `du`, `git ls-files`, `git status --ignored`, `rg`, and
parallel sub-agent reviews for examples, templates, verification artifacts, and
CLI-first migration. No cleanup was performed while producing this report.

## Current State

- `examples/`: about 294M on disk, 251 tracked files.
- `templates/`: about 19M on disk, 132 tracked files.
- `tools/verify/artifacts/`: about 66M on disk, no tracked files found.
- Local generated file counts under the audited roots:
  - `examples`: 1017 files
  - `templates`: 235 files
  - `tools/verify/artifacts`: 450 files
  - `dist` paths: 653 files
  - `artifacts` paths: 709 files
- Tracked artifact-like files are limited to:
  - `examples/v1-canonical/artifacts/engine-screenshots/*.png`
  - `templates/v5-game-starter/fixtures/verify/*`

The disk bloat and the AI-behavior problem are different problems:

- Disk bloat is mostly ignored generated output: `dist/`, `artifacts/`,
  local screenshots, temporary reports, and a few generated-only directories.
- AI confusion is mostly tracked source shape: many templates/examples still
  present `src/game.ts` as normal project creation.

## Desired End State

`src/game.ts` should be wiped from discoverable project creation paths.

Allowed long-term:

- Internal compiler/CLI compatibility tests that explicitly prove old `Scene`,
  `World`, `defineGame`, or `game.ts` inputs still work.
- Historical PRDs and archived documentation.
- Temporary generated proof projects, if ignored and not used as examples.

Not allowed long-term:

- Default templates with `entry: "src/game.ts"` or `src/game.tsx`.
- Gallery templates that teach `src/game.ts`.
- Canonical runnable examples that agents can copy as the normal way to create
  games.
- Docs/help examples that tell users or agents to start with `game.ts`.

The canonical authoring path should be:

```txt
content/**/*.json structured source
  + src/scripts/**/*.ts behavior modules
  -> tn authoring/scene/ui/material/asset/prefab/system commands
  -> tn build
  -> portable IR bundle
```

## Safe Delete Now

These are ignored, untracked, and not current source of truth.

### Generated Example Output

Delete local generated output under:

```txt
examples/*/dist/
examples/*/artifacts/
examples/v8-overlay-webview/overlay/dist/
examples/bevy-camera-minimap-verification/node_modules/
```

Known high-value cleanup:

```txt
examples/stylized-nature-component/artifacts/        # about 140M
examples/bevy-camera-minimap-verification/dist/      # about 74M
examples/v3-environment/dist/                        # about 19M
examples/v5-functional/dist/                         # about 13M
examples/v3-environment/artifacts/                   # about 7.9M
```

### Generated-Only Example Directories

These directories have no tracked source files and only contain ignored bundle
output:

```txt
examples/v9-assets-gltf-workflow/
examples/v9-physics-character/
examples/v9-rendering-lights/
```

### Generated Template Output

Delete ignored generated output under:

```txt
templates/racing-kart/dist/
templates/starter-functional/dist/
templates/structured-source-starter/dist/
templates/v1/dist/
templates/v4-scripting/dist/
templates/v5-game-starter/dist/
```

### Temporary Verification Artifacts

Delete these local-only verification outputs:

```txt
tools/verify/artifacts/particle-commands/
tools/verify/artifacts/tags-groups-example/
tools/verify/artifacts/tmp-physics-character/
tools/verify/artifacts/tmp-v1-canonical/
tools/verify/artifacts/tmp-v8-color-parity/
tools/verify/artifacts/v3-forest-quick-run/
tools/verify/artifacts/v8-fog-test/
tools/verify/artifacts/v8-rq-test/
runtime-bevy/artifacts/v4/
runtime-bevy/artifacts/v10/ecs-tags-groups/
runtime-bevy/artifacts/v10/tags-groups-example/
```

## Wipe Targets: `game.ts` Templates

These should be removed as templates, not merely renamed as legacy/gallery,
because their presence keeps teaching agents the wrong route:

```txt
templates/v1/
templates/v2-arena/
templates/v3-environment/
templates/v4-scripting/
templates/v5-game-starter/
templates/starter-functional/
templates/racing-kart/
```

Recommended replacement:

- Keep only `templates/structured-source-starter/` as the default scaffold.
- If a playable demo is required, rebuild it as structured source under
  `content/**` plus `src/scripts/**`, not as `src/game.ts`.
- Do not preserve `starter`, `game-starter`, `racing`, or milestone template
  aliases unless they resolve to structured source.

Required code changes before wiping these templates:

- Update `packages/cli/src/templates/registry.ts`.
  - Current default is `starter -> templates/v1` at line 12.
  - Make `structured-source-starter` the only default.
  - Remove canonical entries for game.ts templates or make their aliases fail
    with a diagnostic that points to structured source.
- Update `packages/cli/src/commands/create.ts`.
  - `isSourceCheckout()` currently assumes `templates/v1/package.json` exists
    in a source checkout; point it at `templates/structured-source-starter`.
- Update `packages/cli/src/commands/create.test.ts`.
  - Default create/init tests should expect:
    - `template === "structured-source-starter"`
    - `entry === "content/scenes/arena.scene.json"`
    - no `src/game.ts`
  - Remove happy-path expectations that default scaffolds create `src/game.ts`.
- Update `packages/cli/src/commands/dev.test.ts`.
  - Tests currently copy `templates/v1` and `templates/v2-arena` for default
    project behavior. Use structured source fixtures instead.
- Update `packages/cli/src/commands/help.ts` and `help.test.ts`.
  - Replace `game-starter`/`racing-kart` scaffold guidance with
    `structured-source-starter`.
- Update `packages/cli/src/commands/doctor.ts`.
  - It defaults a missing config entry to `src/game.ts`. Stop doing this; a
    missing entry should be a config diagnostic, not an implicit legacy path.
- Update `packages/cli/src/commands/doctor.test.ts`.
  - Use structured source for default-project coverage.
- Update `scripts/verify-distribution-release.mjs`.
  - Stop assuming default output is `dist/game.bundle`.

## Wipe Targets: `game.ts` Examples

These examples reinforce `src/game.ts` as canonical. The goal should be deletion
or conversion to structured source, not long-term legacy retention.

### Delete After Status/Docs Cleanup

These appear to have little active gate value:

```txt
examples/physics-self-verification-showcase/
examples/bevy-camera-minimap-verification/
examples/v10-tags-groups/
examples/crystal-runner/
```

Required before deletion:

- Remove or replace status anchors in `docs/STATUS.md`.
- Move any still-needed capability proof into structured-source fixtures or
  current verification gates.
- Keep `examples/stylized-nature-component/`, but convert it to
  `threenative.config.json` + `content/**` structured source with no
  `src/game.ts`.

### Convert Or Delete After Gate Retargeting

These are referenced by active gates or tests and cannot be deleted without
retargeting:

```txt
examples/v1-canonical/
examples/crystal-runner-static/
examples/v3-environment/
examples/v8-color-parity/
examples/v8-lighting-tone/
examples/physics-character/
examples/v10-visual-calibration-lighting/
examples/parity-smoke/
examples/v9-skeletal-animation/
examples/assets-gltf-scene-workflow/
examples/rendering-lights/
examples/scene-lifecycle/
examples/v6-functional/
examples/v7-functional/
examples/v8-overlay-webview/
examples/v9-support/
```

Required retargeting:

- `packages/cli/src/verify/baselineVisualParity.ts`
  - Baseline checkpoints currently depend on `v1-canonical`,
    `crystal-runner-static`, `v3-environment`, `v8-color-parity`,
    `v8-lighting-tone`, `physics-character`,
    `v10-visual-calibration-lighting`, and `parity-smoke`.
  - Replace with one or more structured-source baseline scenes.
- `tools/verify/src/release.ts`
  - Release focused gates still reference example-owned V9 evidence.
- `tools/verify/src/v9QualityGates.ts`
  - Uses `v9-skeletal-animation`, `physics-character`,
    `assets-gltf-scene-workflow`, and `rendering-lights`.
- `packages/compiler/src/examples.test.ts`
  - Current build examples include several `src/game.ts` projects. Convert
    tests to structured-source projects or move `game.ts` cases into explicit
    compatibility fixtures.
- `scripts/visual-calibration/manifest.mjs`
  - V10 calibration examples should become structured source or be collapsed
    into a smaller structured calibration matrix.
- `scripts/verify-v10-visual-calibration.mjs`
  - Update artifact expectations if calibration examples are collapsed.
- `packages/ir/fixtures/conformance/*fixture-catalog.json`
  - Remove example artifact dependencies after replacing them with stable
    conformance fixtures.

## Keep

Keep these as active source:

```txt
templates/structured-source-starter/
examples/ai-reference/
packages/ir/fixtures/conformance/
tools/verify/src/
packages/cli/src/verify/
```

Keep tracked fixture evidence unless replaced:

```txt
templates/v5-game-starter/fixtures/verify/*
```

But note: once `templates/v5-game-starter/` is wiped, move any still-needed
fixture evidence to `packages/ir/fixtures/`, `tools/verify/fixtures/`, or a
dedicated test fixture path that is not exposed as a template.

## Merge Candidates

These should collapse into fewer structured-source proofs:

- `v10-visual-calibration-*`
  - Replace eight `src/game.ts` examples with one structured calibration project
    containing multiple scenes or content documents.
- `v8-color-parity`, `v8-lighting-tone`, `v10-visual-calibration-lighting`,
  `parity-smoke`
  - Collapse into one structured visual-baseline project if thresholds can stay
    readable.
- `physics-character` plus physics self-verification labs
  - Keep self-verification labs as data fixtures/gate inputs. Avoid separate
    game.ts examples for overlapping physics behavior.
- `v6-functional`, `v7-functional`, `starter-functional`, `v5-game-starter`,
  `racing-kart`
  - Replace with one structured playable sample, not several template/example
    variants.
- `crystal-runner` and `crystal-runner-static`
  - Keep only a structured static parity checkpoint or rebuild as structured
    source. Delete the interactive duplicate unless actively maintained.

## Verification Artifact Policy Changes

Current artifact ownership is defined in `tools/verify/src/artifacts.ts`:

- aggregate: `tools/verify/artifacts/<gate>`
- example-owned: `examples/<name>/artifacts/<gate>`
- package-owned: `<package>/artifacts/<gate>`
- runtime-owned: `<runtime>/artifacts/<gate>`

This is structurally fine, but in practice the repo has accumulated too much
local proof output. Recommended policy:

- Do not track generated artifacts except curated fixtures.
- Keep aggregate release reports reproducible, not committed.
- Store durable contract inputs under `packages/ir/fixtures/*`.
- Prefer one structured-source verification project over many historical
  `src/game.ts` examples.
- Add a cleanup command or documented command that removes ignored generated
  output from `examples`, `templates`, and `tools/verify/artifacts`.

## Guardrails To Add

Add a cheap no-new-`game.ts` guard to `pnpm check:names`.

Best target:

```txt
scripts/check-current-names.mjs
scripts/check-current-names.test.mjs
```

The guard should fail when:

- any default template has `entry: "src/game.ts"` or `src/game.tsx`;
- any default template contains `src/game.ts`;
- docs/help/create tests assert that default scaffold creates `src/game.ts`;
- new non-test examples add `src/game.ts`.

The guard should allow:

- explicit compatibility tests under package test fixtures;
- historical PRDs;
- generated temporary proof projects that are ignored;
- `packages/sdk/src/game.ts`, because that is SDK implementation, not project
  scaffold source.

## Recommended Cleanup Order

1. **Delete ignored generated output locally.**
   - This is low risk and immediately removes most disk bloat.
2. **Flip the default template to `structured-source-starter`.**
   - Update create/help/doctor/distribution tests in the same change.
3. **Add the no-new-`game.ts` guard.**
   - This prevents regression while examples are being migrated or deleted.
4. **Wipe game.ts templates.**
   - Remove template registry entries and tests/docs that mention them as
     project creation paths.
5. **Retarget visual and release gates to structured-source projects.**
   - Start with baseline visual parity and V10 calibration because they are the
     biggest source of discoverable `src/game.ts` examples.
6. **Delete or convert remaining game.ts examples.**
   - Keep old authoring behavior only in explicit compatibility test fixtures.
7. **Prune docs/status references.**
   - Update `docs/STATUS.md` and `docs/bevy-feature-parity.md` after gate
     retargeting so they do not keep old evidence paths alive.

## Bottom Line

The safe immediate deletion is ignored generated output. The important product
cleanup is more aggressive: wipe game.ts templates and retarget gates so
examples stop teaching that path. Until default scaffolding, docs, help, doctor,
and visual gates all point at structured source, agents will continue to infer
that `src/game.ts` is the preferred way to create games.
