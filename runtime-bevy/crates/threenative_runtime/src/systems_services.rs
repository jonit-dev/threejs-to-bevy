use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::systems_context::NativeSystemContextSnapshot;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeRaycastRequest {
    pub direction: [f64; 3],
    #[serde(default)]
    pub ignore: Vec<String>,
    pub layer: Option<String>,
    #[serde(default)]
    pub layers: Vec<String>,
    #[serde(default)]
    pub mask: Vec<String>,
    pub max_distance: f64,
    pub origin: [f64; 3],
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeOverlapRequest {
    #[serde(default)]
    pub ignore: Vec<String>,
    pub layer: Option<String>,
    #[serde(default)]
    pub layers: Vec<String>,
    #[serde(default)]
    pub mask: Vec<String>,
    pub position: [f64; 3],
    pub shape: NativeQueryShape,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeShapeCastRequest {
    pub direction: [f64; 3],
    #[serde(default)]
    pub ignore: Vec<String>,
    pub layer: Option<String>,
    #[serde(default)]
    pub layers: Vec<String>,
    #[serde(default)]
    pub mask: Vec<String>,
    pub max_distance: f64,
    pub origin: [f64; 3],
    pub shape: NativeQueryShape,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind")]
pub enum NativeQueryShape {
    #[serde(rename = "box", rename_all = "camelCase")]
    Box { half_extents: [f64; 3] },
    #[serde(rename = "sphere")]
    Sphere { radius: f64 },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeOverlapResult {
    pub entities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum NativeRaycastResult {
    Miss(NativeRaycastMiss),
    Hit(NativeRaycastHit),
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeRaycastMiss {
    pub hit: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct NativeRaycastHit {
    pub distance: f64,
    pub entity: String,
    pub hit: bool,
    pub normal: [f64; 3],
    pub point: [f64; 3],
}

pub type NativeShapeCastResult = NativeRaycastResult;
pub type NativePickMeshRequest = NativeRaycastRequest;
pub type NativePickMeshResult = NativeRaycastResult;

pub fn raycast_primitive(
    snapshot: &NativeSystemContextSnapshot,
    request: &NativeRaycastRequest,
) -> NativeRaycastResult {
    let mut best: Option<(String, RayHit)> = None;
    for entity in &snapshot.entities {
        if request.ignore.iter().any(|ignored| ignored == &entity.id) {
            continue;
        }
        let Some(transform) = entity
            .components
            .get("Transform")
            .and_then(Value::as_object)
        else {
            continue;
        };
        let Some(collider) = entity.components.get("Collider").and_then(Value::as_object) else {
            continue;
        };
        if !passes_filter(collider, &request.layer, &request.layers, &request.mask) {
            continue;
        }
        let center = read_vec3(transform.get("position"), [0.0, 0.0, 0.0]);
        let size = read_collider_size(collider);
        let Some(hit) = intersect_aabb(request, center, size) else {
            continue;
        };
        if best
            .as_ref()
            .map(|(_, existing)| hit.distance < existing.distance)
            .unwrap_or(true)
        {
            best = Some((entity.id.clone(), hit));
        }
    }

    match best {
        Some((entity, hit)) => NativeRaycastResult::Hit(NativeRaycastHit {
            distance: hit.distance,
            entity,
            hit: true,
            normal: hit.normal,
            point: hit.point,
        }),
        None => NativeRaycastResult::Miss(NativeRaycastMiss { hit: false }),
    }
}

pub fn overlap_primitive(
    snapshot: &NativeSystemContextSnapshot,
    request: &NativeOverlapRequest,
) -> NativeOverlapResult {
    let query_bounds = QueryBounds {
        center: request.position,
        half_extents: query_half_extents(&request.shape),
    };
    let mut entities = Vec::new();
    for entity in &snapshot.entities {
        if request.ignore.iter().any(|ignored| ignored == &entity.id) {
            continue;
        }
        let Some(transform) = entity
            .components
            .get("Transform")
            .and_then(Value::as_object)
        else {
            continue;
        };
        let Some(collider) = entity.components.get("Collider").and_then(Value::as_object) else {
            continue;
        };
        if !passes_filter(collider, &request.layer, &request.layers, &request.mask) {
            continue;
        }
        if bounds_overlap(
            &query_bounds,
            &QueryBounds {
                center: read_vec3(transform.get("position"), [0.0, 0.0, 0.0]),
                half_extents: read_collider_half_extents(collider),
            },
        ) {
            entities.push(entity.id.clone());
        }
    }
    entities.sort();
    NativeOverlapResult { entities }
}

pub fn shape_cast_primitive(
    snapshot: &NativeSystemContextSnapshot,
    request: &NativeShapeCastRequest,
) -> NativeShapeCastResult {
    let mut best: Option<(String, RayHit)> = None;
    let query_extents = query_half_extents(&request.shape);
    let ray_request = NativeRaycastRequest {
        direction: request.direction,
        ignore: request.ignore.clone(),
        layer: request.layer.clone(),
        layers: request.layers.clone(),
        mask: request.mask.clone(),
        max_distance: request.max_distance,
        origin: request.origin,
    };
    for entity in &snapshot.entities {
        if request.ignore.iter().any(|ignored| ignored == &entity.id) {
            continue;
        }
        let Some(transform) = entity
            .components
            .get("Transform")
            .and_then(Value::as_object)
        else {
            continue;
        };
        let Some(collider) = entity.components.get("Collider").and_then(Value::as_object) else {
            continue;
        };
        if !passes_filter(collider, &request.layer, &request.layers, &request.mask) {
            continue;
        }
        let center = read_vec3(transform.get("position"), [0.0, 0.0, 0.0]);
        let size = read_collider_size(collider);
        let expanded_size = [
            size[0] + query_extents[0] * 2.0,
            size[1] + query_extents[1] * 2.0,
            size[2] + query_extents[2] * 2.0,
        ];
        let Some(hit) = intersect_aabb(&ray_request, center, expanded_size) else {
            continue;
        };
        if best
            .as_ref()
            .map(|(existing_entity, existing)| {
                hit.distance < existing.distance
                    || (hit.distance == existing.distance && entity.id < *existing_entity)
            })
            .unwrap_or(true)
        {
            best = Some((entity.id.clone(), hit));
        }
    }

    match best {
        Some((entity, hit)) => NativeRaycastResult::Hit(NativeRaycastHit {
            distance: hit.distance,
            entity,
            hit: true,
            normal: hit.normal,
            point: hit.point,
        }),
        None => NativeRaycastResult::Miss(NativeRaycastMiss { hit: false }),
    }
}

pub fn pick_mesh(
    snapshot: &NativeSystemContextSnapshot,
    request: &NativePickMeshRequest,
) -> NativePickMeshResult {
    let mut best: Option<(String, RayHit)> = None;
    for entity in &snapshot.entities {
        if request.ignore.iter().any(|ignored| ignored == &entity.id) {
            continue;
        }
        let Some(bounds) = snapshot.mesh_bounds.get(&entity.id) else {
            continue;
        };
        let Some(transform) = entity
            .components
            .get("Transform")
            .and_then(Value::as_object)
        else {
            continue;
        };
        let position = read_vec3(transform.get("position"), [0.0, 0.0, 0.0]);
        let scale = read_vec3(transform.get("scale"), [1.0, 1.0, 1.0]);
        let local_center = [
            (bounds.min[0] + bounds.max[0]) / 2.0,
            (bounds.min[1] + bounds.max[1]) / 2.0,
            (bounds.min[2] + bounds.max[2]) / 2.0,
        ];
        let center = [
            position[0] + local_center[0] * scale[0],
            position[1] + local_center[1] * scale[1],
            position[2] + local_center[2] * scale[2],
        ];
        let size = [
            ((bounds.max[0] - bounds.min[0]) * scale[0]).abs(),
            ((bounds.max[1] - bounds.min[1]) * scale[1]).abs(),
            ((bounds.max[2] - bounds.min[2]) * scale[2]).abs(),
        ];
        let Some(hit) = intersect_aabb(request, center, size) else {
            continue;
        };
        if best
            .as_ref()
            .map(|(existing_entity, existing)| {
                hit.distance < existing.distance
                    || (hit.distance == existing.distance && entity.id < *existing_entity)
            })
            .unwrap_or(true)
        {
            best = Some((entity.id.clone(), hit));
        }
    }

    match best {
        Some((entity, hit)) => NativeRaycastResult::Hit(NativeRaycastHit {
            distance: hit.distance,
            entity,
            hit: true,
            normal: hit.normal,
            point: hit.point,
        }),
        None => NativeRaycastResult::Miss(NativeRaycastMiss { hit: false }),
    }
}

pub fn animation_play_payload(entity: &str, clip: &str, options: Value) -> Value {
    json!({
        "request": {
            "clip": clip,
            "entity": entity,
            "options": options,
        },
        "result": { "accepted": true },
    })
}

#[derive(Clone, Debug, PartialEq)]
struct RayHit {
    distance: f64,
    normal: [f64; 3],
    point: [f64; 3],
}

struct QueryBounds {
    center: [f64; 3],
    half_extents: [f64; 3],
}

fn intersect_aabb(
    request: &NativeRaycastRequest,
    center: [f64; 3],
    size: [f64; 3],
) -> Option<RayHit> {
    let half = [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0];
    let min = [
        center[0] - half[0],
        center[1] - half[1],
        center[2] - half[2],
    ];
    let max = [
        center[0] + half[0],
        center[1] + half[1],
        center[2] + half[2],
    ];
    let mut t_min = 0.0;
    let mut t_max = request.max_distance;
    let mut normal = [0.0, 0.0, 0.0];

    for axis in 0..3 {
        let origin = request.origin[axis];
        let direction = request.direction[axis];
        if direction.abs() < 0.000001 {
            if origin < min[axis] || origin > max[axis] {
                return None;
            }
            continue;
        }

        let inv = 1.0 / direction;
        let mut near = (min[axis] - origin) * inv;
        let mut far = (max[axis] - origin) * inv;
        let axis_normal = normal_for_axis(axis, if direction > 0.0 { -1.0 } else { 1.0 });
        if near > far {
            std::mem::swap(&mut near, &mut far);
        }
        if near > t_min {
            t_min = near;
            normal = axis_normal;
        }
        t_max = f64::min(t_max, far);
        if t_min > t_max {
            return None;
        }
    }

    let distance = round6(t_min);
    Some(RayHit {
        distance,
        normal,
        point: [
            round6(request.origin[0] + request.direction[0] * distance),
            round6(request.origin[1] + request.direction[1] * distance),
            round6(request.origin[2] + request.direction[2] * distance),
        ],
    })
}

fn read_collider_size(collider: &serde_json::Map<String, Value>) -> [f64; 3] {
    if let Some(size) = collider.get("size") {
        return read_vec3(Some(size), [1.0, 1.0, 1.0]);
    }
    if let Some(radius) = collider.get("radius").and_then(Value::as_f64) {
        let diameter = radius * 2.0;
        return [
            diameter,
            collider
                .get("height")
                .and_then(Value::as_f64)
                .unwrap_or(diameter),
            diameter,
        ];
    }
    [1.0, 1.0, 1.0]
}

fn read_collider_half_extents(collider: &serde_json::Map<String, Value>) -> [f64; 3] {
    let size = read_collider_size(collider);
    [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
}

fn query_half_extents(shape: &NativeQueryShape) -> [f64; 3] {
    match shape {
        NativeQueryShape::Box { half_extents } => *half_extents,
        NativeQueryShape::Sphere { radius } => [*radius, *radius, *radius],
    }
}

fn bounds_overlap(left: &QueryBounds, right: &QueryBounds) -> bool {
    (left.center[0] - right.center[0]).abs() <= left.half_extents[0] + right.half_extents[0]
        && (left.center[1] - right.center[1]).abs() <= left.half_extents[1] + right.half_extents[1]
        && (left.center[2] - right.center[2]).abs() <= left.half_extents[2] + right.half_extents[2]
}

fn passes_filter(
    collider: &serde_json::Map<String, Value>,
    layer: &Option<String>,
    layers: &[String],
    mask: &[String],
) -> bool {
    let collider_layer = collider.get("layer").and_then(Value::as_str);
    if (!mask.is_empty() || !layers.is_empty())
        && collider_layer.is_none_or(|value| {
            !mask.iter().any(|candidate| candidate == value)
                && !layers.iter().any(|candidate| candidate == value)
        })
    {
        return false;
    }
    if let Some(layer) = layer {
        if let Some(collider_mask) = collider.get("mask").and_then(Value::as_array) {
            return collider_mask
                .iter()
                .filter_map(Value::as_str)
                .any(|value| value == layer);
        }
    }
    true
}

fn read_vec3(value: Option<&Value>, fallback: [f64; 3]) -> [f64; 3] {
    let Some(values) = value.and_then(Value::as_array) else {
        return fallback;
    };
    [
        read_number(values.first(), fallback[0]),
        read_number(values.get(1), fallback[1]),
        read_number(values.get(2), fallback[2]),
    ]
}

fn read_number(value: Option<&Value>, fallback: f64) -> f64 {
    value.and_then(Value::as_f64).unwrap_or(fallback)
}

fn normal_for_axis(axis: usize, sign: f64) -> [f64; 3] {
    match axis {
        0 => [sign, 0.0, 0.0],
        1 => [0.0, sign, 0.0],
        _ => [0.0, 0.0, sign],
    }
}

fn round6(value: f64) -> f64 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
