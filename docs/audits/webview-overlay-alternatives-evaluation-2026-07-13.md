# Native Overlay UI: Architecture Assessment and Alternatives Evaluation (2026-07-13)

Scope: the React-webview overlay path on the native (Bevy/Rust) runtime.
Follow-up to `native-overlay-linux-webview-investigation-2026-07-12.md` and
`native-overlay-stale-pixel-ghosting-2026-07-13.md`.

## 1. Diagnosis: is the architecture wrong?

Yes — one specific layer of it. The product architecture (React overlays authored
once, a typed message bridge, schema-validated events/snapshots, declarative
mounts with input modes) is sound and works cleanly on web (~240 LOC of iframe
hosting). What is wrong is the **native attachment strategy**: hosting the
webview as a *separate OS window composited by the window manager* over the
Bevy window.

Every failure we have chased is a direct consequence of that one decision:

| Symptom | Root cause | Layer |
|---|---|---|
| Opaque/black overlay | X11 child windows can never alpha-blend into a parent | OS windowing |
| Overlay floats over other apps, ignores minimize | Override-redirect popup / top-level lifecycle | Window manager |
| Board mouse-dead / "frozen" | Full-window surface eats pointer input; needed X11 ShapeInput regions driven by DOM MutationObservers | Input routing |
| Modals "never close" (ghosting) | WebKitGTK never repaints removed DOM back to transparent on NVIDIA/X11; only surface reallocation clears it | GPU driver × browser compositor |
| Dead webview with DMABUF | WebKitGTK GBM allocation fails on NVIDIA/Xwayland | GPU driver |

The whack-a-mole feeling is the signature: each fix descends one layer
(visual → window management → input → compositor → driver) and the bottom
layer (WebKitGTK×NVIDIA×X11 buffer management) is **not ours to fix**. The
2026-07-13 investigation falsified four successive repaint workarounds with
pixel evidence and ended by *unmounting the webview for chess on desktop
entirely*. The architecture has already lost on our own reference hardware.

Current inventory of the cost (see codebase mapping, section 7 below):
`overlay_host.rs` + `overlay.rs` ≈ **1,690 LOC with ~26 platform-specific
workarounds**, 3 environment-variable hacks, an embedded HTTP server, per-frame
window synchronization, and injected Mutation/ResizeObserver scripts — versus
~240 LOC for the equivalent web path. And after all of it, transparent overlays
on NVIDIA/Xwayland are documented as an unsupported pixel boundary.

**Conclusion: the fix is not another workaround, it is changing where the web
content's pixels go.** Render the UI *inside* the Bevy frame (as a texture the
engine composites) instead of asking the OS to composite two windows. That one
change deletes the entire problem class: transparency, z-order, lifecycle,
input shaping, and driver ghosting all become engine-internal concerns we
control.

## 2. What the overlays actually need

From the chess overlay (the only production consumer today):

- Full arbitrary React + Tailwind: gradients, backdrop blur, drop shadows,
  responsive breakpoints, hover/focus states, ARIA, SVG icons.
- A small message surface: `send`/`subscribe`/`setInput`/`setVisible`,
  schema-validated, ≤16 KB payloads.
- Two input modes in practice: full-screen modal, and HUD with clickable rects.
- No WebGL, no video, no audio, no third-party embeds.

So the engine needs "a real CSS engine + a JS runtime for React", but **not**
"a full browser". That widens the viable option set.

## 3. Alternatives evaluated

Ratings: ★☆☆☆☆ (avoid) → ★★★★★ (adopt). Criteria: (a) composites into the
game frame without OS-window hacks, (b) sane input routing, (c) preserves
React+CSS authoring, (d) maturity/maintenance 2026, (e) fit with our stack
(Rust, wgpu, adapter-private Bevy, dual web/native targets).

### 3.1 ★★☆☆☆ — Current: Wry/WebKitGTK synchronized transparent window (status quo)

What it is: separate RGBA GTK top-level window, per-frame position/size/
visibility sync, X11 ShapeInput regions driven by injected DOM observers.

- (a) No — this is precisely the OS-window hack. (b) Partially, via deprecated
  X11 shape extensions. (c) Yes. (d) Wry is maintained, but its Linux child
  path is built for Tauri-style apps, not game overlays; the WebKitGTK×NVIDIA
  ghosting bug is outside our reach. (e) 1,690 LOC of accumulated defense.
- **Opinion:** it earned two stars only because the bridge/IPC/schema layers on
  top of it are good and portable to any successor. As a pixel strategy it is
  falsified: it does not work on our own reference machine, Wayland-native is
  unsupported, and Windows/macOS child paths carry untested lifecycle gaps
  (audit B4). Every future GPU/driver/WM combination is a new mole. Keep the
  contract, replace the host.

### 3.2 ★★★★★ — CEF offscreen rendering into a Bevy texture (recommended)

What it is: Chromium Embedded Framework in windowless (OSR) mode; the page
renders into a buffer/shared texture we upload as a `bevy::render` texture and
composite as a fullscreen quad inside our own frame. Input is synthesized
(`SendMouseMoveEvent` etc.) from Bevy's winit events.

- Rust story is now strong: the `cef` crate is **maintained by the Tauri team**
  (v150.0.0, July 2026, tracking Chromium 150) with optional **accelerated OSR
  features for wgpu, D3D12, and Metal**. A working Bevy integration exists:
  `bevy_cef` v0.12.0 (July 2026, Bevy 0.16–0.19) with mouse/keyboard/touch
  forwarding and bidirectional JS↔Bevy IPC — notably built by the same author
  as the wry-based `bevy_webview_projects`, who could not make wry work on
  Linux either.
- (a) Yes — the compositor, WM, X11/Wayland, and NVIDIA quirks all drop out;
  pixels live in our swapchain. Transparency is just alpha in a texture.
  (b) Yes — proven model used by every game/CEF integration for 15 years.
  (c) **Yes, fully** — the existing React overlays, Tailwind, and the injected
  bridge script run unchanged on real Chromium; the web and native targets
  finally render from the same engine family. (d) The most battle-tested
  game-UI answer in the industry. (e) The overlay bridge/IPC/schema code ports
  nearly 1:1 (postMessage → CEF process message; `evaluate_script` → CEF
  ExecuteJavaScript; the HTTP asset server can stay or become a custom scheme
  handler).
- Costs/risks: **~150–200 MB shipped binary weight and a multi-process model**
  (helper executable to bundle); Chromium version treadmill (mitigated —
  Tauri does the tracking); Linux *accelerated* OSR needs a spike, but
  CPU-buffer OSR is entirely sufficient for HUD-scale UI at 60 fps; IME in OSR
  mode is fiddly (already an accepted boundary today).
- **Opinion:** this is the answer. It converts five unfixable platform bugs
  into one honest, well-understood cost (binary size). It is also the only
  option where "works on web" and "works on native" stop being different
  rendering engines. Prototype with `bevy_cef` first; if its abstractions
  don't fit our adapter boundary, use the `cef` crate directly — our
  overlay_host already has the right seams (mount plan, bridge, snapshot
  delivery) to slot a second backend behind.

### 3.3 ★★★★☆ — Servo embedding + wgpu-graft (the all-Rust dark horse)

What it is: Servo shipped as an embeddable crate (v0.1.0 April 2026, v0.2.0
May 2026) with a `WebView` API and offscreen rendering; `wgpu-graft` provides
zero-copy external-texture interop with reference demos **including Bevy**.

- (a) Yes, offscreen into a texture, single-process, single binary, all Rust —
  the best architectural fit imaginable for this repo. (b) Input API exists but
  is young; IME/a11y immature. (c) Mostly — React itself runs (SpiderMonkey),
  but web-compat is well below Chromium/WebKit: complex CSS (filters, backdrop
  blur, grid edge cases, animations) can render wrong, and we would be QA-ing
  a browser engine with pixel gates. (d) Pre-1.0, API churn, no shipped-game
  track record — but improving faster than anything else in this space.
- **Opinion:** not a production bet in 2026 for UI that leans on Tailwind's
  fancier features, but the license-clean, dependency-light future path.
  Worth a timeboxed spike behind the same backend seam as CEF; if our actual
  overlay CSS footprint renders correctly, the calculus changes. Re-evaluate
  every couple of Servo releases.

### 3.4 ★★★☆☆ — Headless React + custom reconciler → native retained UI ("the QuickJS idea")

What it is: the user-suggested direction — run React itself in our existing
QuickJS-class sandbox with a custom `react-reconciler` HostConfig; instead of
DOM, the reconciler emits create/append/set-prop mutations over the existing
bridge; the native side maintains a retained tree rendered by bevy_ui
(Taffy already gives flexbox **and** CSS grid). This is literally the React
Native architecture (reconciler → shadow tree → Yoga/Taffy → native views);
prior art: react-native-skia headless, react-three-fiber, react-nil.

- (a) Yes — it *is* native rendering, zero web engine shipped, tiny footprint.
  (b) Yes — native hit-testing, no shape regions, no synthesized DOM events.
  (c) **React yes, CSS no.** You keep components/hooks/state but style via an
  RN-style prop subset. Stylesheets, selectors, media queries, Tailwind,
  backdrop blur, arbitrary filters — all gone unless we rebuild them.
  "Reading CSS in a sandbox" doesn't rescue this: parsing CSS (lightningcss)
  is trivial, but *cascade + selector matching + inheritance* is a CSS engine
  (that's Stylo, see 3.6), and *painting* the results is the other half.
- (d/e) Nothing exists off the shelf for Rust/Bevy hosting; we would build and
  forever own a mini React Native. Text layout, transitions, and polish are a
  long tail. On the plus side, our QuickJS bridge, schema layer, and the
  in-tree native UI renderer (~1,100 LOC, already does panels/buttons/text/
  focus/AccessKit) give us an unusually strong head start, and it aligns with
  the existing "retained scene UI" fallback chess now uses.
- **Opinion:** the most *strategically* interesting option — it is the only
  one that keeps React while making desktop UI truly native and tiny — but it
  is a quarters-long platform project, and its output would still trail CSS
  expressiveness for years. Wrong as the immediate fix; right as the eventual
  destination if we ever need consoles/mobile or must shed browser weight.
  Do not start it to solve this bug.

### 3.5 ★★★☆☆ — Sticking with native UI (bevy_ui / feathers), no React on desktop

What it is: formalize what chess already fell back to — overlays declare
`targetProfiles: ["web"]`; desktop UI is authored in our retained scene UI
(bevy_ui-based, in-tree, ~1,118 LOC, with AccessKit). Bevy's first-party UI is
genuinely improving (0.17 feathers widgets, 0.19 BSN + `EditableText`);
`bevy_hui` offers maintained HTML-ish templating; `bevy_ecss` a CSS subset.

- (a) Yes trivially. (b) Yes. (c) **No** — dual authoring returns: every game
  ships two UIs, and our whole product premise is "author once in TS/React".
  Also our renderer still lacks shadows/gradients/effects (metadata-only;
  PRD `native-ui-visual-enhancements.md` is unimplemented), so desktop UI is
  visibly poorer than web UI.
- **Opinion:** as the *only* strategy it's a product regression, but as the
  **already-proven fallback tier** it's valuable: simple HUDs map well, it
  works today, and it's what keeps desktop shippable while a texture backend
  lands. Keep it; fund the PRD's Phase 1–2 (shadows, effect presets) so the
  fallback isn't ugly. Don't make it carry modal/settings-grade UI forever.

### 3.6 ★★☆☆☆ — Rebuild CSS in an agnostic layer (Stylo + Taffy + Vello on bevy_ui)

What it is: the "rebuild CSS in a portable language" idea. The building blocks
now genuinely exist as crates: **Stylo** (Firefox/Servo's real CSS engine,
standalone on crates.io, with a `stylo_taffy` interop crate), **Taffy**
(already inside bevy_ui), lightningcss, cosmic-text/Parley, Vello.

- (a/b) Yes. (c) CSS increasingly yes, **React no** — you still need something
  to produce the styled tree (pairs with 3.4's reconciler, or with Dioxus).
- **Opinion:** this is not a library you adopt, it's a browser layout+paint
  engine you assemble — exactly what the Blitz team (3.7) has been doing full
  time since 2023 and still calls pre-alpha. Two stars because the pieces are
  real and it composes with 3.4 as a far-future upgrade; zero justification
  for building it ourselves when Blitz exists.

### 3.7 ★★★☆☆ — Blitz / dioxus-native rendered to a wgpu texture

What it is: DioxusLabs' pure-Rust web renderer — real Stylo CSS + Taffy +
Parley + Vello — with a shipped `wgpu_texture` embedding example (and a
wgpu-graft Bevy demo). No JS engine: it renders Dioxus (React-like RSX) or
static HTML, not React.

- (a) Yes, cleanly. (b) DIY event wiring. (c) CSS genuinely yes (it's Stylo);
  React no — overlays would be rewritten in Dioxus (conceptually easy,
  mechanically real work, and splits authoring from the web target).
- (d) Explicitly "not for production" as of mid-2026; the beta timeline has
  slipped.
- **Opinion:** the most promising *Rust-native* endgame — real CSS without a
  browser — but adopting it today means betting product UI on a pre-alpha
  renderer and abandoning React authoring parity. Watch it; revisit when it
  hits beta.

### 3.8 ★★☆☆☆ — Ultralight (OSR web renderer for games)

WebKit-fork + JavaScriptCore, OSR-first, small footprint, made for exactly
this use case — but: **closed source, $3K/yr per application above indie
tier** (free tier now "limited performance and feature-set", PC only), core
repo stagnant for years, best Rust binding (`ul-next`) last meaningfully
updated Dec 2024, no WebGL/video, ~2019-era CSS in places. **Opinion:** the
single-vendor viability risk plus stagnant bindings kill it when CEF is free
and maintained by Tauri. Would have been the answer in 2021.

### 3.9 ★★☆☆☆ — WPE WebKit offscreen (Linux dmabuf)

Technically elegant (WebKit rendering into DMA-BUF, importable into Vulkan;
Igalia even ships an NVIDIA offscreen backend) — but Linux-only (Windows/macOS
still need another answer), **no maintained Rust bindings** (hand-written FFI
against libwpe), and it is the same WebKit lineage whose NVIDIA buffer
management just burned us. **Opinion:** no.

### 3.10 ★★☆☆☆ — egui / bevy_egui

Healthy, trivially composited, great for debug/tools UI — which is what it
should be used for here. Immediate-mode layout and theming ceilings make
polished product HUDs a fight, and it abandons React/CSS entirely.
**Opinion:** adopt for dev tooling overlays (profilers, inspectors), not for
product UI.

### 3.11 ★★☆☆☆ — Commercial/other: Coherent Gameface, Noesis, Slint, Sciter, RmlUi, Azul, gpui

- **Gameface**: real AAA HTML5+React middleware, but per-title custom-quote
  pricing widely described as very expensive, C++ SDK, no Rust story. Only
  relevant if we someday need console certification.
- **Noesis**: XAML, not HTML — loses the entire authoring premise.
- **Slint**: shipped a wgpu renderer in 1.16 explicitly for Bevy-style
  embedding; solid tech, but its own DSL — loses React/CSS.
- **Sciter** (stagnant Rust bindings, closed), **RmlUi** (no Rust bindings,
  CSS dialect, no JS), **Azul** (dormant), **gpui** (Zed halted standalone
  framework work): all fail maturity or fit. **Opinion:** none over CEF.

## 4. Recommendation

1. **Adopt CEF offscreen rendering as the native overlay backend** (3.2).
   Timebox a 1–2 week spike: `bevy_cef` (or raw `cef` crate) rendering the
   existing chess side-select overlay into a Bevy fullscreen quad on the
   NVIDIA/X11 machine, with synthesized pointer input and the bridge ported
   (postMessage→process message, evaluate_script→ExecuteJavaScript). Success
   criteria: transparent modal over the board, modal closes with **pixel
   evidence**, HUD clicks route correctly, window drag/resize/minimize are
   non-events (they now are, by construction). The mount-plan/bridge/schema
   layer stays; `overlay_host.rs`'s window-sync machinery is deleted, not
   ported.
2. **Keep the retained native scene UI as the lightweight tier** (3.5) for
   simple HUDs and as the no-webview fallback; implement the shadows/effects
   phases of `native-ui-visual-enhancements.md` so it looks intentional.
3. **Add the pixel-evidence playtest gate regardless of backend** (carried
   over from the ghosting audit) — every failure in this saga passed the
   logic gates and failed only on pixels.
4. **Do not build** the CSS-rebuild layer (3.6) or the React reconciler (3.4)
   now; log 3.4 as the strategic option if browser weight ever becomes
   unacceptable (mobile/console), and re-evaluate **Servo** (3.3) and
   **Blitz** (3.7) on a ~6-month cadence — either maturing would let us swap
   backends behind the same seam later.

The bridge, schemas, declarations, and overlay-client contract survive intact
under every option above; the only thing being replaced is the part that was
never ours to make work — the OS compositor.

## 5. Star summary

| Option | Stars | One-line verdict |
|---|---|---|
| CEF OSR → Bevy texture | ★★★★★ | Deletes the whole problem class; keeps React/CSS; costs binary size |
| Servo + wgpu-graft | ★★★★☆ | All-Rust future path; web-compat not there yet — spike & watch |
| React reconciler → bevy_ui | ★★★☆☆ | Keeps React, loses CSS; strategic destination, not a fix |
| Native UI only (bevy_ui/feathers) | ★★★☆☆ | Proven fallback tier; as sole strategy, a product regression |
| Blitz / dioxus-native texture | ★★★☆☆ | Real CSS without a browser, but pre-alpha and no React |
| Current wry synchronized window | ★★☆☆☆ | Falsified on reference hardware; unbounded whack-a-mole |
| Rebuild CSS (Stylo/Taffy DIY) | ★★☆☆☆ | You'd be rebuilding Blitz; don't |
| Ultralight | ★★☆☆☆ | Right idea, wrong vendor health + licensing |
| WPE WebKit offscreen | ★★☆☆☆ | Linux-only, FFI from scratch, same WebKit scars |
| egui / bevy_egui | ★★☆☆☆ | Tools/debug UI yes; product HUD no |
| Gameface / Noesis / Slint / Sciter / RmlUi / Azul / gpui | ★★☆☆☆ / ★☆☆☆☆ | Licensing, no Rust story, or loses React — none beat CEF |

## 6. Key sources

- Tauri-maintained CEF bindings: https://github.com/tauri-apps/cef-rs (v150, 2026-07) — accelerated OSR features for wgpu/D3D12/Metal
- Bevy CEF integration: https://github.com/not-elm/bevy_cef (v0.12.0, 2026-07, Bevy 0.16–0.19)
- Servo embeddable releases: https://github.com/servo/servo/releases (v0.1.0 2026-04, v0.2.0 2026-05)
- Zero-copy external textures into wgpu (incl. Servo→Bevy demo): https://github.com/mark-ik/wgpu-graft
- Blitz status: https://github.com/DioxusLabs/blitz · standalone Stylo: https://github.com/servo/stylo · Taffy: https://crates.io/crates/taffy
- Ultralight pricing/limits: https://ultralig.ht/pricing/ · Rust bindings: https://github.com/Amjad50/ul-next
- WPE offscreen NVIDIA backend: https://github.com/Igalia/WPEBackend-offscreen-nvidia
- React custom-renderer prior art: https://www.npmjs.com/package/react-reconciler · https://shopify.github.io/react-native-skia/docs/getting-started/headless/
- In-repo evidence: `docs/audits/native-overlay-linux-webview-investigation-2026-07-12.md`, `docs/audits/native-overlay-stale-pixel-ghosting-2026-07-13.md`

## 7. Appendix: current native host cost inventory (from code mapping)

- `overlay_host.rs` 1,366 LOC + `overlay.rs` 324 LOC vs ~240 LOC for the web
  iframe path.
- ~26 platform-specific workarounds across 8 categories: forced
  `GDK_BACKEND=x11` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` env injection;
  RGBA-visual + cairo clear-paint window setup; per-frame position/size/
  visibility synchronization with cached bounds; X11 ShapeInput region
  management driven by injected `MutationObserver`/`ResizeObserver` scripts
  scanning `[data-threenative-interactive]`; explicit raise/show repaint
  nudges; an embedded loopback HTTP server (WebKitGTK cannot serve overlay
  bundles from `file://`); IPC drain and sequence-deduplicated snapshot
  delivery via `evaluate_script`.
- Of these, only the last two categories (IPC/bridge, snapshot delivery) are
  portable to a texture backend — the rest exist solely to manage an OS
  window and would be deleted under options 3.2/3.3/3.7.
