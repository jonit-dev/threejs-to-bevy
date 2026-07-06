# Scripting API Abstraction Recommendations

Audit date: 2026-07-06. Surveyed every gameplay script in `examples/` and
`templates/` (`metro-surfer-heist/src/scripts/player.ts`,
`humanoid-physics-course/src/scripts/player.ts`,
`racing-kit-rally-starter/src/scripts/racing.ts`,
`structured-source-starter/src/scripts/player.ts`), the script context
contracts (`packages/sdk/src/ecs/system.ts`,
`packages/runtime-web-three/src/systems/contextTypes.ts`), the stdlib
(`packages/script-stdlib/src/*`), and
`docs/contracts/script-context-conventions.md`.

Goal: cut boilerplate, promote DRY/SRP/KISS, and align names with Unity
conventions where behavior genuinely matches (per design rule 1 of the
conventions contract), so AI agents can lean on existing training data when
authoring scripts through the CLI.

## Summary Of Findings

Every example script re-implements the same six kinds of scaffolding:

1. `type ScriptContext = any` plus hand-rolled `isRecord`/`isVec3` guards,
   because no typed context is importable from scripts.
2. Defensive optional-chaining on core context surfaces
   (`context.input.pressed?.(id) === true || context.input.action?.(id)`),
   because the web and SDK context contracts have drifted and scripts cannot
   trust which methods exist.
3. Manual component-state hydration
   (`runner.get?.("RunnerPlayer") ?? { lane: 1, ... }` then
   `Number(stats.jump ?? 0)` per field).
4. Manual resource hydration and patching
   (`resources?.get?.("GameState")` + `isRecord` + spread + `set`, plus a
   legacy `context.resource?.("GameState")` dual-write path).
5. Entity lookup via `context.query().find((e: any) => e.id === "runner")`
   even though `ctx.entity(id)` and `ctx.entities.byId` already exist.
6. Redundant spread-merges into `entity.patch(...)`, which already
   shallow-merges (`packages/runtime-web-three/src/systems/context.ts:797`).

Roughly a third of each example script is this scaffolding, not gameplay. Most
fixes are contract hardening plus a handful of small additions — few new
abstractions are needed; the biggest wins come from making the existing ones
trustworthy, typed, and discoverable.

---

## A. Ship a typed `ScriptContext` (highest impact)

Every script starts with `type ScriptContext = any;`. That single line causes
most downstream boilerplate: no autocomplete, no compile-time validation, and
agents defensively `?.` everything.

Recommendation:

- Export a `ScriptContext` type (and `ScriptEntity`, `Vec3Tuple`, `QuatTuple`)
  from `@threenative/script-stdlib` (already whitelisted by the bundler;
  type-only imports are erased at bundle time so no runtime cost) or a new
  types-only `@threenative/script-types` entry point.
- Update starters, cookbook, and `tn game plan` scaffolds to emit:

  ```ts
  import type { ScriptContext } from "@threenative/script-stdlib";

  export function playerSystem(ctx: ScriptContext): void { ... }
  ```

- Add a compiler diagnostic (`TN_SCRIPT_UNTYPED_CONTEXT`, severity info) when
  a system export types its parameter as `any`, pointing at the import.

This matches Unity expectations (strongly-typed engine API) and deletes the
per-script `isRecord`/`isVec3` guard functions.

## B. One context contract, conformance-tested (DRY at the API level)

There are two hand-maintained copies of the context interface that have
drifted: `ISystemContext` in `packages/sdk/src/ecs/system.ts` and the one in
`packages/runtime-web-three/src/systems/contextTypes.ts` (the web copy has
`input.pressed/released`, `time.delta`, `time.paused`, `channels`, `states`,
`observers`, `resources`, `settings`, `scenes`, `tasks`; the SDK copy lacks
several of these). The stdlib then defines a third, all-optional
`IRigContextLike` (`rigs.ts:24`) precisely because it cannot trust either.

Recommendation:

- Move the context contract to a single shared package (natural home:
  `packages/ir` next to the system IR types, re-exported by SDK, stdlib, and
  both runtimes).
- Make every documented member non-optional in the type and guaranteed by both
  hosts; extend `pnpm verify:conformance` with a context-shape fixture that
  both runtimes must satisfy.
- Delete `IRigContextLike` and the `readFixedDelta`/`readDelta` fallback
  ladders in `rigs.ts` once the guarantee holds.

This is the prerequisite for scripts (and the stdlib itself) to stop writing
`context.input?.pressed?.(...)`.

## C. Unity-aligned input surface

The context currently exposes six input readers: `action`, `pressed`,
`released`, `axis`, `axis1` (deprecated), `getAxis`. Example scripts hedge
across them:

```ts
const actionPressed = (id: string): boolean =>
  context.input.pressed?.(id) === true || context.input.action?.(id) === true;
```

Unity's vocabulary maps cleanly and the semantics genuinely match, so per
design rule 1 the familiar names are the right ones:

| Current | Recommended canonical | Unity analog |
| --- | --- | --- |
| `input.action(id)` | `input.getButton(id)` | `Input.GetButton` |
| `input.pressed(id)` | `input.getButtonDown(id)` | `Input.GetButtonDown` |
| `input.released(id)` | `input.getButtonUp(id)` | `Input.GetButtonUp` |
| `input.getAxis(id)` | keep | `Input.GetAxis` |
| `input.axis(id)` | keep as low-level alias (already decided) | — |
| `input.axis1(...)` | already deprecated (`TN_SCRIPT_LEGACY_AXIS1`) | — |

Implement all three on both hosts (native currently lacks `pressed`/
`released` per the SDK/web drift), keep the old names as aliases, and extend
the existing rename-table + `TN_SCRIPT_LEGACY_*` diagnostic mechanism to steer
new code. Edge-triggered `getButtonDown`/`getButtonUp` must be defined against
the fixed tick (document that), since systems run on `fixedUpdate`.

Also add a `getAxis2` convenience returning a deadzone-normalized `[x, y]`
pair (`input.getAxis2("MoveX", "MoveZ")`), since `InputEx.axis2` +
two `axis()` calls is the current three-line idiom in `CharacterRig`.

## D. Time: guarantee the fields, adopt Unity names

Scripts hedge: `context.time.fixedDt ?? context.time.dt ?? 0.016` (racing.ts),
`typeof context.time.elapsed === "number" ? ... : 0` (metro-surfer). The
contract already has five overlapping members (`delta`, `dt`, `fixedDelta`,
`fixedDt`, `elapsed`).

Recommendation:

- Canonical members, always-present readonly numbers on both hosts:
  `time.deltaTime`, `time.fixedDeltaTime`, `time.time` (Unity names;
  identical semantics) — or, minimally, keep `fixedDelta`/`elapsed` as
  canonical and guarantee them. Either way pick one canonical set, keep the
  rest as aliases, and add rename-table entries.
- Once guaranteed, delete the fallback ladders in scripts and stdlib.

## E. Entity and component ergonomics

1. **Promote `ctx.entity(id)`.** All four example scripts do
   `context.query().find((e) => e.id === "player")` even though `ctx.entity`
   and `ctx.entities.byId` exist. This is a cookbook/starter problem, not an
   API gap: update every example, starter, and doc snippet. Agents copy what
   the examples do.

2. **`get` with defaults.** The dominant pattern is hydrate-with-fallback:

   ```ts
   const stats = runner.get?.("RunnerPlayer") ?? { lane: 1, targetLane: 1, jump: 0, ... };
   let lane = Number(stats.targetLane ?? stats.lane ?? 1);
   ```

   Add an overload `entity.get<T>(component, defaults: T): T` that
   shallow-merges defaults under the stored value and returns a typed object.
   Combined with A, the per-field `Number(x ?? d)` coercion disappears.

3. **Document `patch` as shallow merge, and it is enough.** `patch` already
   merges (`context.ts:797-810`), yet examples write
   `entity.patch("Coin", { ...coin, lane, z })`. Fix the examples to
   `entity.patch("Coin", { lane, z })` and state the merge semantics in
   `docs/contracts/scripting-api.md`. Keep web/Bevy semantics identical and
   covered by conformance tests.

4. **Component-filtered queries in examples.** `ctx.query({ with: ["Coin"] })`
   exists but examples iterate all entities and `entity.get?.("Coin")`-filter
   inline. Use the query argument in all examples; it reads like Unity's
   "find objects with component" and lets the runtime skip entities.

5. **Typed component handles (follow-up).** SDK `EcsFactory` schemas already
   exist; allow scripts to import shared component schema types (types-only,
   per the bundler whitelist) so `entity.get(RunnerPlayer)` returns a typed
   value instead of `unknown`. This can follow A/B rather than block them.

## F. Resources: defaults + patch, kill the legacy dual-write

Metro-surfer's game-state plumbing is the worst offender:

```ts
const stateValue = context.resources?.get?.("GameState");
let state: Record<string, unknown> = isRecord(stateValue) ? stateValue : {};
const legacyState = context.resource?.("GameState");
const patchState = (patch) => {
  state = { ...state, ...patch };
  context.resources?.set?.("GameState", state);
  legacyState?.patch?.(patch);
};
```

Recommendation:

- `ctx.resources.get<T>(name, defaults?: T): T` — same defaults semantics as
  `entity.get` above.
- `ctx.resources.patch(name, partial)` — shallow merge, mirroring
  `entity.patch`. One symmetric verb pair (`get`/`patch`) across entities and
  resources is the KISS win.
- Remove the legacy `ctx.resource(name)` handle path entirely (rename-table
  entry + `TN_SCRIPT_LEGACY_RESOURCE_HANDLE` diagnostic) so scripts never
  dual-write again.

## G. State hygiene for respawn/reset

`RespawnEx.reset` requires callers to know internal stdlib state keys:

```ts
stateKeys: ["tn.cameraOrbitRig.camera.main", "tn.characterRig.player"],
```

That leaks rig implementation details into every game script and silently
breaks when a rig renames its key. Recommendation:

- Add `ctx.state.clear(prefix: string)` (or `ctx.states.clear`) to the
  context, and have rigs register their keys under a discoverable namespace:
  `RespawnEx.reset(ctx, player, { clearRigState: true })` clears
  `tn.*.<entityId>` and `tn.*.<cameraId>` automatically.
- Keep `stateKeys` as an escape hatch.

## H. Triggers as a first-class, stateful service

`physics.sensor` reports `enter` statelessly every tick (the dedup lives in
stdlib `TriggerEx` state — a known footgun). Examples then loop all entities
and call `TriggerEx.entered(context, entity, ...)` per candidate.

Recommendation:

- Promote the deduplicated form onto the context:
  `ctx.sensors.entered(sensorId, { component?, layer? }): ScriptEntity[]`
  (and `exited`), with per-sensor state handled by the host. Unity analog:
  `OnTriggerEnter`, expressed poll-style because systems have no callbacks —
  the distinct shape is intentional per design rule 2.
- Keep raw `physics.sensor` as the low-level API; keep `TriggerEx` as a
  compatibility wrapper; keep `TriggerEx.cooldown` (or move it to
  `ctx.timers.cooldown(key, seconds)` next to the existing timer helpers,
  which is where agents will look for it).

## I. HUD/game-flow: stop formatting UI strings in gameplay scripts (SRP)

Metro-surfer builds presentation strings inside the fixed-update system:

```ts
scoreText: `Score ${Math.floor(score)}`,
coinsText: `Coins ${Math.min(coins, objectiveCoins)}/${objectiveCoins}`,
```

Gameplay owns numbers; presentation belongs to the UI document. Recommendation:

- Support format strings in UI bindings (`content/ui/*.ui.json`), e.g.
  `{ "bind": "GameState.coins", "format": "Coins {value}/{GameState.objectiveCoins}" }`,
  so scripts write `{ coins, score, distance }` only.
- Provide a small `GameStateEx` (or extend `CheckpointRaceEx`'s pattern) for
  the phase machine every example re-implements:
  `phase: "ready" | "playing" | "failed" | "won"`, `fail(reason)`, `win()`,
  and a `retryAction` hook that composes with `RespawnEx`. Three of the four
  examples hand-roll exactly this.

## J. Stdlib maintenance and naming polish

- **Generate `bundle-source.ts`.** The stdlib is maintained twice (typed
  `src/*.ts` plus a raw-JS string in `bundle-source.ts`, kept in sync by a
  parity test). Generate the bundle source from the compiled TS at build time
  and delete the hand-maintained copy — this is the single biggest DRY debt in
  the scripting stack and it taxes every new abstraction added.
- **`NumberEx.moveToward` → also expose `moveTowards`** (Unity spelling,
  `Mathf.MoveTowards`); same for a `Mathf`-style alias set only where
  semantics match exactly (`clamp`, `lerp`, `repeat`, `sign`,
  `deltaAngle` — `moveAngleToward` in `rigs.ts` is private but is exactly
  `Mathf.MoveTowardsAngle`; export it as `AngleEx.moveTowards`).
- **Promote `exponentialAlpha`** (private in `rigs.ts`) to `Ease` or
  `NumberEx` — frame-rate-independent smoothing is needed by every follow
  behavior and agents otherwise write `lerp(a, b, delta * 12)` (metro-surfer
  line 110), which is frame-rate dependent.
- **Vector sugar where scripts hurt most:** `Vec3.distance2d` exists but
  metro-surfer re-implemented it; audit the examples for other hand-rolled
  math (`distance2d`, lane-snap clamping) and make sure the cookbook shows the
  stdlib call.

## K. Keep the guardrails that already work

- The rename-table + `TN_SCRIPT_LEGACY_*` diagnostics mechanism in
  `docs/contracts/script-context-conventions.md` is the right migration
  vehicle for C, D, and F — extend it rather than inventing a new one.
- Design rule 2 (no fake `MonoBehaviour`/coroutines) should stay. Everything
  above adopts Unity *names* only where semantics match; systems-over-context
  remains the honest model.

---

## Prioritized Plan

| Priority | Item | Type | Cuts |
| --- | --- | --- | --- |
| 1 | A. Typed `ScriptContext` export + starter/cookbook adoption | new export | `any` contexts, per-script type guards |
| 2 | B. Single context contract + conformance fixture | refactor | all defensive `?.`, SDK/web drift, `IRigContextLike` |
| 3 | F. `resources.get(name, defaults)` / `resources.patch`; delete legacy `resource()` | change + removal | GameState plumbing (~15 lines/script) |
| 4 | E2/E3. `entity.get(component, defaults)`; document `patch` merge; fix example spreads | change | state-hydration and spread boilerplate |
| 5 | C. `getButton`/`getButtonDown`/`getButtonUp` + `getAxis2` | rename/addition | input hedging helpers |
| 6 | D. Guaranteed time fields, Unity names | rename | time fallback ladders |
| 7 | I. UI format bindings + `GameStateEx` phase helper | new abstraction | HUD strings in gameplay, hand-rolled phase machines |
| 8 | H. `ctx.sensors.entered` with host-side dedup | promotion | per-entity `TriggerEx` loops |
| 9 | G. `state.clear` + rig-state registry for respawn | change | magic `stateKeys` strings |
| 10 | J. Generate `bundle-source.ts`; math naming polish | tooling/polish | double-maintained stdlib |

Items 1-4 remove the majority of observed boilerplate without adding any new
runtime concept; 5-6 are naming alignment with an existing migration
mechanism; 7-10 are quality-of-life. Each context-surface change must land in
both runtimes with conformance coverage, and capability-affecting items should
update `docs/STATUS.md` / `docs/bevy-feature-parity.md` per repo rules.
