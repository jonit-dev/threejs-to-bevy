#[derive(Debug, PartialEq)]
pub struct WalkabilityResolution {
    pub blocked_by: Option<String>,
    pub position: [f32; 3],
}

#[derive(Debug, PartialEq)]
pub struct WalkabilityBlocker<'a> {
    pub id: &'a str,
    pub position: [f32; 3],
    pub radius: f32,
}

pub fn resolve_walkable_movement(
    start: [f32; 3],
    desired: [f32; 3],
    terrain_height: f32,
    eye_height: f32,
    bounds: [[f32; 2]; 4],
) -> WalkabilityResolution {
    resolve_walkable_movement_with_blockers(
        start,
        desired,
        terrain_height,
        eye_height,
        &bounds,
        0.0,
        &[],
    )
}

pub fn resolve_walkable_movement_with_blockers(
    start: [f32; 3],
    desired: [f32; 3],
    terrain_height: f32,
    eye_height: f32,
    region: &[[f32; 2]],
    movement_radius: f32,
    blockers: &[WalkabilityBlocker<'_>],
) -> WalkabilityResolution {
    let y = terrain_height + eye_height;
    if !point_in_polygon([desired[0], desired[2]], region) {
        return WalkabilityResolution {
            blocked_by: Some("walkable-boundary".to_owned()),
            position: [start[0], y, start[2]],
        };
    }
    for blocker in blockers {
        let radius = blocker.radius + movement_radius;
        if (desired[0] - blocker.position[0]).hypot(desired[2] - blocker.position[2]) < radius {
            return WalkabilityResolution {
                blocked_by: Some(blocker.id.to_owned()),
                position: [start[0], y, start[2]],
            };
        }
    }
    WalkabilityResolution {
        blocked_by: None,
        position: [desired[0], y, desired[2]],
    }
}

fn point_in_polygon(point: [f32; 2], polygon: &[[f32; 2]]) -> bool {
    if polygon.len() < 3 {
        return false;
    }
    let mut inside = false;
    let mut previous = polygon.len() - 1;
    for index in 0..polygon.len() {
        let current_point = polygon[index];
        let previous_point = polygon[previous];
        let intersects = (current_point[1] > point[1]) != (previous_point[1] > point[1])
            && point[0]
                < ((previous_point[0] - current_point[0]) * (point[1] - current_point[1]))
                    / (previous_point[1] - current_point[1])
                    + current_point[0];
        if intersects {
            inside = !inside;
        }
        previous = index;
    }
    inside
}
