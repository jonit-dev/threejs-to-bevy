use serde::Serialize;

#[derive(Clone, Debug, PartialEq)]
pub struct NativeGltfSceneNode {
    pub asset_id: String,
    pub extras: Option<serde_json::Value>,
    pub material: Option<String>,
    pub name: Option<String>,
    pub path: String,
    pub transform: NativeGltfTransform,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGltfTransform {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<[f32; 4]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<[f32; 3]>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeGltfNodeHandle {
    pub asset_id: String,
    pub id: String,
    pub instance_id: String,
    pub node_name: Option<String>,
    pub node_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NativeGltfNodeOperation {
    ExtrasLookup { handle: String },
    Material { handle: String, material: String },
    Transform { handle: String, transform: NativeGltfTransform },
    Visibility { handle: String, visible: bool },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGltfSceneHandleObservation {
    pub handle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_path: Option<String>,
    pub operation: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extras: Option<serde_json::Value>,
}

pub fn apply_gltf_scene_handle_operations(
    nodes: &[NativeGltfSceneNode],
    handles: &[NativeGltfNodeHandle],
    operations: &[NativeGltfNodeOperation],
    barrier_ready: bool,
) -> Vec<NativeGltfSceneHandleObservation> {
    let mut sorted_handles = handles.to_vec();
    sorted_handles.sort_by(|left, right| left.id.cmp(&right.id));
    let mut states: Vec<(String, NativeGltfSceneNode, bool)> = sorted_handles
        .iter()
        .filter_map(|handle| {
            resolve_node(nodes, handle).map(|node| (handle.id.clone(), node.clone(), true))
        })
        .collect();
    let mut sorted_operations = operations.to_vec();
    sorted_operations.sort_by(|left, right| operation_sort_key(left).cmp(&operation_sort_key(right)));
    let mut observations = Vec::new();
    for operation in sorted_operations {
        let handle_id = operation_handle(&operation);
        let Some((_id, node, visible)) = states.iter_mut().find(|(id, _node, _visible)| id == handle_id) else {
            observations.push(NativeGltfSceneHandleObservation {
                after: None,
                before: None,
                extras: None,
                handle: handle_id.to_owned(),
                node_path: None,
                operation: operation_kind(&operation),
                status: "missing".to_owned(),
            });
            continue;
        };
        if !barrier_ready {
            observations.push(NativeGltfSceneHandleObservation {
                after: None,
                before: None,
                extras: None,
                handle: handle_id.to_owned(),
                node_path: Some(node.path.clone()),
                operation: operation_kind(&operation),
                status: "deferred".to_owned(),
            });
            continue;
        }
        observations.push(apply_operation(node, visible, &operation));
    }
    observations.sort_by(|left, right| {
        format!("{}:{}", left.handle, left.operation).cmp(&format!("{}:{}", right.handle, right.operation))
    });
    observations
}

fn apply_operation(
    node: &mut NativeGltfSceneNode,
    visible: &mut bool,
    operation: &NativeGltfNodeOperation,
) -> NativeGltfSceneHandleObservation {
    match operation {
        NativeGltfNodeOperation::Transform { handle, transform } => {
            let before = serde_json::json!({ "transform": node.transform });
            node.transform = merge_transform(&node.transform, transform);
            NativeGltfSceneHandleObservation {
                after: Some(serde_json::json!({ "transform": node.transform })),
                before: Some(before),
                extras: None,
                handle: handle.clone(),
                node_path: Some(node.path.clone()),
                operation: "transform".to_owned(),
                status: "applied".to_owned(),
            }
        }
        NativeGltfNodeOperation::Visibility { handle, visible: next } => {
            let before = *visible;
            *visible = *next;
            NativeGltfSceneHandleObservation {
                after: Some(serde_json::json!({ "visible": visible })),
                before: Some(serde_json::json!({ "visible": before })),
                extras: None,
                handle: handle.clone(),
                node_path: Some(node.path.clone()),
                operation: "visibility".to_owned(),
                status: "applied".to_owned(),
            }
        }
        NativeGltfNodeOperation::Material { handle, material } => {
            let before = node.material.clone();
            node.material = Some(material.clone());
            NativeGltfSceneHandleObservation {
                after: Some(serde_json::json!({ "material": node.material })),
                before: Some(serde_json::json!({ "material": before })),
                extras: None,
                handle: handle.clone(),
                node_path: Some(node.path.clone()),
                operation: "material".to_owned(),
                status: "applied".to_owned(),
            }
        }
        NativeGltfNodeOperation::ExtrasLookup { handle } => NativeGltfSceneHandleObservation {
            after: None,
            before: None,
            extras: node.extras.clone(),
            handle: handle.clone(),
            node_path: Some(node.path.clone()),
            operation: "extrasLookup".to_owned(),
            status: "applied".to_owned(),
        },
    }
}

fn resolve_node<'a>(
    nodes: &'a [NativeGltfSceneNode],
    handle: &NativeGltfNodeHandle,
) -> Option<&'a NativeGltfSceneNode> {
    let matches: Vec<_> = nodes
        .iter()
        .filter(|node| node.asset_id == handle.asset_id)
        .filter(|node| {
            handle
                .node_path
                .as_ref()
                .map(|path| node.path == *path)
                .unwrap_or_else(|| node.name.as_ref() == handle.node_name.as_ref())
        })
        .collect();
    if matches.len() == 1 { Some(matches[0]) } else { None }
}

fn merge_transform(
    before: &NativeGltfTransform,
    update: &NativeGltfTransform,
) -> NativeGltfTransform {
    NativeGltfTransform {
        position: update.position.or(before.position),
        rotation: update.rotation.or(before.rotation),
        scale: update.scale.or(before.scale),
    }
}

fn operation_handle(operation: &NativeGltfNodeOperation) -> &str {
    match operation {
        NativeGltfNodeOperation::ExtrasLookup { handle }
        | NativeGltfNodeOperation::Material { handle, .. }
        | NativeGltfNodeOperation::Transform { handle, .. }
        | NativeGltfNodeOperation::Visibility { handle, .. } => handle,
    }
}

fn operation_kind(operation: &NativeGltfNodeOperation) -> String {
    match operation {
        NativeGltfNodeOperation::ExtrasLookup { .. } => "extrasLookup",
        NativeGltfNodeOperation::Material { .. } => "material",
        NativeGltfNodeOperation::Transform { .. } => "transform",
        NativeGltfNodeOperation::Visibility { .. } => "visibility",
    }
    .to_owned()
}

fn operation_sort_key(operation: &NativeGltfNodeOperation) -> String {
    format!("{}:{}", operation_handle(operation), operation_kind(operation))
}
