# Where to Spend Compute Next (2026-07-11)

Status: superseded strategy snapshot. Use `docs/PRDs/README.md` for the current
executable backlog.

Strategic assessment of the highest-value work, ranked. Written after reading
`docs/STATUS.md`, `docs/ROADMAP.md`, the lumen-lite handoff docs, the
agent-benchmark round-4/round-5 records, and the 2026-07-09 hands-on
authoring audit.

## The thesis

The engine's value proposition is: **agents author portable games with
machine-checkable proof, at a cost and quality that beats hand-rolling
Three.js.** Judged against that:

- Rendering/physics/native parity is in good shape and now yields
  diminishing returns. The native promotion freeze already encodes this.
- The measured value proposition is currently FAILING: round-5 collector
  matrix shows direct ThreeNative at 1.45M median tokens = **6.29x raw /
  4.02x cost-weighted vs vanilla Three.js** (231K), 35 steps vs a 30-step
  gate, and the 2026-07-09 hands-on audit found the golden path breaks at
  the first mutation.
- No game has shipped publicly. PRD-012 is one hosting step and one
  recorded human playtest away from closing.

So the value levers are, in order: **authoring-loop economics, shipping
proof, golden-path robustness** — not more rendering depth.

Suggested compute split: ~10% lever 0, ~50% lever 1, ~20% lever 2,
~20% lever 3.

## Lever 0 (do first, ~1 session): land or revert the dirty lighting tree

The working tree carries uncommitted SSGI calibration with a
**known-failing unit test** (`rendering.rs::ssgi_ambient_tests` still
asserts multiplier 0.23; code says 0.19) and the lighting-showcase gate has
exactly two open diagnostics (ceiling 0.575 vs 0.75..1.35, right-room
1.526 vs 0.65..1.45). Everything needed is already derived — do not
re-analyze.

Exactly what to do (from
`docs/PRDs/done/lumen-lite-lighting-2026-07-09/HANDOFF-ceiling-right-room-parity-2026-07-11.md`):

1. Fix or revert the cosine-weighting ghost reflections in
   `ssgi_postprocess.wgsl` (cheapest: clamp gather radiance to 0.35 and/or
   per-pixel jitter of the 12 taps). Recapture; confirm no ghost windows.
2. Lower `native_ssgi_ambient_multiplier` 0.19 -> ~0.15 (right room -6%);
   fall back to trimming the SH-L0 probe baseline 4.45 if ambient
   overshoots mean/shadow bounds.
3. Raise SSGI gain base (`ssgi_postprocess.rs:35`, 0.4) in +0.1 steps for
   the ceiling, watching shaft delta; if screen-space cannot deliver, add
   the documented upward "floor bounce" directional fill as a reported
   approximation.
4. Sync the four literal-constant tests listed in the handoff; run
   `cargo test -p threenative_runtime`,
   `pnpm verify:focused verify:lighting-showcase`, then the broad gates;
   update the three docs files; commit.

If this drags past ~2 more iterations, take the fallback fill light, report
it as an approximation, ratchet, and stop. Do not open new rendering parity
work after this — the freeze policy is correct.

## Lever 1 (the big one, ~50% of compute): make the authoring loop cheap

This is the existential lever. If an agent cannot build a game through
ThreeNative at a sane multiple of vanilla cost, nothing else in the repo
matters. The diagnosis is already done; execute it.

Measured step-waste in the round-5 median run (35 steps): 6
artifact-forensics steps, 4 engine-source greps, 6 standalone verifies, and
**0 uses of `tn iterate`** — the intended verifier. Replay cost is ~41K
tokens/step, so killing ~16 churn steps is worth ~650K tokens/run on its
own.

Exactly what to do, in order:

1. **Golden-path CI gate (highest ROI, small):** add a test that executes
   every tool-emitted command verbatim and requires exit 0 — every
   `tn game plan` flag, every cookbook ID it references, every recipe it
   suggests. The 2026-07-09 audit found `tn game plan` emitting
   nonexistent flags (`--entity` vs `--vehicle`) and 4/6 dead cookbook
   IDs. This is a drift gate the repo rules already mandate in spirit.
2. **Auto-derive `resourceReads`/`resourceWrites` and resource schemas**
   from script source. This exact friction recurred in all four benchmark
   sessions. If full derivation is hard, emit a prescriptive diagnostic
   whose `fix` field contains the exact JSON to paste.
3. **Make `tn iterate` the verifier agents actually use:** fix the stdout
   JSON pollution from Bevy logs (JSON on stdout, logs on stderr — the
   clean-JSON gate exists, extend it to iterate with a native target), and
   make iterate scope to the relevant scenario by default instead of
   reporting unrelated generic player/HUD failures (observed again in the
   lumen-lite run: "expected failures" noise trains agents to ignore it).
4. **Close the runtime black box:** physics-knockdown-r2 burned 9 identical
   playtest failures with zero diagnostic progress because a declared
   projectile velocity never propagated to `context.state`. Root-cause it;
   whatever it is, the deliverable is a diagnostic that names the broken
   link, because "engine bug indistinguishable from author bug" is the
   most expensive failure class an agent can hit.
5. **Fix the starter native playtest SIGSEGV** (zero-info crash on the
   golden path) or at minimum make it emit a structured diagnostic.
6. **Then rerun the round-5 matrix** (lane-runner / checkpoint-race /
   physics-knockdown) and apply the agreed decision rule. Also fix the
   gate itself: comparing proof-carrying ThreeNative runs against
   proof-free vanilla one-shots on toy prompts is asymmetric; weight the
   gate by parity + proof quality, or move prompts beyond one-shot-able
   complexity. Do NOT invest in typed game-spec (measured worse: 1.63M
   tokens, more failed commands) or MCP transport (judged not the lever).

## Lever 2 (~20%): ship one genuinely good game (PRD-012)

`examples/metro-surfer-heist` already has release evidence. Remaining, per
`docs/PRDs/agent-native-authoring-loop-2026-07-07/PRD-012-ship-one-good-game.md`:

1. Publish the Pages-shaped build to real public hosting; run
   `tn verify --url` against the live URL and store the evidence.
2. Record a five-minute stranger playtest (someone who has never seen it);
   log every point of confusion.
3. Convert every friction hit into an issue against Lever 1 or an explicit
   non-goal.

This is cheap, it is the only externally legible proof of the whole stack,
and its friction log is the best test-case generator Lever 1 can get.

## Lever 3 (~20%): native golden-path robustness, narrowly scoped

Only the native bugs that sit on the authoring golden path or break "same
game, both adapters" claims — not general native depth:

1. Native scheduling divergence from web (flagged HIGH in the code-quality
   audit; System Code Quality PRD-002) plus a cross-runtime fixture.
2. Native spawn/despawn live reconciliation (HIGH parity gap — gameplay
   scripts that spawn entities silently diverge on native).
3. Known input/camera papercuts already root-caused in session notes:
   pointer-delta axes crushed by the +/-1.0 clamp in `input.rs` (mouse
   look effectively dead natively), and camera-rig scripts reading raw
   fixed-tick poses instead of interpolated ones (visible sawtooth).

Defer: Bevy upgrade (0.14 pin is guarded by a conformance boundary test),
Phase 3 cinematic-default look, Phase 4 scale work — all blocked behind the
levers above anyway per `docs/ROADMAP.md`.

## What NOT to spend compute on

- More hero-scene lighting parity beyond the open handoff (freeze policy).
- Typed game-spec as default authoring (measured worse; keep experimental).
- MCP transport changes (cost is replay x steps, not invocation syntax).
- New capability breadth (particles, shaders, networking) before Lever 1
  moves the benchmark.

## The one-sentence version

Close the lighting handoff to get a clean tree, then put the majority of
compute into making the agent authoring loop provably cheap (golden-path
CI, derived declarations, trustworthy `tn iterate`, diagnosable runtime),
ship metro-surfer-heist publicly, and fix only the native bugs that break
the golden path.
