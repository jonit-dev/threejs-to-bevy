# V5 Functional Example

This example is the maintained V5 functional visual-quality scene. It reuses
the curated `examples/v3-environment/assets-source/environment` source pack and
emits a self-contained bundle under `dist/v5-functional.bundle`.

The scene demonstrates promoted V5 visual contracts that have already landed:
textured environment assets, lighting and atmosphere metadata, shadow/color
fields, repeated dense scatter, source-asset LOD metadata, and environment
budget reports. Runtime mesh LOD swapping and renderer-level native instancing
remain future scope.

Build and validate:

```bash
pnpm tn -- build --project examples/v5-functional
pnpm tn -- validate --project examples/v5-functional
pnpm tn -- verify --project examples/v5-functional --frames 2 --json
pnpm verify:v5
```
