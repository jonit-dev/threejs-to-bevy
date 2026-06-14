use serde::{Deserialize, Serialize};
use threenative_loader::{ColliderComponent, LoadedBundle, WorldEntity};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterTraceObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    pub desired: [f32; 3],
    pub entity: String,
    pub grounded: bool,
    pub resolved: [f32; 3],
    pub start: [f32; 3],
}

#[derive(Clone, Copy)]
pub struct CharacterTraceAxis<'a> {
    pub id: &'a str,
    pub value: f32,
}

const SUPPORT_TOLERANCE: f32 = 0.1;

struct Bounds {
    center: [f32; 3],
    half_extents: [f32; 3],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterControllerComponent {
    blocking: bool,
    grounding: String,
    move_x_axis: String,
    move_z_axis: String,
    speed: f32,
}

pub fn trace_character_controllers(
    bundle: &LoadedBundle,
    axes: &[CharacterTraceAxis<'_>],
    fixed_delta: f32,
) -> Vec<CharacterTraceObservation> {
    let mut blockers = bundle
        .world
        .entities
        .iter()
        .filter(|entity| {
            entity
                .components
                .collider
                .as_ref()
                .is_some_and(|collider| !collider.trigger.unwrap_or(false))
        })
        .collect::<Vec<_>>();
    blockers.sort_by(|left, right| left.id.cmp(&right.id));

    let mut observations = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| trace_character(entity, &blockers, axes, fixed_delta))
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.entity.cmp(&right.entity));
    observations
}

fn trace_character(
    entity: &WorldEntity,
    blockers: &[&WorldEntity],
    axes: &[CharacterTraceAxis<'_>],
    fixed_delta: f32,
) -> Option<CharacterTraceObservation> {
    let controller = character_controller(entity)?;
    let collider = entity.components.collider.as_ref()?;
    let start = position(entity);
    let desired = add(
        start,
        movement_delta(
            axis_value(axes, &controller.move_x_axis),
            axis_value(axes, &controller.move_z_axis),
            controller.speed,
            fixed_delta,
        ),
    );
    let character_half_extents = half_extents(collider);
    let blocked_by = if controller.blocking {
        first_blocker(&entity.id, desired, character_half_extents, blockers)
    } else {
        None
    };
    let ungrounded = if blocked_by.is_some() { start } else { desired };
    let grounded = controller.grounding == "raycast";
    let resolved = if grounded {
        ground_position(&entity.id, ungrounded, character_half_extents, blockers)
    } else {
        ungrounded
    };

    Some(CharacterTraceObservation {
        blocked_by,
        desired,
        entity: entity.id.clone(),
        grounded,
        resolved,
        start,
    })
}

fn character_controller(entity: &WorldEntity) -> Option<CharacterControllerComponent> {
    entity
        .components
        .extra
        .get("CharacterController")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
}

fn movement_delta(axis_x: f32, axis_z: f32, speed: f32, fixed_delta: f32) -> [f32; 3] {
    let length = axis_x.hypot(axis_z);
    if length == 0.0 {
        return [0.0, 0.0, 0.0];
    }
    let scale = speed * fixed_delta / length.max(1.0);
    [axis_x * scale, 0.0, axis_z * scale]
}

fn first_blocker(
    character_id: &str,
    desired: [f32; 3],
    character_half_extents: [f32; 3],
    blockers: &[&WorldEntity],
) -> Option<String> {
    let character_bounds = Bounds {
        center: desired,
        half_extents: character_half_extents,
    };
    for blocker in blockers {
        if blocker.id == character_id {
            continue;
        }
        let Some(bounds) = entity_bounds(blocker) else {
            continue;
        };
        if penetrates(&character_bounds, &bounds)
            && is_side_blocker(desired, character_half_extents, &bounds)
        {
            return Some(blocker.id.clone());
        }
    }
    None
}

fn ground_position(
    character_id: &str,
    position: [f32; 3],
    character_half_extents: [f32; 3],
    blockers: &[&WorldEntity],
) -> [f32; 3] {
    let mut ground_y = None;
    for blocker in blockers {
        if blocker.id == character_id {
            continue;
        }
        let Some(bounds) = entity_bounds(blocker) else {
            continue;
        };
        if !covers_xz(position, &bounds) {
            continue;
        }
        let top = bounds.center[1] + bounds.half_extents[1];
        let foot = position[1] - character_half_extents[1];
        if top <= foot + SUPPORT_TOLERANCE && ground_y.is_none_or(|current| top > current) {
            ground_y = Some(top);
        }
    }
    match ground_y {
        Some(y) => [position[0], y + character_half_extents[1], position[2]],
        None => [position[0], position[1], position[2]],
    }
}

fn entity_bounds(entity: &WorldEntity) -> Option<Bounds> {
    let collider = entity.components.collider.as_ref()?;
    Some(Bounds {
        center: position(entity),
        half_extents: half_extents(collider),
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

fn penetrates(left: &Bounds, right: &Bounds) -> bool {
    (left.center[0] - right.center[0]).abs()
        < left.half_extents[0] + right.half_extents[0] - 0.00001
        && (left.center[1] - right.center[1]).abs()
            < left.half_extents[1] + right.half_extents[1] - 0.00001
        && (left.center[2] - right.center[2]).abs()
            < left.half_extents[2] + right.half_extents[2] - 0.00001
}

fn covers_xz(point: [f32; 3], bounds: &Bounds) -> bool {
    (point[0] - bounds.center[0]).abs() <= bounds.half_extents[0]
        && (point[2] - bounds.center[2]).abs() <= bounds.half_extents[2]
}

fn is_side_blocker(position: [f32; 3], character_half_extents: [f32; 3], bounds: &Bounds) -> bool {
    let foot = position[1] - character_half_extents[1];
    let top = bounds.center[1] + bounds.half_extents[1];
    top > foot + SUPPORT_TOLERANCE
}

fn axis_value(axes: &[CharacterTraceAxis<'_>], id: &str) -> f32 {
    axes.iter()
        .find_map(|axis| (axis.id == id).then_some(axis.value))
        .unwrap_or(0.0)
}

fn add(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

fn position(entity: &WorldEntity) -> [f32; 3] {
    entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0])
}
