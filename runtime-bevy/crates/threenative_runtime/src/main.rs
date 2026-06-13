use std::{env, process::ExitCode};

use threenative_runtime::app_from_bundle;

fn main() -> ExitCode {
    let Some(bundle_path) = env::args().nth(1) else {
        eprintln!("Usage: threenative_runtime <bundle-path>");
        return ExitCode::from(2);
    };

    match app_from_bundle(bundle_path) {
        Ok(mut app) => {
            app.run();
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}
