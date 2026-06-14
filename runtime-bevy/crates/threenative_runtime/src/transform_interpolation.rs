#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TransformSample {
    pub position: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

impl Default for TransformSample {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
        }
    }
}

pub fn interpolate_vec3(from: [f32; 3], to: [f32; 3], alpha: f32) -> [f32; 3] {
    let t = alpha.clamp(0.0, 1.0);
    [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
    ]
}

pub fn interpolate_quat(from: [f32; 4], to: [f32; 4], alpha: f32) -> [f32; 4] {
    let t = alpha.clamp(0.0, 1.0);
    let mut dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
    let target = if dot < 0.0 {
        [-to[0], -to[1], -to[2], -to[3]]
    } else {
        to
    };
    dot = dot.abs();
    if dot > 0.9995 {
        return normalize_quat([
            from[0] + (target[0] - from[0]) * t,
            from[1] + (target[1] - from[1]) * t,
            from[2] + (target[2] - from[2]) * t,
            from[3] + (target[3] - from[3]) * t,
        ]);
    }
    let theta0 = dot.acos();
    let theta = theta0 * t;
    let sin_theta = theta.sin();
    let sin_theta0 = theta0.sin();
    let s0 = theta.cos() - dot * sin_theta / sin_theta0;
    let s1 = sin_theta / sin_theta0;
    [
        from[0] * s0 + target[0] * s1,
        from[1] * s0 + target[1] * s1,
        from[2] * s0 + target[2] * s1,
        from[3] * s0 + target[3] * s1,
    ]
}

pub fn interpolate_transform(
    from: TransformSample,
    to: TransformSample,
    alpha: f32,
) -> TransformSample {
    TransformSample {
        position: interpolate_vec3(from.position, to.position, alpha),
        rotation: interpolate_quat(from.rotation, to.rotation, alpha),
        scale: interpolate_vec3(from.scale, to.scale, alpha),
    }
}

pub fn smooth_damp_vec3(
    current: [f32; 3],
    target: [f32; 3],
    smoothing: f32,
    delta_seconds: f32,
) -> [f32; 3] {
    let factor = 1.0 - (-smoothing.max(0.0) * delta_seconds.max(0.0)).exp();
    interpolate_vec3(current, target, factor)
}

fn normalize_quat(value: [f32; 4]) -> [f32; 4] {
    let length = (value[0].powi(2) + value[1].powi(2) + value[2].powi(2) + value[3].powi(2)).sqrt();
    let safe_length = if length == 0.0 { 1.0 } else { length };
    [
        value[0] / safe_length,
        value[1] / safe_length,
        value[2] / safe_length,
        value[3] / safe_length,
    ]
}
