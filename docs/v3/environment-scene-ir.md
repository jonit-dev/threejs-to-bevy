# Environment Scene IR

`environment.scene.json` is the V3 rich-scene composition layer. It is scoped to
dense environment scenes such as the forest path proof and should not become a
catch-all replacement for `world.ir.json`.

## Purpose

The environment scene IR describes source assets, generated instances,
bookmarked camera views, atmosphere, first-person walkthrough data, and
walkability probes for V3 verification.

## File

```txt
environment.scene.json
```

Referenced from `manifest.json` as `entry.environmentScene`.

## Concepts

- Source asset: logical model or texture source used by instances.
- Instance: placed model reference with transform, tags, and optional metadata.
- Scatter group: deterministic generated placements for repeated props.
- Hero placement: intentionally authored focal object placement.
- Terrain/path: V3 path and bounds representation for the forest scene.
- Walkable region: area where the first-person camera can move.
- Blocking probe: deterministic check that movement is constrained.
- Camera bookmark: named camera view used for screenshots and review.
- Atmosphere profile: sun, ambient, fog/haze, sky, shadow, and color-management
  intent.
- First-person config: camera height, movement speed, and walkthrough settings.

## Validation Rules

- All source assets must exist in the emitted bundle.
- All instances must reference valid source assets.
- Instance transforms must be finite.
- Scatter seeds and counts must be deterministic.
- Bookmarks must have valid transforms.
- Bookmarks should list expected tags when composition checks need visible
  asset classes.
- Terrain/path/walkability metadata must be finite and nondegenerate.
- Blocking probes must reference valid walkability data.
- Budgets must be evaluated against the target profile.
- Runtime-specific behavior must be represented as target capabilities or
  adapter-private mapping, not as public Bevy or Three.js internals.

## Verification

Use:

```bash
pnpm verify:v3
```

Relevant reports:

- `artifacts/v3/v3-scene-report.json`
- `artifacts/v3/v3-atmosphere-report.json`
- `artifacts/v3/v3-first-person-report.json`
- `artifacts/v3/v3-walkability-report.json`
