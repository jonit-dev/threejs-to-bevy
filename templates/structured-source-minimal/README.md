# Structured Source Minimal

This template is an intentionally empty structured-source project for
off-recipe games. Plan the playable loop before adding gameplay or assets.

- Edit scene, UI, material, asset, input, system, and prefab data in
  `content/**/*.json`.
- Edit behavior in `src/scripts/**/*.ts`.
- Run `pnpm run types` after source-shape changes to refresh
  `.threenative/types/project-context.d.ts`; `tn build` and
  `tn dev --watch` refresh it automatically.
- Use `tn ... --json`, recipes, or `@threenative/authoring-client` scripts as
  source-mutation clients; they should write structured source, not generated
  bundle files.
- `threenative.config.json` builds from `content/scenes/empty.scene.json`, so
  there is no TypeScript scene blob to reverse-patch.
- `dist/**`, emitted IR JSON, and `scripts.bundle.js` are generated output.
- AI coding agents should read `AGENTS.md` or `CLAUDE.md` and prefer
  `tn ... --json` commands for deterministic source edits.
- For game creation or major gameplay changes, start with
  `AGENT_GAME_PLAN.md`; it is the local checklist for playable loop, assets,
  UI, source owners, polish, and proof before source mutation.
- The empty scene, absence of scripts, and single smoke scenario are deliberate;
  do not treat them as a playable game or production evidence.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run types
pnpm run typecheck
pnpm run build
pnpm run iterate
pnpm run game:plan
pnpm run game:improve
pnpm run playtest
pnpm run game:score
pnpm run game:qa
pnpm run game:release
```

Production metadata in `threenative.config.json` records that the playable
loop, controls, objective, retry policy, and art are not authored. Use
`AGENT_GAME_PLAN.md` and
`tn game plan --goal "<game idea>" --apply --json` for supported
collector/lane-runner scaffolds. Omit `--apply` when you only need a
non-mutating plan. The worksheet is the local planning checklist;
`artifacts/game-production/plan.json` is the machine-readable evidence. For
GLB/glTF models, start from the
SQLite-backed CLI asset library:
`tn asset source search --game-category <category> --format glb --direct-only --json`,
then `tn asset source get <asset-source-id> --json` for selected records. Then use
`tn game improve --apply-plan artifacts/game-production/plan.json --json`,
`tn game score --project . --json`, `tn game qa --project . --run-proof --json`,
and `tn game release --project . --json` to collect structured phase ledgers,
scorecards, UI-state coverage, asset/audio provenance, proof artifacts, and
release blockers.
