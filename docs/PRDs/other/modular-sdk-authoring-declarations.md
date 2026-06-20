# PRD: Modular SDK Authoring Declarations

Complexity: 10 -> HIGH mode

Score basis: +2 SDK public API design, +2 compatibility with existing one-file authoring, +2 source metadata/editor ownership hooks, +1 prefab/resource/input/UI/audio declarations, +1 tests across SDK/compiler, +1 docs/templates impact, +1 migration diagnostics.

## 1. Context

ThreeNative currently lets users build games through TypeScript SDK objects and ECS declarations. That is good, but canonical projects can still collapse into one huge `src/game.ts`. After the authoring CLI/core and compiler authoring graph exist, the SDK needs explicit modular declarations that are easy for humans, AIs, and a future editor to reason about.

This PRD depends on:

- `agent-safe-scene-authoring-cli.md`
- `authoring-graph-provenance-capture.md`

## 2. Goal

Add public SDK APIs/data-first builders for modular authoring while preserving existing `defineGame`, `defineScene`, `Scene`, `World`, and one-file project compatibility.

## 3. Non-goals

- Do not remove existing one-file authoring.
- Do not expose Bevy/Three/runtime handles in source declarations.
- Do not make generated IR editable source.
- Do not implement full editor UI.
- Do not force JSON-only authoring; TypeScript declarations remain source.

## 4. Proposed APIs

Add or evolve declarations for:

- project composition roots;
- scene modules;
- entity declarations;
- prefab declarations and overrides;
- resource/event/component declarations;
- system metadata declarations;
- asset/import settings declarations;
- input maps;
- retained UI refs/bindings;
- audio refs.

Example direction:

```ts
export const arenaScene = defineSceneModule({
  id: "scene.arena",
  entities: [playerKart, chaseCamera],
  prefabs: [kartPrefab],
  systems: [raceControllerSystem],
  input: arenaInput,
  ui: raceHud,
});
```

## 5. Implementation Phases

### Phase 1: Declaration shape and source metadata hooks

- [ ] Add source metadata hooks without leaking runtime handles.
- [ ] Add validation for logical IDs and source-owned paths.
- [ ] Ensure declarations lower to existing SDK/capture structures.

Verification:

```bash
pnpm --filter @threenative/sdk test
```

### Phase 2: Entity/prefab/resource declarations

- [ ] Add entity declarations with transforms/components/source IDs.
- [ ] Add prefab declarations and deterministic override application.
- [ ] Add resource declarations for portable data only.
- [ ] Reject runtime-handle-shaped source data.

Verification:

```bash
pnpm --filter @threenative/sdk test -- --run authoring
pnpm --filter @threenative/compiler test -- --run authoring
```

### Phase 3: Input/UI/audio/assets declarations

- [ ] Add input map declarations that map to existing portable input IR.
- [ ] Add UI declaration refs/bindings compatible with retained UI.
- [ ] Add audio refs/catalog declarations without exposing runtime playback handles.
- [ ] Add asset/import settings refs that remain bundle-local and portable.

Verification:

```bash
pnpm --filter @threenative/sdk test
pnpm --filter @threenative/compiler test -- --run capture
```

### Phase 4: Compatibility and docs

- [ ] Keep old one-file examples building.
- [ ] Add compatibility diagnostics/warnings only when editor-ready mode is opted in.
- [ ] Document modular SDK authoring patterns.

Verification:

```bash
pnpm check:docs
pnpm verify:smoke
```

## 6. Acceptance Criteria

- [ ] Modular SDK declarations exist for scenes/entities/prefabs/resources/systems/input/UI/audio/assets.
- [ ] Declarations can be captured into the authoring graph.
- [ ] Existing one-file authoring remains supported.
- [ ] Invalid source IDs and runtime-handle-shaped data are rejected.
- [ ] Prefab overrides lower deterministically.
- [ ] SDK/compiler tests pass.
