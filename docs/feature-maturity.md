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
