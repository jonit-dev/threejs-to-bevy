use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
};

use rapier3d::{
    glamx::Vec3,
    prelude::{PhysicsWorld, RigidBodyHandle},
};
use serde::{Deserialize, Serialize};
use threenative_loader::{
    AerodynamicBodyComponent, AerodynamicCurvePoint, LoadedBundle, WindVolumeComponent,
};

const DEFAULT_AIR_DENSITY: f32 = 1.225;
const EPSILON: f32 = 0.000_001;

thread_local! {
    static INPUTS: RefCell<BTreeMap<usize, BTreeMap<String, AerodynamicInputs>>> = const { RefCell::new(BTreeMap::new()) };
    static OBSERVATIONS: RefCell<BTreeMap<usize, Vec<AerodynamicObservation>>> = const { RefCell::new(BTreeMap::new()) };
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicInputs {
    #[serde(default)]
    pub surfaces: BTreeMap<String, f32>,
    #[serde(default)]
    pub thrusters: BTreeMap<String, f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicDiagnostic {
    pub code: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicSurfaceObservation {
    pub angle_of_attack: f32,
    pub control_deflection: f32,
    pub drag: [f32; 3],
    pub force_point: [f32; 3],
    pub id: String,
    pub lift: [f32; 3],
    pub stalled: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThrusterObservation {
    pub force: [f32; 3],
    pub fuel_hook: Option<String>,
    pub id: String,
    pub point: [f32; 3],
    pub throttle: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicObservation {
    pub air_density: f32,
    pub diagnostics: Vec<AerodynamicDiagnostic>,
    pub entity: String,
    pub relative_air_velocity: [f32; 3],
    pub sideslip: f32,
    pub surfaces: Vec<AerodynamicSurfaceObservation>,
    pub thrusters: Vec<ThrusterObservation>,
    pub wind_velocity: [f32; 3],
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AerodynamicTraceSample {
    #[serde(default)]
    pub inputs: AerodynamicInputs,
    pub position: [f32; 3],
    pub velocity: [f32; 3],
}

#[derive(Default)]
pub(crate) struct AerodynamicRuntimeState {
    bodies: BTreeMap<String, BodyState>,
    tick: u64,
}

#[derive(Default)]
struct BodyState {
    controls: BTreeMap<String, f32>,
    stalls: BTreeSet<String>,
    throttles: BTreeMap<String, f32>,
}

struct Contribution {
    force: Vec3,
    point: Vec3,
}

pub fn set_physics_aerodynamic_inputs(
    runtime_id: usize,
    bundle: &LoadedBundle,
    entity: &str,
    inputs: AerodynamicInputs,
) -> bool {
    let Some(body) = bundle
        .world
        .entities
        .iter()
        .find(|candidate| candidate.id == entity)
        .and_then(|candidate| candidate.components.aerodynamic_body.as_ref())
    else {
        return false;
    };
    if !valid_inputs(body, &inputs) {
        return false;
    }
    INPUTS.with(|stored| {
        stored
            .borrow_mut()
            .entry(runtime_id)
            .or_default()
            .insert(entity.to_owned(), inputs);
    });
    true
}

pub fn observe_physics_aerodynamics(runtime_id: usize) -> Vec<AerodynamicObservation> {
    OBSERVATIONS.with(|stored| {
        stored
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    })
}
pub fn dispose_physics_aerodynamics(runtime_id: usize) {
    INPUTS.with(|stored| {
        stored.borrow_mut().remove(&runtime_id);
    });
    OBSERVATIONS.with(|stored| {
        stored.borrow_mut().remove(&runtime_id);
    });
}

pub fn trace_physics_aerodynamics(
    bundle: &LoadedBundle,
    entity_id: &str,
    fixed_delta: f32,
    samples: &[AerodynamicTraceSample],
) -> Option<Vec<AerodynamicObservation>> {
    let declaration = bundle
        .world
        .entities
        .iter()
        .find(|entity| entity.id == entity_id)?
        .components
        .aerodynamic_body
        .as_ref()?;
    let mut state = BodyState::default();
    Some(
        samples
            .iter()
            .enumerate()
            .map(|(tick, sample)| {
                let position = vec(sample.position);
                let (mut observation, contributions) = compute_body(
                    entity_id,
                    declaration,
                    position,
                    rapier3d::math::Rotation::IDENTITY,
                    vec(sample.velocity),
                    wind_at(bundle, position, tick as u64, fixed_delta),
                    Some(&sample.inputs),
                    &mut state,
                    fixed_delta,
                );
                scale_observation_to_force_budget(
                    entity_id,
                    declaration,
                    &contributions,
                    &mut observation,
                );
                observation
            })
            .collect(),
    )
}

pub(crate) fn step_physics_aerodynamics(
    runtime_id: usize,
    bundle: &LoadedBundle,
    world: &mut PhysicsWorld,
    handles: &BTreeMap<String, RigidBodyHandle>,
    state: &mut AerodynamicRuntimeState,
    fixed_delta: f32,
) {
    let inputs = INPUTS.with(|stored| {
        stored
            .borrow()
            .get(&runtime_id)
            .cloned()
            .unwrap_or_default()
    });
    let mut observations = Vec::new();
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            Some((
                entity.id.as_str(),
                entity.components.aerodynamic_body.as_ref()?,
            ))
        })
        .collect::<Vec<_>>();
    entities.sort_by_key(|(id, _)| *id);
    for (entity_id, declaration) in entities {
        let Some(handle) = handles.get(entity_id).copied() else {
            continue;
        };
        let Some(body) = world.bodies.get(handle) else {
            continue;
        };
        let pose = *body.position();
        let velocity = body.linvel();
        let position = Vec3::new(pose.translation.x, pose.translation.y, pose.translation.z);
        let wind = wind_at(bundle, position, state.tick, fixed_delta);
        let runtime = state.bodies.entry(entity_id.to_owned()).or_default();
        let (mut observation, contributions) = compute_body(
            entity_id,
            declaration,
            position,
            pose.rotation,
            velocity,
            wind,
            inputs.get(entity_id),
            runtime,
            fixed_delta,
        );
        let force_scale = scale_observation_to_force_budget(
            entity_id,
            declaration,
            &contributions,
            &mut observation,
        );
        if let Some(body) = world.bodies.get_mut(handle) {
            for contribution in contributions {
                body.apply_impulse_at_point(
                    contribution.force * force_scale * fixed_delta,
                    contribution.point,
                    true,
                );
            }
        }
        observations.push(observation);
    }
    OBSERVATIONS.with(|stored| {
        stored.borrow_mut().insert(runtime_id, observations);
    });
    state.tick = state.tick.saturating_add(1);
}

fn scale_observation_to_force_budget(
    entity_id: &str,
    declaration: &AerodynamicBodyComponent,
    contributions: &[Contribution],
    observation: &mut AerodynamicObservation,
) -> f32 {
    let total = contributions
        .iter()
        .fold(Vec3::ZERO, |sum, item| sum + item.force);
    let finite = total.is_finite()
        && contributions
            .iter()
            .all(|item| item.force.is_finite() && item.point.is_finite());
    let force_scale = if !finite {
        observation.diagnostics.push(AerodynamicDiagnostic {
            code: "TN_PHYSICS_AERODYNAMIC_FORCE_INVALID".to_owned(),
            path: format!("world/{entity_id}/AerodynamicBody"),
        });
        0.0
    } else if total.length() > declaration.max_force {
        observation.diagnostics.push(AerodynamicDiagnostic {
            code: "TN_PHYSICS_AERODYNAMIC_FORCE_OVER_BUDGET".to_owned(),
            path: format!("world/{entity_id}/AerodynamicBody/maxForce"),
        });
        declaration.max_force / total.length()
    } else {
        1.0
    };
    if force_scale != 1.0 {
        for surface in &mut observation.surfaces {
            surface.lift = array(vec(surface.lift) * force_scale);
            surface.drag = array(vec(surface.drag) * force_scale);
        }
        for thruster in &mut observation.thrusters {
            thruster.force = array(vec(thruster.force) * force_scale);
        }
    }
    force_scale
}

#[allow(
    clippy::too_many_arguments,
    clippy::too_many_lines,
    reason = "the aerodynamic force kernel consumes one explicit fixed-step state vector and emits one bounded observation"
)]
fn compute_body(
    entity: &str,
    declaration: &AerodynamicBodyComponent,
    position: Vec3,
    rotation: rapier3d::math::Rotation,
    velocity: Vec3,
    wind: (Vec3, f32),
    inputs: Option<&AerodynamicInputs>,
    runtime: &mut BodyState,
    fixed_delta: f32,
) -> (AerodynamicObservation, Vec<Contribution>) {
    let relative = velocity - wind.0;
    let local = rotation.inverse() * relative;
    let speed = relative.length();
    let sideslip = if speed < EPSILON {
        0.0
    } else {
        local.x.atan2((-local.z).max(EPSILON))
    };
    let mut contributions = Vec::new();
    if speed >= EPSILON {
        let drag = Vec3::new(
            -0.5 * wind.1 * declaration.drag_area[0] * local.x * local.x.abs(),
            -0.5 * wind.1 * declaration.drag_area[1] * local.y * local.y.abs(),
            -0.5 * wind.1 * declaration.drag_area[2] * local.z * local.z.abs(),
        );
        contributions.push(Contribution {
            force: rotation * drag,
            point: position,
        });
    }
    let mut surfaces = Vec::new();
    for surface in &declaration.surfaces {
        let requested = inputs
            .and_then(|value| value.surfaces.get(&surface.id))
            .copied()
            .unwrap_or(
                surface
                    .control
                    .as_ref()
                    .and_then(|control| control.input)
                    .unwrap_or(0.0),
            );
        let applied_key = format!("applied:{}", surface.id);
        let previous = runtime.controls.get(&applied_key).copied().unwrap_or(
            surface
                .control
                .as_ref()
                .and_then(|control| control.input)
                .unwrap_or(0.0),
        );
        let applied = approach(
            previous,
            requested,
            surface
                .control
                .as_ref()
                .map_or(1.0, |control| control.response)
                * fixed_delta,
        );
        runtime.controls.insert(applied_key, applied);
        let deflection = applied
            * surface
                .control
                .as_ref()
                .map_or(0.0, |control| control.max_deflection);
        let angle = if speed < EPSILON {
            0.0
        } else {
            (-local.y).atan2((-local.z).max(EPSILON))
        };
        let effective = angle + deflection;
        let was_stalled = runtime.stalls.contains(&surface.id);
        let stalled = if was_stalled {
            effective.abs() > surface.recovery_angle
        } else {
            effective.abs() >= surface.stall_angle
        };
        if stalled {
            runtime.stalls.insert(surface.id.clone());
        } else {
            runtime.stalls.remove(&surface.id);
        }
        let point = position + rotation * vec(surface.center_of_pressure);
        let (lift, drag) = if speed < EPSILON {
            (Vec3::ZERO, Vec3::ZERO)
        } else {
            let pressure = 0.5 * wind.1 * speed * speed;
            let correction = surface.aspect_ratio / (surface.aspect_ratio + 2.0);
            let lift_coefficient = sample_curve(&surface.lift_curve, effective)
                * correction
                * if stalled { 0.35 } else { 1.0 };
            let drag_coefficient = sample_curve(&surface.drag_curve, effective).max(0.0);
            (
                rotation * Vec3::Y * pressure * surface.area * lift_coefficient,
                -relative.normalize() * pressure * surface.area * drag_coefficient,
            )
        };
        if speed >= EPSILON {
            contributions.push(Contribution {
                force: lift + drag,
                point,
            });
        }
        surfaces.push(AerodynamicSurfaceObservation {
            angle_of_attack: round(angle),
            control_deflection: round(deflection),
            drag: round_array(drag),
            force_point: round_array(point),
            id: surface.id.clone(),
            lift: round_array(lift),
            stalled,
        });
    }
    let mut thrusters = Vec::new();
    for thruster in declaration.thrusters.as_deref().unwrap_or_default() {
        let requested = inputs
            .and_then(|value| value.thrusters.get(&thruster.id))
            .copied()
            .unwrap_or(thruster.throttle.unwrap_or(0.0));
        let applied_key = format!("applied:{}", thruster.id);
        let previous = runtime.throttles.get(&applied_key).copied().unwrap_or(0.0);
        let applied = approach(previous, requested, thruster.response * fixed_delta);
        runtime.throttles.insert(applied_key, applied);
        let point = position + rotation * vec(thruster.point);
        let force =
            (rotation * vec(thruster.direction)).normalize_or_zero() * thruster.max_force * applied;
        contributions.push(Contribution { force, point });
        thrusters.push(ThrusterObservation {
            force: round_array(force),
            fuel_hook: thruster.fuel_hook.clone(),
            id: thruster.id.clone(),
            point: round_array(point),
            throttle: round(applied),
        });
    }
    (
        AerodynamicObservation {
            air_density: round(wind.1),
            diagnostics: Vec::new(),
            entity: entity.to_owned(),
            relative_air_velocity: round_array(relative),
            sideslip: round(sideslip),
            surfaces,
            thrusters,
            wind_velocity: round_array(wind.0),
        },
        contributions,
    )
}

fn wind_at(bundle: &LoadedBundle, point: Vec3, tick: u64, fixed_delta: f32) -> (Vec3, f32) {
    let mut velocity = Vec3::ZERO;
    let mut density = DEFAULT_AIR_DENSITY;
    let mut volumes = bundle
        .world
        .entities
        .iter()
        .filter_map(|entity| {
            Some((
                entity.id.as_str(),
                entity.components.wind_volume.as_ref()?,
                entity
                    .components
                    .transform
                    .as_ref()
                    .and_then(|transform| transform.position)
                    .map_or(Vec3::ZERO, vec),
            ))
        })
        .collect::<Vec<_>>();
    volumes.sort_by_key(|(id, _, _)| *id);
    for (_, volume, center) in volumes {
        if contains(volume, center, point) {
            velocity += vec(volume.velocity) + gust_velocity(volume, tick as f32 * fixed_delta);
            if let Some(value) = volume.air_density {
                density = value;
            }
        }
    }
    (velocity, density)
}
fn contains(volume: &WindVolumeComponent, center: Vec3, point: Vec3) -> bool {
    let offset = point - center;
    if volume.shape == "sphere" {
        offset.length() <= volume.radius.unwrap_or(0.0)
    } else {
        let half = vec(volume.size.unwrap_or([0.0; 3])) * 0.5;
        offset.x.abs() <= half.x && offset.y.abs() <= half.y && offset.z.abs() <= half.z
    }
}
fn gust_velocity(volume: &WindVolumeComponent, elapsed: f32) -> Vec3 {
    let Some(gust) = &volume.gust else {
        return Vec3::ZERO;
    };
    let phase = elapsed * gust.frequency * std::f32::consts::TAU;
    Vec3::new(
        gust.amplitude[0] * (phase + seeded_phase(gust.seed, 0)).sin(),
        gust.amplitude[1] * (phase + seeded_phase(gust.seed, 1)).sin(),
        gust.amplitude[2] * (phase + seeded_phase(gust.seed, 2)).sin(),
    )
}
fn seeded_phase(seed: u32, axis: u32) -> f32 {
    let mut value = seed ^ (axis + 1).wrapping_mul(0x9e37_79b9);
    value ^= value << 13;
    value ^= value >> 17;
    value ^= value << 5;
    (value & 0xffff) as f32 * (std::f32::consts::TAU / 65_536.0)
}
fn sample_curve(curve: &[AerodynamicCurvePoint], angle: f32) -> f32 {
    if angle <= curve[0].angle {
        return curve[0].coefficient;
    }
    if angle >= curve[curve.len() - 1].angle {
        return curve[curve.len() - 1].coefficient;
    }
    let upper = curve
        .iter()
        .position(|point| point.angle >= angle)
        .unwrap_or(curve.len() - 1);
    let left = &curve[upper - 1];
    let right = &curve[upper];
    left.coefficient
        + (right.coefficient - left.coefficient)
            * ((angle - left.angle) / (right.angle - left.angle))
}
fn valid_inputs(body: &AerodynamicBodyComponent, inputs: &AerodynamicInputs) -> bool {
    inputs.surfaces.iter().all(|(id, value)| {
        body.surfaces.iter().any(|surface| surface.id == *id)
            && value.is_finite()
            && (-1.0..=1.0).contains(value)
    }) && inputs.thrusters.iter().all(|(id, value)| {
        body.thrusters
            .as_deref()
            .unwrap_or_default()
            .iter()
            .any(|thruster| thruster.id == *id)
            && value.is_finite()
            && (0.0..=1.0).contains(value)
    })
}
fn approach(current: f32, target: f32, max_delta: f32) -> f32 {
    current + (target - current).clamp(-max_delta, max_delta)
}
fn vec(value: [f32; 3]) -> Vec3 {
    Vec3::new(value[0], value[1], value[2])
}
fn array(value: Vec3) -> [f32; 3] {
    [value.x, value.y, value.z]
}
fn round(value: f32) -> f32 {
    (value * 1_000_000.0).round() / 1_000_000.0
}
fn round_array(value: Vec3) -> [f32; 3] {
    [round(value.x), round(value.y), round(value.z)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use threenative_loader::{AerodynamicControlComponent, AerodynamicSurfaceComponent};

    #[test]
    fn analytic_force_cases_match_portable_semantics() {
        let declaration = body();
        let mut state = BodyState::default();
        let (zero, _) = compute_body(
            "craft",
            &declaration,
            Vec3::ZERO,
            rapier3d::math::Rotation::IDENTITY,
            Vec3::ZERO,
            (Vec3::ZERO, DEFAULT_AIR_DENSITY),
            None,
            &mut state,
            1.0 / 60.0,
        );
        assert_eq!(zero.surfaces[0].lift, [0.0; 3]);
        assert_eq!(zero.surfaces[0].drag, [0.0; 3]);
        let mut slow_state = BodyState::default();
        let (slow, _) = compute_body(
            "craft",
            &declaration,
            Vec3::ZERO,
            rapier3d::math::Rotation::IDENTITY,
            Vec3::new(0.0, 0.0, -10.0),
            (Vec3::ZERO, DEFAULT_AIR_DENSITY),
            None,
            &mut slow_state,
            1.0 / 60.0,
        );
        let mut fast_state = BodyState::default();
        let (fast, _) = compute_body(
            "craft",
            &declaration,
            Vec3::ZERO,
            rapier3d::math::Rotation::IDENTITY,
            Vec3::new(0.0, 0.0, -20.0),
            (Vec3::ZERO, DEFAULT_AIR_DENSITY),
            None,
            &mut fast_state,
            1.0 / 60.0,
        );
        assert!(
            (vec(fast.surfaces[0].drag).length() / vec(slow.surfaces[0].drag).length() - 4.0).abs()
                < 0.0001
        );
    }

    #[test]
    fn sinking_flight_reads_positive_angle_of_attack() {
        let declaration = body();
        let mut run = |velocity: Vec3| {
            let mut state = BodyState::default();
            compute_body(
                "craft",
                &declaration,
                Vec3::ZERO,
                rapier3d::math::Rotation::IDENTITY,
                velocity,
                (Vec3::ZERO, DEFAULT_AIR_DENSITY),
                None,
                &mut state,
                1.0 / 60.0,
            )
            .0
        };
        let level = run(Vec3::new(0.0, 0.0, -20.0));
        let sinking = run(Vec3::new(0.0, -2.0, -20.0));
        let climbing = run(Vec3::new(0.0, 2.0, -20.0));
        assert_eq!(level.surfaces[0].angle_of_attack, 0.0);
        assert!(sinking.surfaces[0].angle_of_attack > 0.0);
        assert!(climbing.surfaces[0].angle_of_attack < 0.0);
    }

    #[test]
    fn elevator_reverses_torque_and_stall_recovers() {
        let declaration = body();
        let run = |input| {
            let mut state = BodyState::default();
            let inputs = AerodynamicInputs {
                surfaces: BTreeMap::from([("elevator".to_owned(), input)]),
                thrusters: BTreeMap::new(),
            };
            compute_body(
                "craft",
                &declaration,
                Vec3::ZERO,
                rapier3d::math::Rotation::IDENTITY,
                Vec3::new(0.0, 0.0, -20.0),
                (Vec3::ZERO, DEFAULT_AIR_DENSITY),
                Some(&inputs),
                &mut state,
                1.0,
            )
            .0
            .surfaces[0]
                .clone()
        };
        let positive = run(1.0);
        let negative = run(-1.0);
        assert!(
            (vec(positive.force_point).cross(vec(positive.lift))).x
                * (vec(negative.force_point).cross(vec(negative.lift))).x
                < 0.0
        );
        let mut state = BodyState::default();
        let (stalled, _) = compute_body(
            "craft",
            &declaration,
            Vec3::ZERO,
            rapier3d::math::Rotation::IDENTITY,
            Vec3::new(0.0, 10.0, -10.0),
            (Vec3::ZERO, DEFAULT_AIR_DENSITY),
            None,
            &mut state,
            1.0 / 60.0,
        );
        assert!(stalled.surfaces[0].stalled);
        let (recovered, _) = compute_body(
            "craft",
            &declaration,
            Vec3::ZERO,
            rapier3d::math::Rotation::IDENTITY,
            Vec3::new(0.0, 1.0, -20.0),
            (Vec3::ZERO, DEFAULT_AIR_DENSITY),
            None,
            &mut state,
            1.0 / 60.0,
        );
        assert!(!recovered.surfaces[0].stalled);
    }

    #[test]
    fn canonical_fixture_moves_through_the_native_physics_boundary() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
            "../../../packages/ir/fixtures/conformance/advanced-physics-aerodynamics/game.bundle",
        );
        let mut bundle = threenative_loader::load_bundle(path).expect("fixture should load");
        let script_poses = BTreeSet::new();
        let runtime_id = crate::physics::native_physics_runtime_id(&script_poses);
        assert!(set_physics_aerodynamic_inputs(
            runtime_id,
            &bundle,
            "craft",
            AerodynamicInputs {
                surfaces: BTreeMap::from([("elevator".to_owned(), 0.0)]),
                thrusters: BTreeMap::from([("main-engine".to_owned(), 1.0)]),
            },
        ));
        let before = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "craft")
            .and_then(|entity| entity.components.transform.as_ref())
            .and_then(|transform| transform.position)
            .expect("craft position");
        for _ in 0..60 {
            crate::physics::step_bundle_physics_with_script_poses(
                &mut bundle,
                1.0 / 60.0,
                &script_poses,
            );
        }
        let after = bundle
            .world
            .entities
            .iter()
            .find(|entity| entity.id == "craft")
            .and_then(|entity| entity.components.transform.as_ref())
            .and_then(|transform| transform.position)
            .expect("craft position");
        assert!(
            after[2] < before[2] - 5.0,
            "before={before:?} after={after:?}"
        );
        assert!(after[1] > -0.7, "craft should be airborne: {after:?}");
        assert!(
            observe_physics_aerodynamics(runtime_id)
                .iter()
                .all(|observation| observation.diagnostics.is_empty())
        );
        crate::physics::dispose_native_physics_runtime(&script_poses);
    }

    fn body() -> AerodynamicBodyComponent {
        AerodynamicBodyComponent {
            drag_area: [1.0; 3],
            max_force: 1_000_000.0,
            surfaces: vec![AerodynamicSurfaceComponent {
                area: 2.0,
                aspect_ratio: 6.0,
                center_of_pressure: [0.0, 0.0, -2.0],
                control: Some(AerodynamicControlComponent {
                    binding: None,
                    input: Some(0.0),
                    max_deflection: 0.4,
                    response: 10.0,
                }),
                drag_curve: vec![point(-1.5, 0.1), point(0.0, 0.1), point(1.5, 0.1)],
                id: "elevator".to_owned(),
                lift_curve: vec![point(-1.5, -1.0), point(0.0, 0.0), point(1.5, 1.0)],
                recovery_angle: 0.2,
                stall_angle: 0.5,
            }],
            thrusters: None,
        }
    }
    fn point(angle: f32, coefficient: f32) -> AerodynamicCurvePoint {
        AerodynamicCurvePoint { angle, coefficient }
    }
}
