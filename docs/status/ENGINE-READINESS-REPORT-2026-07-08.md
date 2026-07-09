# Engine Readiness Report — Small/Mid-Sized Games

Date: 2026-07-08. Sources: `docs/STATUS.md`, `docs/status/capabilities/*.md`,
`docs/status/ROADMAP.md`, `docs/status/SYSTEMS_CODE_QUALITY_STATUS.md`, active
PRD bundles, and benchmark evidence under
`tools/verify/artifacts/agent-benchmark/`.

## Verdict

**Small games (web-first): yes — ready today, with one honest caveat.**
The engine can produce a small polished vertical slice end-to-end, proven by
`examples/metro-surfer-heist` (playable 3-lane runner with collect/fail/retry
loop, release-ready locally). The caveat: readiness is strongest *on the
scaffold rails*. Off-recipe authoring works but costs 2–6x the tokens of the
scaffold-first path and still fails its own benchmark gate.

**Mid-sized games: not yet — the pieces exist but are unproven at that scale.**
Nothing has exercised multi-scene flow, content volume, or sustained
production beyond a single vertical slice. GameFlow/Sequence contracts (the
mid-size enablers) are still an active PRD, contract sprawl makes the
authoring surface expensive to hold in context, and four adapter-surface
areas are red in the code-quality status, making refactors risky until drift
gates land.

**Native (Bevy) targets: deliberately frozen.** Treat the engine as web-first
with webview desktop packaging as the sanctioned native path. This is a
recorded decision (`docs/runtime/native-path.md`), not an accident.

## What is ready (evidence-backed)

- **Full authoring-to-proof loop.** `tn game plan` → archetype scaffolds
  (5 L1 archetypes) → mechanic blocks (6 L2 `tn add` blocks) → actor
  archetypes (character/vehicle/pickup/camera-boom/prop) → `tn iterate` /
  `tn playtest` proof → QA/score/release gates. All Active in
  `docs/status/capabilities/game-production.md`.
- **Scaffold-first token cost passes hard gates.** Collector 0.124x and
  lane-runner 0.083x vs vanilla raw tokens
  (`scaffold-first-token-rerun-2026-07-07b`); guided Round-5 collector 0.454x
  under equal-proof assertions (`round-5-collector-guided-2026-07-08`).
- **Core runtime capabilities are Active with gates:** portable scripting
  (typed contexts, `defineBehavior`, audio, particles, delayed commands),
  physics + character control with contact observations, retained UI with
  behavioral conformance, GLB/generated assets, deterministic biome world
  generation with terrain proof, efficient-scale budgets
  (`dense-world-benchmark`), shader material authoring (just landed,
  commit `8c9a854f`).
- **PRD throughput is real:** agent-native authoring loop bundle is 19/19
  done (PRD-012 capstone pending only human playtest + hosting);
  proof-first engine loop is 13/21 done.
- **`pnpm check:docs` passes** as of this report.

## What blocks "mid-sized"

1. **Off-recipe authoring cost (the core product risk).** Latest off-recipe
   evidence: checkpoint-race 3.614x, physics-knockdown 2.008x vs a 2.0x gate
   (`off-recipe-2026-07-07`). Round-5 diagnosis: ~16 of 35 median steps are
   churn (artifact forensics, engine-source greps, standalone verifies, zero
   `tn iterate` use), and recurring friction in resource read/write schema
   declarations. A mid-sized game is mostly off-recipe by definition.
2. **Unproven mid-size systems.** GameFlow/Sequence (declarative gameplay
   flow, PRD-8) and contract de-sprawl (PRD-4) are active, not done. No
   example exercises menus → gameplay → win/lose → progression across scenes.
3. **Adapter-surface debt (4 red rows).** Authoring operations, CLI command
   surface, and editor source operations lack drift gates
   (`SYSTEMS_CODE_QUALITY_STATUS.md`, 7.2/10). Remediation PRDs 002–005 are
   planned but not started; until PRD-002 lands, surface refactors risk
silent divergence across CLI/MCP/editor.
4. **Visual ceiling in flight.** Cinematic default look (PRD-5) and photoreal
   rendering/post (PRD-15) are active; the default output still reads
   "stylized demo" per the roadmap's own assessment.
5. **Known runtime rough edges** (from engine-quirks log): `update`-schedule
   scripts read raw fixed-tick poses instead of interpolated ones
   (camera-vs-character sawtooth); native input axis clamp crushes pointer
   deltas; one unresolved runtime black box (projectile velocity not
   propagating to `context.state` in physics-knockdown, 9 identical playtest
   failures with zero diagnostic progress — engine bug or diagnostic gap).

## Recommended next steps (in order)

1. **Close PRD-012: ship metro-surfer-heist publicly.** Record the human
   playtest, deploy via the existing GitHub Pages workflow, and harvest the
   friction log. This is the cheapest remaining step to a defensible "small
   games: shipped" claim and seeds the next planning round.
2. **Land adapter-surface PRD-002 (drift gates) next, before any further
   CLI/editor surface work.** It unblocks PRDs 003–005 and de-risks the four
   red rows. It is also the prerequisite the code-quality doc names for
   clean refactoring.
3. **Attack the off-recipe token sinks directly:**
   - Auto-derive `resourceReads`/`resourceWrites` + schema entries (named in
     all 4 benchmark sessions).
   - Root-cause the physics-knockdown velocity black box — a silent runtime
     failure with no diagnostic is the worst possible agent experience.
   - Kill the measured churn step classes (per Round-5 agreement), then rerun
     the matrix on lane-runner/checkpoint-race/physics-knockdown.
4. **Finish the mid-size enabler PRDs:** gameplay flow (PRD-8), contract
   de-sprawl (PRD-4), cinematic look (PRD-5/15). These, not new surface
   area, are what separate "vertical slice" from "mid-sized game".
5. **Then run the forcing function: build one genuinely mid-sized game**
   (a step above metro-surfer-heist — menus, sound, difficulty curve,
   multi-scene flow) agent-first, logging every friction as an issue. Keep
   the native parity freeze until this game documents a shipped need.

## What NOT to do now

- No new Bevy parity surfaces (freeze is correct; webview packaging covers
  desktop distribution).
- No new whole-game recipes (re-rigs the benchmark; factor L1/L2 instead).
- No typed game-spec promotion to default (Round-5 showed it performs worse
  than direct authoring: 1.12x tokens, more failed commands).
