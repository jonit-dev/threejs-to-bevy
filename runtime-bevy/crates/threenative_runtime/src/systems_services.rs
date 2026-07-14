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
#[serde(rename_all = "camelCase")]
pub struct NativePointerRayRequest {
    pub aspect: Option<f64>,
    pub camera: Option<String>,
    pub max_distance: Option<f64>,
    pub pointer: [f64; 2],
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

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(untagged)]
pub enum NativePointerRayResult {
    Miss(NativeRaycastMiss),
    Hit(NativePointerRayHit),
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativePointerRayHit {
    pub direction: [f64; 3],
    pub hit: bool,
    pub max_distance: f64,
    pub origin: [f64; 3],
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
        let (center, size) = collider_bounds(transform, collider);
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
        let (center, size) = collider_bounds(transform, collider);
        if bounds_overlap(
            &query_bounds,
            &QueryBounds {
                center,
                half_extents: [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0],
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
        let (center, size) = collider_bounds(transform, collider);
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

pub fn pointer_ray(
    snapshot: &NativeSystemContextSnapshot,
    request: &NativePointerRayRequest,
) -> NativePointerRayResult {
    let Some(entity) = find_camera(snapshot, request.camera.as_deref()) else {
        return NativePointerRayResult::Miss(NativeRaycastMiss { hit: false });
    };
    let Some(camera) = entity.components.get("Camera").and_then(Value::as_object) else {
        return NativePointerRayResult::Miss(NativeRaycastMiss { hit: false });
    };
    let transform = entity
        .components
        .get("Transform")
        .and_then(Value::as_object);
    let origin = read_vec3(
        transform.and_then(|value| value.get("position")),
        [0.0, 0.0, 0.0],
    );
    let rotation = read_quat(
        transform.and_then(|value| value.get("rotation")),
        [0.0, 0.0, 0.0, 1.0],
    );
    let aspect = positive_number(request.aspect, 1.0);
    let max_distance = positive_number(request.max_distance, read_number(camera.get("far"), 100.0));
    let ndc_x = request.pointer[0].clamp(0.0, 1.0) * 2.0 - 1.0;
    let ndc_y = 1.0 - request.pointer[1].clamp(0.0, 1.0) * 2.0;

    if camera.get("kind").and_then(Value::as_str) == Some("orthographic") {
        let size = positive_number(camera.get("size").and_then(Value::as_f64), 1.0);
        let offset = rotate_vec3(
            [ndc_x * size * aspect * 0.5, ndc_y * size * 0.5, 0.0],
            rotation,
        );
        return NativePointerRayResult::Hit(NativePointerRayHit {
            direction: round_vec3(normalize_vec3(rotate_vec3([0.0, 0.0, -1.0], rotation))),
            hit: true,
            max_distance,
            origin: round_vec3([
                origin[0] + offset[0],
                origin[1] + offset[1],
                origin[2] + offset[2],
            ]),
        });
    }

    let fov_y = positive_number(camera.get("fovY").and_then(Value::as_f64), 60.0).to_radians();
    let tan_half_fov_y = (fov_y / 2.0).tan();
    NativePointerRayResult::Hit(NativePointerRayHit {
        direction: round_vec3(normalize_vec3(rotate_vec3(
            [
                ndc_x * tan_half_fov_y * aspect,
                ndc_y * tan_half_fov_y,
                -1.0,
            ],
            rotation,
        ))),
        hit: true,
        max_distance,
        origin: round_vec3(origin),
    })
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

pub fn animation_stop_payload(entity: &str, clip: Option<&str>) -> Value {
    let request = match clip {
        Some(clip) => json!({ "clip": clip, "entity": entity }),
        None => json!({ "entity": entity }),
    };
    json!({
        "request": request,
        "result": { "accepted": true, "stopped": true },
    })
}

pub fn animation_query_payload(entity: &str, clip: Option<&str>) -> Value {
    let request = match clip {
        Some(clip) => json!({ "clip": clip, "entity": entity }),
        None => json!({ "entity": entity }),
    };
    let result = match clip {
        Some(clip) => json!({
            "active": false,
            "clip": clip,
            "entity": entity,
            "paused": false,
            "stopped": true,
            "timeSeconds": 0.0,
        }),
        None => json!({
            "active": false,
            "entity": entity,
            "paused": false,
            "stopped": true,
            "timeSeconds": 0.0,
        }),
    };
    json!({
        "request": request,
        "result": result,
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
    let direction_length = request
        .direction
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt();
    if !direction_length.is_finite() || direction_length <= 0.000001 {
        return None;
    }
    let direction = request.direction.map(|value| value / direction_length);
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
        let axis_direction = direction[axis];
        if axis_direction.abs() < 0.000001 {
            if origin < min[axis] || origin > max[axis] {
                return None;
            }
            continue;
        }

        let inv = 1.0 / axis_direction;
        let mut near = (min[axis] - origin) * inv;
        let mut far = (max[axis] - origin) * inv;
        let axis_normal = normal_for_axis(axis, if axis_direction > 0.0 { -1.0 } else { 1.0 });
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
            round6(request.origin[0] + direction[0] * distance),
            round6(request.origin[1] + direction[1] * distance),
            round6(request.origin[2] + direction[2] * distance),
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
    if let Some(size) = collider
        .get("mesh")
        .and_then(Value::as_object)
        .and_then(|mesh| mesh.get("bounds"))
        .and_then(Value::as_object)
        .and_then(|bounds| bounds.get("size"))
    {
        return read_vec3(Some(size), [1.0, 1.0, 1.0]);
    }
    [1.0, 1.0, 1.0]
}

fn read_collider_half_extents(collider: &serde_json::Map<String, Value>) -> [f64; 3] {
    let size = read_collider_size(collider);
    [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
}

fn collider_bounds(
    transform: &serde_json::Map<String, Value>,
    collider: &serde_json::Map<String, Value>,
) -> ([f64; 3], [f64; 3]) {
    let position = read_vec3(transform.get("position"), [0.0, 0.0, 0.0]);
    let rotation = read_collider_quat(transform.get("rotation"));
    let mesh_center = collider
        .get("mesh")
        .and_then(Value::as_object)
        .and_then(|mesh| mesh.get("bounds"))
        .and_then(Value::as_object)
        .and_then(|bounds| bounds.get("center"));
    let offset = rotate(
        read_vec3(collider.get("center").or(mesh_center), [0.0, 0.0, 0.0]),
        rotation,
    );
    let half_extents = read_collider_half_extents(collider);
    let x_axis = rotate([half_extents[0], 0.0, 0.0], rotation);
    let y_axis = rotate([0.0, half_extents[1], 0.0], rotation);
    let z_axis = rotate([0.0, 0.0, half_extents[2]], rotation);
    (
        [
            position[0] + offset[0],
            position[1] + offset[1],
            position[2] + offset[2],
        ],
        [
            2.0 * (x_axis[0].abs() + y_axis[0].abs() + z_axis[0].abs()),
            2.0 * (x_axis[1].abs() + y_axis[1].abs() + z_axis[1].abs()),
            2.0 * (x_axis[2].abs() + y_axis[2].abs() + z_axis[2].abs()),
        ],
    )
}

fn read_collider_quat(value: Option<&Value>) -> [f64; 4] {
    let Some(values) = value.and_then(Value::as_array) else {
        return [0.0, 0.0, 0.0, 1.0];
    };
    [
        values.first().and_then(Value::as_f64).unwrap_or(0.0),
        values.get(1).and_then(Value::as_f64).unwrap_or(0.0),
        values.get(2).and_then(Value::as_f64).unwrap_or(0.0),
        values.get(3).and_then(Value::as_f64).unwrap_or(1.0),
    ]
}

fn rotate([x, y, z]: [f64; 3], [qx, qy, qz, qw]: [f64; 4]) -> [f64; 3] {
    let ix = qw * x + qy * z - qz * y;
    let iy = qw * y + qz * x - qx * z;
    let iz = qw * z + qx * y - qy * x;
    let iw = -qx * x - qy * y - qz * z;
    [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ]
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

fn find_camera<'a>(
    snapshot: &'a NativeSystemContextSnapshot,
    camera_id: Option<&str>,
) -> Option<&'a crate::systems_context::NativeSystemEntitySnapshot> {
    let active_camera = snapshot
        .resources
        .get("ActiveCamera")
        .and_then(|value| value.get("entity"))
        .and_then(Value::as_str);
    let selected = camera_id.or(active_camera);
    if let Some(selected) = selected {
        return snapshot
            .entities
            .iter()
            .find(|entity| entity.id == selected && entity.components.contains_key("Camera"));
    }
    snapshot
        .entities
        .iter()
        .find(|entity| entity.components.contains_key("Camera"))
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

fn read_quat(value: Option<&Value>, fallback: [f64; 4]) -> [f64; 4] {
    let Some(values) = value.and_then(Value::as_array) else {
        return fallback;
    };
    [
        read_number(values.first(), fallback[0]),
        read_number(values.get(1), fallback[1]),
        read_number(values.get(2), fallback[2]),
        read_number(values.get(3), fallback[3]),
    ]
}

fn positive_number(value: Option<f64>, fallback: f64) -> f64 {
    value
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(fallback)
}

fn normalize_vec3(value: [f64; 3]) -> [f64; 3] {
    let length = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();
    if length <= 0.000001 {
        return [0.0, 0.0, -1.0];
    }
    [value[0] / length, value[1] / length, value[2] / length]
}

fn rotate_vec3(value: [f64; 3], quaternion: [f64; 4]) -> [f64; 3] {
    let [x, y, z] = value;
    let [qx, qy, qz, qw] = quaternion;
    let ix = qw * x + qy * z - qz * y;
    let iy = qw * y + qz * x - qx * z;
    let iz = qw * z + qx * y - qy * x;
    let iw = -qx * x - qy * y - qz * z;
    [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ]
}

fn round_vec3(value: [f64; 3]) -> [f64; 3] {
    [round6(value[0]), round6(value[1]), round6(value[2])]
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
