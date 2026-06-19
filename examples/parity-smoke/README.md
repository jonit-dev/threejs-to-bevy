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
| **Materials** | Rough matte, metal/rough, emissive cards |

The hook compares a **foreground crop** (hero, probes, near PBR) where web↔Bevy parity is
tight; fog markers remain in the full frame for visual inspection in the contact sheet.

Runtime parity fixes applied in both adapters:

- Bevy maps IR `exponential` fog to `ExponentialSquared` (matches Three.js `FogExp2`).
- Web patches fog depth to Euclidean distance (matches Bevy `length(view_to_world)`).

Used by `pnpm verify:parity:smoke` (pre-commit). Report:
`tools/verify/artifacts/parity-smoke/verification-report.json`.
