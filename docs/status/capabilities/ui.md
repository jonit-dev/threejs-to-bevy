# UI Status

Portable UI uses retained structured source and IR. Web overlays remain a
separate bounded capability, not the default portable game UI model.

Current support:

- Retained UI documents, bindings, formatted resource values, components,
  themes, screen/focus metadata, responsive layout and visual-style overrides,
  viewport resize reconciliation, and accessibility validation. Structured
  responsive rules are compiler-lowered into UI IR rather than adapter-local
  metadata.
- Web retained UI overlay button, touch, text input, slider, and scrollbar
  actions drain into portable script-observable UI/input state; script
  `setDisabled`, `setValue`, and `activate` calls update the live rendered
  overlay state.
- Optional React webview overlays use canonical colon-delimited message names
  and `@threenative/overlay-client`. The client owns bridge readiness, replay
  deduplication, typed send/subscribe calls, visibility, and runtime input-mode
  changes. Dotted game event names remain temporarily routable with
  `TN_OVERLAY_NAME_DEPRECATED`.
- Web overlay frames in `none` or `pointer` input mode forward keyboard events
  to the game window, so a focused fullscreen pointer overlay (for example a
  viewport-layout flight deck) no longer swallows game keyboard controls;
  `keyboard`, `pointer-and-keyboard`, and `modal` modes keep the keyboard in
  the overlay.
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
  texture. One CEF session owns one browser and Bevy image per mounted overlay;
  stable authored `zIndex` plus mount order controls composition and topmost
  input routing. Native routing covers pointer move/button/wheel, keyboard key
  and character events, window focus, live pointer islands, modal suppression,
  authored bounds, and explicit physical-to-CSS scale conversion. Full IME
  composition, focus traversal, and cross-compositor scale-factor pixel proof
  remain unpromoted boundaries.
- Linux NVIDIA/Xwayland compositor evidence covers first paint, chooser hover,
  choosing Black, snapshot delivery, ten settings modal open/close cycles, and
  pixel-identical output after resize plus minimize/restore. Native screenshots
  wait for a nonblank paint from every declared CEF surface, preventing a ready
  game scene from hiding a blank or stale overlay.
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
  | Gradients and shadows | Web renders CSS gradients/shadows. Native renders cached linear-gradient textures and cached sliced radial-falloff shadow layers. Native blur shape and arbitrary-angle sampling are bounded adapter approximations; presence, placement, color, and strategy are promoted. |
  | Effect presets | Web and native render outline, focus-ring, glow fallback, tint, and pulse pixels from live hover/focus/selected/disabled/predicate state. The authored fallback selects `none`, `outline`, `shadow`, or `tint`; native shadow glow uses the bounded shadow approximation. |
  | Font weight | Web uses CSS weight. Native selects `boldAsset` for bold text and reports `TN_BEVY_UI_FONT_WEIGHT_FALLBACK` when a declared family has no bold face; synthetic bolding is not used. |
  | Atlas and nine-slice image metadata | Web exposes atlas/nine-slice metadata for overlay/debug proof and applies scale/flip/tile CSS where possible. Native preserves image metadata and traces it; native atlas/nine-slice pixel rendering is not promoted. |
  | Safe area | Web overlay applies `safe-area-inset-*` padding for avoided edges. Native preserves safe-area metadata in navigation traces. |
  | Context menus | Web context menus clamp to the viewport. Native context-menu behavior remains metadata/trace-only. |
  | Focus navigation | Web and native navigation traces skip disabled nodes for sequential and explicit navigation. Geometric spatial fallback remains partial. |
  | Widget/runtime state | Button, slider, text-input, and touch-control actions plus live `setDisabled`/`setValue` effects are paired against web rendered state and native ECS/AccessKit state. |
  | Accessibility | Normalized ARIA/AccessKit role, name, string value, disabled, focusable, focused, and relationship snapshots are paired metadata. Focus narration and actual platform screen-reader output remain partial. |
  | Scroll | Basic vertical scrolling is retained. Native nested and horizontal behavior remains partial under `TN_BEVY_UI_NESTED_SCROLL_PARTIAL` and `TN_BEVY_UI_HORIZONTAL_SCROLL_PARTIAL`. |
  | DPI/scale | Native UI currently treats authored pixel values as absolute Bevy UI pixels and reports `TN_BEVY_UI_ABSOLUTE_PIXEL_SCALE_BOUNDARY`. DPI-aware scaling is an unsupported boundary, not promoted parity. |
  | Text input | Web dispatches deterministic value actions. `verify:feature-parity-ui-native` promotes a bounded, adapter-matched value/caret edit trace; OS text services, IME composition, and virtual keyboards remain platform diagnostics. |

- UI parity claims are truth-graded in
  [bevy-feature-parity.md](../../bevy-feature-parity.md): promoted rows name a
  registry evidence tier and current-run artifact, while world-attached rendered placement, nested/axis scroll,
  spatial fallback navigation, and focus narration remain partial/diagnostic.
- `pnpm verify:focused verify:feature-parity-ui-native` captures the same
  retained UI fixture in web and native renderers at 1280x720 and 390x844. The
  registry-derived gate decodes screenshots, checks observed layout/widget
  regions, retains paired pixel diffs and exact contact sheets, compares live
  actions/state/focus/caret reports, and compares normalized AccessKit/ARIA
  metadata. A run ID and SHA-256 manifest prevent stale or artifact-less row
  promotion. Dedicated `states/{idle,hover,selected}` pairs and isolated
  `features/{shadow,gradient}` with/without captures must produce causal pixel
  changes; `visual-observations.json` binds their changed-pixel bounds and mean
  colors to the authored shadow/gradient values. The native trace also binds a
  bold request to its explicit `boldAsset`. These artifacts prove bounded native
  gradient/shadow/effect rendering and explicit bold-face selection; they do not promote exact CSS blur equivalence,
  actual screen-reader output, or rendered world-attachment placement.
- `pnpm verify:conformance` now emits explicit UI evidence categories:
  structural retained-UI reports, behavioral runtime proof for promoted
  focus/action/state delivery, a three-row web/native idle-hover-selected contact
  sheet, and diagnostic traces for retained partial
  input/UI rows. Input/UI polish diagrams are not treated as rendered proof.
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
