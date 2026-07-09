fn color_grading_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    runtime_color_grading: Option<&threenative_loader::RuntimeRendererColorGradingConfig>,
) -> ColorGrading {
    let mut grading = ColorGrading::default();
    if color_management.is_some() || runtime_color_grading.is_some() {
        grading.global.exposure = 0.0;
    }
    if let Some(runtime_color_grading) = runtime_color_grading {
        if let Some(saturation) = runtime_color_grading.saturation {
            grading.global.post_saturation =
                (saturation * THREE_COMPAT_COLOR_GRADING_SATURATION_SCALE).max(0.0);
        }
        if let Some(contrast) = runtime_color_grading.contrast {
            let section_contrast = (1.0 + contrast).max(0.0);
            for section in grading.all_sections_mut() {
                section.contrast = section_contrast;
            }
        }
    }
    grading
}

fn fog_settings_for_profile(profile: Option<&AtmosphereProfileIr>) -> Option<FogSettings> {
    let fog = profile?.fog.as_ref().filter(|fog| fog.enabled)?;
    let falloff = match fog.mode.as_str() {
        "linear" => {
            let start = fog.near.unwrap_or(0.0).max(0.0);
            FogFalloff::Linear {
                start,
                end: fog.far.unwrap_or(1_000.0).max(start + 0.001),
            }
        }
        // Three.js `FogExp2` uses squared exponential falloff; match Bevy's
        // `FogFalloff::ExponentialSquared`, not linear `Exponential`.
        "exponential" => FogFalloff::ExponentialSquared {
            density: (fog.density.unwrap_or(0.0) * THREE_COMPAT_FOG_EXP2_DENSITY_SCALE).max(0.0),
        },
        _ => return None,
    };
    Some(FogSettings {
        color: color_to_bevy(&fog.color),
        falloff,
        ..Default::default()
    })
}

fn exposure_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    runtime_color_grading: Option<&threenative_loader::RuntimeRendererColorGradingConfig>,
) -> Exposure {
    if let Some(exposure) = runtime_color_grading.and_then(|grading| grading.exposure) {
        let exposure = exposure * THREE_COMPAT_CAMERA_EXPOSURE_SCALE;
        return Exposure {
            ev100: -exposure.max(0.001).log2(),
        };
    }
    let Some(color_management) = color_management else {
        return Exposure {
            ev100: THREE_COMPAT_DEFAULT_CAMERA_EV100,
        };
    };
    let exposure = (color_management.exposure * THREE_COMPAT_CAMERA_EXPOSURE_SCALE).max(0.001);
    Exposure {
        ev100: -exposure.log2(),
    }
}

fn tonemapping_for_profile(
    color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    runtime_color_grading: Option<&threenative_loader::RuntimeRendererColorGradingConfig>,
) -> Tonemapping {
    match runtime_color_grading
        .and_then(|grading| grading.tone_mapping.as_deref())
        .or_else(|| color_management.map(|profile| profile.tone_mapping.as_str()))
    {
        Some("aces") => Tonemapping::AcesFitted,
        Some("none") => Tonemapping::None,
        None => Tonemapping::None,
        _ => Tonemapping::default(),
    }
}

fn directional_illuminance(
    intensity: f32,
    _color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
    atmosphere: Option<&AtmosphereProfileIr>,
) -> f32 {
    intensity * directional_illuminance_per_intensity(atmosphere)
}

fn directional_illuminance_per_intensity(atmosphere: Option<&AtmosphereProfileIr>) -> f32 {
    if atmosphere.is_some_and(|profile| profile.active) {
        THREE_COMPAT_ENVIRONMENT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY
    } else {
        THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY
    }
}

fn point_lumens(
    intensity: f32,
    _color_management: Option<&threenative_loader::AtmosphereColorManagementIr>,
) -> f32 {
    intensity * THREE_COMPAT_POINT_LUMENS_PER_CANDELA
}

fn add_mesh(world: &mut World, asset: &AssetIr) -> Handle<Mesh> {
    let mut mesh = match asset.primitive.as_deref() {
        Some("custom") => custom_mesh(asset),
        Some("box") => three_box_mesh([
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(2))
                .copied()
                .unwrap_or(1.0),
        ]),
        Some("sphere") => Mesh::from(Sphere {
            radius: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
        }),
        Some("cylinder") => Mesh::from(Cylinder::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("capsule") => Mesh::from(Capsule3d::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("cone") => Mesh::from(Cone {
            radius: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            height: asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        }),
        Some("conicalFrustum") => Mesh::from(ConicalFrustum {
            radius_top: asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.25),
            radius_bottom: asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(0.5),
            height: asset
                .size
                .as_ref()
                .and_then(|size| size.get(2))
                .copied()
                .unwrap_or(1.0),
        }),
        Some("torus") => Mesh::from(Torus::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("circle") => Mesh::from(PrimitiveCircle::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
        )),
        Some("annulus") => Mesh::from(Annulus::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0),
        )),
        Some("regularPolygon") => Mesh::from(RegularPolygon::new(
            asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(0.5),
            asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(6.0) as usize,
        )),
        Some("extrudedRectangle") => {
            let width = asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0);
            let height = asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0);
            let depth = asset
                .size
                .as_ref()
                .and_then(|size| size.get(2))
                .copied()
                .unwrap_or(1.0);
            Mesh::from(Extrusion::new(Rectangle::new(width, height), depth))
        }
        Some("plane") => {
            let width = asset
                .size
                .as_ref()
                .and_then(|size| size.first())
                .copied()
                .unwrap_or(1.0);
            let height = asset
                .size
                .as_ref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0);
            Mesh::from(Rectangle::new(width, height))
        }
        _ => {
            let size = asset.size.as_deref().unwrap_or(&[1.0, 1.0, 1.0]);
            Mesh::from(Cuboid::new(
                size.first().copied().unwrap_or(1.0),
                size.get(1).copied().unwrap_or(1.0),
                size.get(2).copied().unwrap_or(1.0),
            ))
        }
    };
    generate_tangents_if_possible(&mut mesh);
    world.resource_mut::<Assets<Mesh>>().add(mesh)
}

fn generate_tangents_if_possible(mesh: &mut Mesh) {
    if mesh.attribute(Mesh::ATTRIBUTE_TANGENT).is_some()
        || mesh.attribute(Mesh::ATTRIBUTE_POSITION).is_none()
        || mesh.attribute(Mesh::ATTRIBUTE_NORMAL).is_none()
        || mesh.attribute(Mesh::ATTRIBUTE_UV_0).is_none()
        || mesh.indices().is_none()
    {
        return;
    }
    let _ = mesh.generate_tangents();
}

fn three_box_mesh(size: [f32; 3]) -> Mesh {
    let hx = size[0] * 0.5;
    let hy = size[1] * 0.5;
    let hz = size[2] * 0.5;
    let positions = vec![
        [hx, hy, hz],
        [hx, hy, -hz],
        [hx, -hy, hz],
        [hx, -hy, -hz],
        [-hx, hy, -hz],
        [-hx, hy, hz],
        [-hx, -hy, -hz],
        [-hx, -hy, hz],
        [-hx, hy, -hz],
        [hx, hy, -hz],
        [-hx, hy, hz],
        [hx, hy, hz],
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [-hx, hy, hz],
        [hx, hy, hz],
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
        [hx, -hy, -hz],
        [-hx, -hy, -hz],
    ];
    let normals = vec![
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [-1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, -1.0, 0.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, 1.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
        [0.0, 0.0, -1.0],
    ];
    let uvs = vec![
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [0.0, 0.0],
        [1.0, 0.0],
    ];
    let indices = Indices::U32(vec![
        0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5, 8, 10, 9, 10, 11, 9, 12, 14, 13, 14, 15, 13, 16, 18,
        17, 18, 19, 17, 20, 22, 21, 22, 23, 21,
    ]);

    Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    )
    .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
    .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
    .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
    .with_inserted_indices(indices)
}

fn animation_playback(asset: &AssetIr) -> Option<NativeAnimationPlayback> {
    if asset.kind != "model" {
        return None;
    }
    let animations = asset.animations.as_deref()?;
    let clip_id = active_animation_clip_id(asset.animation_graph.as_ref(), animations)?;
    let clip = animations
        .iter()
        .find(|candidate| candidate.id == clip_id)
        .or_else(|| animations.first())?;
    Some(NativeAnimationPlayback {
        active_state: active_animation_state(asset.animation_graph.as_ref()),
        asset: asset.id.clone(),
        clip: clip.id.clone(),
        loop_: clip.loop_.unwrap_or(true),
        source_clip: clip.source_clip.clone().unwrap_or_else(|| clip.id.clone()),
        speed: clip.speed.unwrap_or(1.0),
        time_seconds: 0.0,
    })
}

fn animation_clip_speeds(asset: &AssetIr) -> HashMap<String, f32> {
    asset
        .animations
        .as_deref()
        .map_or_else(HashMap::new, |animations| {
            let mut speeds = HashMap::new();
            for clip in animations {
                let speed = clip.speed.unwrap_or(1.0);
                speeds.insert(clip.id.clone(), speed);
                speeds.insert(
                    clip.source_clip.clone().unwrap_or_else(|| clip.id.clone()),
                    speed,
                );
            }
            speeds
        })
}

fn native_declared_clip_speed(
    binding: &NativeAnimationSceneBinding,
    clip: &str,
    source_clip: &str,
) -> f32 {
    binding
        .clip_speeds
        .get(source_clip)
        .or_else(|| binding.clip_speeds.get(clip))
        .copied()
        .unwrap_or(1.0)
}

fn animation_clip_index(asset: &AssetIr, playback: &NativeAnimationPlayback) -> usize {
    asset
        .animations
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .position(|clip| {
            clip.source_clip.as_deref().unwrap_or(clip.id.as_str()) == playback.source_clip
                || clip.id == playback.clip
        })
        .unwrap_or(0)
}

fn active_animation_clip_id(
    graph: Option<&AnimationGraphIr>,
    animations: &[threenative_loader::AnimationClipIr],
) -> Option<String> {
    let Some(graph) = graph else {
        return animations.first().map(|clip| clip.id.clone());
    };
    let active_state = active_animation_state(Some(graph))?;
    graph
        .states
        .iter()
        .find(|state| state.id == active_state)
        .map(|state| state.clip.clone())
        .or_else(|| animations.first().map(|clip| clip.id.clone()))
}

fn active_animation_state(graph: Option<&AnimationGraphIr>) -> Option<String> {
    let graph = graph?;
    let transition = graph
        .transitions
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|transition| {
            transition.from == graph.initial_state && animation_condition_matches(transition, graph)
        });
    Some(
        transition.map_or(graph.initial_state.clone(), |transition| {
            transition.to.clone()
        }),
    )
}

fn animation_condition_matches(
    transition: &AnimationGraphTransitionIr,
    graph: &AnimationGraphIr,
) -> bool {
    let value = graph
        .parameters
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .find(|parameter| parameter.id == transition.when.parameter)
        .and_then(|parameter| parameter.default.clone())
        .unwrap_or_else(|| Value::from(false));
    if transition
        .when
        .equals
        .as_ref()
        .is_some_and(|expected| expected != &value)
    {
        return false;
    }
    if transition.when.greater_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual <= threshold as f64)
    }) {
        return false;
    }
    if transition.when.less_than.is_some_and(|threshold| {
        value
            .as_f64()
            .is_none_or(|actual| actual >= threshold as f64)
    }) {
        return false;
    }
    true
}

fn custom_mesh(asset: &AssetIr) -> Mesh {
    let mut mesh = Mesh::new(
        PrimitiveTopology::TriangleList,
        RenderAssetUsages::default(),
    );
    for attribute in asset.attributes.as_deref().unwrap_or(&[]) {
        match attribute.name.as_str() {
            "position" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_POSITION,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "normal" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_NORMAL,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "uv" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_UV_0,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "uv1" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_UV_1,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            "color" => mesh.insert_attribute(
                Mesh::ATTRIBUTE_COLOR,
                attribute_values(attribute.item_size, &attribute.values),
            ),
            name => {
                let item_size = attribute.item_size;
                let leaked_name = Box::leak(
                    format!("Vertex_{}", name.replace("custom:", "Custom_")).into_boxed_str(),
                );
                mesh.insert_attribute(
                    MeshVertexAttribute::new(
                        leaked_name,
                        custom_attribute_id(name),
                        vertex_format(item_size),
                    ),
                    attribute_values(item_size, &attribute.values),
                );
            }
        }
    }
    if let Some(indices) = asset.indices.as_ref() {
        mesh.insert_indices(Indices::U32(indices.clone()));
    }
    mesh
}

fn attribute_values(item_size: usize, values: &[f32]) -> VertexAttributeValues {
    match item_size {
        1 => VertexAttributeValues::Float32(values.to_vec()),
        2 => VertexAttributeValues::Float32x2(
            values
                .chunks_exact(2)
                .map(|chunk| [chunk[0], chunk[1]])
                .collect(),
        ),
        3 => VertexAttributeValues::Float32x3(
            values
                .chunks_exact(3)
                .map(|chunk| [chunk[0], chunk[1], chunk[2]])
                .collect(),
        ),
        _ => VertexAttributeValues::Float32x4(
            values
                .chunks_exact(4)
                .map(|chunk| [chunk[0], chunk[1], chunk[2], chunk[3]])
                .collect(),
        ),
    }
}

fn vertex_format(item_size: usize) -> VertexFormat {
    match item_size {
        1 => VertexFormat::Float32,
        2 => VertexFormat::Float32x2,
        3 => VertexFormat::Float32x3,
        _ => VertexFormat::Float32x4,
    }
}

fn custom_attribute_id(name: &str) -> usize {
    name.as_bytes().iter().fold(100_000usize, |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ (*byte as usize)
    })
}

fn map_visibility(entity: &WorldEntity) -> Visibility {
    if entity
        .components
        .visibility
        .as_ref()
        .is_some_and(|visibility| !visibility.visible)
        || entity
            .components
            .mesh_renderer
            .as_ref()
            .and_then(|renderer| renderer.visible)
            .is_some_and(|visible| !visible)
    {
        Visibility::Hidden
    } else {
        Visibility::Inherited
    }
}

fn add_material(
    world: &mut World,
    material: &MaterialIr,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    render_target_registry: &NativeRenderTargetRegistry,
) -> Handle<StandardMaterial> {
    let emissive_display_base = uses_emissive_display_base(material);
    let base_texture_asset = material
        .base_color_texture
        .as_deref()
        .and_then(|asset_id| assets_by_id.get(asset_id).copied());
    let uv_transform = base_texture_asset
        .map(texture_uv_transform)
        .unwrap_or_default();
    let extended = material.kind == "extended";
    let mut standard = StandardMaterial {
        alpha_mode: alpha_mode(material),
        base_color: if emissive_display_base {
            emissive_display_base_color(material)
        } else {
            color_with_opacity(&material.color, opacity_for_material(material))
        },
        base_color_texture: texture_handle(
            material.base_color_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        clearcoat: material.clearcoat.unwrap_or(0.0),
        clearcoat_perceptual_roughness: material.clearcoat_roughness.unwrap_or(0.0),
        clearcoat_roughness_texture: texture_handle(
            material.clearcoat_roughness_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        clearcoat_texture: texture_handle(
            material.clearcoat_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        double_sided: material
            .extension
            .as_ref()
            .and_then(|extension| extension.double_sided)
            .unwrap_or(false),
        emissive: emissive_color(material),
        emissive_exposure_weight: if material.kind == "extended"
            && (material.emissive.is_some() || material.emissive_texture.is_some())
        {
            1.0
        } else {
            0.0
        },
        emissive_texture: texture_handle(
            material.emissive_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        fog_enabled: material.emissive.is_none() && material.emissive_texture.is_none(),
        metallic: material.metalness.unwrap_or(0.0),
        metallic_roughness_texture: texture_handle(
            material.metallic_roughness_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        normal_map_texture: texture_handle(
            material.normal_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        occlusion_texture: texture_handle(
            material.occlusion_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        perceptual_roughness: material.roughness.unwrap_or(1.0),
        reflectance: material.specular_intensity.unwrap_or(0.5),
        specular_transmission: material.transmission.unwrap_or(0.0),
        specular_transmission_texture: texture_handle(
            material.transmission_texture.as_deref(),
            assets_by_id,
            asset_server,
            render_target_registry,
        ),
        unlit: extended,
        uv_transform,
        ..Default::default()
    };
    if extended {
        standard.metallic = 0.0;
        standard.perceptual_roughness = 1.0;
        standard.reflectance = 0.0;
    }
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(standard)
}

fn add_emissive_mask_material(world: &mut World) -> Handle<StandardMaterial> {
    world
        .resource_mut::<Assets<StandardMaterial>>()
        .add(StandardMaterial {
            base_color: Color::WHITE,
            emissive: LinearRgba::WHITE,
            fog_enabled: false,
            unlit: true,
            ..Default::default()
        })
}

fn material_policy(material: &MaterialIr) -> NativeMaterialPolicy {
    let unsupported_blend_diagnostic = match material.blend_mode.as_deref() {
        Some("normal") | None => None,
        Some(mode) => Some(format!(
            "TN_BEVY_MATERIAL_BLEND_MODE_UNSUPPORTED: Bevy 0.14 cannot map blendMode '{mode}' with matching semantics."
        )),
    };
    NativeMaterialPolicy {
        blend_mode: material.blend_mode.clone(),
        depth_test: material.depth_test,
        depth_write: material.depth_write,
        extension_preset: material
            .extension
            .as_ref()
            .map(|extension| extension.preset.clone()),
        render_order: material.render_order.unwrap_or(0),
        specular_texture: material.specular_texture.clone(),
        unsupported_blend_diagnostic,
    }
}

fn emissive_bloom_policy(material: &MaterialIr) -> Option<NativeEmissiveBloomPolicy> {
    let bloom = material.emissive_bloom.as_ref()?;
    Some(NativeEmissiveBloomPolicy {
        enabled: bloom.enabled,
        intensity: bloom.intensity,
        material_id: material.id.clone(),
        threshold: bloom.threshold,
    })
}

fn alpha_mode(material: &MaterialIr) -> AlphaMode {
    match material.alpha_mode.as_deref() {
        Some("mask") => AlphaMode::Mask(material.alpha_cutoff.unwrap_or(0.5)),
        Some("blend") => AlphaMode::Blend,
        _ => AlphaMode::Opaque,
    }
}

fn opacity_for_material(material: &MaterialIr) -> f32 {
    let opacity = material.opacity.unwrap_or(1.0);
    if material.kind == "extended" && material.alpha_mode.as_deref() == Some("blend") {
        return opacity.powf(1.9);
    }
    opacity
}

fn emissive_color(material: &MaterialIr) -> LinearRgba {
    let Some(color) = material.emissive.as_ref() else {
        return LinearRgba::BLACK;
    };
    let linear = color_to_bevy(color).to_linear();
    linear * material.emissive_intensity.unwrap_or(1.0) * THREE_COMPAT_EMISSIVE_INTENSITY_SCALE
}

fn emissive_display_base_color(material: &MaterialIr) -> Color {
    let base = color_with_opacity(&material.color, opacity_for_material(material)).to_srgba();
    let Some(emissive) = material.emissive.as_ref() else {
        return Color::srgba(base.red, base.green, base.blue, base.alpha);
    };
    let emissive_srgba = color_to_bevy(emissive).to_srgba();
    let emissive_intensity = material.emissive_intensity.unwrap_or(1.0).max(0.0);
    let emissive_peak = emissive_srgba
        .red
        .max(emissive_srgba.green)
        .max(emissive_srgba.blue)
        .max(0.001);
    let display_intensity = emissive_intensity.max(1.0);
    Color::srgba(
        emissive_srgba.red / emissive_peak * display_intensity,
        emissive_srgba.green / emissive_peak * display_intensity,
        emissive_srgba.blue / emissive_peak * display_intensity,
        base.alpha,
    )
}

fn uses_emissive_display_base(material: &MaterialIr) -> bool {
    material.kind == "extended"
        && material.emissive.is_some()
        && material.emissive_bloom.is_none()
        && material.emissive_intensity.unwrap_or(1.0) >= 1.0
        && material.metalness.unwrap_or(0.0) <= 0.1
        && material.roughness.unwrap_or(1.0) >= 0.35
        && material.base_color_texture.is_none()
}

fn uses_emissive_marker_mask(material: &MaterialIr) -> bool {
    material.kind == "standard"
        && material.emissive.is_some()
        && material.emissive_bloom.is_none()
        && material.emissive_intensity.unwrap_or(1.0) >= 1.0
        && material.metalness.unwrap_or(0.0) <= 0.1
        && material.roughness.unwrap_or(1.0) >= 0.35
        && material.base_color_texture.is_none()
}

fn texture_handle(
    asset_id: Option<&str>,
    assets_by_id: &HashMap<&str, &AssetIr>,
    asset_server: Option<&AssetServer>,
    render_target_registry: &NativeRenderTargetRegistry,
) -> Option<Handle<Image>> {
    let asset_id = asset_id?;
    if let Some(handle) = render_target_registry.images.get(asset_id) {
        return Some(handle.clone());
    }
    let asset = assets_by_id.get(asset_id)?;
    if asset.kind != "texture" {
        return None;
    }
    let path = asset.path.as_ref()?;
    Some(
        asset_server
            .map(|server| load_texture_asset(server, path))
            .unwrap_or_default(),
    )
}

fn map_transform(entity: &WorldEntity) -> Transform {
    let mut transform = Transform::default();
    if let Some(source) = &entity.components.transform {
        if let Some(position) = source.position {
            transform.translation = Vec3::new(position[0], position[1], position[2]);
        }
        if let Some(rotation) = source.rotation {
            transform.rotation =
                Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
        }
        if let Some(scale) = source.scale {
            transform.scale = Vec3::new(scale[0], scale[1], scale[2]);
        }
    }
    transform
}

fn directional_light_transform(transform: Transform, entity: &WorldEntity) -> Transform {
    let mut light_transform = transform;
    let has_authored_position = entity
        .components
        .transform
        .as_ref()
        .and_then(|source| source.position)
        .is_some();
    if !has_authored_position {
        // Three.js DirectionalLight defaults to a light positioned on +Y and
        // targeted at the origin. Mirror that direction when the IR omits a
        // transform instead of looking from the origin back into itself.
        light_transform.translation = Vec3::Y;
    }
    light_transform.look_at(Vec3::ZERO, Vec3::Y);
    light_transform
}

fn color_to_bevy(color: &ColorIr) -> Color {
    match color {
        ColorIr::Hex(hex) => {
            let trimmed = hex.trim_start_matches('#');
            if trimmed.len() != 6 {
                return Color::WHITE;
            }
            let Ok(value) = u32::from_str_radix(trimmed, 16) else {
                return Color::WHITE;
            };
            let red = ((value >> 16) & 0xff) as f32 / 255.0;
            let green = ((value >> 8) & 0xff) as f32 / 255.0;
            let blue = (value & 0xff) as f32 / 255.0;
            Color::srgb(red, green, blue)
        }
        ColorIr::Rgb(rgb) => Color::srgb(rgb[0], rgb[1], rgb[2]),
    }
}

fn color_with_opacity(color: &ColorIr, opacity: f32) -> Color {
    let srgba = color_to_bevy(color).to_srgba();
    Color::srgba(srgba.red, srgba.green, srgba.blue, opacity)
}

fn emissive_luminance(material: &StandardMaterial) -> f32 {
    let color = material.emissive;
    color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722
}

fn round_trace_value(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
