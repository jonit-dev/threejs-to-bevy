# Neon Harbor Rescue

Web-first forcing-function example for mid-size game surfaces.

## Loop

Pilot the rescuer through a harbor menu, dock phase, rooftop phase, battery
progress, settings mode, saved-progress HUD text, fail state, and KeyR retry.
The first slice is intentionally classified as build-only until visual assets,
human playtest notes, and stable QA/release evidence are captured.

## Commands

```bash
pnpm run game:plan
pnpm run iterate
pnpm run playtest
pnpm run playtest:progression
pnpm run playtest:retry
pnpm run game:qa
pnpm run game:release
```

`artifacts/game-production/plan.json` is the preserved production plan.
`FRICTION.md` records repair events and follow-ups from the build.
