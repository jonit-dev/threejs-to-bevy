use std::{fs, path::Path};

use serde::Deserialize;

use crate::{
    AnimationsIr, AssetsManifest, AudioIr, BundleManifest, EnvironmentSceneIr, InputIr, LoadError,
    GltfSceneMetadataIr, LoadedBundle, LocalDataIr, MaterialsIr, OverlaysIr, PrefabsIr,
    RuntimeConfigIr, ScenesIr, SchemaFileIr, SystemsIr, TargetProfile, WorldIr,
    generated_mesh, paths,
};

pub fn load_bundle(bundle_path: impl AsRef<Path>) -> Result<LoadedBundle, LoadError> {
    let requested_bundle_path = bundle_path.as_ref();
    let canonical_bundle_path =
        fs::canonicalize(requested_bundle_path).map_err(|source| LoadError::Read {
            path: requested_bundle_path.display().to_string(),
            source,
        })?;
    let bundle_path = canonical_bundle_path.as_path();
    let manifest: BundleManifest = read_json(bundle_path, "manifest.json")?;
    ensure_supported(&manifest.schema, &manifest.version)?;

    let world: WorldIr = read_json(bundle_path, &manifest.entry.world)?;
    ensure_supported(&world.schema, &world.version)?;
    let materials: MaterialsIr = read_json(bundle_path, &manifest.files.materials)?;
    ensure_supported(&materials.schema, &materials.version)?;
    let mut assets: AssetsManifest = read_json(bundle_path, &manifest.files.assets)?;
    ensure_supported(&assets.schema, &assets.version)?;
    hydrate_generated_mesh_assets(&mut assets, bundle_path)?;
    let target_profile: TargetProfile = read_json(bundle_path, &manifest.files.target_profile)?;
    ensure_target_profile_supported(&target_profile, &manifest.files.target_profile)?;
    let animations = match manifest.entry.animations.as_ref() {
        Some(file) => {
            let animations: AnimationsIr = read_json(bundle_path, file)?;
            ensure_supported(&animations.schema, &animations.version)?;
            Some(animations)
        }
        None => None,
    };
    let component_schemas = match manifest.files.component_schemas.as_ref() {
        Some(file) => {
            let schemas: SchemaFileIr = read_json(bundle_path, file)?;
            ensure_supported(&schemas.schema, &schemas.version)?;
            Some(schemas)
        }
        None => None,
    };
    let gltf_scene = match manifest.files.gltf_scene.as_ref() {
        Some(file) => {
            let metadata: GltfSceneMetadataIr = read_json(bundle_path, file)?;
            ensure_supported(&metadata.schema, &metadata.version)?;
            Some(metadata)
        }
        None => None,
    };
    let input = match manifest.files.input.as_ref() {
        Some(file) => {
            let input: InputIr = read_json(bundle_path, file)?;
            ensure_supported(&input.schema, &input.version)?;
            Some(input)
        }
        None => None,
    };
    let local_data_path = manifest
        .entry
        .local_data
        .as_ref()
        .or(manifest.files.local_data.as_ref());
    let local_data = match local_data_path {
        Some(file) => {
            let local_data: LocalDataIr = read_json(bundle_path, file)?;
            ensure_supported(&local_data.schema, &local_data.version)?;
            Some(local_data)
        }
        None => None,
    };
    let runtime_config = match manifest.files.runtime_config.as_ref() {
        Some(file) => {
            let config: RuntimeConfigIr = read_json(bundle_path, file)?;
            ensure_supported(&config.schema, &config.version)?;
            Some(config)
        }
        None => None,
    };
    let systems = match manifest.entry.systems.as_ref() {
        Some(file) => {
            let systems: SystemsIr = read_json(bundle_path, file)?;
            ensure_supported(&systems.schema, &systems.version)?;
            Some(systems)
        }
        None => None,
    };
    let ui = match manifest.entry.ui.as_ref() {
        Some(file) => {
            let ui: crate::UiIr = read_json(bundle_path, file)?;
            ensure_supported(&ui.schema, &ui.version)?;
            Some(ui)
        }
        None => None,
    };
    let audio = match manifest.entry.audio.as_ref() {
        Some(file) => {
            let audio: AudioIr = read_json(bundle_path, file)?;
            ensure_supported(&audio.schema, &audio.version)?;
            Some(audio)
        }
        None => None,
    };
    let environment_scene = match manifest.entry.environment_scene.as_ref() {
        Some(file) => {
            let scene: EnvironmentSceneIr = read_json(bundle_path, file)?;
            ensure_supported(&scene.schema, &scene.version)?;
            Some(scene)
        }
        None => None,
    };
    let overlays = match manifest.entry.overlays.as_ref() {
        Some(file) => {
            let overlays: OverlaysIr = read_json(bundle_path, file)?;
            ensure_supported(&overlays.schema, &overlays.version)?;
            Some(overlays)
        }
        None => None,
    };
    let prefabs_path = manifest
        .entry
        .prefabs
        .as_ref()
        .or(manifest.files.prefabs.as_ref());
    let prefabs = match prefabs_path {
        Some(file) => {
            let prefabs: PrefabsIr = read_json(bundle_path, file)?;
            ensure_supported(&prefabs.schema, &prefabs.version)?;
            Some(prefabs)
        }
        None => None,
    };
    let scenes = match manifest.entry.scenes.as_ref() {
        Some(file) => {
            let scenes: ScenesIr = read_json(bundle_path, file)?;
            ensure_supported(&scenes.schema, &scenes.version)?;
            Some(scenes)
        }
        None => None,
    };

    Ok(LoadedBundle {
        animations,
        bundle_path: canonical_bundle_path,
        assets,
        audio,
        component_schemas,
        environment_scene,
        gltf_scene,
        input,
        local_data,
        manifest,
        materials,
        overlays,
        prefabs,
        runtime_config,
        scenes,
        systems,
        target_profile,
        ui,
        world,
    })
}

fn hydrate_generated_mesh_assets(
    assets: &mut AssetsManifest,
    bundle_path: &Path,
) -> Result<(), LoadError> {
    generated_mesh::hydrate_generated_mesh_assets(assets, bundle_path)
}

fn read_json<T: for<'de> Deserialize<'de>>(bundle_path: &Path, file: &str) -> Result<T, LoadError> {
    let path = paths::resolve_bundle_file(bundle_path, file)?;
    let contents = fs::read_to_string(&path).map_err(|source| LoadError::Read {
        path: path.display().to_string(),
        source,
    })?;
    serde_json::from_str(&contents).map_err(|source| LoadError::Parse {
        path: path.display().to_string(),
        source,
    })
}

fn ensure_supported(schema: &str, version: &str) -> Result<(), LoadError> {
    if version.split('.').next() == Some("0") {
        return Ok(());
    }

    Err(LoadError::UnsupportedVersion {
        schema: schema.to_owned(),
        version: version.to_owned(),
    })
}

fn ensure_target_profile_supported(profile: &TargetProfile, path: &str) -> Result<(), LoadError> {
    const TARGET_PROFILE_SCHEMA: &str = "threenative.target-profile";
    const TARGET_PROFILE_VERSION: &str = "0.1.0";
    const SUPPORTED_TARGETS: &[&str] = &["desktop", "web"];

    if profile.schema != TARGET_PROFILE_SCHEMA || profile.version != TARGET_PROFILE_VERSION {
        return Err(LoadError::UnsupportedVersion {
            schema: profile.schema.clone(),
            version: profile.version.clone(),
        });
    }

    for (index, target) in profile.targets.iter().enumerate() {
        if !SUPPORTED_TARGETS.contains(&target.as_str()) {
            return Err(LoadError::UnsupportedTargetProfileTarget {
                path: format!("{path}/targets/{index}"),
                target: target.clone(),
            });
        }
    }

    Ok(())
}
