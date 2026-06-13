use serde::Serialize;
use threenative_loader::{ColliderComponent, LoadedBundle, WorldEntity};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct PhysicsEvent {
    pub a: String,
    pub b: String,
    pub event: String,
}

struct Bounds<'a> {
    center: [f32; 3],
    half_extents: [f32; 3],
    id: &'a str,
    trigger: bool,
}

pub fn detect_physics_events(bundle: &LoadedBundle) -> Vec<PhysicsEvent> {
    let bounds = bundle
        .world
        .entities
        .iter()
        .filter_map(entity_bounds)
        .collect::<Vec<_>>();
    let mut events = Vec::new();
    for left_index in 0..bounds.len() {
        for right_index in (left_index + 1)..bounds.len() {
            let left = &bounds[left_index];
            let right = &bounds[right_index];
            if overlaps(left, right) {
                let (a, b) = ordered_pair(left.id, right.id);
                events.push(PhysicsEvent {
                    a: a.to_owned(),
                    b: b.to_owned(),
                    event: if left.trigger || right.trigger {
                        "TriggerEvent".to_owned()
                    } else {
                        "CollisionEvent".to_owned()
                    },
                });
            }
        }
    }
    events
}

fn entity_bounds(entity: &WorldEntity) -> Option<Bounds<'_>> {
    let collider = entity.components.collider.as_ref()?;
    Some(Bounds {
        center: entity
            .components
            .transform
            .as_ref()
            .and_then(|transform| transform.position)
            .unwrap_or([0.0, 0.0, 0.0]),
        half_extents: half_extents(collider),
        id: &entity.id,
        trigger: collider.trigger.unwrap_or(false),
    })
}

fn half_extents(collider: &ColliderComponent) -> [f32; 3] {
    match collider.kind.as_str() {
        "box" => {
            let size = collider.size.unwrap_or([1.0, 1.0, 1.0]);
            [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
        }
        "sphere" => {
            let radius = collider.radius.unwrap_or(0.5);
            [radius, radius, radius]
        }
        "capsule" | "cylinder" => {
            let radius = collider.radius.unwrap_or(0.5);
            [radius, collider.height.unwrap_or(1.0) / 2.0, radius]
        }
        _ => [0.5, 0.5, 0.5],
    }
}

fn overlaps(left: &Bounds<'_>, right: &Bounds<'_>) -> bool {
    (left.center[0] - right.center[0]).abs() <= left.half_extents[0] + right.half_extents[0]
        && (left.center[1] - right.center[1]).abs()
            <= left.half_extents[1] + right.half_extents[1]
        && (left.center[2] - right.center[2]).abs()
            <= left.half_extents[2] + right.half_extents[2]
}

fn ordered_pair<'a>(left: &'a str, right: &'a str) -> (&'a str, &'a str) {
    if left <= right {
        (left, right)
    } else {
        (right, left)
    }
}
