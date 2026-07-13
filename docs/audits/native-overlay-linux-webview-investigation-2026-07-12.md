# Native Overlay on Linux: Transparency + Post-Click Freeze Investigation (2026-07-12)

Scope: `runtime-bevy/crates/threenative_runtime/src/overlay_host.rs`,
`src/overlay.rs`, `packages/overlay-client`, chess example overlay.
Environment under test: KDE/Xwayland (X11 `:0`), NVIDIA RTX 2080, Wry 0.53.5,
WebKitGTK, `--features native-webview`.

## TL;DR

1. **The opaque/dark overlay under `build_as_child` is architecturally
   unfixable on X11.** Core X11 does not alpha-blend a child window into its
   parent; compositors (KWin) only composite *top-level* windows. Wry's X11
   child path creates the container with `XCreateSimpleWindow(display, parent,
   ..., 0, 0, 0)` (default/parent visual, background pixel 0 — see
   `wry-0.53.5/src/webkitgtk/mod.rs`, `create_container_x11_window`), so
   `with_transparent(true)` + `set_background_color((0,0,0,0))` can never show
   Bevy's Vulkan swapchain through it. The handoff's suspicion is confirmed.
2. **The working tree has already pivoted** (edits landed 2026-07-12 22:07,
   apparently from the other session): Linux now uses
   `NativeWebviewAttachment::SynchronizedOverlayWindow` — a decorated-less
   GTK `Popup` window with an RGBA visual, `keep_above`, `accept_focus(false)`,
   re-synced to the Bevy window every `Update` via
   `synchronize_native_overlay_webviews`. This is the right family of fix for
   X11 (top-level windows *are* alpha-composited by KWin), but it has
   lifecycle and input gaps listed below. `cargo check -p threenative_runtime
   --tests --features native-webview` passes on the current tree.
3. **The "frozen after Play White" symptom is not (only) a snapshot bug.** The
   Rust-side `chess:captures` delivery path is sound (traced below). The freeze
   is explained by a stack of independent defects: the opaque surface (item 1),
   a hardcoded inventory-sized CSS clamp injected into every overlay (B1), and
   an input-relay pattern that is a no-op in native webviews (B3), leaving a
   full-window modal surface permanently eating all pointer input.

## Symptom 1 — opaque child webview

Evidence from wry 0.53.5 (`src/webkitgtk/mod.rs`):

- `build_as_child` → `new_x11(..., is_child=true)` →
  `create_container_x11_window` → `XCreateSimpleWindow(display, parent, x, y,
  w, h, 0, /*border*/0, /*background*/0)`. `XCreateSimpleWindow` always
  inherits the parent's depth/visual — the Bevy window's visual is 24-bit
  opaque, so the child cannot even carry an alpha channel.
- Even with a 32-bit visual, X11 child windows occlude their parent within
  their geometry; blending is a compositor feature and compositors manage
  top-levels only.
- WebKitGTK's transparent background (`webview.set_background_color(RGBA 0)`)
  works *within* the webview's own surface; it cannot make the X11 container
  translucent to what is behind it.

Conclusion: on X11, per-pixel transparency over the game requires either a
**top-level composited window kept in sync** (current in-flight approach) or
**offscreen rendering into a Bevy texture** (long-term option, below).
`WEBKIT_DISABLE_DMABUF_RENDERER=1` (already set in `initialize_gtk_backend`)
remains correct for NVIDIA/Xwayland black-surface avoidance, but it was never
the transparency culprit.

## Symptom 2 — "frozen/dark after Play White"

### The snapshot path is correct in code

Traced end-to-end:

1. Click → overlay `client.send("chess:choose-side")` → `window.ipc.postMessage`
   → `drain_native_overlay_ipc` → `bridge.receive_overlay_message` validates
   against `chess.overlays.json` and pushes to `bridge.events` (log line
   observed: `native overlay 'chess-side-select' sent 'chess:choose-side'`).
2. `pump_native_overlay_webview_events` runs `.before(run_scripted_runtime_systems)`
   (`lib.rs:310-311`), so the same frame's script run sees the event via
   `drain_events_into`.
3. `chess.ts` `chooseSide()` → `publishCaptures()` emits `chess:captures`
   `{black, playerSide, white}` — matches the declared schema (all strings,
   all required).
4. `publish_world_events` → `bridge.snapshots` → next frame
   `deliver_native_overlay_snapshots` → `evaluate_script(
   __threenativeDispatchOverlaySnapshot(...))` → App's subscription sets
   `side` and swaps `SideChooser` → `GameHud`.

So the React state machine most likely *did* advance. What the user saw as
"frozen/dark" is `GameHud` rendered on an opaque black child surface (Symptom
1) with its layout wrecked by B1, and the game unreachable by mouse because of
B3. Note there is a diagnostic gap: delivery only logs on *failure*
(`TN_OVERLAY_NATIVE_DELIVERY_FAILED`); add an `info!` per delivered snapshot
so this can be confirmed from logs instead of inferred.

### Independent defects found (fix regardless of attachment strategy)

- **B1 — hardcoded inventory CSS injected into every overlay.**
  `native_overlay_initialization_script` (overlay_host.rs) appends, on
  DOMContentLoaded, `html, body, #root { height:207px !important;
  width:242px !important; overflow:hidden !important }` and an `.inventory`
  rule. For `chess-side-select` (a full-window modal) this clamps `body` to
  242×207 and clips the HUD. The init script must not encode any particular
  overlay's layout; derive per-mount CSS from `mount.layout` (or inject
  nothing and let the overlay own its layout).

- **B2 — retained snapshots are never replayed to late subscribers.** The
  injected bridge stores snapshots in `_snapshots`, but neither the injected
  `subscribe()` nor `overlay-client`'s `connect()` replays them.
  `packages/overlay-client/src/index.test.ts` ("should deliver retained
  snapshot exactly once when bridge becomes ready after subscribe") encodes
  the replay contract — but only the *mock* bridge honors it; the real
  injected script does not. Any snapshot delivered before React mounts (or
  across a webview reload) is silently lost. Fix in the injected script:
  `subscribe(listener)` should immediately invoke `listener` for each entry in
  `_snapshots` (the client's `deliveredSequences` set already dedupes).

- **B3 — `window.parent.dispatchEvent` relay is a no-op natively.**
  `App.tsx`'s `relayPointer`/keyboard forwarding targets `window.parent`,
  which in an iframe is the host page, but in a native webview is the webview
  itself — and synthetic DOM events never reach winit/Bevy anyway. Since the
  overlay mounts as a full-window `modal` surface and re-asserts
  `setInput("modal")` on every captures snapshot, **all pointer input is
  permanently captured by the webview and the board is mouse-dead**. This
  alone produces "UI appears frozen" even with perfect transparency.

- **B4 — `overlay:set-input` never re-applies bounds.** The IPC handler
  updates `host.mounts[index].input`, but bounds are only recomputed in
  `resize_native_overlay_webviews` under `Changed<Window>`. Switching
  modal→pointer would not shrink the surface until the OS window changes.
  (The new Linux `synchronize_native_overlay_webviews` runs every frame and
  does recompute `native_overlay_bounds`, so this now self-heals on Linux —
  keep it in mind for the Windows/macOS child path.)

- **B5 — snapshots can be marked delivered before the page can receive
  them.** `deliver_native_overlay_snapshots` advances `delivered_sequence`
  when `evaluate_script` *succeeds*, but the script body is
  `window.__threenativeDispatchOverlaySnapshot?.(...)` — optional chaining
  makes it a silent no-op if evaluated before the init script ran (fresh
  navigation) — combined with B2, the snapshot is then lost forever. Options:
  re-deliver the latest snapshot per (overlay, type) on wry's
  `with_on_page_load_handler`, or have the page pull via a `overlay:ready`
  IPC message.

- **B6 — stale handoff claims.** The handoff said "all 8 overlay tests pass";
  meanwhile the tree moved to `SynchronizedOverlayWindow` (tests import
  `native_overlay_screen_position`, which only exists in the new code). The
  current tree compiles; re-run the overlay test suites before trusting any
  cached result.

## Assessment of the in-flight `SynchronizedOverlayWindow` approach

Right direction; remaining gaps to close before calling it done:

1. **`gtk::WindowType::Popup` is override-redirect.** The window manager does
   not manage it: it floats above *all* applications and virtual desktops,
   ignores `keep_above` semantics, and will not hide when the Bevy window is
   minimized, loses focus, or is covered by another app. Prefer
   `WindowType::Toplevel` + `set_type_hint(Utility)` +
   `set_skip_taskbar_hint(true)` + `set_skip_pager_hint(true)` +
   `set_keep_above(true)`, and set `transient-for` to the Bevy window's XID
   via `gdk_x11_window_foreign_new_for_display`. Alternatively keep `Popup`
   but explicitly mirror parent lifecycle: hide on Bevy `WindowFocused(false)`
   / `WindowOccluded` / minimize events, show on restore.
2. **Compositor requirement.** RGBA-visual top-levels only blend when the
   screen is composited. `gdk_screen_is_composited()` false → fall back to
   opaque + emit a `TN_OVERLAY_*` diagnostic. (KWin/Xwayland here is always
   composited, so this is for robustness, not this machine.)
3. **Input passthrough is still unsolved (B3).** `accept_focus(false)` keeps
   the keyboard on the Bevy window (good — the W/B shortcuts and the game's
   native UI keep working), but the popup still swallows pointer events over
   its whole rect. Options, in increasing effort:
   - Keep `modal` overlays full-window (side chooser is genuinely modal), and
     when the overlay drops to HUD mode, resize the overlay window to the
     declared `layout` rects instead of full-window. Requires the chess
     overlay to call `setInput("pointer")` after side selection and declare
     HUD layout regions; also requires splitting HUD corners into one window
     per region or accepting one bounding rect.
   - X11 input shaping: `gtk_widget_input_shape_combine_region` on the overlay
     window, driven by the overlay reporting its interactive rects over IPC
     (e.g. `overlay:set-input-regions`). This preserves one full-window
     surface with click-through everywhere except buttons — the most faithful
     match to the web behavior.
   - Remove the `window.parent` relay from overlay templates either way; it
     only works in iframes. The client can detect native (`"ipc" in window`)
     and pick the native input policy.
4. **Per-frame sync is fine but lossy during drags.** `Update`-schedule
   syncing lags a frame behind window moves; acceptable. Consider also syncing
   on Bevy `WindowMoved` events and hiding during `WindowMoved` bursts if the
   lag looks bad on KDE.

## Long-term option: offscreen web rendering into a Bevy texture

Only worth it if the synchronized-window approach proves too leaky (Wayland
native, exotic WMs, alt-tab artifacts). Wry has no offscreen mode; this means
a second backend (CEF in OSR mode, or WPE WebKit) rendering into a
`bevy::render` texture, plus full input synthesis (pointer/keyboard → DOM).
That solves compositing *and* input routing on every platform, at the cost of
a large dependency and an input-latency/IME tax. Recommendation: land the
synchronized-window fixes first; keep this as the parity escape hatch and
note it in `docs/status/capabilities/` rather than starting it now.

## Suggested fix order

| # | Fix | Where |
|---|-----|-------|
| P0 | Remove hardcoded 242×207/`.inventory` CSS; derive from `mount.layout` | `native_overlay_initialization_script` |
| P0 | Replay retained `_snapshots` on `subscribe` (real bridge = test contract) | injected init script |
| P0 | `info!` log on successful snapshot delivery | `deliver_native_overlay_snapshots` |
| P1 | Popup → managed top-level (transient-for, skip taskbar/pager) or explicit show/hide on parent focus/minimize | `build_native_overlay_webview` (Linux) |
| P1 | Composited-screen check with opaque fallback + diagnostic | Linux mount path |
| P2 | Native input model: modal full-window, HUD = layout-rect window or XShape input regions; drop `window.parent` relay from overlay templates | overlay_host + `@threenative/overlay-client` + chess overlay |
| P2 | Re-deliver latest snapshot per type on page load (B5) | wry `with_on_page_load_handler` |
| P3 | Offscreen rendering backend (CEF OSR / WPE) — only if P1/P2 insufficient | new adapter-private backend |

## Verification checklist

- `cargo test -p threenative_runtime --features native-webview` (overlay,
  overlay_host suites) — current tree compiles; rerun tests, don't trust the
  pre-refactor "8 pass" claim.
- Run chess with the desktop runtime; confirm via new delivery log that
  `chess:captures` reaches the webview after "Play White".
- `xwininfo -tree` / `xprop` on the overlay window: expect a managed (or
  correctly synced) top-level with a 32-bit visual.
- Manual lifecycle pass: drag, resize, minimize/restore, alt-tab, second
  monitor — overlay must follow and never float over other apps.
- Rerun committed playtest scenarios with `--target desktop`
  (`examples/chess/playtests/chess-overlay-native.playtest.json`) before any
  release claim.

## Resolution evidence (2026-07-13)

The Linux chess repro was exercised on KDE/Xwayland with the release Wry host.
This closes the local B2/B3/B4 behavior gaps above without promoting the
remaining cross-OS lifecycle boundary:

- WebKit's AT-SPI `press` action on `Play White` produced
  `chess:choose-side`, a Bevy `chess:captures` snapshot, and the React
  modal-to-pointer transition. Pressing `New Game` produced `chess:restart`
  and snapshot sequence 4, proving both React-to-game actions and the return
  state path through the live webview rather than direct harness injection.
- Opening `Settings` changed the X server's `ShapeInput` region to one
  `1280x720` modal rectangle. Pressing `Done` restored exactly two HUD button
  rectangles (`1072,552 184x62` and `1072,630 184x62`), while the Bevy window
  retained keyboard focus. The pure clipping/empty/modal contract is guarded
  by `limits_pointer_capture_to_reported_interactive_regions`.
- Resizing the Bevy window through `1280x720`, `1000x640`, and `500x420`
  produced identical GTK overlay window extents at each size. WebKit reported
  responsive input rectangles after each resize, including the single-column
  compact layout at `500x420`.
- `chess-overlay-native.playtest.json` now selects a side through the overlay
  contract and then moves the e2 pawn through ordinary game input. It passes
  on both `web` and `desktop`, with overlay state `white`, movement above
  `0.8`, and no console, network, or runtime diagnostics.
- A separate web regression was found during this proof: paused render frames
  consumed pending input before gameplay resumed. `runGameFrame` now advances
  input only on active gameplay frames, guarded by
  `gameLoop should preserve input pressed while paused until gameplay resumes`.

Still intentionally unpromoted: native Wayland hosting, Windows/macOS live
compositor history, minimize/restore and multi-monitor lifecycle, IME, and OS
screen-reader behavior.
