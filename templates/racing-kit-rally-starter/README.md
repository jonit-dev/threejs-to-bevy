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

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
tn asset inspect assets --recursive --json
tn scene generate-modular-track racing-kit-rally --asset-dir assets --shape oval --size medium --prefix road.modular --json
tn scene proof-modular-track racing-kit-rally --asset-dir assets --prefix road.modular --actors player.car,rival.car --json
tn scene set-camera-look-at racing-kit-rally camera.main --position -5.45,1.65,10.5 --target 1.55,0.38,10.5 --json
tn playtest --project . --entity player.car --press KeyW --frames 60 --expect-moved --json
pnpm run verify
```
