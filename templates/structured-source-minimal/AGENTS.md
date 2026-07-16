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

## Technical-debt guardrails

- Extend the owning source document, script, manifest, or shared contract;
  do not copy registry data, helpers, fallbacks, or proof logic into a second
  surface.
- Do not edit generated output, weaken assertions, disable scenarios, or make
  unsupported behavior look supported. Fix the durable owner and rerun the
  diagnostic/proof.
- If a temporary bridge is unavoidable, record its owner, removal condition,
  and verification in the plan or issue. Report missing capability explicitly
  instead of adding a local workaround.

## Default Loop

The loop below is the compact default. When equivalent operator workflow is
already in context, follow it directly; otherwise load `threenative-workflow`.
Load another skill only when the plan or a diagnostic makes it relevant.
Follow this order:

1. Before creating or substantially changing the game, run
   `tn game plan --goal "<game idea>" --project . --json` (package alias:
   `pnpm run game:plan -- --goal "<game idea>"`). Review its responsibilities before applying a
   mutation; open `AGENT_GAME_PLAN.md` only when planning fails or omits a
   required field. Use `pnpm run game:improve` only for a reviewed plan.
2. If the plan reports `TN_GAME_PLAN_OFF_RECIPE` or does not cover the core
   verbs and acceptance criteria, run its `nextInspectionCommand` first. Run a
   capability-selected `nextAuthoringCommand` returned by inspection before
   opening broad source files; custom-author directly only when no such command
   covers the prompt. A returned prototype command is self-describing: run it
   without loading the authoring skill or API card, then immediately run its
   `nextProofCommand`. Otherwise
   inspect the matched cookbook entry before running a reviewed
   `nextAuthoringCommand`.
3. Author with deterministic CLI edits: `tn actor ... --json`,
   `tn scene ... --json`, `tn ui ... --json`, `tn flow ... --json`, and
   `tn add <mechanic-block> ... --json`. Edit JSON directly only when no
   command covers the change; read `docs/API-CARD.md` when a script contract is
   unclear.
4. Run `tn iterate --project . --json` as the default repair loop; fix the
   owning durable source and rerun. Start with compact stdout; inspect reports
   or deep logs only when a diagnostic points to them.
   `TN_ITERATE_OK` proves only the committed scenarios that ran. Before a
   completion claim, inspect their assertion coverage and add prompt-specific
   proof for any user acceptance criterion they do not represent.
   Do not load the verify skill or inspect artifact trees before this first
   iterate run; use them only to resolve an actionable iterate diagnostic.
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
