# Runtime Backend Boundary

ThreeNative authors target SDK declarations and validated IR. Runtime adapters
may use Three.js, Bevy, or adapter-private helper libraries internally, but
bundle JSON must remain the portable source of truth.

## Physics and Navigation

V9-02 promotes a backend-neutral small-game contract:

- primitive box, sphere, and capsule rigid-body solver metadata
- primitive broad sensors with fixed enter/stay/exit snapshots
- bounded character object pushing through `CharacterController.pushPolicy`
- static convex navigation regions queried through `navigation.path`

Public Rapier, Avian, Bevy, native physics, or navmesh handles are not portable
authoring data. The IR validator rejects backend handles, dynamic navmesh
rebakes, crowd steering, off-mesh links, joints, constraints, and
nondeterministic solver settings with stable diagnostics before runtime.

Adapters may accelerate promoted behavior with private backend libraries only
when `pnpm verify:v9:physics-character` still produces identical web/native
observations and drift reports.

## Deferred Promotion Criteria

Dynamic mesh colliders, public physics backend selection, dynamic navmesh
baking, and arbitrary sloped mesh terrain need a later PRD with accepted and
rejected fixtures, matching web/native trace artifacts, bounded performance
evidence, and diagnostics that distinguish portable static data from
adapter-private runtime state.
