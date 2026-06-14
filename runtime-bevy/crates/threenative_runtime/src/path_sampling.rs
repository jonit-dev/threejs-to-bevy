#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EasingKind {
    Linear,
    EaseInQuad,
    EaseOutQuad,
    EaseInOutQuad,
}

pub fn ease(kind: EasingKind, t: f32) -> f32 {
    let clamped = t.clamp(0.0, 1.0);
    match kind {
        EasingKind::EaseInQuad => clamped * clamped,
        EasingKind::EaseOutQuad => clamped * (2.0 - clamped),
        EasingKind::EaseInOutQuad => {
            if clamped < 0.5 {
                2.0 * clamped * clamped
            } else {
                1.0 - (-2.0 * clamped + 2.0).powi(2) / 2.0
            }
        }
        EasingKind::Linear => clamped,
    }
}

pub fn sample_line(
    from: [f32; 3],
    to: [f32; 3],
    steps: usize,
    easing: EasingKind,
) -> Vec<[f32; 3]> {
    sample_steps(steps, |t| lerp_vec3(from, to, ease(easing, t)))
}

pub fn sample_quadratic_bezier(
    from: [f32; 3],
    control: [f32; 3],
    to: [f32; 3],
    steps: usize,
    easing: EasingKind,
) -> Vec<[f32; 3]> {
    sample_steps(steps, |t| {
        let u = ease(easing, t);
        let a = lerp_vec3(from, control, u);
        let b = lerp_vec3(control, to, u);
        lerp_vec3(a, b, u)
    })
}

pub fn sample_cubic_bezier(
    from: [f32; 3],
    control_a: [f32; 3],
    control_b: [f32; 3],
    to: [f32; 3],
    steps: usize,
    easing: EasingKind,
) -> Vec<[f32; 3]> {
    sample_steps(steps, |t| {
        let u = ease(easing, t);
        let a = lerp_vec3(from, control_a, u);
        let b = lerp_vec3(control_a, control_b, u);
        let c = lerp_vec3(control_b, to, u);
        lerp_vec3(lerp_vec3(a, b, u), lerp_vec3(b, c, u), u)
    })
}

pub fn sample_catmull_rom(points: &[[f32; 3]], steps_per_segment: usize) -> Vec<[f32; 3]> {
    if points.len() < 2 {
        return points.to_vec();
    }
    let mut samples = Vec::new();
    for index in 0..points.len() - 1 {
        let p0 = points[index.saturating_sub(1)];
        let p1 = points[index];
        let p2 = points[index + 1];
        let p3 = points[(index + 2).min(points.len() - 1)];
        let segment = sample_steps(steps_per_segment, |t| catmull_rom_point(p0, p1, p2, p3, t));
        if index == 0 {
            samples.extend(segment);
        } else {
            samples.extend(segment.into_iter().skip(1));
        }
    }
    samples
}

fn sample_steps(steps: usize, sampler: impl Fn(f32) -> [f32; 3]) -> Vec<[f32; 3]> {
    let count = steps.max(1);
    (0..=count)
        .map(|index| sampler(index as f32 / count as f32))
        .collect()
}

fn lerp_vec3(from: [f32; 3], to: [f32; 3], t: f32) -> [f32; 3] {
    [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
    ]
}

fn catmull_rom_point(p0: [f32; 3], p1: [f32; 3], p2: [f32; 3], p3: [f32; 3], t: f32) -> [f32; 3] {
    let t2 = t * t;
    let t3 = t2 * t;
    let mut output = [0.0; 3];
    for axis in 0..3 {
        let v0 = p0[axis];
        let v1 = p1[axis];
        let v2 = p2[axis];
        let v3 = p3[axis];
        output[axis] = 0.5
            * ((2.0 * v1)
                + (-v0 + v2) * t
                + (2.0 * v0 - 5.0 * v1 + 4.0 * v2 - v3) * t2
                + (-v0 + 3.0 * v1 - 3.0 * v2 + v3) * t3);
    }
    output
}
