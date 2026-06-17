use bevy::prelude::*;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use threenative_loader::{load_bundle, UiIr, UiNodeIr};
use threenative_runtime::ui::{diagnose_native_ui_visual_support, map_ui_into_world};

#[test]
fn should_map_rich_text_sections_to_bevy_text_bundles() {
    let root = write_rich_text_bundle();
    let bundle = load_bundle(&root).expect("bundle should load");
    let ui = bundle.ui.as_ref().expect("ui should load");
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.init_resource::<Assets<Font>>();

    map_ui_into_world(app.world_mut(), ui).expect("ui should map");

    let text = text_for(ui, app.world_mut(), "title");
    assert_eq!(text.sections.len(), 2);
    assert_eq!(text.sections[0].value, "Paused");
    assert_eq!(text.sections[0].style.font_size, 24.0);
    assert_eq!(text.sections[1].value, "!");
    assert_eq!(text.sections[1].style.font_size, 18.0);
    let diagnostics = diagnose_native_ui_visual_support(ui);
    assert_eq!(
        diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code.as_str())
            .collect::<Vec<_>>(),
        vec![
            "TN_BEVY_UI_TEXT_WEIGHT_UNSUPPORTED",
            "TN_BEVY_UI_TEXT_DECORATION_UNSUPPORTED",
            "TN_BEVY_UI_TEXT_ITALIC_UNSUPPORTED",
        ],
    );
    assert_eq!(diagnostics[0].path, "ui.ir.json/root/spans/0/weight");

    std::fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_rich_text_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-ui-rich-text-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    write(
        &root,
        "manifest.json",
        r#"{ "schema": "threenative.bundle", "version": "0.1.0", "name": "native-ui-rich-text", "entry": { "world": "world.ir.json", "ui": "ui.ir.json" }, "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }, "requiredCapabilities": {} }"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write(
        &root,
        "ui.ir.json",
        r##"{ "schema": "threenative.ui", "version": "0.1.0", "fonts": [{ "asset": "assets/fonts/menu.ttf", "family": "menu" }], "root": { "id": "title", "kind": "text", "spans": [{ "text": "Paused", "fontFamily": "menu", "fontSize": 24, "color": "#ffffff", "weight": "bold", "decoration": "underline" }, { "text": "!", "fontFamily": "menu", "fontSize": 18, "color": "#ffcc00", "italic": true }] } }"##,
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

fn text_for<'a>(ui: &UiIr, world: &'a mut World, id: &str) -> &'a Text {
    let root = find_node(&ui.root, id).expect("node should exist");
    let mut query = world.query::<(&threenative_components::ThreeNativeId, &Text)>();
    query
        .iter(world)
        .find_map(|(entity_id, text)| (entity_id.0 == root.id).then_some(text))
        .expect("text entity should exist")
}

fn find_node<'a>(node: &'a UiNodeIr, id: &str) -> Option<&'a UiNodeIr> {
    if node.id == id {
        return Some(node);
    }
    node.children.iter().find_map(|child| find_node(child, id))
}
