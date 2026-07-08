# UI System Inspection — Authoring, Web Runtime, Native Bevy Runtime, Editor

Date: 2026-07-08
Scope: `packages/ui`, `packages/ir` (UI schemas/validation), `packages/compiler` (UI emit),
`packages/runtime-web-three/src/ui`, `runtime-bevy/crates/threenative_runtime` (ui*, overlay*,
input_ui_polish*), `packages/editor`, and the parity claims in `docs/bevy-feature-parity.md`.

This is an inspection report only; no code was changed.

---

## 1. Executive summary

The UI system has a clean three-stage architecture — JSX authoring → portable `ui.ir.json` IR →
per-runtime interpreters (DOM overlay on web, Bevy ECS entities natively) — with strong IR-level
validation and a real accessibility story. The main problems are:

1. **A confirmed cross-runtime behavior bug**: on web, UI action events (button clicks, slider
   changes) are queued but **never delivered to scripts**; on native Bevy they are. The same bundle
   behaves differently on the two runtimes. (Section 3.)
2. **Real Bevy parity gaps**, several of which `docs/bevy-feature-parity.md` records only as
   "diagnostic boundaries" while adjacent P1 claims (spatial navigation, disabled-state mutation,
   focus narration, nested scrolling) are traced-but-not-proven. (Section 6.)
3. **Type divergence between authoring and IR**: the JSX layer exposes 12 node kinds, the IR
   supports 14 (`textInput` and `component` are not authorable from TSX). (Section 4.)
4. **Conformance verifies structure, not behavior**: the conformance reports compare UI node trees,
   not rendering output, event flow, or interaction semantics — so the parity story is weaker than
   the docs read. (Section 6.4.)

---

## 2. Architecture overview

```
TSX (@threenative/ui, custom jsx-runtime — no React at runtime)
   │  captureUi()                         packages/ui/src/capture.ts
   ▼
IUiIr  "threenative.ui" v0.1.0           packages/ir/src/uiTypes.ts
   │  validation + component expansion    packages/ir/src/uiValidation.ts,
   │  + theme token resolution            packages/compiler/src/emit/ui.ts
   ▼
ui.ir.json in bundle
   ├─ Web: renderUi() → DOM overlay      packages/runtime-web-three/src/ui/renderUi.ts:41,
   │       over the Three.js canvas       ui/domOverlay.ts:12
   └─ Native: map_ui_into_world() →      runtime-bevy/.../src/ui.rs:486
           Bevy UI entities (spawned once, static tree)
```

Key properties:

- `@threenative/ui` is a pure authoring layer: JSX → data. No state, no hooks, no reactivity.
  Dynamic values come exclusively from **bindings** (resource/component field reads with format
  strings like `HP {health:fixed0}/{maxHealth}`), which each runtime resolves per frame.
- The **editor** (`packages/editor`) is a separate, conventional React 19 + Zustand app (70 TSX/TS
  files, single global stylesheet, `.tn-editor-*` BEM-ish classes). It embeds a Three.js viewport
  (`preview/EditorViewport3d.tsx`) but does **not** embed the runtime UI overlay — authored game UI
  is not previewable in the editor (`preview/PreviewHost.tsx` is a stub).
- On native, both HTML-webview overlays (`overlay_host.rs`) and the Bevy-native UI tree exist;
  desktop webview mounting reports `TN_OVERLAY_TARGET_UNSUPPORTED` (overlay.rs:205-216) — web-only
  for now, and the docs correctly bound it that way.

---

## 3. Confirmed bug: web UI actions never reach scripts

**Verified directly (not just agent-reported).**

- Web: DOM click/input handlers call `rendered.trigger(nodeId, value)`
  (`ui/domOverlay.ts:81,88,95`), which pushes an `IUiActionEvent` into the `actions` array
  (`ui/renderUi.ts:42-54`). **Nothing consumes that array**: `render.ts` only calls
  `uiOverlay?.update()` (render.ts:261,306) and never reads `.actions`; no other non-test code
  references it.
- The script-facing `context.ui` API (`systems/contextUi.ts`) is a **detached in-memory model** —
  `ui.activate()/setValue()/setDisabled()` mutate private Maps that the DOM overlay never reads,
  and DOM interactions never write into.
- Native Bevy, by contrast, drains `NativeUiActionQueue` into scripted runtime input every frame
  (`lib.rs:541-553`, populated by `dispatch_native_ui_actions`, ui/interactions.rs:30-51).

**Consequence:** a bundle whose gameplay depends on UI buttons works natively and silently does
nothing on web (and script-driven UI state changes don't render on web either). This inverts the
usual expectation that web is the reference runtime.

**Fix direction:** give the web game loop a drain step symmetrical to the native one — after
`uiOverlay.update()`, move queued `IUiActionEvent`s into the same input-action channel scripts read;
and back `contextUi.ts` with the live overlay (or make the overlay read the shared state) instead of
a parallel model. Then add a cross-runtime conformance scenario: "click button → script observes
action" on both targets.

---

## 4. Authoring layer (`packages/ui` + IR + compiler)

### Findings

- **JSX/IR divergence**: jsx-runtime supports 12 element types; the IR has 14 node kinds
  (`packages/ui/src/jsx-runtime.ts` vs `packages/ir/src/uiTypes.ts:116`). `TextInput` and
  `Component` (component instances) cannot be authored in TSX — only via SDK helpers or raw IR.
  Undocumented; users will hit it.
- **Loose prop typing**: `IUiNodeProps` is one permissive bag — `<Button>` compiles without the
  required `action`; errors surface later as IR diagnostics. Kind-specific prop interfaces
  (`ButtonProps extends ... { action: string }`) would move errors to the editor/compiler.
- **No tests in `packages/ui` itself.** Validation is well-tested in `packages/ir/src/ui.test.ts`
  and bundle emit in `packages/compiler/src/emit/bundle.test.ts`, but there is no end-to-end
  TSX → capture → IR → bundle test.
- **Component expansion provenance is lossy** (`packages/compiler/src/emit/ui.ts:86-129`):
  expansion failures point at generated node IDs, not source slots. Cycle detection reports "cycle
  includes 'X'" without the cycle path (`uiValidation.ts:443-445`).
- **Theme token aliases** resolve with a `seen` list at emit time but there is no cycle check at
  definition time; broken alias chains fall back silently to `undefined`
  (`packages/compiler/src/emit/ui.ts:172-181`).
- Explicitly rejected (documented, reasonable boundaries): world-space UI, arbitrary transforms,
  render-to-texture UI, virtual keyboard widgets (`uiValidation.ts:101-224`).

### Suggested improvements (authoring)

| Priority | Improvement |
|---|---|
| P1 | Export `TextInput` (and a `Component` instance wrapper) from `@threenative/ui`, or document why not |
| P1 | Kind-specific prop types so `action`-requiring widgets fail at typecheck |
| P2 | One end-to-end test: author TSX → captureUi → validate → emit bundle |
| P2 | Include the full cycle path in component-cycle diagnostics; map expansion errors back to source slots |
| P2 | Validate theme-token alias cycles at definition time; error instead of silent `undefined` |
| P3 | `examples/` directory with complete UI compositions; document virtual-list `buffer`/`itemExtent` semantics |

---

## 5. Runtimes

### 5.1 Native Bevy (`threenative_runtime`)

- **Static tree**: entities are spawned once in `map_ui_into_world()` (ui.rs:486-495) and never
  restructured. Good for predictability; a hard wall for dynamic UIs (no add/remove of nodes at
  runtime). Text content and minimap markers are the only per-frame syncs.
- **Per-frame binding resolution is uncached**: `sync_scripted_ui_text()` re-walks the entity tree
  each frame per bound node (ui.rs:702-709); `find_node()` is O(n); font matching is a linear scan.
  Fine at HUD scale, worth a resolved-binding cache before UI-heavy games.
- **Gradients/shadows are metadata, not pixels**: `NativeUiRenderedGradient`/`...Shadow` components
  are spawned and traced (ui/traces.rs:283-315) but nothing renders them. The parity doc counts
  them as native-rendered (bevy-feature-parity.md:989-990) — see Section 6.
- **`textInput` is metadata-only** — no actual text editing/caret/IME (ui/widgets.rs:109-118),
  while the parity doc claims "editable text input widgets with deterministic value/action events"
  at P1 (line 1006).
- **No DPI/scale handling**; px values are absolute. No animation runtime (effect presets are
  traced only).
- **The `*_trace.rs` pattern** (5 files + ui/traces.rs, ~600 lines) is diagnostic JSON export, not
  runtime tracing. Each trace is bespoke; input_ui_polish.rs partially duplicates them. A small
  shared "diagnostics report" trait would cut the boilerplate and keep report shapes consistent.
- Fallback font loading probes 3 hard-coded Linux paths at startup (ui.rs:504-514) — will
  quietly produce no text on other distros/platforms without those fonts.

### 5.2 Web (`runtime-web-three/src/ui`)

- Solid DOM mapping (flex + grid, gradients/shadows via CSS, canvas minimap, keyboard/arrow
  navigation with `navigation.ts` spatial lookup).
- Besides the Section 3 bug: context menus don't clamp to the viewport (domOverlay.ts:436-443),
  image atlas/nine-slice metadata is written to `dataset` but not rendered (domOverlay.ts:700-751
  area), `safeArea` from the IR is not applied, effect presets (`ui/effects.ts`) are traced but not
  implemented as CSS, and sequential focus navigation misbehaves around interspersed disabled nodes
  (domOverlay.ts:186-217).

### 5.3 Editor (`packages/editor`)

- Healthy, conventional stack: React 19.2, Zustand single store (`state/editorStore.ts`, ~1000
  lines), panel components, global CSS. No structural problems found.
- Biggest gap: **no runtime-UI preview**. Authors editing `ui.ir` content (there is a `UiPanel`)
  cannot see the overlay rendered; embedding `createUiDomOverlay()` in the preview would close the
  loop cheaply since it's plain DOM.
- The single store is nearing the size where slicing (chat, viewport, project) would help, and the
  dark theme is hardcoded rather than tokenized — cosmetic, not urgent.

---

## 6. Bevy parity: claims vs reality

`docs/bevy-feature-parity.md` UI rows fall into three buckets after cross-checking code.

### 6.1 Accurately bounded (diagnostic-only, docs say so)

- Per-span **italic** rich text — `TN_BEVY_UI_TEXT_ITALIC_UNSUPPORTED` (ui.rs:578-585; doc line 1020).
- **Virtual keyboard** — diagnostic-only status (input_ui_polish.rs:168-186; doc line 1008).
- **Desktop webview overlays** — `TN_OVERLAY_TARGET_UNSUPPORTED` (overlay.rs:205-216).
- Grid named-areas/dense packing, render-to-texture/3D-world UI transforms (doc lines 1010, 1022).

### 6.2 Claimed (P1) but only traced, not proven — likely stale/overstated

| Claim (doc line) | Reality |
|---|---|
| Runtime disabled→enabled UI updates (1016) | `NativeUiDisabled` exists; trace statuses show "partial"/"unobserved" (input_ui_polish.rs:108-119); no deterministic conformance proof |
| Nested & axis-specific scroll (1017) | Only vertical `offset_y` scrolling implemented (ui/interactions.rs:1-28); nesting untested |
| Spatial navigation heuristics (1018) | Web has geometric lookup (`ui/navigation.ts:1-83`); Bevy only maps declared IR links (ui_navigation_trace.rs) — no spatial fallback |
| Focus narration (1019) | AccessKit nodes spawned; narration text traced (input_ui_polish.rs:77-82) but never verified against a screen reader |
| Editable text input (1006) | Widget spawns + value queue exist, but no editing/caret/IME on native (ui/widgets.rs:109-118) |
| Native-rendered shadows/gradients (989-990) | Metadata components + traces only; nothing draws them |
| World-attached UI (998) | Attachment tested structurally; screen-space projection accuracy unverified (web has `attachments.ts:1-81`) |

### 6.3 Genuinely at parity (structure + tests on both sides)

Flex layout, rich text weight/decoration + font assets, image atlas/nine-slice/flip/tile metadata,
accessibility roles/labels + missing-label diagnostics, basic vertical scrolling, affordance
metadata, UI action dispatch **native-side** (web side broken per Section 3).

### 6.4 Why the gap persists: conformance is structural

`conformance.rs:1412-1420` and `runtime-web-three/src/conformance.ts:41-78` compare **UI node
trees**, not behavior or pixels. `docs/verify-v6.md` admits this ("does not yet prove …
screenshot parity"). So a feature can pass conformance while rendering nothing (gradients),
doing nothing (web actions), or behaving differently (navigation).

### Suggested improvements (parity)

| Priority | Improvement |
|---|---|
| P0 | Fix the web action-delivery bug (Section 3) and add a cross-runtime "interaction → script observes action" conformance scenario |
| P1 | Re-grade the Section 6.2 rows in `docs/bevy-feature-parity.md` from claimed-P1 to diagnostic/partial until behavior-level evidence exists (per CLAUDE.md, update `docs/STATUS.md` index + capability files alongside) |
| P1 | Either render gradients/shadows natively or downgrade those rows; same decision for effect presets on both runtimes |
| P1 | Implement (or explicitly bound) native text editing before keeping the "editable text input" P1 claim |
| P2 | Add behavioral conformance probes: scripted focus walk (spatial nav), disabled toggle round-trip, nested-scroll fixture |
| P2 | Screenshot/pixel sampling parity for a small fixture set (both runtimes can render to an offscreen target) |

---

## 7. Consolidated recommendations (ordered)

1. **P0 — Wire web UI actions into the script input channel** and unify `contextUi.ts` state with
   the live DOM overlay. This is a correctness bug, not polish.
2. **P1 — True up `docs/bevy-feature-parity.md`** for the traced-but-unproven UI rows (6.2); the
   doc currently reads stronger than the code.
3. **P1 — Close the authoring/IR node-kind gap** (`TextInput`, component instances in JSX) and
   tighten per-widget prop types.
4. **P1 — Decide gradients/shadows/effects**: render them natively (and as CSS effects on web) or
   reclassify as diagnostic boundaries.
5. **P2 — Behavioral conformance**: interaction, focus navigation, disabled-state, and scroll
   probes that run on both runtimes; later, screenshot parity for fixtures.
6. **P2 — Native perf hygiene**: cache resolved bindings/entity lookups instead of per-frame tree
   walks; replace hard-coded Linux font paths with platform font discovery.
7. **P2 — Editor UI preview**: embed the web DOM overlay in the editor preview so UI edits are
   visible without a full run.
8. **P3 — Consolidate the trace/diagnostic pattern** behind one report interface; add the missing
   authoring tests (E2E TSX→bundle, theme-token cycles, focus restoration across screen stacks).

---

## 8. Verification notes

- The Section 3 bug was verified by direct code inspection in this session (grep of all `.actions`
  consumers in `runtime-web-three/src`; `render.ts` and `systems/contextUi.ts` read in full).
- File:line references elsewhere come from four parallel read-only audits of the listed areas and
  were spot-checked but not all independently re-read; treat exact line numbers as approximate
  anchors.
- No verification commands (`pnpm test`, etc.) were run — this task was read-only inspection.
