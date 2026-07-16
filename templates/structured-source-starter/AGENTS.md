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

1. Before creating or substantially changing the game, run
   `tn game plan --goal "<game idea>" --project . --json` (or
   `pnpm run game:plan`), and apply a reviewed plan with
   `pnpm run game:improve`
   (add `--apply` for supported scaffolds). Its compact output and plan
   artifact are the checklist; open `AGENT_GAME_PLAN.md` only when the command
   fails or omits a required field.
   Inspect diagnostics and proposed mechanic responsibilities before applying
   a scaffold, recipe, or `nextAuthoringCommand`. If the plan reports
   `TN_GAME_PLAN_OFF_RECIPE`, or no proposal covers the goal's core verbs and
   acceptance criteria, custom-author the missing loop on top of this starter
   in `content/**/*.json` and `src/scripts/**/*.ts`. Run the emitted
   `nextInspectionCommand` first to inspect the starter's real source owners.
2. Use the plan's matching `mechanicDecomposition[].cookbookId` with
   `tn cookbook show <id> --json`. Search only when no match is emitted; list
   only when search also has no match. Read `docs/API-CARD.md` only when the
   cookbook script needs a contract detail.
3. Author with deterministic CLI edits: `tn actor ... --json`,
   `tn scene ... --json`, `tn ui ... --json`, `tn flow ... --json`, and
   `tn add <mechanic-block> ... --json`. Edit JSON directly only when no
   command covers the change.
4. After changes, run `tn iterate --project . --json` (or `pnpm run iterate`)
   as the default repair loop; fix the owning durable source and rerun.
   Start with compact stdout; inspect reports or deep logs only when a
   diagnostic points to them.
   `TN_ITERATE_OK` proves only the committed scenarios that ran. Before a
   completion claim, inspect their assertion coverage and add prompt-specific
   proof for any user acceptance criterion they do not represent.
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
