use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use bevy::a11y::{AccessibilityNode, accesskit::Role};
use bevy::prelude::*;
use bevy::text::BreakLineOn;
use bevy::ui::{IsDefaultUiCamera, TargetCamera};
use threenative_components::ThreeNativeId;
use threenative_loader::{UiIr, UiNodeIr, load_bundle};
use threenative_runtime::ui::{
    NativeUiAction, NativeUiActionEvent, NativeUiActionQueue, NativeUiBar, NativeUiDisabled,
    NativeUiEffectLayer, NativeUiEffectState, NativeUiGradient, NativeUiImageSrc, NativeUiKind,
    NativeUiMinimapMarker, NativeUiMinimapPathPoint, NativeUiRenderedGradient,
    NativeUiRenderedShadow, NativeUiRenderedTextStyle, NativeUiScrollContainer, NativeUiShadow,
    NativeUiStyle, NativeUiVisualLayer, NativeUiWidget, build_native_ui,
    diagnose_native_ui_visual_support, dispatch_native_ui_actions,
    install_native_ui_overlay_camera, map_ui_into_world, queue_native_ui_text_input_value,
    route_native_ui_to_active_scene_camera, sync_native_ui_effect_layers,
    sync_native_ui_effect_states, sync_native_ui_focus_from_interaction,
    trace_native_ui_affordances, trace_native_ui_attachment_projection,
    trace_native_ui_effect_presets, trace_native_ui_screen_dispatch, trace_native_ui_text_styles,
    trace_native_ui_virtual_list_range, trace_native_ui_visual_effects, trace_ui_navigation,
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
        vec!["text", "bar", "image", "button", "column"]
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
            font_family: None,
            font_size: Some(18.0),
            font_weight: Some("bold".to_owned()),
            gradient: Some(NativeUiGradient {
                angle: Some(90.0),
                from: "#101820".to_owned(),
                kind: "linear".to_owned(),
                to: "#203040".to_owned(),
            }),
            opacity: Some(0.75),
            shadow: Some(NativeUiShadow {
                blur: Some(12.0),
                color: "#00000080".to_owned(),
                offset_x: Some(0.0),
                offset_y: Some(4.0),
                spread: Some(1.0),
            }),
            text_decoration: Some("underline".to_owned()),
            text_align: Some("center".to_owned()),
            wrap: Some("word".to_owned()),
        })
    );

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
#[allow(
    clippy::too_many_lines,
    reason = "entity kinds, stable IDs, styles, metadata, and hierarchy form one UI construction contract"
)]
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
        vec!["health", "hud", "inventory", "label", "pause", "portrait"]
    );

    let hud = entities_by_id["hud"];
    let label = entities_by_id["label"];
    let health = entities_by_id["health"];
    let portrait = entities_by_id["portrait"];
    let pause = entities_by_id["pause"];
    let inventory = entities_by_id["inventory"];
    let children = app
        .world()
        .get::<Children>(hud)
        .expect("hud should have children");
    let authored_children = children
        .iter()
        .copied()
        .filter(|entity| app.world().get::<ThreeNativeId>(*entity).is_some())
        .collect::<Vec<_>>();
    assert_eq!(
        authored_children,
        vec![label, health, portrait, pause, inventory]
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
    assert_eq!(portrait_accessibility.name(), Some("Hero portrait"));
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
    assert_eq!(
        app.world()
            .get::<NativeUiRenderedGradient>(hud)
            .expect("hud should have a native gradient effect"),
        &NativeUiRenderedGradient {
            angle: Some(90.0),
            from: "#101820".to_owned(),
            kind: "linear".to_owned(),
            to: "#203040".to_owned(),
        }
    );
    assert_eq!(
        app.world()
            .get::<NativeUiRenderedShadow>(hud)
            .expect("hud should have a native shadow effect"),
        &NativeUiRenderedShadow {
            blur: Some(12.0),
            color: "#00000080".to_owned(),
            offset_x: Some(0.0),
            offset_y: Some(4.0),
            spread: Some(1.0),
        }
    );
    let visual_effects = trace_native_ui_visual_effects(app.world_mut());
    assert_eq!(visual_effects.effects.len(), 1);
    assert_eq!(visual_effects.effects[0].node, "hud");
    assert!(visual_effects.effects[0].gradient.is_some());
    assert!(visual_effects.effects[0].shadow.is_some());
    assert_eq!(
        app.world()
            .get::<NativeUiRenderedTextStyle>(hud)
            .expect("hud should promote native text style metadata"),
        &NativeUiRenderedTextStyle {
            font_asset: None,
            font_family: None,
            font_weight: Some("bold".to_owned()),
            spans: Vec::new(),
            text_decoration: Some("underline".to_owned()),
        }
    );
    let text_styles = trace_native_ui_text_styles(app.world_mut());
    assert_eq!(text_styles.styles.len(), 1);
    assert_eq!(text_styles.styles[0].node, "hud");
    assert_eq!(text_styles.styles[0].font_weight.as_deref(), Some("bold"));
    assert_eq!(
        text_styles.styles[0].text_decoration.as_deref(),
        Some("underline")
    );
    let diagnostics = diagnose_native_ui_visual_support(ui);
    assert_eq!(
        diagnostics
            .iter()
            .map(|diagnostic| diagnostic.code.as_str())
            .collect::<Vec<_>>(),
        Vec::<&str>::new()
    );
    let pause_style = app
        .world()
        .get::<Style>(pause)
        .expect("button should have style");
    assert_eq!(pause_style.flex_grow, 1.0);
    let inventory_style = app
        .world()
        .get::<Style>(inventory)
        .expect("inventory should have style");
    assert_eq!(inventory_style.display, Display::Grid);
    assert_eq!(inventory_style.grid_auto_flow, GridAutoFlow::Row);
    assert_eq!(inventory_style.grid_template_columns.len(), 1);
    assert_eq!(inventory_style.grid_template_rows.len(), 1);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_should_spawn_renderable_shadow_and_gradient_layers() {
    let root = write_ui_bundle();
    let bundle = load_bundle(&root).expect("ui bundle should load");
    let ui = bundle.ui.as_ref().expect("ui ir should be loaded");
    let mut app = App::new();

    map_ui_into_world(app.world_mut(), ui).expect("ui should map into world");

    let mut layers = app.world_mut().query::<(&NativeUiVisualLayer, &UiImage)>();
    let rendered = layers
        .iter(app.world())
        .map(|(layer, image)| {
            (
                layer.kind.as_str(),
                layer.owner.as_str(),
                image.texture.id(),
            )
        })
        .collect::<Vec<_>>();
    assert!(
        rendered
            .iter()
            .any(|(kind, owner, _)| *kind == "shadow" && *owner == "hud")
    );
    assert!(
        rendered
            .iter()
            .any(|(kind, owner, _)| *kind == "gradient" && *owner == "hud")
    );

    let shadow = app
        .world_mut()
        .query::<(&NativeUiVisualLayer, &bevy::ui::prelude::ImageScaleMode)>()
        .iter(app.world())
        .find(|(layer, _)| layer.kind == "shadow")
        .map(|(_, scale)| scale.clone());
    assert!(matches!(
        shadow,
        Some(bevy::ui::prelude::ImageScaleMode::Sliced(_))
    ));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_should_render_effect_layers_from_live_interaction_state() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "active-move",
            "kind": "button",
            "label": "Nf3",
            "effects": [
                { "color": "#ffd54a", "fallback": "shadow", "id": "active.glow", "kind": "glow", "radius": 12, "trigger": "hover" },
                { "color": "#ffffff", "id": "active.outline", "intensity": 2, "kind": "outline", "radius": 2, "trigger": "focus" }
            ]
        }
    }))
    .expect("effect UI should deserialize");
    let mut app = App::new();
    app.init_resource::<Time>();
    app.init_resource::<bevy::a11y::Focus>();
    map_ui_into_world(app.world_mut(), &ui).expect("effect UI should map into world");
    app.add_systems(
        Update,
        (
            sync_native_ui_focus_from_interaction,
            sync_native_ui_effect_layers,
        )
            .chain(),
    );

    let owner = collect_ui_entities(app.world_mut())["active-move"];
    let initial_visibility = app
        .world_mut()
        .query::<(&NativeUiEffectLayer, &Visibility)>()
        .iter(app.world())
        .map(|(layer, visibility)| (layer.strategy.as_str(), *visibility))
        .collect::<Vec<_>>();
    assert_eq!(initial_visibility.len(), 2);
    assert!(
        initial_visibility
            .iter()
            .all(|(_, visibility)| *visibility == Visibility::Hidden)
    );

    app.world_mut()
        .entity_mut(owner)
        .insert(Interaction::Pressed);
    app.update();

    let rendered = app
        .world_mut()
        .query::<(&NativeUiEffectLayer, &Visibility, Option<&UiImage>)>()
        .iter(app.world())
        .map(|(layer, visibility, image)| (layer.strategy.as_str(), *visibility, image.is_some()))
        .collect::<Vec<_>>();
    assert!(rendered.contains(&("shadow", Visibility::Visible, true)));
    assert!(rendered.contains(&("outline", Visibility::Visible, false)));
}

#[test]
fn ui_should_render_selected_and_predicate_effect_states_from_bundle_values() {
    let root = write_ui_bundle();
    fs::write(
        root.join("world.ir.json"),
        r#"{ "schema": "threenative.world", "version": "0.1.0", "entities": [], "resources": { "Selected": true, "UiState": { "danger": true } } }"#,
    )
    .expect("world fixture should update");
    fs::write(
        root.join("ui.ir.json"),
        r##"{ "schema": "threenative.ui", "version": "0.1.0", "root": { "id": "status", "kind": "row", "binding": { "kind": "resource", "name": "Selected" }, "effects": [{ "color": "#66ccff", "id": "selected.outline", "kind": "outline", "trigger": "selected" }, { "color": "#ff4466", "fallback": "tint", "id": "danger.tint", "kind": "tint", "predicate": { "resource": "UiState", "field": "danger", "equals": true }, "trigger": "predicate" }] } }"##,
    )
    .expect("UI fixture should update");
    let bundle = load_bundle(&root).expect("effect bundle should load");
    let ui = bundle.ui.as_ref().expect("effect UI should load");
    let mut app = App::new();
    app.init_resource::<Time>();
    map_ui_into_world(app.world_mut(), ui).expect("effect UI should map");
    sync_native_ui_effect_states(app.world_mut(), &bundle);
    app.add_systems(Update, sync_native_ui_effect_layers);
    app.update();

    let visible = app
        .world_mut()
        .query::<(&NativeUiEffectLayer, &Visibility)>()
        .iter(app.world())
        .filter(|(_, visibility)| **visibility == Visibility::Visible)
        .map(|(layer, _)| layer.effect.as_str())
        .collect::<Vec<_>>();
    assert!(visible.contains(&"selected.outline"));
    assert!(visible.contains(&"danger.tint"));

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
fn ui_pulse_should_start_when_its_trigger_becomes_active() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "late-pulse",
            "kind": "button",
            "effects": [{
                "id": "late-pulse.effect",
                "kind": "pulse",
                "trigger": "selected",
                "color": "#ff4466",
                "pulse": { "durationMs": 1000, "iterations": 1 },
                "fallback": "outline"
            }]
        }
    }))
    .expect("pulse UI should deserialize");
    let mut app = App::new();
    app.init_resource::<Time>();
    map_ui_into_world(app.world_mut(), &ui).expect("pulse UI should map");
    app.add_systems(Update, sync_native_ui_effect_layers);

    app.world_mut()
        .resource_mut::<Time>()
        .advance_by(Duration::from_secs(10));
    app.update();
    let owner = collect_ui_entities(app.world_mut())["late-pulse"];
    app.world_mut()
        .entity_mut(owner)
        .get_mut::<NativeUiEffectState>()
        .unwrap()
        .selected = true;
    app.update();
    app.world_mut()
        .resource_mut::<Time>()
        .advance_by(Duration::from_millis(250));
    app.update();

    let alpha = app
        .world_mut()
        .query::<(&NativeUiEffectLayer, &BorderColor)>()
        .iter(app.world())
        .next()
        .expect("pulse outline should render")
        .1
        .0
        .to_srgba()
        .alpha;
    assert!(
        (alpha - 0.55).abs() < 0.02,
        "late pulse should be a quarter-cycle after activation, got {alpha}"
    );
}

#[test]
fn ui_tint_should_modulate_authored_color_by_intensity() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "tint",
            "kind": "row",
            "effects": [{ "id": "tint.effect", "kind": "tint", "trigger": "selected", "color": "#ff0033", "intensity": 0.25 }]
        }
    })).expect("tint UI should deserialize");
    let mut app = App::new();
    app.init_resource::<Time>();
    map_ui_into_world(app.world_mut(), &ui).expect("tint UI should map");
    let owner = collect_ui_entities(app.world_mut())["tint"];
    app.world_mut()
        .entity_mut(owner)
        .get_mut::<NativeUiEffectState>()
        .unwrap()
        .selected = true;
    app.add_systems(Update, sync_native_ui_effect_layers);
    app.update();

    let alpha = app
        .world_mut()
        .query::<(&NativeUiEffectLayer, &BackgroundColor)>()
        .iter(app.world())
        .next()
        .expect("tint layer should render")
        .1
        .0
        .to_srgba()
        .alpha;
    assert!(
        (alpha - 0.25).abs() < 0.01,
        "tint intensity should control overlay alpha, got {alpha}"
    );
}

#[test]
fn ui_should_apply_text_layout_and_fullscreen_root_defaults() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "hud.root",
            "kind": "stack",
            "children": [{
                "id": "state.hidden",
                "kind": "text",
                "layout": {
                    "position": "absolute",
                    "inset": { "left": 0, "right": 0, "top": 1200 },
                    "justify": "center",
                    "align": "center"
                },
                "text": "Paused"
            }]
        }
    }))
    .expect("ui should deserialize");
    let mut app = App::new();

    map_ui_into_world(app.world_mut(), &ui).expect("ui should map into world");

    let entities_by_id = collect_ui_entities(app.world_mut());
    let root_style = app
        .world()
        .get::<Style>(entities_by_id["hud.root"])
        .expect("root should have style");
    assert_eq!(root_style.position_type, PositionType::Absolute);
    assert_eq!(root_style.width, Val::Percent(100.0));
    assert_eq!(root_style.height, Val::Percent(100.0));
    assert_eq!(root_style.overflow, Overflow::clip());
    let hidden_style = app
        .world()
        .get::<Style>(entities_by_id["state.hidden"])
        .expect("text should have authored layout style");
    assert_eq!(hidden_style.position_type, PositionType::Absolute);
    assert_eq!(hidden_style.top, Val::Px(1200.0));
}

#[test]
fn ui_should_spawn_native_minimap_children() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "hud",
            "kind": "stack",
            "children": [{
                "id": "hud.minimap",
                "kind": "minimap",
                "layout": { "width": 160, "height": 120 },
                "minimap": {
                    "backgroundColor": "#07111f",
                    "bounds": { "minX": -10, "maxX": 10, "minZ": -8, "maxZ": 8 },
                    "paths": [{ "color": "#38bdf8", "points": [[-8, -6], [0, 7], [8, -6]], "width": 4 }],
                    "markers": [{ "color": "#f97316", "label": "P", "radius": 5, "x": 2, "z": -3 }]
                }
            }]
        }
    }))
    .expect("minimap ui should deserialize");
    let mut app = App::new();

    map_ui_into_world(app.world_mut(), &ui).expect("minimap ui should map into world");

    let entities_by_id = collect_ui_entities(app.world_mut());
    assert!(entities_by_id.contains_key("hud.minimap"));
    let path_points = app
        .world_mut()
        .query::<&NativeUiMinimapPathPoint>()
        .iter(app.world())
        .count();
    assert_eq!(path_points, 1);
    let markers = app
        .world_mut()
        .query::<(&NativeUiMinimapMarker, &Visibility)>()
        .iter(app.world())
        .collect::<Vec<_>>();
    assert_eq!(markers.len(), 12);
    assert_eq!(
        markers
            .iter()
            .filter(|(_, visibility)| **visibility == Visibility::Visible)
            .count(),
        1
    );
}

#[test]
fn ui_should_install_dedicated_overlay_camera_above_scene_cameras() {
    let mut app = App::new();
    app.world_mut().spawn(Camera3dBundle {
        camera: Camera {
            order: 4,
            ..Default::default()
        },
        ..Default::default()
    });

    install_native_ui_overlay_camera(app.world_mut());

    let mut query = app
        .world_mut()
        .query::<(&Camera, Option<&IsDefaultUiCamera>)>();
    let overlay = query
        .iter(app.world())
        .find(|(_, marker)| marker.is_some())
        .map(|(camera, _)| camera)
        .expect("overlay UI camera should be the default UI camera");
    assert_eq!(overlay.order, 104);
    assert!(matches!(
        overlay.clear_color,
        bevy::render::camera::ClearColorConfig::None
    ));
}

#[test]
fn ui_should_route_roots_to_scene_camera_for_interactive_native_rendering() {
    let root = write_ui_bundle();
    let bundle = load_bundle(&root).expect("ui bundle should load");
    let ui = bundle.ui.as_ref().expect("ui ir should be loaded");
    let mut app = App::new();
    let scene_camera = app
        .world_mut()
        .spawn(Camera3dBundle {
            camera: Camera {
                order: 4,
                ..Default::default()
            },
            ..Default::default()
        })
        .id();

    map_ui_into_world(app.world_mut(), ui).expect("ui should map into world");
    install_native_ui_overlay_camera(app.world_mut());

    assert!(route_native_ui_to_active_scene_camera(app.world_mut()));

    let mut overlay_query = app
        .world_mut()
        .query_filtered::<&Camera, With<IsDefaultUiCamera>>();
    assert_eq!(overlay_query.iter(app.world()).count(), 0);

    let entities_by_id = collect_ui_entities(app.world_mut());
    let target = app
        .world()
        .get::<TargetCamera>(entities_by_id["hud"])
        .expect("root HUD should target the active scene camera");
    assert_eq!(target.0, scene_camera);

    fs::remove_dir_all(root).expect("temporary bundle should be removed");
}

#[test]
#[allow(
    clippy::too_many_lines,
    reason = "button and touch-control actions are paired dispatch paths in one input scenario"
)]
fn ui_should_dispatch_native_button_and_touch_actions() {
    let ui = UiIr {
        fonts: Vec::new(),
        focus_order: None,
        input_actions: None,
        screen_stack: None,
        screens: None,
        safe_area: None,
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
        root: UiNodeIr {
            action: None,
            accessibility_label: None,
            anchor_id: None,
            attach_to: None,
            binding: None,
            children: vec![UiNodeIr {
                action: Some("Jump".to_owned()),
                accessibility_label: None,
                anchor_id: None,
                attach_to: None,
                binding: None,
                children: Vec::new(),
                disabled: None,
                effects: Vec::new(),
                focusable: None,
                glyph: None,
                id: "jump".to_owned(),
                image: None,
                kind: "touchControl".to_owned(),
                minimap: None,
                label: Some("Jump".to_owned()),
                layout: None,
                max: None,
                min: None,
                navigation: None,
                orientation: None,
                role: None,
                responsive: Vec::new(),
                spans: Vec::new(),
                step: None,
                src: None,
                style: None,
                text: None,
                tooltip: None,
                value: None,
                value_text: None,
                virtual_range: None,
            }],
            disabled: None,
            effects: Vec::new(),
            focusable: None,
            glyph: None,
            id: "hud".to_owned(),
            image: None,
            kind: "column".to_owned(),
            minimap: None,
            label: None,
            layout: None,
            max: None,
            min: None,
            navigation: None,
            orientation: None,
            role: None,
            responsive: Vec::new(),
            spans: Vec::new(),
            step: None,
            src: None,
            text: None,
            tooltip: None,
            value: None,
            value_text: None,
            virtual_range: None,
            style: None,
        },
    };
    let mut app = App::new();
    app.init_resource::<NativeUiActionQueue>();
    app.add_systems(Update, dispatch_native_ui_actions);

    map_ui_into_world(app.world_mut(), &ui).expect("ui should map into world");
    let entities_by_id = collect_ui_entities(app.world_mut());
    let jump = entities_by_id["jump"];

    assert!(app.world().get::<Button>(jump).is_some());
    assert_eq!(
        app.world().get::<NativeUiAction>(jump),
        Some(&NativeUiAction("Jump".to_owned()))
    );

    app.update();
    assert!(
        app.world()
            .resource::<NativeUiActionQueue>()
            .events
            .is_empty()
    );

    app.world_mut()
        .entity_mut(jump)
        .insert(Interaction::Pressed);
    app.update();

    assert_eq!(
        app.world().resource::<NativeUiActionQueue>().events,
        vec![NativeUiActionEvent {
            action: "Jump".to_owned(),
            node: "jump".to_owned(),
            value: None,
        }]
    );

    app.world_mut()
        .resource_mut::<NativeUiActionQueue>()
        .events
        .clear();
    app.world_mut()
        .entity_mut(jump)
        .insert((Interaction::None, NativeUiDisabled(true)));
    app.update();
    app.world_mut()
        .entity_mut(jump)
        .insert(Interaction::Pressed);
    app.update();

    assert!(
        app.world()
            .resource::<NativeUiActionQueue>()
            .events
            .is_empty()
    );
}

#[test]
fn ui_should_preserve_text_input_value_events() {
    let ui = UiIr {
        fonts: Vec::new(),
        focus_order: None,
        input_actions: None,
        screen_stack: None,
        screens: None,
        root: UiNodeIr {
            action: None,
            accessibility_label: None,
            anchor_id: None,
            attach_to: None,
            binding: None,
            children: vec![UiNodeIr {
                action: Some("SetPlayerName".to_owned()),
                accessibility_label: None,
                anchor_id: None,
                attach_to: None,
                binding: None,
                children: Vec::new(),
                disabled: None,
                effects: Vec::new(),
                focusable: None,
                glyph: None,
                id: "player-name".to_owned(),
                image: None,
                kind: "textInput".to_owned(),
                minimap: None,
                label: Some("Player name".to_owned()),
                layout: None,
                max: None,
                min: None,
                navigation: None,
                orientation: None,
                role: None,
                responsive: Vec::new(),
                spans: Vec::new(),
                step: None,
                src: None,
                style: None,
                text: Some("Hero".to_owned()),
                tooltip: None,
                value: None,
                value_text: None,
                virtual_range: None,
            }],
            disabled: None,
            effects: Vec::new(),
            focusable: None,
            glyph: None,
            id: "hud".to_owned(),
            image: None,
            kind: "column".to_owned(),
            minimap: None,
            label: None,
            layout: None,
            max: None,
            min: None,
            navigation: None,
            orientation: None,
            role: None,
            responsive: Vec::new(),
            spans: Vec::new(),
            step: None,
            src: None,
            text: None,
            tooltip: None,
            value: None,
            value_text: None,
            virtual_range: None,
            style: None,
        },
        safe_area: None,
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
    };
    let mut app = App::new();
    app.init_resource::<NativeUiActionQueue>();

    map_ui_into_world(app.world_mut(), &ui).expect("ui should map into world");
    let entities_by_id = collect_ui_entities(app.world_mut());
    let input = entities_by_id["player-name"];
    let action = app
        .world()
        .get::<NativeUiAction>(input)
        .expect("text input should carry action")
        .clone();
    let id = app
        .world()
        .get::<ThreeNativeId>(input)
        .expect("text input should carry id")
        .clone();
    let widget = app
        .world()
        .get::<NativeUiWidget>(input)
        .expect("text input should carry widget state");

    assert_eq!(widget.kind, "textInput");
    assert_eq!(widget.value_text.as_deref(), Some("Hero"));

    let mut queue = app.world_mut().resource_mut::<NativeUiActionQueue>();
    queue_native_ui_text_input_value(&mut queue, &id, &action, "He");
    queue_native_ui_text_input_value(&mut queue, &id, &action, "Heroine");

    assert_eq!(
        queue.events,
        vec![
            NativeUiActionEvent {
                action: "SetPlayerName".to_owned(),
                node: "player-name".to_owned(),
                value: Some("He".to_owned()),
            },
            NativeUiActionEvent {
                action: "SetPlayerName".to_owned(),
                node: "player-name".to_owned(),
                value: Some("Heroine".to_owned()),
            },
        ]
    );
}

#[test]
fn ui_should_reject_unsupported_ui_node() {
    let ui = UiIr {
        fonts: Vec::new(),
        focus_order: None,
        input_actions: None,
        screen_stack: None,
        screens: None,
        safe_area: None,
        schema: "threenative.ui".to_owned(),
        version: "0.1.0".to_owned(),
        root: UiNodeIr {
            action: None,
            accessibility_label: None,
            anchor_id: None,
            attach_to: None,
            binding: None,
            children: Vec::new(),
            disabled: None,
            effects: Vec::new(),
            focusable: None,
            glyph: None,
            id: "bad".to_owned(),
            image: None,
            kind: "html".to_owned(),
            minimap: None,
            label: None,
            layout: None,
            max: None,
            min: None,
            navigation: None,
            orientation: None,
            role: None,
            responsive: Vec::new(),
            spans: Vec::new(),
            step: None,
            src: None,
            text: None,
            tooltip: None,
            value: None,
            value_text: None,
            virtual_range: None,
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
    let fixture = support::load_conformance_fixture("rich-ui-navigation");
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
    let fixture = support::load_conformance_fixture("rich-ui-navigation");
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

#[test]
fn ui_navigation_trace_should_skip_disabled_nodes() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "focusOrder": ["play", "settings", "credits"],
        "root": {
            "id": "hud",
            "kind": "column",
            "children": [
                { "id": "play", "kind": "button", "action": "Play", "label": "Play", "navigation": { "right": "settings" } },
                { "id": "settings", "kind": "button", "action": "Settings", "label": "Settings", "disabled": true },
                { "id": "credits", "kind": "button", "action": "Credits", "label": "Credits" }
            ]
        }
    }))
    .expect("ui navigation fixture should deserialize");

    let trace = trace_ui_navigation(&ui, &["right", "activate"]);

    assert_eq!(trace.focus_order, vec!["play", "credits"]);
    assert_eq!(trace.events[0].focus, "credits");
    assert_eq!(trace.events[0].input, "right");
    assert_eq!(trace.events[1].action.as_deref(), Some("Credits"));
}

#[test]
fn should_apply_screen_stack_input_capture() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "root",
            "kind": "stack",
            "children": [
                {
                    "id": "hud",
                    "kind": "column",
                    "children": [{ "id": "pause", "kind": "button", "action": "Pause", "focusable": true }]
                },
                {
                    "id": "confirm",
                    "kind": "column",
                    "children": [{ "id": "confirm.cancel", "kind": "button", "action": "Cancel", "focusable": true }]
                }
            ]
        },
        "screens": [
            {
                "id": "hud",
                "root": "hud",
                "role": "hud",
                "stackPolicy": "replace",
                "focusScope": { "entry": "pause", "inputCapture": "none", "restore": "none" }
            },
            {
                "id": "confirm",
                "root": "confirm",
                "role": "modal",
                "stackPolicy": "exclusiveModal",
                "focusScope": {
                    "entry": "confirm.cancel",
                    "inputCapture": "modal",
                    "restore": "previous",
                    "trap": true,
                    "escapeAction": "Cancel"
                }
            }
        ],
        "screenStack": { "active": ["hud", "confirm"], "policy": "exclusiveModal" }
    }))
    .expect("screen stack UI should deserialize");

    let trace = trace_native_ui_screen_dispatch(
        &ui,
        &[("pause", "activate"), ("confirm.cancel", "activate")],
    );

    assert_eq!(trace.events.len(), 2);
    assert_eq!(trace.events[0].screen.as_deref(), Some("hud"));
    assert_eq!(trace.events[0].blocked_by.as_deref(), Some("confirm"));
    assert!(!trace.events[0].dispatched);
    assert_eq!(trace.events[0].action.as_deref(), Some("Pause"));
    assert_eq!(trace.events[1].screen.as_deref(), Some("confirm"));
    assert_eq!(trace.events[1].blocked_by, None);
    assert!(trace.events[1].dispatched);
    assert_eq!(trace.events[1].action.as_deref(), Some("Cancel"));
}

#[test]
fn should_preserve_native_virtual_list_range() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "inventory",
            "kind": "column",
            "virtualRange": { "buffer": 1, "itemCount": 200, "itemExtent": 24, "viewportExtent": 96 },
            "children": (0..200).map(|index| serde_json::json!({
                "id": format!("item.{index}"),
                "kind": "button",
                "label": format!("Item {index}"),
                "action": "InspectItem"
            })).collect::<Vec<_>>()
        }
    }))
    .expect("virtual list UI should deserialize");

    let trace = trace_native_ui_virtual_list_range(&ui, "inventory", 120.0);

    assert_eq!(trace.node, "inventory");
    assert_eq!(trace.start_index, 4);
    assert_eq!(trace.start_item.as_deref(), Some("item.4"));
    assert_eq!(trace.end_index, 9);
    assert_eq!(trace.end_item.as_deref(), Some("item.9"));
}

#[test]
fn should_preserve_tooltip_and_glyph_observations() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "interact",
            "kind": "button",
            "label": "Open",
            "action": "Interact",
            "glyph": { "action": "Interact", "glyphSet": "gamepad", "label": "A" },
            "tooltip": {
                "anchor": "interact",
                "delayMs": 250,
                "description": "Open the selected chest.",
                "dismissAction": "Cancel",
                "focus": "preserve",
                "open": "focus"
            }
        }
    }))
    .expect("affordance UI should deserialize");

    let trace = trace_native_ui_affordances(&ui);

    assert_eq!(trace.glyphs.len(), 1);
    assert_eq!(trace.glyphs[0].node, "interact");
    assert_eq!(trace.glyphs[0].action, "Interact");
    assert_eq!(trace.glyphs[0].glyph_set.as_deref(), Some("gamepad"));
    assert_eq!(trace.glyphs[0].label.as_deref(), Some("A"));
    assert_eq!(trace.tooltips.len(), 1);
    assert_eq!(trace.tooltips[0].node, "interact");
    assert_eq!(trace.tooltips[0].anchor, "interact");
    assert_eq!(trace.tooltips[0].description, "Open the selected chest.");
    assert_eq!(trace.tooltips[0].dismiss_action.as_deref(), Some("Cancel"));
}

#[test]
fn should_preserve_native_ui_effect_observations() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "inventory.slot.0",
            "kind": "button",
            "label": "Crystal Key",
            "effects": [
                {
                    "color": "#66ccff",
                    "fallback": "shadow",
                    "id": "selected.glow",
                    "kind": "glow",
                    "radius": 12,
                    "trigger": "selected"
                }
            ]
        }
    }))
    .expect("effect UI should deserialize");

    let trace = trace_native_ui_effect_presets(&ui, &["selected"]);

    assert_eq!(trace.effects.len(), 1);
    assert_eq!(trace.effects[0].node, "inventory.slot.0");
    assert_eq!(trace.effects[0].effect, "selected.glow");
    assert_eq!(trace.effects[0].state, "selected");
    assert_eq!(trace.effects[0].strategy, "shadow");
}

#[test]
fn should_clamp_off_screen_attached_ui_marker() {
    let ui: UiIr = serde_json::from_value(serde_json::json!({
        "schema": "threenative.ui",
        "version": "0.1.0",
        "root": {
            "id": "quest.marker",
            "kind": "text",
            "text": "Quest",
            "attachTo": {
                "target": { "kind": "entity", "id": "quest.target" },
                "localOffset": [0, 2, 0],
                "anchor": "top",
                "clamp": "screenEdge",
                "distanceScale": { "min": 0.5, "max": 1.25 }
            }
        }
    }))
    .expect("attached UI should deserialize");

    let trace = trace_native_ui_attachment_projection(
        &ui,
        "quest.target",
        [1000.0, 10.0, 20.0],
        "main.camera",
        [800.0, 600.0],
    );

    assert_eq!(trace.projections.len(), 1);
    assert_eq!(trace.projections[0].target, "quest.target");
    assert_eq!(trace.projections[0].camera, "main.camera");
    assert!(trace.projections[0].clamped);
    assert_eq!(trace.projections[0].screen.x, 800.0);
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
  "requiredCapabilities": {},
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
    "style": { "backgroundColor": "#101820cc", "borderColor": "#ffffff", "borderRadius": 8, "borderWidth": 2, "color": "#ffcc00", "fontSize": 18, "fontWeight": "bold", "gradient": { "angle": 90, "from": "#101820", "kind": "linear", "to": "#203040" }, "opacity": 0.75, "shadow": { "blur": 12, "color": "#00000080", "offsetX": 0, "offsetY": 4, "spread": 1 }, "textAlign": "center", "textDecoration": "underline", "wrap": "word" },
    "children": [
      { "id": "label", "kind": "text", "text": "Health", "style": { "color": "#ffcc00", "fontSize": 18, "opacity": 0.75, "textAlign": "center", "wrap": "word" } },
      { "id": "health", "kind": "bar", "value": 8, "max": 10 },
      { "id": "portrait", "kind": "image", "accessibilityLabel": "Hero portrait", "role": "image", "src": "assets/hero.png" },
      { "id": "pause", "kind": "button", "label": "Pause", "action": "Pause", "layout": { "grow": 1 } },
      { "id": "inventory", "kind": "column", "layout": { "grid": { "autoFlow": "row", "columns": 3, "rows": 2 }, "rowGap": 6, "columnGap": 6 } }
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

fn write(root: &Path, file: &str, contents: &str) {
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
