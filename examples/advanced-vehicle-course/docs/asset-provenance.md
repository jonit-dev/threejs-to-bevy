# Asset Provenance

Reviewed: 2026-07-23.

The catalog-first search command was:

```bash
tn asset source search --game-category racing --format glb --direct-only --json
```

It returned direct CC0 Kenney Starter Racing records. The committed vehicle,
barrier, and finish files come from the repository's Kenney Racing Kit starter
asset family, whose owning source page is
`https://kenney.nl/assets/racing-kit` and license is CC0-1.0. The repository
workflow record is `docs/workflows/open-source-3d-asset-kits.md`.

| File | SHA-256 | Inspection |
| --- | --- | --- |
| `assets/raceCarRed.glb` | `1098f37bd5bfad5e6d46266b57f146e0f1f8ea96193df03653966d58f0692b3c` | `TN_ASSET_INSPECT_OK`; 1,430 triangles, six named nodes, four materials |
| `assets/barrierRed.glb` | `6d7de595a92507af6fcb40fe5a62730925ea23f1f8c727b8ecdec9eba9b98156` | `TN_ASSET_INSPECT_OK`; 28 triangles |
| `assets/flagCheckers.glb` | `2feb99a4974fc82f90b43436421feb0874c074d4ea685d9673c6803429fd32ba` | `TN_ASSET_INSPECT_OK`; 184 triangles, embedded checker texture |

`tn model-test assets/raceCarRed.glb --verify` returned
`TN_MODEL_TEST_OK`, built the isolated bundle, rendered a nonblank 1280x720
image with 14 visible meshes, and matched all authored materials. The source
pivot offsets reported by inspection are compensated by scene transforms; they
are not assumed to be centered.
