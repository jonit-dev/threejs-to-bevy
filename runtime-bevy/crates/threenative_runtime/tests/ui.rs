use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use bevy::a11y::{AccessibilityNode, accesskit::Role};
use bevy::prelude::*;
use bevy::text::BreakLineOn;
use threenative_components::ThreeNativeId;
use threenative_loader::{UiIr, UiNodeIr, load_bundle};
use threenative_runtime::ui::{
    NativeUiAction, NativeUiBar, NativeUiImageSrc, NativeUiKind, NativeUiScrollContainer,
    NativeUiStyle, build_native_ui, map_ui_into_world, trace_ui_navigation,
};

mod support;

#[test]
fn ui_should_build_bevy_hud_from_ui_ir() {
    let root = write_ui_bundle();
    let bundle = load_bundle(&root).expect("ui bundle should load");
    let ui = bundle.ui.as_ref().expect("ui ir should be loaded");

    let native = build_native_ui(ui).expect("ui should build");

    assert_eq!(native.kind, "column");
    assert_eq!(native.accessibility_label.as_deref(), Some("Main HUD"));
    assert_eq!(native.role.as_deref(), Some("group"));
    assert_eq!(
        native
            .children
            .iter()
            .map(|node| node.kind.as_str())
            .collect::<Vec<_>>(),
        vec!["text", "bar", "image", "button"]
    );
    assert_eq!(
        native.children[2].accessibility_label.as_deref(),
        Some("Hero portrait")
    );
    assert_eq!(native.children[2].role.as_deref(), Some("image"));
    assert_eq!(native.children[2].src.as_deref(), Some("assets/hero.png"));
    assert_eq!(native.children[3].action.as_deref(), Some("Pause"));
    assert_eq!(
        native.style,
        Some(NativeUiStyle {
            background_color: Some("#101820cc".to_owned()),
            border_color: Some("#ffffff".to_owned()),
            border_radius: Some(8.0),
            border_width: Some(2.0),
            color: Some("#ffcc00".to_owned()),
            font_size: Some(18.0),
            opacity: Some(0.75),
            text_align: Some("center".to_owned()),
            wrap: Some("word".to_owned()),
        })
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_should_spawn_bevy_entities_with_stable_ids_and_hierarchy() {
    let root = write_ui_bundle();
    let bundle = load_bundle(&root).expect("ui bundle should load");
    let ui = bundle.ui.as_ref().expect("ui ir should be loaded");
    let mut app = App::new();

    map_ui_into_world(app.world_mut(), ui).expect("ui should map into world");

    let entities_by_id = collect_ui_entities(app.world_mut());
    assert_eq!(
        entities_by_id
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["health", "hud", "label", "pause", "portrait"]
    );

    let hud = entities_by_id["hud"];
    let label = entities_by_id["label"];
    let health = entities_by_id["health"];
    let portrait = entities_by_id["portrait"];
    let pause = entities_by_id["pause"];
    let children = app
        .world()
        .get::<Children>(hud)
        .expect("hud should have children");
    assert_eq!(
        children.iter().copied().collect::<Vec<_>>(),
        vec![label, health, portrait, pause]
    );

    let label_text = app
        .world()
        .get::<Text>(label)
        .expect("label should be text");
    assert_eq!(label_text.sections[0].value, "Health");
    assert_color(label_text.sections[0].style.color, (1.0, 0.8, 0.0, 0.75));
    assert_eq!(label_text.sections[0].style.font_size, 18.0);
    assert_eq!(label_text.justify, JustifyText::Center);
    assert_eq!(label_text.linebreak_behavior, BreakLineOn::WordBoundary);
    assert!(app.world().get::<Button>(pause).is_some());
    assert_eq!(
        app.world()
            .get::<NativeUiAction>(pause)
            .expect("button action should be preserved"),
        &NativeUiAction("Pause".to_owned())
    );
    assert_eq!(
        app.world()
            .get::<NativeUiBar>(health)
            .expect("bar value should be preserved"),
        &NativeUiBar {
            value: 8.0,
            max: 10.0,
        }
    );
    assert_eq!(
        app.world()
            .get::<NativeUiImageSrc>(portrait)
            .expect("image source should be preserved"),
        &NativeUiImageSrc("assets/hero.png".to_owned())
    );
    let portrait_accessibility = app
        .world()
        .get::<AccessibilityNode>(portrait)
        .expect("image accessibility should be preserved");
    assert_eq!(portrait_accessibility.role(), Role::Image);
    assert_eq!(
        portrait_accessibility.name().as_deref(),
        Some("Hero portrait")
    );
    assert!(app.world().get::<UiImage>(portrait).is_some());
    let button_label = only_child(app.world(), pause);
    let button_text = app
        .world()
        .get::<Text>(button_label)
        .expect("button label should be text");
    assert_eq!(button_text.sections[0].value, "Pause");

    let bar_fill = only_child(app.world(), health);
    let bar_fill_style = app
        .world()
        .get::<Style>(bar_fill)
        .expect("bar fill should have style");
    assert_eq!(bar_fill_style.width, Val::Percent(80.0));
    let hud_style = app
        .world()
        .get::<Style>(hud)
        .expect("hud should have style");
    assert_eq!(hud_style.flex_direction, FlexDirection::Row);
    assert_eq!(hud_style.justify_content, JustifyContent::SpaceBetween);
    assert_eq!(hud_style.align_items, AlignItems::Center);
    assert_eq!(hud_style.column_gap, Val::Px(12.0));
    assert_eq!(hud_style.row_gap, Val::Px(4.0));
    assert_eq!(hud_style.padding, UiRect::all(Val::Px(6.0)));
    assert_eq!(hud_style.position_type, PositionType::Absolute);
    assert_eq!(hud_style.left, Val::Px(24.0));
    assert_eq!(hud_style.top, Val::Px(16.0));
    assert_eq!(hud_style.width, Val::Px(320.0));
    assert_eq!(hud_style.height, Val::Px(48.0));
    assert_eq!(hud_style.max_width, Val::Px(480.0));
    assert_eq!(hud_style.min_height, Val::Px(24.0));
    assert_eq!(hud_style.overflow, Overflow::clip_y());
    assert_eq!(
        app.world()
            .get::<NativeUiScrollContainer>(hud)
            .expect("hud should be a scroll container"),
        &NativeUiScrollContainer { offset_y: 0.0 }
    );
    assert_eq!(hud_style.border, UiRect::all(Val::Px(2.0)));
    assert_eq!(
        app.world()
            .get::<BorderRadius>(hud)
            .expect("hud should have border radius"),
        &BorderRadius::all(Val::Px(8.0))
    );
    assert_color(
        app.world()
            .get::<BackgroundColor>(hud)
            .expect("hud should have background color")
            .0,
        (16.0 / 255.0, 24.0 / 255.0, 32.0 / 255.0, 0.6),
    );
    assert_color(
        app.world()
            .get::<BorderColor>(hud)
            .expect("hud should have border color")
            .0,
        (1.0, 1.0, 1.0, 0.75),
    );
    assert_eq!(
        app.world()
            .get::<ZIndex>(hud)
            .expect("hud should have z-index"),
        &ZIndex::Local(5)
    );
    let pause_style = app
        .world()
        .get::<Style>(pause)
        .expect("button should have style");
    assert_eq!(pause_style.flex_grow, 1.0);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_should_reject_unsupported_ui_node() {
    let ui = UiIr {
        focus_order: None,
        input_actions: None,
        safe_area: None,
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
        root: UiNodeIr {
            action: None,
            accessibility_label: None,
            children: Vec::new(),
            focusable: None,
            id: "bad".to_owned(),
            kind: "html".to_owned(),
            label: None,
            layout: None,
            max: None,
            navigation: None,
            role: None,
            src: None,
            text: None,
            value: None,
            style: None,
        },
    };

    let diagnostic = build_native_ui(&ui).expect_err("unsupported node should fail");

    assert_eq!(diagnostic.code, "TN_BEVY_UI_NODE_UNSUPPORTED");
    assert!(diagnostic.message.contains("html"));
    assert_eq!(diagnostic.path, "ui.ir.json/root/kind");
}

#[test]
fn ui_navigation_trace_should_match_v7_fixture() {
    let fixture = support::load_conformance_fixture("v7-rich-ui-navigation");
    let ui = fixture.bundle.ui.as_ref().expect("ui fixture should load");

    let trace = trace_ui_navigation(ui, &["tab", "activate"]);

    assert_eq!(trace.focus_order, vec!["play", "settings"]);
    assert_eq!(trace.initial_focus.as_deref(), Some("play"));
    assert_eq!(trace.final_focus.as_deref(), Some("settings"));
    assert_eq!(trace.events.len(), 2);
    assert_eq!(trace.events[0].kind, "focus");
    assert_eq!(trace.events[0].focus, "settings");
    assert_eq!(trace.events[0].input, "tab");
    assert_eq!(trace.events[1].kind, "activate");
    assert_eq!(trace.events[1].action.as_deref(), Some("OpenSettings"));
    assert_eq!(trace.safe_area.as_ref().expect("safe area").mode, "avoid");
}

#[test]
fn ui_navigation_trace_should_support_reverse_tab() {
    let fixture = support::load_conformance_fixture("v7-rich-ui-navigation");
    let ui = fixture.bundle.ui.as_ref().expect("ui fixture should load");

    let trace = trace_ui_navigation(ui, &["tab", "shiftTab"]);

    assert_eq!(
        trace
            .events
            .iter()
            .map(|event| (event.focus.as_str(), event.input.as_str()))
            .collect::<Vec<_>>(),
        vec![("settings", "tab"), ("play", "shiftTab")]
    );
    assert_eq!(trace.final_focus.as_deref(), Some("play"));
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
        r##"{
  "schema": "threenative.ui",
  "version": "0.1.0",
  "root": {
    "id": "hud",
    "kind": "column",
    "accessibilityLabel": "Main HUD",
    "role": "group",
    "layout": { "align": "center", "columnGap": 12, "direction": "row", "height": 48, "inset": { "left": 24, "top": 16 }, "justify": "spaceBetween", "maxWidth": 480, "minHeight": 24, "overflow": "scroll", "padding": 6, "position": "absolute", "rowGap": 4, "width": 320, "zIndex": 5 },
    "style": { "backgroundColor": "#101820cc", "borderColor": "#ffffff", "borderRadius": 8, "borderWidth": 2, "color": "#ffcc00", "fontSize": 18, "opacity": 0.75, "textAlign": "center", "wrap": "word" },
    "children": [
      { "id": "label", "kind": "text", "text": "Health", "style": { "color": "#ffcc00", "fontSize": 18, "opacity": 0.75, "textAlign": "center", "wrap": "word" } },
      { "id": "health", "kind": "bar", "value": 8, "max": 10 },
      { "id": "portrait", "kind": "image", "accessibilityLabel": "Hero portrait", "role": "image", "src": "assets/hero.png" },
      { "id": "pause", "kind": "button", "label": "Pause", "action": "Pause", "layout": { "grow": 1 } }
    ]
  }
}"##,
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

fn collect_ui_entities(world: &mut World) -> BTreeMap<String, Entity> {
    let mut query = world.query::<(Entity, &ThreeNativeId, &NativeUiKind)>();
    query
        .iter(world)
        .map(|(entity, id, _kind)| (id.0.clone(), entity))
        .collect()
}

fn only_child(world: &World, entity: Entity) -> Entity {
    let children = world
        .get::<Children>(entity)
        .expect("entity should have one child");
    let children = children.iter().copied().collect::<Vec<_>>();
    assert_eq!(children.len(), 1);
    children[0]
}

fn assert_color(color: Color, expected: (f32, f32, f32, f32)) {
    let color = color.to_srgba();
    assert!(
        (color.red - expected.0).abs() < 0.001
            && (color.green - expected.1).abs() < 0.001
            && (color.blue - expected.2).abs() < 0.001
            && (color.alpha - expected.3).abs() < 0.001,
        "expected rgba {:?}, got {:?}",
        expected,
        color
    );
}
