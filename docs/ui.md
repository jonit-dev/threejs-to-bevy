# UI Model

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

## Supported V1 Components

Keep the UI primitive set small:

- `Root`
- `Stack`
- `Panel`
- `Text`
- `Image`
- `Button`
- `Bar`
- `Spacer`
- `Slot`
- `TouchButton`
- `VirtualStick`

Layout should start with simple primitives:

- anchors: `top-left`, `top`, `top-right`, `left`, `center`, `right`,
  `bottom-left`, `bottom`, `bottom-right`
- stack direction: `row` or `column`
- gap, padding, margin
- fixed, fill, and content sizing
- min/max width and height
- z-index within UI

Do not start with full CSS, arbitrary DOM, CSS selectors, grid layout, or
browser-specific events.

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
