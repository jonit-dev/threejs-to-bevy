# Racing Kit Rally Starter

This starter creates a source-owned kart-racing scene using Kenney Racing Kit
assets. The reusable race structure lives in `content/**/*.json`, while driving
and chase-camera behavior lives in `src/scripts/racing.ts`.

- `content/scenes/rally.scene.json` contains the modular track, start grid,
  staging props, lights, camera, cars, and prefab references.
- `src/scripts/racing.ts` owns kart controls, checkpoint flow, rival movement,
  grip bounds, reset behavior, and the low chase camera.
- `content/assets/rally.assets.json` keeps every GLB reference local to
  `assets/` so generated projects run without manual downloads.
- For major game changes, start with `AGENT_GAME_PLAN.md`; it is the local
  checklist for playable loop, catalog-first assets, UI approach, source
  owners, polish, scale, and proof before source mutation.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
pnpm run game:plan
pnpm run game:improve
tn asset inspect assets --recursive --json
tn scene generate-modular-track racing-kit-rally --asset-dir assets --shape oval --size medium --prefix road.modular --json
tn scene proof-modular-track racing-kit-rally --asset-dir assets --prefix road.modular --actors player.car,rival.car --json
tn scene set-camera-look-at racing-kit-rally camera.main --position -5.45,1.65,10.5 --target 1.55,0.38,10.5 --json
tn scene proof-camera racing-kit-rally --camera camera.main --target player.car --min-occupancy 0.04 --json
tn playtest --project . --scenario playtests/rally-throttle.playtest.json --stable-artifacts --json
pnpm run game:qa
pnpm run game:release
pnpm run verify
```

`threenative.config.json` records the playable loop, canonical controls,
checkpoint objective, retry path, and production proof commands. Keep that
metadata current when changing the starter so `tn game qa --run-proof` and
`tn game release` remain meaningful evidence instead of after-the-fact notes.
`AGENT_GAME_PLAN.md` is the human/agent worksheet for this loop, while
`artifacts/game-production/plan.json` is the machine-readable plan evidence.
