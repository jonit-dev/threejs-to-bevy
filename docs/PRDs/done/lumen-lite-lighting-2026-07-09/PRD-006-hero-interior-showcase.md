# PRD-006: Hero Interior Showcase + Native Baked-GI Calibration

Status: done. This document records the execution guide and evidence for the
lumen-lite milestone: fix the remaining native baked-GI overexposure, then
build the composed hero scene that proves every lighting system together.

Reference target: `/home/joao/projects/threejs-to-bevy/image.png` — a
Metro/Stalker-style derelict interior. Read it as a lighting spec:

- Two windows on the left wall blown out to near-white with strong bloom
  halos; the window frames silhouette against them.
- Volumetric god rays cut diagonally from the windows through visible dust;
  the shaft is brightest near the window and dissipates into the room.
- Warm amber/tan bounce light on rough plaster walls and ceiling; the wall
  opposite the windows is clearly lit by indirect light only.
- Deep, soft shadow falloff into the corners — dark but not black; ambient
  never flattens the room.
- Rough, matte materials everywhere (peeling plaster, dusty concrete floor,
  rusted metal bed frame, wooden door on the floor); one saturated accent
  prop (yellow crate) catching direct light.
- A painted blue-grey band on the back wall gives a cool counterpoint to the
  warm key light.
- ACES-style filmic response: highlights roll off, mids are warm, blacks are
  lifted slightly by fog/dust.

## Current state (verified 2026-07-10)

What is already done and should NOT be redone:

- The pi-scale energy fix is implemented and compiled. Native SH-L0 ambient
  now scales coefficients by 0.282095 (Three's 0.886227 L0 reconstruction
  divided by the Lambert 1/pi) in
  `runtime-bevy/crates/threenative_runtime/src/rendering.rs` (~lines
  872-930). The capture binaries at `runtime-bevy/target/debug/` are newer
  than the source change, so the 18:20 screenshot set was rendered WITH the
  fix.
- The hardened baked-GI gate is implemented AND validated. Do not re-verify
  it by hand: the latest run of the gate
  (`tools/verify/artifacts/baked-gi/verification-report.json`) correctly
  fails the broken native capture with both new diagnostics:
  - `TN_VERIFY_BAKED_GI_CLIPPING` (native overexposedFraction 0.268 > 0.02)
  - `TN_VERIFY_BAKED_GI_NATIVE_LIFT_EXCESSIVE` (native lift 0.215 vs web
    lift ~0.001; limit is webLift*4 + 0.015)
  The gate logic lives in `tools/verify/src/bakedGiGate.ts`.
- Web baked-GI is healthy: `baked-probe-alcove-test.web.png` shows a subtle
  warm lift on the subject sphere, 0% clipping.

What is still broken:

- Native baked-GI remains catastrophically overexposed. In
  `tools/verify/artifacts/baked-gi/screenshots/baked-probe-alcove-test.native.png`
  the floor, left wall, and sphere clip to pure flat white. The pi fix was
  necessary but not sufficient — the residual bug is elsewhere.

## Task 1: root-cause and fix the native baked-GI overexposure

Do this FIRST. The hero scene depends on baked GI reading correctly on
native, and the calibration you land here sets the global mood match.

### Why the pi fix cannot be the whole story

The fixture probe (`packages/ir/fixtures/conformance/baked-probe-alcove-test/game.bundle/environment.scene.json`)
authors SH L0 coefficients of `[0.12, 0.035, 0.02]`. After the 0.282095
scale the added ambient brightness is ~0.034 — in the same "three-compat"
unit range as the atmosphere ambient path. A +0.034 ambient lift cannot
flat-clip a scene whose disabled capture is dark. Something multiplies the
contribution or applies it twice.

### Concrete hypotheses, in order of likelihood

1. Unit mismatch with the calibrated ambient paths. Every other ambient
   contribution in `rendering.rs` goes through a calibrated
   `THREE_COMPAT_*` constant (lines 31-35): atmosphere ambient uses
   `THREE_COMPAT_ATMOSPHERE_AMBIENT_BRIGHTNESS_PER_INTENSITY = 0.25`,
   environment ambient uses `0.45`. The baked path (lines 893-921) adds raw
   `coeff * 0.282095` with no compat constant. Check what units Bevy's
   `AmbientLight::brightness` is consumed in given the camera exposure
   (`THREE_COMPAT_DEFAULT_CAMERA_EV100 = 0.0` in `map_world.rs:87` — EV100 0
   is ~2^9.7 times brighter than Bevy's default exposure, so any brightness
   value carrying physical-unit assumptions will detonate).
2. Double application. The same probe may feed both the ambient path in
   `rendering.rs` and another consumer (environment-map ambient at lines
   825-852, or a conformance/proof-harness path in `conformance.rs` /
   `proof_harness.rs`, both touched in this change set). Grep the diff for
   every consumer of `LightProbeSourceIr::Baked`.
3. Blend math. `blend_ambient_colors_weighted` + `combined_brightness =
   ambient.brightness + brightness` (lines 910-918): confirm the weighted
   blend does not renormalize color while also summing brightness in a way
   that double-counts energy.

### Debugging protocol

1. Instrument, don't guess: in the `threenative_capture` binary path, log
   the final `AmbientLight { color, brightness }` after world setup, for
   both the enabled and disabled bundles. One `eprintln!` is enough; remove
   it before committing.
2. Rebuild and rerun ONLY the focused gate (command shape lives in
   `packages/ir/fixtures/conformance/fixture-catalog.json` under
   `focusedGate.commands` for `baked-probe-alcove-test`; the aggregate gate
   is `verify:baked-gi`). Native capture is:
   `cargo run -p threenative_runtime --bin threenative_capture -- <bundlePath> <cameraId> <outPath> <frame>`.
3. Compare the logged enabled-vs-disabled brightness delta against the
   atmosphere baseline. The delta that reaches Bevy should be ~0.034 in the
   same units as the `0.25 * intensity` atmosphere term. If it is orders of
   magnitude larger, hypothesis 1 or 2 is confirmed.
4. Fix by calibration constant, matching house style: introduce
   `const THREE_COMPAT_BAKED_PROBE_AMBIENT_BRIGHTNESS_PER_UNIT` next to the
   other compat constants and tune it against the gate metrics, exactly as
   PRD-004 calibrated the SSGI ambient multiplier. Do not tune against
   eyeballs; tune against the gate.

### Acceptance for Task 1

`verify:baked-gi` passes on both targets, meaning simultaneously:

- native `overexposedFraction <= 0.02` (no clipping),
- native lift `<= webLift * 4 + 0.015` (no flooding),
- native lift `> 0.008` (the indirect lift is still visible — do not fix
  overexposure by zeroing the feature out),
- warm-bounce redChroma delta still present (>= 0.006 native).

Update the conformance report expectations/tests in
`runtime-bevy/crates/threenative_runtime/tests/rendering_atmosphere.rs` if
the calibrated constant changes reported values. Report mode stays
`"global-ambient-sh-l0-approximation"` — honest reporting, per PRD-005.

## Task 2: finish the hero interior showcase scene

This work is ALREADY IN PROGRESS in `examples/lumen-lite-showcase/`
(build-only enrolled in `examples/manifest.json`). Take stock before
authoring anything:

- `content/environment/lumen-room.environment.json` already authors the
  full lighting rig: warm window sun (`#ffe5a8`, intensity 3.6, low angle,
  casts shadow), warm-bounce SH2 probe (`probe.room.warm-bounce`, L0
  ~[0.1, 0.058, 0.025]), low constant ambient (0.13), ACES + exposure 0.92,
  stabilized 4-cascade shadows (2048), exponential fog, height fog
  (density 0.17, warm color), and god rays (intensity 1.05, quality high).
  Do not re-author this; adjust values only while calibrating against
  screenshots.
- What is MISSING is the room itself: `threenative.config.json` still
  points `entry` at `content/scenes/arena.scene.json`, the top-down arena
  starter. There is no interior geometry for the sun, rays, and probe to
  act on.

So the remaining work is scene composition: author
`content/scenes/hero-interior.scene.json` (plus meshes/materials/prefab
content) that uses `lumen-room-environment`, and switch the project entry
to it. Prefer `tn ... --json` authoring commands over hand-editing JSON,
and update the production plan
(`tn game plan --goal "..." --project examples/lumen-lite-showcase --json`,
existing plan artifacts live in `artifacts/game-production/`) since this
substantially changes the playable example.

Note the probe's placeholder `sceneContentHash` (all `a`s) — once real room
geometry exists, re-derive the hash or the stale-probe diagnostic
(`TN_IR_LIGHT_PROBE_BAKE_STALE`) will fire.

### Scene construction spec (derived from image.png)

Architecture — this must be a real enclosed room, not colored boxes:

- Room roughly 10 x 4 x 8 m: floor, four walls, ceiling, all
  shadow-receiving. Walls/ceiling: rough plaster material (roughness
  ~0.9, warm desaturated tan albedo ~[0.55, 0.48, 0.38]). Floor: dusty
  concrete, slightly darker.
- Left wall: two window openings (~1.5 x 1.2 m) with visible frames/mullions
  (thin box geometry) so the god rays and bloom have silhouettes to cut
  around. A doorway in the back-left wall leading to a second small lit room
  gives depth (the lit corridor in the reference).
- Back wall: lower third painted blue-grey ([0.25, 0.35, 0.42], roughness
  0.8) as the cool accent band.
- Props, each grounded with contact shadows: rusted metal bed frame (dark,
  roughness 0.6, slight metalness), 2-3 wooden crates, a fallen wooden door
  flat on the floor at an angle, one saturated yellow crate/box placed where
  a ray of direct light hits it, small debris boxes. Reuse catalog assets
  where the catalog has them (catalog-first rule); primitive boxes with good
  materials are acceptable fallback for plaster/crates.

Lighting rig — already authored in `lumen-room.environment.json`; verify it
against the built room rather than re-creating it:

- Confirm the sun direction ([0.72, -0.22, -0.66]) actually enters through
  the window openings you build and lands two bright patches on the
  floor/right side of the room; move the windows to the sun, not vice
  versa, if the shafts read better.
- After Task 1 lands, re-tune the probe L0 coefficients so the wall
  opposite the windows reads warm but unclipped on BOTH targets.
- Keep the authored ambient low (0.13 now); the room's fill must visibly
  come from the probe + SSGI, not from a flat ambient term.

Renderer config (all portable IR knobs — see `packages/ir/src/runtimeConfig.ts`):

- `renderLook.profile: "cinematic"` (ACES, bloom 0.55, exposure 1.08) as the
  base; override only what the target image demands.
- `bloom`: enabled, threshold low enough that only the windows and the
  sunlit patches bloom (windows should read 2+ stops over white).
- `volumetrics.godRays`: enabled, quality high, intensity ~0.8, density
  tuned so shafts are distinct near windows and fade mid-room.
- `volumetrics.heightFog`: enabled, low density (~0.03), baseHeight at
  floor, warm-grey color — this is the dust haze that lifts the blacks.
- `screenSpaceGlobalIllumination`: enabled, quality high (web gets the full
  temporal pass; native gets the calibrated SSAO+ambient approximation).
- `ambientOcclusion`: enabled — corners and under-prop darkening.
- `contactShadows`: enabled under the bed frame, crates, and door.
- Camera: eye height ~1.6 m, positioned in the right half of the room
  looking across the god rays toward the windows-and-doorway corner, ~48-55
  degree FOV. The rays must cross the frame diagonally, as in the
  reference. First-person arms/weapon are NOT required — this is a lighting
  showcase, not a shooter.

Iterate with screenshot captures, not opinions: capture web first, tune
until it matches the reference mood, then capture native
(`--target desktop`) and calibrate residual gaps with the existing compat
constants — never by forking scene content per target.

### Enrollment and proof (registry-first, per repo rules)

1. Update the owning registries before deriving anything:
   `examples/manifest.json` entry for the showcase (already present —
   confirm scene/entry changes keep it building) and, if the scene becomes
   a conformance proof, a `fixture-catalog.json` entry with
   `aggregateGate`, `ownerDocs` pointing at this PRD, and
   `reportArtifacts`.
2. Add playtest scenarios next to the existing four in
   `examples/lumen-lite-showcase/playtests/`: a `hero-interior` scenario
   with `artifacts.screenshots: "before-after"` for web, and a
   `native-hero-interior` variant. Prove with `tn playtest`; before any
   release claim, rerun committed scenarios with `--target desktop`.
3. Capture a web/native contact sheet the way the other gates do
   (`tools/verify/artifacts/<gate>/screenshots/`), so the showcase has
   side-by-side evidence.

### Acceptance for Task 2

- One scene renders with GI, cascaded shadows, contact shadows, bloom,
  height fog, god rays, rough materials, and enclosed-room lighting all
  active — confirmed by the conformance report listing every feature as
  applied (or honestly fallback-reported on native).
- Web screenshot reads recognizably like `image.png` in structure and mood:
  blown windows, diagonal shafts, warm indirect walls, grounded props, dark
  soft corners.
- Native screenshot matches web within the same visual range (reuse the
  lift/clipping metric approach from `bakedGiGate.ts` if you want a
  numeric guard).
- Playtest scenarios pass on web and `--target desktop`.

## Task 3: verification and change-set hygiene

- The worktree holds the entire uncommitted lighting milestone. Do not
  revert, reformat, or absorb unrelated files. Keep showcase work in
  clearly separable commits: (1) native baked-GI calibration fix, (2) hero
  showcase scene + enrollment, (3) doc updates. Commit only when the user
  asks.
- After the visual work, run the full ladder and report results honestly:
  `pnpm check:docs`, `pnpm build`, `pnpm typecheck`, `pnpm test`,
  `pnpm verify:conformance`, `pnpm verify:smoke`. The previously
  interrupted focused capture is superseded by rerunning the focused gates
  (`verify:baked-gi` at minimum) before the full ladder.
- Documentation obligations on completion:
  `docs/status/capabilities/rendering.md` (baked-GI calibration + showcase
  evidence), the one-line index in `docs/STATUS.md`, and
  `docs/bevy-feature-parity.md` if native parity claims change. Move this
  PRD to `docs/PRDs/done/lumen-lite-lighting-2026-07-09/` when finished and
  update the README index.

## Anti-goals

- Do not weaken the baked-GI gate to make the native capture pass; the gate
  is correct — the renderer is wrong.
- Do not fix overexposure by disabling the native baked-GI contribution or
  hiding it behind a fallback report.
- Do not add per-target scene forks; parity comes from calibration
  constants and honest conformance reporting.
- Do not build another abstract colored-box fixture and call it a showcase.

## Completion evidence (2026-07-10)

- `pnpm verify:focused verify:baked-gi`: pass; native lift `0.0090769`, web
  lift `0.0088658`, native warm delta `0.0285269`, native clipping `0`.
- `pnpm verify:focused verify:lighting-showcase`: pass; deterministic web and
  native captures, contact sheet, feature reports, and bounded exposure,
  contrast, highlights, warm mids, and shadow range.
- `hero-interior` web and `native-hero-interior` desktop playtests: pass with
  no asserted console, network, or runtime diagnostics.
- Focused contact-shadow, volumetrics, and SSGI regression gates: pass.
