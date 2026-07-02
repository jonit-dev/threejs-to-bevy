# Structured Source Starter

This starter proves the editor-owned game data can live under `content/` while
TypeScript stays thin.

- Edit scene, UI, material, asset, input, system, and prefab data in
  `content/**/*.json`.
- Edit behavior in `src/scripts/**/*.ts`.
- Use `tn ... --json`, recipes, or `@threenative/authoring-client` scripts as
  source-mutation clients; they should write structured source, not generated
  bundle files.
- `threenative.config.json` builds from `content/scenes/arena.scene.json`, so
  there is no TypeScript scene blob to reverse-patch.
- `dist/**`, emitted IR JSON, and `scripts.bundle.js` are generated output.
- AI coding agents should read `AGENTS.md` or `CLAUDE.md` and prefer
  `tn ... --json` commands for deterministic source edits.
- Default generated games should ship with smooth movement and a deliberate
  visual baseline, not primitive-only placeholders. Use custom meshes, imported
  assets, authored materials, lighting, landmarks, screenshot proof, motion
  proof, and playtest proof before treating a generated game as complete.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
pnpm run recipe:controller
pnpm run playtest
pnpm run game:score
tn ui set-layout hud countdown --justify center --align center --top 48 --width 1280 --project . --json
```

Production metadata in `threenative.config.json` declares the starter's
playable loop, controls, objective, retry policy, and proof commands. Use
`tn game plan --goal "<game idea>" --json` before mutating source. The plan is
the production checklist: gameplay loop, controls, objective, asset inventory,
script modules/exports, owned state, polish pass, fallback choices, and proof
commands. For GLB/glTF models, start from the SQLite-backed CLI asset library:
`tn asset source search --game-category <category> --format glb --direct-only --json`,
then `tn asset source get <asset-source-id> --json` for selected records. Then use
`tn game score --project . --json`,
`tn game qa --project . --json`, and `tn game release --project . --json` to
collect structured phase ledgers, scorecards, UI-state coverage, asset/audio
provenance, and release blockers.
