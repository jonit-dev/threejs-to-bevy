# Asset Provenance

- SQLite direct search: `tn asset source search --game-category puzzle --format glb --direct-only --json` returned no direct GLB records and one non-direct fallback record.
- Fallback inspected: `workflow-genre-specific-pack-shortlist-chilly-durango-3d-retro-plumbing-wiring-machinery`, origin `docs/workflows/open-source-3d-asset-kits.md`, source URL `https://chilly-durango.itch.io/3d-retro-plumbing-wiring`, CC0-1.0 posture, reviewed on 2026-07-02. It was not selected because it is a pack page with `.blend` source requiring separate subasset selection/conversion.
- SQLite direct search: `tn asset source search --game-category arcade --format glb --direct-only --json` returned no records.
- Runtime visual kit: custom-authored low-poly primitive composition in structured source for the cart, prism shards, color pedestals, heat bars, kiln rails, glass tables, and cooling gate.
- Audio: `glass-chime.wav` is copied from an existing local example feedback sound for deterministic proof.
