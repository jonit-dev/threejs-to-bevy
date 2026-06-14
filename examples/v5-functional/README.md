# V5 Functional Example

This example is the V5 functional scene seed. It reuses the curated
`examples/v3-environment/assets-source/environment` source pack and emits a
self-contained bundle under `dist/v5-functional.bundle`.

The current V5-06 purpose is textured standard-material proof: the source
environment assets include PNG texture dependencies, and the emitted bundle
copies those dependencies into bundle-local asset paths for web and Bevy
runtime consumption.

Build and validate:

```bash
pnpm tn -- build --project examples/v5-functional
pnpm tn -- validate --project examples/v5-functional
```
