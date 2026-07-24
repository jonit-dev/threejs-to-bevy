# Battle of the Pacific — Code Abstraction Report

Date: 2026-07-23
Scope: `examples/battle-of-pacific/src/scripts/` (`flight.ts` 815 lines,
`enemy-zero.ts` 805 lines, `lib/movement.ts` dead 3-liner) plus the
`@threenative/script-stdlib` surface those scripts can legally import.
Goal: leaner code, preserved behavior, solidified aerodynamic behavior,
DRY / SRP / KISS.

## 1. Constraints that shape every recommendation

- The script bundler (`packages/compiler/src/scripts/bundle.ts`) emits only the
  exported behavior function body. Relative imports between script files are
  not supported; only whitelisted helper modules (`@threenative/script-stdlib`,
  kit packages) are injected. **Shared abstractions must live in script-stdlib
  or as data (content JSON / resource schemas), not in a local `lib/`.**
  `src/scripts/lib/movement.ts` is unused and unreachable by the bundler — it
  should be deleted.
- Adding stdlib helpers is cheaper than it used to be: the runtime bundle
  source is now generated (`pnpm generate` →
  `bundle-source.generated.ts`, with `check:generated` and a parity test), so a
  new helper is one typed module + regeneration, not two hand-synced copies.
- Behavior must stay deterministic and portable across the web and Bevy
  adapters. All proposed helpers are pure state-in/values-out functions —
  no timers, no `Math.random()`, no engine handles.
- The committed playtests (`probe-roll`, `probe-pitch-hold`,
  `probe-long-cruise`, `probe-guns`, `acceptance-*`) are the behavioral safety
  net for any refactor. Run them after each extraction step.

## 2. Current architecture in one paragraph

Two god functions on the `fixedUpdate` schedule own everything.
`updatePacificFlight` mixes: input, throttle/engine audio state machine,
aerodynamic inputs + hand-rolled coordinated-turn physics, gun/tracer pool,
muzzle/smoke VFX, destroyer hit resolution + sinking presentation, AA flak
gunnery + damage, player fail/explosion, cosmetic bank, camera shake,
propeller/animation selection, HUD resource + telemetry event. `updateEnemyZero`
mixes: a 10-plane roster table, provocation/squad gating, per-plane hit
resolution, midair collisions, target selection, phase state machine (CAP /
ESCORT / INTERCEPT / ATTACK / EXTEND / DEFENSIVE), guided kinematic steering,
AI gunnery, two tracer pools, explosion pool, escort-ship damage/sinking, and
the radar feed. Both scripts are well-commented and data-tables are used in
places (the `PLANES` / `SHIPS` rosters are genuinely good), but nearly all
math and lifecycle plumbing is hand-rolled inline — including math the stdlib
already exports.

## 3. Duplication inventory (evidence)

| # | Pattern | Occurrences | Existing stdlib coverage |
|---|---------|-------------|--------------------------|
| D1 | Quaternion rotate-vector, hand-rolled | `flight.ts:281-291` | `Quat.rotateVec3` — already exists |
| D2 | Direction → yaw/pitch quaternion (cy/sy/cp/sp block) | `flight.ts:330-343` (player tracers), `flight.ts:482-493` (AA shells) | `Quat.lookRotation` / `Quat.fromEuler` — already exist |
| D3 | Yaw extraction from quaternion | `enemy-zero.ts:240-243` | `Quat.yaw` — already exists |
| D4 | Angle wrap via `while (x > PI) x -= 2*PI` loops | `enemy-zero.ts:129-130`, `enemy-zero.ts:531-532` | `AngleEx.deltaAngle` — already exists |
| D5 | Deterministic hash noise `sin(seed*12.9898)*43758.5453` | `flight.ts:350-351`, `flight.ts:470-473` | `RandomEx` (feedback.ts) — already exists |
| D6 | Projectile pool spawn/advance/expire/park loop | 4 pools: player tracers `flight.ts:391-425`, AA shells `flight.ts:495-538`, zero + friendly shots `enemy-zero.ts:644-695` | none — proposed `ProjectileEx` |
| D7 | Lead-pursuit aim (clamped lead time, predicted point, normalize to muzzle speed) | player convergence `flight.ts:304-328`, AA `flight.ts:468-481`, AI gunnery `enemy-zero.ts:568-589`, AI steering lead `enemy-zero.ts:477-480` | none — proposed `GunneryEx.leadPoint` |
| D8 | Sin-envelope VFX (flash/puff/explosion grow-fade) | ~10 sites: muzzle `flight.ts:360-369`, smoke `flight.ts:370-390`, impact flash `flight.ts:430-441`, flak `flight.ts:542-567`, player explosion `flight.ts:730-745`, explosion pool `enemy-zero.ts:699-715`, plane burn `enemy-zero.ts:593-610`, ship burn both files | none — proposed `FxEx` |
| D9 | Park-entity idiom `position [0,-9999,0], scale [0.001,...]` | ~20 sites across both files | none — proposed `FxEx.park` |
| D10 | Player explosion vs pooled explosion: same fireball (life 0.65/0.7, `sin(min(1, age*1.15)*PI)` flare) implemented twice | `flight.ts:730-745` vs `enemy-zero.ts:699-715` | fold into `FxEx.fireball` |
| D11 | Sinking-destroyer presentation (sink/10, roll/7 → 0.52 rad, fire pulse, smoke cycle) implemented twice | `flight.ts:578-632` vs `enemy-zero.ts:717-754` | none — proposed `ShipFxEx` or one owner script |
| D12 | Destroyer hull AABB hit test with magic dims `74 / 2..36 / 8.5`, damage 10 | `flight.ts:404-408` vs `enemy-zero.ts:283-285` | none — shared constant + `HitTestEx` |
| D13 | Rising-edge hit dedup: enemy-zero uses `hitInside[]`; flight.ts instead consumes the tracer — two different resolutions of the same problem | `enemy-zero.ts:286-295` vs `flight.ts:409-422` | pick one policy, encode in `HitTestEx` |
| D14 | Restart/reset re-lists every state field by hand | `flight.ts:104-172` (~68 lines), `enemy-zero.ts:169-221` | factory-function pattern (enemy-zero already half does this with `initialPlaneState`) |
| D15 | Target-selection loop duplicated for IJN vs USN with only the side filter flipped | `enemy-zero.ts:413-447` | one `nearestOf(side)` closure |
| D16 | Cosmetic bank/pitch quaternion composition, with per-model yaw-180 fixups derived by hand | `flight.ts:634-642`, `enemy-zero.ts:612-627` | `Quat.fromEuler` + `Quat.multiply` + a per-model facing quat in the roster table |
| D17 | Camera shake via `sin(t*137)` ad hoc | `flight.ts:643-653` | `CameraMath.shakeOffset` — already exists |
| D18 | Entity-id formatting for pools: `tracer.${padStart(2,"0")}` vs `enemy.zero.tracer.${i}` (padded vs unpadded) | both files | one id scheme owned by the pool helper |

Cross-script coupling worth naming: `flight.ts` owns the player tracer pool
and the lead destroyer's health, while `enemy-zero.ts` re-reads the tracer
*entities'* transforms and re-implements hit detection against its own ships
and planes, sharing `PLAYER_TRACER_POOL = 14`, the `tracer.NN` naming, and the
hull dimensions only by copy. That is exactly the "second hand-maintained
list" CLAUDE.md forbids at the engine level — the same rule applies here.

## 4. Proposed abstractions

### Tier A — use what stdlib already has (no new code, immediate ~120-line cut)

1. Replace D1–D5 and D17 with `Quat.rotateVec3`, `Quat.lookRotation`,
   `Quat.yaw`, `AngleEx.deltaAngle`, `RandomEx`, `CameraMath.shakeOffset`.
   Also `TimerEx.cooldown` for the five hand-rolled
   `Math.max(0, x - dt)` cooldowns. Zero design risk; behavior-identical
   (verify `lookRotation`'s convention against the current cy/sy/cp/sp block
   once with a probe playtest, then reuse everywhere).
2. Delete `src/scripts/lib/movement.ts` (dead, unbundleable).

### Tier B — new script-stdlib modules (durable, cross-game, unit-testable)

These are the DRY/SRP core. Each is a pure `Ex` module in stdlib style
(frozen object, state-in/values-out), with unit tests in stdlib and the
generated bundle-source refreshed via `pnpm generate`.

**B1. `ProjectileEx` — pooled ballistic rounds (kills D6, D9, D13, D18).**
```ts
interface IProjectile { life: number; px: number; py: number; pz: number;
                        vx: number; vy: number; vz: number; targetId?: string }
ProjectileEx.pool(size): IProjectile[]
ProjectileEx.spawn(pool, cursor, init): { round, index, cursor }   // ring alloc
ProjectileEx.step(round, dt, { floorY }): "flying" | "expired"     // integrate + expire
ProjectileEx.parkPose(): { position }                              // the -9999 idiom
ProjectileEx.entityId(prefix, index, pad?): string                 // one id scheme
```
All four pools (player tracers, AA shells, zero shots, friendly shots) become
`spawn` + `step` + a per-pool hit callback. This is the single largest line
reduction (~150 lines across both files) and makes the expire/park rules
identical everywhere instead of four near-copies.

**B2. `GunneryEx` — lead-pursuit aiming (kills D7).**
```ts
GunneryEx.leadPoint(shooter, target, targetVel, { speed, minLead, maxLead, scatter?, seed? })
  → { aim: Vec3, velocity: Vec3, flightTime: number }
```
One function encodes "predict intercept, clamp lead time, add deterministic
dispersion, normalize to muzzle speed" for player guns, AA flak, and AI
gunnery. The three call sites currently agree on the algorithm but not on the
constants — after extraction the constants become visible, named parameters
(`AA_MUZZLE_SPEED = 280`, `TRACER_SPEED = 380`, `AI_SHOT_SPEED = 300`).

**B3. `FxEx` — envelope + pooled one-shot VFX (kills D8, D9, D10).**
```ts
FxEx.envelope(age01): number                     // sin(age*PI) grow-fade
FxEx.flash(life, duration): number               // the flashPhase/flashEnvelope pair
FxEx.fireball(state, dt): { position, scale } | "spent"   // the shared explosion
FxEx.park(entity): void                          // patch to [0,-9999,0] scale 0.001
FxEx.pulse(elapsed, rate, base?, amplitude?): number      // 0.82 + sin(...)*0.18
```
The dozen envelope computations become one vocabulary. `FxEx.fireball`
replaces both explosion implementations (D10) so player death and AI kills
literally share code instead of resembling each other.

**B4. `HitTestEx` — deterministic combat geometry (kills D12, D13).**
```ts
HitTestEx.insideBox(point, center, halfExtents): boolean
HitTestEx.insideSphereSq(point, center, radiusSq): boolean
HitTestEx.risingEdge(insideNow, wasInside): boolean       // the hitInside policy
```
Plus: hoist the shared collision data out of both scripts into named constants
in one place — `DESTROYER_HULL = { halfX: 74, minY: 2, maxY: 36, halfZ: 8.5 }`,
`PLANE_HIT_RADIUS_SQ = 56.25`, `SHOT_HIT_RADIUS_SQ = 42.25`,
`COLLISION_RADIUS_SQ = 121`, `FLAK_PROXIMITY_SQ = 484`. Since scripts cannot
import each other, the shared truth belongs either in stdlib (as a
`PacificCombat` const is too game-specific) or — better — in a content JSON
resource both behaviors read (see Tier D).

**B5. `GuidedFlightEx` — the aerodynamic core (see §5).**

### Tier C — structure inside each behavior (SRP without new modules)

The bundler keeps everything inside the exported function body, but nothing
stops that body from being a short orchestrator calling named local closures —
`enemy-zero.ts` already does this with `initialPlaneState`, `radarContact`,
`spawnExplosion`. Apply the same discipline to both files:

- `flight.ts` body becomes ~12 named steps:
  `readInputs`, `applyRestart`, `stepEngineAudio`, `applyFlightControls`,
  `fireGuns`, `stepPlayerTracers`, `stepAaBattery`, `stepFlak`,
  `stepDestroyerPresentation`, `stepPlayerDamage`, `applyCosmetics`,
  `publishTelemetry`. Each closure takes `(control, dt)` and the entities it
  needs. The engine-audio band machine (`flight.ts:93-224`, ~90 lines of
  spool-up + hysteresis) is the most self-contained candidate — extract it
  first; it has zero interaction with the rest of the tick.
- `enemy-zero.ts`: split the 335-line per-plane loop into
  `resolvePlayerHits`, `resolveCollisions`, `selectTarget` (one function,
  side-parameterized — kills D15), `stepPhase`, `steerPlane`, `fireGuns`,
  `applyDamagePresentation`, `applyCosmeticAttitude`.
- Restart handling (D14): both scripts should build reset state from the same
  factory used at init (`context.state(key, initialX())` and
  `Object.assign(control, initialX())` on restart) instead of re-listing
  fields. The `flight.ts` restart block currently resets 24 fields by hand and
  has already drifted once (it resets `aaFireCooldown` to 0.8 but not
  `fireCooldown`, `muzzleFlash`, `gunRecoil`, `nextTracer`…). A factory makes
  "field added but not reset" impossible.

### Tier D — data ownership (kills the cross-script copies)

- Move shared combat constants (hull box, pool sizes, damage values, tracer
  entity-id prefixes) into one durable source both scripts read — a
  `content/**` JSON (e.g. `content/combat/pacific-combat.json` exposed as a
  read-only resource with a schema entry) or, minimally, identical constants
  derived from a single stdlib export. Today `PLAYER_TRACER_POOL = 14` and the
  destroyer hull box exist in both files and will drift.
- Extend the roster-table pattern that already works: add per-model facing
  (`facing: "+z" | "-z"` or a facing quat) to `PLANES` so the cosmetic
  attitude composition (D16) is table-driven instead of a hand-derived
  special case per side; add per-side gunnery constants (cooldown, damage,
  shot speed) to the same rows instead of inline ternaries
  (`plane.side === "ijn" ? 0.8 : 0.7`, pool damage 4 vs 10).
- The effect-entity id lists (`destroyer.fire.0` … `destroyer.aa-flash.1` in
  `flight.ts:133-148`) duplicate knowledge of the authored scene. Derive them
  from one manifest constant next to the roster tables.

## 5. Solidifying aerodynamic behavior

Three distinct flight models coexist today, and only one of them is named:

1. **Player**: real aero (`physics.aerodynamics.setInputs`) *plus* hand-rolled
   coordinated-turn assistance — damping torque with magic gains
   (`30000/25000/55000`, turn authority `14000`, `flight.ts:257-262`) and a
   manual velocity-vector rotation by yaw rate (`flight.ts:263-274`).
2. **AI with airframes** (`hasAero: true` Zeros): fully guided kinematics
   (script sets linear + angular velocity every tick) *while also* feeding the
   aero integrator inputs (`enemy-zero.ts:552-557`). Per the engine's known
   kinematic double-integration behavior, a body that gets both scripted
   velocity and aero forces each tick is two systems fighting; today the
   scripted write wins by ordering. That is load-bearing and undocumented.
3. **AI without airframes** (SBDs): pure guided kinematics.

Recommendations:

- **S1 — name the models.** One comment block (or better, a `flightModel:
  "player-aero" | "guided"` column in the roster) that states the contract:
  guided planes' velocity is script-owned every fixed tick; aero inputs on
  guided planes exist only to keep control surfaces/props animating. If the
  animation side-effect is not actually needed, drop the
  `aerodynamics.setInputs` call on guided planes entirely — it is the KISS
  win and removes the double-integration hazard.
- **S2 — extract `GuidedFlightEx` into stdlib.** The steering core
  (`enemy-zero.ts:527-563`) is a beautiful, self-contained algorithm: bounded
  yaw rate toward a target, turn-rotated horizontal velocity, rate-limited
  climb and speed, cosmetic bank/pitch targets. As a pure function:
  ```ts
  GuidedFlightEx.step({ position, velocity, target, dt,
    limits: { yawRate, yawGain, climbRange, climbGain, accel, decel, speed } })
    → { velocity, yawRate, bankTarget, pitchTarget }
  ```
  This is the highest-value abstraction in the report: it makes flight feel
  *unit-testable* (deterministic numeric tests lock turn radius, climb rate,
  and speed convergence — that is what "solidify" means here), it is reusable
  by any future aircraft/boat/missile game, and it shrinks the per-plane loop
  substantially.
- **S3 — extract the player's coordinated-turn assist** as
  `CoordinatedTurnEx.step({ angularVelocity, velocity, turnInput, dt, gains })
  → { torque, velocity }` — same pure shape, same testability. The magic gains
  become named, documented parameters (`yawAuthority`, `pitchDamping`,
  `rollDamping`, `yawDamping`). A unit test asserting "constant turn input →
  constant-radius turn with no sideslip speed loss" pins the exact property
  the current comment promises.
- **S4 — pin behavior with probes before refactoring.** `probe-roll`,
  `probe-pitch-hold`, and `probe-long-cruise` already exist; add one probe for
  turn radius at fixed input (assert position after N frames) so S2/S3
  extraction is provably behavior-neutral, then rerun with
  `--target desktop` per the release rules.
- **S5 — stall/failure envelope constants** (`speed < 36` stall,
  `altitude < 5` crash, `< 22 && speed < 24` mush-in, `flight.ts:700-703`)
  should be named (`STALL_SPEED`, `CRASH_ALTITUDE`, …) next to the aero
  tuning, since they *are* the flight envelope.

## 6. What not to abstract

- The phase state machine strings (CAP/ESCORT/…) — a generic FSM helper would
  be more code than the current `if/else` chain and hide the tactics. KISS.
- The HUD/telemetry projection at the end of `flight.ts` — it is already a
  single flat block with one job; extracting it to stdlib would couple stdlib
  to this game's HUD schema.
- The provocation/squad-B gating — small, readable, game-specific.
- Don't merge the two behaviors into one script; the flight/AI split is a
  correct SRP boundary. The fix for their coupling is shared *data* (Tier D)
  and a single combat-resolution owner per target (player tracers vs lead
  destroyer stays in `flight.ts`; vs escorts/planes stays in `enemy-zero.ts` —
  but both through `HitTestEx` with one shared hull constant).

## 7. Suggested sequence

| Step | Change | Risk | Est. reduction |
|------|--------|------|----------------|
| 1 | Tier A swaps + delete dead `lib/movement.ts` | trivial | ~120 lines |
| 2 | State factories for restart (D14) | low | ~60 lines, kills a live drift bug class |
| 3 | `FxEx` + `ProjectileEx` in stdlib, migrate pools/VFX | medium | ~250 lines |
| 4 | `GunneryEx`, `HitTestEx` + shared combat constants | medium | ~80 lines |
| 5 | `GuidedFlightEx` + `CoordinatedTurnEx` with probe pins (S2–S4) | medium | ~70 lines + testable flight feel |
| 6 | Tier C restructure of both bodies into named steps | low (mechanical) | readability, not lines |

Each step: `pnpm generate` (stdlib), `pnpm typecheck`, stdlib unit tests,
`tn iterate --project examples/battle-of-pacific --json`, then the probe and
acceptance playtests. Net expectation: the two scripts drop from ~1,620 to
roughly 1,000 lines while stdlib gains ~5 small, tested, reusable modules,
and the flight model becomes the first part of the game with numeric
regression tests.
