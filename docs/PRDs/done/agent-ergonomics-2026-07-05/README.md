# Agent Ergonomics Bundle (2026-07-05)

This bundle operationalizes `CHALLENGES.md`. Thesis: ThreeNative's product bet
is agent-drivability, and that bet has never been measured. PRD-001 measures
it; PRD-002 through PRD-005 attack the measured frictions in order of expected
leverage.

Execution order is intentional:

0. [PRD-000 Convention Alignment](PRD-000-convention-alignment.md)
   (done): adopt
   the convention-first design rule and rework the script-context idioms
   (`getAxis` over source-authored axis mapping, `transform.position`
   property access, engine-owned `fixedDelta`, proof-time rounding) BEFORE
   measuring, so the benchmark grades the API we intend to keep. Deliberate
   trade: we sacrifice the pre-fix baseline delta for a cleaner verdict.
1. [PRD-001 Agent Authoring Benchmark](PRD-001-agent-authoring-benchmark.md)
   (done):
   measure tokens/iterations-to-playable for the same game prompts under
   vanilla Three.js vs the ThreeNative stack. This is the kill/continue
   metric; run it after PRD-000 lands and before investing in the remaining
   fixes. Implementation status: scorer, schemas, prompts, neutral smoke
   evidence, and the 8-session pilot are complete. Pilot evidence lives in
   `tools/verify/artifacts/agent-benchmark/pilot-2026-07/`; the aggregate
   verdict is fail against the 2x threshold: collector ThreeNative median
   1,984,022 tokens vs vanilla 791,745, and lane-runner ThreeNative median
   4,013,006 tokens vs vanilla 1,020,845.
2. [PRD-002 Authoring Cookbook](PRD-002-authoring-cookbook.md)
   (done): pattern-sized
   few-shot worked examples ("goal -> exact source delta + script + proof
   command") validated by CI and loaded into agent context. Implementation
   status: 18 cookbook entries are present under `docs/cookbook/`, exposed by
   `tn cookbook list/show --json`, wired into generated starter `AGENTS.md`,
   and covered by `pnpm verify:cookbook`.
3. [PRD-003 Single-Command Iteration Loop](PRD-003-single-command-iteration-loop.md)
   (done):
   `tn iterate` collapses mutate -> validate -> build -> screenshot ->
   playtest smoke into one JSON response. Implementation status:
   `tn iterate --project <path> --json` writes a schema-valid report under
   `artifacts/iterate/latest/`, copies the full artifact directory with
   `--keep`, documents iterate as the starter inner loop, and is covered by
   CLI tests plus `pnpm verify:template-production`.
4. [PRD-004 Prescriptive Diagnostics](PRD-004-prescriptive-diagnostics.md)
   (done):
   top agent-hit diagnostics carry the fix, not just the violation.
   Implementation status: shared authoring/compiler/IR diagnostics accept
   optional structured `fix` payloads; the committed top-15 registry includes
   evidence and snippet validation; compiler, IR, playtest scenario, CLI text,
   and MCP parity tests cover passthrough; web and desktop humanoid movement
   playtests passed after the change.
5. [PRD-005 Meta-Layer Compression](PRD-005-meta-layer-compression.md)
   (done):
   STATUS.md is a 67-line enforced index over capability docs; prior STATUS
   prose is preserved under `docs/status/capabilities/full-status-archive.md`;
   `check:docs` enforces the line budget, capability links, and orphan checks;
   the current generated-game gate audits the two production-plan examples
   present in this repo, and `verify:example-build-sweep` covers the remaining
   build-only example.

Decision gate: PRD-001's pilot report shows ThreeNative is not yet within
~2x of vanilla Three.js on tokens-to-playable for either comparable prompt.
PRD-002/003/004/005 have landed, so the next benchmark should be treated as
the post-fix re-run; if it does not close the gap meaningfully, escalate to
the kill/continue decision in `CHALLENGES.md` instead of continuing to add
engine breadth.

2026-07-07 token-cost update: version 2 re-aggregation evidence lives in
`tools/verify/artifacts/agent-benchmark/token-cost-version-2-2026-07-07/`. It mines
cached/uncached input, output tokens, tool-output bytes, failed commands, and
cost-weighted tokens from the tracked pilot transcripts. This is not a fresh
post-fix rerun; it fails the new <=0.5x raw-token target on both comparable
prompts and activates scaffold-first work before more engine breadth.
