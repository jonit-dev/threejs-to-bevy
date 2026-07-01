# AGENTS.md

Rules for this generated ThreeNative project.

## Source Boundary

- Durable data: `content/**/*.json`.
- Durable behavior: `src/scripts/**/*.ts`.
- Generated output: `dist/**`, emitted bundle JSON, `scripts.bundle.js`.
  Do not edit them as the fix.
- Do not author raw Three.js scenes or Bevy/Rust gameplay.

## Editing

- Prefer deterministic CLI edits and diagnostics:
  `tn scene ... --json`, `tn ui ... --json`, `tn material ... --json`,
  `tn authoring validate --json`.
- Edit JSON directly only when no CLI operation covers the change.
- Preserve schema/version fields and stable IDs unless asked to rename.
- Add behavior in `src/scripts/**/*.ts`, then reference module/exports from
  structured source.
- For repeated portable helper code in `src/scripts/**/*.ts`, use named imports
  from `@threenative/script-stdlib`:
  `NumberEx`, `Vec3`, `Quat`, and `TransformMath`.
- Do not copy local mini-standard libraries for clamp/round/vector/quaternion,
  use namespace/default/aliased stdlib imports, or import arbitrary npm,
  relative helper modules, DOM, Node, timer, filesystem, network, Three.js, or
  Bevy APIs from portable scripts.

## Verify

```bash
pnpm run validate:authoring
pnpm run build
pnpm run verify
tn scene validate arena --json
tn scene inspect arena --json
tn scene proof arena --project . --json
```

On diagnostics, keep code/path in notes and fix the owning source document or
script.
