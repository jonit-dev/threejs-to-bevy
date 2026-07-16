---
name: threenative-workflow
description: Default workflow for a generated ThreeNative project - plan, author, iterate, prove. Use when starting work, creating or substantially changing a game, or deciding which command or skill to use next.
---

# ThreeNative Generated Project Workflow

This skill is the compact front door. Load only this skill at the start; do not
preload the longer worksheet or all sibling skills. Open one of these only when
the plan or an actionable diagnostic makes it relevant:

- `threenative-authoring` - editing entities, scenes, flows, UI, and scripts.
- `threenative-game-quality` - sourcing assets and meeting the visual bar.
- `threenative-verify` - iterate diagnostics, playtests, and release gates.

## Default loop

```bash
tn game plan --goal "<game idea>" --project . --json
tn iterate --project . --json
```

1. Before creating or substantially changing the game, run
   `tn game plan --goal "<game idea>" --project . --json`. Treat compact stdout and
   `artifacts/game-production/plan.json` as the checklist. Open
   `AGENT_GAME_PLAN.md` only if planning fails or a required plan field is
   absent. Review mechanic responsibilities before running any mutation.
2. Choose one branch from the plan:
   - When it reports `authoringMode: "custom-on-starter"`, run the emitted
     `nextInspectionCommand` first. If inspection returns a capability-selected
     `nextAuthoringCommand`, run that bounded prototype command before opening
     broad source files. Only hand-author the missing behavior in
     `content/**/*.json` and `src/scripts/**/*.ts` when no executable authoring
     command is returned or its responsibilities do not cover the prompt.
   - When coverage is complete, inspect the candidate's responsibilities and
     proof, then use its `mechanicDecomposition[].cookbookId` with
     `tn cookbook show <id> --json` before running a reviewed mutation command.
3. Author with bounded `tn ... --json` operations. Read
   `threenative-authoring` only when an operation or source contract is unclear;
   read `threenative-game-quality` only when asset or polish work begins.
4. Immediately run the mutation result's emitted `nextProofCommand` (normally
   `tn iterate --project . --json`). Do not open the verify skill, full source,
   or artifact trees before this first proof run. Fix the owning durable source
   or script and rerun; read `threenative-verify` only when the compact iterate
   diagnostic requires deeper guidance.

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
