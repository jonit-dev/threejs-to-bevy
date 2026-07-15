use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
    time::{Duration, Instant},
};

use bevy::{
    app::ScheduleRunnerPlugin,
    asset::LoadState,
    ecs::system::SystemParam,
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
    systems_host::{NativeResourceObservationState, NativeRuntimeWriteAuditState},
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
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NativeProofHarnessAction {
    Key {
        code: String,
        pressed: bool,
    },
    OverlayMessage {
        overlay_id: String,
        message_type: String,
        payload: serde_json::Value,
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
    Window {
        operation: String,
        #[serde(default)]
        width: Option<f32>,
        #[serde(default)]
        height: Option<f32>,
    },
    SceneOcclusion {
        from: String,
        to: String,
    },
    Exit,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeProofHarnessOptions {
    pub audit_writes: bool,
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
    audit_writes: bool,
    scene_queries: Vec<NativeProofHarnessSceneQuerySample>,
    started_at: Instant,
    tick: u64,
}

#[derive(Clone, Debug, Resource)]
pub struct NativeProofHarnessRequiredModels(Vec<Handle<Scene>>);

#[derive(Clone, Debug, Default, Resource)]
pub struct NativeProofHarnessFastForward(pub u64);

type NativeProofTransformQueries<'w, 's> = ParamSet<
    'w,
    's,
    (
        Query<'w, 's, (&'static ThreeNativeId, &'static mut Transform)>,
        Query<'w, 's, (&'static ThreeNativeId, &'static Transform)>,
    ),
>;

type NativeProofResourceQueries<'w, 's> = ParamSet<
    'w,
    's,
    (
        Option<Res<'w, crate::scene_ray_query::NativeSceneRayQuery>>,
        Option<Res<'w, crate::overlay_host::NativeOverlayRenderReadiness>>,
    ),
>;

#[derive(SystemParam)]
pub struct NativeProofHarnessSystem<'w, 's> {
    commands: Commands<'w, 's>,
    state: ResMut<'w, NativeProofHarnessState>,
    keyboard: ResMut<'w, ButtonInput<KeyCode>>,
    exit: EventWriter<'w, AppExit>,
    windows: Query<'w, 's, Entity, With<PrimaryWindow>>,
    screenshots: Option<ResMut<'w, ScreenshotManager>>,
    transforms: NativeProofTransformQueries<'w, 's>,
    asset_server: Option<Res<'w, AssetServer>>,
    required_models: Option<Res<'w, NativeProofHarnessRequiredModels>>,
    runtime: Option<ResMut<'w, crate::ScriptedRuntimeBundle>>,
    ui_cameras: Query<'w, 's, (Entity, &'static mut Camera), With<IsDefaultUiCamera>>,
    scene_cameras: Query<'w, 's, (Entity, &'static Camera), Without<IsDefaultUiCamera>>,
    root_ui_nodes: Query<'w, 's, Entity, (With<Node>, Without<Parent>)>,
    resource_observations: Option<Res<'w, NativeResourceObservationState>>,
    write_audit: Option<Res<'w, NativeRuntimeWriteAuditState>>,
    proof_resources: NativeProofResourceQueries<'w, 's>,
}

struct NativeProofHarnessCommandProgress {
    diagnostics: Vec<NativeProofHarnessDiagnostic>,
    hold_tick: bool,
    advance_ticks: u64,
}

impl Default for NativeProofHarnessCommandProgress {
    fn default() -> Self {
        Self {
            diagnostics: Vec::new(),
            hold_tick: false,
            advance_ticks: 1,
        }
    }
}

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
    #[serde(rename = "writeAudit", skip_serializing_if = "Option::is_none")]
    pub write_audit: Option<NativeRuntimeWriteAuditState>,
    #[serde(
        rename = "resourceSnapshots",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub resource_snapshots: BTreeMap<String, serde_json::Value>,
    #[serde(
        rename = "runtimeObservations",
        skip_serializing_if = "Option::is_none"
    )]
    pub runtime_observations: Option<NativeRuntimeProbeObservations>,
    #[serde(
        rename = "gameplayObservations",
        skip_serializing_if = "Option::is_none"
    )]
    pub gameplay_observations: Option<serde_json::Value>,
    #[serde(rename = "overlaySnapshots", skip_serializing_if = "Vec::is_empty")]
    pub overlay_snapshots: Vec<crate::overlay::OverlayBridgeEnvelope>,
    #[serde(rename = "sceneQueries", skip_serializing_if = "Vec::is_empty")]
    pub scene_queries: Vec<NativeProofHarnessSceneQuerySample>,
    pub transforms: Vec<NativeProofHarnessTransformSample>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeProofHarnessSceneQuerySample {
    pub distance: Option<f32>,
    pub from: String,
    pub hit: bool,
    pub occluder: Option<String>,
    pub to: String,
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
        Self::from_stream_with_audit(stream, readiness_out_path, false)
    }

    pub fn from_stream_with_audit(
        stream: NativeProofHarnessCommandStream,
        readiness_out_path: impl Into<String>,
        audit_writes: bool,
    ) -> Self {
        Self {
            commands: stream.commands,
            held_keys: BTreeSet::new(),
            last_sample_at: Instant::now(),
            readiness_directory_created: false,
            readiness_out_path: readiness_out_path.into(),
            audit_writes,
            scene_queries: Vec::new(),
            started_at: Instant::now(),
            tick: 0,
        }
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn audit_writes(&self) -> bool {
        self.audit_writes
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
        .insert_resource(NativeProofHarnessState::from_stream_with_audit(
            stream,
            options.readiness_out_path,
            options.audit_writes,
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

pub fn apply_native_proof_harness_commands(mut harness: NativeProofHarnessSystem) {
    let tick = harness.state.tick;
    if !native_proof_harness_models_ready(
        harness.asset_server.as_deref(),
        harness.required_models.as_deref(),
    ) {
        write_current_native_proof_harness_sample(&mut harness, tick, Vec::new());
        return;
    }
    let commands = harness
        .state
        .commands
        .iter()
        .filter(|command| command.tick == tick)
        .cloned()
        .collect::<Vec<_>>();
    let mut progress = NativeProofHarnessCommandProgress::default();
    for command in commands {
        apply_native_proof_harness_action(&mut harness, tick, command.action, &mut progress);
    }
    for key_code in &harness.state.held_keys {
        harness.keyboard.press(*key_code);
    }
    write_current_native_proof_harness_sample(&mut harness, tick, progress.diagnostics);
    if !progress.hold_tick {
        harness.state.tick += progress.advance_ticks;
    }
}

fn apply_native_proof_harness_action(
    harness: &mut NativeProofHarnessSystem,
    tick: u64,
    action: NativeProofHarnessAction,
    progress: &mut NativeProofHarnessCommandProgress,
) {
    match action {
        NativeProofHarnessAction::Key { code, pressed } => {
            apply_native_proof_key(harness, code, pressed, &mut progress.diagnostics);
        }
        NativeProofHarnessAction::OverlayMessage {
            overlay_id,
            message_type,
            payload,
        } => queue_native_proof_overlay_message(
            &mut harness.commands,
            overlay_id,
            message_type,
            payload,
        ),
        NativeProofHarnessAction::SetTransform {
            entity,
            position,
            rotation,
            scale,
        } => apply_native_proof_transform(
            harness,
            entity,
            position,
            rotation,
            scale,
            &mut progress.diagnostics,
        ),
        NativeProofHarnessAction::Advance { frames } => {
            let frames = frames.max(1);
            progress.advance_ticks = progress.advance_ticks.max(frames);
            harness
                .commands
                .insert_resource(NativeProofHarnessFastForward(frames));
        }
        NativeProofHarnessAction::Screenshot { path } => {
            request_native_proof_harness_screenshot(harness, path, progress);
        }
        NativeProofHarnessAction::Window {
            operation,
            width,
            height,
        } => queue_native_proof_window(&mut harness.commands, operation, width, height),
        NativeProofHarnessAction::SceneOcclusion { from, to } => {
            apply_native_proof_scene_occlusion(harness, from, to, &mut progress.diagnostics);
        }
        NativeProofHarnessAction::Exit => {
            if native_proof_screenshots_ready(&harness.state.commands, tick) {
                harness.exit.send(AppExit::Success);
            } else {
                progress.hold_tick = true;
            }
        }
    }
}

fn apply_native_proof_key(
    harness: &mut NativeProofHarnessSystem,
    code: String,
    pressed: bool,
    diagnostics: &mut Vec<NativeProofHarnessDiagnostic>,
) {
    let Some(key_code) = portable_key_code(&code) else {
        diagnostics.push(NativeProofHarnessDiagnostic {
            code: "TN_NATIVE_PROOF_INPUT_UNSUPPORTED".to_owned(),
            message: format!("Keyboard code '{code}' is not portable."),
            severity: "error".to_owned(),
        });
        return;
    };
    if pressed {
        harness.state.held_keys.insert(key_code);
    } else {
        harness.state.held_keys.remove(&key_code);
        harness.keyboard.release(key_code);
    }
}

fn queue_native_proof_overlay_message(
    commands: &mut Commands,
    overlay_id: String,
    message_type: String,
    payload: serde_json::Value,
) {
    commands.add(move |world: &mut World| {
        let Some(mut resource) =
            world.get_resource_mut::<crate::overlay_host::NativeOverlayBridgeResource>()
        else {
            return;
        };
        let crate::overlay_host::NativeOverlayBridgeResource { bridge, overlays } = &mut *resource;
        bridge.receive_overlay_message(overlays, &overlay_id, &message_type, payload);
    });
}

fn apply_native_proof_transform(
    harness: &mut NativeProofHarnessSystem,
    entity: String,
    position: Option<[f32; 3]>,
    rotation: Option<[f32; 4]>,
    scale: Option<[f32; 3]>,
    diagnostics: &mut Vec<NativeProofHarnessDiagnostic>,
) {
    let mut applied = apply_native_proof_world_transform(
        &mut harness.transforms.p0(),
        &entity,
        position,
        rotation,
        scale,
    );
    if let Some(runtime) = harness.runtime.as_deref_mut() {
        applied =
            apply_bundle_transform_setup(&mut runtime.bundle, &entity, position, rotation, scale)
                || applied;
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

fn apply_native_proof_world_transform(
    transforms: &mut Query<(&ThreeNativeId, &mut Transform)>,
    entity: &str,
    position: Option<[f32; 3]>,
    rotation: Option<[f32; 4]>,
    scale: Option<[f32; 3]>,
) -> bool {
    let Some((_, mut transform)) = transforms.iter_mut().find(|(id, _)| id.0 == entity) else {
        return false;
    };
    if let Some([x, y, z]) = position {
        transform.translation = Vec3::new(x, y, z);
    }
    if let Some([x, y, z, w]) = rotation {
        transform.rotation = Quat::from_xyzw(x, y, z, w);
    }
    if let Some([x, y, z]) = scale {
        transform.scale = Vec3::new(x, y, z);
    }
    true
}

fn request_native_proof_harness_screenshot(
    harness: &mut NativeProofHarnessSystem,
    path: String,
    progress: &mut NativeProofHarnessCommandProgress,
) {
    if harness
        .proof_resources
        .p1()
        .as_deref()
        .is_some_and(|readiness| !readiness.is_ready())
    {
        progress.hold_tick = true;
        return;
    }
    route_proof_ui_to_scene_camera(
        &mut harness.commands,
        &mut harness.ui_cameras,
        &harness.scene_cameras,
        &harness.root_ui_nodes,
    );
    if let Err(message) =
        request_native_proof_screenshot(&path, &harness.windows, harness.screenshots.as_deref_mut())
    {
        progress.diagnostics.push(NativeProofHarnessDiagnostic {
            code: "TN_NATIVE_PROOF_SCREENSHOT_FAILED".to_owned(),
            message,
            severity: "warning".to_owned(),
        });
    }
}

fn queue_native_proof_window(
    commands: &mut Commands,
    operation: String,
    width: Option<f32>,
    height: Option<f32>,
) {
    commands.add(move |world: &mut World| {
        let mut windows = world.query_filtered::<&mut Window, With<PrimaryWindow>>();
        let Ok(mut window) = windows.get_single_mut(world) else {
            return;
        };
        match operation.as_str() {
            "resize" => {
                if let (Some(width), Some(height)) = (width, height)
                    && width.is_finite()
                    && height.is_finite()
                    && width >= 1.0
                    && height >= 1.0
                {
                    window.resolution.set(width, height);
                }
            }
            "minimize" => window.set_minimized(true),
            "restore" => window.set_minimized(false),
            _ => {}
        }
    });
}

fn apply_native_proof_scene_occlusion(
    harness: &mut NativeProofHarnessSystem,
    from: String,
    to: String,
    diagnostics: &mut Vec<NativeProofHarnessDiagnostic>,
) {
    let positions = harness
        .transforms
        .p1()
        .iter()
        .filter(|(id, _)| id.0 == from || id.0 == to)
        .map(|(id, transform)| (id.0.clone(), transform.translation.to_array()))
        .collect::<BTreeMap<_, _>>();
    let scene_query = harness.proof_resources.p0();
    let (Some(origin), Some(target), Some(query)) = (
        positions.get(from.as_str()),
        positions.get(to.as_str()),
        scene_query.as_deref(),
    ) else {
        diagnostics.push(NativeProofHarnessDiagnostic {
            code: "TN_NATIVE_PROOF_SCENE_QUERY_INVALID".to_owned(),
            message: format!(
                "Native scene occlusion query could not resolve endpoints '{from}' and '{to}'."
            ),
            severity: "error".to_owned(),
        });
        return;
    };
    let hit = query.occluded_excluding(*origin, *target, &[from.as_str(), to.as_str()]);
    harness
        .state
        .scene_queries
        .push(NativeProofHarnessSceneQuerySample {
            distance: hit.as_ref().map(|value| value.distance),
            from,
            hit: hit.is_some(),
            occluder: hit.map(|value| value.entity_id),
            to,
        });
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
    write_audit: Option<Res<NativeRuntimeWriteAuditState>>,
    overlay_bridge: Option<Res<crate::overlay_host::NativeOverlayBridgeResource>>,
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
            write_audit
                .as_deref()
                .filter(|audit| audit.enabled)
                .cloned(),
            overlay_bridge.as_deref().map_or_else(Vec::new, |bridge| {
                bridge.bridge.snapshots().iter().cloned().collect()
            }),
            &runtime.bundle,
        );
        return;
    }
    write_native_proof_harness_sample(
        &mut state,
        tick,
        transforms.iter(),
        NativeProofHarnessSample {
            diagnostics: Vec::new(),
            performance,
            resources: resource_observations.as_deref().cloned(),
            write_audit: write_audit
                .as_deref()
                .filter(|audit| audit.enabled)
                .cloned(),
            resource_snapshots: BTreeMap::new(),
            runtime_observations: None,
            gameplay_observations: None,
            overlay_snapshots: Vec::new(),
        },
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

struct NativeProofHarnessSample {
    diagnostics: Vec<NativeProofHarnessDiagnostic>,
    performance: NativeProofHarnessPerformanceSample,
    resources: Option<NativeResourceObservationState>,
    write_audit: Option<NativeRuntimeWriteAuditState>,
    resource_snapshots: BTreeMap<String, serde_json::Value>,
    runtime_observations: Option<NativeRuntimeProbeObservations>,
    gameplay_observations: Option<serde_json::Value>,
    overlay_snapshots: Vec<crate::overlay::OverlayBridgeEnvelope>,
}

fn write_current_native_proof_harness_sample(
    harness: &mut NativeProofHarnessSystem,
    tick: u64,
    diagnostics: Vec<NativeProofHarnessDiagnostic>,
) {
    let performance = harness.state.performance_sample();
    let runtime = harness.runtime.as_deref();
    let sample = NativeProofHarnessSample {
        diagnostics,
        performance,
        resources: harness.resource_observations.as_deref().cloned(),
        write_audit: harness
            .write_audit
            .as_deref()
            .filter(|audit| audit.enabled)
            .cloned(),
        resource_snapshots: runtime
            .map(|runtime| native_resource_snapshots(&runtime.bundle))
            .unwrap_or_default(),
        runtime_observations: runtime.map(|runtime| {
            native_runtime_probe_observations(&runtime.bundle.assets, &runtime.bundle.materials)
        }),
        gameplay_observations: runtime
            .map(|runtime| crate::systems_host::native_gameplay_observations(&runtime.bundle)),
        overlay_snapshots: Vec::new(),
    };
    write_native_proof_harness_sample(
        &mut harness.state,
        tick,
        harness.transforms.p1().iter(),
        sample,
    );
}

fn write_native_proof_harness_sample<'a>(
    state: &mut NativeProofHarnessState,
    tick: u64,
    transforms: impl IntoIterator<Item = (&'a ThreeNativeId, &'a Transform)>,
    sample: NativeProofHarnessSample,
) {
    let NativeProofHarnessSample {
        diagnostics,
        performance,
        resources,
        write_audit,
        resource_snapshots,
        runtime_observations,
        gameplay_observations,
        overlay_snapshots,
    } = sample;
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
        write_audit,
        resource_snapshots,
        runtime_observations,
        gameplay_observations,
        overlay_snapshots,
        scene_queries: state.scene_queries.clone(),
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
    write_audit: Option<NativeRuntimeWriteAuditState>,
    overlay_snapshots: Vec<crate::overlay::OverlayBridgeEnvelope>,
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
        write_audit,
        resource_snapshots: native_resource_snapshots(bundle),
        runtime_observations: Some(native_runtime_probe_observations(
            &bundle.assets,
            &bundle.materials,
        )),
        gameplay_observations: Some(crate::systems_host::native_gameplay_observations(bundle)),
        overlay_snapshots,
        scene_queries: state.scene_queries.clone(),
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
