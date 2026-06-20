# PRD: Authoring Graph and Provenance Capture

Complexity: 10 -> HIGH mode

Score basis: +2 compiler capture refactor, +2 provenance/diagnostics model, +2 graph normalization before IR emit, +1 source ownership boundaries, +1 duplicate/conflict checks, +1 deterministic output, +1 tests across capture/emit.

## 1. Context

The umbrella PRD `editor-ready-modular-authoring-and-scripting-architecture.md` requires a captured authoring graph between source documents/modules and generated IR. The first slice, `agent-safe-scene-authoring-cli.md`, establishes safe authoring operations and validation. This PRD makes compiler capture preserve source ownership and provenance before flattening to runtime IR.

Today compiler capture mostly imports the project root and normalizes SDK objects directly into generated bundle documents. That loses useful source ownership and makes editor/AI diagnostics weaker than they need to be.

## 2. Goal

Introduce `AuthoringGraph` as a compiler-owned intermediate model that records declarations, references, ownership, source paths, and diagnostics before IR emission.

## 3. Non-goals

- Do not make `AuthoringGraph` a runtime contract.
- Do not make web or Bevy consume the graph.
- Do not replace the IR bundle.
- Do not implement the full visual editor.
- Do not require all existing one-file projects to migrate immediately.

## 4. Required Model

Add compiler-side types for:

- project root;
- lifecycle scene modules;
- visual/entity declarations;
- prefabs and prefab instances;
- components/resources/events/systems;
- input/UI/audio/assets/materials;
- references between declarations;
- provenance for emitted runtime artifacts.

Suggested files:

```txt
packages/compiler/src/authoring/graph.ts
packages/compiler/src/authoring/provenance.ts
packages/compiler/src/authoring/diagnostics.ts
packages/compiler/src/authoring/normalize.ts
packages/compiler/src/authoring/capture-project.ts
```

## 5. Implementation Phases

### Phase 1: Graph types and deterministic normalization

- [ ] Define graph node and edge types.
- [ ] Define provenance shape: source module path, declaration ID, declaration kind, owner scene, optional source span/path.
- [ ] Add deterministic sorting for nodes, edges, and diagnostics.
- [ ] Add unit tests for stable graph output.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run authoring
```

### Phase 2: Capture integration

- [ ] Make `captureEntry()` or successor return `{ root, graph, diagnostics }`.
- [ ] Preserve existing compatibility for callers that only need `root`.
- [ ] Ensure relative module capture remains supported.
- [ ] Attach compatibility provenance for one-file projects.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run capture
```

### Phase 3: Conflict diagnostics before flattening

- [ ] Diagnose duplicate entity/material/system/resource IDs with source paths.
- [ ] Diagnose conflicting declarations before emit.
- [ ] Surface graph diagnostics through compiler errors without losing structured details.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run authoring
pnpm --filter @threenative/compiler test -- --run capture
```

### Phase 4: Emit provenance hooks

- [ ] Preserve enough provenance for emitted IR/debug metadata or diagnostics.
- [ ] Do not expand runtime IR with editor-only baggage unless needed and versioned.
- [ ] Ensure generated bundle remains accepted by web and Bevy.

Verification:

```bash
pnpm verify:conformance
```

## 6. Acceptance Criteria

- [ ] Capture produces an authoring graph with deterministic nodes and references.
- [ ] Every graph node has source/provenance metadata where practical.
- [ ] One-file authoring still works through compatibility provenance.
- [ ] Duplicate/conflicting declarations fail before IR flattening.
- [ ] Diagnostics include stable code, severity, source path/path pointer, and useful message.
- [ ] Web and Bevy still consume the generated IR bundle, not the graph.
- [ ] Focused compiler tests and conformance pass.
