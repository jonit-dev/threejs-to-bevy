# Diagnostics

Diagnostics should be stable, actionable, and specific enough for humans and AI
agents to repair the failing layer without guessing.

## Shape

Prefer diagnostics with:

- `code`
- `severity`
- `message`
- file or bundle path when available
- affected entity, asset, material, system, or bookmark ID when available
- suggested fix when the local diagnostic model supports it

## CLI JSON Streams

When a CLI command runs with `--json`, machine-readable success and failure
payloads are written to stdout. Stderr is reserved for non-JSON human-readable
errors and unexpected process-level failures.

## Namespaces

| Namespace | Meaning |
| --- | --- |
| `TN_SDK_*` | Unsupported SDK/API capture or authoring issue. |
| `TN_IR_*` | Schema, reference, or capability failure. |
| `TN_ASSET_*` | Missing, unsupported, invalid, or over-budget asset. |
| `TN_MAT_*` | Material, texture, alpha, or color-space failure. |
| `TN_SCENE_*` | Environment scene, scatter, path, bookmark, or placement issue. |
| `TN_RUNTIME_*` | Adapter load or runtime failure. |
| `TN_BEVY_*` | Bevy adapter-specific mapped diagnostic. |
| `TN_WEB_*` | Web adapter-specific mapped diagnostic. |
| `TN_PERF_*` | Budget or performance warning/error. |
| `TN_VERIFY_*` | Screenshot, walkthrough, visual, or release-gate failure. |
| `TN_SCRIPT_*` | Portable scripting or future QuickJS errors. |

Existing code currently uses mixed underscore-style codes such as
`TN_V3_SCENE_MISSING_ENVIRONMENT` and `TN_BEVY_SYSTEM_HOST_UNSUPPORTED`. Keep
new codes stable and domain-specific; do not replace existing emitted codes
without a migration reason.

## V3 Priority Domains

For V3, prioritize stable diagnostics in:

- `TN_ASSET_*`
- `TN_MAT_*`
- `TN_SCENE_*`
- `TN_PERF_*`
- `TN_VERIFY_*`
- `TN_RUNTIME_*`

## V4 Script Diagnostics

V4 portable scripting diagnostics use `TN_SCRIPT_*` codes. They should fail
before runtime when a system references DOM/browser globals, workers, timers,
Node/process/filesystem APIs, arbitrary npm dependencies, undeclared component
writes, undeclared command/event permissions, undeclared service calls, or
bundle syntax outside the native loadability subset.

V4 runtime and release-gate diagnostics also include adapter and verifier codes
such as `TN_WEB_SYSTEM_*`, `TN_BEVY_SYSTEM_*`, and
`TN_V4_EFFECT_LOG_*`. Effect-log mismatch diagnostics should identify the
stage/system/effect path and point to `tools/verify/artifacts/milestones/v4/effects-diff.json`.

## V5 Diagnostic Normalization

V5 keeps existing emitted codes stable. In particular, do not rewrite
underscore-style IR codes such as `TN_IR_DUPLICATE_ENTITY_ID` into hyphenated
variants in compiler or CLI wrappers. Compatibility aliases such as
`TN-IR-2104` and `TN-IR-2105` may remain where they already exist for
compiler-level missing material or mesh references.

V5 verifier and native diagnostic ranges:

- `TN_CONFORMANCE_*` for shared fixture and runtime observation mismatches.
- `TN_DOCS_V5_*` for V5 documentation-gate failures.
- `TN_VERIFY_V5_*` for the final V5 release-gate report.
- `TN_BEVY_*` for Bevy adapter diagnostics, including native material,
  rendering, asset, environment, and scripting failures.
- `TN_WEB_*` for web runtime diagnostics emitted by runtime-web-three.

V5 high-volume diagnostics should include `code`, `severity`, `message`, and a
bundle-relative `path` or file path. Add `suggestion` when the failing layer has
enough context to propose a concrete fix, especially for missing files, invalid
asset refs, missing material/mesh refs, texture slots, visibility fields, and
script/system permission mismatches.

## V6 Diagnostic Hardening

V6 keeps upstream diagnostic metadata intact through compiler and CLI JSON
output. When IR validation supplies `severity`, `path`, `suggestion`, `limit`,
or `value`, wrappers should preserve those fields instead of replacing the
diagnostic with a generic build or validation failure.

V6 promoted feature ranges:

- `TN_IR_SYSTEM_*` for resource/event permission, schedule, schema, and service
  declaration failures.
- `TN_IR_PHYSICS_*` for collider, rigid-body, trigger, layer/mask, and
  unsupported solver-scope failures.
- `TN_IR_CHARACTER_*` for controller dependency, input reference, speed,
  blocking, and deferred grounding/navigation failures.
- `TN_IR_ANIMATION_*` for clip metadata, unsupported graph/blend/IK/particle
  fields, and invalid playback metadata.
- `TN_IR_UI_*` for retained UI node, action, duplicate ID, and unsupported
  adapter-private fields.
- `TN_IR_AUDIO_*` and `TN_AUDIO_*` for audio IR reference failures and runtime
  playback/asset diagnostics.
- `TN_BEVY_*`, `TN_WEB_*`, and `TN_RUNTIME_*` for target-specific adapter drift
  or runtime failures that cannot be represented as IR validation errors.

## V7 Release Diagnostics

V7 keeps the V5/V6 diagnostic shape and adds release-gate evidence ranges:

- `TN_DOCS_V7_*` for V7 PRD index, maturity, status/parity, and unsupported
  scope-claim failures.
- `TN_VERIFY_V7_*` for the aggregate V7 gate, including
  `TN_VERIFY_V7_STEP_FAILED` for the first failing step and
  `TN_VERIFY_V7_OK` / `TN_VERIFY_V7_FAILED` report codes.
- `TN_CONFORMANCE_*` for fixture catalog, web/native trace, and artifact drift
  reported by the shared conformance gate.
- `TN_PACKAGE_*` for desktop package command and target-profile diagnostics.
- `TN_PERF_*` for budget errors and warnings with metric, actual, threshold,
  and artifact path fields.
- `TN_IR_SYSTEM_*`, `TN_IR_PHYSICS_*`, `TN_IR_CHARACTER_*`,
  `TN_IR_ANIMATION_*`, `TN_IR_UI_*`, `TN_IR_AUDIO_*`,
  `TN_IR_ENVIRONMENT_*`, and `TN_SCRIPT_*` for V7 promoted or rejected
  portable-contract validation failures.

## Guidance

- Do not collapse asset, scene, and runtime failures into generic compiler
  errors when a domain-specific diagnostic is possible.
- Include bundle-relative paths for V3 asset and scene failures.
- Include bookmark IDs for screenshot and camera verification failures.
- Include target profile and measured value for budget failures.
