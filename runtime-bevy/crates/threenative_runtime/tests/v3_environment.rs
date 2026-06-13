use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::environment::observe_environment;

#[test]
fn v3_environment_should_load_bookmarked_bundle() {
    let root = temp_bundle_dir();
    write_json(
        &root,
        "manifest.json",
        r#"{
          "schema": "threenative.bundle",
          "version": "0.1.0",
          "name": "v3-environment",
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
        r#"{
          "schema": "threenative.environment-scene",
          "version": "0.1.0",
          "terrain": { "id": "terrain.forest", "heightMode": "flat", "bounds": { "min": [-5, 0, -5], "max": [5, 0, 5] } },
          "path": { "id": "path.main", "points": [[0, 0, 3], [0, 0, -3]], "width": 2 },
          "sourceAssets": [],
          "instances": [],
          "bookmarks": [{ "id": "bookmark.entry", "position": [0, 1.7, 4], "yaw": 180, "pitch": -5, "expectedTags": [] }]
        }"#,
    );

    let bundle = load_bundle(&root).expect("v3 environment bundle should load");
    let observation = observe_environment(&bundle).expect("v3 environment observation should exist");

    assert_eq!(observation.bookmark_ids, vec!["bookmark.entry"]);
    assert_eq!(observation.terrain_id.as_deref(), Some("terrain.forest"));

    fs::remove_dir_all(root).expect("temp bundle should be removed");
}

fn temp_bundle_dir() -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be after epoch")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("tn-v3-environment-loader-{stamp}"));
    fs::create_dir_all(&path).expect("temp bundle dir should be created");
    path
}

fn write_json(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle json should be written");
}
