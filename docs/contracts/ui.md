# UI Model

> Status: V6 retained UI is in progress. The current portable contract supports
> a small retained tree, resource/component bindings, actions, and conformance
> observations. Web DOM overlay mounting and Bevy UI entity spawning are
> implemented for the current primitive subset. V7 adds portable focus order,
> navigation links, safe-area metadata, UI input action refs, and a fixed
> web/native focus trace; richer platform widgets and broad device coverage
> remain later work.

Game UI should be authored with React-style TypeScript/TSX, but React DOM should
not be the portable runtime contract. The portable contract is a retained UI tree
and binding metadata emitted as `ui.ir.json`.

The core rule:

```txt
React is the authoring model.
ui.ir.json is the portable contract.
Each runtime recreates the UI with its native renderer.
```

## Chosen Direction

Use a small React-like UI package for game UI:

```txt
@threenative/ui
  -> React-style components and hooks
  -> compiler capture
  -> ui.ir.json
  -> web React DOM renderer
  -> Bevy/custom native UI renderer
```

Do not use React DOM, browser CSS, or a WebView as the native game UI strategy.
They may be useful for web preview and developer tools, but native game UI must
be recreatable from portable data.

## Optional React Webview Overlays

V8 adds an opt-in overlay path for rich React/CSS surfaces such as inventory
panels, settings shells, and editor-like tools. This path is intentionally
separate from retained game UI:

```txt
Retained UI -> ui.ir.json -> portable web DOM / Bevy UI mapping
React overlay -> overlays.ir.json + bundle-local web assets -> optional webview/iframe host
```

Rules:

- Retained `ui.ir.json` remains the default portable game UI contract.
- Use retained UI for gameplay-critical HUDs, controls, dialogue, and menus
  that must render through both the web and Bevy adapters. Use a webview
  overlay only for an explicitly optional rich web surface whose target
  profiles can require a browser host.
- `tn overlay add <name>` scaffolds React, Vite, and Tailwind CSS. Tailwind is
  the default styling preset after this explicit opt-in; it is a project-local
  build dependency, not an SDK, IR, bridge, or runtime dependency. Use
  `tn overlay add <name> --style vanilla` for the same overlay contract with
  plain CSS and no Tailwind packages or directives.
- React/CSS overlays must be declared explicitly with `overlay.mount(...)`.
- Overlay entries and assets must be bundle-local; absolute paths, parent
  traversal, remote URLs, and inline scripts are rejected.
- Overlay code communicates with gameplay only through colon-delimited typed
  bridge messages and `@threenative/overlay-client`. `tn types generate`
  emits the game-to-overlay and overlay-to-game maps from the overlay manifest;
  compiler drift validation keeps script event declarations aligned.
  It cannot directly mutate ECS, Bevy, Three.js, filesystem, network, or native
  handles.
- Overlay input capture is explicit. `none` and `keyboard` do not capture
  pointer clicks, `pointer` captures only pointer input over the overlay,
  `pointer-and-keyboard` captures both, and `modal` intentionally blocks both.
- `client.setInput(mode)` and `client.setVisible(visible)` change host policy
  without synthesizing parent-window events or adding magic payload fields.
  Version 0.2 overlay documents may declare an optional pixel `layout`
  rectangle (`x`, `y`, `width`, `height`) for non-modal frames; 0.1 documents
  remain loadable and use the bounded top-right default.
- Both bridge directions enforce the declared payload schema and a 16 KB UTF-8
  JSON limit. Subscriptions replay retained snapshots once by sequence on web
  and desktop.
- The native desktop adapter keeps browser handles private behind
  `runtime-bevy`; the optional `native-overlay-cef` feature selects the CEF
  off-screen backend, which composites browser pixels into Bevy-owned images
  without a second native window. Default builds that do not enable the
  desktop host fail fast with `TN_OVERLAY_TARGET_UNSUPPORTED` instead of
  silently ignoring overlays.

Source ownership is deliberately split. Authors edit `overlay/<name>/index.html`,
`overlay/<name>/src/**`, and the local Vite configuration. The overlay's
`dist/**`, the game `dist/*.bundle/**`, and packaged-webview output are generated
artifacts and must be rebuilt rather than edited. A production overlay build
emits local HTML, JavaScript, CSS, and assets; Tailwind itself is not shipped as
a runtime library and remote scripts, styles, fonts, and assets remain outside
the bundle-local security contract.

The maintained workflow is scaffold, install, build the generated overlay
script, validate/build the game, preview or playtest, then package the compiled
bundle. See [React webview overlay cookbook](../cookbook/react-webview-overlay.md)
for the complete command sequence and the vanilla opt-out.

## UI Categories

Separate UI into two categories.

### Game UI

Portable and part of the shipped game:

- HUD
- health bars
- ammo counters
- inventory
- pause menu
- settings menu
- dialogue boxes
- touch controls
- simple notifications

Game UI should compile to `ui.ir.json`.

### Dev UI

Development-only tooling:

- inspector
- entity browser
- profiler
- logs
- validation overlay
- hot reload status

Dev UI can be web-only React early. Native dev overlays can come later after the
runtime loop is proven.

## Authoring Example

Users should write UI that feels like React without depending on DOM elements:

```tsx
import { Bar, Button, Stack, Text, bind } from "@threenative/ui";

export function HUD() {
  const health = bind.resource("PlayerStats.health");
  const maxHealth = bind.resource("PlayerStats.maxHealth");
  const ammo = bind.resource("PlayerStats.ammo");

  return (
    <Stack id="hud.root" anchor="top-left" padding={16} gap={8}>
      <Text id="hud.healthLabel" text={bind.template`HP ${health}`} />
      <Bar id="hud.healthBar" value={bind.div(health, maxHealth)} />
      <Text id="hud.ammo" text={bind.template`Ammo ${ammo}`} />
      <Button id="hud.pause" action="pause">
        Pause
      </Button>
    </Stack>
  );
}
```

This should compile to metadata, not DOM:

```json
{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "roots": [
    {
      "id": "hud.root",
      "type": "Stack",
      "props": {
        "anchor": "top-left",
        "padding": 16,
        "gap": 8
      },
      "children": [
        {
          "id": "hud.healthLabel",
          "type": "Text",
          "props": {
            "text": {
              "binding": "template",
              "parts": ["HP ", { "resource": "PlayerStats.health" }]
            }
          }
        },
        {
          "id": "hud.healthBar",
          "type": "Bar",
          "props": {
            "value": {
              "binding": "div",
              "left": { "resource": "PlayerStats.health" },
              "right": { "resource": "PlayerStats.maxHealth" }
            }
          }
        }
      ]
    }
  ]
}
```

## Supported V6 Components

Keep the UI primitive set small:

- `Ui` root, emitted as a `stack` root node
- `Stack`
- `Text`
- `Button`
- `Bar`
- `Row`
- `Column`
- `TouchControl`

Layout should start with simple primitives:

- anchors: `top-left`, `top`, `top-right`, `left`, `center`, `right`,
  `bottom-left`, `bottom`, `bottom-right`
- stack direction: `row` or `column`
- gap, padding, margin
- fixed, fill, and content sizing
- min/max width and height
- basic grid rows/columns for inventory and menu layouts
- z-index within UI

Do not start with full CSS, arbitrary DOM, CSS selectors, arbitrary grid
placement/named areas, dense packing, browser-specific events, generic/system
font family fallback, letter spacing, or OpenType font variations. The IR
validator rejects those requests with stable diagnostics so runtimes do not
silently diverge.

## Theme Tokens

Advanced UI composition starts with a bounded build-time token layer. A UI
document may declare `theme.tokens` with stable IDs and one of these token
kinds: `color`, `spacing`, `radius`, `border`, `shadow`, `gradient`,
`fontFamily`, `textSize`, `icon`, `image`, or `focusRing`.

Nodes and component variants may reference tokens through `tokenRefs` for
promoted retained fields such as layout spacing, style colors, border radius,
font family, font size, image tint, gradient colors, and shadow color. The
compiler resolves those references to concrete retained `layout`, `style`, and
`image` fields before runtime mapping, so web and Bevy still consume plain
retained UI values instead of CSS variables or native theme handles.

Rules:

- Token IDs must be unique and non-empty.
- Aliases must point at existing tokens of the same kind and cannot form cycles.
- Unknown token refs, unsupported token kinds, and field/kind mismatches fail
  validation with `TN_IR_UI_*` diagnostics.
- Token refs are source/build metadata. Generated runtime UI should not depend
  on browser CSS custom properties, system font fallback, native theme handles,
  or adapter-local style lookup.

## Reusable Components

UI source may declare reusable `components` with stable IDs, typed props, an
ordinary retained-node `root` template, and optional slot names. Source nodes
with `kind: "component"` reference one component by ID and provide props/slots.

Compiler expansion happens before runtime mapping:

- Generated node IDs are deterministic: `<instance-id>.<template-node-id>`.
- Prop placeholders in template string fields use `$props.<name>` and are
  replaced from instance props or component prop defaults.
- Generated nodes are ordinary retained UI nodes after expansion.
- `generatedNodeProvenance` records the source component, instance ID, template
  node ID, and source path for each generated node.

Validation rejects missing component refs, missing required props, undeclared
props, undeclared slots, duplicate component IDs, duplicate prop IDs, and
component cycles. Direct mutation of generated runtime nodes is not a durable
source edit; tooling should patch the component definition or instance source
instead.

## Screens And Focus Scopes

UI documents may declare `screens` for HUD, menu, modal, overlay, loading, and
dialog flows. Each screen names a retained node root and can declare a bounded
stack policy: `replace`, `push`, `pop`, `overlay`, or `exclusiveModal`.

Focus scopes define the entry node, restore policy, escape/back action, focus
trap intent, and input capture policy. Capture is explicit: `none`, `pointer`,
`keyboard`, `pointer-and-keyboard`, or `modal`.

Validation rejects missing screen roots, missing screen stack references, focus
scope entries that are not focusable, focus traps without an escape/back
action, modal/dialog screens without input capture, hidden active screens, and
multiple active exclusive modals. Web runtime traces can report deterministic
push/pop focus restoration without requiring full visual transition parity.
The Bevy adapter preserves this metadata and reports deterministic dispatch
traces that block lower active screens when a higher modal captures input.

## Game UI Recipes

Bounded game UI recipes are source-authoring conveniences, not a runtime-only
component system. `uiRecipe`, `ui.apply_recipe`, and `tn ui recipe` emit
ordinary retained UI source nodes plus optional `bindings`, `screens`,
`focusOrder`, `components`, and provenance entries. Supported recipe families
cover HUD status clusters, pause menus, settings lists, inventory grids, item
detail panels, dialog boxes, notification toasts, and loading overlays.
World-attached recipe variants cover nameplates, enemy health bars, interact
prompts, pickup labels, quest markers, and off-screen indicators.

Recipe proof requires desktop and mobile screenshots plus accessibility reports
under `artifacts/advanced-ui/`; missing artifacts fail the advanced UI gate.

## World-Attached UI

Retained UI nodes may declare `attachTo` to project a declared world target into
screen-space UI. Targets can reference declared entity IDs, prefab instance IDs,
or a selected-entity binding. Attachment metadata supports local world offset,
screen anchor, distance scale range, off-screen clamping, occlusion policy, max
distance, and sort priority.

Attached UI remains retained screen-space UI. Validation rejects true 3D UI
surfaces, render-to-texture UI, scene mesh handles, direct camera handles, and
other renderer-private handles. Web and Bevy adapters emit projection traces
with target id, camera id, projected position, depth, clamp/occlusion state,
scale, and visible node ids. The advanced UI gate also requires asserted
web/Bevy visual parity reports for retained effects and attachments.

## Responsive Rules And Virtual Lists

Retained UI nodes may declare bounded responsive rules keyed by target profile
class:

```json
{
  "id": "inventory",
  "kind": "column",
  "responsive": [
    { "target": "desktop", "layout": { "width": 640 } },
    { "target": "mobile", "layout": { "width": 320 } },
    { "target": "tablet", "layout": { "width": 520 } }
  ]
}
```

Rules use canonical target classes (`desktop`, `mobile`, `tablet`) rather than
arbitrary CSS media queries. Duplicate targets and invalid layout payloads fail
validation.

Large retained menus must stay bounded. Nodes with more than 100 generated
children require `virtualRange` metadata:

```json
{
  "id": "inventory",
  "kind": "column",
  "virtualRange": {
    "buffer": 2,
    "itemCount": 200,
    "itemExtent": 104,
    "orientation": "vertical",
    "viewportExtent": 416
  }
}
```

Web and Bevy runtime traces expose deterministic visible item start/end IDs for
the same virtual range input. Recipe helpers may emit only the bounded visible
node set while preserving the authored total item count in `virtualRange`.

Advanced UI proof requires desktop/mobile fit reports under
`artifacts/advanced-ui/fit/`. Fit reports fail when they contain clipping,
overlap, missing focus, or unsafe-area violations.

## Common Affordances

Retained UI supports bounded metadata for routine game prompts and feedback:

- `glyph`: logical input prompt for an action with a target glyph set
  (`keyboard`, `gamepad`, or `touch`) and optional label.
- `tooltip`: anchor node, open policy (`focus`, `hover`, or `manual`), delay,
  dismissal action, focus behavior, and accessible description.
- `localization`: key, fallback text, typed params, and optional plural/select
  cases. Missing fallback text is a validation error.
- `progress`: presentation variant for bars, rings, radial fills, segmented
  meters, textual formatting, and cooldown state.
- `feedback`: logical audio/haptic hooks for focus, activation, or value
  changes. Hooks name logical targets; they do not expose native handles.
- `toastQueues`: bounded queue metadata with priority, duration, max visible
  count, stacking direction, and duplicate coalescing policy.

Web traces report deterministic toast queue coalescing. Native Bevy traces
preserve tooltip and glyph observations so UI affordance metadata remains
visible without relying on adapter-local DOM or native widget handles.

## Bounded Visual Effects

Retained UI nodes can declare bounded `effects` presets for portable emphasis:

- `glow`, `outline`, `pulse`, `tint`, and `focusRing`
- triggers for `focus`, `hover`, `selected`, `disabled`, and declared
  resource/component predicates
- finite pulse timing and fallback strategies such as `shadow`, `outline`, or
  `tint`

Effects are data-only retained UI metadata. UI validation rejects arbitrary CSS
filters, shader/material references, renderer handles, unsupported blend modes,
and unbounded pulse loops. Web and Bevy traces report the active node, state,
effect id, kind, and applied direct or fallback strategy.

## State And Bindings

Game UI should read from declared ECS resources/components through bindings.

Supported binding sources:

- resource fields
- active player entity component fields
- explicitly selected entity IDs
- input/action state
- target profile and safe area
- localization keys later

Examples:

```tsx
bind.resource("PlayerStats.health")
bind.entity("player", "Health.current")
bind.input("jump").pressed
bind.safeArea("top")
```

Rules:

- UI bindings are read-only by default.
- UI actions emit events or commands.
- UI should not reach directly into Bevy, Three.js, DOM, or native platform APIs.
- UI state that must persist belongs in ECS resources or components.
- Local visual state is allowed only when it can be reset safely on hot reload.

## Events And Commands

Interactive UI should emit portable events:

```tsx
<Button id="pause.resume" event="ResumeRequested">Resume</Button>
<Button id="inventory.drop" command={commands.emit("DropItemRequested")} />
```

Runtime output:

```txt
UI interaction
  -> UI event
  -> systems read event
  -> gameplay state changes through ECS commands
```

This prevents UI from directly mutating game internals and keeps web/native
behavior aligned.

## Native Rendering Strategy

The Bevy adapter has three possible implementation paths.

### Path A: Bevy UI Adapter

Map `ui.ir.json` to Bevy UI nodes and text/image components.

Pros:

- Uses Bevy's ECS and app lifecycle.
- Easy to associate UI with game state.
- Good first native path for simple HUDs and menus.

Cons:

- Bevy UI capabilities may lag React/CSS expectations.
- Text, layout, and styling parity need conformance tests.

### Path B: Custom Retained UI Renderer

Render UI quads/text/images directly through a small native UI layer.

Pros:

- More control over layout, batching, and mobile behavior.
- Portable to a future custom wgpu runtime.

Cons:

- More engine work.
- Text rendering and accessibility become larger responsibilities.

### Path C: egui For Dev UI Only

Use egui for inspectors/profilers/dev overlays.

Pros:

- Excellent for tools.
- Fast to build native debug UI.

Cons:

- Not the right public game UI authoring target.
- Visual style is tool-like, not game-facing.

Recommendation:

- Use Bevy UI adapter first for game UI.
- Use web React DOM for web UI preview.
- Use egui or web-only React for dev tooling when useful.
- Consider custom retained UI only if Bevy UI blocks product needs.

## Web Rendering Strategy

The web runtime can render game UI with React DOM overlay:

```txt
Three.js canvas
  + React DOM overlay generated from ui.ir.json
```

This is allowed because web is a runtime adapter. The source of truth remains
`ui.ir.json`, not arbitrary React DOM.

For R3F-based previews:

```txt
R3F scene preview
  + React UI overlay
  + same UI bindings/events
```

The web path can be richer during development, but validators must mark
browser-only UI behavior as non-portable.

## Styling

Use a constrained style object, not full CSS:

```ts
{
  color: "#ffffff",
  background: "#111827cc",
  fontSize: 16,
  fontFamily: "ui.default",
  borderRadius: 4,
  borderColor: "#ffffff33",
  borderWidth: 1,
  opacity: 1
}
```

Rules:

- Numeric layout units are logical pixels.
- Fonts are declared assets.
- Colors use explicit color strings or linear RGBA arrays.
- Style inheritance should be minimal and explicit.
- Runtime-specific style extensions must live under adapter namespaces.

## Touch Controls

Touch controls are game UI and should use the same UI IR.

Example:

```tsx
<VirtualStick
  id="touch.move"
  anchor="bottom-left"
  axisX="moveX"
  axisY="moveY"
/>

<TouchButton
  id="touch.jump"
  anchor="bottom-right"
  action="jump"
/>
```

The input adapter maps these controls to logical actions/axes. Gameplay systems
still read `ctx.input.axis("moveX")` and `ctx.input.action("jump")`.

## Accessibility

Accessibility is not an MVP blocker for the native runtime, but the UI IR should
include fields that make it possible:

- `label`
- `role`
- `disabled`
- `focusable`
- `order`
- text alternatives for images

The web adapter can map these to DOM accessibility attributes. Native mapping can
come later.

## Validation

UI validation should reject:

- DOM elements such as `div`, `span`, `canvas`, or browser event handlers in
  portable game UI
- arbitrary CSS selectors or stylesheets
- functions inside props except declared actions/events/bindings
- bindings to unknown resources, components, actions, or entities
- unsupported layout features for selected targets
- missing font or image assets
- unsafe-area violations for mobile target profiles when strict mode is enabled

Diagnostics should point to the TSX source location and the UI IR path.

## MVP UI Scope

MVP UI should support:

- HUD text
- health/progress bars
- pause menu buttons
- touch controls
- safe area metadata
- web React DOM rendering
- Bevy UI recreation for the same fixtures

MVP UI should not support:

- full CSS
- arbitrary HTML
- browser-only event handlers
- complex animation timelines
- rich text editing
- nested scroll virtualization
- arbitrary third-party React component libraries
- WebView-native UI composition
