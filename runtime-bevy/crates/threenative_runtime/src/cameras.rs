use std::collections::HashMap;

use bevy::prelude::*;
use bevy::render::{
    camera::{ClearColorConfig, RenderTarget, Viewport},
    view::visibility::RenderLayers,
};
use bevy::window::WindowRef;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    CameraComponent, CameraFollowHelperIr, CameraOrbitHelperIr, CameraScreenShakeHelperIr,
    LoadedBundle,
};

const MAX_RENDER_LAYERS: usize = 64;

#[derive(Clone, Debug, Resource)]
pub struct NativeRenderLayerMap {
    pub allocation: HashMap<String, usize>,
}

impl Default for NativeRenderLayerMap {
    fn default() -> Self {
        let mut allocation = HashMap::new();
        allocation.insert("default".to_owned(), 0);
        Self { allocation }
    }
}

#[derive(Clone, Component, Debug)]
pub struct NativeCameraMetadata(pub CameraComponent);

#[derive(Clone, Debug, Component, Default)]
pub struct NativeCameraHelperState {
    pub shake_phase: f32,
    pub shake_strength: f32,
}

pub fn build_render_layer_map(bundle: &LoadedBundle) -> NativeRenderLayerMap {
    let mut names = vec!["default".to_owned()];
    for entity in &bundle.world.entities {
        if let Some(layers) = entity.components.render_layers.as_ref() {
            names.extend(layers.layers.iter().cloned());
        }
        if let Some(layers) = entity.components.camera.as_ref().and_then(|camera| camera.layers.as_ref()) {
            names.extend(layers.iter().cloned());
        }
    }
    names.sort();
    names.dedup();

    let mut allocation = HashMap::new();
    allocation.insert("default".to_owned(), 0);
    let mut next = 1usize;
    for name in names {
        if name == "default" {
            continue;
        }
        if next >= MAX_RENDER_LAYERS {
            break;
        }
        allocation.insert(name, next);
        next += 1;
    }
    NativeRenderLayerMap { allocation }
}

pub fn render_layers_for_names(
    layer_map: &NativeRenderLayerMap,
    layer_names: &[String],
) -> RenderLayers {
    let names = if layer_names.is_empty() {
        vec!["default".to_owned()]
    } else {
        layer_names.to_vec()
    };
    names
        .iter()
        .filter_map(|name| layer_map.allocation.get(name))
        .fold(RenderLayers::none(), |layers, layer| layers.with(*layer))
}

pub fn camera_order(camera: &CameraComponent) -> i32 {
    camera.order.or(camera.priority).unwrap_or(0)
}

pub fn active_camera_ids(bundle: &LoadedBundle) -> Vec<String> {
    if let Some(value) = bundle.world.resources.get("ActiveCameras") {
        if let Some(cameras) = value.get("cameras").and_then(|cameras| cameras.as_array()) {
            return cameras
                .iter()
                .filter_map(|camera| {
                    camera
                        .as_str()
                        .map(str::to_owned)
                        .or_else(|| {
                            camera
                                .get("entity")
                                .and_then(|entity| entity.as_str())
                                .map(str::to_owned)
                        })
                })
                .collect();
        }
    }
    if let Some(value) = bundle.world.resources.get("ActiveCamera") {
        if let Some(entity) = value.get("entity").and_then(|entity| entity.as_str()) {
            return vec![entity.to_owned()];
        }
    }
    bundle
        .world
        .entities
        .iter()
        .filter(|entity| entity.components.camera.is_some())
        .map(|entity| entity.id.clone())
        .collect()
}

pub fn map_viewport(
    viewport: [f32; 4],
    physical_width: u32,
    physical_height: u32,
) -> Viewport {
    let width = physical_width.max(1);
    let height = physical_height.max(1);
    let physical_width = ((viewport[2] * width as f32).round() as u32).max(1);
    let physical_height = ((viewport[3] * height as f32).round() as u32).max(1);
    let physical_x = (viewport[0] * width as f32).round() as u32;
    let physical_y =
        ((1.0 - viewport[1] - viewport[3]) * height as f32).round() as u32;
    Viewport {
        physical_position: UVec2::new(physical_x, physical_y),
        physical_size: UVec2::new(physical_width, physical_height),
        depth: 0.0..1.0,
    }
}

pub fn map_clear_color(clear: &threenative_loader::CameraClearIr) -> ClearColorConfig {
    match clear.mode.as_str() {
        "none" => ClearColorConfig::None,
        "color" => clear
            .color
            .as_ref()
            .map(|color| ClearColorConfig::Custom(color_to_bevy(color)))
            .unwrap_or(ClearColorConfig::Default),
        _ => ClearColorConfig::Default,
    }
}

fn color_to_bevy(color: &threenative_loader::ColorIr) -> Color {
    match color {
        threenative_loader::ColorIr::Hex(value) => {
            parse_hex_color(value).unwrap_or(Color::BLACK)
        }
        threenative_loader::ColorIr::Rgb(values) => Color::srgb(values[0], values[1], values[2]),
    }
}

fn parse_hex_color(value: &str) -> Option<Color> {
    let trimmed = value.trim_start_matches('#');
    if trimmed.len() != 6 {
        return None;
    }
    let red = u8::from_str_radix(&trimmed[0..2], 16).ok()?;
    let green = u8::from_str_radix(&trimmed[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&trimmed[4..6], 16).ok()?;
    Some(Color::srgb_u8(red, green, blue))
}

pub fn apply_camera_components(
    camera: &CameraComponent,
    spawned: &mut EntityWorldMut<'_>,
    layer_map: &NativeRenderLayerMap,
    order: i32,
    is_active: bool,
    physical_size: UVec2,
    render_target: Option<RenderTarget>,
) {
    spawned.insert(Camera {
        order: order as isize,
        is_active,
        clear_color: camera
            .clear
            .as_ref()
            .map(map_clear_color)
            .unwrap_or_default(),
        target: render_target.unwrap_or(RenderTarget::Window(WindowRef::Primary)),
        viewport: camera.viewport.as_ref().map(|viewport| {
            map_viewport(
                viewport.as_tuple(),
                physical_size.x,
                physical_size.y,
            )
        }),
        ..default()
    });
    let layer_names = camera
        .layers
        .clone()
        .unwrap_or_else(|| vec!["default".to_owned()]);
    spawned.insert(render_layers_for_names(layer_map, &layer_names));
    spawned.insert(NativeCameraMetadata(camera.clone()));
    if camera.follow.is_some()
        || camera.orbit.is_some()
        || camera.screen_shake.is_some()
        || camera.view_model.is_some()
    {
        spawned.insert(NativeCameraHelperState::default());
    }
}

pub fn update_native_camera_helpers(
    mut queries: ParamSet<(
        Query<(&mut Transform, &mut NativeCameraHelperState, &NativeCameraMetadata)>,
        Query<(&ThreeNativeId, &Transform), Without<Camera>>,
    )>,
) {
    let target_positions = queries
        .p1()
        .iter()
        .map(|(id, transform)| (id.0.clone(), transform.translation))
        .collect::<HashMap<_, _>>();
    for (mut transform, mut state, metadata) in queries.p0().iter_mut() {
        let camera = &metadata.0;
        if let Some(follow) = camera.follow.as_ref() {
            apply_follow_helper(&mut transform, follow, &target_positions, 1.0 / 60.0);
        }
        if let Some(orbit) = camera.orbit.as_ref() {
            apply_orbit_helper(&mut transform, orbit, &target_positions, 1.0 / 60.0);
        }
        if let Some(view_model) = camera.view_model.as_ref() {
            if let Some(offset) = view_model.offset {
                transform.translation += Vec3::new(offset[0], offset[1], offset[2]);
            }
        }
        if let Some(shake) = camera.screen_shake.as_ref() {
            apply_screen_shake(&mut transform, shake, &mut state, 1.0 / 60.0);
        } else {
            state.shake_strength = lerp_scalar(state.shake_strength, 0.0, 6.0, 1.0 / 60.0);
        }
    }
}

fn apply_follow_helper(
    transform: &mut Transform,
    follow: &CameraFollowHelperIr,
    targets: &HashMap<String, Vec3>,
    delta: f32,
) {
    let Some(target_position) = targets.get(&follow.target) else {
        return;
    };
    let offset = follow
        .offset
        .map(|offset| Vec3::new(offset[0], offset[1], offset[2]))
        .unwrap_or(Vec3::ZERO);
    let desired = *target_position + offset;
    let smoothing = follow.smoothing.unwrap_or(8.0);
    transform.translation = transform
        .translation
        .lerp(desired, 1.0 - (-smoothing.max(0.0) * delta).exp());
    transform.look_at(*target_position, Vec3::Y);
}

fn apply_orbit_helper(
    transform: &mut Transform,
    orbit: &CameraOrbitHelperIr,
    targets: &HashMap<String, Vec3>,
    delta: f32,
) {
    let Some(target_position) = targets.get(&orbit.target) else {
        return;
    };
    let offset = transform.translation - *target_position;
    let distance = offset.length();
    let desired_distance = orbit
        .distance
        .unwrap_or(distance)
        .clamp(orbit.min_distance.unwrap_or(0.0), orbit.max_distance.unwrap_or(f32::INFINITY));
    let offset = if distance > 0.0 {
        offset * (desired_distance / distance)
    } else {
        Vec3::new(0.0, desired_distance, desired_distance)
    };
    let smoothing = orbit.smoothing.unwrap_or(8.0);
    let desired = *target_position + offset;
    transform.translation = transform
        .translation
        .lerp(desired, 1.0 - (-smoothing.max(0.0) * delta).exp());
    transform.look_at(*target_position, Vec3::Y);
}

fn apply_screen_shake(
    transform: &mut Transform,
    shake: &CameraScreenShakeHelperIr,
    state: &mut NativeCameraHelperState,
    delta: f32,
) {
    state.shake_strength = state.shake_strength.max(shake.amplitude);
    state.shake_phase += delta * shake.frequency.unwrap_or(20.0) * std::f32::consts::TAU;
    let decay = shake.decay.unwrap_or(4.0);
    state.shake_strength = lerp_scalar(state.shake_strength, 0.0, decay, delta);
    if state.shake_strength <= 1e-4 {
        return;
    }
    transform.translation += Vec3::new(
        state.shake_phase.sin() * state.shake_strength,
        (state.shake_phase * 1.3).cos() * state.shake_strength,
        (state.shake_phase * 0.7).sin() * state.shake_strength * 0.5,
    );
}

fn lerp_scalar(current: f32, target: f32, smoothing: f32, delta: f32) -> f32 {
    let factor = 1.0 - (-smoothing.max(0.0) * delta).exp();
    current + (target - current) * factor
}
