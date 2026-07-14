# Engine Improvement Candidates (2026-07-12)

Status: historical candidate inventory. Selected work is tracked by current
PRDs and completed overlay/remediation initiatives.

Proposals derived from mining the Codex authoring transcripts at
`~/.codex/sessions/2026/07/{10,11,12}/rollout-*.jsonl` (~30 sessions:
chess visual polish, overlay regressions, remediation execution). Follows
`engine-improvement-candidates-2026-07-07.md` and the 2026-07-11 wishlist
(`AGENT-ENGINE-WISHLIST-2026-07-11.md`, now 14/15 landed).

Headline: the classic authoring frictions did not recur today — no
engine-source greps, no repeated-identical-playtest spirals, iterate and
the visual workflow used as intended. The friction epicenter has moved to
the overlay/webview layer, which is repeating the exact arc the core loop
went through in early July: capability shipped, proof loop lagging,
regressions indistinguishable from author bugs.

Session evidence referenced below:

- E1: "game is all dark" burned ~6 sessions (11:57-12:45); root cause was
  `color-scheme: dark` on the transparent overlay iframe root compositing
  the canvas as black. Presented as a rendering bug; was a scaffold bug.
- E2: "Play white doesn't work" (15:11); overlay event `chess:choose-side`
  was silently converted to `chess.choose-side`, so no chooser click ever
  reached the game system. No diagnostic fired.
- E3: the in-session Phase 4 audit itself listed why these slip through:
  the scaffold gate never opens a real browser, captures no bridge trace,
  and `verify:webview-package` runs against a fixture with zero overlays
  and zero overlay assets.
- E4: committed playtest keyboard injection targets the game canvas and
  "cannot dismiss the modal web overlay, so its screenshot is not useful
  for 3D comparison".
- E5: bridge payload validation "still lives privately in the web adapter,
  only overlay->game is size-limited, and Rust has a separate unbounded
  implementation".
- E6: native runtime clears scripted events at the end of `postUpdate`,
  "so merely having a WRY delivery queue cannot make desktop HUD snapshots
  live".
- E7: "unowned picking-hit semantics" — the picking service receives only
  IR/assets, not the mapped Three nodes.
- E8: the live 15:28 session (and most of the 10:27/11:09 sessions) is
  pure visual-taste iteration: piece materials, key/fill/rim balance,
  selection/move-highlight presentation vs a reference image.

---

## Tier 1 — overlay loop trust (the new black box)

### 1. Real-browser overlay proof gate with bridge trace

**Today.** `tools/verify/src/overlayScaffoldGate.ts` builds the scaffold
but never renders it in a browser, never clicks through it, and captures
no bridge trace. E1 and E2 both shipped past green gates.

**Want.** The scaffold gate (and the chess enrollment) drives a headless
browser against the built overlay: locate the overlay landmark, click a
control, assert the typed bridge message arrives in the script event
queue, capture a screenshot of the composited result (overlay OVER the
lit canvas — this alone would have caught E1). Store trace + screenshot
as normal gate artifacts.

**Why Tier 1.** Both of today's regressions were invisible to every
existing gate and each cost a debugging session that looked like an
engine bug to the authoring agent.

### 2. Make `verify:webview-package` prove overlay inclusion

**Today.** The named gate's fixture contains zero overlays and zero
overlay assets (E3), so packaging can drop generated overlay output
without failing anything.

**Want.** Fixture with at least one Tailwind and one vanilla overlay plus
generated assets; assert compiled HTML/CSS/JS land in the package and the
package report enumerates them. Cheap: the gate skeleton already exists
(`tools/verify/src/webviewPackageGate.ts`).

### 3. Single-owner bridge message contract

**Today.** Payload validation is private to the web adapter; only the
overlay->game direction is size-limited; the Rust host reimplements
delivery unbounded (E5). This is exactly the dual-maintained-adapter
pattern the repo rules forbid, and E2 (channel-name mangling) is the
drift class it produces.

**Want.** One schema/descriptor owns bridge message names, payload
validation, and size bounds; both runtimes derive or conformance-test
against it. A round-trip drift test that pushes every declared channel
name through the full path (overlay emit -> host -> script queue) and
asserts byte-identical names would have caught E2 outright.

### 4. Overlay-aware playtest interaction

**Today.** Playtest input injection targets the game canvas only; a modal
overlay cannot be dismissed, so any game with a pre-game flow (which the
scaffolds now encourage) yields useless screenshots behind the modal (E4).
The chess sessions worked around it with hand-driven browser automation.

**Want.** Playtest step vocabulary for overlays: `overlayClick` (landmark
or data-testid selector), `overlayVisible`/`overlayHidden` assertions, and
bridge-message assertions (`expectBridgeMessage chess:choose-side`). Then
committed scenarios can open the game, dismiss the chooser, and produce
undimmed visual proof — restoring the visual loop for overlay games.

---

## Tier 2 — cross-runtime correctness

### 5. Native live HUD/overlay snapshot delivery

**Today.** Scripted events are cleared at the end of `postUpdate` before
the WRY delivery queue can observe them, so desktop overlay snapshots
cannot be live (E6). This silently breaks "same game, both adapters" for
any overlay game, which after the chess work is the flagship shape.

**Want.** Deliver (or buffer) script-emitted overlay events before the
clear, plus a paired web/desktop conformance fixture asserting one
snapshot round-trip. Qualifies as a cross-runtime correctness fix under
the parity freeze, same as wishlist items 4/7/14 did.

### 6. Owned picking-hit semantics

**Today.** The picking service receives IR/assets but not the mapped
Three nodes, so hit semantics are re-derived per call site (E7); the GLB
subtree fix (C3) patched the symptom at `mapWorld.ts` by tagging
`userData.entityId`, but ownership is still split.

**Want.** Picking resolves hits against a single owned entity-node index
(the same one the C3 tag feeds), with live picking evidence in a gate.
Small refactor; closes the "picking works except when it doesn't" class.

---

## Tier 3 — visual-taste ergonomics (where authoring time now goes)

### 7. Selection/feedback presentation primitives

**Today.** The dominant remaining authoring activity is subjective visual
polish (E8). Concretely recurring: selection glow, valid-move pads,
path/step trails, hover highlights — each hand-built from meshes and
material patches, each producing "chunky flat markers" on the first try.

**Want.** A small bounded set of presentation components in the same
spirit as tween/world-text: `SelectionHighlight` (soft glow on an
entity/region), `MarkerPad` (ground pad with shape/color/pulse), and a
polyline `Trail`. Authored in content JSON, driven from scripts by id.
These are board/strategy/RTS staples, not chess one-offs.

### 8. Material/lighting starting-point presets

**Today.** Sessions converge on the same physical recipes by trial and
error: "lacquered ebony", "polished ivory", key/fill/rim balance, contact
grounding. Each rediscovery costs screenshot iterations.

**Want.** A curated preset layer over existing material/light IR
(`tn material preset apply lacquered-dark`, light-rig presets
`three-point-warm`, `museum-soft`), each preset being plain authored IR
after apply (no new runtime surface). Pairs with the look-profile system;
mostly a CLI/content deliverable.

---

## Tier 4 — infrastructure and hygiene

### 9. Persistent storage API (carry-over)

The single remaining wishlist item (item 12). Unchanged ask: namespaced,
quota-bounded `storage.get/set` (localStorage web, save-path native).
Unlocks the progression/high-score category, still unauthorable.

### 10. Secret hygiene on the authoring path

An ElevenLabs API key was pasted into a Codex prompt and now sits in
plaintext transcripts. The engine side is already right (`.env` +
redaction in the new `projectEnvironment` loader); add the missing half:
starter/AGENTS guidance telling agents to instruct users to put keys in
`.env` rather than chat, and a `tn audio generate-sfx` diagnostic when a
key-shaped string is passed as an argument instead of via env.

### 11. Working-tree/lockfile hygiene for concurrent sessions

Frozen installs failed today because the uncommitted `overlay-client`
manifest had no matching lock entry, stalling four parallel sessions.
Not an engine feature — just evidence that landing in-flight work
(ElevenLabs SFX bundle, overlay-client) promptly is worth a session.

---

## Suggested slicing

Items 1+2+3 are one bundle ("overlay loop trust") and mirror the shape of
the chess playtest-loop PRD — do them first, they are where today's
sessions actually bled. Item 4 completes the same bundle from the
playtest side. Item 5 is the one native fix that protects the flagship
overlay-game shape. Items 7-8 are cheap content/CLI work that directly
serves the live visual-polish loop. Items 9-10 are small independents.

Not engine improvements, but sequencing reminders from NEXT-FOCUS: the
benchmark rerun (post-polish numbers) and PRD-012 public shipping remain
the outward-proof items; nothing above blocks them.
