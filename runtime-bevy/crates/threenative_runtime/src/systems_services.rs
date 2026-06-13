use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::systems_context::NativeSystemContextSnapshot;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativeRaycastRequest {
    pub direction: [f64; 3],
    #[serde(default)]
    pub ignore: Vec<String>,
    #[serde(default)]
    pub layers: Vec<String>,
    pub max_distance: f64,
    pub origin: [f64; 3],
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
