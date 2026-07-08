# PRD Staleness Report — 2026-07-07

## Resolution Status

Resolved in the current worktree:

- PRD-017 and PRD-018 moved to
  `docs/PRDs/done/agent-native-authoring-loop-2026-07-07/`.
- Agent-native README and top-level PRD index links/statuses updated.
- PRD-017 closed as experimental, opt-in, not default.
- PRD-018 closed without starting vanilla-lift.
- PRD-012 re-grounded around `examples/metro-surfer-heist` as the release
  candidate, with public hosting and five-minute human playtest still active.
- Proof-first native PRDs marked freeze-gated or web-first where applicable.
- Round-5B / next-steps notes marked superseded by guided collector evidence.

Verification: `pnpm check:docs` passes.

Context for whoever updates the PRDs: the round-5 guided collector benchmark
(2026-07-08 artifacts), the native parity freeze (2026-07-07), and the landing
of agent-native-authoring-loop PRDs 002-011, 013-016, and 019 all postdate most
of the open PRD text. This report lists (1) where the token-cost work stands,
(2) the recommended next PRD order, and (3) per-file staleness flags. Nothing
was edited; flags only.

## 1. Where the token-cost work stands

- Fresh equal-proof guided collector round:
  `tools/verify/artifacts/agent-benchmark/round-5-collector-guided-2026-07-08/benchmark-report.json`.
  Direct ThreeNative median 20,950 tokens vs vanilla 46,192 (0.454x raw,
  0.443x cost-weighted, `withinHalfX: true`), 3 repeats per condition, 9/9
  slots proof-passing, status/matrix/audit green.
- The aggregate verdict is still `fail`, solely on the failed-command budget:
  median 1 failed command per run in BOTH conditions, gate requires 0. It is
  symmetric (does not flatter ThreeNative), but "the benchmark passed" is not
  yet a true claim. Fix the one recurring failed command or relax the gate
  with a documented rationale.
- Scope of the claim: this proves the GUIDED scaffold-first path
  (`tn game plan --apply` + `xvfb-run -a tn iterate`, stop on passing
  iterate). The unguided round failed at 1.80x. Unguided workflow
  discoverability is a separate, still-open problem.
- Evidence-quality caveat: candidate dirs contain only operator-filled
  `session.json` files (no raw transcripts, unlike `off-recipe-2026-07-07/`),
  and the report's churn/behavior diagnostics are null because of it.
- Typed-spec condition: median 20,000 tokens = 0.95x of direct ThreeNative,
  verdict `experimental`, also fails the failed-command budget. A ~5% saving
  does not currently justify the new authoring surface.

## 2. Recommended next order

1. **Close PRD-018 (vanilla-lift)** — its gate condition ("start only if TN
   stays above threshold at equal proof") is now evaluated in the negative;
   `VANILLA-LIFT-DECISION-2026-07-07.md` already records "do not start."
   Docs-only closure.
2. **Record the PRD-017 typed-spec verdict** — the benchmark trial ran;
   result is "experimental, ~0.95x, not default." Park the PRD rather than
   invest further.
3. **Fix the stale agent-native README** (see flags below).
4. **PRD-012 Ship One Genuinely Good Game** — the capstone; its declared
   prerequisites (scaffolds, mechanic blocks, cookbook, visual defaults,
   native-path decision) have all landed. It is also the only path to the
   "shipped-game need" evidence that the native parity freeze requires before
   any proof-first native work unfreezes. Note: `examples/metro-surfer-heist`
   already exists and is enrolled in `verify:generated-games` as release
   evidence, so scope PRD-012 against what that example already proves (the
   stranger-playable / publish bar appears to be the remaining gap).
5. Proof-first bundle work only after/through PRD-012 — most of its native
   PRDs are frozen pending shipped-game evidence (see flags).

Small non-PRD hygiene items: the round-5 failed-command gate decision (above)
and the stale README links.

## 3. Staleness flags — agent-native-authoring-loop-2026-07-07

### README.md

- Lines 18-23: PRDs 007-011 are listed as open with local links, but the
  files were moved to `docs/PRDs/done/agent-native-authoring-loop-2026-07-07/`.
  The links are broken and the statuses are wrong.
- Lines 54-58: describes the "cross-prompt confirmation rerun that feeds the
  PRD-017 Phase 5 and PRD-018 Phase 1 decisions" as future work; the guided
  round-5 collector evidence (2026-07-08) now exists and both decisions have
  their inputs.

### PRD-017-typed-typescript-game-spec.md

- Line 303: acceptance criterion "Benchmark trial decides whether typed spec
  becomes default" is unchecked, but the trial has run: typed-spec median
  20,000 vs direct TN 20,950 (0.95x), verdict `experimental`, failed-command
  budget missed. The box can be checked with a "remains experimental, not
  default" outcome.

### PRD-018-vanilla-lift-pipeline-decision.md

- Line 34 (and README lines 48-58): still frames the decision gate as
  pending equal-proof round-5 evidence. The decision was made and recorded in
  `VANILLA-LIFT-DECISION-2026-07-07.md` (with a round-5 addendum): do not
  start the vanilla-lift prototype. The PRD text does not reference the
  decision doc or acknowledge the gate is resolved.
- Lines 125-128: Phase 1 trigger "start the prototype only if TN stays above
  ~1.5x at equal proof" — round-5 shows 0.454x, so the trigger definitively
  did not fire. The PRD should be closed and moved to `done/` (or archived)
  per the repo's finished-PRD rule.

### PRD-012-ship-one-good-game.md

- "Current Behavior" (problem framing) says no shipped game exists that tests
  the loop. `examples/metro-surfer-heist` now exists with release evidence in
  `verify:generated-games`, so the PRD's baseline and scope need re-grounding:
  what remains is the stranger-playable quality bar, publish path, and
  friction-log loop, not "create a first game from zero."

## 4. Staleness flags — proof-first-engine-loop-2026-07-05

Systemic issue: the bundle predates the 2026-07-07 native parity freeze
(`docs/STATUS.md`, `docs/runtime/native-path.md`). Several PRDs treat native
Bevy work as actionable when it is frozen pending shipped-game evidence, and
reference `--target desktop` / `pnpm verify:parity:native` surfaces that exist
only for the P0 closure slice or not at all.

### PRD-001 Agent Proof Loop Scenario Ratchet

- Lines 105-107: "Native targets run proof-harness-backed keyboard movement
  scenarios once the native parity PRD slice lands" — native parity work is
  frozen; the premise no longer holds.
- Line 214: "note web-only target until native PRD lands" — PRD-002 is frozen
  and webview packaging is the desktop fallback, not native Bevy parity.

### PRD-002 Native Parity Closure And Proof Loop

- Effectively superseded/frozen in its entirety. It proposes `--target
  desktop` proof harness, native input injection, and multi-runtime CI parity
  gates as actionable work; the freeze policy allows none of that without a
  documented shipped-game need. Acceptance criteria (line 260: `tn
  playtest|screenshot|record --target desktop`, `tn game qa --run-proof
  --targets web,desktop`) contradict the freeze. Current reality: the native
  proof harness exists for P0 closure (structured-source-starter) only.

### PRD-003 Contract De-Sprawl

- Line 31: "over 5k lines" in `operations.ts` — size claim predates the
  agent-native landings; re-measure before using it as motivation.

### PRD-008 Actor Archetypes And Typed Scripting

- Lines 80-96: the archetype slice partially landed via agent-native PRD-002,
  but as L1-only archetype scaffolds (perspective/control/physics/proof), not
  the re-appliable parameterized actor system (`tn actor add character`,
  `tn actor update hero --set walkSpeed=4`) this PRD designs. `defineBehavior`
  (Phase 2) has not landed. Needs re-scoping against what exists.
- Lines 116-137: hand-maintained resource access lists are cited as the pain
  point, but derived resource declarations (agent-native PRD-013) already
  landed and reduced that friction. Also overlaps PRD-017 typed game-spec
  work, whose verdict is "experimental" — coordinate before building a second
  typed-scripting surface.

### PRD-018 Native Render Parity And Performance

- Effectively frozen in its entirety: 8 phases of native render fixes
  (shadows, lighting, emissive, tangents, color space, bloom, frame pacing,
  physics sync) directly contradict the freeze policy. Unfreezes only with a
  shipped-game need — i.e., downstream of agent-native PRD-012.

### PRD-019 / PRD-020 / PRD-021 Humanoid Course Proofs

- Substance is still valid (stairs/ramps/pushed-ball gameplay proofs), but
  sections 3-4 assume web AND native playtest evidence (e.g., PRD-020 lines
  142-144: `--target desktop`); the native half is deferred under the freeze
  unless a shipped-game need is documented. Scope to web evidence for now.

### Bundle README

- Lines 10-16 ("2026-07-07 Refresh") are accurate and can stay; the ordered
  list itself is fine, but a note that PRD-002/PRD-018 (and the native halves
  of 019-021) are freeze-gated would prevent an agent from picking them up.

### Cross-cutting verification commands

- Multiple PRDs in this bundle cite `pnpm verify:parity:native` ratchet gates
  and general `--target desktop` flows that either do not exist or exist only
  for the P0 closure slice; each PRD's Verification section needs a pass when
  it is next touched.
