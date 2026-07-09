use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
    time::{Duration, Instant},
};

use bevy::{
    app::ScheduleRunnerPlugin,
    asset::LoadState,
    input::ButtonInput,
    prelude::*,
    render::view::screenshot::ScreenshotManager,
    ui::{IsDefaultUiCamera, TargetCamera},
    window::{PrimaryWindow, RequestRedraw},
    winit::{UpdateMode, WinitSettings},
};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{AssetsManifest, LoadedBundle, TransformComponent};

use crate::{
    assets::{NativeRuntimeProbeObservations, native_runtime_probe_observations},
    input::portable_key_code,
    systems_host::NativeResourceObservationState,
};

const MIN_PROOF_SCREENSHOT_BYTES: u64 = 1024;
const MIN_PROOF_SCREENSHOT_PEAK_LUMA: u8 = 16;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeProofHarnessCommandStream {
    pub schema: String,
    pub version: String,
    #[serde(default)]
    pub commands: Vec<NativeProofHarnessCommand>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct NativeProofHarnessCommand {
    pub tick: u64,
    #[serde(flatten)]
    pub action: NativeProofHarnessAction,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NativeProofHarnessAction {
    Key {
        code: String,
        pressed: bool,
    },
    SetTransform {
        entity: String,
        #[serde(default)]
        position: Option<[f32; 3]>,
        #[serde(default)]
        rotation: Option<[f32; 4]>,
        #[serde(default)]
        scale: Option<[f32; 3]>,
    },
    Advance {
        frames: u64,
    },
    Screenshot {
        path: String,
    },
    Exit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeProofHarnessOptions {
    pub command_stream_path: String,
    pub readiness_out_path: String,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeProofHarnessState {
    commands: Vec<NativeProofHarnessCommand>,
    held_keys: BTreeSet<KeyCode>,
    last_sample_at: Instant,
    readiness_directory_created: bool,
    readiness_out_path: String,
    started_at: Instant,
    tick: u64,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeProofHarnessRequiredModels(Vec<Handle<Scene>>);

#[derive(Clone, Debug, Default, Resource)]
pub struct NativeProofHarnessFastForward(pub u64);

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeProofHarnessReadiness {
    pub schema: &'static str,
    pub version: &'static str,
    pub ok: bool,
    pub tick: u64,
    pub diagnostics: Vec<NativeProofHarnessDiagnostic>,
    pub performance: NativeProofHarnessPerformanceSample,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<NativeResourceObservationState>,
    #[serde(
        rename = "resourceSnapshots",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub resource_snapshots: BTreeMap<String, serde_json::Value>,
    #[serde(rename = "runtimeObservations", skip_serializing_if = "Option::is_none")]
    pub runtime_observations: Option<NativeRuntimeProbeObservations>,
    pub transforms: Vec<NativeProofHarnessTransformSample>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeProofHarnessPerformanceSample {
    pub elapsed_ms: f64,
    pub fps: f64,
    pub frame_ms: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativeProofHarnessDiagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeProofHarnessTransformSample {
    pub entity: String,
    pub position: [f32; 3],
}

#[derive(Debug, Error)]
pub enum NativeProofHarnessError {
    #[error("failed to read native proof harness stream '{path}': {source}")]
    ReadStream {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse native proof harness stream '{path}': {source}")]
    ParseStream {
        path: String,
        #[source]
        source: serde_json::Error,
    },
    #[error("native proof harness stream '{path}' has unsupported schema '{schema}'")]
    UnsupportedSchema { path: String, schema: String },
    #[error("failed to write native proof harness readiness '{path}': {source}")]
    WriteReadiness {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to serialize native proof harness readiness '{path}': {source}")]
    SerializeReadiness {
        path: String,
        #[source]
        source: serde_json::Error,
    },
}

impl NativeProofHarnessState {
    pub fn from_stream(
        stream: NativeProofHarnessCommandStream,
        readiness_out_path: impl Into<String>,
    ) -> Self {
        Self {
            commands: stream.commands,
            held_keys: BTreeSet::new(),
            last_sample_at: Instant::now(),
            readiness_directory_created: false,
            readiness_out_path: readiness_out_path.into(),
            started_at: Instant::now(),
            tick: 0,
        }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    fn performance_sample(&mut self) -> NativeProofHarnessPerformanceSample {
        let now = Instant::now();
        let frame_ms = duration_ms(now.saturating_duration_since(self.last_sample_at));
        let elapsed_ms = duration_ms(now.saturating_duration_since(self.started_at));
        self.last_sample_at = now;
        NativeProofHarnessPerformanceSample {
            elapsed_ms,
            fps: if frame_ms <= 0.0 {
                0.0
            } else {
                1000.0 / frame_ms
            },
            frame_ms,
        }
    }
}

pub fn install_native_proof_harness(
    app: &mut App,
    options: NativeProofHarnessOptions,
    manifest: &AssetsManifest,
) -> Result<(), NativeProofHarnessError> {
    let stream = load_native_proof_harness_stream(&options.command_stream_path)?;
    let waits_for_render_assets = stream
        .commands
        .iter()
        .any(|command| matches!(command.action, NativeProofHarnessAction::Screenshot { .. }));
    let required_models = if waits_for_render_assets {
        app.world()
            .get_resource::<AssetServer>()
            .map(|asset_server| proof_harness_required_models(asset_server, manifest))
            .unwrap_or_else(|| NativeProofHarnessRequiredModels(Vec::new()))
    } else {
        NativeProofHarnessRequiredModels(Vec::new())
    };
    let update_mode = if waits_for_render_assets {
        UpdateMode::Continuous
    } else {
        UpdateMode::reactive(Duration::ZERO)
    };
    app.insert_resource(required_models)
        .insert_resource(NativeProofHarnessState::from_stream(
            stream,
            options.readiness_out_path,
        ))
        .init_resource::<NativeProofHarnessFastForward>()
        .insert_resource(WinitSettings {
            focused_mode: update_mode,
            unfocused_mode: update_mode,
        });
    if !waits_for_render_assets {
        app.add_plugins(ScheduleRunnerPlugin::run_loop(Duration::ZERO));
    }
    app.add_systems(
        PreUpdate,
        apply_native_proof_harness_commands.before(crate::input::capture_native_input),
    );
    app.add_systems(
        Update,
        write_native_proof_harness_post_runtime_sample.after(crate::run_scripted_runtime_systems),
    );
    if waits_for_render_assets {
        app.add_systems(Update, request_native_proof_redraw);
    }
    Ok(())
}

pub fn load_native_proof_harness_stream(
    path: impl AsRef<Path>,
) -> Result<NativeProofHarnessCommandStream, NativeProofHarnessError> {
    let path = path.as_ref();
    let path_label = path.display().to_string();
    let source =
        fs::read_to_string(path).map_err(|source| NativeProofHarnessError::ReadStream {
            path: path_label.clone(),
            source,
        })?;
    let stream: NativeProofHarnessCommandStream =
        serde_json::from_str(&source).map_err(|source| NativeProofHarnessError::ParseStream {
            path: path_label.clone(),
            source,
        })?;
    if stream.schema != "threenative.native-proof-harness" {
        return Err(NativeProofHarnessError::UnsupportedSchema {
            path: path_label,
            schema: stream.schema,
        });
    }
    Ok(stream)
}

pub fn apply_native_proof_harness_commands(
    mut commands: Commands,
    mut state: ResMut<NativeProofHarnessState>,
    mut keyboard: ResMut<ButtonInput<KeyCode>>,
    mut exit: EventWriter<AppExit>,
    windows: Query<Entity, With<PrimaryWindow>>,
    mut screenshots: Option<ResMut<ScreenshotManager>>,
    mut transforms: ParamSet<(
        Query<(&ThreeNativeId, &mut Transform)>,
        Query<(&ThreeNativeId, &Transform)>,
    )>,
    asset_server: Option<Res<AssetServer>>,
    required_models: Option<Res<NativeProofHarnessRequiredModels>>,
    mut runtime: Option<ResMut<crate::ScriptedRuntimeBundle>>,
    mut ui_cameras: Query<(Entity, &mut Camera), With<IsDefaultUiCamera>>,
    scene_cameras: Query<(Entity, &Camera), Without<IsDefaultUiCamera>>,
    root_ui_nodes: Query<Entity, (With<Node>, Without<Parent>)>,
    resource_observations: Option<Res<NativeResourceObservationState>>,
) {
    let tick = state.tick;
    let mut diagnostics = Vec::new();
    if !native_proof_harness_models_ready(asset_server.as_deref(), required_models.as_deref()) {
        let performance = state.performance_sample();
        write_native_proof_harness_sample(
            &mut state,
            tick,
            diagnostics,
            performance,
            transforms.p1().iter(),
            resource_observations.as_deref().cloned(),
            runtime
                .as_deref()
                .map(|runtime| native_resource_snapshots(&runtime.bundle))
                .unwrap_or_default(),
            runtime.as_deref().map(|runtime| {
                native_runtime_probe_observations(&runtime.bundle.assets, &runtime.bundle.materials)
            }),
        );
        return;
    }
    let harness_commands = state
        .commands
        .iter()
        .filter(|command| command.tick == tick)
        .cloned()
        .collect::<Vec<_>>();
    let mut hold_tick = false;
    let mut advance_ticks = 1;
    for command in harness_commands {
        match command.action {
            NativeProofHarnessAction::Key { code, pressed } => {
                if let Some(key_code) = portable_key_code(&code) {
                    if pressed {
                        state.held_keys.insert(key_code);
                    } else {
                        state.held_keys.remove(&key_code);
                        keyboard.release(key_code);
                    }
                } else {
                    diagnostics.push(NativeProofHarnessDiagnostic {
                        code: "TN_NATIVE_PROOF_INPUT_UNSUPPORTED".to_owned(),
                        message: format!("Keyboard code '{code}' is not portable."),
                        severity: "error".to_owned(),
                    });
                }
            }
            NativeProofHarnessAction::SetTransform {
                entity,
                position,
                rotation,
                scale,
            } => {
                let mut applied = false;
                for (id, mut transform) in transforms.p0().iter_mut() {
                    if id.0 == entity {
                        if let Some([x, y, z]) = position {
                            transform.translation = Vec3::new(x, y, z);
                        }
                        if let Some([x, y, z, w]) = rotation {
                            transform.rotation = Quat::from_xyzw(x, y, z, w);
                        }
                        if let Some([x, y, z]) = scale {
                            transform.scale = Vec3::new(x, y, z);
                        }
                        applied = true;
                        break;
                    }
                }
                if let Some(runtime) = runtime.as_deref_mut() {
                    applied = apply_bundle_transform_setup(
                        &mut runtime.bundle,
                        &entity,
                        position,
                        rotation,
                        scale,
                    ) || applied;
                }
                if !applied {
                    diagnostics.push(NativeProofHarnessDiagnostic {
                        code: "TN_NATIVE_PROOF_SETUP_ENTITY_NOT_FOUND".to_owned(),
                        message: format!(
                            "Native proof harness could not apply Transform override for entity '{entity}'."
                        ),
                        severity: "error".to_owned(),
                    });
                }
            }
            NativeProofHarnessAction::Advance { frames } => {
                advance_ticks = advance_ticks.max(frames.max(1));
                commands.insert_resource(NativeProofHarnessFastForward(frames.max(1)));
            }
            NativeProofHarnessAction::Screenshot { path } => {
                route_proof_ui_to_scene_camera(
                    &mut commands,
                    &mut ui_cameras,
                    &scene_cameras,
                    &root_ui_nodes,
                );
                match request_native_proof_screenshot(&path, &windows, screenshots.as_deref_mut()) {
                    Ok(()) => {}
                    Err(message) => diagnostics.push(NativeProofHarnessDiagnostic {
                        code: "TN_NATIVE_PROOF_SCREENSHOT_FAILED".to_owned(),
                        message,
                        severity: "warning".to_owned(),
                    }),
                }
            }
            NativeProofHarnessAction::Exit => {
                if native_proof_screenshots_ready(&state.commands, tick) {
                    exit.send(AppExit::Success);
                } else {
                    hold_tick = true;
                }
            }
        }
    }
    for key_code in &state.held_keys {
        keyboard.press(*key_code);
    }
    let performance = state.performance_sample();
    write_native_proof_harness_sample(
        &mut state,
        tick,
        diagnostics,
        performance,
        transforms.p1().iter(),
        resource_observations.as_deref().cloned(),
        runtime
            .as_deref()
            .map(|runtime| native_resource_snapshots(&runtime.bundle))
            .unwrap_or_default(),
        runtime
            .as_deref()
            .map(|runtime| native_runtime_probe_observations(&runtime.bundle.assets, &runtime.bundle.materials)),
    );
    if !hold_tick {
        state.tick += advance_ticks;
    }
}

fn apply_bundle_transform_setup(
    bundle: &mut threenative_loader::LoadedBundle,
    entity_id: &str,
    position: Option<[f32; 3]>,
    rotation: Option<[f32; 4]>,
    scale: Option<[f32; 3]>,
) -> bool {
    let Some(entity) = bundle
        .world
        .entities
        .iter_mut()
        .find(|entity| entity.id == entity_id)
    else {
        return false;
    };
    let transform = entity
        .components
        .transform
        .get_or_insert_with(default_bundle_transform);
    if let Some(position) = position {
        transform.position = Some(position);
    }
    if let Some(rotation) = rotation {
        transform.rotation = Some(rotation);
    }
    if let Some(scale) = scale {
        transform.scale = Some(scale);
    }
    true
}

fn default_bundle_transform() -> TransformComponent {
    TransformComponent {
        position: Some([0.0, 0.0, 0.0]),
        rotation: Some([0.0, 0.0, 0.0, 1.0]),
        scale: Some([1.0, 1.0, 1.0]),
    }
}

fn write_native_proof_harness_post_runtime_sample(
    mut state: ResMut<NativeProofHarnessState>,
    transforms: Query<(&ThreeNativeId, &Transform)>,
    runtime: Option<Res<crate::ScriptedRuntimeBundle>>,
    resource_observations: Option<Res<NativeResourceObservationState>>,
) {
    let tick = state.tick;
    let performance = state.performance_sample();
    if let Some(runtime) = runtime.as_deref() {
        write_native_proof_harness_bundle_sample(
            &mut state,
            tick,
            Vec::new(),
            performance,
            resource_observations.as_deref().cloned(),
            &runtime.bundle,
        );
        return;
    }
    write_native_proof_harness_sample(
        &mut state,
        tick,
        Vec::new(),
        performance,
        transforms.iter(),
        resource_observations.as_deref().cloned(),
        runtime
            .as_deref()
            .map(|runtime| native_resource_snapshots(&runtime.bundle))
            .unwrap_or_default(),
        None,
    );
}

fn native_proof_screenshots_ready(commands: &[NativeProofHarnessCommand], tick: u64) -> bool {
    commands
        .iter()
        .filter(|command| command.tick <= tick)
        .filter_map(|command| match &command.action {
            NativeProofHarnessAction::Screenshot { path } => Some(Path::new(path)),
            _ => None,
        })
        .all(native_proof_screenshot_is_valid)
}

fn native_proof_screenshot_is_valid(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if metadata.len() < MIN_PROOF_SCREENSHOT_BYTES {
        return false;
    }
    let Ok(image) = image::open(path) else {
        return false;
    };
    image.pixels().any(|(_, _, rgba)| {
        ((rgba[0] as u16 + rgba[1] as u16 + rgba[2] as u16) / 3) as u8
            >= MIN_PROOF_SCREENSHOT_PEAK_LUMA
    })
}

fn request_native_proof_redraw(
    state: Res<NativeProofHarnessState>,
    mut redraw: EventWriter<RequestRedraw>,
) {
    let has_screenshots = state
        .commands
        .iter()
        .any(|command| matches!(command.action, NativeProofHarnessAction::Screenshot { .. }));
    if has_screenshots {
        redraw.send(RequestRedraw);
    }
}

fn proof_harness_required_models(
    asset_server: &AssetServer,
    manifest: &AssetsManifest,
) -> NativeProofHarnessRequiredModels {
    NativeProofHarnessRequiredModels(
        manifest
            .assets
            .iter()
            .filter(|asset| asset.kind == "model")
            .filter_map(|asset| asset.path.as_ref())
            .map(|path| {
                asset_server.load(bevy::gltf::GltfAssetLabel::Scene(0).from_asset(path.clone()))
            })
            .collect(),
    )
}

fn native_proof_harness_models_ready(
    asset_server: Option<&AssetServer>,
    required_models: Option<&NativeProofHarnessRequiredModels>,
) -> bool {
    let Some(required_models) = required_models else {
        return true;
    };
    if required_models.0.is_empty() {
        return true;
    }
    let Some(asset_server) = asset_server else {
        return true;
    };
    required_models.0.iter().all(|scene| {
        matches!(asset_server.load_state(scene), LoadState::Loaded)
            && asset_server.is_loaded_with_dependencies(scene)
    })
}

fn write_native_proof_harness_sample<'a>(
    state: &mut NativeProofHarnessState,
    tick: u64,
    diagnostics: Vec<NativeProofHarnessDiagnostic>,
    performance: NativeProofHarnessPerformanceSample,
    transforms: impl IntoIterator<Item = (&'a ThreeNativeId, &'a Transform)>,
    resources: Option<NativeResourceObservationState>,
    resource_snapshots: BTreeMap<String, serde_json::Value>,
    runtime_observations: Option<NativeRuntimeProbeObservations>,
) {
    let ok = diagnostics
        .iter()
        .all(|diagnostic| diagnostic.severity != "error");
    let readiness = NativeProofHarnessReadiness {
        schema: "threenative.native-proof-readiness",
        version: "0.1.0",
        ok,
        tick,
        diagnostics,
        performance,
        resources,
        resource_snapshots,
        runtime_observations,
        transforms: native_proof_harness_transform_samples(transforms),
    };
    if let Err(error) = write_native_proof_harness_readiness(
        &state.readiness_out_path,
        &readiness,
        &mut state.readiness_directory_created,
    ) {
        error!("{error}");
    }
}

fn native_resource_snapshots(bundle: &LoadedBundle) -> BTreeMap<String, serde_json::Value> {
    bundle
        .world
        .resources
        .iter()
        .map(|(id, value)| (id.clone(), value.clone()))
        .collect()
}

fn write_native_proof_harness_bundle_sample(
    state: &mut NativeProofHarnessState,
    tick: u64,
    diagnostics: Vec<NativeProofHarnessDiagnostic>,
    performance: NativeProofHarnessPerformanceSample,
    resources: Option<NativeResourceObservationState>,
    bundle: &LoadedBundle,
) {
    let ok = diagnostics
        .iter()
        .all(|diagnostic| diagnostic.severity != "error");
    let readiness = NativeProofHarnessReadiness {
        schema: "threenative.native-proof-readiness",
        version: "0.1.0",
        ok,
        tick,
        diagnostics,
        performance,
        resources,
        resource_snapshots: native_resource_snapshots(bundle),
        runtime_observations: Some(native_runtime_probe_observations(
            &bundle.assets,
            &bundle.materials,
        )),
        transforms: native_proof_harness_bundle_transform_samples(bundle),
    };
    if let Err(error) = write_native_proof_harness_readiness(
        &state.readiness_out_path,
        &readiness,
        &mut state.readiness_directory_created,
    ) {
        error!("{error}");
    }
}

fn duration_ms(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

fn route_proof_ui_to_scene_camera(
    commands: &mut Commands,
    ui_cameras: &mut Query<(Entity, &mut Camera), With<IsDefaultUiCamera>>,
    scene_cameras: &Query<(Entity, &Camera), Without<IsDefaultUiCamera>>,
    root_ui_nodes: &Query<Entity, (With<Node>, Without<Parent>)>,
) {
    let Some((scene_camera, _)) = scene_cameras
        .iter()
        .filter(|(_, camera)| camera.is_active)
        .max_by_key(|(_, camera)| camera.order)
    else {
        return;
    };
    for (entity, mut camera) in ui_cameras.iter_mut() {
        camera.is_active = false;
        commands.entity(entity).remove::<IsDefaultUiCamera>();
    }
    for root_node in root_ui_nodes.iter() {
        commands
            .entity(root_node)
            .insert(TargetCamera(scene_camera));
    }
}

fn request_native_proof_screenshot(
    path: &str,
    windows: &Query<Entity, With<PrimaryWindow>>,
    screenshots: Option<&mut ScreenshotManager>,
) -> Result<(), String> {
    let window = windows
        .get_single()
        .map_err(|_| "Native proof screenshot requires a primary window.".to_owned())?;
    let screenshots = screenshots
        .ok_or_else(|| "Native proof screenshot manager is not available.".to_owned())?;
    let output_path = Path::new(path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create native proof screenshot directory '{}': {error}",
                parent.display()
            )
        })?;
    }
    screenshots
        .save_screenshot_to_disk(window, output_path)
        .map_err(|error| format!("Failed to request native proof screenshot '{path}': {error}"))
}

pub fn native_proof_harness_transform_samples<'a>(
    transforms: impl IntoIterator<Item = (&'a ThreeNativeId, &'a Transform)>,
) -> Vec<NativeProofHarnessTransformSample> {
    transforms
        .into_iter()
        .map(|(id, transform)| NativeProofHarnessTransformSample {
            entity: id.0.clone(),
            position: [
                round_transform_sample(transform.translation.x),
                round_transform_sample(transform.translation.y),
                round_transform_sample(transform.translation.z),
            ],
        })
        .collect()
}

fn native_proof_harness_bundle_transform_samples(
    bundle: &LoadedBundle,
) -> Vec<NativeProofHarnessTransformSample> {
    bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            let transform = entity.components.transform.as_ref()?;
            let position = transform.position?;
            Some(NativeProofHarnessTransformSample {
                entity: entity.id.clone(),
                position: [
                    round_transform_sample(position[0]),
                    round_transform_sample(position[1]),
                    round_transform_sample(position[2]),
                ],
            })
        })
        .collect()
}

fn round_transform_sample(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}

pub fn write_native_proof_harness_readiness(
    path: impl AsRef<Path>,
    readiness: &NativeProofHarnessReadiness,
    directory_created: &mut bool,
) -> Result<(), NativeProofHarnessError> {
    let path = path.as_ref();
    let path_label = path.display().to_string();
    if !*directory_created && let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|source| NativeProofHarnessError::WriteReadiness {
            path: path_label.clone(),
            source,
        })?;
        *directory_created = true;
    }
    let json = serde_json::to_string(readiness).map_err(|source| {
        NativeProofHarnessError::SerializeReadiness {
            path: path_label.clone(),
            source,
        }
    })?;
    fs::write(path, format!("{json}\n")).map_err(|source| NativeProofHarnessError::WriteReadiness {
        path: path_label,
        source,
    })
}
