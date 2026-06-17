use bevy::prelude::*;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use threenative_loader::{UiIr, UiNodeIr, load_bundle};
use threenative_runtime::ui::{
    NativeUiRenderedTextStyle, diagnose_native_ui_visual_support, map_ui_into_world,
    trace_native_ui_text_styles,
};

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
    let title = entity_for(ui, app.world_mut(), "title");
    let rendered_style = app
        .world()
        .get::<NativeUiRenderedTextStyle>(title)
        .expect("rich text style metadata should be promoted");
    assert_eq!(rendered_style.spans.len(), 2);
    assert_eq!(rendered_style.spans[0].index, 0);
    assert_eq!(rendered_style.spans[0].text, "Paused");
    assert_eq!(rendered_style.spans[0].font_family.as_deref(), Some("menu"));
    assert_eq!(rendered_style.spans[0].font_size, Some(24.0));
    assert_eq!(rendered_style.spans[0].weight.as_deref(), Some("bold"));
    assert_eq!(
        rendered_style.spans[0].decoration.as_deref(),
        Some("underline")
    );
    assert_eq!(rendered_style.spans[1].font_family.as_deref(), Some("menu"));
    assert_eq!(rendered_style.spans[1].font_size, Some(18.0));
    let trace = trace_native_ui_text_styles(app.world_mut());
    assert_eq!(trace.styles.len(), 1);
    assert_eq!(trace.styles[0].node, "title");
    assert_eq!(trace.styles[0].spans.len(), 2);
    assert_eq!(trace.styles[0].spans[0].weight.as_deref(), Some("bold"));
    assert_eq!(
        trace.styles[0].spans[0].decoration.as_deref(),
        Some("underline")
    );
    let diagnostics = diagnose_native_ui_visual_support(ui);
    assert_eq!(
        diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code.as_str())
            .collect::<Vec<_>>(),
        vec!["TN_BEVY_UI_TEXT_ITALIC_UNSUPPORTED"],
    );
    assert_eq!(diagnostics[0].path, "ui.ir.json/root/spans/1/italic");

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
    let entity = entity_for(ui, world, id);
    world
        .get::<Text>(entity)
        .expect("text entity should have a text component")
}

fn entity_for(ui: &UiIr, world: &mut World, id: &str) -> Entity {
    let root = find_node(&ui.root, id).expect("node should exist");
    let mut query = world.query::<(Entity, &threenative_components::ThreeNativeId)>();
    query
        .iter(world)
        .find_map(|(entity, entity_id)| (entity_id.0 == root.id).then_some(entity))
        .expect("entity should exist")
}

fn find_node<'a>(node: &'a UiNodeIr, id: &str) -> Option<&'a UiNodeIr> {
    if node.id == id {
        return Some(node);
    }
    node.children.iter().find_map(|child| find_node(child, id))
}
