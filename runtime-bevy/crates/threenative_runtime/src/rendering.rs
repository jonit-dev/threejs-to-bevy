use bevy::{
    pbr::{CascadeShadowConfigBuilder, DirectionalLightShadowMap},
    prelude::*,
    render::alpha::AlphaMode,
};
use threenative_components::ThreeNativeId;
use threenative_loader::{ColorIr, LoadedBundle};

// Atmosphere sun is an additive environment light; keep it much lower than the
// explicit world directional light so bundles that include both don't double the
// direct lighting compared with the Three.js path.
const THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY: f32 = 0.35;

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeRenderedParticle {
    pub asset: String,
    pub emitter: String,
    pub index: u32,
    pub shape: String,
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeParticleMaterialPolicy {
    pub base_color: String,
    pub opacity: f32,
    pub size: f32,
}

#[derive(Debug, PartialEq)]
pub struct RenderedParticleEmitterObservation {
    pub asset: String,
    pub base_color: String,
    pub count: u32,
    pub emitter: String,
    pub max_particles: u32,
    pub opacity: f32,
    pub shape: String,
    pub size: f32,
}

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
                illuminance: profile.sun.intensity / profile.color_management.exposure.max(0.001)
                    * THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY,
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

pub fn observe_rendered_particles(bundle: &LoadedBundle, elapsed_seconds: f32) -> Vec<RenderedParticleEmitterObservation> {
    let mut observations = bundle
        .assets
        .assets
        .iter()
        .filter(|asset| asset.kind == "model")
        .flat_map(|asset| {
            asset
                .particle_emitters
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|emitter| RenderedParticleEmitterObservation {
                    asset: asset.id.clone(),
                    base_color: "#f6c36a".to_owned(),
                    count: rendered_particle_count(emitter.max_particles, emitter.rate_per_second, elapsed_seconds),
                    emitter: emitter.id.clone(),
                    max_particles: emitter.max_particles,
                    opacity: 0.82,
                    shape: emitter.shape.clone(),
                    size: 0.08,
                })
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.asset.cmp(&right.asset).then(left.emitter.cmp(&right.emitter)));
    observations
}

pub fn spawn_rendered_particles(world: &mut World, bundle: &LoadedBundle, elapsed_seconds: f32) {
    for observation in observe_rendered_particles(bundle, elapsed_seconds) {
        for index in 0..observation.count {
            world
                .spawn((
                    NativeRenderedParticle {
                        asset: observation.asset.clone(),
                        emitter: observation.emitter.clone(),
                        index,
                        shape: observation.shape.clone(),
                    },
                    NativeParticleMaterialPolicy {
                        base_color: observation.base_color.clone(),
                        opacity: observation.opacity,
                        size: observation.size,
                    },
                    ThreeNativeId(format!(
                        "particle.{}.{}.{}",
                        observation.asset, observation.emitter, index
                    )),
                    Name::new(format!(
                        "particle.{}.{}.{}",
                        observation.asset, observation.emitter, index
                    )),
                    Transform::from_translation(particle_position(
                        &observation.asset,
                        &observation.emitter,
                        index,
                        &observation.shape,
                        0.25,
                    )),
                ));
        }
    }
}

fn rendered_particle_count(max_particles: u32, rate_per_second: f32, elapsed_seconds: f32) -> u32 {
    if !rate_per_second.is_finite() || !elapsed_seconds.is_finite() || rate_per_second <= 0.0 || elapsed_seconds <= 0.0 {
        return 0;
    }
    max_particles.min((rate_per_second * elapsed_seconds).floor() as u32)
}

fn particle_position(asset: &str, emitter: &str, index: u32, shape: &str, radius: f32) -> Vec3 {
    let seed = format!("{asset}:{emitter}");
    let x = seeded_unit(&seed, index, 0) * 2.0 - 1.0;
    let y = seeded_unit(&seed, index, 1);
    let z = seeded_unit(&seed, index, 2) * 2.0 - 1.0;
    if shape == "sphere" {
        let direction = Vec3::new(x, y, z).normalize_or_zero();
        return direction * radius;
    }
    Vec3::new(x * 0.05, y * 0.2, z * 0.05)
}

fn seeded_unit(seed: &str, index: u32, channel: u32) -> f32 {
    let input = format!("{seed}:{index}:{channel}");
    let mut hash = 2166136261u32;
    for byte in input.as_bytes() {
        hash ^= *byte as u32;
        hash = hash.wrapping_mul(16777619);
    }
    hash as f32 / u32::MAX as f32
}

pub fn normalize_loaded_gltf_materials(mut materials: ResMut<Assets<StandardMaterial>>) {
    for (_, material) in materials.iter_mut() {
        normalize_textured_material(material);
    }
}

pub fn normalize_textured_material(material: &mut StandardMaterial) -> bool {
    if material.base_color_texture.is_none() || material.unlit {
        return false;
    }
    material.base_color = Color::WHITE;
    material.alpha_mode = AlphaMode::Mask(0.2);
    material.double_sided = true;
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
