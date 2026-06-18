# V8-01 Editor Project Snapshot and Structured Diffs

Complexity: 5 -> MEDIUM mode

## Context

**Problem:** Local editor work needs a structured project snapshot contract
before UI panels, save/load commands, or inspector editing can be trusted.
String-based diffs or hidden editor state would drift from the portable bundle
pipeline.

## Integration Points

- Entry point: `@threenative/ir` editor project helpers.
- Caller files: future editor save/load, inspector, CLI preview, and docs gates.
- User-facing: local editor saves and diffs must point to bundle-relative JSON
  paths and remain compatible with SDK/ECS/IR bundle validation.

## Solution

Add a minimal `threenative.editor-project` snapshot shape plus validation and
deterministic structured diff helpers. The snapshot stores bundle-relative JSON
documents, not generated runtime code or backend-private state.

## Execution Phases

#### Phase 1: Snapshot Contract - Editor data is structured.

**Files (max 5):**

- `packages/ir/src/editorProject.ts` - snapshot validation and diff helpers.
- `packages/ir/src/editorProject.test.ts` - focused tests.
- `packages/ir/src/index.ts` - public exports.
- `docs/PRDs/v8/README.md` - ticket index.
- `docs/STATUS.md` - implementation pointer.

**Implementation:**

- [x] Define a local editor project snapshot shape.
- [x] Validate schema, version, name, bundle-relative JSON document paths,
  structured JSON values, and metadata shape.
- [x] Produce deterministic add/remove/replace structured diffs with JSON
  pointer paths.

## Verification Strategy

- `pnpm --filter @threenative/ir test -- --run editor`
- `pnpm check:docs:v8`

## Acceptance Criteria

- [x] Editor project snapshots are structured and reject invalid local data.
- [x] Diffs are deterministic and point to bundle-relative JSON document paths.
- [x] The contract does not introduce online, collaboration, raw renderer, or
  direct Bevy authoring scope.
