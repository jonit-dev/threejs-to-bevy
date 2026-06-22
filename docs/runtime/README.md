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
tn doctor --project . --url http://127.0.0.1:5173 --json
```

The current `tn doctor` implementation checks project setup, package manager and
CLI dependency state, template metadata, source entrypoint, required bundle
files, and manifest-declared bundle files. With `--url`, it also probes a
running web preview for canvas presence, `window.__THREENATIVE_READY__`,
resource failures, visible mesh count, browser console logs, page errors, and
failed requests. Web previews expose `window.__THREENATIVE_READY__` with canvas
size, runtime diagnostics, active camera ID, visible mesh count, final visible
world bounds, asset counts, resource failures, and camera distance/clip-range
hints. Use `tn screenshot --wait-ready --json` for a PNG proof report with the
invoked command, canvas dimensions, nonblank analysis, runtime diagnostics,
browser logs, page errors, and failed requests; use `tn record` for video proof
or `tn verify` for automated visual checks. Single-frame `tn verify --frames 1`
reports reuse the screenshot capture diagnostics, while multi-frame verification
keeps one continuous browser session for motion checks.
