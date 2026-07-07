# Scripting Status

Portable gameplay belongs in project-local TypeScript modules referenced from
structured source. Runtime adapter handles, raw Three.js/Bevy APIs, DOM, Node,
timers, network, filesystem, and arbitrary dependencies remain outside the
portable script contract.

Current support:

- Convention-first context idioms: `context.input.getAxis(...)`,
  `entity.transform().position`, and readonly `context.time.fixedDelta`.
- Typed script context imports from `@threenative/script-stdlib`, including
  `ScriptContext`, plus guaranteed input/time aliases for `getButton*`,
  `getAxis2`, `deltaTime`, `fixedDeltaTime`, and `time`.
- Shallow default hydration and patching through `entity.get(..., defaults)`,
  `context.resources.get(..., defaults)`, and `context.resources.patch(...)`.
- Literal `context.resources.get(...)`, `context.resources.set(...)`,
  `context.resources.patch(...)`, and `context.state(...)` resource IDs are
  derived into deterministic `resourceReads`/`resourceWrites` during script
  source resolution; dynamic resource IDs fail with
  `TN_SCRIPT_DYNAMIC_RESOURCE_ID_UNSUPPORTED`.
- Supported named helper imports from `@threenative/script-stdlib` and promoted
  gameplay kits. Familiar aliases `Mathf`, `Vector2`, and `Vector3` are
  exact aliases for legacy `NumberEx`, `Vec2`, and `Vec3`, which remain
  supported for one compatibility cycle.
- Compiler diagnostics reject unsupported imports, mutable module state,
  module-local helpers that cannot be emitted, legacy idioms, and undeclared
  access.
- Bundle validation diagnostics for missing component/resource schemas include
  copyable schema snippets and survive `tn build --json` wrapping.
- The non-blocking `TN_SCRIPT_UNTYPED_CONTEXT` info diagnostic points old
  `type ScriptContext = any` scripts at the typed stdlib import.
- Prescriptive `fix` snippets cover unsupported imports and module-local
  helper repairs.

Verification:

- `tools/agent-benchmark/DIAGNOSTIC-FAILURE-AUDIT-2026-07-07.md`
  ranks observed failed commands and repair actions.
- `tools/agent-benchmark/API-SHAPE-AUDIT-2026-07-07.md` classifies
  benchmark-touched script helper shapes and alias decisions.
- `tools/agent-benchmark/ROUND-4-RESOURCE-DECLARATION-REGRESSION.md`
  records the derived-resource regression for the top round-4 failure class.
- `pnpm --filter @threenative/compiler test`
- `pnpm --filter @threenative/cli test`
- `pnpm verify:scripting-helpers-lifecycle`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
