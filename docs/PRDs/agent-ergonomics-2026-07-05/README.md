# Agent Ergonomics Bundle (2026-07-05)

This bundle operationalizes `CHALLENGES.md`. Thesis: ThreeNative's product bet
is agent-drivability, and that bet has never been measured. PRD-001 measures
it; PRD-002 through PRD-005 attack the measured frictions in order of expected
leverage.

Execution order is intentional:

0. [PRD-000 Convention Alignment](PRD-000-convention-alignment.md): adopt
   the convention-first design rule and rework the script-context idioms
   (`getAxis` over source-authored axis mapping, `transform.position`
   property access, engine-owned `fixedDelta`, proof-time rounding) BEFORE
   measuring, so the benchmark grades the API we intend to keep. Deliberate
   trade: we sacrifice the pre-fix baseline delta for a cleaner verdict.
1. [PRD-001 Agent Authoring Benchmark](PRD-001-agent-authoring-benchmark.md):
   measure tokens/iterations-to-playable for the same game prompts under
   vanilla Three.js vs the ThreeNative stack. This is the kill/continue
   metric; run it after PRD-000 lands and before investing in the remaining
   fixes.
2. [PRD-002 Authoring Cookbook](PRD-002-authoring-cookbook.md): pattern-sized
   few-shot worked examples ("goal -> exact source delta + script + proof
   command") validated by CI and loaded into agent context.
3. [PRD-003 Single-Command Iteration Loop](PRD-003-single-command-iteration-loop.md):
   `tn iterate` collapses mutate -> validate -> build -> screenshot ->
   playtest smoke into one JSON response.
4. [PRD-004 Prescriptive Diagnostics](PRD-004-prescriptive-diagnostics.md):
   top agent-hit diagnostics carry the fix, not just the violation.
5. [PRD-005 Meta-Layer Compression](PRD-005-meta-layer-compression.md):
   STATUS.md becomes a bounded index; the generated-games release gate keeps
   3-5 representative examples.

Decision gate: after PRD-001's pilot report, re-run the benchmark after
PRD-002/003/004 land. If ThreeNative cannot get within ~2x of vanilla
Three.js on tokens-to-playable, escalate to the kill/continue decision in
`CHALLENGES.md` instead of continuing this bundle.
