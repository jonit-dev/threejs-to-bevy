---
name: threenative-workflow
description: Default workflow for a generated ThreeNative project - plan, author, iterate, prove. Use when starting work, creating or substantially changing a game, or deciding which command or skill to use next.
---

# ThreeNative Generated Project Workflow

This skill is the compact front door. Run the planning command before opening
the longer worksheet or sibling skills; use those only when the plan or an
actionable diagnostic says the compact path is insufficient:

- `threenative-authoring` - editing entities, scenes, flows, UI, and scripts.
- `threenative-game-quality` - sourcing assets and meeting the visual bar.
- `threenative-verify` - iterate diagnostics, playtests, and release gates.

## Default loop

```bash
pnpm tn -- game plan --goal "<game idea>" --project . --json
pnpm tn -- iterate --project . --json
```

(`pnpm tn -- <args>` and `tn <args>` are equivalent; use whichever resolves.)

1. Before creating or substantially changing the game, run
   `tn game plan --goal "<game idea>" --project . --apply --json` for supported
   collector/lane-runner scaffolds, or omit `--apply` to keep planning
   non-mutating. Treat compact stdout and
   `artifacts/game-production/plan.json` as the checklist. Open
   `AGENT_GAME_PLAN.md` only if planning fails or a required plan field is
   absent.
2. Use the matching `mechanicDecomposition[].cookbookId` from the plan with
   one `tn cookbook show <id> --json` call. Search only when the plan has no
   match; list only when search also has no match.
   Inspect the planner diagnostics plus the candidate mechanic's responsibilities
   and proof before applying it. When the plan reports
   `TN_GAME_PLAN_OFF_RECIPE`, emits `authoringMode: "custom-on-starter"`, or the
   candidate does not cover the prompt's core verbs and acceptance criteria,
   custom-author the missing behavior on top of the structured-source starter
   in `content/**/*.json` and `src/scripts/**/*.ts`. Run the emitted
   `nextInspectionCommand` first so edits extend the starter's actual owners.
3. Author with the plan and cookbook's bounded CLI operations. Apply
   gameplay recipes only as bounded steps from a complete plan, for example
   `tn recipe apply top-down-collector --scene <scene> --player <entity> --camera <camera> --json`,
   keeping recipe output in `content/**/*.json` and `src/scripts/**/*.ts`.
   Read `threenative-authoring` only when an operation or source contract is
   unclear. Prove the mechanic before optional asset-polish work.
   When a reviewed `nextAuthoringCommand` emits a committed proof scenario, run
   `nextProofCommand` immediately. Do not assume a command is relevant merely
   because the planner emitted it.
4. After gameplay, controls, script, source, or visual changes, run
   `pnpm tn -- iterate --project . --json` (or `pnpm run iterate`) as the
   default repair loop. Fix the owning durable source or script and rerun.
   Inspect compact diagnostics first. Read `threenative-verify` only when a
   diagnostic requires a repair path not present in compact stdout.

## Technical-debt guardrails

- Extend the owning source document, script, manifest, or contract. Do not
  copy registry data, helpers, fallbacks, or proof logic into a second surface.
- Do not repair generated output, weaken proof assertions, disable scenarios,
  or silently accept unsupported behavior. Fix the durable owner and rerun the
  diagnostic.
- If a temporary compatibility bridge is unavoidable, record its owner,
  removal condition, and verification in the project plan or issue. Report
  missing capabilities explicitly instead of creating a local workaround.

## Scaffold-first stop rule

When scaffold-first `tn game plan --apply` is followed by `TN_ITERATE_OK`,
inspect the scenario assertion coverage. Stop only when the prompt's playable
loop and acceptance criteria are represented by those outputs; otherwise keep
authoring on top of the starter and add prompt-specific proof. Report artifact
paths instead of auditing unrelated source files or running `git status`/`git
diff`.

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
