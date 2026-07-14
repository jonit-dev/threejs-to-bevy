# Release Packaging

ThreeNative distribution is source-owned by `content/distribution.json` and
compiled into `distribution.ir.json`. Platform shells and SDK projects remain
generated adapter details; do not edit them as durable game source.

## Inspect the release matrix

```bash
tn package plan --project . --matrix release --json
```

The command is read-only. It expands the owning distribution registry and
reports each platform/runtime row as `ready`, `missing-tool`,
`missing-metadata`, `missing-credential`, `wrong-host`, `proof-required`,
or `unsupported`. A `planned` row is reported as `unsupported`;
an `implemented` row remains `proof-required`; only a proved `promoted` row can
be `ready` after its local prerequisites pass.

Use `--matrix declared` to show only rows present in the project's distribution
document. Unknown flags and platform/runtime/format combinations fail closed.

## Build web artifacts

Build the project bundle first, then select one hosting-neutral format:

```bash
tn build --project . --json
tn package build --project . --target web --runtime web --format static --json
tn package build --project . --target web --runtime web --format zip --json
tn package build --project . --target web --runtime web --format pwa --json
```

Each output root contains an immutable `artifact/` directory,
`asset-inventory.json`, and `package-report.json`. ZIP output adds a
deterministic `.zip` of the artifact. PWA output adds a relative-scope web
manifest and cache-first service worker. Upload the contents of `artifact/` to
any ordinary static host; no provider-specific configuration or development
server is part of the package.

The adapter uses relative URLs, records content and file hashes, and rejects
localhost, `file://`, and local absolute paths before release output succeeds.
Serve the directory at both its intended root and base path, then confirm
`window.__THREENATIVE_READY__.ok`, the canvas, input, and bundle-local asset
requests.

## Current boundary

Web static/ZIP/PWA and Linux x86-64 Bevy/embedded-webview packaging are
implemented and awaiting their full promotion gates. Linux arm64 and the other desktop and mobile registry rows remain
planned until their native-host, signing, install, launch, and device evidence
exists. The deprecated flat
`tn package --bundle ... --target desktop` form remains for one compatibility
window and emits `TN_PACKAGE_LEGACY_FLAGS_DEPRECATED`; new builds use registry
platform names.
