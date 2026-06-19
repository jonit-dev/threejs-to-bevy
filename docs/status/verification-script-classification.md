# Verification Script Classification

Updated: 2026-06-19

This table classifies the root `package.json` `verify*` and `check*` commands
for the verification strategy work. The owner is the target home for the proof,
not necessarily where all implementation code already lives today.

Classification values:

- `test`: ordinary package or repo test/check path.
- `focused-gate`: cross-package, cross-runtime, visual, or durable-artifact proof.
- `conformance-gate`: shared IR contract parity across runtimes.
- `release-gate`: aggregation or release-policy evidence.
- `legacy-alias`: historical milestone command retained for compatibility.
- `delete`: remove after equivalent test or gate coverage exists.

| Command | Current implementation | Owner | Classification | Replacement or target | Verifier reason / quality requirement |
| --- | --- | --- | --- | --- | --- |
| `check:docs` | `tools/verify/dist/cli/check-docs.js` | `tools/verify` docs gate | `focused-gate` | Keep | Repo-wide docs drift spans package boundaries and protects public workflow/status accuracy. |
| `check:names` | `scripts/check-current-names.mjs` | repo naming policy | `focused-gate` | Keep; move implementation under `tools/verify` later | Repo-wide migration policy cannot be package-local; protects canonical command/folder naming. |
| `check:docs:v1` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v2` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v3` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v4` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v5` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v6` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v7` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `check:docs:v8` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `check:docs` | Compatibility alias with deprecation diagnostics. |
| `verify` | root build/typecheck/lint/test chain | workspace packages | `test` | Keep | Ordinary workspace correctness gate; no verifier reason needed. |
| `verify:smoke` | root profile command | repo naming/docs policy | `test` | Keep | Fast local proof for naming and docs drift before broader package or runtime verification. |
| `verify:changed` | root profile command | workspace packages | `test` | Keep | Default changed-code profile for package build/typecheck/lint/test coverage. |
| `verify:focused` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Stable entry point for one named capability gate with standalone setup. |
| `verify:all` | `verify` plus `verify:conformance` | workspace plus conformance | `conformance-gate` | Keep as broad local proof | Adds shared web/native contract proof to package tests. |
| `verify:release` | `tools/verify/dist/cli/release.js` | `tools/verify` release gate | `release-gate` | Keep | Aggregates required focused, conformance, visual, sample-scene, and artifact evidence. |
| `verify:full` | root profile command | workspace plus release aggregation | `release-gate` | Keep | Full compatibility sweep: workspace proof, conformance, and release evidence. |
| `verify:conformance` | `tools/verify/dist/cli/conformance.js` | shared IR conformance | `conformance-gate` | Keep | Compares the same IR fixtures across web Three.js and native Bevy. |
| `verify:distribution` | `scripts/verify-distribution-release.mjs` | CLI/package distribution verifier | `focused-gate` | Move implementation under `tools/verify` | Proves packed package install, generated project build, and native runtime distribution artifacts. |
| `verify:v2` | `scripts/verify-v2.mjs` | legacy milestone compatibility | `legacy-alias` | `verify:release` or `verify:conformance` plus relevant package tests | Historical aggregate; keep only while compatibility is required. |
| `verify:v3` | `scripts/verify-v3.mjs` | legacy milestone compatibility | `legacy-alias` | `verify:release` or targeted focused gates | Historical aggregate; keep only while compatibility is required. |
| `verify:baseline:visual-parity` | `scripts/verify-baseline-visual-parity.mjs` | baseline visual parity verifier | `focused-gate` | Keep; move implementation under `tools/verify` | Produces durable web/Bevy screenshot parity evidence across checkpoint scenes. |
| `verify:parity:smoke` | `scripts/verify-parity-smoke.mjs` | parity smoke verifier | `focused-gate` | Keep | Fast cross-runtime screenshot smoke and hook evidence. |
| `verify:parity:push` | `scripts/verify-parity-push.mjs` | parity push verifier | `focused-gate` | Keep | Full seven-scene baseline visual parity; run in CI or before release. |
| `verify:pre-push` | `scripts/verify-pre-push.mjs` | pre-push hook verifier | `focused-gate` | Keep | Orchestrates workspace verify, conformance, and seven-scene parity with shared setup (~2–3 min target). |
| `verify:v4` | `scripts/verify-v4.mjs` | legacy milestone compatibility | `legacy-alias` | `verify:release` or targeted focused gates | Historical aggregate; keep only while compatibility is required. |
| `verify:v5` | `scripts/verify-v5.mjs` | legacy milestone compatibility | `legacy-alias` | `verify:release` or targeted focused gates | Historical aggregate; keep only while compatibility is required. |
| `verify:v6` | `scripts/verify-v6.mjs` | legacy milestone compatibility | `legacy-alias` | `verify:release` or targeted focused gates | Historical aggregate; keep only while compatibility is required. |
| `verify:v7` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `verify:release` | Compatibility alias with deprecation diagnostics. |
| `verify:v8:overlay` | `scripts/verify-v8-overlay-webview.mjs` | overlay verifier | `focused-gate` | Keep until covered by canonical focused gate | Proves optional overlay bundle/runtime bridge behavior and unsupported-host diagnostics. |
| `verify:v8:camera-views` | `scripts/verify-v8-camera-views.mjs` | camera/multi-view verifier | `focused-gate` | Keep until covered by canonical focused gate | Produces visual/runtime evidence for camera helpers, viewports, render targets, and screenshots. |
| `verify:v8:color-parity` | `scripts/verify-v8-color-parity.mjs` | color parity verifier | `focused-gate` | Keep until folded into visual parity profile | Protects calibrated color and tone screenshot evidence. |
| `verify:v8:material-parity` | `scripts/verify-v8-material-parity.mjs` | material parity verifier | `focused-gate` | Keep until folded into visual parity profile | Protects web/Bevy material and texture parity artifacts. |
| `verify:v8:animation-transform` | `scripts/verify-v8-animation-transform-trace.mjs` | animation trace verifier | `focused-gate` | Keep until covered by animation residual gate | Protects runtime transform animation trace parity. |
| `verify:v8:animation-controls` | `scripts/verify-v8-animation-controls.mjs` | animation controls verifier | `focused-gate` | Keep until covered by animation residual gate | Protects animation control runtime evidence and diagnostics. |
| `verify:v8:rigid-body-primitive` | `scripts/verify-v8-rigid-body-primitive-trace.mjs` | physics trace verifier | `focused-gate` | Keep until covered by physics residual gate | Protects primitive rigid-body trace parity. |
| `verify:v8:asset-load-gltf-inspection` | `scripts/verify-v8-asset-load-gltf-inspection.mjs` | asset loading verifier | `focused-gate` | Keep until covered by asset workflow gate | Protects generated glTF asset inspection evidence. |
| `verify:v8:rendering-quality` | `scripts/verify-v8-rendering-quality.mjs` | rendering quality verifier | `focused-gate` | Keep until folded into rendering residuals | Protects screenshot and renderer quality artifacts. |
| `verify:v9:skeletal-animation` | `scripts/verify-v9-skeletal-animation.mjs` | animation verifier | `focused-gate` | Keep until folded into animation residuals | Protects skeletal animation runtime evidence. |
| `verify:v9:animation-state` | `scripts/verify-v9-animation-state.mjs` | animation-state verifier | `focused-gate` | Keep; release-required | Protects web/native animation service state traces and diff artifact. |
| `verify:v9:animation-blending` | `scripts/verify-v9-animation-blending.mjs` | animation-blending verifier | `focused-gate` | Keep; release-required | Protects bounded crossfade blend traces and event ordering evidence. |
| `verify:v9:animation-particles` | `scripts/verify-v9-animation-particles.mjs` | animation-particles verifier | `focused-gate` | Keep; release-required | Protects rendered particle count and web/native visual evidence. |
| `verify:v9:physics-character` | `scripts/verify-v9-physics-character.mjs` | physics-character verifier | `focused-gate` | Keep; release-required | Protects character physics conformance and runtime report artifacts. |
| `verify:v9:assets-gltf-scene-workflow` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Proves full asset workflow through bundle and runtime artifacts. |
| `verify:v9:rendering-lights` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Produces rendering-light visual/runtime evidence required by release. |
| `verify:v9` | `scripts/legacy-script-alias.mjs` | legacy alias table | `legacy-alias` | `verify:release` | Compatibility alias with deprecation diagnostics. |
| `check:quality:v9` | `scripts/check-v9-quality-gates.mjs` | release quality catalog | `release-gate` | Keep until release owns all catalog checks | Protects the release-focused gate list and required V9 evidence wiring. |
| `verify:v10` | `scripts/verify-v10.mjs` | legacy planning aggregate | `legacy-alias` | `verify:release` plus focused V10 gates | Temporary planning aggregate; avoid promoting as a product front door. |
| `verify:v10:visual-calibration` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects calibrated visual evidence across color, materials, lights, atmosphere, post, and geometry. |
| `verify:v10:advanced-physics` | `scripts/verify-v10-advanced-physics.mjs` | advanced physics verifier | `focused-gate` | Keep until folded into physics residual profile | Protects diagnostic boundaries and evidence for advanced physics residuals. |
| `verify:v10:debug-draw` | `scripts/verify-v10-debug-draw.mjs` | debug draw verifier | `focused-gate` | Keep until folded into tooling/debug profile | Protects debug rendering evidence and diagnostics. |
| `verify:v10:editor-panels` | `scripts/verify-v10-editor-panels.mjs` | editor panels verifier | `focused-gate` | Keep until editor workflow is reclassified | Protects bounded editor panel evidence. |
| `verify:v10:editor-property-editing` | `scripts/verify-v10-editor-property-editing.mjs` | editor property verifier | `focused-gate` | Keep until editor workflow is reclassified | Protects editor property editing artifacts and diagnostics. |
| `verify:v10:editor-tools` | `scripts/verify-v10-editor-tools.mjs` | editor tools verifier | `focused-gate` | Keep until editor workflow is reclassified | Protects editor tool evidence. |
| `verify:v10:emissive-bloom` | `scripts/verify-v10-emissive-bloom.mjs` | emissive/bloom verifier | `focused-gate` | Keep until folded into visual calibration/rendering residuals | Protects visual evidence for emissive and bloom parity. |
| `verify:v10:native-instancing` | `scripts/verify-v10-native-instancing.mjs` | native instancing verifier | `focused-gate` | Keep until folded into rendering residuals | Protects native instancing evidence and diagnostics. |
| `verify:v10:native-ui-effects` | `scripts/verify-v10-native-ui-effects.mjs` | native UI effects verifier | `focused-gate` | Keep until folded into input/UI polish | Protects native UI effect evidence. |
| `verify:v10:native-ui-images` | `scripts/verify-v10-native-ui-images.mjs` | native UI images verifier | `focused-gate` | Keep until folded into input/UI polish | Protects native UI image evidence. |
| `verify:v10:native-rich-text` | `scripts/verify-v10-native-rich-text.mjs` | native rich text verifier | `focused-gate` | Keep until folded into input/UI polish | Protects native rich text evidence. |
| `verify:v10:post-antialiasing` | `scripts/verify-v10-post-antialiasing.mjs` | post/AA verifier | `focused-gate` | Keep until folded into visual calibration/rendering residuals | Protects post-processing and antialiasing evidence. |
| `verify:v10:ecs-tags-groups` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects shared ECS tag/group conformance and Bevy runtime tests. |
| `verify:scene-lifecycle` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects scene lifecycle IR, transition diagnostics, and runtime traces. |
| `verify:animation-physics-residuals` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects promoted animation, physics, and navigation residual evidence. |
| `verify:input-ui-polish` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects input/UI platform runtime evidence and diagnostics. |
| `verify:persistence-reload` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects persistence, settings, reload policy, and migration evidence. |
| `verify:production-hardening` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects production audio, diagnostics, profiling, and packaging evidence. |
| `verify:rendering-residuals` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects rendering/material/geometry residual evidence. |
| `verify:runtime-gameplay-host` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects gameplay host runtime semantics and trace parity. |
| `verify:bundle-safety-hardening` | `tools/verify/dist/cli/run.js` | focused gate dispatcher | `focused-gate` | Keep | Protects bundle safety, malformed artifact diagnostics, and runtime robustness evidence. |

## Follow-Up Migration Notes

- Direct `scripts/*.mjs` focused gates should move behind typed
  `tools/verify/src` modules or the focused dispatcher before script deletion.
- Historical milestone aggregates should become legacy aliases with stable
  replacements, or be removed after package tests and release gates cover their
  remaining assertions.
- Pure script tests stay valuable during migration, but their long-term home is
  package-owned `*.test.ts`, `*.test.mjs`, or Rust tests when they do not need
  cross-runtime or durable-artifact proof.
