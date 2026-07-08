# Stylized Nature Component — Bevy Parity Report (2026-07-07)

Scope: `examples/stylized-nature-component` rendered by
`runtime-bevy/crates/threenative_runtime` versus the Three.js reference in
`packages/runtime-web-three/src/worldMapping/stylizedNature.ts`.

The example bundle is **source-backed**: `grass-blades-up.glb`,
`tree-leaves-mesh.glb`, and `tree-tronk-transformed.glb` are present in
`dist/stylized-nature-component.bundle/assets` and pass the native
compatibility check in `stylized_nature.rs` (`resolve_source_assets`). That
matters because most of the Bevy defects below live in — or are triggered by —
the source-backed code path in `map_world.rs::spawn_stylized_nature`.

## Root causes at a glance

| # | Defect | Severity | Where |
|---|--------|----------|-------|
| 1 | Wind never attached to source-backed grass | Critical | `map_world.rs:1017-1044` |
| 2 | Grass/leaves render single-sided (`cull_mode` not disabled) | Critical | `map_world.rs:737-750`, `map_world.rs:1490-1508` |
| 3 | Wind math weaker than reference, missing pitch component | High | `map_world.rs:625-640` |
| 4 | Fake sky billboard spawned even though scene has an equirect skybox | High | `map_world.rs:864-878` |
| 5 | Ground textures not tiled (8× repeat missing) | High | `map_world.rs:696-713` |
| 6 | Dirt/path texture blend (path mask + noise + AO) not implemented | High | `map_world.rs:1271-1343` |
| 7 | Terrain and blade normals hardcoded — no shading from terrain relief | Medium | `map_world.rs:1298`, `map_world.rs:1464` |
| 8 | Procedural-fallback grass smaller/sparser than reference | Medium | `map_world.rs:1047-1063` |
| 9 | Material constants drift (roughness, missing roughness map) | Low | `map_world.rs:748` |
| 10 | `leavesAlphaMap` ignored — canopy renders as solid shells | Low | `map_world.rs:770` |

Note: the web runtime itself does not wind-animate source-backed grass either
(`createSourceGrass` never sets `threeNativeGrassWind`,
`stylizedNature.ts:243-278`). So matching the *original Three.js demo* means
fixing the Bevy side as described in §1/§3 **and** back-porting the same wind
state to `attachStylizedSourceAssets` on the web side.

---

## 1. No wind on source-backed grass (the "no wind effects" bug)

`spawn_stylized_nature` has two grass branches. The procedural branch inserts
`NativeGrassWindMotion`; the source-mesh branch (`grass_mesh.1 == true`,
`map_world.rs:1019-1044`) spawns a bare `PbrBundle` and `continue`s. Since this
example resolves `grass-blades-up.glb`, **every blade is static**.

Fix — attach the same motion component in the source branch:

```rust
// map_world.rs, inside `if grass_mesh.1 { ... }` (~line 1032)
let base_transform = Transform::from_xyz(x, y, z)
    .with_rotation(Quat::from_rotation_y(yaw))
    .with_scale(Vec3::splat(instance_scale));
children.push(
    world
        .spawn(PbrBundle {
            mesh: grass_mesh.0.clone(),
            material: grass_material.clone(),
            transform: base_transform,
            ..Default::default()
        })
        .insert((
            Name::new(format!("{entity_id}.source-grass-{index}")),
            NativeGrassWindMotion {
                base: base_transform,
                phase: random.next() * std::f32::consts::TAU + x * 0.17 + z * 0.11,
                strength: wind_strength,
            },
        ))
        .id(),
);
```

The system is already registered (`lib.rs:270`), so this alone makes the field
move.

## 2. Grass and leaves are backface-culled

The reference uses `THREE.DoubleSide` on grass and leaf materials. In Bevy,
`StandardMaterial::double_sided: true` only fixes *lighting* of back faces —
back faces are still **culled** unless `cull_mode: None` is set. Result: half
the grass blades vanish depending on view angle, and the leaf-card canopy has
holes. This is a large part of "grass doesn't look like the original".

Fix in the grass material (`map_world.rs:737-750`):

```rust
let grass_material = world
    .resource_mut::<Assets<StandardMaterial>>()
    .add(StandardMaterial {
        base_color: grass_policy.base_color,
        // ... texture fields unchanged ...
        double_sided: true,
        cull_mode: None,                 // <-- required for DoubleSide parity
        perceptual_roughness: 0.85,      // reference source grass uses 0.85
        ..Default::default()
    });
```

And in `add_stylized_tree_material` (`map_world.rs:1490-1508`):

```rust
StandardMaterial {
    base_color: color,
    double_sided,
    cull_mode: if double_sided { None } else { Some(Face::Back) },
    alpha_mode: if double_sided { AlphaMode::Mask(0.1) } else { AlphaMode::Opaque },
    perceptual_roughness: 0.9,
    ..Default::default()
}
```

(`use bevy::render::render_resource::Face;`)

## 3. Wind math diverges from the reference

Reference (`stylizedNature.ts:126-128`):

```ts
const gust = Math.sin(t * 2.4 + phase) * 0.16
           + Math.sin(t * 4.1 + phase * 0.37) * 0.055;
euler.set(base.x + gust * 0.22, base.y, base.z + gust * windStrength);
```

Bevy (`map_world.rs:634-639`) uses amplitudes `0.12 / 0.04`, applies **only a
Z rotation**, and post-multiplies the base quaternion instead of recomposing
the Euler triple. With the scene's `windStrength: 0.25` the residual sway is
~1°, effectively invisible, and the characteristic forward-back pitch nod is
missing entirely.

Fix — store the base Euler angles on the component and recompose exactly like
the reference:

```rust
#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeGrassWindMotion {
    pub base: Transform,
    pub base_euler: Vec3, // (pitch, yaw, roll) captured at spawn
    pub phase: f32,
    pub strength: f32,
}

pub fn animate_native_stylized_motion(/* ... */) {
    let elapsed = time.elapsed_seconds();
    for (motion, mut transform) in &mut grass_query {
        let gust = (elapsed * 2.4 + motion.phase).sin() * 0.16
            + (elapsed * 4.1 + motion.phase * 0.37).sin() * 0.055;
        let mut next = motion.base;
        next.rotation = Quat::from_euler(
            EulerRot::XYZ,
            motion.base_euler.x + gust * 0.22,
            motion.base_euler.y,
            motion.base_euler.z + gust * motion.strength,
        );
        *transform = next;
    }
    // ...
}
```

At spawn, `base_euler` is simply the `(pitch, yaw, roll)` you already computed
before building the quaternion (procedural branch) or `(0.0, yaw, 0.0)`
(source branch).

### 3b. Longer term: move wind to the vertex shader

5000 grass entities each getting a `Transform` write per frame is CPU-heavy
and rotates blades rigidly around their pivot, while the original demo bends
blades (tips move, roots stay). A `MaterialExtension` does both better and lets
Bevy's automatic batching keep working:

```rust
use bevy::pbr::{ExtendedMaterial, MaterialExtension};
use bevy::render::render_resource::{AsBindGroup, ShaderRef};

#[derive(Asset, AsBindGroup, Reflect, Debug, Clone)]
pub struct GrassWindExtension {
    #[uniform(100)]
    pub wind: Vec4, // x: strength, y: time, z/w: direction
}

impl MaterialExtension for GrassWindExtension {
    fn vertex_shader() -> ShaderRef { "shaders/grass_wind.wgsl".into() }
}
// App: MaterialPlugin::<ExtendedMaterial<StandardMaterial, GrassWindExtension>>::default()
```

```wgsl
// shaders/grass_wind.wgsl (vertex stage sketch, Bevy 0.14)
// Weight sway by blade height so roots stay planted:
let height_weight = vertex.position.y;           // 0 at root, ~0.5 at tip
let world = mesh_functions::get_world_from_local(vertex.instance_index);
let world_pos = mesh_functions::mesh_position_local_to_world(world, vec4(vertex.position, 1.0));
let phase = world_pos.x * 0.17 + world_pos.z * 0.11;
let gust = sin(wind.y * 2.4 + phase) * 0.16 + sin(wind.y * 4.1 + phase * 0.37) * 0.055;
var displaced = vertex.position;
displaced.x += gust * wind.x * height_weight * 2.0;
displaced.z += gust * wind.x * height_weight * 0.6;
```

A small `Update` system writes `time.elapsed_seconds()` into `wind.y` on the
single material asset — one uniform write instead of 5000 transforms, and it
covers source-backed and procedural grass identically.

## 4. Fake sky billboard fights the authored skybox

The web runtime deliberately dropped the sky card for source-backed scenes
("keep the old fake sky card out of the render", `stylizedNature.ts:345-346`).
The Bevy port gates the *clouds* on `!source_backed` but pushes the
`stylized-soft-sky-gradient` rectangle unconditionally (`map_world.rs:864-878`)
— a ~96×44 unlit quad floating at `z = -15` in the middle of a scene that
already has the `sky_88_2k.png` equirect skybox
(`content/environment/stylized-nature.environment.json`). It occludes trees,
terrain, and the real sky.

Fix — same gate as the clouds:

```rust
if !source_backed {
    children.push(world.spawn(PbrBundle { mesh: sky_mesh, /* ... */ }) /* ... */ .id());
}
```

## 5. Ground textures are stretched, not tiled

The reference tiles grass color/normal/roughness maps 8×8
(`material.map.repeat.set(8, 8)`, `stylizedNature.ts:463`). The Bevy terrain
mesh has UVs spanning 0..1 across the full 40 m patch and the material never
sets `uv_transform`, so `grass_05_basecolor_1k.webp` is smeared once over the
whole ground. (Sampler wrap already defaults to `Repeat` in
`assets.rs::apply_texture_sampler_controls`, so only the UV scale is missing.)

Fix in `add_stylized_surface_material` (`map_world.rs:1206-1224`):

```rust
use bevy::math::Affine2;

StandardMaterial {
    base_color: color,
    base_color_texture,
    normal_map_texture,
    uv_transform: Affine2::from_scale(Vec2::splat(8.0)), // parity with repeat.set(8, 8)
    double_sided,
    perceptual_roughness: roughness,
    ..Default::default()
}
```

Add a `uv_repeat: f32` parameter so the path ribbon (which already bakes its
7× repeat into UVs, `map_world.rs:1252`) can pass `1.0`.

## 6. Dirt/path blend is a vertex-color approximation only

The reference ground shader (`stylizedNature.ts:544-593`) blends:

- tiled dirt base color, modulated by dirt AO,
- driven by `max(pathMaskMap sample, per-vertex path mask)`,
- broken up with the perlin `noiseMap`,
- plus a matching roughness blend.

The Bevy terrain (`add_source_masked_terrain_mesh`) bakes an approximate blend
into vertex colors and ignores `dirtColorMap`, `dirtAoMap`, `dirtRoughnessMap`,
`pathMaskMap`, and `noiseMap` completely in the source-backed path (the dirt
textures are only referenced by the path ribbon, which is skipped when
`source_backed`). The result is a flat-tinted path with no dirt texture detail.

Two options, in order of fidelity:

**Option A (recommended): `ExtendedMaterial` ground shader.** Same mechanism as
§3b; port the fragment logic directly:

```wgsl
// fragment stage of ground extension
let tiled_uv = in.uv * 8.0;
let dirt = textureSample(dirt_map, dirt_sampler, tiled_uv).rgb;
let dirt_ao = textureSample(dirt_ao_map, dirt_ao_sampler, tiled_uv).r;
let mask = max(textureSample(path_mask_map, path_mask_sampler, in.uv).r, in.color.a); // pack vertex mask in COLOR alpha
let noise = textureSample(noise_map, noise_sampler, in.uv * 2.0).r;
let adjusted = clamp(mask + (noise - 0.5) * 0.18, 0.0, 1.0);
let dirt_weight = smoothstep(0.35, 0.55, adjusted);
out_color = vec4(mix(base.rgb, dirt * mix(0.72, 1.0, dirt_ao), dirt_weight), base.a);
```

Pack the per-vertex path mask into the terrain mesh's `COLOR` alpha channel
(currently hardcoded `1.0`, `map_world.rs:1323`) — it mirrors the web's
`threeNativePathMask` vertex attribute without needing a custom attribute.

**Option B (cheap stopgap): split terrain into two meshes** — grass region and
path region by `dirt_weight > 0.5` — each with its own tiled textured
`StandardMaterial`. Loses soft blend edges but restores texture detail with no
custom shader.

## 7. Normals are hardcoded — terrain and grass shade flat

- Terrain: `normals.push([0.0, 1.0, 0.0])` (`map_world.rs:1298`) even though
  vertices displace by `stylized_terrain_height` and sink 0.25 under the path.
  The reference calls `computeVertexNormals()`. Under the scene's directional
  sun the Bevy ground loses all relief shading and the path reads as a flat
  decal.
- Grass blades: constant `[0.0, 0.35, 0.94]` for all 7 blades regardless of
  blade angle (`map_world.rs:1464`).

Terrain fix — the height field is analytic, so use central differences (this
also captures the path depression):

```rust
fn stylized_terrain_normal(x: f32, z: f32, size: f32, path_width: f32) -> [f32; 3] {
    let h = |x: f32, z: f32| {
        stylized_terrain_height(x, z)
            - stylized_source_path_mask(x, z, size, path_width) * 0.25
    };
    let e = 0.05;
    let dx = h(x + e, z) - h(x - e, z);
    let dz = h(x, z + e) - h(x, z - e);
    Vec3::new(-dx, 2.0 * e, -dz).normalize().to_array()
}
```

Grass fix — rotate the base normal per blade by the blade's ring angle, or
simply duplicate what Three's `computeVertexNormals` produces by computing the
face normal of each quad's first triangle.

## 8. Procedural-fallback grass is smaller and sparser than the reference

Only relevant when source assets fail to resolve, but worth aligning since it
is the safety net (`map_world.rs:1058-1060` vs `stylizedNature.ts:402-404`):

| Constant | Three.js | Bevy | Fix |
|----------|----------|------|-----|
| Foreground boost | `1.55` | `1.28` | `1.55` |
| Blade scale | `0.85 + r*1.25` | `0.72 + r*1.02` | `0.85 + r*1.25` |
| Height scale factor | `0.9 + r*0.8` | `0.78 + r*0.62` | `0.9 + r*0.8` |
| Terrain segments | `256` | `128` | acceptable, but note it |

Also note the RNG streams already diverge from the web (`Lcg` call order
differs across branches), so exact per-blade placement parity is not expected —
only distribution parity.

## 9. Material constant drift

- Source grass roughness: Three `0.85` vs Bevy `0.74` (`map_world.rs:748`).
  `0.74` is the *procedural* grass value in the web code; the source-backed
  material there uses `0.85`. Pick per `grass_policy` branch.
- `grassRoughnessMap` is never wired in Bevy's procedural grass material; the
  web sets it. Add `metallic_roughness_texture` when the policy exposes it
  (remember Bevy samples roughness from the **green** channel, same as glTF —
  the shipped `grass_05_roughness_1k.webp` is grayscale so it works as-is).

## 10. `leavesAlphaMap` is dead weight

Both runtimes currently ignore it, so the canopy leaf-card mesh renders as
solid geometry with `AlphaMode::Mask(0.1)` and constant alpha 1.0 (mask is a
no-op). Wiring it up is the single biggest tree-fidelity win:

```rust
let leaf_material = world.resource_mut::<Assets<StandardMaterial>>().add(StandardMaterial {
    base_color: leaf_color,
    base_color_texture: stylized_texture_handle(
        component, "leavesAlphaMap", assets_by_id, asset_server.as_ref()),
    alpha_mode: AlphaMode::Mask(0.1),
    double_sided: true,
    cull_mode: None,
    perceptual_roughness: 0.8,
    ..Default::default()
});
```

Caveat: `leaves-alpha-map.png` is an alpha/opacity map — if it is
white-on-black grayscale rather than carrying an alpha channel, it needs a
one-time conversion (bake grayscale into alpha) at bundle build, or a small
material extension that masks on `.r`.

---

## Suggested fix order

1. §2 `cull_mode: None` (two-line change, biggest instant visual win)
2. §1 wind component on source grass + §3 wind math parity (restores motion)
3. §4 remove sky billboard for source-backed scenes
4. §5 `uv_transform` ground tiling
5. §7 terrain normals
6. §6 ground dirt blend (Option A), §3b shader wind, §10 leaf alpha
7. §8/§9 constant alignment

## Verification

- `cargo test -p threenative_runtime` — existing tests in `map_world.rs` /
  `stylized_nature.rs` assert material policy and spawn shape; extend
  `map_world.rs` tests to assert `NativeGrassWindMotion` exists on
  `source-grass-*` entities and that grass material `cull_mode == None`.
- `tn playtest` on the example, then rerun the committed scenario with
  `--target desktop` for release claims (per repo policy).
- `packages/cli/src/verify/baselineVisualParity.ts` already covers this
  component — capture fresh Bevy screenshots against the web baseline after
  each step; §2 and §4 should move the diff the most.
- Manual check for wind: 10-second capture, confirm blade tips oscillate with
  visible ~0.2 rad sway at `windStrength: 0.25`.
