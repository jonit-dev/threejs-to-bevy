use serde::{Deserialize, Serialize};
use threenative_loader::{ColliderComponent, ColliderSlopeComponent, LoadedBundle, WorldEntity};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterTraceObservation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_by: Option<String>,
    pub desired: [f32; 3],
    pub entity: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ground_entity: Option<String>,
    pub grounded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform_delta: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pushed: Option<CharacterPushObservation>,
    pub resolved: [f32; 3],
    pub start: [f32; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub too_heavy: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterPushObservation {
    pub entity: String,
    pub impulse: [f32; 3],
    pub position: [f32; 3],
}

#[derive(Clone, Copy)]
pub struct CharacterTraceAxis<'a> {
    pub id: &'a str,
    pub value: f32,
}

#[derive(Clone, Copy)]
pub struct CharacterTraceInput<'a> {
    pub axes: &'a [CharacterTraceAxis<'a>],
    pub direction: Option<[f32; 2]>,
    pub fixed_delta: f32,
    pub speed: Option<f32>,
}

const SUPPORT_TOLERANCE: f32 = 0.1;
const DEFAULT_SLOPE_LIMIT: f32 = 45.0;

struct Bounds {
    center: [f32; 3],
    half_extents: [f32; 3],
    id: String,
    slope: Option<SlopeBounds>,
    velocity: Option<[f32; 3]>,
}

struct SlopeBounds {
    angle: f32,
    axis: String,
    direction: i8,
    rise: f32,
}

struct GroundResolution {
    entity: Option<String>,
    platform_delta: Option<[f32; 3]>,
    position: [f32; 3],
}

struct HorizontalResolution {
    blocked_by: Option<String>,
    position: [f32; 3],
    pushed: Option<CharacterPushObservation>,
    too_heavy: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterControllerComponent {
    blocking: bool,
    grounding: String,
    move_x_axis: String,
    move_z_axis: String,
    push_policy: Option<CharacterPushPolicy>,
    slope_limit: Option<f32>,
    speed: f32,
    step_offset: Option<f32>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CharacterPushPolicy {
    allowed_layers: Option<Vec<String>>,
    blocked_when_too_heavy: Option<bool>,
    enabled: bool,
    impulse_scale: Option<f32>,
    max_push_mass: Option<f32>,
    min_move_speed: Option<f32>,
}

pub fn trace_character_controllers(
    bundle: &LoadedBundle,
    axes: &[CharacterTraceAxis<'_>],
    fixed_delta: f32,
) -> Vec<CharacterTraceObservation> {
    trace_character_controllers_with_input(
        bundle,
        CharacterTraceInput {
            axes,
            direction: None,
            fixed_delta,
            speed: None,
        },
    )
}

pub fn trace_character_controllers_with_input(
    bundle: &LoadedBundle,
    input: CharacterTraceInput<'_>,
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
        .filter_map(|entity| trace_character(entity, &blockers, input))
        .collect::<Vec<_>>();
    observations.sort_by(|left, right| left.entity.cmp(&right.entity));
    observations
}

fn trace_character(
    entity: &WorldEntity,
    blockers: &[&WorldEntity],
    input: CharacterTraceInput<'_>,
) -> Option<CharacterTraceObservation> {
    let controller = character_controller(entity)?;
    let collider = entity.components.collider.as_ref()?;
    let start = position(entity);
    let axis_x = input
        .direction
        .map(|direction| direction[0])
        .unwrap_or_else(|| axis_value(input.axes, &controller.move_x_axis));
    let axis_z = input
        .direction
        .map(|direction| direction[1])
        .unwrap_or_else(|| axis_value(input.axes, &controller.move_z_axis));
    let desired = add(
        start,
        movement_delta(
            axis_x,
            axis_z,
            input.speed.unwrap_or(controller.speed),
            input.fixed_delta,
        ),
    );
    let character_half_extents = half_extents(collider);
    let horizontal = if controller.blocking {
        resolve_horizontal_contact(
            &entity.id,
            start,
            desired,
            character_half_extents,
            blockers,
            controller.step_offset.unwrap_or(0.0),
            controller.slope_limit.unwrap_or(DEFAULT_SLOPE_LIMIT),
            controller.push_policy.as_ref(),
        )
    } else {
        HorizontalResolution {
            blocked_by: None,
            position: desired,
            pushed: None,
            too_heavy: None,
        }
    };
    let ground = if controller.grounding == "raycast" {
        ground_position(
            &entity.id,
            horizontal.position,
            character_half_extents,
            blockers,
            input.fixed_delta,
            controller.slope_limit.unwrap_or(DEFAULT_SLOPE_LIMIT),
        )
    } else {
        GroundResolution {
            entity: None,
            platform_delta: None,
            position: horizontal.position,
        }
    };

    Some(CharacterTraceObservation {
        blocked_by: horizontal.blocked_by,
        desired,
        entity: entity.id.clone(),
        ground_entity: ground.entity.clone(),
        grounded: ground.entity.is_some(),
        platform_delta: ground.platform_delta,
        pushed: horizontal.pushed,
        resolved: ground.position,
        start,
        too_heavy: horizontal.too_heavy,
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

fn resolve_horizontal_contact(
    character_id: &str,
    start: [f32; 3],
    desired: [f32; 3],
    character_half_extents: [f32; 3],
    blockers: &[&WorldEntity],
    step_offset: f32,
    slope_limit: f32,
    push_policy: Option<&CharacterPushPolicy>,
) -> HorizontalResolution {
    let mut position = desired;
    let mut character_bounds = Bounds {
        center: position,
        half_extents: character_half_extents,
        id: character_id.to_owned(),
        slope: None,
        velocity: None,
    };
    let movement = [desired[0] - start[0], 0.0, desired[2] - start[2]];
    for blocker in blockers {
        if blocker.id == character_id {
            continue;
        }
        let Some(bounds) = entity_bounds(blocker) else {
            continue;
        };
        if !penetrates(&character_bounds, &bounds)
            || !is_side_blocker(position, character_half_extents, &bounds)
        {
            continue;
        }
        if bounds.slope.is_some() && can_walk_slope(position, &bounds, slope_limit) {
            let top = surface_top(position, &bounds);
            position = [position[0], top + character_half_extents[1], position[2]];
            character_bounds.center = position;
            continue;
        }
        if can_step_onto(position, character_half_extents, &bounds, step_offset) {
            let top = surface_top(position, &bounds);
            position = [position[0], top + character_half_extents[1], position[2]];
            character_bounds.center = position;
            continue;
        }
        match resolve_push(push_policy, blocker, movement) {
            PushResolution::Pushed(pushed) => {
                return HorizontalResolution {
                    blocked_by: None,
                    position,
                    pushed: Some(pushed),
                    too_heavy: None,
                };
            }
            PushResolution::TooHeavy => {
                return HorizontalResolution {
                    blocked_by: Some(blocker.id.clone()),
                    position: start,
                    pushed: None,
                    too_heavy: Some(blocker.id.clone()),
                };
            }
            PushResolution::None => {}
        }
        return HorizontalResolution {
            blocked_by: Some(blocker.id.clone()),
            position: start,
            pushed: None,
            too_heavy: None,
        };
    }
    HorizontalResolution {
        blocked_by: None,
        position,
        pushed: None,
        too_heavy: None,
    }
}

enum PushResolution {
    None,
    Pushed(CharacterPushObservation),
    TooHeavy,
}

fn resolve_push(
    policy: Option<&CharacterPushPolicy>,
    blocker: &WorldEntity,
    movement: [f32; 3],
) -> PushResolution {
    let Some(policy) = policy else {
        return PushResolution::None;
    };
    if !policy.enabled {
        return PushResolution::None;
    }
    let Some(body) = blocker.components.rigid_body.as_ref() else {
        return PushResolution::None;
    };
    if body.kind != "dynamic" {
        return PushResolution::None;
    }
    let layer = blocker
        .components
        .collider
        .as_ref()
        .and_then(|collider| collider.layer.as_ref());
    if policy.allowed_layers.as_ref().is_some_and(|layers| {
        layer.is_none_or(|value| !layers.iter().any(|candidate| candidate == value))
    }) {
        return PushResolution::None;
    }
    let mass = body.mass.unwrap_or_else(|| match body.inverse_mass {
        Some(value) if value > 0.0 => 1.0 / value,
        _ => 1.0,
    });
    if mass > policy.max_push_mass.unwrap_or(f32::INFINITY) {
        return if policy.blocked_when_too_heavy.unwrap_or(true) {
            PushResolution::TooHeavy
        } else {
            PushResolution::None
        };
    }
    if movement[0].hypot(movement[2]) < policy.min_move_speed.unwrap_or(0.0) {
        return PushResolution::None;
    }
    let impulse = scale(movement, policy.impulse_scale.unwrap_or(1.0));
    PushResolution::Pushed(CharacterPushObservation {
        entity: blocker.id.clone(),
        impulse,
        position: add(position(blocker), impulse),
    })
}

fn ground_position(
    character_id: &str,
    position: [f32; 3],
    character_half_extents: [f32; 3],
    blockers: &[&WorldEntity],
    fixed_delta: f32,
    slope_limit: f32,
) -> GroundResolution {
    let mut ground: Option<Bounds> = None;
    let mut ground_top: Option<f32> = None;
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
        if !can_walk_slope(position, &bounds, slope_limit) {
            continue;
        }
        let top = surface_top(position, &bounds);
        let foot = position[1] - character_half_extents[1];
        if top <= foot + SUPPORT_TOLERANCE && ground_top.is_none_or(|current| top > current) {
            ground = Some(bounds);
            ground_top = Some(top);
        }
    }
    let (Some(ground), Some(ground_top)) = (ground, ground_top) else {
        return GroundResolution {
            entity: None,
            platform_delta: None,
            position,
        };
    };
    let grounded = [
        position[0],
        ground_top + character_half_extents[1],
        position[2],
    ];
    match ground.velocity {
        Some(velocity) => {
            let platform_delta = scale(velocity, fixed_delta);
            GroundResolution {
                entity: Some(ground.id),
                platform_delta: Some(platform_delta),
                position: add(grounded, platform_delta),
            }
        }
        None => GroundResolution {
            entity: Some(ground.id),
            platform_delta: None,
            position: grounded,
        },
    }
}

fn entity_bounds(entity: &WorldEntity) -> Option<Bounds> {
    let collider = entity.components.collider.as_ref()?;
    Some(Bounds {
        center: position(entity),
        half_extents: half_extents(collider),
        id: entity.id.clone(),
        slope: slope(collider),
        velocity: entity
            .components
            .rigid_body
            .as_ref()
            .and_then(|body| body.velocity),
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
    let top = surface_top(position, bounds);
    top > foot + SUPPORT_TOLERANCE
}

fn can_step_onto(
    position: [f32; 3],
    character_half_extents: [f32; 3],
    bounds: &Bounds,
    step_offset: f32,
) -> bool {
    let foot = position[1] - character_half_extents[1];
    let top = surface_top(position, bounds);
    step_offset > 0.0
        && top > foot + SUPPORT_TOLERANCE
        && top <= foot + step_offset + SUPPORT_TOLERANCE
        && covers_xz(position, bounds)
}

fn can_walk_slope(position: [f32; 3], bounds: &Bounds, slope_limit: f32) -> bool {
    bounds
        .slope
        .as_ref()
        .is_none_or(|slope| covers_xz(position, bounds) && slope.angle <= slope_limit + 0.0001)
}

fn surface_top(position: [f32; 3], bounds: &Bounds) -> f32 {
    let Some(slope) = bounds.slope.as_ref() else {
        return bounds.center[1] + bounds.half_extents[1];
    };
    let axis_index = if slope.axis == "x" { 0 } else { 2 };
    let min = bounds.center[axis_index] - bounds.half_extents[axis_index];
    let max = bounds.center[axis_index] + bounds.half_extents[axis_index];
    let span = (max - min).max(0.0001);
    let distance = if slope.direction == 1 {
        position[axis_index] - min
    } else {
        max - position[axis_index]
    };
    let t = (distance / span).clamp(0.0, 1.0);
    bounds.center[1] - bounds.half_extents[1] + t * slope.rise
}

fn slope(collider: &ColliderComponent) -> Option<SlopeBounds> {
    let ColliderSlopeComponent {
        axis,
        direction,
        rise,
        run,
    } = collider.slope.as_ref()?;
    Some(SlopeBounds {
        angle: rise.atan2(*run) * 180.0 / std::f32::consts::PI,
        axis: axis.clone(),
        direction: *direction,
        rise: *rise,
    })
}

fn axis_value(axes: &[CharacterTraceAxis<'_>], id: &str) -> f32 {
    axes.iter()
        .find_map(|axis| (axis.id == id).then_some(axis.value))
        .unwrap_or(0.0)
}

fn add(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

fn scale(vector: [f32; 3], amount: f32) -> [f32; 3] {
    [vector[0] * amount, vector[1] * amount, vector[2] * amount]
}

fn position(entity: &WorldEntity) -> [f32; 3] {
    entity
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0])
}
