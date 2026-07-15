use std::{env, path::PathBuf, process};

use bevy::{
    a11y::Focus,
    prelude::*,
    window::{PrimaryWindow, WindowResolution},
};
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{UiIr, UiNodeIr, load_bundle};
use threenative_runtime::systems_effects::NativeSystemServiceEffect;
use threenative_runtime::{
    trace_report::write_pretty_json_report,
    ui::{
        NativeUiAction, NativeUiActionEvent, NativeUiActionQueue,
        NativeUiAttachmentProjectionTrace, NativeUiDisabled, NativeUiEffectPresetTrace,
        NativeUiImageRenderTrace, NativeUiKind, NativeUiTextEditOperation, NativeUiTextEditTrace,
        NativeUiTextStyleTrace, NativeUiVisualEffectTrace, NativeUiWidget,
        apply_native_ui_service_effects, dispatch_native_ui_actions, map_ui_into_world,
        queue_native_ui_text_input_value, trace_native_ui_attachment_projection,
        trace_native_ui_effect_presets, trace_native_ui_image_rendering, trace_native_ui_text_edit,
        trace_native_ui_text_styles, trace_native_ui_visual_effects, trace_ui_navigation,
    },
    ui_debug::report_native_ui_accessibility,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiNativeTraceReport {
    accessibility: AccessibilityCapabilityReport,
    attachments: NativeUiAttachmentProjectionTrace,
    effects: NativeUiEffectPresetTrace,
    images: NativeUiImageRenderTrace,
    schema: &'static str,
    text_edit: NativeUiTextEditTrace,
    text_styles: NativeUiTextStyleTrace,
    version: &'static str,
    visual_effects: NativeUiVisualEffectTrace,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccessibilityCapabilityReport {
    focus_narration: &'static str,
    metadata_bridge: &'static str,
    platform_screen_reader: &'static str,
    target: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiParityBehaviorReport {
    actions: Vec<UiParityAction>,
    adapter: &'static str,
    diagnostics: Vec<String>,
    focus: threenative_runtime::ui::UiNavigationTrace,
    ok: bool,
    regions: Vec<UiResponsiveRegion>,
    responsive: Vec<UiResponsiveObservation>,
    run_id: String,
    schema: &'static str,
    state: UiParityState,
    text_edit: NativeUiTextEditTrace,
    version: &'static str,
}

#[derive(Serialize)]
struct UiParityAction {
    action: String,
    node: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiResponsiveObservation {
    root_height: Option<f32>,
    root_width: Option<f32>,
    target: &'static str,
}

#[derive(Serialize)]
struct UiResponsiveRegion {
    root: UiObservedRegion,
    target: &'static str,
    widgets: Vec<UiObservedWidgetRegion>,
}

#[derive(Serialize)]
struct UiObservedRegion {
    height: Option<f32>,
    id: String,
    width: Option<f32>,
}

#[derive(Serialize)]
struct UiObservedWidgetRegion {
    height: Option<f32>,
    id: String,
    kind: String,
    width: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UiParityState {
    disabled_activation: &'static str,
    disabled_update: bool,
    text_value: String,
    value_update: f32,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1).collect::<Vec<_>>();
    if args.len() < 2 {
        return Err("missing bundle path or output path".into());
    }
    let bundle_path = args.remove(0);
    let output_path = PathBuf::from(args.remove(0));
    let behavior_path = take_flag_value(&mut args, "--behavior").map(PathBuf::from);
    let accessibility_path = take_flag_value(&mut args, "--accessibility").map(PathBuf::from);
    let run_id = take_flag_value(&mut args, "--run-id").unwrap_or_else(|| "native-ui".to_owned());
    if !args.is_empty() {
        return Err(format!("unsupported arguments: {}", args.join(" ")).into());
    }
    let bundle = load_bundle(bundle_path)?;
    let ui = bundle
        .ui
        .as_ref()
        .ok_or("bundle does not contain ui.ir.json")?;
    let mut app = App::new();
    map_ui_into_world(app.world_mut(), ui)?;
    let report = UiNativeTraceReport {
        accessibility: AccessibilityCapabilityReport {
            focus_narration: "metadata-proved",
            metadata_bridge: "accesskit",
            platform_screen_reader: "manual-platform-proof-required",
            target: "desktop-bevy",
        },
        attachments: trace_native_ui_attachment_projection(
            ui,
            "enemy.1",
            [8.0, 0.0, 12.0],
            "camera.main",
            [1280.0, 720.0],
        ),
        effects: trace_native_ui_effect_presets(ui, &["selected", "focus"]),
        images: trace_native_ui_image_rendering(app.world_mut()),
        schema: "threenative.ui-native-trace",
        text_edit: trace_native_ui_text_edit(
            "Nova",
            &[
                NativeUiTextEditOperation::Move(-1),
                NativeUiTextEditOperation::Insert("r".to_owned()),
                NativeUiTextEditOperation::Backspace,
            ],
        ),
        text_styles: trace_native_ui_text_styles(app.world_mut()),
        version: "0.1.0",
        visual_effects: trace_native_ui_visual_effects(app.world_mut()),
    };
    write_pretty_json_report(output_path, &report)?;
    if let Some(path) = behavior_path {
        write_pretty_json_report(path, &build_ui_parity_behavior(ui, &mut app, &run_id))?;
    }
    if let Some(path) = accessibility_path {
        let snapshot = report_native_ui_accessibility(app.world_mut());
        let mut value = serde_json::to_value(snapshot)?;
        value
            .as_object_mut()
            .expect("snapshot should be object")
            .insert("runId".to_owned(), run_id.clone().into());
        value
            .as_object_mut()
            .expect("snapshot should be object")
            .insert("diagnostics".to_owned(), serde_json::json!([]));
        write_pretty_json_report(path, &value)?;
    }
    Ok(())
}

fn build_ui_parity_behavior(ui: &UiIr, app: &mut App, run_id: &str) -> UiParityBehaviorReport {
    let button = find_ui_node(&ui.root, |node| {
        node.kind == "button" && node.disabled != Some(true) && node.action.is_some()
    });
    let slider = find_ui_node(&ui.root, |node| {
        node.kind == "slider" && node.action.is_some()
    });
    let text_input = find_ui_node(&ui.root, |node| {
        node.kind == "textInput" && node.action.is_some()
    });
    let touch = find_ui_node(&ui.root, |node| {
        node.kind == "touchControl" && node.action.is_some()
    });
    let actions = exercise_native_ui_actions(
        app,
        [button, slider, text_input, touch].map(|node| node.map(|node| node.id.as_str())),
    );
    let effects = vec![
        NativeSystemServiceEffect {
            service: "ui.setDisabled".to_owned(),
            payload: serde_json::json!({"request":{"node":"selected.item","disabled":true}}),
        },
        NativeSystemServiceEffect {
            service: "ui.setValue".to_owned(),
            payload: serde_json::json!({"request":{"node":"audio.volume","value":0.6}}),
        },
        NativeSystemServiceEffect {
            service: "ui.setValue".to_owned(),
            payload: serde_json::json!({"request":{"node":"player.name","value":"Nora"}}),
        },
    ];
    apply_native_ui_service_effects(app.world_mut(), &effects);
    let disabled_update = native_ui_disabled(app.world_mut(), "selected.item");
    let disabled_activation_suppressed =
        disabled_update && native_ui_disabled_activation_is_suppressed(app, "selected.item");
    let value_update =
        native_ui_widget(app.world_mut(), "audio.volume").map_or(0.0, |widget| widget.value);
    let text_value = native_ui_widget(app.world_mut(), "player.name")
        .and_then(|widget| widget.value_text.clone())
        .unwrap_or_default();
    let regions = [
        observe_native_ui_regions(ui, "desktop", 1280.0, 720.0),
        observe_native_ui_regions(ui, "mobile", 390.0, 844.0),
    ];
    let responsive = regions
        .iter()
        .map(|region| UiResponsiveObservation {
            root_height: region.root.height,
            root_width: region.root.width,
            target: region.target,
        })
        .collect::<Vec<_>>();
    let text_edit = trace_native_ui_text_edit(
        text_input
            .and_then(|node| node.text.as_deref())
            .unwrap_or("Nova"),
        &[
            NativeUiTextEditOperation::Move(-1),
            NativeUiTextEditOperation::Insert("r".to_owned()),
            NativeUiTextEditOperation::Backspace,
        ],
    );
    let focus = trace_ui_navigation(ui, &["tab", "right", "activate"]);
    let ok = actions.len() == 4
        && disabled_update
        && disabled_activation_suppressed
        && (value_update - 0.6).abs() < f32::EPSILON
        && text_value == "Nora";
    UiParityBehaviorReport {
        actions,
        adapter: "native",
        diagnostics: Vec::new(),
        focus,
        ok,
        regions: regions.into_iter().collect(),
        responsive,
        run_id: run_id.to_owned(),
        schema: "threenative.ui-parity-behavior",
        state: UiParityState {
            disabled_activation: if disabled_activation_suppressed {
                "disabled"
            } else {
                "not-exercised"
            },
            disabled_update,
            text_value,
            value_update,
        },
        text_edit,
        version: "0.1.0",
    }
}

fn native_ui_disabled_activation_is_suppressed(app: &mut App, target: &str) -> bool {
    if native_ui_entity(app.world_mut(), target).is_none() {
        return false;
    }

    set_native_ui_pressed(app.world_mut(), "");
    app.update();
    app.world_mut()
        .resource_mut::<NativeUiActionQueue>()
        .events
        .clear();

    set_native_ui_pressed(app.world_mut(), target);
    app.update();
    let events = std::mem::take(&mut app.world_mut().resource_mut::<NativeUiActionQueue>().events);
    !events.iter().any(|event| event.node == target)
}

fn exercise_native_ui_actions(app: &mut App, nodes: [Option<&str>; 4]) -> Vec<UiParityAction> {
    app.init_resource::<NativeUiActionQueue>();
    app.add_systems(Update, dispatch_native_ui_actions);
    let mut events = Vec::new();
    for (index, node) in nodes.into_iter().enumerate() {
        let Some(node) = node else {
            continue;
        };
        if index == 0 || index == 3 {
            set_native_ui_pressed(app.world_mut(), node);
            app.update();
        } else {
            queue_native_ui_value_action(
                app.world_mut(),
                node,
                if index == 1 { "0.75" } else { "Nora" },
            );
        }
        events.extend(std::mem::take(
            &mut app.world_mut().resource_mut::<NativeUiActionQueue>().events,
        ));
    }
    if let Some(text_node) = nodes[2]
        && let Some(entity) = native_ui_entity(app.world_mut(), text_node)
    {
        app.world_mut().insert_resource(Focus(Some(entity)));
    }
    events
        .into_iter()
        .map(|event| native_ui_parity_action(app.world_mut(), event))
        .collect()
}

fn set_native_ui_pressed(world: &mut World, target: &str) {
    let entities = world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .map(|(entity, id)| (entity, id.0 == target))
        .collect::<Vec<_>>();
    for (entity, pressed) in entities {
        if let Some(mut interaction) = world.get_mut::<Interaction>(entity) {
            *interaction = if pressed {
                Interaction::Pressed
            } else {
                Interaction::None
            };
        }
    }
}

fn queue_native_ui_value_action(world: &mut World, target: &str, value: &str) {
    let action = world
        .query::<(&ThreeNativeId, &NativeUiAction)>()
        .iter(world)
        .find(|(id, _)| id.0 == target)
        .map(|(id, action)| (id.clone(), action.clone()));
    if let Some((id, action)) = action {
        queue_native_ui_text_input_value(
            &mut world.resource_mut::<NativeUiActionQueue>(),
            &id,
            &action,
            value,
        );
    }
}

fn native_ui_parity_action(world: &mut World, event: NativeUiActionEvent) -> UiParityAction {
    let kind = world
        .query::<(&ThreeNativeId, &NativeUiKind)>()
        .iter(world)
        .find(|(id, _)| id.0 == event.node)
        .map(|(_, kind)| kind.0.clone());
    let value = event.value.map(|value| {
        if kind.as_deref() == Some("slider") {
            value.parse::<f64>().map_or_else(
                |_| serde_json::Value::String(value),
                serde_json::Value::from,
            )
        } else {
            serde_json::Value::String(value)
        }
    });
    UiParityAction {
        action: event.action,
        node: event.node,
        value,
    }
}

fn observe_native_ui_regions(
    ui: &UiIr,
    target: &'static str,
    width: f32,
    height: f32,
) -> UiResponsiveRegion {
    let mut app = App::new();
    app.world_mut().insert_resource(Assets::<Font>::default());
    app.world_mut().spawn((
        Window {
            resolution: WindowResolution::new(width, height),
            ..Default::default()
        },
        PrimaryWindow,
    ));
    map_ui_into_world(app.world_mut(), ui).expect("validated UI should map at proof viewport");
    app.update();
    collect_native_ui_regions(app.world_mut(), &ui.root.id, target)
}

fn collect_native_ui_regions(
    world: &mut World,
    root_id: &str,
    target: &'static str,
) -> UiResponsiveRegion {
    let mut root = None;
    let mut widgets = Vec::new();
    for (id, kind, style, node) in world
        .query::<(&ThreeNativeId, &NativeUiKind, &Style, &Node)>()
        .iter(world)
    {
        let observed = UiObservedRegion {
            height: observed_ui_dimension(style.height, node.size().y),
            id: id.0.clone(),
            width: observed_ui_dimension(style.width, node.size().x),
        };
        if id.0 == root_id {
            root = Some(observed);
        } else {
            widgets.push(UiObservedWidgetRegion {
                height: observed.height,
                id: observed.id,
                kind: kind.0.clone(),
                width: observed.width,
            });
        }
    }
    widgets.sort_by(|left, right| left.id.cmp(&right.id));
    UiResponsiveRegion {
        root: root.expect("mapped UI root should be observed in ECS"),
        target,
        widgets,
    }
}

fn observed_ui_dimension(value: Val, computed: f32) -> Option<f32> {
    match value {
        Val::Px(value) => Some(value),
        _ if computed > 0.0 => Some(computed),
        _ => None,
    }
}

fn native_ui_entity(world: &mut World, id: &str) -> Option<Entity> {
    world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .find(|(_, candidate)| candidate.0 == id)
        .map(|(entity, _)| entity)
}

fn find_ui_node(
    node: &UiNodeIr,
    predicate: impl Fn(&UiNodeIr) -> bool + Copy,
) -> Option<&UiNodeIr> {
    if predicate(node) {
        return Some(node);
    }
    node.children
        .iter()
        .find_map(|child| find_ui_node(child, predicate))
}

fn native_ui_disabled(world: &mut bevy::prelude::World, id: &str) -> bool {
    world
        .query::<(&threenative_components::ThreeNativeId, &NativeUiDisabled)>()
        .iter(world)
        .any(|(candidate, disabled)| candidate.0 == id && disabled.0)
}

fn native_ui_widget<'a>(
    world: &'a mut bevy::prelude::World,
    id: &str,
) -> Option<&'a NativeUiWidget> {
    let entity = world
        .query::<(
            bevy::prelude::Entity,
            &threenative_components::ThreeNativeId,
        )>()
        .iter(world)
        .find(|(_, candidate)| candidate.0 == id)
        .map(|(entity, _)| entity)?;
    world.get::<NativeUiWidget>(entity)
}

fn take_flag_value(args: &mut Vec<String>, flag: &str) -> Option<String> {
    let index = args.iter().position(|arg| arg == flag)?;
    if index + 1 >= args.len() {
        return None;
    }
    let value = args.remove(index + 1);
    args.remove(index);
    Some(value)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn behavior_report_uses_live_native_state_and_responsive_rules() {
        let bundle_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/advanced-ui/game.bundle");
        let bundle = load_bundle(bundle_path).expect("advanced UI bundle should load");
        let ui = bundle.ui.as_ref().expect("fixture should contain UI");
        let mut app = App::new();
        map_ui_into_world(app.world_mut(), ui).expect("UI should map into native ECS");

        let report = build_ui_parity_behavior(ui, &mut app, "native-test");
        let value = serde_json::to_value(report).expect("report should serialize");

        assert_eq!(value["schema"], "threenative.ui-parity-behavior");
        assert_eq!(value["runId"], "native-test");
        assert_eq!(value["ok"], true);
        assert_eq!(value["state"]["disabledUpdate"], true);
        assert_eq!(value["state"]["disabledActivation"], "disabled");
        let value_update = value["state"]["valueUpdate"]
            .as_f64()
            .expect("value update should be numeric");
        assert!((value_update - 0.6).abs() < 0.000_001);
        assert_eq!(value["state"]["textValue"], "Nora");
        assert_eq!(value["responsive"][0]["rootWidth"], 420.0);
        assert_eq!(value["responsive"][1]["rootWidth"], 340.0);
        assert_eq!(value["regions"][0]["target"], "desktop");
        assert_eq!(value["regions"][0]["root"]["id"], "advanced.ui");
        assert_eq!(value["regions"][1]["root"]["width"], 340.0);
        assert!(
            value["regions"][0]["widgets"]
                .as_array()
                .is_some_and(|widgets| widgets.iter().any(|widget| widget["id"] == "mobile.jump"))
        );
        assert_eq!(value["actions"].as_array().map(Vec::len), Some(4));
    }

    #[test]
    fn authored_actions_without_mapped_native_interactions_cannot_satisfy_behavior_report() {
        let mut app = App::new();
        let actions = exercise_native_ui_actions(
            &mut app,
            [
                Some("selected.item"),
                Some("audio.volume"),
                Some("player.name"),
                Some("mobile.jump"),
            ],
        );
        assert!(actions.is_empty());
    }

    #[test]
    fn responsive_regions_observe_ecs_style_instead_of_echoing_authored_ir() {
        let bundle_path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packages/ir/fixtures/conformance/advanced-ui/game.bundle");
        let bundle = load_bundle(bundle_path).expect("advanced UI bundle should load");
        let ui = bundle.ui.as_ref().expect("fixture should contain UI");
        let mut app = App::new();
        app.world_mut().insert_resource(Assets::<Font>::default());
        app.world_mut().spawn((
            Window {
                resolution: WindowResolution::new(1280.0, 720.0),
                ..Default::default()
            },
            PrimaryWindow,
        ));
        map_ui_into_world(app.world_mut(), ui).expect("UI should map");
        let root = native_ui_entity(app.world_mut(), "advanced.ui").expect("mapped root");
        app.world_mut().get_mut::<Style>(root).unwrap().width = Val::Px(111.0);

        let region = collect_native_ui_regions(app.world_mut(), "advanced.ui", "desktop");

        assert_eq!(region.root.width, Some(111.0));
        assert_ne!(
            region.root.width,
            ui.root.layout.as_ref().and_then(|layout| layout.width)
        );
    }
}
