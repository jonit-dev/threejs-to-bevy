# Bowling Lane

Compact ThreeNative bowling-lane example.

Controls:

- `Space` or `Enter`: roll the ball.
- `R`: reset the rack.
- `A`/`D` or arrow left/right: aim before release.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
pnpm run verify
pnpm run game:score
tn scene inspect lane --json
tn scene proof lane --project . --json
```

Source layout:

- `content/scenes/lane.scene.json` owns scene membership, unique transforms,
  resources, systems, and compact prefab instances.
- `content/prefabs/*.prefab.json` owns reusable ball, pin, lane, rail, gutter,
  pin-deck, and backstop defaults.
- Pin rack placement lives on compact `pin.01` through `pin.10` transforms;
  scripts derive reset homes from those initial transforms at runtime instead
  of keeping a second rack layout.
- Use `tn prefab set-defaults`, `tn scene add-prefab-instance`, and
  `tn scene layout ten-pin` for bounded edits before hand-editing JSON.
