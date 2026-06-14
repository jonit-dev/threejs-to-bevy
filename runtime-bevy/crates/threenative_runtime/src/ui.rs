use threenative_loader::{UiIr, UiNodeIr};

#[derive(Clone, Debug, PartialEq)]
pub struct NativeUiNode {
    pub action: Option<String>,
    pub children: Vec<NativeUiNode>,
    pub focusable: Option<bool>,
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub max: Option<f32>,
    pub text: Option<String>,
    pub value: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UiDiagnostic {
    pub code: String,
    pub message: String,
    pub path: String,
}

pub fn build_native_ui(ui: &UiIr) -> Result<NativeUiNode, UiDiagnostic> {
    build_node(&ui.root, "ui.ir.json/root")
}

fn build_node(node: &UiNodeIr, path: &str) -> Result<NativeUiNode, UiDiagnostic> {
    if !matches!(
        node.kind.as_str(),
        "bar" | "button" | "column" | "row" | "stack" | "text" | "touchControl"
    ) {
        return Err(UiDiagnostic {
            code: "TN_BEVY_UI_NODE_UNSUPPORTED".to_owned(),
            message: format!("Unsupported UI node '{}'.", node.kind),
            path: format!("{path}/kind"),
        });
    }
    Ok(NativeUiNode {
        action: node.action.clone(),
        children: node
            .children
            .iter()
            .enumerate()
            .map(|(index, child)| build_node(child, &format!("{path}/children/{index}")))
            .collect::<Result<Vec<_>, _>>()?,
        focusable: node.focusable,
        id: node.id.clone(),
        kind: node.kind.clone(),
        label: node.label.clone(),
        max: node.max,
        text: node.text.clone(),
        value: node.value,
    })
}
