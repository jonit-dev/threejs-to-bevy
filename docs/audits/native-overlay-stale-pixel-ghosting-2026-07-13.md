# Native Overlay: Modals "Never Close" — Stale-Pixel Ghosting Investigation (2026-07-13)

Scope: `runtime-bevy/crates/threenative_runtime/src/overlay_host.rs`, chess
example overlay (`examples/chess/overlay/chess-side-select`).
Environment reproduced on: KDE/Xwayland (X11 `:0`), NVIDIA, WebKitGTK via Wry,
release build with `--features native-webview`.
Follow-up to `docs/audits/native-overlay-linux-webview-investigation-2026-07-12.md`.

## Reported symptoms

1. Click "Play White" in the side-select modal: the game reacts (side chosen,
   HUD text updates), but the modal stays on screen.
2. Click "Settings": the settings modal opens. Click "Close"/"Done": nothing
   visibly closes.
3. General feel: "it triggers things, but it doesn't close anything or clean
   up properly"; the UI ends up in a stuck-looking state.
4. After the modal-close mitigation, selecting a chess piece makes the full
   overlay flash and interaction still feels intermittent.

## TL;DR — root cause (confirmed with pixel evidence)

**Nothing is stuck. The React app, the message bridge, and the input regions
all work. What is broken is paint cleanup: on this X11/NVIDIA setup, WebKitGTK
never clears pixels of *removed* DOM content back to transparent on the
overlay's transparent window. Content that is *added* paints fine; content
that is *removed* leaves a permanent ghost.** Both symptoms are the same bug:
closing a modal removes DOM nodes, and their pixels stay on screen forever
(the ghost even keeps its frozen hover highlight).

The visible ghost no longer matches the real clickable regions (which follow
the live DOM), so the surface *feels* stuck: you see a modal that is not
there, and the buttons you can actually click are partly invisible under it.

The later selection flash had a separate host-lifecycle cause: unchanged
input-policy and input-region reports still forced WebKit/GTK redraw, resize,
show, and raise operations. Native piece picking also had an independent
service-contract bug: `picking.pointerRay` did not implicitly expose its
required camera transform. Both are covered in the implemented design below.

## Reproduction (real pointer clicks, not AT-SPI)

```bash
RUST_LOG=info runtime-bevy/target/release/threenative_runtime \
  examples/chess/dist/chess.bundle
# click "Play White" with the mouse, screenshot the window
```

Evidence captured during this investigation (screenshots in the session
scratchpad; log lines from `RUST_LOG=info`):

- Before click: side-select modal renders correctly, transparent over the game.
- After click, in the SAME frame capture both of these are visible:
  - GameHud content ("Opponent captured" / "You captured" cards, "New Game",
    "Settings" buttons) — proving `chess:captures` was delivered and React
    swapped `SideChooser` -> `GameHud` (the two are mutually exclusive in
    `App.tsx`, so the DOM did change).
  - The full "Choose your side" modal, still painted, with "Play White"
    frozen in its hover state — stale pixels.
- Log confirms the whole bridge path worked:
  ```
  native overlay 'chess-side-select' sent 'chess:choose-side'
  delivered native overlay 'chess-side-select' snapshot 'chess:captures' sequence 2
  input regions changed to [.. two 242x122 modal buttons ..]
  input regions changed to [.. two 184x62 HUD buttons ..]
  ```
  The input-region transitions prove the DOM state machine advanced exactly
  as designed (modal buttons -> HUD buttons), and that
  `invalidate_native_overlay_webview` (queue_draw + invalidate_rect) DID run
  — and did not clear the ghost.
- Resizing the Bevy window (1280x720 -> 1000x640) instantly cleared the
  ghost: the HUD rendered correctly with no modal. A real surface
  reallocation forces a full repaint; that full repaint IS correct.

## Experiments matrix

| Experiment | Result |
|---|---|
| Real click on "Play White" | Bridge OK, DOM OK, ghost modal remains |
| `queue_draw` + `invalidate_rect(None, true)` (existing code, fires on every input-region change) | Does NOT clear the ghost |
| `WEBKIT_DISABLE_COMPOSITING_MODE=1` | No change (the non-AC path was removed from modern WebKitGTK; the variable is a no-op) |
| Re-enabling DMABUF (`WEBKIT_DISABLE_DMABUF_RENDERER=0`) | Webview is dead: assets load but the page never renders or posts input regions; log shows "EGL says it can present to the window but not natively". The existing `=1` default must stay on this hardware |
| 1px window resize jiggle (tested engine patch) | Does NOT clear (X bit-gravity preserves content; no layout change = no full damage) |
| Large real window resize (user-visible size change) | CLEARS the ghost completely |

Interpretation: WebKit renders through a GL swapchain and reuses undamaged
buffer regions across frames (buffer-age optimization). On this NVIDIA/X11
stack the "undamaged" regions of older buffers contain stale content, and
partial repaints never write transparent pixels over removed content. Only a
buffer reallocation (resize) or a full-viewport damage repaints every pixel.
This is a known class of WebKitGTK+NVIDIA ghosting bugs; it is not a bug in
the bridge, the overlay client, or the chess overlay.

## Why yesterday's "resolved" claim missed this

The 2026-07-12 investigation's resolution evidence verified the *logic*
layer: AT-SPI `press` actions, bridge sequence logs, and X `ShapeInput`
region transitions. All of those pass — and still pass. None of them look at
pixels. The playtest gate (`chess-overlay-native.playtest.json`) injects
`overlayMessage` directly into the bridge and asserts game state, so it can
never catch a paint bug. This matches the earlier finding that the webview
gate "proves nothing" about what the player actually sees.

## Fix history and current design

### Rejected: CSS damage and unconditional native invalidation

Manual verification falsified the first workaround: changing the root CSS
background damaged the viewport but did not clear the stale backing buffers.
That code has been removed.

The native host also used to call `queue_draw`, `invalidate_rect`, GTK resize,
Wry `set_bounds`, GTK `show`, and GDK `raise` during ordinary synchronization.
The overlay client legitimately reports its input mode again for new game
snapshots, and its DOM observer legitimately republishes input regions after
React mutations. Coupling either report to those visual operations made a
piece selection force repeated native-window repaint/lifecycle work. This was
the direct cause of the later "UI flashes once a piece is selected" symptom.

### Rejected: shrink/hide backing-surface reallocation

The next attempt scheduled a 32 px shrink for one frame on the semantic
`modal -> pointer` transition, hid both GTK and Wry during the temporary
layout, then restored the authoritative bounds. Manual verification falsified
this too: the entire React HUD disappeared after choosing a side. Logs also
showed the responsive button positions oscillate while the hidden temporary
layout was active. Separately, the modal backdrop visibly accumulated opacity
on hover before any transition occurred. That proves parent-window
resize/hide is aimed at the wrong surface: the WebKit child is blending its
own partially transparent frames over stale child pixels.

The shrink/hide state machine and its tests have been removed. The native
overlay now keeps one stable allocation and does not hide Wry during DOM
transitions.

### Rejected: clearing or software-rendering the WebKit child

Making the WebKit widget app-paintable and clearing its Cairo draw surface
with `Operator::Clear` produced an opaque black compositor surface. Forcing
WebKit GL through `LIBGL_ALWAYS_SOFTWARE=1` also produced a black surface even
though the page loaded and reported its DOM input regions. Both experiments
were removed. They confirm that this GTK/WebKit transparent top-level path
cannot be repaired at a parent or child repaint hook on the reproduced
NVIDIA/Xwayland stack.

### Current resolution: do not mount this backend for native chess

Chess now uses the product's portable retained UI for desktop. The side
selection buttons, captured-piece text, and New Game action are authored in
the scene UI and flow through `ui.actions()` and resource bindings. The React
overlay declares only the `web` target, so the Bevy runtime creates no GTK/Wry
overlay host or transparent compositor surface for chess.

The generic Linux overlay host retains the non-destructive corrections found
during the investigation: bounds, position, visibility, input policy, and
input shape synchronization are idempotent; repeated reports are no-ops; and
there is no shrink/hide/reallocation state machine. Transparent React overlays
on NVIDIA/Xwayland remain an explicit unsupported pixel boundary until the
runtime has an offscreen-to-Bevy-texture backend or equivalent compositor-safe
implementation.

Verification state on 2026-07-13:

- native-webview overlay and pointer-ray service tests after removal of the
  destructive paths: 19 passed;
- default-feature overlay tests: 9 passed;
- chess source build with web-only React overlay and retained native controls:
  passed;
- desktop chess scenario: passed with no console/runtime errors; graphical
  assertions were explicitly waived by the existing native-headless boundary;
- `pnpm verify:conformance` and `pnpm check:docs`: passed;
- release runtime rebuilt with `--features native-webview`.

### P1 — add pixel evidence to the native overlay gate

The proof harness must stop trusting shape/log evidence for visual claims.
Add a screenshot-based assertion to the desktop playtest flow: capture the
window after the overlay transition and assert the modal region's pixels
changed (or compare against the pre-click capture). Without this, every
future paint regression will again pass the gate. This belongs in the
playtest/capture path that already produces `before.png`/`after.png`
artifacts for web runs.

### P1 — keep `WEBKIT_DISABLE_DMABUF_RENDERER=1`

Do not remove it: with DMABUF enabled the webview never renders at all on
this hardware (verified dead page, EGL warning). If other machines need
DMABUF, gate the default per-environment rather than removing it.

### P2 — bridge robustness nits found along the way

- `deliver_native_overlay_snapshots` advances `delivered_sequence` to the
  newest delivered sequence even when an intermediate `evaluate_script`
  fails; the failed snapshot is then never retried and is lost. Stop
  advancing past the first failure.
- `relayPointer`/keyboard forwarding to `window.parent` in
  `examples/chess/overlay/chess-side-select/src/App.tsx` is a no-op in the
  native webview (audit B3). Harmless, but should be removed or gated on
  `!("ipc" in window)` when the overlay template is next touched.

## Verification recipe

```bash
cargo build -p threenative_runtime --release --features native-webview   # in runtime-bevy/
RUST_LOG=info runtime-bevy/target/release/threenative_runtime \
  examples/chess/dist/chess.bundle
```

Then with a real mouse:
1. Confirm startup does not log `prepared ... native overlay` or `mounted
   native overlay` for chess.
2. Click the retained "Play White" or "Play Black" button -> the side is
   selected and the board remains visible.
3. Click the retained "New Game" button -> the board resets.
4. Select and move several pieces -> the retained HUD remains stable and
   captured-piece bindings update after a capture.
5. Resize and move the window -> retained UI stays attached to the Bevy
   surface.

## State after this investigation

- `overlay_host.rs` retains idempotent GTK/Wry synchronization; all failed CSS,
  hidden reallocation, WebKit clearing, and forced-software experiments are
  absent.
- Chess targets its React overlay to web only and owns desktop controls in its
  retained scene UI.
- `systems_context.rs` includes the implicit `Camera`/`Transform` reads needed
  by `picking.pointerRay`, guarded by a focused regression test. This fixed the
  independent native chess symptom where pointer clicks reached Bevy but rays
  could not see the active camera.
- The release binary at `runtime-bevy/target/release/threenative_runtime` has
  been rebuilt. Pixel screenshots/logs from manual experiments remain session
  scratch artifacts rather than repository evidence.
