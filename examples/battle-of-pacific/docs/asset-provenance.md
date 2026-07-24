# Battle of the Pacific Asset Provenance

## Douglas SBD-3

- Role: player aircraft.
- Source: user-provided `douglas_sbd-3.glb`, moved into this example and
  normalized by the example-local bounded Blender recipe.
- Runtime asset: `assets/generated/aircraft.douglas-sbd3.glb`.
- Embedded content: 61 images, 21 materials, 63 textures, and ten authored
  powered-flight/control-surface animation clips.

## Photographic Pacific Sky

- Role: visible equirectangular skybox plus reflection and irradiance
  environment for the aircraft and ocean.
- Runtime asset:
  `assets/imported/polyhaven/kloofendal-48d-puresky/environment.jpg`.
- Catalog/provider asset:
  `kloofendal_48d_partly_cloudy_puresky`.
- Source URL:
  `https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky`.
- Origin: Poly Haven's live public asset record and direct-download endpoint.
- License: CC0-1.0; redistribution allowed and attribution not required.
- Authors: Greg Zaal and Jarod Guest.
- Runtime derivative: 2048 x 1024 progressive JPEG sRGB at quality 90,
  183,095 bytes, SHA-256
  `2d65a34b4ee3654d7297c5cb0cb1da3bcf8e1cf60f08d49a763a9c13279bfccc`.
- The provider's direct 8192 x 4096 tonemapped image was downsampled to a
  web-appropriate 2K runtime panorama. The official 1K HDR source and exact
  provider metadata remain example-local.
- Selection rationale: a runtime-camera comparison against the production
  reference selected this sky-only midday panorama for its distinct bright
  white cumulus, saturated blue openings, directional sun, and soft neutral
  horizon. It is visibly closer than the rejected `sunflowers_puresky`
  candidate, whose cloud canopy rendered gray-green in the gameplay view.
  The selected panorama gives metallic aircraft and ocean surfaces coherent
  reflection lighting without terrestrial horizon geometry.
