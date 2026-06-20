# PRD: Web and Bevy Scripting Host Conformance

Complexity: 10 -> HIGH mode

Score basis: +2 cross-runtime behavior, +2 host context/service matrix, +2 conformance fixtures/effect logs, +1 QuickJS/native bridge diagnostics, +1 SDK/IR/docs drift tests, +1 runtime validation, +1 Rust test coverage.

## 1. Context

Script module references are only useful if web Three.js and native Bevy agree on what scripts can do. ThreeNative needs one compatibility matrix for SDK `ISystemContext`, IR service enums/schemas, compiler diagnostics, web host support, Bevy host support, and docs.

This PRD depends on:

- `script-module-references-and-manifest.md`

## 2. Goal

Make scripting host capabilities explicit, tested, and aligned across web and Bevy so editor/AI-authored systems behave portably.

## 3. Non-goals

- Do not expose Bevy or Three.js runtime objects to scripts.
- Do not support arbitrary DOM/Node/network/timer APIs.
- Do not make native and web use different authoring contracts.
- Do not merge this with visual editor implementation.

## 4. Required Compatibility Matrix

Track support for:

- component/resource/event queries;
- command effects;
- UI service;
- audio service;
- assets service;
- persistence/settings if promoted;
- system locals/module state policy;
- forbidden ambient APIs;
- diagnostics and effect logs.

## 5. Implementation Phases

### Phase 1: Matrix and drift gate

- [ ] Add a source-of-truth matrix for promoted script context services.
- [ ] Add tests that fail if SDK types, IR schema/service enums, web support, Bevy support, or docs drift.
- [ ] Document unsupported services explicitly.

Verification:

```bash
pnpm verify:conformance
pnpm check:docs
```

### Phase 2: Effect validation parity

- [ ] Ensure web rejects undeclared component/resource/event/command/service effects before mutation.
- [ ] Ensure Bevy rejects the same effects before mutation.
- [ ] Add shared fixtures and canonical effect logs.

Verification:

```bash
pnpm verify:conformance
cargo test -p threenative_runtime systems --manifest-path runtime-bevy/Cargo.toml
```

### Phase 3: Ambient API and state policy

- [ ] Define module-local state lifetime policy.
- [ ] Prove or diagnose hidden mutable module state consistently.
- [ ] Verify native QuickJS bridge does not expose forbidden ambient APIs.
- [ ] Keep runtime validation as defense-in-depth after compiler diagnostics.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run scripts
cargo test -p threenative_runtime systems --manifest-path runtime-bevy/Cargo.toml
```

## 6. Acceptance Criteria

- [ ] There is one documented compatibility matrix for scripting host services.
- [ ] SDK/IR/web/Bevy/docs drift is tested.
- [ ] Web and Bevy reject undeclared effects before mutation.
- [ ] Web and Bevy produce matching canonical effect observations for shared fixtures.
- [ ] Module-local state policy is explicit and tested or diagnosed.
- [ ] Forbidden ambient APIs are unavailable or rejected with stable diagnostics.
