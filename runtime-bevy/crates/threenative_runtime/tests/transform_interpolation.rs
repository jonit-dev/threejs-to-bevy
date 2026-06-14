use threenative_runtime::transform_interpolation::{
    TransformSample, interpolate_quat, interpolate_transform, interpolate_vec3, smooth_damp_vec3,
};

#[test]
fn transform_interpolation_should_interpolate_and_smooth_transforms() {
    assert_eq!(
        interpolate_vec3([0.0, 0.0, 0.0], [2.0, 4.0, 6.0], 0.5),
        [1.0, 2.0, 3.0]
    );
    let quat = interpolate_quat([0.0, 0.0, 0.0, 1.0], [0.0, 0.0, 1.0, 0.0], 0.5);
    let quat_length =
        (quat[0].powi(2) + quat[1].powi(2) + quat[2].powi(2) + quat[3].powi(2)).sqrt();
    assert!((quat_length - 1.0).abs() < 0.000001);
    let transform = interpolate_transform(
        TransformSample {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
        },
        TransformSample {
            position: [2.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 1.0, 0.0],
            scale: [3.0, 3.0, 3.0],
        },
        0.5,
    );
    assert_eq!(transform.position, [1.0, 0.0, 0.0]);
    assert_eq!(transform.scale, [2.0, 2.0, 2.0]);
    assert_eq!(
        smooth_damp_vec3([0.0, 0.0, 0.0], [10.0, 0.0, 0.0], 0.0, 1.0),
        [0.0, 0.0, 0.0]
    );
    assert!(smooth_damp_vec3([0.0, 0.0, 0.0], [10.0, 0.0, 0.0], 10.0, 1.0)[0] > 9.0);
}
