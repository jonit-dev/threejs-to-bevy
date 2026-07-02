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
  from `@threenative/script-stdlib`.

## Game Quality

- Keep the game plan in `docs/production-plan.md` current as implementation
  evidence.
- Bowling is physics-facing gameplay. Ball, pins, lane floor, gutters, rails,
  and backstop must keep authored `RigidBody` and `Collider` metadata.
- If runtime physics cannot express an interaction, scripts may provide a
  deterministic fallback only while preserving the authored physics contract.

## Verify

```bash
pnpm run validate:authoring
pnpm run build
pnpm run verify
pnpm run playtest
pnpm run game:score
tn scene validate lane --json
tn scene inspect lane --json
tn scene proof lane --project . --json
```
