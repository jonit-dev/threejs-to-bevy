# CHALLENGES.md

An honest assessment of ThreeNative's structural challenges, written 2026-07-05
after reviewing repo scale, `docs/STATUS.md`, the 2026-07-06 web/Bevy gap
audit, the starter template, and the authoring surface. This is a candid
internal document, not marketing.

## Context: What This Project Actually Is

Measured state at time of writing:

- ~190k lines of source (148k TypeScript, 42k Rust) in 636 commits over
  roughly three weeks (first commit 2026-06-12).
- Two full runtime adapters (Three.js web, Bevy native), a compiler, an IR
  contract, a CLI with dozens of subcommands, an editor package, an MCP
  server, a script stdlib, domain kits, 37 examples, and an extensive
  proof/verification-gate system.
- Self-audited native parity score: 7.4/10, with web-first proof tooling at
  5.5/10 and many native surfaces at trace/report level rather than
  production behavior.

The genuinely novel asset is not "an engine that targets web and native."
It is the **agent-legible authoring loop**: structured source documents,
bounded CLI mutations with stable diagnostics, deterministic IR, and proof
artifacts (playtests, screenshots, scenario ratchets) that let an AI agent
make a change and prove it worked without a human eyeballing every step.
Almost nobody does this seriously. That kernel would retain value even if
both runtimes were discarded.

## Challenge 1: The Bevy Parity Treadmill

Full feature parity between a Three.js-based engine and Bevy is the scope of
a multi-year, multi-person engine team, chased here with Bevy pinned at
0.14.2 (already several releases behind upstream). Every portable feature
costs roughly 2x forever: implement in web, implement in native, keep both
under conformance evidence.

The project's own audit confirms the pattern: contract coverage is high
(8.5) but native proof tooling lags (5.5), and advanced rendering is largely
diagnostic/report-only. Features can be "promoted" while remaining
report-level on native, which makes parity claims easy to overstate.

The pragmatic alternative for "ship a web game natively" — a Tauri/webview
wrapper around the existing web runtime — would deliver most of the product
outcome for a small fraction of the cost, with Bevy retained only as a
narrow proof-of-portability rather than a standing parity commitment.

## Challenge 2: Process Weight Is Compounding

- `docs/STATUS.md` is ~2,900 lines (~70k tokens). It no longer fits in a
  model context window, which defeats its stated purpose as "the
  implementation front door" — and it is re-read (in part) every agent
  session.
- 21 generated example games are enrolled in a release gate that requires
  full plan/QA/release/visual-quality evidence for each. That is a large
  standing maintenance surface whose upkeep competes with feature work.
- A meaningful fraction of total token spend now goes to maintaining
  evidence *about* the project rather than the project itself. The proof
  discipline is the right idea; the current volume is past diminishing
  returns.

## Challenge 3: AI Agents Struggle to Author Games in the System

This is the most serious challenge because the product thesis is
agent-drivability. If agents visibly struggle, the core thesis is failing,
not a side detail. The causes split into one fixed cost and three
self-inflicted amplifiers.

### 3a. Training-distribution handicap (fixed cost, not our fault)

Vanilla Three.js is one of the most over-represented graphics APIs in any
training corpus. A model can one-shot a decent-looking scene from memory —
fog, tonemapping, env maps, bloom, orbit controls — using zero documentation
tokens. The ThreeNative DSL has zero training presence, so every schema
field, `tn` subcommand, and context idiom must be carried in-context and
re-derived each session. Every new framework pays this tax.

Caveat: the vanilla "good game from the start" is partly an illusion — a
single-file spaghetti with no durable structure and no verification, which
degrades as the agent keeps editing. ThreeNative trades first-shot quality
for verifiability. But the first-shot gap is real and it is the gap users
and agents feel.

### 3b. Bespoke surface area (our fault)

The 13-line starter script already contains four conventions no model has
seen: `context.input.axis1("MoveX", { negative, positive })`,
`transform.positionOr(...)`, `context.time.fixedDelta({ fallback, max,
min })`, and `Vec3.round(..., 6)` for proof determinism. Multiply by 8+
content document families, dozens of CLI subcommands, recipes, kits, and the
stdlib. Agents burn most of their context budget learning the dialect before
writing any game. Every novel idiom is a tax; in-distribution shapes (Unity
vocabulary, idiomatic Three.js patterns) transfer for free.

### 3c. Long, abstract feedback loop (our fault)

Vanilla loop: write file, open browser, see it, adjust. ThreeNative loop:
edit JSON -> validate -> build -> playtest -> read diagnostic codes ->
screenshot proof. Each iteration costs minutes and thousands of tokens, and
the primary error surface is codes rather than a picture. Agents iterate
their way to quality; when iteration is 10x more expensive, quality per
token drops accordingly.

### 3d. The visual contract fences off what makes scenes look good (our fault)

The model's memorized bag of visual tricks — custom shaders, particles,
postprocessing, material hacks — hits `TN_*_UNSUPPORTED` diagnostics in the
portable contract. The agent falls back to what the IR safely expresses:
colored primitives under a directional light. Flat output is the
intersection of "what the model knows" and "what the contract allows" being
small, not the model failing.

## Challenge 4: The Unanswered Product Question

Who is this for, and why would they pick it over Godot/Unity (which already
export everywhere) or plain Three.js (which agents already write fluently)?
The only durable answer is "because AI agents can drive it safely and
verifiably" — which points at the authoring/proof loop as the product, not
engine parity. Effort allocation does not currently match that answer.

## What Would Actually Move the Needle

1. **Run the decisive benchmark.** Same game prompt, fresh agent, two
   conditions: (a) vanilla Three.js, (b) ThreeNative stack. Count tokens and
   iterations to a passing playtest and a non-flat screenshot, across 3-4
   game types. The QA infrastructure to score this already exists. If the
   stack cannot get within ~2x of vanilla on tokens-to-playable, the
   authoring layer needs surgery before any other work; if it can, the
   thesis holds and effort should go to the visual contract and cookbook.
2. **Cookbook over reference docs.** Models learn unseen DSLs from few-shot
   complete examples far better than from reference documentation. Distill
   the existing example games into 10-20 pattern-sized pairs ("goal:
   collectible that respawns" -> exact source delta + script + proof
   command) and load them where agents will see them.
3. **Collapse the loop to one command.** Mutate -> validate -> build ->
   screenshot -> diagnostics + image path in a single JSON response. All the
   pieces exist; agents currently orchestrate five steps by hand.
4. **Prescriptive diagnostics.** Errors should contain the fix ("use
   `import { Vec3 } from '@threenative/script-stdlib'`; only named imports
   from [...] are allowed"), not just name the violation.
5. **Prune novel idioms.** For each bespoke API shape, ask whether a boring
   in-distribution (Unity-like or Three.js-like) shape would do.
6. **Freeze native parity breadth.** Finish the in-flight native playtest
   slice (it closes the audit's own P0), then stop promoting new portable
   surfaces to Bevy unless a concrete shipped game needs them. Consider a
   webview wrapper as the practical native path.
7. **Compress the meta-layer.** STATUS.md becomes a ~200-line index into
   per-capability docs; the generated-game release gate keeps 3-5
   representative examples instead of 21.
8. **Ship one genuinely good game end-to-end** as the forcing function. It
   will reveal more about what is missing than another ten parity slices.

## Bottom Line

The project is worth continuing **if** it is deliberately steered toward
"agent-native game development toolchain" — small surface, fast loop,
few-shot cookbook, one great shipped game — and the benchmark in item 1
validates that agents can actually work in it at reasonable cost. It is a
waste **if** it continues drifting toward "reimplement two game engines in
parallel with exhaustive self-documentation": that path has no finish line.

## Is It Fixable?

Technically, yes. Nothing here is a dead end in the engineering sense. The
agent-authoring friction is fixable with a cookbook, a collapsed feedback
loop, prescriptive diagnostics, and pruning bespoke idioms. The process
weight is fixable with a weekend of pruning. Even the parity treadmill is
fixable by decision, not code — freeze it and wrap the web runtime in a
webview shell for native.

But "fixable" is not the right question. The right question is whether the
fixed version wins its one decisive bet: **can an AI agent produce a
playable, decent-looking game through this stack at a token cost within
~2x of writing vanilla Three.js?** Everything else — IR, Bevy, editor,
gates — is scaffolding around that bet, and as of this writing the answer
has never been measured. Three weeks and ~190k lines were spent without
measuring the one thing the thesis depends on.

## The Plan: Two Weeks, Timeboxed, Then a Kill/Continue Decision

1. **Week 1 — run the benchmark before touching anything.** Same 3-4 game
   prompts, fresh agents, vanilla Three.js vs. the ThreeNative stack.
   Measure tokens-to-passing-playtest and screenshot quality using the
   existing QA infrastructure. A few days of work that settles months of
   guessing.
2. **Week 2 — if the gap is large but the failure modes are the fixable
   ones** (dialect confusion, loop orchestration, flat visuals), apply the
   cheap fixes (cookbook, single-command loop, prescriptive diagnostics)
   and re-run the benchmark. If the gap closes meaningfully, the thesis is
   alive — continue, narrowed: freeze Bevy breadth, prune the meta-layer,
   ship one real game.
3. **If the gap does not close, stop building and salvage.**

## When Stopping Is the Right Answer

Stopping would not mean the effort was wasted, because the salvageable
asset is not the engine. It is the **methodology**: bounded mutations,
stable diagnostics, proof artifacts, scenario ratchets, agent-verifiable
evidence loops. That pattern applies to any codebase agents work on, not
just games. A write-up, a small "proof-loop for agents" library, or
applying the methodology to a domain without two decades of Unity/Godot
incumbency might each be worth more than ThreeNative itself.

Honest prior at time of writing: roughly 40% that the benchmark comes back
"close enough to continue." The dialect tax is real, and the
visual-contract ceiling is the hardest fix — making IR-mediated scenes look
as good as freestyle Three.js means promoting a lot of rendering surface,
which drags the project back onto the parity treadmill. But 40% on a
two-week test is a good bet when the alternatives are grinding on
unmeasured or abandoning something that might work.

The one guaranteed-waste option is the middle path: continuing to build
parity slices and gates while the core question stays unanswered.
