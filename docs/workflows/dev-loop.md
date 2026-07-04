# Dev Loop

Use `tn dev` as the reliable source-to-preview loop. It builds durable source
before serving a preview and reports the bundle identity so stale previews are
visible.

## Web Preview

```bash
tn dev --target web --watch --json
```

Watch mode performs an initial build, watches durable project inputs, and
reports rebuild state in JSON. On rebuild failure, the report keeps the failed
diagnostics and marks the preview as stale with the last good bundle path.

For one-shot preview:

```bash
tn dev --target web --json
```

One-shot mode rebuilds the current project before starting the server and emits
`TN_DEV_NOT_WATCHING` so agents do not mistake the preview for a live watch
loop after later source edits.

## Bundle Metadata

`tn dev --target web --json` and the web preview state endpoint include:

- `bundlePath`
- `bundleHash`
- `buildTime`
- `sourceBuildStatus`

The preview serves the same data at:

```txt
/__threenative/dev-state.json
```

Use that endpoint when checking whether the browser is serving the bundle you
just built. A source edit after a non-watch launch requires another build or a
watch session.

## Failure Handling

When watch rebuilds fail, fix the structured source or script diagnostic first.
The last good bundle may still be visible in the browser, but JSON reports mark
that state as stale until a passing rebuild replaces it.
