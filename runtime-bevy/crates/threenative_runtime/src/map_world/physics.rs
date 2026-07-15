struct StylizedNatureSettings {
    bark_color: Color,
    grass_count: usize,
    leaf_color: Color,
    path_width: f32,
    size: f32,
    tree_count: usize,
    wind_strength: f32,
}

impl StylizedNatureSettings {
    fn from_component(component: &serde_json::Value) -> Self {
        Self {
            bark_color: json_color(
                component,
                "barkColor",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.bark_color,
            ),
            grass_count: json_usize(
                component,
                "grassCount",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.fallback_grass_count,
            ),
            leaf_color: json_color(
                component,
                "leafColor",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.leaf_color,
            ),
            path_width: json_f32(
                component,
                "pathWidth",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.path_width,
            )
            .max(0.1),
            size: json_f32(component, "size", STYLIZED_NATURE_RUNTIME_DEFAULTS.size).max(0.1),
            tree_count: json_usize(
                component,
                "treeCount",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.tree_count,
            ),
            wind_strength: json_f32(
                component,
                "windStrength",
                STYLIZED_NATURE_RUNTIME_DEFAULTS.wind_strength,
            )
            .max(0.0),
        }
    }
}

struct StylizedNatureMaterials {
    bark: Handle<StandardMaterial>,
    cloud: Handle<StandardMaterial>,
    cloud_shadow: Handle<StandardMaterial>,
    grass: Handle<StandardMaterial>,
    leaf: Handle<StandardMaterial>,
    path_crack: Handle<StandardMaterial>,
    path_pebble: Handle<StandardMaterial>,
    sky: Handle<StandardMaterial>,
    source_path: Handle<StandardMaterial>,
    terrain: Handle<StandardMaterial>,
}

struct StylizedNatureMeshes {
    cloud: Handle<Mesh>,
    grass: (Handle<Mesh>, bool),
    leaf: Handle<Mesh>,
    path_crack: Handle<Mesh>,
    path_pebble: Handle<Mesh>,
    sky: Handle<Mesh>,
    source_path: Handle<Mesh>,
    terrain: Handle<Mesh>,
    trunk: Handle<Mesh>,
}

struct PreparedStylizedNature {
    materials: StylizedNatureMaterials,
    meshes: StylizedNatureMeshes,
    source_assets: crate::stylized_nature::StylizedSourceAssets,
    source_backed: bool,
}

struct StylizedNatureSpawnContext<'a> {
    entity_id: &'a str,
    prepared: &'a PreparedStylizedNature,
    settings: &'a StylizedNatureSettings,
}

fn prepare_stylized_nature(
    world: &mut World,
    component: &serde_json::Value,
    assets_by_id: &HashMap<&str, &AssetIr>,
    bundle_path: &Path,
    settings: &StylizedNatureSettings,
) -> PreparedStylizedNature {
    let asset_server = world.get_resource::<AssetServer>().cloned();
    let source_assets =
        resolve_source_assets(component, assets_by_id, asset_server.as_ref(), bundle_path);
    let source_backed = source_assets.grass_mesh.is_some()
        || source_assets.leaves_mesh.is_some()
        || source_assets.trunk_scene.is_some();
    let source_ground_maps =
        StylizedSourceGroundMaps::load(component, assets_by_id, bundle_path, source_backed);
    let materials = prepare_stylized_nature_materials(
        world,
        component,
        assets_by_id,
        bundle_path,
        asset_server.as_ref(),
        settings,
        &source_assets,
        source_backed,
    );
    let meshes = prepare_stylized_nature_meshes(
        world,
        component,
        settings,
        &source_assets,
        source_backed,
        source_ground_maps.as_ref(),
    );
    PreparedStylizedNature {
        materials,
        meshes,
        source_assets,
        source_backed,
    }
}

struct StylizedNaturePreparationContext<'a> {
    assets_by_id: &'a HashMap<&'a str, &'a AssetIr>,
    asset_server: Option<&'a AssetServer>,
    bundle_path: &'a Path,
    component: &'a serde_json::Value,
    source_assets: &'a crate::stylized_nature::StylizedSourceAssets,
}

fn prepare_stylized_nature_materials(
    world: &mut World,
    component: &serde_json::Value,
    assets_by_id: &HashMap<&str, &AssetIr>,
    bundle_path: &Path,
    asset_server: Option<&AssetServer>,
    settings: &StylizedNatureSettings,
    source_assets: &crate::stylized_nature::StylizedSourceAssets,
    source_backed: bool,
) -> StylizedNatureMaterials {
    let context = StylizedNaturePreparationContext {
        assets_by_id,
        asset_server,
        bundle_path,
        component,
        source_assets,
    };
    let grass_color_texture = stylized_texture_handle(
        component,
        "grassColorMap",
        assets_by_id,
        asset_server,
        bundle_path,
    );
    let terrain = add_stylized_surface_material(
        world,
        Color::WHITE,
        0.88,
        false,
        if source_backed {
            None
        } else {
            grass_color_texture
        },
        stylized_texture_handle(
            component,
            "grassNormalMap",
            assets_by_id,
            asset_server,
            bundle_path,
        ),
        stylized_texture_handle(
            component,
            "grassRoughnessMap",
            assets_by_id,
            asset_server,
            bundle_path,
        ),
        8.0,
    );
    let path_crack = add_color_material(world, Color::srgb(0.27, 0.16, 0.11), 1.0);
    let path_pebble = add_color_material(world, Color::srgb(0.76, 0.49, 0.31), 1.0);
    let grass = prepare_stylized_grass_material(world, &context);
    let source_path = prepare_stylized_path_material(world, &context);
    let bark = add_stylized_tree_material(world, settings.bark_color, false, None, 0.95);
    let source_leaves_backed = source_assets.leaves_mesh.is_some();
    let leaf_color = if source_leaves_backed {
        source_leaf_native_color(settings.leaf_color)
    } else {
        settings.leaf_color
    };
    let leaf = add_stylized_tree_material(
        world,
        leaf_color,
        true,
        stylized_texture_handle(
            component,
            "leavesAlphaMap",
            assets_by_id,
            asset_server,
            bundle_path,
        ),
        if source_leaves_backed { 0.8 } else { 0.82 },
    );
    let (sky, cloud, cloud_shadow) = prepare_stylized_sky_materials(world, &context);
    StylizedNatureMaterials {
        bark,
        cloud,
        cloud_shadow,
        grass,
        leaf,
        path_crack,
        path_pebble,
        sky,
        source_path,
        terrain,
    }
}

fn add_color_material(world: &mut World, color: Color, roughness: f32) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            perceptual_roughness: roughness,
            ..Default::default()
        })
}

fn prepare_stylized_sky_materials(
    world: &mut World,
    context: &StylizedNaturePreparationContext<'_>,
) -> (
    Handle<StandardMaterial>,
    Handle<StandardMaterial>,
    Handle<StandardMaterial>,
) {
    let sky = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::WHITE,
            base_color_texture: texture_handle_by_id(
                "tex.stylized-scene.sky",
                context.assets_by_id,
                context.asset_server,
                context.bundle_path,
            ),
            unlit: true,
            double_sided: true,
            cull_mode: None,
            ..Default::default()
        });
    let cloud = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgba(0.95, 0.97, 0.96, 0.92),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            double_sided: true,
            cull_mode: None,
            ..Default::default()
        });
    let cloud_shadow = world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::srgba(0.68, 0.78, 0.82, 0.28),
            unlit: true,
            alpha_mode: AlphaMode::Blend,
            double_sided: true,
            cull_mode: None,
            ..Default::default()
        });
    (sky, cloud, cloud_shadow)
}

fn prepare_stylized_grass_material(
    world: &mut World,
    context: &StylizedNaturePreparationContext<'_>,
) -> Handle<StandardMaterial> {
    let policy = grass_material_policy(context.component, context.source_assets);
    let texture = |field| {
        stylized_texture_handle(
            context.component,
            field,
            context.assets_by_id,
            context.asset_server,
            context.bundle_path,
        )
    };
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: policy.base_color,
            base_color_texture: policy.base_color_texture_field.and_then(texture),
            normal_map_texture: policy.normal_map_texture_field.and_then(texture),
            metallic_roughness_texture: policy.roughness_texture_field.and_then(texture),
            double_sided: true,
            cull_mode: None,
            perceptual_roughness: policy.roughness,
            ..Default::default()
        })
}

fn prepare_stylized_path_material(
    world: &mut World,
    context: &StylizedNaturePreparationContext<'_>,
) -> Handle<StandardMaterial> {
    let texture = |field| {
        stylized_texture_handle(
            context.component,
            field,
            context.assets_by_id,
            context.asset_server,
            context.bundle_path,
        )
    };
    add_stylized_surface_material(
        world,
        Color::WHITE,
        0.9,
        false,
        texture("dirtColorMap"),
        texture("dirtNormalMap"),
        texture("dirtRoughnessMap"),
        1.0,
    )
}

fn prepare_stylized_nature_meshes(
    world: &mut World,
    component: &serde_json::Value,
    settings: &StylizedNatureSettings,
    source_assets: &crate::stylized_nature::StylizedSourceAssets,
    source_backed: bool,
    source_ground_maps: Option<&StylizedSourceGroundMaps>,
) -> StylizedNatureMeshes {
    let sky = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Rectangle::new(
            settings.size * 2.4,
            settings.size * 1.1,
        )));
    let cloud = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Sphere { radius: 1.0 }));
    let path_crack = add_cuboid_mesh(world, 0.48, 0.018, 0.032);
    let path_pebble = add_cuboid_mesh(world, 0.42, 0.045, 0.22);
    let terrain = add_source_masked_terrain_mesh(
        world,
        settings.size,
        if source_backed {
            THREE_COMPAT_SOURCE_TERRAIN_BAKE_SEGMENTS
        } else {
            256
        },
        settings.path_width,
        json_color(
            component,
            "groundColor",
            STYLIZED_NATURE_RUNTIME_DEFAULTS.native_ground_color,
        ),
        json_color(component, "pathColor", "#9b6543"),
        source_ground_maps,
    );
    let source_path =
        add_source_path_ribbon_mesh(world, settings.size, 120, settings.path_width * 0.92);
    let grass = match source_assets.grass_mesh.clone() {
        Some(mesh) => (mesh, true),
        None => (
            add_grass_blade_mesh(
                world,
                json_color(
                    component,
                    "grassRootColor",
                    STYLIZED_NATURE_RUNTIME_DEFAULTS.grass_geometry_root_color,
                ),
                json_color(
                    component,
                    "grassTipColor",
                    STYLIZED_NATURE_RUNTIME_DEFAULTS.grass_geometry_tip_color,
                ),
            ),
            false,
        ),
    };
    let trunk = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Cylinder::new(0.18, 1.45)));
    let leaf = world
        .resource_mut::<Assets<Mesh>>()
        .add(Mesh::from(Sphere { radius: 1.0 }));
    StylizedNatureMeshes {
        cloud,
        grass,
        leaf,
        path_crack,
        path_pebble,
        sky,
        source_path,
        terrain,
        trunk,
    }
}

fn spawn_stylized_nature(
    world: &mut World,
    entity_id: &str,
    component: &serde_json::Value,
    assets_by_id: &HashMap<&str, &AssetIr>,
    transform: Transform,
    stable_id: ThreeNativeId,
    name: Name,
    bundle_path: &Path,
) -> Entity {
    let settings = StylizedNatureSettings::from_component(component);
    let prepared = prepare_stylized_nature(world, component, assets_by_id, bundle_path, &settings);
    let context = StylizedNatureSpawnContext {
        entity_id,
        prepared: &prepared,
        settings: &settings,
    };

    let parent = world
        .spawn(SpatialBundle {
            transform,
            ..Default::default()
        })
        .insert((stable_id, name))
        .id();
    let mut children = Vec::new();
    spawn_stylized_sky_and_clouds(world, &context, &mut children);
    spawn_stylized_terrain_and_path(world, &context, &mut children);
    spawn_stylized_grass(world, &context, &mut children);
    spawn_stylized_trees(world, &context, &mut children);

    world.entity_mut(parent).push_children(&children);
    parent
}

fn spawn_stylized_sky_and_clouds(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    children: &mut Vec<Entity>,
) {
    if context.prepared.source_backed {
        return;
    }
    let entity_id = context.entity_id;
    let size = context.settings.size;
    let meshes = &context.prepared.meshes;
    let materials = &context.prepared.materials;
    children.push(
        world
            .spawn(PbrBundle {
                mesh: meshes.sky.clone(),
                material: materials.sky.clone(),
                transform: Transform::from_xyz(0.0, size * 0.18, -size * 0.38),
                ..Default::default()
            })
            .insert((
                Name::new(format!("{entity_id}.stylized-soft-sky-gradient")),
                NotShadowCaster,
                NotShadowReceiver,
            ))
            .id(),
    );
    let cloud_groups = [
        (-8.5, size * 0.24, -size * 0.34, 0.82),
        (5.5, size * 0.27, -size * 0.35, 0.68),
    ];
    let cloud_puffs = [
        (0.0, 0.0, 0.0, 2.65, 0.74),
        (-1.55, -0.08, 0.05, 1.65, 0.55),
        (1.55, -0.02, 0.04, 1.85, 0.58),
        (-0.55, 0.34, 0.03, 1.35, 0.48),
        (0.85, 0.26, 0.02, 1.18, 0.42),
    ];
    for (cloud_index, (cx, cy, cz, group_scale)) in cloud_groups.iter().copied().enumerate() {
        for (puff_index, (px, py, pz, sx, sy)) in cloud_puffs.iter().copied().enumerate() {
            let transform =
                Transform::from_xyz(cx + px * group_scale, cy + py * group_scale, cz + pz)
                    .with_scale(Vec3::new(sx * group_scale, sy * group_scale, 0.12));
            children.push(
                world
                    .spawn(PbrBundle {
                        mesh: meshes.cloud.clone(),
                        material: materials.cloud.clone(),
                        transform,
                        ..Default::default()
                    })
                    .insert((
                        Name::new(format!("{entity_id}.soft-cloud-{cloud_index}-{puff_index}")),
                        NotShadowCaster,
                        NotShadowReceiver,
                    ))
                    .id(),
            );
            if puff_index == 0 || puff_index == 2 {
                children.push(
                    world
                        .spawn(PbrBundle {
                            mesh: meshes.cloud.clone(),
                            material: materials.cloud_shadow.clone(),
                            transform: Transform::from_xyz(
                                cx + px * group_scale + 0.08,
                                cy + py * group_scale - 0.18,
                                cz + pz - 0.02,
                            )
                            .with_scale(Vec3::new(
                                sx * group_scale * 0.95,
                                sy * group_scale * 0.48,
                                0.08,
                            )),
                            ..Default::default()
                        })
                        .insert((
                            Name::new(format!(
                                "{entity_id}.soft-cloud-shadow-{cloud_index}-{puff_index}"
                            )),
                            NotShadowCaster,
                            NotShadowReceiver,
                        ))
                        .id(),
                );
            }
        }
    }
}

fn spawn_stylized_terrain_and_path(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    children: &mut Vec<Entity>,
) {
    let entity_id = context.entity_id;
    let settings = context.settings;
    let meshes = &context.prepared.meshes;
    let materials = &context.prepared.materials;
    children.push(
        world
            .spawn(PbrBundle {
                mesh: meshes.terrain.clone(),
                material: materials.terrain.clone(),
                transform: Transform::IDENTITY,
                ..Default::default()
            })
            .insert(Name::new(format!(
                "{entity_id}.stylized-rolling-grass-ground"
            )))
            .id(),
    );
    if context.prepared.source_backed {
        return;
    }
    children.push(
        world
            .spawn(PbrBundle {
                mesh: meshes.source_path.clone(),
                material: materials.source_path.clone(),
                transform: Transform::from_xyz(0.0, 0.045, 0.0),
                ..Default::default()
            })
            .insert(Name::new(format!("{entity_id}.source-dirt-path-ribbon")))
            .id(),
    );
    let mut random = Lcg::new(2401);
    for index in 0..96usize {
        let z = settings.size / 2.0 - (index as f32 / 95.0) * settings.size
            + (random.next() - 0.5) * 0.45;
        let x = stylized_path_center(z) + (random.next() - 0.5) * settings.path_width * 0.72;
        let y = stylized_terrain_height(x, z) + 0.09;
        let yaw = random.next() * std::f32::consts::TAU;
        let scale = Vec3::new(0.75 + random.next() * 0.85, 1.0, 0.7 + random.next() * 0.65);
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: meshes.path_pebble.clone(),
                    material: materials.path_pebble.clone(),
                    transform: Transform::from_xyz(x, y, z)
                        .with_rotation(Quat::from_rotation_y(yaw))
                        .with_scale(scale),
                    ..Default::default()
                })
                .insert(Name::new(format!("{entity_id}.path-pebble-{index}")))
                .id(),
        );
        if index % 3 == 0 {
            let crack_x = x + (random.next() - 0.5) * 0.18;
            let crack_z = z + (random.next() - 0.5) * 0.18;
            children.push(
                world
                    .spawn(PbrBundle {
                        mesh: meshes.path_crack.clone(),
                        material: materials.path_crack.clone(),
                        transform: Transform::from_xyz(crack_x, y + 0.018, crack_z)
                            .with_rotation(Quat::from_rotation_y(yaw + random.next() * 0.65))
                            .with_scale(Vec3::new(0.65 + random.next() * 0.55, 1.0, 0.7)),
                        ..Default::default()
                    })
                    .insert(Name::new(format!("{entity_id}.path-crack-{index}")))
                    .id(),
            );
        }
    }
}

fn spawn_stylized_grass(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    children: &mut Vec<Entity>,
) {
    let settings = context.settings;
    let grass_mesh = &context.prepared.meshes.grass;
    let grass_material = &context.prepared.materials.grass;
    let mut random = Lcg::new(1337);
    let mut written = 0usize;
    let mut attempts = 0usize;
    while written < settings.grass_count && attempts < settings.grass_count * 4 {
        attempts += 1;
        let Some((base_transform, base_euler, name)) = stylized_grass_transform(
            &mut random,
            settings,
            grass_mesh.1,
            written,
            context.entity_id,
        ) else {
            continue;
        };
        let position = base_transform.translation;
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: grass_mesh.0.clone(),
                    material: grass_material.clone(),
                    transform: base_transform,
                    ..Default::default()
                })
                .insert((
                    Name::new(name),
                    NativeGrassWindMotion {
                        base: base_transform,
                        base_euler,
                        phase: random.next() * std::f32::consts::TAU
                            + position.x * 0.17
                            + position.z * 0.11,
                        strength: settings.wind_strength,
                    },
                ))
                .id(),
        );
        written += 1;
    }
}

fn stylized_grass_transform(
    random: &mut Lcg,
    settings: &StylizedNatureSettings,
    source_mesh: bool,
    index: usize,
    entity_id: &str,
) -> Option<(Transform, Vec3, String)> {
    if source_mesh {
        let x = (random.next() - 0.5) * settings.size;
        let z = (random.next() - 0.5) * settings.size;
        if stylized_source_path_mask(x, z, settings.size, settings.path_width) > 0.16 {
            return None;
        }
        let yaw = random.next() * std::f32::consts::TAU;
        let scale = 1.3 * (0.85 + random.next() * 0.35);
        return Some((
            Transform::from_xyz(x, stylized_terrain_height(x, z), z)
                .with_rotation(Quat::from_rotation_y(yaw))
                .with_scale(Vec3::splat(scale)),
            Vec3::new(0.0, yaw, 0.0),
            format!("{entity_id}.source-grass-{index}"),
        ));
    }
    let z_bias = random.next().powf(1.65);
    let z = settings.size / 2.0 - z_bias * settings.size;
    let x = (random.next() - 0.5) * settings.size * (0.72 + z_bias * 0.32);
    if stylized_source_path_mask(x, z, settings.size, settings.path_width)
        > 0.14 + random.next() * 0.12
    {
        return None;
    }
    let pitch = (random.next() - 0.5) * 0.12;
    let yaw = random.next() * std::f32::consts::TAU;
    let roll = (random.next() - 0.5) * settings.wind_strength;
    let blade_scale = if z > 0.0 { 1.55 } else { 1.1 } * (0.85 + random.next() * 1.25);
    let height_scale = blade_scale * (0.9 + random.next() * 0.8);
    Some((
        Transform::from_xyz(x, stylized_terrain_height(x, z) + 0.035, z)
            .with_rotation(Quat::from_euler(EulerRot::XYZ, pitch, yaw, roll))
            .with_scale(Vec3::new(blade_scale, height_scale, blade_scale)),
        Vec3::new(pitch, yaw, roll),
        format!("{entity_id}.stylized-grass-{index}"),
    ))
}

fn spawn_stylized_trees(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    children: &mut Vec<Entity>,
) {
    let anchors = [
        (13.0, -13.0, 0.0, 1.0),
        (-13.0, -13.0, 2.1, 0.9),
        (-13.0, 13.0, 4.0, 1.1),
        (13.0, 13.0, 1.0, 0.95),
    ];
    for (index, (x, z, yaw, scale)) in anchors
        .iter()
        .copied()
        .take(context.settings.tree_count.min(anchors.len()))
        .enumerate()
    {
        let tree_parent = world
            .spawn(SpatialBundle {
                transform: Transform::from_xyz(x, stylized_terrain_height(x, z), z)
                    .with_rotation(Quat::from_rotation_y(yaw))
                    .with_scale(Vec3::splat(scale)),
                ..Default::default()
            })
            .insert(Name::new(format!(
                "{}.rounded-stylized-tree-{index}",
                context.entity_id
            )))
            .id();
        let mut tree_children = Vec::new();
        spawn_stylized_tree_trunk(world, context, index, &mut tree_children);
        spawn_stylized_tree_leaves(world, context, index, &mut tree_children);
        world.entity_mut(tree_parent).push_children(&tree_children);
        children.push(tree_parent);
    }
}

fn spawn_stylized_tree_trunk(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    index: usize,
    children: &mut Vec<Entity>,
) {
    let entity_id = context.entity_id;
    if let Some(source_scene) = context.prepared.source_assets.trunk_scene.as_ref() {
        children.push(
            world
                .spawn(SceneBundle {
                    scene: source_scene.clone(),
                    transform: Transform::from_scale(Vec3::splat(12.0)),
                    ..Default::default()
                })
                .insert(Name::new(format!("{entity_id}.tree-{index}.source-trunk")))
                .id(),
        );
    } else {
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: context.prepared.meshes.trunk.clone(),
                    material: context.prepared.materials.bark.clone(),
                    transform: Transform::from_xyz(0.0, 3.6, 0.0)
                        .with_scale(Vec3::new(1.45, 5.0, 1.45)),
                    ..Default::default()
                })
                .insert(Name::new(format!("{entity_id}.tree-{index}.trunk")))
                .id(),
        );
    }
}

fn spawn_stylized_tree_leaves(
    world: &mut World,
    context: &StylizedNatureSpawnContext<'_>,
    index: usize,
    children: &mut Vec<Entity>,
) {
    let entity_id = context.entity_id;
    let leaf_material = &context.prepared.materials.leaf;
    if let Some(source_mesh) = context.prepared.source_assets.leaves_mesh.as_ref() {
        let offsets = [
            (-0.47, 7.59, 0.48, 0.0, 0.85),
            (-3.87, 6.79, -4.47, 1.3, 0.76),
            (-2.08, 10.5, 0.18, 2.5, 0.9),
        ];
        for (leaf_index, (x, y, z, yaw, scale)) in offsets.iter().copied().enumerate() {
            children.push(
                world
                    .spawn(PbrBundle {
                        mesh: source_mesh.clone(),
                        material: leaf_material.clone(),
                        transform: Transform::from_xyz(x, y, z)
                            .with_rotation(Quat::from_rotation_y(yaw))
                            .with_scale(Vec3::splat(scale)),
                        ..Default::default()
                    })
                    .insert(Name::new(format!(
                        "{entity_id}.tree-{index}.source-leaves-{leaf_index}"
                    )))
                    .insert(NotShadowReceiver)
                    .id(),
            );
        }
        return;
    }
    let offsets = [
        (-0.47, 7.35, 0.48, 0.0, Vec3::new(2.65, 1.85, 2.25)),
        (-3.35, 6.55, -3.75, 1.3, Vec3::new(2.2, 1.55, 1.95)),
        (-2.08, 9.55, 0.18, 2.5, Vec3::new(2.35, 1.72, 2.05)),
        (1.15, 7.05, -2.1, 0.7, Vec3::new(1.7, 1.28, 1.55)),
        (-1.65, 8.35, 2.35, 2.9, Vec3::new(1.55, 1.16, 1.42)),
        (-4.35, 7.55, -0.85, 1.9, Vec3::new(1.45, 1.05, 1.35)),
    ];
    for (leaf_index, (x, y, z, yaw, scale)) in offsets.iter().copied().enumerate() {
        children.push(
            world
                .spawn(PbrBundle {
                    mesh: context.prepared.meshes.leaf.clone(),
                    material: leaf_material.clone(),
                    transform: Transform::from_xyz(x, y, z)
                        .with_rotation(Quat::from_rotation_y(yaw))
                        .with_scale(scale),
                    ..Default::default()
                })
                .insert(Name::new(format!(
                    "{entity_id}.tree-{index}.leaf-{leaf_index}"
                )))
                .id(),
        );
    }
}

fn stylized_path_center(z: f32) -> f32 {
    (z * 0.18).sin() * 1.35 + (z * 0.055 + 1.2).sin() * 0.9
}

fn stylized_terrain_height(x: f32, z: f32) -> f32 {
    let rise = (-z).max(0.0) * 0.055;
    rise + (x * 0.18 + z * 0.12).sin() * 0.12 + (z * 0.2).cos() * 0.08
}

fn add_stylized_surface_material(
    world: &mut World,
    color: Color,
    roughness: f32,
    double_sided: bool,
    base_color_texture: Option<Handle<Image>>,
    normal_map_texture: Option<Handle<Image>>,
    metallic_roughness_texture: Option<Handle<Image>>,
    uv_repeat: f32,
) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: color,
            base_color_texture,
            normal_map_texture,
            metallic_roughness_texture,
            uv_transform: Affine2::from_scale(Vec2::splat(uv_repeat)),
            double_sided,
            cull_mode: if double_sided { None } else { Some(Face::Back) },
            perceptual_roughness: roughness,
            ..Default::default()
        })
}

fn add_source_path_ribbon_mesh(
    world: &mut World,
    size: f32,
    segments: usize,
    width: f32,
) -> Handle<Mesh> {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    for zi in 0..=segments {
        let t = zi as f32 / segments as f32;
        let z = size / 2.0 - t * size;
        let center = stylized_path_center(z);
        let dz = 0.05;
        let tangent_x = stylized_path_center(z - dz) - stylized_path_center(z + dz);
        let tangent = Vec2::new(tangent_x, -2.0 * dz).normalize_or_zero();
        let normal = Vec2::new(-tangent.y, tangent.x);
        let left = Vec2::new(center, z) - normal * width * 0.5;
        let right = Vec2::new(center, z) + normal * width * 0.5;
        let left_y = stylized_terrain_height(left.x, left.y) + 0.035;
        let right_y = stylized_terrain_height(right.x, right.y) + 0.035;
        positions.push([left.x, left_y, left.y]);
        positions.push([right.x, right_y, right.y]);
        normals.extend([[0.0, 1.0, 0.0]; 2]);
        uvs.push([0.0, t * 7.0]);
        uvs.push([1.0, t * 7.0]);
    }
    for zi in 0..segments {
        let base = (zi * 2) as u32;
        indices.extend([base, base + 2, base + 1, base + 1, base + 2, base + 3]);
    }

    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

struct StylizedSourceGroundMaps {
    grass_color: Option<SampledImage>,
    dirt_color: Option<SampledImage>,
    dirt_ao: Option<SampledImage>,
    dirt_height: Option<SampledImage>,
    noise: Option<SampledImage>,
    path_mask: Option<SampledImage>,
}

impl StylizedSourceGroundMaps {
    fn load(
        component: &Value,
        assets_by_id: &HashMap<&str, &AssetIr>,
        bundle_path: &Path,
        source_backed: bool,
    ) -> Option<Self> {
        source_backed.then(|| Self {
            grass_color: sampled_component_texture(
                component,
                "grassColorMap",
                assets_by_id,
                bundle_path,
            ),
            dirt_color: sampled_component_texture(
                component,
                "dirtColorMap",
                assets_by_id,
                bundle_path,
            ),
            dirt_ao: sampled_component_texture(component, "dirtAoMap", assets_by_id, bundle_path),
            dirt_height: sampled_component_texture(
                component,
                "dirtHeightMap",
                assets_by_id,
                bundle_path,
            ),
            noise: sampled_component_texture(component, "noiseMap", assets_by_id, bundle_path),
            path_mask: sampled_component_texture(
                component,
                "pathMaskMap",
                assets_by_id,
                bundle_path,
            ),
        })
    }

    fn path_mask(&self, u: f32, v: f32) -> f32 {
        self.path_mask
            .as_ref()
            .map(|image| image.sample_luma_clamped(u, v))
            .unwrap_or(0.0)
    }

    fn edge_noise(&self, u: f32, v: f32) -> f32 {
        self.noise
            .as_ref()
            .map(|image| image.sample_luma_clamped(u * 2.0, v * 2.0))
            .unwrap_or(0.5)
    }

    fn dirt_height(&self, u: f32, v: f32) -> f32 {
        self.dirt_height
            .as_ref()
            .map(|image| image.sample_luma_repeat(u * 8.0, v * 8.0))
            .unwrap_or(0.5)
    }

    fn grass_rgb(&self, u: f32, v: f32, fallback: [f32; 3]) -> [f32; 3] {
        self.grass_color
            .as_ref()
            .map(|image| image.sample_rgb_repeat(u * 8.0, v * 8.0))
            .unwrap_or(fallback)
    }

    fn dirt_rgb(&self, u: f32, v: f32, fallback: [f32; 3]) -> [f32; 3] {
        self.dirt_color
            .as_ref()
            .map(|image| image.sample_rgb_repeat(u * 8.0, v * 8.0))
            .unwrap_or(fallback)
    }

    fn dirt_ao(&self, u: f32, v: f32) -> f32 {
        self.dirt_ao
            .as_ref()
            .map(|image| image.sample_luma_repeat(u * 8.0, v * 8.0))
            .unwrap_or(1.0)
    }
}

struct SampledImage {
    rgba: image::RgbaImage,
    width: u32,
    height: u32,
}

impl SampledImage {
    fn open(path: &Path) -> Option<Self> {
        let rgba = image::open(path).ok()?.to_rgba8();
        let (width, height) = rgba.dimensions();
        Some(Self {
            rgba,
            width,
            height,
        })
    }

    fn sample_rgb_repeat(&self, u: f32, v: f32) -> [f32; 3] {
        let [r, g, b, _] = self.sample_repeat(u, v);
        [r, g, b]
    }

    fn sample_luma_repeat(&self, u: f32, v: f32) -> f32 {
        let [r, g, b, _] = self.sample_repeat(u, v);
        (r + g + b) / 3.0
    }

    fn sample_luma_clamped(&self, u: f32, v: f32) -> f32 {
        let [r, g, b, _] = self.sample(u.clamp(0.0, 1.0), v.clamp(0.0, 1.0));
        (r + g + b) / 3.0
    }

    fn sample_repeat(&self, u: f32, v: f32) -> [f32; 4] {
        self.sample(u.rem_euclid(1.0), v.rem_euclid(1.0))
    }

    fn sample(&self, u: f32, v: f32) -> [f32; 4] {
        let x = u * (self.width.saturating_sub(1)) as f32;
        let y = (1.0 - v) * (self.height.saturating_sub(1)) as f32;
        let x0 = x.floor() as u32;
        let y0 = y.floor() as u32;
        let x1 = (x0 + 1).min(self.width - 1);
        let y1 = (y0 + 1).min(self.height - 1);
        let tx = x - x0 as f32;
        let ty = y - y0 as f32;
        let top = lerp_rgba(self.pixel_rgba(x0, y0), self.pixel_rgba(x1, y0), tx);
        let bottom = lerp_rgba(self.pixel_rgba(x0, y1), self.pixel_rgba(x1, y1), tx);
        lerp_rgba(top, bottom, ty)
    }

    fn pixel_rgba(&self, x: u32, y: u32) -> [f32; 4] {
        let pixel = self
            .rgba
            .get_pixel(x.min(self.width - 1), y.min(self.height - 1));
        [
            pixel[0] as f32 / 255.0,
            pixel[1] as f32 / 255.0,
            pixel[2] as f32 / 255.0,
            pixel[3] as f32 / 255.0,
        ]
    }
}

fn lerp_rgba(a: [f32; 4], b: [f32; 4], t: f32) -> [f32; 4] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
    ]
}

fn sampled_component_texture(
    component: &Value,
    key: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    bundle_path: &Path,
) -> Option<SampledImage> {
    let asset_id = component.get(key)?.as_str()?;
    let asset = assets_by_id.get(asset_id)?;
    if asset.kind != "texture" {
        return None;
    }
    let path = asset.path.as_ref()?;
    let path = native_texture_sidecar_path(path, bundle_path).unwrap_or_else(|| path.clone());
    SampledImage::open(&bundle_path.join(path))
}

fn add_source_masked_terrain_mesh(
    world: &mut World,
    size: f32,
    segments: usize,
    path_width: f32,
    grass_color: Color,
    dirt_color: Color,
    source_maps: Option<&StylizedSourceGroundMaps>,
) -> Handle<Mesh> {
    let mut positions: Vec<[f32; 3]> = Vec::new();
    let mut colors: Vec<[f32; 4]> = Vec::new();
    let mut normals: Vec<[f32; 3]> = Vec::new();
    let mut uvs: Vec<[f32; 2]> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let grass_fallback = color_to_rgb(grass_color);
    let dirt = color_to_rgb(dirt_color);
    let dark = [0.247, 0.545, 0.231];
    let mid = [0.369, 0.667, 0.271];
    let light = [0.475, 0.741, 0.306];
    let near_path_grass = [0.4, 0.655, 0.275];

    for zi in 0..=segments {
        let z = -size / 2.0 + (zi as f32 / segments as f32) * size;
        for xi in 0..=segments {
            let x = -size / 2.0 + (xi as f32 / segments as f32) * size;
            let u = x / size + 0.5;
            let v = 1.0 - (z / size + 0.5);
            let vertex_path_mask = stylized_source_path_mask(x, z, size, path_width);
            let texture_path_mask = source_maps
                .map(|maps| maps.path_mask(u, v))
                .unwrap_or(vertex_path_mask);
            let path_mask = source_maps
                .map(|_| texture_path_mask.max(vertex_path_mask))
                .unwrap_or(vertex_path_mask);
            let dirt_height = source_maps
                .map(|maps| maps.dirt_height(u, v))
                .unwrap_or(0.5);
            let y = if source_maps.is_some() {
                stylized_terrain_height(x, z) - vertex_path_mask * 0.25
            } else {
                stylized_terrain_height(x, z) + (dirt_height - 0.5) * 0.15 * path_mask
                    - path_mask * 0.25
            };
            positions.push([x, y, z]);
            normals.push(stylized_terrain_normal(x, z, size, path_width));
            uvs.push([
                xi as f32 / segments as f32,
                1.0 - zi as f32 / segments as f32,
            ]);

            let mut c = if let Some(maps) = source_maps {
                let grass_rgb = maps.grass_rgb(u, v, [1.0, 1.0, 1.0]);
                [
                    grass_rgb[0] * grass_fallback[0],
                    grass_rgb[1] * grass_fallback[1],
                    grass_rgb[2] * grass_fallback[2],
                ]
            } else {
                let t = ((z + size / 2.0) / size).clamp(0.0, 1.0) * 0.55;
                let mut grass = lerp_rgb(light, mid, t);
                let path_distance = (x - stylized_path_center(z)).abs();
                if path_distance < path_width * 1.8 {
                    grass = lerp_rgb(grass, near_path_grass, 0.35);
                }
                lerp_rgb(grass, dark, (-z / size).max(0.0) * 0.22)
            };

            let edge_noise = source_maps
                .map(|maps| maps.edge_noise(u, v))
                .unwrap_or_else(|| {
                    0.5 + 0.5 * (x * 1.7 + z * 0.9).sin() * (x * 0.6 - z * 1.2).sin()
                });
            let height_bias = if source_maps.is_some() {
                0.0
            } else {
                (dirt_height - 0.5) * 0.35
            };
            let noise_strength = if source_maps.is_some() { 0.18 } else { 0.25 };
            let adjusted_mask =
                (path_mask + (edge_noise - 0.5) * noise_strength + height_bias).clamp(0.0, 1.0);
            let dirt_weight = smoothstep(0.35, 0.55, adjusted_mask);
            let dirt_shaded = if let Some(maps) = source_maps {
                let ao = maps.dirt_ao(u, v);
                let dirt_rgb = maps.dirt_rgb(u, v, dirt);
                let ao_factor = 0.72 + (1.0 - 0.72) * ao;
                [
                    dirt_rgb[0] * ao_factor,
                    dirt_rgb[1] * ao_factor,
                    dirt_rgb[2] * ao_factor,
                ]
            } else {
                let speckle = 0.5 + 0.5 * (x * 5.7 + z * 2.4).sin() * (x * 1.9 - z * 6.8).sin();
                let stone = smoothstep(0.42, 0.78, speckle) * smoothstep(0.32, 0.9, path_mask);
                let crack = smoothstep(0.82, 0.96, speckle) * smoothstep(0.2, 0.8, path_mask);
                let path_dust = lerp_rgb(dirt, [0.79, 0.65, 0.5], 0.74);
                let path_stone = [0.87, 0.73, 0.58];
                let mut shaded = lerp_rgb(path_dust, path_stone, stone * 0.45);
                shaded = [
                    shaded[0] * (0.96 - crack * 0.28),
                    shaded[1] * (0.94 - crack * 0.24),
                    shaded[2] * (0.9 - crack * 0.18),
                ];
                shaded
            };
            c = lerp_rgb(c, dirt_shaded, dirt_weight);
            colors.push([c[0], c[1], c[2], path_mask]);
        }
    }
    for zi in 0..segments {
        for xi in 0..segments {
            let a = (zi * (segments + 1) + xi) as u32;
            let row = (segments + 1) as u32;
            indices.extend([a, a + row, a + 1, a + 1, a + row, a + row + 1]);
        }
    }
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh.insert_attribute(Mesh::ATTRIBUTE_UV_0, uvs);
    mesh.insert_indices(Indices::U32(indices));
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn stylized_source_path_mask(x: f32, z: f32, size: f32, path_width: f32) -> f32 {
    let vertical_center = (z * 0.18).sin() * 1.15 + (z * 0.055 + 1.2).sin() * 0.75;
    let vertical = 1.0
        - smoothstep(
            path_width * 0.42,
            path_width * 0.9,
            (x - vertical_center).abs(),
        );

    let horizontal_center = (x * 0.12 + 0.8).sin() * 1.1;
    let horizontal = 1.0
        - smoothstep(
            path_width * 0.34,
            path_width * 0.82,
            (z - horizontal_center).abs(),
        );

    let branch_center = -9.0 + ((x + size * 0.25) * 0.2).sin() * 1.1;
    let branch = 1.0
        - smoothstep(
            path_width * 0.24,
            path_width * 0.64,
            (z - branch_center).abs(),
        );
    let branch_gate =
        smoothstep(-size * 0.42, -size * 0.05, x) * (1.0 - smoothstep(size * 0.18, size * 0.42, x));

    let breakup = 0.5 + 0.5 * (x * 1.7 + z * 0.9).sin() * (x * 0.6 - z * 1.2).sin();
    let mask = vertical.max(horizontal).max(branch * branch_gate);
    (mask + (breakup - 0.5) * 0.16).clamp(0.0, 1.0)
}

fn stylized_terrain_normal(x: f32, z: f32, size: f32, path_width: f32) -> [f32; 3] {
    let height = |sample_x: f32, sample_z: f32| {
        stylized_terrain_height(sample_x, sample_z)
            - stylized_source_path_mask(sample_x, sample_z, size, path_width) * 0.25
    };
    let e = 0.05;
    let dx = height(x + e, z) - height(x - e, z);
    let dz = height(x, z + e) - height(x, z - e);
    Vec3::new(-dx, 2.0 * e, -dz).normalize_or_zero().to_array()
}

fn smoothstep(edge0: f32, edge1: f32, value: f32) -> f32 {
    let x = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn color_to_rgb(color: Color) -> [f32; 3] {
    let color = color.to_srgba();
    [color.red, color.green, color.blue]
}

fn source_leaf_native_color(color: Color) -> Color {
    let color = color.to_srgba();
    Color::srgb(
        (color.red * 0.95).clamp(0.0, 1.0),
        (color.green * 1.04).clamp(0.0, 1.0),
        (color.blue * 1.08).clamp(0.0, 1.0),
    )
}

fn stylized_texture_handle(
    component: &serde_json::Value,
    key: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    bundle_path: &Path,
) -> Option<Handle<Image>> {
    let asset_id = component.get(key)?.as_str()?;
    texture_handle_by_id(asset_id, assets_by_id, asset_server, bundle_path)
}

fn texture_handle_by_id(
    asset_id: &str,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    bundle_path: &Path,
) -> Option<Handle<Image>> {
    let asset = assets_by_id.get(asset_id)?;
    if asset.kind != "texture" {
        return None;
    }
    let path = asset.path.as_ref()?;
    let path = native_texture_sidecar_path(path, bundle_path).unwrap_or_else(|| path.clone());
    Some(
        asset_server
            .map(|server| load_texture_asset(server, &path))
            .unwrap_or_default(),
    )
}

fn native_texture_sidecar_path(path: &str, bundle_path: &Path) -> Option<String> {
    let source_path = Path::new(path);
    let stem = source_path.file_stem()?.to_str()?;
    let parent = source_path.parent()?.to_str()?.replace('\\', "/");
    let native_path = format!("{parent}/native/{stem}.png");
    bundle_path
        .join(&native_path)
        .exists()
        .then_some(native_path)
}
