# Visual QA

Use visual QA commands to prove that a scene is visible, framed, and ready for
gameplay inspection before tuning screenshots by eye.

## Camera Framing Proof

```bash
tn scene set-camera-look-at racing-kit-rally camera.main --position -5.45,1.65,10.5 --target 1.55,0.38,10.5 --json
tn scene proof-camera racing-kit-rally --camera camera.main --target player.car --min-occupancy 0.04 --json
```

`proof-camera` reads structured scene source and reports:

- active camera id
- target visibility
- normalized screen position
- projected screen occupancy
- approximate roll
- near/far clipping range
- target world bounds

Failures include stable diagnostics for missing cameras or targets, low target
occupancy, target-outside-viewport, excessive roll, and clipping range issues.
Use the suggested `set-camera-look-at` command when the target is outside the
view or reads too small.

## Runtime Proof

After source-level camera proof passes, run a runtime screenshot or parity proof:

```bash
tn dev --target web
tn screenshot --url http://127.0.0.1:5173 --out artifacts/visual-qa/frame.png --wait-ready --json
tn verify --frames 2 --json
```

Treat Web and Bevy differences as adapter, camera mapping, asset, or test setup
issues. Do not tune runtime colors, materials, or lights only to match a
screenshot.
