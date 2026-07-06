# Three.js Runtime vs Bevy Runtime Gap Audit

Date: 2026-07-06

## Scope Inspected

This audit compares the promoted web Three.js runtime surface with the native
Rust/Bevy runtime surface. It inspected:

- `packages/runtime-web-three/src/**`
- `runtime-bevy/crates/threenative_runtime/src/**`
- `runtime-bevy/crates/threenative_loader/src/**`
- `packages/ir/src/**`
- `packages/ir/capabilities/threenative.capabilities.json`
- `docs/STATUS.md`
- `docs/bevy-feature-parity.md`
- `docs/PRDs/proof-first-engine-loop-2026-07-05/*.md`

The goal is not to relitigate every Bevy feature. It is to identify where the
web Three.js engine path is currently stronger, where Rust/Bevy support is
missing or only report-level, and which gaps matter most for practical game
shipping.

## Overall Score

Native parity score: **7.4 / 10**

Scorecard:

| Area | Score | Rationale |
| --- | ---: | --- |
| Contract coverage | 8.5 | Most promoted features now route through SDK/IR/compiler/web/Bevy evidence or explicit diagnostics. |
| Native runtime implementation | 7.5 | Core scene, rendering, input snapshots, UI, animation, physics traces, persistence reports, and asset workflows exist. Several surfaces are still bounded traces instead of production behavior. |
| Web-first proof tooling parity | 5.5 | `tn playtest`, screenshots, recordings, preview diagnostics, and generated-game QA are much more complete for web than desktop Bevy. |
| Advanced rendering/material parity | 6.5 | Many features are preserved or reported, but high-end effects are diagnostic/report-only until calibrated screenshot or runtime proof exists. |
| UI/platform polish parity | 7.0 | Retained UI has broad coverage, but virtual keyboard, 3D/world UI, native italic/text details, drag/drop UI nodes, and packaged webview/native shell behavior remain bounded or diagnostic. |
| Risk controls | 8.5 | Unsupported boundaries are unusually explicit, with stable diagnostic codes and residual catalogs. |

## Executive Summary

The Rust/Bevy adapter is no longer a thin prototype. It implements or reports a
large portion of the portable ThreeNative IR contract: world mapping, cameras,
materials, glTF assets, retained UI, animation playback, physics traces,
scripting host effects, persistence/reload reports, diagnostics, and focused
conformance gates.

The biggest remaining gap is **proof and runtime ergonomics**, not raw component
presence. Web has first-class `tn playtest`, preview readiness, screenshots,
recording, effect-log movement assertions, and generated-game QA. Native has a
keyboard proof-harness slice, but `tn playtest --target desktop`, native
screenshot command, and native record command support are still called out as
the next phase in status docs.

The second largest gap is **advanced visual behavior**. The IR and both runtimes
preserve/report many advanced rendering declarations, but auto exposure, visual
DOF blur, motion blur, SSR/mirrors, deferred rendering, volumetrics, projected
decals, virtual geometry, custom post passes, custom shaders, bindless
resources, and arbitrary streaming remain diagnostic-only or report-level.

## Top Findings

### 1. Native Playtest/Proof Tooling Still Lags Web

Severity: **P0 for parity claims; P1 for runtime implementation**

Evidence:

- `docs/STATUS.md:130` documents the first native proof-harness slice.
- `docs/STATUS.md:138` now says `tn playtest --target desktop|bevy` runs the
  native proof harness, requests native before/after screenshots, and keeps
  native short-recording/video support as the next PRD phase.
- `docs/STATUS.md:174` now says native/Bevy scenario execution is available for
  proof-harness-backed keyboard movement assertions with native before/after
  screenshot requests.
- `docs/bevy-feature-parity.md:181` says template playability is proven through
  web `tn playtest`.
- `docs/bevy-feature-parity.md:251` now records the native proof-harness
  `tn playtest --target desktop|bevy` slice, including before/after screenshots
  and short PNG-sequence recording artifacts.
- `runtime-bevy/crates/threenative_runtime/src/proof_harness.rs:27` supports
  only `Key` and `Exit` proof harness actions, and
  `runtime-bevy/crates/threenative_runtime/src/proof_harness.rs:45` writes only
  readiness, diagnostics, and transform samples.

Current pattern:

Web runtime proof can build, launch preview, inject keyboard input, sample
effect-log transform patches, assert movement and axis, capture screenshots,
and feed generated-game QA. Native proof can inject keyboard commands inside the
runtime and write readiness/transform samples, but the CLI-facing desktop
playtest loop and recording/screenshot parity are not promoted.

Impact:

Generated games and gameplay changes can be proven as web-playable while native
remains supported mostly by focused tests and trace gates. That makes it easy to
overstate "web/Bevy parity" for interactive behavior.

Recommendation:

Promote native playtest in this order:

1. Add `tn playtest --target desktop` over the existing proof harness.
2. Match the web movement assertion contract: before/after transform samples,
   distance, signed axis checks, diagnostics, and artifact-local reproduction
   commands.
3. Add native screenshot and short-recording artifacts to the same playtest
   report shape.
4. Enroll one committed generated-game scenario as a native parity fixture
   before broadening.

Verification needed:

- Rust proof-harness tests: covered by
  `cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime --test proof_harness`.
- CLI native launcher tests: covered by
  `node --test packages/cli/dist/commands/playtest.test.js packages/cli/dist/native/bevy.test.js`.
- One web/native scenario diff under `tools/verify/artifacts/`: covered by
  `tools/verify/artifacts/native-playtest/scenario-diff.json`.
- `pnpm verify:conformance` once the shared report shape is stable.

Worktree update:

- `tn playtest --target desktop|bevy` now routes through the native proof
  harness instead of returning `TN_PLAYTEST_TARGET_UNSUPPORTED`.
- The native harness accepts keyboard and screenshot commands, writes readiness
  samples, can request `before.png` / `after.png` during the same injected input
  run, and can capture a short `native-recording/` PNG sequence with
  `native-recording.json`.
- `templates/structured-source-starter/playtests/native-smoke-movement.playtest.json`
  is the first committed desktop movement fixture.
- Local proof passed for that fixture with movement above threshold, empty diagnostics,
  non-empty native screenshots under `/tmp/tn-native-smoke-playtest/`, and five
  non-empty native recording frames at ticks `5, 12, 20, 28, 35`.
- `tools/verify/artifacts/native-playtest/scenario-diff.json` records the
  current web/native scenario diff with empty diagnostics and links to web
  summary, Bevy summary, Bevy before/after screenshots, and Bevy
  `native-recording.json`.
- `examples/lantern-orchard/playtests/native-smoke-movement.playtest.json`
  enrolls one committed generated-game desktop fixture. Local proof passed with
  empty diagnostics and artifact evidence under
  `tools/verify/artifacts/native-playtest/lantern-orchard-bevy/`.
- Encoded native video export remains a future polish item, but the audit's
  short-recording artifact requirement is covered by the PNG sequence manifest.

### 2. Advanced Rendering Is Mostly Diagnostic/Report-Level, Not Runtime Parity

Severity: **P1/P2 depending on feature**

Evidence:

- `docs/STATUS.md:1483` says rendering residuals compare LOD, terrain policy,
  instancing policy, specular texture proof, material presets, compressed
  environment diagnostics, and advanced renderer diagnostics.
- `docs/STATUS.md:1492` keeps runtime vertex mutation, custom shaders, bindless
  resources, CSG, storage-buffer geometry, custom executable asset loaders, and
  arbitrary file/network streaming diagnostic-only.
- `docs/STATUS.md:1649` documents the camera/post-processing boundary as
  diagnostic/report contract.
- `docs/STATUS.md:1657` says DOF is report-only without calibrated visual blur.
- `docs/bevy-feature-parity.md:727` through
  `docs/bevy-feature-parity.md:757` classify auto exposure, visual DOF blur,
  motion blur, SSR/mirrors, deferred rendering, decals, virtual geometry, and
  custom post-processing as diagnostic/report boundaries.
- `packages/runtime-web-three/src/render.ts:754` has concrete web bloom settings,
  while `packages/runtime-web-three/src/render.ts:764` exposes DOF settings as
  config values without this audit finding a matching promoted visual blur claim.

Current pattern:

The engine is strong at preserving visual intent and rejecting unsupported raw
renderer selection. It is weaker at actual native/web visual behavior for high
end post-processing and renderer internals.

Impact:

Authors can see accepted metadata and matching reports and assume visual parity.
The current contract deliberately stops short of that for several features.

Recommendation:

Keep the current diagnostic boundary, but split the roadmap into two tracks:

- **Promote next:** visual DOF blur, shadow quality profile, `balanced` render
  look release-gate promotion, surface-aligned decal quads, and one compressed
  environment texture target with fallback evidence.
- **Keep diagnostic:** SSR, deferred rendering, volumetrics, motion vectors,
  virtual geometry, raw shaders, bindless resources, storage-buffer geometry,
  and arbitrary post passes.

Verification needed:

- Screenshot-calibrated web/native fixture per promoted effect.
- Explicit target-profile fallback diagnostics.
- Performance-budget sidecar for mobile/desktop where effects are expensive.

### 3. Several "Closed" Physics Rows Are Bounded Trace Semantics, Not Full Solver Parity

Severity: **P1**

Evidence:

- `docs/STATUS.md:1429` says the advanced physics pass promotes a bounded
  racing-useful slice.
- `docs/STATUS.md:1440` keeps full constraint solving, arbitrary triangle
  narrow phase, tire/friction models, vehicle drivetrains, soft bodies,
  ragdolls, and public backend handles deferred or diagnostic-only.
- `docs/STATUS.md:1456` says the physics self-verification gate passes, but
  `docs/STATUS.md:1460` notes it does not emit runtime camera screenshots or
  videos.
- `docs/bevy-feature-parity.md:846` claims full rigid-body solver parity beyond
  the current primitive falling-box trace, while nearby rows still defer full
  constraints, arbitrary triangle narrow phase, dynamic navmesh, vehicles,
  soft bodies, and ragdolls at `docs/bevy-feature-parity.md:870`.

Current pattern:

Physics parity is strong for the promoted deterministic game slice: primitive
solver behavior, contacts/triggers, character stepping/slopes, query services,
bounded mesh CCD metadata, axis locks, and joint metadata observations. It is
not full Bevy/Rapier-style physics parity.

Impact:

Game genres that depend on rich physics, such as vehicles, stacking puzzles,
ragdolls, destructibles, or dense triangle collision, will hit the edge of the
portable contract quickly.

Recommendation:

Rename product-facing claims around "full rigid-body solver parity" to
"promoted deterministic rigid-body slice" unless the repo adds solver-level
behavioral evidence for constraints, angular dynamics, stacking stability,
continuous contacts, and native/web screenshots or video.

Verification needed:

- Add visual/video evidence to the existing physics self-verification gate.
- Add one solver-stability fixture with stacked bodies and angular collision.
- Preserve diagnostics for unpromoted features.

### 4. Native UI Is Broad, But Platform UX and Rich UI Edges Remain Bounded

Severity: **P1/P2**

Evidence:

- `docs/STATUS.md:1414` says input/UI/platform polish is verified by
  `pnpm verify:input-ui-polish`.
- `docs/STATUS.md:1421` keeps virtual keyboard behavior, native italic
  rendering, 3D/world UI, render-to-texture UI, and broad packaged webview host
  behavior diagnostic/deferred.
- `docs/bevy-feature-parity.md:936` promotes editable text value/action events,
  while `docs/bevy-feature-parity.md:937` keeps IME composition diagnostic.
- `docs/bevy-feature-parity.md:940` keeps UI transforms and render-to-texture/
  3D-world UI diagnostic.
- `packages/ir/src/bevyCatalogResiduals.ts:105` marks editable text as a
  watchlist row, and `packages/ir/src/bevyCatalogResiduals.ts:109` through
  `packages/ir/src/bevyCatalogResiduals.ts:120` mark IME, viewport nodes,
  drag/drop nodes, and custom UI materials diagnostic-only.

Current pattern:

Retained UI has a large shared surface: layout, focus, actions, widgets,
images, rich text spans, accessibility metadata, minimap, UI effects, and
debug traces. Platform-native behavior and advanced UI embedding remain
deliberately constrained.

Impact:

Games with text entry, settings screens, drag/drop inventory, world-space UI,
or native desktop shell expectations may pass retained UI validation while
still requiring feature-specific diagnostics or fallback UX.

Recommendation:

Prioritize native UI work by player-visible frequency:

1. Runtime disabled/enabled state updates and focus narration.
2. Virtual keyboard/IME target-profile behavior.
3. UI drag/drop nodes distinct from world picking.
4. 3D/world UI and render-to-texture UI only after projection/picking semantics
   are formalized.

Verification needed:

- Web/native retained UI trace diff.
- At least one screenshot proof for visual features.
- Accessibility repair hints in generated-game QA.

### 5. Asset/glTF Fidelity Is Stronger as Inspection Metadata Than as Full Visual Consumption

Severity: **P2**

Evidence:

- `docs/STATUS.md:1585` through `docs/STATUS.md:1604` document promoted glTF
  metadata, inspection, reload classification, and web/Bevy conformance reports.
- `docs/STATUS.md:1605` keeps custom asset loaders, arbitrary runtime
  file/network access, visual promotion of anisotropy/specular tint without
  screenshot proof, and custom shader consumption of glTF custom attributes
  deferred.
- `packages/ir/src/bevyCatalogResiduals.ts:142` marks glTF extension processing
  diagnostic-only except known metadata transforms.
- `packages/ir/src/bevyCatalogResiduals.ts:243` rejects executable glTF
  extension processors and unknown metadata transforms.

Current pattern:

The pipeline preserves material extensions, texture transforms, extras, morph
names, and custom attributes well enough for inspection and reports. Full
runtime visual consumption is intentionally limited.

Impact:

Imported assets can look less faithful than their source GLB/glTF when they
depend on advanced material extensions or custom shader attributes.

Recommendation:

Promote one fidelity group at a time with screenshot proof:

- Texture transform and emissive strength.
- Clearcoat/transmission where both runtimes can visibly prove it.
- Anisotropy/specular tint only after tangent/feature-flag requirements are
  explicit.

Verification needed:

- `tn asset inspect` metadata fixture.
- Web/native material report diff.
- Screenshot region assertions for promoted visual fields.

### 6. Native Editor/Desktop Shell Is Explicitly Deferred

Severity: **P2**

Evidence:

- `docs/STATUS.md:1570` says the full native desktop editor shell is an
  explicit deferred boundary.
- `docs/bevy-feature-parity.md:1074` says current editor support is browser/CLI
  plus package inspection.

Current pattern:

The source-backed editor, CLI operations, and browser preview are active.
Native Bevy is a runtime adapter, not an editor host.

Impact:

This is not a runtime bug, but it matters for product positioning. Any claim of
native desktop editor parity would be inaccurate.

Recommendation:

Keep documentation language strict: "browser editor plus native runtime proof",
not "native editor", unless a future PRD builds a native shell.

Verification needed:

- No new runtime verification. This is a product-boundary/documentation guard.

## Supported Native Surface Observed

The Rust/Bevy runtime has real support or promoted report parity for:

- Bundle loading and world mapping.
- Camera mapping, render layers, active camera selection, and screenshot/export
  declarations.
- Basic lights, shadows metadata, render look/report rows, skybox/environment
  map reports, bloom contribution observations, and visual calibration gates.
- Standard material fields, promoted PBR texture slots, texture controls, alpha
  policy, emissive metadata, and constrained material presets.
- GLB/glTF model instances, animation clip metadata, skeletal playback,
  glTF scene handle observations, and fidelity reports.
- Retained UI spawning, focus/action queues, widgets, minimap, images, rich
  text spans, UI effects, accessibility metadata, and UI debug traces.
- Keyboard/mouse input, gamepad/touch snapshots, picking, pointer rays, and
  proof-harness keyboard injection.
- Primitive and bounded physics contracts, character controller traces, query
  services, sensors, mesh CCD metadata, axis locks, and joint metadata reports.
- Scripting host context/effect validation, portable helper bridge, resources,
  events, component diffs, prefab/hierarchy commands, persistence/reload
  reports, and runtime diagnostics.

## Missing or Diagnostic-Only Native/Rust Work

Highest priority:

- `tn playtest --target desktop` with parity to web playtest reports.
- Native screenshot and native recording CLI integration for gameplay proof.
- Native scenario execution for committed generated-game playtests.
- Runtime proof artifacts for physics video/screenshot, not only trace/contact
  diagrams.

Important but bounded:

- Visual DOF blur, motion blur, SSR/mirrors, volumetrics, deferred rendering,
  custom post passes, and advanced renderer selections.
- Runtime vertex mutation, CSG, storage-buffer geometry, raw/custom shaders,
  bindless resources, and custom GPU instance attributes.
- Full physics constraints, arbitrary triangle narrow phase, vehicle drivetrains,
  tire/friction models, soft bodies, ragdolls, dynamic navmesh rebakes, crowds,
  and off-mesh links.
- Virtual keyboard, IME composition, native italic text, UI viewport nodes,
  UI drag/drop nodes, custom UI materials, world/3D UI, and render-to-texture UI.
- Custom asset loaders/types, executable glTF extension processors, arbitrary
  runtime file/network streaming, and custom shader consumption of glTF custom
  attributes.
- Signed installers, app-store/mobile packaging, cloud/account saves, networking,
  replication, raw platform handles, and full native desktop editor shell.

## Recommended Implementation Order

1. **Native proof parity first.** Promote `tn playtest --target desktop`,
   screenshots, recordings, and one generated-game native scenario. This removes
   the largest confidence gap.
2. **Clarify physics language.** Keep the strong deterministic slice, but avoid
   "full solver" wording until solver-level runtime behavior is proven.
3. **Promote one visual effect end-to-end.** Pick DOF or shadow quality profiles
   and require SDK/IR validation, web mapping, Bevy mapping, screenshot proof,
   and fallback diagnostics.
4. **Close player-facing UI edges.** Runtime disabled updates, virtual keyboard/
   IME policy, and drag/drop UI nodes are more valuable than custom UI shaders.
5. **Improve imported asset fidelity by proof group.** Promote visual glTF
   extension consumption only with screenshot-backed evidence.

## Commands and Scans Run

- `rg --files` over runtime, IR, and docs areas.
- `rg -n "unsupported|deferred|pending|residual|Native Bevy|web runtime"` over
  runtime, IR, and parity docs.
- `jq` over `packages/ir/capabilities/threenative.capabilities.json`.
- `sed`/`nl` reads of `docs/STATUS.md`, `docs/bevy-feature-parity.md`,
  `packages/ir/src/bevyCatalogResiduals.ts`,
  `runtime-bevy/crates/threenative_runtime/src/proof_harness.rs`, and
  `packages/runtime-web-three/src/render.ts`.

No build or test suite was run. This was a source/documentation audit and added
only this Markdown report.

## Open Questions

- Should native playtest proof become a release gate before more generated-game
  examples are added?
- Should `docs/bevy-feature-parity.md` distinguish "implemented behavior" from
  "diagnostic boundary closed" more visibly? The current all-checked checklist
  can make diagnostic-only rows look complete at a glance.
- Should physics gates add camera screenshots/video artifacts before future
  claims about realistic physical interaction?
