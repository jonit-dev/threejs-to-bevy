# parity-smoke

Single-scene web↔Bevy visual smoke fixture for git hooks and fast parity checks.

One capture exercises the main visually impacting runtime configs together:

| Area | What is in the scene |
|------|----------------------|
| **Color** | Emissive RGB probes + standard/metal PBR materials |
| **Tone / exposure** | Atmosphere `colorManagement` with exposure 1.0 (`toneMapping: none`; ACES on pre-push) |
| **Lighting** | Atmosphere sun + ambient (point/spot on pre-push via `v10-visual-calibration-lighting`) |
| **Fog** | Exponential fog (`FogExp2` / Bevy `ExponentialSquared`) with mid/far depth markers |
| **Sky** | Atmosphere sky + horizon colors |
| **Materials** | Rough matte floor, metal/rough, emissive cards |

The hook compares the **full frame** (no region crop). Thresholds guard signed
brightness (Bevy must not underexpose vs web), average luminance, and p95 channel
delta. Per-pixel changed ratio is not gated here because fog + lit PBR still
differ pixel-wise until deeper BRDF parity lands; push gates cover broader scenes.

Runtime parity fixes applied in both adapters:

- Bevy maps IR `exponential` fog to `ExponentialSquared` (matches Three.js `FogExp2`).
- Web patches fog depth to Euclidean distance (matches Bevy `length(view_to_world)`)
  after the full scene graph is assembled (world meshes + environment path ribbon).
- Environment path ribbon color matches on web (`#8f7a55`) and Bevy.

Used by `pnpm verify:parity:smoke` (pre-commit). Report:
`tools/verify/artifacts/parity-smoke/verification-report.json`.
