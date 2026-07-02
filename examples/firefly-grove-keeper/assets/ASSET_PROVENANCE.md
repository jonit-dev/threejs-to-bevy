# Asset Provenance

## Catalog Searches

- `tn asset source search --game-category nature --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category garden --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category insects --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- Broad `nature` and `garden` catalog searches returned no records.
- The broad `file-role model` catalog records were unrelated loader fixtures,
  city assets, or Objaverse records that did not fit the firefly garden style.

## Curated Sources Considered

- `docs/workflows/open-source-3d-asset-kits.md` lists Kenney Nature Kit
  (CC0), Quaternius Stylized Nature MegaKit (CC0), and KayKit Medieval Hexagon
  Pack (CC0) as coherent nature/terrain options.
- No direct catalog GLB entry matched the needed player firefly, moth shadow,
  lantern flower, hollow stump, and small moonlit garden surfaces.

## Selected Fallback

This example uses a custom-authored low-poly primitive kit in durable structured
source. The kit is composed from spheres, cylinders, cones, boxes, torus rings,
and planes with authored materials, lighting, transforms, and scripted motion.

High-value surfaces:

- Player/hero: firefly body, glow core, wings, antennae.
- Obstacle-enemy: drifting moth shadows with ground warning halos.
- Reward/interactable: pollen sparks and three lantern flowers.
- World/environment: moonlit grove, hollow stump return goal, pond, path, reeds,
  mushrooms, stones, stars, moon, and canopy bands.
- UI/HUD: pollen, flower, dawn, and state status text.
- Audio-feedback: local generated PCM WAV cue `assets/pollen-ping.wav` (mono
  44.1 kHz, short sine-envelope ping) for deterministic local runtime
  packaging.
