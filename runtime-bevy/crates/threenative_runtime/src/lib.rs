use std::path::Path;

use bevy::prelude::*;
use thiserror::Error;
use threenative_loader::{LoadError, load_bundle};

pub mod map_world;
pub mod conformance;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error(transparent)]
    Load(#[from] LoadError),
    #[error(transparent)]
    Map(#[from] map_world::MapError),
}

pub fn app_from_bundle(bundle_path: impl AsRef<Path>) -> Result<App, RuntimeError> {
    let bundle = load_bundle(bundle_path)?;
    let mut app = App::new();
    app.insert_resource(ClearColor(Color::srgb(
        17.0 / 255.0,
        19.0 / 255.0,
        24.0 / 255.0,
    )))
    .add_plugins(DefaultPlugins.set(WindowPlugin {
        primary_window: Some(Window {
            resolution: (1280.0, 720.0).into(),
            title: "ThreeNative Bevy Preview".to_owned(),
            ..Default::default()
        }),
        ..Default::default()
    }));
    map_world::map_bundle_into_world(app.world_mut(), &bundle)?;
    Ok(app)
}
