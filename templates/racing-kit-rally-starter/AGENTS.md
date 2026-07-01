# AGENTS.md

Rules for Racing Kit Rally starter projects.

- Keep Kenney Racing Kit assets local to `assets/` and reference them from structured source.
- Gameplay belongs in `src/scripts/racing.ts`; scene composition belongs in `content/**/*.json`.
- Do not edit generated `dist/` output.
- Prefer `tn ... --json` commands for scene, asset, and proof mutations.
