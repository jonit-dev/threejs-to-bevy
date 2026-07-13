# Diagnosis: Chess desktop (Bevy) — missing "Choose a side" modal + unclickable pieces

Date: 2026-07-12
Scope: `examples/chess` on the desktop (Bevy) target; root cause in
`packages/cli/src/native/bevy.ts` launcher + `runtime-bevy` feature gating.

## Symptoms

1. The "Choose a side" React overlay never appears on desktop.
2. No piece can be clicked; no move can be made. The rest of the UI (retained
   HUD: turn text, status, move history) renders fine.

## Root cause

**One root cause, two symptoms.** The launcher reused a stale prebuilt runtime
binary compiled without the optional `native-webview` Cargo feature, so the
overlay webview backend is unavailable; and all gameplay input is gated behind
side selection, so the missing overlay also makes the board unclickable.

### 1. Launcher/cache feature mismatch (the actual bug)

- The side-select modal is a React **webview overlay**
  (`examples/chess/content/overlays/chess.overlays.json`, entry
  `overlay/chess-side-select/dist/index.html`, declared for `web` + `desktop`).
- On desktop, webview overlays require the optional Cargo feature
  `native-webview` (wry + GTK/WebKitGTK), declared in
  `runtime-bevy/crates/threenative_runtime/Cargo.toml:130`.
- The CLI launcher `packages/cli/src/native/bevy.ts` passes
  `--features native-webview` **only on the `cargo run` path**
  (`bevyRuntimeArgs`, line ~95). But `runBevyRuntime` (line ~158) first looks
  for an existing binary at `runtime-bevy/target/{release,debug}/threenative_runtime`
  and spawns it directly, **without verifying it was built with the feature**.
- Verified on this machine: `target/release/threenative_runtime` contains **no
  wry/webkit symbols** (built without the feature); `target/debug/` does
  contain them. `TN_NATIVE_PROFILE` defaults to release, so the featureless
  release binary wins.
- Without the feature, `native_webview_backend_available()` returns false and
  the runtime emits `TN_OVERLAY_TARGET_UNSUPPORTED`
  (`runtime-bevy/crates/threenative_runtime/src/overlay.rs:254`) — a diagnostic
  the CLI never surfaces to the user, so the overlay just silently never mounts.

This is a launcher/cache mismatch, **not** a limitation of the chess overlay or
of desktop overlay support in general. The HUD you do see is retained Bevy UI,
which is why "other UI works".

### 2. Unclickable pieces are downstream, not a picking bug

- `examples/chess/src/scripts/chess.ts:347`:
  `humanTurn = ... state.playerColor !== "" ...` — every pointer/keyboard move
  handler is inside this gate. With no side chosen, `playerColor` stays `""`
  forever and all clicks are ignored. Picking (`picking.pointerRay`) is fine.

## Immediate workarounds (no code changes)

- **Keyboard fallback already exists**: press `W` (white) or `B` (black) —
  `content/input/chess.input.json` binds `choose-white`/`choose-black`. Once a
  side is chosen, pieces become clickable.
- **Rebuild the release binary with the feature**:
  ```bash
  cargo build --release -p threenative_runtime --features native-webview \
    --manifest-path runtime-bevy/Cargo.toml
  ```
  (or delete `runtime-bevy/target/release/threenative_runtime` so the CLI falls
  back to `cargo run --features native-webview`).
- Alternatively `TN_NATIVE_PROFILE=debug` — the current debug binary was built
  with wry.

## Proposed fixes

### F1 (launcher, primary): never trust a cached binary blind

In `packages/cli/src/native/bevy.ts`, make the prebuilt-binary fast path
feature-aware. Options, in preference order:

1. **Capability handshake**: add a `--capabilities` flag to
   `threenative_runtime` that prints JSON including
   `native_webview_backend_available()` / backend name (the functions already
   exist in `overlay_host.rs`). `resolveBevyRuntimeBinaryPath` runs it and
   skips any binary lacking a required capability, falling back to
   `cargo run --features native-webview`.
2. **Feature-stamp marker**: whenever the CLI builds the runtime, write
   `target/<profile>/threenative_runtime.features` next to the binary; reuse
   the binary only if the stamp includes every required feature.

Either way, add a unit test in `packages/cli/src/native/bevy.test.ts` that a
binary without `native-webview` is not selected when the bundle declares
desktop overlays (consistency-test rule from CLAUDE.md: the feature list must
have one owner, and the reuse path must be derived from it).

### F2 (runtime/CLI, visibility): surface TN_OVERLAY_TARGET_UNSUPPORTED loudly

Today the diagnostic is emitted but invisible in a normal launch. The CLI
should print a clear warning ("bundle declares N desktop overlays but this
runtime binary has no webview backend — rebuild with --features
native-webview") and `tn playtest --target desktop` should **fail or flag** the
scenario when a declared overlay can't mount, instead of passing a gate that
proves nothing (matches the 2026-07-12 Codex-session finding that the webview
gate currently proves nothing).

### F3 (game, resilience): don't hard-block the game on the overlay

`chess.ts` already accepts `W`/`B` keys and `ui.actions()` as fallbacks — good.
Harden the UX so a missing overlay degrades gracefully:

- Set the initial HUD `promptText`/`statusText` to mention "Press W for White,
  B for Black" so the keyboard path is discoverable when the modal is absent.
- Optionally: if no overlay backend is available (could be exposed as a
  queryable resource), auto-default to white after a short delay rather than
  sitting on a dead board.

### F4 (hygiene): single source of truth for required runtime features

The `--features native-webview` string currently lives inline in
`bevyRuntimeArgs`. Move the required-feature list to one exported constant that
both the build args and the binary-reuse validation (F1) derive from, so the
two paths can't drift again.

## Verification plan

1. Rebuild release with `native-webview`; relaunch chess on desktop → modal
   appears, choosing a side enables clicking, moves commit.
2. Deliberately build a featureless binary → CLI (with F1) refuses to reuse it
   and rebuilds; (with F2) if forced, prints the unsupported-overlay warning
   and desktop playtest flags it.
3. `pnpm test` for the new `bevy.test.ts` cases; rerun
   `tn playtest --project examples/chess --scenario playtests/chess-opening.playtest.json --target desktop --json`.
