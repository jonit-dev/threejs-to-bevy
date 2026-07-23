# Battle of the Pacific

A focused ThreeNative flight example: one animated Douglas SBD-3 in portable
aerodynamic flight over the ocean, with a React webview flight deck.

## Run

```bash
pnpm install --ignore-workspace
pnpm run build:overlay:flight-deck
pnpm run iterate
pnpm run dev:web
```

## Controls

- W/S or Up/Down: pitch
- A/D or Left/Right: roll
- Q/E: rudder
- Left Shift / Left Control: throttle
- F: deploy or retract flaps
- R: retry after a ditch

The normalized source aircraft, bounded Blender recipe, generated GLB, clip
metadata, and generator provenance all live inside this example.
