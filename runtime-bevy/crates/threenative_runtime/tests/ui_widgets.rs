use bevy::prelude::*;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use threenative_components::ThreeNativeId;
use threenative_loader::load_bundle;
use threenative_runtime::ui::{
    NativeUiActionEvent, NativeUiActionQueue, NativeUiImageMetadata, dispatch_native_ui_actions,
    map_ui_into_world, trace_native_ui_image_rendering,
};

#[test]
fn should_activate_context_menu_item_with_keyboard_focus() {
    let root = write_widget_bundle();
    let bundle = load_bundle(&root).expect("bundle should load");
    let ui = bundle.ui.as_ref().expect("ui should load");
    let mut app = App::new();
    app.init_resource::<NativeUiActionQueue>();
    app.add_systems(Update, dispatch_native_ui_actions);

    map_ui_into_world(app.world_mut(), ui).expect("ui should map");
    let equip = ui_entity(app.world_mut(), "equip");
    let frame = ui_entity(app.world_mut(), "frame");
    let frame_image = app
        .world()
        .get::<NativeUiImageMetadata>(frame)
        .expect("image metadata should map to native component");
    assert_eq!(frame_image.atlas, Some((4.0, 8.0, 32.0, 16.0)));
    assert_eq!(frame_image.nine_slice, Some((4.0, 4.0, 4.0, 4.0)));
    assert_eq!(frame_image.scale_mode, Some("stretch".to_owned()));
    assert!(frame_image.flip_x);
    let tile = ui_entity(app.world_mut(), "tile");
    let tile_image = app
        .world()
        .get::<NativeUiImageMetadata>(tile)
        .expect("tiled image metadata should map to native component");
    assert_eq!(tile_image.tile_size, Some((16.0, 16.0)));
    assert_eq!(tile_image.tint.as_deref(), Some("#44aa88cc"));
    assert!(tile_image.flip_y);
    let image_trace = trace_native_ui_image_rendering(app.world_mut());
    assert_eq!(image_trace.images.len(), 2);
    assert_eq!(image_trace.images[0].node, "frame");
    assert_eq!(
        image_trace.images[0].src.as_deref(),
        Some("assets/ui/frame.png")
    );
    assert_eq!(
        image_trace.images[0].atlas.as_ref().map(|atlas| atlas.x),
        Some(4.0)
    );
    assert!(image_trace.images[0].nine_slice.is_some());
    assert_eq!(image_trace.images[1].node, "tile");
    assert_eq!(
        image_trace.images[1]
            .tile_size
            .as_ref()
            .map(|size| size.width),
        Some(16.0)
    );
    assert!(image_trace.images[1].flip_y);

    app.world_mut()
        .entity_mut(equip)
        .insert(Interaction::Pressed);
    app.update();

    assert_eq!(
        app.world().resource::<NativeUiActionQueue>().events,
        vec![NativeUiActionEvent {
            action: "Equip".to_owned(),
            node: "equip".to_owned(),
            value: None,
        }],
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

fn write_widget_bundle() -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "tn-ui-widgets-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&root).expect("temporary bundle directory should be created");
    write(
        &root,
        "manifest.json",
        r#"{ "schema": "threenative.bundle", "version": "0.1.0", "name": "native-ui-widgets", "entry": { "world": "world.ir.json", "ui": "ui.ir.json" }, "files": { "assets": "assets.manifest.json", "materials": "materials.ir.json", "targetProfile": "target.profile.json" }, "requiredCapabilities": {} }"#,
    );
    write(
        &root,
        "world.ir.json",
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [] }"#,
    );
    write(
        &root,
        "ui.ir.json",
        r##"{ "schema": "threenative.ui", "version": "0.1.0", "root": { "id": "menu", "kind": "contextMenu", "anchorId": "slot-1", "accessibilityLabel": "Item actions", "children": [{ "id": "equip", "kind": "button", "label": "Equip", "action": "Equip", "focusable": true }, { "id": "frame", "kind": "image", "src": "assets/ui/frame.png", "accessibilityLabel": "Inventory frame", "image": { "atlas": { "x": 4, "y": 8, "width": 32, "height": 16 }, "flipX": true, "nineSlice": { "top": 4, "right": 4, "bottom": 4, "left": 4 }, "scaleMode": "stretch", "sourceSize": { "width": 64, "height": 32 } } }, { "id": "tile", "kind": "image", "src": "assets/ui/pattern.png", "accessibilityLabel": "Inventory tile fill", "image": { "flipY": true, "scaleMode": "cover", "sourceSize": { "width": 32, "height": 32 }, "tileSize": { "width": 16, "height": 16 }, "tint": "#44aa88cc" } }] } }"##,
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

fn write(root: &Path, file: &str, contents: &str) {
    fs::write(root.join(file), contents).expect("bundle file should be written");
}

fn ui_entity(world: &mut World, id: &str) -> Entity {
    let mut query = world.query::<(Entity, &ThreeNativeId)>();
    query
        .iter(world)
        .find_map(|(entity, entity_id)| (entity_id.0 == id).then_some(entity))
        .expect("ui entity should exist")
}
