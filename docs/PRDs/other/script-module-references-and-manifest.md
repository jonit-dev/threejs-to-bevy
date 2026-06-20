# PRD: Script Module References and Manifest

Complexity: 11 -> HIGH mode

Score basis: +2 scripting architecture, +2 compiler bundling changes, +2 source-to-generated manifest, +1 AST/bundler diagnostics, +1 multi-scene script collision handling, +1 IR schema impact, +1 web/Bevy parity risk, +1 tests across compiler/IR.

## 1. Context

Current systems can serialize `run(context)` functions and emit generated JS into `scripts.bundle.js`. That is acceptable as an MVP runtime path, but it is not editor-round-trippable and is fragile for modular authoring. The editor and AIs must reference source TypeScript modules/exports, while generated runtime IR references bundle/export names.

This PRD depends on:

- `agent-safe-scene-authoring-cli.md`
- `authoring-graph-provenance-capture.md`
- `modular-sdk-authoring-declarations.md`

## 2. Goal

Represent systems as structured source metadata plus TypeScript module/export references, emit a generated script bundle and manifest, and validate forbidden script patterns with stable diagnostics.

## 3. Non-goals

- Do not reverse-generate TypeScript from generated script bundles.
- Do not treat `scripts.bundle.js` as source.
- Do not support arbitrary Node/browser/Three/Bevy APIs in portable scripts.
- Do not implement arbitrary npm runtime imports unless explicitly whitelisted.

## 4. Required Source Model

A system declaration should retain:

```json
{
  "systemId": "system.kartArcadePhysics",
  "source": {
    "module": "src/scripts/kartArcadePhysics.ts",
    "export": "kartArcadePhysics",
    "hash": "..."
  },
  "schedule": "fixedUpdate",
  "queries": [],
  "resourceReads": [],
  "resourceWrites": [],
  "services": ["ui", "audio"]
}
```

Generated runtime IR may reference:

```json
{
  "script": {
    "bundle": "scripts.bundle.js",
    "exportName": "system_kartArcadePhysics"
  }
}
```

## 5. Implementation Phases

### Phase 1: Source script metadata

- [ ] Add source-level script metadata: module path, named export, hash, owner system ID.
- [ ] Extend SDK/system declarations to carry source refs.
- [ ] Ensure CLI `attach-script` validates module/export resolution.

Verification:

```bash
pnpm --filter @threenative/sdk test -- --run system
pnpm --filter @threenative/compiler test -- --run scripts
```

### Phase 2: Generated script manifest

- [ ] Emit `scripts.manifest.json` or equivalent metadata.
- [ ] Map system ID -> source module/export/hash -> generated bundle/export.
- [ ] Mark generated script artifacts as non-source in editor metadata.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run scripts
pnpm --filter @threenative/ir test -- --run systems
```

### Phase 3: Bundling and collision diagnostics

- [ ] Prevent generated export name collisions after sanitization.
- [ ] Support helper imports through a real bundling path or reject them deterministically.
- [ ] Ensure multi-scene/multi-world projects produce one valid generated script module.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run scripts
```

### Phase 4: AST/bundler diagnostics

- [ ] Diagnose forbidden imports/globals/dynamic code/unsupported async/timers/network.
- [ ] Diagnose obvious hidden mutable module state where practical.
- [ ] Include stable diagnostic code, severity, source path, export name, and suggestion.

Verification:

```bash
pnpm --filter @threenative/compiler test -- --run scripts
pnpm check:docs
```

## 6. Acceptance Criteria

- [ ] Systems can reference TypeScript module/export source.
- [ ] Generated runtime bundle/export remains separate from source metadata.
- [ ] `scripts.manifest.json` or equivalent exists and maps source to generated output.
- [ ] Export name collisions fail with useful diagnostics.
- [ ] Helper imports are either truly bundled or rejected deterministically.
- [ ] Inline script strings in structured authoring data are rejected.
- [ ] Generated `scripts.bundle.js` is never treated as source.
