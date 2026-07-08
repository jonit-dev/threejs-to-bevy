use serde_json::json;
use threenative_loader::{PrefabsIr, WorldIr};
use threenative_runtime::spawner::{NativeSpawnerRuntimeState, step_world_spawners};

#[test]
fn spawner_should_produce_deterministic_prefab_spawn_trace() {
    let mut world = make_world(json!({}));
    let prefabs = make_prefabs();
    let mut state = NativeSpawnerRuntimeState::default();

    let first = step_world_spawners(&mut world, Some(&prefabs), 0, 0.5, &mut state);
    let second = step_world_spawners(&mut world, Some(&prefabs), 1, 0.5, &mut state);

    assert_eq!(
        first
            .iter()
            .map(|item| item.root.as_str())
            .collect::<Vec<_>>(),
        vec!["spawner.spawn.0.enemy", "spawner.spawn.1.enemy"]
    );
    assert!(second.is_empty());
    assert_eq!(
        spawned_positions(&world),
        vec![
            (
                "spawner.spawn.0.enemy".to_owned(),
                [-1.044877, 0.0, 0.449967]
            ),
            (
                "spawner.spawn.1.enemy".to_owned(),
                [0.525486, 0.0, -1.112114]
            ),
        ]
    );
    assert_eq!(
        world.events.get("spawner.spawned").cloned(),
        Some(json!([
            { "entity": "spawner", "prefab": "prefab.enemy", "root": "spawner.spawn.0.enemy", "tick": 0 },
            { "entity": "spawner", "prefab": "prefab.enemy", "root": "spawner.spawn.1.enemy", "tick": 0 }
        ]))
    );
}

#[test]
fn spawner_should_cap_alive_entities() {
    let mut world =
        make_world(json!({ "maxAlive": 1, "maxTotal": 3, "mode": "wave", "waveSize": 3 }));
    let prefabs = make_prefabs();
    let mut state = NativeSpawnerRuntimeState::default();

    let first = step_world_spawners(&mut world, Some(&prefabs), 0, 1.0 / 60.0, &mut state);
    let second = step_world_spawners(&mut world, Some(&prefabs), 1, 1.0 / 60.0, &mut state);

    assert_eq!(first.len(), 1);
    assert!(second.is_empty());
    assert_eq!(
        world
            .entities
            .iter()
            .filter(|entity| entity.id.starts_with("spawner.spawn."))
            .count(),
        1
    );
}

fn make_world(overrides: serde_json::Value) -> WorldIr {
    let mut spawner = json!({
        "area": { "shape": "box", "size": [4, 0, 4] },
        "enabled": true,
        "jitterSeed": 7,
        "maxAlive": 4,
        "maxTotal": 2,
        "mode": "wave",
        "prefab": "prefab.enemy",
        "waveSize": 2
    });
    let spawner_object = spawner.as_object_mut().expect("spawner should be object");
    for (key, value) in overrides.as_object().into_iter().flatten() {
        spawner_object.insert(key.clone(), value.clone());
    }
    serde_json::from_value(json!({
        "schema": "threenative.world",
        "version": "0.1.0",
        "entities": [
            {
                "id": "spawner",
                "components": {
                    "Spawner": spawner,
                    "Transform": { "position": [0, 0, 0] }
                }
            }
        ]
    }))
    .expect("world should deserialize")
}

fn make_prefabs() -> PrefabsIr {
    serde_json::from_value(json!({
        "schema": "threenative.prefabs",
        "version": "0.1.0",
        "prefabs": [
            {
                "id": "prefab.enemy",
                "root": "enemy",
                "entities": [
                    {
                        "id": "enemy",
                        "components": {
                            "MeshRenderer": { "material": "mat.enemy", "mesh": "mesh.enemy" },
                            "Transform": { "position": [0, 0, 0] }
                        }
                    }
                ]
            }
        ]
    }))
    .expect("prefabs should deserialize")
}

fn spawned_positions(world: &WorldIr) -> Vec<(String, [f32; 3])> {
    world
        .entities
        .iter()
        .filter(|entity| entity.id.starts_with("spawner.spawn."))
        .map(|entity| {
            (
                entity.id.clone(),
                round_vec(
                    entity
                        .components
                        .transform
                        .as_ref()
                        .and_then(|transform| transform.position)
                        .expect("spawned entity should have a transform"),
                ),
            )
        })
        .collect()
}

fn round_vec(value: [f32; 3]) -> [f32; 3] {
    [
        (value[0] * 1_000_000.0).round() / 1_000_000.0,
        (value[1] * 1_000_000.0).round() / 1_000_000.0,
        (value[2] * 1_000_000.0).round() / 1_000_000.0,
    ]
}
