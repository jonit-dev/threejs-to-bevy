# PRD: Modular Template Migration and Proof

Complexity: 9 -> HIGH mode

Score basis: +2 template migration, +2 CLI/authoring flow proof, +1 beginner and AI ergonomics, +1 smoke/conformance gates, +1 docs updates, +1 web visual proof, +1 native proof where claimed.

## 1. Context

After the authoring core, graph, SDK declarations, script manifest, and host conformance are stable, canonical templates must stop teaching one giant `src/game.ts` as the default architecture. Templates should become the primary proof that the modular model is understandable, buildable, and AI-friendly.

Depends on:

- `agent-safe-scene-authoring-cli.md`
- `authoring-graph-provenance-capture.md`
- `modular-sdk-authoring-declarations.md`
- `script-module-references-and-manifest.md`
- `web-bevy-scripting-host-conformance.md`

## 2. Goal

Migrate canonical templates/examples to modular authoring and prove they still build, validate, and run in the normal web/native pipeline.

## 3. Non-goals

- Do not redesign template visuals beyond what is needed for proof.
- Do not remove compatibility templates unless explicitly planned.
- Do not add editor UI.
- Do not claim native support without native proof.

## 4. Target Template Shape

```txt
src/game.ts                    # small composition root
src/scenes/arena.ts            # lifecycle scene
src/scenes/arena.entities.ts   # visual/entity declarations
src/scenes/arena.prefabs.ts    # prefabs and overrides
src/scenes/arena.systems.ts    # system metadata/script refs
src/scripts/player.ts          # behavior modules
src/input/arena.input.ts
src/ui/race-hud.tsx or structured UI refs
src/assets/catalog.ts
```

## 5. Implementation Phases

### Phase 1: Starter functional template

- [ ] Make `templates/starter-functional/src/game.ts` a small composition root.
- [ ] Split visual scene, ECS/resource declarations, input, UI, audio, assets, and scripts.
- [ ] Add concise comments explaining editor-owned vs code-owned files.
- [ ] Validate with `tn scene validate --json` where applicable.

Verification:

```bash
pnpm verify:smoke
```

### Phase 2: Scripting/game starter templates

- [ ] Migrate `templates/v4-scripting` to script module refs.
- [ ] Migrate `templates/v5-game-starter` to modular declarations.
- [ ] Keep beginner path simple and readable.

Verification:

```bash
pnpm verify:smoke
pnpm verify:conformance
```

### Phase 3: CLI init/create smoke

- [ ] Ensure `tn init`/`tn create` emits modular template shape.
- [ ] Run template validation/build from a fresh generated project.
- [ ] Capture web screenshot/verify proof for at least one canonical template.
- [ ] Capture native Bevy smoke proof only for templates that claim native support.

Verification:

```bash
pnpm verify:smoke
pnpm verify:conformance
```

## 6. Acceptance Criteria

- [ ] Canonical templates no longer teach a giant one-file `src/game.ts` as the recommended path.
- [ ] Templates use modular declarations and script refs.
- [ ] `tn scene validate --json` works on generated projects where applicable.
- [ ] Fresh template projects build through normal CLI flow.
- [ ] Web visual proof exists for a migrated template.
- [ ] Native proof exists for any migrated template that claims native support.
- [ ] Docs explain ownership boundaries in beginner-friendly language.
