---
name: threenative-editor-operations
description: Operate the ThreeNative editor and structured authoring workflow. Use when Codex needs to create scenes, add primitives or entities, move/rotate/scale scene objects, attach components, attach script references, verify emitted IR changes, or debug editor operation coverage in /home/joao/projects/threejs-to-bevy.
---

# Threenative Editor Operations

## Workflow

Use the editor as a thin adapter over `@threenative/authoring`. Persist changes
through operation names such as `scene.set_transform`, then rebuild and inspect
the emitted IR. Never edit `dist/**` bundle artifacts as source.

1. Read `references/editor-operation-map.md` for the operation names and source
   boundary.
2. Build the packages that provide the API if local `dist/` may be stale:

```bash
pnpm --filter @threenative/authoring build
pnpm --filter @threenative/compiler build
pnpm --filter @threenative/editor build
```

3. Apply operations through `applyEditorOperationApi` or the editor server
   `POST /api/operation` route. Treat an operation as accepted only when
   `ok: true`.
4. Verify with `tn iterate --project <path> --json`. Use `buildProject(projectPath)`
   or `tn build --project <path> --json` only when the iterate diagnostic asks
   for bundle-level proof.
5. Assert both durable source JSON and emitted bundle JSON changed as expected.

## Focused Smoke

Run the repo smoke script when the request is to prove required editor
operations end to end:

```bash
node scripts/verify-editor-required-operations.mjs
```

From inside the skill folder, the equivalent wrapper is:

```bash
node scripts/verify-required-operations.mjs
```

Use `--skip-package-build` only after the relevant package `dist/` output is
known to be current. Use `--keep` when the temp project should remain available
for inspection.
