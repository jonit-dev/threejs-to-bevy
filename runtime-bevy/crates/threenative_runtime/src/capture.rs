use std::{
    env, fs,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};

use bevy::{
    app::AppExit,
    pbr::PreviousGlobalTransform,
    prelude::*,
    render::view::screenshot::ScreenshotManager,
    transform::TransformSystem,
    ui::IsDefaultUiCamera,
    window::{PrimaryWindow, RequestRedraw},
    winit::{UpdateMode, WinitSettings},
};
use image::GenericImageView;
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{AssetsManifest, load_bundle};
use threenative_runtime::{
    NativeDeterministicCaptureClock, app_from_bundle,
    assets::{TextureAssetControlsRegistry, load_texture_asset},
    environment::apply_environment_bookmark,
    map_world::NativeStylizedMotionTimeOverride,
    stylized_nature::native_compatible_model_scene_path,
    systems_host::NativeGameLoopState,
    trace_report::write_pretty_json_report,
    ui::NativeUiEffectState,
};

const MIN_CAPTURE_FRAME: u32 = 2;
const SCREENSHOT_VALIDATION_DELAY_FRAMES: u32 = 4;
const SCREENSHOT_ATTEMPT_TIMEOUT_FRAMES: u32 = 300;
const MAX_CAPTURE_RETRIES: u32 = 5;
const MIN_SCREENSHOT_BYTES: u64 = 1_024;
const MIN_SCREENSHOT_PEAK_LUMA: u8 = 35;
const ASSET_READINESS_GRACE: Duration = Duration::from_secs(3);
const THREE_COMPAT_CAPTURE_STYLIZED_TIME: f32 = 1.0 / 60.0;

#[derive(Resource)]
struct CaptureConfig {
    captures: Vec<CaptureTarget>,
    max_frame: u32,
}

#[derive(Clone)]
struct CaptureTarget {
    assets_ready_at_request: Option<bool>,
    output_path: PathBuf,
    request_frame: u32,
    requested_at_frame: Option<u32>,
    retry_count: u32,
    validated: bool,
}

struct CaptureTransformTraceOptions {
    entity_id: String,
    output_path: PathBuf,
}

#[derive(Debug, PartialEq)]
struct CaptureViewportOptions {
    height: f32,
    width: f32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CaptureUiState {
    Focus,
    Hover,
    Selected,
}

#[derive(Debug, Eq, PartialEq)]
struct CaptureUiStateOptions {
    node_id: String,
    state: CaptureUiState,
}

#[derive(Resource)]
struct CaptureTransformTraceState {
    capture_request: Option<CaptureTransformTraceRequest>,
    entity_id: String,
    fixed_delta_seconds: f32,
    last_world_position: Option<[f32; 3]>,
    output_path: PathBuf,
    samples: Vec<CaptureTransformTraceSample>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureTransformTraceRequest {
    assets_ready: bool,
    issued_host_frame: u32,
    requested_frame: u32,
    runtime_frame: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureTransformTraceSample {
    elapsed_seconds: f32,
    /// Engine-owned history is absent for the temporal-accumulation path.
    engine_previous_world_position: Option<[f32; 3]>,
    frame: u64,
    /// Prior rendered transform sampled by this deterministic capture harness.
    previous_world_position: Option<[f32; 3]>,
    source_position: [f32; 3],
    world_delta: Option<[f32; 3]>,
    world_delta_magnitude: Option<f32>,
    world_position: [f32; 3],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureTransformTraceReport<'a> {
    capture_request: Option<&'a CaptureTransformTraceRequest>,
    entity_id: &'a str,
    fixed_delta_seconds: f32,
    history_source: &'static str,
    runtime: &'static str,
    samples: &'a [CaptureTransformTraceSample],
    schema: &'static str,
    version: &'static str,
}

#[derive(Resource)]
struct CaptureClock(Instant);

#[derive(Default, Resource)]
struct TextureAssetsReady(bool);

#[derive(Default, Resource)]
struct ModelAssetsReady(bool);

#[derive(Default, Resource)]
struct RequiredModelAssets(Vec<Handle<Scene>>);

fn main() -> ExitCode {
    let mut args = env::args().collect::<Vec<_>>();
    let trace_options = match take_transform_trace_options(&mut args) {
        Ok(options) => options,
        Err(code) => return code,
    };
    let viewport_options = match take_viewport_options(&mut args) {
        Ok(options) => options,
        Err(code) => return code,
    };
    let ui_state_options = match take_ui_state_options(&mut args) {
        Ok(options) => options,
        Err(code) => return code,
    };
    if args.len() != 4 && args.len() != 5 && args.len() != 7 {
        eprintln!(
            "Usage: threenative_capture <bundle-path> <bookmark-id> <output-png> [request-frame] [<output-png-2> <request-frame-2>] [--viewport <width> <height>] [--ui-state <node-id> <focus|hover|selected>] [--transform-trace <entity-id> <output-json>]"
        );
        return ExitCode::from(2);
    }

    let bundle_path = &args[1];
    let bookmark_id = &args[2];
    let first_output = PathBuf::from(&args[3]);
    let first_frame = match parse_frame(args.get(4), 120) {
        Ok(frame) => frame,
        Err(code) => return code,
    };
    let captures = if args.len() == 7 {
        let second_frame = match parse_frame(Some(&args[6]), first_frame.saturating_add(60)) {
            Ok(frame) => frame,
            Err(code) => return code,
        };
        vec![
            CaptureTarget {
                assets_ready_at_request: None,
                output_path: first_output,
                request_frame: first_frame,
                requested_at_frame: None,
                retry_count: 0,
                validated: false,
            },
            CaptureTarget {
                assets_ready_at_request: None,
                output_path: PathBuf::from(&args[5]),
                request_frame: second_frame,
                requested_at_frame: None,
                retry_count: 0,
                validated: false,
            },
        ]
    } else {
        vec![CaptureTarget {
            assets_ready_at_request: None,
            output_path: first_output,
            request_frame: first_frame,
            requested_at_frame: None,
            retry_count: 0,
            validated: false,
        }]
    };
    let max_frame = captures
        .iter()
        .map(|capture| capture.request_frame.max(MIN_CAPTURE_FRAME))
        .max()
        .unwrap_or(first_frame.max(MIN_CAPTURE_FRAME))
        .saturating_add(600);

    let bundle = match load_bundle(bundle_path) {
        Ok(bundle) => bundle,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    let fixed_delta_seconds = bundle
        .runtime_config
        .as_ref()
        .map_or(1.0 / 60.0, |config| config.time.fixed_delta);
    let mut app = match app_from_bundle(bundle_path) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    if let Some(viewport) = viewport_options {
        let world = app.world_mut();
        let mut query = world.query_filtered::<&mut Window, With<PrimaryWindow>>();
        if let Some(mut window) = query.iter_mut(world).next() {
            window.resolution.set(viewport.width, viewport.height);
        }
    }

    if !apply_environment_bookmark(app.world_mut(), &bundle, bookmark_id)
        && !bundle
            .world
            .entities
            .iter()
            .any(|entity| entity.id == *bookmark_id && entity.components.camera.is_some())
    {
        eprintln!("bookmark '{bookmark_id}' was not found or no camera could be updated");
        return ExitCode::from(1);
    }
    if let Some(options) = ui_state_options
        && !apply_capture_ui_state(app.world_mut(), &options)
    {
        eprintln!("UI node '{}' was not found for capture state", options.node_id);
        return ExitCode::from(1);
    }
    for capture in &captures {
        if let Err(code) = prepare_output_path(&capture.output_path) {
            return code;
        }
    }

    let final_output_paths = captures
        .iter()
        .map(|capture| capture.output_path.clone())
        .collect::<Vec<_>>();
    let required_model_assets = app
        .world()
        .get_resource::<AssetServer>()
        .map(|asset_server| {
            required_model_assets(asset_server, &bundle.assets, &bundle.bundle_path)
        })
        .unwrap_or_default();
    let stylized_motion_time = env::var("THREENATIVE_CAPTURE_STYLIZED_TIME")
        .ok()
        .and_then(|raw| raw.parse::<f32>().ok())
        .unwrap_or(THREE_COMPAT_CAPTURE_STYLIZED_TIME);
    app.insert_resource(CaptureConfig {
        captures,
        max_frame,
    })
    .insert_resource(NativeDeterministicCaptureClock)
    .insert_resource(NativeStylizedMotionTimeOverride(stylized_motion_time))
    .insert_resource(WinitSettings {
        focused_mode: UpdateMode::Continuous,
        unfocused_mode: UpdateMode::Continuous,
    })
    .insert_resource(required_model_assets)
    .insert_resource(CaptureClock(Instant::now()))
    .insert_resource(TextureAssetsReady::default())
    .insert_resource(ModelAssetsReady::default())
    .add_systems(
        Update,
        (
            wait_for_texture_assets,
            wait_for_model_assets,
            route_capture_ui_to_scene_camera,
            request_capture_redraw,
            request_screenshot,
        ),
    );
    if let Some(options) = trace_options {
        app.insert_resource(CaptureTransformTraceState {
            capture_request: None,
            entity_id: options.entity_id,
            fixed_delta_seconds,
            last_world_position: None,
            output_path: options.output_path,
            samples: Vec::new(),
        });
        app.add_systems(
            PostUpdate,
            record_capture_transform_trace.after(TransformSystem::TransformPropagate),
        );
    }
    app.run();
    let missing = final_output_paths
        .iter()
        .filter(|path| !screenshot_is_valid(path))
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    if missing.is_empty() {
        ExitCode::SUCCESS
    } else {
        eprintln!("screenshot(s) were not written: {}", missing.join(", "));
        ExitCode::from(1)
    }
}

fn take_transform_trace_options(
    args: &mut Vec<String>,
) -> Result<Option<CaptureTransformTraceOptions>, ExitCode> {
    let Some(index) = args.iter().position(|arg| arg == "--transform-trace") else {
        return Ok(None);
    };
    if index + 2 >= args.len() || args[index + 1].starts_with("--") {
        eprintln!("--transform-trace requires <entity-id> <output-json>");
        return Err(ExitCode::from(2));
    }
    let entity_id = args[index + 1].clone();
    let output_path = PathBuf::from(&args[index + 2]);
    args.drain(index..=index + 2);
    if args.iter().any(|arg| arg == "--transform-trace") {
        eprintln!("--transform-trace may only be provided once");
        return Err(ExitCode::from(2));
    }
    Ok(Some(CaptureTransformTraceOptions {
        entity_id,
        output_path,
    }))
}

fn take_viewport_options(
    args: &mut Vec<String>,
) -> Result<Option<CaptureViewportOptions>, ExitCode> {
    let Some(index) = args.iter().position(|arg| arg == "--viewport") else {
        return Ok(None);
    };
    if index + 2 >= args.len() {
        eprintln!("--viewport requires <width> <height>");
        return Err(ExitCode::from(2));
    }
    let width = args[index + 1]
        .parse::<f32>()
        .ok()
        .filter(|value| value.is_finite() && *value > 0.0);
    let height = args[index + 2]
        .parse::<f32>()
        .ok()
        .filter(|value| value.is_finite() && *value > 0.0);
    let (Some(width), Some(height)) = (width, height) else {
        eprintln!("--viewport width and height must be positive finite numbers");
        return Err(ExitCode::from(2));
    };
    args.drain(index..=index + 2);
    if args.iter().any(|arg| arg == "--viewport") {
        eprintln!("--viewport may only be provided once");
        return Err(ExitCode::from(2));
    }
    Ok(Some(CaptureViewportOptions { height, width }))
}

fn take_ui_state_options(
    args: &mut Vec<String>,
) -> Result<Option<CaptureUiStateOptions>, ExitCode> {
    let Some(index) = args.iter().position(|arg| arg == "--ui-state") else {
        return Ok(None);
    };
    if index + 2 >= args.len() {
        eprintln!("--ui-state requires <node-id> <focus|hover|selected>");
        return Err(ExitCode::from(2));
    }
    let node_id = args[index + 1].clone();
    let state = match args[index + 2].as_str() {
        "focus" => CaptureUiState::Focus,
        "hover" => CaptureUiState::Hover,
        "selected" => CaptureUiState::Selected,
        _ => {
            eprintln!("--ui-state must be focus, hover, or selected");
            return Err(ExitCode::from(2));
        }
    };
    args.drain(index..=index + 2);
    if args.iter().any(|arg| arg == "--ui-state") {
        eprintln!("--ui-state may only be provided once");
        return Err(ExitCode::from(2));
    }
    Ok(Some(CaptureUiStateOptions { node_id, state }))
}

fn apply_capture_ui_state(world: &mut World, options: &CaptureUiStateOptions) -> bool {
    let entity = world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .find_map(|(entity, id)| (id.0 == options.node_id).then_some(entity));
    let Some(entity) = entity else {
        return false;
    };
    match options.state {
        CaptureUiState::Focus => {
            world.init_resource::<bevy::a11y::Focus>();
            world.resource_mut::<bevy::a11y::Focus>().0 = Some(entity);
        }
        CaptureUiState::Hover => {
            world.entity_mut(entity).insert(Interaction::Hovered);
        }
        CaptureUiState::Selected => {
            let mut entity = world.entity_mut(entity);
            if let Some(mut state) = entity.get_mut::<NativeUiEffectState>() {
                state.selected = true;
            } else {
                entity.insert(NativeUiEffectState { selected: true, ..Default::default() });
            }
        }
    }
    true
}

fn parse_frame(value: Option<&String>, fallback: u32) -> Result<u32, ExitCode> {
    match value.map(|raw| raw.parse::<u32>()) {
        Some(Ok(frame)) if frame > 0 => Ok(frame),
        Some(_) => {
            eprintln!("request-frame must be a positive integer");
            Err(ExitCode::from(2))
        }
        None => Ok(fallback),
    }
}

fn prepare_output_path(output_path: &PathBuf) -> Result<(), ExitCode> {
    if let Some(parent) = output_path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            eprintln!(
                "failed to create screenshot directory '{}': {error}",
                parent.display()
            );
            return Err(ExitCode::from(1));
        }
    }
    if let Err(error) = fs::remove_file(output_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!(
                "failed to remove existing screenshot '{}': {error}",
                output_path.display()
            );
            return Err(ExitCode::from(1));
        }
    }
    Ok(())
}

fn required_model_assets(
    asset_server: &AssetServer,
    manifest: &AssetsManifest,
    bundle_path: &Path,
) -> RequiredModelAssets {
    RequiredModelAssets(
        manifest
            .assets
            .iter()
            .filter(|asset| asset.kind == "model")
            .filter_map(|asset| native_compatible_model_scene_path(asset, bundle_path))
            .map(|path| asset_server.load(bevy::gltf::GltfAssetLabel::Scene(0).from_asset(path)))
            .collect(),
    )
}

fn wait_for_texture_assets(
    asset_server: Res<AssetServer>,
    controls: Option<Res<TextureAssetControlsRegistry>>,
    mut ready: ResMut<TextureAssetsReady>,
) {
    if ready.0 {
        return;
    }
    let Some(controls) = controls else {
        ready.0 = true;
        return;
    };
    if controls.0.values().all(|control| {
        let handle = load_texture_asset(&asset_server, &control.path);
        matches!(
            asset_server.load_state(&handle),
            bevy::asset::LoadState::Loaded
        )
    }) {
        ready.0 = true;
    }
}

fn wait_for_model_assets(
    asset_server: Res<AssetServer>,
    required: Res<RequiredModelAssets>,
    mut ready: ResMut<ModelAssetsReady>,
) {
    if ready.0 {
        return;
    }
    if required.0.is_empty() {
        ready.0 = true;
        return;
    }
    if required
        .0
        .iter()
        .all(|scene| asset_server.is_loaded_with_dependencies(scene))
    {
        ready.0 = true;
    }
}

fn route_capture_ui_to_scene_camera(
    mut routed: Local<bool>,
    mut commands: Commands,
    mut ui_cameras: Query<(Entity, &mut Camera), With<IsDefaultUiCamera>>,
    scene_cameras: Query<(Entity, &Camera), Without<IsDefaultUiCamera>>,
    root_ui_nodes: Query<Entity, (With<Node>, Without<Parent>)>,
) {
    if *routed {
        return;
    }
    for (entity, mut camera) in &mut ui_cameras {
        camera.is_active = false;
        commands.entity(entity).remove::<IsDefaultUiCamera>();
    }
    let Some((scene_camera, _)) = scene_cameras
        .iter()
        .filter(|(_, camera)| camera.is_active)
        .max_by_key(|(_, camera)| camera.order)
    else {
        return;
    };
    for root_node in &root_ui_nodes {
        commands
            .entity(root_node)
            .insert(TargetCamera(scene_camera));
    }
    *routed = true;
}

fn request_screenshot(
    mut frame: Local<u32>,
    mut config: ResMut<CaptureConfig>,
    textures_ready: Res<TextureAssetsReady>,
    models_ready: Res<ModelAssetsReady>,
    clock: Res<CaptureClock>,
    windows: Query<Entity, With<PrimaryWindow>>,
    mut screenshots: ResMut<ScreenshotManager>,
    mut exit: EventWriter<AppExit>,
    trace: Option<Res<CaptureTransformTraceState>>,
) {
    *frame += 1;
    if let Ok(window) = windows.get_single() {
        for capture in &mut config.captures {
            if capture.validated {
                continue;
            }
            let assets_ready = textures_ready.0 && models_ready.0;
            let should_capture = assets_ready || clock.0.elapsed() >= ASSET_READINESS_GRACE;
            let trigger_frame = capture.request_frame.max(MIN_CAPTURE_FRAME);
            if capture.requested_at_frame.is_none()
                && *frame >= trigger_frame
                && should_capture
                && capture.retry_count <= MAX_CAPTURE_RETRIES
            {
                if let Err(error) =
                    screenshots.save_screenshot_to_disk(window, &capture.output_path)
                {
                    error!("failed to request screenshot: {error}");
                    exit.send(AppExit::error());
                    return;
                }
                capture.requested_at_frame = Some(*frame);
                capture.assets_ready_at_request = Some(assets_ready);
            }

            if let Some(requested_at) = capture.requested_at_frame {
                if *frame >= requested_at.saturating_add(SCREENSHOT_VALIDATION_DELAY_FRAMES)
                    && screenshot_is_valid(&capture.output_path)
                {
                    capture.validated = true;
                    continue;
                }
                if *frame >= requested_at.saturating_add(SCREENSHOT_ATTEMPT_TIMEOUT_FRAMES) {
                    let _ = fs::remove_file(&capture.output_path);
                    capture.requested_at_frame = None;
                    capture.retry_count += 1;
                }
            }
        }
    }

    if config.captures.iter().all(|capture| capture.validated) {
        if let Some(trace) = trace
            && let Err(error) = write_capture_transform_trace(&trace)
        {
            error!("failed to write transform trace: {error}");
            exit.send(AppExit::error());
            return;
        }
        exit.send(AppExit::Success);
    } else if *frame >= config.max_frame {
        let pending = config
            .captures
            .iter()
            .filter(|capture| !capture.validated)
            .map(|capture| capture.output_path.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        error!(
            "screenshot(s) were not written before frame {}: {pending}",
            config.max_frame
        );
        exit.send(AppExit::error());
    }
}

fn write_capture_transform_trace(
    trace: &CaptureTransformTraceState,
) -> Result<(), Box<dyn std::error::Error>> {
    let report = CaptureTransformTraceReport {
        capture_request: trace.capture_request.as_ref(),
        entity_id: &trace.entity_id,
        fixed_delta_seconds: trace.fixed_delta_seconds,
        history_source: "capture-harness-prior-rendered-sample",
        runtime: "bevy",
        samples: &trace.samples,
        schema: "threenative.capture-transform-trace",
        version: "0.1.0",
    };
    write_pretty_json_report(&trace.output_path, &report)
}

fn record_capture_transform_trace(
    config: Res<CaptureConfig>,
    loop_state: Option<Res<NativeGameLoopState>>,
    mut trace: ResMut<CaptureTransformTraceState>,
    transforms: Query<(
        &ThreeNativeId,
        &Transform,
        &GlobalTransform,
        Option<&PreviousGlobalTransform>,
    )>,
) {
    if trace.capture_request.is_some() {
        return;
    }
    let Some(loop_state) = loop_state else {
        return;
    };
    let Some((_, source, current, previous)) = transforms
        .iter()
        .find(|(stable_id, _, _, _)| stable_id.0 == trace.entity_id)
    else {
        return;
    };
    let world_position = current.translation().to_array();
    let engine_previous_world_position = previous.map(|value| value.0.translation.to_array());
    let previous_world_position = trace.last_world_position;
    let world_delta = previous_world_position.map(|previous| {
        [
            world_position[0] - previous[0],
            world_position[1] - previous[1],
            world_position[2] - previous[2],
        ]
    });
    let world_delta_magnitude = world_delta
        .map(|delta| (delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]).sqrt());
    trace.samples.push(CaptureTransformTraceSample {
        elapsed_seconds: loop_state.elapsed,
        engine_previous_world_position,
        frame: loop_state.frame,
        previous_world_position,
        source_position: source.translation.to_array(),
        world_delta,
        world_delta_magnitude,
        world_position,
    });
    trace.last_world_position = Some(world_position);
    if trace.samples.len() > 3 {
        let excess = trace.samples.len() - 3;
        trace.samples.drain(0..excess);
    }
    if trace.capture_request.is_none()
        && let Some(capture) = config
            .captures
            .iter()
            .find(|capture| capture.requested_at_frame.is_some())
    {
        trace.capture_request = Some(CaptureTransformTraceRequest {
            assets_ready: capture.assets_ready_at_request.unwrap_or(false),
            issued_host_frame: capture.requested_at_frame.unwrap_or_default(),
            requested_frame: capture.request_frame,
            runtime_frame: loop_state.frame,
        });
    }
}

fn request_capture_redraw(config: Res<CaptureConfig>, mut redraw: EventWriter<RequestRedraw>) {
    if config.captures.iter().any(|capture| !capture.validated) {
        redraw.send(RequestRedraw);
    }
}

fn screenshot_is_valid(path: &Path) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };
    if metadata.len() < MIN_SCREENSHOT_BYTES {
        return false;
    }
    let image = match image::open(path) {
        Ok(image) => image,
        Err(_) => return false,
    };
    let mut peak_luma = 0u8;
    for (_, _, rgba) in image.pixels() {
        let luma = ((rgba[0] as u16 + rgba[1] as u16 + rgba[2] as u16) / 3) as u8;
        peak_luma = peak_luma.max(luma);
    }
    peak_luma >= MIN_SCREENSHOT_PEAK_LUMA
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transform_trace_options_are_removed_from_positional_capture_args() {
        let mut args = vec![
            "threenative_capture".to_owned(),
            "bundle".to_owned(),
            "camera.main".to_owned(),
            "frame.png".to_owned(),
            "120".to_owned(),
            "--transform-trace".to_owned(),
            "motion.marker".to_owned(),
            "trace.json".to_owned(),
        ];

        let trace = take_transform_trace_options(&mut args)
            .expect("trace option should parse")
            .expect("trace option should exist");

        assert_eq!(args.len(), 5);
        assert_eq!(trace.entity_id, "motion.marker");
        assert_eq!(trace.output_path, PathBuf::from("trace.json"));
    }

    #[test]
    fn viewport_options_are_optional_and_removed_without_changing_positional_capture_args() {
        let mut args = vec![
            "threenative_capture".to_owned(),
            "bundle".to_owned(),
            "camera.main".to_owned(),
            "frame.png".to_owned(),
            "120".to_owned(),
            "--viewport".to_owned(),
            "600".to_owned(),
            "900".to_owned(),
        ];

        let viewport = take_viewport_options(&mut args)
            .expect("viewport should parse")
            .unwrap();

        assert_eq!(args.len(), 5);
        assert_eq!((viewport.width, viewport.height), (600.0, 900.0));
        assert_eq!(
            take_viewport_options(&mut args).expect("omitted viewport"),
            None
        );
    }

    #[test]
    fn ui_state_options_are_removed_from_positional_capture_args() {
        let mut args = vec![
            "threenative_capture".to_owned(),
            "bundle".to_owned(),
            "camera.main".to_owned(),
            "frame.png".to_owned(),
            "--ui-state".to_owned(),
            "selected.item".to_owned(),
            "hover".to_owned(),
        ];

        let state = take_ui_state_options(&mut args)
            .expect("UI state should parse")
            .expect("UI state should exist");

        assert_eq!(args.len(), 4);
        assert_eq!(state.node_id, "selected.item");
        assert_eq!(state.state, CaptureUiState::Hover);
    }

    #[test]
    fn transform_trace_report_uses_the_durable_camel_case_contract() {
        let request = CaptureTransformTraceRequest {
            assets_ready: true,
            issued_host_frame: 120,
            requested_frame: 120,
            runtime_frame: 120,
        };
        let samples = vec![CaptureTransformTraceSample {
            elapsed_seconds: 2.0,
            engine_previous_world_position: Some([-0.07065, 1.22, -1.92]),
            frame: 120,
            previous_world_position: Some([-0.07065, 1.22, -1.92]),
            source_position: [0.0, 1.22, -1.92],
            world_delta: Some([0.07065, 0.0, 0.0]),
            world_delta_magnitude: Some(0.07065),
            world_position: [0.0, 1.22, -1.92],
        }];
        let report = CaptureTransformTraceReport {
            capture_request: Some(&request),
            entity_id: "motion.marker",
            fixed_delta_seconds: 1.0 / 60.0,
            history_source: "capture-harness-prior-rendered-sample",
            runtime: "bevy",
            samples: &samples,
            schema: "threenative.capture-transform-trace",
            version: "0.1.0",
        };

        let value = serde_json::to_value(report).expect("trace should serialize");
        assert_eq!(value["captureRequest"]["runtimeFrame"], 120);
        let previous_x = value["samples"][0]["previousWorldPosition"][0]
            .as_f64()
            .expect("previous x should be numeric");
        let magnitude = value["samples"][0]["worldDeltaMagnitude"]
            .as_f64()
            .expect("magnitude should be numeric");
        assert!((previous_x + 0.07065).abs() < 0.00001);
        assert!((magnitude - 0.07065).abs() < 0.00001);
    }
}
