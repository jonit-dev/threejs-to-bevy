# Asset Provenance

- Plan command: `tn game plan --goal "toy train yard switcher cargo sorting arcade game" --project examples/toy-train-yard-switcher --json`.
- SQLite direct searches:
  - `tn asset source search --game-category vehicle --format glb --direct-only --json` returned no records.
  - `tn asset source search --game-category arcade --format glb --direct-only --json` returned no records.
  - `tn asset source search --game-category trains --format glb --direct-only --json` returned no records.
- Curated workflow fallback: `docs/workflows/open-source-3d-asset-kits.md` lists Kenney Train Kit as CC0 for rail traversal, train scenes, and track pieces, but no direct SQLite GLB record was available for this slice.
- Runtime visual kit: custom-authored low-poly primitive composition in structured source for locomotive, wheels, rails, cargo crates, switch depots, crossing gates, bumpers, roundhouse, and yard set dressing.
- Audio: `train-chime.wav` is copied from an existing local example feedback sound for deterministic proof.
