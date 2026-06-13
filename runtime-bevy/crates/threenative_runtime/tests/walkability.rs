use threenative_runtime::walkability::resolve_walkable_movement;

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
