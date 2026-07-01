# Structured Source Starter

This starter proves the editor-owned game data can live under `content/` while
TypeScript stays thin.

- Edit scene, UI, material, asset, input, system, and prefab data in
  `content/**/*.json`.
- Edit behavior in `src/scripts/**/*.ts`.
- `threenative.config.json` builds from `content/scenes/arena.scene.json`, so
  there is no TypeScript scene blob to reverse-patch.
- AI coding agents should read `AGENTS.md` or `CLAUDE.md` and prefer
  `tn ... --json` commands for deterministic source edits.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
tn ui set-layout hud countdown --justify center --align center --top 48 --width 1280 --project . --json
```
