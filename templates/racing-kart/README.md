# Racing Kart Template

This template is a screenshot-ready ThreeNative racing scene with a foreground
player kart, visible rivals, curved track markers, chase camera framing, and a
retained HUD. It is designed as a first project for agents that need a visible
game composition without debugging asset scale first.

Run:

```bash
pnpm install
pnpm run build
pnpm run validate
pnpm run verify
pnpm test
```

Scale calibration lives in `assets/kart-scale-calibration.json`. The authored
kart is 1.2m wide, 1.8m long, and 0.55m tall on a 3.6m lane, with a camera
offset of `[0, 3.4, 6.2]`. If the player kart is tiny, clipped, hidden, or
larger than the lane, treat that as a visual QA failure before adding external
models.

`src/game.ts` is only the composition root. Scene assembly lives under
`src/scenes/`, input lives under `src/input/`, and portable behavior lives under
`src/scripts/` as module/export references so generated bundles include script
manifest provenance.
