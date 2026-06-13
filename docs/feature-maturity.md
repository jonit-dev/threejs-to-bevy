# Feature Maturity Matrix

A feature is supported only when the public API, IR, validator, web runtime,
native runtime if claimed, and release gate agree. Schema existence alone does
not mean support.

V4 is scoped to a primitive scripting proof: one `scripts.bundle.js` running in
web JavaScript and native QuickJS with equivalent patch, event, command, and
service-call logs. The maturity rows below must not imply broader native
scripting support until that gate exists.

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
| Gameplay systems | 🧪 | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | Post-V3 |
| Native QuickJS scripts | ❌ | ⚠️ | ⚠️ | n/a | ❌ | ❌ | V4 planned; docs scope gated by `check:docs:v4` |
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
