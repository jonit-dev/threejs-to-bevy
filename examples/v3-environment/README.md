# V3 Environment Example

This example is the V3 sandboxed game folder. It reads the canonical source pack
from `assets-source/environment/glTF` and emits a self-contained bundle at
`dist/forest.bundle`.

The emitted bundle contains deterministic IR files, selected glTF models,
required `.bin` sidecars, referenced textures, and the `Preview_2.jpg` reference
image under bundle-local `assets/environment` paths.

Build and validate:

```bash
pnpm tn -- build --project examples/v3-environment
```
