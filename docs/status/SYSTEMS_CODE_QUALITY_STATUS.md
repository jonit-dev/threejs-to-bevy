# Systems Code Quality Status

Living log for systemic code-quality, architecture, and technical-debt status.
Update it when a new system is introduced or when an agent finds the code in a
systemically bad place. Keep entries brief.

Last updated: 2026-07-09

## Snapshot

- Overall status: 🟡 **Needs focused hardening**
- Current quality score: **7.2/10**
- Source taxonomy: `docs/bevy-feature-parity.md`
- Latest pass: systems code-quality remediation bundle closed for the top four
  red rows: IR contract truth, game-loop scheduling, native live
  reconciliation, and compiler bundle planning/writer separation.
- Primary risk theme: contract truth and runtime behavior are still split
  across SDK, IR, compiler, web runtime, Bevy runtime, editor/CLI adapters, and
  verification registries.
- Deep diagnostic for the previous top four 🔴 rows (now closed):
  `docs/status/systems-code-quality-diagnostic-2026-07-08.md`.
- Deep diagnostic for the adapter-surface rows currently being remediated:
  `docs/status/systems-code-quality-diagnostic-adapter-surfaces-2026-07-08.md`.
- The 2026-07-09 engine bug/performance audit closed all 16 confirmed
  correctness, parity, lifecycle, and algorithmic findings. The remaining
  watch item is cross-hardware dense-physics and browser GPU-memory history
  before setting tighter release budgets.
- Active PRD bundle for the adapter-surface remediation:
  `docs/PRDs/other/adapter-surface-remediation-2026-07-08/README.md`.

Legend: 🔴 urgent systemic risk, 🟡 watch or harden next, 🟢 acceptable with
normal maintenance.

## System Map

Urgent items stay first. Add or revise rows when a new system lands, a claim is
promoted, or code quality is clearly in a bad place.

| Status | System | Current quality risk | Next action | Evidence |
| --- | --- | --- | --- | --- |
| 🟡 | Physics, collision, and character movement | The audited correctness gaps are closed: native rotation/angular velocity and sensor semantics are retained, web Rapier state persists, and native copyback/overlap/signature churn is reduced. Dense-world budgets still need long-running hardware history. | Keep the 100/1,000-body web benchmark and native focused physics suite green; add 5,000-body hardware samples before tightening release budgets. | `packages/runtime-web-three/src/physics.test.ts`; `runtime-bevy/crates/threenative_runtime/tests/physics.rs` |
| 🟡 | Rendering, materials, lights, cameras, and post-processing | Live renderable/component reconciliation, six-face cubemaps, bidirectional visibility, shadow precedence, portable layer capacity, and ownership-aware web teardown are implemented. Browser GPU-memory baselines remain environment-sensitive. | Retain mount/dispose browser probes and parity screenshots as the resource-lifetime and capture-path gates. | `packages/runtime-web-three/src/render.test.ts`; `packages/runtime-web-three/src/mapWorld.test.ts`; `runtime-bevy/crates/threenative_runtime/tests/rendering_atmosphere.rs` |
| 🟡 | IR/source/runtime contract truth | Contract truth is still broad, but high-risk drift now has typed registry metadata, optional-field checks, compiler literal checks, enum drift checks, and schemas for systems/gameFlow/prefabs. | Keep remaining unschemed documents as incremental follow-up slices; run IR drift tests before schema/DTO/compiler changes. | `docs/PRDs/done/other/system-code-quality-remediation-2026-07-08/PRD-003-ir-document-contract-truth-hardening.md`; `packages/ir/src/contractDrift.test.ts`; `packages/ir/schemas/systems.schema.json`; `pnpm --filter @threenative/ir test` |
| 🟡 | Native game loop scheduling | Startup, fixed-step accumulator, pause, interpolation, frame, tick, and update/postUpdate ordering now share fixture-backed expectations across web and native. | Keep new scheduling behavior tied to `loop-scheduling/expectations.json`; broaden only through shared fixture snapshots. | `docs/PRDs/done/other/system-code-quality-remediation-2026-07-08/PRD-002-native-web-game-loop-scheduling-contract.md`; `packages/ir/fixtures/contracts/loop-scheduling/expectations.json`; `packages/runtime-web-three/src/gameLoop.test.ts`; `runtime-bevy/crates/threenative_runtime/tests/game_loop_contract.rs` |
| 🟡 | Native scripted spawn/despawn reconciliation | Native script spawn/despawn/instantiate effects now reconcile bundle mutations into live Bevy ECS entities, hierarchy, recursive despawn, and collider teardown proof. | Keep command/effect traces honest: live reconciliation evidence must accompany future script structural command claims. | `docs/PRDs/done/other/system-code-quality-remediation-2026-07-08/PRD-001-native-scripted-spawn-despawn-live-reconciliation.md`; `runtime-bevy/crates/threenative_runtime/src/lib.rs`; `runtime-bevy/crates/threenative_runtime/tests/systems_effects.rs`; `cargo test -p threenative_runtime --lib scripted_runtime_should --manifest-path runtime-bevy/Cargo.toml` |
| 🟡 | Compiler bundle emission | Bundle planning, asset dependency discovery, and staged filesystem writing are split, with direct unit coverage for planning, writer behavior, asset copy planning, merges, and structured readers. | Keep `emitBundle` routed through planner/writer seams; add planner assertions for new document/capability outputs before changing writers. | `docs/PRDs/done/other/system-code-quality-remediation-2026-07-08/PRD-004-compiler-bundle-planning-writer-split.md`; `packages/compiler/src/emit/bundle.ts`; `packages/compiler/src/emit/bundle-writer.ts`; `packages/compiler/src/emit/merge.test.ts`; `pnpm --filter @threenative/compiler test -- --run bundle` |
| 🟡 | Authoring operations and mutation surfaces | Operation truth is still broad, but migrated scene/material/runtime/UI operations carry executable CLI adapter metadata, and editor composites/add-component payloads now route through one metadata layer over authoring descriptors. | Continue shrinking explicit adapter-surface drift allowlists as remaining command/editor surfaces gain descriptors. | `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-002-adapter-surface-drift-gates.md`; `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-004-executable-authoring-operation-descriptors.md`; `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-005-editor-operation-metadata-and-composite-recipes.md`; `tools/verify/src/adapterSurfaceDrift.test.ts`; `packages/authoring/src/operationRegistry.ts`; `packages/editor/src/operations/editorOperationMetadata.ts`; `pnpm --filter @threenative/authoring test`; `pnpm verify:editor-required-operations` |
| 🟡 | CLI command surface | `tn` command metadata, help, and migrated dispatch now route through an incremental typed command registry, and source-document hot spots can derive CLI usage/argv from executable authoring operation descriptors. Some large command families still own local argv parsing. | Continue migrating remaining command families behind descriptors or explicit drift diagnostics. | `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-003-cli-command-registry-and-shared-arg-plumbing.md`; `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-004-executable-authoring-operation-descriptors.md`; `packages/cli/src/commands/registry.ts`; `packages/cli/src/commands/sourceDocuments.ts`; `packages/cli/src/index.test.ts`; `pnpm --filter @threenative/cli test`; manual smoke: `tn actor list --json`, `tn build --project templates/structured-source-starter --json`, `tn proof diff --from /tmp/tn-proof-a.json --to /tmp/tn-proof-b.json --json` |
| 🟡 | Editor source operations | Editor operation metadata now decorates authoring descriptors, owns add-component payload builders, and defines composite recipes used by both store plans and server execution; required-operation smoke covers default-scene and terrain composites. | Keep new editor operations descriptor-backed or add explicit metadata and smoke coverage with the operation. | `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-005-editor-operation-metadata-and-composite-recipes.md`; `packages/editor/src/operations/editorOperationMetadata.ts`; `packages/editor/src/adapters/editorModel.test.ts`; `packages/editor/src/state/editorStore.ts`; `packages/editor/src/server/operationApi.ts`; `tools/verify/src/editorRequiredOperations.ts`; `pnpm --filter @threenative/editor test`; `pnpm verify:editor-required-operations` |
| 🟡 | Generated-game verification | Release enrollment and proof requirements come from project-local `production.releaseProof` config, example lifecycle policy comes from `examples/manifest.json`, and visual-quality proof now requires a reusable `game-quality` metric bundle that is checked against screenshot metrics. | Keep generated-game release/build-only enrollment derived from config and examples manifest before promoting additional examples; keep new proof sidecars bundle-backed instead of adding one-off JSON checks. | `docs/PRDs/done/other/adapter-surface-remediation-2026-07-08/PRD-001-generated-game-proof-enrollment-from-config.md`; `docs/PRDs/done/other/leverage-points-2026-07-09/PRD-005-example-template-manifest-ownership.md`; `docs/PRDs/done/other/leverage-points-2026-07-09/PRD-007-visual-metrics-expansion.md`; `tools/verify/src/gameProductionGate.ts`; `tools/verify/src/gameProductionGateProofs.ts`; `tools/verify/src/exampleManifest.ts`; `examples/manifest.json`; `pnpm --filter @threenative/verify-tools test -- --run "visual-quality proof|visual metric|generated-game visual"` |
| 🟡 | Scripting host and services | Web and Bevy separately reconstruct context services, commands, resources, observations, and host bridges. Broad host changes are hard to prove. | Add service-by-service parity fixtures for animation, audio, physics, picking, UI, persistence, resources, and lifecycle. | `packages/runtime-web-three/src/systems`, `runtime-bevy/crates/threenative_runtime/src/systems_context.rs`, `runtime-bevy/crates/threenative_runtime/src/systems_host_bridge.rs`, `docs/status/capabilities/scripting.md` |
| 🟡 | Animation, particles, and VFX | Promoted subset is bounded, but graph/blend/morph/mask/particle semantics span SDK/IR/runtime adapters and residual gates. | Add small conformance fixtures before expanding graph, morph, mask, property animation, or particle behavior. | `packages/sdk/src/animation.ts`, `packages/ir/src/animation-residuals.test.ts`, `runtime-bevy/crates/threenative_runtime/src/animation.rs`, `docs/bevy-feature-parity.md` |
| 🟡 | UI, text, widgets, and accessibility | Web DOM overlay and Bevy UI have separate layout, widgets, input, binding, accessibility, font, and style semantics. Several native UI rows remain trace/metadata only. | Maintain widget-family conformance fixtures and negative tests for unsupported layout/style semantics before expanding native UI. | `packages/runtime-web-three/src/ui`, `runtime-bevy/crates/threenative_runtime/src/ui.rs`, `docs/status/capabilities/ui.md` |
| 🟡 | Assets, glTF, scenes, terrain, and streaming | Asset source, manifest, inspection, dependency bundling, glTF fidelity, terrain generation, and runtime loading span many packages and gates. | Keep asset claims manifest-backed; add drift tests when adding formats, loaders, glTF extension handling, terrain, or streaming policy. | `docs/status/capabilities/assets.md`, `packages/ir/src/assetValidation.ts`, `packages/compiler/src/emit`, `runtime-bevy/crates/threenative_runtime/src/assets.rs` |
| 🟡 | Audio | Surface is smaller, but web real sink behavior and Bevy playback/trace state differ; production audio and custom/streaming sources are still bounded. | Keep claims trace-bounded and compare script audio lifecycle plus native missing/non-audio asset diagnostics. | `packages/runtime-web-three/src/audio.ts`, `runtime-bevy/crates/threenative_runtime/src/audio.rs`, `docs/bevy-feature-parity.md` |
| 🟡 | Input, picking, and controls | Keyboard/pointer/gamepad/touch/UI action semantics span source docs, runtime snapshots, Bevy input capture, playtests, and UI routing. | Add targeted fixtures when changing canonical key codes, pointer deltas, touch/gamepad gestures, picking, or UI action routing. | `packages/runtime-web-three/src/input.ts`, `runtime-bevy/crates/threenative_runtime/src/input.rs`, `docs/bevy-feature-parity.md` |
| 🟡 | Camera, transforms, math, and geometry | Core transform semantics are stable, but helpers, interpolation, generated meshes, terrain, render targets, and follow/orbit behavior cross runtime adapters. | Keep transform-patch and helper semantics covered by shared fixtures; isolate geometry generation from runtime mapping. | `packages/runtime-web-three/src/cameras.ts`, `runtime-bevy/crates/threenative_runtime/src/cameras.rs`, `docs/bevy-feature-parity.md` |
| 🟡 | Persistence, settings, and local data | Save/settings behavior is promoted, but storage migration, autosave/checkpoint hooks, and cloud/account boundaries remain sensitive. | Require fixture coverage for migration/versioning and restore flow before adding new persisted surfaces. | `packages/sdk/src/persistence.ts`, `packages/ir/src/localDataValidation.ts`, `docs/bevy-feature-parity.md` |
| 🟡 | GameFlow, sequences, spawners, and declarative gameplay | Promoted traces exist, but this is a growing gameplay layer over source, compiler, runtime, and conformance contracts. | Keep new trigger/action/track kinds fail-closed until a shared fixed-tick trace fixture proves them. | `docs/status/capabilities/game-production.md`, `runtime-bevy/crates/threenative_runtime/src/game_flow.rs`, `runtime-bevy/crates/threenative_runtime/src/sequences.rs`, `runtime-bevy/crates/threenative_runtime/src/spawner.rs` |
| 🟡 | Playtest, proof, and performance tooling | Verification is disciplined, but orchestration files are broad. Agent IO, session-cost, and webview-package gates now derive focused dispatch and release artifact enrollment from gate descriptors, with reviewed migration gaps for remaining inline focused gates. | Keep migrating release/focused gates behind descriptors before adding new release constants, and model conflict policies in descriptor data. | `packages/cli/src/commands/playtest.ts`, `tools/verify/src/gateDescriptors.ts`, `tools/verify/src/cli/run.ts`, `tools/verify/src/release.ts`, `docs/status/capabilities/tooling-proof.md`; `pnpm --filter @threenative/verify-tools test` |
| 🟡 | Templates and starters | Maintained starter generated files, instruction files, package scripts, and proof command ids are owned by `threenative.template.json`, and `verify:template-production` derives script/instruction/API-card/proof checks from those manifests. CLI template registry truth remains a separate follow-up surface. | Keep new starter policy in template manifests and add a registry drift check before expanding starter families. | `templates/*/threenative.template.json`, `packages/cli/src/templates/registry.ts`, `templates/*/package.json`, `templates/*/AGENTS.md`, `tools/verify/src/templateProductionGate.ts`; `pnpm verify:template-production` |
| 🟡 | Examples and benchmark projects | Examples have manifest-owned lifecycle classification, and release/build-only generated-game gates derive from `examples/manifest.json` plus project config. The new build-only `examples/neon-harbor-rescue` mid-size forcing function exposes follow-up gaps for catalog art, full local-data persistence, and interactive settings proof before release enrollment. Dependency, proof, and artifact strategies still differ by release, build-only, and benchmark-only role. | Continue deriving build/proof gates from `examples/manifest.json` before adding new example roles or promotions; convert repeated Neon Harbor friction into focused implementation PRDs. | `examples/manifest.json`, `examples/neon-harbor-rescue/FRICTION.md`, `tools/verify/src/exampleManifest.ts`, `tools/verify/src/gameProductionGate.ts`, `tools/verify/src/exampleBuildSweep.ts` |
| 🟡 | Docs/status claims | Capability pages, parity doc, STATUS front door, release gates, and this log can drift from executable registries. | Link each promoted system claim to one owning registry/gate artifact instead of duplicating capability truth in prose. | `docs/STATUS.md`, `docs/bevy-feature-parity.md`, `docs/status/capabilities/*.md` |
| 🟢 | Public SDK physics collider cleanup | The SDK/IR cylinder collider mismatch is mitigated; renderable cylinder mesh remains distinct from portable physics colliders. | Watch for downstream migration needs after `cylinderCollider()` removal. | `docs/status/code-quality-audit-2026-07-04.md`, `packages/sdk/src/physics.ts`, `packages/ir/src/physics.test.ts` |
| 🟢 | Verification gate discipline | Focused gates, artifact policy, release aggregation, and tests exist. Main risk is registry sprawl, not absence of proof culture. | Keep gates focused and descriptor-backed as new systems are added. | `tools/verify/src/*.test.ts`, `tools/verify/src/release.ts`, `package.json` |

## Verification Expectations

- Runtime contract changes: run the narrow package tests plus
  `pnpm verify:conformance`.
- Native runtime changes: include relevant `cargo test` coverage under
  `runtime-bevy`.
- Compiler or IR emission changes: snapshot emitted files and manifest shape,
  then run compiler and IR tests.
- Authoring, CLI, editor, template, or proof-gate changes: run the narrow
  package tests plus the relevant focused verify gate.
- Docs-only status updates: no verification required beyond checking links and
  Markdown readability.

## Update Rules

- Add or revise an entry when introducing a new runtime, compiler, authoring,
  verification, editor, asset, platform, or gameplay system.
- Add or revise an entry when local work reveals systemic fragility, duplicated
  contract truth, hard-to-test orchestration, unsafe boundaries, or sustained
  technical debt.
- Use 🔴, 🟡, or 🟢 and keep 🔴 rows at the top.
- Prefer short dated edits over long audit prose.
- Move items to 🟢 only when the behavior is changed and verification is
  recorded.
- Link the deeper audit, PRD, capability page, or test artifact instead of
  copying details here.
