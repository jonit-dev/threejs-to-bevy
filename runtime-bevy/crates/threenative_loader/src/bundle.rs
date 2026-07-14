use std::{fs, path::Path};

use serde::Deserialize;

use crate::{
    AnimationsIr, AssetsManifest, AudioIr, BundleManifest, EnvironmentSceneIr, GameFlowIr,
    GltfSceneMetadataIr, InputIr, InteractionsIr, LoadError, LoadedBundle, LocalDataIr,
    MaterialsIr, OverlaysIr, PrefabsIr, RuntimeConfigIr, ScenesIr, SchemaFileIr, SequencesIr,
    SystemsIr, TargetProfile, WorldIr, generated_mesh, paths,
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
    ensure_required_capabilities_supported(&manifest)?;

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
    let interactions = match manifest.entry.interactions.as_ref() {
        Some(file) => {
            let interactions: InteractionsIr = read_json(bundle_path, file)?;
            ensure_supported(&interactions.schema, &interactions.version)?;
            Some(interactions)
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
    let game_flow = match manifest.entry.game_flow.as_ref() {
        Some(file) => {
            let flow: GameFlowIr = read_json(bundle_path, file)?;
            ensure_supported(&flow.schema, &flow.version)?;
            Some(flow)
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
    let sequences = match manifest.entry.sequences.as_ref() {
        Some(file) => {
            let sequences: SequencesIr = read_json(bundle_path, file)?;
            ensure_supported(&sequences.schema, &sequences.version)?;
            Some(sequences)
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
        game_flow,
        gltf_scene,
        input,
        interactions,
        local_data,
        manifest,
        materials,
        overlays,
        prefabs,
        runtime_config,
        scenes,
        sequences,
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

fn ensure_required_capabilities_supported(manifest: &BundleManifest) -> Result<(), LoadError> {
    for (domain, values) in &manifest.required_capabilities {
        let mut candidates =
            std::iter::once(domain.as_str()).chain(values.iter().map(String::as_str));
        if let Some((candidate, boundary)) = candidates.find_map(|candidate| {
            unsupported_capability(candidate).map(|boundary| (candidate, boundary))
        }) {
            return Err(LoadError::UnsupportedCapability {
                path: format!("manifest.json/requiredCapabilities/{domain}"),
                capability: candidate.to_owned(),
                code: boundary.code.to_owned(),
                message: boundary.message.to_owned(),
            });
        }
    }

    Ok(())
}

struct UnsupportedCapabilityBoundary {
    code: &'static str,
    message: &'static str,
}

fn unsupported_capability(candidate: &str) -> Option<UnsupportedCapabilityBoundary> {
    let candidate = candidate.to_ascii_lowercase();
    let contains_any = |needles: &[&str]| needles.iter().any(|needle| candidate.contains(needle));

    if has_capability_segment(&candidate, "bevy") || candidate.contains("native-authoring") {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_NATIVE_AUTHORING_UNSUPPORTED",
            message: "Direct Bevy/native authoring is outside the portable ThreeNative IR boundary.",
        });
    }
    if has_capability_segment(&candidate, "three")
        || candidate.contains("raw-three")
        || has_capability_segment(&candidate, "threejs")
    {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_RAW_THREE_SOURCE_UNSUPPORTED",
            message: "Raw Three.js authoring cannot be the source of truth for a portable bundle.",
        });
    }
    if contains_any(&[
        "cloud-save",
        "cloud-storage",
        "account-storage",
        "account-bound",
        "remote-save",
        "user-account",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_CLOUD_STORAGE_UNSUPPORTED",
            message: "Cloud save and account-bound storage are outside the current offline-first persistence contract.",
        });
    }
    if contains_any(&[
        "audio-decoder",
        "decoder-plugin",
        "custom-decoder",
        "decoder.custom",
        "codec.custom",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_DECODER_PLUGIN_UNSUPPORTED",
            message: "Executable or custom audio decoders are outside the portable audio contract.",
        });
    }
    if contains_any(&[
        "audio-stream",
        "streaming-audio",
        "audio.stream",
        "streaming-url",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_STREAMING_UNSUPPORTED",
            message: "Streaming audio is outside the current portable audio contract.",
        });
    }
    if contains_any(&[
        "network-audio",
        "audio-network",
        "audio.network",
        "webrtc-audio",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_NETWORK_UNSUPPORTED",
            message: "Network audio is outside the current portable audio contract.",
        });
    }
    if contains_any(&[
        "renderer-plugin",
        "runtime-plugin",
        "plugin-escape",
        "render-phase",
        "storage-buffer",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_RENDERER_PLUGIN_UNSUPPORTED",
            message: "Public renderer/runtime plugin escape hatches are not portable across web Three.js and native Bevy.",
        });
    }
    if contains_any(&[
        "network",
        "websocket",
        "replication",
        "collaboration",
        "online-service",
        "cloud-save",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_NETWORKING_UNSUPPORTED",
            message: "Online services, networking, replication, and collaboration are outside the current portable runtime contract.",
        });
    }
    if contains_any(&[
        "backend-only",
        "server-only",
        "server-rendered",
        "matchmaking-server",
        "authoritative-server",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_BACKEND_ONLY_UNSUPPORTED",
            message: "Backend-only features cannot be represented in a portable web/native runtime bundle.",
        });
    }
    if contains_any(&["sprite", "tilemap", "ldtk", "tiled", "2d-collision"]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_2D_WORKFLOW_UNSUPPORTED",
            message: "2D-only authoring workflows are outside the current ThreeNative 3D product scope.",
        });
    }
    if contains_any(&[
        "npm",
        "filesystem",
        "worker",
        "timer",
        "platform-api",
        "node-api",
    ]) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_PLATFORM_API_UNSUPPORTED",
            message: "Arbitrary npm, filesystem, worker, timer, and platform APIs cannot be represented in portable IR.",
        });
    }

    None
}

fn has_capability_segment(candidate: &str, segment: &str) -> bool {
    candidate
        .split(['.', ':', '/', '-'])
        .any(|part| part == segment)
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
