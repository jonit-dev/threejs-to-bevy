# Scripting Status

Portable gameplay belongs in project-local TypeScript modules referenced from
structured source. Runtime adapter handles, raw Three.js/Bevy APIs, DOM, Node,
timers, network, filesystem, and arbitrary dependencies remain outside the
portable script contract.

Current support:

- Convention-first context idioms: `context.input.getAxis(...)`,
  `entity.transform().position`, and readonly `context.time.fixedDelta`.
- Supported named helper imports from `@threenative/script-stdlib` and promoted
  gameplay kits.
- Compiler diagnostics reject unsupported imports, mutable module state,
  module-local helpers that cannot be emitted, legacy idioms, and undeclared
  access.
- Prescriptive `fix` snippets cover unsupported imports and module-local
  helper repairs.

Verification:

- `pnpm --filter @threenative/compiler test`
- `pnpm verify:scripting-helpers-lifecycle`
- `pnpm verify:conformance`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
