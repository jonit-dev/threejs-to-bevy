use bevy::{
    ecs::event::ManualEventReader,
    pbr::{
        CascadeShadowConfigBuilder, DirectionalLightShadowMap, LightProbe, VolumetricLight,
        irradiance_volume::IrradianceVolume,
    },
    prelude::*,
    render::{
        alpha::AlphaMode,
        render_asset::RenderAssetUsages,
        render_resource::{
            Extent3d, TextureDimension, TextureFormat, TextureUsages, TextureViewDescriptor,
            TextureViewDimension,
        },
    },
};
use image::ImageReader;
use serde::Serialize;
use std::{
    collections::HashSet,
    f32::consts::{FRAC_PI_2, PI, TAU},
};
use threenative_components::ThreeNativeId;
use threenative_loader::{
    AtmosphereProfileIr, AtmosphereShadowsIr, ColorIr, EnvironmentTextureSourceIr,
    LightProbeSourceIr, LoadedBundle, RuntimeConfigIr,
};

use crate::map_world::NativeMaterialHandles;
use crate::height_fog_postprocess::NativeHeightFog;
use crate::ssgi_postprocess::NativeSsgi;

pub mod contact_shadows;

// Calibrated against atmosphere fog scenes (parity-smoke, v8-rendering-quality, v3 forest).
const THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY: f32 = 1.0;
const THREE_COMPAT_ATMOSPHERE_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 0.25;
const THREE_COMPAT_ENVIRONMENT_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 0.45;
const THREE_COMPAT_ENVIRONMENT_MAP_LIGHT_INTENSITY_PER_UNIT: f32 = 0.55;
pub(crate) const THREE_COMPAT_BAKED_PROBE_IRRADIANCE_INTENSITY_PER_UNIT: f32 = 1.0;
const THREE_COMPAT_BAKED_PROBE_ATMOSPHERE_BASELINE_PER_UNIT: f32 = 4.2;
const THREE_COMPAT_SHADOW_BIAS_SCALE: f32 = 100.0;
const ATMOSPHERE_SHADOW_MINIMUM_DISTANCE: f32 = 0.05;
const ATMOSPHERE_SHADOW_DEFAULT_BLEND_FRACTION: f32 = 0.2;
const ATMOSPHERE_SHADOW_DEFAULT_SPLIT_LAMBDA: f32 = 0.5;
const ATMOSPHERE_SHADOW_DEFAULT_SPLIT_SCHEME: &str = "practical";
const NATIVE_VOLUMETRIC_BASE_ABSORPTION: f32 = 0.1;
const NATIVE_VOLUMETRIC_BASE_SCATTERING: f32 = 0.0;
const NATIVE_VOLUMETRIC_SHAFT_SCATTERING_SCALE: f32 = 0.35;
const NATIVE_VOLUMETRIC_SHAFT_DENSITY_SCALE: f32 = 0.025;
const NATIVE_VOLUMETRIC_SCATTERING_ASYMMETRY: f32 = 0.5;
// Bevy 0.14's deferred irradiance fallback cannot reconstruct the web
// hemisphere ray that carries floor/window bounce onto the room ceiling. A
// shadowless upward light supplies only that missing downward-facing lobe and
// is enabled strictly alongside native SSGI.
const NATIVE_SSGI_CEILING_BOUNCE_ILLUMINANCE: f32 = 0.6;
// The same deferred limitation removes much of the window bounce from broad
// upward-facing receivers. Keep the floor lobe lower than the ceiling lobe so
// it restores the web's surface response without flattening the dark room.
const NATIVE_SSGI_FLOOR_BOUNCE_ILLUMINANCE: f32 = 0.25;
// Bevy includes the normalized 1/(4pi) phase term while the web artistic pass
// intentionally does not. This adapter calibration restores equivalent shaft
// radiance without coupling the authored density to room haze.
const NATIVE_VOLUMETRIC_LIGHT_INTENSITY_SCALE: f32 = 5.4;
pub(crate) fn native_ssgi_ambient_multiplier(config: Option<&RuntimeConfigIr>) -> f32 {
    let Some(ssgi) = config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.screen_space_global_illumination.as_ref())
        .filter(|ssgi| ssgi.enabled)
    else {
        return 1.0;
    };
    let _ = ssgi;
    0.15
}

#[cfg(test)]
mod ssgi_ambient_tests {
    use super::*;

    fn runtime_config(enabled: bool) -> RuntimeConfigIr {
        serde_json::from_value(serde_json::json!({
            "schema": "threenative.runtime-config",
            "version": "0.1.0",
            "renderer": {
                "antialias": "msaa4",
                "screenSpaceGlobalIllumination": {
                    "enabled": enabled,
                    "intensity": 0.12,
                    "quality": "high",
                    "radius": 8
                }
            },
            "time": { "fixedDelta": 0.016666667, "paused": true },
            "window": { "height": 720, "width": 1280 }
        }))
        .expect("runtime config fixture should deserialize")
    }

    #[test]
    fn reduces_flat_ambient_only_while_ssgi_is_enabled() {
        assert!((native_ssgi_ambient_multiplier(Some(&runtime_config(true))) - 0.15).abs() < f32::EPSILON);
        assert!((native_ssgi_ambient_multiplier(Some(&runtime_config(false))) - 1.0).abs() < f32::EPSILON);
        assert!((native_ssgi_ambient_multiplier(None) - 1.0).abs() < f32::EPSILON);
    }
}

#[derive(Clone, Component, Debug)]
struct NativeAtmosphereSun;

#[derive(Clone, Component, Debug)]
struct NativeSsgiCeilingBounce;

#[derive(Clone, Component, Debug)]
struct NativeSsgiFloorBounce;

#[derive(Clone, Debug, PartialEq, Resource, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVolumetricsReport {
    pub god_rays_requested: bool,
    pub god_rays_applied: bool,
    pub god_rays_reason: Option<String>,
    pub height_fog_requested: bool,
    pub height_fog_mode: String,
    pub height_fog_reason: Option<String>,
    pub ignored_base_height: Option<f32>,
    pub ignored_falloff_height: Option<f32>,
}

#[derive(Clone, Debug, PartialEq, Resource)]
pub struct NativeAtmosphereSignature(pub String);

pub fn native_atmosphere_signature(bundle: &LoadedBundle) -> String {
    format!(
        "{:?}",
        bundle
            .environment_scene
            .as_ref()
            .and_then(|scene| scene.atmosphere.as_ref())
    )
}

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
    pub shadow_cascade_profile: Option<NativeShadowCascadeProfileReport>,
    pub tone_mapping: Option<String>,
    pub exposure: Option<f32>,
    pub output_color_space: Option<String>,
    pub texture_color_space: Option<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeShadowCascadeProfile {
    pub cascade_count: u32,
    pub max_distance: f32,
    pub split_scheme: String,
    pub split_lambda: f32,
    pub cascade_blend_fraction: f32,
    pub stabilized: bool,
}

#[derive(Clone, Component, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeShadowCascadeProfileReport {
    pub requested: NativeShadowCascadeProfile,
    pub applied: NativeShadowCascadeProfile,
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, PartialEq)]
pub struct EnvironmentLightingObservation {
    pub skybox: Option<EnvironmentTextureObservation>,
    pub environment_map: Option<EnvironmentMapObservation>,
    pub light_probes: Vec<LightProbeObservation>,
    pub diagnostics: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub struct EnvironmentTextureObservation {
    pub mode: String,
    pub asset_ids: Vec<String>,
    pub applied: bool,
}

#[derive(Debug, PartialEq)]
pub struct EnvironmentMapObservation {
    pub mode: String,
    pub intent: String,
    pub asset_ids: Vec<String>,
    pub applied: bool,
}

#[derive(Debug, PartialEq)]
pub struct LightProbeObservation {
    pub id: String,
    pub intent: String,
    pub asset_ids: Vec<String>,
    pub applied: bool,
    pub mode: String,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeEnvironmentMapHandles {
    pub diffuse_map: Handle<Image>,
    pub specular_map: Handle<Image>,
    pub intensity: f32,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeBakedProbeLightingApplied;

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
            shadow_cascade_profile: None,
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
        shadow_cascade_profile: resolve_native_shadow_cascade_profile(&profile.shadows),
        tone_mapping: Some(profile.color_management.tone_mapping.clone()),
        exposure: Some(profile.color_management.exposure),
        output_color_space: Some(profile.color_management.output_color_space.clone()),
        texture_color_space: Some(profile.color_management.texture_color_space.clone()),
        diagnostics: Vec::new(),
    }
}

pub fn apply_atmosphere_to_world(world: &mut World, bundle: &LoadedBundle) {
    world.insert_resource(NativeAtmosphereSignature(native_atmosphere_signature(
        bundle,
    )));
    let owned_suns = world
        .query_filtered::<Entity, With<NativeAtmosphereSun>>()
        .iter(world)
        .collect::<Vec<_>>();
    for entity in owned_suns {
        world.despawn(entity);
    }
    let cameras = world
        .query_filtered::<Entity, With<Camera3d>>()
        .iter(world)
        .collect::<Vec<_>>();
    for entity in cameras {
        world
            .entity_mut(entity)
            .remove::<bevy::pbr::VolumetricFogSettings>();
    }
    let Some(profile) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
    else {
        world.remove_resource::<NativeVolumetricsReport>();
        return;
    };

    let height_fog = profile
        .volumetrics
        .as_ref()
        .and_then(|volumetrics| volumetrics.height_fog.as_ref())
        .filter(|fog| fog.enabled);
    let god_rays = profile
        .volumetrics
        .as_ref()
        .and_then(|volumetrics| volumetrics.god_rays.as_ref())
        .filter(|rays| rays.enabled);
    let god_rays_applied =
        god_rays.is_some() && profile.sun.casts_shadow && profile.shadows.enabled;
    world.insert_resource(NativeVolumetricsReport {
        god_rays_requested: god_rays.is_some(),
        god_rays_applied,
        god_rays_reason: (god_rays.is_some() && !god_rays_applied)
            .then(|| "shadow-map-unavailable".to_owned()),
        height_fog_requested: height_fog.is_some(),
        height_fog_mode: if height_fog.is_some() {
            "analytic-height-post-pass".to_owned()
        } else {
            "disabled".to_owned()
        },
        height_fog_reason: None,
        ignored_base_height: None,
        ignored_falloff_height: None,
    });
    if let Some(settings) = native_volumetric_fog_settings(Some(profile)) {
        let cameras = world
            .query_filtered::<Entity, With<Camera3d>>()
            .iter(world)
            .collect::<Vec<_>>();
        for entity in cameras {
            world.entity_mut(entity).insert(settings);
        }
    }

    world.insert_resource(ClearColor(color_to_bevy(&profile.sky.color)));
    world.insert_resource(AmbientLight {
        color: color_to_bevy(&profile.ambient.color),
        brightness: profile.ambient.intensity
            * THREE_COMPAT_ATMOSPHERE_AMBIENT_BRIGHTNESS_PER_INTENSITY
            * native_ssgi_ambient_multiplier(bundle.runtime_config.as_ref()),
    });
    world.insert_resource(DirectionalLightShadowMap {
        size: profile.shadows.map_size.min(2048) as usize,
    });
    let (cascade_shadow_config, cascade_profile) =
        resolve_atmosphere_shadow_cascade_config(&profile.shadows, bundle);
    let mut sun = world.spawn(DirectionalLightBundle {
        directional_light: DirectionalLight {
            color: color_to_bevy(&profile.sun.color),
            illuminance: profile.sun.intensity
                * THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY,
            shadows_enabled: profile.sun.casts_shadow && profile.shadows.enabled,
            shadow_depth_bias: atmosphere_shadow_depth_bias(profile.shadows.bias),
            shadow_normal_bias: profile.shadows.normal_bias,
            ..Default::default()
        },
        cascade_shadow_config,
        transform: Transform::default().looking_to(
            Vec3::new(
                profile.sun.direction[0],
                profile.sun.direction[1],
                profile.sun.direction[2],
            ),
            Vec3::Y,
        ),
        ..Default::default()
    });
    sun.insert(Name::new(profile.sun.id.clone()));
    sun.insert(NativeAtmosphereSun);
    if let Some(cascade_profile) = cascade_profile {
        sun.insert(cascade_profile);
    }
    if profile
        .volumetrics
        .as_ref()
        .and_then(|volumetrics| volumetrics.god_rays.as_ref())
        .is_some_and(|god_rays| god_rays.enabled)
        && profile.sun.casts_shadow
        && profile.shadows.enabled
    {
        sun.insert(VolumetricLight);
    }
    drop(sun);
    if native_ssgi_settings(bundle.runtime_config.as_ref(), Some(profile)).is_some() {
        world
            .spawn(DirectionalLightBundle {
                directional_light: DirectionalLight {
                    color: color_to_bevy(&profile.sun.color),
                    illuminance: NATIVE_SSGI_CEILING_BOUNCE_ILLUMINANCE,
                    shadows_enabled: false,
                    ..Default::default()
                },
                transform: Transform::default().looking_to(Vec3::Y, Vec3::Z),
                ..Default::default()
            })
            .insert((
                Name::new("threenative:ssgi-ceiling-bounce"),
                NativeAtmosphereSun,
                NativeSsgiCeilingBounce,
            ));
        world
            .spawn(DirectionalLightBundle {
                directional_light: DirectionalLight {
                    color: color_to_bevy(&profile.sun.color),
                    illuminance: NATIVE_SSGI_FLOOR_BOUNCE_ILLUMINANCE,
                    shadows_enabled: false,
                    ..Default::default()
                },
                transform: Transform::default().looking_to(-Vec3::Y, Vec3::Z),
                ..Default::default()
            })
            .insert((
                Name::new("threenative:ssgi-floor-bounce"),
                NativeAtmosphereSun,
                NativeSsgiFloorBounce,
            ));
    }
}

pub(crate) fn native_volumetric_fog_settings(
    profile: Option<&AtmosphereProfileIr>,
) -> Option<bevy::pbr::VolumetricFogSettings> {
    let profile = profile.filter(|profile| profile.active)?;
    let volumetrics = profile.volumetrics.as_ref()?;
    let god_rays = volumetrics.god_rays.as_ref().filter(|rays| rays.enabled);
    let god_rays = god_rays?;
    // Height fog owns the authored medium color. Bevy multiplies its
    // volumetric `fog_color` into directional-light radiance, unlike the web
    // god-ray pass; keeping that term white prevents the sun tint from being
    // multiplied by a second warm color and turning shafts orange.
    let fog_color = Color::WHITE;
    let quality = god_rays.quality.as_str();
    let step_count = match quality {
        "low" => 24,
        "high" => 96,
        _ => 48,
    };
    let shaft_density = god_rays.density;
    Some(bevy::pbr::VolumetricFogSettings {
        fog_color,
        ambient_color: color_to_bevy(&profile.ambient.color),
        ambient_intensity: 0.0,
        step_count,
        max_depth: god_rays.max_distance,
        absorption: NATIVE_VOLUMETRIC_BASE_ABSORPTION,
        scattering: NATIVE_VOLUMETRIC_BASE_SCATTERING
            + shaft_density * NATIVE_VOLUMETRIC_SHAFT_SCATTERING_SCALE,
        density: shaft_density * NATIVE_VOLUMETRIC_SHAFT_DENSITY_SCALE,
        scattering_asymmetry: NATIVE_VOLUMETRIC_SCATTERING_ASYMMETRY,
        light_tint: color_to_bevy(&profile.sun.color),
        light_intensity: god_rays.intensity * NATIVE_VOLUMETRIC_LIGHT_INTENSITY_SCALE,
    })
}

pub(crate) fn native_height_fog_settings(profile: Option<&AtmosphereProfileIr>) -> Option<NativeHeightFog> {
    let profile = profile.filter(|profile| profile.active)?;
    let fog = profile.volumetrics.as_ref()?.height_fog.as_ref().filter(|fog| fog.enabled)?;
    let color = fog.color.as_ref()
        .or_else(|| profile.fog.as_ref().map(|fog| &fog.color))
        .unwrap_or(&profile.sky.color);
    Some(NativeHeightFog::new(
        color_to_bevy(color),
        fog.density,
        fog.base_height,
        fog.falloff_height,
        profile.shadows.max_distance,
    ))
}

pub(crate) fn native_ssgi_settings(config: Option<&RuntimeConfigIr>, profile: Option<&AtmosphereProfileIr>) -> Option<NativeSsgi> {
    let ssgi = config?.renderer.as_ref()?.screen_space_global_illumination.as_ref().filter(|ssgi| ssgi.enabled)?;
    let profile = profile.filter(|profile| profile.active);
    let ambient = profile.map(|profile| color_to_bevy(&profile.ambient.color)).unwrap_or(Color::srgb(0.125, 0.14, 0.165));
    let linear = ambient.to_linear();
    let scale = profile.map_or(0.2, |profile| profile.ambient.intensity).max(0.0) * 0.15;
    Some(NativeSsgi::with_quality(
        ssgi.radius.unwrap_or(10.0),
        ssgi.intensity.unwrap_or(1.0),
        Color::linear_rgb(linear.red * scale, linear.green * scale, linear.blue * scale),
        ssgi.quality.as_str(),
    ))
}

fn resolve_atmosphere_shadow_cascade_config(
    shadows: &AtmosphereShadowsIr,
    bundle: &LoadedBundle,
) -> (
    bevy::pbr::CascadeShadowConfig,
    Option<NativeShadowCascadeProfileReport>,
) {
    let Some(profile) = resolve_native_shadow_cascade_profile(shadows) else {
        return (
            CascadeShadowConfigBuilder {
                num_cascades: shadows.cascade_count.max(1) as usize,
                minimum_distance: ATMOSPHERE_SHADOW_MINIMUM_DISTANCE,
                first_cascade_far_bound: atmosphere_shadow_first_cascade(
                    shadows.max_distance,
                    bundle,
                ),
                maximum_distance: atmosphere_shadow_camera_distance(shadows.max_distance, bundle),
                ..Default::default()
            }
            .into(),
            None,
        );
    };

    let minimum_distance =
        ATMOSPHERE_SHADOW_MINIMUM_DISTANCE.min(profile.applied.max_distance * 0.5);
    let first_cascade_far_bound = atmosphere_shadow_authored_first_cascade(
        minimum_distance,
        profile.applied.max_distance,
        profile.applied.cascade_count,
        &profile.applied.split_scheme,
        profile.applied.split_lambda,
    );
    let config = CascadeShadowConfigBuilder {
        num_cascades: profile.applied.cascade_count as usize,
        minimum_distance,
        first_cascade_far_bound,
        maximum_distance: profile.applied.max_distance,
        overlap_proportion: profile.applied.cascade_blend_fraction,
    }
    .into();
    (config, Some(profile))
}

pub fn resolve_native_shadow_cascade_profile(
    shadows: &AtmosphereShadowsIr,
) -> Option<NativeShadowCascadeProfileReport> {
    if shadows.cascade_blend_fraction.is_none()
        && shadows.split_lambda.is_none()
        && shadows.split_scheme.is_none()
        && shadows.stabilized.is_none()
    {
        return None;
    }

    let requested = NativeShadowCascadeProfile {
        cascade_count: shadows.cascade_count.max(1),
        max_distance: shadows.max_distance,
        split_scheme: shadows
            .split_scheme
            .clone()
            .unwrap_or_else(|| ATMOSPHERE_SHADOW_DEFAULT_SPLIT_SCHEME.to_owned()),
        split_lambda: shadows
            .split_lambda
            .unwrap_or(ATMOSPHERE_SHADOW_DEFAULT_SPLIT_LAMBDA),
        cascade_blend_fraction: shadows
            .cascade_blend_fraction
            .unwrap_or(ATMOSPHERE_SHADOW_DEFAULT_BLEND_FRACTION),
        stabilized: shadows.stabilized.unwrap_or(true),
    };
    let mut applied = requested.clone();
    let mut reasons = Vec::new();

    if applied.cascade_blend_fraction >= 1.0 {
        applied.cascade_blend_fraction = f32::from_bits(1.0f32.to_bits() - 1);
        reasons.push(
            "Bevy 0.14.2 requires cascade overlap to be less than 1; the applied value is the largest representable f32 below 1."
                .to_owned(),
        );
    }
    if !requested.stabilized {
        applied.stabilized = true;
        reasons.push(
            "Bevy 0.14.2 directional cascades are always engine-stabilized and cannot disable stabilization."
                .to_owned(),
        );
    }

    let approximates_intermediate_splits = requested.cascade_count > 2
        && !(requested.split_scheme == "logarithmic"
            || (requested.split_scheme == "practical" && requested.split_lambda == 1.0));
    if approximates_intermediate_splits {
        reasons.push(
            "Bevy 0.14.2 preserves the requested first split and maximum distance, then exponentially spaces intermediate cascade bounds."
                .to_owned(),
        );
    }

    Some(NativeShadowCascadeProfileReport {
        requested,
        applied,
        mode: if approximates_intermediate_splits {
            "first-split-exponential-approximation"
        } else {
            "exact"
        }
        .to_owned(),
        reason: (!reasons.is_empty()).then(|| reasons.join(" ")),
    })
}

fn atmosphere_shadow_authored_first_cascade(
    minimum_distance: f32,
    maximum_distance: f32,
    cascade_count: u32,
    split_scheme: &str,
    split_lambda: f32,
) -> f32 {
    if cascade_count <= 1 {
        return maximum_distance;
    }
    let cascade_count = cascade_count as f32;
    let uniform = minimum_distance + (maximum_distance - minimum_distance) / cascade_count;
    let logarithmic =
        minimum_distance * (maximum_distance / minimum_distance).powf(1.0 / cascade_count);
    match split_scheme {
        "uniform" => uniform,
        "logarithmic" => logarithmic,
        _ => uniform + (logarithmic - uniform) * split_lambda,
    }
}

fn atmosphere_shadow_camera_distance(authored_distance: f32, bundle: &LoadedBundle) -> f32 {
    let authored_distance = authored_distance.max(1.0);
    let Some(scene_span) = authored_shadow_scene_span(bundle) else {
        return authored_distance;
    };
    scene_span + authored_distance
}

fn atmosphere_shadow_first_cascade(authored_distance: f32, bundle: &LoadedBundle) -> f32 {
    let authored_distance = authored_distance.max(1.0);
    let camera_distance = atmosphere_shadow_camera_distance(authored_distance, bundle);
    authored_distance.min(camera_distance)
}

fn atmosphere_shadow_depth_bias(authored_bias: f32) -> f32 {
    (authored_bias.abs() * THREE_COMPAT_SHADOW_BIAS_SCALE).clamp(0.001, 0.05)
}

fn authored_shadow_scene_span(bundle: &LoadedBundle) -> Option<f32> {
    let cameras = bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.camera.is_some())
        .filter_map(|entity| entity.components.transform.as_ref()?.position)
        .map(Vec3::from)
        .collect::<Vec<_>>();
    if cameras.is_empty() {
        return None;
    }
    let positions = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| entity.components.transform.as_ref()?.position)
        .map(Vec3::from)
        .collect::<Vec<_>>();
    if positions.is_empty() {
        return None;
    }
    cameras
        .iter()
        .flat_map(|camera| {
            positions
                .iter()
                .map(move |position| camera.distance(*position))
        })
        .reduce(f32::max)
}

pub fn observe_rendered_particles(
    bundle: &LoadedBundle,
    elapsed_seconds: f32,
) -> Vec<RenderedParticleEmitterObservation> {
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
                    count: rendered_particle_count(
                        emitter.max_particles,
                        emitter.rate_per_second,
                        elapsed_seconds,
                    ),
                    emitter: emitter.id.clone(),
                    max_particles: emitter.max_particles,
                    opacity: 0.82,
                    shape: emitter.shape.clone(),
                    size: 0.08,
                })
        })
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| {
        left.asset
            .cmp(&right.asset)
            .then(left.emitter.cmp(&right.emitter))
    });
    observations
}

pub fn spawn_rendered_particles(world: &mut World, bundle: &LoadedBundle, elapsed_seconds: f32) {
    for observation in observe_rendered_particles(bundle, elapsed_seconds) {
        for index in 0..observation.count {
            world.spawn((
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
    if !rate_per_second.is_finite()
        || !elapsed_seconds.is_finite()
        || rate_per_second <= 0.0
        || elapsed_seconds <= 0.0
    {
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

pub fn observe_environment_lighting(bundle: &LoadedBundle) -> EnvironmentLightingObservation {
    let Some(scene) = bundle.environment_scene.as_ref() else {
        return EnvironmentLightingObservation {
            skybox: None,
            environment_map: None,
            light_probes: Vec::new(),
            diagnostics: Vec::new(),
        };
    };
    EnvironmentLightingObservation {
        skybox: scene
            .skybox
            .as_ref()
            .map(|skybox| EnvironmentTextureObservation {
                mode: skybox.mode.clone(),
                asset_ids: texture_asset_ids(&EnvironmentTextureSourceIr {
                    asset: skybox.asset.clone(),
                    faces: skybox.faces.clone(),
                    mode: skybox.mode.clone(),
                }),
                applied: false,
            }),
        environment_map: scene.environment_map.as_ref().map(|environment_map| {
            EnvironmentMapObservation {
                mode: environment_map.mode.clone(),
                intent: environment_map.intent.clone(),
                asset_ids: texture_asset_ids(&EnvironmentTextureSourceIr {
                    asset: environment_map.asset.clone(),
                    faces: environment_map.faces.clone(),
                    mode: environment_map.mode.clone(),
                }),
                applied: false,
            }
        }),
        light_probes: scene
            .light_probes
            .iter()
            .map(|probe| LightProbeObservation {
                id: probe.id.clone(),
                intent: probe.intent.clone(),
                asset_ids: match &probe.source {
                    LightProbeSourceIr::Texture(source) => texture_asset_ids(source),
                    LightProbeSourceIr::Baked(_) => Vec::new(),
                },
                applied: false,
                mode: match &probe.source {
                    LightProbeSourceIr::Texture(source) => source.mode.clone(),
                    LightProbeSourceIr::Baked(_) => native_baked_probe_mode(bundle).to_owned(),
                },
            })
            .collect(),
        diagnostics: Vec::new(),
    }
}

pub fn apply_environment_lighting_to_world(
    world: &mut World,
    bundle: &LoadedBundle,
) -> EnvironmentLightingObservation {
    let mut observation = observe_environment_lighting(bundle);
    let Some(scene) = bundle.environment_scene.as_ref() else {
        return observation;
    };
    let environment_asset_color = scene.environment_map.as_ref().and_then(|environment_map| {
        average_texture_color(
            bundle,
            &EnvironmentTextureSourceIr {
                asset: environment_map.asset.clone(),
                faces: environment_map.faces.clone(),
                mode: environment_map.mode.clone(),
            },
        )
    });
    let skybox_asset_color = scene.skybox.as_ref().and_then(|skybox| {
        average_texture_color(
            bundle,
            &EnvironmentTextureSourceIr {
                asset: skybox.asset.clone(),
                faces: skybox.faces.clone(),
                mode: skybox.mode.clone(),
            },
        )
    });
    let asset_color = environment_asset_color.or(skybox_asset_color);
    if let Some(environment_map) = scene.environment_map.as_ref() {
        let source = EnvironmentTextureSourceIr {
            asset: environment_map.asset.clone(),
            faces: environment_map.faces.clone(),
            mode: environment_map.mode.clone(),
        };
        if let Some(cubemap) = environment_cubemap_image(bundle, &source) {
            if !world.contains_resource::<Assets<Image>>() {
                world.init_resource::<Assets<Image>>();
            }
            let mut images = world.resource_mut::<Assets<Image>>();
            let handle = images.add(cubemap);
            world.insert_resource(NativeEnvironmentMapHandles {
                diffuse_map: handle.clone(),
                specular_map: handle,
                intensity: environment_map.intensity.unwrap_or(1.0).max(0.0)
                    * THREE_COMPAT_ENVIRONMENT_MAP_LIGHT_INTENSITY_PER_UNIT
                    * native_ssgi_ambient_multiplier(bundle.runtime_config.as_ref()),
            });
            if let Some(environment_map) = observation.environment_map.as_mut() {
                environment_map.applied = true;
            }
        }
    }
    if let Some(color) = asset_color {
        let environment_intensity = if environment_asset_color.is_some() {
            scene
                .environment_map
                .as_ref()
                .and_then(|environment_map| environment_map.intensity)
        } else {
            scene.skybox.as_ref().and_then(|skybox| skybox.intensity)
        }
        .unwrap_or(1.0)
        .max(0.0);
        if !world.contains_resource::<ClearColor>() {
            world.insert_resource(ClearColor(color));
        }
        if !world.contains_resource::<NativeEnvironmentMapHandles>() {
            let environment_brightness = environment_intensity
                * THREE_COMPAT_ENVIRONMENT_AMBIENT_BRIGHTNESS_PER_INTENSITY
                * native_ssgi_ambient_multiplier(bundle.runtime_config.as_ref());
            if let Some(mut ambient) = world.get_resource_mut::<AmbientLight>() {
                ambient.color = blend_ambient_colors(ambient.color, color);
                ambient.brightness += environment_brightness;
            } else {
                world.insert_resource(AmbientLight {
                    color,
                    brightness: environment_brightness,
                });
            }
        }
        if let Some(skybox) = observation
            .skybox
            .as_mut()
            .filter(|_| skybox_asset_color.is_some())
        {
            skybox.applied = true;
        }
        if let Some(environment_map) = observation
            .environment_map
            .as_mut()
            .filter(|_| environment_asset_color.is_some())
        {
            environment_map.applied = true;
        }
    } else if scene.skybox.is_some() || scene.environment_map.is_some() {
        observation
            .diagnostics
            .push("TN_BEVY_ENVIRONMENT_TEXTURE_UNRESOLVED".to_owned());
    }
    let baked_probes = scene
        .light_probes
        .iter()
        .filter_map(|probe| match &probe.source {
            LightProbeSourceIr::Baked(source)
                if source.format == "sh2" && source.coefficients.len() == 27 =>
            {
                Some((probe, source.coefficients.as_slice()))
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    if !baked_probes.is_empty() {
        world.insert_resource(NativeBakedProbeLightingApplied);
        // Bevy's bounded irradiance volumes do not provide a view-level
        // fallback outside their cuboids. Preserve the calibrated L0 energy
        // only when an authored atmosphere already owns the ambient baseline;
        // the directional SH2 volume remains the baked-lighting path.
        if let Some(mut ambient) = world.get_resource_mut::<AmbientLight>() {
            let count = baked_probes.len() as f32;
            let rgb = baked_probes.iter().fold(Vec3::ZERO, |sum, (_, coefficients)| {
                sum + Vec3::from_slice(&coefficients[0..3]).max(Vec3::ZERO) * (0.282095 / count)
            });
            let peak = rgb.max_element();
            if peak > 0.0 {
                let brightness = peak * THREE_COMPAT_BAKED_PROBE_ATMOSPHERE_BASELINE_PER_UNIT;
                let color = Color::linear_rgb(rgb.x / peak, rgb.y / peak, rgb.z / peak);
                let combined = ambient.brightness + brightness;
                ambient.color = blend_ambient_colors_weighted(
                    ambient.color,
                    ambient.brightness,
                    color,
                    brightness,
                );
                ambient.brightness = combined;
            }
        }
        if native_baked_probe_irradiance_volumes_supported(bundle) {
            world.init_resource::<Assets<Image>>();
            let volume_handles = {
                let mut images = world.resource_mut::<Assets<Image>>();
                baked_probes
                    .iter()
                    .map(|(_, coefficients)| images.add(sh2_irradiance_volume_image(coefficients)))
                    .collect::<Vec<_>>()
            };
            for ((probe, _), voxels) in baked_probes.iter().zip(volume_handles) {
                let influence = Vec3::splat(probe.influence_radius.max(0.0));
                let min = Vec3::from_array(probe.bounds.min) - influence;
                let max = Vec3::from_array(probe.bounds.max) + influence;
                let size = (max - min).max(Vec3::splat(0.001));
                world.spawn((
                    SpatialBundle {
                        transform: Transform::from_translation((min + max) * 0.5).with_scale(size),
                        ..default()
                    },
                    IrradianceVolume {
                        voxels,
                        intensity: THREE_COMPAT_BAKED_PROBE_IRRADIANCE_INTENSITY_PER_UNIT,
                    },
                    LightProbe,
                    Name::new(format!("threenative:irradiance-volume:{}", probe.id)),
                ));
            }
        }
        for observation in &mut observation.light_probes {
            if scene.light_probes.iter().any(|probe| {
                probe.id == observation.id && matches!(&probe.source, LightProbeSourceIr::Baked(_))
            }) {
                observation.applied = true;
            }
        }
    }
    observation
}

pub(crate) fn native_baked_probe_mode(bundle: &LoadedBundle) -> &'static str {
    if native_baked_probe_irradiance_volumes_supported(bundle) {
        "irradiance-volume-sh2"
    } else {
        "deferred-sh-l0-plus-screen-space-gi"
    }
}

fn native_baked_probe_irradiance_volumes_supported(bundle: &LoadedBundle) -> bool {
    !bundle
        .runtime_config
        .as_ref()
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.screen_space_reflections.as_ref())
        .is_some_and(|ssr| ssr.enabled)
}

fn sh2_irradiance_volume_image(coefficients: &[f32]) -> Image {
    // Bevy packs the six ambient-cube directions into a 1x2x3 3D texture:
    // -X/+X, -Y/+Y, -Z/+Z. Evaluate the same cosine-convolved SH2 basis used
    // by Three.js so adapter-private storage does not change authored values.
    let directions = [
        Vec3::NEG_X,
        Vec3::X,
        Vec3::NEG_Y,
        Vec3::Y,
        Vec3::NEG_Z,
        Vec3::Z,
    ];
    let mut data = Vec::with_capacity(directions.len() * 4);
    for direction in directions {
        let irradiance = evaluate_sh2_irradiance(coefficients, direction).max(Vec3::ZERO);
        for channel in [irradiance.x, irradiance.y, irradiance.z, 1.0] {
            data.push((channel.clamp(0.0, 1.0) * 255.0).round() as u8);
        }
    }
    let mut image = Image::new(
        Extent3d { width: 1, height: 2, depth_or_array_layers: 3 },
        TextureDimension::D3,
        data,
        TextureFormat::Rgba8Unorm,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage = TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST;
    image.texture_view_descriptor = Some(TextureViewDescriptor {
        dimension: Some(TextureViewDimension::D3),
        ..default()
    });
    image
}

fn evaluate_sh2_irradiance(coefficients: &[f32], normal: Vec3) -> Vec3 {
    let x = normal.x;
    let y = normal.y;
    let z = normal.z;
    let coefficient = |index: usize| Vec3::from_slice(&coefficients[index * 3..index * 3 + 3]);
    coefficient(0) * 0.886227
        + coefficient(1) * (2.0 * 0.511664 * y)
        + coefficient(2) * (2.0 * 0.511664 * z)
        + coefficient(3) * (2.0 * 0.511664 * x)
        + coefficient(4) * (2.0 * 0.429043 * x * y)
        + coefficient(5) * (2.0 * 0.429043 * y * z)
        + coefficient(6) * (0.743125 * z * z - 0.247708)
        + coefficient(7) * (2.0 * 0.429043 * x * z)
        + coefficient(8) * (0.429043 * (x * x - y * y))
}

fn environment_cubemap_image(
    bundle: &LoadedBundle,
    source: &EnvironmentTextureSourceIr,
) -> Option<Image> {
    if source.mode.as_str() == "cubemap" {
        return cubemap_faces_image(bundle, source);
    }
    if source.mode.as_str() != "equirect" {
        return None;
    }
    let asset_id = texture_asset_ids(source).into_iter().next()?;
    let asset = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == asset_id && asset.kind == "texture")?;
    let path = asset.path.as_ref()?;
    let image = ImageReader::open(bundle.bundle_path.join(path))
        .ok()?
        .decode()
        .ok()?
        .to_rgba8();
    let cube_size = (image.height() / 2).clamp(16, 256);
    let face_bytes = (cube_size * cube_size * 4) as usize;
    let mut data = Vec::with_capacity(face_bytes * 6);
    for face in 0..6 {
        for y in 0..cube_size {
            for x in 0..cube_size {
                let direction = cubemap_texel_direction(face, x, y, cube_size);
                let pixel = sample_equirect_rgba(&image, direction);
                data.extend_from_slice(&pixel);
            }
        }
    }
    let mut cubemap = Image::new(
        Extent3d {
            width: cube_size,
            height: cube_size,
            depth_or_array_layers: 6,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    cubemap.texture_descriptor.usage = TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST;
    cubemap.texture_view_descriptor = Some(TextureViewDescriptor {
        dimension: Some(TextureViewDimension::Cube),
        ..default()
    });
    Some(cubemap)
}

fn cubemap_faces_image(
    bundle: &LoadedBundle,
    source: &EnvironmentTextureSourceIr,
) -> Option<Image> {
    let faces = source.faces.as_ref()?;
    let face_ids = [
        faces.positive_x.as_str(),
        faces.negative_x.as_str(),
        faces.positive_y.as_str(),
        faces.negative_y.as_str(),
        faces.positive_z.as_str(),
        faces.negative_z.as_str(),
    ];
    let mut face_images = Vec::with_capacity(6);
    for face_id in face_ids {
        let asset = bundle
            .assets
            .assets
            .iter()
            .find(|asset| asset.id == face_id && asset.kind == "texture")?;
        let path = asset.path.as_ref()?;
        face_images.push(
            ImageReader::open(bundle.bundle_path.join(path))
                .ok()?
                .decode()
                .ok()?
                .to_rgba8(),
        );
    }
    let width = face_images.first()?.width();
    let height = face_images.first()?.height();
    if width == 0
        || height == 0
        || width != height
        || face_images
            .iter()
            .any(|image| image.width() != width || image.height() != height)
    {
        return None;
    }
    let mut data = Vec::with_capacity((width * height * 4 * 6) as usize);
    for face in face_images {
        data.extend_from_slice(face.as_raw());
    }
    let mut cubemap = Image::new(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 6,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    cubemap.texture_descriptor.usage = TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST;
    cubemap.texture_view_descriptor = Some(TextureViewDescriptor {
        dimension: Some(TextureViewDimension::Cube),
        ..default()
    });
    Some(cubemap)
}

fn cubemap_texel_direction(face: u32, x: u32, y: u32, size: u32) -> Vec3 {
    let inv_size = 1.0 / size as f32;
    let u = ((x as f32 + 0.5) * inv_size) * 2.0 - 1.0;
    let v = ((y as f32 + 0.5) * inv_size) * 2.0 - 1.0;
    match face {
        0 => Vec3::new(1.0, -v, -u),
        1 => Vec3::new(-1.0, -v, u),
        2 => Vec3::new(u, 1.0, v),
        3 => Vec3::new(u, -1.0, -v),
        4 => Vec3::new(u, -v, 1.0),
        _ => Vec3::new(-u, -v, -1.0),
    }
    .normalize()
}

fn sample_equirect_rgba(image: &image::RgbaImage, direction: Vec3) -> [u8; 4] {
    let longitude = direction.z.atan2(direction.x);
    let latitude = direction.y.clamp(-1.0, 1.0).asin();
    let u = (0.5 + longitude / TAU).rem_euclid(1.0);
    let v = (FRAC_PI_2 - latitude) / PI;
    let max_x = image.width().saturating_sub(1) as f32;
    let max_y = image.height().saturating_sub(1) as f32;
    let x = u * max_x;
    let y = v.clamp(0.0, 1.0) * max_y;
    let x0 = x.floor() as u32;
    let y0 = y.floor() as u32;
    let x1 = (x0 + 1).min(image.width().saturating_sub(1));
    let y1 = (y0 + 1).min(image.height().saturating_sub(1));
    let tx = x - x0 as f32;
    let ty = y - y0 as f32;
    let top = mix_rgba(image.get_pixel(x0, y0).0, image.get_pixel(x1, y0).0, tx);
    let bottom = mix_rgba(image.get_pixel(x0, y1).0, image.get_pixel(x1, y1).0, tx);
    mix_rgba(top, bottom, ty)
}

fn mix_rgba(left: [u8; 4], right: [u8; 4], t: f32) -> [u8; 4] {
    [
        mix_u8(left[0], right[0], t),
        mix_u8(left[1], right[1], t),
        mix_u8(left[2], right[2], t),
        mix_u8(left[3], right[3], t),
    ]
}

fn mix_u8(left: u8, right: u8, t: f32) -> u8 {
    (left as f32 + (right as f32 - left as f32) * t)
        .round()
        .clamp(0.0, 255.0) as u8
}

pub(crate) fn blend_ambient_colors(authored: Color, environment: Color) -> Color {
    let authored = authored.to_srgba();
    let environment = environment.to_srgba();
    Color::srgba(
        (authored.red + environment.red) * 0.5,
        (authored.green + environment.green) * 0.5,
        (authored.blue + environment.blue) * 0.5,
        1.0,
    )
}

fn blend_ambient_colors_weighted(
    authored: Color,
    authored_brightness: f32,
    environment: Color,
    environment_brightness: f32,
) -> Color {
    let total = authored_brightness + environment_brightness;
    if total <= f32::EPSILON {
        return Color::BLACK;
    }
    let authored = authored.to_linear();
    let environment = environment.to_linear();
    Color::linear_rgb(
        (authored.red * authored_brightness + environment.red * environment_brightness) / total,
        (authored.green * authored_brightness + environment.green * environment_brightness) / total,
        (authored.blue * authored_brightness + environment.blue * environment_brightness) / total,
    )
}

pub fn normalize_loaded_gltf_materials(
    authored_materials: Option<Res<NativeMaterialHandles>>,
    mut initialized: Local<bool>,
    events: Option<Res<Events<AssetEvent<StandardMaterial>>>>,
    mut event_reader: Local<ManualEventReader<AssetEvent<StandardMaterial>>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let authored_ids = authored_materials
        .as_ref()
        .map(|handles| handles.0.values().map(Handle::id).collect::<HashSet<_>>())
        .unwrap_or_default();
    let candidates = if *initialized {
        if let Some(events) = events.as_deref() {
            event_reader
                .read(events)
                .filter_map(|event| match event {
                    AssetEvent::Added { id }
                    | AssetEvent::Modified { id }
                    | AssetEvent::LoadedWithDependencies { id } => Some(*id),
                    AssetEvent::Removed { .. } | AssetEvent::Unused { .. } => None,
                })
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        }
    } else {
        *initialized = true;
        if let Some(events) = events.as_deref() {
            event_reader.clear(events);
        }
        materials.iter().map(|(id, _)| id).collect::<Vec<_>>()
    };
    for id in candidates {
        if authored_ids.contains(&id) {
            continue;
        }
        let Some(material) = materials.get_mut(id) else {
            continue;
        };
        normalize_textured_material(material);
    }
}

pub fn normalize_textured_material(material: &mut StandardMaterial) -> bool {
    if !textured_material_needs_normalization(material) {
        return false;
    }
    material.double_sided = true;
    material.cull_mode = None;
    true
}

fn textured_material_needs_normalization(material: &StandardMaterial) -> bool {
    material.base_color_texture.is_some()
        && !material.unlit
        && material.normal_map_texture.is_none()
        && matches!(material.alpha_mode, AlphaMode::Mask(value) if value <= 0.2)
        && (!material.double_sided || material.cull_mode.is_some())
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

fn average_texture_color(
    bundle: &LoadedBundle,
    source: &EnvironmentTextureSourceIr,
) -> Option<Color> {
    let asset_id = texture_asset_ids(source).into_iter().next()?;
    let asset = bundle
        .assets
        .assets
        .iter()
        .find(|asset| asset.id == asset_id && asset.kind == "texture")?;
    let path = asset.path.as_ref()?;
    let image = ImageReader::open(bundle.bundle_path.join(path))
        .ok()?
        .decode()
        .ok()?
        .to_rgba8();
    let mut red = 0.0;
    let mut green = 0.0;
    let mut blue = 0.0;
    let count = (image.width() * image.height()).max(1) as f32;
    for pixel in image.pixels() {
        red += pixel[0] as f32 / 255.0;
        green += pixel[1] as f32 / 255.0;
        blue += pixel[2] as f32 / 255.0;
    }
    Some(Color::srgb(red / count, green / count, blue / count))
}

fn texture_asset_ids(source: &EnvironmentTextureSourceIr) -> Vec<String> {
    if source.mode == "equirect" {
        return source.asset.iter().cloned().collect();
    }
    source
        .faces
        .as_ref()
        .map(|faces| {
            vec![
                faces.positive_x.clone(),
                faces.negative_x.clone(),
                faces.positive_y.clone(),
                faces.negative_y.clone(),
                faces.positive_z.clone(),
                faces.negative_z.clone(),
            ]
        })
        .unwrap_or_default()
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
