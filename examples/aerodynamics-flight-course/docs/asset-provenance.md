# Asset Provenance

Reviewed: 2026-07-23.

`assets/aircraft.douglas-sbd3.glb` was supplied in the repository workspace and
processed through the repository's bounded source-GLB animation workflow. No
public catalog record or external download URL is asserted. Its license remains
`user-provided`; redistribution outside this repository requires confirmation
from the supplying user.

- SHA-256:
  `57d9441628397ae28aa55d04889856c945275ca7cbd3e7ec401557b03b00a895`
- `tn asset inspect`: `TN_ASSET_INSPECT_OK`, 22 meshes, 41 nodes, 21
  materials, 10,416 triangles, 61 embedded images, and clips
  `propeller.spin`/`flaps.deploy`.
- Bounds: 2.0 x 0.619 x 1.583 with centered origin and `ok` gameplay-scale
  calibration.
- `tn model-test --verify`: `TN_MODEL_TEST_OK`, isolated build successful,
  nonblank 1280x720 render, 25 visible meshes, embedded textures loaded, and
  authored materials matched without fallback.

The committed GLB is the example's complete runtime dependency. Any separate
authoring recipe used to prepare the supplied source is not required to build
or run this example.
