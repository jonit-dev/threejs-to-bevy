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
- Supported named helper imports from `@threenative/script-stdlib` and promoted
  gameplay kits.
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
- `pnpm --filter @threenative/compiler test`
- `pnpm verify:scripting-helpers-lifecycle`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
