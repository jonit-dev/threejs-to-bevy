use threenative_runtime::physics_sensors::PhysicsSensorRuntimeState;

mod support;
use support::load_conformance_fixture;

#[test]
fn sensors_should_use_collider_occupants_rotated_centers_and_phase_aware_tick_cache() {
    let mut fixture = load_conformance_fixture("physics-character");
    let player_index = fixture
        .bundle
        .world
        .entities
        .iter()
        .position(|entity| entity.id == "player")
        .expect("player should exist");
    let sensor_index = fixture
        .bundle
        .world
        .entities
        .iter()
        .position(|entity| entity.id == "sensor-zone")
        .expect("sensor should exist");

    let mut transform_only = fixture.bundle.world.entities[player_index].clone();
    transform_only.id = "camera".to_owned();
    transform_only.components.collider = None;
    transform_only.components.rigid_body = None;
    transform_only
        .components
        .transform
        .as_mut()
        .expect("camera transform should exist")
        .position = Some([0.0, 1.0, 0.0]);
    fixture.bundle.world.entities.push(transform_only);

    let sensor = &mut fixture.bundle.world.entities[sensor_index];
    let sensor_collider = sensor
        .components
        .collider
        .as_mut()
        .expect("sensor collider should exist");
    sensor_collider.center = Some([1.0, 0.0, 0.0]);
    sensor_collider.size = Some([0.5, 0.5, 0.5]);
    let sensor_transform = sensor
        .components
        .transform
        .as_mut()
        .expect("sensor transform should exist");
    sensor_transform.position = Some([0.0, 0.0, 0.0]);
    sensor_transform.rotation = Some([
        0.0,
        0.0,
        std::f32::consts::FRAC_1_SQRT_2,
        std::f32::consts::FRAC_1_SQRT_2,
    ]);

    fixture.bundle.world.entities[player_index]
        .components
        .transform
        .as_mut()
        .expect("player transform should exist")
        .position = Some([3.0, 1.0, 0.0]);
    let mut state = PhysicsSensorRuntimeState::default();
    assert!(state.advance_startup(&fixture.bundle, 0).is_empty());

    fixture.bundle.world.entities[player_index]
        .components
        .transform
        .as_mut()
        .expect("player transform should exist")
        .position = Some([0.0, 1.0, 0.0]);
    let events = state.advance(&fixture.bundle, 0);

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].phase, "enter");
    assert_eq!(events[0].occupants, vec!["player"]);
}
