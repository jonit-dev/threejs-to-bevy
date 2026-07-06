# Script Context Conventions

This contract keeps portable script APIs close to names agents and game
developers already know without pretending ThreeNative is Unity or raw
Three.js.

## Design Rules

1. Reuse familiar names when the behavior matches. `getAxis`, `position`, and
   `fixedDelta` are acceptable because their meaning is the same portable
   concept developers expect.
2. Use distinct names when behavior differs. ThreeNative scripts are exported
   systems over a context; they are not `MonoBehaviour` classes and must not
   expose look-alike lifecycle or coroutine APIs without matching semantics.
3. Put durable policy in source documents or engine defaults. Scripts consume
   input axes, transforms, fixed-step time, and proof samples; they do not
   redefine those contracts at every call site.

## Rename Table

| Legacy idiom | Replacement | Behavior notes | Diagnostic |
| --- | --- | --- | --- |
| `ctx.input.axis1("MoveX", { negative, positive })` | `ctx.input.getAxis("MoveX")` | Axis action mapping belongs in `content/input/*.input.json` as `negativeAction`/`positiveAction` or equivalent normalized axis metadata. Scripts read the declared axis only. | `TN_SCRIPT_LEGACY_AXIS1` |
| `ctx.input.axis1("MoveX")` | `ctx.input.getAxis("MoveX")` | Same signed value as the declared axis. Unknown axis diagnostics should list declared axes. | `TN_SCRIPT_LEGACY_AXIS1` |
| `entity.transform().positionOr([x, y, z])` | `entity.transform().position` | The getter returns the authored or live transform position. Missing transform access remains governed by existing query/write validation. | `TN_SCRIPT_LEGACY_POSITION_OR` |
| `entity.transform().setPosition(next)` | `entity.transform().position = next` | Property assignment and `setPosition` use the same effect path. `setPosition` remains an explicit-method alias for users who prefer method calls. | none |
| `ctx.time.fixedDelta({ fallback, min, max })` | `ctx.time.fixedDelta` | Fixed-step fallback and clamps are engine policy. Runtime config may declare policy; scripts read a readonly number. | `TN_SCRIPT_LEGACY_FIXED_DELTA_OPTIONS` |
| `Vec3.round(position, digits)` used only for proof determinism | no script-side rounding | Proof and trace capture round samples for deterministic artifacts. Gameplay scripts should preserve authored/runtime values. | none |

## Audited Surface

| Surface | Decision | Notes |
| --- | --- | --- |
| `ctx.entity(id)` / `ctx.entities.byId(id)` | keep | Context lookup is explicit and does not mimic a mismatched engine API. |
| `ctx.state(key, defaults)` | keep | Portable state container has no common-engine equivalent with identical semantics. |
| `ctx.input.axis(id)` | keep as low-level alias | Existing generic axis reader remains for helper libraries; user-facing starter and cookbook code should prefer `getAxis`. |
| `ctx.input.action(id)` / `pressed(id)` / `released(id)` | keep | Names are conventional and source-authored input remains the durable mapping. |
| `transform.yawOr(fallback)` | defer | This is another `-Or` fallback idiom. Keep until camera/rotation helpers get a dedicated convention pass. |
| `ctx.character.move(entity, options)` | keep | Options describe a gameplay request, not engine timing policy. Prefer passing `ctx.time.fixedDelta` explicitly only when needed by the API contract. |
| `MotionEx` / `InputEx` option bags | keep | Helper options are algorithm parameters owned by caller intent, not runtime policy. |
