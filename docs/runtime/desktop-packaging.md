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

## Formats

All desktop runtimes support:

```bash
--format portable   # folder layout only
--format archive    # folder + .tar.gz
--format installer  # folder + .tar.gz + Unix self-extracting installer
```

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
- Real platform installers such as NSIS/WiX `.exe`, `.msi`, `.dmg`, `.app`, AppImage, and code signing/notarization are not implemented yet.
