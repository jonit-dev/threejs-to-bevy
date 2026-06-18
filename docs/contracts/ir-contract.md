# IR Contract Policy

The portable ThreeNative runtime artifact boundary is JSON. The compiler emits a
bundle rooted at `manifest.json`, and runtimes consume bundle documents such as
`world.ir.json`, `materials.ir.json`, `assets.manifest.json`, and
`target.profile.json`. TypeScript source files are authoring inputs, not runtime
bundle artifacts.

## Source Of Truth

`@threenative/ir` owns the contract metadata in
`packages/ir/src/documents.ts`:

- `IR_VERSION` is the bundle document version.
- `IR_SCHEMA_IDS` names schema IDs such as `threenative.bundle` and
  `threenative.world`.
- `IR_DOCUMENTS` owns canonical manifest keys, emitted file names, and known
  JSON Schema files.

JSON Schema files under `packages/ir/schemas/` are the structural contract for
serialized schema-backed documents. TypeScript interfaces and Rust serde DTOs
must stay aligned with those required fields, but they are not independent
sources of truth.

Manual validators in `packages/ir/src/validate.ts` own semantic and
cross-document rules that schemas cannot express cleanly: duplicate IDs,
bundle-local asset existence, material and mesh references, component/resource
schema payloads, runtime support policy, budgets, and portable diagnostics.

## Update Checklist

When changing an IR document or manifest path:

1. Update `packages/ir/src/documents.ts`.
2. Update the JSON Schema when the serialized structure changes.
3. Update TypeScript IR types.
4. Update `validateBundle` for semantic or cross-document rules.
5. Update Bevy loader structs for documents consumed by native runtime.
6. Update web runtime loading/mapping for documents consumed by web runtime.
7. Add or update fixtures, conformance evidence, and drift tests.

Run `pnpm --filter @threenative/ir test` before release evidence is considered
valid. The package test suite includes `contractDrift.test.ts`, which compares
registered documents, schema URL registration, schema required fields,
TypeScript interfaces, and Bevy loader structs.
