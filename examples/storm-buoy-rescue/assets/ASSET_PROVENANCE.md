# Storm Buoy Rescue Asset Provenance

## Catalog Searches

- `tn asset source search --game-category boats --format glb --direct-only --json`
  - Result: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category nautical --format glb --direct-only --json`
  - Result: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category ships --format glb --direct-only --json`
  - Result: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category boats --json`
  - Result: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --file-role model --json`
  - Reviewed fallback records. The returned direct records did not provide a coherent tugboat/harbor kit for this slice.

## Curated Source Review

`docs/workflows/open-source-3d-asset-kits.md` lists Kenney Watercraft Kit,
Kenney Pirate Kit, and Quaternius Ships Pack as preferred naval/boat sources.
The automation catalog did not expose a suitable direct GLB/glTF record for
this generated-game pass, so no third-party model was downloaded.

## Authored Fallback

- Catalog ID: `custom-authored-low-poly-harbor-kit`
- Origin: ThreeNative structured source in `content/scenes/arena.scene.json`
- License posture: project-authored source
- Review status: fallback-authored
- Conversion notes: no conversion. Tugboat, buoys, whirlpools, lighthouse,
  dock, breakwater, rocks, foam strips, material palette, and HUD are authored
  as structured-source primitive compositions with stable IDs.

## Surface Ledger

- `player-hero`: custom low-poly tugboat from `player`, `player.deck`,
  `player.cabin`, `player.stack`, and `player.bow.light`.
- `obstacle-enemy`: custom whirlpool hazard set from `whirlpool.01`,
  `whirlpool.01.foam`, `whirlpool.02`, and `whirlpool.02.foam`.
- `reward-interactable`: five glowing distress buoys plus buoy lights.
- `world-environment`: harbor water, channel lane, breakwaters, dock,
  lighthouse, rocks, net rack, and start marker.
- `ui-hud`: retained UI source in `content/ui/hud.ui.json`.
- `audio-feedback`: starter `assets/goal-ping.wav`; runtime trigger support is
  planned as fallback audio evidence for this slice.
