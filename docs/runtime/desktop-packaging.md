# Desktop packaging

ThreeNative can package a compiled `.bundle` for desktop delivery with either the native Bevy runtime or the Three.js web runtime wrapped as a desktop-web package.

## Native Bevy runtime

```bash
tn package \
  --target desktop \
  --runtime bevy \
  --format portable \
  --bundle dist/my-game.bundle \
  --out dist/package
```

`--runtime bevy` is the default. It produces:

```text
dist/package/desktop/
  threenative_runtime
  my-game.bundle/
  runtime.args.json
  package.manifest.json
  package.report.json
```

Use this when validating native renderer parity, native APIs, and final native-game distribution.

### CEF overlay payload size

CEF is opt-in at the bundle boundary. A Bevy package with retained/native UI
and no desktop HTML overlay is compiled without `native-overlay-cef`, has no
`libcef` dependency, and does not copy the CEF payload. On the Linux reference
machine that runtime reported `cargoFeatures: []`; its release executable was
87 MB before packaging and 62 MB after `strip --strip-unneeded`.

Native games that declare a desktop React overlay require the CEF off-screen
runtime payload. On Linux, the required files plus one locale occupy
349,022,139 logical bytes; stripping `libcef.so` alone does not bring that
installed tree below 250 MB. The supported size strategy is a directly mounted
AppImage/SquashFS image with zstd compression. The measured executable package
is 156,809,720 bytes and launches CEF from the mounted image without extracting
the payload.

The 250 MB Linux gate therefore measures the physical on-disk executable image,
while reports retain logical payload bytes separately. `--appimage-extract` and
other extraction fallbacks do not satisfy that gate because they materialize
the full logical payload. A custom Chromium/CEF build is not required.

Set `THREENATIVE_CEF_RUNTIME_DIR` to the pinned CEF distribution payload and
request the mounted package explicitly:

```bash
THREENATIVE_CEF_RUNTIME_DIR=/opt/cef-150-runtime \
  tn package --target desktop --runtime bevy --format appimage \
  --bundle dist/my-game.bundle --out dist/package
```

The descriptor-owned `runtime-bevy/cef-runtime-manifest.json` validates every
library, resource, locale, and license hash, strips the reviewed stock
`libcef.so` and packaged runtime executable when needed, writes both logical and mounted sizes to
`package.report.json`, and fails on a missing or unpinned file. The real chess
package measured 156,809,720 bytes and launched directly from its mounted
filesystem with first paint, Black-side selection, snapshot delivery, ten
modal transitions, and clean CEF shutdown.

### CEF updates and rollback

`runtime-bevy/cef-runtime-manifest.json` is the owning record for the pinned
CEF/Chromium distribution, platform payload, checksums, and license files. The
native-runtime maintainers review upstream CEF security notices monthly and
triage critical notices within seven days. An upgrade must change the manifest
and reviewed Cargo pin together, refresh every affected checksum and notice,
then pass the CEF runtime tests, focused pixel gate, offline mounted-package
launch, size/startup budgets, and docs checks. Build and packaging never fetch a
floating CEF release.

If any upgrade gate fails, restore the preceding reviewed manifest/Cargo pin
and publish the preceding hash-identified AppImage. Do not mix payload files
between versions or waive the bundle-local resource policy. Retained UI remains
the lightweight native tier, while `--runtime webview` remains the separate
Three.js desktop-web fallback.

## Three.js desktop-web runtime

```bash
tn package \
  --target desktop \
  --runtime webview \
  --format portable \
  --bundle dist/my-game.bundle \
  --out dist/package
```

This builds the Three.js web runtime into a static app and packages it with a lightweight local launcher:

```text
dist/package/desktop-web/
  threenative_webview_runtime
  app/
    index.html
    assets/
    bundle/
  runtime.args.json
  package.manifest.json
  package.report.json
  webview.inspection.json
```

The launcher starts a localhost static server for `app/` and opens the generated URL with the platform browser/webview handler. It is meant as a practical desktop-web fallback while the native Bevy backend matures.

`webview.inspection.json` records the generated launcher, copied bundle, archive
or installer state, and the manual host checks that cannot be automated by
packaging alone.

Use this when you need:

- exact Three.js rendering behavior on desktop;
- fast prototype/demo distribution;
- a fallback when native Bevy parity has a known gap;
- desktop packaging proof without changing game code.

Do not treat this as a full Tauri/Wry app yet. Current `webview` packaging is a lightweight local-server launcher, not a signed embedded WebView binary. Future work can replace the launcher with a true Wry/Tauri shell while keeping the same `--runtime webview` CLI surface.

The focused measurement gate is `pnpm verify:webview-package`. It packages the
`ui-persistence-settings-facades` conformance bundle and writes raw evidence to
`tools/verify/artifacts/webview-package/verification-report.json`, including
package size, app size, archive size, startup inspection checks, retained UI
input metadata, settings metadata, save-slot metadata, and measured launcher
startup time.

## Formats

All desktop runtimes support:

```bash
--format portable   # folder layout only
--format archive    # folder + .tar.gz
--format installer  # folder + .tar.gz + Unix self-extracting installer
```

Linux x86-64 native CEF bundles additionally support `--format appimage`.

Examples:

```bash
# Native Bevy installer
tn package --target desktop --runtime bevy --format installer --bundle dist/my-game.bundle --out dist/native-package

# Three.js desktop-web installer
tn package --target desktop --runtime webview --format installer --bundle dist/my-game.bundle --out dist/webview-package
```

The Unix installer extracts into the provided directory and writes `run.sh`:

```bash
sh dist/webview-package/my-game-linux-x64-installer.sh /tmp/my-game
/tmp/my-game/run.sh
```

## Verification checklist

After packaging a webview build, verify:

```bash
sh dist/webview-package/my-game-linux-x64-installer.sh /tmp/my-game
THREENATIVE_WEBVIEW_PORT=5179 /tmp/my-game/run.sh
```

Then open `http://127.0.0.1:5179/index.html` and check:

```js
window.__THREENATIVE_READY__
```

Expected:

- `ok === true`
- `diagnostics` is empty
- a `<canvas>` exists
- bundle assets load from `/bundle/...` with HTTP 200

The same checks are listed in `desktop-web/webview.inspection.json` so package
artifacts retain the host-inspection expectations.

## Current limitations

- Current-platform only; no cross-compilation.
- `webview` uses a local static server and platform browser opener, not a bundled embedded WebView yet.
- Real platform installers such as NSIS/WiX `.exe`, `.msi`, `.dmg`, `.app`, and code signing/notarization are not implemented yet. Linux x86-64 CEF AppImage assembly is implemented and evidence-gated.
