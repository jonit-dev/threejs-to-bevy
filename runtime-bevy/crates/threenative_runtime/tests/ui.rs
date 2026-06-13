use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use threenative_loader::{load_bundle, UiIr, UiNodeIr};
use threenative_runtime::ui::build_native_ui;

#[test]
fn ui_should_build_bevy_hud_from_ui_ir() {
    let root = write_ui_bundle();
    let bundle = load_bundle(&root).expect("ui bundle should load");
    let ui = bundle.ui.as_ref().expect("ui ir should be loaded");

    let native = build_native_ui(ui).expect("ui should build");

    assert_eq!(native.kind, "column");
    assert_eq!(
        native
            .children
            .iter()
            .map(|node| node.kind.as_str())
            .collect::<Vec<_>>(),
        vec!["text", "bar", "button"]
    );
    assert_eq!(native.children[2].action.as_deref(), Some("Pause"));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_should_reject_unsupported_ui_node() {
    let ui = UiIr {
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
        root: UiNodeIr {
            action: None,
            children: Vec::new(),
            focusable: None,
            id: "bad".to_owned(),
            kind: "html".to_owned(),
            label: None,
            max: None,
            text: None,
            value: None,
        },
    };

    let diagnostic = build_native_ui(&ui).expect_err("unsupported node should fail");

    assert_eq!(diagnostic.code, "TN_BEVY_UI_NODE_UNSUPPORTED");
    assert!(diagnostic.message.contains("html"));
}

fn write_ui_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-ui-{}",
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
  "name": "ui",
  "entry": { "world": "world.ir.json", "ui": "ui.ir.json" },
  "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }
}"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write(
        &root,
        "ui.ir.json",
        r#"{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "root": {
    "id": "hud",
    "kind": "column",
    "children": [
      { "id": "label", "kind": "text", "text": "Health" },
      { "id": "health", "kind": "bar", "value": 8, "max": 10 },
      { "id": "pause", "kind": "button", "label": "Pause", "action": "Pause" }
    ]
  }
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
