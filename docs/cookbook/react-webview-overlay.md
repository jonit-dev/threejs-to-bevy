---
id: react-webview-overlay
goal: Scaffold and build an optional React webview overlay with local compiled assets.
category: ui
scriptPath: src/scripts/overlay-actions.ts
surfaces:
  - overlay
  - react
  - webview
---

Use retained `ui.ir.json` for portable gameplay UI. This recipe opts into an
optional browser-hosted surface. The default scaffold uses Tailwind; pass
`--style vanilla` to create the same runtime and bridge contract with plain CSS.

## commands
```bash
tn overlay add inventory-panel --project . --json
```

## source-delta
```json
{"overlay/inventory-panel/src/App.tsx":"Durable React UI source; edit this and adjacent source files.","overlay/inventory-panel/dist/index.html":"Generated local entry; rebuild it and do not edit it.","content/overlays/webview.overlays.json":"Declares the bundle-local entry, target profiles, typed messages, and input capture.","package.json":"Owns install dependencies and build:overlay:inventory-panel."}
```

## script
```ts
export function acceptOverlayAction(action: string): string {
  return action.trim();
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
tn dev --target web --project .
tn playtest --project . --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
tn package --target desktop --runtime webview --format portable --bundle dist/structured-source-starter.bundle --out artifacts/webview-package --json
```

After scaffolding, run `pnpm install` and
`pnpm run build:overlay:inventory-panel` before `tn build`. The cookbook gate
executes those generated install/build steps from the overlay declaration and
package scripts. `tn dev` is the interactive preview step; stop it before the
playtest or package command. The desktop-web package uses the documented local
server plus platform browser/webview handler and is not evidence of an embedded
native shell.

For the supported opt-out, start from a project without this overlay and run:

```bash
tn overlay add inventory-panel --style vanilla --project . --json
pnpm install
pnpm run build:overlay:inventory-panel
```

The vanilla build still emits bundle-local HTML, JavaScript, and CSS, but its
project dependencies and source contain no Tailwind surface.
