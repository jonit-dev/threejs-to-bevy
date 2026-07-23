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
  `assets/imported/polyhaven/pacific-sky/environment.png`.
- Catalog/provider asset:
  `kloofendal_48d_partly_cloudy_puresky`.
- Source URL:
  `https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky`.
- Origin: repository Poly Haven snapshot search followed by the bounded live
  provider import command.
- License: CC0-1.0; redistribution allowed and attribution not required.
- Authors: Greg Zaal and Jarod Guest.
- Runtime derivative: 2048 x 1024 PNG sRGB, SHA-256
  `d4f6157edcd8a343f7e65c686b8c4ade65921c044e62c40f1007e582b6098218`.
- The provider-imported 8192 x 4096 display image was downsampled to a
  web-appropriate 2K runtime panorama while the original 1K HDR source and
  provider provenance remain example-local.
- Selection rationale: sky-only photographic midday panorama with crisp
  cumulus clouds, directional sun, and no terrestrial horizon geometry. It is
  suitable for open-ocean flight and metallic reflection lighting and replaces
  both the rejected stylized `sky_88_2k` asset and the visually flat overcast
  ambientCG candidate.
