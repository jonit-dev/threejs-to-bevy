# Feature Maturity Matrix

A feature is supported only when the public API, IR, validator, web runtime,
native runtime if claimed, and release gate agree. Schema existence alone does
not mean support.

V4 is scoped to a primitive scripting proof: one `scripts.bundle.js` running in
web JavaScript and native QuickJS with equivalent patch, event, command, and
service-call logs. `pnpm verify:v4` is the release gate for that scope. The
maturity rows below mark only the V4 portable scripting MVP as V4 supported;
broader native scripting APIs remain post-V4.

V5 adds required game-authoring ergonomics through `defineGame` and
`v5-game-starter`. Those features are supported as SDK/template composition over
existing portable contracts; they do not create a new Bevy runtime surface by
themselves.

## Post-V6 Gap Triage

V7 starts from this post-V6 gap triage table. A V7-promoted row is not supported
until its ticket has SDK/IR/compiler validation, web runtime evidence, Bevy
evidence where claimed, conformance observations, docs, diagnostics,
functional scene or template proof where applicable, artifacts under
`artifacts/v7`, and `verify:v7` coverage. Deferred rows must stay out of V7
completion claims. Never-portable rows must fail with stable diagnostics when
they appear in public authoring surfaces.

V7 is complete for the promoted rows below only through the aggregate
`verify:v7` evidence: focused conformance fixtures, Bevy workspace tests,
rendered web functional-scene screenshots, desktop package artifacts,
performance reports, diagnostics checks, and template smoke output. This does
not promote the deferred or never-portable rows.

| Candidate | V6 baseline | V7 disposition | Required proof before support is claimed |
| --- | --- | --- | --- |
| Shape casts, contact filtering, deterministic collision ordering, and stronger character blocking | V6-03 primitive colliders and V6-04 character controller metadata | V7-promoted | Shared physics/character fixtures, web and Bevy observations, diagnostics for unsupported filters or solver behavior, and functional-scene evidence. |
| Animation graphs, state machines, blend transitions, animation events, and bounded particles | V6-05 clip metadata and `animation.play` service-call traces | V7-promoted | Deterministic graph/event fixtures, rendered web evidence, Bevy animation observations where claimed, and diagnostics for unsupported graph/particle features. |
| UI focus order, gamepad/touch navigation, safe-area behavior, and richer retained layout | V6-06 retained HUD tree, DOM overlay, and Bevy UI mapping | V7-promoted | UI navigation fixtures, web interaction traces, native UI observations, accessibility-oriented diagnostics, and functional-scene UI evidence. |
| Spatial audio emitters/listeners, buses, volume routing, and looping lifecycle hardening | V6-07 local music and one-shot playback observations | V7-promoted | Audio routing fixtures, web and Bevy command observations, lifecycle diagnostics, and functional-scene audio evidence. |
| Runtime LOD swapping, native instancing parity, imported asset edge cases, and one narrow post-processing slice | V5/V6 renderer, asset, atmosphere, and dense-content evidence | V7-promoted | Renderer/content fixtures, screenshot or side-by-side artifacts, image metrics where practical, Bevy rendered artifacts or documented drift, and performance evidence. |
| Scripting lifecycle, deterministic state handoff, larger script-heavy fixtures, and justified system-local persisted state | V6 resource/event schedules and native/web QuickJS traces | V7-promoted | Cross-runtime effect logs, lifecycle fixtures, diagnostics for unsupported async/hot-reload behavior, and `verify:v7` evidence. |
| Desktop packaging, target-profile selection, packaged bundle loading, and platform diagnostics | V5/V6 CLI build/validate/verify gates | V7-promoted | Packaged artifact layout, target-profile diagnostics, desktop smoke evidence, and release-gate report links. |
| Web and native performance budgets for V7-scale scenes | V5 dense-content budgets plus V6 conformance reports | V7-promoted | Frame, entity, draw/instance, asset-load, script, UI, audio, and package-size reports under `artifacts/v7`. |
| Mobile packaging, broad shader graphs, arbitrary renderer plugins, editor workflows, online services, networking, replication, and collaboration | Outside the V6 product boundary | Deferred | Future PRDs only; V7 docs and gates must not imply support. |
| Raw Three.js authoring, direct Bevy authoring, public plugin APIs for runtime escape hatches, arbitrary npm execution inside portable scripts, and backend-only features without portable IR | Explicitly outside the ThreeNative authoring contract | Never portable | Stable diagnostics and docs explaining the portable alternative or deferral path. |

| Feature | SDK | IR | Validator | Web | Bevy | verify gate | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stable entities and transforms | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Supported |
| Box/sphere/plane primitives | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Supported |
| Perspective camera | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Supported |
| Ambient/directional lights | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Supported |
| Point/spot lights | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | Partial |
| Standard material scalar fields | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Supported |
| Material texture slots | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | Partial |
| glTF bundle-local loading | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | V3 supported |
| Environment scene IR | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | V3 supported with Bevy drift |
| V3 instancing/batching | ⚠️ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | Partial |
| V3 atmosphere metadata | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | Partial rendering parity |
| V3 first-person walkthrough | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | V3 web-supported |
| V3 walkability probes | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | V3 scoped support |
| UI IR | 🧪 | ✅ | ⚠️ | ❌ | ❌ | ❌ | Schema-only/post-V3 |
| Audio IR | 🧪 | ✅ | ⚠️ | ❌ | ❌ | ❌ | Schema-only/post-V3 |
| V4 portable scripting MVP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | V4 supported for primitive patch/event/command/service logs under `verify:v4` |
| V5 game root composition (`defineGame`) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | V5 supported as authoring sugar over existing scene/world/input/runtime-config contracts |
| V5 game starter template | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | V5 supported through `tn create --template v5-game-starter` and starter smoke in `verify:v5` |
| General gameplay systems | 🧪 | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ | Partial/post-V4 beyond the primitive scripting proof |
| Native QuickJS scripts | ⚠️ | ✅ | ✅ | n/a | ✅ | ✅ | V4 supported only for the declared portable context and primitive demo trace |
| Mobile packaging | ❌ | ❌ | ❌ | n/a | ❌ | ❌ | Future |
| Custom shaders/render graph | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Future |

## Glossary

- Supported: documented, implemented, validated, runtime-mapped, and
  release-gated for the stated scope.
- Partial: some pieces exist, but runtimes, validation, or gates do not agree.
- Schema-only: IR or type shape exists, but it is not a supported runtime
  feature.
- Experimental: implementation may exist but is not a release promise.
- Adapter-private: runtime-internal behavior that is not public API.
- V3-critical: required by [V3 Completion Checklist](releases/v3-completion.md).
- Post-V3: intentionally outside the V3 release gate.
- V4 supported: implemented and release-gated only for the primitive
  TypeScript/QuickJS scripting MVP described in [verify:v4](verify-v4.md).
- V5 supported: implemented and release-gated by [verify:v5](verify-v5.md) for
  the stated scope. For SDK ergonomics rows, `n/a` under Bevy means there is no
  new native runtime surface; Bevy support follows the emitted existing
  contracts.
