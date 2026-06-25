# ThreeNative Editor Operation Map

Use the local editor API as a transport over `@threenative/authoring`; do not
mutate generated IR or bundle JSON by hand.

## Durable Source Boundary

- Source JSON lives under `content/**`.
- Gameplay script bodies live under `src/scripts/**/*.ts`.
- Generated bundle files under `dist/**`, including `world.ir.json`,
  `systems.ir.json`, `assets.manifest.json`, and `scripts.bundle.js`, are build
  output only.

## Core Operations

Call `applyEditorOperationApi({ projectPath, request: { name, args } })` from
`packages/editor/dist/server/operationApi.js` after building
`@threenative/editor`, or use the equivalent `POST /api/operation` route in a
running editor.

| Task | Operation | Required args |
| --- | --- | --- |
| Create a default scene | `scene.create_default` | `sceneId`, optional `file` |
| Add an empty entity | `scene.add_entity` | `sceneId`, `entityId` |
| Add an entity from a prefab | `scene.add_entity` | `sceneId`, `entityId`, `prefabId` |
| Add a primitive prefab | `scene.add_prefab` | `sceneId`, `prefabId`, `primitive`; optional `color`, `asset` |
| Move, rotate, or scale an entity | `scene.set_transform` | `sceneId`, `entityId`, and one or more of `position`, `rotation`, `scale` |
| Attach or replace a component | `scene.set_component` | `sceneId`, `entityId`, `componentKind`, `value` |
| Create a primitive mesh document | `mesh.create_primitive` | `meshId`, `kind` |
| Create a system document | `system.create` | `systemId`, `schedule` |
| Attach a script reference to a system | `system.attach_script` | `systemId`, `modulePath`, `exportName`; optional `file` |
| Attach a scene-local script reference | `scene.attach_script` | `sceneId`, `systemId`, `modulePath`, `exportName` |

## Script Editing Boundary

Current editor operations attach script references only. They do not provide a
MonoEditor-style TypeScript body editor. Create or edit the script module under
`src/scripts/**/*.ts`, then attach it with `system.attach_script` or
`scene.attach_script`.

## Verification

Run:

```bash
node scripts/verify-editor-required-operations.mjs
```

The script copies `templates/structured-source-starter`, applies editor
operations, rebuilds, validates the bundle, and asserts that the emitted
`world.ir.json` changed for the edited scene.
