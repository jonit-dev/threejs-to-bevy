# Engine Improvement Candidates - 2026-07-07

Status: historical planning input. Its selected delivery PRDs are complete or
separately tracked.

A prioritized menu of PRD candidates to slice from. Grounded in
`CHALLENGES.md`, the 2026-07 benchmark evidence
(`tools/verify/artifacts/agent-benchmark/`), `tools/agent-benchmark/
TOKEN-COST-DIRECTION.md`, and `tools/agent-benchmark/OFF-RECIPE-DIRECTIVE.md`.

Strategic frame: the product is the **agent-native authoring loop**, not
engine parity. Every candidate below either lowers the token cost of the
authored delta, raises the visual/gameplay quality ceiling inside the
contract, or cuts standing maintenance weight. Nothing here adds Bevy parity
breadth.

## The scaffolding layer model

Several candidates are organized around one idea: a game project is built in
layers, and tokens should only ever be spent on the top one.

- **L0 - project plumbing** (exists): the starter template — build config,
  verification harness, docs, prebuilt bundle. Never authored by agents.
- **L1 - archetype**: how the player exists in the world — camera rig,
  character controller, input map, physics profile. Determined almost
  entirely by game *type* (third-person, first-person, top-down,
  side-scroller, racing). High boilerplate, low creativity, fully
  in-distribution vocabulary. Today only one implicit archetype exists
  (top-down arena). Candidate 2.
- **L2 - mechanics**: what the player does — spawners, timers, triggers,
  scoring, projectiles. Composable blocks. Today these exist only fused
  inside two whole-game recipes. Candidate 3.
- **L3 - the authored delta**: what makes this game *this game*. The only
  layer agents should spend tokens on, and the only layer benchmarks should
  measure (`OFF-RECIPE-DIRECTIVE.md`).

The 07-07b benchmark pass happened because the two recipes fused L1+L2+L3
into monoliths that exactly matched the two prompts, making L3 zero.
The fix is not fewer scaffolds — it is scaffolds factored along these layers
so L3 shrinks for *every* game, not two blessed ones.

Ordering rule: candidate 1 is the gate. Candidates 2-6 are the highest-value
build work and are safe to start in parallel with it. Candidates 7-10 are
strategic/structural and can be sliced anytime. Candidate 11 is the capstone.

---

## 1. Off-Recipe Benchmark Round (the gate)

**Problem.** The 07-07b benchmark pass measured the recipe pipeline (authored
delta = zero), not agent authoring. The last real authoring measurement is
the pilot fail (2.5-3.9x vanilla). The kill/continue question is unanswered.

**Scope.** Execute `tools/agent-benchmark/OFF-RECIPE-DIRECTIVE.md` verbatim:
checkpoint-race and physics-knockdown prompts, both conditions, fresh vanilla
baselines, medians, <= 2.0x thesis gate, token-sink analysis on failure.

**Out of scope.** New recipes, prompt-specific tuning mid-round, token
compaction work.

**Success metric.** A recorded off-recipe raw-token ratio per prompt plus an
updated CHALLENGES.md verdict. Pass or fail, this PRD succeeds if the number
exists.

**Size.** Small (protocol and prompts already exist). Highest urgency.

---

## 2. Archetype Scaffolds (per game type, L1)

**Problem.** There is exactly one starter, and it is implicitly a top-down
arena. Any prompt for a third-person, first-person, side-scrolling, or
racing game forces the agent to author the camera rig, controller, input
map, and physics profile by hand — the most boilerplate-heavy and
error-prone part of a game, and the part least specific to it. Meanwhile
"third-person controller" is vocabulary every model already knows: the
archetype *names* are free; only our authoring of them costs tokens today.

**Scope.**
- 4-6 archetypes as first-class scaffolds, e.g. `tn create <name>
  --archetype top-down | third-person | first-person | side-scroller |
  racing`, each = L0 starter + camera rig + controller script + input map +
  physics profile + a default look profile (candidate 6) + archetype-specific
  playtest probes (jump probe for side-scroller, look probe for first-person,
  lap probe for racing).
- Each archetype renders correctly and passes its playtests with zero edits
  (enforced by the CI ratchet, candidate 9).
- `tn game plan` selects the archetype from the goal text and reports which
  one it picked, instead of assuming top-down.
- Document each archetype in the API card with one screenshot and its probe
  list.

**Out of scope.** Genre *mechanics* (that is L2 / candidate 3); more than ~6
archetypes before evidence demands them; native-target proof for new
archetypes (web-first, per the parity freeze in candidate 10).

**Success metric.** A benchmark-style prompt for each archetype starts from
the correct perspective and control scheme with zero authored L1 tokens;
archetype selection visible in `plan.json`.

**Size.** Medium-large. Highest-leverage scaffold work after the gate.

---

## 3. Compositional Mechanic Blocks (recipes that stack, L2)

**Problem.** The two existing recipes are whole-game monoliths; they cover
exactly two prompts and zero the delta only on rails. Users and benchmarks
live off the rails.

**Scope.** Decompose the monolith recipes into composable `tn` authoring
commands, each writing durable source + matching playtest stanzas, e.g.:

- `tn add spawner --pattern grid|ring|lane --prefab <id> --count N`
- `tn add timer --resource <name> --direction up|down --limit N`
- `tn add trigger-sequence --entities a,b,c --ordered` (checkpoints)
- `tn add projectile --launcher <id> --key space` (launch/knockdown)
- `tn add score --on-event <event> --win-at N --retry-key R`
- `tn add follow-camera --target <id> --mode top-down|chase`

Blocks must compose with any archetype from candidate 2. Rebuild
`top-down-collector` and `lane-runner` as archetype + block compositions
(proves the decomposition is real). Each block documented in the API card
with one example.

**Out of scope.** New whole-game recipes; blocks nobody's prompt needs yet
(derive the initial set from the four benchmark prompts, not speculation).

**Success metric.** Checkpoint-race and physics-knockdown become expressible
as archetype + blocks + small authored glue; a future benchmark round shows
the delta shrinking. Existing recipe scaffold output gate-equivalent after
recomposition.

**Size.** Large. Pairs with candidate 2; slice separately.

---

## 4. Schema-Aware Mutation Surface (never hand-edit JSON)

**Problem.** "Structured-source patch fragility" was a named dominant
friction in the pilot: agents hand-edit content JSON with Edit/patch tools,
break schema invariants, then burn a diagnose-repair loop. The stated policy
("prefer `tn ... --json` authoring commands") is only as good as command
coverage, and the transcripts show gaps.

**Scope.** Audit pilot/rerun/off-recipe transcripts for every raw file edit
to `content/**`. For each edit shape, provide a bounded mutation command
(`tn scene set-transform <entity> --position x,y,z`, `tn ui bind <node>
--resource <path>`, `tn prefab set-material ...` — exact list driven by the
audit, not invented). Each command validates against the schema before
writing and emits a prescriptive error (candidate 5) on rejection. Update
starter instructions: raw JSON edits are a last resort.

**Out of scope.** A generic JSON-path setter with no schema awareness (that
just moves the fragility); mutation surfaces for files no transcript touched.

**Success metric.** Zero raw Edit calls on `content/**` in the next
benchmark round's ThreeNative transcripts.

**Size.** Medium.

---

## 5. Prescriptive Diagnostics v2 (the error contains the fix)

**Problem.** Pilot medians hit 4-9 failed commands per session; each failure
costs a multi-step diagnose-retry loop. CHALLENGES item 4 and
TOKEN-COST-DIRECTION item 5 both name this; only partially done.

**Scope.** Mine every failed command in pilot + rerun + (once run) off-recipe
transcripts. For each of the top ~10 failure modes, make the diagnostic emit
the literal fix: exact flag, exact path, exact schema snippet, exact import
line ("use `import { Vec3 } from '@threenative/script-stdlib'`; only named
imports from [...] are allowed"). Add a conformance test per diagnostic
asserting the fix text stays present and correct.

**Out of scope.** New diagnostic categories; renumbering existing codes.

**Success metric.** Failed-command median 0-1 in the next benchmark round,
and every failure that does occur recovers in one step (visible in
transcripts).

**Size.** Medium.

---

## 6. Cookbook: Few-Shot Pattern Pairs (CHALLENGES item 2)

**Problem.** Models learn unseen DSLs from complete worked examples, not
reference docs. The API card answers "what exists"; nothing answers "what
does the exact source delta for X look like." Pilot transcripts show agents
grepping engine internals when the card runs out.

**Scope.** Distill 10-20 pattern-sized pairs from the 37 examples:
"goal: collectible that respawns" -> exact content-JSON delta + script diff +
one proof command. Serve them via `tn cookbook <topic> --json` (compact,
grep-able index; each entry < ~1.5 KB so it can be replayed in context).
Advertise the command in starter AGENTS.md/CLAUDE.md. Seed the topic list
from every `rg`/engine-grep found in pilot and rerun transcripts.

**Out of scope.** Prose tutorials, long-form docs, anything not shaped as
goal -> delta -> proof.

**Success metric.** Zero engine-internal greps in the next benchmark round's
ThreeNative transcripts; cookbook lookups appear in their place.

**Size.** Medium. Content-heavy, low-risk.

---

## 7. Beautiful Scaffolds: Visual Uplift Inside the Contract

**Problem.** The passing benchmark screenshot is flat colored primitives under
one light — the Challenge 3d ceiling made vivid. Look profiles / beautiful
defaults exist (`docs/PRDs/done/beautiful-defaults-render-look-profiles.md`)
but the scaffold and recipes do not use them, so agent output starts ugly and
agents have no in-contract vocabulary to fix it.

**Scope.**
- Apply a curated look profile (palette, env lighting, fog/atmosphere, bloom,
  tonemapping, material presets) to the starter, every archetype scaffold
  (candidate 2), and every mechanic block by default.
- Add a `tn look apply <profile> --json` command (or promote the existing
  surface) with 4-6 profiles, documented in the API card with one screenshot
  each.
- Extend the benchmark scorer's visual bar beyond nonblank: minimum color
  bucket count / local contrast thresholds so "flat primitives" scores worse
  than "styled scene".

**Out of scope.** Custom shader support, particles, any new portable contract
surface requiring Bevy promotion. This is about using the contract we have.

**Success metric.** Starter, archetype, and recipe screenshots pass the
tightened visual bar with zero agent edits; side-by-side before/after
committed as evidence.

**Size.** Medium.

---

## 8. API Pruning to In-Distribution Shapes (CHALLENGES item 5)

**Problem.** Bespoke idioms (`axis1("MoveX", {negative, positive})`,
`positionOr`, `time.fixedDelta({fallback,max,min})`, `Vec3.round(...,6)`)
each cost context to teach and invite errors. In-distribution shapes (Unity
vocabulary, idiomatic Three.js) transfer for free.

**Scope.** Inventory every exported stdlib/SDK shape an agent touches in the
benchmark transcripts. For each, decide: keep (genuinely load-bearing),
alias (add the boring name, keep old as deprecated), or replace. Ship the
boring names in the API card and cookbook; keep old names working one cycle.

**Out of scope.** IR or content-schema renames (much bigger blast radius);
anything not evidenced in a transcript.

**Success metric.** The starter script and cookbook entries read as
Unity/Three-familiar; dialect-confusion failures disappear from benchmark
transcripts.

**Size.** Medium, mechanical but wide. Run the conformance suite aggressively.

---

## 9. Session Cost Ratchet in CI (TOKEN-COST-DIRECTION item 6)

**Problem.** Token regressions are only visible when someone runs a full
human-operated benchmark. Steps are the causal variable; nothing gates them.

**Scope.** A CI job that scaffolds a temp project per archetype and
recipe/block, runs the scaffold-first path headlessly, and asserts: zero
manual edits needed to pass `tn iterate`, tool-step count <= 12, failed
commands == 0, iterate summary <= 2 KB. Extend `session.json` capture with
step counts (already partially present). Fail the build on regression.

**Out of scope.** Running LLM agents in CI; this is deterministic replay of
the scripted golden path.

**Success metric.** A scaffold or CLI change that reintroduces a repair loop
fails CI before any benchmark rerun is needed.

**Size.** Small.

---

## 10. Meta-Layer Compression + Native Path Decision

Two structural decisions, sliceable as one or two PRDs.

**Meta-layer (CHALLENGES item 7).** `docs/STATUS.md` is ~2,900 lines (~70k
tokens) — it no longer fits a context window, defeating its "front door"
purpose. 21 generated examples sit in a full-evidence release gate. Scope:
STATUS.md becomes a <= 200-line index into `docs/status/capabilities/*.md`
with the line budget enforced by `check:docs`; the release gate keeps 3-5
representative examples, the rest archived. Small-medium; pure standing
savings.

**Native path (CHALLENGES items 1/6).** Finish the in-flight native playtest
slice (closes the audit's P0), then declare a parity freeze: no new portable
surface promoted to Bevy without a shipped game needing it — recorded in
STATUS.md and `docs/bevy-feature-parity.md`. Spike a Tauri/webview wrapper
around the web runtime as the practical native path: one example packaged,
input/window/save-path basics proven, size and startup measured. Medium.

**Success metric.** STATUS.md <= 200 lines enforced; gate example count 3-5;
committed freeze policy; a webview-packaged example with measured
startup/size.

---

## 11. Ship One Genuinely Good Game (CHALLENGES item 8, capstone)

**Problem.** Nothing exercises the stack end-to-end like a real game with
taste. Parity slices and gates hide integration gaps that a shipped game
exposes in days.

**Scope.** Pick one game concept a step above the benchmark archetypes
(e.g., a polished arcade game with menus, sound, difficulty curve, juice).
Build it agent-first using archetypes (2), blocks (3), cookbook (6), and
look profiles (7), logging every friction as an issue against the other
PRDs. Ship it web-first; package it with the webview path (10) if that
landed. Publish it.

**Out of scope.** Engine features invented for this game unless a friction
log entry justifies them.

**Success metric.** A playable, publicly hosted game a stranger enjoys for
five minutes, plus a friction log that seeds the next planning round.

**Size.** Large. Do last; it is the forcing function that validates
everything above.

---

## Explicitly Not Recommended

- New whole-game recipes for the current benchmark prompts (re-rigs the
  benchmark; see OFF-RECIPE-DIRECTIVE.md). Whole-game scaffolds in general:
  factor along L1/L2 instead.
- New Bevy parity surfaces ahead of a shipped-game need (candidate 10
  freezes this deliberately). This includes native proof for new archetypes.
- Further compaction of iterate/playtest output below ~2 KB (settled;
  output bytes are two orders of magnitude below the cost driver).
- More evidence volume in the meta-layer (candidate 10 goes the other way).
- A generic schemaless JSON-path edit command (moves patch fragility around
  instead of removing it; see candidate 4).
