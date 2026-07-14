# UI Status

Portable UI uses retained structured source and IR. Web overlays remain a
separate bounded capability, not the default portable game UI model.

Current support:

- Retained UI documents, bindings, formatted resource values, components,
  themes, screen/focus metadata, responsive fit, and accessibility validation.
- Web retained UI overlay button, touch, text input, slider, and scrollbar
  actions drain into portable script-observable UI/input state; script
  `setDisabled`, `setValue`, and `activate` calls update the live rendered
  overlay state.
- Optional React webview overlays use canonical colon-delimited message names
  and `@threenative/overlay-client`. The client owns bridge readiness, replay
  deduplication, typed send/subscribe calls, visibility, and runtime input-mode
  changes. Dotted game event names remain temporarily routable with
  `TN_OVERLAY_NAME_DEPRECATED`.
- Overlay payload schemas use shared web/native conformance vectors and a 16 KB
  UTF-8 JSON limit in both directions. Compiler drift validation rejects
  colon-namespaced system event reads/writes absent from the overlay manifest.
- Linux desktop overlays render React through CEF off-screen rendering and
  composite the resulting premultiplied RGBA pixels into the Bevy window. The
  adapter uses one window and one compositor, so overlay hover and removed DOM
  pixels no longer depend on transparent GTK/WebKit windows or X11 input
  shaping. A bundle-local `threenative-overlay://bundle/` scheme serves assets;
  traversal, remote navigation, remote subresources, popups, downloads, and
  browser/media permission prompts are rejected.
- The CEF bridge exposes send and subscribe, replays retained snapshots, and
  carries overlay-to-game JSON through CEF renderer-to-browser process messages;
  game-to-overlay snapshots and visibility/input controls use adapter-private
  script evaluation. Paint delivery is bounded and latest-frame-wins; resize
  generations prevent stale-size paint callbacks from replacing the current
  texture. Native routing covers pointer move/button/wheel, keyboard key and
  character events, window focus, live pointer islands, and modal suppression
  from the underlying game snapshot. Full IME composition, focus traversal,
  multiple overlays, and cross-scale pixel proof remain unpromoted boundaries;
  the single-overlay host applies authored bounds and z-order.
- Linux NVIDIA/Xwayland compositor evidence covers first paint, chooser hover,
  choosing Black, snapshot delivery, and ten settings modal open/close cycles.
  A release stress run completed 300 modal transitions, then held full
  process-tree RSS within a 136 KiB range during a five-second settle window.
  Other Linux compositor families and Windows/macOS are not yet promoted.
- Linux x86-64 packaging derives the CEF libraries, resources, locale, notices,
  hashes, and feature ID from one backend manifest. `tn package --runtime bevy
  --format appimage` validates and mounts the compressed payload; the real chess
  package is 156,809,720 bytes and passed an offline local-asset launch. Bundles
  without a desktop HTML overlay compile without the CEF feature or payload.
- The native launcher capability-checks cached runtime binaries before reuse;
  binaries missing the descriptor-owned `native-overlay-cef` Cargo feature fall
  back to a feature-complete Cargo launch. Native proof harness startup fails
  with `TN_OVERLAY_TARGET_UNSUPPORTED` when a declared desktop overlay cannot
  mount, rather than recording a false-positive desktop playtest.
- The `@threenative/ui` TSX authoring surface exposes typed wrappers for
  text input and reusable component instances. Button-like and value-changing
  widgets require portable `action` props where TypeScript can enforce them,
  and range/text input widgets expose kind-specific value fields.
- UI component cycles and theme token alias cycles report stable diagnostics
  with the detected cycle path and suggested fixes.
- Portable UI rendering semantics are intentionally bounded:

  | Feature | Contract state |
  | --- | --- |
  | Gradients and shadows | Web DOM overlay renders CSS gradients/shadows. Native preserves metadata/components and exposes visual traces only; native pixel rendering is not promoted. |
  | Effect presets | Metadata/diagnostic boundary with web/native strategy traces; not promoted as rendered effect parity. |
  | Atlas and nine-slice image metadata | Web exposes atlas/nine-slice metadata for overlay/debug proof and applies scale/flip/tile CSS where possible. Native preserves image metadata and traces it; native atlas/nine-slice pixel rendering is not promoted. |
  | Safe area | Web overlay applies `safe-area-inset-*` padding for avoided edges. Native preserves safe-area metadata in navigation traces. |
  | Context menus | Web context menus clamp to the viewport. Native context-menu behavior remains metadata/trace-only. |
  | Focus navigation | Web and native navigation traces skip disabled nodes for sequential and explicit navigation. Geometric spatial fallback remains partial. |
  | DPI/scale | Native UI currently treats authored pixel values as absolute Bevy UI pixels and reports `TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY`. DPI-aware scaling is an unsupported boundary, not promoted parity. |
  | Text input | Web dispatches deterministic value actions. `verify:feature-parity-ui-native` promotes a bounded, adapter-matched value/caret edit trace; OS text services, IME composition, and virtual keyboards remain platform diagnostics. |

- UI parity claims are truth-graded in
  [bevy-feature-parity.md](../../bevy-feature-parity.md): promoted rows name a
  proof gate or artifact, while trace-only native shadows/gradients, effect
  presets, world-attached rendered placement, nested/axis scroll,
  spatial fallback navigation, focus narration, and runtime disabled-state
  updates remain partial/diagnostic until behavior-level proof exists.
- `pnpm verify:focused verify:feature-parity-ui-native` captures the same
  compact retained menu in web and native renderers and compares attachment,
  effect-strategy, and value/caret traces. It also records AccessKit/ARIA
  metadata scope, native image slicing metadata, and screenshot paths. The
  captures prove bounded base UI pixels; they do not promote native
  gradient/shadow rendering, actual screen-reader output, or rendered
  world-attachment placement.
- `pnpm verify:conformance` now emits explicit UI evidence categories:
  structural retained-UI reports, behavioral runtime traces for focus/action
  delivery plus input/UI polish, and a visual/style contact sheet for the
  input-UI polish fixture. The input/UI polish probe covers disabled-state
  reconciliation, nested and axis-specific scroll reports, spatial navigation
  traces, and focus narration as deterministic evidence rather than parity
  promotion.
- Unsupported UI boundaries remain explicit for virtual keyboard behavior,
  arbitrary grid named areas/dense packing, render-to-texture/world transforms,
  UI viewport nodes, drag/drop UI nodes, and custom UI material/shader
  declarations.
- UI source operations are available through CLI, MCP, and authoring-client
  wrappers.
- Editor preview renders retained UI source documents as a read-only viewport
  overlay. It is an authoring feedback surface; durable UI edits remain
  source-backed operations and preview interaction is not promoted as runtime
  play mode.
- Native retained UI caches binding targets after spawn so scripted text sync
  does not re-walk the retained tree per bound text node. Native fallback font
  discovery is bounded to platform default font paths and reports
  `TN_BEVY_UI_FONT_FALLBACK_MISSING` when none can be loaded.

Verification:

- `pnpm --filter @threenative/ir test -- --run ui`
- `pnpm --filter @threenative/authoring test -- --run ui`
- `pnpm --filter @threenative/overlay-client test`
- `pnpm --filter @threenative/runtime-web-three test -- --test-name-pattern overlay`
- `cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime --test overlay_cef --features native-overlay-cef`
- `cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime --test overlay_host`
- `node examples/chess/bin/tn playtest --project examples/chess --scenario playtests/chess-opening.playtest.json --target web --json`
- `node examples/chess/bin/tn playtest --project examples/chess --scenario playtests/chess-overlay-native.playtest.json --target desktop --json`
- `cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime native_ui`
- `pnpm verify:conformance`
- `pnpm verify:focused verify:native-overlay-cef`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
