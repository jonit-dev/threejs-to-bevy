use threenative_runtime::path_sampling::{
    EasingKind, ease, sample_catmull_rom, sample_cubic_bezier, sample_line, sample_quadratic_bezier,
};

#[test]
fn path_sampling_should_sample_easing_curves_and_spline_paths() {
    assert_eq!(ease(EasingKind::EaseInOutQuad, 0.25), 0.125);
    assert_eq!(
        sample_line([0.0, 0.0, 0.0], [2.0, 0.0, 0.0], 2, EasingKind::Linear),
        vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [2.0, 0.0, 0.0]]
    );
    assert_eq!(
        sample_quadratic_bezier(
            [0.0, 0.0, 0.0],
            [1.0, 2.0, 0.0],
            [2.0, 0.0, 0.0],
            2,
            EasingKind::Linear
        )[1],
        [1.0, 1.0, 0.0]
    );
    assert_eq!(
        sample_cubic_bezier(
            [0.0, 0.0, 0.0],
            [0.0, 2.0, 0.0],
            [2.0, 2.0, 0.0],
            [2.0, 0.0, 0.0],
            2,
            EasingKind::Linear
        )[1],
        [1.0, 1.5, 0.0]
    );
    let catmull = sample_catmull_rom(&[[0.0, 0.0, 0.0], [1.0, 1.0, 0.0], [2.0, 0.0, 0.0]], 2);
    assert_eq!(catmull.first().copied(), Some([0.0, 0.0, 0.0]));
    assert_eq!(catmull.last().copied(), Some([2.0, 0.0, 0.0]));
}
