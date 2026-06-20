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
presence. Runtime preview diagnostics, dedicated screenshots, and recording are
tracked follow-up workflows; use `tn verify` for available web preview proof
until `tn screenshot` and `tn record` are implemented.
