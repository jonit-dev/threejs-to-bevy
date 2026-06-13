use std::{env, fs, path::PathBuf, process::ExitCode};

use bevy::{
    app::AppExit, prelude::*, render::view::screenshot::ScreenshotManager, window::PrimaryWindow,
};
use threenative_loader::load_bundle;
use threenative_runtime::{app_from_bundle, environment::apply_environment_bookmark};

#[derive(Resource)]
struct CaptureConfig {
    output_path: PathBuf,
    request_frame: u32,
    max_frame: u32,
}

fn main() -> ExitCode {
    let args = env::args().collect::<Vec<_>>();
    if args.len() != 4 {
        eprintln!("Usage: threenative_capture <bundle-path> <bookmark-id> <output-png>");
        return ExitCode::from(2);
    }

    let bundle_path = &args[1];
    let bookmark_id = &args[2];
    let output_path = PathBuf::from(&args[3]);
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

    if !apply_environment_bookmark(app.world_mut(), &bundle, bookmark_id) {
        eprintln!("bookmark '{bookmark_id}' was not found or no camera could be updated");
        return ExitCode::from(1);
    }
    if let Err(error) = fs::remove_file(&output_path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!(
                "failed to remove existing screenshot '{}': {error}",
                output_path.display()
            );
            return ExitCode::from(1);
        }
    }

    app.insert_resource(CaptureConfig {
        output_path,
        request_frame: 120,
        max_frame: 900,
    })
    .add_systems(Update, request_screenshot);
    app.run();
    ExitCode::SUCCESS
}

fn request_screenshot(
    mut frame: Local<u32>,
    mut requested: Local<bool>,
    config: Res<CaptureConfig>,
    windows: Query<Entity, With<PrimaryWindow>>,
    mut screenshots: ResMut<ScreenshotManager>,
    mut exit: EventWriter<AppExit>,
) {
    *frame += 1;
    if *frame >= config.request_frame && !*requested {
        *requested = true;
        if let Ok(window) = windows.get_single() {
            if let Err(error) = screenshots.save_screenshot_to_disk(window, &config.output_path) {
                error!("failed to request screenshot: {error}");
                exit.send(AppExit::error());
            }
        }
    }
    if *requested
        && fs::metadata(&config.output_path)
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false)
    {
        exit.send(AppExit::Success);
    } else if *frame >= config.max_frame {
        error!(
            "screenshot was not written before frame {}: {}",
            config.max_frame,
            config.output_path.display()
        );
        exit.send(AppExit::error());
    }
}
