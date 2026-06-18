use std::path::Path;

use bevy::prelude::*;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    LoadError, LoadedBundle, MaterialsIr, MeshRendererComponent, TransformComponent, UiBindingIr,
    UiNodeIr, WorldIr, load_bundle,
};

pub mod animation;
pub mod animation_physics_residuals;
pub mod asset_reload;
pub mod assets;
pub mod audio;
pub mod cameras;
pub mod character;
pub mod conformance;
pub mod debug_overlay;
pub mod environment;
pub mod first_person;
pub mod gizmo_geometry;
pub mod gltf_scene_handles;
pub mod input;
pub mod input_ui_polish;
pub mod map_world;
pub mod mesh_bounds;
pub mod navigation;
pub mod overlay;
pub mod overlay_host;
pub mod path_sampling;
pub mod persistence;
pub mod persistence_reload;
pub mod physics;
pub mod physics_sensors;
pub mod picking;
pub mod render_targets;
pub mod render_transitions;
pub mod rendering;
pub mod scene_manager;
pub mod systems_context;
pub mod systems_effects;
pub mod systems_host;
pub mod systems_services;
pub mod transform_interpolation;
pub mod ui;
pub mod ui_debug;
pub mod walkability;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error(transparent)]
    Load(#[from] LoadError),
    #[error(transparent)]
    Map(#[from] map_world::MapError),
    #[error(transparent)]
    SystemsHost(#[from] systems_host::SystemsHostError),
    #[error("scene readiness failed: {0}")]
    SceneReadiness(String),
    #[error(transparent)]
    Ui(#[from] ui::UiDiagnostic),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum NativeSceneDiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeSceneStartupDiagnostic {
    pub code: &'static str,
    pub message: String,
    pub path: &'static str,
    pub severity: NativeSceneDiagnosticSeverity,
}

pub fn app_from_bundle(bundle_path: impl AsRef<Path>) -> Result<App, RuntimeError> {
    let mut bundle = load_bundle(bundle_path)?;
    let scene_diagnostics = native_scene_startup_diagnostics(&bundle.world, &bundle.materials);
    for diagnostic in &scene_diagnostics {
        match diagnostic.severity {
            NativeSceneDiagnosticSeverity::Error => {
                error!(
                    "{}: {} ({})",
                    diagnostic.code, diagnostic.message, diagnostic.path
                );
            }
            NativeSceneDiagnosticSeverity::Warning => {
                warn!(
                    "{}: {} ({})",
                    diagnostic.code, diagnostic.message, diagnostic.path
                );
            }
        }
    }
    if let Some(diagnostic) = scene_diagnostics
        .iter()
        .find(|diagnostic| diagnostic.severity == NativeSceneDiagnosticSeverity::Error)
    {
        return Err(RuntimeError::SceneReadiness(format!(
            "{}: {} ({})",
            diagnostic.code, diagnostic.message, diagnostic.path
        )));
    }
    systems_host::ensure_native_system_host_supported(&bundle)?;
    let has_scripts = bundle.manifest.entry.scripts.is_some();
    systems_host::run_native_systems_once(
        &mut bundle,
        systems_context::NativeSystemTimeSnapshot {
            delta: 1.0 / 60.0,
            dt: 1.0 / 60.0,
            elapsed: 0.0,
            fixed_delta: 1.0 / 60.0,
            fixed_dt: 1.0 / 60.0,
            paused: false,
        },
    )?;
    let asset_root = bundle.bundle_path.display().to_string();
    let window = bundle.runtime_config.as_ref().map(|config| &config.window);
    #[cfg(feature = "native-webview")]
    let native_overlay_init_error = match overlay_host::create_native_overlay_host_plan(
        bundle.overlays.as_ref(),
        &bundle.bundle_path,
    ) {
        Ok(Some(_)) => overlay_host::initialize_native_webview_backend().err(),
        Ok(None) | Err(_) => None,
    };
    let mut app = App::new();
    app.insert_resource(ClearColor(Color::srgb(
        17.0 / 255.0,
        19.0 / 255.0,
        24.0 / 255.0,
    )))
    .add_plugins(
        DefaultPlugins
            .set(AssetPlugin {
                file_path: asset_root,
                ..Default::default()
            })
            .set(WindowPlugin {
                primary_window: Some(Window {
                    resolution: (
                        window.map_or(1280.0, |value| value.width),
                        window.map_or(720.0, |value| value.height),
                    )
                        .into(),
                    title: window
                        .and_then(|value| value.title.clone())
                        .unwrap_or_else(|| "ThreeNative Bevy Preview".to_owned()),
                    ..Default::default()
                }),
                ..Default::default()
            }),
    );
    rendering::apply_atmosphere_to_world(app.world_mut(), &bundle);
    let environment_lighting =
        rendering::apply_environment_lighting_to_world(app.world_mut(), &bundle);
    for diagnostic in environment_lighting.diagnostics {
        warn!("{diagnostic}");
    }
    map_world::map_bundle_into_world(app.world_mut(), &bundle)?;
    environment::map_environment_into_world(app.world_mut(), &bundle);
    for diagnostic in audio::spawn_startup_audio(app.world_mut(), &bundle) {
        warn!("{}", diagnostic.message);
    }
    if let Some(ui) = bundle.ui.as_ref() {
        ui::map_ui_into_world(app.world_mut(), ui)?;
        app.init_resource::<ui::NativeUiActionQueue>();
        app.add_systems(
            Update,
            (ui::scroll_native_ui, ui::dispatch_native_ui_actions),
        );
    }
    match overlay_host::create_native_overlay_host_plan(
        bundle.overlays.as_ref(),
        &bundle.bundle_path,
    ) {
        Ok(Some(plan)) => {
            info!(
                "prepared {} native overlay mount(s) using {}",
                plan.mounts.len(),
                plan.backend
            );
            #[cfg(feature = "native-webview")]
            {
                if let Some(error) = native_overlay_init_error.as_ref() {
                    warn!("TN_OVERLAY_NATIVE_INIT_FAILED: {error}");
                } else {
                    if let Some(overlays) = bundle.overlays.clone() {
                        app.insert_resource(overlay_host::NativeOverlayBridgeResource::new(
                            overlays,
                        ));
                    }
                    app.insert_resource(overlay_host::NativeOverlayHostPlanResource(plan));
                    app.add_systems(
                        Update,
                        (
                            overlay_host::mount_native_overlay_webviews,
                            overlay_host::resize_native_overlay_webviews,
                            overlay_host::pump_native_overlay_webview_events,
                        ),
                    );
                }
            }
        }
        Ok(None) => {}
        Err(diagnostics) => {
            for diagnostic in diagnostics {
                warn!("{}: {}", diagnostic.code, diagnostic.message);
            }
        }
    }
    if let Some(input_map) = bundle.input.clone() {
        let input_map = input::apply_native_persisted_binding_overrides(
            &input_map,
            &input_map.persisted_binding_overrides,
            None,
        );
        app.insert_resource(input::NativeInputMap(input_map));
        app.init_resource::<input::NativeInputState>();
        app.add_systems(PreUpdate, input::capture_native_input);
    }
    app.add_systems(
        Update,
        (
            rendering::normalize_loaded_gltf_materials,
            assets::apply_loaded_texture_controls,
            map_world::bind_native_animation_players,
            cameras::update_native_camera_helpers,
        ),
    );
    if has_scripts {
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.add_systems(Update, run_scripted_runtime_systems);
    }
    Ok(app)
}

pub fn native_scene_startup_diagnostics(
    world: &WorldIr,
    materials: &MaterialsIr,
) -> Vec<NativeSceneStartupDiagnostic> {
    let mut diagnostics = Vec::new();
    let camera_ids = world
        .entities
        .iter()
        .filter(|entity| entity.components.camera.is_some())
        .map(|entity| entity.id.as_str())
        .collect::<Vec<_>>();
    let visible_renderers = world
        .entities
        .iter()
        .filter_map(|entity| entity.components.mesh_renderer.as_ref())
        .filter(|renderer| renderer.visible != Some(false))
        .collect::<Vec<_>>();
    let has_light = world
        .entities
        .iter()
        .any(|entity| entity.components.light.is_some());

    if visible_renderers.is_empty() {
        diagnostics.push(NativeSceneStartupDiagnostic {
            code: "TN_BEVY_SCENE_RENDERERS_MISSING",
            message:
                "No visible MeshRenderer components were found; the scene has nothing renderable."
                    .to_owned(),
            path: "world.ir.json/entities",
            severity: NativeSceneDiagnosticSeverity::Error,
        });
    }

    if camera_ids.is_empty() {
        diagnostics.push(NativeSceneStartupDiagnostic {
            code: "TN_BEVY_CAMERA_MISSING",
            message: "No Camera component was found; Bevy preview cannot render this scene."
                .to_owned(),
            path: "world.ir.json/entities",
            severity: NativeSceneDiagnosticSeverity::Error,
        });
    } else {
        match active_camera_status(world, &camera_ids) {
            ActiveCameraStatus::Valid => {}
            ActiveCameraStatus::Missing => diagnostics.push(NativeSceneStartupDiagnostic {
                code: "TN_BEVY_ACTIVE_CAMERA_MISSING",
                message: "No ActiveCamera or ActiveCameras resource selects a Camera entity; the runtime will fall back to the first camera.".to_owned(),
                path: "world.ir.json/resources/ActiveCamera",
                severity: NativeSceneDiagnosticSeverity::Warning,
            }),
            ActiveCameraStatus::Invalid => diagnostics.push(NativeSceneStartupDiagnostic {
                code: "TN_BEVY_ACTIVE_CAMERA_INVALID",
                message: "ActiveCamera or ActiveCameras references an entity that is missing or does not have a Camera component.".to_owned(),
                path: "world.ir.json/resources/ActiveCamera",
                severity: NativeSceneDiagnosticSeverity::Error,
            }),
        }
    }

    if !has_light
        && visible_renderers
            .iter()
            .any(|renderer| is_lit_material(materials, &renderer.material))
    {
        diagnostics.push(NativeSceneStartupDiagnostic {
            code: "TN_BEVY_LIGHT_MISSING",
            message: "Visible lit materials are present but no Light component was found; the scene may render very dark.".to_owned(),
            path: "world.ir.json/entities",
            severity: NativeSceneDiagnosticSeverity::Warning,
        });
    }

    diagnostics
}

pub fn native_scene_startup_warnings(
    world: &WorldIr,
    materials: &MaterialsIr,
) -> Vec<NativeSceneStartupDiagnostic> {
    native_scene_startup_diagnostics(world, materials)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActiveCameraStatus {
    Invalid,
    Missing,
    Valid,
}

fn active_camera_status(world: &WorldIr, camera_ids: &[&str]) -> ActiveCameraStatus {
    let active_camera = world
        .resources
        .get("ActiveCamera")
        .and_then(|value| value.get("entity"))
        .and_then(serde_json::Value::as_str);
    if let Some(entity) = active_camera {
        return if camera_ids.contains(&entity) {
            ActiveCameraStatus::Valid
        } else {
            ActiveCameraStatus::Invalid
        };
    }

    let active_cameras = world
        .resources
        .get("ActiveCameras")
        .and_then(|value| value.get("cameras"))
        .and_then(serde_json::Value::as_array);
    let Some(cameras) = active_cameras else {
        return ActiveCameraStatus::Missing;
    };
    if cameras.is_empty() {
        return ActiveCameraStatus::Invalid;
    }
    if cameras.iter().any(|entry| {
        let entity = entry
            .as_str()
            .or_else(|| entry.get("entity").and_then(serde_json::Value::as_str));
        entity.is_some_and(|entity| camera_ids.contains(&entity))
    }) {
        ActiveCameraStatus::Valid
    } else {
        ActiveCameraStatus::Invalid
    }
}

fn is_lit_material(materials: &MaterialsIr, material_id: &str) -> bool {
    materials
        .materials
        .iter()
        .find(|material| material.id == material_id)
        .is_none_or(|material| material.kind != "basic")
}

#[derive(Resource)]
struct ScriptedRuntimeBundle {
    bundle: LoadedBundle,
}

fn run_scripted_runtime_systems(
    mut runtime: Option<ResMut<ScriptedRuntimeBundle>>,
    input: Option<Res<input::NativeInputState>>,
    material_handles: Option<Res<map_world::NativeMaterialHandles>>,
    time: Res<Time>,
    mut transforms: Query<(&ThreeNativeId, &mut Transform)>,
    mut materials: Query<(&ThreeNativeId, &mut Handle<StandardMaterial>)>,
    mut text_nodes: Query<(&ThreeNativeId, &mut Text)>,
) {
    let Some(ref mut runtime) = runtime else {
        return;
    };
    let delta = time.delta_seconds();
    let snapshot = systems_context::NativeSystemTimeSnapshot {
        delta,
        dt: delta,
        elapsed: time.elapsed_seconds(),
        fixed_delta: 1.0 / 60.0,
        fixed_dt: 1.0 / 60.0,
        paused: false,
    };

    if let Err(error) = systems_host::run_native_systems_once_with_input(
        &mut runtime.bundle,
        snapshot,
        input.as_deref(),
    ) {
        error!("{error}");
        return;
    }

    sync_scripted_transforms(&runtime.bundle, &mut transforms);
    sync_scripted_materials(&runtime.bundle, material_handles.as_deref(), &mut materials);
    sync_scripted_ui_text(&runtime.bundle, &mut text_nodes);
}

fn sync_scripted_transforms(
    bundle: &LoadedBundle,
    transforms: &mut Query<(&ThreeNativeId, &mut Transform)>,
) {
    for (stable_id, mut target) in transforms.iter_mut() {
        let Some(source) = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == stable_id.0)
            .and_then(|entity| entity.components.transform.as_ref())
        else {
            continue;
        };
        apply_transform_component(&mut target, source);
    }
}

fn sync_scripted_materials(
    bundle: &LoadedBundle,
    material_handles: Option<&map_world::NativeMaterialHandles>,
    materials: &mut Query<(&ThreeNativeId, &mut Handle<StandardMaterial>)>,
) {
    let Some(material_handles) = material_handles else {
        return;
    };
    for (stable_id, mut target) in materials.iter_mut() {
        let Some(source) = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == stable_id.0)
            .and_then(|entity| entity.components.mesh_renderer.as_ref())
        else {
            continue;
        };
        apply_mesh_renderer_component(&mut target, source, material_handles);
    }
}

fn apply_mesh_renderer_component(
    target: &mut Handle<StandardMaterial>,
    source: &MeshRendererComponent,
    material_handles: &map_world::NativeMaterialHandles,
) {
    if let Some(material) = material_handles.0.get(&source.material) {
        *target = material.clone();
    }
}

fn sync_scripted_ui_text(
    bundle: &LoadedBundle,
    text_nodes: &mut Query<(&ThreeNativeId, &mut Text)>,
) {
    let Some(ui) = bundle.ui.as_ref() else {
        return;
    };
    for (stable_id, mut text) in text_nodes.iter_mut() {
        let Some(node) = find_ui_node(&ui.root, &stable_id.0) else {
            continue;
        };
        let Some(binding) = node.binding.as_ref() else {
            continue;
        };
        let Some(value) = resolve_ui_binding(bundle, binding) else {
            continue;
        };
        let rendered = value_to_ui_text(&value);
        if let Some(section) = text.sections.first_mut() {
            section.value = rendered;
        }
    }
}

fn find_ui_node<'a>(node: &'a UiNodeIr, id: &str) -> Option<&'a UiNodeIr> {
    if node.id == id {
        return Some(node);
    }
    node.children
        .iter()
        .find_map(|child| find_ui_node(child, id))
}

fn resolve_ui_binding<'a>(
    bundle: &'a LoadedBundle,
    binding: &UiBindingIr,
) -> Option<serde_json::Value> {
    match binding {
        UiBindingIr::Resource { name, field } => {
            let value = bundle.world.resources.get(name)?;
            resolve_bound_field(value, field.as_deref()).cloned()
        }
        UiBindingIr::Component {
            component,
            entity,
            field,
        } => {
            let entity = bundle
                .world
                .entities
                .iter()
                .find(|item| item.id == *entity)?;
            let value = systems_context::component_value(&entity.components, component)?;
            resolve_bound_field(&value, field.as_deref()).cloned()
        }
    }
}

fn resolve_bound_field<'a>(
    value: &'a serde_json::Value,
    field: Option<&str>,
) -> Option<&'a serde_json::Value> {
    match field {
        Some(field) => value.get(field),
        None => Some(value),
    }
}

fn value_to_ui_text(value: &serde_json::Value) -> String {
    if let Some(value) = value.as_str() {
        return value.to_owned();
    }
    if let Some(value) = value.as_i64() {
        return value.to_string();
    }
    if let Some(value) = value.as_u64() {
        return value.to_string();
    }
    if let Some(value) = value.as_f64() {
        return if value.fract() == 0.0 {
            format!("{value:.0}")
        } else {
            value.to_string()
        };
    }
    if let Some(value) = value.as_bool() {
        return value.to_string();
    }
    value.to_string()
}

fn apply_transform_component(target: &mut Transform, source: &TransformComponent) {
    if let Some(position) = source.position {
        target.translation = Vec3::new(position[0], position[1], position[2]);
    }
    if let Some(rotation) = source.rotation {
        target.rotation = Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
    }
    if let Some(scale) = source.scale {
        target.scale = Vec3::new(scale[0], scale[1], scale[2]);
    }
}
