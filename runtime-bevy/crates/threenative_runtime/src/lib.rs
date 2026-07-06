use std::path::Path;

use bevy::{ecs::system::SystemParam, prelude::*, render::camera::ClearColorConfig};
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    EnvironmentSceneIr, LoadError, LoadedBundle, MaterialsIr, MeshRendererComponent,
    TransformComponent, UiBindingIr, UiNodeIr, WorldIr, load_bundle,
};

pub mod animation;
pub mod animation_physics_residuals;
pub mod asset_reload;
pub mod assets;
pub mod audio;
pub mod bevy_catalog_residuals;
pub mod cameras;
pub mod character;
pub mod component_diff;
pub mod conformance;
pub mod debug_overlay;
pub mod environment;
pub mod first_person;
pub mod gizmo_geometry;
pub mod gltf_scene_handles;
pub mod input;
pub mod input_ui_polish;
pub mod kinematic_mover;
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
pub mod production_hardening;
pub mod proof_harness;
pub mod render_targets;
pub mod render_transitions;
pub mod rendering;
pub mod rendering_residuals;
pub mod runtime_gameplay_host;
pub mod runtime_prefabs_hierarchy;
pub mod runtime_query_diffing;
pub mod scene_manager;
pub mod scripting_host_matrix;
pub mod stylized_nature;
pub mod systems_context;
pub mod systems_effects;
pub mod systems_host;
mod systems_host_bridge;
pub mod systems_services;
pub mod transform_interpolation;
pub mod ui;
pub mod ui_debug;
pub mod ui_persistence_settings_facades;
pub mod walkability;
pub mod world_mapping;

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
    #[error(transparent)]
    ProofHarness(#[from] proof_harness::NativeProofHarnessError),
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
    app_from_bundle_with_options(bundle_path, RuntimeOptions::default())
}

#[derive(Clone, Debug, Default)]
pub struct RuntimeOptions {
    pub proof_harness: Option<proof_harness::NativeProofHarnessOptions>,
}

pub fn app_from_bundle_with_options(
    bundle_path: impl AsRef<Path>,
    options: RuntimeOptions,
) -> Result<App, RuntimeError> {
    let bundle = load_bundle(bundle_path)?;
    let scene_diagnostics = native_scene_startup_diagnostics(
        &bundle.world,
        &bundle.materials,
        bundle.environment_scene.as_ref(),
    );
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
    let initially_paused = bundle
        .runtime_config
        .as_ref()
        .is_some_and(|config| config.time.paused);
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
    sync_default_camera_clear_color(app.world_mut());
    environment::map_environment_into_world(app.world_mut(), &bundle);
    for diagnostic in audio::spawn_startup_audio(app.world_mut(), &bundle) {
        warn!("{}", diagnostic.message);
    }
    if let Some(ui) = bundle.ui.as_ref() {
        ui::map_ui_into_world(app.world_mut(), ui)?;
        ui::install_native_ui_overlay_camera(app.world_mut());
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
    if let Some(proof_harness) = options.proof_harness {
        proof_harness::install_native_proof_harness(&mut app, proof_harness, &bundle.assets)?;
    }
    app.add_systems(
        Update,
        (
            rendering::normalize_loaded_gltf_materials,
            assets::apply_loaded_texture_controls,
            map_world::bind_native_animation_players,
            map_world::animate_native_stylized_motion,
            cameras::update_native_camera_helpers,
        ),
    );
    if has_scripts {
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.insert_resource(systems_host::NativeGameLoopState::new(initially_paused));
        app.add_systems(Update, run_scripted_runtime_systems);
    }
    Ok(app)
}

fn sync_default_camera_clear_color(world: &mut World) {
    let Some(clear_color) = world.get_resource::<ClearColor>().map(|clear| clear.0) else {
        return;
    };
    let mut query = world.query::<&mut Camera>();
    for mut camera in query.iter_mut(world) {
        if matches!(camera.clear_color, ClearColorConfig::Default) {
            camera.clear_color = ClearColorConfig::Custom(clear_color);
        }
    }
}

pub fn native_scene_startup_diagnostics(
    world: &WorldIr,
    materials: &MaterialsIr,
    environment_scene: Option<&EnvironmentSceneIr>,
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
    let environment_has_renderable_content =
        environment_scene.is_some_and(environment_scene_has_renderable_content);
    let has_stylized_renderable_content = world.entities.iter().any(|entity| {
        entity.components.extra.contains_key("StylizedNature")
            || entity.components.extra.contains_key("StylizedSparkles")
            || entity.components.extra.contains_key("RippleWater")
    });

    if visible_renderers.is_empty()
        && !environment_has_renderable_content
        && !has_stylized_renderable_content
    {
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
    environment_scene: Option<&EnvironmentSceneIr>,
) -> Vec<NativeSceneStartupDiagnostic> {
    native_scene_startup_diagnostics(world, materials, environment_scene)
}

fn environment_scene_has_renderable_content(scene: &EnvironmentSceneIr) -> bool {
    scene.terrain.is_some()
        || !scene.instances.is_empty()
        || scene.scatter.iter().any(|spec| {
            spec.count.unwrap_or(0) > 0 || spec.density.is_some_and(|value| value > 0.0)
        })
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

#[derive(SystemParam)]
struct ScriptedRuntimeParams<'w> {
    runtime: Option<ResMut<'w, ScriptedRuntimeBundle>>,
    loop_state: Option<ResMut<'w, systems_host::NativeGameLoopState>>,
}

fn run_scripted_runtime_systems(
    mut commands: Commands,
    mut scripted: ScriptedRuntimeParams,
    input: Option<Res<input::NativeInputState>>,
    proof_harness: Option<Res<proof_harness::NativeProofHarnessState>>,
    fast_forward: Option<Res<proof_harness::NativeProofHarnessFastForward>>,
    material_handles: Option<Res<map_world::NativeMaterialHandles>>,
    time: Res<Time>,
    mut transforms: Query<(&ThreeNativeId, &mut Transform)>,
    mut materials: Query<(&ThreeNativeId, &mut Handle<StandardMaterial>)>,
    mut text_nodes: Query<(&ThreeNativeId, &mut Text)>,
    mut minimap_markers: Query<(
        &ui::NativeUiMinimapMarker,
        &mut Style,
        &mut BackgroundColor,
        &mut Visibility,
    )>,
) {
    let Some(ref mut runtime) = scripted.runtime else {
        return;
    };
    let Some(ref mut loop_state) = scripted.loop_state else {
        return;
    };
    let fixed_delta = runtime
        .bundle
        .runtime_config
        .as_ref()
        .map_or(1.0 / 60.0, |config| config.time.fixed_delta);
    let delta = if proof_harness.is_some() {
        fixed_delta
    } else {
        time.delta_seconds()
    };
    let paused = runtime
        .bundle
        .runtime_config
        .as_ref()
        .is_some_and(|config| config.time.paused);
    let frame_count = if proof_harness.is_some() {
        fast_forward.as_ref().map_or(1, |advance| advance.0.max(1))
    } else {
        1
    };

    for _ in 0..frame_count {
        let options = systems_host::NativeGameLoopRunOptions {
            delta,
            fixed_delta,
            input: input.as_deref(),
            paused,
        };

        if let Err(error) = systems_host::run_native_systems_frame_with_input(
            &mut runtime.bundle,
            &mut *loop_state,
            options,
            physics::step_bundle_physics_with_script_poses,
        ) {
            error!("{error}");
            return;
        }
    }
    if fast_forward.is_some_and(|advance| advance.0 > 0) {
        commands.insert_resource(proof_harness::NativeProofHarnessFastForward::default());
    }

    sync_scripted_transforms(&runtime.bundle, &mut transforms);
    sync_scripted_materials(&runtime.bundle, material_handles.as_deref(), &mut materials);
    sync_scripted_ui_text(&runtime.bundle, &mut text_nodes);
    ui::sync_native_minimap_markers(&runtime.bundle, &mut minimap_markers);
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
        UiBindingIr::Resource {
            name,
            field,
            fields,
            format,
        } => {
            let value = bundle.world.resources.get(name)?;
            if let Some(format) = format {
                return Some(serde_json::Value::String(format_ui_binding_value(
                    format,
                    value,
                    fields_for_binding(field.as_deref(), fields),
                )));
            }
            resolve_bound_field(value, field.as_deref()).cloned()
        }
        UiBindingIr::Component {
            component,
            entity,
            field,
            fields,
            format,
        } => {
            let entity = bundle
                .world
                .entities
                .iter()
                .find(|item| item.id == *entity)?;
            let value = systems_context::component_value(&entity.components, component)?;
            if let Some(format) = format {
                return Some(serde_json::Value::String(format_ui_binding_value(
                    format,
                    &value,
                    fields_for_binding(field.as_deref(), fields),
                )));
            }
            resolve_bound_field(&value, field.as_deref()).cloned()
        }
    }
}

fn fields_for_binding<'a>(field: Option<&'a str>, fields: &'a [String]) -> Vec<&'a str> {
    if fields.is_empty() {
        field.into_iter().collect()
    } else {
        fields.iter().map(String::as_str).collect()
    }
}

fn format_ui_binding_value(format: &str, source: &serde_json::Value, fields: Vec<&str>) -> String {
    let mut rendered = String::new();
    let mut rest = format;
    while let Some(open) = rest.find('{') {
        let (prefix, after_open) = rest.split_at(open);
        rendered.push_str(prefix);
        let after_open = &after_open[1..];
        let Some(close) = after_open.find('}') else {
            rendered.push('{');
            rendered.push_str(after_open);
            return rendered;
        };
        let (token, after_close) = after_open.split_at(close);
        let mut parts = token.splitn(2, ':');
        let field = parts.next().unwrap_or_default();
        let formatter = parts.next();
        if fields.is_empty() || fields.iter().any(|candidate| *candidate == field) {
            let value = source.get(field).unwrap_or(&serde_json::Value::Null);
            rendered.push_str(&format_ui_scalar(value, formatter));
        }
        rest = &after_close[1..];
    }
    rendered.push_str(rest);
    rendered
}

fn format_ui_scalar(value: &serde_json::Value, formatter: Option<&str>) -> String {
    let Some(formatter) = formatter else {
        return value_to_ui_text(value);
    };
    let numeric = value.as_f64().unwrap_or(0.0);
    if let Some(digits) = formatter.strip_prefix("fixed") {
        let digits = digits.parse::<usize>().unwrap_or(0);
        return format!("{numeric:.digits$}");
    }
    if let Some(width) = formatter.strip_prefix("pad") {
        let width = width.parse::<usize>().unwrap_or(0);
        return format!("{:0>width$}", numeric.trunc() as i64);
    }
    value_to_ui_text(value)
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

#[cfg(test)]
mod tests {
    use std::{fs, path::Path, time::Duration};

    use threenative_loader::load_bundle;

    use super::*;

    #[test]
    fn scripted_runtime_should_preserve_startup_state_across_bevy_update_frames() {
        let root = write_scripted_runtime_bundle("bevy-startup-state", 0.1);
        let mut app = scripted_runtime_app(&root);

        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);

        let runtime = app.world().resource::<ScriptedRuntimeBundle>();
        assert_eq!(
            runtime.bundle.world.resources.get("LoopCounts"),
            Some(&serde_json::json!({
                "fixed": 2,
                "post": 2,
                "startup": 1,
                "update": 2
            }))
        );
        let state = app.world().resource::<systems_host::NativeGameLoopState>();
        assert_eq!(state.frame, 2);
        assert_eq!(state.tick, 2);
        assert!(state.startup_complete);
    }

    #[test]
    fn scripted_runtime_should_step_fixed_update_by_accumulated_bevy_delta() {
        let root = write_scripted_runtime_bundle("bevy-fixed-accumulator", 0.25);
        let mut app = scripted_runtime_app(&root);

        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);

        let runtime = app.world().resource::<ScriptedRuntimeBundle>();
        assert_eq!(
            runtime.bundle.world.resources.get("LoopCounts"),
            Some(&serde_json::json!({
                "fixed": 1,
                "post": 3,
                "startup": 1,
                "update": 3
            }))
        );
        let state = app.world().resource::<systems_host::NativeGameLoopState>();
        assert!((state.accumulator - 0.05).abs() < f32::EPSILON * 8.0);
        assert_eq!(state.frame, 3);
        assert_eq!(state.tick, 1);
    }

    fn scripted_runtime_app(root: &Path) -> App {
        let bundle = load_bundle(root).expect("scripted test bundle should load");
        let mut app = App::new();
        app.insert_resource(Time::<()>::default());
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.insert_resource(systems_host::NativeGameLoopState::default());
        app.add_systems(Update, run_scripted_runtime_systems);
        app
    }

    fn advance_app(app: &mut App, seconds: f32) {
        app.world_mut()
            .resource_mut::<Time<()>>()
            .advance_by(Duration::from_secs_f32(seconds));
        app.update();
    }

    fn write_scripted_runtime_bundle(name: &str, fixed_delta: f32) -> std::path::PathBuf {
        let root =
            std::env::temp_dir().join(format!("tn-scripted-runtime-{name}-{}", std::process::id()));
        if root.exists() {
            fs::remove_dir_all(&root).expect("old temp bundle should be removed");
        }
        fs::create_dir_all(&root).expect("temp bundle should be created");
        write_test_file(
            &root,
            "manifest.json",
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "scripted-runtime-test",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "runtimeConfig": "runtime.config.json", "targetProfile": "target.profile.json" }
}"#,
        );
        write_test_file(
            &root,
            "runtime.config.json",
            &format!(
                r#"{{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "time": {{ "fixedDelta": {fixed_delta}, "paused": false }},
  "window": {{ "width": 1280, "height": 720 }}
}}"#
            ),
        );
        write_test_file(
            &root,
            "world.ir.json",
            r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": {
    "LoopCounts": { "fixed": 0, "post": 0, "startup": 0, "update": 0 }
  }
}"#,
        );
        write_test_file(
            &root,
            "systems.ir.json",
            r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    { "name": "boot", "schedule": "startup", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_boot" } },
    { "name": "tick", "schedule": "fixedUpdate", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" } },
    { "name": "update", "schedule": "update", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_update" } },
    { "name": "post", "schedule": "postUpdate", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": ["LoopCounts"], "resourceWrites": ["LoopCounts"], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_post" } }
  ]
}"#,
        );
        write_test_file(
            &root,
            "scripts.bundle.js",
            r#"const bump = (ctx, key) => {
  const counts = ctx.resources.get("LoopCounts");
  counts[key] += 1;
  ctx.resources.set("LoopCounts", counts);
};
const system_boot = (ctx) => bump(ctx, "startup");
const system_tick = (ctx) => bump(ctx, "fixed");
const system_update = (ctx) => bump(ctx, "update");
const system_post = (ctx) => bump(ctx, "post");
export const systemIds = Object.freeze({ "system_boot": "boot", "system_tick": "tick", "system_update": "update", "system_post": "post" });
export const systems = Object.freeze({ "system_boot": system_boot, "system_tick": system_tick, "system_update": system_update, "system_post": system_post });
"#,
        );
        write_test_file(
            &root,
            "assets.manifest.json",
            r#"{"schema":"threenative.assets","version":"0.1.0","assets":[]}"#,
        );
        write_test_file(
            &root,
            "materials.ir.json",
            r#"{"schema":"threenative.materials","version":"0.1.0","materials":[]}"#,
        );
        write_test_file(
            &root,
            "target.profile.json",
            r#"{"schema":"threenative.target-profile","version":"0.1.0","targets":["desktop"]}"#,
        );
        root
    }

    fn write_test_file(root: &Path, file: &str, contents: &str) {
        fs::write(root.join(file), contents).expect("test bundle file should be written");
    }
}
