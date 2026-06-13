use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::rendering::observe_atmosphere;

#[test]
fn rendering_should_map_atmosphere_profile_to_bevy_observation() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "atmosphere",
          "entry": { "world": "world.ir.json", "environmentScene": "environment.scene.json" },
          "files": {
            "assets": "assets.manifest.json",
            "materials": "materials.ir.json",
            "targetProfile": "target.profile.json"
          }
        }"#,
    );
    write_json(&root, "world.ir.json", r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#);
    write_json(&root, "assets.manifest.json", r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#);
    write_json(&root, "materials.ir.json", r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#);
    write_json(&root, "target.profile.json", r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#);
    write_json(
        &root,
        "environment.scene.json",
        r##"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "atmosphere": {
            "active": true,
            "id": "atmosphere.forest",
            "sun": { "id": "sun.forest", "direction": [-0.4, -0.8, -0.2], "color": "#ffd39a", "intensity": 3.2, "castsShadow": true },
            "ambient": { "color": "#8fb2a5", "intensity": 0.8, "mode": "constant" },
            "fog": { "enabled": true, "mode": "exponential", "color": "#9eb6aa", "density": 0.028 },
            "sky": { "color": "#9eb6aa" },
            "colorManagement": { "exposure": 1.05, "outputColorSpace": "srgb", "textureColorSpace": "srgb", "toneMapping": "aces" },
            "shadows": { "enabled": true, "mapSize": 1024, "maxDistance": 45, "cascadeCount": 1, "bias": -0.0005, "normalBias": 0.02, "receiverPolicy": "terrain-and-path" }
          },
          "path": { "id": "path.main", "points": [[0, 0, 0], [0, 0, 1]], "width": 2 },
          "sourceAssets": [],
          "instances": []
        }"##,
    );

    let bundle = load_bundle(&root).expect("atmosphere bundle should load");
    let observation = observe_atmosphere(&bundle);

    assert_eq!(observation.profile_id.as_deref(), Some("atmosphere.forest"));
    assert_eq!(observation.fog_mode.as_deref(), Some("exponential"));
    assert_eq!(observation.shadow_map_size, Some(1024));
    assert_eq!(observation.diagnostics, Vec::<String>::new());

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-atmosphere-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}
