# CHALLENGES.md

An honest assessment of ThreeNative's structural challenges, updated
2026-07-14 after reviewing the current status index, agent-authoring benchmark
evidence, completed authoring-loop PRDs, the native-path decision, the shipped
game candidate, distribution work, and the systems code-quality scorecard.
This is a candid internal document, not marketing.

## Context: What This Project Actually Is Now

Measured state at this update:

- About 326k tracked lines of TypeScript/TSX and Rust (roughly 250k TypeScript
  and 76k Rust), 945 commits, and just over one month of history since the
  first commit on 2026-06-12.
- Two runtime adapters, 17 top-level packages, 16 manifest-classified examples,
  39 cookbook entries, a compiler and versioned IR, CLI/MCP/editor authoring
  surfaces, distribution tooling, and a large proof-gate system.
- `docs/STATUS.md` is now a 93-line capability index instead of the former
  ~2,900-line status dump. Generated-game release enrollment is down to two
  representative examples, with other examples explicitly classified as
  build-only, benchmark-only, fixture-only, experimental, or archived.
- The systems scorecard reports 80/100 with 12 confirmed open bugs across nine
  systems. Rust static analysis is the weakest scored system at 52/100 and is
  currently being hardened.

The genuinely differentiated asset remains the **agent-legible authoring and
proof loop**: bounded structured mutations, stable diagnostics, deterministic
IR, and machine-checkable playtest and visual evidence. The project has now
shown that this loop can be extremely cheap when the paved path fits the task.
It has not yet shown that the advantage generalizes to unfamiliar games or
that it produces games people actually want to play.

## What Changed Since The First Assessment

The July 7 plan was not merely discussed; most of it landed:

- Archetype scaffolds, compositional mechanic blocks, actor archetypes,
  schema-aware mutations, structured fixes, cookbook discovery, compact JSON,
  project inspection, and write-time validation now exist.
- `tn iterate` collapses validation, build, screenshot, grading, and playtest
  reporting. Web is the default fast path and native proof is opt-in.
- Plan-emitted commands and cookbook references are registry-derived and
  acceptance-tested. The July 9 gate executed 156 emitted commands with zero
  failures and exact JSON stdout. Recipe apply is transactional, idempotent,
  adoption-capable, and compact on retry.
- Session-cost and churn ratchets now detect engine-source greps, redundant
  verifies, artifact forensics, retries, and failure chains.
- The status front door and generated-game release gate were compressed.
- New native promotions are formally frozen unless a shipped-game need and
  focused web/native evidence justify them. A webview distribution path now
  exists, including Linux and Android work.
- `examples/metro-surfer-heist` passes local build, scenario, QA, release, and
  Pages-shaped URL verification with real hero, obstacle, reward, and
  environment assets.

These developments retire several claims in the original assessment. The
feedback loop is no longer inherently five manually orchestrated commands,
the cookbook is no longer only a proposal, the status front door is no longer
too large for an agent context, and generated-game release evidence no longer
requires maintaining 21 equivalent examples.

## Challenge 1: The Core Product Claim Is Improved, Not Yet Proven

The benchmark record now has three different answers because it measures three
different things:

1. The first direct pilot failed badly: collector and lane-runner exceeded the
   original 2x vanilla token threshold.
2. Recipe-matched scaffold-first reruns passed dramatically at 0.124x and
   0.083x vanilla. This proves that a collapsed, recipe-backed loop can beat
   freestyle Three.js, but the prompts matched the recipes built for them.
3. The July 7 off-recipe round still failed: checkpoint-race was 3.614x
   vanilla and physics-knockdown was 2.008x, with 47-53 median ThreeNative tool
   steps. Guided equal-proof collector evidence later reached 0.454x vanilla,
   but the aggregate verdict still failed its command budget.

The known paved-road failures behind much of that cost have since been fixed:
emitted commands execute, recipes compose with starters, discovery is compact,
and churn classes are gated. However, no fresh Round 5B checkpoint-race and
physics-knockdown matrix has yet demonstrated that those fixes close the broad
off-recipe gap. The project should therefore say **"the measured bottlenecks
were repaired; general authoring efficiency remains unverified"**, not either
"agents cannot use it" or "the benchmark is solved."

This is still the decisive technical/product gate. Without a fresh comparable
round, additional capability work rests on an unvalidated assumption.

## Challenge 2: The System Has A Release Candidate, Not A Shipped Game

`metro-surfer-heist` is locally release-ready and the deployment workflow
exists. Two acceptance items remain:

- no successful public hosting run and public URL are recorded;
- no five-minute human playtest transcript is recorded.

That small-looking gap is strategically large. Internal gates can prove that
the game loads, moves, progresses, retries, stays within budgets, and produces
nonblank screenshots. They cannot prove that a stranger understands the
controls, enjoys the loop, notices the feedback, or wants another run.

`neon-harbor-rescue` is a useful mid-size forcing function, but it remains
build-only pending production art, durable persistence, interactive settings,
and visual/release evidence. More internal examples before Metro is publicly
played would add breadth without answering the product question.

## Challenge 3: The Native/Rendering Treadmill Still Pulls The Roadmap

The native-path decision is correct: web Three.js is the exact-behavior path,
webview is the pragmatic distribution path, and Bevy promotions require a
named shipped-game need. Yet development since the freeze still includes
substantial native rendering, CEF overlays, Android distribution, physics,
UI, audio, geometry, LOD, and parity work.

Some of this closed real in-flight blockers or enabled the release candidate.
The structural risk is that almost any engine feature can be framed as useful,
so a policy without a hard allocation or forcing function does not actually
freeze scope. The current product goal in `docs/STATUS.md` also still leads
with practical Bevy/Three.js feature parity, while the strongest differentiated
thesis is agent-native, verifiable game production. Those goals can coexist,
but they imply very different priorities.

The cost remains permanent: every promoted portable surface crosses SDK, IR,
compiler, web runtime, Bevy runtime, authoring adapters, documentation, and
proof registries. Bevy is still pinned to 0.14.2, so broader parity also grows
eventual migration cost.

## Challenge 4: Process Weight Was Reduced, While System Weight Kept Growing

Two of the worst process multipliers were fixed: the status page is small and
release evidence is representative. The broader system, however, grew from
the original assessment's roughly 190k source lines to about 326k tracked
TypeScript/Rust lines in a little over a week.

The current quality scorecard makes the consequence visible:

- 35 scored systems and 12 confirmed open bugs across nine systems;
- contract truth still spans SDK, IR, compiler, two runtimes, authoring,
  editor/CLI adapters, and verification registries;
- generated-game verification is scored 63/100;
- Rust static analysis is scored 52/100, with a nonzero Clippy/rustfmt debt
  baseline and enforcement work still in progress.

Registry ownership, drift tests, and focused gates are the right controls, but
they reduce the cost of complexity; they do not erase it. The danger is a
self-reinforcing cycle where each new capability requires more descriptors,
proofs, status claims, and remediation work, which then motivates still more
meta-tooling.

## Challenge 5: Visual Capability Is Better, But Still Mostly Internal

The original "colored primitives under a directional light" ceiling has moved:
curated looks, catalog assets, material-aware GLBs, procedural geometry,
terrain/placement tools, post-processing, native lighting work, overlays,
audio feedback, and visual metric bundles now exist. Metro also uses real
assets for its important surfaces.

What remains unclear is whether an unfamiliar agent can assemble these pieces
into a coherent art direction without a prompt-shaped scaffold, and whether
players perceive the result as polished. Screenshot metrics catch blank,
flat, stale, or badly exposed output; they do not measure composition,
readability, charm, pacing, or taste. Shipping and observing one game is now a
higher-value visual test than another rendering capability slice.

## Challenge 6: The Product Position Still Needs External Evidence

The most defensible answer to "why not Unity, Godot, or plain Three.js?" is:

> ThreeNative lets an agent make bounded game changes and prove them cheaply,
> across distributable targets, without turning generated code into an
> unmaintainable one-shot.

That is a strong thesis. It now has credible engineering evidence on the paved
path, but not yet broad benchmark evidence or user evidence. Until those land,
"practical game-engine parity" is a costly implementation ambition rather than
a demonstrated customer reason to choose the product.

## What We Should Focus On Next

### 1. Finish the current quality ratchet, then stop expanding the engine

Complete the in-flight Rust static-analysis baseline and enforcement work, and
fix any regressions exposed by it. This is bounded cleanup needed to make the
current tree trustworthy. Do not use it as the start of an open-ended cleanup
program, and do not begin another rendering/native/capability slice afterward.

### 2. Close PRD-012 in the real world

Deploy `metro-surfer-heist` to its public URL, run the existing URL smoke, and
record at least one genuine five-minute stranger playtest. Prefer three to five
short sessions if available: one session closes the PRD; several reveal
patterns. Record confusion, retry behavior, fun/boring moments, device/browser,
and whether the player voluntarily replays. Fix only blockers observed in that
flow.

### 3. Run the fresh Round 5B decision matrix

After the emitted-command, recipe, churn, and session-cost gates are green,
rerun checkpoint-race and physics-knockdown with the committed equal-proof
protocol and at least three repeats per condition. Do not add matching recipes
before the run. Publish raw tokens, cost-weighted tokens, tool steps, failed
commands, retry chains, proof pass rates, and screenshot/gameplay scores.

This round should answer whether the July 9 repairs generalized. It should not
be postponed for more features.

### 4. Let those two results choose the roadmap

- **If Metro is understandable/fun and Round 5B passes:** keep the engine
  breadth frozen, turn observed authoring friction into small fixes, then ship
  one different game shape using the same public/human bar.
- **If Metro is good but Round 5B fails:** focus exclusively on off-recipe
  authoring economics. Remove step classes and bespoke vocabulary; reconsider
  the vanilla-lift or another in-distribution authoring path using the new
  evidence.
- **If Round 5B passes but Metro is not good:** stop optimizing token cost and
  focus on game design, onboarding, feedback, art direction, and human
  usability. The engine loop is no longer the bottleneck.
- **If both fail after one bounded remediation pass:** stop broad engine work
  and salvage the proof-loop methodology as the primary asset.

### 5. Enforce the native freeze with an allocation rule

Require every new native/rendering/capability PRD to name the public game
blocker it removes and the existing proof it unblocks. Until the two decisions
above are recorded, allocate essentially no compute to speculative parity
breadth. Distribution fixes needed to publish Metro and correctness fixes for
existing claims remain in scope.

## Bottom Line

ThreeNative is in a stronger position than it was on July 5. It responded to
the critique: the loop is collapsed, emitted commands are tested, cookbook and
mutation surfaces exist, the meta-layer is smaller, native breadth is formally
frozen, and a credible release candidate exists.

The project now needs to **collect the evidence those investments were built
to produce**. The highest-value next work is not another engine feature. It is
to publish and human-test Metro, rerun the broad off-recipe benchmark, and let
those results force a continue/narrow/pivot decision.

The guaranteed-waste path is now even clearer: continuing to add parity,
rendering, distribution, and proof slices while the fresh Round 5B result and
public player evidence remain missing.
