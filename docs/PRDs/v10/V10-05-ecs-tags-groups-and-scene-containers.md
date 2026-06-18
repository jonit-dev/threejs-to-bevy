# V10-05 ECS Tags, Groups, and Scene Containers

Complexity: 8 -> MEDIUM mode

## Complexity Assessment

- +2 spans SDK scene authoring, ECS world declarations, IR, compiler emit, web runtime, Bevy runtime, docs, and examples
- +2 requires a product/API decision that could shape future authoring ergonomics
- +2 needs cross-runtime query/hierarchy behavior and conformance evidence
- +1 touches editor/inspector semantics without building a full editor feature
- +1 requires migration guidance because current projects may already use marker components manually

This PRD decides the ThreeNative grouping model. It intentionally separates scene hierarchy from gameplay membership so the engine does not copy Godot nodes/groups wholesale into an ECS architecture.

## Context

**Question:** What is the best format for grouping/container concepts in ThreeNative, given that Godot has node groups but ThreeNative uses a Three.js-like authoring layer plus ECS runtime IR?

**Decision:** ThreeNative should use two distinct concepts:

1. **Scene containers** for transform/editor organization.
2. **ECS tags** for gameplay grouping and queries.

Do not create a single Godot-style `group` abstraction that tries to mean both parented scene container and gameplay membership.

**Files Analyzed:**

- `packages/sdk/src/scene/Object3D.ts`
- `packages/sdk/src/scene/Scene.ts`
- `packages/sdk/src/ecs/World.ts`
- `packages/sdk/src/ecs/schema.ts`
- `packages/compiler/src/emit/scene-to-world.ts`
- `packages/compiler/src/emit/ecs.ts`
- `packages/ir/src/types.ts`
- `docs/goals.md`
- `docs/developer-workflow.md`
- `docs/bevy-feature-parity.md`
- `docs/STATUS.md`

**Current Behavior:**

- The scene authoring layer already has hierarchy through `Object3D.children`, `Object3D.parent`, `add()`, `remove()`, and `traverse()`.
- `Scene` is an `Object3D` root.
- `sceneToWorld()` lowers parent/child relationships into ECS by adding `Hierarchy: { parent: parentId }` to child entities.
- `docs/bevy-feature-parity.md` already marks parent/child hierarchy and local/global transform propagation as supported.
- The ECS `World` API is flat: `world.spawn(id, ...components)` emits entities with component maps.
- Queries are component-based through `defineQuery({ with: [...], without: [...] })`.
- `IWorldEntity` has optional `tags?: string[]`, but `World.spawn()` and `ecsToIr()` currently do not expose or emit tags.
- Asset manifest groups exist, but they are loading groups, not entity/gameplay groups.

## Problem

Game authors need an ergonomic way to express common membership concepts:

- enemies
- interactables
- pickups
- damageables
- save points
- camera targets
- spawn zones
- editor-only organization buckets

Today the correct ECS workaround is a zero-field marker component:

```ts
const Enemy = defineComponent("Enemy");
const Interactable = defineComponent("Interactable");

world.spawn("goblin.1", Enemy(), Transform({ position: [0, 0, 0] }));
world.spawn("chest.1", Interactable(), Transform({ position: [2, 0, 0] }));

fixedUpdate("enemyAi", {
  queries: [defineQuery({ with: [Enemy, Transform] })],
  reads: [Enemy, Transform],
  writes: [Transform],
});
```

That is technically correct, but it is not clearly documented as the recommended grouping model, and `defineComponent("Enemy")` reads heavier than a tag/group concept for authors coming from Godot or Unity.

At the same time, Godot-style node groups are not a good direct fit because they blur three separate concerns:

- hierarchy / transform ownership;
- gameplay query membership;
- broadcast/event dispatch.

In ECS, these should stay separate to preserve portability, deterministic IR, simple queries, and clean web/Bevy runtime parity.

## Goals

- Provide a first-class authoring API for ECS tags as zero-data marker components.
- Preserve existing component-query semantics instead of introducing a parallel group query engine.
- Keep scene hierarchy/container behavior distinct from gameplay membership.
- Add an optional scene `Group`/`Container` class only for transform/editor organization.
- Emit deterministic IR that both web Three.js and native Bevy can consume without runtime-specific escape hatches.
- Make the recommended pattern obvious in docs, templates, and examples.

## Non-Goals

- Do not implement Godot-style dynamic node groups with arbitrary string membership and global broadcast semantics.
- Do not add runtime reflection APIs that let portable scripts scan all entities by arbitrary string outside declared queries.
- Do not make asset groups, scene containers, and gameplay tags share one overloaded `Group` concept.
- Do not expose Bevy-specific `Parent`, `Children`, or `Name` authoring concepts directly in the TypeScript SDK.
- Do not implement a full editor collection/layer system in this PRD.
- Do not add network/replication/team/faction semantics; those can be modeled as ordinary components later.

## Product Decision

### Use ECS tags for gameplay grouping

Add a small SDK wrapper around zero-field marker components:

```ts
const Enemy = defineTag("Enemy");
const Interactable = defineTag("Interactable");

world.spawn("goblin.1", Enemy(), Transform({ position: [0, 0, 0] }));

fixedUpdate("enemyAi", {
  queries: [defineQuery({ with: [Enemy, Transform] })],
  reads: [Enemy, Transform],
  writes: [Transform],
});
```

`defineTag(name)` should lower to a component schema with no fields and explicit tag metadata:

```json
{
  "schemas": {
    "Enemy": {
      "kind": "component",
      "fields": {},
      "metadata": { "tag": true }
    }
  }
}
```

If metadata is too invasive for the current schema shape, Phase 1 may simply emit a normal zero-field component and document it as a tag. The API still matters because it gives authors the right mental model and leaves room for later inspector/runtime treatment.

### Use scene containers for hierarchy/organization

Add a scene-only container class:

```ts
const enemyLayer = new Group({ id: "group.enemies" });
scene.add(enemyLayer);

enemyLayer.add(new Mesh({ id: "goblin.1", geometry, material }));
```

`Group` should extend `Object3D` and lower like any other scene object:

- it has `Transform`;
- children receive `Hierarchy.parent` pointing to the group entity;
- it has no renderer component;
- it may optionally emit `SceneContainer` metadata for editor/inspector labeling.

This is not a gameplay group. If an entity should be queryable as an enemy, it still needs `Enemy()` or a component equivalent.

### Preserve stronger components for dataful categories

If membership has data, use a component, not a tag:

```ts
const Faction = defineComponent("Faction", {
  id: "string",
  hostility: "number",
});

world.spawn("guard.1", Faction({ id: "town", hostility: 0.1 }));
```

Rule of thumb:

- **Tag:** boolean membership only: `Enemy`, `Pickup`, `Interactable`.
- **Component:** membership with data: `Faction`, `Team`, `SpawnZone`, `QuestGiver`.
- **Scene container:** transform/editor organization: `Group`, `LayerRoot`, `RoomRoot`.
- **Asset group:** loading/readiness behavior only.

## User-Facing API

### ECS tags

```ts
import { World, defineTag, defineQuery, fixedUpdate } from "@threenative/sdk";

const Enemy = defineTag("Enemy");
const Damageable = defineTag("Damageable");
const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
});

const world = new World()
  .spawn("goblin.1", Enemy(), Damageable(), Transform({ position: [0, 0, 0] }))
  .addSystem(
    fixedUpdate("enemyAi", {
      queries: [defineQuery({ with: [Enemy, Transform] })],
      reads: [Enemy, Transform],
      writes: [Transform],
    }),
  );
```

Expected behavior:

- tags can be used anywhere components are accepted in `with`, `without`, `reads`, and command declarations;
- duplicate tags on the same entity fail with the existing duplicate component diagnostic path;
- tags are deterministic in emitted schema/entity component order;
- tags have no component data fields;
- setting fields on a tag declaration is rejected or ignored with a stable diagnostic, depending on the final factory API shape.

### Scene containers

```ts
import { Group, Mesh, Scene } from "@threenative/sdk";

const scene = new Scene({ id: "scene.main" });
const room = new Group({ id: "room.entry", name: "Entry Room" });
const props = new Group({ id: "room.entry.props" });

scene.add(room);
room.add(props);
props.add(new Mesh({ id: "crate.1", geometry, material }));
```

Expected lowering:

```json
{
  "id": "room.entry.props",
  "components": {
    "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] },
    "Hierarchy": { "parent": "room.entry" },
    "SceneContainer": { "name": "" }
  }
}
```

`SceneContainer` should be metadata-only. Runtime gameplay should not depend on it unless a user explicitly queries it like any other component.

## IR Contract

### Phase 1: Tag-as-marker-component

The lowest-risk contract is to keep tags as ordinary zero-field components:

```json
{
  "id": "goblin.1",
  "components": {
    "Enemy": {},
    "Transform": { "position": [0, 0, 0] }
  }
}
```

This requires minimal IR changes and works naturally with existing query infrastructure.

### Phase 2: Optional tag metadata

If the current schema format can safely grow metadata, add optional schema metadata:

```ts
interface IEcsSchema {
  fields: Record<string, ISchemaField>;
  kind: SchemaKind;
  name: string;
  metadata?: {
    tag?: boolean;
  };
}
```

Validation rules:

- `metadata.tag === true` only valid for component schemas.
- tag schemas must have no fields.
- entity tag components must have empty data objects.
- existing zero-field components remain valid even without tag metadata.

### Do not rely on `IWorldEntity.tags` yet

`IWorldEntity.tags?: string[]` already exists, but using it as the primary path would create two parallel membership systems:

- component-based queries for ECS;
- string-array tags for ad hoc grouping.

That split is avoidable. This PRD should either deprecate `IWorldEntity.tags` as legacy/inspection metadata or reserve it for derived inspector summaries, not gameplay behavior.

## Runtime Mapping

### Web runtime

- Treat tag components exactly like other components in the portable world store.
- Queries with `with: [Enemy]` should match entities whose component map includes `Enemy`.
- Scene containers spawn transform/hierarchy entities with no renderer.
- Debug/inspector panels may visually label tag components and scene containers.

### Bevy runtime

- Register tag schemas as zero-sized/empty marker components in the dynamic component registry, or keep them in the existing portable component map if dynamic registry behavior is already map-backed.
- Query matching must use the same component-name semantics as web.
- Scene containers spawn Bevy entities with transform/global transform/hierarchy linkage, no mesh/material bundle.
- Do not expose Bevy `Name`, `Parent`, or `Children` as user-authored API; those are runtime adapter details.

## Diagnostics

Add or reuse stable diagnostics:

- `TN_SDK_ECS_TAG_NAME_EMPTY`: tag name must not be empty.
- `TN_SDK_ECS_TAG_FIELDS_INVALID`: tags cannot declare fields.
- `TN_IR_TAG_SCHEMA_FIELDS_INVALID`: tag schema metadata requires zero fields.
- `TN_IR_TAG_COMPONENT_DATA_INVALID`: tag component instances must not carry data.
- `TN_SDK_SCENE_GROUP_ID_EMPTY`: scene group ID must not be empty when explicit IDs are required by a gate.
- `TN_IR_SCENE_CONTAINER_RENDERER_INVALID`: scene containers must not emit mesh/light/camera renderer components.

Diagnostics should include repair hints:

- use `defineComponent()` when category membership needs data;
- use `defineTag()` for boolean query membership;
- use `Group` only for hierarchy/editor organization.

## Implementation Plan

### Task 1: Add SDK tag factory

**Files:**

- Modify: `packages/sdk/src/ecs/schema.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/ecs/World.test.ts` or new `packages/sdk/src/ecs/schema.test.ts`

**Steps:**

1. Add `defineTag(name: string): EcsFactory` returning a zero-field component factory.
2. Optionally add metadata on the schema if the schema type can support it without breaking emit/validation.
3. Add tests that prove:
   - `defineTag("Enemy")` has kind `component`;
   - fields are `{}`;
   - returned declaration data is `{}`;
   - empty tag names throw the existing or new empty-name diagnostic.

### Task 2: Ensure World spawn/query compatibility

**Files:**

- Modify: `packages/sdk/src/ecs/World.ts` only if needed
- Test: `packages/sdk/src/ecs/World.test.ts`

**Steps:**

1. Spawn an entity with `Enemy()` and `Transform()`.
2. Assert `world.toJSON().componentSchemas.Enemy.fields` is `{}`.
3. Assert entity components include `Enemy: {}`.
4. Assert `defineQuery({ with: [Enemy] })` serializes to `with: ["Enemy"]`.

### Task 3: Add IR validation for tag metadata if metadata is promoted

**Files:**

- Modify: `packages/ir/src/types.ts`
- Modify: relevant IR schema validators
- Test: relevant `packages/ir/src/*.test.ts`

**Steps:**

1. Accept optional tag metadata only on component schemas.
2. Reject tag metadata with non-empty fields.
3. Reject tag component data with keys if metadata is present.
4. Keep plain zero-field marker components valid.

If metadata is not promoted in Phase 1, skip this task and document that tags are API-level marker components only.

### Task 4: Add scene `Group` container

**Files:**

- Create: `packages/sdk/src/scene/Group.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/scene/Object3D.test.ts` or new `Group.test.ts`

**Steps:**

1. Implement `Group extends Object3D` with no rendering behavior.
2. Accept the same base `IObject3DOptions` as `Object3D`.
3. Prove parent/child add/remove/traverse behavior works through inherited behavior.

### Task 5: Emit scene container metadata

**Files:**

- Modify: `packages/compiler/src/emit/scene-to-world.ts`
- Test: `packages/compiler/src/emit/scene-to-world.test.ts`

**Steps:**

1. Detect `child.constructor.name === "Group"`.
2. Emit `SceneContainer` component with stable metadata:
   - `name` if available and non-empty;
   - `kind: "group"` or `role: "container"` if useful for inspector sorting.
3. Ensure no `MeshRenderer`, `Camera`, or `Light` component is emitted for groups.
4. Assert child hierarchy still points to the group entity.

### Task 6: Add web/native conformance fixture

**Files:**

- Add or modify conformance fixture under existing artifact/test structure
- Modify web runtime conformance observation code if needed
- Modify Bevy runtime conformance observation code if needed
- Test: focused conformance command

**Fixture content:**

- one `Group` with two children;
- one child tagged `Enemy` and `Damageable`;
- one child tagged `Interactable`;
- one query/system observing `Enemy + Transform`;
- one query/system excluding `Interactable`.

Expected report:

- web and Bevy agree on matched entity IDs;
- hierarchy parent IDs match;
- group entity has transform/hierarchy behavior but no renderer;
- tags are present as component names.

### Task 7: Update docs and templates

**Files:**

- Modify: `docs/ecs.md`
- Modify: `docs/sdk.md`
- Modify: `docs/developer-workflow.md`
- Modify: `docs/bevy-feature-parity.md`
- Modify: one starter template if appropriate

**Docs must state:**

- use `defineTag()` for boolean gameplay membership;
- use `defineComponent()` for dataful categories;
- use `Group` for scene hierarchy/editor organization;
- do not use asset groups for gameplay grouping;
- `IWorldEntity.tags` is not the recommended authoring path.

## Acceptance Criteria

- [ ] SDK exports `defineTag()`.
- [ ] Tags serialize as queryable zero-field marker components.
- [ ] Duplicate tags/components on one entity are rejected through existing duplicate component checks.
- [ ] Scene `Group` exists and works as an `Object3D` container.
- [ ] `sceneToWorld()` emits hierarchy correctly for `Group` children.
- [ ] `Group` entities do not emit renderer/camera/light components.
- [ ] Web runtime and Bevy runtime match tag query behavior in a shared fixture.
- [ ] Web runtime and Bevy runtime match hierarchy/container behavior in a shared fixture.
- [ ] Docs explain tags vs components vs scene containers vs asset groups.
- [ ] `docs/bevy-feature-parity.md` and `docs/STATUS.md` are updated when implementation lands.

## Verification Commands

Implementation should add a focused gate, then wire it into the appropriate aggregate verifier:

```bash
pnpm --filter @threenative/sdk test -- --runInBand
pnpm --filter @threenative/compiler test -- scene-to-world
pnpm verify:conformance
pnpm check:docs
```

If a dedicated script is added, prefer:

```bash
pnpm verify:v10:ecs-tags-groups
```

The focused gate should write an artifact under `artifacts/v10/ecs-tags-groups/` or the existing conformance artifact structure.

## Migration Guidance

Existing code using zero-field marker components remains valid:

```ts
const Enemy = defineComponent("Enemy");
```

Recommended new code should use:

```ts
const Enemy = defineTag("Enemy");
```

Do not force migration unless tag metadata becomes necessary for editor/inspector behavior. If metadata is added later, plain zero-field components should still behave correctly as queryable marker components.

## Open Questions

- Should `defineTag()` metadata be emitted in Phase 1, or should Phase 1 keep tags as pure SDK sugar over zero-field components?
- Should `SceneContainer` be emitted for all `Group` objects, or should groups lower to plain transform/hierarchy entities unless editor metadata is explicitly requested?
- Should `IWorldEntity.tags` be deprecated in types/docs, or retained as derived inspection metadata?
- Should templates introduce `Enemy = defineTag("Enemy")` immediately, or wait until the conformance fixture proves both runtimes?

## Recommendation

Implement Phase 1 as the default: `defineTag()` as SDK sugar over zero-field marker components, plus a `Group extends Object3D` scene container. This gives authors the ergonomic answer they expect without creating a second grouping system or compromising ECS query semantics.

Only add IR tag metadata after the basic API and conformance fixture are green. Metadata is useful for inspectors, but not required for gameplay correctness.
