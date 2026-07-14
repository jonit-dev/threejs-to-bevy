# Authoring Trial Report: Chess via Codex (2026-07-12)

Status: historical trial evidence. Its remediation PRDs are complete.

Third external authoring trial, this time driven by Codex CLI (GPT-5) instead
of Claude. Three sessions built and polished `examples/chess`:

| Session | Scope | Size | Outcome |
| --- | --- | --- | --- |
| 2026-07-11 23:52 (~12 min, 62 calls) | Create full-rules chess from scratch | 1.8 MB | `TN_ITERATE_OK`, opening playtest passes |
| 2026-07-12 09:58 (~2h20m, 126 calls) | Web preview, camera, real GLB pieces, picking | 24 MB peer | Ended mid-turn; flaky picking unresolved |
| 2026-07-12 10:27 (~15 min+, 59 calls, active) | Visual polish to photo references | 24 MB | Look landed after render-profile discovery |

Source transcripts: `~/.codex/sessions/2026/07/{11,12}/rollout-*.jsonl`.

## What worked

- **Playtest is the strongest surface.** The agent hand-wrote a real scenario
  (select e2, cursor to e3, commit; assert z-movement, `ChessGame.turnText`,
  HUD text, clean console/network/runtime) and it genuinely proved the loop.
- **The screenshot loop was used faithfully.** Every visual edit cycle was
  patch → regenerate → `tn iterate` → `view_image` on
  `artifacts/iterate/latest/screenshot.png`. Visual inspection caught two real
  bugs that assertions missed (disappearing board entities, z-fighting).
- **`tn asset inspect` diagnostics earned their keep**: surfaced
  `TN_ASSET_GAMEPLAY_TOO_SMALL`, unsupported `KHR_materials_ior`, and broken
  absolute Windows texture paths in converted GLBs.
- **Validate errors that enumerate valid values enable one-shot retries**
  (`wrapS must be clampToEdge, mirroredRepeat, or repeat`). Errors that don't
  (input bindings, below) cost engine-source archaeology.
- The agent held the quality bar: refused to ship irrelevant catalog matches
  and visibly-broken catalog GLBs.

## Findings (ranked by cost)

### C1. Custom component tags are not runtime-queryable (silent breakage)

`context.query({ with: ["ChessPiece"] })` compiled, typechecked as `never`
noise, and silently misbehaved at runtime — hiding markers made "most board
entities disappear". Playtest assertions passed while the bug was live; only
screenshot review caught it. Workaround: query all entities and filter by
entity-id string prefix (`entity.id.startsWith("piece.")`), which is now baked
into `chess.ts`.

Fix direction: either make custom tags first-class filterable components, or
make `query({with})` fail loudly (compile-time and runtime) for
non-schema components. Also add picking services (`picking.mesh`,
`picking.pointerRay`) to `ScriptContext` typings — the agent had to declare
its own `ChessContext` and cast.

### C2. Combinatorial content has no CLI path; generator scripts then fight the CLI

A chess board is 64 squares + 32 pieces + ~28 pooled markers with per-entity
mesh/material IDs. One-at-a-time `tn` mutations can't author that, so the
agent wrote `scripts/generate-board.mjs` emitting all of `content/**`. That
was the right call — but it created a **double-authoring conflict for the
rest of the trial**: every `tn scene set-camera-look-at` result had to be
hand-mirrored into the generator (including copying computed rotation
radians) or be clobbered by the next regeneration. One direct scene-JSON
patch failed against generator-owned content and was abandoned.

Fix direction: first-class support for generator-owned documents — e.g.
`tn generate` with a declared generator manifest, so CLI mutations either
write through to generator parameters or clearly refuse with "document is
generator-owned". Alternatively (or additionally) bulk authoring: accept an
array of ops or a JSON patch stream in one `tn` call.

### C3. Mesh picking is defeated by imported GLB child meshes (user-facing: "clicking is flaky")

Root cause found via live-browser repro: `picking.mesh` `ignore` lists operate
on entity IDs, but imported GLB **child meshes** are not covered by their
parent entity's ID — the ray stops on a piece submesh and the click resolves
to nothing. After three rounds the agent abandoned mesh raycasting entirely
and intersected `picking.pointerRay` with the board plane analytically.
Session ended mid-verification; still unconfirmed fixed.

Fix direction: propagate entity ownership to GLB descendants in the picking
service (ignore/target lists should match the whole subtree). This is the
single change that most directly maps to a user complaint.

### C4. Active render profile silently color-grades authored textures

~One third of the polish session was burned because the project's runtime
config forced the global `cinematic` render profile, which regraded every
authored texture into "garbage" (user's word). Nothing in `tn iterate`
output, diagnostics, or the screenshot artifact names the active profile; the
agent chased a PNG-gamma dead end (`identify`, `magick -strip`) before
grepping other examples' `default.runtime.json`. Fix was one command:
`tn runtime set-rendering default --render-profile parity`.

Fix direction: print the active render profile in `tn iterate` output and
screenshot artifact metadata, and emit a diagnostic when a non-parity profile
is active during material/texture authoring.

### C5. Asset pipeline: catalog dead-ends and no import/conversion tooling

- Catalog searches for `board-game`, `tabletop`, `chess` returned
  `TN_ASSET_SOURCE_NO_MATCH` or index-only records. The single chess record
  (`polyhaven-model-chess-set`) has no direct download and is a monolithic
  76,920-poly set — unusable for per-piece interaction. The user explicitly
  asked "couldn't you find glb assets for the pieces?"; the answer was no.
- Keyword relevance is poor: `--query "chess piece"` returned track pieces,
  walls, vehicles.
- Both direct-download environment GLBs the catalog did offer rendered
  visibly broken (black reflective slab; distorted blue/black carpet), both
  carrying `KHR_materials_ior`, which `asset inspect` only warns about.
  Net catalog contribution to the shipped game: zero assets.
- No conversion tooling exists: the .dae piece models were converted with a
  hand-rolled `assimpjs` pipeline plus a second Node pass that stripped broken
  texture paths and injected white/black `baseColorFactor` variants by
  patching GLB JSON. It worked, but it is entirely bespoke.
- `tn asset add --type glb` returned `TN_ASSET_OK`, then broke the build at
  `tn iterate` with `TN_SDK_ASSET_FORMAT_UNSUPPORTED` (correct type:
  `--type model`). Validation fires two commands too late.
- `asset source search` JSON blew the tool-output budget (15k tokens,
  truncated) — too verbose for agent consumption.

Fix direction: `tn asset import <file|url> --license ...` that converts
(.dae/.obj/.fbx → GLB), repairs texture paths, and registers in one step;
validate `--type` at `asset add` time; promote `KHR_materials_ior` (and
similar non-portable extensions) from warning to actionable diagnostic with a
strip/convert offer; compact search output; seed the catalog with
bundle-ready per-piece tabletop sets.

### C6. Schema vocabulary is discovered by trial-and-error or source-reading

Each of these cost a validate round-trip or worse:

- Input bindings: object form `{"device":"pointer","button":0}` rejected; the
  accepted micro-syntax (`"pointer.0"`, `"pointer.x"`) is documented nowhere
  and was found by reading `packages/compiler/src/emit/bundle.ts`. Worse, the
  validator's attached `fix.snippet` was an irrelevant transform snippet
  pointing at the `collectible-respawn` cookbook entry.
- Transform rotation: quaternion `[x,y,z,w]` rejected; Euler `[x,y,z]`
  expected.
- Texture wrap: `"clamp"` rejected (wants `clampToEdge`).
- Material `kind: "unlit"` does not exist — which matters (see C7).

Fix direction: make every `TN_AUTHORING_SHAPE_INVALID` carry a correct,
field-specific fix snippet; document the input-binding string syntax in the
authoring skill/API card; consider accepting the common aliases (quaternion
with a conversion note, `clamp`).

### C7. No unlit material and no backdrop primitive for reference-image looks

The "blurred library background" reference had to become a hand-positioned
textured quad sized past the camera frustum, on a **lit** standard material
(no `unlit` kind) — which is exactly why lighting tints contaminated it. UV
orientation was fixed by negative Y scale, which broke culling, contributing
to the "garbage" complaint. No hover/highlight material-patch API was found
either; hover feedback shipped as a scale-enlarge hack after grepping the
runtime for an emissive patch path.

Fix direction: an `unlit` material kind; a scene `backdrop`/`skybox` node
(image, fit mode, optional blur); a small script API for per-entity material
patches (emissive/tint) for selection and hover states.

### C8. `tn iterate` gates visual work on unrelated playtest failures

All seven iterates in the polish session returned `TN_ITERATE_FAILED` because
the committed opening playtest has a stale assertion
(`TN_PLAYTEST_RESOURCE_STATE_STAGNATED` on `ChessGame.turnText`). The agent
learned to ignore `ok:false` and read the screenshot anyway — which trains
agents to distrust the gate. Runs take 12–22 s, past the exec yield window,
so each loop costs 2–3 extra poll calls; a visual round-trip is 4–5 tool
calls minimum.

Fix direction: a `tn iterate --visual-only` (build + screenshot, skip
scenario assertions) or split exit status so visual artifacts are usable and
clearly labeled even when gameplay assertions fail.

### C9. Scaffold and plan overhead off-recipe

- `tn create` residue (arena scene, `player.ts`, 4 starter playtests,
  `recipe:controller`, `goal-ping.wav`, `lib/movement.ts`) failed builds and
  iterates until hunted down file by file. No `--minimal` mode.
- `tn game plan` off-recipe returned a generic collector-template plan whose
  `proofCommands` referenced `coin-pickup.playtest.json`; `--suggest-scenario`
  returned the generic ArrowDown template. The cookbook delivered more value.
- Bug: `tn game plan` doubled the project path, writing artifacts to
  `examples/chess/examples/chess/artifacts/...`; the agent had to clean up.
  Repeated `TN_GAME_PLAN_SOURCE_DEFAULT_FALLBACK` diagnostics off-recipe.

Fix direction: `tn create --minimal`; fix the plan artifact path bug; make
plan/suggest degrade honestly off-recipe (say "no recipe for this genre"
instead of emitting collector-template proof commands).

### C10. Camera iteration is screenshot-gated with a hidden default

Landing one acceptable camera took four regenerate+iterate loops (~30–60 s
each). The hidden culprit for "camera angle looks awful" was the scene camera
defaulting to **orthographic**; nothing surfaced that until a letterboxed
screenshot appeared, and the perspective component shape (`fovY` vs `fov`)
had to be learned from `packages/ir` source.

Fix direction: `tn scene inspect --node camera` should print mode/fov
prominently; consider a fast `tn frame` preview (render one frame without the
full iterate pipeline); document camera component shapes on the API card.

### Smaller items

- Playtest summary advertised a `contactSheet` artifact path that did not
  exist on disk.
- `--target desktop` proof is impossible on a headless host (winit needs
  `DISPLAY`/`WAYLAND_DISPLAY`) — the release-gate requirement cannot be met
  in this environment; needs a headless native target or a documented waiver.
- `tn playtest --discover` still scored the deleted starter `player` as top
  controllable entity.
- Preview page 404s on `favicon.ico` (console noise agents must triage).

## Recurring vs prior trials (golden-path, orb-reactor 2026-07-11)

Confirms the pattern that **off-recipe games get little from plan/scaffold and
pay a schema-discovery tax**: N-series findings flagged plan fallback noise
and events dead-ends; this trial adds input-binding syntax, rotation format,
and material vocabulary to the same bucket. The iterate-green-on-stubs
concern (F3) has a mirror image here: iterate-red-on-stale-assertions (C8) —
in both cases the gate's verdict diverges from what the agent needs to know.
New classes of finding unique to this trial: runtime queryability of custom
components (C1), generator-vs-CLI ownership conflict (C2), GLB-subtree
picking (C3), and render-profile invisibility (C4).

## Suggested priority

1. **C3 picking subtree fix** — direct user-visible flakiness, still live.
2. **C1 custom-component queries** — silent correctness failure class.
3. **C4 render-profile surfacing** — cheap fix, huge wasted-time multiplier.
4. **C8 visual-only iterate** — restores trust in the primary loop.
5. **C5 asset import command + add-time type validation** — every visual
   game hits this wall.
6. **C6 fix snippets + binding docs** — cheap, high-frequency papercuts.
7. **C2 generator-owned content contract** — design work, biggest
   architectural gap.
8. C7, C9, C10 as capacity allows.
