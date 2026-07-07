# Typed Game Spec

Typed game spec is an experimental authoring surface for agents that are better
at TypeScript than raw structured-source JSON. It is additive: canonical
`content/**/*.json`, IR bundles, and runtime adapters remain unchanged.

## Contract

- Public SDK types live in `packages/sdk/src/gameSpecTypes.ts`.
- The compiler vertical slice lives in `packages/compiler/src/gameSpec/`.
- Callers provide project ID unions through the `IGameSpecIds` generic shape.
- `defineTypedGameSpec<Ids>(spec)` preserves the authored object while TypeScript
  checks cross references.
- `compileTypedGameSpec(spec)` emits existing authoring document shapes:
  scene, input, and material source documents.
- `generateTypedGameSpecIdTypes(documents)` produces a project-specific ID
  interface from existing structured source.

## Covered Round-4 Failure Classes

| Failure class | Typed-spec handling |
|---------------|---------------------|
| invalid entity references | entity references use the generated `Ids["entity"]` union |
| invalid input action IDs | `CharacterController.moveXAxis/moveZAxis` use `Ids["input"]` |
| invalid material IDs | `MeshRenderer.material` uses `Ids["material"]` |
| invalid resource IDs | system resource access and UI bindings use `Ids["resource"]` |
| legacy rigid-body kind | `RigidBody.kind` is `"dynamic" | "kinematic" | "static"` |
| malformed transform tuples | transforms use fixed `[number, number, number]` tuples |

## Non-Goals

- No raw Three.js, DOM, filesystem, worker, timer, renderer handle, or native
  runtime handle authoring.
- No replacement for canonical structured source or IR bundles.
- No default starter migration until benchmark evidence justifies it.
- No broad schema mirror; the first slice covers high-friction game-authoring
  shapes only.

## Migration Shape

1. Generate or hand-maintain a project ID interface.
2. Author `src/game.spec.ts` with `defineTypedGameSpec<ProjectIds>()`.
3. Compile the spec to canonical `content/**/*.json`.
4. Run existing `tn authoring validate`, `tn build`, `tn iterate`, and playtest
   proof commands.

The initial implementation proves the type boundary and emitted structured
source. Starter defaults, cookbook entries, and benchmark trial evidence remain
decision-gated follow-up work before this surface can become the default.
