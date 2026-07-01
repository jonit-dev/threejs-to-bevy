# CLAUDE.md

Use root `AGENTS.md` as the authoritative repo instructions. Nested
`AGENTS.md` files may add local rules.

## Structured Source Defaults

- Current starter: `structured-source-starter`.
- Durable data: `content/**/*.json`.
- Durable behavior: `src/scripts/**/*.ts`.
- Generated output: `dist/**`, emitted bundle JSON, `scripts.bundle.js`.
  Do not patch generated files as the fix.
- Prefer deterministic authoring commands:
  `tn scene ... --json`, `tn ui ... --json`, `tn material ... --json`,
  `tn authoring validate --json`, and other bounded `tn ... --json` surfaces.
- Edit JSON directly only when no CLI operation covers the change; preserve
  schema/version fields and stable IDs unless asked to rename.
- Do not author raw Three.js scenes or raw Bevy/Rust gameplay.

Scene loop:

```bash
tn scene validate arena --json
tn scene inspect arena --json
tn scene proof arena --project . --json
pnpm run build
pnpm run verify
```

On diagnostics, keep code/path/severity in notes and repair the durable source
document or script that owns the problem.
