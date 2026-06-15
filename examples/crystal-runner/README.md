# Crystal Runner

Primitive-only endless runner example for the current ThreeNative engine.

The scene, input map, UI, camera, lighting, ECS state, and gameplay systems all
emit through the shared IR bundle consumed by both the Three.js web runtime and
the Bevy runtime adapter.

```bash
pnpm tn -- build --project examples/crystal-runner
pnpm tn -- validate --project examples/crystal-runner
pnpm tn -- verify --project examples/crystal-runner --frames 2 --json
pnpm tn -- dev --target desktop --project examples/crystal-runner
```
