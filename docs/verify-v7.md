# verify:v7

`verify:v7` is the aggregate V7 release gate for the documented scope. It runs
the V7 docs gate, docs/gate script tests, selected TypeScript tests,
conformance, the functional scene/template smoke, Bevy workspace tests,
desktop packaging checks, performance budget reports, diagnostics checks, and a
final artifact-presence check before writing `artifacts/v7/verification-report.json`.
V7-01 starts the evidence contract that later V7 feature tickets use, and
V7-02 now adds the first runtime-specific fixed trace. V7-03 adds the first
animation/effects contract fixture and fixed web/native graph/particle trace.
V7-04 adds the first fixed web/native UI navigation trace.
V7-05 adds the first fixed web/native audio lifecycle trace.
V7-06 adds the first fixed web/native renderer/dense-content trace.
V7-07 adds the first fixed web/native scripting lifecycle trace.
V7-08 adds the first desktop package artifact and target-profile diagnostics
report.
V7-09 adds the first target-profile-aware performance budget reports.
V7-10 adds the maintained functional scene/template smoke and rendered web
artifacts.

Current V7 conformance evidence starts with:

- `packages/ir/fixtures/conformance/v7-fixture-catalog.json`
- `packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle`
- `packages/ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle`
- `packages/ir/fixtures/conformance/v7-spatial-audio-buses/game.bundle`
- `packages/ir/fixtures/conformance/v7-renderer-dense-content/game.bundle`
- `packages/ir/fixtures/conformance/v7-scripting-lifecycle/game.bundle`
- `pnpm verify:conformance`
- `artifacts/conformance/verification-report.json`
- `artifacts/conformance/v7-advanced-physics-character/web-effects.json`
- `artifacts/conformance/v7-advanced-physics-character/native-effects.json`
- `artifacts/conformance/v7-advanced-physics-character/effects-diff.json`
- `artifacts/conformance/v7-advanced-physics-character/web-character.json`
- `artifacts/conformance/v7-advanced-physics-character/native-character.json`
- `artifacts/conformance/v7-advanced-physics-character/character-diff.json`
- `artifacts/conformance/v7-animation-graphs-particles/web-animation.json`
- `artifacts/conformance/v7-animation-graphs-particles/native-animation.json`
- `artifacts/conformance/v7-animation-graphs-particles/animation-diff.json`
- `artifacts/conformance/v7-rich-ui-navigation/web-ui-navigation.json`
- `artifacts/conformance/v7-rich-ui-navigation/native-ui-navigation.json`
- `artifacts/conformance/v7-rich-ui-navigation/ui-navigation-diff.json`
- `artifacts/conformance/v7-spatial-audio-buses/web-audio-lifecycle.json`
- `artifacts/conformance/v7-spatial-audio-buses/native-audio-lifecycle.json`
- `artifacts/conformance/v7-spatial-audio-buses/audio-lifecycle-diff.json`
- `artifacts/conformance/v7-renderer-dense-content/web-environment-content.json`
- `artifacts/conformance/v7-renderer-dense-content/native-environment-content.json`
- `artifacts/conformance/v7-renderer-dense-content/environment-content-diff.json`
- `artifacts/conformance/v7-scripting-lifecycle/web-effects.json`
- `artifacts/conformance/v7-scripting-lifecycle/native-effects.json`
- `artifacts/conformance/v7-scripting-lifecycle/effects-diff.json`
- `pnpm verify:v7`
- `artifacts/v7/verification-report.json`
- `artifacts/v7/rust-test-report.json`
- `scripts/check-docs-v7.mjs`
- `docs/diagnostics.md`
- `artifacts/v7/packaging/verification-report.json`
- `artifacts/v7/packaging/desktop/game.bundle`
- `artifacts/v7/packaging/desktop/package.manifest.json`
- `artifacts/v7/packaging/desktop/runtime.args.json`
- `packages/ir/fixtures/conformance/v7-performance-budgets/game.bundle`
- `artifacts/conformance/v7-performance-budgets/web.report.json`
- `artifacts/conformance/v7-performance-budgets/bevy.report.json`
- `artifacts/conformance/v7-performance-budgets/comparison.report.json`
- `artifacts/v7/performance/web.report.json`
- `artifacts/v7/performance/bevy.report.json`
- `artifacts/v7/performance/comparison.report.json`
- `examples/v7-functional/dist/v7-functional.bundle`
- `examples/v7-functional/artifacts/verify/verification-report.json`
- `examples/v7-functional/artifacts/verify/frame-01.png`
- `examples/v7-functional/artifacts/verify/frame-02.png`
- `artifacts/v7/functional-package/desktop/v7-functional.bundle`
- `artifacts/v7/functional-package/desktop/package.manifest.json`
- `artifacts/v7/template-smoke/v7-functional`

The V7 fixture catalog maps V7-02 through V7-09 to baseline bundles, planned
accepted and rejected fixture bundle paths, expected target capabilities,
report artifact paths, and rejected diagnostic code families.

The current V7-03 fixture evidence is intentionally narrow: the
`v7-animation-graphs-particles` bundle validates constrained animation graph
metadata, animation event markers, and bounded particle emitters and exposes the
required `animation:graph`, `animation:state-machine`, `animation:events`, and
`particles:bounded-emitter` capabilities. The fixed trace compares web and
native parameter-driven graph transitions, active clip selection,
queued animation event payloads, and bounded particle spawn counts. This does
not claim full visual mixer playback, stop/state query APIs, richer event
scheduling beyond the fixed trace, IK, retargeting, or rendered particle
systems.

The current V7-04 fixture evidence is intentionally narrow: the
`v7-rich-ui-navigation` bundle validates focus order, navigation links,
safe-area metadata, and UI input action refs, then compares a fixed web/native
logical trace for focus movement and activation. Keyboard, gamepad, pointer,
and touch are treated as adapter inputs that lower into the same portable
logical events; rich platform widgets, broad device coverage, and styling/layout
parity remain later work.

The current V7-05 fixture evidence is intentionally narrow: the
`v7-spatial-audio-buses` bundle validates portable bus routing,
listener/emitter metadata, event-triggered one-shots, and looped music, then
compares a fixed web/native lifecycle trace for loop start/stop cleanup and
routed command reports. Real spatial attenuation, mixer effects,
streaming/network audio, platform handles, and richer audio services remain
unsupported or later work.

The current V7-06 fixture evidence is intentionally narrow: the
`v7-renderer-dense-content` bundle validates environment source assets,
bounded LOD metadata, imported transforms, and repeated scatter placements,
then compares a fixed web/native trace for runtime LOD selection and
model-backed repeated-instance observations. Actual renderer-level native
instancing, visual LOD mesh swapping, portable post-processing, and arbitrary
material overrides remain deferred or rejected.

The current V7-07 fixture evidence is intentionally narrow: the
`v7-scripting-lifecycle` bundle validates deterministic lifecycle metadata and
compares a fixed web/native effect log for startup, fixedUpdate, update, and
postUpdate resource handoff, queued events, spawn/despawn commands, and an
`animation.play` service call. Async systems, timers, arbitrary npm/platform
APIs, hidden system-local persisted state, state-preserving hot reload, and full
dynamic scene reconciliation remain unsupported or later work.

The current V7-08 packaging evidence is intentionally narrow: `tn package
--target desktop --bundle <path>` validates an existing bundle, requires
`target.profile.json` to include `desktop` and no unsupported package targets,
copies the bundle into a predictable desktop artifact directory, and writes a
package manifest plus Bevy runtime argument file. `pnpm verify:v7` records those
paths and checks the expected unsupported mobile-target diagnostic. Signed
installers, mobile app-store packaging, web-store distribution, online
publishing, hosted services, and platform-specific entitlements remain out of
scope.

The current V7-09 performance evidence is intentionally narrow:
`v7-performance-budgets` validates target-profile thresholds and compares fixed
web/native-style metric reports for frame timing, load time, draw/entity counts,
asset counts, and package size. Hard failures and warnings are separated, and
`TN_PERF_*` diagnostics include metric, measured value, threshold, and artifact
path. These are deterministic budget reports, not live browser profiler or
native platform-profiler captures; script/UI/audio timing breakdowns and larger
scene budget tuning remain later work.

The current V7-10 functional evidence is intentionally narrow:
`examples/v7-functional` and `templates/v7-functional` demonstrate the
SDK-authored promoted surface together: scene primitives, local model/audio
assets, physics colliders, character controller metadata, input, retained UI,
audio, resources/events, scripted event writes, and `animation.play`
service effects. `pnpm verify:v7` builds and validates the example, captures web
visual screenshots through `tn verify`, packages a local desktop artifact, and
create/build/validates the template smoke project. Advanced physics query
parity, animation graph/particle metadata, spatial bus routing, dense renderer
content, lifecycle replay, packaging diagnostics, and performance budgets remain
anchored in the focused V7 conformance fixtures.

The final V7-11 gate links all required release evidence in
`artifacts/v7/verification-report.json`: docs and diagnostics inputs,
functional bundle and rendered web screenshots, packaged desktop artifacts,
template smoke output, `artifacts/conformance/verification-report.json`,
`artifacts/v7/rust-test-report.json`, `artifacts/v7/packaging/verification-report.json`,
and `artifacts/v7/performance/comparison.report.json`. A passing report uses
`TN_VERIFY_V7_OK`; a failing report uses `TN_VERIFY_V7_FAILED` with the first
failed step surfaced as `TN_VERIFY_V7_STEP_FAILED`.

Conformance mismatch diagnostics must localize drift with:

- `fixture`
- `path`
- `expectedRuntime`
- `actualRuntime`
- `expected`
- `actual`
- `bundlePath`
- `artifactPath`
- `artifactPaths`
- stable diagnostic `code`

This document does not claim full V7 runtime support beyond the documented
promoted slices. The aggregate `pnpm verify:v7` gate is the completion evidence
for those slices and keeps deferred or never-portable scope out of V7 support
claims.

The current V7-02 runtime evidence is intentionally narrow: the
`v7-advanced-physics-character` fixture compares web and native fixed traces for
portable primitive overlap and swept box shape-cast queries with collider layer
filters. Focused web and native runtime tests also pin deterministic ordering
for simultaneous collision and trigger contacts. The same fixture now compares a
fixed character trace for one-step axis movement, raycast-style grounding, and
stop-before-penetration blocking. This does not claim full solver parity,
dynamic mesh collider behavior, broader sensor coverage, slopes, steps, navmesh,
or full character interaction parity.
