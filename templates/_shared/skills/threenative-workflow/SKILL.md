---
name: threenative-workflow
description: Default workflow for a generated ThreeNative project - plan, author, iterate, prove. Use when starting work, creating or substantially changing a game, or deciding which command or skill to use next.
---

# ThreeNative Generated Project Workflow

Use `AGENTS.md` as the authoritative local instructions. This skill is the
front door; read the sibling skills only when their work comes up:

- `threenative-authoring` - editing entities, scenes, flows, UI, and scripts.
- `threenative-game-quality` - sourcing assets and meeting the visual bar.
- `threenative-verify` - iterate diagnostics, playtests, and release gates.

## Default loop

```bash
pnpm tn -- game plan --goal "<game idea>" --project . --json
pnpm tn -- cookbook list --json
pnpm tn -- iterate --project . --json
```

(`pnpm tn -- <args>` and `tn <args>` are equivalent; use whichever resolves.)

1. Before creating or substantially changing the game, open
   `AGENT_GAME_PLAN.md` as the first game-creation action, then run
   `tn game plan --goal "<game idea>" --project . --apply --json` for supported
   collector/lane-runner scaffolds, or omit `--apply` to keep planning
   non-mutating. When the worksheet is absent, treat the generated
   `artifacts/game-production/plan.json` as the planning checklist. The plan
   must cover game design, assets, scripts, polish, and proof end to end (the
   worksheet enumerates the required beats).
2. Worked examples first: before inventing a new gameplay, camera, UI,
   physics, asset, or polish pattern, run `tn cookbook search <query> --json`
   to find relevant patterns, `tn cookbook list --json` to browse all patterns,
   and `tn cookbook show <id> --json` to load one complete goal -> commands ->
   source delta -> script -> proof example.
3. Author with bounded CLI operations (`threenative-authoring` skill). Apply
   gameplay recipes only as bounded steps from a complete plan, for example
   `tn recipe apply top-down-collector --scene <scene> --player <entity> --camera <camera> --json`,
   keeping recipe output in `content/**/*.json` and `src/scripts/**/*.ts`.
4. After gameplay, controls, script, source, or visual changes, run
   `pnpm tn -- iterate --project . --json` (or `pnpm run iterate`) as the
   default repair loop. Fix the owning durable source or script and rerun.
   Details and follow-ups live in the `threenative-verify` skill.

## Scaffold-first stop rule

When scaffold-first `tn game plan --apply` is followed by `TN_ITERATE_OK` and
the prompt's playable loop is already represented by the scaffold outputs,
stop and report the artifact paths instead of auditing source files or running
`git status`/`git diff`.

## Source boundary

- Durable data lives in `content/**/*.json`; durable behavior lives in
  `src/scripts/**/*.ts`.
- `dist/**`, emitted bundle JSON, and `scripts.bundle.js` are generated
  output. Do not edit them as the fix.
- Do not author raw Three.js scenes or Bevy/Rust gameplay.

## Repo-side rule

In the ThreeNative engine repo (not in generated projects), changing a
reusable authoring pattern or CLI mutation surface requires updating the
matching cookbook entry or adding a new one, then running
`pnpm verify:cookbook`.
