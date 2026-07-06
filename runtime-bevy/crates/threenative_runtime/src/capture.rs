use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{self, ExitCode},
    thread,
    time::{Duration, Instant},
};

use bevy::{
    app::AppExit,
    prelude::*,
    render::view::screenshot::ScreenshotManager,
    ui::IsDefaultUiCamera,
    window::{PrimaryWindow, RequestRedraw},
    winit::{UpdateMode, WinitSettings},
};
use image::GenericImageView;
use threenative_loader::{AssetsManifest, load_bundle};
use threenative_runtime::{
    app_from_bundle,
    assets::{TextureAssetControlsRegistry, load_texture_asset},
    environment::apply_environment_bookmark,
};

const MIN_CAPTURE_FRAME: u32 = 2;
const SCREENSHOT_VALIDATION_DELAY_FRAMES: u32 = 4;
const SCREENSHOT_ATTEMPT_TIMEOUT_FRAMES: u32 = 30;
const MAX_CAPTURE_RETRIES: u32 = 5;
const MIN_SCREENSHOT_BYTES: u64 = 1_024;
const MIN_SCREENSHOT_PEAK_LUMA: u8 = 35;
const ASSET_READINESS_GRACE: Duration = Duration::from_secs(3);

#[derive(Resource)]
struct CaptureConfig {
    captures: Vec<CaptureTarget>,
    max_frame: u32,
}

#[derive(Clone)]
struct CaptureTarget {
    output_path: PathBuf,
    request_frame: u32,
    requested_at_frame: Option<u32>,
    retry_count: u32,
    validated: bool,
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
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 4 && args.len() != 5 && args.len() != 7 {
        eprintln!(
            "Usage: threenative_capture <bundle-path> <bookmark-id> <output-png> [request-frame] [<output-png-2> <request-frame-2>]"
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
                output_path: first_output,
                request_frame: first_frame,
                requested_at_frame: None,
                retry_count: 0,
                validated: false,
            },
            CaptureTarget {
                output_path: PathBuf::from(&args[5]),
                request_frame: second_frame,
                requested_at_frame: None,
                retry_count: 0,
                validated: false,
            },
        ]
    } else {
        vec![CaptureTarget {
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
        .saturating_add(180);

    let bundle = match load_bundle(bundle_path) {
        Ok(bundle) => bundle,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    let mut app = match app_from_bundle(bundle_path) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };

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
    for capture in &captures {
        if let Err(code) = prepare_output_path(&capture.output_path) {
            return code;
        }
    }

    let final_output_paths = captures
        .iter()
        .map(|capture| capture.output_path.clone())
        .collect::<Vec<_>>();
    spawn_capture_completion_exit(final_output_paths.clone());
    let required_model_assets = app
        .world()
        .get_resource::<AssetServer>()
        .map(|asset_server| required_model_assets(asset_server, &bundle.assets))
        .unwrap_or_default();
    app.insert_resource(CaptureConfig {
        captures,
        max_frame,
    })
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

fn spawn_capture_completion_exit(paths: Vec<PathBuf>) {
    thread::spawn(move || {
        loop {
            if paths.iter().all(|path| screenshot_is_valid(path)) {
                process::exit(0);
            }
            thread::sleep(Duration::from_millis(25));
        }
    });
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
) -> RequiredModelAssets {
    RequiredModelAssets(
        manifest
            .assets
            .iter()
            .filter(|asset| asset.kind == "model")
            .filter_map(|asset| asset.path.clone())
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
