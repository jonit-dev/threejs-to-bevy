# PRD: Agent-Safe Scene Authoring CLI

Complexity: 9 -> HIGH mode

Score basis: +2 adds CLI authoring surface, +2 requires schema/semantic validation, +2 spans CLI/authoring/compiler/docs/tests, +1 affects AI/editor source-of-truth workflow, +1 needs deterministic diagnostics, +1 requires integration proof with build/validate.

## 1. Context

ThreeNative needs editor-ready modular authoring, but the first dangerous gap is more basic: AIs will make scene authoring mistakes if they freehand JSON or giant imperative TypeScript. Syntax is only the visible failure. The real failures are semantic: misspelled IDs, missing camera targets, invalid vector lengths, duplicate entity IDs, unknown component names, invalid prefab refs, UI bindings to missing resources, script refs that do not export what they claim, and authoring data that is web-only or Bevy-incompatible.

The broader architecture PRD is `docs/PRDs/other/editor-ready-modular-authoring-and-scripting-architecture.md`. This PRD is the first implementation slice: build the shared authoring core and `tn scene ... --json` CLI operations that AIs, humans, CI, and a future MCP wrapper can use safely.

## 2. Goal

Create a canonical agent-safe scene authoring interface:

```txt
@threenative/authoring core library
        ↓
tn scene ... CLI commands       # canonical automation/human/CI interface
        ↓
optional future MCP wrapper     # thin adapter only; not in this PRD
```

AIs should perform constrained operations and repair against machine-readable diagnostics instead of editing arbitrary scene files blindly.

## 3. Non-goals

- Do not build the visual editor.
- Do not implement MCP in this PRD.
- Do not make MCP the source of authoring behavior; future MCP must wrap this same core/CLI contract.
- Do not replace TypeScript gameplay scripting.
- Do not migrate all templates/examples yet.
- Do not implement the full authoring graph/provenance system from the umbrella PRD.
- Do not make generated IR or `scripts.bundle.js` editable source.

## 4. Product Decision

The CLI is the canonical authoring automation interface because it is reproducible in CI, Codex/Night Watch, shell scripts, and human debugging. It must expose JSON output, stable exit codes, deterministic source formatting, and diagnostics that are specific enough for an AI repair loop.

Raw source document edits remain allowed as an escape hatch, but they must pass:

1. schema validation;
2. semantic authoring validation;
3. compiler validation;
4. runtime/build proof when behavior changes.

## 5. Proposed Project Shape

Use the existing package boundaries where possible. A new package is acceptable if it keeps CLI/editor/MCP logic from drifting.

Preferred option:

```txt
packages/authoring/
  src/index.ts
  src/project.ts
  src/documents.ts
  src/operations.ts
  src/schemas.ts
  src/diagnostics.ts
  src/format.ts
  src/__tests__/*.test.ts

packages/cli/src/commands/scene.ts
packages/cli/src/__tests__/scene-command.test.ts
```

Fallback if a new package is too heavy for the first slice:

```txt
packages/cli/src/authoring/*
```

But the implementation must be structured so a future MCP server can reuse the same operations without duplicating validation logic.

## 6. Required CLI Surface

Implement the smallest useful stable surface. Commands must support `--json` and return machine-readable results.

Required commands:

```bash
tn scene inspect <scene-id> --json
tn scene validate [scene-id] --json
tn scene add-entity <scene-id> <entity-id> --prefab <prefab-id> --json
tn scene set-transform <scene-id> <entity-id> --position x,y,z --rotation x,y,z --scale x,y,z --json
tn scene set-camera <scene-id> <camera-id> --mode third-person-follow --target <entity-id> --json
tn scene attach-script <scene-id> <system-id> --module <path> --export <name> --json
tn scene bind-ui <scene-id> <ui-node-id> --resource <resource.path> --json
```

If existing authoring files cannot yet represent every operation, implement the command with a clear unsupported diagnostic instead of silently writing partial/bogus data.

## 7. Diagnostics Contract

Every validation failure intended for AI repair must include:

```ts
interface IAuthoringDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  path?: string;        // JSON pointer or source path
  value?: unknown;
  suggestion?: string;
  related?: Array<{ file?: string; path?: string; message: string }>;
}
```

Examples:

```json
{
  "ok": false,
  "diagnostics": [
    {
      "code": "E_SCENE_REF_MISSING",
      "severity": "error",
      "file": "content/scenes/kart-track.scene.json",
      "path": "/entities/chase-camera/components/camera/target",
      "value": "playerKartt",
      "message": "No entity with id 'playerKartt' exists.",
      "suggestion": "Did you mean 'player-kart'?"
    }
  ]
}
```

## 8. Validation Requirements

The authoring core must reject or diagnose:

- malformed logical IDs;
- duplicate scene/entity/prefab/resource/system/UI IDs;
- misspelled/unknown fields such as `positon`;
- wrong vector sizes or non-numeric transform values;
- references to missing scenes, entities, prefabs, resources, UI nodes, scripts, assets, or camera targets;
- unknown component/camera/script/UI binding kinds;
- generated bundle paths used as source paths;
- inline script strings in structured scene/prefab/resource data;
- script refs whose module path or named export does not resolve;
- web-only/native-only/runtime-handle-shaped source data;
- unsupported operations with stable diagnostics, not silent no-ops.

## 9. Execution Phases

### Phase 1: Authoring core skeleton and diagnostics

**Files:**

- Create: `packages/authoring/src/diagnostics.ts`
- Create: `packages/authoring/src/project.ts`
- Create: `packages/authoring/src/documents.ts`
- Create: `packages/authoring/src/operations.ts`
- Create: `packages/authoring/src/index.ts`
- Modify: workspace/package config as needed
- Test: `packages/authoring/src/__tests__/diagnostics.test.ts`

**Implementation:**

- [ ] Add diagnostic types and stable helper constructors.
- [ ] Add project/document loader that can find the initial supported source document shape.
- [ ] Add deterministic write/format helper.
- [ ] Add operation result shape: `{ ok, changed, diagnostics, projectPath, filesWritten }`.
- [ ] Add tests for stable diagnostic shape and deterministic formatting.

**Verification:**

```bash
pnpm --filter @threenative/authoring test
```

Expected: focused authoring tests pass.

### Phase 2: Scene validation

**Files:**

- Modify: `packages/authoring/src/schemas.ts`
- Modify: `packages/authoring/src/operations.ts`
- Test: `packages/authoring/src/__tests__/validate-scene.test.ts`

**Implementation:**

- [ ] Validate IDs, object shapes, unknown fields, transform vectors, duplicate IDs, and reference resolution.
- [ ] Add closest-ID suggestions for missing references where safe.
- [ ] Reject generated bundle paths and inline script strings as source.
- [ ] Return all diagnostics in deterministic order.

**Verification:**

```bash
pnpm --filter @threenative/authoring test -- --run validate-scene
```

Expected: valid fixtures pass; invalid fixtures produce exact diagnostic codes/paths.

### Phase 3: CLI `tn scene validate` and `inspect`

**Files:**

- Modify/create: `packages/cli/src/commands/scene.ts`
- Modify: CLI command registry entry point
- Test: `packages/cli/src/__tests__/scene-command.test.ts`
- Docs: add short workflow doc or command help text

**Implementation:**

- [ ] Add `tn scene validate [scene-id] --json`.
- [ ] Add `tn scene inspect <scene-id> --json`.
- [ ] Ensure non-JSON output is readable for humans.
- [ ] Ensure JSON output is stable for agents.
- [ ] Use non-zero exit code when validation has errors.

**Verification:**

```bash
pnpm --filter @threenative/cli test -- --run scene-command
pnpm check:docs
```

Expected: CLI tests and docs gate pass.

### Phase 4: Mutating scene commands

**Files:**

- Modify: `packages/authoring/src/operations.ts`
- Modify: `packages/cli/src/commands/scene.ts`
- Test: authoring operation tests
- Test: CLI integration tests

**Implementation:**

- [ ] Implement `add-entity`.
- [ ] Implement `set-transform`.
- [ ] Implement `set-camera`.
- [ ] Implement `attach-script`.
- [ ] Implement `bind-ui`.
- [ ] Each mutation validates before and after write.
- [ ] Each mutation writes deterministic source and returns files changed.
- [ ] Unsupported source shapes must fail with actionable diagnostics.

**Verification:**

```bash
pnpm --filter @threenative/authoring test
pnpm --filter @threenative/cli test -- --run scene-command
```

Expected: command mutations are deterministic and invalid inputs fail cleanly.

### Phase 5: Build/proof loop integration

**Files:**

- Modify: docs/workflow files as needed
- Test: CLI smoke fixture or example fixture

**Implementation:**

- [ ] Add an end-to-end fixture where CLI commands create/update a small scene.
- [ ] Run `tn scene validate --json`.
- [ ] Build the project bundle.
- [ ] Confirm compiler validation still passes.
- [ ] If practical, capture `tn screenshot` or `tn verify` proof for the fixture.

**Verification:**

```bash
pnpm --filter @threenative/cli test -- --run scene-command
pnpm verify:smoke
```

Expected: CLI-authored scene validates and builds through the normal pipeline.

## 10. Acceptance Criteria

- [ ] There is one shared authoring core used by CLI commands.
- [ ] `tn scene validate --json` returns stable machine-readable diagnostics.
- [ ] `tn scene inspect --json` returns scene/source metadata useful to agents.
- [ ] Required scene mutation commands exist or fail with explicit unsupported diagnostics for not-yet-supported source shapes.
- [ ] Invalid IDs, missing references, wrong vector shapes, unknown fields, inline scripts, and generated artifact paths are rejected.
- [ ] CLI operations produce deterministic source file output.
- [ ] Focused authoring and CLI tests pass.
- [ ] Docs explain that MCP is a future wrapper over the same authoring core, not a separate implementation.
- [ ] No generated IR or `scripts.bundle.js` is treated as source.

## 11. Future PRD Slices

After this lands, split the umbrella architecture into separate implementation PRDs:

1. Authoring graph/provenance capture.
2. Modular SDK/data-first declarations.
3. Script module refs and `scripts.manifest.json`.
4. Web/Bevy scripting host conformance.
5. Template migration to modular authoring.
6. Editor snapshot/source document bridge.
7. MCP wrapper over the stable authoring core and CLI operations.
