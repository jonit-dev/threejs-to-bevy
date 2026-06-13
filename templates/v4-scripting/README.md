# V4 Scripting Template

Primitive scripting proof for V4.

```bash
pnpm install
pnpm run build
pnpm run verify
pnpm run dev:web
```

The build emits `systems.ir.json` and `scripts.bundle.js`. The visual verifier
captures web screenshots and expects visible motion from the scripted rotating
primitive cubes. The demo also exercises the V4 portable context surface:
time, input, event read/write, command buffers, `physics.raycast`, and
`animation.play`.
