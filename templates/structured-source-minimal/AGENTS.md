# AGENTS.md

Rules for this generated ThreeNative project. Detailed guidance lives in the
agent skills under `.claude/skills/` and `.codex/skills/` (identical copies);
read the matching skill when that kind of work comes up instead of holding
everything in context at once.

## Source Boundary

- Durable data: `content/**/*.json`.
- Durable behavior: `src/scripts/**/*.ts`.
- Generated output: `dist/**`, emitted bundle JSON, `scripts.bundle.js`.
  Do not edit them as the fix.
- Do not author raw Three.js scenes or Bevy/Rust gameplay.

## Default Loop

1. Before creating or substantially changing the game, open
   `AGENT_GAME_PLAN.md` as the first game-creation action, then run
   `tn game plan --goal "<game idea>" --project . --json`
   (add `--apply` for supported scaffolds).
   The package aliases are `pnpm run game:plan` and `pnpm run game:improve`.
   Read `docs/API-CARD.md` before inspecting repository package source.
2. Worked examples first: `tn cookbook list --json`, then
   `tn cookbook show <id> --json`, before inventing a new gameplay, camera,
   UI, physics, asset, or polish pattern.
3. Author with deterministic CLI edits: `tn actor ... --json`,
   `tn scene ... --json`, `tn ui ... --json`, `tn flow ... --json`, and
   `tn add <mechanic-block> ... --json`. Edit JSON directly only when no
   command covers the change.
4. After changes, run `tn iterate --project . --json` (or `pnpm run iterate`)
   as the default repair loop; fix the owning durable source and rerun.
   Start with the compact playtest report or compact stdout; open deep logs
   only when those diagnostics point to deeper evidence.
5. For custom sound effects, probe with `tn game providers --project . --json`.
   When ElevenLabs is available, prefer one bounded
   `tn audio generate-sfx <asset-id> --prompt "<description>" --project . --json`
   call. Project-local `.env` is for local `tn` tooling only. Use local,
   catalog, or procedural audio as the offline fallback.

## Skills (read on demand)

| Doing this | Read this first |
| --- | --- |
| Starting work, planning, or choosing next command | `.claude/skills/threenative-workflow/SKILL.md` |
| Editing entities, scenes, flows, UI, or scripts | `.claude/skills/threenative-authoring/SKILL.md` |
| Sourcing assets, materials, animation, visual polish | `.claude/skills/threenative-game-quality/SKILL.md` |
| Verifying, playtesting, or making release claims | `.claude/skills/threenative-verify/SKILL.md` |

## Verify (quick reference)

`tn iterate --project . --json` first; production gates
(`pnpm run game:score`, `pnpm run game:qa`, `pnpm run game:release`,
`pnpm run verify`) before completion claims, with a desktop-target playtest
rerun before release claims. The full ladder is in the
`threenative-verify` skill.
