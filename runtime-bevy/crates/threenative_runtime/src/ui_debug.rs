use crate::ui::{
    NativeUiDisabled, NativeUiFocusable, NativeUiKind, NativeUiNavigation, NativeUiWidget,
};
use bevy::{
    a11y::{AccessibilityNode, Focus},
    prelude::*,
};
use serde::Serialize;
use threenative_components::ThreeNativeId;
use threenative_loader::{UiIr, UiNodeIr};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiDebugReport {
    pub nodes: Vec<NativeUiDebugNode>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiDebugNode {
    pub accesskit_role: Option<String>,
    pub accessible_name: Option<String>,
    pub action: Option<String>,
    pub bounds: NativeUiDebugBounds,
    pub disabled: bool,
    pub focus_index: Option<usize>,
    pub id: String,
    pub kind: String,
    pub widget_state: Option<NativeUiDebugWidgetState>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiDebugBounds {
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiDebugWidgetState {
    pub max: f32,
    pub min: f32,
    pub orientation: String,
    pub value: f32,
    pub value_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiAccessibilitySnapshot {
    pub adapter: &'static str,
    pub nodes: Vec<NativeUiAccessibilityNode>,
    pub schema: &'static str,
    pub version: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeUiAccessibilityNode {
    pub disabled: bool,
    pub focusable: bool,
    pub focused: bool,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub relationships: NativeUiAccessibilityRelationships,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct NativeUiAccessibilityRelationships {
    pub children: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub down: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub up: Option<String>,
}

pub fn report_native_ui_accessibility(world: &mut World) -> NativeUiAccessibilitySnapshot {
    let ids = world
        .query::<(Entity, &ThreeNativeId)>()
        .iter(world)
        .map(|(entity, id)| (entity, id.0.clone()))
        .collect::<std::collections::HashMap<_, _>>();
    let focused = world.get_resource::<Focus>().and_then(|focus| focus.0);
    let mut nodes = world
        .query::<(
            Entity,
            &ThreeNativeId,
            &NativeUiKind,
            Option<&AccessibilityNode>,
            Option<&NativeUiDisabled>,
            Option<&NativeUiFocusable>,
            Option<&NativeUiWidget>,
            Option<&NativeUiNavigation>,
            Option<&Children>,
        )>()
        .iter(world)
        .map(
            |(
                entity,
                id,
                kind,
                accessibility,
                disabled,
                focusable,
                widget,
                navigation,
                children,
            )| {
                let disabled = disabled.is_some_and(|disabled| disabled.0)
                    || accessibility.is_some_and(|node| node.0.is_disabled());
                NativeUiAccessibilityNode {
                    disabled,
                    focusable: !disabled
                        && focusable.map_or_else(
                            || {
                                matches!(
                                    kind.0.as_str(),
                                    "button"
                                        | "textInput"
                                        | "touchControl"
                                        | "slider"
                                        | "scrollbar"
                                )
                            },
                            |focusable| focusable.0,
                        ),
                    focused: focused == Some(entity),
                    id: id.0.clone(),
                    name: accessibility.and_then(|node| node.name().map(str::to_owned)),
                    relationships: NativeUiAccessibilityRelationships {
                        children: children
                            .into_iter()
                            .flat_map(|children| children.iter())
                            .filter_map(|child| ids.get(child).cloned())
                            .collect(),
                        down: navigation.and_then(|navigation| navigation.down.clone()),
                        left: navigation.and_then(|navigation| navigation.left.clone()),
                        right: navigation.and_then(|navigation| navigation.right.clone()),
                        up: navigation.and_then(|navigation| navigation.up.clone()),
                    },
                    role: accessibility.map(|node| normalized_accesskit_role(node.role())),
                    value: accessibility
                        .and_then(|node| node.value().map(str::to_owned))
                        .or_else(|| widget.and_then(|widget| widget.value_text.clone()))
                        .or_else(|| {
                            accessibility.and_then(|node| {
                                node.numeric_value().map(|value| value.to_string())
                            })
                        }),
                }
            },
        )
        .collect::<Vec<_>>();
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    NativeUiAccessibilitySnapshot {
        adapter: "native",
        nodes,
        schema: "threenative.ui-accessibility-snapshot",
        version: "0.1.0",
    }
}

fn normalized_accesskit_role(role: bevy::a11y::accesskit::Role) -> String {
    match role {
        bevy::a11y::accesskit::Role::ProgressIndicator => "progressbar".to_owned(),
        bevy::a11y::accesskit::Role::StaticText => "text".to_owned(),
        bevy::a11y::accesskit::Role::TextInput => "textbox".to_owned(),
        other => format!("{other:?}").to_lowercase(),
    }
}

pub fn report_native_ui_debug(ui: &UiIr) -> NativeUiDebugReport {
    let mut nodes = Vec::new();
    let mut focus_index = 0usize;
    visit_node(&ui.root, &mut focus_index, &mut nodes);
    NativeUiDebugReport { nodes }
}

fn visit_node(node: &UiNodeIr, focus_index: &mut usize, nodes: &mut Vec<NativeUiDebugNode>) {
    let current_focus_index = if is_focusable(node) && node.disabled != Some(true) {
        let index = *focus_index;
        *focus_index += 1;
        Some(index)
    } else {
        None
    };
    nodes.push(NativeUiDebugNode {
        accesskit_role: accesskit_role(node),
        accessible_name: accessible_name(node),
        action: node.action.clone(),
        bounds: bounds(node),
        disabled: node.disabled == Some(true),
        focus_index: current_focus_index,
        id: node.id.clone(),
        kind: node.kind.clone(),
        widget_state: widget_state(node),
    });
    for child in &node.children {
        visit_node(child, focus_index, nodes);
    }
}

fn bounds(node: &UiNodeIr) -> NativeUiDebugBounds {
    let layout = node.layout.as_ref();
    NativeUiDebugBounds {
        height: layout.and_then(|layout| layout.height).unwrap_or(0.0),
        width: layout.and_then(|layout| layout.width).unwrap_or(0.0),
        x: layout
            .and_then(|layout| layout.inset.as_ref())
            .and_then(|inset| inset.left)
            .unwrap_or(0.0),
        y: layout
            .and_then(|layout| layout.inset.as_ref())
            .and_then(|inset| inset.top)
            .unwrap_or(0.0),
    }
}

fn is_focusable(node: &UiNodeIr) -> bool {
    node.focusable.unwrap_or(matches!(
        node.kind.as_str(),
        "button" | "textInput" | "touchControl" | "slider" | "scrollbar"
    ))
}

fn widget_state(node: &UiNodeIr) -> Option<NativeUiDebugWidgetState> {
    if node.kind != "slider" && node.kind != "scrollbar" && node.kind != "textInput" {
        return None;
    }
    Some(NativeUiDebugWidgetState {
        max: node.max.unwrap_or(1.0),
        min: node.min.unwrap_or(0.0),
        orientation: node
            .orientation
            .clone()
            .unwrap_or_else(|| "horizontal".to_owned()),
        value: node.value.unwrap_or(node.min.unwrap_or(0.0)),
        value_text: node.value_text.clone(),
    })
}

fn accesskit_role(node: &UiNodeIr) -> Option<String> {
    match node.role.as_deref() {
        Some("button") => Some("Button".to_owned()),
        Some("group") => Some("Group".to_owned()),
        Some("image") => Some("Image".to_owned()),
        Some("list") => Some("List".to_owned()),
        Some("listitem") => Some("ListItem".to_owned()),
        Some("none") => None,
        Some("progressbar") => Some("ProgressIndicator".to_owned()),
        Some("text") => Some("StaticText".to_owned()),
        None => match node.kind.as_str() {
            "bar" => Some("ProgressIndicator".to_owned()),
            "button" | "touchControl" => Some("Button".to_owned()),
            "textInput" => Some("TextInput".to_owned()),
            "image" => Some("Image".to_owned()),
            "scrollbar" => Some("ProgressIndicator".to_owned()),
            "slider" => Some("Slider".to_owned()),
            "text" => Some("StaticText".to_owned()),
            _ => None,
        },
        Some(other) => Some(other.to_owned()),
    }
}

fn accessible_name(node: &UiNodeIr) -> Option<String> {
    node.accessibility_label
        .clone()
        .or_else(|| node.label.clone())
        .or_else(|| node.text.clone())
}
