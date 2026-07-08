# PRD: UI Authoring API and Type Closure

## 1. Context

**Problem:** The JSX authoring layer exposes fewer node kinds than the IR and
uses a permissive prop bag, so authoring errors surface late as IR diagnostics.
`textInput` and component instances are IR-supported but not TSX-authorable.
There is also no package-local TSX capture-to-IR-to-bundle test, and several
diagnostics lose useful provenance.

**Inspection source:** `docs/audits/ui-system-inspection.md` sections 4 and 7.

**Files likely touched:**

- `packages/ui/src/jsx-runtime.ts`
- `packages/ui/src/capture.ts`
- `packages/ui/src/index.ts`
- `packages/ui/src/**/*.test.ts`
- `packages/ir/src/uiTypes.ts`
- `packages/ir/src/uiValidation.ts`
- `packages/compiler/src/emit/ui.ts`
- `packages/compiler/src/emit/**/*.test.ts`
- `docs/status/capabilities/ui.md`

## 2. Solution

Close the authoring/IR drift by either exporting TSX authoring wrappers for
`TextInput` and component instances or documenting a deliberate unsupported
boundary with diagnostics. Replace the single permissive `IUiNodeProps` shape
with kind-specific prop types for action/value-bearing widgets. Add package
tests that prove TSX capture, validation, component expansion, theme token
resolution, and bundle emit together.

Improve diagnostics where the inspection found avoidable ambiguity:
component-cycle errors should include the cycle path, expansion failures should
refer to the authored component/slot when possible, and theme token alias
cycles should fail explicitly instead of falling through to `undefined`.

## 3. Acceptance Criteria

- [ ] `TextInput` has an intentional authoring story: TSX wrapper plus tests,
      or an explicit documented diagnostic boundary.
- [ ] Component instances have an intentional TSX authoring story: wrapper plus
      tests, or an explicit documented diagnostic boundary.
- [ ] Button-like widgets require `action` at typecheck where TypeScript can
      enforce it.
- [ ] Value-bearing widgets expose kind-specific value/change props instead of
      relying only on a loose shared prop bag.
- [ ] At least one end-to-end test covers TSX authoring through `captureUi`,
      IR validation, compiler UI emit, and bundle output.
- [ ] Component cycle diagnostics include the cycle path.
- [ ] Theme alias cycles produce stable diagnostics with code, path, message,
      and suggested fix.

## 4. Verification

- [ ] Run `pnpm --filter @threenative/ui test`.
- [ ] Run `pnpm --filter @threenative/ir test -- --run ui`.
- [ ] Run the relevant compiler emit tests.
- [ ] Run `pnpm typecheck` if exported UI prop types change.
- [ ] Run `pnpm check:docs` if capability docs are updated.

## 5. Dependencies

Depends on PRD-002 if a node kind is intentionally bounded rather than
implemented in authoring.

## 6. Non-Goals

- Runtime text editing implementation.
- React runtime support.
- Dynamic retained-tree mutation.
