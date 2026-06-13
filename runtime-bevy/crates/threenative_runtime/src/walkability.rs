#[derive(Debug, PartialEq)]
pub struct WalkabilityResolution {
    pub blocked_by: Option<String>,
    pub position: [f32; 3],
}

pub fn resolve_walkable_movement(
    start: [f32; 3],
    desired: [f32; 3],
    terrain_height: f32,
    eye_height: f32,
    bounds: [[f32; 2]; 4],
) -> WalkabilityResolution {
    let y = terrain_height + eye_height;
    let min_x = bounds.iter().map(|point| point[0]).fold(f32::INFINITY, f32::min);
    let max_x = bounds.iter().map(|point| point[0]).fold(f32::NEG_INFINITY, f32::max);
    let min_z = bounds.iter().map(|point| point[1]).fold(f32::INFINITY, f32::min);
    let max_z = bounds.iter().map(|point| point[1]).fold(f32::NEG_INFINITY, f32::max);
    if desired[0] < min_x || desired[0] > max_x || desired[2] < min_z || desired[2] > max_z {
        return WalkabilityResolution {
            blocked_by: Some("walkable-boundary".to_owned()),
            position: [start[0], y, start[2]],
        };
    }
    WalkabilityResolution {
        blocked_by: None,
        position: [desired[0], y, desired[2]],
    }
}
