use bevy::render::{
    render_asset::RenderAssetUsages,
    render_resource::{Extent3d, TextureDimension, TextureFormat},
    texture::{Image, ImageSampler},
};
use threenative_loader::{
    AssetIr, AssetsManifest, EnvironmentInstanceIr, EnvironmentPathIr, EnvironmentSceneIr,
    EnvironmentSourceAssetIr,
};
use threenative_runtime::assets::{
    TextureAssetControls, apply_default_texture_quality, apply_texture_sampler_controls,
    resolve_asset_manifest, texture_asset_path, trace_asset_load_synchronization,
};

#[test]
fn assets_should_load_asset_manifest_entries() {
    let assets = AssetsManifest {
        schema: "threenative.assets".to_owned(),
        version: "0.1.0".to_owned(),
        assets: vec![AssetIr {
            id: "model.player".to_owned(),
            kind: "model".to_owned(),
            format: "glb".to_owned(),
            animation_graph: None,
            animations: None,
            attributes: None,
            binary_attributes: None,
            binary_indices: None,
            bounds: None,
            budget: None,
            center: None,
            fallback: None,
            generation: None,
            height: None,
            indices: None,
            mag_filter: None,
            masks: None,
            min_filter: None,
            morph_clips: None,
            morph_targets: None,
            offset: None,
            particle_emitters: None,
            primitive: None,
            path: Some("assets/player.glb".to_owned()),
            repeat: None,
            rotation: None,
            sample_count: None,
            skeleton: None,
            size: None,
            topology: None,
            usage: None,
            variants: None,
            width: None,
            wrap_s: None,
            wrap_t: None,
        }],
    };

    let resolved = resolve_asset_manifest(&assets);

    assert_eq!(
        resolved
            .get("model.player")
            .map(|asset| asset.path.as_str()),
        Some("assets/player.glb")
    );
}

#[test]
fn default_texture_quality_should_generate_mipmaps_for_loaded_gltf_textures() {
    let mut image = Image::new(
        Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        vec![255; 4 * 4 * 4],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );

    assert!(apply_default_texture_quality(&mut image));

    assert_eq!(image.texture_descriptor.mip_level_count, 3);
    assert!(matches!(
        image.sampler,
        ImageSampler::Descriptor(ref descriptor) if descriptor.anisotropy_clamp == 8
    ));
}

#[test]
fn texture_sampler_controls_should_generate_requested_mipmaps() {
    let mut image = Image::new(
        Extent3d {
            width: 4,
            height: 4,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        vec![255; 4 * 4 * 4],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    apply_texture_sampler_controls(
        &mut image,
        &TextureAssetControls {
            mag_filter: Some("linear".to_owned()),
            min_filter: Some("linearMipmapLinear".to_owned()),
            path: "assets/grid.png".to_owned(),
            wrap_s: Some("repeat".to_owned()),
            wrap_t: Some("repeat".to_owned()),
        },
    );

    assert_eq!(image.texture_descriptor.mip_level_count, 3);
    assert_eq!(image.data.len(), (4 * 4 * 4) + (2 * 2 * 4) + (4));
    assert!(matches!(
        image.sampler,
        ImageSampler::Descriptor(ref descriptor) if descriptor.anisotropy_clamp == 8
    ));
}

#[test]
fn texture_sampler_controls_should_generate_srgb_mipmaps_in_linear_light() {
    let mut image = Image::new(
        Extent3d {
            width: 2,
            height: 2,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        vec![
            0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
        ],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    );
    apply_texture_sampler_controls(
        &mut image,
        &TextureAssetControls {
            mag_filter: Some("linear".to_owned()),
            min_filter: Some("linearMipmapLinear".to_owned()),
            path: "assets/checker.png".to_owned(),
            wrap_s: Some("repeat".to_owned()),
            wrap_t: Some("repeat".to_owned()),
        },
    );

    assert_eq!(image.texture_descriptor.mip_level_count, 2);
    assert_eq!(&image.data[16..20], &[188, 188, 188, 255]);
}

#[test]
fn asset_load_trace_should_sort_assets_and_model_scene_refs_deterministically() {
    let assets = AssetsManifest {
        schema: "threenative.assets".to_owned(),
        version: "0.1.0".to_owned(),
        assets: vec![
            texture_asset_with_variant(),
            make_asset("model.tree.low", "model", "gltf", "assets/tree-low.gltf"),
            make_asset("model.tree", "model", "gltf", "assets/tree.gltf"),
        ],
    };
    let environment = EnvironmentSceneIr {
        schema: "threenative.environment-scene".to_owned(),
        version: "0.1.0".to_owned(),
        atmosphere: None,
        controller: None,
        environment_map: None,
        light_probes: Vec::new(),
        skybox: None,
        terrain: None,
        path: EnvironmentPathIr {
            id: "path.main".to_owned(),
            points: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
            width: 1.0,
            clearing_radius: None,
        },
        source_assets: vec![EnvironmentSourceAssetIr {
            id: "env.tree".to_owned(),
            asset: "model.tree".to_owned(),
            category: "tree".to_owned(),
            debug: None,
            lod: vec![threenative_loader::EnvironmentLodLevelIr {
                asset: "model.tree.low".to_owned(),
                fade: None,
                impostor: Some(threenative_loader::LodImpostorIr {
                    material: "mat.tree.impostor".to_owned(),
                    mode: "cameraFacingQuad".to_owned(),
                }),
                min_distance: 20.0,
                max_distance: 80.0,
            }],
            visibility: None,
        }],
        instances: vec![
            EnvironmentInstanceIr {
                id: "tree.b".to_owned(),
                source_asset: "env.tree".to_owned(),
                position: [1.0, 0.0, 0.0],
                rotation: None,
                scale: None,
                kind: Some("scatter".to_owned()),
                debug: None,
                tags: Vec::new(),
                visibility: None,
            },
            EnvironmentInstanceIr {
                id: "tree.a".to_owned(),
                source_asset: "env.tree".to_owned(),
                position: [0.0, 0.0, 0.0],
                rotation: None,
                scale: None,
                kind: Some("hero".to_owned()),
                debug: None,
                tags: Vec::new(),
                visibility: None,
            },
        ],
        scatter: Vec::new(),
        bookmarks: Vec::new(),
    };

    let trace = trace_asset_load_synchronization(&assets, Some(&environment));
    let json = serde_json::to_value(trace).expect("serialize trace");

    assert_eq!(
        json,
        serde_json::json!({
            "assets": [
                { "format": "gltf", "id": "model.tree", "kind": "model", "loadIndex": 0, "path": "assets/tree.gltf", "phase": "resolved" },
                { "format": "gltf", "id": "model.tree.low", "kind": "model", "loadIndex": 1, "path": "assets/tree-low.gltf", "phase": "resolved" },
                { "format": "png", "id": "texture.hero", "kind": "texture", "loadIndex": 2, "path": "assets/hero.png", "phase": "resolved" }
            ],
            "barrier": { "id": "bundle.requiredAssets", "modelSceneCount": 1, "status": "ready", "total": 3 },
            "gltfScenes": [
                {
                    "asset": "model.tree",
                    "category": "tree",
                    "impostors": [{ "asset": "model.tree.low", "material": "mat.tree.impostor", "mode": "cameraFacingQuad" }],
                    "instanceIds": ["tree.a", "tree.b"],
                    "lodAssets": ["model.tree.low"],
                    "sourceAsset": "env.tree"
                }
            ],
            "textureDelivery": [
                {
                    "fallback": "texture.hero",
                    "format": "png",
                    "id": "texture.hero",
                    "selectedPath": "assets/hero.png",
                    "variants": [{ "format": "ktx2", "path": "assets/hero.ktx2", "targets": ["desktop"] }]
                }
            ]
        })
    );
}

#[test]
fn texture_asset_paths_should_preserve_bundle_file_extensions() {
    let cases = [
        ("assets/nature/leaf.webp", Some("webp")),
        ("assets/nature/bark.png", Some("png")),
        ("assets/nature/grass.jpeg", Some("jpeg")),
        ("assets/nature/rock.jpg", Some("jpg")),
    ];

    for (path, extension) in cases {
        let asset_path = texture_asset_path(path);
        assert_eq!(asset_path.get_full_extension().as_deref(), extension);
        assert_eq!(asset_path.to_string(), path);
    }
}

fn make_asset(id: &str, kind: &str, format: &str, path: &str) -> AssetIr {
    AssetIr {
        id: id.to_owned(),
        kind: kind.to_owned(),
        format: format.to_owned(),
        animation_graph: None,
        animations: None,
        attributes: None,
        binary_attributes: None,
        binary_indices: None,
        bounds: None,
        budget: None,
        center: None,
        fallback: None,
        generation: None,
        height: None,
        indices: None,
        mag_filter: None,
        masks: None,
        min_filter: None,
        morph_clips: None,
        morph_targets: None,
        offset: None,
        particle_emitters: None,
        primitive: None,
        path: Some(path.to_owned()),
        repeat: None,
        rotation: None,
        sample_count: None,
        skeleton: None,
        size: None,
        topology: None,
        usage: None,
        variants: None,
        width: None,
        wrap_s: None,
        wrap_t: None,
    }
}

fn texture_asset_with_variant() -> AssetIr {
    let mut asset = make_asset("texture.hero", "texture", "png", "assets/hero.png");
    asset.fallback = Some("texture.hero".to_owned());
    asset.variants = Some(vec![threenative_loader::TextureVariantIr {
        fallback: None,
        format: "ktx2".to_owned(),
        path: "assets/hero.ktx2".to_owned(),
        targets: Some(vec!["desktop".to_owned()]),
    }]);
    asset
}
