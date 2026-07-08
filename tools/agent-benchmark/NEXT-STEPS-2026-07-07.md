# Next Steps After Typed-Spec Collector r3 - 2026-07-07

Status note written after `collector-typed-spec-r3` completed and was
committed (`c7efecea`). No code was changed for this note.

## Where we actually are

| Metric | Gate (round 5) | typed-spec r1 | typed-spec r3 |
|---|---|---|---|
| Raw tokens | <= 1.5x vanilla (~1.19M vs 792K historical vanilla median) | 4,443,576 (~5.6x) | 3,180,293 (~4.0x) |
| Tool steps | <= 30 median | 65 | 56 |
| Failed commands | 0 median | 9 | 9 |
| Equal-proof | all assertions | pass | FAIL (pickup-objective, win-state) |

Aggregate verdict: `insufficient-data` — one proof-passing typed-spec repeat
out of the three required, and **zero** direct ThreeNative and **zero**
vanilla equal-proof repeats in the trial directory. The matrix that every
open decision depends on (PRD-017 default surface, PRD-018 vanilla-lift
trigger) is mostly empty. See `VANILLA-LIFT-DECISION-2026-07-07.md`.

## Is this unsolvable?

Not proven unsolvable, but the evidence says two different things at once:

1. **The old 0.5x-style parity goal on toy prompts is very likely
   unreachable** and the docs already concluded this. Vanilla one-shots a
   ~350-line Three.js game from parametric knowledge in ~8 steps / ~620-790K
   tokens with no proof obligations. `TOKEN-COST-DIRECTION.md` shows cost is
   conversation replay per step (~25-40K/step), so parity requires finishing
   in ~10-12 steps. That is why round 5 moved the gate to 1.5x *equal-proof*.
2. **The round-5 1.5x gate is plausibly reachable but typed-spec has not
   moved the causal variable.** r1 -> r3 improved tokens ~28% but steps only
   went 65 -> 56 (gate: 30) and failed commands stayed at exactly 9 in both
   runs. Identical failed-command counts across independent runs means the
   friction is *deterministic tooling friction*, not agent variance — which
   is bad news for the current state and good news for fixability. The
   engineered failure classes are enumerated in PRD-017's progress log:
   - generated package scripts call bare `tn` (missing `node_modules/.bin`),
   - stale legacy `content/systems/*.json` referencing renamed script
     functions after typed-spec compile,
   - `writes` field accepts entity IDs the compiler then rejects,
   - typed spec without an explicit camera builds but fails runtime
     readiness,
   - runtime component patches (`MeshRenderer.visible`) require write
     declarations the agent has to discover by failing.

So the honest answer: the *benchmark goal as currently gated* is not yet
shown to be unreachable, because no run has yet been executed with the known
friction fixed. Declaring it unsolvable now would be premature; declaring it
solved-by-typed-spec is equally unsupported.

## Weren't we supposed to replace JSON with TS?

Partially — and by explicit design, not by omission:

- **PRD-017 made typed-spec opt-in, not the default.** `tn create
  --authoring typed-spec` scaffolds `src/game.spec.ts`; the default starter
  still authors `content/**/*.json` directly. Phase 5 ("typed source earns
  default status or stays experimental") is the only unchecked phase, and it
  is gated on exactly the benchmark evidence that is still
  `insufficient-data`. Flipping the default without that evidence would
  violate the PRD's own decision rule.
- **JSON never disappears even under typed-spec.** The spec compiles *into*
  canonical `content/**/*.json`; JSON remains the generated contract
  artifact consumed by the IR/bundle pipeline. "Replace JSON" means "stop
  hand-authoring JSON", not "no JSON on disk".
- **`examples/humanoid-physics-course` predates typed-spec** and was never
  migrated — correctly so, since PRD-017 says starters/examples migrate only
  after the trial proves lower failure cost. It has no `src/game.spec.ts`
  and authors `content/` JSON directly. It is a migration *candidate*, not
  a defect.

## Next steps, in priority order

### 1. Root-cause the r3 proof failure before any more repeats

r3's player traversed all five pickup locations while `GameState.scoreText`
stayed `Score 0 / 5`. This is the second occurrence of the "declared
behavior never reaches `context.state`" class (first: physics-knockdown-r2
projectile velocity, 9 identical playtest failures with zero diagnostic
progress). Determine whether this is an engine bug (pickup/overlap events
not firing or state writes dropped) or an authoring bug the diagnostics
failed to surface. Either way the deliverable is a diagnostic: a playtest
that moves through a pickup and sees no state change should say *why*, not
report generic assertion failure. Running more repeats before this is
understood just produces more failed-proof runs.

### 2. Fix the five deterministic frictions from the pilot log

Each is already enumerated in PRD-017's progress log (bare `tn` script,
stale legacy systems JSON after typed-spec compile, `writes` field
entity-ID confusion, missing default camera, undeclared runtime-patch
writes). Target: failed-command count 9 -> 0 by construction, verified by a
CLI-level acceptance test per `TOKEN-COST-DIRECTION.md` instruction 1
(scaffold + apply + build + playtest passes with zero manual edits). Do not
rerun the trial until this test exists and passes — the benchmark should be
confirmation, not discovery.

### 3. Fill the empty comparison matrix

The trial cannot produce any verdict other than `insufficient-data` without:

- 3 proof-passing **typed-spec** collector repeats (have 1),
- 3 proof-passing **direct ThreeNative** repeats on the same prompt (have 0),
- comparable **vanilla** runs under the round-5 equal-proof bar (have 0 —
  historical vanilla numbers predate the equal-proof assertions and are not
  admissible for the round-5 ratio).

Run direct-TN and vanilla arms in the same trial directory per
`ROUND-5-PROTOCOL.md`. Note the risk: equal-proof vanilla may cost more
than historical vanilla (it must now prove mechanics), which could shrink
the ratio without TN improving.

### 4. Apply the pre-existing step-count levers to the typed-spec path

`TOKEN-COST-DIRECTION.md` remains the correct playbook and was written for
the JSON path; port it: scaffold playable with zero edits under
`--authoring typed-spec`, single-step verification (`tn iterate` subsumes
validate/build/playtest, <=2KB summary), API card answers HUD-binding and
write-declaration questions so agents never grep engine sources. Steps are
the causal variable; 56 steps cannot reach a 30-step gate through error-fix
work alone.

### 5. Pre-commit to the decision rule for round 5

To prevent moving the goalposts again, record now:

- If typed-spec (post-friction-fix) meets the typed-spec trial threshold
  (>= 3 proof-passing repeats, median tokens <= direct TN, failed-command
  median 0, retry chains within budget): flip the starter default to
  typed-spec (PRD-017 Phase 5 closes) and schedule
  `humanoid-physics-course` migration as the first real-world validation.
- If direct TN and typed-spec both miss the equal-proof token gate after
  friction is demonstrably dead (failed-command median 0): the PRD-018
  vanilla-lift trigger is met — start the lift subset/prototype.
- If proof failures persist for engine-side reasons (step 1 unresolved):
  neither authoring-surface decision is valid; the blocker is runtime
  diagnosability, and that becomes the next PRD instead.

### 6. Explicitly out of scope for now

- Migrating `humanoid-physics-course` to typed-spec (blocked on step 5).
- Further tool-output compaction (already two orders of magnitude below the
  cost driver).
- Changing the round-5 thresholds again before a friction-free run exists.
