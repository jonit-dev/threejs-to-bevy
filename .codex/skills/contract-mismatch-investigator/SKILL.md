---
name: contract-mismatch-investigator
description: Investigate contract drift between ThreeNative's Three.js web runtime and Bevy native runtime. Use when diagnosing mismatched rendering, scene, asset, ECS, physics, input, audio, UI, environment, bundle, schema, conformance, or verifier behavior across packages/runtime-web-three and runtime-bevy, especially when the task asks for data, probes, evidence, or drift detection between Three.js and Bevy.
---

# Contract Mismatch Investigator

Use this skill to turn a suspected Three.js/Bevy difference into evidence tied
to the IR bundle contract. The goal is to identify whether drift is caused by
authoring, compiler emission, schema validation, runtime mapping, runtime-only
defaults, or verification tooling.

## Investigation Workflow

1. Identify the contract surface:
   - IR/schema: `packages/ir`
   - compiler/bundle emission: `packages/compiler`
   - CLI verification: `packages/cli/src/verify`
   - web mapping: `packages/runtime-web-three`
   - native mapping: `runtime-bevy`
   - canonical examples and emitted bundles: `examples`
2. Build an evidence table before changing code. For each suspected field,
   capture the source file, emitted bundle path, Three.js consumer, Bevy
   consumer, existing tests, and observed mismatch.
3. Prefer structured bundle artifacts over screenshots for first-pass evidence:
   `world.ir.json`, `materials.ir.json`, `assets.manifest.json`,
   `environment.scene.json`, `target.profile.json`, and `manifest.json`.
4. Use screenshots only after confirming both runtimes consume the same
   portable data. Visual diffs are symptoms; contract diffs are causes.
5. If code changes are requested, add focused tests at the earliest layer that
   can catch the drift, then update runtime parity tests when shared behavior is
   affected.

## Commands

Use the narrowest relevant checks first:

```bash
pnpm tn -- build --project <project> --json
pnpm tn -- validate --project <project> --json
pnpm verify:conformance
pnpm verify:v3 -- --json
```

For current V3 visual evidence:

```bash
pnpm verify:v3
pnpm tn -- compare-images \
  artifacts/v3/screenshots/<bookmark>.threejs.png \
  artifacts/v3/screenshots/<bookmark>.bevy-gltf.png \
  --json
```

## Evidence Format

Report findings as a compact table:

| Surface | Contract Field | Three.js Path | Bevy Path | Evidence | Risk |
| --- | --- | --- | --- | --- | --- |
| rendering | material.alphaMode | file:line | file:line | test/artifact/result | user-visible drift |

Use stable file and line references when possible. Do not claim parity from
nonblank captures alone.

## Reference Data

Read `references/drift-probes.md` when selecting which fields, artifacts, and
tests to inspect. It lists the recommended drift probes by subsystem.
