# Coordinate, Units, Rotation, and Color Conventions

These conventions are required for V3 rendering parity work. When a runtime
cannot follow one exactly, document the adapter-specific drift in
[bevy-feature-parity.md](bevy-feature-parity.md).

| Area | Decision |
| --- | --- |
| World units | `1` world unit equals `1` meter. |
| Up axis | `+Y` is up. |
| Forward axis | `-Z` is forward. |
| Right axis | `+X` is right. |
| Handedness | Public world convention follows the Three.js/glTF right-handed basis: `+X` right, `+Y` up, `-Z` forward. Runtime adapters must document any internal conversion. |
| Public Euler order | Prefer quaternions. When Euler authoring is exposed, use `XYZ` order unless a narrower API states otherwise. |
| IR rotation | Quaternion `[x, y, z, w]`. |
| Camera FOV | Perspective camera FOV is vertical degrees in public APIs and IR. |
| glTF import scale | Preserve source scale unless an import profile explicitly overrides it. |
| Color literals | Authored hex colors are sRGB. |
| Runtime material factors | Material scalar factors are applied in the runtime material's expected linear workflow after sRGB authoring colors are converted. |
| Texture color space | Base color and emissive textures are sRGB. Normal, metallic-roughness, occlusion, and data textures are linear. |
| Fog/atmosphere colors | Authored as sRGB colors and converted by each runtime according to its color-management pipeline. |
| Asset origins | Preserve imported asset origins; scene placement should use explicit instance transforms. |
| Time | Verification scenes should use deterministic fixed inputs and static frame time unless testing motion. |

## V3 Drift To Watch

- Bevy and Three.js may differ in default tone mapping, exposure, shadow
  filtering, and fog implementation.
- Imported glTF roots may include authoring transforms that are visually subtle
  until compared side by side.
- Texture color-space mistakes often look like lighting bugs. Check texture
  slots before tuning light intensity.
