# PRD: Authoring MCP Wrapper

Complexity: 7 -> MEDIUM/HIGH mode

Score basis: +2 MCP tool surface, +2 safety/no-drift wrapper requirement, +1 schema/diagnostic transport, +1 tests/smoke, +1 docs and agent workflow.

## 1. Context

The canonical ThreeNative authoring interface should be the shared authoring core and `tn scene ... --json` CLI. MCP is useful for interactive AI sessions, but it must not become a second implementation of scene mutation/validation.

This PRD intentionally comes after `agent-safe-scene-authoring-cli.md` and should only start once the CLI/core contract is stable.

## 2. Goal

Expose a thin MCP server/tool wrapper for scene authoring operations, backed by the same authoring core or CLI JSON commands.

## 3. Non-goals

- Do not implement separate validation or mutation logic in MCP.
- Do not make MCP required for CI, Night Watch, Codex, or human workflows.
- Do not bypass `tn scene validate` semantics.
- Do not expose raw runtime handles, generated IR editing, or shell access through broad MCP tools.

## 4. Required Tools

Expose narrowly scoped tools equivalent to the CLI:

```txt
scene.inspect(sceneId)
scene.validate(sceneId?)
scene.add_entity(sceneId, entityId, prefabId?)
scene.set_transform(sceneId, entityId, transform)
scene.set_camera(sceneId, cameraId, mode, targetId, options?)
scene.attach_script(sceneId, systemId, modulePath, exportName)
scene.bind_ui(sceneId, uiNodeId, resourcePath)
project.build()
project.screenshot(sceneId?)
project.verify(options?)
```

Every tool returns the same diagnostic/result shape as the CLI where practical.

## 5. Implementation Phases

### Phase 1: Wrapper architecture

- [ ] Decide whether MCP calls the authoring core directly or shells out to `tn scene ... --json`.
- [ ] Ensure outputs are schema-compatible with CLI JSON output.
- [ ] Add guardrails: project root allowlist/current project, no arbitrary file paths outside project, no generated bundle source edits.

Verification:

```bash
pnpm --filter @threenative/cli test -- --run scene-command
```

### Phase 2: Tool implementation

- [ ] Implement inspect/validate/mutation tools.
- [ ] Preserve stable diagnostic codes and suggestions.
- [ ] Return changed files and validation status for mutations.
- [ ] Ensure failed validation does not partially persist corrupt source.

Verification:

```bash
pnpm test -- --run mcp
```

### Phase 3: Agent workflow docs and smoke

- [ ] Document when to use CLI vs MCP.
- [ ] Add an MCP smoke fixture that performs inspect -> mutate -> validate -> build/verify.
- [ ] Confirm CLI and MCP return equivalent diagnostics for the same invalid inputs.

Verification:

```bash
pnpm check:docs
pnpm verify:smoke
```

## 6. Acceptance Criteria

- [ ] MCP tools are thin wrappers over the same authoring core/CLI behavior.
- [ ] CLI remains canonical and fully usable without MCP.
- [ ] MCP cannot edit generated IR or runtime handles as source.
- [ ] MCP diagnostics match CLI diagnostics for equivalent operations.
- [ ] Agent workflow docs explain CLI-first, MCP-wrapper architecture.
