# Runtime Docs

Runtime docs cover how emitted IR is consumed by adapters.

- [Runtime Adapters](runtime-adapters.md)
- [Runtime Backends](runtime-backends.md)
- [Desktop Packaging](desktop-packaging.md)

## Debugging Entry Points

Use the CLI task help before debugging runtime visuals by hand:

```bash
tn help camera
tn help transform
tn help visual-qa
tn doctor --project . --json
```

The current `tn doctor` implementation checks project setup and bundle file
presence. Web previews expose `window.__THREENATIVE_READY__` with canvas size,
runtime diagnostics, active camera ID, visible mesh count, final visible world
bounds, asset counts, resource failures, and camera distance/clip-range hints.
Use `tn screenshot` and `tn record` for direct proof artifacts, or `tn verify`
for automated visual checks.
