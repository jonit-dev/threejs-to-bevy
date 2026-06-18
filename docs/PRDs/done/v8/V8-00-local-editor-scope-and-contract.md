# V8-00 Local Editor Scope and Contract

Complexity: 4 -> MEDIUM mode

## Context

**Problem:** V8 needs a narrow local editor contract before UI or inspector work
starts. Without that boundary, editor state can become a hidden source of truth
or drift into online/collaboration scope too early.

## Integration Points

- Entry point: `pnpm check:docs:v8`.
- Caller files: docs gates, future editor project-data helpers, CLI preview and
  validation flows.
- User-facing: local editor saves must round-trip through the same portable
  SDK/ECS/IR bundle pipeline as code-authored projects.

## Solution

Define V8 as offline structured editor data plus local save/load, structured
diffs, entity/asset inspectors, bundle preview, and stable diagnostics. Keep
online services, collaboration, networking, replication, public plugins, raw
Three.js authoring, and direct Bevy authoring out of V8.

## Execution Phases

#### Phase 1: Scope Guard - V8 starts with explicit boundaries.

**Files (max 5):**

- `docs/PRDs/v8/README.md` - V8 front door.
- `docs/PRDs/v8/V8-00-local-editor-scope-and-contract.md` - scope contract.
- `scripts/check-docs-v8.mjs` - docs gate.
- `scripts/check-docs-v8.test.mjs` - docs tests.
- `package.json` - script registration.

**Implementation:**

- [x] Add a V8 PRD index and scope contract.
- [x] Require local editor, structured SDK/ECS/IR data, save/load, structured
  diffs, bundle preview, offline workflow, and diagnostics language.
- [x] Reject V8 claims for online, networking, replication, collaboration,
  hosted services, public plugins, raw Three.js authoring, and direct Bevy
  authoring.

## Verification Strategy

- `pnpm check:docs:v8`
- `node --test scripts/check-docs-v8.test.mjs`

## Acceptance Criteria

- [x] V8 has a discoverable PRD front door.
- [x] V8 scope is local/offline editor and inspector workflow only.
- [x] V8 docs require structured data, save/load, diffs, preview evidence, and
  diagnostics before implementation claims.
