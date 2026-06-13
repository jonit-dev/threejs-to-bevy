# V4 Scripting Example

Primitive scripting proof for V4.

```bash
pnpm tn -- build --project examples/v4-scripting --json
pnpm tn -- verify --project examples/v4-scripting --frames 3 --expect-motion --json
pnpm tn -- dev --target web --project examples/v4-scripting --json
```

The build emits `systems.ir.json` and `scripts.bundle.js`. The visual verifier
captures web screenshots and expects visible motion from the scripted rotating
primitive cubes.
