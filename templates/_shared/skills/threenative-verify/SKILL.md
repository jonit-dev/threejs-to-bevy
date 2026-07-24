---
name: threenative-verify
description: Verification ladder for ThreeNative projects - iterate diagnostics, playtests, proofs, and release gates. Use when checking work, debugging a failing loop, or preparing completion or release claims.
---

# ThreeNative Verification

<!-- tn-guidance:focused-loop-v1 -->

Self-verify in this order: narrowest structural check, then focused gameplay
proof, then the production gates. Do not skip from an edit straight to a
release claim.

```bash
# 1. Choose the focused loop from the change table below
tn authoring script check --project . --json
tn playtest --project . --scenario playtests/<name>.playtest.json --stable-artifacts --json

# 2. Inspect compact focused evidence before opening deep artifacts
tn playtest report --latest --scenario <name> --json

# 3. Integrated milestone proof (add --native for the native runtime)
tn iterate --project . --json
tn scene proof <scene-id> --project . --json

# 4. Production gates before calling work done
pnpm run game:plan -- --goal "<game idea>"
pnpm run game:improve
pnpm run verify
pnpm run game:score
pnpm run game:qa
pnpm run game:release
```

## Choose the inner loop

| Change | First loop | Escalate when |
| --- | --- | --- |
| Visual, material, lighting, camera, or UI presentation | Keep one `tn dev --target web` preview alive; run `tn screenshot --project . --url <preview-url> --out <path> --wait-ready --json`, or `tn parity visual --project . --url <preview-url> --reference <path> --json` for a repeatable reference | The live preview reports stale source or a served/local bundle mismatch |
| Physics, collision, movement, or input behavior | Run one committed scenario: `tn playtest --project . --scenario playtests/<name>.playtest.json --stable-artifacts --json` | The compact report points to `runtime-trace.json`, contacts, or write-audit evidence |
| Script or type contract | Run `tn authoring script check --project . --json` or the project typecheck, then the one scenario exercising that export | The focused scenario crosses adapters or reports a runtime-only failure |
| Milestone, integrated gameplay loop, or completion checkpoint | Run `tn iterate --project . --json` | Iterate names a narrower failing proof or the work is ready for QA/release gates |

Do not restart the live preview between visual captures unless freshness
diagnostics require it. Do not use a broad milestone loop for every small
visual, physics, or script edit.

<!-- tn-guidance:failure-triage-v1 -->

## Failure-smell triage

- **Identical before/after traces:** confirm the scenario sends the declared
  action/key, the system export is attached and scheduled, and the observed
  entity/resource is the real owner. An unchanged trace is missing causal
  execution, not permission to weaken the assertion.
- **Served/local freshness mismatch:** stop the stale preview, confirm the
  project root, URL/port, source mtimes, and reported bundle hash, then restart
  `tn dev`. Do not compare against a screenshot from a different served bundle.
- **Physically impossible tuning:** inspect mass, gravity, forces/thrust,
  damping/drag, collider dimensions, and spawn pose. Repair the authored
  physical budget and rerun the same scenario; do not widen tolerances or
  replace causal physics with scripted teleportation.

## The iterate loop

- `tn iterate --project . --json` is the integrated milestone loop. Use the
  focused table above for individual visual, physics, input, or script edits.
  Iterate runs
  authoring validation, build, screenshot capture, and the first committed
  playtest scenario, writes the full report under
  `artifacts/iterate/latest/report.json`, and prints a compact pass/fail
  summary. Inspect the referenced screenshot/report, fix the owning durable
  source/script, and rerun.
- On diagnostics, keep code/path in notes and fix the owning source document
  or script.

## Playtests

- Use compact playtest stdout or
  `tn playtest report --latest --scenario <name> --json` before opening deep
  logs, and only after iterate points at a playtest failure.
- Use `tn playtest --discover --json` or `--suggest-scenario <name>` only when
  you need a new scenario. Use a committed `playtests/*.playtest.json`
  scenario with `--stable-artifacts` for multi-step behavior (add
  `--watch --pass-once` while iterating).
- Open deep logs such as `effect-log.json`, `observations.json`, or
  `runtime-trace.json` only when a compact diagnostic points to them.
- Before release claims, rerun the committed scenario with `--target desktop`
  so the native runtime is proved, not only web.

## Done means proved

Before calling a game done, produce evidence for all of: build, runtime
readiness, nonblank screenshot, visible frame motion, active
character/vehicle animation where clips exist, runtime relative-scale proof
with `tn game scale --project . --json` for character/vehicle scenes, and
input playtest. `tn game score --project . --json` should not report
`TN_GAME_MOTION_FEEL_UNPROVEN` or `TN_GAME_VISUAL_BASELINE_PLACEHOLDER`.
Judge the screenshot against the `threenative-game-quality` skill.

`TN_ITERATE_OK` means the committed scenarios that ran passed; it is not a
semantic claim that the user's requested game was built. Compare scenario
assertion IDs and observations with the prompt's core verbs and acceptance
criteria, then add or repair prompt-specific scenarios until every requirement
has evidence.

`tn iterate` artifacts are fast repair-loop evidence only; they do not replace
`game:qa`, `game:release`, or desktop playtest evidence before completion
claims.
