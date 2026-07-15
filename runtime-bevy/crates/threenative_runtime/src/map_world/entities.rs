struct EntitySpawnResources<'a, 'bundle> {
    bundle_path: &'a Path,
    context: &'a NativeWorldEntitySpawnContext<'bundle>,
    material_handles: &'a mut NativeMaterialHandles,
    shader_material_handles: &'a mut NativeShaderMaterialHandles,
}

fn spawn_entity(
    world: &mut World,
    entity: &WorldEntity,
    resources: &mut EntitySpawnResources<'_, '_>,
) -> Result<Entity, MapError> {
    let assets_by_id = &resources.context.assets_by_id;
    let bundle_path = resources.bundle_path;
    let transform = map_transform(entity);
    let name = Name::new(entity.id.clone());
    let stable_id = ThreeNativeId(entity.id.clone());

    if let Some(contact_shadows) = entity.components.contact_shadows.as_ref() {
        return Ok(world
            .spawn(SpatialBundle {
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((
                stable_id,
                name,
                crate::rendering::contact_shadows::NativeContactShadows::from_ir(
                    contact_shadows,
                    resources.context.runtime_config,
                ),
            ))
            .id());
    }

    if let Some(world_text) = entity.components.world_text.as_ref() {
        let mut spawned = world.spawn(Text2dBundle {
            text: Text::from_section(
                world_text.text.clone(),
                TextStyle {
                    font_size: world_text.size.unwrap_or(24.0),
                    color: Color::WHITE,
                    ..Default::default()
                },
            ),
            transform,
            visibility: map_visibility(entity),
            ..Default::default()
        });
        spawned.insert((stable_id, name, crate::world_text::NativeWorldText));
        return Ok(spawned.id());
    }

    if let Some(stylized_nature) = entity.components.extra.get("StylizedNature") {
        return Ok(spawn_stylized_nature(
            world,
            &entity.id,
            stylized_nature,
            assets_by_id,
            transform,
            stable_id,
            name,
            bundle_path,
        ));
    }
    if let Some(stylized_sparkles) = entity.components.extra.get("StylizedSparkles") {
        return Ok(spawn_stylized_sparkles(
            world,
            &entity.id,
            stylized_sparkles,
            transform,
            stable_id,
            name,
        ));
    }
    if let Some(ripple_water) = entity.components.extra.get("RippleWater") {
        return Ok(spawn_ripple_water(
            world,
            &entity.id,
            ripple_water,
            transform,
            stable_id,
            name,
        ));
    }

    if entity.components.mesh_renderer.is_some() {
        return spawn_mesh_entity(world, entity, resources, transform);
    }
    if entity.components.camera.is_some() {
        return spawn_camera_entity(world, entity, resources.context, transform);
    }
    if entity.components.light.is_some() {
        return Ok(spawn_light_or_spatial(
            world,
            entity,
            resources.context,
            transform,
        ));
    }

    Ok(spawn_spatial_entity(world, entity, transform))
}

fn spawn_mesh_entity(
    world: &mut World,
    entity: &WorldEntity,
    resources: &mut EntitySpawnResources<'_, '_>,
    transform: Transform,
) -> Result<Entity, MapError> {
    let stable_id = ThreeNativeId(entity.id.clone());
    let name = Name::new(entity.id.clone());
    let NativeWorldEntitySpawnContext {
        assets_by_id,
        layer_map,
        render_target_registry,
        runtime_config,
        ..
    } = resources.context;
    let material_handles = &mut resources.material_handles;
    let shader_material_handles = &mut resources.shader_material_handles;
    let runtime_config = *runtime_config;
    if let Some(renderer) = &entity.components.mesh_renderer {
        let (mesh_id, asset, material) =
            resolve_mesh_renderer_inputs(entity, renderer, resources.context)?;
        let asset_server = world.get_resource::<AssetServer>().cloned();
        if let Some(spawned) =
            try_spawn_model_scene(world, entity, renderer, asset, resources.context, transform)
        {
            return Ok(spawned);
        }
        let mesh = resolve_mesh_handle(world, asset);
        let mesh_lod = native_mesh_lod(world, &entity.id, renderer, assets_by_id, mesh_id, &mesh)?;
        let policy = material_policy(material);
        if material.kind == "shader" {
            let material_handle = add_portable_shader_material(
                world,
                material,
                assets_by_id,
                asset_server.as_ref(),
                render_target_registry,
            );
            shader_material_handles
                .0
                .entry(material.id.clone())
                .or_insert_with(|| material_handle.clone());
            let mut spawned = world.spawn(MaterialMeshBundle {
                mesh: mesh.clone(),
                material: material_handle,
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            });
            let spawned_id = spawned.id();
            spawned.insert((stable_id, name));
            spawned.insert(policy);
            if let Some(mesh_lod) = mesh_lod {
                spawned.insert(mesh_lod);
            }
            if let Some(instance) = shader_material_instance(material) {
                spawned.insert(instance);
            }
            insert_shadow_markers(&mut spawned, renderer);
            if let Some(layers) = entity.components.render_layers.as_ref() {
                spawned.insert(render_layers_for_names(layer_map, &layers.layers));
            }
            if let Some(playback) = animation_playback(asset) {
                spawned.insert(playback);
            }
            return Ok(spawned_id);
        }
        let material_handle = add_material(
            world,
            material,
            assets_by_id,
            asset_server.as_ref(),
            render_target_registry,
            runtime_config
                .and_then(|config| config.renderer.as_ref())
                .and_then(|renderer| renderer.screen_space_reflections.as_ref())
                .is_some_and(|reflections| reflections.enabled),
        );
        material_handles
            .0
            .entry(material.id.clone())
            .or_insert_with(|| material_handle.clone());
        let spawned_id = {
            let mut spawned = world.spawn(PbrBundle {
                mesh: mesh.clone(),
                material: material_handle,
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            });
            spawned.insert((stable_id, name));
            spawned.insert(policy);
            if let Some(mesh_lod) = mesh_lod.as_ref() {
                spawned.insert(mesh_lod.clone());
            }
            if let Some(instance) = shader_material_instance(material) {
                spawned.insert(instance);
            }
            if let Some(policy) = emissive_bloom_policy(material) {
                spawned.insert(policy);
            }
            insert_shadow_markers(&mut spawned, renderer);
            if let Some(layers) = entity.components.render_layers.as_ref() {
                spawned.insert(render_layers_for_names(layer_map, &layers.layers));
            }
            if let Some(playback) = animation_playback(asset) {
                spawned.insert(playback);
            }
            spawned.id()
        };
        attach_emissive_mask_proxy(world, entity, material, mesh, mesh_lod, spawned_id);
        return Ok(spawned_id);
    }

    unreachable!("mesh renderer was checked before spawning")
}

fn resolve_mesh_renderer_inputs<'a>(
    entity: &WorldEntity,
    renderer: &'a threenative_loader::MeshRendererComponent,
    context: &'a NativeWorldEntitySpawnContext<'a>,
) -> Result<(&'a str, &'a AssetIr, &'a MaterialIr), MapError> {
    let mesh_id = renderer
        .mesh
        .as_deref()
        .ok_or_else(|| MapError::MissingMesh {
            entity_id: entity.id.clone(),
            mesh_id: "<missing>".to_owned(),
        })?;
    let asset = context
        .assets_by_id
        .get(mesh_id)
        .ok_or_else(|| MapError::MissingMesh {
            entity_id: entity.id.clone(),
            mesh_id: mesh_id.to_owned(),
        })?;
    let material = context
        .materials_by_id
        .get(renderer.material.as_str())
        .ok_or_else(|| MapError::MissingMaterial {
            entity_id: entity.id.clone(),
            material_id: renderer.material.clone(),
        })?;
    Ok((mesh_id, asset, material))
}

fn try_spawn_model_scene(
    world: &mut World,
    entity: &WorldEntity,
    renderer: &threenative_loader::MeshRendererComponent,
    asset: &AssetIr,
    context: &NativeWorldEntitySpawnContext<'_>,
    transform: Transform,
) -> Option<Entity> {
    let scene_path = model_scene_path(asset)?;
    let asset_server = world.get_resource::<AssetServer>().cloned()?;
    let scene = asset_server.load(GltfAssetLabel::Scene(0).from_asset(scene_path.clone()));
    let playback = animation_playback(asset);
    let scene_binding = playback.as_ref().and_then(|playback| {
        world
            .contains_resource::<Assets<AnimationClip>>()
            .then(|| NativeAnimationSceneBinding {
                asset: asset.id.clone(),
                clip_speeds: animation_clip_speeds(asset),
                gltf: asset_server.load(scene_path.clone()),
                clip: asset_server.load(
                    GltfAssetLabel::Animation(animation_clip_index(asset, playback))
                        .from_asset(scene_path.clone()),
                ),
                loop_: playback.loop_,
                speed: playback.speed,
                source_clip: playback.source_clip.clone(),
            })
    });
    let mut spawned = world.spawn(SceneBundle {
        scene,
        transform,
        visibility: map_visibility(entity),
        ..Default::default()
    });
    spawned.insert((
        ThreeNativeId(entity.id.clone()),
        Name::new(entity.id.clone()),
    ));
    insert_shadow_markers(&mut spawned, renderer);
    if let Some(layers) = entity.components.render_layers.as_ref() {
        spawned.insert(render_layers_for_names(&context.layer_map, &layers.layers));
    }
    if let Some(binding) = scene_binding {
        spawned.insert(binding);
    }
    if let Some(playback) = playback {
        spawned.insert(playback);
    }
    Some(spawned.id())
}

fn attach_emissive_mask_proxy(
    world: &mut World,
    entity: &WorldEntity,
    material: &MaterialIr,
    mesh: Handle<Mesh>,
    mesh_lod: Option<NativeMeshLod>,
    spawned_id: Entity,
) {
    if !uses_emissive_marker_mask(material)
        || !world.contains_resource::<NativeEmissiveMarkerMask>()
    {
        return;
    }
    let mask_material = add_emissive_mask_material(world);
    let mut proxy = world.spawn(PbrBundle {
        mesh,
        material: mask_material,
        visibility: Visibility::Inherited,
        ..Default::default()
    });
    proxy.insert((
        Name::new(format!("{}.emissive-mask", entity.id)),
        RenderLayers::layer(THREE_COMPAT_EMISSIVE_MASK_LAYER),
        NotShadowCaster,
        NotShadowReceiver,
    ));
    if let Some(mesh_lod) = mesh_lod {
        proxy.insert(mesh_lod);
    }
    let proxy = proxy.id();
    world.entity_mut(spawned_id).push_children(&[proxy]);
}

fn spawn_camera_entity(
    world: &mut World,
    entity: &WorldEntity,
    context: &NativeWorldEntitySpawnContext<'_>,
    transform: Transform,
) -> Result<Entity, MapError> {
    let NativeWorldEntitySpawnContext {
        active_cameras,
        camera_atmosphere,
        camera_color_management,
        fallback_active_camera,
        layer_map,
        render_target_registry,
        runtime_color_grading,
        runtime_config,
        ..
    } = context;
    let camera_atmosphere = *camera_atmosphere;
    let camera_color_management = *camera_color_management;
    let fallback_active_camera = fallback_active_camera.as_deref();
    let runtime_color_grading = *runtime_color_grading;
    let runtime_config = *runtime_config;
    if let Some(camera) = &entity.components.camera {
        let environment_map = world.get_resource::<NativeEnvironmentMapHandles>().cloned();
        let projection = if camera.kind == "orthographic" {
            Projection::Orthographic(OrthographicProjection {
                far: camera.far,
                near: camera.near,
                scaling_mode: ScalingMode::FixedVertical(camera.size.unwrap_or(1.0)),
                ..Default::default()
            })
        } else {
            Projection::Perspective(PerspectiveProjection {
                fov: camera.fov_y.unwrap_or(60.0).to_radians(),
                near: camera.near,
                far: camera.far,
                ..Default::default()
            })
        };
        let mut spawned = world.spawn(Camera3dBundle {
            color_grading: color_grading_for_profile(
                camera_color_management,
                runtime_color_grading,
            ),
            exposure: exposure_for_profile(camera_color_management, runtime_color_grading),
            projection: projection.clone(),
            tonemapping: tonemapping_for_profile(camera_color_management, runtime_color_grading),
            transform,
            ..Default::default()
        });
        if let Some(fog) = fog_settings_for_profile(camera_atmosphere) {
            spawned.insert(fog);
        }
        if let Some(volumetric_fog) = native_volumetric_fog_settings(camera_atmosphere) {
            spawned.insert(volumetric_fog);
        }
        if let Some(height_fog) = crate::rendering::native_height_fog_settings(camera_atmosphere) {
            spawned.insert(height_fog);
        }
        if let Some(ssgi) =
            crate::rendering::native_ssgi_settings(runtime_config, camera_atmosphere)
        {
            spawned.insert(ssgi);
        }
        let is_active = if active_cameras.is_empty() {
            fallback_active_camera.is_none_or(|id| id == entity.id)
        } else {
            active_cameras.contains(entity.id.as_str())
        };
        apply_camera_components(
            camera,
            &mut spawned,
            layer_map,
            camera_order(camera),
            is_active,
            UVec2::new(1280, 720),
            camera_render_target(camera, render_target_registry),
        );
        configure_spawned_camera(
            &mut spawned,
            entity,
            camera,
            context,
            environment_map,
            is_active,
        );
        let camera_id = spawned.id();
        if is_active {
            spawn_emissive_mask_camera(world, camera, &projection, transform);
        }
        return Ok(camera_id);
    }

    unreachable!("camera was checked before spawning")
}

fn configure_spawned_camera(
    spawned: &mut EntityWorldMut<'_>,
    entity: &WorldEntity,
    camera: &threenative_loader::CameraComponent,
    context: &NativeWorldEntitySpawnContext<'_>,
    environment_map: Option<NativeEnvironmentMapHandles>,
    is_active: bool,
) {
    spawned.insert(CameraMainTextureUsages(
        TextureUsages::COPY_SRC | TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING,
    ));
    if (crate::rendering::native_ssgi_settings(context.runtime_config, context.camera_atmosphere)
        .is_some()
        || crate::rendering::native_height_fog_settings(context.camera_atmosphere).is_some())
        && let Some(mut camera_3d) = spawned.get_mut::<Camera3d>()
    {
        camera_3d.depth_texture_usages =
            (TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING).into();
    }
    if let Some(mut camera_component) = spawned.get_mut::<Camera>() {
        camera_component.hdr = context.camera_color_management.is_some()
            || context.runtime_color_grading.is_some()
            || context.bloom_settings.is_some()
            || crate::rendering::native_height_fog_settings(context.camera_atmosphere).is_some()
            || crate::rendering::native_ssgi_settings(
                context.runtime_config,
                context.camera_atmosphere,
            )
            .is_some();
        if camera.clear.is_none()
            && let Some(clear_color) = context.default_camera_clear_color
        {
            camera_component.clear_color = ClearColorConfig::Custom(clear_color);
        }
    }
    if let Some(projection) = camera.projection.as_ref()
        && projection.kind == "matrix"
        && let Some(matrix) = projection.matrix.as_ref()
        && matrix.len() == 16
    {
        let values: [f32; 16] = matrix.clone().try_into().unwrap_or([0.0; 16]);
        spawned.insert(NativeCustomProjection(values));
    }
    spawned.insert((
        ThreeNativeId(entity.id.clone()),
        Name::new(entity.id.clone()),
        map_visibility(entity),
    ));
    if let Some(bloom_settings) = context.bloom_settings.as_ref() {
        spawned.insert(bloom_settings.clone());
    }
    if context
        .camera_atmosphere
        .is_some_and(|profile| profile.sun.casts_shadow && profile.shadows.enabled)
    {
        spawned.insert(ShadowFilteringMethod::Gaussian);
    }
    if is_active && let Some(environment_map) = environment_map {
        spawned.insert(EnvironmentMapLight {
            diffuse_map: environment_map.diffuse_map,
            specular_map: environment_map.specular_map,
            intensity: environment_map.intensity,
        });
    }
    insert_camera_antialias(spawned, context.runtime_config);
    insert_camera_ambient_occlusion(spawned, context.runtime_config);
    insert_camera_ssgi_prepasses(spawned, context.runtime_config);
    insert_camera_shadow_profile(spawned, context.runtime_config);
    insert_camera_depth_of_field(spawned, context.runtime_config);
    insert_camera_motion_blur(spawned, context.runtime_config);
    insert_camera_screen_space_reflections(spawned, context.runtime_config);
}

fn spawn_light_or_spatial(
    world: &mut World,
    entity: &WorldEntity,
    context: &NativeWorldEntitySpawnContext<'_>,
    transform: Transform,
) -> Entity {
    let light = entity.components.light.as_ref().expect("light was checked");
    let stable_id = ThreeNativeId(entity.id.clone());
    let name = Name::new(entity.id.clone());
    if context.camera_atmosphere.is_some()
        && matches!(light.kind.as_str(), "ambient" | "directional")
    {
        return world
            .spawn(SpatialBundle {
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((stable_id, name))
            .id();
    }
    if light.kind == "directional" {
        let light_transform = directional_light_transform(transform, entity);
        return world
            .spawn(DirectionalLightBundle {
                directional_light: DirectionalLight {
                    color: color_to_bevy(&light.color),
                    illuminance: directional_illuminance(
                        light.intensity,
                        context.camera_color_management,
                        context.camera_atmosphere,
                    ),
                    shadow_depth_bias: light
                        .shadow_bias
                        .unwrap_or(DirectionalLight::DEFAULT_SHADOW_DEPTH_BIAS),
                    shadow_normal_bias: light
                        .shadow_normal_bias
                        .unwrap_or(DirectionalLight::DEFAULT_SHADOW_NORMAL_BIAS),
                    shadows_enabled: false,
                },
                transform: light_transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((stable_id, name))
            .id();
    }
    if light.kind == "point" {
        return world
            .spawn(PointLightBundle {
                point_light: PointLight {
                    color: color_to_bevy(&light.color),
                    intensity: point_lumens(light.intensity, context.camera_color_management),
                    range: light.range.unwrap_or(THREE_COMPAT_DEFAULT_RANGE),
                    shadow_depth_bias: light
                        .shadow_bias
                        .unwrap_or(PointLight::DEFAULT_SHADOW_DEPTH_BIAS),
                    shadow_normal_bias: light
                        .shadow_normal_bias
                        .unwrap_or(PointLight::DEFAULT_SHADOW_NORMAL_BIAS),
                    ..Default::default()
                },
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((stable_id, name))
            .id();
    }
    if light.kind == "spot" {
        return world
            .spawn(SpotLightBundle {
                spot_light: SpotLight {
                    color: color_to_bevy(&light.color),
                    intensity: point_lumens(light.intensity, context.camera_color_management),
                    outer_angle: light.angle.unwrap_or(std::f32::consts::FRAC_PI_4),
                    range: light.range.unwrap_or(THREE_COMPAT_DEFAULT_RANGE),
                    shadow_depth_bias: light
                        .shadow_bias
                        .unwrap_or(SpotLight::DEFAULT_SHADOW_DEPTH_BIAS),
                    shadow_normal_bias: light
                        .shadow_normal_bias
                        .unwrap_or(SpotLight::DEFAULT_SHADOW_NORMAL_BIAS),
                    ..Default::default()
                },
                transform,
                visibility: map_visibility(entity),
                ..Default::default()
            })
            .insert((stable_id, name))
            .id();
    }
    if light.kind == "ambient" {
        let color = color_to_bevy(&light.color);
        let brightness = light.intensity
            * THREE_COMPAT_AMBIENT_BRIGHTNESS_PER_INTENSITY
            * if context
                .camera_atmosphere
                .is_some_and(|profile| profile.active)
            {
                1.0
            } else {
                ambient_occlusion_intensity_approximation(context.runtime_config)
            }
            * crate::rendering::native_ssgi_ambient_multiplier(context.runtime_config);
        if world.contains_resource::<crate::rendering::NativeBakedProbeLightingApplied>() {
            if let Some(mut ambient) = world.get_resource_mut::<AmbientLight>() {
                ambient.color = crate::rendering::blend_ambient_colors(ambient.color, color);
                ambient.brightness += brightness;
            }
        } else {
            world.insert_resource(AmbientLight { color, brightness });
        }
    }
    spawn_spatial_entity(world, entity, transform)
}

fn spawn_spatial_entity(world: &mut World, entity: &WorldEntity, transform: Transform) -> Entity {
    world
        .spawn(SpatialBundle {
            transform,
            visibility: map_visibility(entity),
            ..Default::default()
        })
        .insert((
            ThreeNativeId(entity.id.clone()),
            Name::new(entity.id.clone()),
        ))
        .id()
}

fn shader_material_instance(material: &MaterialIr) -> Option<NativeShaderMaterialInstance> {
    if material.kind != "shader" {
        return None;
    }
    let uniforms = material
        .uniforms
        .as_ref()
        .map(|values| {
            let mut values = values
                .iter()
                .map(|uniform| (uniform.name.clone(), uniform.type_.clone()))
                .collect::<Vec<_>>();
            values.sort_by(|left, right| left.0.cmp(&right.0));
            values
        })
        .unwrap_or_default();
    let textures = material
        .textures
        .as_ref()
        .map(|values| {
            let mut values = values
                .iter()
                .map(|texture| texture.name.clone())
                .collect::<Vec<_>>();
            values.sort();
            values
        })
        .unwrap_or_default();
    let mut binding_layout = Vec::new();
    for (index, (name, type_)) in uniforms.iter().enumerate() {
        binding_layout.push(NativeShaderBindingMetadata {
            binding: index,
            kind: "uniform".to_owned(),
            name: name.clone(),
            type_: type_.clone(),
        });
    }
    for (index, name) in textures.iter().enumerate() {
        binding_layout.push(NativeShaderBindingMetadata {
            binding: uniforms.len() + index,
            kind: "sampler2d".to_owned(),
            name: name.clone(),
            type_: "texture2d".to_owned(),
        });
    }
    let mut fragment_outputs = material.outputs.clone().unwrap_or_default();
    if fragment_outputs.is_empty() {
        fragment_outputs = material
            .program
            .as_ref()
            .and_then(|program| program.fragment.get("outputs"))
            .and_then(|outputs| outputs.as_object())
            .map(|outputs| outputs.keys().cloned().collect())
            .unwrap_or_default();
    }
    fragment_outputs.sort();
    Some(NativeShaderMaterialInstance {
        binding_layout,
        fragment_outputs,
        language: material
            .program
            .as_ref()
            .map(|program| program.language.clone())
            .unwrap_or_else(|| "threenative-shader-v1".to_owned()),
        material_id: material.id.clone(),
        render_path: "native-portable-shader-material".to_owned(),
        textures,
        uniforms: uniforms.into_iter().map(|(name, _)| name).collect(),
        wgsl_entry_points: vec!["vertex_main".to_owned(), "fragment_main".to_owned()],
    })
}

fn add_portable_shader_material(
    world: &mut World,
    material: &MaterialIr,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    render_target_registry: &NativeRenderTargetRegistry,
) -> Handle<NativePortableShaderMaterial> {
    let (base_color, texture_asset) = portable_shader_base_color(material);
    let base_color_texture = texture_asset
        .and_then(|asset| {
            texture_handle(
                Some(asset.as_str()),
                assets_by_id,
                asset_server,
                render_target_registry,
            )
        })
        .unwrap_or_else(|| add_portable_shader_fallback_texture(world));
    world
        .resource_mut::<Assets<NativePortableShaderMaterial>>()
        .add(NativePortableShaderMaterial {
            alpha_mode: alpha_mode(material),
            alpha_cutoff: material.alpha_cutoff,
            base_color: base_color.into(),
            base_color_texture: Some(base_color_texture),
            displacement_amount: shader_displacement_amount(material).unwrap_or(0.0),
            material_id: material.id.clone(),
            uses_vertex_displacement: material
                .program
                .as_ref()
                .and_then(|program| program.vertex.as_ref())
                .and_then(|vertex| vertex.get("displacement"))
                .is_some(),
        })
}

fn add_portable_shader_fallback_texture(world: &mut World) -> Handle<Image> {
    let image = Image::new_fill(
        Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[255, 255, 255, 255],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    world.resource_mut::<Assets<Image>>().add(image)
}

fn portable_shader_base_color(material: &MaterialIr) -> (Color, Option<String>) {
    let outputs = material
        .program
        .as_ref()
        .and_then(|program| program.fragment.get("outputs"))
        .and_then(|outputs| outputs.as_object());
    let base_color = outputs.and_then(|outputs| outputs.get("baseColor"));
    let emissive = outputs.and_then(|outputs| outputs.get("emissive"));
    if let Some(texture_name) = base_color
        .and_then(|value| value.get("texture"))
        .and_then(|value| value.as_str())
    {
        let texture_asset = material.textures.as_ref().and_then(|textures| {
            textures
                .iter()
                .find(|texture| texture.name == texture_name)
                .map(|texture| texture.asset.clone())
        });
        let color = add_shader_emissive(
            [
                1.0,
                1.0,
                1.0,
                shader_alpha(material, outputs).unwrap_or(1.0),
            ],
            material,
            emissive,
        );
        return (
            Color::srgba(color[0], color[1], color[2], color[3]),
            texture_asset,
        );
    }
    if let Some(values) = base_color
        .and_then(|value| value.get("value"))
        .and_then(|value| value.as_array())
    {
        let r = json_array_f32(values, 0, 1.0);
        let g = json_array_f32(values, 1, r);
        let b = json_array_f32(values, 2, g);
        let alpha =
            shader_alpha(material, outputs).unwrap_or_else(|| json_array_f32(values, 3, 1.0));
        let color = add_shader_emissive([r, g, b, alpha], material, emissive);
        return (Color::srgba(color[0], color[1], color[2], color[3]), None);
    }
    let fallback = color_with_opacity(
        &material.color,
        shader_alpha(material, outputs).unwrap_or(1.0),
    )
    .to_srgba();
    let color = add_shader_emissive(
        [fallback.red, fallback.green, fallback.blue, fallback.alpha],
        material,
        emissive,
    );
    (Color::srgba(color[0], color[1], color[2], color[3]), None)
}

fn add_shader_emissive(
    mut base: [f32; 4],
    material: &MaterialIr,
    emissive: Option<&serde_json::Value>,
) -> [f32; 4] {
    let Some(emissive) = emissive else {
        return base;
    };
    let color = shader_expression_color(material, emissive).unwrap_or([0.0, 0.0, 0.0, 1.0]);
    base[0] = (base[0] + color[0]).clamp(0.0, 1.0);
    base[1] = (base[1] + color[1]).clamp(0.0, 1.0);
    base[2] = (base[2] + color[2]).clamp(0.0, 1.0);
    base
}

fn shader_expression_color(
    material: &MaterialIr,
    expression: &serde_json::Value,
) -> Option<[f32; 4]> {
    if let Some(values) = expression.get("value").and_then(|value| value.as_array()) {
        let r = json_array_f32(values, 0, 1.0);
        let g = json_array_f32(values, 1, r);
        let b = json_array_f32(values, 2, g);
        let a = json_array_f32(values, 3, 1.0);
        return Some([r, g, b, a]);
    }
    if let Some(value) = expression.get("value").and_then(|value| value.as_str()) {
        let color = color_to_bevy(&ColorIr::Hex(value.to_owned())).to_srgba();
        return Some([color.red, color.green, color.blue, color.alpha]);
    }
    let uniform_name = expression.get("uniform").and_then(|value| value.as_str())?;
    let uniform = material
        .uniforms
        .as_ref()?
        .iter()
        .find(|uniform| uniform.name == uniform_name)?;
    if let Some(value) = uniform.default.as_str() {
        let color = color_to_bevy(&ColorIr::Hex(value.to_owned())).to_srgba();
        return Some([color.red, color.green, color.blue, color.alpha]);
    }
    uniform.default.as_array().map(|values| {
        [
            json_array_f32(values, 0, 1.0),
            json_array_f32(values, 1, 1.0),
            json_array_f32(values, 2, 1.0),
            json_array_f32(values, 3, 1.0),
        ]
    })
}

fn shader_alpha(
    material: &MaterialIr,
    outputs: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<f32> {
    let alpha = outputs?.get("alpha")?;
    if let Some(value) = alpha.get("value").and_then(|value| value.as_f64()) {
        return Some((value as f32).clamp(0.0, 1.0));
    }
    let uniform_name = alpha.get("uniform").and_then(|value| value.as_str())?;
    material.uniforms.as_ref()?.iter().find_map(|uniform| {
        (uniform.name == uniform_name).then(|| {
            uniform
                .default
                .as_f64()
                .map(|value| (value as f32).clamp(0.0, 1.0))
        })?
    })
}

fn shader_displacement_amount(material: &MaterialIr) -> Option<f32> {
    let amount = material
        .program
        .as_ref()?
        .vertex
        .as_ref()?
        .get("displacement")?
        .get("amount")?;
    if let Some(value) = amount.get("value").and_then(|value| value.as_f64()) {
        return Some(value as f32);
    }
    let uniform_name = amount.get("uniform").and_then(|value| value.as_str())?;
    material.uniforms.as_ref()?.iter().find_map(|uniform| {
        (uniform.name == uniform_name)
            .then(|| uniform.default.as_f64().map(|value| value as f32))?
    })
}

fn json_array_f32(values: &[serde_json::Value], index: usize, fallback: f32) -> f32 {
    values
        .get(index)
        .and_then(|value| value.as_f64())
        .map(|value| value as f32)
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}

fn insert_shadow_markers(
    spawned: &mut EntityWorldMut<'_>,
    renderer: &threenative_loader::MeshRendererComponent,
) {
    if renderer.cast_shadow != Some(true) {
        spawned.insert(NotShadowCaster);
    }
    if renderer.receive_shadow != Some(true) {
        spawned.insert(NotShadowReceiver);
    }
}

fn insert_camera_depth_of_field(
    spawned: &mut EntityWorldMut<'_>,
    runtime_config: Option<&RuntimeConfigIr>,
) {
    let Some(depth_of_field) = runtime_config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.depth_of_field.as_ref())
    else {
        return;
    };
    if !depth_of_field.enabled {
        return;
    }
    spawned.insert(DepthOfFieldSettings {
        aperture_f_stops: native_depth_of_field_aperture(depth_of_field.aperture),
        focal_distance: depth_of_field.focus_distance,
        max_circle_of_confusion_diameter: native_depth_of_field_max_blur(depth_of_field.max_blur),
        max_depth: f32::INFINITY,
        mode: DepthOfFieldMode::Bokeh,
        ..Default::default()
    });
}

fn native_depth_of_field_aperture(aperture: f32) -> f32 {
    (1.0 / (aperture.max(0.001) * 250.0)).clamp(0.08, 16.0)
}

fn native_depth_of_field_max_blur(max_blur: f32) -> f32 {
    (max_blur * 2560.0).clamp(1.0, 64.0)
}

fn insert_camera_motion_blur(
    spawned: &mut EntityWorldMut<'_>,
    runtime_config: Option<&RuntimeConfigIr>,
) {
    let Some(motion_blur) = runtime_config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.motion_blur.as_ref())
    else {
        return;
    };
    if !motion_blur.enabled {
        return;
    }
    spawned.insert(NativeTemporalMotionBlur::from_shutter_angle(
        motion_blur.shutter_angle,
    ));
}

fn insert_camera_screen_space_reflections(
    spawned: &mut EntityWorldMut<'_>,
    runtime_config: Option<&RuntimeConfigIr>,
) {
    let Some(screen_space_reflections) = runtime_config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.screen_space_reflections.as_ref())
    else {
        return;
    };
    if !screen_space_reflections.enabled {
        return;
    }
    spawned.insert(ScreenSpaceReflectionsBundle {
        settings: ScreenSpaceReflectionsSettings {
            perceptual_roughness_threshold: screen_space_reflections.roughness_limit,
            thickness: THREE_COMPAT_SSR_THICKNESS,
            linear_steps: native_screen_space_reflections_steps(
                screen_space_reflections.quality.as_str(),
            ),
            ..Default::default()
        },
        ..Default::default()
    });
}

fn native_screen_space_reflections_steps(quality: &str) -> u32 {
    match quality {
        "low" => 8,
        "high" => 32,
        _ => 16,
    }
}

fn spawn_emissive_mask_camera(
    world: &mut World,
    camera: &threenative_loader::CameraComponent,
    projection: &Projection,
    transform: Transform,
) {
    let Some(mask) = world.get_resource::<NativeEmissiveMarkerMask>().cloned() else {
        return;
    };
    let mut spawned = world.spawn(Camera3dBundle {
        camera: Camera {
            clear_color: ClearColorConfig::Custom(Color::BLACK),
            hdr: false,
            is_active: true,
            order: -10_000,
            target: RenderTarget::Image(mask.image.clone()),
            ..Default::default()
        },
        projection: projection.clone(),
        tonemapping: Tonemapping::None,
        transform,
        ..Default::default()
    });
    spawned.insert((
        Name::new("native.emissive-marker-mask-camera"),
        RenderLayers::layer(mask.layer),
    ));
    if camera.follow.is_some()
        || camera.orbit.is_some()
        || camera.screen_shake.is_some()
        || camera.view_model.is_some()
    {
        spawned.insert(crate::cameras::NativeCameraHelperState::default());
        spawned.insert(crate::cameras::NativeCameraMetadata(camera.clone()));
    }
}

fn model_scene_path(asset: &AssetIr) -> Option<String> {
    if asset.kind != "model" || !matches!(asset.format.as_str(), "gltf" | "glb") {
        return None;
    }
    asset.path.clone()
}

pub fn bind_native_animation_players(
    mut commands: Commands,
    gltfs: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    bindings: Query<&NativeAnimationSceneBinding>,
    parents: Query<&Parent>,
    mut players: Query<(
        Entity,
        &mut AnimationPlayer,
        Option<&Handle<AnimationGraph>>,
    )>,
) {
    for (entity, mut player, graph_handle) in &mut players {
        if graph_handle.is_some() {
            continue;
        }
        let Some(binding) = ancestor_animation_binding(entity, &parents, &bindings) else {
            continue;
        };
        let clip = gltfs
            .get(&binding.gltf)
            .and_then(|gltf| gltf.named_animations.get(binding.source_clip.as_str()))
            .cloned()
            .unwrap_or_else(|| binding.clip.clone());
        let (graph, animation) = AnimationGraph::from_clip(clip);
        let active = player.play(animation);
        active.set_speed(binding.speed);
        if binding.loop_ {
            active.repeat();
        }
        commands.entity(entity).insert(graphs.add(graph));
    }
}

pub fn queue_native_animation_service_effects(
    queue: &mut NativeAnimationServiceQueue,
    logs: &[crate::systems_effects::NativeSystemEffectLog],
) {
    for entry in logs.iter().flat_map(|log| &log.entries) {
        if entry.kind != "service" || entry.service.as_deref() != Some("animation.play") {
            continue;
        }
        let Some(payload) = entry.payload.as_ref() else {
            continue;
        };
        let Some(command) = native_animation_service_command(payload) else {
            continue;
        };
        queue.commands.push(command);
    }
}

pub fn apply_native_animation_service_effects(
    mut commands: Commands,
    gltfs: Res<Assets<Gltf>>,
    mut graphs: ResMut<Assets<AnimationGraph>>,
    mut queue: ResMut<NativeAnimationServiceQueue>,
    bindings: Query<(
        Entity,
        &NativeAnimationSceneBinding,
        Option<&NativeAnimationPlayback>,
        Option<&ThreeNativeId>,
    )>,
    parents: Query<&Parent>,
    mut players: Query<Entity, With<AnimationPlayer>>,
) {
    let requests = queue.commands.drain(..).collect::<Vec<_>>();
    for request in requests {
        let mut applied = false;
        for player_entity in &mut players {
            let Some((binding_entity, binding, playback, stable_id)) =
                ancestor_animation_target(player_entity, &parents, &bindings)
            else {
                continue;
            };
            if stable_id.is_none_or(|id| id.0 != request.entity) {
                continue;
            }
            let speed = request.speed
                * native_declared_clip_speed(binding, &request.clip, &request.source_clip);
            let next_playback = NativeAnimationPlayback {
                active_state: request.active_state.clone(),
                asset: binding.asset.clone(),
                clip: request.clip.clone(),
                loop_: request.loop_,
                source_clip: request.source_clip.clone(),
                speed,
                time_seconds: 0.0,
            };
            commands.entity(binding_entity).insert(next_playback);
            if playback
                .as_ref()
                .is_some_and(|current| current.source_clip == request.source_clip)
            {
                commands.add(move |world: &mut World| {
                    update_animation_player_speed(world, player_entity, speed);
                });
                applied = true;
                continue;
            }
            let clip = gltfs
                .get(&binding.gltf)
                .and_then(|gltf| {
                    gltf.named_animations
                        .get(request.source_clip.as_str())
                        .or_else(|| gltf.named_animations.get(request.clip.as_str()))
                })
                .cloned()
                .unwrap_or_else(|| binding.clip.clone());
            let (graph, animation) = AnimationGraph::from_clip(clip);
            let graph_handle = graphs.add(graph);
            commands.add(move |world: &mut World| {
                let Some(mut player) = world.get_mut::<AnimationPlayer>(player_entity) else {
                    return;
                };
                let active = player.play(animation);
                active.set_speed(speed);
                if request.loop_ {
                    active.repeat();
                }
                world.entity_mut(player_entity).insert(graph_handle);
            });
            applied = true;
        }
        if !applied {
            queue.commands.push(request);
        }
    }
}

fn update_animation_player_speed(world: &mut World, player_entity: Entity, speed: f32) {
    let Some(mut player) = world.get_mut::<AnimationPlayer>(player_entity) else {
        return;
    };
    for (_, active) in player.playing_animations_mut() {
        active.set_speed(speed);
    }
}

fn native_animation_service_command(payload: &Value) -> Option<NativeAnimationServiceCommand> {
    let request = payload.get("request")?;
    let result = payload.get("result")?;
    let entity = request.get("entity")?.as_str()?.to_owned();
    let clip = result
        .get("clip")
        .and_then(Value::as_str)
        .or_else(|| request.get("clip").and_then(Value::as_str))?
        .to_owned();
    let source_clip = result
        .get("sourceClip")
        .and_then(Value::as_str)
        .or_else(|| request.get("clip").and_then(Value::as_str))
        .unwrap_or(clip.as_str())
        .to_owned();
    let speed = result
        .get("speed")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(1.0) as f32;
    Some(NativeAnimationServiceCommand {
        active_state: result
            .get("activeState")
            .and_then(Value::as_str)
            .map(str::to_owned),
        clip,
        entity,
        loop_: result.get("loop").and_then(Value::as_bool).unwrap_or(true),
        source_clip,
        speed,
    })
}

fn ancestor_animation_binding<'a>(
    entity: Entity,
    parents: &Query<&Parent>,
    bindings: &'a Query<&NativeAnimationSceneBinding>,
) -> Option<&'a NativeAnimationSceneBinding> {
    let mut current = entity;
    loop {
        if let Ok(binding) = bindings.get(current) {
            return Some(binding);
        }
        let Ok(parent) = parents.get(current) else {
            return None;
        };
        current = parent.get();
    }
}

fn ancestor_animation_target<'a>(
    entity: Entity,
    parents: &Query<&Parent>,
    bindings: &'a Query<(
        Entity,
        &NativeAnimationSceneBinding,
        Option<&NativeAnimationPlayback>,
        Option<&ThreeNativeId>,
    )>,
) -> Option<(
    Entity,
    &'a NativeAnimationSceneBinding,
    Option<&'a NativeAnimationPlayback>,
    Option<&'a ThreeNativeId>,
)> {
    let mut current = entity;
    loop {
        if let Ok((entity, binding, playback, stable_id)) = bindings.get(current) {
            return Some((entity, binding, playback, stable_id));
        }
        let Ok(parent) = parents.get(current) else {
            return None;
        };
        current = parent.get();
    }
}
