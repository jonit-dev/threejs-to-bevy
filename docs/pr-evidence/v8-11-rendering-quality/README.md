# V8-11 Rendering Quality Evidence

Generated from:

```bash
WINIT_UNIX_BACKEND=wayland pnpm verify:v8:rendering-quality -- --json
```

Result:

- `verification-report.json`: `TN_VERIFY_V8_RENDERING_QUALITY_OK`
- `rendering-quality-report.json`: `status: pass`, `diagnostics: []`
- `contact-sheet.png`: Three.js and Bevy side-by-side fog/sky capture
- `diff.png`: pixel diff for the captured frames
- `web.png`: Three.js capture
- `bevy.png`: Bevy native capture

This evidence covers the focused V8-11 fog/sky visual parity slice. It does
not claim the broader V8-11 skybox, cubemap, instancing, batching, or
post-processing surface.
