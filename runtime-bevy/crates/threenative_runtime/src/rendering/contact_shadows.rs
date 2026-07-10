use bevy::{
    asset::AssetApp,
    pbr::{
        Material, MaterialMeshBundle, MaterialPipeline, MaterialPipelineKey, MaterialPlugin,
        NotShadowCaster, NotShadowReceiver,
    },
    prelude::*,
    render::{
        alpha::AlphaMode,
        camera::{ClearColorConfig, RenderTarget, ScalingMode},
        mesh::MeshVertexBufferLayoutRef,
        render_asset::RenderAssetUsages,
        render_resource::{
            AsBindGroup, Extent3d, RenderPipelineDescriptor, Shader, ShaderRef,
            SpecializedMeshPipelineError, TextureDimension, TextureFormat, TextureUsages,
        },
        texture::{ImageFilterMode, ImageSampler, ImageSamplerDescriptor},
        view::visibility::{NoFrustumCulling, RenderLayers},
    },
};
use serde::Serialize;
use std::collections::HashMap;
use threenative_components::ThreeNativeId;
use threenative_loader::{ContactShadowsComponent, RuntimeConfigIr};

const CONTACT_SHADOW_SHADER_HANDLE: Handle<Shader> =
    Handle::weak_from_u128(246156913899226089859444251321);
const PRIVATE_LAYER_BASE: usize = 1_000;
const STATIC_PIPELINE_WARMUP_FRAMES: u8 = 8;
const NATIVE_CONTACT_SHADOW_OPACITY_EXPONENT: f32 = 0.65;
const NATIVE_CONTACT_SHADOW_OPACITY_SCALE: f32 = 1.3;
const NATIVE_CONTACT_SHADOW_OCCUPANCY_SCALE: f32 = 1.6;
pub const NATIVE_CONTACT_SHADOW_BLUR_WEIGHTS: [f32; 5] = [0.051, 0.0918, 0.12245, 0.1531, 0.1633];

const CONTACT_SHADOW_SHADER: &str = r#"
#import bevy_pbr::forward_io::VertexOutput

@group(2) @binding(0) var input_texture: texture_2d<f32>;
@group(2) @binding(1) var input_sampler: sampler;
@group(2) @binding(2) var<uniform> texel_step: vec2<f32>;
@group(2) @binding(3) var<uniform> opacity: f32;
@group(2) @binding(4) var<uniform> output_alpha: f32;

fn occupancy(uv: vec2<f32>) -> f32 {
    return textureSample(input_texture, input_sampler, uv).g;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    var value = occupancy(in.uv - texel_step * 4.0) * 0.051;
    value += occupancy(in.uv - texel_step * 3.0) * 0.0918;
    value += occupancy(in.uv - texel_step * 2.0) * 0.12245;
    value += occupancy(in.uv - texel_step) * 0.1531;
    value += occupancy(in.uv) * 0.1633;
    value += occupancy(in.uv + texel_step) * 0.1531;
    value += occupancy(in.uv + texel_step * 2.0) * 0.12245;
    value += occupancy(in.uv + texel_step * 3.0) * 0.0918;
    value += occupancy(in.uv + texel_step * 4.0) * 0.051;
    if output_alpha > 0.5 {
        return vec4<f32>(0.0, 0.0, 0.0, clamp(sqrt(value) * opacity, 0.0, 1.0));
    }
    return vec4<f32>(value, value, value, 1.0);
}
"#;

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
pub struct NativeContactShadowMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub input: Handle<Image>,
    #[uniform(2)]
    pub texel_step: Vec2,
    #[uniform(3)]
    pub opacity: f32,
    #[uniform(4)]
    pub output_alpha: f32,
    pub alpha_mode: AlphaMode,
}

impl Material for NativeContactShadowMaterial {
    fn fragment_shader() -> ShaderRef {
        CONTACT_SHADOW_SHADER_HANDLE.into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        self.alpha_mode
    }

    fn specialize(
        _pipeline: &MaterialPipeline<Self>,
        descriptor: &mut RenderPipelineDescriptor,
        _layout: &MeshVertexBufferLayoutRef,
        _key: MaterialPipelineKey<Self>,
    ) -> Result<(), SpecializedMeshPipelineError> {
        descriptor.primitive.cull_mode = None;
        Ok(())
    }
}

#[derive(Asset, TypePath, AsBindGroup, Debug, Clone)]
struct NativeContactShadowBlurMaterial {
    #[texture(0)]
    #[sampler(1)]
    input: Handle<Image>,
    #[uniform(2)]
    texel_step: Vec2,
    #[uniform(3)]
    opacity: f32,
    #[uniform(4)]
    output_alpha: f32,
}

impl Material for NativeContactShadowBlurMaterial {
    fn fragment_shader() -> ShaderRef {
        CONTACT_SHADOW_SHADER_HANDLE.into()
    }

    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Opaque
    }

    fn specialize(
        _pipeline: &MaterialPipeline<Self>,
        descriptor: &mut RenderPipelineDescriptor,
        _layout: &MeshVertexBufferLayoutRef,
        _key: MaterialPipelineKey<Self>,
    ) -> Result<(), SpecializedMeshPipelineError> {
        descriptor.primitive.cull_mode = None;
        Ok(())
    }
}

pub struct NativeContactShadowPlugin;

impl Plugin for NativeContactShadowPlugin {
    fn build(&self, app: &mut App) {
        app.init_asset::<NativeContactShadowMaterial>();
        app.init_asset::<NativeContactShadowBlurMaterial>();
        app.world_mut().resource_mut::<Assets<Shader>>().insert(
            CONTACT_SHADOW_SHADER_HANDLE.id(),
            Shader::from_wgsl(CONTACT_SHADOW_SHADER, "native_contact_shadows.wgsl"),
        );
        app.add_plugins(MaterialPlugin::<NativeContactShadowMaterial>::default());
        app.add_plugins(MaterialPlugin::<NativeContactShadowBlurMaterial>::default());
        app.add_systems(
            Update,
            (
                sync_native_contact_shadow_anchors,
                advance_native_contact_shadow_captures,
            )
                .chain(),
        );
    }
}

#[derive(Clone, Component, Debug, PartialEq)]
pub struct NativeContactShadows {
    pub height: f32,
    pub opacity: f32,
    pub requested_resolution: u32,
    pub applied_resolution: u32,
    pub size: [f32; 2],
    pub softness: f32,
    pub update_mode: String,
}

impl NativeContactShadows {
    pub fn from_ir(
        value: &ContactShadowsComponent,
        runtime_config: Option<&RuntimeConfigIr>,
    ) -> Self {
        let applied_resolution = applied_contact_shadow_resolution(
            value.resolution,
            value.update_mode.as_str(),
            runtime_config,
        );
        Self {
            height: value.height,
            opacity: value.opacity,
            requested_resolution: value.resolution,
            applied_resolution,
            size: value.size,
            softness: value.softness,
            update_mode: value.update_mode.clone(),
        }
    }
}

#[derive(Clone, Component, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeContactShadowReport {
    pub entity_id: String,
    pub requested_resolution: u32,
    pub applied_resolution: u32,
    pub update_mode: String,
    pub height: f32,
    pub opacity: f32,
    pub size: [f32; 2],
    pub softness: f32,
    pub blur_step: f32,
    pub capture_count: u64,
    pub update_count: u64,
    pub active_pass_count: usize,
    pub private_entity_count: usize,
    pub private_roles: Vec<String>,
}

#[derive(Clone, Component, Debug, PartialEq, Eq)]
pub struct NativeContactShadowPrivate {
    pub owner: String,
    pub role: String,
}

#[derive(Default, Resource)]
struct NativeContactShadowOwnedAssets {
    blur_materials: Vec<Handle<NativeContactShadowBlurMaterial>>,
    composite_materials: Vec<Handle<NativeContactShadowMaterial>>,
    standard_capture_materials: Vec<Handle<StandardMaterial>>,
    images: Vec<Handle<Image>>,
    meshes: Vec<Handle<Mesh>>,
}

#[derive(Component)]
pub struct NativeContactShadowPassCamera {
    owner: Entity,
    rendered_frames: u8,
    update_mode: String,
    counts_capture: bool,
}

#[derive(Clone, Component)]
struct NativeContactShadowAnchor {
    local: Transform,
    owner: Entity,
}

pub fn applied_contact_shadow_resolution(
    requested: u32,
    update_mode: &str,
    runtime_config: Option<&RuntimeConfigIr>,
) -> u32 {
    let low_tier = runtime_config
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.render_look.as_ref())
        .and_then(|render_look| render_look.overrides.as_ref())
        .and_then(|overrides| overrides.shadow_quality.as_deref())
        .is_some_and(|quality| matches!(quality, "off" | "low"));
    if update_mode == "dynamic" && low_tier {
        requested.min(256)
    } else {
        requested
    }
}

pub fn native_contact_shadow_height_occupancy(signed_height: f32, capture_height: f32) -> f32 {
    (1.0 - signed_height / capture_height.max(0.0001)).clamp(0.0, 1.0)
}

pub fn refresh_native_contact_shadow_pipelines(world: &mut World) {
    let private_entities = world
        .query_filtered::<Entity, With<NativeContactShadowPrivate>>()
        .iter(world)
        .collect::<Vec<_>>();
    for entity in private_entities {
        if let Some(entity) = world.get_entity_mut(entity) {
            entity.despawn_recursive();
        }
    }
    release_contact_shadow_assets(world);

    if !world.contains_resource::<Assets<NativeContactShadowMaterial>>() {
        world.init_resource::<Assets<NativeContactShadowMaterial>>();
    }
    if !world.contains_resource::<Assets<NativeContactShadowBlurMaterial>>() {
        world.init_resource::<Assets<NativeContactShadowBlurMaterial>>();
    }
    let carriers = world
        .query::<(Entity, &ThreeNativeId, &NativeContactShadows, &Transform)>()
        .iter(world)
        .map(|(entity, id, settings, transform)| {
            (entity, id.0.clone(), settings.clone(), transform.clone())
        })
        .collect::<Vec<_>>();
    if carriers.is_empty() {
        return;
    }
    world.insert_resource(NativeContactShadowOwnedAssets::default());
    let caster_entities = world
        .query::<(
            Entity,
            &ThreeNativeId,
            &Handle<Mesh>,
            &Transform,
            Option<&NotShadowCaster>,
        )>()
        .iter(world)
        .filter(|(_, _, _, _, not_shadow_caster)| not_shadow_caster.is_none())
        .map(|(entity, id, mesh, transform, _)| {
            (entity, id.0.clone(), mesh.clone(), transform.clone())
        })
        .collect::<Vec<_>>();
    let meshes = world.resource::<Assets<Mesh>>();
    let casters = caster_entities
        .into_iter()
        .map(|(entity, id, mesh, transform)| {
            let bounds = meshes.get(&mesh).and_then(Mesh::compute_aabb).map(|aabb| {
                let center = Vec3::from(aabb.center);
                let half_extents = Vec3::from(aabb.half_extents);
                (center - half_extents, center + half_extents)
            });
            (entity, id, mesh, transform, bounds)
        })
        .collect::<Vec<_>>();
    for (index, (carrier, owner, settings, transform)) in carriers.into_iter().enumerate() {
        spawn_contact_shadow_pipeline(world, index, carrier, owner, settings, transform, &casters);
    }
}

fn spawn_contact_shadow_pipeline(
    world: &mut World,
    index: usize,
    carrier: Entity,
    owner: String,
    settings: NativeContactShadows,
    carrier_transform: Transform,
    casters: &[(
        Entity,
        String,
        Handle<Mesh>,
        Transform,
        Option<(Vec3, Vec3)>,
    )],
) {
    if settings.update_mode == "static" {
        spawn_static_contact_shadow_pipeline(
            world,
            carrier,
            owner,
            settings,
            carrier_transform,
            casters,
        );
        return;
    }
    let capture_layer = PRIVATE_LAYER_BASE + index * 3;
    let horizontal_layer = capture_layer + 1;
    let vertical_layer = capture_layer + 2;
    let capture_image = add_contact_shadow_image(world, settings.applied_resolution);
    let horizontal_image = add_contact_shadow_image(world, settings.applied_resolution);
    let blurred_image = add_contact_shadow_image(world, settings.applied_resolution);
    let mut roles = Vec::new();

    let capture_local = Transform::from_xyz(0.0, settings.height, 0.0)
        .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2));
    let capture_camera = spawn_contact_shadow_camera(
        world,
        &owner,
        "capture-camera",
        capture_layer,
        capture_image.clone(),
        -30_000 + index as isize * 3,
        Projection::Orthographic(OrthographicProjection {
            near: 0.01,
            far: settings.height + 0.02,
            scaling_mode: ScalingMode::Fixed {
                width: settings.size[0],
                height: settings.size[1],
            },
            ..Default::default()
        }),
        carrier_transform.mul_transform(capture_local),
    );
    world.entity_mut(capture_camera).insert((
        NativeContactShadowPassCamera {
            owner: carrier,
            rendered_frames: 0,
            update_mode: settings.update_mode.clone(),
            counts_capture: true,
        },
        NativeContactShadowAnchor {
            local: capture_local,
            owner: carrier,
        },
    ));
    roles.push("capture-camera".to_owned());

    let blur_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Rectangle::new(2.0, 2.0));
    track_contact_shadow_mesh(world, &blur_mesh);
    let horizontal_material = world
        .resource_mut::<Assets<NativeContactShadowBlurMaterial>>()
        .add(NativeContactShadowBlurMaterial {
            input: capture_image.clone(),
            texel_step: Vec2::new(settings.softness / settings.applied_resolution as f32, 0.0),
            opacity: 1.0,
            output_alpha: 0.0,
        });
    track_contact_shadow_blur_material(world, &horizontal_material);
    let horizontal_quad = spawn_blur_quad(
        world,
        &owner,
        "horizontal-blur-quad",
        horizontal_layer,
        blur_mesh.clone(),
        horizontal_material,
        Transform::IDENTITY,
    );
    roles.push("horizontal-blur-quad".to_owned());
    let horizontal_camera = spawn_contact_shadow_camera(
        world,
        &owner,
        "horizontal-blur-camera",
        horizontal_layer,
        horizontal_image.clone(),
        -29_999 + index as isize * 3,
        unit_quad_projection(),
        Transform::from_xyz(0.0, 0.0, 2.0).looking_at(Vec3::ZERO, Vec3::Y),
    );
    world
        .entity_mut(horizontal_camera)
        .insert(NativeContactShadowPassCamera {
            owner: carrier,
            rendered_frames: 0,
            update_mode: settings.update_mode.clone(),
            counts_capture: false,
        });
    roles.push("horizontal-blur-camera".to_owned());

    let vertical_material = world
        .resource_mut::<Assets<NativeContactShadowBlurMaterial>>()
        .add(NativeContactShadowBlurMaterial {
            input: horizontal_image,
            texel_step: Vec2::new(0.0, settings.softness / settings.applied_resolution as f32),
            opacity: 1.0,
            output_alpha: 0.0,
        });
    track_contact_shadow_blur_material(world, &vertical_material);
    let vertical_quad = spawn_blur_quad(
        world,
        &owner,
        "vertical-blur-quad",
        vertical_layer,
        blur_mesh,
        vertical_material,
        Transform::IDENTITY,
    );
    roles.push("vertical-blur-quad".to_owned());
    let vertical_camera = spawn_contact_shadow_camera(
        world,
        &owner,
        "vertical-blur-camera",
        vertical_layer,
        blurred_image.clone(),
        -29_998 + index as isize * 3,
        unit_quad_projection(),
        Transform::from_xyz(0.0, 0.0, 2.0).looking_at(Vec3::ZERO, Vec3::Y),
    );
    world
        .entity_mut(vertical_camera)
        .insert(NativeContactShadowPassCamera {
            owner: carrier,
            rendered_frames: 0,
            update_mode: settings.update_mode.clone(),
            counts_capture: false,
        });
    roles.push("vertical-blur-camera".to_owned());

    let composite_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Rectangle::new(settings.size[0], settings.size[1]));
    track_contact_shadow_mesh(world, &composite_mesh);
    let composite_material = world
        .resource_mut::<Assets<NativeContactShadowMaterial>>()
        .add(NativeContactShadowMaterial {
            input: blurred_image,
            texel_step: Vec2::ZERO,
            opacity: mapped_contact_shadow_opacity(settings.opacity),
            output_alpha: 1.0,
            alpha_mode: AlphaMode::Blend,
        });
    track_contact_shadow_composite_material(world, &composite_material);
    let composite_local = Transform::from_translation(Vec3::Y * 0.002)
        .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2));
    let _composite = world
        .spawn((
            MaterialMeshBundle {
                mesh: composite_mesh,
                material: composite_material,
                transform: carrier_transform.mul_transform(composite_local),
                ..Default::default()
            },
            NativeContactShadowPrivate {
                owner: owner.clone(),
                role: "composite-plane".to_owned(),
            },
            NotShadowCaster,
            NotShadowReceiver,
            NativeContactShadowAnchor {
                local: composite_local,
                owner: carrier,
            },
        ))
        .id();
    roles.push("composite-plane".to_owned());

    for (caster, caster_id, mesh, caster_transform, caster_bounds) in
        casters
            .iter()
            .filter(|(_, _, _, caster_transform, caster_bounds)| {
                contact_shadow_region_intersects(
                    &carrier_transform,
                    &settings,
                    caster_transform,
                    *caster_bounds,
                )
            })
    {
        let occupancy = contact_shadow_caster_occupancy(
            &carrier_transform,
            settings.height,
            caster_transform,
            *caster_bounds,
        );
        let caster_material =
            world
                .resource_mut::<Assets<StandardMaterial>>()
                .add(StandardMaterial {
                    alpha_mode: AlphaMode::Opaque,
                    base_color: Color::linear_rgb(occupancy, occupancy, occupancy),
                    cull_mode: None,
                    unlit: true,
                    ..Default::default()
                });
        track_contact_shadow_standard_capture_material(world, &caster_material);
        let _proxy = world
            .spawn((
                MaterialMeshBundle {
                    mesh: mesh.clone(),
                    material: caster_material.clone(),
                    transform: caster_transform.clone(),
                    visibility: Visibility::Visible,
                    ..Default::default()
                },
                RenderLayers::from_layers(&[capture_layer]),
                NativeContactShadowPrivate {
                    owner: owner.clone(),
                    role: format!("caster-proxy:{caster_id}"),
                },
                NotShadowCaster,
                NotShadowReceiver,
                NativeContactShadowAnchor {
                    local: Transform::IDENTITY,
                    owner: *caster,
                },
                NoFrustumCulling,
            ))
            .id();
        roles.push(format!("caster-proxy:{caster_id}"));
    }

    let _ = (
        horizontal_quad,
        horizontal_camera,
        vertical_quad,
        vertical_camera,
    );
    let private_entity_count = roles.len();
    roles.sort();
    world.entity_mut(carrier).insert(NativeContactShadowReport {
        entity_id: owner,
        requested_resolution: settings.requested_resolution,
        applied_resolution: settings.applied_resolution,
        update_mode: settings.update_mode,
        height: settings.height,
        opacity: settings.opacity,
        size: settings.size,
        softness: settings.softness,
        blur_step: settings.softness / settings.applied_resolution as f32,
        capture_count: 0,
        update_count: 0,
        active_pass_count: 3,
        private_entity_count,
        private_roles: roles,
    });
}

fn spawn_static_contact_shadow_pipeline(
    world: &mut World,
    carrier: Entity,
    owner: String,
    settings: NativeContactShadows,
    carrier_transform: Transform,
    casters: &[(
        Entity,
        String,
        Handle<Mesh>,
        Transform,
        Option<(Vec3, Vec3)>,
    )],
) {
    let mask = add_static_contact_shadow_image(world, &carrier_transform, &settings, casters);
    let composite_mesh = world
        .resource_mut::<Assets<Mesh>>()
        .add(Rectangle::new(settings.size[0], settings.size[1]));
    track_contact_shadow_mesh(world, &composite_mesh);
    let composite_material = world
        .resource_mut::<Assets<NativeContactShadowMaterial>>()
        .add(NativeContactShadowMaterial {
            input: mask,
            texel_step: Vec2::ZERO,
            opacity: mapped_contact_shadow_opacity(settings.opacity),
            output_alpha: 1.0,
            alpha_mode: AlphaMode::Blend,
        });
    track_contact_shadow_composite_material(world, &composite_material);
    let composite_local = Transform::from_translation(Vec3::Y * 0.002)
        .with_rotation(Quat::from_rotation_x(-std::f32::consts::FRAC_PI_2));
    world.spawn((
        MaterialMeshBundle {
            mesh: composite_mesh,
            material: composite_material,
            transform: carrier_transform.mul_transform(composite_local),
            ..Default::default()
        },
        NativeContactShadowPrivate {
            owner: owner.clone(),
            role: "composite-plane".to_owned(),
        },
        NotShadowCaster,
        NotShadowReceiver,
        NativeContactShadowAnchor {
            local: composite_local,
            owner: carrier,
        },
    ));
    world.entity_mut(carrier).insert(NativeContactShadowReport {
        entity_id: owner,
        requested_resolution: settings.requested_resolution,
        applied_resolution: settings.applied_resolution,
        update_mode: settings.update_mode,
        height: settings.height,
        opacity: settings.opacity,
        size: settings.size,
        softness: settings.softness,
        blur_step: settings.softness / settings.applied_resolution as f32,
        capture_count: 1,
        update_count: 1,
        active_pass_count: 0,
        private_entity_count: 1,
        private_roles: vec!["composite-plane".to_owned()],
    });
}

fn add_static_contact_shadow_image(
    world: &mut World,
    region_transform: &Transform,
    settings: &NativeContactShadows,
    casters: &[(
        Entity,
        String,
        Handle<Mesh>,
        Transform,
        Option<(Vec3, Vec3)>,
    )],
) -> Handle<Image> {
    let resolution = settings.applied_resolution as usize;
    let mut mask = vec![0.0_f32; resolution * resolution];
    for (_, _, _, caster_transform, local_bounds) in casters {
        let corners =
            contact_shadow_caster_region_corners(region_transform, caster_transform, *local_bounds);
        if corners.is_empty() {
            continue;
        }
        let (minimum, maximum) = contact_shadow_bounds(&corners);
        if maximum.x < -settings.size[0] * 0.5
            || minimum.x > settings.size[0] * 0.5
            || maximum.z < -settings.size[1] * 0.5
            || minimum.z > settings.size[1] * 0.5
            || maximum.y < 0.0
            || minimum.y > settings.height
        {
            continue;
        }
        let occupancy = mapped_contact_shadow_occupancy(native_contact_shadow_height_occupancy(
            maximum.y,
            settings.height,
        ));
        let x_start =
            contact_shadow_pixel(minimum.x, settings.size[0], resolution).min(resolution - 1);
        let x_end =
            contact_shadow_pixel(maximum.x, settings.size[0], resolution).min(resolution - 1);
        let y_start =
            contact_shadow_pixel(minimum.z, settings.size[1], resolution).min(resolution - 1);
        let y_end =
            contact_shadow_pixel(maximum.z, settings.size[1], resolution).min(resolution - 1);
        let footprint = contact_shadow_convex_hull(
            corners
                .iter()
                .map(|point| Vec2::new(point.x, point.z))
                .collect(),
        );
        for y in y_start.min(y_end)..=y_start.max(y_end) {
            for x in x_start.min(x_end)..=x_start.max(x_end) {
                let point = Vec2::new(
                    contact_shadow_pixel_center(x, settings.size[0], resolution),
                    contact_shadow_pixel_center(y, settings.size[1], resolution),
                );
                if footprint.len() >= 3 && !contact_shadow_polygon_contains(&footprint, point) {
                    continue;
                }
                let value = &mut mask[y * resolution + x];
                *value = value.max(occupancy);
            }
        }
    }
    let step = settings.softness.round().max(1.0) as isize;
    let horizontal = blur_contact_shadow_mask(&mask, resolution, step, true);
    let blurred = blur_contact_shadow_mask(&horizontal, resolution, step, false);
    let mut bytes = Vec::with_capacity(resolution * resolution * 4);
    for occupancy in blurred {
        let value = (occupancy.clamp(0.0, 1.0) * 255.0).round() as u8;
        bytes.extend_from_slice(&[value, value, value, 255]);
    }
    let mut image = Image::new_fill(
        Extent3d {
            width: settings.applied_resolution,
            height: settings.applied_resolution,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &bytes,
        TextureFormat::Rgba8Unorm,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage = TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST;
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor {
        mag_filter: ImageFilterMode::Linear,
        min_filter: ImageFilterMode::Linear,
        mipmap_filter: ImageFilterMode::Linear,
        ..Default::default()
    });
    let handle = world.resource_mut::<Assets<Image>>().add(image);
    world
        .resource_mut::<NativeContactShadowOwnedAssets>()
        .images
        .push(handle.clone());
    handle
}

fn contact_shadow_pixel(value: f32, extent: f32, resolution: usize) -> usize {
    (((value / extent + 0.5).clamp(0.0, 1.0)) * (resolution.saturating_sub(1)) as f32).round()
        as usize
}

fn mapped_contact_shadow_opacity(opacity: f32) -> f32 {
    (opacity.powf(NATIVE_CONTACT_SHADOW_OPACITY_EXPONENT) * NATIVE_CONTACT_SHADOW_OPACITY_SCALE)
        .min(1.0)
}

#[cfg(test)]
mod contact_shadow_calibration_tests {
    use super::*;

    #[test]
    fn native_opacity_curve_lifts_low_opacity_without_exceeding_full_coverage() {
        let low = mapped_contact_shadow_opacity(0.25);
        let high = mapped_contact_shadow_opacity(0.8);

        assert!((low - 0.528_0).abs() < 0.001);
        assert_eq!(high, 1.0);
    }
}

fn mapped_contact_shadow_occupancy(occupancy: f32) -> f32 {
    (occupancy * NATIVE_CONTACT_SHADOW_OCCUPANCY_SCALE).min(1.0)
}

fn contact_shadow_pixel_center(pixel: usize, extent: f32, resolution: usize) -> f32 {
    ((pixel as f32 + 0.5) / resolution.max(1) as f32 - 0.5) * extent
}

fn contact_shadow_convex_hull(mut points: Vec<Vec2>) -> Vec<Vec2> {
    points.sort_by(|left, right| {
        left.x
            .total_cmp(&right.x)
            .then_with(|| left.y.total_cmp(&right.y))
    });
    points.dedup_by(|left, right| left.distance_squared(*right) < 0.000_000_1);
    if points.len() <= 2 {
        return points;
    }
    let mut lower = Vec::new();
    for point in &points {
        while lower.len() >= 2
            && contact_shadow_cross(lower[lower.len() - 2], lower[lower.len() - 1], *point) <= 0.0
        {
            lower.pop();
        }
        lower.push(*point);
    }
    let mut upper = Vec::new();
    for point in points.iter().rev() {
        while upper.len() >= 2
            && contact_shadow_cross(upper[upper.len() - 2], upper[upper.len() - 1], *point) <= 0.0
        {
            upper.pop();
        }
        upper.push(*point);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

fn contact_shadow_cross(origin: Vec2, left: Vec2, right: Vec2) -> f32 {
    (left - origin).perp_dot(right - origin)
}

fn contact_shadow_polygon_contains(polygon: &[Vec2], point: Vec2) -> bool {
    polygon
        .iter()
        .zip(polygon.iter().cycle().skip(1))
        .all(|(start, end)| contact_shadow_cross(*start, *end, point) >= -0.000_01)
}

fn blur_contact_shadow_mask(
    source: &[f32],
    resolution: usize,
    step: isize,
    horizontal: bool,
) -> Vec<f32> {
    let mut output = vec![0.0; source.len()];
    let radius = (step * 4).max(1);
    let sigma = (step as f32 * 1.5).max(1.0);
    let weights = (-radius..=radius)
        .map(|offset| (-0.5 * (offset as f32 / sigma).powi(2)).exp())
        .collect::<Vec<_>>();
    let weight_sum = weights.iter().sum::<f32>();
    for y in 0..resolution {
        for x in 0..resolution {
            let mut value = 0.0;
            for (weight_index, offset) in (-radius..=radius).enumerate() {
                let sample_x = if horizontal {
                    x as isize + offset
                } else {
                    x as isize
                };
                let sample_y = if horizontal {
                    y as isize
                } else {
                    y as isize + offset
                };
                if sample_x < 0
                    || sample_y < 0
                    || sample_x >= resolution as isize
                    || sample_y >= resolution as isize
                {
                    continue;
                }
                value += source[sample_y as usize * resolution + sample_x as usize]
                    * weights[weight_index];
            }
            output[y * resolution + x] = value / weight_sum;
        }
    }
    output
}

pub fn contact_shadow_region_intersects(
    region_transform: &Transform,
    settings: &NativeContactShadows,
    caster_transform: &Transform,
    local_bounds: Option<(Vec3, Vec3)>,
) -> bool {
    let region_from_world = region_transform.compute_affine().inverse();
    let world_from_caster = caster_transform.compute_affine();
    let Some((minimum, maximum)) = local_bounds else {
        let local = region_from_world.transform_point3(caster_transform.translation);
        return local.x.abs() <= settings.size[0] * 0.5
            && local.z.abs() <= settings.size[1] * 0.5
            && local.y >= 0.0
            && local.y <= settings.height;
    };
    let mut region_minimum = Vec3::splat(f32::INFINITY);
    let mut region_maximum = Vec3::splat(f32::NEG_INFINITY);
    for x in [minimum.x, maximum.x] {
        for y in [minimum.y, maximum.y] {
            for z in [minimum.z, maximum.z] {
                let world = world_from_caster.transform_point3(Vec3::new(x, y, z));
                let region = region_from_world.transform_point3(world);
                region_minimum = region_minimum.min(region);
                region_maximum = region_maximum.max(region);
            }
        }
    }
    region_maximum.x >= -settings.size[0] * 0.5
        && region_minimum.x <= settings.size[0] * 0.5
        && region_maximum.z >= -settings.size[1] * 0.5
        && region_minimum.z <= settings.size[1] * 0.5
        && region_maximum.y >= 0.0
        && region_minimum.y <= settings.height
}

fn contact_shadow_caster_occupancy(
    region_transform: &Transform,
    capture_height: f32,
    caster_transform: &Transform,
    local_bounds: Option<(Vec3, Vec3)>,
) -> f32 {
    let Some((_, maximum)) =
        contact_shadow_caster_region_bounds(region_transform, caster_transform, local_bounds)
    else {
        return 0.0;
    };
    mapped_contact_shadow_occupancy(native_contact_shadow_height_occupancy(
        maximum.y,
        capture_height,
    ))
}

fn contact_shadow_caster_region_bounds(
    region_transform: &Transform,
    caster_transform: &Transform,
    local_bounds: Option<(Vec3, Vec3)>,
) -> Option<(Vec3, Vec3)> {
    let corners =
        contact_shadow_caster_region_corners(region_transform, caster_transform, local_bounds);
    (!corners.is_empty()).then(|| contact_shadow_bounds(&corners))
}

fn contact_shadow_caster_region_corners(
    region_transform: &Transform,
    caster_transform: &Transform,
    local_bounds: Option<(Vec3, Vec3)>,
) -> Vec<Vec3> {
    let region_from_world = region_transform.compute_affine().inverse();
    let world_from_caster = caster_transform.compute_affine();
    let Some((minimum, maximum)) = local_bounds else {
        let region = region_from_world.transform_point3(caster_transform.translation);
        return vec![region];
    };
    let mut corners = Vec::with_capacity(8);
    for x in [minimum.x, maximum.x] {
        for y in [minimum.y, maximum.y] {
            for z in [minimum.z, maximum.z] {
                let world = world_from_caster.transform_point3(Vec3::new(x, y, z));
                corners.push(region_from_world.transform_point3(world));
            }
        }
    }
    corners
}

fn contact_shadow_bounds(points: &[Vec3]) -> (Vec3, Vec3) {
    points.iter().fold(
        (Vec3::splat(f32::INFINITY), Vec3::splat(f32::NEG_INFINITY)),
        |(minimum, maximum), point| (minimum.min(*point), maximum.max(*point)),
    )
}

fn add_contact_shadow_image(world: &mut World, resolution: u32) -> Handle<Image> {
    let mut image = Image::new_fill(
        Extent3d {
            width: resolution,
            height: resolution,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0, 0, 0, 0],
        // Bevy's 3D camera output/blit pipeline targets sRGB images. Shader
        // writes are encoded on store and texture sampling decodes them, so
        // occupancy remains linear across the capture and blur passes.
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    image.texture_descriptor.usage =
        TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_SRC;
    let handle = world.resource_mut::<Assets<Image>>().add(image);
    if let Some(mut assets) = world.get_resource_mut::<NativeContactShadowOwnedAssets>() {
        assets.images.push(handle.clone());
    }
    handle
}

fn track_contact_shadow_mesh(world: &mut World, handle: &Handle<Mesh>) {
    world
        .resource_mut::<NativeContactShadowOwnedAssets>()
        .meshes
        .push(handle.clone());
}

fn track_contact_shadow_blur_material(
    world: &mut World,
    handle: &Handle<NativeContactShadowBlurMaterial>,
) {
    world
        .resource_mut::<NativeContactShadowOwnedAssets>()
        .blur_materials
        .push(handle.clone());
}

fn track_contact_shadow_composite_material(
    world: &mut World,
    handle: &Handle<NativeContactShadowMaterial>,
) {
    world
        .resource_mut::<NativeContactShadowOwnedAssets>()
        .composite_materials
        .push(handle.clone());
}

fn track_contact_shadow_standard_capture_material(
    world: &mut World,
    handle: &Handle<StandardMaterial>,
) {
    world
        .resource_mut::<NativeContactShadowOwnedAssets>()
        .standard_capture_materials
        .push(handle.clone());
}

fn release_contact_shadow_assets(world: &mut World) {
    let Some(owned) = world.remove_resource::<NativeContactShadowOwnedAssets>() else {
        return;
    };
    if let Some(mut images) = world.get_resource_mut::<Assets<Image>>() {
        for handle in owned.images {
            images.remove(handle.id());
        }
    }
    if let Some(mut meshes) = world.get_resource_mut::<Assets<Mesh>>() {
        for handle in owned.meshes {
            meshes.remove(handle.id());
        }
    }
    if let Some(mut materials) = world.get_resource_mut::<Assets<NativeContactShadowBlurMaterial>>()
    {
        for handle in owned.blur_materials {
            materials.remove(handle.id());
        }
    }
    if let Some(mut materials) = world.get_resource_mut::<Assets<NativeContactShadowMaterial>>() {
        for handle in owned.composite_materials {
            materials.remove(handle.id());
        }
    }
    if let Some(mut materials) = world.get_resource_mut::<Assets<StandardMaterial>>() {
        for handle in owned.standard_capture_materials {
            materials.remove(handle.id());
        }
    }
}

fn spawn_contact_shadow_camera(
    world: &mut World,
    owner: &str,
    role: &str,
    layer: usize,
    target: Handle<Image>,
    order: isize,
    projection: Projection,
    transform: Transform,
) -> Entity {
    world
        .spawn((
            Camera3dBundle {
                camera: Camera {
                    clear_color: ClearColorConfig::Custom(Color::BLACK),
                    hdr: false,
                    order,
                    target: RenderTarget::Image(target),
                    ..Default::default()
                },
                projection,
                deband_dither: bevy::core_pipeline::tonemapping::DebandDither::Disabled,
                tonemapping: bevy::core_pipeline::tonemapping::Tonemapping::None,
                transform,
                ..Default::default()
            },
            RenderLayers::from_layers(&[layer]),
            NativeContactShadowPrivate {
                owner: owner.to_owned(),
                role: role.to_owned(),
            },
        ))
        .id()
}

fn spawn_blur_quad(
    world: &mut World,
    owner: &str,
    role: &str,
    layer: usize,
    mesh: Handle<Mesh>,
    material: Handle<NativeContactShadowBlurMaterial>,
    transform: Transform,
) -> Entity {
    world
        .spawn((
            MaterialMeshBundle {
                mesh,
                material,
                transform,
                ..Default::default()
            },
            RenderLayers::from_layers(&[layer]),
            NativeContactShadowPrivate {
                owner: owner.to_owned(),
                role: role.to_owned(),
            },
            NotShadowCaster,
            NotShadowReceiver,
        ))
        .id()
}

fn unit_quad_projection() -> Projection {
    Projection::Orthographic(OrthographicProjection {
        near: 0.1,
        far: 10.0,
        scaling_mode: ScalingMode::Fixed {
            width: 2.0,
            height: 2.0,
        },
        ..Default::default()
    })
}

pub fn sync_native_contact_shadow_anchors(world: &mut World) {
    let anchors = world
        .query::<(Entity, &NativeContactShadowAnchor)>()
        .iter(world)
        .map(|(entity, anchor)| (entity, anchor.owner, anchor.local.clone()))
        .collect::<Vec<_>>();
    for (entity, owner, local) in anchors {
        let Some(owner_transform) = world.get::<Transform>(owner).cloned() else {
            continue;
        };
        if let Some(mut transform) = world.get_mut::<Transform>(entity) {
            *transform = owner_transform.mul_transform(local);
        }
    }
}

pub fn advance_native_contact_shadow_captures(world: &mut World) {
    let mut updates = HashMap::<Entity, (usize, u64)>::new();
    let mut settled_cameras = Vec::new();
    {
        let mut cameras =
            world.query::<(Entity, &mut Camera, &mut NativeContactShadowPassCamera)>();
        for (entity, mut camera, mut state) in cameras.iter_mut(world) {
            let update = updates.entry(state.owner).or_default();
            if state.update_mode == "dynamic" {
                camera.is_active = true;
                update.0 += 1;
                if state.counts_capture {
                    update.1 += 1;
                }
                continue;
            }
            if state.rendered_frames < STATIC_PIPELINE_WARMUP_FRAMES {
                camera.is_active = true;
                state.rendered_frames = state.rendered_frames.saturating_add(1);
                update.0 += 1;
                if state.counts_capture {
                    update.1 = 1;
                }
            } else {
                settled_cameras.push(entity);
            }
        }
    }
    for entity in settled_cameras {
        if let Some(entity) = world.get_entity_mut(entity) {
            entity.despawn_recursive();
        }
    }
    for (owner, (active_pass_count, capture_increment)) in updates {
        let Some(mut entity) = world.get_entity_mut(owner) else {
            continue;
        };
        let Some(mut report) = entity.get_mut::<NativeContactShadowReport>() else {
            continue;
        };
        report.active_pass_count = active_pass_count;
        if report.update_mode == "dynamic" {
            report.capture_count += capture_increment;
            report.update_count += capture_increment;
        } else if capture_increment > 0 {
            report.capture_count = 1;
            report.update_count = 1;
        }
    }
}

pub fn advance_native_contact_shadow_frames(world: &mut World, frames: usize) {
    for _ in 0..frames {
        advance_native_contact_shadow_captures(world);
    }
}

pub fn trace_native_contact_shadows(world: &mut World) -> Vec<NativeContactShadowReport> {
    let mut reports = world
        .query::<&NativeContactShadowReport>()
        .iter(world)
        .cloned()
        .collect::<Vec<_>>();
    reports.sort_by(|left, right| left.entity_id.cmp(&right.entity_id));
    reports
}

pub fn invalidate_native_static_contact_shadows(world: &mut World) {
    refresh_native_contact_shadow_pipelines(world);
}
