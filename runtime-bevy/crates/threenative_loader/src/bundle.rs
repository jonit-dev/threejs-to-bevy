use std::{fs, path::Path};

use serde::{Deserialize, de::DeserializeOwned};

use crate::{
    AnimationsIr, AssetsManifest, AudioIr, BundleManifest, EnvironmentSceneIr, GameFlowIr,
    GltfSceneMetadataIr, InputIr, InteractionsIr, LoadError, LoadedBundle, LocalDataIr,
    MaterialsIr, OverlaysIr, PrefabsIr, RuntimeConfigIr, ScenesIr, SchemaFileIr, SequencesIr,
    SystemsIr, TargetProfile, WorldIr, generated_mesh, paths,
};

macro_rules! read_optional_schema {
    ($bundle_path:expr, $file:expr, $type:ty) => {
        read_optional::<$type>($bundle_path, $file, |value| (&value.schema, &value.version))
    };
}

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
    let animations = read_optional_schema!(
        bundle_path,
        manifest.entry.animations.as_deref(),
        AnimationsIr
    )?;
    let component_schemas = read_optional_schema!(
        bundle_path,
        manifest.files.component_schemas.as_deref(),
        SchemaFileIr
    )?;
    let gltf_scene = read_optional_schema!(
        bundle_path,
        manifest.files.gltf_scene.as_deref(),
        GltfSceneMetadataIr
    )?;
    let input = read_optional_schema!(bundle_path, manifest.files.input.as_deref(), InputIr)?;
    let interactions = read_optional_schema!(
        bundle_path,
        manifest.entry.interactions.as_deref(),
        InteractionsIr
    )?;
    let local_data_path = manifest
        .entry
        .local_data
        .as_ref()
        .or(manifest.files.local_data.as_ref());
    let local_data = read_optional_schema!(
        bundle_path,
        local_data_path.map(String::as_str),
        LocalDataIr
    )?;
    let runtime_config = read_optional_schema!(
        bundle_path,
        manifest.files.runtime_config.as_deref(),
        RuntimeConfigIr
    )?;
    let systems = read_optional_schema!(bundle_path, manifest.entry.systems.as_deref(), SystemsIr)?;
    let ui = read_optional_schema!(bundle_path, manifest.entry.ui.as_deref(), crate::UiIr)?;
    let audio = read_optional_schema!(bundle_path, manifest.entry.audio.as_deref(), AudioIr)?;
    let environment_scene = read_optional_schema!(
        bundle_path,
        manifest.entry.environment_scene.as_deref(),
        EnvironmentSceneIr
    )?;
    let game_flow =
        read_optional_schema!(bundle_path, manifest.entry.game_flow.as_deref(), GameFlowIr)?;
    let overlays =
        read_optional_schema!(bundle_path, manifest.entry.overlays.as_deref(), OverlaysIr)?;
    let prefabs_path = manifest
        .entry
        .prefabs
        .as_ref()
        .or(manifest.files.prefabs.as_ref());
    let prefabs = read_optional_schema!(bundle_path, prefabs_path.map(String::as_str), PrefabsIr)?;
    let scenes = read_optional_schema!(bundle_path, manifest.entry.scenes.as_deref(), ScenesIr)?;
    let sequences = read_optional_schema!(
        bundle_path,
        manifest.entry.sequences.as_deref(),
        SequencesIr
    )?;

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

fn read_optional<T: DeserializeOwned>(
    bundle_path: &Path,
    file: Option<&str>,
    schema: impl for<'a> Fn(&'a T) -> (&'a str, &'a str),
) -> Result<Option<T>, LoadError> {
    let Some(file) = file else {
        return Ok(None);
    };
    let value = read_json(bundle_path, file)?;
    let (schema, version) = schema(&value);
    ensure_supported(schema, version)?;
    Ok(Some(value))
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
    unsupported_runtime_capability(&candidate)
}

fn unsupported_runtime_capability(candidate: &str) -> Option<UnsupportedCapabilityBoundary> {
    if contains_any(
        candidate,
        &[
            "cloud-save",
            "cloud-storage",
            "account-storage",
            "account-bound",
            "remote-save",
            "user-account",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_CLOUD_STORAGE_UNSUPPORTED",
            message: "Cloud save and account-bound storage are outside the current offline-first persistence contract.",
        });
    }
    if contains_any(
        candidate,
        &[
            "audio-decoder",
            "decoder-plugin",
            "custom-decoder",
            "decoder.custom",
            "codec.custom",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_DECODER_PLUGIN_UNSUPPORTED",
            message: "Executable or custom audio decoders are outside the portable audio contract.",
        });
    }
    if contains_any(
        candidate,
        &[
            "audio-stream",
            "streaming-audio",
            "audio.stream",
            "streaming-url",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_STREAMING_UNSUPPORTED",
            message: "Streaming audio is outside the current portable audio contract.",
        });
    }
    if contains_any(
        candidate,
        &[
            "network-audio",
            "audio-network",
            "audio.network",
            "webrtc-audio",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_AUDIO_NETWORK_UNSUPPORTED",
            message: "Network audio is outside the current portable audio contract.",
        });
    }
    unsupported_platform_capability(candidate)
}

fn unsupported_platform_capability(candidate: &str) -> Option<UnsupportedCapabilityBoundary> {
    if contains_any(
        candidate,
        &[
            "renderer-plugin",
            "runtime-plugin",
            "plugin-escape",
            "render-phase",
            "storage-buffer",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_RENDERER_PLUGIN_UNSUPPORTED",
            message: "Public renderer/runtime plugin escape hatches are not portable across web Three.js and native Bevy.",
        });
    }
    if contains_any(
        candidate,
        &[
            "network",
            "websocket",
            "replication",
            "collaboration",
            "online-service",
            "cloud-save",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_NETWORKING_UNSUPPORTED",
            message: "Online services, networking, replication, and collaboration are outside the current portable runtime contract.",
        });
    }
    if contains_any(
        candidate,
        &[
            "backend-only",
            "server-only",
            "server-rendered",
            "matchmaking-server",
            "authoritative-server",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_BACKEND_ONLY_UNSUPPORTED",
            message: "Backend-only features cannot be represented in a portable web/native runtime bundle.",
        });
    }
    if contains_any(
        candidate,
        &["sprite", "tilemap", "ldtk", "tiled", "2d-collision"],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_2D_WORKFLOW_UNSUPPORTED",
            message: "2D-only authoring workflows are outside the current ThreeNative 3D product scope.",
        });
    }
    if contains_any(
        candidate,
        &[
            "npm",
            "filesystem",
            "worker",
            "timer",
            "platform-api",
            "node-api",
        ],
    ) {
        return Some(UnsupportedCapabilityBoundary {
            code: "TN_IR_PLATFORM_API_UNSUPPORTED",
            message: "Arbitrary npm, filesystem, worker, timer, and platform APIs cannot be represented in portable IR.",
        });
    }

    None
}

fn contains_any(candidate: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| candidate.contains(needle))
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
