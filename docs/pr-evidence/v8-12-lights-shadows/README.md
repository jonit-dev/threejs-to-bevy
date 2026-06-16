# V8-12 Lights/Shadows Evidence

Generated from:

```bash
WINIT_UNIX_BACKEND=wayland pnpm verify:v8:lights-shadows -- --json
```

Result:

- `verification-report.json`: `TN_VERIFY_V8_LIGHTS_SHADOWS_OK`
- `v8-lights-shadows-report.json`: `status: pass`, `diagnostics: []`
- `threejs-bevy-side-by-side.png`: Three.js and Bevy screenshot captures for
  the shadow-sensitive V3 environment bookmarks
- `preview2-target-vs-output.png`: target reference compared with captured
  Three.js and Bevy output

This evidence covers the focused V8-12 shadow-policy and shadow-sensitive
capture trace. It records drift metrics and does not claim point-light shadow,
PCF, probe, or full shadow visual parity.
