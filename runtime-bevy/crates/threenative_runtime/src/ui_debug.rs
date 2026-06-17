use serde::Serialize;
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
        "button" | "touchControl" | "slider" | "scrollbar"
    ))
}

fn widget_state(node: &UiNodeIr) -> Option<NativeUiDebugWidgetState> {
    if node.kind != "slider" && node.kind != "scrollbar" {
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
