use std::{
    collections::{BTreeSet, HashMap},
    path::Path,
};

use bevy::{ecs::system::SystemParam, prelude::*, render::camera::ClearColorConfig};
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{
    EnvironmentSceneIr, LoadError, LoadedBundle, MaterialsIr, MeshRendererComponent,
    TransformComponent, UiBindingIr, WorldEntity, WorldIr, load_bundle,
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
pub mod countdowns;
pub mod debug_overlay;
pub mod emissive_postprocess;
pub mod environment;
pub mod first_person;
pub mod game_flow;
pub mod gizmo_geometry;
pub mod height_fog_postprocess;
pub mod gltf_scene_handles;
pub mod input;
pub mod interactions;
pub mod input_ui_polish;
pub mod kinematic_mover;
pub mod map_world;
pub mod mesh_bounds;
pub mod motion_blur_postprocess;
pub mod navigation;
pub mod native_volumetric;
pub mod overlay;
pub mod overlay_host;
pub mod patrol;
pub mod native_ssr;
pub mod path_sampling;
pub mod performance_metrics;
pub mod presentation;
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
pub mod scene_ray_query;
pub mod scripting_host_matrix;
pub mod sequences;
pub mod spawner;
pub mod ssgi_postprocess;
pub mod stylized_nature;
pub mod systems_context;
pub mod systems_effects;
pub mod systems_host;
pub mod state_machines;
mod systems_host_bridge;
pub mod systems_services;
pub mod trace_report;
pub mod transform_interpolation;
pub mod ui;
pub mod ui_debug;
pub mod ui_persistence_settings_facades;
pub mod walkability;
pub mod world_mapping;
pub mod world_text;

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

fn reset_native_ambient_baseline(world: &mut World) {
    world.insert_resource(AmbientLight {
        color: Color::WHITE,
        brightness: 0.0,
    });
}

#[derive(Clone, Debug, Default)]
pub struct RuntimeOptions {
    pub proof_harness: Option<proof_harness::NativeProofHarnessOptions>,
}

pub fn app_from_bundle_with_options(
    bundle_path: impl AsRef<Path>,
    options: RuntimeOptions,
) -> Result<App, RuntimeError> {
    let proof_harness_requested = options.proof_harness.is_some();
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
    if proof_harness_requested {
        if let Err(diagnostics) = overlay_host::create_native_overlay_host_plan(
            bundle.overlays.as_ref(),
            &bundle.bundle_path,
        ) {
            let diagnostic = &diagnostics[0];
            return Err(RuntimeError::SceneReadiness(format!(
                "{}: {} Rebuild threenative_runtime with --features native-webview.",
                diagnostic.code, diagnostic.message
            )));
        }
    }
    #[cfg(feature = "native-webview")]
    let native_overlay_init_error = match overlay_host::create_native_overlay_host_plan(
        bundle.overlays.as_ref(),
        &bundle.bundle_path,
    ) {
        Ok(Some(_)) => overlay_host::initialize_native_webview_backend().err(),
        Ok(None) | Err(_) => None,
    };
    let mut app = App::new();
    app.insert_resource(ClearColor(default_clear_color_for_bundle(&bundle)))
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
    app.add_plugins((
        native_ssr::NativeSsrCompatibilityPlugin,
        native_volumetric::NativeVolumetricCompatibilityPlugin,
        emissive_postprocess::NativeEmissivePostProcessPlugin,
        height_fog_postprocess::NativeHeightFogPostProcessPlugin,
        ssgi_postprocess::NativeSsgiPostProcessPlugin,
        motion_blur_postprocess::NativeTemporalMotionBlurPlugin,
        rendering::contact_shadows::NativeContactShadowPlugin,
        map_world::NativeEquirectSkyMaterialPlugin,
        map_world::NativePortableShaderMaterialPlugin,
    ));
    // DefaultPlugins installs Bevy's physical-unit ambient default (80.0).
    // ThreeNative owns ambient lighting through authored lights, atmosphere,
    // environment maps, and baked probes, so start those adapters from a
    // neutral baseline instead of conditionally inheriting Bevy's default.
    reset_native_ambient_baseline(app.world_mut());
    rendering::apply_atmosphere_to_world(app.world_mut(), &bundle);
    let environment_lighting =
        rendering::apply_environment_lighting_to_world(app.world_mut(), &bundle);
    for diagnostic in environment_lighting.diagnostics {
        warn!("{diagnostic}");
    }
    map_world::map_bundle_into_world(app.world_mut(), &bundle)?;
    app.insert_resource(scene_ray_query::NativeSceneRayQuery::from_bundle(&bundle));
    sync_default_camera_clear_color(app.world_mut());
    environment::map_environment_into_world(app.world_mut(), &bundle);
    for diagnostic in audio::spawn_startup_audio(app.world_mut(), &bundle) {
        warn!("{}", diagnostic.message);
    }
    app.insert_resource(audio::NativeAudioRuntime::from_bundle(&bundle));
    app.init_resource::<audio::NativeAudioServiceQueue>();
    let mut audio_events = audio::NativeAudioEventQueue::default();
    let mut audio_event_cursors = audio::NativeAudioEventCursors::default();
    audio::queue_new_native_audio_events(
        &mut audio_events,
        &mut audio_event_cursors,
        &bundle.world.events,
    );
    app.insert_resource(audio_events);
    app.insert_resource(audio_event_cursors);
    app.init_resource::<audio::NativeAudioPlaybackStates>();
    app.init_resource::<audio::NativeAudioDiagnostics>();
    if let Some(ui) = bundle.ui.as_ref() {
        ui::map_ui_into_world(app.world_mut(), ui)?;
        if let Some(diagnostic) = ui::diagnose_native_ui_font_fallback(app.world()) {
            warn!(
                "{}: {} ({})",
                diagnostic.code, diagnostic.message, diagnostic.path
            );
        }
        let diagnostic = ui::diagnose_native_ui_scale_boundary(ui);
        warn!(
            "{}: {} ({})",
            diagnostic.code, diagnostic.message, diagnostic.path
        );
        if !ui::route_native_ui_to_active_scene_camera(app.world_mut()) {
            ui::install_native_ui_overlay_camera(app.world_mut());
        }
        app.init_resource::<ui::NativeUiActionQueue>();
        app.add_systems(
            Update,
            (
                ui::scroll_native_ui,
                ui::dispatch_native_ui_actions.before(run_scripted_runtime_systems),
            ),
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
                if let Some(overlays) = bundle.overlays.clone() {
                    app.insert_resource(overlay_host::NativeOverlayBridgeResource::new(
                        overlays,
                    ));
                }
                if let Some(error) = native_overlay_init_error.as_ref() {
                    warn!("TN_OVERLAY_NATIVE_INIT_FAILED: {error}");
                } else {
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
                warn!(
                    "{}: {} Rebuild threenative_runtime with --features native-webview.",
                    diagnostic.code, diagnostic.message
                );
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
        app.add_systems(
            PreUpdate,
            (
                input::apply_native_pointer_delta_cursor_policy,
                input::capture_native_input,
            )
                .chain(),
        );
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
        ),
    );
    if has_scripts {
        app.insert_resource(systems_host::NativeResourceObservationState {
            declared: systems_host::native_declared_system_resources(&bundle),
            observations: Vec::new(),
        });
        app.init_resource::<systems_host::NativeRuntimeWriteAuditState>();
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.init_resource::<NativeRuntimeDirtyState>();
        app.insert_non_send_resource(ScriptedRuntimeMainThread);
        app.insert_resource(systems_host::NativeGameLoopState::new(initially_paused));
        app.init_resource::<map_world::NativeAnimationServiceQueue>();
        app.add_systems(
            Update,
            (
                run_scripted_runtime_systems,
                audio::play_new_native_audio_events,
                audio::apply_native_audio_service_effects,
                audio::apply_native_audio_controls,
                reconcile_scripted_runtime_world,
                map_world::apply_native_animation_service_effects,
                cameras::update_native_camera_helpers,
            )
                .chain(),
        );
    } else {
        app.add_systems(
            Update,
            (
                audio::play_new_native_audio_events,
                audio::apply_native_audio_controls,
                cameras::update_native_camera_helpers,
            )
                .chain(),
        );
    }
    Ok(app)
}

pub fn default_clear_color_for_bundle(bundle: &LoadedBundle) -> Color {
    match bundle
        .runtime_config
        .as_ref()
        .and_then(|config| config.renderer.as_ref())
        .and_then(|renderer| renderer.render_look.as_ref())
        .map(|render_look| render_look.profile.as_str())
    {
        Some("cinematic") => Color::srgb(143.0 / 255.0, 182.0 / 255.0, 216.0 / 255.0),
        Some("balanced" | "stylized") => Color::srgb(56.0 / 255.0, 189.0 / 255.0, 248.0 / 255.0),
        _ => Color::srgb(17.0 / 255.0, 19.0 / 255.0, 24.0 / 255.0),
    }
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
pub struct ScriptedRuntimeBundle {
    pub(crate) bundle: LoadedBundle,
}

struct ScriptedRuntimeMainThread;

#[derive(Default, Resource)]
struct NativeRuntimeDirtyState {
    live_reconciliation: bool,
}

/// Forces scripted capture runs to advance by the authored fixed delta rather
/// than host wall-clock time. Native screenshot capture can otherwise run
/// faster or slower than browser capture and compare different animation
/// poses, invalidating motion-effect evidence.
#[derive(Default, Resource)]
pub struct NativeDeterministicCaptureClock;

#[derive(SystemParam)]
struct ScriptedRuntimeParams<'w> {
    runtime: Option<ResMut<'w, ScriptedRuntimeBundle>>,
    loop_state: Option<ResMut<'w, systems_host::NativeGameLoopState>>,
    overlay_bridge: Option<ResMut<'w, overlay_host::NativeOverlayBridgeResource>>,
    dirty_state: Option<ResMut<'w, NativeRuntimeDirtyState>>,
    deterministic_capture: Option<Res<'w, NativeDeterministicCaptureClock>>,
    write_audit: Option<ResMut<'w, systems_host::NativeRuntimeWriteAuditState>>,
    audio_queue: Option<ResMut<'w, audio::NativeAudioServiceQueue>>,
    audio_events: Option<ResMut<'w, audio::NativeAudioEventQueue>>,
    audio_event_cursors: Option<ResMut<'w, audio::NativeAudioEventCursors>>,
}

fn run_scripted_runtime_systems(
    mut commands: Commands,
    mut scripted: ScriptedRuntimeParams,
    _main_thread: NonSend<ScriptedRuntimeMainThread>,
    input: Option<Res<input::NativeInputState>>,
    proof_harness: Option<Res<proof_harness::NativeProofHarnessState>>,
    fast_forward: Option<Res<proof_harness::NativeProofHarnessFastForward>>,
    material_handles: Option<Res<map_world::NativeMaterialHandles>>,
    time: Res<Time>,
    mut transforms: Query<(&ThreeNativeId, &mut Transform)>,
    mut materials: Query<(&ThreeNativeId, &mut Handle<StandardMaterial>)>,
    mut text_nodes: Query<(&ThreeNativeId, &mut Text, Option<&world_text::NativeWorldText>)>,
    ui_binding_targets: Option<Res<ui::NativeUiBindingTargets>>,
    mut minimap_markers: Query<(
        &ui::NativeUiMinimapMarker,
        &mut Style,
        &mut BackgroundColor,
        &mut Visibility,
    )>,
    mut animation_queue: Option<ResMut<map_world::NativeAnimationServiceQueue>>,
    mut ui_action_queue: Option<ResMut<ui::NativeUiActionQueue>>,
    mut resource_observations: Option<ResMut<systems_host::NativeResourceObservationState>>,
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
    let delta = if proof_harness.is_some() || scripted.deterministic_capture.is_some() {
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
    let queued_ui_actions = ui_action_queue
        .as_deref_mut()
        .map(ui::drain_native_ui_action_ids)
        .unwrap_or_default();
    let input_snapshot = if queued_ui_actions.is_empty() {
        input.as_deref().cloned()
    } else if let Some(input) = input.as_deref() {
        Some(input.with_additional_actions(queued_ui_actions.iter().map(String::as_str)))
    } else {
        Some(input::NativeInputState::from_action_ids(
            queued_ui_actions.iter().map(String::as_str),
        ))
    };

    let audit_writes = proof_harness
        .as_deref()
        .is_some_and(proof_harness::NativeProofHarnessState::audit_writes);
    loop_state.write_audit_enabled = audit_writes;
    if !audit_writes {
        loop_state.write_ledger.reset();
    }
    if let Some(audit) = scripted.write_audit.as_deref_mut() {
        audit.enabled = audit_writes;
        if !audit_writes {
            audit.observations.clear();
            audit.diagnostics.clear();
        }
    }

    let mut requires_live_reconciliation = false;
    for _ in 0..frame_count {
        if let Some(bridge) = scripted.overlay_bridge.as_deref_mut() {
            bridge.bridge.drain_events_into(&mut runtime.bundle.world.events);
        }
        if let (Some(queue), Some(cursors)) = (
            scripted.audio_events.as_deref_mut(),
            scripted.audio_event_cursors.as_deref_mut(),
        ) {
            audio::queue_new_native_audio_events(
                queue,
                cursors,
                &runtime.bundle.world.events,
            );
        }
        let options = systems_host::NativeGameLoopRunOptions {
            delta,
            fixed_delta,
            input: input_snapshot.as_ref(),
            paused,
        };

        let run = systems_host::run_native_systems_frame_with_input(
            &mut runtime.bundle,
            &mut *loop_state,
            options,
            physics::step_bundle_physics_with_script_poses,
        );
        match run {
            Ok(run) => {
                if let Some(bridge) = scripted.overlay_bridge.as_deref_mut() {
                    let overlays = bridge.overlays.clone();
                    bridge.bridge.publish_world_events(&overlays, &run.emitted_events);
                }
                requires_live_reconciliation |= run.logs.iter().any(|log| {
                    log.entries
                        .iter()
                        .any(|entry| entry.reconciliation.is_some())
                });
                if let Some(observations) = resource_observations.as_deref_mut() {
                    observations.observations.extend(run.resource_observations);
                    let overflow = observations.observations.len().saturating_sub(200);
                    if overflow > 0 {
                        observations.observations.drain(0..overflow);
                    }
                }
                if audit_writes {
                    if let Some(audit) = scripted.write_audit.as_deref_mut() {
                        audit.enabled = true;
                        audit.observations = run.write_observations;
                        audit.diagnostics = run.write_diagnostics;
                    }
                } else if let Some(audit) = scripted.write_audit.as_deref_mut() {
                    audit.observations.clear();
                    audit.diagnostics.clear();
                }
                if let Some(queue) = animation_queue.as_deref_mut() {
                    map_world::queue_native_animation_service_effects(queue, &run.logs);
                }
                if let Some(queue) = scripted.audio_queue.as_deref_mut() {
                    audio::queue_native_audio_service_effects(queue, &run.logs);
                }
                if let (Some(queue), Some(cursors)) = (
                    scripted.audio_events.as_deref_mut(),
                    scripted.audio_event_cursors.as_deref_mut(),
                ) {
                    audio::queue_new_native_audio_events(queue, cursors, &run.emitted_events);
                }
            }
            Err(error) => {
                error!("{error}");
                return;
            }
        }
    }
    if let Some(dirty_state) = scripted.dirty_state.as_deref_mut() {
        dirty_state.live_reconciliation |= requires_live_reconciliation;
    }
    if fast_forward.is_some_and(|advance| advance.0 > 0) {
        commands.insert_resource(proof_harness::NativeProofHarnessFastForward::default());
    }

    let sync_loop_state = if proof_harness.is_some() {
        None
    } else {
        Some(&**loop_state)
    };
    let entities_by_id = runtime
        .bundle
        .world
        .entities
        .iter()
        .map(|entity| (entity.id.as_str(), entity))
        .collect::<HashMap<_, _>>();
    sync_scripted_transforms(
        &entities_by_id,
        sync_loop_state,
        fixed_delta,
        &mut transforms,
    );
    sync_scripted_materials(&entities_by_id, material_handles.as_deref(), &mut materials);
    sync_scripted_ui_text(
        &runtime.bundle,
        &entities_by_id,
        ui_binding_targets.as_deref(),
        &mut text_nodes,
    );
    world_text::sync_native_world_text(&runtime.bundle, &mut text_nodes);
    ui::sync_native_minimap_markers(&runtime.bundle, &mut minimap_markers);
}

fn reconcile_scripted_runtime_world(world: &mut World) {
    let Some(_) = world.get_resource::<ScriptedRuntimeBundle>() else {
        return;
    };
    let should_reconcile = world
        .get_resource::<NativeRuntimeDirtyState>()
        .is_none_or(|dirty| dirty.live_reconciliation);
    if !should_reconcile {
        return;
    }
    let result = world.resource_scope(|world, runtime: Mut<ScriptedRuntimeBundle>| {
        reconcile_live_world_entities(world, &runtime.bundle)
    });
    if let Some(mut dirty) = world.get_resource_mut::<NativeRuntimeDirtyState>() {
        dirty.live_reconciliation = false;
    }
    if let Err(error) = result {
        error!("TN_BEVY_LIVE_RECONCILIATION_FAILED: {error}");
    }
}

fn reconcile_live_world_entities(
    world: &mut World,
    bundle: &LoadedBundle,
) -> Result<(), map_world::MapError> {
    let atmosphere_changed = world
        .get_resource::<rendering::NativeAtmosphereSignature>()
        .is_none_or(|signature| signature.0 != rendering::native_atmosphere_signature(bundle));
    if atmosphere_changed {
        rendering::apply_atmosphere_to_world(world, bundle);
    }
    let desired_ids = bundle
        .world
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .collect::<BTreeSet<_>>();
    let previous_ids = world
        .get_resource::<map_world::NativeMappedWorldEntityIds>()
        .map(|ids| ids.0.clone())
        .unwrap_or_default();
    let previous_signatures = world
        .get_resource::<map_world::NativeMappedWorldEntitySignatures>()
        .map(|signatures| signatures.0.clone())
        .unwrap_or_default();
    let desired_signatures = bundle
        .world
        .entities
        .iter()
        .map(|entity| {
            (
                entity.id.clone(),
                map_world::native_engine_component_signature(entity),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut live_by_id = live_world_entities_by_id(world);

    for removed_id in previous_ids.difference(&desired_ids) {
        if let Some(entity) = live_by_id.remove(removed_id.as_str()) {
            world.entity_mut(entity).despawn_recursive();
        }
    }
    for changed_id in previous_ids.intersection(&desired_ids) {
        if previous_signatures.get(changed_id) == desired_signatures.get(changed_id) {
            continue;
        }
        if let Some(entity) = live_by_id.remove(changed_id.as_str()) {
            world.entity_mut(entity).despawn_recursive();
        }
    }

    let mut material_handles = world
        .remove_resource::<map_world::NativeMaterialHandles>()
        .unwrap_or_default();
    let mut shader_material_handles = world
        .remove_resource::<map_world::NativeShaderMaterialHandles>()
        .unwrap_or_default();
    {
        let spawn_context = map_world::prepare_world_entity_spawn_context(world, bundle);
        for entity in &bundle.world.entities {
            if live_by_id.contains_key(entity.id.as_str()) {
                continue;
            }
            let bevy_entity = map_world::spawn_world_entity(
                world,
                entity,
                &spawn_context,
                &mut material_handles,
                &mut shader_material_handles,
                bundle,
            )?;
            live_by_id.insert(entity.id.clone(), bevy_entity);
        }
    }
    world.insert_resource(material_handles);
    world.insert_resource(shader_material_handles);

    let live_by_id = live_world_entities_by_id(world);
    let hierarchy_entities = desired_ids
        .iter()
        .filter_map(|id| live_by_id.get(id).map(|entity| (id.as_str(), *entity)))
        .collect::<HashMap<_, _>>();
    world_mapping::attach_entity_hierarchy(world, bundle, &hierarchy_entities);
    rendering::contact_shadows::refresh_native_contact_shadow_pipelines(world);
    world.insert_resource(map_world::NativeMappedWorldEntityIds(desired_ids));
    world.insert_resource(map_world::NativeMappedWorldEntitySignatures(
        desired_signatures,
    ));
    Ok(())
}

fn live_world_entities_by_id(world: &mut World) -> HashMap<String, Entity> {
    let mut query = world.query::<(Entity, &ThreeNativeId)>();
    query
        .iter(world)
        .map(|(entity, stable_id)| (stable_id.0.clone(), entity))
        .collect()
}

fn sync_scripted_transforms(
    entities_by_id: &HashMap<&str, &WorldEntity>,
    loop_state: Option<&systems_host::NativeGameLoopState>,
    fixed_delta: f32,
    transforms: &mut Query<(&ThreeNativeId, &mut Transform)>,
) {
    let interpolation_alpha = if fixed_delta > 0.0 {
        loop_state.map(|state| (state.accumulator / fixed_delta).clamp(0.0, 1.0))
    } else {
        None
    };
    for (stable_id, mut target) in transforms.iter_mut() {
        let Some(source) = entities_by_id
            .get(stable_id.0.as_str())
            .and_then(|entity| entity.components.transform.as_ref())
        else {
            continue;
        };
        if let (Some(state), Some(alpha)) = (loop_state, interpolation_alpha)
            && state.fixed_transform_entities.contains(&stable_id.0)
            && let (Some(previous), Some(current)) = (
                state.fixed_transform_previous.get(&stable_id.0),
                state.fixed_transform_current.get(&stable_id.0),
            )
        {
            let interpolated =
                transform_interpolation::interpolate_transform(*previous, *current, alpha);
            let mut next = (*target).clone();
            apply_transform_sample(&mut next, interpolated);
            if *target != next {
                *target = next;
            }
        } else {
            let mut next = (*target).clone();
            apply_transform_component(&mut next, source);
            if *target != next {
                *target = next;
            }
        }
    }
}

fn sync_scripted_materials(
    entities_by_id: &HashMap<&str, &WorldEntity>,
    material_handles: Option<&map_world::NativeMaterialHandles>,
    materials: &mut Query<(&ThreeNativeId, &mut Handle<StandardMaterial>)>,
) {
    let Some(material_handles) = material_handles else {
        return;
    };
    for (stable_id, mut target) in materials.iter_mut() {
        let Some(source) = entities_by_id
            .get(stable_id.0.as_str())
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
        if *target != *material {
            *target = material.clone();
        }
    }
}

fn sync_scripted_ui_text(
    bundle: &LoadedBundle,
    entities_by_id: &HashMap<&str, &WorldEntity>,
    targets: Option<&ui::NativeUiBindingTargets>,
    text_nodes: &mut Query<(&ThreeNativeId, &mut Text, Option<&world_text::NativeWorldText>)>,
) {
    let Some(targets) = targets else {
        return;
    };
    let component_entities = targets.has_component_bindings().then_some(entities_by_id);
    for (stable_id, mut text, _) in text_nodes.iter_mut() {
        let Some(binding) = targets.binding_for(&stable_id.0) else {
            continue;
        };
        let Some(value) = resolve_ui_binding(bundle, binding, component_entities) else {
            continue;
        };
        let rendered = value_to_ui_text(&value);
        if let Some(section) = text.sections.first_mut() {
            if section.value != rendered {
                section.value = rendered;
            }
        }
    }
}

fn resolve_ui_binding<'a>(
    bundle: &'a LoadedBundle,
    binding: &UiBindingIr,
    component_entities: Option<&HashMap<&'a str, &'a WorldEntity>>,
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
            let entity = component_entities
                .and_then(|entities| entities.get(entity.as_str()).copied())
                .or_else(|| bundle.world.entities.iter().find(|item| item.id == *entity))?;
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

fn apply_transform_sample(
    target: &mut Transform,
    source: transform_interpolation::TransformSample,
) {
    target.translation = Vec3::new(source.position[0], source.position[1], source.position[2]);
    target.rotation = Quat::from_xyzw(
        source.rotation[0],
        source.rotation[1],
        source.rotation[2],
        source.rotation[3],
    );
    target.scale = Vec3::new(source.scale[0], source.scale[1], source.scale[2]);
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path, time::Duration};

    use threenative_loader::load_bundle;

    use super::*;

    #[test]
    fn should_apply_baked_sh_probe_without_bevy_default_ambient() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/baked-probe-alcove-test/game.bundle");
        let bundle = load_bundle(root).expect("baked probe fixture should load");
        let mut world = World::new();
        world.insert_resource(AmbientLight {
            color: Color::WHITE,
            brightness: 80.0,
        });

        reset_native_ambient_baseline(&mut world);
        rendering::apply_environment_lighting_to_world(&mut world, &bundle);
        map_world::map_bundle_into_world(&mut world, &bundle).expect("fixture should map");
        let ambient = world.resource::<AmbientLight>();
        let baked_probe_baseline = 0.12 * 0.282095 * 4.2;
        assert!((ambient.brightness - (0.25 + baked_probe_baseline)).abs() < 0.0001);
        assert_eq!(
            world
                .query::<&bevy::pbr::irradiance_volume::IrradianceVolume>()
                .iter(&world)
                .count(),
            1,
            "baked SH2 must map to bounded directional lighting instead of global ambient"
        );
    }

    #[test]
    fn lumen_showcase_should_keep_atmosphere_baseline_with_directional_probe() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/lumen-lite-showcase/game.bundle");
        let bundle = load_bundle(root).expect("lumen showcase fixture should load");
        let mut world = World::new();
        reset_native_ambient_baseline(&mut world);
        rendering::apply_atmosphere_to_world(&mut world, &bundle);
        rendering::apply_environment_lighting_to_world(&mut world, &bundle);
        let ambient = world.resource::<AmbientLight>();
        assert!(ambient.brightness > 0.7, "hero room must retain its calibrated indirect-light floor");
        assert_eq!(
            world
                .iter_entities()
                .filter(|entity| entity.contains::<bevy::pbr::irradiance_volume::IrradianceVolume>())
                .count(),
            0,
            "Bevy 0.14 deferred lighting cannot compile its irradiance-volume shader path",
        );
    }

    #[test]
    fn live_reconciliation_should_apply_atmosphere_only_volumetric_changes() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/volumetrics/game.bundle");
        let mut bundle = load_bundle(&root).expect("volumetrics fixture should load");
        let mut world = World::new();
        rendering::apply_atmosphere_to_world(&mut world, &bundle);
        map_world::map_bundle_into_world(&mut world, &bundle).expect("fixture should map");
        assert_eq!(
            world
                .query::<&bevy::pbr::VolumetricFogSettings>()
                .iter(&world)
                .count(),
            1
        );

        bundle
            .environment_scene
            .as_mut()
            .and_then(|scene| scene.atmosphere.as_mut())
            .expect("atmosphere should exist")
            .volumetrics = None;
        reconcile_live_world_entities(&mut world, &bundle).expect("live reconcile should succeed");

        assert_eq!(
            world
                .query::<&bevy::pbr::VolumetricFogSettings>()
                .iter(&world)
                .count(),
            0
        );
        assert_eq!(
            world
                .query::<&bevy::pbr::VolumetricLight>()
                .iter(&world)
                .count(),
            0
        );
    }

    #[test]
    fn interaction_despawn_should_reconcile_live_ecs_entity_ids() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/physics-events/game.bundle");
        let mut bundle = load_bundle(&root).expect("interaction fixture should load");
        bundle.interactions = Some(threenative_loader::InteractionsIr {
            schema: "threenative.interactions".into(), version: "0.1.0".into(), id: "live".into(),
            interactions: vec![threenative_loader::InteractionIr { id: "pickup".into(), detector: serde_json::json!({ "kind": "distance2d", "radius": 1, "source": { "entity": "sensor" }, "target": { "entity": "pickup" } }), gate: serde_json::json!({ "kind": "once" }), when: vec![], effects: vec![serde_json::json!({ "kind": "despawn", "target": "detected" })], complete: None }],
        });
        let mut world = World::new();
        map_world::map_bundle_into_world(&mut world, &bundle).expect("fixture should map");
        assert!(world.resource::<map_world::NativeMappedWorldEntityIds>().0.contains("pickup"));
        interactions::step_bundle_interactions(&mut bundle, 0, &[], &mut interactions::NativeInteractionRuntimeState::default(), None, None);
        reconcile_live_world_entities(&mut world, &bundle).expect("interaction live reconcile should succeed");
        assert!(!world.resource::<map_world::NativeMappedWorldEntityIds>().0.contains("pickup"));
    }

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

    #[test]
    fn scripted_runtime_should_interpolate_fixed_transform_visuals() {
        let root = write_transform_runtime_bundle("bevy-transform-interpolation", false);
        let mut app = scripted_transform_runtime_app(&root);

        advance_app(&mut app, 0.25);
        {
            let runtime = app.world().resource::<ScriptedRuntimeBundle>();
            assert_eq!(
                runtime
                    .bundle
                    .world
                    .entities
                    .iter()
                    .find(|entity| entity.id == "mover")
                    .and_then(|entity| entity.components.transform.as_ref())
                    .and_then(|transform| transform.position),
                Some([10.0, 0.0, 0.0])
            );
        }
        assert_eq!(mover_translation(&mut app), Vec3::new(0.0, 0.0, 0.0));

        advance_app(&mut app, 0.125);

        assert_eq!(mover_translation(&mut app), Vec3::new(5.0, 0.0, 0.0));
    }

    #[test]
    fn scripted_runtime_should_keep_update_transform_visuals_authoritative() {
        let root = write_transform_runtime_bundle("bevy-transform-update-authority", true);
        let mut app = scripted_transform_runtime_app(&root);

        advance_app(&mut app, 0.25);

        assert_eq!(mover_translation(&mut app), Vec3::new(20.0, 0.0, 0.0));
    }

    #[test]
    fn scripted_runtime_should_drain_native_ui_actions_into_input_snapshot() {
        let root = write_scripted_runtime_bundle("bevy-ui-action-input", 0.1);
        let mut app = scripted_runtime_app(&root);
        app.insert_resource(ui::NativeUiActionQueue {
            events: vec![ui::NativeUiActionEvent {
                action: "Jump".to_owned(),
                node: "jump".to_owned(),
                value: None,
            }],
        });

        advance_app(&mut app, 0.1);

        let runtime = app.world().resource::<ScriptedRuntimeBundle>();
        assert_eq!(
            runtime
                .bundle
                .world
                .resources
                .get("LoopCounts")
                .and_then(|counts| counts.get("uiJump"))
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert!(
            app.world()
                .resource::<ui::NativeUiActionQueue>()
                .events
                .is_empty()
        );
    }

    #[test]
    fn scripted_runtime_should_sync_ui_text_from_cached_binding_targets() {
        let root = write_scripted_runtime_bundle("bevy-ui-binding-cache", 0.1);
        write_test_file(
            &root,
            "manifest.json",
            r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "scripted-runtime-test",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js", "ui": "ui.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "runtimeConfig": "runtime.config.json", "targetProfile": "target.profile.json" }
}"#,
        );
        write_test_file(
            &root,
            "ui.ir.json",
            r#"{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "root": {
    "id": "root",
    "kind": "column",
    "children": [
      {
        "id": "score",
        "kind": "text",
        "text": "Score 0",
        "binding": { "kind": "resource", "name": "LoopCounts", "field": "update" }
      }
    ]
  }
}"#,
        );
        let mut app = scripted_runtime_app(&root);
        let targets = {
            let runtime = app.world().resource::<ScriptedRuntimeBundle>();
            ui::build_native_ui_binding_targets(
                runtime
                    .bundle
                    .ui
                    .as_ref()
                    .expect("test bundle should include UI"),
            )
        };
        assert_eq!(targets.len(), 1);
        app.insert_resource(targets);
        app.world_mut().spawn((
            ThreeNativeId("score".to_owned()),
            Text::from_section("stale", TextStyle::default()),
        ));

        advance_app(&mut app, 0.1);

        let mut query = app.world_mut().query::<(&ThreeNativeId, &Text)>();
        let rendered = query
            .iter(app.world())
            .find_map(|(id, text)| (id.0 == "score").then(|| text.sections[0].value.clone()))
            .expect("score text should exist");
        assert_eq!(rendered, "1");
    }

    #[test]
    fn scripted_runtime_should_reconcile_spawned_world_entities_and_hierarchy() {
        let root = write_live_reconciliation_bundle(
            "bevy-live-spawn-hierarchy",
            r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [],
  "resources": { "SpawnState": { "done": false } }
}"#,
            r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "spawnPair",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [
        { "kind": "spawn", "entity": "runtime.parent", "components": ["Transform"] },
        { "kind": "spawn", "entity": "runtime.child", "components": ["Transform", "Hierarchy"] }
      ],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["SpawnState"],
      "resourceWrites": ["SpawnState"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_spawnPair" }
    }
  ]
}"#,
            r#"const system_spawnPair = (ctx) => {
  const state = ctx.resources.get("SpawnState");
  if (state.done) return;
  ctx.commands.spawn("runtime.parent", { Transform: { position: [1, 2, 3] } });
  ctx.commands.spawn("runtime.child", {
    Transform: { position: [4, 5, 6] },
    Hierarchy: { parent: "runtime.parent" }
  });
  ctx.resources.set("SpawnState", { done: true });
};
export const systemIds = Object.freeze({ "system_spawnPair": "spawnPair" });
export const systems = Object.freeze({ "system_spawnPair": system_spawnPair });
"#,
        );
        let mut app = scripted_runtime_app(&root);

        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);

        let mut query = app
            .world_mut()
            .query::<(Entity, &ThreeNativeId, &Transform, Option<&Parent>)>();
        let entities = query
            .iter(app.world())
            .map(|(entity, id, transform, parent)| {
                (
                    id.0.clone(),
                    (entity, transform.translation, parent.map(Parent::get)),
                )
            })
            .collect::<HashMap<_, _>>();
        let parent = entities
            .get("runtime.parent")
            .expect("parent should be reconciled into the live world");
        let child = entities
            .get("runtime.child")
            .expect("child should be reconciled into the live world");
        assert_eq!(parent.1, Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(child.1, Vec3::new(4.0, 5.0, 6.0));
        assert_eq!(child.2, Some(parent.0));
        assert_eq!(entities.len(), 2);
    }

    #[test]
    fn scripted_runtime_should_reconcile_despawned_world_entities() {
        let root = write_live_reconciliation_bundle(
            "bevy-live-despawn",
            r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "runtime.marker", "components": { "Transform": { "position": [0, 0, 0] } } }
  ],
  "resources": { "DespawnState": { "done": false } }
}"#,
            r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "removeMarker",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [
        { "kind": "despawn", "entity": "runtime.marker" }
      ],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["DespawnState"],
      "resourceWrites": ["DespawnState"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_removeMarker" }
    }
  ]
}"#,
            r#"const system_removeMarker = (ctx) => {
  const state = ctx.resources.get("DespawnState");
  if (state.done) return;
  ctx.commands.despawn("runtime.marker");
  ctx.resources.set("DespawnState", { done: true });
};
export const systemIds = Object.freeze({ "system_removeMarker": "removeMarker" });
export const systems = Object.freeze({ "system_removeMarker": system_removeMarker });
"#,
        );
        let mut app = scripted_mapped_runtime_app(&root);

        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);

        let mut query = app.world_mut().query::<&ThreeNativeId>();
        assert!(
            query
                .iter(app.world())
                .all(|id| id.0.as_str() != "runtime.marker")
        );
    }

    #[test]
    fn scripted_runtime_should_remove_despawned_collider_contact_sources() {
        let root = write_live_reconciliation_bundle(
            "bevy-live-despawn-collider",
            r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "runtime.collider",
      "components": {
        "Transform": { "position": [0, 0, 0] },
        "Collider": { "kind": "box", "size": [1, 1, 1], "layer": "world" }
      }
    }
  ],
  "resources": { "DespawnState": { "done": false } }
}"#,
            r#"{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": [
    {
      "name": "removeCollider",
      "schedule": "update",
      "reads": [],
      "writes": [],
      "queries": [],
      "commands": [
        { "kind": "despawn", "entity": "runtime.collider" }
      ],
      "eventReads": [],
      "eventWrites": [],
      "resourceReads": ["DespawnState"],
      "resourceWrites": ["DespawnState"],
      "services": [],
      "script": { "bundle": "scripts.bundle.js", "exportName": "system_removeCollider" }
    }
  ]
}"#,
            r#"const system_removeCollider = (ctx) => {
  const state = ctx.resources.get("DespawnState");
  if (state.done) return;
  ctx.commands.despawn("runtime.collider");
  ctx.resources.set("DespawnState", { done: true });
};
export const systemIds = Object.freeze({ "system_removeCollider": "removeCollider" });
export const systems = Object.freeze({ "system_removeCollider": system_removeCollider });
"#,
        );
        let mut app = scripted_mapped_runtime_app(&root);

        advance_app(&mut app, 0.1);
        advance_app(&mut app, 0.1);

        let mut query = app.world_mut().query::<&ThreeNativeId>();
        assert!(
            query
                .iter(app.world())
                .all(|id| id.0.as_str() != "runtime.collider")
        );

        let runtime = app.world().resource::<ScriptedRuntimeBundle>();
        assert!(
            runtime
                .bundle
                .world
                .entities
                .iter()
                .all(|entity| entity.id != "runtime.collider")
        );
    }

    fn scripted_runtime_app(root: &Path) -> App {
        let bundle = load_bundle(root).expect("scripted test bundle should load");
        let mut app = App::new();
        app.insert_resource(Time::<()>::default());
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.init_resource::<NativeRuntimeDirtyState>();
        app.insert_non_send_resource(ScriptedRuntimeMainThread);
        app.insert_resource(systems_host::NativeGameLoopState::default());
        app.add_systems(
            Update,
            (
                run_scripted_runtime_systems,
                reconcile_scripted_runtime_world,
            )
                .chain(),
        );
        app
    }

    fn scripted_mapped_runtime_app(root: &Path) -> App {
        let bundle = load_bundle(root).expect("scripted test bundle should load");
        let mut app = App::new();
        app.insert_resource(Time::<()>::default());
        map_world::map_bundle_into_world(app.world_mut(), &bundle)
            .expect("test bundle should map into the live world");
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.init_resource::<NativeRuntimeDirtyState>();
        app.insert_non_send_resource(ScriptedRuntimeMainThread);
        app.insert_resource(systems_host::NativeGameLoopState::default());
        app.add_systems(
            Update,
            (
                run_scripted_runtime_systems,
                reconcile_scripted_runtime_world,
            )
                .chain(),
        );
        app
    }

    fn scripted_transform_runtime_app(root: &Path) -> App {
        let bundle = load_bundle(root).expect("scripted test bundle should load");
        let mut app = App::new();
        app.insert_resource(Time::<()>::default());
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.insert_non_send_resource(ScriptedRuntimeMainThread);
        app.insert_resource(systems_host::NativeGameLoopState::default());
        app.world_mut().spawn((
            ThreeNativeId("mover".to_owned()),
            Transform::from_xyz(0.0, 0.0, 0.0),
        ));
        app.add_systems(
            Update,
            (
                run_scripted_runtime_systems,
                reconcile_scripted_runtime_world,
            )
                .chain(),
        );
        app
    }

    fn advance_app(app: &mut App, seconds: f32) {
        app.world_mut()
            .resource_mut::<Time<()>>()
            .advance_by(Duration::from_secs_f32(seconds));
        app.update();
    }

    fn mover_translation(app: &mut App) -> Vec3 {
        let mut query = app.world_mut().query::<(&ThreeNativeId, &Transform)>();
        query
            .iter(app.world())
            .find_map(|(id, transform)| (id.0 == "mover").then_some(transform.translation))
            .expect("mover entity should exist")
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
const system_update = (ctx) => {
  bump(ctx, "update");
  if (ctx.input.action("Jump")) {
    const counts = ctx.resources.get("LoopCounts");
    counts.uiJump = true;
    ctx.resources.set("LoopCounts", counts);
  }
};
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

    fn write_transform_runtime_bundle(name: &str, update_transform: bool) -> std::path::PathBuf {
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
  "name": "scripted-transform-runtime-test",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "runtimeConfig": "runtime.config.json", "targetProfile": "target.profile.json" }
}"#,
        );
        write_test_file(
            &root,
            "runtime.config.json",
            r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "time": { "fixedDelta": 0.25, "paused": false },
  "window": { "width": 1280, "height": 720 }
}"#,
        );
        write_test_file(
            &root,
            "world.ir.json",
            r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    { "id": "mover", "components": { "Transform": { "position": [0, 0, 0] } } }
  ],
  "resources": {}
}"#,
        );
        let systems = if update_transform {
            r#"[
    { "name": "tick", "schedule": "fixedUpdate", "reads": [], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" } },
    { "name": "update", "schedule": "update", "reads": [], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_update" } }
  ]"#
        } else {
            r#"[
    { "name": "tick", "schedule": "fixedUpdate", "reads": [], "writes": ["Transform"], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_tick" } },
    { "name": "update", "schedule": "update", "reads": [], "writes": [], "queries": [], "commands": [], "eventReads": [], "eventWrites": [], "resourceReads": [], "resourceWrites": [], "services": [], "script": { "bundle": "scripts.bundle.js", "exportName": "system_noop" } }
  ]"#
        };
        write_test_file(
            &root,
            "systems.ir.json",
            &format!(
                r#"{{
  "schema": "threenative.systems",
  "version": "0.1.0",
  "systems": {systems}
}}"#
            ),
        );
        let update_body = if update_transform {
            r#"const system_update = (ctx) => ctx.entity("mover").transform().setPosition([20, 0, 0]);"#
        } else {
            r#"const system_update = system_noop;"#
        };
        write_test_file(
            &root,
            "scripts.bundle.js",
            &format!(
                r#"const system_tick = (ctx) => {{
  const transform = ctx.entity("mover").transform();
  const position = transform.positionOr([0, 0, 0]);
  transform.setPosition([position[0] + 10, position[1], position[2]]);
}};
const system_noop = () => undefined;
{update_body}
export const systemIds = Object.freeze({{ "system_tick": "tick", "system_update": "update", "system_noop": "update" }});
export const systems = Object.freeze({{ "system_tick": system_tick, "system_update": system_update, "system_noop": system_noop }});
"#
            ),
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

    fn write_live_reconciliation_bundle(
        name: &str,
        world: &str,
        systems: &str,
        scripts: &str,
    ) -> std::path::PathBuf {
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
  "name": "scripted-live-reconciliation-test",
  "requiredCapabilities": {},
  "entry": { "world": "world.ir.json", "systems": "systems.ir.json", "scripts": "scripts.bundle.js" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "runtimeConfig": "runtime.config.json", "targetProfile": "target.profile.json" }
}"#,
        );
        write_test_file(
            &root,
            "runtime.config.json",
            r#"{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "time": { "fixedDelta": 0.1, "paused": false },
  "window": { "width": 1280, "height": 720 }
}"#,
        );
        write_test_file(&root, "world.ir.json", world);
        write_test_file(&root, "systems.ir.json", systems);
        write_test_file(&root, "scripts.bundle.js", scripts);
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
