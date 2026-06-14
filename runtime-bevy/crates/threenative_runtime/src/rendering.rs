use bevy::{
    pbr::{CascadeShadowConfigBuilder, DirectionalLightShadowMap},
    prelude::*,
    render::alpha::AlphaMode,
};
use threenative_loader::{ColorIr, LoadedBundle};

#[derive(Debug, PartialEq)]
pub struct AtmosphereObservation {
    pub profile_id: Option<String>,
    pub sun_intensity: Option<f32>,
    pub sun_direction: Option<[f32; 3]>,
    pub ambient_intensity: Option<f32>,
    pub fog_mode: Option<String>,
    pub fog_color: Option<String>,
    pub fog_density: Option<f32>,
    pub fog_near: Option<f32>,
    pub fog_far: Option<f32>,
    pub sky_color: Option<String>,
    pub sky_horizon_color: Option<String>,
    pub shadow_map_size: Option<u32>,
    pub shadow_bias: Option<f32>,
    pub shadow_normal_bias: Option<f32>,
    pub shadow_max_distance: Option<f32>,
    pub shadow_cascade_count: Option<u32>,
    pub tone_mapping: Option<String>,
    pub exposure: Option<f32>,
    pub output_color_space: Option<String>,
    pub texture_color_space: Option<String>,
    pub diagnostics: Vec<String>,
}

pub fn observe_atmosphere(bundle: &LoadedBundle) -> AtmosphereObservation {
    let Some(profile) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
    else {
        return AtmosphereObservation {
            profile_id: None,
            sun_intensity: None,
            sun_direction: None,
            ambient_intensity: None,
            fog_mode: None,
            fog_color: None,
            fog_density: None,
            fog_near: None,
            fog_far: None,
            sky_color: None,
            sky_horizon_color: None,
            shadow_map_size: None,
            shadow_bias: None,
            shadow_normal_bias: None,
            shadow_max_distance: None,
            shadow_cascade_count: None,
            tone_mapping: None,
            exposure: None,
            output_color_space: None,
            texture_color_space: None,
            diagnostics: vec!["TN-BEVY-ATMOSPHERE-MISSING".to_owned()],
        };
    };
    let fog = profile.fog.as_ref().filter(|fog| fog.enabled);

    AtmosphereObservation {
        profile_id: Some(profile.id.clone()),
        sun_intensity: Some(profile.sun.intensity),
        sun_direction: Some(profile.sun.direction),
        ambient_intensity: Some(profile.ambient.intensity),
        fog_mode: fog.map(|fog| fog.mode.clone()),
        fog_color: fog.map(|fog| color_string(&fog.color)),
        fog_density: fog.and_then(|fog| fog.density),
        fog_near: fog.and_then(|fog| fog.near),
        fog_far: fog.and_then(|fog| fog.far),
        sky_color: Some(color_string(&profile.sky.color)),
        sky_horizon_color: profile.sky.horizon_color.as_ref().map(color_string),
        shadow_map_size: Some(profile.shadows.map_size),
        shadow_bias: Some(profile.shadows.bias),
        shadow_normal_bias: Some(profile.shadows.normal_bias),
        shadow_max_distance: Some(profile.shadows.max_distance),
        shadow_cascade_count: Some(profile.shadows.cascade_count),
        tone_mapping: Some(profile.color_management.tone_mapping.clone()),
        exposure: Some(profile.color_management.exposure),
        output_color_space: Some(profile.color_management.output_color_space.clone()),
        texture_color_space: Some(profile.color_management.texture_color_space.clone()),
        diagnostics: Vec::new(),
    }
}

pub fn apply_atmosphere_to_world(world: &mut World, bundle: &LoadedBundle) {
    let Some(profile) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
    else {
        return;
    };

    world.insert_resource(ClearColor(color_to_bevy(&profile.sky.color)));
    world.insert_resource(AmbientLight {
        color: color_to_bevy(&profile.ambient.color),
        brightness: profile.ambient.intensity,
    });
    world.insert_resource(DirectionalLightShadowMap {
        size: profile.shadows.map_size as usize,
    });
    world
        .spawn(DirectionalLightBundle {
            directional_light: DirectionalLight {
                color: color_to_bevy(&profile.sun.color),
                illuminance: profile.sun.intensity * 350.0,
                shadows_enabled: profile.sun.casts_shadow && profile.shadows.enabled,
                shadow_depth_bias: profile.shadows.bias.abs().max(0.005),
                shadow_normal_bias: profile.shadows.normal_bias.max(0.02),
                ..Default::default()
            },
            cascade_shadow_config: CascadeShadowConfigBuilder {
                num_cascades: profile.shadows.cascade_count.max(1) as usize,
                minimum_distance: 0.05,
                first_cascade_far_bound: profile.shadows.max_distance.min(12.0).max(1.0),
                maximum_distance: profile.shadows.max_distance,
                ..Default::default()
            }
            .into(),
            transform: Transform::default().looking_to(
                Vec3::new(
                    profile.sun.direction[0],
                    profile.sun.direction[1],
                    profile.sun.direction[2],
                ),
                Vec3::Y,
            ),
            ..Default::default()
        })
        .insert(Name::new(profile.sun.id.clone()));
}

pub fn normalize_loaded_gltf_materials(mut materials: ResMut<Assets<StandardMaterial>>) {
    for (_, material) in materials.iter_mut() {
        normalize_textured_material(material);
    }
}

pub fn normalize_textured_material(material: &mut StandardMaterial) -> bool {
    if material.base_color_texture.is_none() {
        return false;
    }
    material.base_color = Color::WHITE;
    material.alpha_mode = AlphaMode::Mask(0.2);
    material.double_sided = false;
    material.cull_mode = None;
    true
}

fn color_string(color: &ColorIr) -> String {
    match color {
        ColorIr::Hex(value) => value.clone(),
        ColorIr::Rgb(value) => format!("rgb({},{},{})", value[0], value[1], value[2]),
    }
}

fn color_to_bevy(color: &ColorIr) -> Color {
    match color {
        ColorIr::Hex(value) => hex_to_bevy(value).unwrap_or(Color::WHITE),
        ColorIr::Rgb(value) => Color::srgb(value[0], value[1], value[2]),
    }
}

fn hex_to_bevy(value: &str) -> Option<Color> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
    Some(Color::srgb(r, g, b))
}
