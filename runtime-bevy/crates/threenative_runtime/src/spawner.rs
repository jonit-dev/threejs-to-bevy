use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::json;
use threenative_loader::{
    EntityComponents, PrefabDeclarationIr, PrefabsIr, SpawnerComponent, TransformComponent,
    WorldEntity, WorldIr,
};

#[derive(Clone, Debug, Default)]
pub struct NativeSpawnerRuntimeState {
    spawners: BTreeMap<String, NativeSpawnerState>,
}

#[derive(Clone, Debug)]
struct NativeSpawnerState {
    next_tick: u32,
    sequence: u32,
    total: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct NativeSpawnerObservation {
    pub entity: String,
    pub prefab: String,
    pub root: String,
    pub spawned: Vec<String>,
    pub tick: u32,
}

pub fn step_world_spawners(
    world: &mut WorldIr,
    prefabs: Option<&PrefabsIr>,
    tick: u32,
    fixed_delta: f32,
    state: &mut NativeSpawnerRuntimeState,
) -> Vec<NativeSpawnerObservation> {
    let mut observations = Vec::new();
    let source_entities = world.entities.clone();
    for entity in source_entities {
        let Some(spawner) = entity.components.spawner.clone() else {
            continue;
        };
        if !spawner.enabled {
            continue;
        }
        let Some(prefab) = prefabs.and_then(|items| {
            items
                .prefabs
                .iter()
                .find(|candidate| candidate.id == spawner.prefab)
        }) else {
            continue;
        };
        let spawner_state = state_for(&entity.id, &spawner, fixed_delta, state);
        if tick < spawner_state.next_tick || is_depleted(&spawner, spawner_state) {
            continue;
        }
        let capacity = spawner
            .max_alive
            .unwrap_or(u32::MAX)
            .saturating_sub(alive_spawn_count(world, &entity.id));
        let batch_size = capacity
            .min(batch_size_for(&spawner))
            .min(remaining_for(&spawner, spawner_state));
        if batch_size == 0 {
            continue;
        }
        for _ in 0..batch_size {
            let sequence = spawner_state.sequence;
            let prefix = format!("{}.spawn.{}", entity.id, sequence);
            let spawned = instantiate_prefab(world, prefab, &prefix, &entity, &spawner, sequence);
            if !spawned.is_empty() {
                observations.push(NativeSpawnerObservation {
                    entity: entity.id.clone(),
                    prefab: spawner.prefab.clone(),
                    root: format!("{}.{}", prefix, prefab.root),
                    spawned,
                    tick,
                });
                spawner_state.total += 1;
                spawner_state.sequence += 1;
            }
        }
        spawner_state.next_tick = next_tick_for(&spawner, fixed_delta, tick);
    }

    if !observations.is_empty() {
        let payload = observations
            .iter()
            .map(|observation| {
                json!({
                    "entity": observation.entity,
                    "prefab": observation.prefab,
                    "root": observation.root,
                    "tick": observation.tick,
                })
            })
            .collect::<Vec<_>>();
        world
            .events
            .entry("spawner.spawned".to_owned())
            .and_modify(|value| {
                if let Some(items) = value.as_array_mut() {
                    items.extend(payload.clone());
                }
            })
            .or_insert_with(|| serde_json::Value::Array(payload));
    }
    observations
}

fn state_for<'a>(
    id: &str,
    spawner: &SpawnerComponent,
    fixed_delta: f32,
    runtime: &'a mut NativeSpawnerRuntimeState,
) -> &'a mut NativeSpawnerState {
    runtime
        .spawners
        .entry(id.to_owned())
        .or_insert_with(|| NativeSpawnerState {
            next_tick: if spawner.mode == "interval" {
                interval_ticks(spawner.interval.unwrap_or(fixed_delta), fixed_delta)
            } else {
                0
            },
            sequence: 0,
            total: 0,
        })
}

fn batch_size_for(spawner: &SpawnerComponent) -> u32 {
    if spawner.mode == "interval" {
        1
    } else {
        spawner.wave_size.unwrap_or(1).max(1)
    }
}

fn remaining_for(spawner: &SpawnerComponent, state: &NativeSpawnerState) -> u32 {
    spawner
        .max_total
        .unwrap_or(u32::MAX)
        .saturating_sub(state.total)
}

fn is_depleted(spawner: &SpawnerComponent, state: &NativeSpawnerState) -> bool {
    spawner
        .max_total
        .is_some_and(|max_total| state.total >= max_total)
}

fn next_tick_for(spawner: &SpawnerComponent, fixed_delta: f32, current_tick: u32) -> u32 {
    if spawner.mode == "once" || (spawner.mode == "wave" && spawner.interval.is_none()) {
        u32::MAX
    } else {
        current_tick.saturating_add(interval_ticks(
            spawner.interval.unwrap_or(fixed_delta),
            fixed_delta,
        ))
    }
}

fn interval_ticks(interval: f32, fixed_delta: f32) -> u32 {
    (interval / fixed_delta.max(1.0 / 600.0)).ceil().max(1.0) as u32
}

fn alive_spawn_count(world: &WorldIr, spawner_id: &str) -> u32 {
    let prefix = format!("{}.spawn.", spawner_id);
    world
        .entities
        .iter()
        .filter(|entity| entity.id.starts_with(&prefix))
        .count() as u32
}

fn instantiate_prefab(
    world: &mut WorldIr,
    prefab: &PrefabDeclarationIr,
    prefix: &str,
    spawner: &WorldEntity,
    config: &SpawnerComponent,
    sequence: u32,
) -> Vec<String> {
    let mut spawned = Vec::new();
    let offset = spawn_offset(config, sequence);
    let origin = spawner
        .components
        .transform
        .as_ref()
        .and_then(|transform| transform.position)
        .unwrap_or([0.0, 0.0, 0.0]);
    for template in &prefab.entities {
        let id = format!("{}.{}", prefix, template.id);
        if world.entities.iter().any(|entity| entity.id == id) {
            continue;
        }
        let mut components = template.components.clone();
        components.transform = Some(offset_transform(
            components.transform.as_ref(),
            origin,
            offset,
        ));
        world.entities.push(WorldEntity {
            id: id.clone(),
            components,
            tags: Vec::new(),
        });
        spawned.push(id);
    }
    spawned
}

fn offset_transform(
    transform: Option<&TransformComponent>,
    origin: [f32; 3],
    offset: [f32; 3],
) -> TransformComponent {
    let position = transform
        .and_then(|value| value.position)
        .unwrap_or([0.0, 0.0, 0.0]);
    TransformComponent {
        position: Some([
            position[0] + origin[0] + offset[0],
            position[1] + origin[1] + offset[1],
            position[2] + origin[2] + offset[2],
        ]),
        rotation: transform.and_then(|value| value.rotation),
        scale: transform.and_then(|value| value.scale),
    }
}

fn spawn_offset(spawner: &SpawnerComponent, sequence: u32) -> [f32; 3] {
    let Some(area) = &spawner.area else {
        return [0.0, 0.0, 0.0];
    };
    if area.shape == "point" {
        return [0.0, 0.0, 0.0];
    }
    let mut random = SeededRandom::new(
        spawner.jitter_seed.unwrap_or(0.0) as u32 + sequence.saturating_mul(1013),
    );
    if area.shape == "circle" {
        let radius = area_size_number(area.size.as_ref());
        let angle = random.next() * std::f32::consts::TAU;
        let distance = random.next().sqrt() * radius;
        return [angle.cos() * distance, 0.0, angle.sin() * distance];
    }
    let size = area_size_vec3(area.size.as_ref());
    [
        (random.next() - 0.5) * size[0],
        (random.next() - 0.5) * size[1],
        (random.next() - 0.5) * size[2],
    ]
}

fn area_size_number(value: Option<&serde_json::Value>) -> f32 {
    value
        .and_then(|item| item.as_f64())
        .map(|item| item as f32)
        .or_else(|| {
            value
                .and_then(|item| item.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.as_f64())
                .map(|item| item as f32)
        })
        .unwrap_or(0.0)
}

fn area_size_vec3(value: Option<&serde_json::Value>) -> [f32; 3] {
    let Some(items) = value.and_then(|item| item.as_array()) else {
        return [0.0, 0.0, 0.0];
    };
    [
        items.first().and_then(|item| item.as_f64()).unwrap_or(0.0) as f32,
        items.get(1).and_then(|item| item.as_f64()).unwrap_or(0.0) as f32,
        items.get(2).and_then(|item| item.as_f64()).unwrap_or(0.0) as f32,
    ]
}

struct SeededRandom {
    state: u32,
}

impl SeededRandom {
    fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 1 } else { seed },
        }
    }

    fn next(&mut self) -> f32 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state as f32 / 4_294_967_296.0
    }
}

#[allow(dead_code)]
fn _assert_components_clone(_: EntityComponents) {}
