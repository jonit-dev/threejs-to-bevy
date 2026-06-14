# verify:v7

`verify:v7` is not the aggregate V7 release gate yet. V7-01 starts the evidence
contract that later V7 feature tickets and the final V7 gate must use, and
V7-02 now adds the first runtime-specific fixed trace. V7-03 adds the first
animation/effects contract fixture and fixed web/native graph/particle trace.
V7-04 adds the first fixed web/native UI navigation trace.
V7-05 adds the first fixed web/native audio lifecycle trace.
V7-06 adds the first fixed web/native renderer/dense-content trace.

Current V7 conformance evidence starts with:

- `packages/ir/fixtures/conformance/v7-fixture-catalog.json`
- `packages/ir/fixtures/conformance/v7-advanced-physics-character/game.bundle`
- `packages/ir/fixtures/conformance/v7-animation-graphs-particles/game.bundle`
- `packages/ir/fixtures/conformance/v7-spatial-audio-buses/game.bundle`
- `packages/ir/fixtures/conformance/v7-renderer-dense-content/game.bundle`
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

The V7 fixture catalog maps V7-02 through V7-09 to baseline bundles, planned
accepted and rejected fixture bundle paths, expected target capabilities,
report artifact paths, and rejected diagnostic code families.

The current V7-03 fixture evidence is intentionally narrow: the
`v7-animation-graphs-particles` bundle validates constrained animation graph
metadata, animation event markers, and bounded particle emitters and exposes the
required `animation:graph`, `animation:state-machine`, `animation:events`, and
`particles:bounded-emitter` capabilities. The fixed trace compares web and
native parameter-driven graph transitions, active clip selection,
emitted event markers, and bounded particle spawn counts. This does not claim
full visual mixer playback, stop/state query APIs, richer event scheduling, IK,
retargeting, or rendered particle systems.

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

This document does not claim V7 runtime support. Runtime-specific V7 reports,
functional scene artifacts, packaging evidence, performance evidence, and the
final `pnpm verify:v7` aggregate command remain later V7 tickets.

The current V7-02 runtime evidence is intentionally narrow: the
`v7-advanced-physics-character` fixture compares web and native fixed traces for
portable primitive overlap and swept box shape-cast queries with collider layer
filters. Focused web and native runtime tests also pin deterministic ordering
for simultaneous collision and trigger contacts. The same fixture now compares a
fixed character trace for one-step axis movement, raycast-style grounding, and
stop-before-penetration blocking. This does not claim full solver parity,
dynamic mesh collider behavior, broader sensor coverage, slopes, steps, navmesh,
or full character interaction parity.
