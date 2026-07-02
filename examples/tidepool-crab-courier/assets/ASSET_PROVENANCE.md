# Asset Provenance

## Production Plan

Playable loop: move the hermit crab courier, collect five shell tokens, charge
three beacon shells, dodge foam bands and gull shadows, return to the driftwood
hut, and retry with Space after a fail or win state.

Controls: WASD or arrow keys for movement, Space for retry.

Objective: light all three beacon shells and return home before the tide timer
reaches zero.

Progression: moving hazards cross the safe path while the tide countdown
decreases.

Feedback moments: crab bob and claws follow input, shell tokens float, charged
beacons pulse, hazards slide with warning marks, HUD updates shell/beacon/tide
state, and win/fail states change the status line.

## Catalog Searches

- `tn asset source search --game-category arcade --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category ocean --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category beach --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category underwater --format glb --direct-only --json`
  returned Babylon.js underwater GLBs, including catalog ID
  `babylonjs-assets-underwaterscenerocksbarnaclesmussels-glb`.

Selected catalog record inspected:

- Catalog ID: `babylonjs-assets-underwaterscenerocksbarnaclesmussels-glb`
- Direct URL:
  `https://raw.githubusercontent.com/BabylonJS/Assets/main/meshes/Demos/UnderWaterScene/underwaterSceneRocksBarnaclesMussels.glb`
- Source URL:
  `https://github.com/BabylonJS/Assets/tree/main/meshes/Demos/UnderWaterScene`
- Provenance URL:
  `https://github.com/BabylonJS/Assets/blob/main/meshes/Demos/UnderWaterScene/underwaterSceneRocksBarnaclesMussels.glb`
- Origin: Babylon.js Assets, origin URL `https://github.com/BabylonJS/Assets`
- License evidence: `CC-BY-4.0`, attribution required, reviewed by repo
  curation on 2026-07-02.
- Conversion notes: not downloaded for this example; it is a full underwater
  scene fragment with attribution burden and does not match the small top-down
  low-poly tidepool/crab/buoy silhouettes needed here.

## Curated Sources Considered

- `docs/workflows/open-source-3d-asset-kits.md` lists Kenney Watercraft Kit,
  Kenney Pirate Kit, Quaternius Animated Fish Pack, 3TD Tropical Environment
  Pack, and Babylon.js underwater demos as marine-adjacent sources.
- These sources did not provide a direct coherent hermit crab, foam band, gull
  shadow, beacon shell, driftwood hut, and tidepool set in the SQLite direct
  search path.

## Selected Fallback

This example uses a custom-authored low-poly primitive kit in durable structured
source. The kit is composed from spheres, cylinders, cones, boxes, torus rings,
and planes with authored materials, lighting, transforms, and scripted motion.

High-value surfaces:

- Player-hero: hermit crab body, shell, claws, and eye stalks.
- Obstacle-enemy: sweeping foam bands and gull shadows with warning halos.
- Reward-interactable: shell tokens and three beacon shells.
- World-environment: tidepool sand, water pools, driftwood hut, kelp, rocks,
  shells, horizon bands, and shoreline bounds.
- UI-HUD: shell, beacon, tide, and status text with mobile screenshot proof.
- Audio-feedback: local generated PCM WAV cue `assets/shell-ping.wav` (mono
  44.1 kHz, short sine-envelope ping) for deterministic local runtime
  packaging.
