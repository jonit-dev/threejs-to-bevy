# PRD: Editor Snapshot and Source Patch Bridge

Complexity: 9 -> HIGH mode

Score basis: +2 editor/source document boundary, +2 structured patch validation, +1 generated-vs-source document classification, +1 deterministic diffs, +1 runtime edit classification, +1 IR/editorProject tests, +1 docs.

## 1. Context

Current V8 editor snapshot work can inspect generated bundle documents, but generated bundle files are not durable editor source. Once authoring documents, CLI mutations, graph provenance, and script manifests exist, the editor snapshot contract must clearly distinguish source documents from generated documents and runtime-only state.

Depends on the earlier authoring PRDs, especially:

- `agent-safe-scene-authoring-cli.md`
- `authoring-graph-provenance-capture.md`
- `script-module-references-and-manifest.md`

## 2. Goal

Clarify and implement the bridge between source documents, generated bundle inspection, runtime observations, and validated source patches.

## 3. Non-goals

- Do not build the visual editor UI.
- Do not persist runtime handles as source.
- Do not make generated IR editable source.
- Do not support arbitrary TypeScript reverse-generation from runtime/IR.

## 4. Required Model

Documents must be classified as one of:

- `source`: durable authoring source documents/modules;
- `generated`: bundle/IR/debug artifacts; inspectable, not directly source-persistable;
- `runtime`: live preview/session state; never persisted directly;
- `derived`: computed views such as provenance maps or validation reports.

Source patches must use stable logical IDs and JSON/source paths, not runtime object IDs.

## 5. Implementation Phases

### Phase 1: Document classification

- [ ] Update `packages/ir/src/editorProject.ts` or successor to classify document kinds.
- [ ] Mark generated bundle docs as inspectable-only unless explicitly bridged to source.
- [ ] Add validation for document kind transitions.

Verification:

```bash
pnpm --filter @threenative/ir test -- --run editor
```

### Phase 2: Structured source patch format

- [ ] Add source patch schema with stable IDs, source document path, JSON pointer/source path, operation, value, and reload policy.
- [ ] Reject runtime handles, generated cache paths, computed transforms, and generated script code.
- [ ] Preserve deterministic structured diffs.

Verification:

```bash
pnpm --filter @threenative/ir test -- --run editor
```

### Phase 3: Runtime/live preview classification

- [ ] Classify preview edits as source-persistable, hot-reloadable runtime-only, full-reload-required, or rejected.
- [ ] Map runtime/IR entities back to authoring source path/declaration ID via provenance where available.
- [ ] Document unsupported live edit cases explicitly.

Verification:

```bash
pnpm check:docs
pnpm --filter @threenative/ir test -- --run editor
```

## 6. Acceptance Criteria

- [ ] Editor snapshots distinguish source, generated, runtime, and derived documents.
- [ ] Generated bundle docs are inspectable but not directly source-persistable.
- [ ] Source patches validate against stable IDs/source paths.
- [ ] Runtime handles/cache paths/generated script code are rejected in persisted source patches.
- [ ] Live preview edit classification is deterministic.
- [ ] Editor IR tests and docs gate pass.
