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
stage/system/effect path and point to `artifacts/v4/effects-diff.json`.

## Guidance

- Do not collapse asset, scene, and runtime failures into generic compiler
  errors when a domain-specific diagnostic is possible.
- Include bundle-relative paths for V3 asset and scene failures.
- Include bookmark IDs for screenshot and camera verification failures.
- Include target profile and measured value for budget failures.
