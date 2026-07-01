# AI Reference Examples

These examples are the canonical starting points for AI agents using only the
published ThreeNative surface.

## Simple Scene

```bash
tn create ai-simple-scene --template structured-source-starter
cd ai-simple-scene
pnpm install
pnpm run build
pnpm run verify
```

Use this when the request is "make a small ThreeNative game" or when validating
that installed packages work without repository source.

## Material, Light, Camera

Start from `tn create ... --template structured-source-starter`, then edit
structured source documents under `content/**` and portable behavior modules
under `src/scripts/**`. After edits, run:

```bash
pnpm run build
tn verify --json
```

## Source Scene Mutation

Use the CLI when an agent needs deterministic source edits:

```bash
tn scene validate arena --json
tn scene inspect arena --json
tn scene add-entity arena ai-cube --json
tn scene set-transform arena ai-cube --position '[0,1,0]' --json
tn build
tn verify --json
```

Generated structured-source projects also include `AGENTS.md` and `CLAUDE.md`
with local instructions for coding agents.

## Diagnostics Repair

When validation fails:

1. Keep the diagnostic code and path.
2. Read `@threenative/ir/diagnostics/diagnostics.catalog.json`.
3. Read the matching file from `@threenative/ir/schemas/*`.
4. Patch source declarations or structured source documents.
5. Re-run the failing command.

## Native/Distribution Proof

Use `pnpm verify:distribution` from the repository or a release gate to prove
packed packages can create, build, verify, compile the bundled Bevy runtime, and
package a desktop bundle from a clean consumer project.
