# References

These references informed the initial architecture and ECS compatibility
decisions. They are not product dependencies by themselves.

## Bevy

- Bevy `World`: stores entities, components, resources, and metadata. This is
  the reason the portable model treats entities, components, and resources as
  first-class IR concepts.
  <https://docs.rs/bevy/latest/bevy/prelude/struct.World.html>
- Bevy `Query`: systems access selected component data through typed queries and
  filters. This maps to declared system read/write sets and query metadata in
  `systems.ir.json`.
  <https://docs.rs/bevy/latest/bevy/prelude/struct.Query.html>
- Bevy `Commands`: structural changes are queued and applied at schedule
  boundaries. This maps to the SDK command buffer for spawn, despawn, and
  component insertion/removal.
  <https://docs.rs/bevy/latest/bevy/prelude/struct.Commands.html>
- Bevy `Transform` and `GlobalTransform`: local transforms are authored, while
  global transforms are computed through hierarchy propagation. This maps to
  local transform storage in `world.ir.json`.
  <https://docs.rs/bevy/latest/bevy/prelude/struct.GlobalTransform.html>
- Bevy `Camera`: cameras are components on entities, with render graph details
  handled by the adapter.
  <https://docs.rs/bevy/latest/bevy/prelude/struct.Camera.html>

## Three.js

- Three.js `Object3D`: parent-child relationships, names, visibility, and
  `userData` shape the scene-style SDK surface.
  <https://threejs.org/docs/pages/Object3D.html>
- Three.js `Mesh`: mesh authoring maps naturally to geometry plus material
  components in ECS.
  <https://threejs.org/docs/pages/Mesh.html>
- Three.js `BufferGeometry`: arbitrary geometry buffers are powerful, but V1
  should treat them as immutable imported/generated mesh assets unless a dynamic
  mesh capability is added.
  <https://threejs.org/docs/pages/BufferGeometry.html>
- Three.js `Material`: renderer hooks such as `onBeforeCompile` are not portable
  to native runtimes and should fail validation unless represented by a portable
  material/shader IR.
  <https://threejs.org/docs/pages/Material.html>

## Related AI Tooling

- `jbuehler23/bevy-agent`: useful as a reference for AI-assisted Bevy project
  workflows, including templates, project metadata, conversation/build history,
  and quick build/check loops. ThreeNative should use those workflow ideas while
  keeping Bevy Rust behind the runtime adapter.
  <https://github.com/jbuehler23/bevy-agent>
- `laurigates/claude-plugins` Bevy skill: useful summary of common Bevy
  organization patterns such as plugins, resources, events, marker components,
  schedules, and quick agent checks.
  <https://github.com/laurigates/claude-plugins/blob/main/bevy-plugin/skills/bevy-game-engine/SKILL.md>
