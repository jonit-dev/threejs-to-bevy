use std::path::Path;

use bevy::prelude::*;
use thiserror::Error;
use threenative_loader::{LoadError, load_bundle};

pub mod map_world;
pub mod conformance;
pub mod assets;
pub mod audio;
pub mod environment;
pub mod first_person;
pub mod input;
pub mod physics;
pub mod rendering;
pub mod systems_host;
pub mod ui;
pub mod walkability;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error(transparent)]
    Load(#[from] LoadError),
    #[error(transparent)]
    Map(#[from] map_world::MapError),
    #[error(transparent)]
    SystemsHost(#[from] systems_host::SystemsHostError),
}

pub fn app_from_bundle(bundle_path: impl AsRef<Path>) -> Result<App, RuntimeError> {
    let bundle = load_bundle(bundle_path)?;
    systems_host::ensure_native_system_host_supported(&bundle)?;
    let asset_root = bundle.bundle_path.display().to_string();
    let window = bundle.runtime_config.as_ref().map(|config| &config.window);
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
    map_world::map_bundle_into_world(app.world_mut(), &bundle)?;
    environment::map_environment_into_world(app.world_mut(), &bundle);
    app.add_systems(Update, rendering::normalize_loaded_gltf_materials);
    Ok(app)
}
