---
name: threenative-verify
description: Verification ladder for ThreeNative projects - iterate diagnostics, playtests, proofs, and release gates. Use when checking work, debugging a failing loop, or preparing completion or release claims.
---

# ThreeNative Verification

Self-verify in this order: narrowest structural check, then focused gameplay
proof, then the production gates. Do not skip from an edit straight to a
release claim.

```bash
# 1. Default inner loop after gameplay/input/script/source changes
tn iterate --project . --json

# 2. Focused follow-up only when iterate names a playtest/scenario issue
tn playtest report --latest --scenario <name> --json

# 3. Scene and runtime proof (add --native for the native runtime)
tn scene proof <scene-id> --project . --json

# 4. Production gates before calling work done
pnpm run game:plan
pnpm run game:improve
pnpm run verify
pnpm run game:score
pnpm run game:qa
pnpm run game:release
```

## The iterate loop

- `tn iterate --project . --json` is the default repair loop. Do not run
  validate, build, screenshot, or playtest separately unless the compact
  iterate diagnostic explicitly asks for deeper proof. It already runs
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

`tn iterate` artifacts are fast repair-loop evidence only; they do not replace
`game:qa`, `game:release`, or desktop playtest evidence before completion
claims.
