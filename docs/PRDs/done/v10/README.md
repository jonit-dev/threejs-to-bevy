# V10 PRDs

V10 is the final-gap planning batch after the implemented V9 parity push. It
does not assume every remaining Bevy-derived feature should become portable.
Instead, it assigns the remaining unchecked backlog in
`docs/bevy-feature-parity.md` to one of three outcomes:

- promote through SDK/IR, validation, compiler output, web Three.js, native
  Bevy, conformance, examples, and docs evidence;
- keep diagnostic-only until web and Bevy can prove equivalent behavior; or
- keep explicitly non-portable because it violates the ThreeNative product
  boundary.

## Scope Rules

- The IR bundle remains the stable contract between compiler, CLI, web runtime,
  and native Bevy runtime.
- Bevy stays an internal native runtime adapter; authors do not write Bevy code
  through the TypeScript SDK.
- Raw Three.js, raw renderer passes, public runtime plugin escape hatches,
  arbitrary platform APIs, networking, replication, and online collaboration are
  never promoted unless a V10 PRD narrows them to diagnostics or target-profile
  metadata.
- Each promoted feature must include accepted and rejected IR validation, web
  and native observations, docs/status updates, and a focused verification
  command before it can be checked off in the parity document.
- Advanced visual features may be report-only first, but checklist completion
  requires screenshot or deterministic observation evidence appropriate to the
  feature.

## Tickets

| Order | PRD | Primary Checklist Coverage | Outcome |
| --- | --- | --- | --- |
| 1 | [V10-01 Scope, Triage, and Release Gate](./V10-01-scope-triage-and-release-gate.md) | Remaining-backlog ownership, aggregate V10 gate, diagnostics policy, parity drift guards | Contributors get one front door for final-gap work and a rule for deciding promotion, diagnostics-only, or non-portable status. |
| 2 | [V10-02 Advanced Renderer, Materials, and Physics](./V10-02-advanced-renderer-materials-and-physics.md) | Advanced lights/materials/shaders/post-processing/instancing plus dynamic mesh collider policy | High-end renderer and physics gaps either gain narrow portable contracts or stable unsupported diagnostics with promotion criteria. |
| 3 | [V10-03 Cross-Runtime Visual Calibration](./V10-03-cross-runtime-visual-calibration.md) | Isolated and combined-scene color/material/lighting/atmosphere/post/geometry/dense visual calibration | Web Three.js and native Bevy must pass measurable calibration before advanced visual features can be promoted. |
| 4 | [V10-04 Production Platform, Audio, Assets, and Release](./V10-04-production-platform-audio-assets-and-release.md) | Custom asset/audio extension policy, streaming diagnostics, cloud-save boundary, signed/mobile packaging, profiler/budget maturity | Production platform gaps are triaged into portable local workflows, target-profile diagnostics, or non-portable online/platform boundaries. |
| 5 | [V10-05 ECS Tags, Groups, and Scene Containers](./V10-05-ecs-tags-groups-and-scene-containers.md) | Gameplay grouping, marker tags, scene hierarchy containers, and authoring guidance for Godot-style group expectations | Authors get a clear split: ECS tags for queryable gameplay membership, scene `Group` containers for transform/editor organization, and asset groups only for loading. |

Editor UI, visual inspector panels, and broader authoring-tool UX remain outside
this V10 batch except for the narrow scene-container metadata described in
V10-05. They should stay unchecked in the parity tracker until a dedicated
editor/UI planning pass is requested.

## Release Gate

V10-01 implements the aggregate planning gate and drift guard:

```bash
pnpm check:docs
pnpm verify:v10
```

`pnpm check:docs` is the canonical docs and drift gate. `pnpm verify:v10` is a
temporary planning-batch aggregate that proves V10 ownership, non-portable
boundary diagnostics, and artifact/report wiring until those checks are folded
into capability/release gates. V10-02, V10-03, and V10-04 must still add focused
capability gates for promoted feature work, then wire those gates into the
release verifier before claiming checklist completion.
