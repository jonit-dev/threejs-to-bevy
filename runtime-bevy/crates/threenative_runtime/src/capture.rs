use std::{env, fs, path::PathBuf, process::ExitCode};

use bevy::{
    app::AppExit, prelude::*, render::view::screenshot::ScreenshotManager, window::PrimaryWindow,
};
use threenative_loader::load_bundle;
use threenative_runtime::{
    app_from_bundle, assets::TextureAssetControlsRegistry, environment::apply_environment_bookmark,
};

#[derive(Resource)]
struct CaptureConfig {
    captures: Vec<CaptureTarget>,
    max_frame: u32,
}

#[derive(Clone)]
struct CaptureTarget {
    captured: bool,
    output_path: PathBuf,
    request_frame: u32,
    texture_grace_frames: u32,
}

#[derive(Default, Resource)]
struct TextureAssetsReady(bool);

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
                captured: false,
                output_path: first_output,
                request_frame: first_frame,
                texture_grace_frames: first_frame.saturating_add(120),
            },
            CaptureTarget {
                captured: false,
                output_path: PathBuf::from(&args[5]),
                request_frame: second_frame,
                texture_grace_frames: second_frame.saturating_add(120),
            },
        ]
    } else {
        vec![CaptureTarget {
            captured: false,
            output_path: first_output,
            request_frame: first_frame,
            texture_grace_frames: first_frame.saturating_add(120),
        }]
    };
    let max_frame = captures
        .iter()
        .map(|capture| capture.request_frame)
        .max()
        .unwrap_or(first_frame)
        .saturating_add(780);

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
    app.insert_resource(CaptureConfig { captures, max_frame })
        .insert_resource(TextureAssetsReady::default())
        .add_systems(Update, (wait_for_texture_assets, request_screenshot));
    app.run();
    let missing = final_output_paths
        .iter()
        .filter(|path| {
            fs::metadata(path)
                .map(|metadata| metadata.len() == 0)
                .unwrap_or(true)
        })
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
        let handle: Handle<Image> = asset_server.load(control.path.clone());
        matches!(
            asset_server.load_state(&handle),
            bevy::asset::LoadState::Loaded
        )
    }) {
        ready.0 = true;
    }
}

fn request_screenshot(
    mut frame: Local<u32>,
    mut config: ResMut<CaptureConfig>,
    textures_ready: Res<TextureAssetsReady>,
    windows: Query<Entity, With<PrimaryWindow>>,
    mut screenshots: ResMut<ScreenshotManager>,
    mut exit: EventWriter<AppExit>,
) {
    *frame += 1;
    if let Ok(window) = windows.get_single() {
        for capture in &mut config.captures {
            let should_capture = textures_ready.0 || *frame >= capture.texture_grace_frames;
            if !capture.captured && *frame >= capture.request_frame && should_capture {
                if let Err(error) =
                    screenshots.save_screenshot_to_disk(window, &capture.output_path)
                {
                    error!("failed to request screenshot: {error}");
                    exit.send(AppExit::error());
                    return;
                }
                capture.captured = true;
            }
        }
    }

    let all_written = config.captures.iter().all(|capture| {
        capture.captured
            && fs::metadata(&capture.output_path)
                .map(|metadata| metadata.len() > 0)
                .unwrap_or(false)
    });
    if all_written {
        exit.send(AppExit::Success);
    } else if *frame >= config.max_frame {
        let pending = config
            .captures
            .iter()
            .filter(|capture| {
                !capture.captured
                    || fs::metadata(&capture.output_path)
                        .map(|metadata| metadata.len() == 0)
                        .unwrap_or(true)
            })
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
