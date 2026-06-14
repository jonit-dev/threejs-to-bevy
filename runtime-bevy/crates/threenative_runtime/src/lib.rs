use std::path::Path;

use bevy::prelude::*;
use thiserror::Error;
use threenative_components::ThreeNativeId;
use threenative_loader::{LoadError, LoadedBundle, TransformComponent, load_bundle};

pub mod assets;
pub mod audio;
pub mod conformance;
pub mod environment;
pub mod first_person;
pub mod input;
pub mod map_world;
pub mod physics;
pub mod rendering;
pub mod systems_context;
pub mod systems_effects;
pub mod systems_host;
pub mod systems_services;
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
    #[error(transparent)]
    Ui(#[from] ui::UiDiagnostic),
}

pub fn app_from_bundle(bundle_path: impl AsRef<Path>) -> Result<App, RuntimeError> {
    let mut bundle = load_bundle(bundle_path)?;
    systems_host::ensure_native_system_host_supported(&bundle)?;
    let has_scripts = bundle.manifest.entry.scripts.is_some();
    systems_host::run_native_systems_once(
        &mut bundle,
        systems_context::NativeSystemTimeSnapshot {
            delta: 1.0 / 60.0,
            dt: 1.0 / 60.0,
            elapsed: 1.0,
            fixed_delta: 1.0 / 60.0,
            fixed_dt: 1.0 / 60.0,
            paused: false,
        },
    )?;
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
    if let Some(ui) = bundle.ui.as_ref() {
        ui::map_ui_into_world(app.world_mut(), ui)?;
    }
    app.add_systems(Update, rendering::normalize_loaded_gltf_materials);
    if has_scripts {
        app.insert_resource(ScriptedRuntimeBundle { bundle });
        app.add_systems(Update, run_scripted_runtime_systems);
    }
    Ok(app)
}

#[derive(Resource)]
struct ScriptedRuntimeBundle {
    bundle: LoadedBundle,
}

fn run_scripted_runtime_systems(
    mut runtime: Option<ResMut<ScriptedRuntimeBundle>>,
    time: Res<Time>,
    mut transforms: Query<(&ThreeNativeId, &mut Transform)>,
) {
    let Some(ref mut runtime) = runtime else {
        return;
    };
    let delta = time.delta_seconds();
    let snapshot = systems_context::NativeSystemTimeSnapshot {
        delta,
        dt: delta,
        elapsed: time.elapsed_seconds(),
        fixed_delta: 1.0 / 60.0,
        fixed_dt: 1.0 / 60.0,
        paused: false,
    };

    if let Err(error) = systems_host::run_native_systems_once(&mut runtime.bundle, snapshot) {
        error!("{error}");
        return;
    }

    sync_scripted_transforms(&runtime.bundle, &mut transforms);
}

fn sync_scripted_transforms(
    bundle: &LoadedBundle,
    transforms: &mut Query<(&ThreeNativeId, &mut Transform)>,
) {
    for (stable_id, mut target) in transforms.iter_mut() {
        let Some(source) = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == stable_id.0)
            .and_then(|entity| entity.components.transform.as_ref())
        else {
            continue;
        };
        apply_transform_component(&mut target, source);
    }
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
