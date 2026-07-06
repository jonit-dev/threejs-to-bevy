use bevy::{
    pbr::{CascadeShadowConfigBuilder, DirectionalLightShadowMap},
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
use std::f32::consts::{FRAC_PI_2, PI, TAU};
use threenative_components::ThreeNativeId;
use threenative_loader::{ColorIr, EnvironmentTextureSourceIr, LoadedBundle};

use crate::map_world::NativeMaterialHandles;

// Calibrated against atmosphere fog scenes (parity-smoke, v8-rendering-quality, v3 forest).
const THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY: f32 = 1.0;
const THREE_COMPAT_ATMOSPHERE_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 0.25;
const THREE_COMPAT_ENVIRONMENT_AMBIENT_BRIGHTNESS_PER_INTENSITY: f32 = 0.45;
const THREE_COMPAT_ENVIRONMENT_MAP_LIGHT_INTENSITY_PER_UNIT: f32 = 0.5;
const THREE_COMPAT_SHADOW_BIAS_SCALE: f32 = 100.0;

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
}

#[derive(Clone, Debug, Resource)]
pub struct NativeEnvironmentMapHandles {
    pub diffuse_map: Handle<Image>,
    pub specular_map: Handle<Image>,
    pub intensity: f32,
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
        brightness: profile.ambient.intensity
            * THREE_COMPAT_ATMOSPHERE_AMBIENT_BRIGHTNESS_PER_INTENSITY,
    });
    world.insert_resource(DirectionalLightShadowMap {
        size: profile.shadows.map_size.min(2048) as usize,
    });
    world
        .spawn(DirectionalLightBundle {
            directional_light: DirectionalLight {
                color: color_to_bevy(&profile.sun.color),
                illuminance: profile.sun.intensity
                    * THREE_COMPAT_ATMOSPHERE_SUN_ILLUMINANCE_PER_INTENSITY,
                shadows_enabled: profile.sun.casts_shadow && profile.shadows.enabled,
                shadow_depth_bias: atmosphere_shadow_depth_bias(profile.shadows.bias),
                shadow_normal_bias: profile.shadows.normal_bias,
                ..Default::default()
            },
            cascade_shadow_config: CascadeShadowConfigBuilder {
                num_cascades: profile.shadows.cascade_count.max(1) as usize,
                minimum_distance: 0.05,
                first_cascade_far_bound: atmosphere_shadow_first_cascade(
                    profile.shadows.max_distance,
                    bundle,
                ),
                maximum_distance: atmosphere_shadow_camera_distance(
                    profile.shadows.max_distance,
                    bundle,
                ),
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
                asset_ids: texture_asset_ids(&probe.source),
                applied: false,
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
                    * THREE_COMPAT_ENVIRONMENT_MAP_LIGHT_INTENSITY_PER_UNIT,
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
            let environment_brightness =
                environment_intensity * THREE_COMPAT_ENVIRONMENT_AMBIENT_BRIGHTNESS_PER_INTENSITY;
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
    observation
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

fn blend_ambient_colors(authored: Color, environment: Color) -> Color {
    let authored = authored.to_srgba();
    let environment = environment.to_srgba();
    Color::srgba(
        (authored.red + environment.red) * 0.5,
        (authored.green + environment.green) * 0.5,
        (authored.blue + environment.blue) * 0.5,
        1.0,
    )
}

pub fn normalize_loaded_gltf_materials(
    authored_materials: Option<Res<NativeMaterialHandles>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    for (id, material) in materials.iter_mut() {
        if authored_materials
            .as_ref()
            .is_some_and(|handles| handles.0.values().any(|handle| handle.id() == id))
        {
            continue;
        }
        normalize_textured_material(material);
    }
}

pub fn normalize_textured_material(material: &mut StandardMaterial) -> bool {
    if material.base_color_texture.is_none()
        || material.unlit
        || material.normal_map_texture.is_some()
        || !matches!(material.alpha_mode, AlphaMode::Mask(value) if value <= 0.2)
    {
        return false;
    }
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
