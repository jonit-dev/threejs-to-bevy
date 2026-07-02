# Asset Provenance

Game: Asteroid Mail Runner

Catalog searches:

- `tn asset source search --game-category spaceship --format glb --direct-only --json`: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category asteroid --format glb --direct-only --json`: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category sci-fi --format glb --direct-only --json`: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category spaceship --json`: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --game-category asteroid --json`: `TN_ASSET_SOURCE_NO_MATCH`
- `tn asset source search --file-role model --json`: returned general GLB fixtures and unrelated city-builder records, not a coherent space-courier pack.

Curated reference:

- `docs/workflows/open-source-3d-asset-kits.md` lists Kenney Space Kit, Quaternius Ultimate Space Kit, and Quaternius Ultimate Spaceships Pack as preferred CC0 human-sourcing options for arcade/space shooter and space exploration examples.

Decision:

- No direct SQLite record fit the player ship, asteroid hazards, checkpoint rings, capsules, and beacon station as one coherent local GLB kit.
- This example uses custom-authored structured-source primitive compositions for all high-value surfaces.
- The checkpoint gates intentionally use the promoted `torus` primitive in durable source to exercise the source-validation and compiler path.

Surface inventory:

- Player/hero: custom low-poly courier ship assembled from box/cone/sphere primitives.
- Obstacle/enemy: scripted moving asteroids with warning marker lights.
- Reward/interactable: data capsules and torus checkpoint gates.
- World/environment: starfield, route rails, beacon station, dock pad, background planet and debris.
- UI/HUD: retained structured UI bound to `GameState`.
- Audio-feedback: local generated PCM WAV cue `assets/mail-ping.wav` (mono
  44.1 kHz, short sine-envelope ping) for deterministic local runtime
  packaging. Runtime trigger support is planned fallback evidence for this
  slice; no in-game audio playback is claimed.
