use serde::Serialize;
use threenative_loader::{ColliderComponent, LoadedBundle, WorldEntity};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsSensorEvent {
    pub filtered_out: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interaction_kind: Option<String>,
    pub occupants: Vec<String>,
    pub phase: String,
    pub sensor: String,
    pub step: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PhysicsSensorRuntimeState {
    occupancy: std::collections::BTreeMap<String, Vec<String>>,
    last_key: Option<(u64, bool)>,
    last_events: Vec<PhysicsSensorEvent>,
}

impl PhysicsSensorRuntimeState {
    pub fn advance(&mut self, bundle: &LoadedBundle, tick: u64) -> Vec<PhysicsSensorEvent> {
        self.advance_phase(bundle, tick, false)
    }

    pub fn advance_startup(&mut self, bundle: &LoadedBundle, tick: u64) -> Vec<PhysicsSensorEvent> {
        self.advance_phase(bundle, tick, true)
    }

    fn advance_phase(
        &mut self,
        bundle: &LoadedBundle,
        tick: u64,
        startup: bool,
    ) -> Vec<PhysicsSensorEvent> {
        if self.last_key == Some((tick, startup)) {
            return self.last_events.clone();
        }
        let entities = bundle
            .world
            .entities
            .iter()
            .filter_map(sim_entity)
            .collect::<Vec<_>>();
        let live_sensors = entities
            .iter()
            .filter(|entity| entity.sensor.is_some())
            .map(|entity| entity.id.clone())
            .collect::<std::collections::BTreeSet<_>>();
        self.occupancy
            .retain(|sensor, _| live_sensors.contains(sensor));
        let mut sensors = entities
            .iter()
            .filter(|entity| entity.sensor.is_some())
            .cloned()
            .collect::<Vec<_>>();
        sensors.sort_by(|left, right| left.id.cmp(&right.id));
        let mut events = Vec::new();
        for sensor in sensors {
            let current = occupants_for(&sensor, &entities);
            let previous = self.occupancy.get(&sensor.id).cloned().unwrap_or_default();
            events.extend(phase_events(
                &sensor,
                &previous,
                &current.0,
                &current.1,
                tick as usize,
            ));
            self.occupancy.insert(sensor.id, current.0);
        }
        events.sort_by(|left, right| {
            left.sensor
                .cmp(&right.sensor)
                .then(left.phase.cmp(&right.phase))
        });
        self.last_key = Some((tick, startup));
        self.last_events = events.clone();
        events
    }

    pub fn reset(&mut self) {
        self.occupancy.clear();
        self.last_key = None;
        self.last_events.clear();
    }

    pub fn events(&self) -> Vec<PhysicsSensorEvent> {
        self.last_events.clone()
    }
}

#[derive(Clone)]
struct SimEntity {
    center: [f32; 3],
    half_extents: [f32; 3],
    id: String,
    layer: Option<String>,
    mask: Vec<String>,
    sensor: Option<serde_json::Value>,
    velocity: Option<[f32; 3]>,
}

pub fn trace_physics_sensors(
    bundle: &LoadedBundle,
    steps: usize,
    fixed_delta: f32,
) -> Vec<PhysicsSensorEvent> {
    let mut entities = bundle
        .world
        .entities
        .iter()
        .filter_map(sim_entity)
        .collect::<Vec<_>>();
    let mut previous = std::collections::BTreeMap::<String, Vec<String>>::new();
    let mut events = Vec::new();
    for step in 1..=steps {
        for entity in &mut entities {
            if let Some(velocity) = entity.velocity {
                entity.center[0] += velocity[0] * fixed_delta;
                entity.center[1] += velocity[1] * fixed_delta;
                entity.center[2] += velocity[2] * fixed_delta;
            }
        }
        let mut sensors = entities
            .iter()
            .filter(|entity| entity.sensor.is_some())
            .cloned()
            .collect::<Vec<_>>();
        sensors.sort_by(|left, right| left.id.cmp(&right.id));
        for sensor in sensors {
            let current = occupants_for(&sensor, &entities);
            let prior = previous.get(&sensor.id).cloned().unwrap_or_default();
            events.extend(phase_events(&sensor, &prior, &current.0, &current.1, step));
            previous.insert(sensor.id, current.0);
        }
    }
    events.sort_by(|left, right| {
        left.step
            .cmp(&right.step)
            .then(left.sensor.cmp(&right.sensor))
            .then(left.phase.cmp(&right.phase))
    });
    events
}

fn occupants_for(sensor: &SimEntity, entities: &[SimEntity]) -> (Vec<String>, Vec<String>) {
    let mut occupants = Vec::new();
    let mut filtered = Vec::new();
    let mut candidates = entities.to_vec();
    candidates.sort_by(|left, right| left.id.cmp(&right.id));
    for entity in candidates {
        if entity.id == sensor.id || !overlaps(sensor, &entity) {
            continue;
        }
        if !passes_filter(sensor, &entity) || !passes_filter(&entity, sensor) {
            filtered.push(entity.id);
            continue;
        }
        occupants.push(entity.id);
    }
    let limit = sensor
        .sensor
        .as_ref()
        .and_then(|value| value.get("occupantLimit"))
        .and_then(|value| value.as_u64())
        .unwrap_or(occupants.len() as u64) as usize;
    occupants.truncate(limit);
    (occupants, filtered)
}

fn phase_events(
    sensor: &SimEntity,
    previous: &[String],
    current: &[String],
    filtered: &[String],
    step: usize,
) -> Vec<PhysicsSensorEvent> {
    let phases = sensor
        .sensor
        .as_ref()
        .and_then(|value| value.get("phases"))
        .and_then(|value| value.as_array());
    let allows = |phase: &str| {
        phases.is_none_or(|items| items.iter().any(|item| item.as_str() == Some(phase)))
    };
    let interaction_kind = sensor
        .sensor
        .as_ref()
        .and_then(|value| value.get("interactionKind"))
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    let previous_set = previous.iter().collect::<std::collections::BTreeSet<_>>();
    let current_set = current.iter().collect::<std::collections::BTreeSet<_>>();
    let mut events = Vec::new();
    let entered = current
        .iter()
        .filter(|id| !previous_set.contains(id))
        .cloned()
        .collect::<Vec<_>>();
    let stayed = current
        .iter()
        .filter(|id| previous_set.contains(id))
        .cloned()
        .collect::<Vec<_>>();
    let exited = previous
        .iter()
        .filter(|id| !current_set.contains(id))
        .cloned()
        .collect::<Vec<_>>();
    for (phase, occupants) in [("enter", entered), ("stay", stayed), ("exit", exited)] {
        if occupants.is_empty() || !allows(phase) {
            continue;
        }
        events.push(PhysicsSensorEvent {
            filtered_out: filtered.to_vec(),
            interaction_kind: interaction_kind.clone(),
            occupants,
            phase: phase.to_owned(),
            sensor: sensor.id.clone(),
            step,
        });
    }
    events
}

fn sim_entity(entity: &WorldEntity) -> Option<SimEntity> {
    let collider = entity.components.collider.as_ref()?;
    let transform = entity.components.transform.as_ref();
    let position = transform
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0]);
    let rotation = transform.and_then(|transform| transform.rotation);
    Some(SimEntity {
        center: add(position, rotate(collider_offset(collider), rotation)),
        half_extents: rotated_half_extents(half_extents(collider), rotation),
        id: entity.id.clone(),
        layer: collider.layer.clone(),
        mask: collider.mask.clone().unwrap_or_default(),
        sensor: collider.sensor.clone(),
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
        "mesh" => collider.mesh.as_ref().map_or([0.5, 0.5, 0.5], |mesh| {
            let size = mesh.bounds.size;
            [size[0] / 2.0, size[1] / 2.0, size[2] / 2.0]
        }),
        _ => {
            let radius = collider.radius.unwrap_or(0.5);
            [radius, collider.height.unwrap_or(1.0) / 2.0, radius]
        }
    }
}

fn collider_offset(collider: &ColliderComponent) -> [f32; 3] {
    collider
        .center
        .or_else(|| collider.mesh.as_ref().and_then(|mesh| mesh.bounds.center))
        .unwrap_or([0.0, 0.0, 0.0])
}

fn rotated_half_extents(half_extents: [f32; 3], rotation: Option<[f32; 4]>) -> [f32; 3] {
    let Some(rotation) = rotation else {
        return half_extents;
    };
    let x_axis = rotate([half_extents[0], 0.0, 0.0], Some(rotation));
    let y_axis = rotate([0.0, half_extents[1], 0.0], Some(rotation));
    let z_axis = rotate([0.0, 0.0, half_extents[2]], Some(rotation));
    [
        x_axis[0].abs() + y_axis[0].abs() + z_axis[0].abs(),
        x_axis[1].abs() + y_axis[1].abs() + z_axis[1].abs(),
        x_axis[2].abs() + y_axis[2].abs() + z_axis[2].abs(),
    ]
}

fn rotate(value: [f32; 3], rotation: Option<[f32; 4]>) -> [f32; 3] {
    let Some([qx, qy, qz, qw]) = rotation else {
        return value;
    };
    let [x, y, z] = value;
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

fn add(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]]
}

fn passes_filter(left: &SimEntity, right: &SimEntity) -> bool {
    left.mask.is_empty()
        || right
            .layer
            .as_ref()
            .is_some_and(|layer| left.mask.iter().any(|candidate| candidate == layer))
}

fn overlaps(left: &SimEntity, right: &SimEntity) -> bool {
    (left.center[0] - right.center[0]).abs() <= left.half_extents[0] + right.half_extents[0]
        && (left.center[1] - right.center[1]).abs() <= left.half_extents[1] + right.half_extents[1]
        && (left.center[2] - right.center[2]).abs() <= left.half_extents[2] + right.half_extents[2]
}
