use threenative_runtime::walkability::{
    WalkabilityBlocker, resolve_walkable_movement, resolve_walkable_movement_with_blockers,
};

#[test]
fn walkability_should_block_movement_outside_bounds() {
    let result = resolve_walkable_movement(
        [0.0, 0.0, 0.0],
        [4.0, 0.0, 0.0],
        0.0,
        1.7,
        [[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0]],
    );

    assert_eq!(result.blocked_by.as_deref(), Some("walkable-boundary"));
    assert_eq!(result.position, [0.0, 1.7, 0.0]);
}

#[test]
fn walkability_should_allow_movement_inside_bounds() {
    let result = resolve_walkable_movement(
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        0.0,
        1.7,
        [[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0]],
    );

    assert_eq!(result.blocked_by, None);
    assert_eq!(result.position, [1.0, 1.7, 0.0]);
}

#[test]
fn walkability_should_stop_against_blocking_prop() {
    let result = resolve_walkable_movement_with_blockers(
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        0.0,
        1.7,
        &[[-2.0, -2.0], [2.0, -2.0], [2.0, 2.0], [-2.0, 2.0]],
        0.35,
        &[WalkabilityBlocker {
            id: "blocker.rock",
            position: [1.0, 0.0, 0.0],
            radius: 0.5,
        }],
    );

    assert_eq!(result.blocked_by.as_deref(), Some("blocker.rock"));
    assert_eq!(result.position, [0.0, 1.7, 0.0]);
}
