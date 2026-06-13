use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::load_bundle;
use threenative_runtime::physics::detect_physics_events;

#[test]
fn physics_should_detect_collision_fixture() {
    let root = write_physics_bundle();
    let bundle = load_bundle(&root).expect("physics bundle should load");

    let events = detect_physics_events(&bundle);

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event, "CollisionEvent");
    assert_eq!(events[0].a, "enemy");
    assert_eq!(events[0].b, "player");

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_physics_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-physics-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    write(
        &root,
        "manifest.json",
        r#"{
  "schema": "threenative.bundle",
  "version": "0.1.0",
  "name": "physics",
  "entry": { "world": "world.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{
  "schema": "threenative.world",
  "version": "0.1.0",
  "entities": [
    {
      "id": "enemy",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "static" },
        "Transform": { "position": [0, 0, 0] }
      }
    },
    {
      "id": "player",
      "components": {
        "Collider": { "kind": "box", "size": [1, 1, 1] },
        "RigidBody": { "kind": "kinematic" },
        "Transform": { "position": [0.5, 0, 0] }
      }
    }
  ]
}"#,
    );
    write(
        &root,
        "assets.manifest.json",
        r#"{ "schema": "threenative.assets", "version": "0.1.0", "assets": [] }"#,
    );
    write(
        &root,
        "materials.ir.json",
        r#"{ "schema": "threenative.materials", "version": "0.1.0", "materials": [] }"#,
    );
    write(
        &root,
        "target.profile.json",
        r#"{ "schema": "threenative.target-profile", "version": "0.1.0", "targets": ["desktop"] }"#,
    );
    root
}

fn write(root: &PathBuf, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}
